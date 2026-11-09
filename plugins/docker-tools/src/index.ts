import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { version } from "../plugin.json";
import { registerCompose } from "./tools/compose.js";
import { registerContainers } from "./tools/containers.js";
import { registerImages } from "./tools/images.js";
import { registerSystem } from "./tools/system.js";

const server = new McpServer({ name: "docker-tools", version });

registerContainers(server);
registerImages(server);
registerCompose(server);
registerSystem(server);

await server.connect(new StdioServerTransport());
console.error("[docker-tools] MCP server ready over stdio");
