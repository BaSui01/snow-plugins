import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { HostIcon, OpenButton, truncate } from "../presentation";

const gistFiles = (gist: Record<string, unknown>): Record<string, unknown>[] =>
  isRecord(gist.files) ? Object.values(gist.files).filter(isRecord) : [];

function GistItem({
  api,
  gist,
  detailed = false,
}: {
  api: ToolCallApi;
  gist: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const id = asText(gist.id);
  const description = asText(gist.description);
  const owner = isRecord(gist.owner) ? asText(gist.owner.login) : "";
  const files = gistFiles(gist);
  const comments = asNumber(gist.comments);
  const created = asText(gist.created_at);
  const updated = asText(gist.updated_at);
  return (
    <article
      className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}
    >
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(gist.html_url)}
          title={description}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="FileCode2" />
              <span>
                {description
                  ? truncate(description, 120)
                  : t("github.result.gist")}
              </span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <span className="gh-state-row">
          <span className="gh-tag">
            {t(
              gist.public === true
                ? "github.result.public"
                : "github.result.private",
            )}
          </span>
        </span>
      </div>
      <div className="gh-meta-row">
        {id ? (
          <span className="gh-tag gh-tag--muted">
            <code>{id}</code>
          </span>
        ) : null}
        <span className="gh-tag">
          {t("github.result.files")}: {files.length}
        </span>
        {comments !== null ? (
          <span className="gh-tag">
            {t("github.result.comments")}: {comments}
          </span>
        ) : null}
      </div>
      <div className="gh-item-foot">
        {owner ? (
          <span>
            <HostIcon api={api} name="User" />
            {owner}
          </span>
        ) : null}
        {detailed && created ? (
          <time dateTime={created}>
            {t("github.result.created", { values: { date: created } })}
          </time>
        ) : null}
        {updated ? (
          <time dateTime={updated}>
            {t("github.result.updated", { values: { date: updated } })}
          </time>
        ) : null}
      </div>
    </article>
  );
}

export function GistList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length)
    return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((gist, index) => (
        <GistItem
          api={api}
          gist={gist}
          key={`${asText(gist.id) || index}`}
        />
      ))}
      {items.length > visible.length ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setLimit((current) => current + 10)}
        >
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
    </div>
  );
}

export function GistDetails({
  api,
  gist,
}: {
  api: ToolCallApi;
  gist: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const files = gistFiles(gist);
  return (
    <div className="gh-list">
      <GistItem api={api} gist={gist} detailed />
      {files.map((file, index) => {
        const filename = asText(file.filename);
        const language = asText(file.language);
        const size = asNumber(file.size);
        const content = asText(file.content);
        return (
          <article
            className="gh-item gh-item--compact"
            key={`${filename}-${index}`}
          >
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(file.raw_url)}
                title={filename}
                label={
                  <span className="gh-issue-title">
                    <HostIcon api={api} name="FileCode2" />
                    <span>{filename || t("github.result.file")}</span>
                  </span>
                }
                className="gh-link gh-link--strong"
              />
              <span className="gh-state-row">
                {language ? (
                  <span className="gh-tag gh-tag--muted">{language}</span>
                ) : null}
                {size !== null ? (
                  <span className="gh-tag gh-tag--muted">
                    {t("github.result.size")}: {size.toLocaleString()}
                  </span>
                ) : null}
              </span>
            </div>
            {content ? (
              <pre className="gh-comment-body">{truncate(content, 4000)}</pre>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
