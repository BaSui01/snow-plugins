import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DockerError,
  existingDirectory,
  parseJsonRecords,
  resolvePath,
  runDocker,
  serviceRef,
} from "../docker.js";
import { runTool } from "./result.js";

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const number = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const projectDirSchema = z
  .string()
  .min(1)
  .max(4096)
  .describe("Absolute path of the Compose project directory.");

const filesSchema = z
  .array(z.string().min(1).max(4096))
  .max(10)
  .optional()
  .describe("Optional Compose files relative to projectDir or absolute.");

const servicesSchema = z
  .array(z.string().min(1).max(127))
  .max(50)
  .optional()
  .describe("Optional Compose service names. Omit to target the whole project.");

function composeArgs(
  projectDir: string,
  files: string[] | undefined,
  args: string[],
): string[] {
  const result = ["compose"];
  for (const file of files ?? []) {
    result.push("-f", resolvePath(projectDir, file));
  }
  result.push(...args);
  return result;
}

function serviceArgs(services: string[] | undefined): string[] {
  return (services ?? []).map(serviceRef);
}

function publishers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .map((item) => {
      const url = text(item.URL);
      const published = number(item.PublishedPort);
      const target = number(item.TargetPort);
      const protocol = text(item.Protocol);
      if (published === undefined || target === undefined) return "";
      return `${url ? `${url}:` : ""}${published}->${target}${protocol ? `/${protocol}` : ""}`;
    })
    .filter((item) => item !== "");
}

export function registerCompose(server: McpServer): void {
  server.registerTool(
    "compose_status",
    {
      title: "Inspect Compose project",
      description:
        "Read a Docker Compose project's service status or bounded logs. Read-only; logs do not follow the stream.",
      inputSchema: {
        action: z.enum(["ps", "logs"]).describe("ps for service status, logs for a bounded log tail."),
        projectDir: projectDirSchema,
        files: filesSchema,
        services: servicesSchema,
        tail: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .describe("Log tail lines for action=logs. Defaults to 200."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ action, projectDir, files, services, tail }) =>
      runTool(async () => {
        const dir = await existingDirectory(projectDir);
        const selected = serviceArgs(services);

        if (action === "ps") {
          const args = composeArgs(dir, files, ["ps", "--format", "json", ...selected]);
          const output = await runDocker(args, {
            cwd: dir,
            timeoutMs: 30_000,
            maxBytes: 4 * 1024 * 1024,
          });
          if (output.truncated) {
            throw new DockerError(
              "COMPOSE_OUTPUT_TRUNCATED",
              "Compose status output exceeded 4 MiB. Narrow the project or select fewer services.",
            );
          }

          const rows = parseJsonRecords(output.stdout);
          const max = 200;
          const result = rows.slice(0, max).map((row) => ({
            id: text(row.ID),
            name: text(row.Name),
            service: text(row.Service),
            state: text(row.State),
            health: text(row.Health),
            status: text(row.Status),
            exitCode: number(row.ExitCode),
            ports: publishers(row.Publishers),
            project: text(row.Project),
          }));

          return {
            action,
            projectDir: dir,
            services: result,
            count: result.length,
            total: rows.length,
            truncated: rows.length > result.length,
          };
        }

        const lines = tail ?? 200;
        const args = composeArgs(dir, files, [
          "logs",
          "--no-color",
          "--tail",
          String(lines),
          ...selected,
        ]);
        const output = await runDocker(args, {
          cwd: dir,
          timeoutMs: 30_000,
          maxBytes: 64 * 1024,
        });

        return {
          action,
          projectDir: dir,
          tail: lines,
          logs: output.stdout,
          stderr: output.stderr || undefined,
          truncated: output.truncated,
          originalBytes: output.originalBytes,
        };
      }),
  );

  server.registerTool(
    "compose_control",
    {
      title: "Control Compose project",
      description:
        "Run a non-interactive Docker Compose lifecycle action. up always detaches; down only removes volumes when removeVolumes=true.",
      inputSchema: {
        action: z
          .enum(["up", "down", "restart", "build", "pull"])
          .describe("Compose action. up always runs detached; no interactive mode."),
        projectDir: projectDirSchema,
        files: filesSchema,
        services: servicesSchema,
        build: z.boolean().optional().describe("For action=up, rebuild images before starting."),
        removeVolumes: z
          .boolean()
          .optional()
          .describe("For action=down, also remove named and anonymous volumes. Defaults to false."),
        timeoutSecs: z
          .number()
          .int()
          .min(0)
          .max(300)
          .optional()
          .describe("For action=restart, the shutdown grace period in seconds."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ action, projectDir, files, services, build, removeVolumes, timeoutSecs }) =>
      runTool(async () => {
        const dir = await existingDirectory(projectDir);
        const selected = serviceArgs(services);

        let args: string[];
        let timeoutMs = 120_000;

        switch (action) {
          case "up":
            args = ["up", "-d"];
            if (build === true) args.push("--build");
            args.push(...selected);
            break;
          case "down":
            args = ["down"];
            if (removeVolumes === true) args.push("--volumes");
            args.push(...selected);
            break;
          case "restart":
            args = ["restart"];
            if (timeoutSecs !== undefined) args.push("--timeout", String(timeoutSecs));
            args.push(...selected);
            break;
          case "build":
            args = ["build", ...selected];
            timeoutMs = 240_000;
            break;
          case "pull":
            args = ["pull", ...selected];
            timeoutMs = 240_000;
            break;
        }

        const output = await runDocker(composeArgs(dir, files, args), {
          cwd: dir,
          timeoutMs,
          maxBytes: 64 * 1024,
        });

        return {
          action,
          projectDir: dir,
          output: output.stdout.trim(),
          stderr: output.stderr.trim() || undefined,
          truncated: output.truncated,
          originalBytes: output.originalBytes,
        };
      }),
  );
}
