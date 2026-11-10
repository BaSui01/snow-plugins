import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import manifest from "../plugin.json";
import { registerTools } from "./tools";

const server = new McpServer({ name: manifest.id, version: manifest.version });
registerTools(server);
await server.connect(new StdioServerTransport());
