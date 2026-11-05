import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://api.github.com";
const USER_AGENT = "snow-app-github-tools/0.1.0";
const MAX_TEXT_CHARS = 20_000;
const MAX_FILE_BYTES = 1_000_000;

const execFileAsync = promisify(execFile);

let tokenPromise: Promise<string | undefined> | null = null;

/// 令牌优先级：GITHUB_TOKEN / GH_TOKEN → 本机 gh CLI。两者都没有时按匿名请求，
/// 由 GitHub 的限流规则决定是否可用（匿名 60 次/小时）。
async function resolveToken(): Promise<string | undefined> {
  const fromEnv =
    process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (!tokenPromise) {
    tokenPromise = execFileAsync("gh", ["auth", "token"], {
      encoding: "utf8",
      timeout: 5_000,
    })
      .then(({ stdout }) => stdout.trim() || undefined)
      .catch((error: unknown) => {
        console.error(
          `[github-tools] GITHUB_TOKEN/GH_TOKEN is not set and "gh auth token" failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return undefined;
      });
  }
  return tokenPromise;
}

async function githubRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = await resolveToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", USER_AGENT);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status} ${response.statusText}: ${
        body.slice(0, 800) || "(empty body)"
      }`,
    );
  }
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new Error(
      `GitHub API returned non-JSON content: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/// 写操作必须持有令牌：匿名调用只会得到 401/403，提前给出可操作的错误。
async function githubWrite(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  payload: unknown,
): Promise<unknown> {
  const token = await resolveToken();
  if (!token) {
    throw new Error(
      "Write access requires a GitHub token: set GITHUB_TOKEN/GH_TOKEN or sign in with `gh auth login`.",
    );
  }
  return githubRequest(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function render(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= MAX_TEXT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_TEXT_CHARS)}\n…[truncated ${
    text.length - MAX_TEXT_CHARS
  } characters]`;
}

async function run(operation: () => Promise<unknown>) {
  try {
    return {
      content: [{ type: "text" as const, text: render(await operation()) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

const server = new McpServer({ name: "github-tools", version: "0.1.0" });

server.registerTool(
  "github_search_repositories",
  {
    title: "Search GitHub repositories",
    description:
      "Search repositories with GitHub's search syntax. Returns full name, description, stars, language and URL for each match.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Search keywords, e.g. language:typescript mcp"),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe("Number of results (1-30)"),
    },
  },
  ({ query, perPage }) =>
    run(() =>
      githubRequest(
        `/search/repositories?${new URLSearchParams({
          q: query,
          per_page: String(perPage),
        })}`,
      ),
    ),
);

server.registerTool(
  "github_get_repository",
  {
    title: "Get a GitHub repository",
    description:
      "Read metadata for one repository: description, stars, default branch, license, topics and URLs.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
    },
  },
  ({ owner, repo }) =>
    run(() => githubRequest(`/repos/${segment(owner)}/${segment(repo)}`)),
);

server.registerTool(
  "github_list_issues",
  {
    title: "List GitHub issues",
    description:
      "List issues for a repository. GitHub returns pull requests in this endpoint too; filter them by the pull_request field.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      state: z
        .enum(["open", "closed", "all"])
        .default("open")
        .describe("Issue state filter"),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Number of results (1-50)"),
    },
  },
  ({ owner, repo, state, perPage }) =>
    run(() =>
      githubRequest(
        `/repos/${segment(owner)}/${segment(repo)}/issues?${new URLSearchParams(
          { state, per_page: String(perPage) },
        )}`,
      ),
    ),
);

server.registerTool(
  "github_list_commits",
  {
    title: "List GitHub commits",
    description:
      "List commits on a branch, tag or commit SHA. Optionally filter by file path, author or a date range. Returns sha, message, author, date and URL for each commit.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      ref: z
        .string()
        .optional()
        .describe("Branch, tag or commit SHA; defaults to the default branch"),
      path: z
        .string()
        .optional()
        .describe("Only commits touching this file path"),
      author: z.string().optional().describe("GitHub username or email"),
      since: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp; only commits after this date"),
      until: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp; only commits before this date"),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of results (1-100)"),
    },
  },
  ({ owner, repo, ref, path, author, since, until, perPage }) =>
    run(async () => {
      const query = new URLSearchParams({ per_page: String(perPage) });
      if (ref) query.set("sha", ref);
      if (path) query.set("path", path);
      if (author) query.set("author", author);
      if (since) query.set("since", since);
      if (until) query.set("until", until);
      const payload = await githubRequest(
        `/repos/${segment(owner)}/${segment(repo)}/commits?${query}`,
      );
      if (!Array.isArray(payload)) {
        throw new Error("GitHub commits endpoint returned an unexpected payload.");
      }
      return payload.map((item) => {
        const entry = item as {
          sha?: string;
          html_url?: string;
          commit?: {
            message?: string;
            author?: { name?: string; date?: string } | null;
          };
          author?: { login?: string } | null;
        };
        return {
          sha: entry.sha ?? null,
          message: entry.commit?.message ?? null,
          author: entry.author?.login ?? entry.commit?.author?.name ?? null,
          date: entry.commit?.author?.date ?? null,
          html_url: entry.html_url ?? null,
        };
      });
    }),
);

server.registerTool(
  "github_get_file",
  {
    title: "Read a GitHub file",
    description:
      "Read one file from a repository (default branch unless ref is given) and return its UTF-8 text. Directory paths return a listing instead.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      path: z.string().min(1).describe("File path inside the repository"),
      ref: z
        .string()
        .optional()
        .describe("Branch, tag or commit SHA; defaults to the default branch"),
    },
  },
  ({ owner, repo, path, ref }) =>
    run(async () => {
      const query = ref ? `?${new URLSearchParams({ ref })}` : "";
      const encodedPath = path
        .split("/")
        .filter(Boolean)
        .map(segment)
        .join("/");
      const payload = await githubRequest(
        `/repos/${segment(owner)}/${segment(repo)}/contents/${encodedPath}${query}`,
      );
      if (Array.isArray(payload)) {
        return payload.map((item) => {
          const entry = item as {
            name?: string;
            type?: string;
            path?: string;
          };
          return { name: entry.name, type: entry.type, path: entry.path };
        });
      }
      const file = payload as {
        type?: string;
        encoding?: string;
        content?: string;
        size?: number;
        html_url?: string;
        path?: string;
      };
      if (file.type !== "file") {
        throw new Error(
          `GitHub path is not a file (type: ${file.type ?? "unknown"})`,
        );
      }
      if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
        throw new Error(
          `File is ${file.size} bytes; the limit is ${MAX_FILE_BYTES}. Fetch the blob directly instead.`,
        );
      }
      if (file.encoding !== "base64" || typeof file.content !== "string") {
        throw new Error("GitHub did not return base64 content for this file.");
      }
      const text = Buffer.from(
        file.content.replace(/\s+/g, ""),
        "base64",
      ).toString("utf8");
      return {
        path: file.path,
        html_url: file.html_url,
        size: file.size,
        text,
      };
    }),
);

server.registerTool(
  "github_search_code",
  {
    title: "Search GitHub code",
    description:
      "Search code across GitHub (default branch only). Requires authentication: GITHUB_TOKEN/GH_TOKEN or `gh auth login`.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("Code search query, e.g. repo:owner/name useState"),
      perPage: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe("Number of results (1-30)"),
    },
  },
  ({ query, perPage }) =>
    run(async () => {
      const token = await resolveToken();
      if (!token) {
        throw new Error(
          "GitHub code search requires authentication: set GITHUB_TOKEN/GH_TOKEN or sign in with `gh auth login`.",
        );
      }
      return githubRequest(
        `/search/code?${new URLSearchParams({
          q: query,
          per_page: String(perPage),
        })}`,
      );
    }),
);

server.registerTool(
  "github_merge_pull_request",
  {
    title: "Merge a GitHub pull request",
    description:
      "Merge one pull request with merge, squash or rebase. Requires a token with write access. Returns whether the merge happened, the merge SHA and GitHub's message.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      pullNumber: z.number().int().min(1).describe("Pull request number"),
      mergeMethod: z
        .enum(["merge", "squash", "rebase"])
        .default("merge")
        .describe("Merge strategy"),
      commitTitle: z
        .string()
        .optional()
        .describe("Title for the merge commit"),
      commitMessage: z
        .string()
        .optional()
        .describe("Extra detail for the merge commit message"),
      sha: z
        .string()
        .optional()
        .describe("Head SHA that must still match before merging"),
    },
  },
  ({ owner, repo, pullNumber, mergeMethod, commitTitle, commitMessage, sha }) =>
    run(async () => {
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/pulls/${pullNumber}/merge`,
        "PUT",
        {
          merge_method: mergeMethod,
          ...(commitTitle ? { commit_title: commitTitle } : {}),
          ...(commitMessage ? { commit_message: commitMessage } : {}),
          ...(sha ? { sha } : {}),
        },
      )) as { merged?: boolean; sha?: string; message?: string } | null;
      return {
        merged: payload?.merged === true,
        sha: payload?.sha ?? null,
        message: payload?.message ?? "",
        html_url: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
      };
    }),
);

server.registerTool(
  "github_comment",
  {
    title: "Comment on a GitHub issue or pull request",
    description:
      "Create a comment on an issue or pull request. GitHub uses the issues comments endpoint for both. Requires a token with write access.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      issueNumber: z
        .number()
        .int()
        .min(1)
        .describe("Issue or pull request number"),
      body: z.string().min(1).describe("Markdown comment body"),
    },
  },
  ({ owner, repo, issueNumber, body }) =>
    run(async () => {
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/issues/${issueNumber}/comments`,
        "POST",
        { body },
      )) as {
        id?: number;
        html_url?: string;
        body?: string;
        created_at?: string;
      } | null;
      return {
        id: payload?.id ?? null,
        html_url: payload?.html_url ?? null,
        body: payload?.body ?? body,
        created_at: payload?.created_at ?? null,
      };
    }),
);

server.registerTool(
  "github_create_issue",
  {
    title: "Create a GitHub issue",
    description:
      "Open a new issue. Requires a token with write access. Returns number, state, title and URL.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      title: z.string().min(1).describe("Issue title"),
      body: z.string().optional().describe("Markdown issue body"),
      labels: z
        .array(z.string().min(1))
        .max(20)
        .optional()
        .describe("Label names to attach"),
      assignees: z
        .array(z.string().min(1))
        .max(10)
        .optional()
        .describe("GitHub logins to assign"),
    },
  },
  ({ owner, repo, title, body, labels, assignees }) =>
    run(async () => {
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/issues`,
        "POST",
        {
          title,
          ...(body ? { body } : {}),
          ...(labels?.length ? { labels } : {}),
          ...(assignees?.length ? { assignees } : {}),
        },
      )) as {
        number?: number;
        html_url?: string;
        state?: string;
        title?: string;
      } | null;
      return {
        number: payload?.number ?? null,
        html_url: payload?.html_url ?? null,
        state: payload?.state ?? null,
        title: payload?.title ?? title,
      };
    }),
);

server.registerTool(
  "github_update_issue",
  {
    title: "Update or close a GitHub issue",
    description:
      "Change an issue or pull request: state (open/closed), title, body, labels or assignees. At least one field is required. Requires a token with write access.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      issueNumber: z
        .number()
        .int()
        .min(1)
        .describe("Issue or pull request number"),
      state: z
        .enum(["open", "closed"])
        .optional()
        .describe("Target state; closed closes the issue"),
      title: z.string().min(1).optional().describe("New title"),
      body: z.string().optional().describe("New markdown body"),
      labels: z
        .array(z.string().min(1))
        .max(20)
        .optional()
        .describe("Replacement label names"),
      assignees: z
        .array(z.string().min(1))
        .max(10)
        .optional()
        .describe("Replacement assignee logins"),
    },
  },
  ({ owner, repo, issueNumber, state, title, body, labels, assignees }) =>
    run(async () => {
      if (
        state === undefined &&
        title === undefined &&
        body === undefined &&
        labels === undefined &&
        assignees === undefined
      ) {
        throw new Error(
          "At least one of state, title, body, labels or assignees is required.",
        );
      }
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/issues/${issueNumber}`,
        "PATCH",
        {
          ...(state ? { state } : {}),
          ...(title !== undefined ? { title } : {}),
          ...(body !== undefined ? { body } : {}),
          ...(labels !== undefined ? { labels } : {}),
          ...(assignees !== undefined ? { assignees } : {}),
        },
      )) as {
        number?: number;
        html_url?: string;
        state?: string;
        title?: string;
      } | null;
      return {
        number: payload?.number ?? issueNumber,
        html_url: payload?.html_url ?? null,
        state: payload?.state ?? state ?? null,
        title: payload?.title ?? title ?? null,
      };
    }),
);

server.registerTool(
  "github_create_pull_request",
  {
    title: "Create a GitHub pull request",
    description:
      "Open a pull request from head into base. The head branch must already exist on GitHub. Requires a token with write access.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      title: z.string().min(1).describe("Pull request title"),
      head: z
        .string()
        .min(1)
        .describe("Branch containing the changes, e.g. owner:feature"),
      base: z.string().min(1).describe("Branch to merge into, e.g. main"),
      body: z.string().optional().describe("Markdown pull request body"),
      draft: z.boolean().optional().describe("Open as a draft"),
      maintainerCanModify: z
        .boolean()
        .optional()
        .describe("Allow maintainers to push to the head branch"),
    },
  },
  ({ owner, repo, title, head, base, body, draft, maintainerCanModify }) =>
    run(async () => {
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/pulls`,
        "POST",
        {
          title,
          head,
          base,
          ...(body ? { body } : {}),
          ...(draft !== undefined ? { draft } : {}),
          ...(maintainerCanModify !== undefined
            ? { maintainer_can_modify: maintainerCanModify }
            : {}),
        },
      )) as {
        number?: number;
        html_url?: string;
        state?: string;
        title?: string;
        draft?: boolean;
        head?: { ref?: string };
        base?: { ref?: string };
      } | null;
      return {
        number: payload?.number ?? null,
        html_url: payload?.html_url ?? null,
        state: payload?.state ?? null,
        title: payload?.title ?? title,
        draft: payload?.draft === true,
        head: payload?.head?.ref ?? head,
        base: payload?.base?.ref ?? base,
      };
    }),
);

server.registerTool(
  "github_review_pull_request",
  {
    title: "Review a GitHub pull request",
    description:
      "Submit a pull request review: APPROVE, REQUEST_CHANGES or COMMENT. REQUEST_CHANGES and COMMENT require a body. Requires a token with write access.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      pullNumber: z.number().int().min(1).describe("Pull request number"),
      event: z
        .enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
        .describe("Review verdict"),
      body: z.string().optional().describe("Review comment body"),
    },
  },
  ({ owner, repo, pullNumber, event, body }) =>
    run(async () => {
      if (event !== "APPROVE" && !body?.trim()) {
        throw new Error(`${event} requires a non-empty body.`);
      }
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/pulls/${pullNumber}/reviews`,
        "POST",
        {
          event,
          ...(body ? { body } : {}),
        },
      )) as {
        id?: number;
        state?: string;
        html_url?: string;
        submitted_at?: string;
      } | null;
      return {
        id: payload?.id ?? null,
        state: payload?.state ?? event,
        html_url:
          payload?.html_url ??
          `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
        submitted_at: payload?.submitted_at ?? null,
      };
    }),
);

server.registerTool(
  "github_create_release",
  {
    title: "Create a GitHub release",
    description:
      "Create a release for a tag. GitHub creates the tag at targetCommitish when it does not exist. Requires a token with write access.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      tagName: z.string().min(1).describe("Tag name, e.g. v1.2.0"),
      name: z.string().optional().describe("Release title"),
      body: z.string().optional().describe("Markdown release notes"),
      targetCommitish: z
        .string()
        .optional()
        .describe("Branch or commit the tag points at"),
      draft: z.boolean().optional().describe("Create as a draft"),
      prerelease: z.boolean().optional().describe("Mark as a prerelease"),
    },
  },
  ({ owner, repo, tagName, name, body, targetCommitish, draft, prerelease }) =>
    run(async () => {
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/releases`,
        "POST",
        {
          tag_name: tagName,
          ...(name ? { name } : {}),
          ...(body ? { body } : {}),
          ...(targetCommitish ? { target_commitish: targetCommitish } : {}),
          ...(draft !== undefined ? { draft } : {}),
          ...(prerelease !== undefined ? { prerelease } : {}),
        },
      )) as {
        id?: number;
        tag_name?: string;
        name?: string;
        html_url?: string;
        draft?: boolean;
        prerelease?: boolean;
      } | null;
      return {
        id: payload?.id ?? null,
        tag_name: payload?.tag_name ?? tagName,
        name: payload?.name ?? name ?? null,
        html_url: payload?.html_url ?? null,
        draft: payload?.draft === true,
        prerelease: payload?.prerelease === true,
      };
    }),
);

server.registerTool(
  "github_put_file",
  {
    title: "Create or update a GitHub file",
    description:
      "Commit one UTF-8 text file through the contents API. Provide sha to update an existing file; omit it to create a new one. Requires a token with write access. This creates one commit on branch.",
    inputSchema: {
      owner: z.string().min(1).describe("Repository owner"),
      repo: z.string().min(1).describe("Repository name"),
      path: z.string().min(1).describe("File path inside the repository"),
      message: z.string().min(1).describe("Commit message"),
      content: z.string().describe("Full UTF-8 file content"),
      branch: z
        .string()
        .optional()
        .describe("Branch to commit to; defaults to the default branch"),
      sha: z
        .string()
        .optional()
        .describe("Blob SHA of the existing file when updating"),
    },
  },
  ({ owner, repo, path, message, content, branch, sha }) =>
    run(async () => {
      const encodedPath = path
        .split("/")
        .filter(Boolean)
        .map(segment)
        .join("/");
      const payload = (await githubWrite(
        `/repos/${segment(owner)}/${segment(repo)}/contents/${encodedPath}`,
        "PUT",
        {
          message,
          content: Buffer.from(content, "utf8").toString("base64"),
          ...(branch ? { branch } : {}),
          ...(sha ? { sha } : {}),
        },
      )) as {
        content?: { path?: string; html_url?: string; sha?: string };
        commit?: { sha?: string; html_url?: string };
      } | null;
      return {
        path: payload?.content?.path ?? path,
        html_url: payload?.content?.html_url ?? null,
        sha: payload?.content?.sha ?? null,
        commit_sha: payload?.commit?.sha ?? null,
        commit_url: payload?.commit?.html_url ?? null,
      };
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[github-tools] MCP server ready over stdio");
