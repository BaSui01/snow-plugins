import type { Translate } from "./types";
import { isRecord, preview, safeText, safeUrl, searchGroups } from "./mcp";
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
/** Brave returns one JSON string per result as separate content blocks. */
const MAX_PER_BLOCK_ITEMS = 20;

function textOf(block: ContentBlock): string | undefined {
  if (block.kind !== "value") return undefined;
  if (typeof block.value === "string") return block.value;
  if (isRecord(block.value) && typeof block.value.text === "string") return block.value.text;
  return undefined;
}

const urlOf = (item: Record<string, unknown>): string | null =>
  safeUrl(item.url ?? item.link ?? item.source_url ?? item.uri);

/** Recognise a single search-result object (Brave emits one per text block). */
function asResultItem(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (!urlOf(value)) return null;
  if (value.title === undefined && value.name === undefined && value.description === undefined) return null;
  return value;
}

/** Perplexity embeds citations as a trailing "Citations:" block in the answer. */
function splitCitations(text: string): { body: string; citations: string[] } {
  const match = /\n\s*Citations:\s*\n([\s\S]*)$/i.exec(text);
  if (!match) return { body: text, citations: [] };
  const citations = match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\[?\d+\]?[\s.)]*\s*/, "").trim())
    .filter((line) => safeUrl(line));
  return { body: text.slice(0, match.index).trim(), citations };
}

/**
 * Structured extraction for search-class MCP results. Each branch reflects the
 * shape verified for that service; when nothing matches, the caller keeps the
 * full content blocks, so no data is dropped.
 */
export function parseSearchFeed(
  providerId: string,
  blocks: readonly ContentBlock[],
  records: readonly Record<string, unknown>[],
): SearchFeedView {
  const groups: SearchGroup[] = searchGroups(records);
  const seenUrls = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      if (isRecord(item)) {
        const url = urlOf(item);
        if (url) seenUrls.add(url);
      }
    }
  }

  const push = (name: string, items: Record<string, unknown>[]): void => {
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

  const itemArrays: Record<string, readonly string[]> = {
    serpapi: ["organic_results", "news_results", "local_results", "images_results", "shopping_results", "video_results", "top_stories", "related_questions", "perspectives", "immersive_products"],
    searxng: ["results", "suggestions", "answers", "infoboxes"],
    tavily: ["results", "failed_results"],
    parallel: ["results"],
    linkup: ["results", "images"],
    firecrawl: ["web", "news", "images"],
    brave: ["items"],
  };

  // 1. Service-specific structured arrays already surfaced as records.
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

  // 2. Answer / response / summary text, plus service-specific citation fields.
  let answer: string | undefined;
  const sources: string[] = [];
  for (const record of records) {
    if (!answer) {
      for (const key of ["answer", "response", "summary", "result", "output"] as const) {
        const value = record[key];
        if (typeof value === "string" && value.trim() && (providerId !== "searxng" || key !== "result")) {
          answer = value;
          break;
        }
      }
    }
    for (const key of ["citations", "sources", "urls"] as const) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const entry of value) {
          const url = typeof entry === "string" ? safeUrl(entry) : isRecord(entry) ? urlOf(entry) : null;
          if (url) sources.push(url);
        }
      }
    }
  }

  // 3. Perplexity: citations are embedded in the answer string.
  if (answer && providerId === "perplexity") {
    const split = splitCitations(answer);
    if (split.citations.length) {
      answer = split.body;
      sources.push(...split.citations);
    }
  }

  // 4. Brave / Kagi / Tavily style: one result object per text block.
  if (!groups.length || providerId === "brave") {
    const loose: Record<string, unknown>[] = [];
    for (const block of blocks.slice(0, 40)) {
      if (loose.length >= MAX_ITEMS) break;
      const text = textOf(block);
      if (!text || text.length > 200000) continue;
      const parsed = text.trim();
      if (!parsed.startsWith("{") && !parsed.startsWith("[")) continue;
      let decoded: unknown;
      try {
        decoded = JSON.parse(parsed) as unknown;
      } catch {
        continue;
      }
      const candidates = Array.isArray(decoded) ? decoded : [decoded];
      for (const candidate of candidates.slice(0, MAX_PER_BLOCK_ITEMS)) {
        const item = asResultItem(candidate);
        if (item) loose.push(item);
      }
    }
    if (loose.length) push("results", loose);
  }

  // 5. Tavily renders a plain-text "Title / URL / Content" report.
  let textPreview = false;
  if (providerId === "tavily" && !groups.length) {
    const fallback: Record<string, unknown>[] = [];
    for (const block of blocks.slice(0, 10)) {
      const text = textOf(block);
      if (!text) continue;
      for (const chunk of text.split(/\n(?=Title:\s)/)) {
        const url = /URL:\s*(\S+)/.exec(chunk)?.[1];
        const safe = url ? safeUrl(url) : null;
        if (!safe) continue;
        fallback.push({
          title: /Title:\s*([^\n]*)/.exec(chunk)?.[1]?.trim() ?? "",
          url: safe,
          snippet: /Content:\s*([\s\S]*)/.exec(chunk)?.[1]?.trim().slice(0, MAX_BODY_CHARS) ?? "",
        });
        if (fallback.length >= MAX_ITEMS) break;
      }
    }
    if (fallback.length) {
      push("results", fallback);
      textPreview = true;
    }
  }

  // 6. Last resort: Markdown link lists such as `1. [Title](URL) - snippet`.
  if (!groups.length) {
    const fallback: Record<string, unknown>[] = [];
    for (const block of blocks.slice(0, 10)) {
      const text = textOf(block);
      if (!text) continue;
      for (const line of text.split(/\r?\n/)) {
        if (fallback.length >= MAX_ITEMS) break;
        const mdLink = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
        if (mdLink && safeUrl(mdLink[2])) {
          fallback.push({
            title: mdLink[1].slice(0, 200),
            url: mdLink[2],
            snippet: line.replace(mdLink[0], "").trim().slice(0, MAX_BODY_CHARS),
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
    answer: answer ? safeText(answer).slice(0, 8000) : undefined,
    sources: sources.length ? [...new Set(sources)].slice(0, 50) : undefined,
    textPreview,
  };
}

/** Bounded parameter summary shared by the search-class providers. */
export function searchProviderSummary(providerId: string, args: Record<string, unknown>, t: Translate): string {
  const parts: string[] = [];
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
