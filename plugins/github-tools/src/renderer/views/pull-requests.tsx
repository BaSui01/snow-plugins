import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { HostIcon, OpenButton } from "../presentation";

function PullRequestState({
  api,
  pullRequest,
}: {
  api: ToolCallApi;
  pullRequest: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const state = asText(pullRequest.state);
  return (
    <span className="gh-state-row">
      {pullRequest.draft === true ? <span className="gh-tag gh-tag--muted">{t("github.state.draft")}</span> : null}
      {state ? (
        <span className={`gh-state gh-state--${state}`}>
          {t(`github.state.${state}`, { defaultValue: state })}
        </span>
      ) : null}
    </span>
  );
}

function BranchFlow({
  api,
  pullRequest,
  withSha = false,
}: {
  api: ToolCallApi;
  pullRequest: Record<string, unknown>;
  withSha?: boolean;
}): React.JSX.Element | null {
  const { t } = api;
  const head = isRecord(pullRequest.head) ? pullRequest.head : null;
  const base = isRecord(pullRequest.base) ? pullRequest.base : null;
  if (!head || !base) return null;
  const label = (reference: Record<string, unknown>): string => {
    const ref = asText(reference.ref) || t("github.value.empty");
    const sha = asText(reference.sha);
    return withSha && sha ? `${ref}@${sha.slice(0, 10)}` : ref;
  };
  const headText = label(head);
  const baseText = label(base);
  return (
    <div className="gh-branch-flow">
      <HostIcon api={api} name="GitBranch" />
      <code title={`${asText(head.ref)} ${asText(head.sha)}`.trim()}>{headText}</code>
      <HostIcon api={api} name="ArrowRight" />
      <code title={`${asText(base.ref)} ${asText(base.sha)}`.trim()}>{baseText}</code>
    </div>
  );
}

export function PullRequestList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length) return <div className="gh-empty">{t("github.result.empty")}</div>;
  return (
    <div className="gh-list">
      {items.slice(0, limit).map((pullRequest, index) => {
        const number = typeof pullRequest.number === "number" ? pullRequest.number : index + 1;
        const author = isRecord(pullRequest.user) ? asText(pullRequest.user.login) : "";
        const updated = asText(pullRequest.updated_at);
        return (
          <article className="gh-item gh-item--compact" key={`${asText(pullRequest.node_id)}-${number}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(pullRequest.html_url)}
                label={
                  <span className="gh-issue-title">
                    <HostIcon api={api} name="GitPullRequest" />
                    <span className="gh-issue-number">#{number}</span>
                    <span>{asText(pullRequest.title) || t("github.result.pullRequest")}</span>
                  </span>
                }
                className="gh-link gh-link--strong"
              />
              <PullRequestState api={api} pullRequest={pullRequest} />
            </div>
            <BranchFlow api={api} pullRequest={pullRequest} withSha />
            {author || updated ? (
              <div className="gh-item-foot">
                {author ? <span><HostIcon api={api} name="User" />{author}</span> : null}
                {updated ? <time dateTime={updated}>{t("github.result.updated", { values: { date: updated } })}</time> : null}
              </div>
            ) : null}
          </article>
        );
      })}
      {items.length > limit ? (
        <button type="button" className="gh-more" onClick={() => setLimit((current) => current + 10)}>
          {t("github.action.more")} · {items.length - limit}
        </button>
      ) : null}
    </div>
  );
}

function RepositoryLink({
  api,
  label,
  value,
}: {
  api: ToolCallApi;
  label: string;
  value: unknown;
}): React.JSX.Element {
  const { t } = api;
  if (!isRecord(value)) {
    return <span className="gh-hint">{label}: {t("github.result.repositoryUnavailable")}</span>;
  }
  return (
    <span className="gh-meta-row">
      <span>{label}:</span>
      <OpenButton
        api={api}
        url={asText(value.html_url)}
        label={asText(value.full_name) || asText(value.name) || t("github.result.repository")}
        className="gh-link"
      />
    </span>
  );
}

export function PullRequestDetails({
  api,
  pullRequest,
}: {
  api: ToolCallApi;
  pullRequest: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const body = asText(pullRequest.body);
  const mergeable = pullRequest.mergeable;
  const head = isRecord(pullRequest.head) ? pullRequest.head : null;
  const base = isRecord(pullRequest.base) ? pullRequest.base : null;
  return (
    <article className="gh-item gh-issue-item">
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(pullRequest.html_url)}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="GitPullRequest" />
              <span className="gh-issue-number">#{asNumber(pullRequest.number) ?? ""}</span>
              <span>{asText(pullRequest.title) || t("github.result.pullRequest")}</span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <PullRequestState api={api} pullRequest={pullRequest} />
      </div>
      {body ? <pre className="gh-comment-body">{body}</pre> : null}
      <BranchFlow api={api} pullRequest={pullRequest} withSha />
      <div className="gh-meta-row">
        <span className="gh-tag">{t("github.result.nodeId")}: <code>{asText(pullRequest.node_id)}</code></span>
        <span className="gh-tag">
          {t("github.result.merged")}: {t(pullRequest.merged === true ? "github.value.yes" : "github.value.no")}
        </span>
        <span className="gh-tag">
          {t("github.result.mergeable")}: {mergeable === null
            ? t("github.state.calculating")
            : t(mergeable === true ? "github.value.yes" : "github.value.no")}
        </span>
        {asText(pullRequest.mergeable_state) ? (
          <span className="gh-tag">{t("github.result.mergeableState")}: {asText(pullRequest.mergeable_state)}</span>
        ) : null}
      </div>
      {head ? <RepositoryLink api={api} label={t("github.field.headRepository")} value={head.repo} /> : null}
      {base ? <RepositoryLink api={api} label={t("github.field.baseRepository")} value={base.repo} /> : null}
      <div className="gh-item-foot">
        {asText(pullRequest.created_at) ? (
          <time dateTime={asText(pullRequest.created_at)}>
            {t("github.result.created", { values: { date: asText(pullRequest.created_at) } })}
          </time>
        ) : null}
        {asText(pullRequest.updated_at) ? (
          <time dateTime={asText(pullRequest.updated_at)}>
            {t("github.result.updated", { values: { date: asText(pullRequest.updated_at) } })}
          </time>
        ) : null}
      </div>
    </article>
  );
}
