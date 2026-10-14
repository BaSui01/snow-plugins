/**
 * Shape views — one dedicated renderer per *output shape* (diff, tree, log,
 * snapshot, progress, checklist). Each view is bounded and paginated, and all
 * text passes through safeText / safeUrl before rendering; nothing is executed.
 */
import { React } from "./runtime";
import { useApi } from "./api";
import { PAGE_SIZE, safeText, safeUrl } from "./mcp";
import type { ChecklistShape, DiffShape, LogShape, ProgressShape, SnapshotShape, TreeShape } from "./shapes";

function Pager({ total, page, onPage, size = PAGE_SIZE }: { total: number; page: number; onPage: (page: number) => void; size?: number }) {
  const { t } = useApi();
  if (total <= size) return null;
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return <div className="mcp-pager">
    <button type="button" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))}>{t("toolCall.mcp.previous")}</button>
    <span>{t("toolCall.mcp.range", { values: { start: page * size + 1, end: Math.min(total, (page + 1) * size), total } })}</span>
    <button type="button" disabled={page >= last} onClick={() => onPage(Math.min(last, page + 1))}>{t("toolCall.mcp.next")}</button>
  </div>;
}

/** Shared heading for a shape section. */
function ShapeHead({ label, count }: { label: string; count: number }) {
  return <h4>{label}{count > 0 ? <span className="mcp-shape-count">{count}</span> : null}</h4>;
}

// ── diff ──────────────────────────────────────────────────────────────────

export function DiffView({ shape }: { shape: DiffShape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.files.length / 5) - 1));
  const files = React.useMemo(() => shape.files.slice(page * 5, (page + 1) * 5), [shape.files, page]);

  return <section className="mcp-shape mcp-diff">
    <ShapeHead label={t("toolCall.shape.diff")} count={shape.files.length} />
    <div className="mcp-shape-stats">
      <span className="mcp-diff-add">+{shape.additions}</span>
      <span className="mcp-diff-del">−{shape.deletions}</span>
      <span className="mcp-muted">{t("toolCall.shape.files", { values: { count: shape.files.length } })}</span>
    </div>
    {files.map((file, fileIndex) => <article className="mcp-diff-file" key={`${page}:${fileIndex}`}>
      <header className="mcp-diff-file-head" title={file.header}>{safeText(file.header).slice(0, 300) || t("toolCall.shape.diff")}</header>
      <pre className="mcp-diff-body">{file.lines.map((line, lineIndex) => <div className={`mcp-diff-line mcp-diff-${line.type}`} key={lineIndex}>
        <span className="mcp-diff-sign" aria-hidden="true">{line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}</span>
        <span className="mcp-diff-text">{safeText(line.text)}</span>
      </div>)}</pre>
    </article>)}
    <Pager total={shape.files.length} page={page} size={5} onPage={setPage} />
  </section>;
}

// ── tree ──────────────────────────────────────────────────────────────────

export function TreeView({ shape }: { shape: TreeShape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.entries.length / 100) - 1));
  const entries = React.useMemo(() => shape.entries.slice(page * 100, (page + 1) * 100), [shape.entries, page]);

  return <section className="mcp-shape mcp-tree-shape">
    <ShapeHead label={t("toolCall.shape.tree")} count={shape.entries.length} />
    <div className="mcp-shape-stats">
      <span className="mcp-muted">{t("toolCall.shape.dirs", { values: { count: shape.dirs } })}</span>
      <span className="mcp-muted">{t("toolCall.shape.filesCount", { values: { count: shape.files } })}</span>
    </div>
    <ul className="mcp-tree-list">
      {entries.map((entry, index) => <li className={`mcp-tree-item${entry.dir ? " mcp-tree-dir" : ""}`} key={`${page}:${index}`} style={{ paddingInlineStart: `${Math.min(entry.depth, 16) * 14}px` }}>
        <span className="mcp-tree-mark" aria-hidden="true">{entry.dir ? "▸" : "·"}</span>
        <span className="mcp-tree-name">{safeText(entry.name).slice(0, 300)}</span>
      </li>)}
    </ul>
    <Pager total={shape.entries.length} page={page} size={100} onPage={setPage} />
  </section>;
}

// ── log ───────────────────────────────────────────────────────────────────

export function LogView({ shape }: { shape: LogShape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const [filter, setFilter] = React.useState<string>("");
  const levels = React.useMemo(() => Object.keys(shape.counts).sort((a, b) => shape.counts[b] - shape.counts[a]), [shape.counts]);
  const lines = React.useMemo(() => filter ? shape.lines.filter((line) => line.level === filter) : shape.lines, [shape.lines, filter]);
  const page = Math.min(requested, Math.max(0, Math.ceil(lines.length / 100) - 1));
  const visible = React.useMemo(() => lines.slice(page * 100, (page + 1) * 100), [lines, page]);

  return <section className="mcp-shape mcp-log-shape">
    <ShapeHead label={t("toolCall.shape.log")} count={shape.lines.length} />
    {levels.length > 1 ? <div className="mcp-shape-stats">
      <button type="button" className={`mcp-log-chip${filter === "" ? " is-active" : ""}`} onClick={() => { setFilter(""); setPage(0); }}>{t("toolCall.shape.all")} {shape.lines.length}</button>
      {levels.map((level) => <button type="button" key={level} className={`mcp-log-chip mcp-level-${level.toLowerCase()}${filter === level ? " is-active" : ""}`} onClick={() => { setFilter(level); setPage(0); }}>
        {level} {shape.counts[level]}
      </button>)}
    </div> : null}
    <pre className="mcp-log-body">{visible.map((line, index) => <div className="mcp-log-line" key={`${page}:${index}`}>
      {line.id ? <span className="mcp-log-id">{line.id}</span> : null}
      <span className={`mcp-log-level mcp-level-${line.level.toLowerCase()}`}>{line.level}</span>
      <span className="mcp-log-text">{line.text}</span>
    </div>)}</pre>
    <Pager total={lines.length} page={page} size={100} onPage={setPage} />
  </section>;
}

// ── accessibility snapshot ────────────────────────────────────────────────

export function SnapshotView({ shape }: { shape: SnapshotShape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.nodes.length / 100) - 1));
  const nodes = React.useMemo(() => shape.nodes.slice(page * 100, (page + 1) * 100), [shape.nodes, page]);

  return <section className="mcp-shape mcp-snapshot-shape">
    <ShapeHead label={t("toolCall.shape.snapshot")} count={shape.nodes.length} />
    <div className="mcp-shape-stats">
      <span className="mcp-muted">{t(`toolCall.shape.flavor.${shape.flavor}`, { defaultValue: shape.flavor })}</span>
    </div>
    <ul className="mcp-snapshot-list">
      {nodes.map((node, index) => <li className="mcp-snapshot-node" key={`${page}:${index}`} style={{ paddingInlineStart: `${Math.min(node.depth, 20) * 12}px` }}>
        <span className="mcp-snapshot-role">{safeText(node.role)}</span>
        {node.name ? <span className="mcp-snapshot-name">{node.name}</span> : null}
        {node.ref ? <span className="mcp-snapshot-ref">{node.ref}</span> : null}
        {node.meta && node.meta !== node.name ? <span className="mcp-muted mcp-snapshot-meta">{node.meta}</span> : null}
      </li>)}
    </ul>
    <Pager total={shape.nodes.length} page={page} size={100} onPage={setPage} />
  </section>;
}

// ── progress ──────────────────────────────────────────────────────────────

export function ProgressView({ shape }: { shape: ProgressShape }) {
  const { t } = useApi();
  return <section className="mcp-shape mcp-progress-shape">
    <ShapeHead label={t("toolCall.shape.progress")} count={0} />
    <dl className="mcp-progress-list">
      {shape.items.map((item) => <div className="mcp-progress-item" key={item.label}>
        <dt>{t(`toolCall.mcp.metric.${item.label}`, { defaultValue: t(`toolCall.shape.field.${item.label}`, { defaultValue: item.label }) })}</dt>
        <dd>
          {item.ratio !== undefined ? <span className="mcp-progress-bar" role="progressbar" aria-valuenow={Math.round(item.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span className="mcp-progress-fill" style={{ inlineSize: `${Math.round(item.ratio * 100)}%` }} />
          </span> : null}
          <span className={`mcp-progress-value${item.done ? " is-done" : ""}`}>{safeText(item.value).slice(0, 200)}</span>
        </dd>
      </div>)}
    </dl>
  </section>;
}

// ── checklist ─────────────────────────────────────────────────────────────

export function ChecklistView({ shape }: { shape: ChecklistShape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const levels = React.useMemo(() => Object.keys(shape.counts).sort((a, b) => shape.counts[b] - shape.counts[a]), [shape.counts]);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.items.length / 50) - 1));
  const items = React.useMemo(() => shape.items.slice(page * 50, (page + 1) * 50), [shape.items, page]);

  return <section className="mcp-shape mcp-checklist-shape">
    <ShapeHead label={t("toolCall.shape.checklist")} count={shape.items.length} />
    <div className="mcp-shape-stats">
      {levels.map((level) => <span className={`mcp-log-chip mcp-level-${level}`} key={level}>{level} {shape.counts[level]}</span>)}
    </div>
    <ul className="mcp-checklist">
      {items.map((item, index) => {
        const url = safeUrl(item.detail);
        return <li className={`mcp-checklist-item mcp-level-${item.level}`} key={`${page}:${index}`}>
          <span className={`mcp-checklist-level mcp-level-${item.level}`}>{item.level}</span>
          <span className="mcp-checklist-title">{item.title}</span>
          {item.detail ? url
            ? <LinkLine url={url} />
            : <span className="mcp-muted mcp-checklist-detail">{item.detail}</span> : null}
        </li>;
      })}
    </ul>
    <Pager total={shape.items.length} page={page} size={50} onPage={setPage} />
  </section>;
}

function LinkLine({ url }: { url: string }) {
  const api = useApi();
  return <button type="button" className="mcp-link mcp-checklist-detail" title={url} onClick={() => api.links.open(url, "browser")}>{url.slice(0, 120)}</button>;
}
