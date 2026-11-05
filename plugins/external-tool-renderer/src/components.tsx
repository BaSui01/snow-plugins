import { React } from "./runtime";
import { useApi, AlertCircle } from "./api";
import {
  PAGE_SIZE,
  TEXT_PAGE_SIZE,
  BINARY,
  HIDDEN,
  hiddenKey,
  isRecord,
  preview,
  safeText,
  safeUrl,
} from "./mcp";
import { orderedArgumentKeys } from "./summaries";

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const isoStamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export const shortStamp = (text: string): string =>
  isoStamp.test(text) ? text.slice(0, 16).replace("T", " ") : text;

export function Pager({
  total,
  page,
  onPage,
  size = PAGE_SIZE,
}: {
  total: number;
  page: number;
  onPage: (page: number) => void;
  size?: number;
}) {
  const { t } = useApi();
  if (total <= size) return null;
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return (
    <div className="mcp-pager">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onPage(Math.max(0, page - 1))}
      >
        {t("toolCall.mcp.previous")}
      </button>
      <span>
        {t("toolCall.mcp.range", {
          values: {
            start: page * size + 1,
            end: Math.min(total, (page + 1) * size),
            total,
          },
        })}
      </span>
      <button
        type="button"
        disabled={page >= last}
        onClick={() => onPage(Math.min(last, page + 1))}
      >
        {t("toolCall.mcp.next")}
      </button>
    </div>
  );
}

export function SafeLink({ value, label }: { value: unknown; label?: string }) {
  const api = useApi();
  const url = safeUrl(value);
  if (!url) return null;
  return (
    <button
      className="mcp-link"
      type="button"
      title={url}
      onClick={() => api.links.open(url, "browser")}
    >
      {safeText(label || url).slice(0, 180)}
    </button>
  );
}

export function TextValue({ value }: { value: string }) {
  const { t } = useApi();
  const text = React.useMemo(() => safeText(value), [value]);
  const [expanded, setExpanded] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  const page = Math.min(
    requested,
    Math.max(0, Math.ceil(text.length / TEXT_PAGE_SIZE) - 1),
  );
  return (
    <div className="mcp-text">
      <pre>
        {expanded
          ? text.slice(page * TEXT_PAGE_SIZE, (page + 1) * TEXT_PAGE_SIZE)
          : text.slice(0, 600)}
      </pre>
      {text.length > 600 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? "toolCall.mcp.collapse" : "toolCall.mcp.fullText")} ·{" "}
          {text.length}
        </button>
      )}
      {expanded && (
        <Pager
          total={text.length}
          page={page}
          size={TEXT_PAGE_SIZE}
          onPage={setPage}
        />
      )}
      <SafeLink value={value} />
    </div>
  );
}

export function Value({
  value,
  field = "",
  parameters = false,
  depth = 0,
}: {
  value: unknown;
  field?: string;
  parameters?: boolean;
  depth?: number;
}) {
  const { t } = useApi();
  const [open, setOpen] = React.useState(false);
  const [continueDeep, setContinueDeep] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  if (hiddenKey(field, parameters))
    return <code className="mcp-muted">{t("toolCall.mcp.redacted")}</code>;
  if (
    field === "blob" ||
    field === "base64" ||
    (field === "data" &&
      typeof value === "string" &&
      value.length > 128 &&
      /^[a-z0-9+/]+=*$/i.test(value))
  )
    return <code className="mcp-muted">{BINARY}</code>;
  if (typeof value === "string") return <TextValue value={value} />;
  if (!Array.isArray(value) && !isRecord(value))
    return <code>{String(value)}</code>;
  const keys = Array.isArray(value) ? null : Object.keys(value);
  const total = keys ? keys.length : (value as unknown[]).length;
  const page = Math.min(
    requested,
    Math.max(0, Math.ceil(total / PAGE_SIZE) - 1),
  );
  const start = page * PAGE_SIZE;
  return (
    <div className="mcp-tree">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {Array.isArray(value) ? "[ ]" : "{ }"} · {total}{" "}
        {t("toolCall.mcp.items")}
      </button>
      {open && depth >= 32 && (
        <div>
          <button
            type="button"
            aria-expanded={continueDeep}
            onClick={() => setContinueDeep(!continueDeep)}
          >
            {t("toolCall.mcp.continueDepth")}
          </button>
          {continueDeep && (
            <Value value={value} field={field} parameters={parameters} />
          )}
        </div>
      )}
      {open && depth < 32 && (
        <>
          <div className="mcp-fields">
            {Array.from(
              { length: Math.min(PAGE_SIZE, total - start) },
              (_, offset) => {
                const index = start + offset;
                const key = keys ? keys[index] : String(index);
                const child = keys
                  ? (value as Record<string, unknown>)[key]
                  : (value as unknown[])[index];
                return (
                  <div className="mcp-field" key={key}>
                    <span className="mcp-key">{safeText(key).slice(0, 100)}</span>
                    <Value
                      value={child}
                      field={key}
                      parameters={parameters}
                      depth={depth + 1}
                    />
                  </div>
                );
              },
            )}
          </div>
          <Pager total={total} page={page} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export function ParamValue({
  field,
  value,
}: {
  field: string;
  value: unknown;
}) {
  const api = useApi();
  const { t } = api;
  if (hiddenKey(field, true))
    return <span className="mcp-muted">{t("toolCall.mcp.redacted")}</span>;
  if (typeof value === "string") {
    const url = safeUrl(value);
    if (url)
      return (
        <button
          type="button"
          className="mcp-param-link"
          title={url}
          onClick={() => api.links.open(url, "browser")}
        >
          {safeText(value).slice(0, 140)}
        </button>
      );
    if (!value) return <span className="mcp-muted">—</span>;
    const text =
      field.endsWith("_at") || field === "date" ? shortStamp(value) : value;
    return (
      <span className="mcp-param-text" title={value}>
        {safeText(text).slice(0, 400)}
      </span>
    );
  }
  if (typeof value === "number" || typeof value === "boolean")
    return <code className="mcp-param-code">{String(value)}</code>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="mcp-muted">—</span>;
    const flat = value.every(
      (item) =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    );
    return (
      <div className="mcp-param-group">
        <span className="mcp-param-count">[{value.length}]</span>
        {flat && (
          <span className="mcp-param-chips">
            {value.slice(0, 6).map((item, index) => (
              <code key={index}>{safeText(String(item)).slice(0, 80)}</code>
            ))}
            {value.length > 6 && (
              <span className="mcp-param-more">+{value.length - 6}</span>
            )}
          </span>
        )}
        {!flat && (
          <details className="mcp-param-details">
            <summary>{t("toolCall.mcp.details")}</summary>
            <Value value={value} field={field} parameters />
          </details>
        )}
      </div>
    );
  }
  if (isRecord(value)) {
    const size = Object.keys(value).length;
    if (!size) return <span className="mcp-muted">—</span>;
    return (
      <div className="mcp-param-group">
        <span className="mcp-param-count">{`{${size}}`}</span>
        <details className="mcp-param-details">
          <summary>{t("toolCall.mcp.details")}</summary>
          <Value value={value} field={field} parameters />
        </details>
      </div>
    );
  }
  return <Value value={value} field={field} parameters />;
}

export function ParamTable({
  providerId,
  args,
}: {
  providerId: string;
  args: Record<string, unknown>;
}) {
  const { t } = useApi();
  const keys = React.useMemo(
    () => orderedArgumentKeys(providerId, args),
    [providerId, args],
  );
  return (
    <dl className="mcp-params">
      {keys.map((key) => (
        <div className="mcp-param" key={key}>
          <dt>{t(`toolCall.field.${key}`, { defaultValue: key })}</dt>
          <dd>
            <ParamValue field={key} value={args[key]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const checkpointLine = /^\s*\[checkpoint\]\s*/;

export function OutputSection({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const lines = React.useMemo(
    () =>
      safeText(value)
        .split(/\r?\n/)
        .filter((line) => line.trim() !== ""),
    [value],
  );
  if (lines.length > 0 && lines.every((line) => checkpointLine.test(line))) {
    return (
      <div className="mcp-notice-list">
        {lines.map((line, index) => (
          <div className="mcp-notice" key={index}>
            <AlertCircle size={12} />
            <span>{line.replace(checkpointLine, "")}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className="mcp-output">
      <h4>{label}</h4>
      <TextValue value={value} />
    </section>
  );
}
