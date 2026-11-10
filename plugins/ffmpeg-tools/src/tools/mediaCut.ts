import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { probeMedia } from "../ffmpeg/probe";
import { formatTimeArgument, parseTimeToSeconds, toFfmpegSeconds } from "../ffmpeg/time";
import {
  describeOutputs,
  failure,
  inputProblem,
  outputProblem,
  respond,
  requireBinary,
  runFfmpeg,
  TIME_ARGUMENT,
  totalInputBytes,
  type ToolResponse,
} from "./shared";

type Args = {
  input: string;
  output: string;
  start?: number | string;
  end?: number | string;
  duration?: number | string;
  mode?: "copy" | "reencode";
  crf?: number;
  preset?: string;
  overwrite?: boolean;
};

// `-t` needs a length, so an `end` without `duration` is converted with the real
// probed duration of the input instead of a guess.
async function resolveDuration(input: Args): Promise<number | null> {
  if (input.duration !== undefined) {
    const parsed = parseTimeToSeconds(input.duration);
    if (parsed === null) return null;
    return parsed;
  }
  if (input.end === undefined) return null;

  const gate = requireBinary("ffprobe");
  if (!gate.ok) return null;
  const probed = await probeMedia(input.input);
  if (!probed.ok || probed.info.durationSeconds === null) return null;

  const end = parseTimeToSeconds(input.end);
  if (end === null) return null;
  const start = input.start === undefined ? 0 : parseTimeToSeconds(input.start);
  if (start === null) return null;
  const length = end - start;
  return length > 0 ? length : null;
}

async function handle(input: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return failure("invalid-input", inputIssue);
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const startSeconds = input.start === undefined ? 0 : parseTimeToSeconds(input.start);
  if (startSeconds !== null && startSeconds > 0) {
    // Cutting into a still image is a no-op that ffmpeg reports as an empty file.
    const probed = await probeMedia(input.input);
    if (probed.ok && probed.info.kind === "image") {
      return failure(
        "image-has-no-timeline",
        `${input.input} 是单张图片，没有可剪辑的时间轴`,
      );
    }
  }

  if (input.start === undefined && input.end === undefined && input.duration === undefined) {
    return failure("missing-range", "至少需要 start、end 或 duration 之一");
  }
  if (input.duration !== undefined && input.end !== undefined) {
    return failure("conflicting-range", "duration 与 end 互斥，请只传一个");
  }
  for (const [field, value] of [
    ["start", input.start],
    ["end", input.end],
    ["duration", input.duration],
  ] as const) {
    if (value !== undefined && parseTimeToSeconds(value) === null) {
      return failure("invalid-time", `${field} 不是可识别的时间：${String(value)}`);
    }
  }

  const mode = input.mode ?? "copy";
  const duration = await resolveDuration(input);

  if (mode === "copy" && input.end !== undefined && duration === null) {
    return failure(
      "duration-unresolved",
      "copy 模式用 end 结束需要可读的输入时长；请改用 duration，或先用 media_probe 确认时长",
    );
  }

  const args = ["-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n"];

  if (mode === "copy") {
    // Seeking before -i is the fast path; stream copy tolerates the nearest
    // keyframe, which is why reencode exists for exact cuts.
    if (input.start !== undefined) args.push("-ss", formatTimeArgument(input.start));
    args.push("-i", input.input);
    if (duration !== null) args.push("-t", toFfmpegSeconds(duration));
    args.push("-c", "copy", "-avoid_negative_ts", "make_zero");
  } else {
    // Accurate mode: seek after -i so decoding starts at the exact frame.
    args.push("-i", input.input);
    if (input.start !== undefined) args.push("-ss", formatTimeArgument(input.start));
    if (duration !== null) args.push("-t", toFfmpegSeconds(duration));
    args.push("-c:v", "libx264", "-crf", String(input.crf ?? 23));
    if (input.preset) args.push("-preset", input.preset);
    args.push("-c:a", "aac");
  }

  args.push(input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "cut",
    mode,
    input: input.input,
    inputBytes: totalInputBytes([input.input]),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

export function registerMediaCut(server: McpServer): void {
  server.registerTool(
    "media_cut",
    {
      title: "Trim clip",
      description:
        "Cut one range out of a media file. copy mode (default) stream-copies, so it is fast but the start snaps to the nearest keyframe; reencode mode seeks accurately and re-encodes. Give start plus duration, or start plus end (end needs a readable input duration).",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        output: z.string().min(1).describe("Absolute output path; its directory must exist"),
        start: TIME_ARGUMENT.optional().describe("Seconds or HH:MM:SS(.mmm)"),
        end: TIME_ARGUMENT.optional().describe("Seconds or HH:MM:SS(.mmm)"),
        duration: TIME_ARGUMENT.optional().describe("Length; mutually exclusive with end"),
        mode: z.enum(["copy", "reencode"]).optional(),
        crf: z.number().int().min(0).max(63).optional().describe("reencode mode only; default 23"),
        preset: z.string().optional().describe("reencode mode x264/x265 preset"),
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
