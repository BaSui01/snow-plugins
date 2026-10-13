// Generated from src/ by scripts/build.mjs — edit TypeScript sources, not this file.
// Derived from Snow App, Copyright (c) 2026 MayMay, MIT. See LICENSE and NOTICE.

// src/runtime.ts
var React = window.SnowAppPlugin.React;
var { useMemo, createContext, useContext } = React;

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

// src/AnysearchToolCall.tsx
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asString = (value) => typeof value === "string" && value.trim() !== "" ? value : void 0;
var parseArgs = (args) => {
  try {
    const parsed = JSON.parse(args);
    return isRecord(parsed) ? parsed : null;
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
    if (!isRecord(parsed)) {
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
    if (isRecord(part) && part.type === "text") {
      const text = asString(part.text);
      if (text) {
        return text;
      }
    }
  }
  return void 0;
};
var truncate = (value, max = 56) => value.length > max ? `${value.slice(0, max)}...` : value;
var hostOf = (url) => {
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
  let candidate = isRecord(
    data.structuredContent
  ) ? data.structuredContent : null;
  if (!candidate && text) {
    try {
      const parsed = JSON.parse(text);
      if (isRecord(parsed)) {
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
)), /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-result-url" }, /* @__PURE__ */ React.createElement(Globe, { size: 10, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, hostOf(item.url))), item.snippet ? /* @__PURE__ */ React.createElement("p", { className: "tool-call-websearch-result-snippet" }, item.snippet) : null);
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
      const firstQuery = isRecord(queries[0]) ? asString(queries[0].query) : void 0;
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
      displayName = targetUrl ? truncate(hostOf(targetUrl), 60) : void 0;
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
  if (operation === "search") {
    const query = asString(parsedArgs?.query);
    const maxResults = parsedArgs?.maxResults;
    if (query) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item", key: "query" }, /* @__PURE__ */ React.createElement(Search, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.query")), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, query))
      );
    }
    if (typeof maxResults === "number") {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-tags", key: "max" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-tag" }, t("toolCall.anysearch.maxResults"), ": ", maxResults))
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
    const domains = Array.isArray(parsedArgs?.domains) ? parsedArgs.domains.map(String) : [];
    if (domains.length > 0) {
      params.push(
        /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-param-item", key: "domains" }, /* @__PURE__ */ React.createElement(Search, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tool-call-websearch-param-label" }, t("toolCall.anysearch.domains")), /* @__PURE__ */ React.createElement("code", { className: "tool-call-websearch-param-value" }, domains.join(", ")))
      );
    }
  }
  const hasStructuredContent = parsedResult.type === "success" && (operation === "search" || operation === "batch-search") && sections.length > 0 || operation === "extract" && extractResult !== null || operation === "get-sub-domains" && domainSections.length > 0;
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
    /* @__PURE__ */ React.createElement("div", { className: "tool-call-body tool-call-websearch-body" }, params.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-params" }, params) : null, parsedResult.type === "error" ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-error" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 12, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, localizeToolError(t, parsedResult.message))) : null, operation === "search" && parsedResult.type === "success" && sections.length > 0 ? sections[0].items.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-websearch-results" }, sections[0].items.map((item, index) => /* @__PURE__ */ React.createElement(
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
      extractResult.title || hostOf(extractResult.url)
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
      /* @__PURE__ */ React.createElement("span", null, hostOf(extractResult.url))
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
    ))) : null, rawFallbackText ? /* @__PURE__ */ React.createElement("section", { className: "tool-call-section" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-section-label" }, t("toolCall.anysearch.result")), /* @__PURE__ */ React.createElement("pre", { className: "tool-call-section-pre" }, rawFallbackText)) : null, parsedResult.type === "empty" ? /* @__PURE__ */ React.createElement(
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
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asString2 = (value) => typeof value === "string" && value.trim() !== "" ? value : void 0;
var parseArgs2 = (args) => {
  try {
    const parsed = JSON.parse(args);
    return isRecord2(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
var parseResult2 = (result) => {
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
var truncate2 = (value, max = 56) => value.length > max ? `${value.slice(0, max)}...` : value;
var parseQueryTable = (data) => {
  const extract = (candidate) => {
    if (!isRecord2(candidate)) {
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
    if (isRecord2(candidate.data) && Array.isArray(candidate.data.rows)) {
      return {
        rows: candidate.data.rows,
        columns: Array.isArray(candidate.data.columns) ? candidate.data.columns : null
      };
    }
    return null;
  };
  const extracted = extract(data) ?? (isRecord2(data.result) ? extract(data.result) : null);
  if (!extracted || extracted.rows.length === 0) {
    return null;
  }
  const rawRows = extracted.rows;
  const rawColumns = extracted.columns;
  if (isRecord2(rawRows[0])) {
    const columns2 = Object.keys(rawRows[0]);
    const rows2 = rawRows.map((row) => {
      if (!isRecord2(row)) {
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
    if (isRecord2(part)) {
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
    default: {
      displayName = operation ? truncate2(operation, 48) : void 0;
      break;
    }
  }
  const commandText = operation === "execute-query" || operation === "execute-and-show" ? asString2(parsedArgs?.sql) : operation === "execute-redis-command" ? asString2(parsedArgs?.command) : void 0;
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
    /* @__PURE__ */ React.createElement("div", { className: "tool-call-body tool-call-dbx-body" }, commandText ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-dbx-command" }, /* @__PURE__ */ React.createElement(Play, { size: 11, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("code", null, commandText)) : null, queryTable ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-dbx-table-wrap" }, /* @__PURE__ */ React.createElement(
      DataTableViewer,
      {
        columns: queryTable.columns,
        rows: queryTable.rows,
        maxInitialRows: 20
      }
    )) : data && Array.isArray(data.rows) && data.rows.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-dbx-empty" }, /* @__PURE__ */ React.createElement(Database, { size: 14, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, t("toolCall.dbx.emptyResult"))) : null, parsedResult.type === "error" ? /* @__PURE__ */ React.createElement("div", { className: "tool-call-error" }, /* @__PURE__ */ React.createElement(AlertCircle, { size: 12, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, localizeToolError(t, parsedResult.message))) : null, resultText && !queryTable ? /* @__PURE__ */ React.createElement("section", { className: "tool-call-section" }, /* @__PURE__ */ React.createElement("span", { className: "tool-call-section-label" }, t("toolCall.common.result")), /* @__PURE__ */ React.createElement("pre", { className: "tool-call-section-pre" }, resultText)) : null)
  );
};

// src/mcp.ts
var PAGE_SIZE = 20;
var TEXT_PAGE_SIZE = 12e3;
var MAX_JSON_CHARS = 8 * 1024 * 1024;
var HIDDEN = "[redacted]";
var BINARY = "[binary omitted]";
var isRecord3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
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
  if (isRecord3(value)) return `{${Object.keys(value).length}}`;
  return String(value);
}
function failed(value, depth = 0) {
  if (!isRecord3(value) || depth > 8) return false;
  if (value.isError === true || value.success === false || value.status === "failed" || value.status === "error") return true;
  if (value.error !== void 0 && value.error !== null && value.error !== false && value.error !== "") return true;
  for (const key of ["structuredContent", "data", "result"]) {
    if (failed(value[key], depth + 1)) return true;
  }
  if (Array.isArray(value.content)) {
    return value.content.some((part) => isRecord3(part) && (failed(part, depth + 1) || part.type === "text" && failed(parseJson(typeof part.text === "string" ? part.text : void 0), depth + 1)));
  }
  return false;
}
function contentBlock(part, index) {
  if (!isRecord3(part)) return { label: `content[${index}]`, kind: "value", value: part };
  if (part.type === "image") return { label: `content[${index}] · image`, kind: "image", value: part };
  if (part.type === "text" && typeof part.text === "string") {
    const extra = Object.fromEntries(Object.entries(part).filter(([key]) => key !== "text" && key !== "type"));
    return { label: `content[${index}] · text`, kind: "value", value: Object.keys(extra).length ? { text: parseJson(part.text), ...extra } : parseJson(part.text) };
  }
  if (part.type === "resource" && isRecord3(part.resource)) {
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
  if (isRecord3(root) && !Array.isArray(root.content) && root.structuredContent === void 0) {
    for (const key of ["result", "data"]) {
      const value = root[key];
      if (isRecord3(value) && (Array.isArray(value.content) || value.structuredContent !== void 0)) {
        envelope = value;
        transportKey = key;
        break;
      }
    }
  }
  const blocks = [];
  if (isRecord3(envelope) && (Array.isArray(envelope.content) || envelope.structuredContent !== void 0)) {
    if (envelope.structuredContent !== void 0) blocks.push({ label: "structuredContent", kind: "value", value: envelope.structuredContent });
    if (Array.isArray(envelope.content)) {
      envelope.content.forEach((part, index) => blocks.push(contentBlock(part, index)));
    }
    const fields = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "content" && key !== "structuredContent"));
    if (Object.keys(fields).length) blocks.push({ label: "envelope", kind: "value", value: fields });
    if (root !== envelope && isRecord3(root)) blocks.push({ label: "transport", kind: "value", value: Object.fromEntries(Object.entries(root).filter(([key]) => key !== transportKey)) });
  } else blocks.push({ label: "result", kind: "value", value: root });
  return { blocks, failed: failed(root), bounded: result.length > MAX_JSON_CHARS };
}
function candidates(blocks) {
  const output = [];
  const visit = (value, depth) => {
    if (!isRecord3(value) || depth > 5 || output.length >= 80) return;
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
      const items = Array.isArray(field) ? field : isRecord3(field) && Array.isArray(field.results) ? field.results : null;
      if (items && !seen.has(items)) {
        seen.add(items);
        groups.push({ name, items });
      }
    }
  }
  return groups;
}
function inlineImage(value) {
  if (!isRecord3(value) || typeof value.data !== "string" || typeof value.mimeType !== "string") return null;
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
  if (isRecord3(block.value) && typeof block.value.text === "string") return block.value.text;
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
function exaSummary(args, t) {
  const parts = [];
  if (typeof args.query === "string") parts.push(`${t("toolCall.exa.query")}: ${preview(args.query, "query", true)}`);
  if (typeof args.numResults === "number" && Number.isFinite(args.numResults)) parts.push(`${t("toolCall.exa.numResults")}: ${args.numResults}`);
  if (typeof args.objective === "string") parts.push(`${t("toolCall.exa.objectiveLength")}: ${args.objective.length}`);
  if (Array.isArray(args.urls)) parts.push(`${t("toolCall.exa.urlCount")}: ${args.urls.length}`);
  if (typeof args.maxCharacters === "number" && Number.isFinite(args.maxCharacters)) parts.push(`${t("toolCall.exa.maxCharacters")}: ${args.maxCharacters}`);
  return parts.join(" · ").slice(0, 400);
}
function exaParameters(args) {
  return Object.hasOwn(args, "objective") ? { ...args, objective: HIDDEN } : args;
}

// src/searchFeeds.ts
var MAX_ITEMS2 = 80;
var MAX_BODY_CHARS2 = 3e3;
function textOf2(block) {
  if (block.kind !== "value") return void 0;
  if (typeof block.value === "string") return block.value;
  if (isRecord3(block.value) && typeof block.value.text === "string") return block.value.text;
  return void 0;
}
function parseSearchFeed(providerId, blocks, records) {
  const groups = searchGroups(records);
  const seenUrls = /* @__PURE__ */ new Set();
  for (const record of records) {
    let answerText;
    if (typeof record.answer === "string" && record.answer.trim()) answerText = record.answer;
    else if (typeof record.response === "string" && record.response.trim()) answerText = record.response;
    const candidates2 = [
      record.results,
      record.search_results,
      record.organic_results,
      record.citations,
      record.sources,
      record.places,
      record.locations,
      record.news,
      record.videos,
      record.images
    ];
    for (const cand of candidates2) {
      if (Array.isArray(cand)) {
        const valid = cand.filter((item) => {
          if (!isRecord3(item)) return false;
          const u = safeUrl(item.url ?? item.link ?? item.source_url ?? item.uri);
          return !!u;
        });
        if (valid.length > 0) {
          const groupName = Array.isArray(record.places) ? "places" : "results";
          const existing = groups.find((g) => g.name === groupName);
          if (existing) {
            for (const item of valid) {
              const url = String(item.url ?? item.link ?? "");
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                existing.items.push(item);
              }
            }
          } else {
            for (const item of valid) {
              const url = String(item.url ?? item.link ?? "");
              seenUrls.add(url);
            }
            groups.push({ name: groupName, items: valid });
          }
        }
      }
    }
  }
  let textPreview = false;
  if (groups.length === 0) {
    const fallbackItems = [];
    for (const block of blocks.slice(0, 10)) {
      const text = textOf2(block);
      if (!text) continue;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (fallbackItems.length >= MAX_ITEMS2) break;
        const mdLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
        if (mdLink && safeUrl(mdLink[2])) {
          fallbackItems.push({
            title: mdLink[1].slice(0, 200),
            url: mdLink[2],
            snippet: line.replace(mdLink[0], "").trim().slice(0, MAX_BODY_CHARS2)
          });
        }
      }
    }
    if (fallbackItems.length > 0) {
      groups.push({ name: "results", items: fallbackItems });
      textPreview = true;
    }
  }
  let answer;
  for (const record of records) {
    if (typeof record.answer === "string" && record.answer.trim()) {
      answer = record.answer;
      break;
    }
    if (typeof record.response === "string" && record.response.trim()) {
      answer = record.response;
      break;
    }
    if (typeof record.summary === "string" && record.summary.trim()) {
      answer = record.summary;
      break;
    }
  }
  return { groups, answer, textPreview };
}
function searchProviderSummary(providerId, args, t) {
  const parts = [];
  const q = args.query ?? args.q ?? args.search_query;
  if (typeof q === "string") parts.push(`${t("toolCall.search.query")}: ${preview(q, "query", true)}`);
  if (typeof args.url === "string") parts.push(`url: ${preview(args.url, "url", true)}`);
  else if (Array.isArray(args.urls)) parts.push(`urls: ${args.urls.length}`);
  if (typeof args.depth === "string") parts.push(`depth: ${args.depth}`);
  if (typeof args.search_depth === "string") parts.push(`depth: ${args.search_depth}`);
  if (typeof args.mode === "string") parts.push(`mode: ${args.mode}`);
  if (typeof args.engine === "string") parts.push(`engine: ${args.engine}`);
  if (typeof args.category === "string") parts.push(`category: ${args.category}`);
  if (typeof args.country === "string") parts.push(`country: ${args.country}`);
  const max = args.max_results ?? args.count ?? args.numResults ?? args.limit;
  if (typeof max === "number" && Number.isFinite(max)) parts.push(`max: ${max}`);
  return parts.join(" · ").slice(0, 400);
}

// src/McpToolCall.tsx
function Pager({ total, page, onPage, size = PAGE_SIZE }) {
  const { t } = useApi();
  if (total <= size) return null;
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-pager" }, /* @__PURE__ */ React.createElement("button", { type: "button", disabled: page === 0, onClick: () => onPage(Math.max(0, page - 1)) }, t("toolCall.mcp.previous")), /* @__PURE__ */ React.createElement("span", null, t("toolCall.mcp.range", { values: { start: page * size + 1, end: Math.min(total, (page + 1) * size), total } })), /* @__PURE__ */ React.createElement("button", { type: "button", disabled: page >= last, onClick: () => onPage(Math.min(last, page + 1)) }, t("toolCall.mcp.next")));
}
function SafeLink({ value, label }) {
  const api = useApi();
  const url = safeUrl(value);
  if (!url) return null;
  return /* @__PURE__ */ React.createElement("button", { className: "mcp-link", type: "button", title: url, onClick: () => api.links.open(url, "browser") }, safeText(label || url).slice(0, 180));
}
function TextValue({ value }) {
  const { t } = useApi();
  const text = React.useMemo(() => safeText(value), [value]);
  const [expanded, setExpanded] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(text.length / TEXT_PAGE_SIZE) - 1));
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-text" }, /* @__PURE__ */ React.createElement("pre", null, expanded ? text.slice(page * TEXT_PAGE_SIZE, (page + 1) * TEXT_PAGE_SIZE) : text.slice(0, 600)), text.length > 600 && /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": expanded, onClick: () => setExpanded(!expanded) }, t(expanded ? "toolCall.mcp.collapse" : "toolCall.mcp.fullText"), " · ", text.length), expanded && /* @__PURE__ */ React.createElement(Pager, { total: text.length, page, size: TEXT_PAGE_SIZE, onPage: setPage }), /* @__PURE__ */ React.createElement(SafeLink, { value }));
}
function Value({ value, field = "", parameters = false, depth = 0 }) {
  const { t } = useApi();
  const [open, setOpen] = React.useState(false);
  const [continueDeep, setContinueDeep] = React.useState(false);
  const [requested, setPage] = React.useState(0);
  if (hiddenKey(field, parameters)) return /* @__PURE__ */ React.createElement("code", { className: "mcp-muted" }, t("toolCall.mcp.redacted"));
  if (field === "blob" || field === "base64" || field === "data" && typeof value === "string" && value.length > 128 && /^[a-z0-9+/]+=*$/i.test(value)) return /* @__PURE__ */ React.createElement("code", { className: "mcp-muted" }, BINARY);
  if (typeof value === "string") return /* @__PURE__ */ React.createElement(TextValue, { value });
  if (!Array.isArray(value) && !isRecord3(value)) return /* @__PURE__ */ React.createElement("code", null, String(value));
  const keys = Array.isArray(value) ? null : Object.keys(value);
  const total = keys ? keys.length : value.length;
  const page = Math.min(requested, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1));
  const start = page * PAGE_SIZE;
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-tree" }, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": open, onClick: () => setOpen(!open) }, open ? "▾" : "▸", " ", Array.isArray(value) ? "[ ]" : "{ }", " · ", total, " ", t("toolCall.mcp.items")), open && depth >= 32 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": continueDeep, onClick: () => setContinueDeep(!continueDeep) }, t("toolCall.mcp.continueDepth")), continueDeep && /* @__PURE__ */ React.createElement(Value, { value, field, parameters })), open && depth < 32 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "mcp-fields" }, Array.from({ length: Math.min(PAGE_SIZE, total - start) }, (_, offset) => {
    const index = start + offset;
    const key = keys ? keys[index] : String(index);
    const child = keys ? value[key] : value[index];
    return /* @__PURE__ */ React.createElement("div", { className: "mcp-field", key }, /* @__PURE__ */ React.createElement("span", { className: "mcp-key" }, safeText(key).slice(0, 100)), /* @__PURE__ */ React.createElement(Value, { value: child, field: key, parameters, depth: depth + 1 }));
  })), /* @__PURE__ */ React.createElement(Pager, { total, page, onPage: setPage })));
}
function ImageBlock({ value }) {
  const { t } = useApi();
  const [revealed, setRevealed] = React.useState(null);
  const [failedValue, setFailedValue] = React.useState(null);
  const shown = revealed === value;
  const broken = failedValue === value;
  const image = React.useMemo(() => inlineImage(value), [value]);
  const metadata = isRecord3(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "data")) : value;
  return /* @__PURE__ */ React.createElement("div", { className: "mcp-image" }, /* @__PURE__ */ React.createElement(Value, { value: metadata }), !image || broken ? /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.mcp.imageBlocked")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": shown, onClick: () => setRevealed(shown ? null : value) }, t(shown ? "toolCall.mcp.hideImage" : "toolCall.mcp.showImage"), " · ", Math.ceil(image.bytes / 1024), " KiB"), shown && /* @__PURE__ */ React.createElement("img", { src: image.src, alt: t("toolCall.mcp.inlineImage"), loading: "lazy", onError: () => setFailedValue(value), onLoad: (event) => {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16e6) setFailedValue(value);
  } })));
}
var SearchResults = React.memo(function SearchResults2({ groups, showPublished = false }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const items = React.useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ group: group.name, item }))), [groups]);
  const page = Math.min(requested, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1));
  const pageItems = React.useMemo(() => items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [items, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-search" }, /* @__PURE__ */ React.createElement("h4", null, t("toolCall.mcp.searchResults"), " · ", items.length), pageItems.map(({ group, item }, index) => /* @__PURE__ */ React.createElement("article", { key: page * PAGE_SIZE + index }, /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t(`toolCall.mcp.group.${group}`, { defaultValue: group })), isRecord3(item) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("strong", null, preview(item.title ?? item.name ?? item.url ?? "", "title")), /* @__PURE__ */ React.createElement(SafeLink, { value: item.url ?? item.link }), showPublished && typeof item.publishedDate === "string" && /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, t("toolCall.exa.published"), ": ", preview(item.publishedDate).slice(0, 80)), /* @__PURE__ */ React.createElement("p", null, preview(item.description ?? item.snippet ?? item.text ?? "")), /* @__PURE__ */ React.createElement(Value, { value: item })) : /* @__PURE__ */ React.createElement(Value, { value: item }))), /* @__PURE__ */ React.createElement(Pager, { total: items.length, page, onPage: setPage }));
});
var RecordTable = React.memo(function RecordTable2({ rows, label }) {
  const api = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1));
  const visible = React.useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);
  const columns = React.useMemo(() => [...new Set(visible.flatMap((row) => isRecord3(row) ? Object.keys(row) : ["value"]))].slice(0, 12), [visible]);
  const tableColumns = React.useMemo(() => columns.map((key) => safeText(key).slice(0, 100)), [columns]);
  const tableRows = React.useMemo(() => visible.map((row) => columns.map((key) => preview(isRecord3(row) ? row[key] : row, key))), [visible, columns]);
  const Table = api.ui.DataTableViewer;
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-table" }, /* @__PURE__ */ React.createElement("h4", null, label, " · ", rows.length), /* @__PURE__ */ React.createElement(Table, { columns: tableColumns, rows: tableRows, maxInitialRows: PAGE_SIZE, enableExport: false, enableSearch: false }), /* @__PURE__ */ React.createElement(Pager, { total: rows.length, page, onPage: setPage }), /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, api.t("toolCall.mcp.tablePreview")));
});
function BrowserView({ records, blocks }) {
  const { t } = useApi();
  const tables = [];
  const seen = /* @__PURE__ */ new Set();
  for (const record of records) for (const key of ["pages", "messages", "requests", "entries", "insights", "metrics"]) {
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
function GenericView({ records, blocks }) {
  const { t } = useApi();
  const tables = [];
  const seen = /* @__PURE__ */ new Set();
  for (const block of blocks.slice(0, 20)) {
    if (Array.isArray(block.value) && !seen.has(block.value)) {
      seen.add(block.value);
      tables.push({ label: t("toolCall.mcp.records"), rows: block.value });
    }
  }
  for (const record of records) for (const key of [
    "libraries",
    "repositories",
    "items",
    "files",
    "commits",
    "results",
    "collections",
    "environments",
    "requests",
    "responses",
    "issues",
    "projects",
    "comments",
    "users",
    "teams",
    "events",
    "traces",
    "containers",
    "images",
    "volumes",
    "pods",
    "services",
    "deployments",
    "schemas",
    "tables",
    "columns",
    "pages",
    "databases",
    "blocks"
  ]) {
    const rows = record[key];
    if (Array.isArray(rows) && !seen.has(rows)) {
      seen.add(rows);
      tables.push({ label: t(`toolCall.mcp.collection.${key}`, { defaultValue: key }), rows });
    }
  }
  return /* @__PURE__ */ React.createElement(React.Fragment, null, tables.slice(0, 6).map((table, index) => /* @__PURE__ */ React.createElement(RecordTable, { key: index, ...table })));
}
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
var Blocks = React.memo(function Blocks2({ blocks }) {
  const { t } = useApi();
  const [requested, setPage] = React.useState(0);
  const page = Math.min(requested, Math.max(0, Math.ceil(blocks.length / 5) - 1));
  const currentBlocks = React.useMemo(() => blocks.slice(page * 5, (page + 1) * 5), [blocks, page]);
  return /* @__PURE__ */ React.createElement("section", { className: "mcp-blocks" }, /* @__PURE__ */ React.createElement("h4", null, t("toolCall.mcp.contentBlocks"), " · ", blocks.length), currentBlocks.map((block, index) => /* @__PURE__ */ React.createElement("div", { className: "mcp-block", key: `${page}:${index}` }, /* @__PURE__ */ React.createElement("h5", null, block.label), block.kind === "image" ? /* @__PURE__ */ React.createElement(ImageBlock, { value: block.value }) : /* @__PURE__ */ React.createElement(Value, { value: block.value }))), /* @__PURE__ */ React.createElement(Pager, { total: blocks.length, page, size: 5, onPage: setPage }));
});
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
  const summaryKeys = React.useMemo(() => provider.kind === "browser" ? ["url", "pageId", "uid", "target", "ref", "index", "part", "key", "action", "type", "filename", "format", "fullPage"] : ["query", "url", "libraryName", "libraryId", "language", "owner", "repo", "project", "issue", "issue_id", "issueId", "collection", "container", "pod", "namespace", "database", "table", "method", "status", "action", "id", "formats", "limit"], [provider.kind]);
  const parts = React.useMemo(() => {
    if (!isRecord3(args)) return [];
    const list = summaryKeys.filter((key) => args[key] !== void 0 && !hiddenKey(key, true)).map((key) => `${key}: ${preview(args[key], key, true)}`);
    for (const key of ["elements", "fields", "text", "value", "function", "script", "prompt", "code", "paths", "data"]) {
      const value = args[key];
      if (Array.isArray(value)) list.push(`${key}.count: ${value.length}`);
      else if (typeof value === "string") list.push(`${key}.length: ${value.length}`);
      else if (isRecord3(value)) list.push(`${key}.count: ${Object.keys(value).length}`);
    }
    return list;
  }, [args, summaryKeys]);
  const summary = React.useMemo(() => {
    if (provider.id === "exa" && isRecord3(args)) {
      return exaSummary(args, api.t);
    }
    if (feed && isRecord3(args)) {
      return searchProviderSummary(provider.id, args, api.t);
    }
    return parts.join(" · ").slice(0, 400);
  }, [provider.id, feed, args, api.t, parts]);
  return /* @__PURE__ */ React.createElement(ToolCallNode, { toolName: toolCall.name, status, lazyBody: true, category: provider.category, badgeName: provider.name, displayName: summary ? `${op} · ${summary}` : op, displayNameTitle: toolCall.name, className: "snow-external-tool-renderer", meta: /* @__PURE__ */ React.createElement("span", null, parsed.blocks.length ? api.t("toolCall.mcp.blockCount", { values: { count: parsed.blocks.length } }) : api.t(`toolCall.mcp.status.${status}`)) }, /* @__PURE__ */ React.createElement("div", { className: "mcp-card" }, summary && /* @__PURE__ */ React.createElement("p", { className: "mcp-summary" }, summary), status === "error" && /* @__PURE__ */ React.createElement("p", { role: "status", className: "mcp-error" }, api.t("toolCall.mcp.failed")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-expanded": parametersOpen, onClick: () => setParametersOpen(!parametersOpen) }, api.t("toolCall.mcp.parameters")), parametersOpen && /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, api.t("toolCall.mcp.parameterPrivacy")), isRecord3(args) ? /* @__PURE__ */ React.createElement(Value, { value: provider.id === "exa" ? exaParameters(args) : args, parameters: true }) : /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, HIDDEN)), /* @__PURE__ */ React.createElement(Metrics, { records }), feed?.answer && /* @__PURE__ */ React.createElement("div", { className: "mcp-answer" }, /* @__PURE__ */ React.createElement("strong", null, api.t("toolCall.search.answer"), ":"), /* @__PURE__ */ React.createElement("p", null, preview(feed.answer))), exa?.textPreview && /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, api.t("toolCall.exa.previewOnly")), feed?.textPreview && /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, api.t("toolCall.search.textPreview")), groups.length > 0 && /* @__PURE__ */ React.createElement(SearchResults, { groups, showPublished: provider.id === "exa" || provider.id === "brave" }), provider.kind === "browser" && /* @__PURE__ */ React.createElement(BrowserView, { records, blocks: parsed.blocks }), provider.kind === "generic" && /* @__PURE__ */ React.createElement(GenericView, { records, blocks: parsed.blocks }), parsed.bounded && /* @__PURE__ */ React.createElement("p", { className: "mcp-muted" }, api.t("toolCall.mcp.parseLimit")), parsed.blocks.length > 0 ? /* @__PURE__ */ React.createElement(Blocks, { blocks: parsed.blocks }) : /* @__PURE__ */ React.createElement("span", { className: "mcp-muted" }, api.t(`toolCall.mcp.status.${status}`)), toolCall.streamingStdout && /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("h4", null, "stdout"), /* @__PURE__ */ React.createElement(TextValue, { value: toolCall.streamingStdout })), toolCall.streamingStderr && /* @__PURE__ */ React.createElement("section", null, /* @__PURE__ */ React.createElement("h4", null, "stderr"), /* @__PURE__ */ React.createElement(TextValue, { value: toolCall.streamingStderr }))));
}

// src/providers.ts
var providers = [
  { id: "firecrawl", name: "Firecrawl", services: ["firecrawl"], category: "web", kind: "search" },
  { id: "chrome", name: "Chrome DevTools", services: ["chrome-devtools", "chrome_devtools"], category: "web", kind: "browser" },
  { id: "playwright", name: "Playwright", services: ["playwright"], category: "web", kind: "browser" },
  { id: "context7", name: "Context7", services: ["context7"], kind: "generic" },
  { id: "github", name: "GitHub", services: ["github"], kind: "generic" },
  { id: "exa", name: "Exa", services: ["exa"], category: "web", kind: "search" },
  { id: "brave", name: "Brave Search", services: ["brave-search", "brave_search", "brave"], category: "web", kind: "search" },
  { id: "tavily", name: "Tavily", services: ["tavily", "tavily-mcp", "tavily_mcp"], category: "web", kind: "search" },
  { id: "perplexity", name: "Perplexity", services: ["perplexity"], category: "web", kind: "search" },
  { id: "parallel", name: "Parallel", services: ["parallel", "parallel-search", "parallel_search"], category: "web", kind: "search" },
  { id: "serpapi", name: "SerpApi", services: ["serpapi"], category: "web", kind: "search" },
  { id: "kagi", name: "Kagi", services: ["kagi", "kagimcp"], category: "web", kind: "search" },
  { id: "linkup", name: "Linkup", services: ["linkup"], category: "web", kind: "search" },
  { id: "searxng", name: "SearXNG", services: ["searxng", "mcp-searxng", "mcp_searxng"], category: "web", kind: "search" },
  // ── 新增 8 个现代开发者顶级 MCP ──
  { id: "supabase", name: "Supabase", services: ["supabase", "mcp-server-supabase", "mcp-server-postgrest"], category: "database", kind: "generic" },
  { id: "postman", name: "Postman", services: ["postman", "postman-mcp", "postman_mcp"], kind: "generic" },
  { id: "linear", name: "Linear", services: ["linear", "linear-mcp", "linear_mcp"], kind: "generic" },
  { id: "sentry", name: "Sentry", services: ["sentry", "sentry-mcp", "sentry_mcp"], kind: "generic" },
  { id: "gitlab", name: "GitLab", services: ["gitlab", "gitlab-mcp", "gitlab_mcp"], kind: "generic" },
  { id: "docker", name: "Docker", services: ["docker", "docker-mcp", "docker_mcp"], kind: "generic" },
  { id: "k8s", name: "Kubernetes", services: ["kubernetes", "k8s", "kubernetes-mcp", "k8s-mcp"], kind: "generic" },
  { id: "notion", name: "Notion", services: ["notion", "notion-mcp", "notion_mcp"], kind: "generic" }
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
