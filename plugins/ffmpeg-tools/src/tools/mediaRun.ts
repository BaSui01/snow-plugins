import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { resolveBinary } from "../ffmpeg/binary";
import { resolveOperationTimeoutMs, runBinary } from "../ffmpeg/run";
import { failure, fileSize, isFile, respond, type ToolResponse } from "./shared";

const BINARIES = ["ffmpeg", "ffprobe"] as const;

// Protocols that leave the machine. They are allowed only when the caller says so,
// which keeps the plugin's "local unless you name a network endpoint" promise honest.
const NETWORK_PROTOCOL = /^(?:rtmp|rtmps|rtmpt|rtmpe|srt|rist|udp|udplite|rtp|srtp|http|https|httpproxy|ftp|sftp|tcp|tls|gopher|ipfs|ipns|zmq|mmsh|mmst):/i;

const MAX_STREAM_CHARS = 4000;

type Args = {
  binary?: (typeof BINARIES)[number];
  args: string[];
  timeoutMs?: number;
  allowNetwork?: boolean;
  expectOutput?: string;
};

function networkArgument(args: string[]): string | null {
  for (const value of args) {
    if (NETWORK_PROTOCOL.test(value.trim())) return value.trim();
  }
  return null;
}

async function handle(input: Args): Promise<ToolResponse> {
  const binaryName = input.binary ?? "ffmpeg";
  const binary = resolveBinary(binaryName);
  if (!binary) {
    return failure(`${binaryName}-not-found`, `本机没有可用的 ${binaryName}`);
  }

  for (const [index, value] of input.args.entries()) {
    if (typeof value !== "string" || value.trim() === "") {
      return failure("invalid-argument", `args[${index}] 必须是非空字符串`);
    }
    if (value.includes("\u0000")) {
      return failure("invalid-argument", `args[${index}] 含非法字符`);
    }
  }

  const remote = networkArgument(input.args);
  if (remote && input.allowNetwork !== true) {
    return failure(
      "network-not-allowed",
      `参数包含网络地址 ${remote}；如确有需要，请显式传 allowNetwork: true，并确认目标可信`,
    );
  }

  const requested = input.timeoutMs;
  const timeoutMs =
    requested === undefined
      ? resolveOperationTimeoutMs()
      : Math.min(Math.max(requested, 1000), resolveOperationTimeoutMs());

  const before = input.expectOutput ? fileSize(input.expectOutput) : null;
  const outcome = await runBinary(binary.path, ["-hide_banner", ...input.args], {
    timeoutMs,
    stdoutLimitBytes: 4 * 1024 * 1024,
    stderrTailChars: MAX_STREAM_CHARS,
  });

  if (outcome.spawnError) {
    return failure("spawn-failed", outcome.spawnError);
  }

  const payload: Record<string, unknown> = {
    ok: !outcome.timedOut && outcome.code === 0,
    binary: binaryName,
    exitCode: outcome.code,
    timedOut: outcome.timedOut,
    elapsedMs: outcome.elapsedMs,
    stdoutTail: outcome.stdout.slice(-MAX_STREAM_CHARS).trim(),
    stderrTail: outcome.stderrTail,
    network: remote ?? null,
  };

  if (outcome.timedOut) {
    payload.error = "timed-out";
    payload.message = "命令超过单次调用时限，已终止";
  } else if (outcome.code !== 0) {
    payload.error = "nonzero-exit";
    payload.message = `${binaryName} 退出码 ${outcome.code}`;
  }

  if (input.expectOutput) {
    const after = fileSize(input.expectOutput);
    payload.expectedOutput = {
      path: input.expectOutput,
      exists: isFile(input.expectOutput),
      sizeBytesBefore: before,
      sizeBytesAfter: after,
      written: after !== null && after !== before,
    };
  }

  return respond(payload);
}

export function registerMediaRun(server: McpServer): void {
  server.registerTool(
    "media_run",
    {
      title: "Run ffmpeg or ffprobe directly",
      description:
        "Escape hatch for capabilities the higher-level tools do not wrap (any of the build's filters, muxers, bitstream filters or protocols). Arguments are passed as an argv array without a shell, so nothing is re-interpreted; the caller owns argument correctness, including -y/-n. Network endpoints (rtmp/srt/udp/http/...) are refused unless allowNetwork is true. Use media_capabilities first to confirm the build supports what you pass.",
      inputSchema: {
        binary: z.enum(BINARIES).optional().describe("Default ffmpeg"),
        args: z
          .array(z.string().min(1))
          .min(1)
          .describe("Full argument list after the binary, e.g. [\"-i\", in, \"-vf\", \"hflip\", out]"),
        timeoutMs: z.number().int().min(1000).max(1_800_000).optional(),
        allowNetwork: z.boolean().optional().describe("Required when an argument names a network protocol"),
        expectOutput: z.string().optional().describe("Absolute path whose size change should be reported"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    (args) => handle(args as Args),
  );
}
