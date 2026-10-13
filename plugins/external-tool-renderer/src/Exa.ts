import type { Translate } from "./types";
import { HIDDEN, isRecord, preview, safeUrl, searchGroups } from "./mcp";
import type { ContentBlock, SearchGroup } from "./mcp";

const MAX_TEXT_CHARS = 200000;
const MAX_ITEMS = 200;
const MAX_BODY_CHARS = 4000;
const MAX_BLOCKS = 20;

export type ExaView = { groups: SearchGroup[]; textPreview: boolean; partialError: boolean };

// Official src/tools/webSearch.ts: Title / URL / Published / Author, then
// Highlights or Text; records are separated by a Markdown horizontal rule.
function searchText(text: string): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const section of text.split(/\r?\n[ \t]*---[ \t]*\r?\n/).slice(0, MAX_ITEMS)) {
    const match = section.trim().match(/^Title: ([^\r\n]*)\r?\nURL: ([^\r\n]+)\r?\nPublished: ([^\r\n]*)\r?\nAuthor: ([^\r\n]*)(?:\r?\n([\s\S]*))?$/);
    if (!match || !safeUrl(match[2].trim())) continue;
    const body = (match[5] ?? "").replace(/^(?:Highlights:[ \t]*\r?\n|Text: )/, "");
    items.push({ title: match[1].slice(0, 500), url: match[2].trim(), publishedDate: match[3], author: match[4], text: body.slice(0, MAX_BODY_CHARS) });
  }
  return items;
}

// Official src/tools/webFetch.ts: # title / URL / optional Published / Author,
// blank line, then page text. Recognize only this header, not arbitrary Markdown.
function fetchText(text: string): Record<string, unknown>[] {
  const header = /^# ([^\r\n]+)\r?\nURL: ([^\r\n]+)\r?\n(?:Published: ([^\r\n]+)\r?\n)?(?:Author: ([^\r\n]+)\r?\n)?\r?\n/gm;
  const matches: { start: number; end: number; title: string; url: string; publishedDate?: string; author?: string }[] = [];
  let match: RegExpExecArray | null;
  while (matches.length < MAX_ITEMS + 1 && (match = header.exec(text)) !== null) {
    matches.push({ start: match.index, end: header.lastIndex, title: match[1].slice(0, 500), url: match[2].trim(), publishedDate: match[3], author: match[4] });
  }
  return matches.slice(0, MAX_ITEMS).filter((item) => safeUrl(item.url)).map((item) => {
    const next = matches.find((candidate) => candidate.start > item.start);
    const body = text.slice(item.end, next?.start ?? text.length).replace(/\r?\nError fetching [^\r\n]+:[^\r\n]*/g, "").trim();
    return { title: item.title, url: item.url, ...(item.publishedDate ? { publishedDate: item.publishedDate } : {}), ...(item.author ? { author: item.author } : {}), text: body.slice(0, MAX_BODY_CHARS) };
  });
}

function textOf(block: ContentBlock): string | undefined {
  if (block.kind !== "value") return undefined;
  if (typeof block.value === "string") return block.value;
  // MCP text annotations are preserved by parseMcp as {text, ...annotations}.
  if (isRecord(block.value) && typeof block.value.text === "string") return block.value.text;
  return undefined;
}

export function exaView(blocks: readonly ContentBlock[], records: readonly Record<string, unknown>[], operation: string): ExaView {
  if (!["web-search-exa", "web-fetch-exa", "web-search-advanced-exa"].includes(operation)) {
    return { groups: [], textPreview: false, partialError: false };
  }
  const groups = searchGroups(records);
  const hasStructuredResults = groups.length > 0;
  let partialError = false;
  let textPreview = false;
  let remaining = MAX_ITEMS;
  // JSON results arrays use the shared card; bounded text previews are only for
  // the two source-verified default formats. Advanced/agent protocols stay generic.
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

export function exaSummary(args: Record<string, unknown>, t: Translate): string {
  const parts: string[] = [];
  if (typeof args.query === "string") parts.push(`${t("toolCall.exa.query")}: ${preview(args.query, "query", true)}`);
  if (typeof args.numResults === "number" && Number.isFinite(args.numResults)) parts.push(`${t("toolCall.exa.numResults")}: ${args.numResults}`);
  if (typeof args.objective === "string") parts.push(`${t("toolCall.exa.objectiveLength")}: ${args.objective.length}`);
  if (Array.isArray(args.urls)) parts.push(`${t("toolCall.exa.urlCount")}: ${args.urls.length}`);
  if (typeof args.maxCharacters === "number" && Number.isFinite(args.maxCharacters)) parts.push(`${t("toolCall.exa.maxCharacters")}: ${args.maxCharacters}`);
  return parts.join(" · ").slice(0, 400);
}

export function exaParameters(args: Record<string, unknown>): Record<string, unknown> {
  // Rendering-only copy: never mutate the frozen tool-call arguments or reveal
  // the research objective through the expanded parameter tree.
  return Object.hasOwn(args, "objective") ? { ...args, objective: HIDDEN } : args;
}
