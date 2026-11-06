import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { HostIcon, OpenButton, truncate } from "../presentation";

function IssueItem({
  api,
  issue,
  detailed = false,
}: {
  api: ToolCallApi;
  issue: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const number = asNumber(issue.number);
  const state = asText(issue.state);
  const labels = Array.isArray(issue.labels)
    ? issue.labels
        .map((label) => (isRecord(label) ? asText(label.name) : asText(label)))
        .filter(Boolean)
    : [];
  const isPullRequest = Boolean(issue.pull_request);
  const author = isRecord(issue.user) ? asText(issue.user.login) : "";
  const comments = asNumber(issue.comments);
  const updated = asText(issue.updated_at);
  const created = asText(issue.created_at);
  const body = asText(issue.body);
  return (
    <article className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}>
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(issue.html_url)}
          title={asText(issue.title)}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name={isPullRequest ? "GitPullRequest" : "CircleDot"} />
              {number !== null ? <span className="gh-issue-number">#{number}</span> : null}
              <span>{asText(issue.title) || t("github.result.issue")}</span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <span className="gh-state-row">
          {isPullRequest ? <span className="gh-tag gh-tag--muted">PR</span> : null}
          {state ? (
            <span className={`gh-state gh-state--${state}`}>
              {t(`github.state.${state}`, { defaultValue: state })}
            </span>
          ) : null}
        </span>
      </div>
      {body ? (
        detailed ? (
          <pre className="gh-comment-body">{body}</pre>
        ) : (
          <p className="gh-desc">{truncate(body.trim(), 180)}</p>
        )
      ) : null}
      {labels.length ? (
        <div className="gh-tags">
          {(detailed ? labels : labels.slice(0, 5)).map((label) => (
            <span className="gh-tag" key={label}>{label}</span>
          ))}
        </div>
      ) : null}
      <div className="gh-item-foot">
        {author ? (
          <span title={t("github.field.author")}><HostIcon api={api} name="User" />{author}</span>
        ) : null}
        {comments !== null ? (
          <span title={t("github.result.comments")} aria-label={`${t("github.result.comments")}: ${comments}`}>
            <HostIcon api={api} name="MessageSquare" />{comments}
          </span>
        ) : null}
        {detailed && created ? <time dateTime={created}>{t("github.result.created", { values: { date: created } })}</time> : null}
        {updated ? <time dateTime={updated}>{t("github.result.updated", { values: { date: updated } })}</time> : null}
      </div>
    </article>
  );
}

export function IssueList({
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
      {visible.map((issue, index) => (
        <IssueItem api={api} issue={issue} key={`${asNumber(issue.number) ?? index}`} />
      ))}
      {items.length > visible.length ? (
        <button type="button" className="gh-more" onClick={() => setLimit((current) => current + 10)}>
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
    </div>
  );
}

export function IssueDetails({
  api,
  issue,
}: {
  api: ToolCallApi;
  issue: Record<string, unknown>;
}): React.JSX.Element {
  return <IssueItem api={api} issue={issue} detailed />;
}
