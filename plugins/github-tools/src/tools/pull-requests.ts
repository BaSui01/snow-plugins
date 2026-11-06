import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  githubGraphQL,
  githubRequest,
  githubRequestWithResponse,
  githubWrite,
  segment,
} from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const mergeResponse = z.object({
  merged: z.boolean(),
  sha: z.string().nullable(),
  message: z.string(),
});

const pullRequestReference = z.object({
  ref: z.string(),
  sha: z.string(),
});

const pullRequestRepository = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  html_url: z.string(),
}).nullable();

const pullRequestSummaryResponse = z.object({
  number: z.number(),
  node_id: z.string(),
  html_url: z.string(),
  state: z.string(),
  title: z.string(),
  draft: z.boolean(),
  user: z.object({ login: z.string() }).nullable(),
  head: pullRequestReference,
  base: pullRequestReference,
  created_at: z.string(),
  updated_at: z.string(),
});

const pullRequestDetailResponse = pullRequestSummaryResponse.extend({
  body: z.string().nullable(),
  merged: z.boolean(),
  mergeable: z.boolean().nullable(),
  mergeable_state: z.string(),
  head: pullRequestReference.extend({ repo: pullRequestRepository }),
  base: pullRequestReference.extend({ repo: pullRequestRepository }),
});

const reviewResponse = z.object({
  id: z.number(),
  state: z.string(),
  html_url: z.string(),
  submitted_at: z.string().nullable(),
});

const lineCommentResponse = z.object({
  id: z.number(),
  path: z.string(),
  line: z.number(),
  side: z.string(),
  commit_id: z.string(),
  html_url: z.string(),
  body: z.string(),
  created_at: z.string(),
});

const revertPullRequestResponse = z.object({
  revertPullRequest: z.object({
    id: z.string(),
    number: z.number(),
    url: z.string(),
    title: z.string(),
    isDraft: z.boolean(),
    state: z.string(),
    headRefName: z.string(),
    baseRefName: z.string(),
  }),
});

const revertPullRequestMutation = `
  mutation RevertPullRequest($input: RevertPullRequestInput!) {
    revertPullRequest(input: $input) {
      revertPullRequest {
        id
        number
        url
        title
        isDraft
        state
        headRefName
        baseRefName
      }
    }
  }
`;

export function registerPullRequests(server: McpServer): void {
  server.registerTool(
    "github_list_pull_requests",
    {
      title: "List GitHub pull requests",
      description:
        "List projected pull requests with state, draft, head/base refs and SHAs, GraphQL node IDs and Link-based pagination.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        state: z.enum(["open", "closed", "all"]).default("open").describe("Pull request state filter"),
        page: pageInput,
        perPage: z.number().int().min(1).max(50).default(20).describe("Number of results per page (1-50)"),
      },
    },
    ({ owner, repo, state, page, perPage }) =>
      run(async () => {
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/pulls?${new URLSearchParams({
            state,
            page: String(page),
            per_page: String(perPage),
          })}`,
          z.array(pullRequestSummaryResponse),
        );
        return {
          items: data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_pull_request",
    {
      title: "Get a GitHub pull request",
      description:
        "Read one pull request including body, merge state, GraphQL node ID, head/base refs and SHAs, repository metadata and links.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        pullNumber: z.number().int().positive().describe("Pull request number"),
      },
    },
    ({ owner, repo, pullNumber }) =>
      run(() =>
        githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/pulls/${pullNumber}`,
          pullRequestDetailResponse,
        ),
      ),
  );

  server.registerTool(
    "github_merge_pull_request",
    {
      title: "Merge a GitHub pull request",
      description:
        "Merge one pull request with merge, squash or rebase. Requires an authenticated token with repository write access. This does not retry the write.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        pullNumber: z.number().int().positive().describe("Pull request number"),
        mergeMethod: z.enum(["merge", "squash", "rebase"]).default("merge").describe("Merge strategy"),
        commitTitle: z.string().optional().describe("Title for the merge commit"),
        commitMessage: z.string().optional().describe("Extra detail for the merge commit message"),
        sha: z.string().optional().describe("Head SHA that must still match before merging"),
      },
    },
    ({ owner, repo, pullNumber, mergeMethod, commitTitle, commitMessage, sha }) =>
      run(async () => {
        const payload = await githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/pulls/${pullNumber}/merge`,
          "PUT",
          {
            merge_method: mergeMethod,
            ...(commitTitle !== undefined ? { commit_title: commitTitle } : {}),
            ...(commitMessage !== undefined ? { commit_message: commitMessage } : {}),
            ...(sha !== undefined ? { sha } : {}),
          },
          mergeResponse,
        );
        return {
          ...payload,
          html_url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull/${pullNumber}`,
        };
      }),
  );

  server.registerTool(
    "github_create_pull_request",
    {
      title: "Create a GitHub pull request",
      description:
        "Open a pull request from head into base. The head branch must already exist on GitHub. Requires an authenticated token with repository write access.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        title: z.string().min(1).describe("Pull request title"),
        head: z.string().min(1).describe("Branch containing the changes, e.g. owner:feature"),
        base: z.string().min(1).describe("Branch to merge into, e.g. main"),
        body: z.string().optional().describe("Markdown pull request body"),
        draft: z.boolean().optional().describe("Open as a draft"),
        maintainerCanModify: z.boolean().optional().describe("Allow maintainers to push to the head branch"),
      },
    },
    ({ owner, repo, title, head, base, body, draft, maintainerCanModify }) =>
      run(async () => {
        const payload = await githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/pulls`,
          "POST",
          {
            title,
            head,
            base,
            ...(body !== undefined ? { body } : {}),
            ...(draft !== undefined ? { draft } : {}),
            ...(maintainerCanModify !== undefined
              ? { maintainer_can_modify: maintainerCanModify }
              : {}),
          },
          pullRequestSummaryResponse,
        );
        return { ...payload, head: payload.head.ref, base: payload.base.ref };
      }),
  );

  server.registerTool(
    "github_review_pull_request",
    {
      title: "Review a GitHub pull request",
      description:
        "Submit a pull request review: APPROVE, REQUEST_CHANGES or COMMENT. The latter two require a body and an authenticated token with repository write access.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        pullNumber: z.number().int().positive().describe("Pull request number"),
        event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).describe("Review verdict"),
        body: z.string().optional().describe("Review comment body"),
      },
    },
    ({ owner, repo, pullNumber, event, body }) =>
      run(async () => {
        if (event !== "APPROVE" && !body?.trim()) {
          throw new Error(`${event} requires a non-empty body.`);
        }
        return githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/pulls/${pullNumber}/reviews`,
          "POST",
          { event, ...(body !== undefined ? { body } : {}) },
          reviewResponse,
        );
      }),
  );

  server.registerTool(
    "github_comment_pull_request_line",
    {
      title: "Comment on a pull request line",
      description:
        "Create a submitted line-level review comment on a pull request diff using the modern line and side fields. Requires an authenticated token with repository write access.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        pullNumber: z.number().int().positive().describe("Pull request number"),
        commitId: z.string().min(1).describe("HEAD commit SHA containing the diff line"),
        body: z.string().min(1).describe("Markdown review comment body"),
        path: z.string().min(1).describe("Repository-relative file path in the diff"),
        line: z.number().int().positive().describe("Line number on the selected side of the diff"),
        side: z.enum(["LEFT", "RIGHT"]).describe("LEFT for a removed line or RIGHT for an added/context line"),
      },
    },
    ({ owner, repo, pullNumber, commitId, body, path, line, side }) =>
      run(() =>
        githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/pulls/${pullNumber}/comments`,
          "POST",
          { commit_id: commitId, body, path, line, side },
          lineCommentResponse,
        ),
      ),
  );

  server.registerTool(
    "github_revert_pull_request",
    {
      title: "Create a revert pull request",
      description:
        "Use GitHub's revertPullRequest GraphQL mutation on an already merged pull request. Creates a new revert pull request; it neither undoes the merge nor automatically merges the revert. Authentication is required.",
      inputSchema: {
        pullRequestId: z.string().min(1).describe("GraphQL node ID (ID/IPR) of the merged pull request"),
        title: z.string().min(1).optional().describe("Title for the new revert pull request"),
        body: z.string().optional().describe("Body for the new revert pull request"),
        draft: z.boolean().optional().describe("Create the revert pull request as a draft"),
      },
    },
    ({ pullRequestId, title, body, draft }) =>
      run(async () => {
        const payload = await githubGraphQL(
          revertPullRequestMutation,
          {
            input: {
              pullRequestId,
              ...(title !== undefined ? { title } : {}),
              ...(body !== undefined ? { body } : {}),
              ...(draft !== undefined ? { draft } : {}),
            },
          },
          revertPullRequestResponse,
        );
        return payload.revertPullRequest;
      }),
  );
}
