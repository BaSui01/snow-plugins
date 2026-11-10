import { readdirSync } from "node:fs";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { imageQualityArgs } from "../ffmpeg/formats";
import { probeMedia, type MediaInfo } from "../ffmpeg/probe";
import { parseTimeToSeconds } from "../ffmpeg/time";
import {
  describeOutputs,
  failure,
  inputProblem,
  isDirectory,
  outputProblem,
  respond,
  requireBinary,
  runFfmpeg,
  totalInputBytes,
  type ToolResponse,
} from "./shared";

const IMAGE_CODECS: Record<string, string> = {
  png: "png",
  jpg: "mjpeg",
  jpeg: "mjpeg",
  webp: "libwebp",
};

// Reporting every produced frame would blow the tool-result budget; the count stays exact.
const MAX_REPORTED_FRAMES = 50;
const COVER_TIME_SECONDS = 0.5;

const TIME = z.union([z.number().nonnegative(), z.string().min(1)]);

type Args = {
  input: string;
  mode?: "cover" | "at" | "count" | "every";
  time?: number | string;
  count?: number;
  intervalSeconds?: number;
  output?: string;
  outputDir?: string;
  prefix?: string;
  size?: string;
  format?: "png" | "jpg" | "webp";
  quality?: number;
  overwrite?: boolean;
};

type Probed = { ok: true; info: MediaInfo } | { ok: false; message: string };

async function probeInput(input: string): Promise<Probed> {
  const gate = requireBinary("ffprobe");
  if (!gate.ok) return { ok: false, message: "ffprobe 不可用" };
  const probed = await probeMedia(input);
  if (!probed.ok) return { ok: false, message: probed.error };
  return { ok: true, info: probed.info };
}

function singleFrameArgs(
  input: Args,
  seekSeconds: number,
  codec: string,
  output: string,
): string[] {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
  ];
  // A still image has no timeline: seeking into it produces an empty file.
  if (seekSeconds > 0) args.push("-ss", seekSeconds.toFixed(3));
  args.push("-i", input.input, "-frames:v", "1", "-c:v", codec);
  args.push(...imageQualityArgs(codec, input.quality));
  if (input.size) args.push("-vf", `scale=${input.size}`);
  args.push(output);
  return args;
}

function batchFrameArgs(
  input: Args,
  intervalSeconds: number,
  codec: string,
  pattern: string,
): string[] {
  const filters = [`fps=1/${intervalSeconds.toFixed(4)}`];
  if (input.size) filters.push(`scale=${input.size}`);
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    input.input,
    "-vf",
    filters.join(","),
    "-c:v",
    codec,
  ];
  args.push(...imageQualityArgs(codec, input.quality));
  args.push(pattern);
  return args;
}

function collectFrames(
  directory: string,
  prefix: string,
  extension: string,
): { paths: string[]; total: number } {
  const separator = `${prefix}_`;
  const suffix = `.${extension}`;
  const names = readdirSync(directory).filter(
    (name) => name.startsWith(separator) && name.toLowerCase().endsWith(suffix),
  );
  names.sort();
  return {
    total: names.length,
    paths: names.map((name) => path.join(directory, name)),
  };
}

async function handleSingleFrame(
  input: Args,
  mode: "cover" | "at",
  codec: string,
): Promise<ToolResponse> {
  const probed = await probeInput(input.input);
  const info = probed.ok ? probed.info : null;
  const isImage = info?.kind === "image";
  const duration = info?.durationSeconds ?? null;

  let seekSeconds: number;
  if (mode === "at") {
    if (input.time === undefined) {
      return failure("missing-time", "at 模式需要 time 指定取帧时间");
    }
    const parsed = parseTimeToSeconds(input.time);
    if (parsed === null) {
      return failure("invalid-time", `time 不是可识别的时间：${String(input.time)}`);
    }
    if (isImage && parsed > 0) {
      return failure(
        "image-has-no-timeline",
        `${input.input} 是单张图片，没有时间轴；请用 cover 模式取帧`,
      );
    }
    seekSeconds = parsed;
  } else {
    // A cover frame past the end of a very short clip, or anywhere inside a still
    // image, would produce an empty file, so the real probe decides whether to seek.
    seekSeconds = COVER_TIME_SECONDS;
    if (isImage || (duration !== null && duration < COVER_TIME_SECONDS)) {
      seekSeconds = 0;
    }
  }

  const args = singleFrameArgs(input, seekSeconds, codec, input.output as string);
  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "frames",
    mode,
    seekSeconds,
    input: input.input,
    inputBytes: totalInputBytes([input.input]),
    outputs: describeOutputs([input.output as string]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function handleBatchFrames(
  input: Args,
  mode: "count" | "every",
  codec: string,
): Promise<ToolResponse> {
  if (!input.outputDir) {
    return failure("missing-output-dir", `${mode} 模式需要 outputDir 指定批量输出目录`);
  }
  if (!path.isAbsolute(input.outputDir)) {
    return failure("invalid-output-dir", `outputDir 必须是绝对路径：${input.outputDir}`);
  }
  if (!isDirectory(input.outputDir)) {
    return failure("output-dir-missing", `输出目录不存在：${input.outputDir}`);
  }

  let intervalSeconds: number;
  if (mode === "every") {
    const interval = input.intervalSeconds;
    if (interval === undefined || !Number.isFinite(interval) || interval <= 0) {
      return failure("missing-interval", "every 模式需要正的 intervalSeconds");
    }
    intervalSeconds = interval;
  } else {
    if (input.count === undefined) {
      return failure("missing-count", "count 模式需要 count 指定帧数");
    }
    const probed = await probeInput(input.input);
    if (!probed.ok) return failure("probe-failed", probed.message);
    const duration = probed.info.durationSeconds;
    if (duration === null || duration <= 0) {
      return failure(
        "duration-unresolved",
        "无法读取输入时长，count 模式不可用；请改用 every + intervalSeconds",
      );
    }
    intervalSeconds = duration / input.count;
  }

  const baseName = path.basename(input.input).replace(/\.[^.]+$/, "");
  const prefix = (input.prefix ?? `${baseName}_frame`).replace(/[\\/:*?"<>|]/g, "_");
  const pattern = path.join(input.outputDir, `${prefix}_%04d.${extensionFor(codec)}`);

  const args = batchFrameArgs(input, intervalSeconds, codec, pattern);
  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  const extension = extensionFor(codec);
  const frames = collectFrames(input.outputDir, prefix, extension);
  const reported = frames.paths.slice(0, MAX_REPORTED_FRAMES);
  const payload: Record<string, unknown> = {
    ok: true,
    operation: "frames",
    mode,
    intervalSeconds: Number(intervalSeconds.toFixed(4)),
    input: input.input,
    frameCount: frames.total,
    outputs: describeOutputs(reported),
    outputDir: input.outputDir,
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  if (frames.total > reported.length) {
    payload.reportedFrames = reported.length;
  }
  return respond(payload);
}

function extensionFor(codec: string): string {
  return codec === "mjpeg" ? "jpg" : codec === "libwebp" ? "webp" : codec;
}

async function handle(input: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return failure("invalid-input", inputIssue);

  const mode = input.mode ?? "cover";
  const extension = input.format ?? (mode === "cover" || mode === "at" ? "jpg" : "png");
  const codec = IMAGE_CODECS[extension];
  if (!codec) return failure("unsupported-format", `不支持的图片格式：${extension}`);

  if (mode === "cover" || mode === "at") {
    if (!input.output) {
      return failure("missing-output", `${mode} 模式需要 output 指定单帧输出文件`);
    }
    const outputIssue = outputProblem(input.output, input.overwrite === true);
    if (outputIssue) return failure("invalid-output", outputIssue);
    return handleSingleFrame(input, mode, codec);
  }

  return handleBatchFrames(input, mode, codec);
}

export function registerMediaFrames(server: McpServer): void {
  server.registerTool(
    "media_frames",
    {
      title: "Frames and cover",
      description:
        "Grab still frames: cover (default, frame at 0.5s for video and the first frame for still images or very short clips) and at (one frame at a given time) write a single output file; count (N evenly spaced frames) and every (one frame per interval) write into an existing output directory using an ffmpeg image sequence.",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        mode: z.enum(["cover", "at", "count", "every"]).optional(),
        time: TIME.optional().describe("at mode only"),
        count: z.number().int().min(1).max(240).optional().describe("count mode frame count"),
        intervalSeconds: z.number().positive().optional().describe("every mode interval"),
        output: z.string().optional().describe("Single-frame output file (cover / at)"),
        outputDir: z.string().optional().describe("Existing absolute directory (count / every)"),
        prefix: z.string().optional().describe("File name prefix for batch modes"),
        size: z.string().optional().describe("ffmpeg scale expression, e.g. 640:-2"),
        format: z.enum(["png", "jpg", "webp"]).optional().describe("Default jpg for single frames, png for batches"),
        quality: z.number().int().min(0).max(100).optional(),
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
