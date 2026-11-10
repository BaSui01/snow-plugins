import { statSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { installGuidance, resolveBinary, type BinaryName } from "../ffmpeg/binary";
import { resolveOperationTimeoutMs, runBinary } from "../ffmpeg/run";

export type Payload = Record<string, unknown>;

export type ToolResponse = {
  content: { type: "text"; text: string }[];
  structuredContent: Payload;
};

// Single definition of the "seconds or HH:MM:SS(.mmm)" tool argument, shared by
// every tool that accepts a time value.
export const TIME_ARGUMENT = z.union([z.number().nonnegative(), z.string().min(1)]);

export function respond(payload: Payload): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

export function failure(code: string, message: string, extra: Payload = {}): ToolResponse {
  return respond({ ok: false, error: code, message, ...extra });
}

export function isFile(target: string): boolean {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function fileSize(target: string): number | null {
  try {
    return statSync(target).size;
  } catch {
    return null;
  }
}

export function pathProblem(value: string, field: string): string | null {
  if (value.includes("\u0000")) return `${field} 含非法字符`;
  if (!path.isAbsolute(value)) return `${field} 必须是绝对路径：${value}`;
  return null;
}

export function inputProblem(input: string): string | null {
  const problem = pathProblem(input, "input");
  if (problem) return problem;
  if (!isFile(input)) return `输入文件不存在或不是文件：${input}`;
  return null;
}

// Outputs are never written implicitly: the target directory must already exist and
// an existing file is only replaced when the caller asked for it.
export function outputProblem(output: string, overwrite: boolean): string | null {
  const problem = pathProblem(output, "output");
  if (problem) return problem;
  const directory = path.dirname(output);
  if (!isDirectory(directory)) return `输出目录不存在：${directory}`;
  if (isFile(output) && !overwrite) {
    return `输出文件已存在（确认要覆盖时请传 overwrite: true）：${output}`;
  }
  return null;
}

/**
 * The one escaping rule for a Windows path placed inside a filter option value. The
 * filtergraph tokenizer and the filter option parser each unescape once, so a colon
 * preceded by a single backslash is consumed by the first pass and the value gets
 * truncated at the drive letter. This function therefore rewrites every backslash to a
 * forward slash and writes the drive-letter colon as two backslashes plus the colon;
 * measured on this machine's ffmpeg 9.0.2, the libass filters accept exactly that shape,
 * so every call site (subtitles, ass, drawtext, lut3d) shares this one function:
 *   OK   subtitles=<escaped path>, including a directory holding a space, together with
 *        :force_style=..., and ass=<escaped path> on a real .ass file
 *   FAIL <escaped path> with a single backslash before the colon -> "Unable to parse
 *        original_size option value"
 *   FAIL <escaped path> wrapped in single quotes -> over-escaped, the same error
 */
export function escapeFilterPath(target: string): string {
  return target.replace(/\\/g, "/").replace(/:/g, "\\\\:");
}

export type BinaryGate = { ok: true; path: string } | { ok: false; response: ToolResponse };

export function requireBinary(name: BinaryName): BinaryGate {
  const binary = resolveBinary(name);
  if (binary) return { ok: true, path: binary.path };
  return {
    ok: false,
    response: respond({
      ok: false,
      error: `${name}-not-found`,
      missing: [name],
      message: `本机没有可用的 ${name}`,
      guidance: installGuidance([name]),
    }),
  };
}

export type MediaRun =
  | { ok: true; elapsedMs: number; stderrTail: string }
  | { ok: false; response: ToolResponse };

export async function runFfmpeg(args: string[]): Promise<MediaRun> {
  const binary = requireBinary("ffmpeg");
  if (!binary.ok) return { ok: false, response: binary.response };
  const outcome = await runBinary(binary.path, args, {
    timeoutMs: resolveOperationTimeoutMs(),
  });
  if (outcome.spawnError) {
    return { ok: false, response: failure("ffmpeg-spawn-failed", outcome.spawnError) };
  }
  if (outcome.timedOut) {
    return {
      ok: false,
      response: failure("timed-out", "处理超过单次调用时限，已终止 ffmpeg", {
        stderrTail: outcome.stderrTail,
      }),
    };
  }
  if (outcome.code !== 0) {
    return {
      ok: false,
      response: failure(
        "ffmpeg-failed",
        `ffmpeg 退出码 ${formatExitCode(outcome.code)}`,
        { stderrTail: outcome.stderrTail },
      ),
    };
  }
  return { ok: true, elapsedMs: outcome.elapsedMs, stderrTail: outcome.stderrTail };
}

/**
 * Windows reports a negative C exit status as an unsigned 32-bit value
 * (e.g. -22 arrives as 4294967274), which reads as noise to a user.
 */
function formatExitCode(code: number | null): string {
  if (code === null) return "null";
  if (code > 0x7fffffff) return String(code - 0x100000000);
  return String(code);
}

export type VerboseRun =
  | { ok: true; elapsedMs: number; stdout: string; stderr: string }
  | { ok: false; response: ToolResponse };

/**
 * For analysis / visualization passes that print their findings on stderr: the whole
 * log is kept instead of a short tail, so report lines can be parsed. Everything else
 * (binary resolution, timeout, exit-code mapping) matches `runFfmpeg`.
 */
export async function runFfmpegVerbose(
  args: string[],
  options: { stderrTailChars?: number; stdoutLimitBytes?: number } = {},
): Promise<VerboseRun> {
  const binary = requireBinary("ffmpeg");
  if (!binary.ok) return { ok: false, response: binary.response };
  const outcome = await runBinary(binary.path, args, {
    timeoutMs: resolveOperationTimeoutMs(),
    stdoutLimitBytes: options.stdoutLimitBytes ?? 4 * 1024 * 1024,
    stderrTailChars: options.stderrTailChars ?? 1_000_000,
  });
  if (outcome.spawnError) {
    return { ok: false, response: failure("ffmpeg-spawn-failed", outcome.spawnError) };
  }
  if (outcome.timedOut) {
    return {
      ok: false,
      response: failure("timed-out", "分析超过单次调用时限，已终止 ffmpeg", {
        stderrTail: outcome.stderrTail,
      }),
    };
  }
  if (outcome.code !== 0) {
    return {
      ok: false,
      response: failure("ffmpeg-failed", `ffmpeg 退出码 ${formatExitCode(outcome.code)}`, {
        stderrTail: outcome.stderrTail,
      }),
    };
  }
  return {
    ok: true,
    elapsedMs: outcome.elapsedMs,
    stdout: outcome.stdout,
    stderr: outcome.stderrTail,
  };
}

export function describeOutputs(paths: string[]): { path: string; sizeBytes: number | null }[] {
  return paths.map((target) => ({ path: target, sizeBytes: fileSize(target) }));
}

/**
 * Real on-disk size of the material that went in, so the card can show a
 * before/after comparison instead of guessing. Null when any path is unreadable.
 */
export function totalInputBytes(paths: string[]): number | null {
  if (!paths.length) return null;
  let total = 0;
  for (const target of paths) {
    const size = fileSize(target);
    if (size === null) return null;
    total += size;
  }
  return total;
}

export function outputsLargerThanZero(paths: string[]): string[] {
  return paths.filter((target) => {
    const size = fileSize(target);
    return size === null || size === 0;
  });
}

/** A finished tool response when the work is already over, so callers can return it as is. */
export function isResponse(value: unknown): value is ToolResponse {
  return typeof value === "object" && value !== null && "content" in value;
}

/** The real tail of a failed run, carried into a failure payload unchanged. */
export function tailOf(run: { stderrTail: string }): { stderrTail: string } {
  return { stderrTail: run.stderrTail };
}

export function baseArgs(overwrite: boolean): string[] {
  return ["-hide_banner", "-loglevel", "error", overwrite ? "-y" : "-n"];
}

/** An object or null: ffprobe JSON is inspected field by field, never assumed. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** A non-empty string field, or null; missing and empty are reported the same way. */
export function stringOf(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value !== "" ? value : null;
}

/** ffprobe writes dispositions as 1/0 or true/false depending on the field. */
export function flagOf(record: Record<string, unknown> | null, key: string): boolean {
  const value = record?.[key];
  return value === 1 || value === true;
}
