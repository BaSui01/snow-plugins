import { React, useMemo, useState } from "./runtime";
import type {
  ToolCallApi,
  ToolCallContext,
  ToolCallInfo,
  ToolCategory,
  Translate,
} from "./types";
import {
  asNumber,
  asText,
  errorText,
  isErrorEnvelope,
  isRecord,
  parseArgs,
  parseJson,
  records,
  strings,
  unwrapResult,
} from "./parsing";

type Kind =
  | "containers_list"
  | "container_inspect"
  | "container_logs"
  | "container_stats"
  | "container_start"
  | "container_stop"
  | "container_restart"
  | "container_remove"
  | "container_exec"
  | "images_list"
  | "image_pull"
  | "compose_status"
  | "compose_control"
  | "system_info";

const KINDS: Record<string, Kind> = {
  containers_list: "containers_list",
  container_inspect: "container_inspect",
  container_logs: "container_logs",
  container_stats: "container_stats",
  container_start: "container_start",
  container_stop: "container_stop",
  container_restart: "container_restart",
  container_remove: "container_remove",
  container_exec: "container_exec",
  images_list: "images_list",
  image_pull: "image_pull",
  compose_status: "compose_status",
  compose_control: "compose_control",
  system_info: "system_info",
};

const CATEGORIES: Record<Kind, ToolCategory> = {
  containers_list: "read",
  container_inspect: "read",
  container_logs: "read",
  container_stats: "read",
  container_start: "terminal",
  container_stop: "terminal",
  container_restart: "terminal",
  container_remove: "terminal",
  container_exec: "terminal",
  images_list: "read",
  image_pull: "web",
  compose_status: "read",
  compose_control: "terminal",
  system_info: "read",
};

const FIELDS: Record<Kind, string[]> = {
  containers_list: ["all", "status", "name", "limit"],
  container_inspect: ["container", "includeEnv"],
  container_logs: ["container", "tail", "since", "timestamps"],
  container_stats: ["container"],
  container_start: ["container"],
  container_stop: ["container", "timeoutSecs"],
  container_restart: ["container", "timeoutSecs"],
  container_remove: ["container", "force", "volumes"],
  container_exec: ["container", "command", "workdir", "user", "timeoutMs"],
  images_list: ["all", "dangling", "reference", "limit"],
  image_pull: ["image", "platform"],
  compose_status: ["action", "projectDir", "files", "services", "tail"],
  compose_control: ["action", "projectDir", "files", "services", "build", "removeVolumes", "timeoutSecs"],
  system_info: [],
};

const DISK_TYPE_KEYS: Record<string, string> = {
  Images: "docker.disk.images",
  Containers: "docker.disk.containers",
  "Local Volumes": "docker.disk.volumes",
  "Build Cache": "docker.disk.buildCache",
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

const baseName = (value: string): string => {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? value;
};

const field = (payload: unknown, key: string): unknown =>
  isRecord(payload) ? payload[key] : undefined;

const countOf = (payload: unknown): number | null => {
  if (!isRecord(payload)) return null;
  const direct = asNumber(payload.count);
  if (direct !== null) return direct;
  for (const key of ["containers", "images", "services", "stats", "diskUsage"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.length;
  }
  return null;
};

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

const percentOf = (value: string): number | null => {
  const match = /([\d.]+)\s*%/.exec(value);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) ? clampPercent(parsed) : null;
};

const shortId = (value: string): string =>
  value.replace(/^sha256:/, "").slice(0, 12);

const splitPorts = (value: string): string[] =>
  value.split(/,\s*/).filter((item) => item.trim() !== "");

const stateClass = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";

function summarize(t: Translate, kind: Kind, args: Record<string, unknown>): string {
  const container = asText(args.container);
  const image = asText(args.image);
  const project = asText(args.projectDir);
  const action = asText(args.action);
  const actionLabel = action ? t(`docker.action.${action}`, { defaultValue: action }) : "";

  switch (kind) {
    case "containers_list": {
      const name = asText(args.name);
      if (name) return t("docker.summary.filteredContainers", { values: { name } });
      return t(args.all === true ? "docker.summary.allContainers" : "docker.summary.runningContainers");
    }
    case "container_inspect":
      return t("docker.summary.inspect", { values: { container } });
    case "container_logs":
      return t("docker.summary.logs", { values: { container } });
    case "container_stats":
      return container
        ? t("docker.summary.stats", { values: { container } })
        : t("docker.summary.allStats");
    case "container_start":
      return t("docker.summary.start", { values: { container } });
    case "container_stop":
      return t("docker.summary.stop", { values: { container } });
    case "container_restart":
      return t("docker.summary.restart", { values: { container } });
    case "container_remove":
      return t("docker.summary.remove", { values: { container } });
    case "container_exec":
      return t("docker.summary.exec", { values: { container } });
    case "images_list": {
      const reference = asText(args.reference);
      return reference
        ? t("docker.summary.filteredImages", { values: { reference } })
        : t("docker.summary.images");
    }
    case "image_pull":
      return t("docker.summary.pull", { values: { image } });
    case "compose_status":
      return t("docker.summary.composeStatus", {
        values: { action: actionLabel || t("docker.action.ps"), project: baseName(project) },
      });
    case "compose_control":
      return t("docker.summary.composeControl", {
        values: { action: actionLabel || t("docker.action.up"), project: baseName(project) },
      });
    case "system_info":
      return t("docker.summary.system");
  }
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
  return Icon ? <Icon size={size} className="dk-icon" /> : null;
}

function SectionTitle({
  api,
  icon,
  children,
}: {
  api: ToolCallApi;
  icon?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="dk-section-title">
      {icon ? <HostIcon api={api} name={icon} size={11} /> : null}
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
  kind: Kind;
  args: Record<string, unknown>;
}): React.JSX.Element | null {
  const fields = FIELDS[kind].filter((name) => args[name] !== undefined);
  if (fields.length === 0) return null;

  return (
    <dl className="dk-params">
      {fields.map((name) => {
        const value = args[name];
        const label = t(`docker.field.${name}`, { defaultValue: name });
        const text =
          typeof value === "boolean"
            ? t(value ? "docker.value.yes" : "docker.value.no")
            : Array.isArray(value)
              ? value.map((item) => String(item)).join(", ")
              : typeof value === "string" || typeof value === "number"
                ? String(value)
                : "";
        return (
          <div className="dk-param" key={name}>
            <dt>{label}</dt>
            <dd>
              <code className="dk-param-value" title={text}>
                {truncate(text || t("docker.value.empty"), 160)}
              </code>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function StateBadge({ t, state }: { t: Translate; state: string }): React.JSX.Element {
  const normalized = state.trim().toLowerCase();
  const label = t(`docker.state.${normalized}`, { defaultValue: state });
  return (
    <span className={`dk-state dk-state--${stateClass(normalized)}`}>
      <span className="dk-state-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function CopyButton({ t, value }: { t: Translate; value: string }): React.JSX.Element {
  const [outcome, setOutcome] = useState<"idle" | "copied" | "error">("idle");
  const label =
    outcome === "copied"
      ? t("docker.action.copied")
      : outcome === "error"
        ? t("docker.action.copyFailed")
        : t("docker.action.copy");
  return (
    <button
      type="button"
      className={`dk-copy${outcome === "error" ? " dk-copy--error" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOutcome("copied");
        } catch {
          setOutcome("error");
        }
      }}
    >
      {label}
    </button>
  );
}

function CodePanel({
  t,
  label,
  value,
  tone,
}: {
  t: Translate;
  label: string;
  value: string;
  tone?: "error";
}): React.JSX.Element | null {
  if (!value) return null;
  return (
    <div className={`dk-panel${tone === "error" ? " dk-panel--error" : ""}`}>
      <div className="dk-panel-head">
        <span className="dk-panel-label">{label}</span>
        <CopyButton t={t} value={value} />
      </div>
      <pre className="dk-code">{value}</pre>
    </div>
  );
}

function Meter({ value, tone }: { value: number; tone: "cpu" | "memory" | "disk" }): React.JSX.Element {
  return (
    <div className={`dk-meter dk-meter--${tone}`} aria-hidden="true">
      <span style={{ width: `${clampPercent(value)}%` }} />
    </div>
  );
}

function Empty({ api, t }: { api: ToolCallApi; t: Translate }): React.JSX.Element {
  return (
    <div className="dk-empty">
      <HostIcon api={api} name="Inbox" size={14} />
      <span>{t("docker.result.empty")}</span>
    </div>
  );
}

function Truncated({ t, payload }: { t: Translate; payload: unknown }): React.JSX.Element | null {
  if (!isRecord(payload) || payload.truncated !== true) return null;
  const total = asNumber(payload.total);
  const count = asNumber(payload.count);
  return (
    <div className="dk-hint">
      {total !== null && count !== null
        ? t("docker.result.truncated", { values: { shown: count, total } })
        : t("docker.result.truncatedSimple")}
    </div>
  );
}

function ContainerList({
  api,
  t,
  items,
}: {
  api: ToolCallApi;
  t: Translate;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  if (items.length === 0) return <Empty api={api} t={t} />;
  return (
    <div className="dk-list">
      {items.map((item, index) => {
        const name = asText(item.name) || asText(item.id) || `#${index + 1}`;
        const image = asText(item.image);
        const state = asText(item.state);
        const status = asText(item.status);
        const ports = asText(item.ports);
        const id = asText(item.id);
        return (
          <div className="dk-card" key={`${name}-${index}`}>
            <div className="dk-card-head">
              <div className="dk-card-title">
                <span className={`dk-dot dk-dot--${stateClass(state || "unknown")}`} aria-hidden="true" />
                <code className="dk-name">{name}</code>
                {id ? <span className="dk-id">{shortId(id)}</span> : null}
              </div>
              {state ? <StateBadge t={t} state={state} /> : null}
            </div>
            <div className="dk-card-sub">
              {image ? <span className="dk-image">{image}</span> : null}
              {status ? <span>{status}</span> : null}
            </div>
            {ports ? (
              <div className="dk-chips">
                {splitPorts(ports).map((port) => (
                  <code className="dk-chip" key={port}>
                    {port}
                  </code>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ImageList({
  api,
  t,
  items,
}: {
  api: ToolCallApi;
  t: Translate;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  if (items.length === 0) return <Empty api={api} t={t} />;
  return (
    <div className="dk-list">
      {items.map((item, index) => {
        const repository = asText(item.repository) || "<none>";
        const tag = asText(item.tag) || "<none>";
        const id = asText(item.id);
        const size = asText(item.size);
        const created = asText(item.createdAt);
        return (
          <div className="dk-card dk-card--compact" key={`${repository}:${tag}-${index}`}>
            <div className="dk-card-head">
              <div className="dk-card-title">
                <HostIcon api={api} name="Layers" size={13} />
                <code className="dk-name">{`${repository}:${tag}`}</code>
              </div>
              {size ? <span className="dk-chip">{size}</span> : null}
            </div>
            <div className="dk-card-sub">
              {id ? <span className="dk-id">{shortId(id)}</span> : null}
              {created ? <span>{created}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ServiceList({
  api,
  t,
  items,
}: {
  api: ToolCallApi;
  t: Translate;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  if (items.length === 0) return <Empty api={api} t={t} />;
  return (
    <div className="dk-list">
      {items.map((item, index) => {
        const name = asText(item.name) || asText(item.service) || `#${index + 1}`;
        const service = asText(item.service);
        const state = asText(item.state);
        const status = asText(item.status);
        const ports = strings(item.ports);
        return (
          <div className="dk-card" key={`${name}-${index}`}>
            <div className="dk-card-head">
              <div className="dk-card-title">
                <span className={`dk-dot dk-dot--${stateClass(state || "unknown")}`} aria-hidden="true" />
                <code className="dk-name">{name}</code>
                {service ? <span className="dk-chip">{service}</span> : null}
              </div>
              {state ? <StateBadge t={t} state={state} /> : null}
            </div>
            {status ? <div className="dk-card-sub">{status}</div> : null}
            {ports.length > 0 ? (
              <div className="dk-chips">
                {ports.map((port) => (
                  <code className="dk-chip" key={port}>
                    {port}
                  </code>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function StatsList({
  api,
  t,
  items,
}: {
  api: ToolCallApi;
  t: Translate;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  if (items.length === 0) return <Empty api={api} t={t} />;
  return (
    <div className="dk-list">
      {items.map((item, index) => {
        const name = asText(item.name) || asText(item.container) || `#${index + 1}`;
        const cpu = percentOf(asText(item.cpu));
        const memoryPercent = percentOf(asText(item.memoryPercent));
        const memory = asText(item.memory);
        const network = asText(item.network);
        const blockIO = asText(item.blockIO);
        const pids = asText(item.pids);
        return (
          <div className="dk-card dk-card--compact" key={`${name}-${index}`}>
            <div className="dk-card-head">
              <div className="dk-card-title">
                <HostIcon api={api} name="Activity" size={13} />
                <code className="dk-name">{name}</code>
              </div>
              <span className="dk-chip dk-chip--accent">{asText(item.cpu) || "—"}</span>
            </div>
            {cpu !== null ? <Meter value={cpu} tone="cpu" /> : null}
            <div className="dk-card-sub">
              {memory ? <span>{memory}</span> : null}
              {memoryPercent !== null ? <span>{`${memoryPercent}%`}</span> : null}
              {network ? <span>{network}</span> : null}
            </div>
            {(blockIO || pids) ? (
              <div className="dk-chips">
                {blockIO ? <span className="dk-chip">{blockIO}</span> : null}
                {pids ? <span className="dk-chip">{t("docker.result.pids", { values: { count: pids } })}</span> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LogsView({
  api,
  t,
  payload,
}: {
  api: ToolCallApi;
  t: Translate;
  payload: unknown;
}): React.JSX.Element {
  const logs = asText(field(payload, "logs"));
  const stderr = asText(field(payload, "stderr"));
  if (!logs && !stderr) return <Empty api={api} t={t} />;
  return (
    <div className="dk-stack">
      <CodePanel t={t} label={t("docker.result.logs")} value={logs} />
      <CodePanel t={t} label={t("docker.result.stderr")} value={stderr} tone="error" />
      <Truncated t={t} payload={payload} />
    </div>
  );
}

function ExecView({
  t,
  payload,
}: {
  t: Translate;
  payload: unknown;
}): React.JSX.Element {
  const command = strings(field(payload, "command"));
  const stdout = asText(field(payload, "stdout"));
  const stderr = asText(field(payload, "stderr"));
  const exitCode = asNumber(field(payload, "exitCode"));
  return (
    <div className="dk-stack">
      <div className="dk-command-row">
        <code className="dk-command">{command.length > 0 ? `$ ${command.join(" ")}` : "—"}</code>
        <span className={`dk-badge${exitCode !== null && exitCode !== 0 ? " dk-badge--warn" : " dk-badge--ok"}`}>
          {t("docker.result.exitCode", { values: { code: exitCode ?? 0 } })}
        </span>
      </div>
      <CodePanel t={t} label={t("docker.result.stdout")} value={stdout} />
      <CodePanel t={t} label={t("docker.result.stderr")} value={stderr} tone="error" />
      <Truncated t={t} payload={payload} />
    </div>
  );
}

function SystemView({
  api,
  t,
  payload,
}: {
  api: ToolCallApi;
  t: Translate;
  payload: unknown;
}): React.JSX.Element {
  const version = field(payload, "version");
  const client = isRecord(version) ? version.Client : undefined;
  const server = isRecord(version) ? version.Server : undefined;
  const disk = records(field(payload, "diskUsage"));
  const context = asText(field(payload, "context"));

  return (
    <div className="dk-stack">
      <div className="dk-metric-grid">
        <div className="dk-metric">
          <span className="dk-metric-label">{t("docker.result.context")}</span>
          <code>{context || "—"}</code>
        </div>
        <div className="dk-metric">
          <span className="dk-metric-label">{t("docker.result.clientVersion")}</span>
          <code>{isRecord(client) ? asText(client.Version) || "—" : "—"}</code>
        </div>
        <div className="dk-metric">
          <span className="dk-metric-label">{t("docker.result.serverVersion")}</span>
          <code>{isRecord(server) ? asText(server.Version) || "—" : "—"}</code>
        </div>
      </div>
      {disk.length > 0 ? (
        <div className="dk-stack">
          <SectionTitle api={api} icon="HardDrive">
            {t("docker.result.disk")}
          </SectionTitle>
          <div className="dk-list">
            {disk.map((item, index) => {
              const reclaimable = percentOf(asText(item.reclaimable));
              const rawType = asText(item.type);
              const typeKey = rawType ? DISK_TYPE_KEYS[rawType] : undefined;
              const typeLabel = typeKey ? t(typeKey) : rawType || "—";
              return (
                <div className="dk-card dk-card--compact" key={`${rawType}-${index}`}>
                  <div className="dk-card-head">
                    <code className="dk-name">{typeLabel}</code>
                    <span className="dk-chip">{asText(item.size) || "—"}</span>
                  </div>
                  {reclaimable !== null ? <Meter value={reclaimable} tone="disk" /> : null}
                  <div className="dk-card-sub">
                    {t("docker.result.diskUsage", {
                      values: {
                        active: asText(item.active) || "0",
                        total: asText(item.totalCount) || "0",
                        reclaimable: asText(item.reclaimable) || "—",
                      },
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InspectView({
  api,
  t,
  payload,
}: {
  api: ToolCallApi;
  t: Translate;
  payload: unknown;
}): React.JSX.Element {
  const container = field(payload, "container");
  if (!isRecord(container)) return <Empty api={api} t={t} />;
  const state = isRecord(container.state) ? container.state : {};
  const config = isRecord(container.config) ? container.config : {};
  const host = isRecord(container.host) ? container.host : {};
  const mounts = records(container.mounts);
  const envKeys = strings(container.envKeys);
  const networks = strings(container.networks);
  const command = strings(config.cmd);

  return (
    <div className="dk-stack">
      <dl className="dk-kv">
        <dt>{t("docker.field.container")}</dt>
        <dd>
          <code>{asText(container.name) || asText(container.id) || "—"}</code>
        </dd>
        <dt>{t("docker.field.image")}</dt>
        <dd>
          <code>{asText(config.image) || asText(container.image) || "—"}</code>
        </dd>
        <dt>{t("docker.result.state")}</dt>
        <dd>
          <StateBadge t={t} state={asText(state.status) || "unknown"} />
        </dd>
        <dt>{t("docker.result.restartPolicy")}</dt>
        <dd>
          <code>{asText(host.restartPolicy) || "—"}</code>
        </dd>
        <dt>{t("docker.result.privileged")}</dt>
        <dd>{host.privileged === true ? t("docker.value.yes") : t("docker.value.no")}</dd>
        <dt>{t("docker.result.networks")}</dt>
        <dd>
          {networks.length > 0 ? (
            <span className="dk-chips dk-chips--inline">
              {networks.map((network) => (
                <code className="dk-chip" key={network}>
                  {network}
                </code>
              ))}
            </span>
          ) : (
            "—"
          )}
        </dd>
      </dl>
      {host.privileged === true ? (
        <div className="dk-warning">
          <HostIcon api={api} name="TriangleAlert" size={13} />
          <span>{t("docker.result.privilegedWarning")}</span>
        </div>
      ) : null}
      {command.length > 0 ? (
        <CodePanel t={t} label={t("docker.result.command")} value={command.join(" ")} />
      ) : null}
      {mounts.length > 0 ? (
        <div className="dk-stack">
          <SectionTitle api={api} icon="FolderOpen">
            {t("docker.result.mounts")}
          </SectionTitle>
          <div className="dk-list">
            {mounts.map((mount, index) => (
              <div className="dk-card dk-card--compact" key={`${asText(mount.destination)}-${index}`}>
                <div className="dk-card-head">
                  <code className="dk-name">{asText(mount.destination) || "—"}</code>
                  <span className="dk-chip">{asText(mount.type) || "—"}</span>
                </div>
                <div className="dk-card-sub">
                  <span>{asText(mount.source) || "—"}</span>
                  <span>{asText(mount.mode) || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {envKeys.length > 0 ? (
        <details className="dk-raw">
          <summary>{t("docker.result.envKeys", { values: { count: envKeys.length } })}</summary>
          <pre>{envKeys.join("\n")}</pre>
        </details>
      ) : null}
    </div>
  );
}

function ActionView({
  api,
  t,
  payload,
}: {
  api: ToolCallApi;
  t: Translate;
  payload: unknown;
}): React.JSX.Element {
  const output = asText(field(payload, "output"));
  const stderr = asText(field(payload, "stderr"));
  const container = asText(field(payload, "container"));
  const projectDir = asText(field(payload, "projectDir"));
  const action = asText(field(payload, "action"));
  const target = container || (projectDir ? baseName(projectDir) : "");

  return (
    <div className="dk-stack">
      <div className="dk-action">
        <HostIcon api={api} name="CircleCheck" size={14} />
        <span className="dk-action-label">
          {t(`docker.action.${action}`, { defaultValue: action || t("docker.result.actionDone") })}
        </span>
        {target ? <code className="dk-action-target">{target}</code> : null}
        <span className="dk-action-state">{t("docker.result.actionDone")}</span>
      </div>
      <CodePanel t={t} label={t("docker.result.output")} value={output} />
      <CodePanel t={t} label={t("docker.result.stderr")} value={stderr} tone="error" />
      <Truncated t={t} payload={payload} />
    </div>
  );
}

function RawBlock({ t, payload }: { t: Translate; payload: unknown }): React.JSX.Element {
  return (
    <details className="dk-raw">
      <summary>{t("docker.result.raw")}</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

function ResultBody({
  api,
  kind,
  payload,
}: {
  api: ToolCallApi;
  kind: Kind;
  payload: unknown;
}): React.JSX.Element {
  const t = api.t;
  switch (kind) {
    case "containers_list":
      return (
        <div className="dk-stack">
          <SectionTitle api={api} icon="Box">
            {t("docker.result.containers")}
          </SectionTitle>
          <ContainerList api={api} t={t} items={records(field(payload, "containers"))} />
          <Truncated t={t} payload={payload} />
        </div>
      );
    case "images_list":
      return (
        <div className="dk-stack">
          <SectionTitle api={api} icon="Layers">
            {t("docker.result.images")}
          </SectionTitle>
          <ImageList api={api} t={t} items={records(field(payload, "images"))} />
          <Truncated t={t} payload={payload} />
        </div>
      );
    case "container_stats":
      return (
        <div className="dk-stack">
          <SectionTitle api={api} icon="Activity">
            {t("docker.result.stats")}
          </SectionTitle>
          <StatsList api={api} t={t} items={records(field(payload, "stats"))} />
          <Truncated t={t} payload={payload} />
        </div>
      );
    case "container_logs":
      return <LogsView api={api} t={t} payload={payload} />;
    case "container_exec":
      return <ExecView t={t} payload={payload} />;
    case "container_inspect":
      return <InspectView api={api} t={t} payload={payload} />;
    case "compose_status":
      if (asText(field(payload, "action")) === "logs") return <LogsView api={api} t={t} payload={payload} />;
      return (
        <div className="dk-stack">
          <SectionTitle api={api} icon="Boxes">
            {t("docker.result.services")}
          </SectionTitle>
          <ServiceList api={api} t={t} items={records(field(payload, "services"))} />
          <Truncated t={t} payload={payload} />
        </div>
      );
    case "system_info":
      return <SystemView api={api} t={t} payload={payload} />;
    case "container_start":
    case "container_stop":
    case "container_restart":
    case "container_remove":
    case "image_pull":
    case "compose_control":
      return <ActionView api={api} t={t} payload={payload} />;
  }
  return <RawBlock t={t} payload={payload} />;
}

function DockerCard({
  api,
  toolCall,
  kind,
}: {
  api: ToolCallApi;
  toolCall: ToolCallInfo;
  kind: Kind;
}): React.JSX.Element {
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const args = useMemo(() => parseArgs(toolCall.arguments), [toolCall.arguments]);
  const rawResult = useMemo(() => parseJson(toolCall.result), [toolCall.result]);
  const payload = useMemo(() => unwrapResult(rawResult), [rawResult]);
  const failed =
    toolCall.status === "error" ||
    isErrorEnvelope(rawResult) ||
    (isRecord(payload) && payload.isError === true);
  const message = failed ? localizeToolError(t, errorText(payload)) : "";
  const errorCode =
    failed && isRecord(payload) && typeof payload.code === "string" ? payload.code : "";
  // 插件自带语言包优先：CLI 缺失等环境问题按错误码给出可执行的本地化提示。
  const errorMessage = failed
    ? errorCode
      ? t(`docker.error.${errorCode}`, { defaultValue: message || t("docker.error") })
      : message || t("docker.error")
    : "";
  const count = countOf(payload);
  const summary = summarize(t, kind, args);

  return (
    <ToolCallNode
      toolName={toolCall.name}
      badgeName={t(`docker.tool.${kind}`, { defaultValue: kind })}
      category={CATEGORIES[kind]}
      status={failed ? "error" : toolCall.status}
      displayName={summary}
      displayNameTitle={summary}
      meta={
        count !== null ? (
          <span className="dk-count">{t("docker.result.count", { values: { count } })}</span>
        ) : null
      }
      className="dk-tool-card"
      lazyBody
    >
      <div className="dk-body">
        <Params t={t} kind={kind} args={args} />
        {failed ? (
          <div className="dk-error">
            <HostIcon api={api} name="AlertCircle" size={14} />
            <div className="dk-error-body">
              {errorCode ? <code className="dk-error-code">{errorCode}</code> : null}
              <span>{errorMessage}</span>
            </div>
          </div>
        ) : payload === null ? (
          <div className={`dk-empty${toolCall.status === "running" ? " dk-running" : ""}`}>
            <HostIcon
              api={api}
              name={toolCall.status === "running" ? "LoaderCircle" : "Clock"}
              size={14}
            />
            <span>
              {toolCall.status === "running"
                ? t("docker.result.running")
                : toolCall.status === "pending"
                  ? t("docker.result.pending")
                  : t("docker.result.empty")}
            </span>
          </div>
        ) : (
          <section className="dk-results" aria-label={t("docker.result.title")}>
            <ResultBody api={api} kind={kind} payload={payload} />
          </section>
        )}
      </div>
    </ToolCallNode>
  );
}

/** Synchronous factory: return the component subtree; hooks stay in the host React tree. */
export function renderDockerTool(
  api: ToolCallApi,
  context: ToolCallContext,
): React.ReactNode | null {
  if (
    api.signal.aborted ||
    api.ui.toolCallRendererVersion !== 1 ||
    api.ui.React !== React ||
    context.slot !== "tool-call"
  ) {
    return null;
  }

  const rawName = context.toolCall.originalToolName ?? context.toolCall.name;
  const key = rawName.slice(rawName.lastIndexOf("-") + 1);
  const kind = KINDS[key];
  if (!kind) return null;
  return <DockerCard api={api} toolCall={context.toolCall} kind={kind} />;
}
