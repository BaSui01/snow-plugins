import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { hasEncoder } from "../ffmpeg/capabilities";
import { hardwareEncodeArgs } from "../ffmpeg/hardware";
import {
  containerOf,
  defaultAudioCodec,
  defaultVideoCodec,
  HARDWARE_VALUES,
  hardwareEncoder,
  imageQualityArgs,
  inferTarget,
  supportsFastStart,
  VIDEO_PRESET_VALUES,
} from "../ffmpeg/formats";
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

const IMAGE_CODECS: Record<string, string> = {
  png: "png",
  jpg: "mjpeg",
  jpeg: "mjpeg",
  webp: "libwebp",
  bmp: "bmp",
  tiff: "tiff",
  tif: "tiff",
  avif: "libaom-av1",
};

type Args = {
  input: string;
  output: string;
  target?: "video" | "audio" | "image";
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  preset?: (typeof VIDEO_PRESET_VALUES)[number];
  scale?: string;
  fps?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  maxrate?: string;
  bufsize?: string;
  twoPass?: boolean;
  videoFilters?: string[];
  audioFilters?: string[];
  quality?: number;
  hardware?: (typeof HARDWARE_VALUES)[number];
  overwrite?: boolean;
};

function sanitizeFilters(
  values: string[] | undefined,
  field: string,
): { ok: true; filters: string[] } | { ok: false; message: string } {
  if (!values) return { ok: true, filters: [] };
  const filters: string[] = [];
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string" || value.trim() === "") {
      return { ok: false, message: `${field}[${index}] 不能为空` };
    }
    if (/[\u0000\r\n]/.test(value)) {
      return { ok: false, message: `${field}[${index}] 含非法字符` };
    }
    filters.push(value.trim());
  }
  return { ok: true, filters };
}

function removeIfPresent(target: string): void {
  try {
    unlinkSync(target);
  } catch {
    // Best-effort cleanup of the two-pass statistics; the call result stays authoritative.
  }
}

async function handle(input: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return failure("invalid-input", inputIssue);
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const target = input.target ?? inferTarget(input.output);
  if (!target) {
    return failure(
      "unknown-target",
      "无法从输出扩展名判断目标类型，请显式传 target（video / audio / image）",
    );
  }

  const videoFilters = sanitizeFilters(input.videoFilters, "videoFilters");
  if (!videoFilters.ok) return failure("invalid-filter", videoFilters.message);
  const audioFilters = sanitizeFilters(input.audioFilters, "audioFilters");
  if (!audioFilters.ok) return failure("invalid-filter", audioFilters.message);

  if (input.twoPass === true) {
    if (target !== "video") {
      return failure("two-pass-needs-video", "twoPass 只适用于 video 目标");
    }
    if (!input.videoBitrate) {
      return failure(
        "two-pass-needs-bitrate",
        "twoPass 需要同时给出 videoBitrate（两遍编码按目标码率工作）",
      );
    }
  }

  const container = containerOf(input.output);
  // -vf/-af are single arguments, so every filter of a chain is joined here.
  const filterChain: string[] = [];
  if (input.scale) filterChain.push(`scale=${input.scale}`);
  filterChain.push(...videoFilters.filters);

  const steps: string[] = [];
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    input.input,
  ];

  if (target === "video") {
    const videoCodec = input.hardware
      ? hardwareEncoder(input.hardware)
      : input.videoCodec ?? defaultVideoCodec(container);
    if (input.hardware) {
      const available = await hasEncoder(videoCodec);
      if (available === false) {
        return failure(
          "encoder-unavailable",
          `本机 ffmpeg 不支持 ${videoCodec}（requested hardware: ${input.hardware}）；请改用软件编码或其它可用编码器`,
        );
      }
    }
    args.push("-c:v", videoCodec);
    if (input.hardware) {
      // Vendor quality switches keep a hardware encode near the software default
      // instead of the encoder's own unpredictable bitrate default.
      args.push(...hardwareEncodeArgs(input.hardware, input.videoBitrate));
    } else {
      if (input.crf !== undefined) args.push("-crf", String(input.crf));
      if (input.preset && (videoCodec === "libx264" || videoCodec === "libx265")) {
        args.push("-preset", input.preset);
      }
      if (input.videoBitrate) args.push("-b:v", input.videoBitrate);
    }
    if (input.maxrate) args.push("-maxrate", input.maxrate);
    if (input.bufsize) args.push("-bufsize", input.bufsize);
    if (input.fps !== undefined) args.push("-r", String(input.fps));
    args.push("-c:a", input.audioCodec ?? defaultAudioCodec(container));
    if (input.audioBitrate) args.push("-b:a", input.audioBitrate);
    if (supportsFastStart(container)) args.push("-movflags", "+faststart");
  } else if (target === "audio") {
    args.push("-vn", "-c:a", input.audioCodec ?? defaultAudioCodec(container));
    if (input.audioBitrate) args.push("-b:a", input.audioBitrate);
  } else {
    const imageCodec = input.videoCodec ?? IMAGE_CODECS[container];
    if (!imageCodec) {
      return failure("unsupported-image-format", `不支持的图片容器：${container || "未知"}`);
    }
    args.push("-frames:v", "1", "-c:v", imageCodec);
    args.push(...imageQualityArgs(imageCodec, input.quality));
  }

  if (filterChain.length) args.push("-vf", filterChain.join(","));
  if (audioFilters.filters.length) args.push("-af", audioFilters.filters.join(","));

  if (input.twoPass === true) {
    // Real two-pass: pass one only writes statistics, pass two writes the output.
    // Verified on ffmpeg 9.0.2: `-f null -` still produces <log>-0.log and .mbtree.
    const logPath = path.join(
      tmpdir(),
      `ffmpeg-tools-pass-${process.pid}-${Date.now().toString(36)}`,
    );
    try {
      const firstPass = await runFfmpeg([
        ...args,
        "-pass",
        "1",
        "-passlogfile",
        logPath,
        "-an",
        "-f",
        "null",
        "-",
      ]);
      if (!firstPass.ok) return firstPass.response;
      steps.push(`firstPass:${firstPass.elapsedMs}`);

      const secondPass = await runFfmpeg([
        ...args,
        "-pass",
        "2",
        "-passlogfile",
        logPath,
        input.output,
      ]);
      if (!secondPass.ok) return secondPass.response;
      steps.push(`secondPass:${secondPass.elapsedMs}`);

      return respond({
        ok: true,
        operation: "transcode",
        target,
        container,
        twoPass: true,
        input: input.input,
        inputBytes: totalInputBytes([input.input]),
        outputs: describeOutputs([input.output]),
        elapsedMs: firstPass.elapsedMs + secondPass.elapsedMs,
        steps,
        stderrTail: secondPass.stderrTail,
      });
    } finally {
      removeIfPresent(`${logPath}-0.log`);
      removeIfPresent(`${logPath}-0.log.mbtree`);
      removeIfPresent(logPath);
    }
  }

  args.push(input.output);
  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "transcode",
    target,
    container,
    input: input.input,
    inputBytes: totalInputBytes([input.input]),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

export function registerMediaTranscode(server: McpServer): void {
  server.registerTool(
    "media_transcode",
    {
      title: "Transcode and compress",
      description:
        "Transcode or compress one media file with this machine's ffmpeg. Target is inferred from the output extension unless given. Video defaults to H.264 with CRF 23; audio keeps a container-appropriate codec. Accepts extra -vf/-af filter chains, rate control (bitrate, maxrate, bufsize) and real two-pass encoding. Refuses to overwrite an existing output unless overwrite is true, and never falls back to another encoder silently.",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        output: z.string().min(1).describe("Absolute output path; its directory must exist"),
        target: z.enum(["video", "audio", "image"]).optional(),
        videoCodec: z.string().optional().describe("Encoder name, e.g. libx264, libx265, libvpx-vp9, png, mjpeg"),
        audioCodec: z.string().optional().describe("Audio encoder name, e.g. aac, libmp3lame, flac"),
        crf: z.number().int().min(0).max(63).optional().describe("Software-encoder CRF quality"),
        preset: z.enum(VIDEO_PRESET_VALUES).optional(),
        scale: z.string().optional().describe("ffmpeg scale expression, e.g. 1280:-2"),
        fps: z.number().positive().max(240).optional(),
        videoBitrate: z.string().optional().describe("Target video bitrate, e.g. 2M; required by twoPass"),
        audioBitrate: z.string().optional().describe("e.g. 192k"),
        maxrate: z.string().optional().describe("Rate-cap for streaming encodes, e.g. 2.5M"),
        bufsize: z.string().optional().describe("Rate-control buffer, e.g. 5M"),
        twoPass: z.boolean().optional().describe("Real two-pass encode; needs videoBitrate"),
        videoFilters: z
          .array(z.string().min(1))
          .optional()
          .describe('Extra video filters appended after scale, e.g. ["hflip","eq=contrast=1.1"]'),
        audioFilters: z
          .array(z.string().min(1))
          .optional()
          .describe('Extra audio filters, e.g. ["loudnorm=I=-16:TP=-1.5:LRA=11"]'),
        quality: z.number().int().min(0).max(100).optional().describe("Image encoder quality"),
        hardware: z.enum(HARDWARE_VALUES).optional().describe("Request a hardware encoder; fails when unavailable"),
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
