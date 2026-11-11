import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubGraphQL } from "../github/client";
import { run } from "../mcp/result";

const discussionSummary = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isAnswered: z.boolean().nullable(),
  author: z.object({ login: z.string() }).nullable(),
  category: z.object({ name: z.string(), slug: z.string() }),
  comments: z.object({ totalCount: z.number() }),
});

const discussionDetail = discussionSummary.extend({
  body: z.string(),
  bodyText: z.string(),
  upvoteCount: z.number(),
  answer: z.object({ id: z.string() }).nullable(),
});

const discussionListResponse = z.object({
  repository: z
    .object({
      discussions: z.object({
        totalCount: z.number(),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        nodes: z.array(discussionSummary),
      }),
    })
    .nullable(),
});

const discussionDetailResponse = z.object({
  repository: z.object({ discussion: discussionDetail.nullable() }).nullable(),
});

const listDiscussionsQuery = `
  query ListDiscussions($owner: String!, $name: String!, $first: Int!, $after: String, $categoryId: ID, $answered: Boolean) {
    repository(owner: $owner, name: $name) {
      discussions(
        first: $first
        after: $after
        categoryId: $categoryId
        answered: $answered
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          number
          title
          url
          createdAt
          updatedAt
          isAnswered
          author { login }
          category { name slug }
          comments { totalCount }
        }
      }
    }
  }
`;

const getDiscussionQuery = `
  query GetDiscussion($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      discussion(number: $number) {
        number
        title
        url
        body
        bodyText
        createdAt
        updatedAt
        isAnswered
        upvoteCount
        author { login }
        category { name slug }
        comments { totalCount }
        answer { id }
      }
    }
  }
`;

export function registerDiscussions(server: McpServer): void {
  server.registerTool(
    "github_list_discussions",
    {
      title: "List GitHub discussions",
      description:
        "List repository discussions ordered by last update, with answered state, author, category and comment counts. Supports category and answered filters with cursor pagination.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        first: z.number().int().min(1).max(100).default(20).describe("Number of discussions to return (1-100)"),
        after: z.string().min(1).optional().describe("Cursor from a previous page's endCursor"),
        categoryId: z.string().min(1).optional().describe("Only discussions in this discussion category ID"),
        answered: z.boolean().optional().describe("Only answered or only unanswered discussions"),
      },
    },
    ({ owner, repo, first, after, categoryId, answered }) =>
      run(async () => {
        const payload = await githubGraphQL(
          listDiscussionsQuery,
          {
            owner,
            name: repo,
            first,
            ...(after !== undefined ? { after } : {}),
            ...(categoryId !== undefined ? { categoryId } : {}),
            ...(answered !== undefined ? { answered } : {}),
          },
          discussionListResponse,
        );
        if (!payload.repository) {
          throw new Error(`GitHub repository ${owner}/${repo} was not found or is not accessible.`);
        }
        const { discussions } = payload.repository;
        return {
          totalCount: discussions.totalCount,
          items: discussions.nodes,
          pagination: discussions.pageInfo,
        };
      }),
  );

  server.registerTool(
    "github_get_discussion",
    {
      title: "Get a GitHub discussion",
      description:
        "Read one discussion with its full body, body text, category, author, upvotes, answered state and comment count.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        number: z.number().int().positive().describe("Discussion number"),
      },
    },
    ({ owner, repo, number }) =>
      run(async () => {
        const payload = await githubGraphQL(
          getDiscussionQuery,
          { owner, name: repo, number },
          discussionDetailResponse,
        );
        if (!payload.repository) {
          throw new Error(`GitHub repository ${owner}/${repo} was not found or is not accessible.`);
        }
        const { discussion } = payload.repository;
        if (!discussion) {
          throw new Error(`GitHub discussion #${number} was not found in ${owner}/${repo}.`);
        }
        return discussion;
      }),
  );
}
