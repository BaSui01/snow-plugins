import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asText, isRecord } from "../parsing";
import { HostIcon, OpenButton } from "../presentation";

function NotificationItem({
  api,
  notification,
}: {
  api: ToolCallApi;
  notification: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const subject = isRecord(notification.subject) ? notification.subject : {};
  const subjectTitle = asText(subject.title);
  const subjectType = asText(subject.type);
  const reason = asText(notification.reason);
  const unread = notification.unread === true;
  const repository = isRecord(notification.repository)
    ? notification.repository
    : null;
  const repositoryName = repository ? asText(repository.full_name) : "";
  const repositoryUrl = repository ? asText(repository.html_url) : "";
  const updated = asText(notification.updated_at);
  return (
    <article className="gh-item gh-issue-item gh-item--compact">
      <div className="gh-item-head">
        <span className="gh-issue-title">
          <HostIcon api={api} name="Bell" />
          <span>{subjectTitle || t("github.result.notification")}</span>
        </span>
        <span className="gh-state-row">
          {unread ? (
            <span className="gh-tag">{t("github.result.unread")}</span>
          ) : null}
        </span>
      </div>
      <div className="gh-meta-row">
        {subjectType ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.subject")}: {subjectType}
          </span>
        ) : null}
        {reason ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.reason")}:{" "}
            {t(`github.state.${reason}`, { defaultValue: reason })}
          </span>
        ) : null}
        {repositoryName ? (
          <span className="gh-tag">
            {t("github.result.repository")}:{" "}
            <OpenButton
              api={api}
              url={repositoryUrl}
              label={repositoryName}
              className="gh-link"
            />
          </span>
        ) : null}
      </div>
      {updated ? (
        <div className="gh-item-foot">
          <time dateTime={updated}>
            {t("github.result.updated", { values: { date: updated } })}
          </time>
        </div>
      ) : null}
    </article>
  );
}

export function NotificationList({
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
      {visible.map((notification, index) => (
        <NotificationItem
          api={api}
          notification={notification}
          key={`${asText(notification.id) || index}`}
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

export function NotificationDetails({
  api,
  notification,
}: {
  api: ToolCallApi;
  notification: Record<string, unknown>;
}): React.JSX.Element {
  return <NotificationItem api={api} notification={notification} />;
}
