import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { capText, DockerError } from "../docker.js";

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function fail(error: unknown): CallToolResult {
  const details =
    error instanceof DockerError
      ? {
          code: error.code,
          message: error.message,
          exitCode: error.exitCode,
          signal: error.signal,
          stdout: error.stdout,
          stderr: error.stderr ? capText(error.stderr, 8 * 1024).text : undefined,
        }
      : {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        };

  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(details) }],
  };
}

export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error);
  }
}
