import { React, useState } from "../runtime";
import type { ToolCallApi } from "../types";
import { asNumber, asText, isRecord } from "../parsing";
import { HostIcon, OpenButton } from "../presentation";

function PackageItem({
  api,
  manifest,
  detailed = false,
}: {
  api: ToolCallApi;
  manifest: Record<string, unknown>;
  detailed?: boolean;
}): React.JSX.Element {
  const { t } = api;
  const id = asNumber(manifest.id);
  const name = asText(manifest.name);
  const packageType = asText(manifest.package_type);
  const owner = isRecord(manifest.owner) ? asText(manifest.owner.login) : "";
  const versions = asNumber(manifest.version_count);
  const visibility = asText(manifest.visibility);
  const created = asText(manifest.created_at);
  const updated = asText(manifest.updated_at);
  return (
    <article
      className={`gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}`}
    >
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(manifest.html_url)}
          title={name}
          label={
            <span className="gh-issue-title">
              <HostIcon api={api} name="Package" />
              <span>{name || t("github.result.package")}</span>
            </span>
          }
          className="gh-link gh-link--strong"
        />
      </div>
      <div className="gh-meta-row">
        {packageType ? (
          <span className="gh-tag gh-tag--muted">{packageType}</span>
        ) : null}
        {visibility ? (
          <span className="gh-tag">
            {t("github.result.visibility")}:{" "}
            {t(`github.state.${visibility}`, { defaultValue: visibility })}
          </span>
        ) : null}
        {versions !== null ? (
          <span className="gh-tag">
            {t("github.result.versionCount")}: {versions}
          </span>
        ) : null}
        {owner ? (
          <span className="gh-tag">
            {t("github.field.owner")}: {owner}
          </span>
        ) : null}
        {detailed && id !== null ? (
          <span className="gh-tag gh-tag--muted">#{id}</span>
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

export function PackageList({
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
      {visible.map((manifest, index) => (
        <PackageItem
          api={api}
          manifest={manifest}
          key={`${asNumber(manifest.id) ?? index}`}
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

export function PackageDetails({
  api,
  manifest,
}: {
  api: ToolCallApi;
  manifest: Record<string, unknown>;
}): React.JSX.Element {
  return <PackageItem api={api} manifest={manifest} detailed />;
}
