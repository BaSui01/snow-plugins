// Business UI belongs to this plugin; the host supplies only a lifecycle-bound slot.
export function mountFooter(container, api, context, signal) {
  const t = (key, values) => api.t(key, { defaultValue: key, values });
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const root = element("section", "sfc-inline");
  root.hidden = true;
  root.setAttribute("aria-label", t("footer.title"));
  container.append(root);
  let disposed = false;
  let expanded = false;
  const expandedDiffs = new Set();
  const keyFor = (record) =>
    typeof record.fileKey === "string" && record.fileKey
      ? record.fileKey
      : record.filePath;
  // Match the host's platform-aware primary modifier convention.
  const isMac = /mac/i.test(navigator.platform ?? "") || /mac/i.test(navigator.userAgent ?? "");
  const modifier = isMac ? "⌘" : "Ctrl";
  const actions = new Set(
    api.write?.domains?.().flatMap((domain) =>
      (domain.actions ?? []).filter((action) => action.granted).map((action) => action.id),
    ) ?? [],
  );
  const showNotice = (key) => {
    root.querySelector(".sfc-inline-open-error")?.remove();
    const note = element("p", "sfc-inline-note sfc-inline-open-error", t(key));
    note.setAttribute("role", "alert");
    root.append(note);
  };
  // The DOM footer uses the host Lucide component's SVG node data, not a bundled icon.
  const hostIcon = (name, className) => {
    const wrapper = element("span", className);
    wrapper.setAttribute("aria-hidden", "true");
    const component = api.ui.icon(name);
    const nodes = component?.render?.({}, null)?.props?.iconNode;
    if (!Array.isArray(nodes)) return wrapper;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    for (const [key, value] of Object.entries({
      viewBox: "0 0 24 24", width: "24", height: "24", fill: "none",
      stroke: "currentColor", "stroke-width": "2",
      "stroke-linecap": "round", "stroke-linejoin": "round",
    })) svg.setAttribute(key, value);
    for (const [tag, attributes] of nodes) {
      const node = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attributes))
        if (key !== "key") node.setAttribute(key, String(value));
      svg.append(node);
    }
    wrapper.append(svg);
    return wrapper;
  };
  const active = () => !disposed && !signal.aborted;
  const relativePath = (record) => {
    if (typeof record.root !== "string" || !record.root) return record.filePath;
    const path = record.filePath.replaceAll("\\", "/");
    const prefix = `${record.root.replaceAll("\\", "/").replace(/\/+$/, "")}/`;
    const windows = /^[A-Za-z]:\//.test(path) || path.startsWith("//");
    const contained = windows
      ? path.toLowerCase().startsWith(prefix.toLowerCase())
      : path.startsWith(prefix);
    const relative = path.slice(prefix.length);
    return contained &&
      relative &&
      !relative.split("/").some((part) => part === "." || part === "..")
      ? relative
      : record.filePath;
  };
  const linesFor = (record) => {
    if (
      record.source === "terminal" ||
      record.diff?.isBinary ||
      typeof record.diff?.patch !== "string" ||
      !record.diff.patch
    )
      return null;
    let additions = 0;
    let deletions = 0;
    for (const line of record.diff.patch.split("\n").slice(2)) {
      if (line.startsWith("+")) additions += 1;
      else if (line.startsWith("-")) deletions += 1;
    }
    return { additions, deletions };
  };
  const signedLines = (stats) => {
    const row = element("span", "sfc-inline-lines");
    row.append(
      element(
        "span",
        "sfc-inline-add",
        `+${stats.additions.toLocaleString(api.locale)}`,
      ),
      element(
        "span",
        "sfc-inline-delete",
        `−${stats.deletions.toLocaleString(api.locale)}`,
      ),
    );
    return row;
  };
  // Render only the supplied snapshot. Hunk counts provide line numbers, never file contents.
  const renderDiff = (panel, file) => {
    const patch = file.diff?.patch;
    if (file.diff?.isBinary || typeof patch !== "string" || !patch.trim()) {
      panel.append(element("p", "sfc-inline-note", t(
        file.diff?.isBinary ? "footer.diffBinary" : "footer.diffUnavailable",
      )));
      return;
    }
    const scroll = element("div", "sfc-inline-diff-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute("aria-label", `${relativePath(file)}: ${t("footer.viewDiff")}`);
    scroll.title = t("footer.diffSnapshot");
    const table = element("table", "sfc-inline-diff-table sfc-split-diff-table");
    const head = element("thead");
    const labels = element("tr");
    const thOldNum = element("th", "sfc-split-th-num", t("footer.oldLine"));
    thOldNum.scope = "col";
    const thOldCode = element("th", "sfc-split-th-code sfc-split-divider", t("footer.diffBefore"));
    thOldCode.scope = "col";
    const thNewNum = element("th", "sfc-split-th-num", t("footer.newLine"));
    thNewNum.scope = "col";
    const thNewCode = element("th", "sfc-split-th-code", t("footer.diffAfter"));
    thNewCode.scope = "col";
    labels.append(thOldNum, thOldCode, thNewNum, thNewCode);
    head.append(labels);
    const body = element("tbody");
    const lines = patch.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    const limit = 1000;
    let hunk = null;
    let incomplete = false;
    let sawHunk = false;
    const unfinished = () => hunk && (hunk.oldRemaining !== 0 || hunk.newRemaining !== 0);

    let deletedBatch = [];
    let addedBatch = [];

    const flushBatch = () => {
      const count = Math.max(deletedBatch.length, addedBatch.length);
      for (let i = 0; i < count; i++) {
        const del = deletedBatch[i] ?? null;
        const add = addedBatch[i] ?? null;
        const row = element("tr", "sfc-split-row");

        const leftNum = element(
          "td",
          "sfc-inline-diff-number sfc-split-num" + (del ? (del.isEof ? " sfc-diff-eof" : " sfc-diff-del") : " sfc-diff-empty"),
          del ? String(del.lineNum) : "",
        );
        const leftCode = element(
          "td",
          "sfc-inline-diff-code sfc-split-code sfc-split-divider" + (del ? (del.isEof ? " sfc-diff-eof" : " sfc-diff-del") : " sfc-diff-empty"),
          del ? del.text : "",
        );

        const rightNum = element(
          "td",
          "sfc-inline-diff-number sfc-split-num" + (add ? (add.isEof ? " sfc-diff-eof" : " sfc-diff-add") : " sfc-diff-empty"),
          add ? String(add.lineNum) : "",
        );
        const rightCode = element(
          "td",
          "sfc-inline-diff-code sfc-split-code" + (add ? (add.isEof ? " sfc-diff-eof" : " sfc-diff-add") : " sfc-diff-empty"),
          add ? add.text : "",
        );

        row.append(leftNum, leftCode, rightNum, rightCode);
        body.append(row);
      }
      deletedBatch = [];
      addedBatch = [];
    };

    for (const line of lines.slice(0, limit)) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (match) {
        flushBatch();
        if (unfinished()) incomplete = true;
        const numbers = [Number(match[1]), Number(match[3]), Number(match[2] ?? 1), Number(match[4] ?? 1)];
        if (numbers.every(Number.isSafeInteger)) {
          sawHunk = true;
          hunk = { oldLine: numbers[0], newLine: numbers[1], oldRemaining: numbers[2], newRemaining: numbers[3] };
        } else {
          incomplete = true;
          hunk = null;
        }
        const hunkRow = element("tr", "sfc-split-hunk-row");
        const hunkCell = element("td", "sfc-split-hunk-cell", line);
        hunkCell.colSpan = 4;
        hunkRow.append(hunkCell);
        body.append(hunkRow);
        continue;
      }

      if (!sawHunk) {
        if (!line.startsWith("---") && !line.startsWith("+++")) {
          const metaRow = element("tr", "sfc-split-meta-row");
          const metaCell = element("td", "sfc-split-meta-cell", line);
          metaCell.colSpan = 4;
          metaRow.append(metaCell);
          body.append(metaRow);
        }
        continue;
      }

      if (hunk && /^[ +-]/.test(line) && (hunk.oldRemaining > 0 || hunk.newRemaining > 0)) {
        const prefix = line[0];
        const text = line.slice(1);
        if (prefix === " ") {
          flushBatch();
          if (hunk.oldRemaining <= 0 || hunk.newRemaining <= 0) {
            incomplete = true;
            hunk = null;
          } else {
            const oldNum = String(hunk.oldLine++);
            const newNum = String(hunk.newLine++);
            hunk.oldRemaining--;
            hunk.newRemaining--;
            const row = element("tr", "sfc-split-row sfc-split-context");
            row.append(
              element("td", "sfc-inline-diff-number sfc-split-num", oldNum),
              element("td", "sfc-inline-diff-code sfc-split-code sfc-split-divider", text),
              element("td", "sfc-inline-diff-number sfc-split-num", newNum),
              element("td", "sfc-inline-diff-code sfc-split-code", text),
            );
            body.append(row);
          }
        } else if (prefix === "-") {
          if (hunk.oldRemaining <= 0) {
            incomplete = true;
            hunk = null;
          } else {
            const oldNum = hunk.oldLine++;
            hunk.oldRemaining--;
            deletedBatch.push({ lineNum: oldNum, text });
          }
        } else if (prefix === "+") {
          if (hunk.newRemaining <= 0) {
            incomplete = true;
            hunk = null;
          } else {
            const newNum = hunk.newLine++;
            hunk.newRemaining--;
            addedBatch.push({ lineNum: newNum, text });
          }
        }
      } else if (line.startsWith("\\")) {
        const notice = "\\ " + t("footer.noNewline");
        if (addedBatch.length > 0) {
          addedBatch.push({ lineNum: "", text: notice, isEof: true });
        } else if (deletedBatch.length > 0) {
          deletedBatch.push({ lineNum: "", text: notice, isEof: true });
        } else {
          flushBatch();
          const row = element("tr", "sfc-split-row sfc-diff-eof");
          row.append(
            element("td", "sfc-inline-diff-number sfc-split-num sfc-diff-eof", ""),
            element("td", "sfc-inline-diff-code sfc-split-code sfc-split-divider sfc-diff-eof", notice),
            element("td", "sfc-inline-diff-number sfc-split-num sfc-diff-eof", ""),
            element("td", "sfc-inline-diff-code sfc-split-code sfc-diff-eof", notice),
          );
          body.append(row);
        }
      } else {
        if (unfinished() || /^[ +-]/.test(line)) incomplete = true;
        hunk = null;
      }
    }
    flushBatch();
    table.append(head, body);
    scroll.append(table);
    panel.append(scroll);
    if (lines.length > limit)
      panel.append(element("p", "sfc-inline-note", t("footer.diffLimit", { count: limit })));
    else if (!sawHunk || incomplete || unfinished())
      panel.append(element("p", "sfc-inline-note", t("footer.diffIncomplete")));
  };
  const render = () => {
    if (!active()) return;
    root.replaceChildren();
    root.hidden = false;
    if (api.ui?.messageFooterVersion !== 1) {
      root.append(element("p", "sfc-inline-note", t("footer.taskUnavailable")));
      return;
    }
    if (!context.task) {
      root.hidden = true;
      return;
    }
    const raw = Array.isArray(context.task.records) ? context.task.records : null;
    const coverage = Array.isArray(context.task.coverage) ? context.task.coverage : null;
    if (!raw) {
      root.append(element("p", "sfc-inline-note", t("unavailable")));
      return;
    }
    const latest = new Map();
    for (const record of raw) {
      if (
        !record ||
        typeof record.filePath !== "string" ||
        !record.filePath.trim()
      )
        continue;
      const key =
        typeof record.fileKey === "string" && record.fileKey
          ? record.fileKey
          : record.filePath;
      const previous = latest.get(key);
      if (
        !previous ||
        (Number(record.timestamp) || 0) >= (Number(previous.timestamp) || 0)
      )
        latest.set(key, record);
    }
    const files = [...latest.values()].sort(
      (left, right) =>
        (Number(left.timestamp) || 0) - (Number(right.timestamp) || 0),
    );
    if (!files.length) {
      root.hidden = true;
      return;
    }
    const heading = element("div", "sfc-inline-heading");
    const icon = hostIcon("Files", "sfc-inline-icon");
    icon.setAttribute("aria-hidden", "true");
    const text = element("div", "sfc-inline-heading-text");
    text.title = t("footer.cumulative");
    text.append(
      element("strong", "", t("footer.recorded", { count: files.length })),
    );
    const known = files.map(linesFor).filter(Boolean);
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
      stats.append(signedLines(totals));
      text.append(stats);
    }
    heading.append(icon, text);
    root.append(heading);
    const list = element("ul", "sfc-inline-list");
    list.id = `sfc-files-${crypto.randomUUID()}`;
    for (const file of expanded ? files : files.slice(0, 4)) {
      const row = element("li", "sfc-inline-file");
      const path = element("button", "sfc-inline-path", relativePath(file));
      path.type = "button";
      path.title = `${file.filePath}\n${t("footer.clickHint", { modifier })}\n${t("footer.diffSnapshot")}`;
      path.setAttribute("aria-label", `${relativePath(file)}: ${t("footer.clickHint", { modifier })}`);
      const key = keyFor(file);
      const diff = element("div", "sfc-inline-diff");
      diff.id = `sfc-diff-${crypto.randomUUID()}`;
      diff.hidden = !expandedDiffs.has(key);
      path.setAttribute("aria-expanded", String(!diff.hidden));
      path.setAttribute("aria-controls", diff.id);
      let rendered = false;
      const populateDiff = () => {
        if (rendered) return;
        renderDiff(diff, file);
        rendered = true;
      };
      if (!diff.hidden) populateDiff();
      let pending = false;
      const open = async (event) => {
        if (!active() || (event.button !== undefined && event.button !== 0)) return;
        event.preventDefault();
        const openDocument = isMac ? event.metaKey : event.ctrlKey;
        if (!openDocument) {
          diff.hidden = !diff.hidden;
          if (diff.hidden) expandedDiffs.delete(key);
          else { expandedDiffs.add(key); populateDiff(); }
          path.setAttribute("aria-expanded", String(!diff.hidden));
          return;
        }
        if (pending) return;
        const reason = !actions.has("panels.openFile")
          ? "footer.openUpgrade"
          : file.kind === "delete" ? "footer.deletedFile"
            : typeof file.root === "string" && file.root.startsWith("ssh://") ? "footer.remoteUnavailable"
              : !/^(?:[a-zA-Z]:[\\/]|\/|\\\\)/.test(file.filePath) || file.filePath.includes("\0") ? "footer.invalidPath" : null;
        if (reason) {
          showNotice(reason);
          return;
        }
        pending = true;
        root.querySelector(".sfc-inline-open-error")?.remove();
        try {
          const result = await api.write.run("panels.openFile", { filePath: file.filePath });
          if (!result?.ok) throw new Error("Navigation request failed");
        } catch {
          if (active() && path.isConnected) showNotice("footer.openError");
        } finally {
          pending = false;
        }
      };
      path.addEventListener("click", open);
      row.addEventListener("click", (event) => {
        if (event.target.closest("button, .sfc-inline-diff")) return;
        void open(event);
      });
      row.append(path);
      const stats = linesFor(file);
      row.append(
        stats
          ? signedLines(stats)
          : element("span", "sfc-inline-muted", t("footer.linesUnavailable")),
        diff,
      );
      list.append(row);
    }
    root.append(list);
    if (files.length > 4) {
      const toggle = element("button", "sfc-inline-toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-controls", list.id);
      const chevron = hostIcon(expanded ? "ChevronUp" : "ChevronDown", "sfc-inline-chevron");
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
          .querySelector(".sfc-inline-toggle")
          ?.focus({ preventScroll: true });
      });
      root.append(toggle);
    }
    const notes = [];
    if (coverage === null) notes.push(t("coverageMissing"));
    if (files.some((file) => !file.fileKey || !file.source))
      notes.push(t("footer.legacy"));
    root.title = notes.join("\n");
  };
  const cleanup = () => {
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
