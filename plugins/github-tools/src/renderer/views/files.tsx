import { React, useMemo, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { CopyButton, HostIcon, OpenButton } from "../presentation";

export { DirectoryList, FileView, CodeList };

function DirectoryList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  if (!items.length) return <div className="gh-empty">{t("github.result.empty")}</div>;
  return (
    <div className="gh-list">
      {items.map((entry, index) => (
        <div className={`gh-dir-row${asText(entry.type) === "dir" ? " gh-dir-row--folder" : ""}`} key={`${asText(entry.path)}-${index}`}>
          <HostIcon
            api={api}
            name={asText(entry.type) === "dir" ? "Folder" : "FileText"}
            size={12}
          />
          <code className="gh-dir-path">{asText(entry.path) || asText(entry.name)}</code>
          <span className="gh-tag gh-tag--muted">
            {asText(entry.type) || t("github.result.file")}
          </span>
        </div>
      ))}
    </div>
  );
}

function FileView({
  api,
  payload,
}: {
  api: ToolCallApi;
  payload: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const [expanded, setExpanded] = useState(false);
  const text = asText(payload.text);
  const lines = useMemo(() => text.split(/\r\n|\n|\r/), [text]);
  const range = isRecord(payload.range) ? payload.range : null;
  const totalLines = asNumber(payload.totalLines) ?? lines.length;
  const rangeStart = range ? asNumber(range.startLine) : null;
  const rangeEnd = range ? asNumber(range.endLine) : null;
  const preview = expanded ? text : lines.slice(0, 24).join("\n");
  return (
    <div className="gh-file">
      <div className="gh-file-head">
        <OpenButton
          api={api}
          url={asText(payload.html_url)}
          label={asText(payload.path) || t("github.result.file")}
          className="gh-link gh-link--strong"
        />
        <div className="gh-file-actions">
          <span className="gh-hint">
            {rangeStart !== null && rangeEnd !== null
              ? `${t("github.result.range", { values: { start: rangeStart, end: rangeEnd } })} · `
              : ""}
            {t("github.result.totalLines", { values: { count: totalLines } })}
            {asNumber(payload.size) !== null
              ? ` · ${(asNumber(payload.size) ?? 0).toLocaleString()} B`
              : ""}
          </span>
          <CopyButton t={t} value={text} label={t("github.action.copyFile")} />
        </div>
      </div>
      <pre className="gh-code">{preview}</pre>
      {lines.length > 24 ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("github.action.collapse") : t("github.action.expand")}
        </button>
      ) : null}
    </div>
  );
}

function CodeList({
  api,
  payload,
}: {
  api: ToolCallApi;
  payload: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(8);
  const items = useMemo(
    () =>
      (Array.isArray(payload.items) ? payload.items : []).filter(isRecord),
    [payload],
  );
  const total = asNumber(payload.total_count) ?? items.length;
  if (!items.length)
    return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((item, index) => {
        const repository = isRecord(item.repository)
          ? asText(item.repository.full_name)
          : "";
        return (
          <article className="gh-item gh-item--compact" key={`${asText(item.path)}-${index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(item.html_url)}
                label={asText(item.path) || asText(item.name) || t("github.result.file")}
                className="gh-link gh-link--strong"
              />
              {repository ? (
                <span className="gh-tag gh-tag--muted">{repository}</span>
              ) : null}
            </div>
          </article>
        );
      })}
      {items.length > visible.length ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setLimit((current) => current + 8)}
        >
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
      {total > items.length ? (
        <div className="gh-hint">
          {t("github.result.total", {
            values: { total },
          })}
        </div>
      ) : null}
    </div>
  );
}