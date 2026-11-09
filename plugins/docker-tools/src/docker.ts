import { execFile } from "node:child_process";
import type { ExecFileException } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

export class DockerError extends Error {
  readonly code: string;
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly signal?: string;

  constructor(
    code: string,
    message: string,
    details: {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      signal?: string;
    } = {},
  ) {
    super(message);
    this.name = "DockerError";
    this.code = code;
    this.exitCode = details.exitCode;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
    this.signal = details.signal;
  }
}

export type RunOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  cwd?: string;
  allowNonZero?: boolean;
};

export type DockerOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
  originalBytes: number;
  signal?: string;
};

type CappedText = {
  text: string;
  truncated: boolean;
  originalBytes: number;
};

export function capText(text: string, maxBytes: number): CappedText {
  const originalBytes = Buffer.byteLength(text, "utf8");
  if (originalBytes <= maxBytes) {
    return { text, truncated: false, originalBytes };
  }

  const buffer = Buffer.from(text, "utf8");
  let end = maxBytes;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) {
    end -= 1;
  }
  let capped = buffer.subarray(0, end).toString("utf8");
  if (capped.endsWith("\uFFFD")) {
    capped = capped.slice(0, -1);
  }
  return { text: capped, truncated: true, originalBytes };
}

export function runDocker(args: string[], options: RunOptions = {}): Promise<DockerOutput> {
  if (args.length === 0) {
    return Promise.reject(new DockerError("DOCKER_ARGS", "No docker arguments were provided."));
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return new Promise<DockerOutput>((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    const child = execFile(
      "docker",
      args,
      {
        cwd: options.cwd,
        windowsHide: true,
        maxBuffer: MAX_BUFFER_BYTES,
        encoding: "utf8",
      },
      (error: ExecFileException | null, stdout: string, stderr: string) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);

        const rawStdout = stdout ?? "";
        const rawStderr = stderr ?? "";

        if (timedOut) {
          reject(
            new DockerError(
              "DOCKER_TIMEOUT",
              `Docker command timed out after ${timeoutMs} ms: docker ${args.join(" ")}`,
              {
                stdout: capText(rawStdout, 4 * 1024).text,
                stderr: capText(rawStderr, 8 * 1024).text,
              },
            ),
          );
          return;
        }

        if (error) {
          const code = error.code;
          if (code === "ENOENT") {
            reject(
              new DockerError(
                "DOCKER_NOT_FOUND",
                "The docker command was not found in PATH. Install Docker Desktop or Docker Engine, make `docker --version` work in a terminal, then restart Snow App so it inherits the new PATH.",
                { stderr: capText(rawStderr, 8 * 1024).text },
              ),
            );
            return;
          }

          if (options.allowNonZero && typeof code === "number") {
            const capped = capText(rawStdout, maxBytes);
            resolve({
              stdout: capped.text,
              stderr: capText(rawStderr, 8 * 1024).text,
              exitCode: code,
              truncated: capped.truncated,
              originalBytes: capped.originalBytes,
              signal: error.signal ?? undefined,
            });
            return;
          }

          reject(
            new DockerError("DOCKER_COMMAND_FAILED", `docker ${args[0]} failed.`, {
              exitCode: typeof code === "number" ? code : undefined,
              stdout: capText(rawStdout, 4 * 1024).text,
              stderr: capText(rawStderr, 8 * 1024).text,
              signal: error.signal ?? undefined,
            }),
          );
          return;
        }

        const capped = capText(rawStdout, maxBytes);
        resolve({
          stdout: capped.text,
          stderr: capText(rawStderr, 8 * 1024).text,
          exitCode: 0,
          truncated: capped.truncated,
          originalBytes: capped.originalBytes,
        });
      },
    );

    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
  });
}

export async function runDockerJsonLines(
  args: string[],
  options: RunOptions = {},
): Promise<Record<string, unknown>[]> {
  const output = await runDocker(args, { ...options, maxBytes: 4 * 1024 * 1024 });
  if (output.truncated) {
    throw new DockerError(
      "DOCKER_OUTPUT_TRUNCATED",
      "Docker JSON output exceeded 4 MiB. Narrow the query with filters or a lower limit.",
    );
  }
  return parseJsonRecords(output.stdout);
}

export async function runDockerJson(args: string[], options: RunOptions = {}): Promise<unknown> {
  const output = await runDocker(args, { ...options, maxBytes: 4 * 1024 * 1024 });
  if (!output.stdout.trim()) {
    throw new DockerError("DOCKER_EMPTY_OUTPUT", "Docker returned no JSON output.");
  }
  try {
    return JSON.parse(output.stdout);
  } catch {
    throw new DockerError("DOCKER_INVALID_JSON", "Docker returned invalid JSON.", {
      stdout: capText(output.stdout, 2 * 1024).text,
    });
  }
}

export function parseJsonRecords(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  if (trimmed.startsWith("[")) {
    parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new DockerError("DOCKER_INVALID_JSON", "Docker JSON output is not an array.");
    }
    return parsed.map(toRecord);
  }

  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return toRecord(JSON.parse(line));
      } catch {
        throw new DockerError("DOCKER_INVALID_JSON", `Could not parse Docker JSON output at line ${index + 1}.`, {
          stdout: capText(trimmed, 2 * 1024).text,
        });
      }
    });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DockerError("DOCKER_INVALID_JSON", "Docker JSON output contains a non-object record.");
  }
  return value as Record<string, unknown>;
}

export function containerRef(value: string): string {
  const ref = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(ref)) {
    throw new DockerError(
      "INVALID_CONTAINER",
      `Invalid container name or ID: ${value}. Use a name or ID that starts with a letter or digit.`,
    );
  }
  return ref;
}

export function imageRef(value: string): string {
  const ref = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/.test(ref)) {
    throw new DockerError("INVALID_IMAGE", `Invalid image reference: ${value}.`);
  }
  return ref;
}

export function serviceRef(value: string): string {
  const ref = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(ref)) {
    throw new DockerError("INVALID_SERVICE", `Invalid Compose service name: ${value}.`);
  }
  return ref;
}

export async function existingDirectory(value: string): Promise<string> {
  if (!path.isAbsolute(value)) {
    throw new DockerError("INVALID_PROJECT_DIR", "projectDir must be an absolute path.");
  }
  if (value.includes("\0")) {
    throw new DockerError("INVALID_PROJECT_DIR", "projectDir contains an invalid character.");
  }

  const resolved = path.resolve(value);
  try {
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      throw new DockerError("PROJECT_DIR_NOT_FOUND", `projectDir is not a directory: ${resolved}`);
    }
  } catch (error) {
    if (error instanceof DockerError) throw error;
    throw new DockerError("PROJECT_DIR_NOT_FOUND", `Directory not found: ${resolved}`);
  }
  return resolved;
}

export function resolvePath(base: string, value: string): string {
  if (value.includes("\0")) {
    throw new DockerError("INVALID_PATH", "Path contains an invalid character.");
  }
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(base, value);
}

const SECRET_ENV = /(PASS|PASSWORD|SECRET|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|CREDENTIAL|AUTH|COOKIE|SESSION)/i;

export function redactEnv(env: string[]): string[] {
  return env.map((entry) => {
    const separator = entry.indexOf("=");
    if (separator <= 0) return entry;
    const key = entry.slice(0, separator);
    return SECRET_ENV.test(key) ? `${key}=***` : entry;
  });
}

const SECRET_FLAG =
  /^--?(?:pass|passwd|password|token|secret|api[-_]?key|access[-_]?key|auth|requirepass)$/i;

/** Best-effort masking for argv values that follow a secret-like flag. */
export function redactCommand(args: string[]): string[] {
  return args.map((arg, index) => {
    const previous = index > 0 ? args[index - 1] : undefined;
    if (previous && SECRET_FLAG.test(previous)) return "***";

    if (arg.startsWith("-")) {
      const separator = arg.indexOf("=");
      if (separator > 0 && SECRET_FLAG.test(arg.slice(0, separator))) {
        return `${arg.slice(0, separator)}=***`;
      }
    }
    return arg;
  });
}

export function envKeys(env: string[]): string[] {
  return env.map((entry) => {
    const separator = entry.indexOf("=");
    return separator > 0 ? entry.slice(0, separator) : entry;
  });
}
