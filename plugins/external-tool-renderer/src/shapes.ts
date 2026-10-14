/**
 * Shape sniffing — recognise *output shapes* rather than individual tools.
 *
 * Rationale: 811 tool operations exist across 22 providers, but almost all of
 * their results fall into a handful of visual shapes (diff, tree, log stream,
 * accessibility snapshot, progress, checklist, table). Matching by content
 * means a shape view works even for providers whose exact result schema has
 * not been verified, and it keeps degrading safely: when nothing matches, the
 * caller keeps the generic content renderer.
 *
 * Every parser below is derived from formats verified in the official sources
 * of the corresponding servers (Chrome DevTools accessibility tree, Playwright
 * accessibility snapshot, unified diff, GitLab/GitHub tree listings, pod/job
 * logs). All input is untrusted text: parsing never executes anything.
 */
import { safeText } from "./mcp";

/** Maximum lines / entries kept per shape (bounded rendering). */
export const SHAPE_LIMIT = 400;

// ── Unified diff ──────────────────────────────────────────────────────────

export type DiffLine = { type: "context" | "add" | "remove" | "meta"; text: string };
export type DiffFile = { header: string; lines: DiffLine[] };
export type DiffShape = { kind: "diff"; files: DiffFile[]; additions: number; deletions: number };

const DIFF_HEADER = /^(?:diff --git |--- |\+\+\+ |@@ )/m;

export function parseDiff(text: string): DiffShape | null {
  if (!DIFF_HEADER.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let additions = 0;
  let deletions = 0;
  let seenHunk = false;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      current = { header: line.slice("diff --git ".length), lines: [] };
      files.push(current);
      continue;
    }
    if (line.startsWith("@@")) {
      seenHunk = true;
      if (!current) {
        current = { header: "", lines: [] };
        files.push(current);
      }
      current.lines.push({ type: "meta", text: line });
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ")) {
      current.lines.push({ type: "meta", text: line });
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      current.lines.push({ type: "add", text: line.slice(1) });
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
      current.lines.push({ type: "remove", text: line.slice(1) });
      continue;
    }
    if (line.startsWith(" ")) {
      current.lines.push({ type: "context", text: line.slice(1) });
      continue;
    }
    if (line.startsWith("\\")) {
      current.lines.push({ type: "meta", text: line });
    }
  }
  // A diff needs at least one hunk to be worth a dedicated view.
  if (!seenHunk || !files.length) return null;
  for (const file of files) file.lines = file.lines.slice(0, SHAPE_LIMIT);
  return { kind: "diff", files: files.slice(0, 20), additions, deletions };
}

// ── Directory tree ────────────────────────────────────────────────────────

export type TreeEntry = { depth: number; name: string; dir: boolean };
export type TreeShape = { kind: "tree"; entries: TreeEntry[]; dirs: number; files: number };

const BOX = /^([\s│├└─┬┼┤]*)([├└]──\s*|├──\s*|└──\s*)?(.+)$/;

/** Box-drawing tree, e.g. GitLab `get_repository_tree` or `tree` command output. */
export function parseTree(text: string): TreeShape | null {
  const lines = text.split(/\r?\n/);
  const entries: TreeEntry[] = [];
  let dirs = 0;
  let files = 0;
  for (const raw of lines) {
    const match = BOX.exec(raw);
    if (!match) continue;
    const prefix = match[1] ?? "";
    const branch = match[2];
    const name = (match[3] ?? "").trim();
    if (!name) continue;
    if (!branch && !/[├└│]/.test(prefix)) continue;
    // Depth = number of 4-char indentation groups in the prefix.
    const depth = Math.floor(prefix.replace(/[│├└─\s]/g, " ").length / 4) || prefix.length / 4;
    const dir = name.endsWith("/");
    if (dir) dirs += 1;
    else files += 1;
    entries.push({ depth: Math.max(0, Math.round(depth)), name, dir });
  }
  // Require a real tree: several entries and at least one branch marker.
  if (entries.length < 3 || !/[├└]/.test(text)) return null;
  return { kind: "tree", entries: entries.slice(0, SHAPE_LIMIT), dirs, files };
}

/** GitHub `get_repository_tree` returns JSON with a `tree` array of entries. */
export function treeFromRecords(records: readonly Record<string, unknown>[]): TreeShape | null {
  for (const record of records) {
    const tree = record.tree;
    if (!Array.isArray(tree) || tree.length < 2) continue;
    const entries: TreeEntry[] = [];
    let dirs = 0;
    let files = 0;
    for (const item of tree) {
      if (item === null || typeof item !== "object") continue;
      const node = item as Record<string, unknown>;
      const path = typeof node.path === "string" ? node.path : typeof node.name === "string" ? node.name : "";
      if (!path) continue;
      const type = typeof node.type === "string" ? node.type : "";
      const dir = type === "tree" || type === "dir";
      if (dir) dirs += 1;
      else files += 1;
      entries.push({ depth: Math.max(0, path.split("/").length - 1), name: path.split("/").pop() ?? path, dir });
    }
    if (entries.length < 2) continue;
    return { kind: "tree", entries: entries.slice(0, SHAPE_LIMIT), dirs, files };
  }
  return null;
}

// ── Log stream ────────────────────────────────────────────────────────────

export type LogLine = { level: string; text: string; id?: string };
export type LogShape = { kind: "log"; lines: LogLine[]; counts: Record<string, number> };

/** ISO timestamp, `[LEVEL]`, or `<LEVEL>:` prefixes used by pod/job logs. */
const LOG_LINE =
  /^(?:(\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?)\s+)?(?:\[?(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|FATAL|CRIT|CRITICAL)\]?:?\s+)?(.*)$/i;

/** Chrome DevTools console / network rows: `msgid=1 [log] text`, `reqid=1 GET url [pending]`. */
const CHROME_ROW = /^(msgid|reqid)=(\d+)\s+(?:\[([^\]]+)\]\s+)?(.*)$/;

export function parseLogs(text: string): LogShape | null {
  const raw = text.split(/\r?\n/);
  const lines: LogLine[] = [];
  const counts: Record<string, number> = {};
  let chromeRows = 0;
  let stamped = 0;

  for (const line of raw) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const chrome = CHROME_ROW.exec(trimmed);
    if (chrome) {
      const level = (chrome[3] ?? "").toLowerCase();
      counts[level || "row"] = (counts[level || "row"] ?? 0) + 1;
      lines.push({ level: level || "row", text: safeText(chrome[4] ?? ""), id: chrome[2] });
      chromeRows += 1;
      continue;
    }
    const match = LOG_LINE.exec(trimmed);
    if (!match) continue;
    const hasTime = Boolean(match[1]);
    const level = (match[2] ?? "").toUpperCase();
    if (!hasTime && !level) continue;
    const key = level || "LOG";
    counts[key] = (counts[key] ?? 0) + 1;
    lines.push({ level: key, text: safeText(match[3] ?? "") });
    stamped += 1;
  }
  const structured = chromeRows + stamped;
  // `msgid=` / `reqid=` rows are unambiguous DevTools evidence on their own;
  // timestamped / levelled lines need a clear majority so prose never matches.
  const accepted = chromeRows >= 2 || (stamped >= 4 && structured >= raw.filter((l) => l.trim()).length * 0.6);
  if (!accepted) return null;
  return { kind: "log", lines: lines.slice(0, SHAPE_LIMIT), counts };
}

// ── Accessibility snapshot ────────────────────────────────────────────────

export type SnapshotNode = { depth: number; role: string; name: string; meta: string; ref?: string };
export type SnapshotShape = { kind: "snapshot"; nodes: SnapshotNode[]; flavor: "chrome" | "playwright" };

/** Chrome DevTools: `uid=1_0 RootWebArea "My test page" url="about:blank"`. */
const CHROME_NODE = /^(\s*)uid=([\w-]+)\s+(\S+)\s*(.*)$/;
/** Playwright: `- heading "todos" [level=1] [ref=e3]`. */
const PW_NODE = /^(\s*)(?:-\s+)?([a-z][\w-]*)\s*("(?:[^"\\]|\\.)*")?\s*(\[[^\]]*\])*\s*(\[ref=([\w-]+)\])?/;
/** Playwright accessibility ref, extracted from anywhere in the line. */
const PW_REF = /\[ref=([\w-]+)\]/;

export function parseSnapshot(text: string): SnapshotShape | null {
  const lines = text.split(/\r?\n/);
  const chromeNodes: SnapshotNode[] = [];
  const pwNodes: SnapshotNode[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const chrome = CHROME_NODE.exec(line);
    if (chrome) {
      const indent = (chrome[1] ?? "").replace(/\t/g, "  ").length;
      chromeNodes.push({
        depth: Math.floor(indent / 2),
        role: safeText(chrome[3] ?? ""),
        name: safeText((chrome[4] ?? "").replace(/\s*url="[^"]*"/, "").slice(0, 300)),
        meta: safeText(/url="([^"]*)"/.exec(chrome[4] ?? "")?.[1] ?? ""),
        ref: chrome[2],
      });
      continue;
    }
    // Playwright entries must carry an accessibility ref or a quoted name.
    const pw = PW_NODE.exec(line);
    if (pw && (/\[ref=[\w-]+\]/.test(line) || /^[a-z][\w-]*\s+"/.test(line.trim()))) {
      const indent = (pw[1] ?? "").replace(/\t/g, "  ").length;
      const name = (pw[3] ?? "").replace(/^"|"$/g, "");
      const ref = PW_REF.exec(line)?.[1];
      // Meta = the attribute brackets, minus the ref which is shown separately.
      const meta = (line.match(/\[[^\]]*\]/g) ?? [])
        .filter((part) => !part.startsWith("[ref="))
        .map((part) => part.replace(/^\[|\]$/g, ""))
        .join(" ");
      pwNodes.push({
        depth: Math.floor(indent / 2),
        role: safeText(pw[2] ?? ""),
        name: safeText(name.slice(0, 300)),
        meta: safeText(meta),
        ref,
      });
    }
  }

  if (chromeNodes.length >= 3) return { kind: "snapshot", nodes: chromeNodes.slice(0, SHAPE_LIMIT), flavor: "chrome" };
  if (pwNodes.length >= 3) return { kind: "snapshot", nodes: pwNodes.slice(0, SHAPE_LIMIT), flavor: "playwright" };
  return null;
}

// ── Progress ──────────────────────────────────────────────────────────────

export type ProgressItem = { label: string; value: string; done: boolean; ratio?: number };
export type ProgressShape = { kind: "progress"; items: ProgressItem[]; status?: string };

const PROGRESS_KEYS = ["status", "progress", "state", "completed", "total", "totalPages", "pages", "creditsUsed", "duration", "durationMs"];

export function progressFromRecords(records: readonly Record<string, unknown>[]): ProgressShape | null {
  const items: ProgressItem[] = [];
  const seen = new Set<string>();
  let status: string | undefined;
  for (const record of records) {
    for (const key of PROGRESS_KEYS) {
      const value = record[key];
      if (seen.has(key)) continue;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      seen.add(key);
      if (key === "status" && typeof value === "string") status = value;
      items.push({ label: key, value: String(value), done: value === "completed" || value === "succeeded" });
    }
    const completed = record.completed;
    const total = record.total;
    if (typeof completed === "number" && typeof total === "number" && total > 0) {
      const ratio = Math.min(1, Math.max(0, completed / total));
      const existing = items.find((item) => item.label === "progress");
      if (existing) {
        existing.ratio = ratio;
        existing.value = `${completed} / ${total}`;
      } else {
        items.push({ label: "progress", value: `${completed} / ${total}`, done: ratio >= 1, ratio });
      }
    }
  }
  // Only worth a dedicated view when a status or a real progress ratio exists.
  if (!status && !items.some((item) => item.ratio !== undefined)) return null;
  return { kind: "progress", items: items.slice(0, 12), status };
}

// ── Checklist (alerts / vulnerabilities / findings) ───────────────────────

export type ChecklistItem = { title: string; level: string; detail?: string };
export type ChecklistShape = { kind: "checklist"; items: ChecklistItem[]; counts: Record<string, number> };

const LEVEL_KEYS = ["severity", "level", "state", "status", "priority"];
const TITLE_KEYS = ["title", "name", "message", "description", "summary", "rule", "check"];
const LEVELS = ["critical", "high", "medium", "low", "error", "warning", "warn", "info", "note"];

export function checklistFromRecords(records: readonly Record<string, unknown>[]): ChecklistShape | null {
  for (const record of records) {
    for (const key of ["vulnerabilities", "alerts", "findings", "lints", "issues", "advisories", "code_scanning_alerts"]) {
      const rows = record[key];
      if (!Array.isArray(rows) || rows.length < 2) continue;
      const items: ChecklistItem[] = [];
      const counts: Record<string, number> = {};
      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const node = row as Record<string, unknown>;
        let level = "info";
        for (const levelKey of LEVEL_KEYS) {
          const value = node[levelKey];
          if (typeof value === "string" && value) {
            level = value.toLowerCase();
            break;
          }
        }
        let title = "";
        for (const titleKey of TITLE_KEYS) {
          const value = node[titleKey];
          if (typeof value === "string" && value) {
            title = value;
            break;
          }
        }
        if (!title) continue;
        counts[level] = (counts[level] ?? 0) + 1;
        const detail = typeof node.detail === "string" ? node.detail : typeof node.location === "string" ? node.location : undefined;
        items.push({ title: safeText(title).slice(0, 300), level, detail: detail ? safeText(detail).slice(0, 200) : undefined });
      }
      if (items.length >= 2) {
        return { kind: "checklist", items: items.slice(0, SHAPE_LIMIT), counts };
      }
    }
  }
  return null;
}

export const isKnownLevel = (level: string): boolean => LEVELS.includes(level.toLowerCase());
