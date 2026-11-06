import { React } from "../runtime";
import type { ToolCallApi, Translate } from "../types";
import type { ToolKind } from "../config";
import { asNumber, asText, isRecord, safeUrl } from "../parsing";
import type { Payload } from "../parsing";
import { OpenButton, RawBlock, truncate, CopyButton, HostIcon } from "../presentation";

export { WriteResult };

type Badge = { label: string; tone: "ok" | "warn" | "muted" };

function writeBadge(
  t: Translate,
  kind: ToolKind,
  record: Record<string, unknown>,
): Badge {
  if (kind === "mergePullRequest") {
    return record.merged === true
      ? { label: t("github.state.merged"), tone: "ok" }
      : { label: t("github.state.notMerged"), tone: "warn" };
  }
  if (kind === "reviewPullRequest") {
    const state = asText(record.state);
    const key = state === "APPROVED"
      ? "approved"
      : state === "CHANGES_REQUESTED"
        ? "changesRequested"
        : "commented";
    return {
      label: t(`github.state.${key}`),
      tone: key === "changesRequested" ? "warn" : "ok",
    };
  }
  if (kind === "revertPullRequest") {
    return { label: t("github.state.revertPullRequestCreated"), tone: "ok" };
  }
  if (kind === "commentPullRequestLine") {
    return { label: t("github.state.lineCommentSubmitted"), tone: "ok" };
  }
  if (kind === "uploadReleaseAsset") {
    return { label: t("github.state.assetUploaded"), tone: "ok" };
  }
  if (kind === "createIssue" || kind === "updateIssue" || kind === "createPullRequest") {
    if (kind === "createPullRequest" && record.draft === true) {
      return { label: t("github.state.draft"), tone: "muted" };
    }
    const state = asText(record.state);
    return state
      ? {
          label: t(`github.state.${state}`, { defaultValue: state }),
          tone: state === "closed" ? "muted" : "ok",
        }
      : { label: t("github.state.done"), tone: "ok" };
  }
  if (kind === "createRelease") {
    if (record.draft === true) return { label: t("github.state.draft"), tone: "muted" };
    if (record.prerelease === true) return { label: t("github.state.prerelease"), tone: "warn" };
    return { label: t("github.state.published"), tone: "ok" };
  }
  if (kind === "comment") return { label: t("github.state.commented"), tone: "ok" };
  return { label: t("github.state.committed"), tone: "ok" };
}

function WriteResult({
  api,
  kind,
  payload,
}: {
  api: ToolCallApi;
  kind: ToolKind;
  payload: Payload;
}): React.JSX.Element {
  const { t } = api;
  if (!isRecord(payload)) return <RawBlock t={t} payload={payload} />;
  const record = payload;
  const url = safeUrl(record.html_url) || safeUrl(record.url) || safeUrl(record.browser_download_url);
  const number = asNumber(record.number);
  const title = asText(record.title) || asText(record.name) || asText(record.tag_name) || asText(record.path);
  const message = asText(record.message);
  const body = asText(record.body);
  const sha = asText(record.sha);
  const commitSha = asText(record.commit_sha) || asText(record.commit_id);
  const head = asText(record.head) || asText(record.headRefName);
  const base = asText(record.base) || asText(record.baseRefName);
  const created = asText(record.created_at) || asText(record.submitted_at);
  const line = asNumber(record.line);
  const side = asText(record.side);
  const size = asNumber(record.size);
  const contentType = asText(record.content_type);
  const badge = writeBadge(t, kind, record);
  const icon = kind === "mergePullRequest"
    ? "GitMerge"
    : kind === "comment" || kind === "commentPullRequestLine"
      ? "MessageSquare"
      : kind === "createIssue" || kind === "updateIssue"
        ? "CircleDot"
        : kind === "createPullRequest" || kind === "revertPullRequest"
          ? "GitPullRequest"
          : kind === "reviewPullRequest"
            ? "ClipboardCheck"
            : kind === "createRelease"
              ? "Tag"
              : kind === "uploadReleaseAsset"
                ? "Package"
                : "FileUp";

  return (
    <div className={`gh-write gh-write--${kind}`}>
      <div className="gh-write-head">
        <span className={`gh-write-symbol gh-badge--${badge.tone}`}>
          <HostIcon api={api} name={icon} size={14} />
        </span>
        <span className={`gh-badge gh-badge--${badge.tone}`}>{badge.label}</span>
        {number !== null ? <span className="gh-issue-number">#{number}</span> : null}
        {title ? <span className="gh-write-title" title={title}>{title}</span> : null}
        {url ? (
          <OpenButton
            api={api}
            url={url}
            title={url}
            label={<>{t("github.action.open")}<HostIcon api={api} name="ExternalLink" /></>}
            className="gh-link gh-write-link gh-open-link"
          />
        ) : null}
      </div>
      {message && record.merged !== true ? <p className="gh-write-warning">{message}</p> : null}
      {head && base ? (
        <div className="gh-branch-flow">
          <HostIcon api={api} name="GitBranch" />
          <code title={head}>{head}</code>
          <HostIcon api={api} name="ArrowRight" />
          <code title={base}>{base}</code>
        </div>
      ) : null}
      {kind === "commentPullRequestLine" && (line !== null || side) ? (
        <div className="gh-meta-row">
          {line !== null ? <span className="gh-tag">{t("github.field.line")}: {line}</span> : null}
          {side ? <span className="gh-tag">{t("github.field.side")}: {side}</span> : null}
        </div>
      ) : null}
      {body && (kind === "comment" || kind === "commentPullRequestLine") ? (
        <pre className="gh-comment-body">{truncate(body, 1200)}</pre>
      ) : null}
      {kind === "uploadReleaseAsset" && (size !== null || contentType) ? (
        <div className="gh-meta-row">
          {size !== null ? <span className="gh-tag">{t("github.result.bytes", { values: { count: size } })}</span> : null}
          {contentType ? <span className="gh-tag">{contentType}</span> : null}
        </div>
      ) : null}
      {sha || commitSha ? (
        <div className="gh-sha-list">
          {sha ? (
            <span className="gh-sha-row">
              <span>{t("github.result.blobSha")}</span>
              <code title={sha}>{sha.slice(0, 12)}</code>
              <CopyButton t={t} value={sha} label={t("github.action.copySha")} />
            </span>
          ) : null}
          {commitSha ? (
            <span className="gh-sha-row">
              <span>{t("github.result.commit")}</span>
              <code title={commitSha}>{commitSha.slice(0, 12)}</code>
              <CopyButton t={t} value={commitSha} label={t("github.action.copySha")} />
            </span>
          ) : null}
          {asText(record.commit_url) ? (
            <OpenButton
              api={api}
              url={asText(record.commit_url)}
              label={t("github.action.viewCommit")}
              className="gh-link gh-commit-link"
            />
          ) : null}
        </div>
      ) : null}
      {created ? (
        <time className="gh-hint gh-created" dateTime={created} title={created}>
          <HostIcon api={api} name="Clock" />{created}
        </time>
      ) : null}
    </div>
  );
}
