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
export {
  renderAnysearch,
  renderDbx
};
