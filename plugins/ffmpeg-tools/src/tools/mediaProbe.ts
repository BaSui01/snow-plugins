import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { installGuidance } from "../ffmpeg/binary";
import { probeMedia } from "../ffmpeg/probe";
import {
  failure,
  inputProblem,
  requireBinary,
  respond,
  type ToolResponse,
} from "./shared";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

async function handle({ path: target }: { path: string }): Promise<ToolResponse> {
  const problem = inputProblem(target);
  if (problem) return failure("invalid-path", problem);

  const gate = requireBinary("ffprobe");
  if (!gate.ok) return gate.response;

  const result = await probeMedia(target);
  if (!result.ok) {
    const extra: Record<string, unknown> = {};
    if (result.stderrTail) extra.stderrTail = result.stderrTail;
    if (result.code === "ffprobe-missing") {
      extra.guidance = installGuidance(["ffprobe"]);
    }
    return failure(result.code, result.error, extra);
  }
  return respond({ ok: true, media: result.info });
}

export function registerMediaProbe(server: McpServer): void {
  server.registerTool(
    "media_probe",
    {
      title: "Probe media",
      description:
        "Read real container and stream facts (codec, resolution, frame rate, sample rate, duration, bitrate, size) for one absolute media path. Read-only: nothing is written.",
      inputSchema: {
        path: z.string().min(1).describe("Absolute path to the media file to inspect"),
      },
      annotations: READ_ONLY,
    },
    (args) => handle(args as { path: string }),
  );
}
