import type { Translate } from "./types";
import { isRecord, preview, safeUrl, searchGroups } from "./mcp";
import type { ContentBlock, SearchGroup } from "./mcp";

export type SearchFeedView = {
  groups: SearchGroup[];
  answer?: string;
  sources?: string[];
  queries?: string[];
  textPreview?: boolean;
};

const MAX_ITEMS = 80;
const MAX_BODY_CHARS = 3000;

function textOf(block: ContentBlock): string | undefined {
  if (block.kind !== "value") return undefined;
  if (typeof block.value === "string") return block.value;
  if (isRecord(block.value) && typeof block.value.text === "string") return block.value.text;
  return undefined;
}

/**
 * 结构化抽取搜索类 MCP 返回的多样化形态：
 * 1. JSON 顶层 results / web.results / organic_results / items 等
 * 2. Perplexity answer / citations / search_results
 * 3. Linkup / Parallel / Tavily answer / sources / queries
 * 4. SearXNG / Kagi / SerpApi 多引擎和多分类条目
 */
export function parseSearchFeed(
  providerId: string,
  blocks: readonly ContentBlock[],
  records: readonly Record<string, unknown>[],
): SearchFeedView {
  const groups: SearchGroup[] = searchGroups(records);
  const seenUrls = new Set<string>();

  // 1. 从已有的 records 里提取通用或各服务专属字段
  for (const record of records) {
    // Tavily answer / Perplexity answer / general answer
    let answerText: string | undefined;
    if (typeof record.answer === "string" && record.answer.trim()) answerText = record.answer;
    else if (typeof record.response === "string" && record.response.trim()) answerText = record.response;

    // 专属 search_results / organic_results / sources / citations
    const candidates = [
      record.results,
      record.search_results,
      record.organic_results,
      record.citations,
      record.sources,
      record.places,
      record.locations,
      record.news,
      record.videos,
      record.images,
    ];

    for (const cand of candidates) {
      if (Array.isArray(cand)) {
        const valid = cand.filter((item) => {
          if (!isRecord(item)) return false;
          const u = safeUrl(item.url ?? item.link ?? item.source_url ?? item.uri);
          return !!u;
        });
        if (valid.length > 0) {
          const groupName = Array.isArray(record.places) ? "places" : "results";
          const existing = groups.find((g) => g.name === groupName);
          if (existing) {
            for (const item of valid) {
              const url = String((item as Record<string, unknown>).url ?? (item as Record<string, unknown>).link ?? "");
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                existing.items.push(item);
              }
            }
          } else {
            for (const item of valid) {
              const url = String((item as Record<string, unknown>).url ?? (item as Record<string, unknown>).link ?? "");
              seenUrls.add(url);
            }
            groups.push({ name: groupName, items: valid });
          }
        }
      }
    }
  }

  // 2. 如果没有任何结构化检索条目，尝试从文本块解析常见 markdown 链接列表 (如 `1. [Title](URL) - snippet`)
  let textPreview = false;
  if (groups.length === 0) {
    const fallbackItems: Record<string, unknown>[] = [];
    for (const block of blocks.slice(0, 10)) {
      const text = textOf(block);
      if (!text) continue;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (fallbackItems.length >= MAX_ITEMS) break;
        // 匹配形如 [Title](https://...) 或 - https://...
        const mdLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
        if (mdLink && safeUrl(mdLink[2])) {
          fallbackItems.push({
            title: mdLink[1].slice(0, 200),
            url: mdLink[2],
            snippet: line.replace(mdLink[0], "").trim().slice(0, MAX_BODY_CHARS),
          });
        }
      }
    }
    if (fallbackItems.length > 0) {
      groups.push({ name: "results", items: fallbackItems });
      textPreview = true;
    }
  }

  // 3. 提取顶层总结或回答（如 Perplexity / Tavily / Linkup）
  let answer: string | undefined;
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

/** 统一为新增的 8 个服务提取核心参数摘要 */
export function searchProviderSummary(providerId: string, args: Record<string, unknown>, t: Translate): string {
  const parts: string[] = [];
  const q = args.query ?? args.q ?? args.search_query;
  if (typeof q === "string") parts.push(`${t("toolCall.search.query")}: ${preview(q, "query", true)}`);

  // URL / URLs
  if (typeof args.url === "string") parts.push(`url: ${preview(args.url, "url", true)}`);
  else if (Array.isArray(args.urls)) parts.push(`urls: ${args.urls.length}`);

  // 各服务特色参数
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
