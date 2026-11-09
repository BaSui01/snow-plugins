import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseJsonRecords, runDocker, runDockerJson } from "../docker.js";
import { runTool } from "./result.js";

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const versionInfo = (value: unknown): Record<string, unknown> => {
  const version = record(value);
  const client = record(version.Client);
  const server = record(version.Server);
  const platform = record(server.Platform);
  return {
    Client: {
      Version: text(client.Version),
      ApiVersion: text(client.ApiVersion),
      Os: text(client.Os),
      Arch: text(client.Arch),
    },
    Server: {
      Version: text(server.Version),
      ApiVersion: text(server.ApiVersion),
      Os: text(server.Os),
      Arch: text(server.Arch),
      Platform: text(platform.Name),
    },
  };
};

export function registerSystem(server: McpServer): void {
  server.registerTool(
    "system_info",
    {
      title: "Docker system information",
      description:
        "Read Docker client/server versions, the active context and disk usage. Read-only; use it before destructive actions to confirm the target context.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    () =>
      runTool(async () => {
        const version = await runDockerJson(["version", "--format", "{{json .}}"], {
          timeoutMs: 15_000,
        });
        const context = await runDocker(["context", "show"], {
          timeoutMs: 10_000,
          maxBytes: 4 * 1024,
        });
        const disk = await runDocker(["system", "df", "--format", "{{json .}}"], {
          timeoutMs: 15_000,
        });

        const diskUsage = parseJsonRecords(disk.stdout).map((row) => ({
          type: text(row.Type),
          totalCount: text(row.TotalCount),
          active: text(row.Active),
          size: text(row.Size),
          reclaimable: text(row.Reclaimable),
        }));

        return {
          context: context.stdout.trim(),
          version: versionInfo(version),
          diskUsage,
        };
      }),
  );
}
