/**
 * AnysearchToolCall — 外部 MCP（Anysearch 检索服务）的统一渲染器。
 *
 * Anysearch 是第三方检索服务（非本仓库内置），通过外部 MCP 协议接入：
 * 工具名以 `anysearch-` 前缀暴露（如 anysearch-search），也可能被规范化为
 * 下划线风格（anysearch_batch_search），因此前端按两种前缀稳定匹配并渲染，
 * 与内置工具保持同一套 ToolCallNode 风格。
 *
 * 覆盖操作：search（网页检索）/ batch-search（多查询并行检索）/
 * extract（单页正文提取）/ get-sub-domains（子领域能力发现）。
 *
 * 返回格式（实测）统一为 MCP content 包装：
 *   { content: [{ type: "text", text }], _meta?, structuredContent? }
 * 其中 search / batch_search / get_sub_domains 的 text 是 Markdown，
 * extract 的 text 是 JSON 字符串（structuredContent 另给结构化副本）。
 *
 * 注意：外部 MCP 的返回结构可能随 Anysearch 版本变化，Markdown 解析均做了
 * 容错（解析不出条目就回退原文展示），保证任何情况下都有内容可看。
 */
import { React, useMemo, type ReactNode } from "./runtime";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Search,
  useApi,
} from "./api";
import type { ToolCallInfo } from "./types";

type AnysearchToolCallProps = {
  toolCall: ToolCallInfo;
};

type ParsedResult =
  | { type: "success"; data: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "raw"; text: string }
  | { type: "empty" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const parseArgs = (args: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(args);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseResult = (result: string | undefined): ParsedResult => {
  if (!result) {
    return { type: "empty" };
  }
  try {
    const parsed: unknown = JSON.parse(result);
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

/** 提取 MCP 标准 content 包装（{ content: [{ text, type }] }）中的首个文本。 */
const mcpText = (data: Record<string, unknown>): string | undefined => {
  const content = Array.isArray(data.content) ? data.content : [];
  for (const part of content) {
    if (isRecord(part) && part.type === "text") {
      const text = asString(part.text);
      if (text) {
        return text;
      }
    }
  }
  return undefined;
};

const truncate = (value: string, max = 56): string =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const hostOf = (url: string): string => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

// ── Markdown 解析 ──────────────────────────────────────────────────────────

type SearchItem = { title: string; url: string; snippet: string };
type SearchSection = { query?: string; items: SearchItem[] };

/** `## Query 1: tokio runtime tutorial`（batch_search 的分组标题）。 */
const QUERY_HEADING = /^##\s+Query\s+\d+\s*:\s*(.*)$/;

/** `### 1. Tokio - An asynchronous Rust runtime`（结果条目标题）。 */
const ITEM_HEADING = /^###\s+(?:\d+\.\s*)?(.+)$/;

/** `- **URL**: https://tokio.rs/`。 */
const URL_LINE = /^-\s+\*\*URL\*\*\s*:\s*(\S+)/;

/**
 * 解析 Anysearch 的搜索结果 Markdown（search / batch_search 共用）。
 *
 * 单查询返回一个无 query 的分组；批量检索按 `## Query N:` 切分为多组。
 * 条目要求有 URL 才算有效（与内置 websearch 的硬性要求一致）。
 */
const parseSearchSections = (text: string): SearchSection[] => {
  const sections: SearchSection[] = [];
  let current: SearchSection | null = null;
  let currentItem: SearchItem | null = null;

  const flushItem = (): void => {
    if (currentItem && current && currentItem.url) {
      current.items.push(currentItem);
    }
    currentItem = null;
  };
  const flushSection = (): void => {
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
    // `## Search Results (N results, Xms)` 等其它二级标题不是条目。
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
      currentItem.snippet = currentItem.snippet
        ? `${currentItem.snippet} ${part}`
        : part;
    }
  }
  flushSection();
  return sections;
};

/** `## Search Results (2 results, 1413ms)` → 总条数与耗时。 */
const parseResultSummary = (
  text: string,
): { total?: number; elapsedMs?: number } => {
  const match = text.match(
    /^##\s+Search Results\s*\((\d+)\s+results?(?:,\s*([\d.]+)\s*ms)?\)/im,
  );
  if (!match) {
    return {};
  }
  const total = Number(match[1]);
  const elapsedMs = match[2] !== undefined ? Number(match[2]) : undefined;
  return {
    total: Number.isFinite(total) ? total : undefined,
    elapsedMs:
      elapsedMs !== undefined && Number.isFinite(elapsedMs)
        ? elapsedMs
        : undefined,
  };
};

type ExtractResult = { url: string; title: string; content: string };

/**
 * 解析 extract 结果：优先用 structuredContent（结构化副本），
 * 其次把 content 里的 text 当 JSON 字符串解析（Anysearch 实测形态）。
 */
const parseExtract = (
  data: Record<string, unknown>,
  text: string | undefined,
): ExtractResult | null => {
  let candidate: Record<string, unknown> | null = isRecord(
    data.structuredContent,
  )
    ? data.structuredContent
    : null;
  if (!candidate && text) {
    try {
      const parsed: unknown = JSON.parse(text);
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
    content: asString(candidate.content) ?? "",
  };
};

type DomainParam = { name: string; required: boolean; description: string };
type DomainCapability = {
  name: string;
  description: string;
  params: DomainParam[];
};
type DomainSection = { domain: string; entries: DomainCapability[] };

/** `## code Domain Capabilities (2 available)`。 */
const DOMAIN_HEADING =
  /^##\s+(\S+)\s+Domain Capabilities\s*\((\d+)\s+available\)/i;

/** `### code.doc`。 */
const CAPABILITY_HEADING = /^###\s+(.+)$/;

/** `- \`library\` (required): Library or framework name to query docs for`。 */
const PARAM_LINE = /^-\s+`([^`]+)`\s*(\(required\))?\s*:?\s*(.*)$/;

/** 解析 get_sub_domains 的 Markdown 能力清单。 */
const parseDomainSections = (text: string): DomainSection[] => {
  const sections: DomainSection[] = [];
  let current: DomainSection | null = null;
  let currentCap: DomainCapability | null = null;
  let inParams = false;

  const flushCap = (): void => {
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
          required: paramMatch[2] !== undefined,
          description: paramMatch[3].trim(),
        });
      }
      continue;
    }
    // 参数区之前的所有普通段落拼成描述。
    if (!line.startsWith("**") && !line.startsWith("#")) {
      currentCap.description = currentCap.description
        ? `${currentCap.description} ${line}`
        : line;
    }
  }
  flushCap();
  return sections;
};

/** 结果条目（序号 + 标题 + URL + 摘要），复用内置 websearch 的条目样式。 */
const ResultItem = ({
  item,
  index,
  onOpenInApp,
  onOpenExternal,
  openInBrowserTitle,
  openExternalTitle,
}: {
  item: SearchItem;
  index: number;
  onOpenInApp: (url: string) => void;
  onOpenExternal: (url: string) => void;
  openInBrowserTitle: string;
  openExternalTitle: string;
}): React.JSX.Element => (
  <article className="tool-call-websearch-result">
    <div className="tool-call-websearch-result-head">
      <span className="tool-call-websearch-result-index" aria-hidden="true">
        {index + 1}
      </span>
      <button
        type="button"
        className="tool-call-websearch-result-title"
        onClick={() => onOpenInApp(item.url)}
        title={`${item.url}\n${openInBrowserTitle}`}
      >
        <span className="tool-call-websearch-result-title-text">
          {item.title}
        </span>
      </button>
      <button
        type="button"
        className="tool-call-websearch-external"
        onClick={() => onOpenExternal(item.url)}
        title={openExternalTitle}
        aria-label={openExternalTitle}
      >
        <ExternalLink size={11} aria-hidden="true" />
      </button>
    </div>
    <div className="tool-call-websearch-result-url">
      <Globe size={10} aria-hidden="true" />
      <span>{hostOf(item.url)}</span>
    </div>
    {item.snippet ? (
      <p className="tool-call-websearch-result-snippet">{item.snippet}</p>
    ) : null}
  </article>
);

export const AnysearchToolCall = ({
  toolCall,
}: AnysearchToolCallProps): React.JSX.Element => {
  const api = useApi();
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  // Capture this card's current API, never the aborted module-loading API.
  const openInAppBrowser = (url: string): void => api.links.open(url, "browser");
  const openExternalLink = (url: string): void => api.links.open(url, "external");
  // 外部 MCP 工具名可能是连字符（anysearch-search）或下划线
  // （anysearch_batch_search），统一归一为连字符后提取操作名，
  // 保证与下方 switch 的 case 匹配。
  const operation = toolCall.name
    .replace(/^anysearch[-_](.+)$/, "$1")
    .replace(/^anysearch[-_]/, "")
    .replace(/_/g, "-");

  const parsedArgs = useMemo(
    () => parseArgs(toolCall.arguments),
    [toolCall.arguments],
  );
  const parsedResult = useMemo(
    () => parseResult(toolCall.result),
    [toolCall.result],
  );

  const effectiveStatus =
    parsedResult.type === "error" ? "error" : toolCall.status;
  const isRunning = toolCall.status === "running";

  const data = parsedResult.type === "success" ? parsedResult.data : null;
  const contentTextValue =
    data !== null
      ? mcpText(data)
      : parsedResult.type === "raw"
        ? parsedResult.text
        : undefined;

  /* 各操作的结构化解析（解析不出则回退原文展示）。 */
  const sections = useMemo(
    () => (contentTextValue ? parseSearchSections(contentTextValue) : []),
    [contentTextValue],
  );
  const resultSummary = useMemo(
    () => (contentTextValue ? parseResultSummary(contentTextValue) : {}),
    [contentTextValue],
  );
  const extractResult = useMemo(
    () => (data ? parseExtract(data, contentTextValue) : null),
    [data, contentTextValue],
  );
  const domainSections = useMemo(
    () =>
      operation === "get-sub-domains" && contentTextValue
        ? parseDomainSections(contentTextValue)
        : [],
    [operation, contentTextValue],
  );

  /* 折叠态头部摘要。 */
  let displayName: string | undefined;
  let meta: ReactNode = null;

  switch (operation) {
    case "search": {
      const query = asString(parsedArgs?.query);
      displayName = query ? truncate(query.replace(/\s+/g, " ")) : undefined;
      const itemCount = sections[0]?.items.length ?? 0;
      const total = resultSummary.total ?? itemCount;
      meta =
        parsedResult.type === "success" ? (
          <span
            className={`tool-call-websearch-count ${
              total > 0 ? "tool-call-websearch-count-active" : ""
            }`}
          >
            {t("toolCall.anysearch.resultCount", {
              values: { count: total },
            })}
          </span>
        ) : null;
      break;
    }
    case "batch-search": {
      const queries = Array.isArray(parsedArgs?.queries)
        ? parsedArgs.queries
        : [];
      const firstQuery = isRecord(queries[0])
        ? asString(queries[0].query)
        : undefined;
      displayName = firstQuery
        ? truncate(firstQuery.replace(/\s+/g, " "))
        : undefined;
      const groupCount = sections.length || queries.length;
      meta =
        groupCount > 0 ? (
          <span className="tool-call-websearch-count tool-call-websearch-count-active">
            {t("toolCall.anysearch.queryCount", {
              values: { count: groupCount },
            })}
          </span>
        ) : null;
      break;
    }
    case "extract": {
      const argUrl = asString(parsedArgs?.url);
      const targetUrl = extractResult?.url ?? argUrl;
      displayName = targetUrl ? truncate(hostOf(targetUrl), 60) : undefined;
      meta =
        extractResult && extractResult.content.length > 0 ? (
          <span className="tool-call-websearch-count tool-call-websearch-count-active">
            {t("toolCall.anysearch.charCount", {
              values: {
                count: extractResult.content.length.toLocaleString(),
              },
            })}
          </span>
        ) : null;
      break;
    }
    case "get-sub-domains": {
      const domains = Array.isArray(parsedArgs?.domains)
        ? parsedArgs.domains.map(String)
        : [];
      displayName = domains.length > 0 ? domains.join(", ") : undefined;
      const entryCount = domainSections.reduce(
        (sum, section) => sum + section.entries.length,
        0,
      );
      meta =
        entryCount > 0 ? (
          <span className="tool-call-websearch-count tool-call-websearch-count-active">
            {t("toolCall.anysearch.capabilityCount", {
              values: { count: entryCount },
            })}
          </span>
        ) : null;
      break;
    }
    default: {
      // 防御：Anysearch 未来新增工具（未列入 switch）时至少展示操作名摘要，
      // 结构化解析结果仍走下方通用渲染。
      displayName = operation ? truncate(operation, 48) : undefined;
      break;
    }
  }

  const openInBrowserTitle = t("toolCall.anysearch.openInBrowser");
  const openExternalTitle = t("toolCall.anysearch.openExternal");

  /* 参数行（按操作挑选可读字段）。 */
  const params: ReactNode[] = [];
  if (operation === "search") {
    const query = asString(parsedArgs?.query);
    const maxResults = parsedArgs?.maxResults;
    if (query) {
      params.push(
        <div className="tool-call-websearch-param-item" key="query">
          <Search size={11} aria-hidden="true" />
          <span className="tool-call-websearch-param-label">
            {t("toolCall.anysearch.query")}
          </span>
          <code className="tool-call-websearch-param-value">{query}</code>
        </div>,
      );
    }
    if (typeof maxResults === "number") {
      params.push(
        <div className="tool-call-websearch-param-tags" key="max">
          <span className="tool-call-websearch-param-tag">
            {t("toolCall.anysearch.maxResults")}: {maxResults}
          </span>
        </div>,
      );
    }
  } else if (operation === "extract") {
    const url = asString(parsedArgs?.url);
    if (url) {
      params.push(
        <div className="tool-call-websearch-param-item" key="url">
          <Globe size={11} aria-hidden="true" />
          <span className="tool-call-websearch-param-label">
            {t("toolCall.anysearch.url")}
          </span>
          <span className="tool-call-websearch-param-value">{url}</span>
        </div>,
      );
    }
  } else if (operation === "get-sub-domains") {
    const domains = Array.isArray(parsedArgs?.domains)
      ? parsedArgs.domains.map(String)
      : [];
    if (domains.length > 0) {
      params.push(
        <div className="tool-call-websearch-param-item" key="domains">
          <Search size={11} aria-hidden="true" />
          <span className="tool-call-websearch-param-label">
            {t("toolCall.anysearch.domains")}
          </span>
          <code className="tool-call-websearch-param-value">
            {domains.join(", ")}
          </code>
        </div>,
      );
    }
  }

  /* 原文兜底：只在实际有专属内容可渲染时隐藏原文，未知格式不能空白。 */
  const hasStructuredContent =
    (parsedResult.type === "success" &&
      (operation === "search" || operation === "batch-search") &&
      sections.length > 0) ||
    (operation === "extract" && extractResult !== null) ||
    (operation === "get-sub-domains" && domainSections.length > 0);
  const rawFallbackText = !hasStructuredContent
    ? contentTextValue ?? (data ? JSON.stringify(data, null, 2) : undefined)
    : undefined;

  return (
    <ToolCallNode
      toolName={toolCall.name}
      badgeName={
        t(`toolCall.anysearch.op.${operation}`, { defaultValue: "" }) ||
        t(`toolNames.${toolCall.name}`, { defaultValue: "" }) ||
        operation || toolCall.name
      }
      category="web"
      displayName={displayName}
      displayNameTitle={toolCall.arguments}
      status={effectiveStatus}
      meta={meta}
      className="snow-external-tool-renderer tool-call-websearch tool-call-anysearch"
    >
      <div className="tool-call-body tool-call-websearch-body">
        {params.length > 0 ? (
          <div className="tool-call-websearch-params">{params}</div>
        ) : null}

        {parsedResult.type === "error" ? (
          <div className="tool-call-error">
            <AlertCircle size={12} aria-hidden="true" />
            <span>{localizeToolError(t, parsedResult.message)}</span>
          </div>
        ) : null}

        {/* search：单查询结果列表 */}
        {operation === "search" &&
        parsedResult.type === "success" &&
        sections.length > 0 ? (
          sections[0].items.length > 0 ? (
            <div className="tool-call-websearch-results">
              {sections[0].items.map((item, index) => (
                <ResultItem
                  key={`${item.url}-${index}`}
                  item={item}
                  index={index}
                  onOpenInApp={openInAppBrowser}
                  onOpenExternal={openExternalLink}
                  openInBrowserTitle={openInBrowserTitle}
                  openExternalTitle={openExternalTitle}
                />
              ))}
            </div>
          ) : (
            <div className="tool-call-websearch-empty">
              <Search size={14} aria-hidden="true" />
              <span>{t("toolCall.anysearch.noResults")}</span>
            </div>
          )
        ) : null}

        {/* batch-search：按查询分组 */}
        {operation === "batch-search" &&
        parsedResult.type === "success" &&
        sections.length > 0 ? (
          <div className="tool-call-anysearch-sections">
            {sections.map((section, sectionIndex) => (
              <section
                className="tool-call-anysearch-section"
                key={`${section.query ?? "query"}-${sectionIndex}`}
              >
                <div className="tool-call-anysearch-section-title">
                  <Search size={11} aria-hidden="true" />
                  <span>
                    {section.query ??
                      t("toolCall.anysearch.queryFallback", {
                        values: { index: sectionIndex + 1 },
                      })}
                  </span>
                  <span className="tool-call-websearch-param-tag">
                    {t("toolCall.anysearch.resultCount", {
                      values: { count: section.items.length },
                    })}
                  </span>
                </div>
                {section.items.length > 0 ? (
                  <div className="tool-call-websearch-results">
                    {section.items.map((item, index) => (
                      <ResultItem
                        key={`${item.url}-${index}`}
                        item={item}
                        index={index}
                        onOpenInApp={openInAppBrowser}
                        onOpenExternal={openExternalLink}
                        openInBrowserTitle={openInBrowserTitle}
                        openExternalTitle={openExternalTitle}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="tool-call-websearch-empty">
                    <Search size={14} aria-hidden="true" />
                    <span>{t("toolCall.anysearch.noResults")}</span>
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : null}

        {/* extract：页面信息卡 + 正文预览 / 全文 */}
        {operation === "extract" && extractResult ? (
          <>
            <div className="tool-call-websearch-page">
              <div className="tool-call-websearch-page-title">
                <FileText size={13} aria-hidden="true" />
                <span
                  className="tool-call-websearch-page-title-text"
                  title={extractResult.title || undefined}
                >
                  {extractResult.title || hostOf(extractResult.url)}
                </span>
              </div>
              <div className="tool-call-websearch-page-link-row">
                <button
                  type="button"
                  className="tool-call-websearch-page-link"
                  onClick={() => openInAppBrowser(extractResult.url)}
                  title={`${extractResult.url}\n${openInBrowserTitle}`}
                >
                  <Globe size={10} aria-hidden="true" />
                  <span>{hostOf(extractResult.url)}</span>
                </button>
                <button
                  type="button"
                  className="tool-call-websearch-external"
                  onClick={() => openExternalLink(extractResult.url)}
                  title={openExternalTitle}
                  aria-label={openExternalTitle}
                >
                  <ExternalLink size={10} aria-hidden="true" />
                </button>
              </div>
            </div>

            {extractResult.content ? (
              <>
                <div className="tool-call-websearch-preview-wrap">
                  <span className="tool-call-websearch-section-label">
                    {t("toolCall.anysearch.preview")}
                  </span>
                  <pre className="tool-call-websearch-preview">
                    {truncate(extractResult.content, 600)}
                  </pre>
                </div>
                <details className="tool-call-websearch-full">
                  <summary>
                    {t("toolCall.anysearch.fullContent")}
                    {extractResult.content.includes(
                      "[Content truncated...]",
                    ) ? (
                      <span className="tool-call-websearch-truncated">
                        {t("toolCall.anysearch.truncated")}
                      </span>
                    ) : null}
                  </summary>
                  <pre className="tool-call-section-pre">
                    {extractResult.content}
                  </pre>
                </details>
              </>
            ) : (
              <div className="tool-call-websearch-empty">
                <FileText size={14} aria-hidden="true" />
                <span>{t("toolCall.anysearch.noContent")}</span>
              </div>
            )}
          </>
        ) : null}

        {/* get-sub-domains：子领域能力清单 */}
        {operation === "get-sub-domains" && domainSections.length > 0 ? (
          <div className="tool-call-anysearch-caps">
            {domainSections.map((section) => (
              <section
                className="tool-call-anysearch-cap-group"
                key={section.domain}
              >
                <div className="tool-call-anysearch-section-title">
                  <Search size={11} aria-hidden="true" />
                  <span>{section.domain}</span>
                  <span className="tool-call-websearch-param-tag">
                    {t("toolCall.anysearch.capabilityCount", {
                      values: { count: section.entries.length },
                    })}
                  </span>
                </div>
                {section.entries.map((entry) => (
                  <article className="tool-call-anysearch-cap" key={entry.name}>
                    <div className="tool-call-anysearch-cap-name">
                      {entry.name}
                    </div>
                    {entry.description ? (
                      <p className="tool-call-anysearch-cap-desc">
                        {entry.description}
                      </p>
                    ) : null}
                    {entry.params.length > 0 ? (
                      <div className="tool-call-anysearch-cap-params">
                        <span className="tool-call-websearch-section-label">
                          {t("toolCall.anysearch.parameters")}
                        </span>
                        {entry.params.map((param) => (
                          <div
                            className="tool-call-anysearch-cap-param"
                            key={param.name}
                          >
                            <code className="tool-call-anysearch-cap-param-name">
                              {param.name}
                            </code>
                            {param.required ? (
                              <span className="tool-call-websearch-param-tag">
                                {t("toolCall.anysearch.required")}
                              </span>
                            ) : null}
                            {param.description ? (
                              <span className="tool-call-anysearch-cap-param-desc">
                                {param.description}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </section>
            ))}
          </div>
        ) : null}

        {/* 原文兜底（结构化解析失败时） */}
        {rawFallbackText ? (
          <section className="tool-call-section">
            <span className="tool-call-section-label">
              {t("toolCall.anysearch.result")}
            </span>
            <pre className="tool-call-section-pre">{rawFallbackText}</pre>
          </section>
        ) : null}

        {/* 等待 / 执行中 */}
        {parsedResult.type === "empty" ? (
          <div
            className={`tool-call-websearch-pending ${
              isRunning ? "tool-call-websearch-pending-running" : ""
            }`}
          >
            {isRunning ? (
              <Loader2
                className="tool-call-icon-spinning"
                size={14}
                aria-hidden="true"
              />
            ) : (
              <Globe size={14} aria-hidden="true" />
            )}
            <span>
              {isRunning
                ? operation === "extract"
                  ? t("toolCall.anysearch.extracting")
                  : t("toolCall.anysearch.running")
                : t("toolCall.anysearch.waiting")}
            </span>
          </div>
        ) : null}
      </div>
    </ToolCallNode>
  );
};
