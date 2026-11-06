import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText } from "../parsing";
import { HostIcon, OpenButton } from "../presentation";

function StateTag({ api, value }: { api: ToolCallApi; value: unknown }): React.JSX.Element | null {
  const text = asText(value);
  if (!text) return null;
  return <span className="gh-tag gh-tag--muted">{api.t(`github.state.${text}`, { defaultValue: text })}</span>;
}

function WorkflowRun({
  api,
  run,
}: {
  api: ToolCallApi;
  run: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const id = asNumber(run.id);
  const number = asNumber(run.run_number);
  const attempt = asNumber(run.run_attempt);
  const branch = asText(run.head_branch);
  const sha = asText(run.head_sha);
  const created = asText(run.created_at);
  const updated = asText(run.updated_at);
  return (
    <article className="gh-item gh-item--compact">
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(run.html_url)}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="Workflow" />
              <span>{asText(run.name) || t("github.result.workflowRun")}</span>
              {number !== null ? <span className="gh-issue-number">#{number}</span> : null}
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <span className="gh-state-row">
          <StateTag api={api} value={run.status} />
          <StateTag api={api} value={run.conclusion} />
        </span>
      </div>
      <div className="gh-meta-row">
        {id !== null ? <span className="gh-tag">{t("github.result.run")}: {id}</span> : null}
        {attempt !== null ? <span className="gh-tag">{t("github.result.attempt")}: {attempt}</span> : null}
        {asText(run.event) ? <span className="gh-tag">{asText(run.event)}</span> : null}
      </div>
      {branch || sha ? (
        <div className="gh-branch-flow">
          <HostIcon api={api} name="GitBranch" />
          {branch ? <code>{branch}</code> : null}
          {sha ? <code title={sha}>{sha.slice(0, 10)}</code> : null}
        </div>
      ) : null}
      <div className="gh-item-foot">
        {created ? <time dateTime={created}>{t("github.result.created", { values: { date: created } })}</time> : null}
        {updated ? <time dateTime={updated}>{t("github.result.updated", { values: { date: updated } })}</time> : null}
      </div>
    </article>
  );
}

export function WorkflowRunList({
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
      {items.slice(0, limit).map((run, index) => <WorkflowRun api={api} run={run} key={`${asNumber(run.id) ?? index}`} />)}
      {items.length > limit ? (
        <button type="button" className="gh-more" onClick={() => setLimit((current) => current + 10)}>
          {t("github.action.more")} · {items.length - limit}
        </button>
      ) : null}
    </div>
  );
}

export function WorkflowRunDetails({
  api,
  run,
}: {
  api: ToolCallApi;
  run: Record<string, unknown>;
}): React.JSX.Element {
  return <WorkflowRun api={api} run={run} />;
}

export function ArtifactList({
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
      {items.map((artifact, index) => {
        const size = asNumber(artifact.size_in_bytes);
        const expires = asText(artifact.expires_at);
        const created = asText(artifact.created_at);
        return (
          <article className="gh-item gh-item--compact" key={`${asNumber(artifact.id) ?? index}`}>
            <div className="gh-item-head">
              <span className="gh-issue-title">
                <HostIcon api={api} name="Package" />
                <span>{asText(artifact.name) || t("github.result.artifact")}</span>
                <span className="gh-issue-number">#{asNumber(artifact.id) ?? ""}</span>
              </span>
              {artifact.expired === true ? <span className="gh-state gh-state--closed">{t("github.state.expired")}</span> : null}
            </div>
            <div className="gh-item-foot">
              {size !== null ? <span>{t("github.result.bytes", { values: { count: size } })}</span> : null}
              {created ? <time dateTime={created}>{t("github.result.created", { values: { date: created } })}</time> : null}
              {expires ? <time dateTime={expires}>{t("github.result.expires", { values: { date: expires } })}</time> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ArtifactDownload({
  api,
  payload,
}: {
  api: ToolCallApi;
  payload: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const seconds = asNumber(payload.expiresInSeconds);
  const expiration = seconds === null
    ? t("github.value.empty")
    : t("github.result.downloadExpires", { values: { seconds } });
  return (
    <div className="gh-write">
      <div className="gh-write-head">
        <span className="gh-write-symbol gh-badge--ok"><HostIcon api={api} name="Package" size={14} /></span>
        <span className="gh-write-title">
          {t("github.result.artifact")} #{asNumber(payload.artifactId) ?? ""}
        </span>
        <OpenButton
          api={api}
          url={asText(payload.downloadUrl)}
          label={t("github.action.downloadArtifact")}
          title={expiration}
          className="gh-link gh-write-link gh-open-link"
        />
      </div>
      <p className="gh-write-warning">{expiration}</p>
    </div>
  );
}
