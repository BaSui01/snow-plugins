import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubGraphQL } from "../github/client";
import { run } from "../mcp/result";

export function registerGraphQL(server: McpServer): void {
  server.registerTool(
    "github_graphql",
    {
      title: "Execute a GitHub GraphQL operation",
      description:
        "POST a caller-authored GraphQL query or mutation with optional object variables. Authentication is required. Returns the real data payload or fails on GraphQL errors; mutations can perform remote writes and remain subject to host authorization.",
      inputSchema: {
        query: z.string().min(1).describe("GraphQL query or mutation document"),
        variables: z.record(z.unknown()).optional().describe("GraphQL variables as a JSON object"),
      },
    },
    ({ query, variables }) => run(() => githubGraphQL(query, variables, z.unknown())),
  );
}
