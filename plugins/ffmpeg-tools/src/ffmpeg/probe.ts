import { statSync } from "node:fs";
import path from "node:path";

import { resolveBinary } from "./binary";
import { runBinary, resolveOperationTimeoutMs } from "./run";

export type ProbeStream = {
  index: number;
  type: string;
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  fps?: number;
  pixelFormat?: string;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  frames?: number;
  language?: string;
};

export type MediaInfo = {
  path: string;
  kind: "video" | "audio" | "image" | "other";
  container: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  bitRate: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  streams: ProbeStream[];
};

export type ProbeFailure = {
  ok: false;
  code:
    | "ffprobe-missing"
    | "input-missing"
    | "input-not-file"
    | "probe-failed"
    | "probe-timed-out"
    | "probe-output-invalid";
  error: string;
  stderrTail?: string;
};

const IMAGE_CONTAINER_HINTS = [
  "image2",
  "png",
  "jpeg",
  "jpg",
  "mjpeg",
  "bmp",
  "gif",
  "webp",
  "tiff",
];

const IMAGE_CODECS = new Set([
  "png",
  "mjpeg",
  "bmp",
  "gif",
  "webp",
  "tiff",
  "apng",
  "jpeg2000",
]);

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function fractionToNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.includes("/")) {
    const direct = toNumber(value);
    return direct && direct > 0 ? Number(direct.toFixed(3)) : undefined;
  }
  const [rawNumerator, rawDenominator] = value.split("/");
  const numerator = Number.parseFloat(rawNumerator ?? "");
  const denominator = Number.parseFloat(rawDenominator ?? "");
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return undefined;
  }
  const result = numerator / denominator;
  return result > 0 ? Number(result.toFixed(3)) : undefined;
}

function classify(
  container: string | null,
  streams: ProbeStream[],
  durationSeconds: number | null,
): MediaInfo["kind"] {
  const hasVideo = streams.some((stream) => stream.type === "video");
  const hasAudio = streams.some((stream) => stream.type === "audio");
  if (hasAudio && !hasVideo) return "audio";
  if (!hasVideo) return "other";
  const containerLooksImage =
    container !== null &&
    IMAGE_CONTAINER_HINTS.some((hint) => container.toLowerCase().includes(hint));
  const video = streams.find((stream) => stream.type === "video");
  const codecLooksImage = video ? IMAGE_CODECS.has(video.codec.toLowerCase()) : false;
  const singleFrame = (video?.frames ?? null) !== null && (video?.frames ?? 0) <= 1;
  if ((containerLooksImage || codecLooksImage) && (singleFrame || !durationSeconds)) {
    return "image";
  }
  return "video";
}

/**
 * A still image reaches ffprobe as a one-frame mjpeg/png/... stream, so it is
 * recognised by its codec or container rather than by a single-frame count.
 */
export function isStillImage(info: MediaInfo): boolean {
  if (!info.hasVideo) return false;
  const container = info.container?.toLowerCase() ?? "";
  if (IMAGE_CONTAINER_HINTS.some((hint) => container.includes(hint))) return true;
  return info.streams.some(
    (stream) => stream.type === "video" && IMAGE_CODECS.has(stream.codec.toLowerCase()),
  );
}

// Probing is the per-call bottleneck when one tool receives many inputs, and a
// slideshow repeats the same photos. Cache by path + size + mtime so a changed file
// is never served from an old entry.
const PROBE_CACHE_LIMIT = 200;
const probeCache = new Map<string, MediaInfo>();

function probeCacheKey(file: string): string | null {
  try {
    const stat = statSync(file);
    return `${file}|${stat.size}|${Math.floor(stat.mtimeMs)}`;
  } catch {
    return null;
  }
}

function rememberProbe(key: string, info: MediaInfo): void {
  probeCache.set(key, info);
  if (probeCache.size > PROBE_CACHE_LIMIT) {
    const oldest = probeCache.keys().next().value;
    if (oldest !== undefined) probeCache.delete(oldest);
  }
}

export async function probeMedia(
  file: string,
  timeoutMs = resolveOperationTimeoutMs(),
): Promise<{ ok: true; info: MediaInfo } | ProbeFailure> {
  const binary = resolveBinary("ffprobe");
  if (!binary) {
    return { ok: false, code: "ffprobe-missing", error: "ffprobe 不可用" };
  }
  try {
    if (!statSync(file).isFile()) {
      return { ok: false, code: "input-not-file", error: `不是文件：${file}` };
    }
  } catch {
    return { ok: false, code: "input-missing", error: `文件不存在：${file}` };
  }

  const cacheKey = probeCacheKey(file);
  if (cacheKey) {
    const hit = probeCache.get(cacheKey);
    if (hit) return { ok: true, info: hit };
  }

  const outcome = await runBinary(
    binary.path,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ],
    { timeoutMs: Math.min(timeoutMs, 120_000), stdoutLimitBytes: 8 * 1024 * 1024 },
  );
  if (outcome.spawnError) {
    return { ok: false, code: "probe-failed", error: outcome.spawnError };
  }
  if (outcome.timedOut) {
    return { ok: false, code: "probe-timed-out", error: "读取媒体信息超时" };
  }
  if (outcome.code !== 0) {
    return {
      ok: false,
      code: "probe-failed",
      error: "ffprobe 读取失败",
      stderrTail: outcome.stderrTail,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch {
    return {
      ok: false,
      code: "probe-output-invalid",
      error: "ffprobe 返回的内容不是 JSON",
      stderrTail: outcome.stderrTail,
    };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, code: "probe-output-invalid", error: "ffprobe 返回结构异常" };
  }

  const raw = parsed as { format?: Record<string, unknown>; streams?: unknown[] };
  const format = raw.format ?? {};
  const streams: ProbeStream[] = [];
  for (const item of Array.isArray(raw.streams) ? raw.streams : []) {
    if (!item || typeof item !== "object") continue;
    const stream = item as Record<string, unknown>;
    const index = toNumber(stream.index);
    const type = typeof stream.codec_type === "string" ? stream.codec_type : null;
    if (index === null || !type) continue;
    const entry: ProbeStream = {
      index,
      type,
      codec: typeof stream.codec_name === "string" ? stream.codec_name : "unknown",
    };
    if (typeof stream.profile === "string") entry.profile = stream.profile;
    const width = toNumber(stream.width);
    const height = toNumber(stream.height);
    if (width) entry.width = width;
    if (height) entry.height = height;
    const fps = fractionToNumber(stream.avg_frame_rate) ?? fractionToNumber(stream.r_frame_rate);
    if (fps) entry.fps = fps;
    if (typeof stream.pix_fmt === "string") entry.pixelFormat = stream.pix_fmt;
    const sampleRate = toNumber(stream.sample_rate);
    if (sampleRate) entry.sampleRate = sampleRate;
    const channels = toNumber(stream.channels);
    if (channels) entry.channels = channels;
    const bitRate = toNumber(stream.bit_rate);
    if (bitRate) entry.bitRate = bitRate;
    const frames = toNumber(stream.nb_frames);
    if (frames) entry.frames = frames;
    if (typeof stream.tags === "object" && stream.tags !== null) {
      const language = (stream.tags as Record<string, unknown>).language;
      if (typeof language === "string") entry.language = language;
    }
    streams.push(entry);
  }

  const container =
    typeof format.format_name === "string" ? format.format_name : null;
  const durationSeconds = toNumber(format.duration);
  const sizeBytes = toNumber(format.size);
  const bitRate = toNumber(format.bit_rate);

  const info: MediaInfo = {
    path: file,
    kind: classify(container, streams, durationSeconds),
    container,
    durationSeconds,
    sizeBytes,
    bitRate,
    hasAudio: streams.some((stream) => stream.type === "audio"),
    hasVideo: streams.some((stream) => stream.type === "video"),
    streams,
  };
  if (cacheKey) rememberProbe(cacheKey, info);
  return { ok: true, info };
}

export function containerFromExtension(output: string): string {
  return path.extname(output).replace(/^\./, "").toLowerCase();
}
