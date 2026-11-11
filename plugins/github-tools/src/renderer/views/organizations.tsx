import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord, safeUrl } from "../parsing";
import { HostIcon, OpenButton, truncate } from "../presentation";

export function OrganizationDetails({
  api,
  organization,
}: {
  api: ToolCallApi;
  organization: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const login = asText(organization.login);
  const name = asText(organization.name);
  const description = asText(organization.description);
  const type = asText(organization.type);
  const company = asText(organization.company);
  const location = asText(organization.location);
  const email = asText(organization.email);
  const twitter = asText(organization.twitter_username);
  const blog = asText(organization.blog);
  const blogUrl = safeUrl(blog);
  const repos = asNumber(organization.public_repos);
  const gists = asNumber(organization.public_gists);
  const followers = asNumber(organization.followers);
  const created = asText(organization.created_at);
  const updated = asText(organization.updated_at);
  return (
    <article className="gh-item gh-issue-item">
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(organization.html_url)}
          title={name || login}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="Building2" />
              <span>{name || login || t("github.result.organization")}</span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
        <span className="gh-state-row">
          {type ? <span className="gh-tag gh-tag--muted">{type}</span> : null}
          {organization.is_verified === true ? (
            <span className="gh-tag">{t("github.result.verified")}</span>
          ) : null}
        </span>
      </div>
      {description ? <p className="gh-desc">{description}</p> : null}
      <div className="gh-meta-row">
        {repos !== null ? (
          <span className="gh-tag">
            {t("github.result.repos")}: {repos}
          </span>
        ) : null}
        {gists !== null ? (
          <span className="gh-tag">
            {t("github.result.gists")}: {gists}
          </span>
        ) : null}
        {followers !== null ? (
          <span className="gh-tag">
            {t("github.result.followers")}: {followers}
          </span>
        ) : null}
        {company ? (
          <span className="gh-tag">
            {t("github.result.company")}: {company}
          </span>
        ) : null}
        {location ? (
          <span className="gh-tag">
            {t("github.result.location")}: {location}
          </span>
        ) : null}
        {email ? (
          <span className="gh-tag">
            {t("github.result.email")}: {email}
          </span>
        ) : null}
        {twitter ? <span className="gh-tag">@{twitter}</span> : null}
        {blogUrl ? (
          <span className="gh-tag">
            {t("github.result.blog")}:{" "}
            <OpenButton
              api={api}
              url={blogUrl}
              label={blogUrl.replace(/^https?:\/\//, "")}
              className="gh-link"
            />
          </span>
        ) : blog ? (
          <span className="gh-tag">
            {t("github.result.blog")}: {blog}
          </span>
        ) : null}
      </div>
      <div className="gh-item-foot">
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

function TeamItem({
  api,
  team,
  detailed = false,
}: {
  api: ToolCallApi;
  team: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const name = asText(team.name);
  const slug = asText(team.slug);
  const description = asText(team.description);
  const privacy = asText(team.privacy);
  const permission = asText(team.permission);
  const notificationSetting = asText(team.notification_setting);
  const members = asNumber(team.members_count);
  const repos = asNumber(team.repos_count);
  const organization = isRecord(team.organization)
    ? asText(team.organization.login)
    : "";
  const parent = isRecord(team.parent)
    ? asText(team.parent.name) || asText(team.parent.slug)
    : "";
  const created = asText(team.created_at);
  const updated = asText(team.updated_at);
  return (
    <article
      className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}
    >
      <div className="gh-item-head">
        <span className="gh-issue-title">
          <HostIcon api={api} name="Users" />
          <span>{name || slug || t("github.result.team")}</span>
        </span>
        <span className="gh-state-row">
          {slug ? <span className="gh-tag gh-tag--muted">{slug}</span> : null}
        </span>
      </div>
      {description ? (
        <p className="gh-desc">{truncate(description, 180)}</p>
      ) : null}
      <div className="gh-meta-row">
        {privacy ? (
          <span className="gh-tag">
            {t("github.result.privacy")}: {privacy}
          </span>
        ) : null}
        {permission ? (
          <span className="gh-tag">
            {t("github.result.permission")}: {permission}
          </span>
        ) : null}
        {members !== null ? (
          <span className="gh-tag">
            {t("github.result.members")}: {members}
          </span>
        ) : null}
        {repos !== null ? (
          <span className="gh-tag">
            {t("github.result.repos")}: {repos}
          </span>
        ) : null}
        {detailed && notificationSetting ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.notificationSetting")}: {notificationSetting}
          </span>
        ) : null}
        {detailed && organization ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.organization")}: {organization}
          </span>
        ) : null}
        {detailed && parent ? (
          <span className="gh-tag gh-tag--muted">
            {t("github.result.parentTeam")}: {parent}
          </span>
        ) : null}
      </div>
      <div className="gh-item-foot">
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

export function TeamList({
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
      {visible.map((team, index) => (
        <TeamItem
          api={api}
          team={team}
          key={`${asText(team.slug) || asNumber(team.id) || index}`}
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

export function TeamDetails({
  api,
  team,
}: {
  api: ToolCallApi;
  team: Record<string, unknown>;
}): React.JSX.Element {
  return <TeamItem api={api} team={team} detailed />;
}
