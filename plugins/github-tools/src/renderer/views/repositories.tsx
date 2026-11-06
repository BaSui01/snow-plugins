import { React, useMemo, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord, safeUrl } from "../parsing";
import { HostIcon, OpenButton, truncate } from "../presentation";

export { RepoList, RepoDetails };

function RepoStats({
  api,
  repo,
}: {
  api: ToolCallApi;
  repo: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const stats = [
    { icon: "Star", value: asNumber(repo.stargazers_count), label: t("github.result.stars") },
    { icon: "GitFork", value: asNumber(repo.forks_count), label: t("github.result.forks") },
    { icon: "CircleDot", value: asNumber(repo.open_issues_count), label: t("github.result.issues") },
  ];
  return (
    <div className="gh-stats">
      {stats.map(({ icon, value, label }) =>
        value !== null ? (
          <span className="gh-stat" key={icon} title={label} aria-label={`${label}: ${value}`}>
            <HostIcon api={api} name={icon} size={11} />
            {value.toLocaleString()}
          </span>
        ) : null,
      )}
    </div>
  );
}

function Tags({ values }: { values: unknown }): React.JSX.Element | null {
  const tags = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string")
    : [];
  if (!tags.length) return null;
  return (
    <div className="gh-tags">
      {tags.slice(0, 6).map((tag) => (
        <span className="gh-tag" key={tag}>
          {tag}
        </span>
      ))}
      {tags.length > 6 ? (
        <span className="gh-tag gh-tag--muted">+{tags.length - 6}</span>
      ) : null}
    </div>
  );
}

function RepoList({
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
      {visible.map((repo, index) => {
        const fullName =
          asText(repo.full_name) || asText(repo.name) || `#${index + 1}`;
        const description = asText(repo.description);
        const language = asText(repo.language);
        return (
          <article className="gh-item" key={`${fullName}-${index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(repo.html_url)}
                label={fullName}
                className="gh-link gh-link--strong"
              />
              <RepoStats api={api} repo={repo} />
            </div>
            {description ? (
              <p className="gh-desc">{truncate(description, 220)}</p>
            ) : null}
            <div className="gh-meta-row">
              {language ? <span className="gh-tag gh-language">{language}</span> : null}
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

function RepoDetails({
  api,
  repo,
}: {
  api: ToolCallApi;
  repo: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const description = asText(repo.description);
  const license = isRecord(repo.license)
    ? asText(repo.license.spdx_id) || asText(repo.license.name)
    : "";
  const homepage = safeUrl(repo.homepage);
  const fullName =
    asText(repo.full_name) ||
    [asText(repo.owner && isRecord(repo.owner) ? repo.owner.login : ""), asText(repo.name)]
      .filter(Boolean)
      .join("/");
  return (
    <div className="gh-repo">
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(repo.html_url)}
          label={fullName || t("github.result.repository")}
          className="gh-link gh-link--strong"
        />
        <RepoStats api={api} repo={repo} />
      </div>
      {description ? <p className="gh-desc">{description}</p> : null}
      <div className="gh-meta-row">
        {repo.private === true ? (
          <span className="gh-tag">{t("github.state.private")}</span>
        ) : null}
        {repo.archived === true ? (
          <span className="gh-tag gh-tag--muted">{t("github.state.archived")}</span>
        ) : null}
        {asText(repo.language) ? (
          <span className="gh-tag gh-language">{asText(repo.language)}</span>
        ) : null}
        {license ? <span className="gh-tag">{license}</span> : null}
        {asText(repo.default_branch) ? (
          <span className="gh-tag">
            {t("github.field.defaultBranch")}: {asText(repo.default_branch)}
          </span>
        ) : null}
        {homepage ? (
          <OpenButton
            api={api}
            url={homepage}
            label={homepage.replace(/^https?:\/\//, "")}
            className="gh-link"
          />
        ) : null}
      </div>
      <Tags values={repo.topics} />
      {asText(repo.updated_at) ? (
        <div className="gh-hint gh-updated">
          <HostIcon api={api} name="Clock" />
          {t("github.result.updated", {
            values: { date: asText(repo.updated_at).slice(0, 10) },
          })}
        </div>
      ) : null}
    </div>
  );
}