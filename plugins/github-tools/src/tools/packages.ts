import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const packageResponse = z.object({
  id: z.number(),
  name: z.string(),
  package_type: z.string(),
  owner: z.object({ login: z.string() }).nullable(),
  version_count: z.number(),
  visibility: z.string(),
  url: z.string(),
  html_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ownerTypeInput = z
  .enum(["authenticated", "user", "org"])
  .describe("Package owner scope: the authenticated user, a specific user or an organization");

const ownerInput = z
  .string()
  .min(1)
  .optional()
  .describe("User or organization login; required when ownerType is user or org");

const packageTypeInput = z
  .enum(["npm", "maven", "rubygems", "docker", "nuget", "container"])
  .describe("Package type");

function packageOwnerBase(
  ownerType: "authenticated" | "user" | "org",
  owner: string | undefined,
): string {
  if (ownerType === "authenticated") return "/user";
  if (owner === undefined) {
    throw new Error("owner is required when ownerType is user or org.");
  }
  return ownerType === "user" ? `/users/${segment(owner)}` : `/orgs/${segment(owner)}`;
}

export function registerPackages(server: McpServer): void {
  server.registerTool(
    "github_list_packages",
    {
      title: "List GitHub packages",
      description:
        "List packages for the authenticated user, a user or an organization, filtered by package type and optional visibility. Requires authentication.",
      inputSchema: {
        ownerType: ownerTypeInput,
        owner: ownerInput,
        packageType: packageTypeInput,
        visibility: z.enum(["public", "private", "internal"]).optional().describe("Only packages with this visibility"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of packages per page (1-100)"),
      },
    },
    ({ ownerType, owner, packageType, visibility, page, perPage }) =>
      run(async () => {
        const query = new URLSearchParams({
          package_type: packageType,
          page: String(page),
          per_page: String(perPage),
        });
        if (visibility !== undefined) query.set("visibility", visibility);
        const { data, response } = await githubRequestWithResponse(
          `${packageOwnerBase(ownerType, owner)}/packages?${query}`,
          z.array(packageResponse),
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
    "github_get_package",
    {
      title: "Get a GitHub package",
      description:
        "Read one package of the authenticated user, a user or an organization with its type, owner, version count and visibility. Requires authentication.",
      inputSchema: {
        ownerType: ownerTypeInput,
        owner: ownerInput,
        packageType: packageTypeInput,
        packageName: z.string().min(1).describe("Package name, e.g. @scope/name for npm"),
      },
    },
    ({ ownerType, owner, packageType, packageName }) =>
      run(() =>
        githubRequest(
          `${packageOwnerBase(ownerType, owner)}/packages/${packageType}/${segment(packageName)}`,
          packageResponse,
          {},
          { requireToken: true },
        ),
      ),
  );
}
