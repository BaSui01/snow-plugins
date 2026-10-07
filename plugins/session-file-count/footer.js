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
  let subscription;
  let runtime = null;
  let expanded = false;
  let latestGeneratedAt = 0;
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
  const recordsFor = (map) =>
    map &&
    typeof map === "object" &&
    Object.prototype.hasOwnProperty.call(map, context.conversationId) &&
    Array.isArray(map[context.conversationId])
      ? map[context.conversationId]
      : null;
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
  const render = () => {
    if (!active()) return;
    root.replaceChildren();
    const conversation = runtime?.conversation;
    if (
      conversation?.conversationId !== context.conversationId ||
      conversation.isStreaming ||
      conversation.isPaused ||
      conversation.isAborting
    ) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    if (
      api.ui?.messageFooterVersion !== 1 ||
      conversation.fileChangeTrackingVersion !== 1
    ) {
      root.append(element("p", "sfc-inline-note", t("footerUpgrade")));
      return;
    }
    const raw = recordsFor(conversation.fileChangeStats);
    const coverage = recordsFor(conversation.fileChangeCoverage);
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
      let pending = false;
      const open = async (event) => {
        if (!active() || pending || (event.button !== undefined && event.button !== 0)) return;
        event.preventDefault();
        const openDocument = isMac ? event.metaKey : event.ctrlKey;
        const action = openDocument ? "panels.openFile" : "panels.openFileDiff";
        const patch = file.diff?.patch;
        const changeType = { create: "added", edit: "modified", delete: "deleted" }[file.kind];
        const reason = !actions.has(action)
          ? openDocument ? "footer.openUpgrade" : "footer.diffUpgrade"
          : openDocument
            ? file.kind === "delete" ? "footer.deletedFile"
              : typeof file.root === "string" && file.root.startsWith("ssh://") ? "footer.remoteUnavailable"
                : !/^(?:[a-zA-Z]:[\\/]|\/|\\\\)/.test(file.filePath) || file.filePath.includes("\0") ? "footer.invalidPath" : null
            : file.diff?.isBinary || typeof patch !== "string" || !patch.trim() || !changeType
              ? "footer.diffUnavailable" : null;
        if (reason) {
          showNotice(reason);
          return;
        }
        pending = true;
        path.disabled = true;
        root.querySelector(".sfc-inline-open-error")?.remove();
        try {
          const result = await api.write.run(action, openDocument
            ? { filePath: file.filePath }
            : { filePath: file.filePath, patch, changeType });
          if (!result?.ok) throw new Error("Navigation request failed");
        } catch {
          if (active() && path.isConnected)
            showNotice(openDocument ? "footer.openError" : "footer.diffOpenError");
        } finally {
          pending = false;
          if (active() && path.isConnected) path.disabled = false;
        }
      };
      path.addEventListener("click", open);
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        void open(event);
      });
      row.append(path);
      const stats = linesFor(file);
      row.append(
        stats
          ? signedLines(stats)
          : element("span", "sfc-inline-muted", t("footer.linesUnavailable")),
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
  const accept = (response) => {
    if (!active()) return;
    const generatedAt = Number(response?.generatedAt) || 0;
    if (generatedAt < latestGeneratedAt) return;
    latestGeneratedAt = generatedAt;
    runtime = response?.domains?.runtime ?? null;
    render();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", cleanup);
    try {
      subscription?.unsubscribe();
    } finally {
      root.remove();
      runtime = null;
    }
  };
  signal.addEventListener("abort", cleanup, { once: true });
  if (!active()) {
    cleanup();
    return cleanup;
  }
  void (async () => {
    const sub = await api.metadata.subscribe("runtime", accept);
    if (!active()) sub.unsubscribe();
    else subscription = sub;
  })().catch(() => {
    if (!active()) return;
    root.replaceChildren(element("p", "sfc-inline-note", t("readError")));
    root.hidden = false;
  });
  return cleanup;
}
