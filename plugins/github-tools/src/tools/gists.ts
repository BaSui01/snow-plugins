import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const gistFileResponse = z.object({
  filename: z.string(),
  type: z.string(),
  language: z.string().nullable(),
  raw_url: z.string(),
  size: z.number(),
  truncated: z.boolean().optional(),
  content: z.string().optional(),
  encoding: z.string().optional(),
});

const gistResponse = z.object({
  id: z.string(),
  description: z.string().nullable(),
  public: z.boolean(),
  owner: z.object({ login: z.string() }).nullable(),
  comments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  git_pull_url: z.string(),
  comments_url: z.string(),
  comments_enabled: z.boolean(),
  files: z.record(gistFileResponse),
});

type Gist = z.infer<typeof gistResponse>;

function projectGist(gist: Gist, includeContent: boolean): {
  id: string;
  description: string | null;
  public: boolean;
  owner: { login: string } | null;
  comments: number;
  created_at: string;
  updated_at: string;
  html_url: string;
  git_pull_url: string;
  comments_url: string;
  comments_enabled: boolean;
  files: Record<string, Record<string, unknown>>;
} {
  return {
    id: gist.id,
    description: gist.description,
    public: gist.public,
    owner: gist.owner,
    comments: gist.comments,
    created_at: gist.created_at,
    updated_at: gist.updated_at,
    html_url: gist.html_url,
    git_pull_url: gist.git_pull_url,
    comments_url: gist.comments_url,
    comments_enabled: gist.comments_enabled,
    files: Object.fromEntries(
      Object.entries(gist.files).map(([name, file]) => [
        name,
        {
          filename: file.filename,
          type: file.type,
          language: file.language,
          raw_url: file.raw_url,
          size: file.size,
          ...(file.truncated !== undefined ? { truncated: file.truncated } : {}),
          ...(includeContent ? { content: file.content, encoding: file.encoding } : {}),
        },
      ]),
    ),
  };
}

export function registerGists(server: McpServer): void {
  server.registerTool(
    "github_list_gists",
    {
      title: "List gists of a GitHub user",
      description:
        "List a user's gists with description, visibility, comment count, file metadata and timestamps. Returns Link-based pagination and never includes file content.",
      inputSchema: {
        username: z.string().min(1).describe("GitHub login whose gists to list"),
        since: z.string().min(1).optional().describe("ISO 8601 timestamp; only gists updated after this time"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of gists per page (1-100)"),
      },
    },
    ({ username, since, page, perPage }) =>
      run(async () => {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
        });
        if (since !== undefined) query.set("since", since);
        const { data, response } = await githubRequestWithResponse(
          `/users/${segment(username)}/gists?${query}`,
          z.array(gistResponse),
        );
        return {
          items: data.map((gist) => projectGist(gist, false)),
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_gist",
    {
      title: "Get a GitHub gist",
      description:
        "Read one gist with its description, owner, comment settings and file metadata. File content and encoding are included only when includeContent=true; leave it false to stay under the 20k character result limit.",
      inputSchema: {
        gistId: z.string().min(1).describe("Gist ID"),
        includeContent: z
          .boolean()
          .default(false)
          .describe("Include each file's content and encoding; off by default to avoid exceeding the 20k character limit"),
      },
    },
    ({ gistId, includeContent }) =>
      run(async () => {
        const gist = await githubRequest(`/gists/${segment(gistId)}`, gistResponse);
        return projectGist(gist, includeContent);
      }),
  );
}
