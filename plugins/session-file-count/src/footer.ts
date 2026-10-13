/**
 * Message-footer contribution (`exportName: "mountFooter"`).
 *
 * Business UI belongs to this plugin; the host supplies only a lifecycle-bound
 * slot plus the frozen `context.task` evidence of the finished task. The footer
 * never subscribes to cumulative counters and never reads chat text.
 */

import { element, hostIcon, isMacPlatform } from "./dom";
import { renderDiff } from "./diff";
import { createFileIcon } from "./fileIcon";
import {
  keyFor,
  latestFiles,
  linesFor,
  relativePath,
  signedLines,
} from "./files";
import type { FooterApi, FooterContext, Translate } from "./types";

export function mountFooter(
  container: HTMLElement,
  api: FooterApi,
  context: FooterContext,
  signal: AbortSignal,
): () => void {
  const t: Translate = (key, values) => api.t(key, { defaultValue: key, values });
  const root = element("section", "sfc-inline");
  root.hidden = true;
  root.setAttribute("aria-label", t("footer.title"));
  container.append(root);
  let disposed = false;
  let expanded = false;
  const expandedDiffs = new Set<string>();
  // Match the host's platform-aware primary modifier convention.
  const modifier = isMacPlatform() ? "⌘" : "Ctrl";
  const actions = new Set(
    api.write
      ?.domains()
      .flatMap((domain) =>
        (domain.actions ?? [])
          .filter((action) => action.granted)
          .map((action) => action.id),
      ) ?? [],
  );
  const showNotice = (key: string): void => {
    root.querySelector(".sfc-inline-open-error")?.remove();
    const note = element("p", "sfc-inline-note sfc-inline-open-error", t(key));
    note.setAttribute("role", "alert");
    root.append(note);
  };
  const active = (): boolean => !disposed && !signal.aborted;

  const render = (): void => {
    if (!active()) return;
    root.replaceChildren();
    root.hidden = false;
    if (api.ui.messageFooterVersion !== 1) {
      root.append(
        element("p", "sfc-inline-note", t("footer.taskUnavailable")),
      );
      return;
    }
    if (!context.task) {
      root.hidden = true;
      return;
    }
    const raw = Array.isArray(context.task.records)
      ? context.task.records
      : null;
    const coverage = Array.isArray(context.task.coverage)
      ? context.task.coverage
      : null;
    if (!raw) {
      root.append(element("p", "sfc-inline-note", t("unavailable")));
      return;
    }
    const files = latestFiles(raw);
    if (!files.length) {
      root.hidden = true;
      return;
    }
    const heading = element("div", "sfc-inline-heading");
    const icon = hostIcon(api, "Files", "sfc-inline-icon");
    icon.setAttribute("aria-hidden", "true");
    const text = element("div", "sfc-inline-heading-text");
    text.title = t("footer.cumulative");
    text.append(
      element("strong", "", t("footer.recorded", { count: files.length })),
    );
    const known = files.map(linesFor).filter((item) => item !== null);
    if (known.length) {
      const totals = known.reduce(
        (total, item) => ({
          additions: total.additions + item.additions,
          deletions: total.deletions + item.deletions,
        }),
        { additions: 0, deletions: 0 },
      );
      const stats = element("div", "sfc-inline-heading-lines");
      stats.title = t("footer.knownLines");
      stats.append(signedLines(api, totals));
      text.append(stats);
    }
    heading.append(icon, text);
    root.append(heading);
    const list = element("ul", "sfc-inline-list");
    list.id = `sfc-files-${crypto.randomUUID()}`;
    for (const file of expanded ? files : files.slice(0, 4)) {
      const row = element("li", "sfc-inline-file");
      const path = element("button", "sfc-inline-path");
      path.type = "button";
      path.title = `${file.filePath}\n${t("footer.clickHint", { modifier })}\n${t("footer.diffSnapshot")}`;
      path.setAttribute(
        "aria-label",
        `${relativePath(file)}: ${t("footer.clickHint", { modifier })}`,
      );
      const icon = createFileIcon(api, file.filePath, "sfc-inline-file-icon");
      const name = element("span", "sfc-inline-path-text", relativePath(file));
      path.append(icon, name);

      const key = keyFor(file);
      const isExpanded = expandedDiffs.has(key);
      const collapse = element("div", "sfc-inline-diff-collapse");
      collapse.id = `sfc-diff-${crypto.randomUUID()}`;
      if (!isExpanded) {
        collapse.classList.add("is-collapsed");
      }
      path.setAttribute("aria-expanded", String(isExpanded));
      path.setAttribute("aria-controls", collapse.id);

      const inner = element("div", "sfc-inline-diff-collapse-inner");
      const diff = element("div", "sfc-inline-diff");
      inner.append(diff);
      collapse.append(inner);

      let rendered = false;
      const populateDiff = (): void => {
        if (rendered) return;
        renderDiff(diff, file, t);
        rendered = true;
      };
      if (isExpanded) populateDiff();
      let pending = false;
      const open = async (event: MouseEvent): Promise<void> => {
        if (!active() || (event.button !== undefined && event.button !== 0))
          return;
        event.preventDefault();
        const openDocument = isMacPlatform() ? event.metaKey : event.ctrlKey;
        if (!openDocument) {
          const currentlyExpanded =
            !collapse.classList.contains("is-collapsed");
          if (currentlyExpanded) {
            collapse.classList.add("is-collapsed");
            expandedDiffs.delete(key);
            path.setAttribute("aria-expanded", "false");
          } else {
            expandedDiffs.add(key);
            populateDiff();
            collapse.classList.remove("is-collapsed");
            path.setAttribute("aria-expanded", "true");
          }
          return;
        }
        if (pending) return;
        const reason = !actions.has("panels.openFile")
          ? "footer.openUpgrade"
          : file.kind === "delete"
            ? "footer.deletedFile"
              : typeof file.root === "string" && file.root.startsWith("ssh://")
              ? "footer.remoteUnavailable"
              : (!file.filePath.startsWith("/") &&
                  !file.filePath.startsWith("\\\\") &&
                  !/^[a-zA-Z]:[/\\]/.test(file.filePath)) ||
                  file.filePath.includes("\0")
                ? "footer.invalidPath"
                : null;
        if (reason) {
          showNotice(reason);
          return;
        }
        pending = true;
        root.querySelector(".sfc-inline-open-error")?.remove();
        try {
          const result = await api.write?.run("panels.openFile", {
            filePath: file.filePath,
          });
          if (!result?.ok) throw new Error("Navigation request failed");
        } catch {
          if (active() && path.isConnected) showNotice("footer.openError");
        } finally {
          pending = false;
        }
      };
      path.addEventListener("click", (event) => {
        void open(event);
      });
      row.addEventListener("click", (event) => {
        if (
          (event.target as Element | null)?.closest(
            "button, .sfc-inline-diff-collapse, .sfc-inline-diff",
          )
        )
          return;
        void open(event);
      });
      row.append(path);
      const stats = linesFor(file);
      row.append(
        stats
          ? signedLines(api, stats)
          : element("span", "sfc-inline-muted", t("footer.linesUnavailable")),
        collapse,
      );
      list.append(row);
    }
    root.append(list);
    if (files.length > 4) {
      const toggle = element("button", "sfc-inline-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-controls", list.id);
      const chevron = hostIcon(
        api,
        expanded ? "ChevronUp" : "ChevronDown",
        "sfc-inline-chevron",
      );
      chevron.setAttribute("aria-hidden", "true");
      toggle.append(
        element(
          "span",
          "",
          t(expanded ? "footer.collapse" : "footer.allFiles", {
            count: files.length,
          }),
        ),
        chevron,
      );
      toggle.addEventListener("click", () => {
        if (!active()) return;
        expanded = !expanded;
        render();
        root
          .querySelector<HTMLElement>(".sfc-inline-toggle")
          ?.focus({ preventScroll: true });
      });
      root.append(toggle);
    }
    const notes: string[] = [];
    if (coverage === null) notes.push(t("coverageMissing"));
    if (files.some((file) => !file.fileKey || !file.source))
      notes.push(t("footer.legacy"));
    root.title = notes.join("\n");
  };
  const cleanup = (): void => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", cleanup);
    root.replaceChildren();
    root.remove();
    expandedDiffs.clear();
  };
  signal.addEventListener("abort", cleanup, { once: true });
  if (!active()) {
    cleanup();
    return cleanup;
  }
  render();
  return cleanup;
}
