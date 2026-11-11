import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { HostIcon, OpenButton, truncate } from "../presentation";

function StateTag({
  api,
  value,
}: {
  api: ToolCallApi;
  value: unknown;
}): React.JSX.Element | null {
  const text = asText(value);
  if (!text) return null;
  return (
    <span className="gh-tag gh-tag--muted">
      {api.t(`github.state.${text}`, { defaultValue: text })}
    </span>
  );
}

function DeploymentItem({
  api,
  deployment,
  detailed = false,
}: {
  api: ToolCallApi;
  deployment: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const id = asNumber(deployment.id);
  const environment = asText(deployment.environment);
  const task = asText(deployment.task);
  const ref = asText(deployment.ref);
  const sha = asText(deployment.sha);
  const description = asText(deployment.description);
  const creator = isRecord(deployment.creator)
    ? asText(deployment.creator.login)
    : "";
  const created = asText(deployment.created_at);
  const updated = asText(deployment.updated_at);
  const payload = deployment.payload;
  return (
    <article
      className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}
    >
      <div className="gh-item-head">
        <span className="gh-issue-title">
          <HostIcon api={api} name="Rocket" />
          {id !== null ? (
            <span className="gh-issue-number">#{id}</span>
          ) : null}
          <span>{t("github.result.deployment")}</span>
        </span>
        <span className="gh-state-row">
          {deployment.production_environment === true ? (
            <span className="gh-tag">{t("github.result.production")}</span>
          ) : null}
          {deployment.transient_environment === true ? (
            <span className="gh-tag gh-tag--muted">
              {t("github.result.transient")}
            </span>
          ) : null}
        </span>
      </div>
      {description ? <p className="gh-desc">{description}</p> : null}
      <div className="gh-meta-row">
        {environment ? (
          <span className="gh-tag">
            {t("github.result.environment")}: {environment}
          </span>
        ) : null}
        {task ? (
          <span className="gh-tag">
            {t("github.result.task")}: {task}
          </span>
        ) : null}
        {ref ? (
          <span className="gh-tag">
            <HostIcon api={api} name="GitBranch" />
            {ref}
          </span>
        ) : null}
      </div>
      {sha ? (
        <div className="gh-branch-flow">
          <HostIcon api={api} name="GitBranch" />
          <code title={sha}>{sha.slice(0, 10)}</code>
        </div>
      ) : null}
      {detailed && payload !== undefined && payload !== null ? (
        <details className="gh-raw">
          <summary>{t("github.result.payload")}</summary>
          <pre>{JSON.stringify(payload, null, 2)}</pre>
        </details>
      ) : null}
      <div className="gh-item-foot">
        {creator ? (
          <span title={t("github.field.author")}>
            <HostIcon api={api} name="User" />
            {creator}
          </span>
        ) : null}
        {created ? (
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

export function DeploymentList({
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
      {visible.map((deployment, index) => (
        <DeploymentItem
          api={api}
          deployment={deployment}
          key={`${asNumber(deployment.id) ?? index}`}
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

export function DeploymentDetails({
  api,
  deployment,
}: {
  api: ToolCallApi;
  deployment: Record<string, unknown>;
}): React.JSX.Element {
  return <DeploymentItem api={api} deployment={deployment} detailed />;
}

function CheckRunItem({
  api,
  checkRun,
  detailed = false,
}: {
  api: ToolCallApi;
  checkRun: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const id = asNumber(checkRun.id);
  const name = asText(checkRun.name);
  const headSha = asText(checkRun.head_sha);
  const app = isRecord(checkRun.app) ? asText(checkRun.app.slug) : "";
  const checkSuite = isRecord(checkRun.check_suite)
    ? asNumber(checkRun.check_suite.id)
    : null;
  const output = isRecord(checkRun.output) ? checkRun.output : {};
  const outputTitle = asText(output.title);
  const summary = asText(output.summary);
  const text = asText(output.text);
  const annotations = asNumber(output.annotations_count);
  const started = asText(checkRun.started_at);
  const completed = asText(checkRun.completed_at);
  const detailsUrl = asText(checkRun.details_url);
  return (
    <article
      className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}
    >
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(checkRun.html_url)}
          title={name}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="CircleCheck" />
              {id !== null ? (
                <span className="gh-issue-number">#{id}</span>
              ) : null}
              <span>{name || t("github.result.checkRun")}</span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <span className="gh-state-row">
          <StateTag api={api} value={checkRun.status} />
          <StateTag api={api} value={checkRun.conclusion} />
        </span>
      </div>
      <div className="gh-meta-row">
        {outputTitle ? (
          <span className="gh-tag">{truncate(outputTitle, 120)}</span>
        ) : null}
        {app ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.app")}: {app}
          </span>
        ) : null}
        {checkSuite !== null ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.checkSuite")}: {checkSuite}
          </span>
        ) : null}
        {annotations !== null ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.annotations")}: {annotations}
          </span>
        ) : null}
        {detailed && detailsUrl ? (
          <OpenButton
            api={api}
            url={detailsUrl}
            label={t("github.action.open")}
            className="gh-link"
          />
        ) : null}
      </div>
      {headSha ? (
        <div className="gh-branch-flow">
          <HostIcon api={api} name="GitBranch" />
          <code title={headSha}>{headSha.slice(0, 10)}</code>
        </div>
      ) : null}
      {detailed && summary ? (
        <pre className="gh-comment-body">{summary}</pre>
      ) : null}
      {detailed && text ? (
        <details className="gh-raw">
          <summary>{t("github.result.output")}</summary>
          <pre>{text}</pre>
        </details>
      ) : null}
      <div className="gh-item-foot">
        {started ? (
          <time dateTime={started}>
            {t("github.result.started", { values: { date: started } })}
          </time>
        ) : null}
        {completed ? (
          <time dateTime={completed}>
            {t("github.result.completed", { values: { date: completed } })}
          </time>
        ) : null}
      </div>
    </article>
  );
}

export function CheckRunList({
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
      {visible.map((checkRun, index) => (
        <CheckRunItem
          api={api}
          checkRun={checkRun}
          key={`${asNumber(checkRun.id) ?? index}`}
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

export function CheckRunDetails({
  api,
  checkRun,
}: {
  api: ToolCallApi;
  checkRun: Record<string, unknown>;
}): React.JSX.Element {
  return <CheckRunItem api={api} checkRun={checkRun} detailed />;
}
