/**
 * Provider-specific argument summaries for the collapsed card header.
 *
 * Field names come from the verified official schemas of each service; unknown
 * or future fields are ignored here and stay fully readable in the expanded
 * parameter tree, so the summary can never hide data — only prioritise it.
 */
import type { Translate } from "./types";
import { hiddenKey, isRecord, preview } from "./mcp";

const MAX_SUMMARY = 400;

/** Arguments that are containers: show a count instead of a raw preview. */
const COUNT_KEYS = new Set([
  "urls", "queries", "search_queries", "messages", "command", "elements", "fields",
  "args", "paths", "sources", "categories", "formats", "schemas", "children",
  "properties", "sorts", "includeDomains", "excludeDomains", "select_paths",
  "select_domains", "include_domains", "exclude_domains", "search_domain_filter",
  "types", "resourceTypes", "include", "labels", "fieldsToInclude",
]);

/** Ordered, provider-specific fields surfaced first in the summary. */
const PROVIDER_FIELDS: Record<string, readonly string[]> = {
  firecrawl: ["url", "query", "formats", "limit", "sources", "categories", "onlyMainContent", "maxAge", "filePath", "prompt", "view", "id"],
  chrome: ["pageId", "uid", "url", "type", "text", "value", "reqid", "function", "format", "fullPage", "resourceTypes", "timeout"],
  playwright: ["url", "target", "action", "text", "index", "level", "static", "filename", "fullPage", "depth", "function"],
  context7: ["libraryName", "libraryId", "query", "language"],
  github: ["owner", "repo", "path", "query", "method", "resource_id", "issue_number", "pull_number", "branch", "ref", "sha", "state", "perPage", "type"],
  exa: ["query", "numResults", "objective", "urls", "maxCharacters", "category"],
  brave: ["query", "count", "country", "search_lang", "freshness", "key", "latitude", "longitude", "location"],
  tavily: ["query", "url", "urls", "search_depth", "topic", "max_results", "model", "input", "extract_depth", "format"],
  perplexity: ["query", "messages", "max_results", "search_recency_filter", "country"],
  parallel: ["objective", "search_queries", "urls", "full_content", "session_id", "model_name"],
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
  notion: ["page_id", "block_id", "data_source_id", "database_id", "query", "parent", "properties", "type", "filter", "page_size"],
};

/** Generic fallback order used when the provider has no dedicated list. */
const GENERIC_FIELDS: readonly string[] = [
  "query", "q", "search_query", "url", "urls", "objective", "libraryName", "owner",
  "repo", "project", "project_id", "id", "name", "issue", "issue_id", "pull_number",
  "branch", "method", "container", "pod", "namespace", "database", "table", "path",
  "engine", "status", "action", "limit", "count", "max_results", "numResults",
];

const fieldLabel = (t: Translate, key: string): string =>
  t(`toolCall.field.${key}`, { defaultValue: key });

function describe(t: Translate, key: string, value: unknown): string | null {
  if (value === undefined || value === null || hiddenKey(key, true)) return null;
  if (Array.isArray(value)) return `${fieldLabel(t, key)}: ${value.length}`;
  if (isRecord(value)) {
    if (COUNT_KEYS.has(key)) return `${fieldLabel(t, key)}: ${Object.keys(value).length}`;
    return `${fieldLabel(t, key)}: ${preview(value, key, true)}`;
  }
  if (COUNT_KEYS.has(key)) return `${fieldLabel(t, key)}: ${String(value).length}`;
  return `${fieldLabel(t, key)}: ${preview(value, key, true)}`;
}

/**
 * Build a bounded, provider-aware summary. `serpapi` nests its arguments under
 * `params`, so that object is unwrapped before reading fields.
 */
export function providerSummary(
  providerId: string,
  args: Record<string, unknown>,
  t: Translate,
): string {
  const source = providerId === "serpapi" && isRecord(args.params) ? args.params : args;
  const fields = PROVIDER_FIELDS[providerId] ?? GENERIC_FIELDS;
  const parts: string[] = [];
  const seen = new Set<string>();
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
