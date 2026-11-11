import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { HostIcon, OpenButton } from "../presentation";

function DiscussionItem({
  api,
  discussion,
  detailed = false,
}: {
  api: ToolCallApi;
  discussion: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const number = asNumber(discussion.number);
  const title = asText(discussion.title);
  const category = isRecord(discussion.category)
    ? asText(discussion.category.name)
    : "";
  const author = isRecord(discussion.author)
    ? asText(discussion.author.login)
    : "";
  const comments = isRecord(discussion.comments)
    ? asNumber(discussion.comments.totalCount)
    : null;
  const answered = discussion.isAnswered === true;
  const upvotes = asNumber(discussion.upvoteCount);
  const created = asText(discussion.createdAt);
  const updated = asText(discussion.updatedAt);
  const body = asText(discussion.body);
  return (
    <article
      className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}
    >
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(discussion.url)}
          title={title}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="MessageSquare" />
              {number !== null ? (
                <span className="gh-issue-number">#{number}</span>
              ) : null}
              <span>{title || t("github.result.discussion")}</span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <span className="gh-state-row">
          {category ? (
            <span className="gh-tag gh-tag--muted">{category}</span>
          ) : null}
          {answered ? (
            <span className="gh-tag">{t("github.result.answered")}</span>
          ) : null}
        </span>
      </div>
      {body ? <pre className="gh-comment-body">{body}</pre> : null}
      <div className="gh-item-foot">
        {author ? (
          <span title={t("github.field.author")}>
            <HostIcon api={api} name="User" />
            {author}
          </span>
        ) : null}
        {upvotes !== null ? (
          <span>
            {t("github.result.upvotes")}: {upvotes}
          </span>
        ) : null}
        {comments !== null ? (
          <span
            title={t("github.result.comments")}
            aria-label={`${t("github.result.comments")}: ${comments}`}
          >
            <HostIcon api={api} name="MessageSquare" />
            {comments}
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

export function DiscussionList({
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
      {visible.map((discussion, index) => (
        <DiscussionItem
          api={api}
          discussion={discussion}
          key={`${asNumber(discussion.number) ?? index}`}
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

export function DiscussionDetails({
  api,
  discussion,
}: {
  api: ToolCallApi;
  discussion: Record<string, unknown>;
}): React.JSX.Element {
  return <DiscussionItem api={api} discussion={discussion} detailed />;
}
