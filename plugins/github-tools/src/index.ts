import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../plugin.json";
import { registerRepositories } from "./tools/repositories";
import { registerIssues } from "./tools/issues";
import { registerPullRequests } from "./tools/pull-requests";
import { registerReleasesAndFiles } from "./tools/releases-and-files";
import { registerWorkflows } from "./tools/workflows";
import { registerGraphQL } from "./tools/graphql";

const server = new McpServer({ name: "github-tools", version });
registerRepositories(server);
registerIssues(server);
registerPullRequests(server);
registerReleasesAndFiles(server);
registerWorkflows(server);
registerGraphQL(server);

await server.connect(new StdioServerTransport());
console.error("[github-tools] MCP server ready over stdio");
