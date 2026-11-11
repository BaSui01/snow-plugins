import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const organizationResponse = z.object({
  login: z.string(),
  id: z.number(),
  node_id: z.string(),
  url: z.string(),
  html_url: z.string(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  blog: z.string().nullable(),
  location: z.string().nullable(),
  email: z.string().nullable(),
  twitter_username: z.string().nullable(),
  description: z.string().nullable(),
  public_repos: z.number(),
  public_gists: z.number(),
  followers: z.number(),
  following: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  type: z.string(),
  is_verified: z.boolean(),
});

const teamResponse = z.object({
  id: z.number(),
  node_id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  privacy: z.string(),
  notification_setting: z.string(),
  permission: z.string(),
  members_count: z.number(),
  repos_count: z.number(),
  organization: z.object({ login: z.string() }),
  parent: z.object({ id: z.number(), name: z.string(), slug: z.string() }).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function registerOrganizations(server: McpServer): void {
  server.registerTool(
    "github_get_organization",
    {
      title: "Get a GitHub organization",
      description:
        "Read a public organization profile: description, contact fields, repository and follower counts, creation date and verification state.",
      inputSchema: {
        org: z.string().min(1).describe("Organization login"),
      },
    },
    ({ org }) =>
      run(() => githubRequest(`/orgs/${segment(org)}`, organizationResponse)),
  );

  server.registerTool(
    "github_list_teams",
    {
      title: "List GitHub organization teams",
      description:
        "List teams of an organization with privacy, permission, member and repository counts. Requires authentication and returns Link-based pagination.",
      inputSchema: {
        org: z.string().min(1).describe("Organization login"),
        teamType: z.enum(["all", "enterprise", "organization"]).default("all").describe("Filter teams by their type"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of teams per page (1-100)"),
      },
    },
    ({ org, teamType, page, perPage }) =>
      run(async () => {
        const { data, response } = await githubRequestWithResponse(
          `/orgs/${segment(org)}/teams?${new URLSearchParams({
            team_type: teamType,
            page: String(page),
            per_page: String(perPage),
          })}`,
          z.array(teamResponse),
          {},
          { requireToken: true },
        );
        return {
          items: data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_team",
    {
      title: "Get a GitHub team",
      description:
        "Read one team by slug with privacy, notification setting, permission, member and repository counts, parent team and organization. Requires authentication.",
      inputSchema: {
        org: z.string().min(1).describe("Organization login"),
        teamSlug: z.string().min(1).describe("Team slug"),
      },
    },
    ({ org, teamSlug }) =>
      run(() =>
        githubRequest(
          `/orgs/${segment(org)}/teams/${segment(teamSlug)}`,
          teamResponse,
          {},
          { requireToken: true },
        ),
      ),
  );
}
