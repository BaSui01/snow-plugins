import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const repositoryResponse = z.object({
  full_name: z.string(),
  name: z.string(),
  owner: z.object({ login: z.string() }),
  html_url: z.string(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  private: z.boolean(),
  archived: z.boolean(),
  default_branch: z.string(),
  license: z.object({ spdx_id: z.string(), name: z.string() }).nullable(),
  homepage: z.string().nullable(),
  topics: z.array(z.string()),
  stargazers_count: z.number(),
  forks_count: z.number(),
  open_issues_count: z.number(),
  updated_at: z.string(),
});

const repositorySearchResponse = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(repositoryResponse),
});

const commitAuthor = z.object({
  name: z.string().nullable(),
  date: z.string(),
}).nullable();

const commitListEntry = z.object({
  sha: z.string(),
  html_url: z.string(),
  commit: z.object({ message: z.string(), author: commitAuthor }),
  author: z.object({ login: z.string() }).nullable(),
});

const commitResponse = commitListEntry.extend({
  parents: z.array(z.object({ sha: z.string(), html_url: z.string() })),
  files: z.array(z.object({
    filename: z.string(),
    status: z.string(),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
    patch: z.string().optional(),
  })),
});

const codeSearchResponse = z.object({
  total_count: z.number(),
  incomplete_results: z.boolean(),
  items: z.array(z.object({
    name: z.string(),
    path: z.string(),
    html_url: z.string(),
    repository: z.object({ full_name: z.string() }),
  })),
});

function projectCommitListEntry(entry: z.infer<typeof commitListEntry>): {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  html_url: string;
} {
  return {
    sha: entry.sha,
    message: entry.commit.message,
    author: entry.author?.login ?? entry.commit.author?.name ?? null,
    date: entry.commit.author?.date ?? null,
    html_url: entry.html_url,
  };
}

export function registerRepositories(server: McpServer): void {
  server.registerTool(
    "github_search_repositories",
    {
      title: "Search GitHub repositories",
      description:
        "Search repositories with GitHub's search syntax. Returns projected repository cards and Link-based pagination.",
      inputSchema: {
        query: z.string().min(1).describe("Search keywords, e.g. language:typescript mcp"),
        page: pageInput,
        perPage: z.number().int().min(1).max(30).default(10).describe("Number of results per page (1-30)"),
      },
    },
    ({ query, page, perPage }) =>
      run(async () => {
        const { data, response } = await githubRequestWithResponse(
          `/search/repositories?${new URLSearchParams({
            q: query,
            page: String(page),
            per_page: String(perPage),
          })}`,
          repositorySearchResponse,
        );
        return {
          ...data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_repository",
    {
      title: "Get a GitHub repository",
      description:
        "Read projected repository metadata: description, stars, default branch, license, topics and URLs.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
      },
    },
    ({ owner, repo }) =>
      run(() =>
        githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}`,
          repositoryResponse,
        ),
      ),
  );

  server.registerTool(
    "github_list_commits",
    {
      title: "List GitHub commits",
      description:
        "List commits on a branch, tag or commit SHA. Optionally filter by file path, author or a date range. Returns projected commits and Link-based pagination.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        ref: z.string().optional().describe("Branch, tag or commit SHA; defaults to the default branch"),
        path: z.string().optional().describe("Only commits touching this file path"),
        author: z.string().optional().describe("GitHub username or email"),
        since: z.string().optional().describe("ISO 8601 timestamp; only commits after this date"),
        until: z.string().optional().describe("ISO 8601 timestamp; only commits before this date"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of results per page (1-100)"),
      },
    },
    ({ owner, repo, ref, path, author, since, until, page, perPage }) =>
      run(async () => {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
        });
        if (ref) query.set("sha", ref);
        if (path) query.set("path", path);
        if (author) query.set("author", author);
        if (since) query.set("since", since);
        if (until) query.set("until", until);
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/commits?${query}`,
          z.array(commitListEntry),
        );
        return {
          items: data.map(projectCommitListEntry),
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_commit",
    {
      title: "Get a GitHub commit",
      description:
        "Read one commit with its message, author, date, parents and changed files. A file patch is returned only when GitHub provides it.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        ref: z.string().min(1).describe("Commit SHA, branch or tag"),
      },
    },
    ({ owner, repo, ref }) =>
      run(async () => {
        const payload = await githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/commits/${segment(ref)}`,
          commitResponse,
        );
        return { ...projectCommitListEntry(payload), parents: payload.parents, files: payload.files };
      }),
  );

  server.registerTool(
    "github_search_code",
    {
      title: "Search GitHub code",
      description:
        "Search code across GitHub (default branch only). Requires authentication and returns projected code matches with Link-based pagination.",
      inputSchema: {
        query: z.string().min(1).describe("Code search query, e.g. repo:owner/name useState"),
        page: pageInput,
        perPage: z.number().int().min(1).max(30).default(10).describe("Number of results per page (1-30)"),
      },
    },
    ({ query, page, perPage }) =>
      run(async () => {
        const { data, response } = await githubRequestWithResponse(
          `/search/code?${new URLSearchParams({
            q: query,
            page: String(page),
            per_page: String(perPage),
          })}`,
          codeSearchResponse,
          {},
          { requireToken: true },
        );
        return {
          ...data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );
}
