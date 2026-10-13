import type { ToolCallNodeProps } from "./types";

export type Provider = {
  id: string;
  name: string;
  services: readonly string[];
  category?: ToolCallNodeProps["category"];
  kind: "search" | "browser" | "generic";
};

// Only six requested MCP services; Anysearch and DBX retain separate renderers.
// Service prefixes also cover new operations (e.g. Playwright browser_network_request,
// browser_run_code_unsafe, browser_find, browser_drop and browser_emulate_media).
// Unknown operation names remain readable through the generic content renderer.
export const providers: readonly Provider[] = [
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
  { id: "notion", name: "Notion", services: ["notion", "notion-mcp", "notion_mcp"], kind: "generic" },
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
