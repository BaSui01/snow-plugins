import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { CopyButton, HostIcon, OpenButton } from "../presentation";

export function CommitList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length) return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((commit, index) => {
        const sha = asText(commit.sha);
        const message = asText(commit.message);
        const title = message.split(/\r?\n/)[0] || t("github.result.commit");
        const author = asText(commit.author);
        const date = asText(commit.date);
        return (
          <article className="gh-item gh-item--compact" key={`${sha}-${index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(commit.html_url)}
                label={
                  <span className="gh-issue-title">
                    <HostIcon api={api} name="GitCommitHorizontal" />
                    {sha ? <span className="gh-issue-number">{sha.slice(0, 7)}</span> : null}
                    {title}
                  </span>
                }
                className="gh-link gh-link--strong"
              />
              <span className="gh-state-row">
                {author ? <span className="gh-tag gh-tag--muted">{author}</span> : null}
                {date ? <span className="gh-hint" title={date}>{date.slice(0, 10)}</span> : null}
              </span>
            </div>
          </article>
        );
      })}
      {items.length > visible.length ? (
        <button type="button" className="gh-more" onClick={() => setLimit((current) => current + 10)}>
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
    </div>
  );
}

export function CommitDetails({
  api,
  commit,
}: {
  api: ToolCallApi;
  commit: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const sha = asText(commit.sha);
  const message = asText(commit.message);
  const parents = Array.isArray(commit.parents) ? commit.parents.filter(isRecord) : [];
  const files = Array.isArray(commit.files) ? commit.files.filter(isRecord) : [];
  return (
    <div className="gh-list">
      <article className="gh-item">
        <div className="gh-item-head">
          <OpenButton
            api={api}
            url={asText(commit.html_url)}
            label={
              <span className="gh-issue-title">
                <HostIcon api={api} name="GitCommitHorizontal" />
                <span>{message.split(/\r?\n/)[0] || t("github.result.commit")}</span>
              </span>
            }
            className="gh-link gh-link--strong"
          />
          <CopyButton t={t} value={sha} label={t("github.action.copySha")} />
        </div>
        <div className="gh-sha-row"><code title={sha}>{sha}</code></div>
        {message ? <pre className="gh-comment-body">{message}</pre> : null}
        <div className="gh-item-foot">
          {asText(commit.author) ? <span><HostIcon api={api} name="User" />{asText(commit.author)}</span> : null}
          {asText(commit.date) ? <time dateTime={asText(commit.date)}>{asText(commit.date)}</time> : null}
        </div>
        {parents.length ? (
          <div className="gh-sha-list">
            <span>{t("github.result.parents")}:</span>
            {parents.map((parent, index) => {
              const parentSha = asText(parent.sha);
              return (
                <OpenButton
                  api={api}
                  url={asText(parent.html_url)}
                  label={parentSha.slice(0, 10) || `${index + 1}`}
                  title={parentSha}
                  className="gh-link"
                  key={`${parentSha}-${index}`}
                />
              );
            })}
          </div>
        ) : null}
      </article>
      {files.map((file, index) => {
        const filename = asText(file.filename);
        const additions = asNumber(file.additions);
        const deletions = asNumber(file.deletions);
        const changes = asNumber(file.changes);
        const patch = file.patch;
        return (
          <article className="gh-item gh-item--compact" key={`${filename}-${index}`}>
            <div className="gh-item-head">
              <code className="gh-write-title" title={filename}>{filename}</code>
              <span className="gh-tag gh-tag--muted">{asText(file.status)}</span>
            </div>
            <div className="gh-item-foot">
              {additions !== null ? <span>+{additions}</span> : null}
              {deletions !== null ? <span>−{deletions}</span> : null}
              {changes !== null ? <span>{t("github.result.changes", { values: { count: changes } })}</span> : null}
            </div>
            {typeof patch === "string" ? (
              <details className="gh-raw">
                <summary>{t("github.result.patch")}</summary>
                <pre>{patch}</pre>
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
