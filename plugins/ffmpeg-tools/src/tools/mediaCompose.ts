import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { hasEncoder } from "../ffmpeg/capabilities";
import { containerOf, evenDimension, supportsFastStart, VIDEO_PRESET_VALUES } from "../ffmpeg/formats";
import {
  hardwareEncodeArgs,
  hardwareEncoder,
  HARDWARE_VENDORS,
  type HardwareVendor,
} from "../ffmpeg/hardware";
import { mapLimit } from "../ffmpeg/parallel";
import { isStillImage, probeMedia, type MediaInfo } from "../ffmpeg/probe";
import {
  buildSlideshow,
  DEFAULT_EFFECT_STRENGTH,
  DEFAULT_IMAGE_SECONDS,
  SLIDE_EFFECT_VALUES,
  SLIDE_FIT_VALUES,
  type SlideEffect,
  type SlideFit,
} from "../ffmpeg/slideshow";
import { parseTimeToSeconds } from "../ffmpeg/time";
import {
  describeOutputs,
  failure,
  inputProblem,
  outputProblem,
  respond,
  requireBinary,
  runFfmpeg,
  TIME_ARGUMENT,
  type ToolResponse,
} from "./shared";

const OPERATIONS = ["concat", "images_to_video", "replace_audio"] as const;
const DEFAULT_IMAGE_SEQUENCE_FPS = 30;

type Args = {
  operation: (typeof OPERATIONS)[number];
  inputs?: string[];
  video?: string;
  audio?: string;
  output: string;
  fps?: number;
  size?: string;
  mode?: "copy" | "reencode";
  totalDuration?: number | string;
  imageDuration?: number | string;
  effect?: SlideEffect;
  effectStrength?: number;
  fit?: SlideFit;
  hardware?: HardwareVendor;
  preset?: (typeof VIDEO_PRESET_VALUES)[number];
  overwrite?: boolean;
};

function parseSize(value: string): { width: number; height: number } | null {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(value.trim());
  if (!match) return null;
  const width = Number.parseInt(match[1] ?? "", 10);
  const height = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

// concat needs a single canvas; the explicit size wins, otherwise the first
// input's real dimensions are used and an unreadable size fails loudly.
async function resolveCanvas(
  input: Args,
  first: MediaInfo,
): Promise<{ width: number; height: number } | null> {
  if (input.size) return parseSize(input.size);
  const stream = first.streams.find((item) => item.type === "video" && item.width && item.height);
  if (!stream?.width || !stream.height) return null;
  return { width: stream.width, height: stream.height };
}

async function prepareConcatSources(
  paths: string[],
): Promise<{ ok: true; infos: MediaInfo[]; withAudio: boolean } | { ok: false; response: ToolResponse }> {
  // Probing runs in small parallel lanes: a slideshow repeats the same photos, so the
  // probe cache plus concurrency keeps big input lists from serializing.
  const probed = await mapLimit(paths, 8, async (candidate) => {
    const issue = inputProblem(candidate);
    if (issue) return { ok: false as const, response: failure("invalid-input", issue) };
    const result = await probeMedia(candidate);
    if (!result.ok) {
      return {
        ok: false as const,
        response: failure(result.code, `读取 ${candidate} 失败：${result.error}`),
      };
    }
    if (!result.info.hasVideo) {
      return {
        ok: false as const,
        response: failure("missing-video-stream", `${candidate} 没有视频流，无法拼接`),
      };
    }
    return { ok: true as const, info: result.info };
  });
  const broken = probed.find((item) => !item.ok);
  if (broken && !broken.ok) return { ok: false, response: broken.response };
  const infos = probed.map((item) => (item as { ok: true; info: MediaInfo }).info);
  const audioCount = infos.filter((info) => info.hasAudio).length;
  if (audioCount !== 0 && audioCount !== infos.length) {
    return {
      ok: false,
      response: failure(
        "mixed-audio-streams",
        "部分输入含音频、部分不含，拼接会产生错位音轨；请先统一素材或改用不拼接的处理方式",
      ),
    };
  }
  return { ok: true, infos, withAudio: audioCount === infos.length };
}

async function runConcat(input: Args): Promise<ToolResponse> {
  const paths = input.inputs ?? [];
  if (paths.length < 2) return failure("missing-inputs", "concat 至少需要两个输入文件");

  const prepared = await prepareConcatSources(paths);
  if (!prepared.ok) return prepared.response;

  const canvas = await resolveCanvas(input, prepared.infos[0] as MediaInfo);
  if (!canvas) {
    return failure(
      "unresolved-canvas",
      "无法确定拼接画布尺寸；请传 size（例如 1920x1080）",
    );
  }
  const fps = input.fps ?? prepared.infos[0]?.streams.find((stream) => stream.type === "video")?.fps;
  if (!fps) {
    return failure("unresolved-fps", "无法确定拼接帧率；请传 fps");
  }

  if (input.hardware) {
    const available = await hasEncoder(hardwareEncoder(input.hardware));
    if (available === false) {
      return failure(
        "encoder-unavailable",
        `本机 ffmpeg 不支持 ${hardwareEncoder(input.hardware)}；请改用软件编码或其它 hardware 值`,
      );
    }
  }
  const chains: string[] = [];
  const labels: string[] = [];
  paths.forEach((_, index) => {
    chains.push(
      `[${index}:v]scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${index}]`,
    );
    labels.push(`[v${index}]`);
    if (prepared.withAudio) {
      chains.push(`[${index}:a]aresample=48000[a${index}]`);
      labels.push(`[a${index}]`);
    }
  });
  chains.push(
    `${labels.join("")}concat=n=${paths.length}:v=1:a=${prepared.withAudio ? 1 : 0}[v]${prepared.withAudio ? "[a]" : ""}`,
  );

  const args = ["-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n"];
  for (const candidate of paths) args.push("-i", candidate);
  args.push("-filter_complex", chains.join(";"), "-map", "[v]");
  if (prepared.withAudio) args.push("-map", "[a]");
  if (input.hardware) {
    args.push("-c:v", hardwareEncoder(input.hardware), ...hardwareEncodeArgs(input.hardware));
  } else {
    args.push("-c:v", "libx264", "-crf", "23");
    if (input.preset) args.push("-preset", input.preset);
  }
  args.push("-c:a", "aac", input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  return respond({
    ok: true,
    operation: "concat",
    inputCount: paths.length,
    withAudio: prepared.withAudio,
    canvas: `${canvas.width}x${canvas.height}`,
    fps,
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

// Slideshow mode is opt-in: a length, an audio track, a fit or a motion turns the
// still-image list into timed segments. Without any of them the legacy frame
// sequence behaviour below is preserved byte for byte.
function wantsSlideshow(input: Args): boolean {
  return (
    input.audio !== undefined ||
    input.totalDuration !== undefined ||
    input.imageDuration !== undefined ||
    input.fit !== undefined ||
    (input.effect !== undefined && input.effect !== "none")
  );
}

// The slideshow canvas falls back to the first image's real size, like concat.
function canvasFromImage(info: MediaInfo): { width: number; height: number } | null {
  const stream = info.streams.find((item) => item.type === "video" && item.width && item.height);
  if (!stream?.width || !stream.height) return null;
  return { width: evenDimension(stream.width), height: evenDimension(stream.height) };
}

async function probeSlideImages(
  paths: string[],
): Promise<{ ok: true; infos: MediaInfo[] } | { ok: false; response: ToolResponse }> {
  const probed = await mapLimit(paths, 8, async (candidate) => {
    const result = await probeMedia(candidate);
    if (!result.ok) {
      return {
        ok: false as const,
        response: failure(result.code, `读取 ${candidate} 失败：${result.error}`),
      };
    }
    if (!isStillImage(result.info)) {
      return {
        ok: false as const,
        response: failure("not-an-image", `${candidate} 不是静态图片；幻灯片模式只接受图片输入`),
      };
    }
    return { ok: true as const, info: result.info };
  });
  const broken = probed.find((item) => !item.ok);
  if (broken && !broken.ok) return { ok: false, response: broken.response };
  const infos = probed.map((item) => (item as { ok: true; info: MediaInfo }).info);
  return { ok: true, infos };
}

async function runSlideshow(input: Args, paths: string[]): Promise<ToolResponse> {
  const images = await probeSlideImages(paths);
  if (!images.ok) return images.response;

  const canvas = input.size
    ? parseSize(input.size)
    : canvasFromImage(images.infos[0] as MediaInfo);
  if (!canvas) {
    return failure("unresolved-canvas", "无法确定画布尺寸；请传 size（例如 1080x1440）");
  }
  if (canvas.width % 2 !== 0 || canvas.height % 2 !== 0) {
    return failure(
      "invalid-size",
      `size 的宽高必须是偶数（H.264 yuv420p 要求）：${String(input.size)}`,
    );
  }

  const fps = input.fps ?? DEFAULT_IMAGE_SEQUENCE_FPS;
  const effect: SlideEffect = input.effect ?? "none";
  const strength = input.effectStrength ?? DEFAULT_EFFECT_STRENGTH;
  const fit: SlideFit = input.fit ?? "cover";

  let audioPath: string | null = null;
  let audioSeconds: number | null = null;
  if (input.audio !== undefined) {
    const issue = inputProblem(input.audio);
    if (issue) return failure("invalid-input", issue);
    const probed = await probeMedia(input.audio);
    if (!probed.ok) return failure(probed.code, `读取 ${input.audio} 失败：${probed.error}`);
    if (!probed.info.hasAudio) {
      return failure("missing-audio-stream", `${input.audio} 没有音频流`);
    }
    if (!probed.info.durationSeconds || probed.info.durationSeconds <= 0) {
      return failure(
        "unreadable-audio-length",
        `读不到 ${input.audio} 的时长；请显式传 totalDuration`,
      );
    }
    audioPath = input.audio;
    audioSeconds = probed.info.durationSeconds;
  }

  // Explicit lengths win over implicit ones: totalDuration, then
  // imageDuration x images, then the audio length, then the default per image.
  let totalSeconds: number;
  if (input.totalDuration !== undefined) {
    const parsed = parseTimeToSeconds(input.totalDuration);
    if (parsed === null || parsed <= 0) {
      return failure(
        "invalid-time",
        `totalDuration 不是可识别的时间：${String(input.totalDuration)}`,
      );
    }
    totalSeconds = parsed;
  } else if (input.imageDuration !== undefined) {
    const parsed = parseTimeToSeconds(input.imageDuration);
    if (parsed === null || parsed <= 0) {
      return failure(
        "invalid-time",
        `imageDuration 不是可识别的时间：${String(input.imageDuration)}`,
      );
    }
    totalSeconds = parsed * paths.length;
  } else if (audioSeconds !== null) {
    totalSeconds = audioSeconds;
  } else {
    totalSeconds = DEFAULT_IMAGE_SECONDS * paths.length;
  }

  const totalFrames = Math.round(totalSeconds * fps);
  const built = buildSlideshow({
    paths,
    width: canvas.width,
    height: canvas.height,
    fps,
    totalFrames,
    effect,
    strength,
    fit,
  });
  if (!built.ok) return failure("duration-too-short", built.message);
  const plan = built.plan;

  const args = ["-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n"];
  for (const candidate of paths) args.push("-i", candidate);
  if (audioPath) args.push("-i", audioPath);
  args.push("-filter_complex", plan.filterComplex, "-map", plan.videoLabel);
  if (audioPath) args.push("-map", `${paths.length}:a:0`);
  if (input.hardware) {
    args.push("-c:v", hardwareEncoder(input.hardware), ...hardwareEncodeArgs(input.hardware), "-r", String(fps));
  } else {
    args.push("-c:v", "libx264", "-crf", "20");
    if (input.preset) args.push("-preset", input.preset);
    args.push("-r", String(fps));
  }
  if (audioPath) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  if (supportsFastStart(containerOf(input.output))) args.push("-movflags", "+faststart");
  args.push(input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "images_to_video",
    mode: "slideshow",
    imageCount: paths.length,
    canvas: `${canvas.width}x${canvas.height}`,
    fps,
    fit,
    effect,
    effectStrength: strength,
    videoEncoder: input.hardware ? hardwareEncoder(input.hardware) : "libx264",
    totalSeconds: Number(totalSeconds.toFixed(3)),
    secondsPerImage: Number((totalSeconds / paths.length).toFixed(3)),
    ...(audioPath && audioSeconds !== null
      ? { audio: audioPath, audioSeconds: Number(audioSeconds.toFixed(3)) }
      : {}),
    segments: plan.segments.map((segment) => ({
      path: segment.path,
      seconds: Number(segment.seconds.toFixed(3)),
      frames: segment.frames,
      motion: segment.motion,
      tiltDegrees: segment.tiltDegrees,
    })),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function runImagesToVideo(input: Args): Promise<ToolResponse> {
  const paths = input.inputs ?? [];
  if (!paths.length) return failure("missing-inputs", "images_to_video 需要至少一张图片");
  for (const candidate of paths) {
    const issue = inputProblem(candidate);
    if (issue) return failure("invalid-input", issue);
  }
  if (input.hardware) {
    const available = await hasEncoder(hardwareEncoder(input.hardware));
    if (available === false) {
      return failure(
        "encoder-unavailable",
        `本机 ffmpeg 不支持 ${hardwareEncoder(input.hardware)}；请改用软件编码或其它 hardware 值`,
      );
    }
  }
  if (wantsSlideshow(input)) return runSlideshow(input, paths);
  const encoderArgs = input.hardware
    ? ["-c:v", hardwareEncoder(input.hardware), ...hardwareEncodeArgs(input.hardware)]
    : ["-c:v", "libx264", "-crf", "20", ...(input.preset ? ["-preset", input.preset] : [])];

  const fps = input.fps ?? DEFAULT_IMAGE_SEQUENCE_FPS;
  const frameDuration = 1 / fps;
  const listPath = path.join(
    tmpdir(),
    `ffmpeg-tools-${process.pid}-${Date.now().toString(36)}.txt`,
  );
  const lines: string[] = [];
  for (const candidate of paths) {
    lines.push(`file '${candidate.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${frameDuration.toFixed(6)}`);
  }
  // The concat demuxer ignores the last duration unless the file repeats.
  lines.push(`file '${(paths[paths.length - 1] as string).replace(/'/g, "'\\''")}'`);

  const filters = [`fps=${fps}`];
  if (input.size) {
    const canvas = parseSize(input.size);
    if (!canvas) return failure("invalid-size", `size 必须形如 1920x1080：${input.size}`);
    filters.push(
      `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease`,
      `pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2`,
      "setsar=1",
    );
  }
  filters.push("format=yuv420p");

  try {
    writeFileSync(listPath, lines.join("\n"), "utf8");
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      input.overwrite === true ? "-y" : "-n",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-vf",
      filters.join(","),
      ...encoderArgs,
      "-r",
      String(fps),
      input.output,
    ];
    const run = await runFfmpeg(args);
    if (!run.ok) return run.response;
    return respond({
      ok: true,
      operation: "images_to_video",
      mode: "sequence",
      imageCount: paths.length,
      fps,
      outputs: describeOutputs([input.output]),
      elapsedMs: run.elapsedMs,
      stderrTail: run.stderrTail,
    });
  } finally {
    try {
      unlinkSync(listPath);
    } catch {
      // The temporary list is best-effort cleanup; the call result stays authoritative.
    }
  }
}

async function runReplaceAudio(input: Args): Promise<ToolResponse> {
  if (!input.video || !input.audio) {
    return failure("missing-inputs", "replace_audio 需要 video 与 audio 两个输入");
  }
  for (const candidate of [input.video, input.audio]) {
    const issue = inputProblem(candidate);
    if (issue) return failure("invalid-input", issue);
  }
  const gate = requireBinary("ffprobe");
  if (!gate.ok) return gate.response;
  const videoProbe = await probeMedia(input.video);
  if (!videoProbe.ok) return failure(videoProbe.code, videoProbe.error);
  if (!videoProbe.info.hasVideo) {
    return failure("missing-video-stream", `${input.video} 没有视频流`);
  }
  const audioProbe = await probeMedia(input.audio);
  if (!audioProbe.ok) return failure(audioProbe.code, audioProbe.error);
  if (!audioProbe.info.hasAudio) {
    return failure("missing-audio-stream", `${input.audio} 没有音频流`);
  }

  const copyVideo = (input.mode ?? "copy") === "copy";
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    input.video,
    "-i",
    input.audio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    copyVideo ? "copy" : "libx264",
  ];
  if (!copyVideo) args.push("-crf", "23");
  args.push("-c:a", "aac", "-shortest", input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  return respond({
    ok: true,
    operation: "replace_audio",
    videoCodec: copyVideo ? "copy" : "libx264",
    video: input.video,
    audio: input.audio,
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

// Slideshow-only switches are rejected on the other operations instead of being
// silently ignored.
function unusedSlideshowArguments(input: Args): string[] {
  if (input.operation === "images_to_video") return [];
  const candidates: [string, unknown][] = [
    ["imageDuration", input.imageDuration],
    ["totalDuration", input.totalDuration],
    ["effect", input.effect],
    ["effectStrength", input.effectStrength],
    ["fit", input.fit],
    ["hardware", input.operation === "concat" ? undefined : input.hardware],
  ];
  return candidates.filter(([, value]) => value !== undefined).map(([name]) => name);
}

async function handle(input: Args): Promise<ToolResponse> {
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const unused = unusedSlideshowArguments(input);
  if (unused.length) {
    return failure(
      "unused-arguments",
      `${unused.join(" / ")} 只用于 images_to_video，当前 operation 是 ${input.operation}`,
    );
  }

  switch (input.operation) {
    case "concat":
      return runConcat(input);
    case "images_to_video":
      return runImagesToVideo(input);
    case "replace_audio":
      return runReplaceAudio(input);
  }
}

export function registerMediaCompose(server: McpServer): void {
  server.registerTool(
    "media_compose",
    {
      title: "Concat and compose",
      description:
        "Combine media: concat joins two or more videos onto one canvas (real per-input probing; mixed audio presence is refused instead of producing a broken track), images_to_video turns still images into a video — a one-frame-per-image sequence by default, or a timed slideshow with zoom/pan/tilt motion and an optional audio track as soon as a length, audio, fit or effect is given — and replace_audio swaps a video's audio track. Nothing is overwritten unless overwrite is true.",
      inputSchema: {
        operation: z.enum(OPERATIONS),
        inputs: z.array(z.string().min(1)).min(1).optional().describe("Ordered absolute paths for concat / images_to_video"),
        video: z.string().optional().describe("replace_audio video input"),
        audio: z.string().optional().describe("replace_audio audio input; images_to_video slideshow background audio"),
        output: z.string().min(1).describe("Absolute output path; its directory must exist"),
        fps: z.number().positive().max(240).optional().describe("concat / images_to_video; images default 30"),
        size: z.string().optional().describe("Canvas as WIDTHxHEIGHT (even numbers), e.g. 1080x1440"),
        mode: z.enum(["copy", "reencode"]).optional().describe("replace_audio video handling; default copy"),
        totalDuration: TIME_ARGUMENT.optional().describe(
          "Slideshow total length (seconds or HH:MM:SS(.mmm)); outranks imageDuration and the audio length",
        ),
        imageDuration: TIME_ARGUMENT.optional().describe(
          "Slideshow seconds per image; the audio length is used when neither this nor totalDuration is given",
        ),
        effect: z.enum(SLIDE_EFFECT_VALUES).optional().describe(
          "Slideshow motion: auto (zoom in/out plus a slow tilt), zoom-in, zoom-out, none; default none",
        ),
        effectStrength: z.number().min(0.02).max(0.6).optional().describe(
          "Zoom amount and tilt amplitude (0.15 = 15% zoom); default 0.15",
        ),
        fit: z.enum(SLIDE_FIT_VALUES).optional().describe(
          "Slideshow framing: cover (default, fills the canvas) or contain (whole image on a blurred background)",
        ),
        hardware: z.enum(HARDWARE_VENDORS).optional().describe(
          "Encode with this GPU encoder (media_env_check lists what this machine has); the filter chain still runs on the CPU",
        ),
        preset: z.enum(VIDEO_PRESET_VALUES).optional().describe(
          "libx264/libx265 preset for software encoding; a faster preset shortens long renders at the same CRF",
        ),
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
