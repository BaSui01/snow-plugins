import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, githubWrite, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const issueResponse = z.object({
  number: z.number(),
  html_url: z.string(),
  state: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])),
  user: z.object({ login: z.string() }).nullable(),
  comments: z.number(),
  pull_request: z.object({ html_url: z.string() }).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const commentResponse = z.object({
  id: z.number(),
  html_url: z.string(),
  body: z.string(),
  created_at: z.string(),
});

export function registerIssues(server: McpServer): void {
  server.registerTool(
    "github_list_issues",
    {
      title: "List GitHub issues",
      description:
        "List projected issues for a repository with Link-based pagination. GitHub includes pull requests in this endpoint; the pull_request marker distinguishes them.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        state: z.enum(["open", "closed", "all"]).default("open").describe("Issue state filter"),
        page: pageInput,
        perPage: z.number().int().min(1).max(50).default(20).describe("Number of results per page (1-50)"),
      },
    },
    ({ owner, repo, state, page, perPage }) =>
      run(async () => {
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/issues?${new URLSearchParams({
            state,
            page: String(page),
            per_page: String(perPage),
          })}`,
          z.array(issueResponse),
        );
        return {
          items: data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_issue",
    {
      title: "Get a GitHub issue",
      description:
        "Read one issue with its full body, labels, state, author, comment count, pull-request marker and URL.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        issueNumber: z.number().int().positive().describe("Issue number"),
      },
    },
    ({ owner, repo, issueNumber }) =>
      run(() =>
        githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/issues/${issueNumber}`,
          issueResponse,
        ),
      ),
  );

  server.registerTool(
    "github_comment",
    {
      title: "Comment on a GitHub issue or pull request",
      description:
        "Create a comment on an issue or pull request. GitHub uses the issues comments endpoint for both. Requires an authenticated token with repository write access.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        issueNumber: z.number().int().positive().describe("Issue or pull request number"),
        body: z.string().min(1).describe("Markdown comment body"),
      },
    },
    ({ owner, repo, issueNumber, body }) =>
      run(() =>
        githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/issues/${issueNumber}/comments`,
          "POST",
          { body },
          commentResponse,
        ),
      ),
  );

  server.registerTool(
    "github_create_issue",
    {
      title: "Create a GitHub issue",
      description:
        "Open a new issue. Requires an authenticated token with repository write access. Returns the projected issue details.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        title: z.string().min(1).describe("Issue title"),
        body: z.string().optional().describe("Markdown issue body"),
        labels: z.array(z.string().min(1)).max(20).optional().describe("Label names to attach"),
        assignees: z.array(z.string().min(1)).max(10).optional().describe("GitHub logins to assign"),
      },
    },
    ({ owner, repo, title, body, labels, assignees }) =>
      run(() =>
        githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/issues`,
          "POST",
          {
            title,
            ...(body !== undefined ? { body } : {}),
            ...(labels !== undefined ? { labels } : {}),
            ...(assignees !== undefined ? { assignees } : {}),
          },
          issueResponse,
        ),
      ),
  );

  server.registerTool(
    "github_update_issue",
    {
      title: "Update or close a GitHub issue",
      description:
        "Change an issue or pull request: state, title, body, labels or assignees. At least one field is required. Requires an authenticated token with repository write access.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        issueNumber: z.number().int().positive().describe("Issue or pull request number"),
        state: z.enum(["open", "closed"]).optional().describe("Target state"),
        title: z.string().min(1).optional().describe("New title"),
        body: z.string().optional().describe("New markdown body"),
        labels: z.array(z.string().min(1)).max(20).optional().describe("Replacement label names"),
        assignees: z.array(z.string().min(1)).max(10).optional().describe("Replacement assignee logins"),
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
          throw new Error("At least one of state, title, body, labels or assignees is required.");
        }
        return githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/issues/${issueNumber}`,
          "PATCH",
          {
            ...(state !== undefined ? { state } : {}),
            ...(title !== undefined ? { title } : {}),
            ...(body !== undefined ? { body } : {}),
            ...(labels !== undefined ? { labels } : {}),
            ...(assignees !== undefined ? { assignees } : {}),
          },
          issueResponse,
        );
      }),
  );
}
