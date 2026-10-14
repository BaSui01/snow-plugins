import type { ToolCategory } from "./types";

export type Provider = {
  id: string;
  name: string;
  services: readonly string[];
  category?: ToolCategory;
  kind: "search" | "browser" | "generic";
  /** Result keys that commonly hold collections for this service (bounded preview). */
  collections: readonly string[];
};

// Tool names, argument names and result shapes below were verified against the
// official server sources / docs for each service (see README for the list of
// repositories). Unknown operation names and unknown result shapes always stay
// readable through the generic content renderer, so a future server release
// degrades gracefully instead of breaking the card.
export const providers: readonly Provider[] = [
  { id: "firecrawl", name: "Firecrawl", services: ["firecrawl"], category: "web", kind: "search", collections: ["web", "news", "images", "data"] },
  { id: "chrome", name: "Chrome DevTools", services: ["chrome-devtools", "chrome_devtools"], category: "web", kind: "browser", collections: ["pages", "messages", "requests", "entries", "insights", "metrics"] },
  { id: "playwright", name: "Playwright", services: ["playwright"], category: "web", kind: "browser", collections: ["tabs", "requests", "messages", "entries"] },
  { id: "context7", name: "Context7", services: ["context7"], category: "read", kind: "generic", collections: ["libraries"] },
  { id: "github", name: "GitHub", services: ["github"], category: "git", kind: "generic", collections: ["repositories", "issues", "pull_requests", "commits", "branches", "releases", "files", "gists", "discussions", "notifications", "users", "teams", "jobs", "workflow_runs", "items"] },
  { id: "exa", name: "Exa", services: ["exa"], category: "search", kind: "search", collections: ["results"] },
  { id: "brave", name: "Brave Search", services: ["brave-search", "brave_search", "brave"], category: "search", kind: "search", collections: ["results", "items", "grounding", "sources"] },
  { id: "tavily", name: "Tavily", services: ["tavily", "tavily-mcp", "tavily_mcp"], category: "search", kind: "search", collections: ["results", "failed_results", "images"] },
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
];

export const normalizeName = (name: string): string => name.replace(/_/g, "-");

// Pre-compiled prefix mapping for O(1) ~ O(k) prefix matching with zero memory allocation on hot path
const prefixMap: Array<{ prefix: string; provider: Provider; aliasLen: number }> = [];

for (const provider of providers) {
  const aliases = [...new Set(provider.services.map(normalizeName))];
  for (const alias of aliases) {
    prefixMap.push({ prefix: `${alias}-`, provider, aliasLen: alias.length });
  }
}
// Sort by longest prefix first to guarantee most specific match wins
prefixMap.sort((a, b) => b.prefix.length - a.prefix.length);

const cache = new Map<string, { provider: Provider; operation: string } | null>();
const MAX_CACHE_SIZE = 500;

export function identifyProvider(name: string): { provider: Provider; operation: string } | null {
  if (cache.has(name)) return cache.get(name)!;

  const normalized = normalizeName(name);
  let result: { provider: Provider; operation: string } | null = null;

  for (const entry of prefixMap) {
    if (normalized.startsWith(entry.prefix)) {
      let operation = normalized.slice(entry.aliasLen + 1);
      // Strip potential repetitive prefixes like firecrawl-firecrawl_scrape
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
