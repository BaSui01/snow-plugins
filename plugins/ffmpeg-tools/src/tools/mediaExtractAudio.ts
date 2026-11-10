import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { AUDIO_CODEC_VALUES, audioCodecFromValue } from "../ffmpeg/formats";
import {
  describeOutputs,
  failure,
  inputProblem,
  outputProblem,
  respond,
  runFfmpeg,
  totalInputBytes,
  type ToolResponse,
} from "./shared";

type Args = {
  input: string;
  output: string;
  codec?: (typeof AUDIO_CODEC_VALUES)[number];
  bitrate?: string;
  track?: number;
  overwrite?: boolean;
};

async function handle(input: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return failure("invalid-input", inputIssue);
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const codec = input.codec ?? "aac";
  const args = ["-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n"];
  args.push("-i", input.input, "-vn");
  if (input.track !== undefined) args.push("-map", `0:a:${input.track}`);

  if (codec === "copy") {
    args.push("-c:a", "copy");
  } else {
    const mapped = audioCodecFromValue(codec);
    if (!mapped) return failure("unsupported-codec", `不支持的音频编码：${codec}`);
    args.push("-c:a", mapped.codec);
    if (input.bitrate) args.push("-b:a", input.bitrate);
  }

  args.push(input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "extract_audio",
    codec,
    input: input.input,
    inputBytes: totalInputBytes([input.input]),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

export function registerMediaExtractAudio(server: McpServer): void {
  server.registerTool(
    "media_extract_audio",
    {
      title: "Extract audio",
      description:
        "Extract one audio track from a media file. codec copy keeps the original stream without re-encoding (the output container must accept it); aac/mp3/flac/wav/opus re-encode. Use track to pick a non-default audio stream index.",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        output: z.string().min(1).describe("Absolute output path; its directory must exist"),
        codec: z.enum(AUDIO_CODEC_VALUES).optional().describe("Default aac; copy means no re-encode"),
        bitrate: z.string().optional().describe("e.g. 192k; ignored by copy"),
        track: z.number().int().min(0).max(63).optional().describe("Audio stream index, 0-based"),
        overwrite: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args) => handle(args as Args),
  );
}
