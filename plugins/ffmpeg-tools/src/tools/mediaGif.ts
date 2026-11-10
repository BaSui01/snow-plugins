import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { containerOf, evenDimension } from "../ffmpeg/formats";
import { parseTimeToSeconds, toFfmpegSeconds } from "../ffmpeg/time";
import {
  describeOutputs,
  failure,
  inputProblem,
  isFile,
  outputProblem,
  respond,
  runFfmpeg,
  TIME_ARGUMENT,
  totalInputBytes,
  type ToolResponse,
} from "./shared";

const DITHER_MODES = ["sierra2_4a", "bayer", "floyd_steinberg", "none"] as const;

const DEFAULT_FPS = 12;
const DEFAULT_WIDTH = 480;
const DEFAULT_LOOP = 0;
const DEFAULT_MAX_COLORS = 256;
const DEFAULT_DITHER = "sierra2_4a";
// libwebp's own default quality (`ffmpeg -h encoder=libwebp`: Quality (0..100), default 75).
const WEBP_QUALITY = 75;

type Args = {
  input: string;
  output: string;
  overwrite?: boolean;
  fps?: number;
  width?: number;
  start?: number | string;
  duration?: number | string;
  loop?: number;
  maxColors?: number;
  dither?: (typeof DITHER_MODES)[number];
};

type Plan = {
  /** Identical -ss/-t for both palette passes, so the palette matches the frames. */
  trim: string[];
  scale: string;
  fps: number;
  width: number;
  loop: number;
  maxColors: number;
  dither: string;
  startSeconds: number | null;
  durationSeconds: number | null;
};

function trimArgs(startSeconds: number | null, durationSeconds: number | null): string[] {
  const args: string[] = [];
  if (startSeconds !== null && startSeconds > 0) args.push("-ss", toFfmpegSeconds(startSeconds));
  if (durationSeconds !== null && durationSeconds > 0) args.push("-t", toFfmpegSeconds(durationSeconds));
  return args;
}

function payloadOf(output: string, plan: Plan): Record<string, unknown> {
  return {
    fps: plan.fps,
    width: plan.width,
    loop: plan.loop,
    startSeconds: plan.startSeconds,
    durationSeconds: plan.durationSeconds,
    filter: plan.scale,
    outputs: describeOutputs([output]),
  };
}

async function exportGif(args: Args, plan: Plan): Promise<ToolResponse> {
  const palettePath = path.join(os.tmpdir(), `snow-ffmpeg-palette-${randomUUID()}.png`);
  const paletteArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    // The palette is this call's own unique temp file, so it is always replaced.
    "-y",
    ...plan.trim,
    "-i",
    args.input,
    "-vf",
    `${plan.scale},palettegen=max_colors=${plan.maxColors}`,
    "-frames:v",
    "1",
    "-update",
    "1",
    palettePath,
  ];
  const encodeArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    args.overwrite === true ? "-y" : "-n",
    ...plan.trim,
    "-i",
    args.input,
    "-i",
    palettePath,
    "-lavfi",
    `${plan.scale}[x];[x][1:v]paletteuse=dither=${plan.dither}`,
    "-loop",
    String(plan.loop),
    args.output,
  ];

  let elapsedMs = 0;
  let stderrTail = "";
  try {
    const palette = await runFfmpeg(paletteArgs);
    if (!palette.ok) return palette.response;
    const encoded = await runFfmpeg(encodeArgs);
    if (!encoded.ok) return encoded.response;
    elapsedMs = palette.elapsedMs + encoded.elapsedMs;
    stderrTail = encoded.stderrTail;
  } finally {
    rmSync(palettePath, { force: true });
  }

  return respond({
    ok: true,
    operation: "gif",
    input: args.input,
    passes: 2,
    maxColors: plan.maxColors,
    dither: plan.dither,
    ...payloadOf(args.output, plan),
    inputBytes: totalInputBytes([args.input]),
    paletteRemoved: !isFile(palettePath),
    elapsedMs,
    stderrTail,
  });
}

async function exportWebp(args: Args, plan: Plan): Promise<ToolResponse> {
  const encodeArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    args.overwrite === true ? "-y" : "-n",
    ...plan.trim,
    "-i",
    args.input,
    "-vf",
    plan.scale,
    "-c:v",
    "libwebp",
    "-loop",
    String(plan.loop),
    "-q:v",
    String(WEBP_QUALITY),
    args.output,
  ];

  const run = await runFfmpeg(encodeArgs);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "webp",
    input: args.input,
    passes: 1,
    quality: WEBP_QUALITY,
    ...payloadOf(args.output, plan),
    inputBytes: totalInputBytes([args.input]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function handle(args: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(args.input);
  if (inputIssue) return failure("invalid-input", inputIssue);

  const outputIssue = outputProblem(args.output, args.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const container = containerOf(args.output);
  if (container !== "gif" && container !== "webp") {
    return failure("unsupported-format", `只支持 .gif 或 .webp 输出：${args.output}`);
  }

  let startSeconds: number | null = null;
  if (args.start !== undefined) {
    startSeconds = parseTimeToSeconds(args.start);
    if (startSeconds === null) {
      return failure("invalid-start", `start 不是可识别的时间：${String(args.start)}`);
    }
  }

  let durationSeconds: number | null = null;
  if (args.duration !== undefined) {
    durationSeconds = parseTimeToSeconds(args.duration);
    if (durationSeconds === null || durationSeconds <= 0) {
      return failure("invalid-duration", `duration 需为正数秒或 HH:MM:SS：${String(args.duration)}`);
    }
  }

  const fps = args.fps ?? DEFAULT_FPS;
  const width = evenDimension(args.width ?? DEFAULT_WIDTH);
  const plan: Plan = {
    trim: trimArgs(startSeconds, durationSeconds),
    // GIF and WebP both keep odd dimensions, but the palette pipeline runs 4:2:0,
    // so the height is forced even (-2) and cannot break on odd sources.
    scale: `fps=${fps},scale=${width}:-2:flags=lanczos`,
    fps,
    width,
    loop: args.loop ?? DEFAULT_LOOP,
    maxColors: args.maxColors ?? DEFAULT_MAX_COLORS,
    dither: args.dither ?? DEFAULT_DITHER,
    startSeconds,
    durationSeconds,
  };

  return container === "webp" ? exportWebp(args, plan) : exportGif(args, plan);
}

export function registerMediaGif(server: McpServer): void {
  server.registerTool(
    "media_gif",
    {
      title: "GIF and animated WebP",
      description:
        "Export an animated GIF or WebP. A .gif target is encoded in two passes: palettegen writes a temporary palette PNG into the system temp directory and paletteuse dithers the frames with it, so the result does not degrade like a single-pass GIF; a .webp target is encoded in one pass with libwebp. fps (default 12), width (default 480, forced even), start/duration trimming, loop (0 = forever) and maxColors/dither are honoured, and the palette file is always removed afterwards.",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        output: z.string().min(1).describe("Absolute .gif or .webp path"),
        overwrite: z.boolean().optional(),
        fps: z.number().min(0.1).max(50).optional().describe("Frame rate, default 12"),
        width: z.number().int().min(16).max(1920).optional().describe("Output width in pixels, default 480"),
        start: TIME_ARGUMENT.optional().describe("Trim start, seconds or HH:MM:SS"),
        duration: TIME_ARGUMENT.optional().describe("Trim length, seconds or HH:MM:SS"),
        loop: z.number().int().min(0).max(65535).optional().describe("Loop count, 0 = forever"),
        maxColors: z
          .number()
          .int()
          .min(2)
          .max(256)
          .optional()
          .describe("GIF palette size, default 256"),
        dither: z.enum(DITHER_MODES).optional().describe("GIF dithering, default sierra2_4a"),
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
