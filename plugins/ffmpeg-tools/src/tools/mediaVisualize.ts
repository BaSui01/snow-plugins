import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { containerOf } from "../ffmpeg/formats";
import { probeMedia } from "../ffmpeg/probe";
import {
  describeOutputs,
  failure,
  inputProblem,
  outputProblem,
  respond,
  runFfmpeg,
  totalInputBytes,
  type Payload,
  type ToolResponse,
} from "./shared";

// The image encoder follows the output extension, exactly like the frames tool.
const IMAGE_CODECS: Record<string, string> = {
  png: "png",
  jpg: "mjpeg",
  jpeg: "mjpeg",
  webp: "libwebp",
};

const OPERATIONS = [
  "waveform",
  "spectrogram",
  "vectorscope",
  "contact_sheet",
  "representative_frame",
] as const;

type Operation = (typeof OPERATIONS)[number];

const DEFAULT_WAVE_SIZE = "1920x480";
const DEFAULT_WAVE_COLOR = "white";
const DEFAULT_SPECTRUM_SIZE = "1920x1080";
const DEFAULT_SHEET_INTERVAL_SECONDS = 10;
const DEFAULT_SHEET_COLUMNS = 4;
const DEFAULT_SHEET_ROWS = 3;
const DEFAULT_TILE_WIDTH = 320;
const DEFAULT_THUMBNAIL_BATCHES = 100;

const SIZE_PATTERN = /^\d{1,5}x\d{1,5}$/;
// A colour that cannot smuggle filter syntax (":" and "," separate filter options).
const COLOR_PATTERN = /^[A-Za-z0-9#@._]+$/;

// vectorscope has no size option: the picture keeps the input frame size.
const VECTORSCOPE_FILTER = "vectorscope=mode=color:graticule=green";

type Args = {
  input: string;
  output: string;
  operation: Operation;
  overwrite?: boolean;
  size?: string;
  color?: string;
  mode?: "combined" | "separate";
  intervalSeconds?: number;
  count?: number;
  columns?: number;
  rows?: number;
  tileWidth?: number;
  format?: "png" | "jpg";
  batches?: number;
};

type ImagePlan = {
  /** Filter expression, either the whole -filter_complex graph or the -vf value. */
  filter: string;
  /** Audio produces the picture, so the graph must be wired through -filter_complex. */
  complex: boolean;
  result: Payload;
};

function sizeProblem(size: string): string | null {
  return SIZE_PATTERN.test(size) ? null : `size 必须是 "宽x高" 形式（如 1920x480），当前收到 ${size}`;
}

/**
 * ffmpeg's fps filter emits nothing when the interval is longer than the input and the
 * pipeline then fails with an unrelated encoder message, so the interval is checked
 * against the measured duration first. Six decimals keep repeated intervals exact.
 */
function rateArgument(intervalSeconds: number): string {
  return Number((1 / intervalSeconds).toFixed(6)).toString();
}

async function runImage(args: Args, codec: string, plan: ImagePlan): Promise<ToolResponse> {
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    args.overwrite === true ? "-y" : "-n",
    "-i",
    args.input,
  ];
  if (plan.complex) {
    ffmpegArgs.push("-filter_complex", plan.filter, "-map", "[pic]");
  } else {
    ffmpegArgs.push("-vf", plan.filter);
  }
  // A single still image: -frames:v 1 plus -update 1 writes one named file instead of
  // an image sequence.
  ffmpegArgs.push("-frames:v", "1", "-update", "1", "-c:v", codec, args.output);

  const run = await runFfmpeg(ffmpegArgs);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: args.operation,
    input: args.input,
    codec,
    filter: plan.filter,
    ...plan.result,
    inputBytes: totalInputBytes([args.input]),
    outputs: describeOutputs([args.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function waveform(args: Args, codec: string): Promise<ToolResponse> {
  const size = args.size ?? DEFAULT_WAVE_SIZE;
  const issue = sizeProblem(size);
  if (issue) return failure("invalid-size", issue);
  const color = args.color ?? DEFAULT_WAVE_COLOR;
  if (!COLOR_PATTERN.test(color)) {
    return failure("invalid-color", `color 只能是颜色名或 #RRGGBB 形式，当前收到 ${color}`);
  }
  return runImage(args, codec, {
    filter: `showwavespic=s=${size}:colors=${color}[pic]`,
    complex: true,
    result: { size, color },
  });
}

async function spectrogram(args: Args, codec: string): Promise<ToolResponse> {
  const size = args.size ?? DEFAULT_SPECTRUM_SIZE;
  const issue = sizeProblem(size);
  if (issue) return failure("invalid-size", issue);
  // This build's showspectrumpic only implements combined/separate (`mode=channel` is
  // rejected with "Unable to parse "mode" option value"), so the enum stops there.
  const mode = args.mode ?? "combined";
  return runImage(args, codec, {
    filter: `showspectrumpic=s=${size}:mode=${mode}[pic]`,
    complex: true,
    result: { size, mode },
  });
}

async function vectorscope(args: Args, codec: string): Promise<ToolResponse> {
  return runImage(args, codec, {
    filter: VECTORSCOPE_FILTER,
    complex: false,
    result: {},
  });
}

async function representativeFrame(args: Args, codec: string): Promise<ToolResponse> {
  const batches = args.batches ?? DEFAULT_THUMBNAIL_BATCHES;
  return runImage(args, codec, {
    filter: `thumbnail=n=${batches}`,
    complex: false,
    result: { batches },
  });
}

async function contactSheet(args: Args, codec: string): Promise<ToolResponse> {
  if (args.intervalSeconds !== undefined && args.count !== undefined) {
    return failure("conflicting-interval", "请只提供 intervalSeconds 或 count 之一");
  }
  const columns = args.columns ?? DEFAULT_SHEET_COLUMNS;
  const rows = args.rows ?? DEFAULT_SHEET_ROWS;
  const tileWidth = args.tileWidth ?? DEFAULT_TILE_WIDTH;

  const probed = await probeMedia(args.input);
  if (!probed.ok) {
    return failure(probed.code, probed.error, probed.stderrTail ? { stderrTail: probed.stderrTail } : {});
  }
  const duration = probed.info.durationSeconds;

  let intervalSeconds: number;
  if (args.count !== undefined) {
    if (duration === null || duration <= 0) {
      return failure(
        "duration-unresolved",
        "无法读取输入时长，count 模式不可用；请改用 intervalSeconds",
      );
    }
    intervalSeconds = duration / args.count;
  } else {
    intervalSeconds = args.intervalSeconds ?? DEFAULT_SHEET_INTERVAL_SECONDS;
  }

  const samples = duration === null ? null : Math.floor(duration / intervalSeconds);
  if (samples === 0) {
    return failure(
      "duration-too-short",
      `按 intervalSeconds=${Number(intervalSeconds.toFixed(4))} 无法从 ${duration} 秒的输入中取到任何一帧；请减小 intervalSeconds 或改用 count`,
    );
  }

  const rate = rateArgument(intervalSeconds);
  return runImage(args, codec, {
    filter: `fps=${rate},scale=${tileWidth}:-2,tile=${columns}x${rows}`,
    complex: false,
    result: {
      intervalSeconds: Number(intervalSeconds.toFixed(4)),
      samples,
      columns,
      rows,
      tileWidth,
    },
  });
}

async function handle(args: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(args.input);
  if (inputIssue) return failure("invalid-input", inputIssue);

  const outputIssue = outputProblem(args.output, args.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const codec = IMAGE_CODECS[containerOf(args.output)];
  if (!codec) {
    return failure("unsupported-format", `不支持的图片格式：${args.output}（支持 png / jpg / jpeg / webp）`);
  }
  // `format` never overrides the encoder: a mismatch would silently produce another
  // container than the caller declared, so it is rejected instead.
  if (args.format !== undefined) {
    const declared = IMAGE_CODECS[args.format];
    if (declared !== codec) {
      return failure(
        "format-mismatch",
        `format 与 output 扩展名不一致：format=${args.format}，output=${args.output}`,
      );
    }
  }

  switch (args.operation) {
    case "waveform":
      return waveform(args, codec);
    case "spectrogram":
      return spectrogram(args, codec);
    case "vectorscope":
      return vectorscope(args, codec);
    case "contact_sheet":
      return contactSheet(args, codec);
    case "representative_frame":
      return representativeFrame(args, codec);
  }
}

export function registerMediaVisualize(server: McpServer): void {
  server.registerTool(
    "media_visualize",
    {
      title: "Visualize media",
      description:
        "Turn a media file into one still picture: waveform (showwavespic) and spectrogram (showspectrumpic, combined or separate channels) read the audio, vectorscope (keeps the input size, no size option exists) and representative_frame (thumbnail, the most representative frame of a batch) read the video, and contact_sheet samples one frame every intervalSeconds (or exactly count frames) into a columns x rows grid. The encoder follows the output extension (png / jpg / jpeg / webp).",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        output: z.string().min(1).describe("Absolute image path, extension picks the encoder"),
        operation: z.enum(OPERATIONS).describe("Which picture to render"),
        overwrite: z.boolean().optional(),
        size: z.string().optional().describe('"WxH", waveform default 1920x480, spectrogram default 1920x1080'),
        color: z.string().optional().describe("Waveform colour, default white"),
        mode: z
          .enum(["combined", "separate"])
          .optional()
          .describe("Spectrogram channel mode, default combined; this ffmpeg build has no channel mode"),
        intervalSeconds: z
          .number()
          .positive()
          .max(3600)
          .optional()
          .describe("contact_sheet seconds between sampled frames, default 10"),
        count: z
          .number()
          .int()
          .min(1)
          .max(240)
          .optional()
          .describe("contact_sheet sample count; the interval becomes duration / count"),
        columns: z.number().int().min(1).max(12).optional().describe("contact_sheet grid columns, default 4"),
        rows: z.number().int().min(1).max(12).optional().describe("contact_sheet grid rows, default 3"),
        tileWidth: z.number().int().min(16).max(1920).optional().describe("contact_sheet cell width, default 320"),
        format: z
          .enum(["png", "jpg"])
          .optional()
          .describe("contact_sheet image format; must match the output extension"),
        batches: z
          .number()
          .int()
          .min(2)
          .max(5000)
          .optional()
          .describe("representative_frame batch size, default 100"),
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
