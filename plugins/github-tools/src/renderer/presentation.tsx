import { React, useState } from "./runtime";
import type { ToolCallApi, Translate } from "./types";
import { TOOL_FIELDS } from "./config";
import type { ToolKind, Args, Payload } from "./config";
import { safeUrl, isRecord, asNumber } from "./parsing";

export { HostIcon, OpenButton, SectionTitle, Params, RawBlock, CopyButton, Pagination, truncate };

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

function CopyButton({
  t,
  value,
  label,
}: {
  t: Translate;
  value: string;
  label?: string;
}): React.JSX.Element {
  const [outcome, setOutcome] = useState<"idle" | "copied" | "error">("idle");
  const text =
    outcome === "copied"
      ? t("github.action.copied")
      : outcome === "error"
        ? t("github.action.copyFailed")
        : (label ?? t("github.action.copy"));
  return (
    <button
      type="button"
      className={`gh-copy${outcome === "error" ? " gh-copy--error" : ""}`}
      title={text}
      aria-label={text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOutcome("copied");
        } catch {
          setOutcome("error");
        }
      }}
    >
      <span aria-live="polite">{text}</span>
    </button>
  );
}

function HostIcon({
  api,
  name,
  size = 12,
}: {
  api: ToolCallApi;
  name: string;
  size?: number;
}): React.JSX.Element | null {
  const Icon = api.ui.icon(name) as
    | React.ComponentType<{ size?: number; className?: string }>
    | undefined;
  return Icon ? <Icon size={size} className="gh-icon" /> : null;
}

function OpenButton({
  api,
  url,
  label,
  title,
  className = "gh-link",
}: {
  api: ToolCallApi;
  url: string;
  label: React.ReactNode;
  title?: string;
  className?: string;
}): React.JSX.Element {
  const safe = safeUrl(url);
  if (!safe) return <span className={className}>{label}</span>;
  return (
    <button
      type="button"
      className={className}
      title={title ?? safe}
      onClick={() => api.links.open(safe, "browser")}
    >
      {label}
    </button>
  );
}

function SectionTitle({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="gh-section-title">
      <span>{children}</span>
    </div>
  );
}

function Params({
  t,
  kind,
  args,
}: {
  t: Translate;
  kind: ToolKind;
  args: Args;
}): React.JSX.Element | null {
  const fields = TOOL_FIELDS[kind].filter((field) => args[field] !== undefined);
  if (!fields.length) return null;
  return (
    <dl className="gh-params">
      {fields.map((field) => {
        const value = args[field];
        const label = t(`github.field.${field}`, { defaultValue: field });
        const state = (field === "state" || field === "status") && typeof value === "string";
        const text = state
          ? t(`github.state.${String(value)}`, { defaultValue: String(value) })
          : field === "event" && typeof value === "string"
            ? t(`github.event.${value}`, { defaultValue: value })
            : field === "mergeMethod" && typeof value === "string"
              ? t(`github.mergeMethod.${value}`, { defaultValue: value })
              : typeof value === "boolean"
                ? t(value ? "github.value.yes" : "github.value.no")
                : Array.isArray(value)
                  ? value.filter((item): item is string => typeof item === "string").join(", ") || t("github.value.empty")
                  : typeof value === "string" || typeof value === "number"
                    ? String(value)
                    : "";
        return (
          <div className="gh-param" key={field}>
            <dt>{label}</dt>
            <dd>
              {state ? (
                <span className={`gh-state gh-state--${String(value)}`}>{text}</span>
              ) : (
                <code className="gh-param-value" title={text}>
                  {truncate(text, 160)}
                </code>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
function Pagination({
  t,
  payload,
}: {
  t: Translate;
  payload: Record<string, unknown>;
}): React.JSX.Element | null {
  if (!isRecord(payload.pagination)) return null;
  const page = asNumber(payload.pagination.page);
  const perPage = asNumber(payload.pagination.perPage);
  if (page === null || perPage === null) return null;
  const hasNext = payload.pagination.hasNextPage === true;
  return (
    <div className="gh-hint gh-pagination">
      <span>{t("github.pagination.page", { values: { page } })}</span>
      <span>{t("github.pagination.perPage", { values: { count: perPage } })}</span>
      <span>{t(hasNext ? "github.pagination.hasNext" : "github.pagination.noNext")}</span>
    </div>
  );
}

function RawBlock({
  t,
  payload,
}: {
  t: Translate;
  payload: Payload;
}): React.JSX.Element {
  return (
    <details className="gh-raw">
      <summary>{t("github.result.raw")}</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}