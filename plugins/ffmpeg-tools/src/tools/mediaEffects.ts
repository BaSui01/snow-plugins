import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { containerOf, defaultAudioCodec, inferTarget } from "../ffmpeg/formats";
import { probeMedia, type MediaInfo } from "../ffmpeg/probe";
import {
  describeOutputs, escapeFilterPath, failure, fileSize, inputProblem, isFile, outputProblem,
  respond, requireBinary, runFfmpeg, runFfmpegVerbose, totalInputBytes,
  type Payload, type ToolResponse,
} from "./shared";

const EFFECTS = [
  "stabilize", "normalize_audio", "denoise", "denoise_audio", "sharpen", "deinterlace",
  "speed", "reverse", "fade", "blur", "vignette", "color", "lut3d", "colorspace",
] as const;

/** Two-pass effects run their own pipelines; everything else is one ffmpeg call. */
type SinglePassEffect = Exclude<(typeof EFFECTS)[number], "stabilize" | "normalize_audio">;

// `colorspace=all=` is the only target switch this build accepts for a real conversion
// (setting `space` alone is rejected); these are the names `-h filter=colorspace` lists.
const COLORSPACE_TARGETS = [
  "bt709", "bt2020", "bt470bg", "bt470m", "bt601-6-525", "bt601-6-625", "smpte170m", "smpte240m",
] as const;

const LUT_EXTENSIONS = new Set([".cube", ".3dl"]);
const VIDEO_CRF = "23";
const STDERR_TAIL_CHARS = 2000;
// atempo only accepts 0.5..100, so other factors are split into stages; eight stages
// cover the whole 0.1..10 range this tool allows.
const TEMPO_MAX = 2;
const TEMPO_MIN = 0.5;
const MAX_TEMPO_STAGES = 8;

/** Which effect owns which switch: anything else supplied for it is rejected. */
const EFFECT_FIELDS: Record<(typeof EFFECTS)[number], string[]> = {
  stabilize: ["smoothing", "shakiness", "accuracy", "crop"], normalize_audio: ["targetI", "targetTP", "targetLRA"],
  denoise: ["spatial", "chroma", "temporal"], denoise_audio: ["noiseFloor"], sharpen: ["amount", "size"],
  deinterlace: ["mode"], speed: ["factor", "keepAudio"], reverse: ["audioOnly"],
  fade: ["inSeconds", "outSeconds", "color"], blur: ["sigma"], vignette: ["angle"],
  color: ["brightness", "contrast", "saturation", "gamma"], lut3d: ["lutPath", "interpolation"],
  colorspace: ["to", "range", "tonemap"],
};
const COMMON_FIELDS = new Set(["input", "output", "effect", "overwrite"]);

const number = (min: number, max: number, note: string) => z.number().min(min).max(max).optional().describe(note);
const integer = (min: number, max: number, note: string) => z.number().int().min(min).max(max).optional().describe(note);
const flag = (note: string) => z.boolean().optional().describe(note);

// One definition of the tool surface: the argument type below is inferred from it, so
// schema and handler can never drift apart.
const EFFECT_SCHEMA = {
  input: z.string().min(1).describe("Absolute input path"),
  output: z.string().min(1).describe("Absolute output path; its directory must exist"),
  effect: z.enum(EFFECTS).describe("Effect pipeline to run"),
  overwrite: flag("Replace an existing output file"),
  smoothing: integer(1, 100, "stabilize: smoothing window, default 10"),
  shakiness: integer(1, 10, "stabilize: shakiness, default 5"),
  accuracy: integer(1, 15, "stabilize: accuracy (>= shakiness), default 9"),
  crop: z.enum(["black", "keep"]).optional().describe("stabilize: black borders or kept ones, default black"),
  targetI: number(-70, -5, "normalize_audio: integrated loudness target in LUFS, default -16"),
  targetTP: number(-9, 0, "normalize_audio: maximum true peak in dBTP, default -1.5"),
  targetLRA: number(1, 50, "normalize_audio: loudness range target, default 11"),
  spatial: number(0, 20, "denoise: spatial luma strength, default 4"),
  chroma: number(0, 20, "denoise: spatial chroma strength, default 3"),
  temporal: number(0, 40, "denoise: temporal luma strength, default 6"),
  noiseFloor: number(-80, -20, "denoise_audio: noise floor in dB, default -30"),
  amount: number(0, 5, "sharpen: luma amount, default 1"),
  size: integer(3, 23, "sharpen: luma matrix size, must be odd, default 5"),
  mode: z.enum(["auto", "frame", "field"]).optional().describe("deinterlace: field uses send_field, auto/frame use send_frame"),
  factor: number(0.1, 10, "speed: playback factor, required for speed"),
  keepAudio: flag("speed: retime the audio too, false drops it; default true"),
  audioOnly: flag("reverse: reverse only the audio track and copy the video; default false"),
  inSeconds: z.number().min(0).optional().describe("fade: fade-in length, default 0"),
  outSeconds: z.number().min(0).optional().describe("fade: fade-out length, default 0"),
  color: z.string().min(1).optional().describe("fade: colour of the fade, default black"),
  sigma: number(0, 50, "blur: Gaussian sigma, default 5"),
  angle: z.number().optional().describe("vignette: lens angle in radians, default 0.628"),
  brightness: number(-1, 1, "color: eq brightness"),
  contrast: number(0, 4, "color: eq contrast"),
  saturation: number(0, 3, "color: eq saturation"),
  gamma: number(0.1, 10, "color: eq gamma"),
  lutPath: z.string().min(1).optional().describe("lut3d: absolute path to an existing .cube or .3dl file"),
  interpolation: z.enum(["nearest", "trilinear", "tetrahedral"]).optional().describe("lut3d: default tetrahedral"),
  to: z.enum(COLORSPACE_TARGETS).optional().describe("colorspace: target standards, default bt709"),
  range: z.enum(["tv", "pc"]).optional().describe("colorspace: output range, tv for 16-235"),
  tonemap: flag("colorspace: append tonemap=hable for HDR to SDR"),
};

type Args = z.infer<z.ZodObject<typeof EFFECT_SCHEMA>>;
type Effect = Args["effect"];

/** What the argv builder needs to assemble one ffmpeg invocation. */
type Pipeline = { video?: string[]; audio?: string[]; copyVideo?: boolean; encodeAudio?: boolean; dropAudio?: boolean; dropVideo?: boolean };
type Planned = { ok: true; pipeline: Pipeline; settings: Payload } | { ok: false; response: ToolResponse };
type Probed = { ok: true; info: MediaInfo } | { ok: false; response: ToolResponse };
type Measured = { ok: true; measurement: LoudnessMeasurement } | { ok: false; response: ToolResponse };
type LoudnessMeasurement = { measuredI: number; measuredTP: number; measuredLRA: number; measuredThresh: number; offset: number };

function single(pipeline: Pipeline, settings: Payload): Planned {
  return { ok: true, pipeline, settings };
}

function reject(code: string, message: string): Planned {
  return { ok: false, response: failure(code, message) };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function atempoFilters(factor: number): string[] {
  const stages: number[] = [];
  let remaining = factor;
  while (remaining > TEMPO_MAX && stages.length < MAX_TEMPO_STAGES) {
    stages.push(TEMPO_MAX);
    remaining = round(remaining / TEMPO_MAX);
  }
  while (remaining < TEMPO_MIN && stages.length < MAX_TEMPO_STAGES) {
    stages.push(TEMPO_MIN);
    remaining = round(remaining / TEMPO_MIN);
  }
  if (Math.abs(remaining - 1) > 1e-6) stages.push(remaining);
  return stages.map((stage) => `atempo=${stage}`);
}

// Audio-only containers keep ffmpeg's own muxer default (verified: mp3, wav, flac, ogg
// and opus each pick their matching codec); everything else re-encodes with the
// container-appropriate codec from the shared table.
function audioEncodeArgs(output: string): string[] {
  if (inferTarget(output) === "audio") return [];
  return ["-c:a", defaultAudioCodec(containerOf(output))];
}

function pipelineArgs(input: Args, pipeline: Pipeline): string[] {
  const args = ["-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n"];
  args.push("-i", input.input);
  const video = pipeline.video ?? [];
  if (video.length) args.push("-vf", video.join(","));
  const audio = pipeline.audio ?? [];
  if (audio.length) args.push("-af", audio.join(","));
  if (pipeline.dropVideo) args.push("-vn");
  else {
    args.push("-c:v", pipeline.copyVideo ? "copy" : "libx264");
    if (!pipeline.copyVideo) args.push("-crf", VIDEO_CRF);
  }
  if (pipeline.dropAudio) args.push("-an");
  else if (pipeline.encodeAudio) args.push(...audioEncodeArgs(input.output));
  else args.push("-c:a", "copy");
  args.push(input.output);
  return args;
}

function effectsPayload(input: Args, effect: Effect, elapsedMs: number, stderrTail: string, extra: Payload): ToolResponse {
  return respond({
    ok: true, operation: "effects", effect, ...extra,
    input: input.input, inputBytes: totalInputBytes([input.input]),
    outputs: describeOutputs([input.output]), elapsedMs, stderrTail,
  });
}

async function probeInput(file: string): Promise<Probed> {
  const gate = requireBinary("ffprobe");
  if (!gate.ok) return { ok: false, response: gate.response };
  const probed = await probeMedia(file);
  if (!probed.ok) return { ok: false, response: failure(probed.code, `读取输入信息失败：${probed.error}`) };
  return { ok: true, info: probed.info };
}

function unusedFields(input: Args): string[] {
  const allowed = new Set(EFFECT_FIELDS[input.effect]);
  return Object.entries(input)
    .filter(([field, value]) => value !== undefined && !COMMON_FIELDS.has(field) && !allowed.has(field))
    .map(([field]) => field);
}

/** loudnorm prints its measurement as a JSON object in the middle of the log. */
function jsonObjectFrom(stderr: string): string | null {
  const marker = stderr.lastIndexOf('"input_i"');
  const start = marker < 0 ? -1 : stderr.lastIndexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < stderr.length; index += 1) {
    const character = stderr[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return stderr.slice(start, index + 1);
    }
  }
  return null;
}

function numberOf(source: Record<string, unknown>, key: string): number | null {
  const raw = source[key];
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLoudness(stderr: string): Measured {
  const unreadable = failure("measurement-unreadable", "第一遍 loudnorm 没有输出可解析的测量结果；请确认输入含音频", {
    stderrTail: stderr.slice(-STDERR_TAIL_CHARS).trim(),
  });
  const block = jsonObjectFrom(stderr);
  if (!block) return { ok: false, response: unreadable };
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return { ok: false, response: unreadable };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, response: unreadable };
  const source = parsed as Record<string, unknown>;
  const measuredI = numberOf(source, "input_i");
  const measuredTP = numberOf(source, "input_tp");
  const measuredLRA = numberOf(source, "input_lra");
  const measuredThresh = numberOf(source, "input_thresh");
  const offset = numberOf(source, "target_offset");
  if (measuredI === null || measuredTP === null || measuredLRA === null) return { ok: false, response: unreadable };
  if (measuredThresh === null || offset === null) return { ok: false, response: unreadable };
  return { ok: true, measurement: { measuredI, measuredTP, measuredLRA, measuredThresh, offset } };
}

async function planEffect(effect: SinglePassEffect, input: Args): Promise<Planned> {
  switch (effect) {
    case "denoise": {
      const spatial = input.spatial ?? 4, chroma = input.chroma ?? 3, temporal = input.temporal ?? 6;
      const video = [`hqdn3d=luma_spatial=${spatial}:chroma_spatial=${chroma}:luma_tmp=${temporal}`];
      return single({ video }, { spatial, chroma, temporal });
    }
    case "denoise_audio": {
      const noiseFloor = input.noiseFloor ?? -30;
      return single({ audio: [`afftdn=nf=${noiseFloor}`], copyVideo: true, encodeAudio: true }, { noiseFloor });
    }
    case "sharpen": {
      const amount = input.amount ?? 1, size = input.size ?? 5;
      if (size % 2 === 0) return reject("invalid-size", `unsharp 的 size 必须是 3..23 的奇数：${size}`);
      return single({ video: [`unsharp=luma_msize_x=${size}:luma_msize_y=${size}:luma_amount=${amount}`] }, { amount, size });
    }
    case "deinterlace": {
      const mode = input.mode ?? "auto";
      // This build's yadif has no "auto" value: send_frame is its documented default,
      // while send_field emits one frame per field for a smoother result.
      const yadifMode = mode === "field" ? "send_field" : "send_frame";
      return single({ video: [`yadif=mode=${yadifMode}`] }, { mode, yadifMode });
    }
    case "speed": {
      const factor = input.factor;
      if (factor === undefined) return reject("missing-factor", "speed 需要 factor（0.1..10）");
      const probed = await probeInput(input.input);
      if (!probed.ok) return { ok: false, response: probed.response };
      const keepAudio = input.keepAudio !== false;
      const hasAudio = probed.info.hasAudio;
      const pipeline: Pipeline = { video: [`setpts=PTS/${round(factor)}`] };
      if (!keepAudio) pipeline.dropAudio = true;
      else if (hasAudio) {
        pipeline.audio = atempoFilters(factor);
        pipeline.encodeAudio = true;
      }
      return single(pipeline, { factor, keepAudio, hasAudio });
    }
    case "reverse": {
      const probed = await probeInput(input.input);
      if (!probed.ok) return { ok: false, response: probed.response };
      const hasAudio = probed.info.hasAudio;
      if (input.audioOnly === true) {
        if (!hasAudio) return reject("missing-audio-stream", `${input.input} 没有音频流，无法只反转音频`);
        return single({ dropVideo: true, audio: ["areverse"], encodeAudio: true }, { audioOnly: true });
      }
      // A reversed picture over forward audio would drift apart, so the audio track is
      // reversed along with the picture whenever one exists.
      const pipeline: Pipeline = { video: ["reverse"] };
      if (hasAudio) {
        pipeline.audio = ["areverse"];
        pipeline.encodeAudio = true;
      }
      return single(pipeline, { audioOnly: false, hasAudio });
    }
    case "fade": {
      const inSeconds = input.inSeconds ?? 0, outSeconds = input.outSeconds ?? 0;
      const color = input.color ?? "black";
      if (inSeconds <= 0 && outSeconds <= 0) {
        return reject("missing-fade-range", "fade 需要 inSeconds 或 outSeconds 至少一个大于 0");
      }
      const video: string[] = [];
      if (inSeconds > 0) video.push(`fade=t=in:st=0:d=${round(inSeconds)}`);
      let startSeconds: number | null = null;
      if (outSeconds > 0) {
        const probed = await probeInput(input.input);
        if (!probed.ok) return { ok: false, response: probed.response };
        const duration = probed.info.durationSeconds;
        // A fade-out needs the real length of the input as its starting point.
        if (duration === null || duration <= 0) return reject("duration-unresolved", "读不到输入时长，无法定位淡出起点");
        startSeconds = Math.max(0, round(duration - outSeconds));
        video.push(`fade=t=out:st=${startSeconds}:d=${round(outSeconds)}:color=${color}`);
      }
      return single({ video }, { inSeconds, outSeconds, startSeconds, color });
    }
    case "blur": {
      const sigma = input.sigma ?? 5;
      return single({ video: [`gblur=sigma=${sigma}`] }, { sigma });
    }
    case "vignette": {
      const angle = input.angle ?? 0.628;
      return single({ video: [`vignette=angle=${angle}`] }, { angle });
    }
    case "color": {
      const options: string[] = [];
      if (input.brightness !== undefined) options.push(`brightness=${input.brightness}`);
      if (input.contrast !== undefined) options.push(`contrast=${input.contrast}`);
      if (input.saturation !== undefined) options.push(`saturation=${input.saturation}`);
      if (input.gamma !== undefined) options.push(`gamma=${input.gamma}`);
      if (!options.length) return reject("missing-color-argument", "color 需要 brightness / contrast / saturation / gamma 至少一个");
      const settings = { brightness: input.brightness ?? null, contrast: input.contrast ?? null, saturation: input.saturation ?? null, gamma: input.gamma ?? null };
      return single({ video: [`eq=${options.join(":")}`] }, settings);
    }
    case "lut3d": {
      const lutPath = input.lutPath;
      if (!lutPath) return reject("missing-lut", "lut3d 需要 lutPath 指向 .cube / .3dl 文件");
      if (!path.isAbsolute(lutPath)) return reject("invalid-lut-path", `lutPath 必须是绝对路径：${lutPath}`);
      if (!isFile(lutPath)) return reject("invalid-lut-path", `LUT 文件不存在或不是文件：${lutPath}`);
      if (!LUT_EXTENSIONS.has(path.extname(lutPath).toLowerCase())) {
        return reject("invalid-lut-format", `lut3d 只接受 .cube 或 .3dl 文件：${lutPath}`);
      }
      const interpolation = input.interpolation ?? "tetrahedral";
      return single({ video: [`lut3d=interp=${interpolation}:file=${escapeFilterPath(lutPath)}`] }, { lutPath, interpolation });
    }
    case "colorspace": {
      const to = input.to ?? "bt709";
      const options = [`all=${to}`];
      if (input.range) options.push(`range=${input.range}`);
      const video = [`colorspace=${options.join(":")}`];
      if (input.tonemap === true) video.push("tonemap=hable");
      return single({ video }, { to, range: input.range ?? null, tonemap: input.tonemap === true });
    }
  }
}

async function runStabilize(input: Args): Promise<ToolResponse> {
  const smoothing = input.smoothing ?? 10, shakiness = input.shakiness ?? 5;
  const accuracy = input.accuracy ?? 9, crop = input.crop ?? "black";
  const transforms = path.join(tmpdir(), `ffmpeg-tools-${process.pid}-${Date.now().toString(36)}.trf`);
  const escaped = escapeFilterPath(transforms);
  try {
    // Pass 1 only measures and writes the transform file; pass 2 consumes exactly that
    // file, so nothing about the second invocation is guessed.
    const first = await runFfmpeg([
      "-hide_banner", "-loglevel", "error", input.overwrite === true ? "-y" : "-n",
      "-i", input.input,
      "-vf", `vidstabdetect=shakiness=${shakiness}:accuracy=${accuracy}:result=${escaped}`,
      "-f", "null", "-",
    ]);
    if (!first.ok) return first.response;
    const transformsBytes = fileSize(transforms);
    if (transformsBytes === null || transformsBytes === 0) {
      return failure("transforms-missing", "第一遍 vidstabdetect 没有写出变换文件，第二遍无法进行", { stderrTail: first.stderrTail });
    }
    const args = pipelineArgs(input, { video: [`vidstabtransform=smoothing=${smoothing}:crop=${crop}:input=${escaped}`] });
    const second = await runFfmpeg(args);
    if (!second.ok) return second.response;
    const settings = { smoothing, shakiness, accuracy, crop, transformsBytes };
    return effectsPayload(input, "stabilize", first.elapsedMs + second.elapsedMs, second.stderrTail, { passes: 2, settings });
  } finally {
    try {
      unlinkSync(transforms);
    } catch {
      // Temp cleanup is best effort; the call result stays authoritative.
    }
  }
}

async function runNormalizeAudio(input: Args): Promise<ToolResponse> {
  const targetI = input.targetI ?? -16, targetTP = input.targetTP ?? -1.5, targetLRA = input.targetLRA ?? 11;
  const probed = await probeInput(input.input);
  if (!probed.ok) return probed.response;
  if (!probed.info.hasAudio) return failure("missing-audio-stream", `${input.input} 没有音频流，无法做响度归一化`);

  // Pass 1 measures: it is the one pass that cannot stay silent under `-loglevel error`,
  // because loudnorm reports the measurement it produces as JSON on stderr.
  const measure = await runFfmpegVerbose([
    "-hide_banner", "-nostats", "-loglevel", "info", input.overwrite === true ? "-y" : "-n",
    "-i", input.input,
    "-af", `loudnorm=I=${targetI}:TP=${targetTP}:LRA=${targetLRA}:print_format=json`,
    "-f", "null", "-",
  ]);
  if (!measure.ok) return measure.response;
  const parsed = parseLoudness(measure.stderr);
  if (!parsed.ok) return parsed.response;
  const measured = parsed.measurement;

  const normalization = [
    `I=${targetI}`, `TP=${targetTP}`, `LRA=${targetLRA}`, `measured_I=${measured.measuredI}`,
    `measured_TP=${measured.measuredTP}`, `measured_LRA=${measured.measuredLRA}`,
    `measured_thresh=${measured.measuredThresh}`, `offset=${measured.offset}`, "linear=true",
  ].join(":");
  const args = pipelineArgs(input, { copyVideo: true, encodeAudio: true, audio: [`loudnorm=${normalization}`] });
  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  const settings = { targetI, targetTP, targetLRA, measured };
  return effectsPayload(input, "normalize_audio", measure.elapsedMs + run.elapsedMs, run.stderrTail, { passes: 2, settings });
}

async function handle(input: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return failure("invalid-input", inputIssue);
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);
  const unused = unusedFields(input);
  if (unused.length) return failure("unused-arguments", `${unused.join(" / ")} 不适用于 effect=${input.effect}`);

  if (input.effect === "stabilize") return runStabilize(input);
  if (input.effect === "normalize_audio") return runNormalizeAudio(input);

  const planned = await planEffect(input.effect, input);
  if (!planned.ok) return planned.response;
  const run = await runFfmpeg(pipelineArgs(input, planned.pipeline));
  if (!run.ok) return run.response;
  return effectsPayload(input, input.effect, run.elapsedMs, run.stderrTail, { settings: planned.settings });
}

export function registerMediaEffects(server: McpServer): void {
  server.registerTool(
    "media_effects",
    {
      title: "Effects, filters and color",
      description:
        "Run one ffmpeg effect pipeline over a media file. effect picks it: stabilize (two passes — vidstabdetect writes the real transforms, then vidstabtransform reads that file), normalize_audio (two passes — loudnorm measures the input first and those measured values drive the second pass), denoise (hqdn3d), denoise_audio (afftdn), sharpen (unsharp), deinterlace (yadif), speed (setpts plus an atempo chain; the audio stream is probed first and only retimed when one really exists), reverse (buffers the whole clip, so keep it short), fade, blur (gblur), vignette, color (eq), lut3d (3D LUT file) and colorspace (colorspace, followed by tonemap=hable when tonemap is true; the input must carry colour metadata). Visual effects re-encode video as H.264 CRF 23 and copy audio; audio effects copy the video and re-encode audio. Switch names and values were confirmed against this machine's ffmpeg. Nothing is overwritten unless overwrite is true.",
      inputSchema: EFFECT_SCHEMA,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) => handle(args as Args),
  );
}
