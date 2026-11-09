import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  capText,
  containerRef,
  DockerError,
  envKeys,
  redactCommand,
  redactEnv,
  runDocker,
  runDockerJsonLines,
} from "../docker.js";
import { runTool } from "./result.js";

const MAX_LOG_BYTES = 64 * 1024;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const containerSchema = z
  .string()
  .min(1)
  .max(128)
  .describe("Container name or ID (for example api, web-1, or a short container ID).");

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerContainers(server: McpServer): void {
  server.registerTool(
    "containers_list",
    {
      title: "List Docker containers",
      description:
        "List Docker containers with compact state, image, status and port information. Read-only.",
      inputSchema: {
        all: z.boolean().optional().describe("Include stopped containers. Defaults to false."),
        status: z
          .enum(["created", "running", "paused", "restarting", "removing", "exited", "dead"])
          .optional()
          .describe("Only return containers in this state."),
        name: z.string().min(1).max(128).optional().describe("Filter by container name substring."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum containers to return. Defaults to 100."),
      },
      annotations: readOnlyAnnotations,
    },
    ({ all, status, name, limit }) =>
      runTool(async () => {
        const args = ["ps", "--no-trunc", "--format", "{{json .}}"];
        if (all) args.push("--all");
        if (status) args.push("--filter", `status=${status}`);
        if (name) args.push("--filter", `name=${name}`);

        const records = await runDockerJsonLines(args, { timeoutMs: 30_000 });
        const max = limit ?? 100;
        const containers = records.slice(0, max).map((row) => ({
          id: text(row.ID),
          name: text(row.Names),
          image: text(row.Image),
          state: text(row.State) ?? text(row.Status),
          status: text(row.Status),
          ports: text(row.Ports),
          createdAt: text(row.CreatedAt),
          runningFor: text(row.RunningFor),
        }));

        return {
          containers,
          count: containers.length,
          total: records.length,
          truncated: records.length > containers.length,
        };
      }),
  );

  server.registerTool(
    "container_inspect",
    {
      title: "Inspect Docker container",
      description:
        "Inspect one Docker container: state, image, config, mounts, networks and port bindings. Environment values are omitted by default; includeEnv=true adds a redacted value list. Command arguments after secret-like flags are masked.",
      inputSchema: {
        container: containerSchema,
        includeEnv: z
          .boolean()
          .optional()
          .describe("Include environment values. Secret-like keys (PASSWORD, TOKEN, KEY, ...) are masked."),
      },
      annotations: readOnlyAnnotations,
    },
    ({ container, includeEnv }) =>
      runTool(async () => {
        const ref = containerRef(container);
        const output = await runDocker(["inspect", "--type", "container", ref], {
          timeoutMs: 30_000,
          maxBytes: 4 * 1024 * 1024,
        });

        let parsed: unknown;
        try {
          parsed = JSON.parse(output.stdout);
        } catch {
          throw new DockerError("DOCKER_INVALID_JSON", "docker inspect returned invalid JSON.", {
            stdout: capText(output.stdout, 2 * 1024).text,
          });
        }
        if (!Array.isArray(parsed) || parsed.length === 0) {
          throw new DockerError("CONTAINER_NOT_FOUND", `Container not found: ${ref}`);
        }

        const raw = record(parsed[0]);
        const state = record(raw.State);
        const config = record(raw.Config);
        const host = record(raw.HostConfig);
        const network = record(raw.NetworkSettings);
        const health = record(state.Health);
        const env = stringArray(config.Env);

        const mounts = Array.isArray(raw.Mounts)
          ? raw.Mounts.map(record).map((mount) => ({
              type: text(mount.Type),
              name: text(mount.Name),
              source: text(mount.Source),
              destination: text(mount.Destination),
              mode: text(mount.Mode),
              rw: mount.RW === true,
            }))
          : [];

        const portBindings = Object.entries(record(host.PortBindings)).map(
          ([containerPort, bindings]) => ({
            containerPort,
            host: Array.isArray(bindings)
              ? bindings.map(record).map((binding) => ({
                  hostIp: text(binding.HostIp),
                  hostPort: text(binding.HostPort),
                }))
              : [],
          }),
        );

        return {
          container: {
            id: text(raw.Id),
            name: text(raw.Name)?.replace(/^\//, ""),
            image: text(raw.Image),
            createdAt: text(raw.Created),
            platform: text(raw.Platform),
            state: {
              status: text(state.Status),
              running: state.Running === true,
              paused: state.Paused === true,
              restarting: state.Restarting === true,
              oomKilled: state.OOMKilled === true,
              dead: state.Dead === true,
              pid: typeof state.Pid === "number" ? state.Pid : undefined,
              exitCode: typeof state.ExitCode === "number" ? state.ExitCode : undefined,
              error: text(state.Error),
              startedAt: text(state.StartedAt),
              finishedAt: text(state.FinishedAt),
              health: text(health.Status)
                ? {
                    status: text(health.Status),
                    failingStreak:
                      typeof health.FailingStreak === "number" ? health.FailingStreak : undefined,
                  }
                : null,
            },
            config: {
              image: text(config.Image),
              cmd: redactCommand(stringArray(config.Cmd)),
              entrypoint: redactCommand(stringArray(config.Entrypoint)),
              workingDir: text(config.WorkingDir),
              user: text(config.User),
              labels: record(config.Labels),
              exposedPorts: Object.keys(record(config.ExposedPorts)),
            },
            host: {
              restartPolicy: text(record(host.RestartPolicy).Name),
              networkMode: text(host.NetworkMode),
              autoRemove: host.AutoRemove === true,
              privileged: host.Privileged === true,
              portBindings,
            },
            mounts,
            networks: Object.keys(record(network.Networks)),
            envKeys: envKeys(env),
            ...(includeEnv ? { env: redactEnv(env) } : {}),
          },
        };
      }),
  );

  server.registerTool(
    "container_logs",
    {
      title: "Read container logs",
      description:
        "Read a bounded tail of Docker container logs. Output is capped at 64 KiB and this tool never follows the stream.",
      inputSchema: {
        container: containerSchema,
        tail: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .describe("Number of trailing lines. Defaults to 200, maximum 2000."),
        since: z
          .string()
          .min(1)
          .max(64)
          .optional()
          .describe("Show logs since a timestamp or relative duration, e.g. 10m or 2026-01-01T00:00:00Z."),
        timestamps: z.boolean().optional().describe("Prefix each log line with a timestamp."),
      },
      annotations: readOnlyAnnotations,
    },
    ({ container, tail, since, timestamps }) =>
      runTool(async () => {
        const ref = containerRef(container);
        const lines = tail ?? 200;
        const args = ["logs", "--tail", String(lines)];
        if (since) args.push("--since", since);
        if (timestamps) args.push("--timestamps");
        args.push(ref);

        const output = await runDocker(args, { timeoutMs: 30_000, maxBytes: MAX_LOG_BYTES });
        return {
          container: ref,
          tail: lines,
          logs: output.stdout,
          stderr: output.stderr || undefined,
          truncated: output.truncated,
          originalBytes: output.originalBytes,
        };
      }),
  );

  server.registerTool(
    "container_stats",
    {
      title: "Sample container resource usage",
      description:
        "Take a one-shot docker stats sample for one container or all running containers. Read-only; no streaming.",
      inputSchema: {
        container: containerSchema.optional().describe("Container name or ID. Omit to sample all running containers."),
      },
      annotations: readOnlyAnnotations,
    },
    ({ container }) =>
      runTool(async () => {
        const args = ["stats", "--no-stream", "--no-trunc", "--format", "{{json .}}"];
        const ref = container ? containerRef(container) : undefined;
        if (ref) args.push(ref);

        const records = await runDockerJsonLines(args, { timeoutMs: 30_000 });
        const max = 100;
        const stats = records.slice(0, max).map((row) => ({
          container: text(row.Container),
          name: text(row.Name),
          cpu: text(row.CPUPerc),
          memory: text(row.MemUsage),
          memoryPercent: text(row.MemPerc),
          network: text(row.NetIO),
          blockIO: text(row.BlockIO),
          pids: text(row.PIDs),
        }));

        return {
          stats,
          count: stats.length,
          total: records.length,
          truncated: records.length > stats.length,
        };
      }),
  );

  registerAction(server, {
    name: "container_start",
    title: "Start container",
    description: "Start one stopped Docker container.",
    annotations: writeAnnotations,
    args: (ref) => ["start", ref],
    result: (ref) => ({ container: ref, action: "start", started: true }),
  });

  registerAction(server, {
    name: "container_stop",
    title: "Stop container",
    description: "Stop one running Docker container with a bounded grace period.",
    annotations: writeAnnotations,
    inputSchema: {
      timeoutSecs: z
        .number()
        .int()
        .min(0)
        .max(300)
        .optional()
        .describe("Seconds to wait before killing the container. Defaults to Docker's own timeout."),
    },
    args: (ref, extra) => {
      const timeout = extra.timeoutSecs;
      return timeout === undefined
        ? ["stop", ref]
        : ["stop", "-t", String(timeout), ref];
    },
    result: (ref) => ({ container: ref, action: "stop", stopped: true }),
  });

  registerAction(server, {
    name: "container_restart",
    title: "Restart container",
    description: "Restart one Docker container with a bounded grace period.",
    annotations: writeAnnotations,
    inputSchema: {
      timeoutSecs: z
        .number()
        .int()
        .min(0)
        .max(300)
        .optional()
        .describe("Seconds to wait before killing the container. Defaults to Docker's own timeout."),
    },
    args: (ref, extra) => {
      const timeout = extra.timeoutSecs;
      return timeout === undefined
        ? ["restart", ref]
        : ["restart", "-t", String(timeout), ref];
    },
    result: (ref) => ({ container: ref, action: "restart", restarted: true }),
  });

  registerAction(server, {
    name: "container_remove",
    title: "Remove container",
    description:
      "Remove one Docker container. force=false refuses a running container; volumes=true also removes anonymous volumes.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      force: z.boolean().optional().describe("Force removal of a running container. Defaults to false."),
      volumes: z.boolean().optional().describe("Also remove anonymous volumes. Defaults to false."),
    },
    args: (ref, extra) => {
      const args = ["rm"];
      if (extra.force === true) args.push("--force");
      if (extra.volumes === true) args.push("--volumes");
      args.push(ref);
      return args;
    },
    result: (ref) => ({ container: ref, action: "remove", removed: true }),
  });

  server.registerTool(
    "container_exec",
    {
      title: "Execute a command in a container",
      description:
        "Run one command inside a running Docker container without a shell. command is an argv array; the container must already be running.",
      inputSchema: {
        container: containerSchema,
        command: z
          .array(z.string().min(1).max(4096))
          .min(1)
          .max(50)
          .describe("Command and arguments, for example [\"cat\", \"/etc/hosts\"]. No shell interpretation."),
        workdir: z.string().min(1).max(1024).optional().describe("Working directory inside the container."),
        user: z.string().min(1).max(128).optional().describe("User or UID inside the container."),
        timeoutMs: z
          .number()
          .int()
          .min(1000)
          .max(120000)
          .optional()
          .describe("Command timeout in milliseconds. Defaults to 30000."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ container, command, workdir, user, timeoutMs }) =>
      runTool(async () => {
        const ref = containerRef(container);
        const args = ["exec"];
        if (workdir) args.push("--workdir", workdir);
        if (user) args.push("--user", user);
        args.push(ref, ...command);

        const output = await runDocker(args, {
          timeoutMs: timeoutMs ?? 30_000,
          maxBytes: MAX_LOG_BYTES,
          allowNonZero: true,
        });

        return {
          container: ref,
          command,
          exitCode: output.exitCode,
          stdout: output.stdout,
          stderr: output.stderr,
          truncated: output.truncated,
          originalBytes: output.originalBytes,
          signal: output.signal,
        };
      }),
  );
}

type ActionExtra = {
  timeoutSecs?: number;
  force?: boolean;
  volumes?: boolean;
};

function registerAction(
  server: McpServer,
  options: {
    name: string;
    title: string;
    description: string;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
    inputSchema?: Record<string, z.ZodTypeAny>;
    args: (ref: string, extra: ActionExtra) => string[];
    result: (ref: string) => Record<string, unknown>;
  },
): void {
  server.registerTool(
    options.name,
    {
      title: options.title,
      description: options.description,
      inputSchema: {
        container: containerSchema,
        ...options.inputSchema,
      },
      annotations: options.annotations,
    },
    (input: { container: string } & ActionExtra) =>
      runTool(async () => {
        const ref = containerRef(input.container);
        const output = await runDocker(options.args(ref, input), { timeoutMs: 30_000 });
        return {
          ...options.result(ref),
          output: output.stdout.trim() || undefined,
          truncated: output.truncated,
        };
      }),
  );
}
