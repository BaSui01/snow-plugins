// Generated from src/ by scripts/build.mjs — edit TypeScript sources, not this file.
// Derived from Snow App, Copyright (c) 2026 MayMay, MIT. See LICENSE and NOTICE.

// src/runtime.ts
var React = window.SnowAppPlugin.React;
var { useMemo, useState, createContext, useContext } = React;

// src/api.tsx
var ApiContext = createContext(null);
function useApi() {
  const api = useContext(ApiContext);
  if (!api) throw new Error("Tool renderer requires a per-card API Provider");
  api.signal.throwIfAborted();
  return api;
}
function icon(name) {
  return function HostIcon(props) {
    const api = useApi();
    const Icon = api.ui.icon(name);
    return Icon ? React.createElement(Icon, props) : null;
  };
}
var AlertCircle = icon("AlertCircle");
var ExternalLink = icon("ExternalLink");
var FileText = icon("FileText");
var Globe = icon("Globe");
var Loader2 = icon("Loader2");
var Search = icon("Search");
var CheckCircle2 = icon("CheckCircle2");
var Database = icon("Database");
var KeyRound = icon("KeyRound");
var ListTree = icon("ListTree");
var Play = icon("Play");
var Table2 = icon("Table2");
var TerminalSquare = icon("TerminalSquare");

// src/mcp.ts
var PAGE_SIZE = 20;
var TEXT_PAGE_SIZE = 12e3;
var MAX_JSON_CHARS = 8 * 1024 * 1024;
var HIDDEN = "[redacted]";
var BINARY = "[binary omitted]";
var isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function parseJson(text) {
  if (!text || text.length > MAX_JSON_CHARS) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
var secretKey = /password|passwd|secret|token|cookie|auth|headers|api[-_]?key|private[-_]?key|credential|session[-_]?id|confirm[-_]?token/i;
var inputKey = /^(text|value|values|fields|elements|script|function|prompt|body|requestBody|content|input|data|payload|payload_text|payload_base64|raw|code|command|sql)$/i;
function hiddenKey(key, parameters = false) {
  return secretKey.test(key) || parameters && inputKey.test(key);
}
function safeText(text) {
  return text.replace(/data:[^\s,;]+;base64,[a-z0-9+/=\s]+/gi, BINARY).replace(/[a-z0-9+/]{256,}={0,2}/gi, BINARY).replace(/\b(?:Bearer|Basic)\s+[a-z0-9._~+/=-]+/gi, HIDDEN).replace(/((?:["']?(?:password|passwd|secret|token|cookies?|authorization|headers|api[-_]?key|private[-_]?key)["']?)\s*[:=]\s*)([^\r\n,;]+)/gi, `$1${HIDDEN}`).replace(/(https?:\/\/)[^\s/]+@/gi, `$1${HIDDEN}@`).replace(/([?&](?:[^=&\s]*(?:token|key|secret|password|auth|cookie)[^=&\s]*)=)[^&#\s]+/gi, `$1${HIDDEN}`);
}
function safeUrl(value) {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0020]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some((key) => hiddenKey(key))) return null;
    return url.href;
  } catch {
    return null;
  }
}
function preview(value, key = "", parameters = false) {
  if (hiddenKey(key, parameters)) return HIDDEN;
  if (typeof value === "string") return safeText(value).slice(0, 300);
  if (Array.isArray(value)) return `[${value.length}]`;
  if (isRecord(value)) return `{${Object.keys(value).length}}`;
  return String(value);
}
function failed(value, depth = 0) {
  if (!isRecord(value) || depth > 8) return false;
  if (value.isError === true || value.success === false || value.status === "failed" || value.status === "error") return true;
  if (value.error !== void 0 && value.error !== null && value.error !== false && value.error !== "") return true;
  for (const key of ["structuredContent", "data", "result"]) {
    if (failed(value[key], depth + 1)) return true;
  }
  if (Array.isArray(value.content)) {
    return value.content.some((part) => isRecord(part) && (failed(part, depth + 1) || part.type === "text" && failed(parseJson(typeof part.text === "string" ? part.text : void 0), depth + 1)));
  }
  return false;
}
function contentBlock(part, index) {
  if (!isRecord(part)) return { label: `content[${index}]`, kind: "value", value: part };
  if (part.type === "image") return { label: `content[${index}] · image`, kind: "image", value: part };
  if (part.type === "text" && typeof part.text === "string") {
    const extra = Object.fromEntries(Object.entries(part).filter(([key]) => key !== "text" && key !== "type"));
    return { label: `content[${index}] · text`, kind: "value", value: Object.keys(extra).length ? { text: parseJson(part.text), ...extra } : parseJson(part.text) };
  }
  if (part.type === "resource" && isRecord(part.resource)) {
    const resource = { ...part.resource };
    if (typeof resource.text === "string") resource.text = parseJson(resource.text);
    return { label: `content[${index}] · resource`, kind: "value", value: { ...part, resource } };
  }
  return { label: `content[${index}] · ${typeof part.type === "string" ? safeText(part.type).slice(0, 60) : "unknown"}`, kind: "value", value: part };
}
function parseMcp(result) {
  if (result === void 0 || result === "") return { blocks: [], failed: false, bounded: false };
  const root = parseJson(result);
  let envelope = root;
  let transportKey;
  if (isRecord(root) && !Array.isArray(root.content) && root.structuredContent === void 0) {
    for (const key of ["result", "data"]) {
      const value = root[key];
      if (isRecord(value) && (Array.isArray(value.content) || value.structuredContent !== void 0)) {
        envelope = value;
        transportKey = key;
        break;
      }
    }
  }
  const blocks = [];
  if (isRecord(envelope) && (Array.isArray(envelope.content) || envelope.structuredContent !== void 0)) {
    if (envelope.structuredContent !== void 0) blocks.push({ label: "structuredContent", kind: "value", value: envelope.structuredContent });
    if (Array.isArray(envelope.content)) {
      envelope.content.forEach((part, index) => blocks.push(contentBlock(part, index)));
    }
    const fields = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "content" && key !== "structuredContent"));
    if (Object.keys(fields).length) blocks.push({ label: "envelope", kind: "value", value: fields });
    if (root !== envelope && isRecord(root)) blocks.push({ label: "transport", kind: "value", value: Object.fromEntries(Object.entries(root).filter(([key]) => key !== transportKey)) });
  } else blocks.push({ label: "result", kind: "value", value: root });
  return { blocks, failed: failed(root), bounded: result.length > MAX_JSON_CHARS };
}
function candidates(blocks) {
  const output = [];
  const visit = (value, depth) => {
    if (!isRecord(value) || depth > 5 || output.length >= 80) return;
    output.push(value);
    for (const key of ["data", "result", "text", "resource"]) visit(value[key], depth + 1);
  };
  for (const block of blocks.slice(0, 80)) if (block.kind === "value") visit(block.value, 0);
  return output;
}
function searchGroups(records) {
  const groups = [];
  const seen = /* @__PURE__ */ new Set();
  for (const record of records) {
    for (const name of ["web", "news", "images", "results"]) {
      const field = record[name];
      const items = Array.isArray(field) ? field : isRecord(field) && Array.isArray(field.results) ? field.results : null;
      if (items && !seen.has(items)) {
        seen.add(items);
        groups.push({ name, items });
      }
    }
  }
  return groups;
}
function inlineImage(value) {
  if (!isRecord(value) || typeof value.data !== "string" || typeof value.mimeType !== "string") return null;
  const { data, mimeType } = value;
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType) || data.length < 16 || data.length > 2 * 1024 * 1024 || data.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return null;
  try {
    const prefix = atob(data.slice(0, 64));
    const byte = (index) => prefix.charCodeAt(index);
    const png = mimeType === "image/png" && prefix.startsWith("PNG\r\n\n");
    const gif = mimeType === "image/gif" && (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a"));
    const jpeg = mimeType === "image/jpeg" && byte(0) === 255 && byte(1) === 216 && byte(2) === 255;
    const webp = mimeType === "image/webp" && prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP";
    if (!png && !gif && !jpeg && !webp) return null;
    if (png || gif) {
      const u32 = (offset) => byte(offset) * 16777216 + byte(offset + 1) * 65536 + byte(offset + 2) * 256 + byte(offset + 3);
      const width = png ? u32(16) : byte(6) + byte(7) * 256;
      const height = png ? u32(20) : byte(8) + byte(9) * 256;
      if (!width || !height || width > 8192 || height > 8192 || width * height > 16e6) return null;
    }
    return { src: `data:${mimeType};base64,${data}`, bytes: Math.floor(data.length * 3 / 4) };
  } catch {
    return null;
  }
}

// src/summaries.ts
var MAX_SUMMARY = 400;
var COUNT_KEYS = /* @__PURE__ */ new Set([
  "urls",
  "queries",
  "search_queries",
  "messages",
  "command",
  "elements",
  "fields",
  "args",
  "paths",
  "sources",
  "categories",
  "formats",
  "schemas",
  "children",
  "properties",
  "sorts",
  "includeDomains",
  "excludeDomains",
  "select_paths",
  "select_domains",
  "include_domains",
  "exclude_domains",
  "search_domain_filter",
  "types",
  "resourceTypes",
  "include",
  "labels",
  "fieldsToInclude"
]);
var PROVIDER_FIELDS = {
  anysearch: ["query", "q", "url", "urls", "domains", "domain", "sub_domain", "sub_domain_params", "feedbacks", "count", "max_results", "search_depth"],
  dbx: ["sql", "command", "script", "connection_id", "connection_name", "database", "schema", "table", "object", "topic", "limit"],
  firecrawl: ["url", "query", "formats", "limit", "sources", "categories", "onlyMainContent", "maxAge", "filePath", "prompt", "view", "id"],
  chrome: ["pageId", "uid", "url", "type", "text", "value", "reqid", "function", "format", "fullPage", "resourceTypes", "timeout"],
  playwright: ["url", "target", "action", "text", "index", "level", "static", "filename", "fullPage", "depth", "function"],
  context7: ["libraryName", "libraryId", "query", "language"],
  github: ["owner", "repo", "path", "query", "method", "resource_id", "issue_number", "pull_number", "branch", "ref", "sha", "state", "perPage", "type"],
  exa: ["query", "numResults", "objective", "urls", "maxCharacters", "category"],
  brave: ["query", "count", "country", "search_lang", "freshness", "key", "latitude", "longitude", "location"],
  duckduckgo: ["query", "count", "safeSearch"],
  jina: ["query", "url", "question", "num", "page", "ocr", "withAllImages", "withAllLinks"],
  tavily: ["query", "url", "urls", "input", "instructions", "search_depth", "topic", "max_results", "model", "extract_depth", "format", "limit", "max_depth"],
  parallel: ["objective", "search_queries", "urls", "full_content", "allow_live_fetch", "model_name"],
  serpapi: ["q", "engine", "location", "num", "output"],
  kagi: ["query", "workflow", "limit", "extract_count", "url", "lens_id", "time_relative"],
  linkup: ["query", "depth", "maxResults", "mode", "reasoningDepth", "id", "url", "fromDate", "toDate"],
  searxng: ["query", "pageno", "language", "time_range", "num_results", "categories", "engines", "response_format", "url", "maxLength"],
  supabase: ["project_id", "query", "name", "schemas", "table", "type", "id", "branch_id", "organization_id", "region"],
  postman: ["collectionId", "workspaceId", "workspace", "environmentId", "elementType", "limit", "cursor", "type"],
  linear: ["query", "teamId", "id", "title", "assigneeId", "stateId", "priority", "limit", "projectId"],
  sentry: ["organizationSlug", "projectSlug", "query", "issueId", "issueUrl", "status", "limit", "name", "arguments", "sort"],
  gitlab: ["project_id", "merge_request_iid", "issue_iid", "branch", "file_path", "ref", "group_id", "per_page", "page", "namespace", "name"],
  docker: ["args", "namespace", "repository", "tag", "query", "container", "image", "name"],
  k8s: ["namespace", "name", "pod", "container", "apiVersion", "kind", "context", "labelSelector", "command", "image", "resource", "scale", "tail"],
  notion: ["page_id", "block_id", "data_source_id", "database_id", "query", "parent", "properties", "type", "filter", "page_size"]
};
var GENERIC_FIELDS = [
  "query",
  "q",
  "search_query",
  "url",
  "urls",
  "objective",
  "libraryName",
  "owner",
  "repo",
  "project",
  "project_id",
  "id",
  "name",
  "issue",
  "issue_id",
  "pull_number",
  "branch",
  "method",
  "container",
  "pod",
  "namespace",
  "database",
  "table",
  "path",
  "engine",
  "status",
  "action",
  "limit",
  "count",
  "max_results",
  "numResults"
];
var fieldLabel = (t, key) => t(`toolCall.field.${key}`, { defaultValue: key });
function describe(t, key, value) {
  if (value === void 0 || value === null || hiddenKey(key, true)) return null;
  if (Array.isArray(value)) return `${fieldLabel(t, key)}: ${value.length}`;
  if (isRecord(value)) {
    if (COUNT_KEYS.has(key)) return `${fieldLabel(t, key)}: ${Object.keys(value).length}`;
    return `${fieldLabel(t, key)}: ${preview(value, key, true)}`;
  }
  if (COUNT_KEYS.has(key)) return `${fieldLabel(t, key)}: ${String(value).length}`;
  return `${fieldLabel(t, key)}: ${preview(value, key, true)}`;
}
function orderedArgumentKeys(providerId, args) {
  const fields = PROVIDER_FIELDS[providerId] ?? GENERIC_FIELDS;
  const keys = Object.keys(args);
  const head = fields.filter((key) => keys.includes(key));
  const rest = keys.filter((key) => !head.includes(key)).sort();
  return [...head, ...rest];
}
function providerSummary(providerId, args, t) {
  const source = providerId === "serpapi" && isRecord(args.params) ? args.params : args;
  const fields = PROVIDER_FIELDS[providerId] ?? GENERIC_FIELDS;
  const parts = [];
  const seen = /* @__PURE__ */ new Set();
  for (const key of fields) {
    if (seen.has(key) || parts.length >= 8) continue;
    const text = describe(t, key, source[key]);
    if (text) {
      seen.add(key);
      parts.push(text);
    }
  }
  return parts.join(" · ").slice(0, MAX_SUMMARY);
}

// src/components.tsx
var hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
var isoStamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
var shortStamp = (text) => isoStamp.test(text) ? text.slice(0, 16).replace("T", " ") : text;
function Pager({
  total,
  page,
  onPage,
  size = PAGE_SIZE
}) {
  const { t } = useApi();
  if (total <= size) return null;
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-pager" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: page === 0,
      onClick: () => onPage(Math.max(0, page - 1))
    },
    t("toolCall.mcp.previous")
  ), /* @__PURE__ */ React.createElement("span", null, t("toolCall.mcp.range", {
    values: {
      start: page * size + 1,
      end: Math.min(total, (page + 1) * size),
      total
    }
  })), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: page >= last,
      onClick: () => onPage(Math.min(last, page + 1))
    },
    t("toolCall.mcp.next")
  ));
}
function SafeLink({ value, label }) {
  const api = useApi();
  const url = safeUrl(value);
  if (!url) return null;
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "mcp-link",
      type: "button",
      title: url,
      onClick: () => api.links.open(url, "browser")
    },
    safeText(label || url).slice(0, 180)
  );
}
function TextValue({ value }) {
  const { t } = useApi();
  const text = React.useMemo(() => safeText(value), [value]);
  const [expanded, setExpanded] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  const page = Math.min(
    requested,
    Math.max(0, Math.ceil(text.length / TEXT_PAGE_SIZE) - 1)
  );
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-text" }, /* @__PURE__ */ React.createElement("pre", null, expanded ? text.slice(page * TEXT_PAGE_SIZE, (page + 1) * TEXT_PAGE_SIZE) : text.slice(0, 600)), text.length > 600 && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      "aria-expanded": expanded,
      onClick: () => setExpanded(!expanded)
    },
    t(expanded ? "toolCall.mcp.collapse" : "toolCall.mcp.fullText"),
    " ·",
    " ",
    text.length
  ), expanded && /* @__PURE__ */ React.createElement(
    Pager,
    {
      total: text.length,
      page,
      size: TEXT_PAGE_SIZE,
      onPage: setPage
    }
  ), /* @__PURE__ */ React.createElement(SafeLink, { value }));
}
function Value({
  value,
  field = "",
  parameters = false,
  depth = 0
}) {
  const { t } = useApi();
  const [open, setOpen] = React.useState(false);
  const [continueDeep, setContinueDeep] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  if (hiddenKey(field, parameters))
    return /* @__PURE__ */ React.createElement("code", { className: "mcp-muted" }, t("toolCall.mcp.redacted"));
  if (field === "blob" || field === "base64" || field === "data" && typeof value === "string" && value.length > 128 && /^[a-z0-9+/]+=*$/i.test(value))
    return /* @__PURE__ */ React.createElement("code", { className: "mcp-muted" }, BINARY);
  if (typeof value === "string") return /* @__PURE__ */ React.createElement(TextValue, { value });
  if (!Array.isArray(value) && !isRecord(value))
    return /* @__PURE__ */ React.createElement("code", null, String(value));
  const keys = Array.isArray(value) ? null : Object.keys(value);
  const total = keys ? keys.length : value.length;
  const page = Math.min(
    requested,
    Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)
  );
  const start = page * PAGE_SIZE;
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-tree" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": open, onClick: () => setOpen(!open) }, open ? "▾" : "▸", " ", Array.isArray(value) ? "[ ]" : "{ }", " · ", total, " ", t("toolCall.mcp.items")), open && depth >= 32 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      "aria-expanded": continueDeep,
      onClick: () => setContinueDeep(!continueDeep)
    },
    t("toolCall.mcp.continueDepth")
  ), continueDeep && /* @__PURE__ */ React.createElement(Value, { value, field, parameters })), open && depth < 32 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "mcp-fields" }, Array.from(
    { length: Math.min(PAGE_SIZE, total - start) },
    (_, offset) => {
      const index = start + offset;
      const key = keys ? keys[index] : String(index);
      const child = keys ? value[key] : value[index];
      return /* @__PURE__ */ React.createElement("div", { className: "mcp-field", key }, /* @__PURE__ */ React.createElement("span", { className: "mcp-key" }, safeText(key).slice(0, 100)), /* @__PURE__ */ React.createElement(
        Value,
        {
          value: child,
          field: key,
          parameters,
          depth: depth + 1
        }
      ));
    }
  )), /* @__PURE__ */ React.createElement(Pager, { total, page, onPage: setPage })));
}
function ParamValue({
  field,
  value
}) {
  const api = useApi();
  const { t } = api;
  if (hiddenKey(field, true))
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.mcp.redacted"));
  if (typeof value === "string") {
    const url = safeUrl(value);
    if (url)
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "mcp-param-link",
          title: url,
          onClick: () => api.links.open(url, "browser")
        },
        safeText(value).slice(0, 140)
      );
    if (!value) return /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, "—");
    const text = field.endsWith("_at") || field === "date" ? shortStamp(value) : value;
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-param-text", title: value }, safeText(text).slice(0, 400));
  }
  if (typeof value === "number" || typeof value === "boolean")
    return /* @__PURE__ */ React.createElement("code", { className: "mcp-param-code" }, String(value));
  if (Array.isArray(value)) {
    if (!value.length) return /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, "—");
    const flat = value.every(
      (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    );
    return /* @__PURE__ */ React.createElement("div", { className: "mcp-param-group" }, /* @__PURE__ */ React.createElement("span", { className: "mcp-param-count" }, "[", value.length, "]"), flat && /* @__PURE__ */ React.createElement("span", { className: "mcp-param-chips" }, value.slice(0, 6).map((item, index) => /* @__PURE__ */ React.createElement("code", { key: index }, safeText(String(item)).slice(0, 80))), value.length > 6 && /* @__PURE__ */ React.createElement("span", { className: "mcp-param-more" }, "+", value.length - 6)), !flat && /* @__PURE__ */ React.createElement("details", { className: "mcp-param-details" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.mcp.details")), /* @__PURE__ */ React.createElement(Value, { value, field, parameters: true })));
  }
  if (isRecord(value)) {
    const size = Object.keys(value).length;
    if (!size) return /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, "—");
    return /* @__PURE__ */ React.createElement("div", { className: "mcp-param-group" }, /* @__PURE__ */ React.createElement("span", { className: "mcp-param-count" }, `{${size}}`), /* @__PURE__ */ React.createElement("details", { className: "mcp-param-details" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.mcp.details")), /* @__PURE__ */ React.createElement(Value, { value, field, parameters: true })));
  }
  return /* @__PURE__ */ React.createElement(Value, { value, field, parameters: true });
}
function ParamTable({
  providerId,
  args
}) {
  const { t } = useApi();
  const keys = React.useMemo(
    () => orderedArgumentKeys(providerId, args),
    [providerId, args]
  );
  return /* @__PURE__ */ React.createElement("dl", { className: "mcp-params" }, keys.map((key) => /* @__PURE__ */ React.createElement("div", { className: "mcp-param", key }, /* @__PURE__ */ React.createElement("dt", null, t(`toolCall.field.${key}`, { defaultValue: key })), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement(ParamValue, { field: key, value: args[key] })))));
}
var checkpointLine = /^\s*\[checkpoint\]\s*/;
function OutputSection({
  label,
  value
}) {
  const lines = React.useMemo(
    () => safeText(value).split(/\r?\n/).filter((line) => line.trim() !== ""),
    [value]
  );
  if (lines.length > 0 && lines.every((line) => checkpointLine.test(line))) {
    return /* @__PURE__ */ React.createElement("div", { className: "mcp-notice-list" }, lines.map((line, index) => /* @__PURE__ */ React.createElement("div", { className: "mcp-notice", key: index }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 12 }), /* @__PURE__ */ React.createElement("span", null, line.replace(checkpointLine, "")))));
  }
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-output" }, /* @__PURE__ */ React.createElement("h4", null, label), /* @__PURE__ */ React.createElement(TextValue, { value }));
}

// src/AnysearchToolCall.tsx
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asString = (value) => typeof value === "string" && value.trim() !== "" ? value : void 0;
var parseArgs = (args) => {
  try {
    const parsed = JSON.parse(args);
    return isRecord2(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
var parseResult = (result) => {
  if (!result) {
    return { type: "empty" };
  }
  try {
    const parsed = JSON.parse(result);
    if (!isRecord2(parsed)) {
      return { type: "raw", text: result };
    }
    if (typeof parsed.error === "string") {
      return { type: "error", message: parsed.error };
    }
    return { type: "success", data: parsed };
  } catch {
    return { type: "raw", text: result };
  }
};
var mcpText = (data) => {
  const content = Array.isArray(data.content) ? data.content : [];
  for (const part of content) {
    if (isRecord2(part) && part.type === "text") {
      const text = asString(part.text);
      if (text) {
        return text;
      }
    }
  }
  return void 0;
};
var truncate = (value, max = 56) => value.length > max ? `${value.slice(0, max)}...` : value;
var hostOf2 = (url) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};
var QUERY_HEADING = /^##\s+Query\s+\d+\s*:\s*(.*)$/;
var ITEM_HEADING = /^###\s+(?:\d+\.\s*)?(.+)$/;
var URL_LINE = /^-\s+\*\*URL\*\*\s*:\s*(\S+)/;
var parseSearchSections = (text) => {
  const sections = [];
  let current = null;
  let currentItem = null;
  const flushItem = () => {
    if (currentItem && current && currentItem.url) {
      current.items.push(currentItem);
    }
    currentItem = null;
  };
  const flushSection = () => {
    flushItem();
    if (current && (current.items.length > 0 || current.query)) {
      sections.push(current);
    }
    current = null;
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line === "---") {
      continue;
    }
    const queryMatch = line.match(QUERY_HEADING);
    if (queryMatch) {
      flushSection();
      current = { query: queryMatch[1].trim(), items: [] };
      continue;
    }
    if (line.startsWith("## ")) {
      continue;
    }
    const itemMatch = line.match(ITEM_HEADING);
    if (itemMatch) {
      flushItem();
      if (!current) {
        current = { items: [] };
      }
      currentItem = { title: itemMatch[1].trim(), url: "", snippet: "" };
      continue;
    }
    if (!currentItem) {
      continue;
    }
    const urlMatch = line.match(URL_LINE);
    if (urlMatch) {
      currentItem.url = urlMatch[1];
      continue;
    }
    if (line.startsWith("- ")) {
      const part = line.slice(2).trim();
      currentItem.snippet = currentItem.snippet ? `${currentItem.snippet} ${part}` : part;
    }
  }
  flushSection();
  return sections;
};
var parseResultSummary = (text) => {
  const match = text.match(
    /^##\s+Search Results\s*\((\d+)\s+results?(?:,\s*([\d.]+)\s*ms)?\)/im
  );
  if (!match) {
    return {};
  }
  const total = Number(match[1]);
  const elapsedMs = match[2] !== void 0 ? Number(match[2]) : void 0;
  return {
    total: Number.isFinite(total) ? total : void 0,
    elapsedMs: elapsedMs !== void 0 && Number.isFinite(elapsedMs) ? elapsedMs : void 0
  };
};
var parseExtract = (data, text) => {
  let candidate = isRecord2(
    data.structuredContent
  ) ? data.structuredContent : null;
  if (!candidate && text) {
    try {
      const parsed = JSON.parse(text);
      if (isRecord2(parsed)) {
        candidate = parsed;
      }
    } catch {
      candidate = null;
    }
  }
  if (!candidate) {
    return null;
  }
  const url = asString(candidate.url);
  if (!url) {
    return null;
  }
  return {
    url,
    title: asString(candidate.title) ?? "",
    content: asString(candidate.content) ?? ""
  };
};
var DOMAIN_HEADING = /^##\s+(\S+)\s+Domain Capabilities\s*\((\d+)\s+available\)/i;
var CAPABILITY_HEADING = /^###\s+(.+)$/;
var PARAM_LINE = /^-\s+`([^`]+)`\s*(\(required\))?\s*:?\s*(.*)$/;
var parseDomainSections = (text) => {
  const sections = [];
  let current = null;
  let currentCap = null;
  let inParams = false;
  const flushCap = () => {
    if (currentCap && current) {
      current.entries.push(currentCap);
    }
    currentCap = null;
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    const domainMatch = line.match(DOMAIN_HEADING);
    if (domainMatch) {
      flushCap();
      current = { domain: domainMatch[1], entries: [] };
      sections.push(current);
      inParams = false;
      continue;
    }
    const capMatch = line.match(CAPABILITY_HEADING);
    if (capMatch && current) {
      flushCap();
      currentCap = { name: capMatch[1].trim(), description: "", params: [] };
      inParams = false;
      continue;
    }
    if (!currentCap) {
      continue;
    }
    if (line.startsWith("**Parameters")) {
      inParams = true;
      continue;
    }
    if (inParams) {
      const paramMatch = line.match(PARAM_LINE);
      if (paramMatch) {
        currentCap.params.push({
          name: paramMatch[1].trim(),
          required: paramMatch[2] !== void 0,
          description: paramMatch[3].trim()
        });
      }
      continue;
    }
    if (!line.startsWith("**") && !line.startsWith("#")) {
      currentCap.description = currentCap.description ? `${currentCap.description} ${line}` : line;
    }
  }
  flushCap();
  return sections;
};
var ResultItem = ({
  item,
  index,
  onOpenInApp,
  onOpenExternal,
  openInBrowserTitle,
  openExternalTitle
}) => /* @__PURE__ */ React.createElement("article", { className: "tool-call-websearch-result" }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-result-head" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-result-index", "aria-hidden": "true" }, index + 1), /* @__PURE__ */ React.createElement(
  "button",
  {
    type: "button",
    className: "tool-call-websearch-result-title",
    onClick: () => onOpenInApp(item.url),
    title: `${item.url}
${openInBrowserTitle}`
  },
  /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-result-title-text" }, item.title)
), /* @__PURE__ */ React.createElement(
  "button",
  {
    type: "button",
    className: "tool-call-websearch-external",
    onClick: () => onOpenExternal(item.url),
    title: openExternalTitle,
    "aria-label": openExternalTitle
  },
  /* @__PURE__ */ React.createElement(ExternalLink, { size: 11, "aria-hidden": "true" })
)), /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-result-url" }, /* @__PURE__ */ React.createElement(Globe, { size: 10, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, hostOf2(item.url))), item.snippet ? /* @__PURE__ */ React.createElement("p", { className: "tool-call-websearch-result-snippet" }, item.snippet) : null);
var AnysearchToolCall = ({
  toolCall
}) => {
  const api = useApi();
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const openInAppBrowser = (url) => api.links.open(url, "browser");
  const openExternalLink = (url) => api.links.open(url, "external");
  const operation = toolCall.name.replace(/^anysearch[-_](.+)$/, "$1").replace(/^anysearch[-_]/, "").replace(/_/g, "-");
  const parsedArgs = useMemo(
    () => parseArgs(toolCall.arguments),
    [toolCall.arguments]
  );
  const parsedResult = useMemo(
    () => parseResult(toolCall.result),
    [toolCall.result]
  );
  const [parametersOpen, setParametersOpen] = useState(false);
  const effectiveStatus = parsedResult.type === "error" ? "error" : toolCall.status;
  const isRunning = toolCall.status === "running";
  const data = parsedResult.type === "success" ? parsedResult.data : null;
  const contentTextValue = data !== null ? mcpText(data) : parsedResult.type === "raw" ? parsedResult.text : void 0;
  const sections = useMemo(
    () => contentTextValue ? parseSearchSections(contentTextValue) : [],
    [contentTextValue]
  );
  const resultSummary = useMemo(
    () => contentTextValue ? parseResultSummary(contentTextValue) : {},
    [contentTextValue]
  );
  const extractResult = useMemo(
    () => data ? parseExtract(data, contentTextValue) : null,
    [data, contentTextValue]
  );
  const domainSections = useMemo(
    () => operation === "get-sub-domains" && contentTextValue ? parseDomainSections(contentTextValue) : [],
    [operation, contentTextValue]
  );
  let displayName;
  let meta = null;
  switch (operation) {
    case "search": {
      const query = asString(parsedArgs?.query);
      displayName = query ? truncate(query.replace(/\s+/g, " ")) : void 0;
      const itemCount = sections[0]?.items.length ?? 0;
      const total = resultSummary.total ?? itemCount;
      meta = parsedResult.type === "success" ? /* @__PURE__ */ React.createElement(
        "span",
        {
          className: `tool-call-websearch-count ${total > 0 ? "tool-call-websearch-count-active" : ""}`
        },
        t("toolCall.anysearch.resultCount", {
          values: { count: total }
        })
      ) : null;
      break;
    }
    case "batch-search": {
      const queries = Array.isArray(parsedArgs?.queries) ? parsedArgs.queries : [];
      const firstQuery = isRecord2(queries[0]) ? asString(queries[0].query) : void 0;
      displayName = firstQuery ? truncate(firstQuery.replace(/\s+/g, " ")) : void 0;
      const groupCount = sections.length || queries.length;
      meta = groupCount > 0 ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-count tool-call-websearch-count-active" }, t("toolCall.anysearch.queryCount", {
        values: { count: groupCount }
      })) : null;
      break;
    }
    case "extract": {
      const argUrl = asString(parsedArgs?.url);
      const targetUrl = extractResult?.url ?? argUrl;
      displayName = targetUrl ? truncate(hostOf2(targetUrl), 60) : void 0;
      meta = extractResult && extractResult.content.length > 0 ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-count tool-call-websearch-count-active" }, t("toolCall.anysearch.charCount", {
        values: {
          count: extractResult.content.length.toLocaleString()
        }
      })) : null;
      break;
    }
    case "get-sub-domains": {
      const domains = Array.isArray(parsedArgs?.domains) ? parsedArgs.domains.map(String) : [];
      displayName = domains.length > 0 ? domains.join(", ") : void 0;
      const entryCount = domainSections.reduce(
        (sum, section) => sum + section.entries.length,
        0
      );
      meta = entryCount > 0 ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-count tool-call-websearch-count-active" }, t("toolCall.anysearch.capabilityCount", {
        values: { count: entryCount }
      })) : null;
      break;
    }
    default: {
      displayName = operation ? truncate(operation, 48) : void 0;
      break;
    }
  }
  const openInBrowserTitle = t("toolCall.anysearch.openInBrowser");
  const openExternalTitle = t("toolCall.anysearch.openExternal");
  const params = [];
  if (operation === "search" || operation === "batch-search") {
    const query = asString(parsedArgs?.query) ?? (Array.isArray(parsedArgs?.queries) ? isRecord2(parsedArgs.queries[0]) ? asString(parsedArgs.queries[0].query) : asString(parsedArgs.queries[0]) : void 0);
    const maxResults = parsedArgs?.maxResults ?? parsedArgs?.max_results ?? parsedArgs?.count;
    const subDomain = asString(parsedArgs?.sub_domain) ?? asString(parsedArgs?.domain);
    if (query) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item", key: "query" }, /* @__PURE__ */ React.createElement(Search, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.query")), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, query))
      );
    }
    if (typeof maxResults === "number" || subDomain) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-tags", key: "tags" }, subDomain ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, subDomain) : null, typeof maxResults === "number" ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, t("toolCall.anysearch.maxResults"), ": ", maxResults) : null)
      );
    }
  } else if (operation === "extract") {
    const url = asString(parsedArgs?.url);
    if (url) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item", key: "url" }, /* @__PURE__ */ React.createElement(Globe, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.url")), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-value" }, url))
      );
    }
  } else if (operation === "get-sub-domains") {
    const domains = Array.isArray(parsedArgs?.domains) ? parsedArgs.domains.map(String) : asString(parsedArgs?.domain) ? [asString(parsedArgs?.domain)] : [];
    if (domains.length > 0) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item", key: "domains" }, /* @__PURE__ */ React.createElement(Search, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.domains")), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, domains.join(", ")))
      );
    }
  } else if (operation === "score") {
    const feedbacks = Array.isArray(parsedArgs?.feedbacks) ? parsedArgs.feedbacks.filter(isRecord2) : [];
    if (feedbacks.length > 0) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item", key: "feedbacks" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.feedbackCount", { defaultValue: "打分条目" })), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, feedbacks.length))
      );
    }
  }
  const scoreFeedbacks = operation === "score" && Array.isArray(parsedArgs?.feedbacks) ? parsedArgs.feedbacks.filter(isRecord2) : [];
  const hasStructuredContent = parsedResult.type === "success" && (operation === "search" || operation === "batch-search") && sections.length > 0 || operation === "extract" && extractResult !== null || operation === "get-sub-domains" && domainSections.length > 0 || operation === "score" && scoreFeedbacks.length > 0;
  const rawFallbackText = !hasStructuredContent ? contentTextValue ?? (data ? JSON.stringify(data, null, 2) : void 0) : void 0;
  return /* @__PURE__ */ React.createElement(
    ToolCallNode,
    {
      toolName: toolCall.name,
      badgeName: t(`toolCall.anysearch.op.${operation}`, { defaultValue: "" }) || t(`toolNames.${toolCall.name}`, { defaultValue: "" }) || operation || toolCall.name,
      category: "web",
      displayName,
      displayNameTitle: toolCall.arguments,
      status: effectiveStatus,
      meta,
      className: "snow-external-tool-renderer tool-call-websearch tool-call-anysearch"
    },
    /* @__PURE__ */ React.createElement("div", { className: "tool-call-body tool-call-websearch-body" }, params.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-params mcp-search-params-bar" }, params) : null, parsedArgs ? /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        "aria-expanded": parametersOpen,
        onClick: () => setParametersOpen(!parametersOpen)
      },
      t("toolCall.mcp.parameters", { defaultValue: "参数" })
    ) : null, parametersOpen && parsedArgs ? /* @__PURE__ */ React.createElement("section", { className: "mcp-params-section" }, /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, t("toolCall.mcp.parameterPrivacy", { defaultValue: "敏感参数已隐藏。" })), /* @__PURE__ */ React.createElement(ParamTable, { providerId: "anysearch", args: parsedArgs }), /* @__PURE__ */ React.createElement("details", { className: "mcp-param-details mcp-params-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.mcp.rawParameters", { defaultValue: "原始参数" })), /* @__PURE__ */ React.createElement(Value, { value: parsedArgs, parameters: true }))) : null, parsedResult.type === "error" ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-error" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 12, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, localizeToolError(t, parsedResult.message))) : null, operation === "search" && parsedResult.type === "success" && sections.length > 0 ? sections[0].items.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-results" }, sections[0].items.map((item, index) => /* @__PURE__ */ React.createElement(
      ResultItem,
      {
        key: `${item.url}-${index}`,
        item,
        index,
        onOpenInApp: openInAppBrowser,
        onOpenExternal: openExternalLink,
        openInBrowserTitle,
        openExternalTitle
      }
    ))) : /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-empty" }, /* @__PURE__ */ React.createElement(Search, { size: 14, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, t("toolCall.anysearch.noResults"))) : null, operation === "batch-search" && parsedResult.type === "success" && sections.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-sections" }, sections.map((section, sectionIndex) => /* @__PURE__ */ React.createElement(
      "section",
      {
        className: "tool-call-anysearch-section",
        key: `${section.query ?? "query"}-${sectionIndex}`
      },
      /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-section-title" }, /* @__PURE__ */ React.createElement(Search, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, section.query ?? t("toolCall.anysearch.queryFallback", {
        values: { index: sectionIndex + 1 }
      })), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, t("toolCall.anysearch.resultCount", {
        values: { count: section.items.length }
      }))),
      section.items.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-results" }, section.items.map((item, index) => /* @__PURE__ */ React.createElement(
        ResultItem,
        {
          key: `${item.url}-${index}`,
          item,
          index,
          onOpenInApp: openInAppBrowser,
          onOpenExternal: openExternalLink,
          openInBrowserTitle,
          openExternalTitle
        }
      ))) : /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-empty" }, /* @__PURE__ */ React.createElement(Search, { size: 14, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, t("toolCall.anysearch.noResults")))
    ))) : null, operation === "extract" && extractResult ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-page" }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-page-title" }, /* @__PURE__ */ React.createElement(FileText, { size: 13, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "tool-call-websearch-page-title-text",
        title: extractResult.title || void 0
      },
      extractResult.title || hostOf2(extractResult.url)
    )), /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-page-link-row" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "tool-call-websearch-page-link",
        onClick: () => openInAppBrowser(extractResult.url),
        title: `${extractResult.url}
${openInBrowserTitle}`
      },
      /* @__PURE__ */ React.createElement(Globe, { size: 10, "aria-hidden": "true" }),
      /* @__PURE__ */ React.createElement("span", null, hostOf2(extractResult.url))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "tool-call-websearch-external",
        onClick: () => openExternalLink(extractResult.url),
        title: openExternalTitle,
        "aria-label": openExternalTitle
      },
      /* @__PURE__ */ React.createElement(ExternalLink, { size: 10, "aria-hidden": "true" })
    ))), extractResult.content ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-preview-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-section-label" }, t("toolCall.anysearch.preview")), /* @__PURE__ */ React.createElement("pre", { className: "tool-call-websearch-preview" }, truncate(extractResult.content, 600))), /* @__PURE__ */ React.createElement("details", { className: "tool-call-websearch-full" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.anysearch.fullContent"), extractResult.content.includes(
      "[Content truncated...]"
    ) ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-truncated" }, t("toolCall.anysearch.truncated")) : null), /* @__PURE__ */ React.createElement("pre", { className: "tool-call-section-pre" }, extractResult.content))) : /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-empty" }, /* @__PURE__ */ React.createElement(FileText, { size: 14, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, t("toolCall.anysearch.noContent")))) : null, operation === "get-sub-domains" && domainSections.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-caps" }, domainSections.map((section) => /* @__PURE__ */ React.createElement(
      "section",
      {
        className: "tool-call-anysearch-cap-group",
        key: section.domain
      },
      /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-section-title" }, /* @__PURE__ */ React.createElement(Search, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, section.domain), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, t("toolCall.anysearch.capabilityCount", {
        values: { count: section.entries.length }
      }))),
      section.entries.map((entry) => /* @__PURE__ */ React.createElement("article", { className: "tool-call-anysearch-cap", key: entry.name }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-cap-name" }, entry.name), entry.description ? /* @__PURE__ */ React.createElement("p", { className: "tool-call-anysearch-cap-desc" }, entry.description) : null, entry.params.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-cap-params" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-section-label" }, t("toolCall.anysearch.parameters")), entry.params.map((param) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "tool-call-anysearch-cap-param",
          key: param.name
        },
        /* @__PURE__ */ React.createElement("code", { className: "tool-call-anysearch-cap-param-name" }, param.name),
        param.required ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, t("toolCall.anysearch.required")) : null,
        param.description ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-anysearch-cap-param-desc" }, param.description) : null
      ))) : null))
    ))) : null, operation === "score" && scoreFeedbacks.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-anysearch-score-list" }, scoreFeedbacks.map((fb, idx) => {
      const scoreNum = Number(fb.score) || 0;
      return /* @__PURE__ */ React.createElement("div", { key: idx, className: "tool-call-anysearch-score-item" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 12, className: "tool-call-icon-success", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-anysearch-score-id" }, String(fb.request_id || "req")), /* @__PURE__ */ React.createElement("span", { className: "tool-call-anysearch-score-stars" }, "★".repeat(Math.max(0, Math.min(5, scoreNum))) + "☆".repeat(Math.max(0, 5 - Math.max(0, Math.min(5, scoreNum))))), /* @__PURE__ */ React.createElement("span", { className: "tool-call-anysearch-score-val" }, scoreNum, "/5"));
    })) : null, rawFallbackText ? /* @__PURE__ */ React.createElement("section", { className: "tool-call-section" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-section-label" }, t("toolCall.anysearch.result")), /* @__PURE__ */ React.createElement(TextValue, { value: rawFallbackText })) : null, hasStructuredContent && (contentTextValue || data) ? /* @__PURE__ */ React.createElement("details", { className: "mcp-raw-blocks-toggle" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.mcp.viewRawBlocks", { defaultValue: "查看原始响应数据" })), /* @__PURE__ */ React.createElement(TextValue, { value: contentTextValue ?? JSON.stringify(data, null, 2) })) : null, toolCall.streamingStdout && /* @__PURE__ */ React.createElement(OutputSection, { label: "stdout", value: toolCall.streamingStdout }), toolCall.streamingStderr && /* @__PURE__ */ React.createElement(OutputSection, { label: "stderr", value: toolCall.streamingStderr }), parsedResult.type === "empty" ? /* @__PURE__ */ React.createElement(
      "div",
      {
        className: `tool-call-websearch-pending ${isRunning ? "tool-call-websearch-pending-running" : ""}`
      },
      isRunning ? /* @__PURE__ */ React.createElement(
        Loader2,
        {
          className: "tool-call-icon-spinning",
          size: 14,
          "aria-hidden": "true"
        }
      ) : /* @__PURE__ */ React.createElement(Globe, { size: 14, "aria-hidden": "true" }),
      /* @__PURE__ */ React.createElement("span", null, isRunning ? operation === "extract" ? t("toolCall.anysearch.extracting") : t("toolCall.anysearch.running") : t("toolCall.anysearch.waiting"))
    ) : null)
  );
};

// src/DbxToolCall.tsx
var isRecord3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asString2 = (value) => typeof value === "string" && value.trim() !== "" ? value : void 0;
var parseArgs2 = (args) => {
  try {
    const parsed = JSON.parse(args);
    return isRecord3(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
var contentErrorText = (data) => {
  const content = Array.isArray(data.content) ? data.content : [];
  for (const part of content) {
    if (isRecord3(part) && part.type === "text") {
      const text = asString2(part.text);
      if (text && /^Error\s*\[/.test(text)) {
        return text;
      }
    }
  }
  return void 0;
};
var parseResult2 = (result) => {
  if (!result) {
    return { type: "empty" };
  }
  try {
    const parsed = JSON.parse(result);
    if (!isRecord3(parsed)) {
      return { type: "raw", text: result };
    }
    if (typeof parsed.error === "string") {
      return { type: "error", message: parsed.error };
    }
    if (parsed.isError === true) {
      return { type: "error", message: contentErrorText(parsed) ?? result };
    }
    return { type: "success", data: parsed };
  } catch {
    return { type: "raw", text: result };
  }
};
var truncate2 = (value, max = 56) => value.length > max ? `${value.slice(0, max)}...` : value;
var parseQueryTable = (data) => {
  const extract = (candidate) => {
    if (!isRecord3(candidate)) {
      return null;
    }
    if (Array.isArray(candidate.rows)) {
      return {
        rows: candidate.rows,
        columns: Array.isArray(candidate.columns) ? candidate.columns : null
      };
    }
    for (const field of ["result", "values", "queryResult"]) {
      if (Array.isArray(candidate[field])) {
        return { rows: candidate[field], columns: null };
      }
    }
    if (isRecord3(candidate.data) && Array.isArray(candidate.data.rows)) {
      return {
        rows: candidate.data.rows,
        columns: Array.isArray(candidate.data.columns) ? candidate.data.columns : null
      };
    }
    return null;
  };
  const extracted = extract(data) ?? (isRecord3(data.result) ? extract(data.result) : null);
  if (!extracted || extracted.rows.length === 0) {
    return null;
  }
  const rawRows = extracted.rows;
  const rawColumns = extracted.columns;
  if (isRecord3(rawRows[0])) {
    const columns2 = Object.keys(rawRows[0]);
    const rows2 = rawRows.map((row) => {
      if (!isRecord3(row)) {
        return [row];
      }
      return columns2.map((column) => row[column]);
    });
    return { columns: columns2, rows: rows2 };
  }
  const firstRow = rawRows[0];
  const columns = rawColumns && rawColumns.length > 0 ? rawColumns.map(String) : firstRow?.map((_, index) => `col${index + 1}`) ?? [];
  const rows = rawRows.map((row) => Array.isArray(row) ? row : [row]);
  return { columns, rows };
};
var parseMarkdownTable = (text) => {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (lines.length < 2) {
    return null;
  }
  const splitRow = (line) => line.slice(1, -1).split("|").map((cell) => cell.trim());
  const header = splitRow(lines[0]);
  const bodyLines = lines.slice(1).filter((line) => !/^\|[\s\-:|]+\|$/.test(line));
  if (header.length === 0) {
    return null;
  }
  const rows = bodyLines.map((line) => splitRow(line));
  return { columns: header, rows };
};
var contentText = (data) => {
  const content = Array.isArray(data.content) ? data.content : [];
  for (const part of content) {
    if (isRecord3(part)) {
      const text = asString2(part.text);
      if (text) {
        return text;
      }
    }
  }
  return void 0;
};
var parseContentTable = (data) => {
  const text = contentText(data);
  return text ? parseMarkdownTable(text) : null;
};
var DbxToolCall = ({
  toolCall
}) => {
  const api = useApi();
  const { t } = api;
  const { ToolCallNode, DataTableViewer, localizeToolError } = api.ui;
  const operation = toolCall.name.replace(/^dbx[-_](.+)$/, "$1").replace(/^dbx[-_]/, "").replace(/_/g, "-").replace(/^execute-redis-comman$/, "execute-redis-command");
  const parsedArgs = useMemo(
    () => parseArgs2(toolCall.arguments),
    [toolCall.arguments]
  );
  const parsedResult = useMemo(
    () => parseResult2(toolCall.result),
    [toolCall.result]
  );
  const [parametersOpen, setParametersOpen] = useState(false);
  const effectiveStatus = parsedResult.type === "error" ? "error" : toolCall.status;
  const data = parsedResult.type === "success" ? parsedResult.data : null;
  const queryTable = data ? parseQueryTable(data) ?? parseContentTable(data) : parsedResult.type === "raw" ? parseMarkdownTable(parsedResult.text) : null;
  const queryRowCount = queryTable?.rows.length;
  let displayName;
  let meta = null;
  switch (operation) {
    case "execute-query":
    case "execute-and-show": {
      const sql = asString2(parsedArgs?.sql);
      displayName = sql ? truncate2(sql.replace(/\s+/g, " ").trim()) : void 0;
      if (data) {
        const rowCount = typeof data.rowCount === "number" ? data.rowCount : Array.isArray(data.rows) ? data.rows.length : queryRowCount;
        meta = rowCount !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Table2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.rowCount", { values: { count: rowCount } })) : /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.done"));
      }
      break;
    }
    case "execute-redis-command": {
      const command = asString2(parsedArgs?.command);
      displayName = command ? truncate2(command) : void 0;
      const text = data ? contentText(data) : void 0;
      meta = text ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(KeyRound, { size: 10, "aria-hidden": "true" }), truncate2(text, 40)) : null;
      break;
    }
    case "describe-table": {
      const table = asString2(parsedArgs?.table);
      displayName = table;
      const columnCount = queryTable?.columns.length;
      meta = columnCount ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(ListTree, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.columnCount", { values: { count: columnCount } })) : null;
      break;
    }
    case "list-tables": {
      const database = asString2(parsedArgs?.database);
      displayName = database ?? t("toolCall.dbx.allTables");
      const tableText = data ? contentText(data) : void 0;
      const tableCount = tableText ? tableText.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- ")).length : void 0;
      meta = tableCount ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Table2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.tableCount", { values: { count: tableCount } })) : null;
      break;
    }
    case "list-connections": {
      displayName = t("toolCall.dbx.connections");
      const connectionCount = queryTable?.rows.length;
      meta = connectionCount ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Database, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.connectionCount", {
        values: { count: connectionCount }
      })) : null;
      break;
    }
    case "get-schema-context": {
      const tables = Array.isArray(parsedArgs?.tables) ? parsedArgs.tables.map(String) : [];
      displayName = tables.length > 0 ? tables.join(", ") : void 0;
      const contextText = data ? contentText(data) : void 0;
      const contextCount = contextText ? contextText.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("## ")).length : void 0;
      meta = contextCount ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Table2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.tableCount", {
        values: { count: contextCount }
      })) : null;
      break;
    }
    case "open-session": {
      const database = asString2(parsedArgs?.database);
      displayName = database ? truncate2(database, 32) : void 0;
      const openText = data ? contentText(data) : void 0;
      const sessionId = openText?.split("\n").map((line) => line.trim()).find((line) => line.startsWith("session_id:"))?.slice("session_id:".length).trim() ?? void 0;
      meta = sessionId ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(TerminalSquare, { size: 10, "aria-hidden": "true" }), truncate2(sessionId, 20)) : null;
      break;
    }
    case "close-session": {
      const sessionId = asString2(parsedArgs?.session_id);
      displayName = sessionId ? truncate2(sessionId, 32) : void 0;
      meta = data && data.closed !== false ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.closed")) : null;
      break;
    }
    // 事务控制三件套（DBX MCP 0.4.102 起注册，仅在启用事务的原生 MySQL
    // 会话上可用）：都以 session_id 为唯一参数，摘要展示会话标识。
    case "begin-transaction": {
      const sessionId = asString2(parsedArgs?.session_id);
      displayName = sessionId ? truncate2(sessionId, 32) : void 0;
      meta = data ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Play, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.started")) : null;
      break;
    }
    case "commit-transaction": {
      const sessionId = asString2(parsedArgs?.session_id);
      displayName = sessionId ? truncate2(sessionId, 32) : void 0;
      meta = data && data.committed !== false ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.committed")) : null;
      break;
    }
    case "rollback-transaction": {
      const sessionId = asString2(parsedArgs?.session_id);
      displayName = sessionId ? truncate2(sessionId, 32) : void 0;
      meta = data ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.rolledBack")) : null;
      break;
    }
    case "add-connection": {
      const name = asString2(parsedArgs?.name);
      displayName = name;
      meta = data && parsedResult.type === "success" ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.added")) : null;
      break;
    }
    case "remove-connection": {
      const name = asString2(parsedArgs?.connection_name);
      displayName = name;
      meta = data && data.removed !== false ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.removed")) : null;
      break;
    }
    case "open-table": {
      const table = asString2(parsedArgs?.table);
      displayName = table;
      meta = data && data.opened !== false ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.opened")) : null;
      break;
    }
    case "list-databases": {
      const connection = asString2(parsedArgs?.connection_name) ?? asString2(parsedArgs?.connection_id);
      displayName = connection;
      const databaseText = data ? contentText(data) : void 0;
      const databaseCount = databaseText ? databaseText.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- ")).length : queryTable?.rows.length;
      meta = databaseCount ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Database, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.databaseCount", { values: { count: databaseCount } })) : null;
      break;
    }
    case "duplicate-connection": {
      const connection = asString2(parsedArgs?.connection_name) ?? asString2(parsedArgs?.name);
      displayName = connection;
      meta = data ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.duplicated")) : null;
      break;
    }
    case "list-routines": {
      const schema = asString2(parsedArgs?.schema);
      displayName = schema ?? t("toolCall.dbx.allRoutines");
      const routineText = data ? contentText(data) : void 0;
      const routineCount = routineText ? routineText.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("- ")).length : queryTable?.rows.length;
      meta = routineCount ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(ListTree, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.routineCount", { values: { count: routineCount } })) : null;
      break;
    }
    case "get-routine-source": {
      const routine = asString2(parsedArgs?.name) ?? asString2(parsedArgs?.routine_name);
      displayName = routine;
      const sourceText = data ? contentText(data) : void 0;
      meta = sourceText ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(TerminalSquare, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.lineCount", {
        values: { count: sourceText.split("\n").length }
      })) : null;
      break;
    }
    case "execute-batch": {
      const script = asString2(parsedArgs?.script) ?? asString2(parsedArgs?.sql);
      displayName = script ? truncate2(script.replace(/\s+/g, " ").trim()) : void 0;
      if (data) {
        const rowCount = typeof data.rowCount === "number" ? data.rowCount : Array.isArray(data.rows) ? data.rows.length : queryRowCount;
        meta = rowCount !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(Table2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.rowCount", { values: { count: rowCount } })) : /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.done"));
      }
      break;
    }
    case "salesforce-current-user": {
      const connection = asString2(parsedArgs?.connection_name) ?? asString2(parsedArgs?.connection_id);
      displayName = connection;
      const userText = data ? contentText(data) : void 0;
      meta = userText ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(KeyRound, { size: 10, "aria-hidden": "true" }), truncate2(userText.replace(/\s+/g, " ").trim(), 40)) : null;
      break;
    }
    case "salesforce-prepare-write": {
      const recordObject = asString2(parsedArgs?.object) ?? asString2(parsedArgs?.sobject);
      displayName = recordObject ?? t("toolCall.dbx.op.salesforce-prepare-write");
      meta = data ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.prepared")) : null;
      break;
    }
    case "salesforce-apply-write": {
      displayName = t("toolCall.dbx.op.salesforce-apply-write");
      meta = data ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.applied")) : null;
      break;
    }
    case "peek-messages": {
      const topic = asString2(parsedArgs?.topic);
      displayName = topic;
      const messageCount = Array.isArray(data?.messages) ? data.messages.length : Array.isArray(data?.records) ? data.records.length : void 0;
      meta = messageCount !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(ListTree, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.messageCount", { values: { count: messageCount } })) : null;
      break;
    }
    case "send-message": {
      const topic = asString2(parsedArgs?.topic);
      displayName = topic;
      meta = data ? /* @__PURE__ */ React.createElement("span", { className: "tool-call-dbx-meta tool-call-dbx-meta-ok" }, /* @__PURE__ */ React.createElement(CheckCircle2, { size: 10, "aria-hidden": "true" }), t("toolCall.dbx.sent")) : null;
      break;
    }
    default: {
      displayName = operation ? truncate2(operation, 48) : void 0;
      break;
    }
  }
  const commandText = operation === "execute-query" || operation === "execute-and-show" ? asString2(parsedArgs?.sql) : operation === "execute-redis-command" ? asString2(parsedArgs?.command) : operation === "execute-batch" ? asString2(parsedArgs?.script) ?? asString2(parsedArgs?.sql) : void 0;
  const resultText = parsedResult.type === "success" ? (
    // content 包装优先取原始文本（保留真实换行，如 list-tables 的表名列表），
    // 无 content 时才回退 JSON 序列化。
    (data ? contentText(data) : void 0) ?? JSON.stringify(parsedResult.data, null, 2)
  ) : parsedResult.type === "raw" ? parsedResult.text : "";
  return /* @__PURE__ */ React.createElement(
    ToolCallNode,
    {
      toolName: toolCall.name,
      badgeName: t(`toolCall.dbx.op.${operation}`, { defaultValue: "" }) || t(`toolNames.${toolCall.name}`, { defaultValue: "" }) || operation || toolCall.name,
      category: "database",
      displayName,
      displayNameTitle: toolCall.arguments,
      status: effectiveStatus,
      meta,
      className: "snow-external-tool-renderer tool-call-dbx"
    },
    /* @__PURE__ */ React.createElement("div", { className: "tool-call-body tool-call-dbx-body" }, commandText ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-dbx-command" }, /* @__PURE__ */ React.createElement(Play, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("code", null, commandText)) : null, parsedArgs ? /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        "aria-expanded": parametersOpen,
        onClick: () => setParametersOpen(!parametersOpen)
      },
      t("toolCall.mcp.parameters", { defaultValue: "参数" })
    ) : null, parametersOpen && parsedArgs ? /* @__PURE__ */ React.createElement("section", { className: "mcp-params-section" }, /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, t("toolCall.mcp.parameterPrivacy", { defaultValue: "敏感参数已隐藏。" })), /* @__PURE__ */ React.createElement(ParamTable, { providerId: "dbx", args: parsedArgs }), /* @__PURE__ */ React.createElement("details", { className: "mcp-param-details mcp-params-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.mcp.rawParameters", { defaultValue: "原始参数" })), /* @__PURE__ */ React.createElement(Value, { value: parsedArgs, parameters: true }))) : null, queryTable ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-dbx-table-wrap" }, /* @__PURE__ */ React.createElement(
      DataTableViewer,
      {
        columns: queryTable.columns,
        rows: queryTable.rows,
        maxInitialRows: 20
      }
    )) : data && Array.isArray(data.rows) && data.rows.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-dbx-empty" }, /* @__PURE__ */ React.createElement(Database, { size: 14, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, t("toolCall.dbx.emptyResult"))) : null, parsedResult.type === "error" ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-error" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 12, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, localizeToolError(t, parsedResult.message))) : null, queryTable && resultText ? /* @__PURE__ */ React.createElement("details", { className: "mcp-raw-blocks-toggle" }, /* @__PURE__ */ React.createElement("summary", null, t("toolCall.mcp.viewRawBlocks", { defaultValue: "查看原始响应数据" })), /* @__PURE__ */ React.createElement(TextValue, { value: resultText })) : null, resultText && !queryTable ? /* @__PURE__ */ React.createElement("section", { className: "tool-call-section" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-section-label" }, t("toolCall.common.result")), /* @__PURE__ */ React.createElement(TextValue, { value: resultText })) : null, toolCall.streamingStdout && /* @__PURE__ */ React.createElement(OutputSection, { label: "stdout", value: toolCall.streamingStdout }), toolCall.streamingStderr && /* @__PURE__ */ React.createElement(OutputSection, { label: "stderr", value: toolCall.streamingStderr }))
  );
};

// src/Exa.ts
var MAX_TEXT_CHARS = 2e5;
var MAX_ITEMS = 200;
var MAX_BODY_CHARS = 4e3;
var MAX_BLOCKS = 20;
function searchText(text) {
  const items = [];
  for (const section of text.split(/\r?\n[ \t]*---[ \t]*\r?\n/).slice(0, MAX_ITEMS)) {
    const match = section.trim().match(/^Title: ([^\r\n]*)\r?\nURL: ([^\r\n]+)\r?\nPublished: ([^\r\n]*)\r?\nAuthor: ([^\r\n]*)(?:\r?\n([\s\S]*))?$/);
    if (!match || !safeUrl(match[2].trim())) continue;
    const body = (match[5] ?? "").replace(/^(?:Highlights:[ \t]*\r?\n|Text: )/, "");
    items.push({ title: match[1].slice(0, 500), url: match[2].trim(), publishedDate: match[3], author: match[4], text: body.slice(0, MAX_BODY_CHARS) });
  }
  return items;
}
function fetchText(text) {
  const header = /^# ([^\r\n]+)\r?\nURL: ([^\r\n]+)\r?\n(?:Published: ([^\r\n]+)\r?\n)?(?:Author: ([^\r\n]+)\r?\n)?\r?\n/gm;
  const matches = [];
  let match;
  while (matches.length < MAX_ITEMS + 1 && (match = header.exec(text)) !== null) {
    matches.push({ start: match.index, end: header.lastIndex, title: match[1].slice(0, 500), url: match[2].trim(), publishedDate: match[3], author: match[4] });
  }
  return matches.slice(0, MAX_ITEMS).filter((item) => safeUrl(item.url)).map((item) => {
    const next = matches.find((candidate) => candidate.start > item.start);
    const body = text.slice(item.end, next?.start ?? text.length).replace(/\r?\nError fetching [^\r\n]+:[^\r\n]*/g, "").trim();
    return { title: item.title, url: item.url, ...item.publishedDate ? { publishedDate: item.publishedDate } : {}, ...item.author ? { author: item.author } : {}, text: body.slice(0, MAX_BODY_CHARS) };
  });
}
function textOf(block) {
  if (block.kind !== "value") return void 0;
  if (typeof block.value === "string") return block.value;
  if (isRecord(block.value) && typeof block.value.text === "string") return block.value.text;
  return void 0;
}
function exaView(blocks, records, operation) {
  if (!["web-search-exa", "web-fetch-exa", "web-search-advanced-exa"].includes(operation)) {
    return { groups: [], textPreview: false, partialError: false };
  }
  const groups = searchGroups(records);
  const hasStructuredResults = groups.length > 0;
  let partialError = false;
  let textPreview = false;
  let remaining = MAX_ITEMS;
  for (const block of blocks.slice(0, MAX_BLOCKS)) {
    const text = textOf(block);
    if (!text) continue;
    const bounded = text.slice(0, MAX_TEXT_CHARS);
    if (operation === "web-fetch-exa" && /^Error fetching (?:URL\(s\)|[^\r\n]+):/m.test(bounded)) partialError = true;
    if (hasStructuredResults || !remaining || operation === "web-search-advanced-exa") continue;
    const items = (operation === "web-fetch-exa" ? fetchText(bounded) : searchText(bounded)).slice(0, remaining);
    if (items.length) {
      groups.push({ name: "results", items });
      remaining -= items.length;
      textPreview = true;
    }
  }
  return { groups, textPreview, partialError };
}
function exaParameters(args) {
  return Object.hasOwn(args, "objective") ? { ...args, objective: HIDDEN } : args;
}

// src/searchFeeds.ts
var MAX_ITEMS2 = 80;
var MAX_BODY_CHARS2 = 3e3;
var MAX_PER_BLOCK_ITEMS = 20;
function textOf2(block) {
  if (block.kind !== "value") return void 0;
  if (typeof block.value === "string") return block.value;
  if (isRecord(block.value) && typeof block.value.text === "string") return block.value.text;
  return void 0;
}
var urlOf = (item) => safeUrl(item.url ?? item.link ?? item.source_url ?? item.uri);
function asResultItem(value) {
  if (!isRecord(value)) return null;
  if (!urlOf(value)) return null;
  if (value.title === void 0 && value.name === void 0 && value.description === void 0) return null;
  return value;
}
function splitCitations(text) {
  const match = /\n\s*Citations:\s*\n([\s\S]*)$/i.exec(text);
  if (!match) return { body: text, citations: [] };
  const citations = match[1].split(/\r?\n/).map((line) => line.replace(/^\s*\[?\d+\]?[\s.)]*\s*/, "").trim()).filter((line) => safeUrl(line));
  return { body: text.slice(0, match.index).trim(), citations };
}
function parseSearchFeed(providerId, blocks, records) {
  const groups = searchGroups(records);
  const seenUrls = /* @__PURE__ */ new Set();
  for (const group of groups) {
    for (const item of group.items) {
      if (isRecord(item)) {
        const url = urlOf(item);
        if (url) seenUrls.add(url);
      }
    }
  }
  const push = (name, items) => {
    const fresh = items.filter((item) => {
      const url = urlOf(item);
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });
    if (!fresh.length) return;
    const existing = groups.find((group) => group.name === name);
    if (existing) existing.items.push(...fresh);
    else groups.push({ name, items: fresh });
  };
  const itemArrays = {
    serpapi: ["organic_results", "news_results", "local_results", "images_results", "shopping_results", "video_results", "top_stories", "related_questions", "perspectives", "immersive_products"],
    searxng: ["results", "suggestions", "answers", "infoboxes"],
    tavily: ["results", "failed_results"],
    parallel: ["results"],
    linkup: ["results", "images"],
    firecrawl: ["web", "news", "images"],
    brave: ["items"],
    duckduckgo: ["results"],
    jina: ["results", "data", "images"]
  };
  const keys = itemArrays[providerId] ?? [];
  if (keys.length) {
    for (const record of records) {
      for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) {
          push(key, value.filter(isRecord));
        }
      }
    }
  }
  let answer;
  const sources = [];
  for (const record of records) {
    if (!answer) {
      for (const key of ["answer", "response", "summary", "result", "output"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim() && (providerId !== "searxng" || key !== "result")) {
          answer = value;
          break;
        }
      }
    }
    for (const key of ["citations", "sources", "urls"]) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const entry of value) {
          const url = typeof entry === "string" ? safeUrl(entry) : isRecord(entry) ? urlOf(entry) : null;
          if (url) sources.push(url);
        }
      }
    }
  }
  if (answer && providerId === "perplexity") {
    const split = splitCitations(answer);
    if (split.citations.length) {
      answer = split.body;
      sources.push(...split.citations);
    }
  }
  if (!groups.length || providerId === "brave") {
    const loose = [];
    for (const block of blocks.slice(0, 40)) {
      if (loose.length >= MAX_ITEMS2) break;
      const text = textOf2(block);
      if (!text || text.length > 2e5) continue;
      const parsed = text.trim();
      if (!parsed.startsWith("{") && !parsed.startsWith("[")) continue;
      let decoded;
      try {
        decoded = JSON.parse(parsed);
      } catch {
        continue;
      }
      const candidates2 = Array.isArray(decoded) ? decoded : [decoded];
      for (const candidate of candidates2.slice(0, MAX_PER_BLOCK_ITEMS)) {
        const item = asResultItem(candidate);
        if (item) loose.push(item);
      }
    }
    if (loose.length) push("results", loose);
  }
  let textPreview = false;
  if (providerId === "tavily" && !groups.length) {
    const fallback = [];
    for (const block of blocks.slice(0, 10)) {
      const text = textOf2(block);
      if (!text) continue;
      const answerMatch = /(?:^|\r?\n)Answer:\s*([\s\S]*?)(?=\r?\n(?:Detailed Results:|Title:|$))/i.exec(text);
      if (answerMatch && !answer) {
        answer = answerMatch[1].trim();
      }
      for (const chunk of text.split(/\r?\n(?=Title:\s)/i)) {
        const url = /URL:\s*(\S+)/i.exec(chunk)?.[1];
        const safe = url ? safeUrl(url) : null;
        if (!safe) continue;
        fallback.push({
          title: /Title:\s*([^\r\n]*)/i.exec(chunk)?.[1]?.trim() ?? "",
          url: safe,
          snippet: /Content:\s*([\s\S]*)/i.exec(chunk)?.[1]?.trim().slice(0, MAX_BODY_CHARS2) ?? ""
        });
        if (fallback.length >= MAX_ITEMS2) break;
      }
    }
    if (fallback.length) {
      push("results", fallback);
      textPreview = true;
    }
  }
  if (!groups.length) {
    const fallback = [];
    for (const block of blocks.slice(0, 10)) {
      const text = textOf2(block);
      if (!text) continue;
      for (const line of text.split(/\r?\n/)) {
        if (fallback.length >= MAX_ITEMS2) break;
        const mdLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
        if (mdLink && safeUrl(mdLink[2])) {
          fallback.push({
            title: mdLink[1].slice(0, 200),
            url: mdLink[2],
            snippet: line.replace(mdLink[0], "").trim().slice(0, MAX_BODY_CHARS2)
          });
        }
      }
    }
    if (fallback.length) {
      push("results", fallback);
      textPreview = true;
    }
  }
  return {
    groups,
    answer: answer ? safeText(answer).slice(0, 8e3) : void 0,
    sources: sources.length ? [...new Set(sources)].slice(0, 50) : void 0,
    textPreview
  };
}

// src/shapes.ts
var SHAPE_LIMIT = 400;
var DIFF_HEADER = /^(?:diff --git |--- |\+\+\+ |@@ )/m;
function parseDiff(text) {
  if (!DIFF_HEADER.test(text)) return null;
  const lines = text.split(/\r?\n/);
  const files = [];
  let current = null;
  let additions = 0;
  let deletions = 0;
  let seenHunk = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      current = { header: line.slice("diff --git ".length), lines: [] };
      files.push(current);
      continue;
    }
    if (line.startsWith("@@")) {
      seenHunk = true;
      if (!current) {
        current = { header: "", lines: [] };
        files.push(current);
      }
      current.lines.push({ type: "meta", text: line });
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ")) {
      current.lines.push({ type: "meta", text: line });
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      current.lines.push({ type: "add", text: line.slice(1) });
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
      current.lines.push({ type: "remove", text: line.slice(1) });
      continue;
    }
    if (line.startsWith(" ")) {
      current.lines.push({ type: "context", text: line.slice(1) });
      continue;
    }
    if (line.startsWith("\\")) {
      current.lines.push({ type: "meta", text: line });
    }
  }
  if (!seenHunk || !files.length) return null;
  for (const file of files) file.lines = file.lines.slice(0, SHAPE_LIMIT);
  return { kind: "diff", files: files.slice(0, 20), additions, deletions };
}
var BOX = /^([\s│├└─┬┼┤]*)([├└]──\s*|├──\s*|└──\s*)?(.+)$/;
function parseTree(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let dirs = 0;
  let files = 0;
  for (const raw of lines) {
    const match = BOX.exec(raw);
    if (!match) continue;
    const prefix = match[1] ?? "";
    const branch = match[2];
    const name = (match[3] ?? "").trim();
    if (!name) continue;
    if (!branch && !/[├└│]/.test(prefix)) continue;
    const depth = Math.floor(prefix.replace(/[│├└─\s]/g, " ").length / 4) || prefix.length / 4;
    const dir = name.endsWith("/");
    if (dir) dirs += 1;
    else files += 1;
    entries.push({ depth: Math.max(0, Math.round(depth)), name, dir });
  }
  if (entries.length < 3 || !/[├└]/.test(text)) return null;
  return { kind: "tree", entries: entries.slice(0, SHAPE_LIMIT), dirs, files };
}
function treeFromRecords(records) {
  for (const record of records) {
    const tree = record.tree;
    if (!Array.isArray(tree) || tree.length < 2) continue;
    const entries = [];
    let dirs = 0;
    let files = 0;
    for (const item of tree) {
      if (item === null || typeof item !== "object") continue;
      const node = item;
      const path = typeof node.path === "string" ? node.path : typeof node.name === "string" ? node.name : "";
      if (!path) continue;
      const type = typeof node.type === "string" ? node.type : "";
      const dir = type === "tree" || type === "dir";
      if (dir) dirs += 1;
      else files += 1;
      entries.push({ depth: Math.max(0, path.split("/").length - 1), name: path.split("/").pop() ?? path, dir });
    }
    if (entries.length < 2) continue;
    return { kind: "tree", entries: entries.slice(0, SHAPE_LIMIT), dirs, files };
  }
  return null;
}
var LOG_LINE = /^(?:(\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?)\s+)?(?:\[?(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|FATAL|CRIT|CRITICAL)\]?:?\s+)?(.*)$/i;
var CHROME_ROW = /^(msgid|reqid)=(\d+)\s+(?:\[([^\]]+)\]\s+)?(.*)$/;
function parseLogs(text) {
  const raw = text.split(/\r?\n/);
  const lines = [];
  const counts = {};
  let chromeRows = 0;
  let stamped = 0;
  for (const line of raw) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const chrome = CHROME_ROW.exec(trimmed);
    if (chrome) {
      const level2 = (chrome[3] ?? "").toLowerCase();
      counts[level2 || "row"] = (counts[level2 || "row"] ?? 0) + 1;
      lines.push({ level: level2 || "row", text: safeText(chrome[4] ?? ""), id: chrome[2] });
      chromeRows += 1;
      continue;
    }
    const match = LOG_LINE.exec(trimmed);
    if (!match) continue;
    const hasTime = Boolean(match[1]);
    const level = (match[2] ?? "").toUpperCase();
    if (!hasTime && !level) continue;
    const key = level || "LOG";
    counts[key] = (counts[key] ?? 0) + 1;
    lines.push({ level: key, text: safeText(match[3] ?? "") });
    stamped += 1;
  }
  const structured = chromeRows + stamped;
  const accepted = chromeRows >= 2 || stamped >= 4 && structured >= raw.filter((l) => l.trim()).length * 0.6;
  if (!accepted) return null;
  return { kind: "log", lines: lines.slice(0, SHAPE_LIMIT), counts };
}
var CHROME_NODE = /^(\s*)uid=([\w-]+)\s+(\S+)\s*(.*)$/;
var PW_NODE = /^(\s*)(?:-\s+)?([a-z][\w-]*)\s*("(?:[^"\\]|\\.)*")?\s*(\[[^\]]*\])*\s*(\[ref=([\w-]+)\])?/;
var PW_REF = /\[ref=([\w-]+)\]/;
function parseSnapshot(text) {
  const lines = text.split(/\r?\n/);
  const chromeNodes = [];
  const pwNodes = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const chrome = CHROME_NODE.exec(line);
    if (chrome) {
      const indent = (chrome[1] ?? "").replace(/\t/g, "  ").length;
      chromeNodes.push({
        depth: Math.floor(indent / 2),
        role: safeText(chrome[3] ?? ""),
        name: safeText((chrome[4] ?? "").replace(/\s*url="[^"]*"/, "").slice(0, 300)),
        meta: safeText(/url="([^"]*)"/.exec(chrome[4] ?? "")?.[1] ?? ""),
        ref: chrome[2]
      });
      continue;
    }
    const pw = PW_NODE.exec(line);
    if (pw && (/\[ref=[\w-]+\]/.test(line) || /^[a-z][\w-]*\s+"/.test(line.trim()))) {
      const indent = (pw[1] ?? "").replace(/\t/g, "  ").length;
      const name = (pw[3] ?? "").replace(/^"|"$/g, "");
      const ref = PW_REF.exec(line)?.[1];
      const meta = (line.match(/\[[^\]]*\]/g) ?? []).filter((part) => !part.startsWith("[ref=")).map((part) => part.replace(/^\[|\]$/g, "")).join(" ");
      pwNodes.push({
        depth: Math.floor(indent / 2),
        role: safeText(pw[2] ?? ""),
        name: safeText(name.slice(0, 300)),
        meta: safeText(meta),
        ref
      });
    }
  }
  if (chromeNodes.length >= 3) return { kind: "snapshot", nodes: chromeNodes.slice(0, SHAPE_LIMIT), flavor: "chrome" };
  if (pwNodes.length >= 3) return { kind: "snapshot", nodes: pwNodes.slice(0, SHAPE_LIMIT), flavor: "playwright" };
  return null;
}
var PROGRESS_KEYS = ["status", "progress", "state", "completed", "total", "totalPages", "pages", "creditsUsed", "duration", "durationMs"];
function progressFromRecords(records) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  let status;
  for (const record of records) {
    for (const key of PROGRESS_KEYS) {
      const value = record[key];
      if (seen.has(key)) continue;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      seen.add(key);
      if (key === "status" && typeof value === "string") status = value;
      items.push({ label: key, value: String(value), done: value === "completed" || value === "succeeded" });
    }
    const completed = record.completed;
    const total = record.total;
    if (typeof completed === "number" && typeof total === "number" && total > 0) {
      const ratio = Math.min(1, Math.max(0, completed / total));
      const existing = items.find((item) => item.label === "progress");
      if (existing) {
        existing.ratio = ratio;
        existing.value = `${completed} / ${total}`;
      } else {
        items.push({ label: "progress", value: `${completed} / ${total}`, done: ratio >= 1, ratio });
      }
    }
  }
  if (!status && !items.some((item) => item.ratio !== void 0)) return null;
  return { kind: "progress", items: items.slice(0, 12), status };
}
var LEVEL_KEYS = ["severity", "level", "state", "status", "priority"];
var TITLE_KEYS = ["title", "name", "message", "description", "summary", "rule", "check"];
function checklistFromRecords(records) {
  for (const record of records) {
    for (const key of ["vulnerabilities", "alerts", "findings", "lints", "issues", "advisories", "code_scanning_alerts"]) {
      const rows = record[key];
      if (!Array.isArray(rows) || rows.length < 2) continue;
      const items = [];
      const counts = {};
      for (const row of rows) {
        if (row === null || typeof row !== "object") continue;
        const node = row;
        let level = "info";
        for (const levelKey of LEVEL_KEYS) {
          const value = node[levelKey];
          if (typeof value === "string" && value) {
            level = value.toLowerCase();
            break;
          }
        }
        let title = "";
        for (const titleKey of TITLE_KEYS) {
          const value = node[titleKey];
          if (typeof value === "string" && value) {
            title = value;
            break;
          }
        }
        if (!title) continue;
        counts[level] = (counts[level] ?? 0) + 1;
        const detail = typeof node.detail === "string" ? node.detail : typeof node.location === "string" ? node.location : void 0;
        items.push({ title: safeText(title).slice(0, 300), level, detail: detail ? safeText(detail).slice(0, 200) : void 0 });
      }
      if (items.length >= 2) {
        return { kind: "checklist", items: items.slice(0, SHAPE_LIMIT), counts };
      }
    }
  }
  return null;
}

// src/ShapeViews.tsx
function Pager2({ total, page, onPage, size = PAGE_SIZE }) {
  const { t } = useApi();
  if (total <= size) return null;
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-pager" }, /* @__PURE__ */ React.createElement("button", { type: "button", disabled: page === 0, onClick: () => onPage(Math.max(0, page - 1)) }, t("toolCall.mcp.previous")), /* @__PURE__ */ React.createElement("span", null, t("toolCall.mcp.range", { values: { start: page * size + 1, end: Math.min(total, (page + 1) * size), total } })), /* @__PURE__ */ React.createElement("button", { type: "button", disabled: page >= last, onClick: () => onPage(Math.min(last, page + 1)) }, t("toolCall.mcp.next")));
}
function ShapeHead({ label, count }) {
  return /* @__PURE__ */ React.createElement("h4", null, label, count > 0 ? /* @__PURE__ */ React.createElement("span", { className: "mcp-shape-count" }, count) : null);
}
function DiffView({ shape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.files.length / 5) - 1));
  const files = React.useMemo(() => shape.files.slice(page * 5, (page + 1) * 5), [shape.files, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-shape mcp-diff" }, /* @__PURE__ */ React.createElement(ShapeHead, { label: t("toolCall.shape.diff"), count: shape.files.length }), /* @__PURE__ */ React.createElement("div", { className: "mcp-shape-stats" }, /* @__PURE__ */ React.createElement("span", { className: "mcp-diff-add" }, "+", shape.additions), /* @__PURE__ */ React.createElement("span", { className: "mcp-diff-del" }, "−", shape.deletions), /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.shape.files", { values: { count: shape.files.length } }))), files.map((file, fileIndex) => /* @__PURE__ */ React.createElement("article", { className: "mcp-diff-file", key: `${page}:${fileIndex}` }, /* @__PURE__ */ React.createElement("header", { className: "mcp-diff-file-head", title: file.header }, safeText(file.header).slice(0, 300) || t("toolCall.shape.diff")), /* @__PURE__ */ React.createElement("pre", { className: "mcp-diff-body" }, file.lines.map((line, lineIndex) => /* @__PURE__ */ React.createElement("div", { className: `mcp-diff-line mcp-diff-${line.type}`, key: lineIndex }, /* @__PURE__ */ React.createElement("span", { className: "mcp-diff-sign", "aria-hidden": "true" }, line.type === "add" ? "+" : line.type === "remove" ? "−" : " "), /* @__PURE__ */ React.createElement("span", { className: "mcp-diff-text" }, safeText(line.text))))))), /* @__PURE__ */ React.createElement(Pager2, { total: shape.files.length, page, size: 5, onPage: setPage }));
}
function TreeView({ shape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.entries.length / 100) - 1));
  const entries = React.useMemo(() => shape.entries.slice(page * 100, (page + 1) * 100), [shape.entries, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-shape mcp-tree-shape" }, /* @__PURE__ */ React.createElement(ShapeHead, { label: t("toolCall.shape.tree"), count: shape.entries.length }), /* @__PURE__ */ React.createElement("div", { className: "mcp-shape-stats" }, /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.shape.dirs", { values: { count: shape.dirs } })), /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.shape.filesCount", { values: { count: shape.files } }))), /* @__PURE__ */ React.createElement("ul", { className: "mcp-tree-list" }, entries.map((entry, index) => /* @__PURE__ */ React.createElement("li", { className: `mcp-tree-item${entry.dir ? " mcp-tree-dir" : ""}`, key: `${page}:${index}`, style: { paddingInlineStart: `${Math.min(entry.depth, 16) * 14}px` } }, /* @__PURE__ */ React.createElement("span", { className: "mcp-tree-mark", "aria-hidden": "true" }, entry.dir ? "▸" : "·"), /* @__PURE__ */ React.createElement("span", { className: "mcp-tree-name" }, safeText(entry.name).slice(0, 300))))), /* @__PURE__ */ React.createElement(Pager2, { total: shape.entries.length, page, size: 100, onPage: setPage }));
}
function LogView({ shape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const [filter, setFilter] = React.useState("");
  const levels = React.useMemo(() => Object.keys(shape.counts).sort((a, b) => shape.counts[b] - shape.counts[a]), [shape.counts]);
  const lines = React.useMemo(() => filter ? shape.lines.filter((line) => line.level === filter) : shape.lines, [shape.lines, filter]);
  const page = Math.min(requested, Math.max(0, Math.ceil(lines.length / 100) - 1));
  const visible = React.useMemo(() => lines.slice(page * 100, (page + 1) * 100), [lines, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-shape mcp-log-shape" }, /* @__PURE__ */ React.createElement(ShapeHead, { label: t("toolCall.shape.log"), count: shape.lines.length }), levels.length > 1 ? /* @__PURE__ */ React.createElement("div", { className: "mcp-shape-stats" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: `mcp-log-chip${filter === "" ? " is-active" : ""}`, onClick: () => {
    setFilter("");
    setPage(0);
  } }, t("toolCall.shape.all"), " ", shape.lines.length), levels.map((level) => /* @__PURE__ */ React.createElement("button", { type: "button", key: level, className: `mcp-log-chip mcp-level-${level.toLowerCase()}${filter === level ? " is-active" : ""}`, onClick: () => {
    setFilter(level);
    setPage(0);
  } }, level, " ", shape.counts[level]))) : null, /* @__PURE__ */ React.createElement("pre", { className: "mcp-log-body" }, visible.map((line, index) => /* @__PURE__ */ React.createElement("div", { className: "mcp-log-line", key: `${page}:${index}` }, line.id ? /* @__PURE__ */ React.createElement("span", { className: "mcp-log-id" }, line.id) : null, /* @__PURE__ */ React.createElement("span", { className: `mcp-log-level mcp-level-${line.level.toLowerCase()}` }, line.level), /* @__PURE__ */ React.createElement("span", { className: "mcp-log-text" }, line.text)))), /* @__PURE__ */ React.createElement(Pager2, { total: lines.length, page, size: 100, onPage: setPage }));
}
function SnapshotView({ shape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.nodes.length / 100) - 1));
  const nodes = React.useMemo(() => shape.nodes.slice(page * 100, (page + 1) * 100), [shape.nodes, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-shape mcp-snapshot-shape" }, /* @__PURE__ */ React.createElement(ShapeHead, { label: t("toolCall.shape.snapshot"), count: shape.nodes.length }), /* @__PURE__ */ React.createElement("div", { className: "mcp-shape-stats" }, /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t(`toolCall.shape.flavor.${shape.flavor}`, { defaultValue: shape.flavor }))), /* @__PURE__ */ React.createElement("ul", { className: "mcp-snapshot-list" }, nodes.map((node, index) => /* @__PURE__ */ React.createElement("li", { className: "mcp-snapshot-node", key: `${page}:${index}`, style: { paddingInlineStart: `${Math.min(node.depth, 20) * 12}px` } }, /* @__PURE__ */ React.createElement("span", { className: "mcp-snapshot-role" }, safeText(node.role)), node.name ? /* @__PURE__ */ React.createElement("span", { className: "mcp-snapshot-name" }, node.name) : null, node.ref ? /* @__PURE__ */ React.createElement("span", { className: "mcp-snapshot-ref" }, node.ref) : null, node.meta && node.meta !== node.name ? /* @__PURE__ */ React.createElement("span", { className: "mcp-muted mcp-snapshot-meta" }, node.meta) : null))), /* @__PURE__ */ React.createElement(Pager2, { total: shape.nodes.length, page, size: 100, onPage: setPage }));
}
function ProgressView({ shape }) {
  const { t } = useApi();
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-shape mcp-progress-shape" }, /* @__PURE__ */ React.createElement(ShapeHead, { label: t("toolCall.shape.progress"), count: 0 }), /* @__PURE__ */ React.createElement("dl", { className: "mcp-progress-list" }, shape.items.map((item) => /* @__PURE__ */ React.createElement("div", { className: "mcp-progress-item", key: item.label }, /* @__PURE__ */ React.createElement("dt", null, t(`toolCall.mcp.metric.${item.label}`, { defaultValue: t(`toolCall.shape.field.${item.label}`, { defaultValue: item.label }) })), /* @__PURE__ */ React.createElement("dd", null, item.ratio !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "mcp-progress-bar", role: "progressbar", "aria-valuenow": Math.round(item.ratio * 100), "aria-valuemin": 0, "aria-valuemax": 100 }, /* @__PURE__ */ React.createElement("span", { className: "mcp-progress-fill", style: { inlineSize: `${Math.round(item.ratio * 100)}%` } })) : null, /* @__PURE__ */ React.createElement("span", { className: `mcp-progress-value${item.done ? " is-done" : ""}` }, safeText(item.value).slice(0, 200)))))));
}
function ChecklistView({ shape }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const levels = React.useMemo(() => Object.keys(shape.counts).sort((a, b) => shape.counts[b] - shape.counts[a]), [shape.counts]);
  const page = Math.min(requested, Math.max(0, Math.ceil(shape.items.length / 50) - 1));
  const items = React.useMemo(() => shape.items.slice(page * 50, (page + 1) * 50), [shape.items, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-shape mcp-checklist-shape" }, /* @__PURE__ */ React.createElement(ShapeHead, { label: t("toolCall.shape.checklist"), count: shape.items.length }), /* @__PURE__ */ React.createElement("div", { className: "mcp-shape-stats" }, levels.map((level) => /* @__PURE__ */ React.createElement("span", { className: `mcp-log-chip mcp-level-${level}`, key: level }, level, " ", shape.counts[level]))), /* @__PURE__ */ React.createElement("ul", { className: "mcp-checklist" }, items.map((item, index) => {
    const url = safeUrl(item.detail);
    return /* @__PURE__ */ React.createElement("li", { className: `mcp-checklist-item mcp-level-${item.level}`, key: `${page}:${index}` }, /* @__PURE__ */ React.createElement("span", { className: `mcp-checklist-level mcp-level-${item.level}` }, item.level), /* @__PURE__ */ React.createElement("span", { className: "mcp-checklist-title" }, item.title), item.detail ? url ? /* @__PURE__ */ React.createElement(LinkLine, { url }) : /* @__PURE__ */ React.createElement("span", { className: "mcp-muted mcp-checklist-detail" }, item.detail) : null);
  })), /* @__PURE__ */ React.createElement(Pager2, { total: shape.items.length, page, size: 50, onPage: setPage }));
}
function LinkLine({ url }) {
  const api = useApi();
  return /* @__PURE__ */ React.createElement("button", { type: "button", className: "mcp-link mcp-checklist-detail", title: url, onClick: () => api.links.open(url, "browser") }, url.slice(0, 120));
}

// src/McpToolCall.tsx
function textMeta(value) {
  const rows = [];
  for (const [key, item] of Object.entries(value)) {
    if (key === "text") continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      rows.push([key, preview(item, key)]);
      continue;
    }
    if (!isRecord(item)) return null;
    for (const [child, leaf] of Object.entries(item)) {
      if (typeof leaf !== "string" && typeof leaf !== "number" && typeof leaf !== "boolean") return null;
      rows.push([`${key}.${child}`, preview(leaf, child)]);
    }
  }
  return rows;
}
function BlockValue({ value }) {
  if (isRecord(value) && typeof value.text === "string") {
    const meta = textMeta(value);
    if (meta) {
      return /* @__PURE__ */ React.createElement("div", { className: "mcp-text-part" }, /* @__PURE__ */ React.createElement(TextValue, { value: value.text }), meta.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mcp-text-meta" }, meta.map(([label, text]) => /* @__PURE__ */ React.createElement("span", { key: label }, /* @__PURE__ */ React.createElement("b", null, label), text))));
    }
  }
  return /* @__PURE__ */ React.createElement(Value, { value });
}
function ImageBlock({ value }) {
  const { t } = useApi();
  const [revealed, setRevealed] = React.useState(null);
  const [failedValue, setFailedValue] = React.useState(null);
  const shown = revealed === value;
  const broken = failedValue === value;
  const image = React.useMemo(() => inlineImage(value), [value]);
  const metadata = isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "data")) : value;
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-image" }, /* @__PURE__ */ React.createElement(Value, { value: metadata }), !image || broken ? /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.mcp.imageBlocked")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": shown, onClick: () => setRevealed(shown ? null : value) }, t(shown ? "toolCall.mcp.hideImage" : "toolCall.mcp.showImage"), " · ", Math.ceil(image.bytes / 1024), " KiB"), shown && /* @__PURE__ */ React.createElement("img", { src: image.src, alt: t("toolCall.mcp.inlineImage"), loading: "lazy", onError: () => setFailedValue(value), onLoad: (event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16e6) setFailedValue(value);
  } })));
}
var SearchResults = React.memo(function SearchResults2({
  groups,
  showPublished = false
}) {
  const api = useApi();
  const { t } = api;
  const [requested, setPage] = React.useState(0);
  const items = React.useMemo(
    () => groups.flatMap((group) => group.items.map((item) => ({ group: group.name, item }))),
    [groups]
  );
  const page = Math.min(requested, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1));
  const pageItems = React.useMemo(
    () => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [items, page]
  );
  const openInApp = (url) => api.links.open(url, "browser");
  const openExternal = (url) => api.links.open(url, "external");
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-search-section" }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-results" }, pageItems.map(({ group, item }, index) => {
    const itemIndex = page * PAGE_SIZE + index + 1;
    if (!isRecord(item)) {
      return /* @__PURE__ */ React.createElement("article", { key: itemIndex, className: "tool-call-websearch-result" }, /* @__PURE__ */ React.createElement(Value, { value: item }));
    }
    const rawTitle = typeof item.title === "string" ? item.title : typeof item.name === "string" ? item.name : "";
    const rawUrl = typeof item.url === "string" ? item.url : typeof item.link === "string" ? item.link : typeof item.source_url === "string" ? item.source_url : "";
    const url = safeUrl(rawUrl);
    const host = url ? (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })() : "";
    const title = rawTitle.trim() || host || rawUrl || "Untitled";
    const snippet = typeof item.snippet === "string" ? item.snippet : typeof item.text === "string" ? item.text : typeof item.description === "string" ? item.description : typeof item.content === "string" ? item.content : "";
    const published = typeof item.publishedDate === "string" ? item.publishedDate : typeof item.published === "string" ? item.published : typeof item.date === "string" ? item.date : "";
    const showDate = showPublished && published && published !== "N/A" && published.trim() !== "";
    const authors = Array.isArray(item.authors) ? item.authors.join(", ") : typeof item.author === "string" ? item.author : typeof item.authors === "string" ? item.authors : "";
    const pdfUrl = safeUrl(item.pdf_url ?? item.pdf);
    return /* @__PURE__ */ React.createElement("article", { key: itemIndex, className: "tool-call-websearch-result" }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-result-head" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-result-index", "aria-hidden": "true" }, itemIndex), url ? /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "tool-call-websearch-result-title",
        onClick: () => openInApp(url),
        title: `${url}
${t("toolCall.mcp.openInBrowser", { defaultValue: "在应用内浏览器打开" })}`
      },
      /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-result-title-text" }, title)
    ) : /* @__PURE__ */ React.createElement("strong", { className: "tool-call-websearch-result-title-text", style: { fontSize: "12.5px" } }, title), pdfUrl && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "mcp-pdf-tag",
        onClick: () => openInApp(pdfUrl),
        title: pdfUrl
      },
      "PDF"
    ), url && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "tool-call-websearch-external",
        onClick: () => openExternal(url),
        title: t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" }),
        "aria-label": t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })
      },
      /* @__PURE__ */ React.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 3 21 3 21 9" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "14", x2: "21", y2: "3" }))
    )), url && /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-result-url" }, /* @__PURE__ */ React.createElement("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })), /* @__PURE__ */ React.createElement("span", null, host || url), showDate && /* @__PURE__ */ React.createElement("span", { className: "mcp-date-tag" }, preview(published).slice(0, 30)), authors && /* @__PURE__ */ React.createElement("span", { className: "mcp-author-tag", title: authors }, preview(authors).slice(0, 40)), group && group !== "results" && /* @__PURE__ */ React.createElement("span", { className: "mcp-group-tag" }, t(`toolCall.mcp.group.${group}`, { defaultValue: group }))), snippet ? /* @__PURE__ */ React.createElement("p", { className: "tool-call-websearch-result-snippet" }, preview(snippet).slice(0, 600)) : null);
  })), /* @__PURE__ */ React.createElement(Pager, { total: items.length, page, onPage: setPage }));
});
function searchTerms(args) {
  const query = typeof args.query === "string" ? args.query : typeof args.q === "string" ? args.q : typeof args.search_query === "string" ? args.search_query : void 0;
  const numResults = typeof args.numResults === "number" ? args.numResults : typeof args.max_results === "number" ? args.max_results : typeof args.count === "number" ? args.count : typeof args.limit === "number" ? args.limit : void 0;
  const url = typeof args.url === "string" ? args.url : void 0;
  const depth = typeof args.search_depth === "string" ? args.search_depth : typeof args.depth === "string" ? args.depth : void 0;
  return { query, numResults, url, depth };
}
function titleSubject(args) {
  const { query, url } = searchTerms(args);
  const urls = Array.isArray(args.urls) && typeof args.urls[0] === "string" ? args.urls[0] : void 0;
  const value = query ?? url ?? urls;
  if (!value) return "";
  const text = preview(value, "query", true);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
function SearchParamsBar({ args }) {
  const { t } = useApi();
  const { query, numResults, url, depth } = searchTerms(args);
  if (!query && !numResults && !url) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-params mcp-search-params-bar" }, query && /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item" }, /* @__PURE__ */ React.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.search.query", { defaultValue: "查询" })), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, preview(query, "query", true))), url && /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item" }, /* @__PURE__ */ React.createElement("svg", { width: "11", height: "11", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.url", { defaultValue: "网址" })), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, preview(url, "url", true))), /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-tags" }, numResults !== void 0 && /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, t("toolCall.anysearch.maxResults", { defaultValue: "上限" }), ": ", numResults), depth && /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, depth)));
}
function detectEntities(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !isRecord(rows[0])) return null;
  const first = rows[0];
  const hasIssueLike = (first.title !== void 0 || first.message !== void 0) && (first.number !== void 0 || first.iid !== void 0 || first.identifier !== void 0 || first.id !== void 0) && (first.state !== void 0 || first.status !== void 0);
  if (hasIssueLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const id = String(r.number ? `#${r.number}` : r.iid ? `#${r.iid}` : r.identifier ? r.identifier : r.id ?? "");
      const title = String(r.title ?? r.message ?? "Untitled");
      const state = String(r.state ?? r.status ?? "").toLowerCase();
      let stateType = "neutral";
      if (["open", "opened", "active", "running", "success"].includes(state)) stateType = "success";
      else if (["closed", "failed", "error", "canceled"].includes(state)) stateType = "error";
      else if (["merged"].includes(state)) stateType = "purple";
      else if (["pending", "in_progress", "todo"].includes(state)) stateType = "warning";
      const url = safeUrl(r.html_url ?? r.web_url ?? r.url);
      const user = isRecord(r.user) ? String(r.user.login ?? "") : typeof r.author === "string" ? r.author : "";
      return { id, title, state: state.toUpperCase(), stateType, url: url || void 0, subtitle: user ? `@${user}` : void 0 };
    });
  }
  const hasCommitLike = (first.sha !== void 0 || first.id !== void 0 && typeof first.id === "string" && first.id.length >= 8) && (first.message !== void 0 || first.title !== void 0);
  if (hasCommitLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const rawSha = String(r.sha ?? r.id ?? "");
      const id = rawSha.slice(0, 8);
      const title = String(r.message ?? r.title ?? "").split("\n")[0];
      const author = isRecord(r.author) ? String(r.author.name ?? r.author.login ?? "") : typeof r.author_name === "string" ? r.author_name : "";
      const url = safeUrl(r.html_url ?? r.web_url ?? r.url);
      return { id, title, subtitle: author, state: "COMMIT", stateType: "neutral", url: url || void 0 };
    });
  }
  const hasSentryLike = (first.culprit !== void 0 || first.shortId !== void 0) && first.level !== void 0;
  if (hasSentryLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const id = String(r.shortId ?? r.id ?? "");
      const title = String(r.title ?? r.culprit ?? "Error");
      const level = String(r.level ?? "error").toLowerCase();
      let stateType = "error";
      if (level === "warning") stateType = "warning";
      else if (level === "info") stateType = "neutral";
      const count = r.count !== void 0 ? `${r.count} events` : void 0;
      return { id, title, state: level.toUpperCase(), stateType, subtitle: count };
    });
  }
  const hasContainerLike = (first.Names !== void 0 || first.name !== void 0) && (first.State !== void 0 || first.status !== void 0 || first.phase !== void 0);
  if (hasContainerLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const name = String(Array.isArray(r.Names) ? r.Names[0] : r.name ?? r.id ?? "");
      const title = name.replace(/^\//, "");
      const status = String(r.State ?? r.status ?? r.phase ?? "").toLowerCase();
      let stateType = "neutral";
      if (["running", "ready", "active"].includes(status)) stateType = "success";
      else if (["exited", "failed", "crashloopbackoff", "error"].includes(status)) stateType = "error";
      else if (["waiting", "pending", "containercreating"].includes(status)) stateType = "warning";
      const image = String(r.Image ?? r.image ?? "");
      return { id: "POD/CTR", title, state: status.toUpperCase(), stateType, subtitle: image || void 0 };
    });
  }
  const hasRepoLike = first.full_name !== void 0 || first.name !== void 0 && (first.owner !== void 0 || first.stargazers_count !== void 0 || first.star_count !== void 0);
  if (hasRepoLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const name = String(r.full_name ?? r.name ?? "repo");
      const stars = r.stargazers_count ?? r.star_count;
      const lang = typeof r.language === "string" ? r.language : void 0;
      const subtitle = [
        stars !== void 0 ? `★ ${stars}` : null,
        lang,
        typeof r.description === "string" ? r.description.slice(0, 70) : null
      ].filter(Boolean).join(" · ");
      const url = safeUrl(r.html_url ?? r.web_url ?? r.url);
      return { id: "REPO", title: name, state: "REPO", stateType: "purple", subtitle: subtitle || void 0, url: url || void 0 };
    });
  }
  const hasRequestLike = first.method !== void 0 && (first.url !== void 0 || first.name !== void 0);
  if (hasRequestLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const method = String(r.method ?? "GET").toUpperCase();
      let stateType = "neutral";
      if (method === "GET") stateType = "success";
      else if (method === "POST") stateType = "purple";
      else if (method === "PUT" || method === "PATCH") stateType = "warning";
      else if (method === "DELETE") stateType = "error";
      const rawUrl = typeof r.url === "string" ? r.url : isRecord(r.url) && typeof r.url.raw === "string" ? r.url.raw : "";
      const title = String(r.name ?? (rawUrl || "API Request"));
      const url = safeUrl(rawUrl);
      const statusCode = r.responseCode ?? r.status;
      const subtitle = [statusCode ? `HTTP ${statusCode}` : null, rawUrl && rawUrl !== title ? rawUrl : null].filter(Boolean).join(" · ");
      return { id: method, title, state: method, stateType, subtitle: subtitle || void 0, url: url || void 0 };
    });
  }
  const hasNotionLike = first.object === "page" || first.object === "database" || first.parent !== void 0 && first.properties !== void 0;
  if (hasNotionLike) {
    return rows.slice(0, 100).filter(isRecord).map((r) => {
      const type = String(r.object ?? "page").toUpperCase();
      let title = "Untitled";
      if (isRecord(r.properties)) {
        for (const val of Object.values(r.properties)) {
          if (isRecord(val) && val.type === "title" && Array.isArray(val.title) && val.title.length > 0) {
            const t = val.title[0];
            if (isRecord(t) && typeof t.plain_text === "string") title = t.plain_text;
          }
        }
      }
      const url = safeUrl(r.url);
      const subtitle = typeof r.last_edited_time === "string" ? `Updated ${r.last_edited_time.slice(0, 10)}` : void 0;
      return { id: type, title, state: type, stateType: "neutral", subtitle, url: url || void 0 };
    });
  }
  return null;
}
var EntityListView = React.memo(function EntityListView2({ entities, label }) {
  const api = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(entities.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => entities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [entities, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-entity-section" }, /* @__PURE__ */ React.createElement("h4", null, label, " · ", entities.length), /* @__PURE__ */ React.createElement("div", { className: "mcp-entity-list" }, visible.map((item, idx) => /* @__PURE__ */ React.createElement("div", { key: `${item.id}-${idx}`, className: "mcp-entity-card" }, /* @__PURE__ */ React.createElement("div", { className: "mcp-entity-head" }, item.state && /* @__PURE__ */ React.createElement("span", { className: `mcp-status-badge mcp-status-${item.stateType || "neutral"}` }, item.state), /* @__PURE__ */ React.createElement("span", { className: "mcp-entity-id" }, item.id), item.url ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "mcp-entity-title-btn",
      onClick: () => api.links.open(item.url, "browser"),
      title: item.url
    },
    item.title
  ) : /* @__PURE__ */ React.createElement("span", { className: "mcp-entity-title" }, item.title)), item.subtitle && /* @__PURE__ */ React.createElement("div", { className: "mcp-entity-sub" }, /* @__PURE__ */ React.createElement("span", null, item.subtitle))))), /* @__PURE__ */ React.createElement(Pager, { total: entities.length, page, onPage: setPage }));
});
function extractScrapeInfo(blocks, records) {
  for (const rec of records) {
    const rawUrl = rec.url ?? rec.sourceUrl ?? rec.link;
    const url = safeUrl(rawUrl);
    const screenshot = rec.screenshot ?? rec.image ?? rec.base64;
    const inlineImg = inlineImage(screenshot);
    const content = typeof rec.markdown === "string" ? rec.markdown : typeof rec.content === "string" ? rec.content : typeof rec.text === "string" ? rec.text : typeof rec.html === "string" ? rec.html : void 0;
    if (inlineImg || content && content.length > 50) {
      const title = typeof rec.title === "string" ? rec.title : void 0;
      return { title, url: url || void 0, content: content || "", image: inlineImg || void 0 };
    }
  }
  for (const b of blocks) {
    if (b.kind === "image") {
      const img = inlineImage(b.value);
      if (img) return { content: "", image: img };
    }
    if (typeof b.value === "string" && b.value.length > 50) {
      if (/^data:image\//.test(b.value)) {
        const comma = b.value.indexOf(",");
        if (comma > 0) {
          const mime = b.value.slice(5, comma).split(";")[0];
          const data = b.value.slice(comma + 1);
          const img = inlineImage({ mimeType: mime, data });
          if (img) return { content: "", image: img };
        }
      }
      if (/^#\s+/m.test(b.value) || b.value.length > 200) {
        return { content: b.value };
      }
    }
  }
  return null;
}
var ScrapeView = React.memo(function ScrapeView2({ data }) {
  const api = useApi();
  const { t } = api;
  const [expanded, setExpanded] = React.useState(false);
  const host = data.url ? (() => {
    try {
      return new URL(data.url).hostname;
    } catch {
      return "";
    }
  })() : "";
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-scrape-section" }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-page mcp-scrape-card" }, /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-page-title" }, /* @__PURE__ */ React.createElement("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14 2 14 8 20 8" }), /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "13", x2: "8", y2: "13" }), /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "17", x2: "8", y2: "17" }), /* @__PURE__ */ React.createElement("polyline", { points: "10 9 9 9 8 9" })), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-page-title-text", title: data.title || data.url }, data.title || host || data.url || "Document")), data.url && /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-page-link-row" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "tool-call-websearch-page-link",
      onClick: () => api.links.open(data.url, "browser"),
      title: data.url
    },
    /* @__PURE__ */ React.createElement("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "2", y1: "12", x2: "22", y2: "12" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })),
    /* @__PURE__ */ React.createElement("span", null, host || data.url)
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "tool-call-websearch-external",
      onClick: () => api.links.open(data.url, "external"),
      title: t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" }),
      "aria-label": t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })
    },
    /* @__PURE__ */ React.createElement("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), /* @__PURE__ */ React.createElement("polyline", { points: "15 3 21 3 21 9" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "14", x2: "21", y2: "3" }))
  )), data.image && /* @__PURE__ */ React.createElement("div", { className: "mcp-image-preview" }, /* @__PURE__ */ React.createElement("img", { src: data.image.src, alt: "Screenshot / Image preview", style: { maxWidth: "100%", maxHeight: "380px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", objectFit: "contain" } })), data.content && /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-preview-wrap" }, /* @__PURE__ */ React.createElement("pre", { className: `tool-call-websearch-preview ${expanded ? "is-expanded" : ""}` }, expanded ? data.content : data.content.slice(0, 1e3)), data.content.length > 1e3 && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "mcp-expand-btn",
      onClick: () => setExpanded(!expanded)
    },
    expanded ? t("toolCall.mcp.collapse", { defaultValue: "收起全文" }) : `${t("toolCall.anysearch.fullContent", { defaultValue: "展开全文" })} (${data.content.length} 字符)`
  ))));
});
function extractUrlList(records, blocks) {
  for (const rec of records) {
    if (Array.isArray(rec.urls) && rec.urls.length > 0 && typeof rec.urls[0] === "string") {
      const valid = rec.urls.map(String).filter((u) => safeUrl(u));
      if (valid.length > 0) return valid;
    }
  }
  for (const b of blocks) {
    if (Array.isArray(b.value) && b.value.length > 0 && typeof b.value[0] === "string" && safeUrl(b.value[0])) {
      const valid = b.value.map(String).filter((u) => safeUrl(u));
      if (valid.length > 0) return valid;
    }
  }
  return null;
}
var UrlListView = React.memo(function UrlListView2({ urls, label }) {
  const api = useApi();
  const { t } = api;
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(urls.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => urls.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [urls, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-url-list-section" }, /* @__PURE__ */ React.createElement("h4", null, label, " · ", urls.length), /* @__PURE__ */ React.createElement("div", { className: "mcp-url-list" }, visible.map((url, idx) => {
    return /* @__PURE__ */ React.createElement("div", { key: `${url}-${idx}`, className: "mcp-url-item" }, /* @__PURE__ */ React.createElement("span", { className: "mcp-url-index" }, page * PAGE_SIZE + idx + 1), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "mcp-url-link-btn",
        onClick: () => api.links.open(url, "browser"),
        title: url
      },
      /* @__PURE__ */ React.createElement(Globe, { size: 11, "aria-hidden": "true" }),
      /* @__PURE__ */ React.createElement("span", { className: "mcp-url-text" }, url)
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "tool-call-websearch-external",
        onClick: () => api.links.open(url, "external"),
        title: t("toolCall.mcp.openExternal", { defaultValue: "在系统默认浏览器打开" })
      },
      /* @__PURE__ */ React.createElement(ExternalLink, { size: 10, "aria-hidden": "true" })
    ));
  })), /* @__PURE__ */ React.createElement(Pager, { total: urls.length, page, onPage: setPage }));
});
var KEY_FIELDS = ["name", "title", "identifier", "number", "id", "key", "schema", "status", "state", "type", "kind", "level", "priority", "language", "author", "assignee", "rows", "rls_enabled", "comments", "size", "count", "total", "path", "file", "url", "html_url", "web_url", "description", "created_at", "updated_at", "createdAt", "updatedAt", "date", "time"];
var MAX_COLUMNS = 6;
function RecordCell({ field, value }) {
  const api = useApi();
  if (value === null || value === void 0 || value === "") return /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, "—");
  if (typeof value === "boolean") return /* @__PURE__ */ React.createElement("code", { className: "mcp-param-code" }, String(value));
  if (typeof value === "number") return /* @__PURE__ */ React.createElement("code", { className: "mcp-param-code" }, value);
  if (typeof value === "string") {
    const url = safeUrl(value);
    if (url) return /* @__PURE__ */ React.createElement("button", { type: "button", className: "mcp-cell-link", title: url, onClick: () => api.links.open(url, "browser") }, hostOf(url));
    const text = field.endsWith("_at") || field === "date" ? shortStamp(value) : value;
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-cell-text", title: value }, safeText(text));
  }
  if (Array.isArray(value)) return /* @__PURE__ */ React.createElement("span", { className: "mcp-param-count" }, "[", value.length, "]");
  return /* @__PURE__ */ React.createElement("span", { className: "mcp-param-count" }, `{${Object.keys(value).length}}`);
}
var RecordTable = React.memo(function RecordTable2({ rows, label }) {
  const api = useApi();
  const { t } = api;
  const [requested, setPage] = React.useState(0);
  const [openRow, setOpenRow] = React.useState(null);
  const page = Math.min(requested, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const columns = React.useMemo(() => {
    const present = /* @__PURE__ */ new Set();
    for (const row of visible) {
      if (!isRecord(row)) continue;
      for (const [key, value] of Object.entries(row)) {
        if (value !== null && value !== void 0 && value !== "") present.add(key);
      }
    }
    const ordered = [...KEY_FIELDS.filter((key) => present.has(key)), ...[...present].filter((key) => !KEY_FIELDS.includes(key)).sort()];
    return ordered.slice(0, MAX_COLUMNS);
  }, [visible]);
  const hasRecords = visible.some(isRecord);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-table" }, /* @__PURE__ */ React.createElement("h4", null, label, " · ", rows.length), /* @__PURE__ */ React.createElement("div", { className: "mcp-record-wrap" }, /* @__PURE__ */ React.createElement("table", { className: "mcp-record-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "mcp-record-expander", "aria-hidden": "true" }), hasRecords ? columns.map((key) => /* @__PURE__ */ React.createElement("th", { key }, t(`toolCall.field.${key}`, { defaultValue: key }))) : /* @__PURE__ */ React.createElement("th", null, t("toolCall.mcp.value")))), /* @__PURE__ */ React.createElement("tbody", null, visible.map((row, index) => {
    const key = `${page}:${index}`;
    const record = isRecord(row);
    const open = openRow === key;
    return /* @__PURE__ */ React.createElement(React.Fragment, { key }, /* @__PURE__ */ React.createElement("tr", { className: "mcp-record-row" }, /* @__PURE__ */ React.createElement("td", { className: "mcp-record-expander" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": open, title: t("toolCall.mcp.details"), onClick: () => setOpenRow(open ? null : key) }, open ? "▾" : "▸")), record ? columns.map((field) => /* @__PURE__ */ React.createElement("td", { key: field }, /* @__PURE__ */ React.createElement(RecordCell, { field, value: row[field] }))) : /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(RecordCell, { field: "", value: row }))), open && /* @__PURE__ */ React.createElement("tr", { className: "mcp-record-detail" }, /* @__PURE__ */ React.createElement("td", null), /* @__PURE__ */ React.createElement("td", { colSpan: record ? Math.max(1, columns.length) : 1 }, record ? /* @__PURE__ */ React.createElement(ParamTable, { providerId: "", args: row }) : /* @__PURE__ */ React.createElement(Value, { value: row }))));
  })))), /* @__PURE__ */ React.createElement(Pager, { total: rows.length, page, onPage: setPage }));
});
function BrowserView({ records, collections, blocks }) {
  const { t } = useApi();
  const tables = [];
  const seen = /* @__PURE__ */ new Set();
  for (const record of records) for (const key of collections) {
    const rows = record[key];
    if (Array.isArray(rows) && !seen.has(rows)) {
      seen.add(rows);
      tables.push({ label: key, rows });
    }
  }
  if (!tables.length) {
    for (const block of blocks.slice(0, 20)) {
      if (typeof block.value !== "string" || block.value.length > 2e5) continue;
      const text = block.value;
      if (/^\s*(?:[-*]\s*)?\d+:\s*(?:https?:\/\/|\[|\(current\))/m.test(text)) {
        const rows = text.split(/\r?\n/).filter((line) => /^\s*(?:[-*]\s*)?\d+:/.test(line)).map((line) => {
          const match = line.match(/^\s*(?:[-*]\s*)?(\d+):\s*(.*)$/);
          return { pageId: match?.[1] ?? "", url: line.match(/https?:\/\/[^\s)]+/)?.[0] ?? "", page: line.trim() };
        });
        if (rows.length) tables.push({ label: t("toolCall.mcp.pages"), rows });
      }
      const requestLines = text.split(/\r?\n/).filter((line) => /(?:reqid|msgid)=\d+/.test(line));
      if (requestLines.length) tables.push({ label: "console / network", rows: requestLines.map((line) => ({ id: line.match(/(?:reqid|msgid)=(\d+)/)?.[1] ?? "", record: line.trim() })) });
    }
  }
  return /* @__PURE__ */ React.createElement(React.Fragment, null, tables.slice(0, 8).map((table, index) => /* @__PURE__ */ React.createElement(RecordTable, { key: index, ...table })));
}
function collectionItems(records, collections, blocks, t) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  for (const block of blocks.slice(0, 20)) {
    if (Array.isArray(block.value) && !seen.has(block.value)) {
      seen.add(block.value);
      items.push({ label: t("toolCall.mcp.records"), rows: block.value, entities: detectEntities(block.value) });
    }
  }
  for (const record of records) for (const key of collections) {
    const rows = record[key];
    if (Array.isArray(rows) && !seen.has(rows)) {
      seen.add(rows);
      items.push({ label: t(`toolCall.mcp.collection.${key}`, { defaultValue: key }), rows, entities: detectEntities(rows) });
    }
  }
  if (!items.length) {
    for (const record of records) for (const [key, value] of Object.entries(record)) {
      if (!Array.isArray(value) || value.length === 0 || seen.has(value) || !value.some(isRecord)) continue;
      seen.add(value);
      items.push({ label: t(`toolCall.mcp.collection.${key}`, { defaultValue: safeText(key).slice(0, 60) }), rows: value, entities: detectEntities(value) });
    }
  }
  return items;
}
var GenericView = React.memo(function GenericView2({ items, records }) {
  if (items.length) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, items.slice(0, 6).map(
      (item, index) => item.entities && item.entities.length > 0 ? /* @__PURE__ */ React.createElement(EntityListView, { key: index, entities: item.entities, label: item.label }) : /* @__PURE__ */ React.createElement(RecordTable, { key: index, label: item.label, rows: item.rows })
    ));
  }
  const checklist = checklistFromRecords(records);
  if (checklist) return /* @__PURE__ */ React.createElement(ChecklistView, { shape: checklist });
  const progress = progressFromRecords(records);
  if (progress) return /* @__PURE__ */ React.createElement(ProgressView, { shape: progress });
  return null;
});
var Metrics = React.memo(function Metrics2({ records }) {
  const { t } = useApi();
  const fields = React.useMemo(() => ["id", "status", "progress", "completed", "total", "totalPages", "creditsUsed", "duration", "durationMs"], []);
  const selected = React.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const record of records) {
      for (const key of fields) {
        const value = record[key];
        if (!map.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
          map.set(key, value);
        }
      }
    }
    return map;
  }, [records, fields]);
  if (!selected.size) return null;
  return /* @__PURE__ */ React.createElement("dl", { className: "mcp-metrics" }, [...selected].map(([key, value]) => /* @__PURE__ */ React.createElement("div", { key }, /* @__PURE__ */ React.createElement("dt", null, t(`toolCall.mcp.metric.${key}`, { defaultValue: key })), /* @__PURE__ */ React.createElement("dd", null, preview(value, key)))));
});
var Blocks = React.memo(function Blocks2({ blocks, compact = false }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(blocks.length / 5) - 1));
  const currentBlocks = React.useMemo(() => blocks.slice(page * 5, (page + 1) * 5), [blocks, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-blocks" }, !compact && /* @__PURE__ */ React.createElement("h4", null, t("toolCall.mcp.contentBlocks"), " · ", blocks.length), currentBlocks.map((block, index) => /* @__PURE__ */ React.createElement("div", { className: "mcp-block", key: `${page}:${index}` }, /* @__PURE__ */ React.createElement("h5", null, block.label), block.kind === "image" ? /* @__PURE__ */ React.createElement(ImageBlock, { value: block.value }) : /* @__PURE__ */ React.createElement(BlockValue, { value: block.value }))), /* @__PURE__ */ React.createElement(Pager, { total: blocks.length, page, size: 5, onPage: setPage }));
});
function computeMeta({
  status,
  provider,
  groups,
  records,
  blocks,
  api
}) {
  if (status === "error") {
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-error" }, api.t("toolCall.mcp.failed", { defaultValue: "Failed" }));
  }
  if (status === "running") {
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-running" }, api.t("toolCall.mcp.status.running", { defaultValue: "Running" }));
  }
  if (status === "pending") {
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-pending" }, api.t("toolCall.mcp.status.pending", { defaultValue: "Pending" }));
  }
  if (provider.kind === "search" || groups.length > 0) {
    const totalResults = groups.reduce((acc, g) => acc + (Array.isArray(g.items) ? g.items.length : 0), 0);
    if (totalResults > 0) {
      return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-active" }, api.t("toolCall.mcp.resultCount", {
        defaultValue: "{{count}} 条结果",
        values: { count: totalResults }
      }));
    }
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-muted" }, api.t("toolCall.mcp.noResults", { defaultValue: "无结果" }));
  }
  if (records.length > 0) {
    let collectionCount = 0;
    for (const record of records) {
      for (const col of provider.collections) {
        const val = record[col];
        if (Array.isArray(val) && val.length > 0) {
          collectionCount = Math.max(collectionCount, val.length);
        }
      }
    }
    const count = collectionCount || records.length;
    if (count > 0) {
      return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-active" }, api.t("toolCall.mcp.rowCount", {
        defaultValue: "{{count}} 条记录",
        values: { count }
      }));
    }
  }
  if (blocks.length === 1 && typeof blocks[0].value === "string" && blocks[0].value.length > 100) {
    const len = blocks[0].value.length;
    const formatted = len >= 1e3 ? `${(len / 1e3).toFixed(1)}k` : String(len);
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge mcp-meta-muted" }, api.t("toolCall.mcp.charCount", {
      defaultValue: "{{count}} 字符",
      values: { count: formatted }
    }));
  }
  if (blocks.length > 0) {
    return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge" }, api.t("toolCall.mcp.blockCount", { values: { count: blocks.length } }));
  }
  return /* @__PURE__ */ React.createElement("span", { className: "mcp-meta-badge" }, api.t(`toolCall.mcp.status.${status}`, { defaultValue: status }));
}
function McpToolCall({ toolCall, provider, operation }) {
  const api = useApi();
  const parsed = React.useMemo(() => parseMcp(toolCall.result), [toolCall.result]);
  const records = React.useMemo(() => candidates(parsed.blocks), [parsed.blocks]);
  const args = React.useMemo(() => parseJson(toolCall.arguments), [toolCall.arguments]);
  const exa = React.useMemo(() => provider.id === "exa" ? exaView(parsed.blocks, records, operation) : null, [provider.id, parsed.blocks, records, operation]);
  const feed = React.useMemo(() => provider.kind === "search" && provider.id !== "exa" && provider.id !== "firecrawl" ? parseSearchFeed(provider.id, parsed.blocks, records) : null, [provider.kind, provider.id, parsed.blocks, records]);
  const groups = React.useMemo(() => exa ? exa.groups : feed ? feed.groups : provider.kind === "search" ? searchGroups(records) : [], [exa, feed, provider.kind, records]);
  const [parametersOpen, setParametersOpen] = React.useState(false);
  const status = toolCall.status === "error" || parsed.failed || exa?.partialError ? "error" : toolCall.status;
  const ToolCallNode = api.ui.ToolCallNode;
  const op = api.t(`toolCall.mcp.op.${operation}`, { defaultValue: operation });
  const isSearchTool = provider.kind === "search";
  const subject = React.useMemo(() => isSearchTool && isRecord(args) ? titleSubject(args) : "", [isSearchTool, args]);
  const summary = React.useMemo(() => {
    if (!isRecord(args) || isSearchTool) return "";
    return providerSummary(provider.id, args, api.t);
  }, [provider.id, isSearchTool, args, api.t]);
  const shape = React.useMemo(() => {
    const texts = [];
    for (const block of parsed.blocks) {
      if (typeof block.value === "string") texts.push(block.value);
      else if (isRecord(block.value) && typeof block.value.text === "string") texts.push(block.value.text);
    }
    const joined = texts.join("\n");
    if (joined.length <= 4e5) {
      const diff = parseDiff(joined);
      if (diff) return /* @__PURE__ */ React.createElement(DiffView, { shape: diff });
      const snapshot = parseSnapshot(joined);
      if (snapshot) return /* @__PURE__ */ React.createElement(SnapshotView, { shape: snapshot });
      const tree = parseTree(joined) ?? treeFromRecords(records);
      if (tree) return /* @__PURE__ */ React.createElement(TreeView, { shape: tree });
      const log = parseLogs(joined);
      if (log) return /* @__PURE__ */ React.createElement(LogView, { shape: log });
    }
    return null;
  }, [parsed.blocks, records]);
  const scrapeData = React.useMemo(() => {
    if (groups.length > 0) return null;
    if (provider.kind !== "search" && provider.kind !== "browser" && operation !== "web-fetch") return null;
    return extractScrapeInfo(parsed.blocks, records);
  }, [groups.length, provider.kind, operation, parsed.blocks, records]);
  const urlListData = React.useMemo(() => {
    if (groups.length > 0 || scrapeData !== null) return null;
    return extractUrlList(records, parsed.blocks);
  }, [groups.length, scrapeData, records, parsed.blocks]);
  const recordItems = React.useMemo(
    () => provider.kind === "generic" ? collectionItems(records, provider.collections, parsed.blocks, api.t) : [],
    [provider.kind, provider.collections, records, parsed.blocks, api.t]
  );
  const hasSpecializedView = groups.length > 0 || shape !== null || scrapeData !== null || urlListData !== null || recordItems.length > 0;
  const meta = React.useMemo(() => computeMeta({
    status,
    provider,
    groups,
    records,
    blocks: parsed.blocks,
    api
  }), [status, provider, groups, records, parsed.blocks, api]);
  return /* @__PURE__ */ React.createElement(ToolCallNode, { toolName: toolCall.name, status, lazyBody: true, category: provider.category, badgeName: provider.name, displayName: subject || (summary ? `${op} · ${summary}` : op), displayNameTitle: subject || toolCall.name, className: `snow-external-tool-renderer tool-call-gallery ${isSearchTool ? "tool-call-websearch" : ""}`, meta }, /* @__PURE__ */ React.createElement("div", { className: "mcp-card" }, isRecord(args) && isSearchTool && /* @__PURE__ */ React.createElement(SearchParamsBar, { args }), status === "error" && /* @__PURE__ */ React.createElement("p", { role: "status", className: "mcp-error" }, api.t("toolCall.mcp.failed")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": parametersOpen, onClick: () => setParametersOpen(!parametersOpen) }, api.t("toolCall.mcp.parameters")), parametersOpen && /* @__PURE__ */ React.createElement("section", { className: "mcp-params-section" }, /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, api.t("toolCall.mcp.parameterPrivacy")), isRecord(args) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ParamTable, { providerId: provider.id, args: provider.id === "exa" ? exaParameters(args) : args }), /* @__PURE__ */ React.createElement("details", { className: "mcp-param-details mcp-params-raw" }, /* @__PURE__ */ React.createElement("summary", null, api.t("toolCall.mcp.rawParameters")), /* @__PURE__ */ React.createElement(Value, { value: provider.id === "exa" ? exaParameters(args) : args, parameters: true }))) : /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, HIDDEN)), /* @__PURE__ */ React.createElement(Metrics, { records }), feed?.answer && /* @__PURE__ */ React.createElement("div", { className: "mcp-answer" }, /* @__PURE__ */ React.createElement("strong", null, api.t("toolCall.search.answer"), ":"), /* @__PURE__ */ React.createElement("p", null, preview(feed.answer))), feed?.sources && feed.sources.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "mcp-sources" }, /* @__PURE__ */ React.createElement("strong", null, api.t("toolCall.search.sources"), " · ", feed.sources.length), /* @__PURE__ */ React.createElement("ul", null, feed.sources.slice(0, 20).map((url, index) => /* @__PURE__ */ React.createElement("li", { key: `${url}-${index}` }, /* @__PURE__ */ React.createElement(SafeLink, { value: url }))))), exa?.textPreview && /* @__PURE__ */ React.createElement("div", { className: "mcp-hint-banner" }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })), /* @__PURE__ */ React.createElement("span", null, api.t("toolCall.exa.previewOnly"))), feed?.textPreview && /* @__PURE__ */ React.createElement("div", { className: "mcp-hint-banner" }, /* @__PURE__ */ React.createElement("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })), /* @__PURE__ */ React.createElement("span", null, api.t("toolCall.search.textPreview"))), groups.length > 0 && /* @__PURE__ */ React.createElement(SearchResults, { groups, showPublished: provider.id === "exa" || provider.id === "brave" }), scrapeData && /* @__PURE__ */ React.createElement(ScrapeView, { data: scrapeData }), urlListData && /* @__PURE__ */ React.createElement(UrlListView, { urls: urlListData, label: api.t("toolCall.mcp.op.tavily-map", { defaultValue: "站点链接清单" }) }), shape, provider.kind === "browser" && /* @__PURE__ */ React.createElement(BrowserView, { records, collections: provider.collections, blocks: parsed.blocks }), provider.kind === "generic" && /* @__PURE__ */ React.createElement(GenericView, { items: recordItems, records }), parsed.bounded && /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, api.t("toolCall.mcp.parseLimit")), parsed.blocks.length > 0 ? hasSpecializedView ? /* @__PURE__ */ React.createElement("details", { className: "mcp-raw-blocks-toggle" }, /* @__PURE__ */ React.createElement("summary", null, api.t("toolCall.mcp.viewRawBlocks", { defaultValue: "查看原始响应数据" }), " · ", parsed.blocks.length), /* @__PURE__ */ React.createElement(Blocks, { blocks: parsed.blocks, compact: true })) : /* @__PURE__ */ React.createElement(Blocks, { blocks: parsed.blocks }) : /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, api.t(`toolCall.mcp.status.${status}`)), toolCall.streamingStdout && /* @__PURE__ */ React.createElement(OutputSection, { label: "stdout", value: toolCall.streamingStdout }), toolCall.streamingStderr && /* @__PURE__ */ React.createElement(OutputSection, { label: "stderr", value: toolCall.streamingStderr })));
}

// src/providers.ts
var providers = [
  { id: "firecrawl", name: "Firecrawl", services: ["firecrawl"], category: "web", kind: "search", collections: ["web", "news", "images", "data"] },
  { id: "chrome", name: "Chrome DevTools", services: ["chrome-devtools", "chrome_devtools"], category: "web", kind: "browser", collections: ["pages", "messages", "requests", "entries", "insights", "metrics"] },
  { id: "playwright", name: "Playwright", services: ["playwright"], category: "web", kind: "browser", collections: ["tabs", "requests", "messages", "entries"] },
  { id: "context7", name: "Context7", services: ["context7"], category: "read", kind: "generic", collections: ["libraries"] },
  { id: "github", name: "GitHub", services: ["github"], category: "git", kind: "generic", collections: ["repositories", "issues", "pull_requests", "commits", "branches", "releases", "files", "gists", "discussions", "notifications", "users", "teams", "jobs", "workflow_runs", "items"] },
  { id: "exa", name: "Exa", services: ["exa"], category: "search", kind: "search", collections: ["results"] },
  { id: "brave", name: "Brave Search", services: ["brave-search", "brave_search", "brave"], category: "search", kind: "search", collections: ["results", "items", "grounding", "sources"] },
  { id: "tavily", name: "Tavily", services: ["tavily", "tavily-mcp", "tavily_mcp", "tavily-backup", "tavily_backup"], category: "search", kind: "search", collections: ["results", "failed_results", "images"] },
  { id: "perplexity", name: "Perplexity", services: ["perplexity"], category: "search", kind: "search", collections: ["results"] },
  { id: "parallel", name: "Parallel", services: ["parallel", "parallel-search", "parallel_search"], category: "search", kind: "search", collections: ["results", "errors"] },
  { id: "serpapi", name: "SerpApi", services: ["serpapi"], category: "search", kind: "search", collections: ["organic_results", "news_results", "local_results", "images_results", "shopping_results", "video_results", "top_stories", "related_questions", "related_searches", "perspectives", "immersive_products", "knowledge_graph", "pagination"] },
  { id: "kagi", name: "Kagi", services: ["kagi", "kagimcp"], category: "search", kind: "search", collections: ["results"] },
  { id: "linkup", name: "Linkup", services: ["linkup"], category: "search", kind: "search", collections: ["results", "images"] },
  { id: "searxng", name: "SearXNG", services: ["searxng", "mcp-searxng", "mcp_searxng"], category: "search", kind: "search", collections: ["results", "suggestions", "answers", "infoboxes", "corrections", "engines"] },
  { id: "supabase", name: "Supabase", services: ["supabase", "mcp-server-supabase", "mcp-server-postgrest"], category: "database", kind: "generic", collections: ["tables", "columns", "extensions", "migrations", "functions", "projects", "organizations", "branches", "buckets", "lints", "logs", "advisors", "schemas"] },
  { id: "postman", name: "Postman", services: ["postman", "postman-mcp", "postman_mcp"], category: "workflow", kind: "generic", collections: ["workspaces", "collections", "environments", "mocks", "specs", "items", "requests", "responses"] },
  { id: "linear", name: "Linear", services: ["linear", "linear-mcp", "linear_mcp"], category: "todo", kind: "generic", collections: ["issues", "projects", "teams", "users", "comments", "cycles", "labels", "statuses", "documents"] },
  { id: "sentry", name: "Sentry", services: ["sentry", "sentry-mcp", "sentry_mcp"], category: "telemetry", kind: "generic", collections: ["organizations", "projects", "issues", "events", "traces", "logs", "metrics", "profiles", "replays", "spans", "resources"] },
  { id: "gitlab", name: "GitLab", services: ["gitlab", "gitlab-mcp", "gitlab_mcp"], category: "git", kind: "generic", collections: ["projects", "issues", "merge_requests", "branches", "commits", "pipelines", "jobs", "labels", "members", "namespaces", "discussions", "notes", "artifacts"] },
  { id: "docker", name: "Docker", services: ["docker", "docker-mcp", "docker_mcp"], category: "terminal", kind: "generic", collections: ["containers", "images", "networks", "volumes"] },
  { id: "k8s", name: "Kubernetes", services: ["kubernetes", "k8s", "kubernetes-mcp", "k8s-mcp"], category: "terminal", kind: "generic", collections: ["pods", "nodes", "namespaces", "events", "contexts", "targets", "resources", "deployments", "services", "configmaps", "secrets"] },
  { id: "notion", name: "Notion", services: ["notion", "notion-mcp", "notion_mcp"], category: "outline", kind: "generic", collections: ["results", "pages", "blocks", "comments", "users", "databases", "data_sources"] },
  { id: "duckduckgo", name: "DuckDuckGo", services: ["duckduckgo", "duckduckgo-search", "duckduckgo_search", "ddg"], category: "search", kind: "search", collections: ["results"] },
  { id: "jina", name: "Jina", services: ["jina", "jina-search", "jina_search", "jina-reader", "jina_reader"], category: "search", kind: "search", collections: ["results", "images", "data"] }
];
var normalizeName = (name) => name.replace(/_/g, "-");
var prefixMap = [];
for (const provider of providers) {
  const aliases = [...new Set(provider.services.map(normalizeName))];
  for (const alias of aliases) {
    prefixMap.push({ prefix: `${alias}-`, provider, aliasLen: alias.length });
  }
}
prefixMap.sort((a, b) => b.prefix.length - a.prefix.length);
var cache = /* @__PURE__ */ new Map();
var MAX_CACHE_SIZE = 500;
function identifyProvider(name) {
  if (cache.has(name)) return cache.get(name);
  const normalized = normalizeName(name);
  let result = null;
  for (const entry of prefixMap) {
    if (normalized.startsWith(entry.prefix)) {
      let operation = normalized.slice(entry.aliasLen + 1);
      while (operation.startsWith(entry.prefix)) {
        operation = operation.slice(entry.aliasLen + 1);
      }
      if (operation) {
        result = { provider: entry.provider, operation };
        break;
      }
    }
  }
  if (cache.size >= MAX_CACHE_SIZE) cache.clear();
  cache.set(name, result);
  return result;
}

// src/index.tsx
function renderAnysearch(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") return null;
  if (!context.toolCall.name.startsWith("anysearch-") && !context.toolCall.name.startsWith("anysearch_")) return null;
  return /* @__PURE__ */ React.createElement(ApiContext.Provider, { value: api }, /* @__PURE__ */ React.createElement(AnysearchToolCall, { toolCall: context.toolCall }));
}
function renderDbx(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") return null;
  if (!context.toolCall.name.startsWith("dbx-") && !context.toolCall.name.startsWith("dbx_")) return null;
  return /* @__PURE__ */ React.createElement(ApiContext.Provider, { value: api }, /* @__PURE__ */ React.createElement(DbxToolCall, { toolCall: context.toolCall }));
}
function renderMcp(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call") return null;
  const match = identifyProvider(context.toolCall.name);
  if (!match) return null;
  return /* @__PURE__ */ React.createElement(ApiContext.Provider, { value: api }, /* @__PURE__ */ React.createElement(McpToolCall, { key: context.toolCall.interactionId, toolCall: context.toolCall, ...match }));
}
export {
  renderAnysearch,
  renderDbx,
  renderMcp
};
