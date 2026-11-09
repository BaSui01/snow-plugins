// Generated from src/renderer/ by scripts/build.mjs — edit the TypeScript sources, not this file.

// src/renderer/runtime.ts
var React = window.SnowAppPlugin.React;
var { useMemo, useState } = React;

// src/renderer/parsing.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asText = (value) => typeof value === "string" ? value : "";
var asNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
var parseJson = (raw) => {
  if (raw === void 0 || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};
var parseArgs = (raw) => {
  const parsed = parseJson(raw);
  return isRecord(parsed) ? parsed : {};
};
var unwrapResult = (value) => {
  if (isRecord(value) && Array.isArray(value.content)) {
    const text = value.content.flatMap(
      (block) => isRecord(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : []
    ).join("\n");
    if (text) {
      const parsed = parseJson(text);
      return isRecord(parsed) || Array.isArray(parsed) || typeof parsed === "string" ? parsed : text;
    }
  }
  if (isRecord(value) && "result" in value) return unwrapResult(value.result);
  if (isRecord(value) || Array.isArray(value) || typeof value === "string")
    return value;
  return null;
};
var isErrorEnvelope = (value) => isRecord(value) && value.isError === true;
var errorText = (payload) => {
  if (typeof payload === "string") return payload;
  if (isRecord(payload)) {
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
  }
  return payload === null ? "" : JSON.stringify(payload);
};
var records = (value) => Array.isArray(value) ? value.filter(isRecord) : [];
var strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

// src/renderer/index.tsx
var KINDS = {
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
  system_info: "system_info"
};
var CATEGORIES = {
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
  system_info: "read"
};
var FIELDS = {
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
  system_info: []
};
var DISK_TYPE_KEYS = {
  Images: "docker.disk.images",
  Containers: "docker.disk.containers",
  "Local Volumes": "docker.disk.volumes",
  "Build Cache": "docker.disk.buildCache"
};
var truncate = (value, max) => value.length > max ? `${value.slice(0, max)}…` : value;
var baseName = (value) => {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? value;
};
var field = (payload, key) => isRecord(payload) ? payload[key] : void 0;
var countOf = (payload) => {
  if (!isRecord(payload)) return null;
  const direct = asNumber(payload.count);
  if (direct !== null) return direct;
  for (const key of ["containers", "images", "services", "stats", "diskUsage"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.length;
  }
  return null;
};
var clampPercent = (value) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
var percentOf = (value) => {
  const match = /([\d.]+)\s*%/.exec(value);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) ? clampPercent(parsed) : null;
};
var shortId = (value) => value.replace(/^sha256:/, "").slice(0, 12);
var splitPorts = (value) => value.split(/,\s*/).filter((item) => item.trim() !== "");
var stateClass = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
function summarize(t, kind, args) {
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
      return container ? t("docker.summary.stats", { values: { container } }) : t("docker.summary.allStats");
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
      return reference ? t("docker.summary.filteredImages", { values: { reference } }) : t("docker.summary.images");
    }
    case "image_pull":
      return t("docker.summary.pull", { values: { image } });
    case "compose_status":
      return t("docker.summary.composeStatus", {
        values: { action: actionLabel || t("docker.action.ps"), project: baseName(project) }
      });
    case "compose_control":
      return t("docker.summary.composeControl", {
        values: { action: actionLabel || t("docker.action.up"), project: baseName(project) }
      });
    case "system_info":
      return t("docker.summary.system");
  }
}
function HostIcon({
  api,
  name,
  size = 12
}) {
  const Icon = api.ui.icon(name);
  return Icon ? /* @__PURE__ */ React.createElement(Icon, { size, className: "dk-icon" }) : null;
}
function SectionTitle({
  api,
  icon,
  children
}) {
  return /* @__PURE__ */ React.createElement("div", { className: "dk-section-title" }, icon ? /* @__PURE__ */ React.createElement(HostIcon, { api, name: icon, size: 11 }) : null, /* @__PURE__ */ React.createElement("span", null, children));
}
function Params({
  t,
  kind,
  args
}) {
  const fields = FIELDS[kind].filter((name) => args[name] !== void 0);
  if (fields.length === 0) return null;
  return /* @__PURE__ */ React.createElement("dl", { className: "dk-params" }, fields.map((name) => {
    const value = args[name];
    const label = t(`docker.field.${name}`, { defaultValue: name });
    const text = typeof value === "boolean" ? t(value ? "docker.value.yes" : "docker.value.no") : Array.isArray(value) ? value.map((item) => String(item)).join(", ") : typeof value === "string" || typeof value === "number" ? String(value) : "";
    return /* @__PURE__ */ React.createElement("div", { className: "dk-param", key: name }, /* @__PURE__ */ React.createElement("dt", null, label), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement("code", { className: "dk-param-value", title: text }, truncate(text || t("docker.value.empty"), 160))));
  }));
}
function StateBadge({ t, state }) {
  const normalized = state.trim().toLowerCase();
  const label = t(`docker.state.${normalized}`, { defaultValue: state });
  return /* @__PURE__ */ React.createElement("span", { className: `dk-state dk-state--${stateClass(normalized)}` }, /* @__PURE__ */ React.createElement("span", { className: "dk-state-dot", "aria-hidden": "true" }), label);
}
function CopyButton({ t, value }) {
  const [outcome, setOutcome] = useState("idle");
  const label = outcome === "copied" ? t("docker.action.copied") : outcome === "error" ? t("docker.action.copyFailed") : t("docker.action.copy");
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: `dk-copy${outcome === "error" ? " dk-copy--error" : ""}`,
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOutcome("copied");
        } catch {
          setOutcome("error");
        }
      }
    },
    label
  );
}
function CodePanel({
  t,
  label,
  value,
  tone
}) {
  if (!value) return null;
  return /* @__PURE__ */ React.createElement("div", { className: `dk-panel${tone === "error" ? " dk-panel--error" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-panel-head" }, /* @__PURE__ */ React.createElement("span", { className: "dk-panel-label" }, label), /* @__PURE__ */ React.createElement(CopyButton, { t, value })), /* @__PURE__ */ React.createElement("pre", { className: "dk-code" }, value));
}
function Meter({ value, tone }) {
  return /* @__PURE__ */ React.createElement("div", { className: `dk-meter dk-meter--${tone}`, "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { style: { width: `${clampPercent(value)}%` } }));
}
function Empty({ api, t }) {
  return /* @__PURE__ */ React.createElement("div", { className: "dk-empty" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Inbox", size: 14 }), /* @__PURE__ */ React.createElement("span", null, t("docker.result.empty")));
}
function Truncated({ t, payload }) {
  if (!isRecord(payload) || payload.truncated !== true) return null;
  const total = asNumber(payload.total);
  const count = asNumber(payload.count);
  return /* @__PURE__ */ React.createElement("div", { className: "dk-hint" }, total !== null && count !== null ? t("docker.result.truncated", { values: { shown: count, total } }) : t("docker.result.truncatedSimple"));
}
function ContainerList({
  api,
  t,
  items
}) {
  if (items.length === 0) return /* @__PURE__ */ React.createElement(Empty, { api, t });
  return /* @__PURE__ */ React.createElement("div", { className: "dk-list" }, items.map((item, index) => {
    const name = asText(item.name) || asText(item.id) || `#${index + 1}`;
    const image = asText(item.image);
    const state = asText(item.state);
    const status = asText(item.status);
    const ports = asText(item.ports);
    const id = asText(item.id);
    return /* @__PURE__ */ React.createElement("div", { className: "dk-card", key: `${name}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-head" }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-title" }, /* @__PURE__ */ React.createElement("span", { className: `dk-dot dk-dot--${stateClass(state || "unknown")}`, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("code", { className: "dk-name" }, name), id ? /* @__PURE__ */ React.createElement("span", { className: "dk-id" }, shortId(id)) : null), state ? /* @__PURE__ */ React.createElement(StateBadge, { t, state }) : null), /* @__PURE__ */ React.createElement("div", { className: "dk-card-sub" }, image ? /* @__PURE__ */ React.createElement("span", { className: "dk-image" }, image) : null, status ? /* @__PURE__ */ React.createElement("span", null, status) : null), ports ? /* @__PURE__ */ React.createElement("div", { className: "dk-chips" }, splitPorts(ports).map((port) => /* @__PURE__ */ React.createElement("code", { className: "dk-chip", key: port }, port))) : null);
  }));
}
function ImageList({
  api,
  t,
  items
}) {
  if (items.length === 0) return /* @__PURE__ */ React.createElement(Empty, { api, t });
  return /* @__PURE__ */ React.createElement("div", { className: "dk-list" }, items.map((item, index) => {
    const repository = asText(item.repository) || "<none>";
    const tag = asText(item.tag) || "<none>";
    const id = asText(item.id);
    const size = asText(item.size);
    const created = asText(item.createdAt);
    return /* @__PURE__ */ React.createElement("div", { className: "dk-card dk-card--compact", key: `${repository}:${tag}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-head" }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Layers", size: 13 }), /* @__PURE__ */ React.createElement("code", { className: "dk-name" }, `${repository}:${tag}`)), size ? /* @__PURE__ */ React.createElement("span", { className: "dk-chip" }, size) : null), /* @__PURE__ */ React.createElement("div", { className: "dk-card-sub" }, id ? /* @__PURE__ */ React.createElement("span", { className: "dk-id" }, shortId(id)) : null, created ? /* @__PURE__ */ React.createElement("span", null, created) : null));
  }));
}
function ServiceList({
  api,
  t,
  items
}) {
  if (items.length === 0) return /* @__PURE__ */ React.createElement(Empty, { api, t });
  return /* @__PURE__ */ React.createElement("div", { className: "dk-list" }, items.map((item, index) => {
    const name = asText(item.name) || asText(item.service) || `#${index + 1}`;
    const service = asText(item.service);
    const state = asText(item.state);
    const status = asText(item.status);
    const ports = strings(item.ports);
    return /* @__PURE__ */ React.createElement("div", { className: "dk-card", key: `${name}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-head" }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-title" }, /* @__PURE__ */ React.createElement("span", { className: `dk-dot dk-dot--${stateClass(state || "unknown")}`, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("code", { className: "dk-name" }, name), service ? /* @__PURE__ */ React.createElement("span", { className: "dk-chip" }, service) : null), state ? /* @__PURE__ */ React.createElement(StateBadge, { t, state }) : null), status ? /* @__PURE__ */ React.createElement("div", { className: "dk-card-sub" }, status) : null, ports.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "dk-chips" }, ports.map((port) => /* @__PURE__ */ React.createElement("code", { className: "dk-chip", key: port }, port))) : null);
  }));
}
function StatsList({
  api,
  t,
  items
}) {
  if (items.length === 0) return /* @__PURE__ */ React.createElement(Empty, { api, t });
  return /* @__PURE__ */ React.createElement("div", { className: "dk-list" }, items.map((item, index) => {
    const name = asText(item.name) || asText(item.container) || `#${index + 1}`;
    const cpu = percentOf(asText(item.cpu));
    const memoryPercent = percentOf(asText(item.memoryPercent));
    const memory = asText(item.memory);
    const network = asText(item.network);
    const blockIO = asText(item.blockIO);
    const pids = asText(item.pids);
    return /* @__PURE__ */ React.createElement("div", { className: "dk-card dk-card--compact", key: `${name}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-head" }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Activity", size: 13 }), /* @__PURE__ */ React.createElement("code", { className: "dk-name" }, name)), /* @__PURE__ */ React.createElement("span", { className: "dk-chip dk-chip--accent" }, asText(item.cpu) || "—")), cpu !== null ? /* @__PURE__ */ React.createElement(Meter, { value: cpu, tone: "cpu" }) : null, /* @__PURE__ */ React.createElement("div", { className: "dk-card-sub" }, memory ? /* @__PURE__ */ React.createElement("span", null, memory) : null, memoryPercent !== null ? /* @__PURE__ */ React.createElement("span", null, `${memoryPercent}%`) : null, network ? /* @__PURE__ */ React.createElement("span", null, network) : null), blockIO || pids ? /* @__PURE__ */ React.createElement("div", { className: "dk-chips" }, blockIO ? /* @__PURE__ */ React.createElement("span", { className: "dk-chip" }, blockIO) : null, pids ? /* @__PURE__ */ React.createElement("span", { className: "dk-chip" }, t("docker.result.pids", { values: { count: pids } })) : null) : null);
  }));
}
function LogsView({
  api,
  t,
  payload
}) {
  const logs = asText(field(payload, "logs"));
  const stderr = asText(field(payload, "stderr"));
  if (!logs && !stderr) return /* @__PURE__ */ React.createElement(Empty, { api, t });
  return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.logs"), value: logs }), /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.stderr"), value: stderr, tone: "error" }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
}
function ExecView({
  t,
  payload
}) {
  const command = strings(field(payload, "command"));
  const stdout = asText(field(payload, "stdout"));
  const stderr = asText(field(payload, "stderr"));
  const exitCode = asNumber(field(payload, "exitCode"));
  return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement("div", { className: "dk-command-row" }, /* @__PURE__ */ React.createElement("code", { className: "dk-command" }, command.length > 0 ? `$ ${command.join(" ")}` : "—"), /* @__PURE__ */ React.createElement("span", { className: `dk-badge${exitCode !== null && exitCode !== 0 ? " dk-badge--warn" : " dk-badge--ok"}` }, t("docker.result.exitCode", { values: { code: exitCode ?? 0 } }))), /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.stdout"), value: stdout }), /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.stderr"), value: stderr, tone: "error" }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
}
function SystemView({
  api,
  t,
  payload
}) {
  const version = field(payload, "version");
  const client = isRecord(version) ? version.Client : void 0;
  const server = isRecord(version) ? version.Server : void 0;
  const disk = records(field(payload, "diskUsage"));
  const context = asText(field(payload, "context"));
  return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement("div", { className: "dk-metric-grid" }, /* @__PURE__ */ React.createElement("div", { className: "dk-metric" }, /* @__PURE__ */ React.createElement("span", { className: "dk-metric-label" }, t("docker.result.context")), /* @__PURE__ */ React.createElement("code", null, context || "—")), /* @__PURE__ */ React.createElement("div", { className: "dk-metric" }, /* @__PURE__ */ React.createElement("span", { className: "dk-metric-label" }, t("docker.result.clientVersion")), /* @__PURE__ */ React.createElement("code", null, isRecord(client) ? asText(client.Version) || "—" : "—")), /* @__PURE__ */ React.createElement("div", { className: "dk-metric" }, /* @__PURE__ */ React.createElement("span", { className: "dk-metric-label" }, t("docker.result.serverVersion")), /* @__PURE__ */ React.createElement("code", null, isRecord(server) ? asText(server.Version) || "—" : "—"))), disk.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(SectionTitle, { api, icon: "HardDrive" }, t("docker.result.disk")), /* @__PURE__ */ React.createElement("div", { className: "dk-list" }, disk.map((item, index) => {
    const reclaimable = percentOf(asText(item.reclaimable));
    const rawType = asText(item.type);
    const typeKey = rawType ? DISK_TYPE_KEYS[rawType] : void 0;
    const typeLabel = typeKey ? t(typeKey) : rawType || "—";
    return /* @__PURE__ */ React.createElement("div", { className: "dk-card dk-card--compact", key: `${rawType}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-head" }, /* @__PURE__ */ React.createElement("code", { className: "dk-name" }, typeLabel), /* @__PURE__ */ React.createElement("span", { className: "dk-chip" }, asText(item.size) || "—")), reclaimable !== null ? /* @__PURE__ */ React.createElement(Meter, { value: reclaimable, tone: "disk" }) : null, /* @__PURE__ */ React.createElement("div", { className: "dk-card-sub" }, t("docker.result.diskUsage", {
      values: {
        active: asText(item.active) || "0",
        total: asText(item.totalCount) || "0",
        reclaimable: asText(item.reclaimable) || "—"
      }
    })));
  }))) : null);
}
function InspectView({
  api,
  t,
  payload
}) {
  const container = field(payload, "container");
  if (!isRecord(container)) return /* @__PURE__ */ React.createElement(Empty, { api, t });
  const state = isRecord(container.state) ? container.state : {};
  const config = isRecord(container.config) ? container.config : {};
  const host = isRecord(container.host) ? container.host : {};
  const mounts = records(container.mounts);
  const envKeys = strings(container.envKeys);
  const networks = strings(container.networks);
  const command = strings(config.cmd);
  return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement("dl", { className: "dk-kv" }, /* @__PURE__ */ React.createElement("dt", null, t("docker.field.container")), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement("code", null, asText(container.name) || asText(container.id) || "—")), /* @__PURE__ */ React.createElement("dt", null, t("docker.field.image")), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement("code", null, asText(config.image) || asText(container.image) || "—")), /* @__PURE__ */ React.createElement("dt", null, t("docker.result.state")), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement(StateBadge, { t, state: asText(state.status) || "unknown" })), /* @__PURE__ */ React.createElement("dt", null, t("docker.result.restartPolicy")), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement("code", null, asText(host.restartPolicy) || "—")), /* @__PURE__ */ React.createElement("dt", null, t("docker.result.privileged")), /* @__PURE__ */ React.createElement("dd", null, host.privileged === true ? t("docker.value.yes") : t("docker.value.no")), /* @__PURE__ */ React.createElement("dt", null, t("docker.result.networks")), /* @__PURE__ */ React.createElement("dd", null, networks.length > 0 ? /* @__PURE__ */ React.createElement("span", { className: "dk-chips dk-chips--inline" }, networks.map((network) => /* @__PURE__ */ React.createElement("code", { className: "dk-chip", key: network }, network))) : "—")), host.privileged === true ? /* @__PURE__ */ React.createElement("div", { className: "dk-warning" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "TriangleAlert", size: 13 }), /* @__PURE__ */ React.createElement("span", null, t("docker.result.privilegedWarning"))) : null, command.length > 0 ? /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.command"), value: command.join(" ") }) : null, mounts.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(SectionTitle, { api, icon: "FolderOpen" }, t("docker.result.mounts")), /* @__PURE__ */ React.createElement("div", { className: "dk-list" }, mounts.map((mount, index) => /* @__PURE__ */ React.createElement("div", { className: "dk-card dk-card--compact", key: `${asText(mount.destination)}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "dk-card-head" }, /* @__PURE__ */ React.createElement("code", { className: "dk-name" }, asText(mount.destination) || "—"), /* @__PURE__ */ React.createElement("span", { className: "dk-chip" }, asText(mount.type) || "—")), /* @__PURE__ */ React.createElement("div", { className: "dk-card-sub" }, /* @__PURE__ */ React.createElement("span", null, asText(mount.source) || "—"), /* @__PURE__ */ React.createElement("span", null, asText(mount.mode) || "—")))))) : null, envKeys.length > 0 ? /* @__PURE__ */ React.createElement("details", { className: "dk-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("docker.result.envKeys", { values: { count: envKeys.length } })), /* @__PURE__ */ React.createElement("pre", null, envKeys.join("\n"))) : null);
}
function ActionView({
  api,
  t,
  payload
}) {
  const output = asText(field(payload, "output"));
  const stderr = asText(field(payload, "stderr"));
  const container = asText(field(payload, "container"));
  const projectDir = asText(field(payload, "projectDir"));
  const action = asText(field(payload, "action"));
  const target = container || (projectDir ? baseName(projectDir) : "");
  return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement("div", { className: "dk-action" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "CircleCheck", size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "dk-action-label" }, t(`docker.action.${action}`, { defaultValue: action || t("docker.result.actionDone") })), target ? /* @__PURE__ */ React.createElement("code", { className: "dk-action-target" }, target) : null, /* @__PURE__ */ React.createElement("span", { className: "dk-action-state" }, t("docker.result.actionDone"))), /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.output"), value: output }), /* @__PURE__ */ React.createElement(CodePanel, { t, label: t("docker.result.stderr"), value: stderr, tone: "error" }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
}
function RawBlock({ t, payload }) {
  return /* @__PURE__ */ React.createElement("details", { className: "dk-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("docker.result.raw")), /* @__PURE__ */ React.createElement("pre", null, JSON.stringify(payload, null, 2)));
}
function ResultBody({
  api,
  kind,
  payload
}) {
  const t = api.t;
  switch (kind) {
    case "containers_list":
      return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(SectionTitle, { api, icon: "Box" }, t("docker.result.containers")), /* @__PURE__ */ React.createElement(ContainerList, { api, t, items: records(field(payload, "containers")) }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
    case "images_list":
      return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(SectionTitle, { api, icon: "Layers" }, t("docker.result.images")), /* @__PURE__ */ React.createElement(ImageList, { api, t, items: records(field(payload, "images")) }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
    case "container_stats":
      return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(SectionTitle, { api, icon: "Activity" }, t("docker.result.stats")), /* @__PURE__ */ React.createElement(StatsList, { api, t, items: records(field(payload, "stats")) }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
    case "container_logs":
      return /* @__PURE__ */ React.createElement(LogsView, { api, t, payload });
    case "container_exec":
      return /* @__PURE__ */ React.createElement(ExecView, { t, payload });
    case "container_inspect":
      return /* @__PURE__ */ React.createElement(InspectView, { api, t, payload });
    case "compose_status":
      if (asText(field(payload, "action")) === "logs") return /* @__PURE__ */ React.createElement(LogsView, { api, t, payload });
      return /* @__PURE__ */ React.createElement("div", { className: "dk-stack" }, /* @__PURE__ */ React.createElement(SectionTitle, { api, icon: "Boxes" }, t("docker.result.services")), /* @__PURE__ */ React.createElement(ServiceList, { api, t, items: records(field(payload, "services")) }), /* @__PURE__ */ React.createElement(Truncated, { t, payload }));
    case "system_info":
      return /* @__PURE__ */ React.createElement(SystemView, { api, t, payload });
    case "container_start":
    case "container_stop":
    case "container_restart":
    case "container_remove":
    case "image_pull":
    case "compose_control":
      return /* @__PURE__ */ React.createElement(ActionView, { api, t, payload });
  }
  return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
}
function DockerCard({
  api,
  toolCall,
  kind
}) {
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const args = useMemo(() => parseArgs(toolCall.arguments), [toolCall.arguments]);
  const rawResult = useMemo(() => parseJson(toolCall.result), [toolCall.result]);
  const payload = useMemo(() => unwrapResult(rawResult), [rawResult]);
  const failed = toolCall.status === "error" || isErrorEnvelope(rawResult) || isRecord(payload) && payload.isError === true;
  const message = failed ? localizeToolError(t, errorText(payload)) : "";
  const errorCode = failed && isRecord(payload) && typeof payload.code === "string" ? payload.code : "";
  const errorMessage = failed ? errorCode ? t(`docker.error.${errorCode}`, { defaultValue: message || t("docker.error") }) : message || t("docker.error") : "";
  const count = countOf(payload);
  const summary = summarize(t, kind, args);
  return /* @__PURE__ */ React.createElement(
    ToolCallNode,
    {
      toolName: toolCall.name,
      badgeName: t(`docker.tool.${kind}`, { defaultValue: kind }),
      category: CATEGORIES[kind],
      status: failed ? "error" : toolCall.status,
      displayName: summary,
      displayNameTitle: summary,
      meta: count !== null ? /* @__PURE__ */ React.createElement("span", { className: "dk-count" }, t("docker.result.count", { values: { count } })) : null,
      className: "dk-tool-card",
      lazyBody: true
    },
    /* @__PURE__ */ React.createElement("div", { className: "dk-body" }, /* @__PURE__ */ React.createElement(Params, { t, kind, args }), failed ? /* @__PURE__ */ React.createElement("div", { className: "dk-error" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "AlertCircle", size: 14 }), /* @__PURE__ */ React.createElement("div", { className: "dk-error-body" }, errorCode ? /* @__PURE__ */ React.createElement("code", { className: "dk-error-code" }, errorCode) : null, /* @__PURE__ */ React.createElement("span", null, errorMessage))) : payload === null ? /* @__PURE__ */ React.createElement("div", { className: `dk-empty${toolCall.status === "running" ? " dk-running" : ""}` }, /* @__PURE__ */ React.createElement(
      HostIcon,
      {
        api,
        name: toolCall.status === "running" ? "LoaderCircle" : "Clock",
        size: 14
      }
    ), /* @__PURE__ */ React.createElement("span", null, toolCall.status === "running" ? t("docker.result.running") : toolCall.status === "pending" ? t("docker.result.pending") : t("docker.result.empty"))) : /* @__PURE__ */ React.createElement("section", { className: "dk-results", "aria-label": t("docker.result.title") }, /* @__PURE__ */ React.createElement(ResultBody, { api, kind, payload })))
  );
}
function renderDockerTool(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") {
    return null;
  }
  const rawName = context.toolCall.originalToolName ?? context.toolCall.name;
  const key = rawName.slice(rawName.lastIndexOf("-") + 1);
  const kind = KINDS[key];
  if (!kind) return null;
  return /* @__PURE__ */ React.createElement(DockerCard, { api, toolCall: context.toolCall, kind });
}
export {
  renderDockerTool
};
