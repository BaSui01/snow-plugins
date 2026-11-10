import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { resolveOperationTimeoutMs } from "../ffmpeg/run";
import { parseTimeToSeconds, toFfmpegSeconds } from "../ffmpeg/time";
import {
  describeOutputs,
  failure,
  inputProblem,
  isDirectory,
  outputProblem,
  pathProblem,
  respond,
  runFfmpeg,
  TIME_ARGUMENT,
  totalInputBytes,
  type ToolResponse,
} from "./shared";

const OPERATIONS = ["hls_package", "dash_package", "push", "record"] as const;

type Operation = (typeof OPERATIONS)[number];

const DEFAULT_SEGMENT_SECONDS = 6;
const DEFAULT_PLAYLIST_NAME = "index.m3u8";
const DASH_MANIFEST_NAME = "index.mpd";
const HLS_SEGMENT_TEMPLATE = "seg_%04d.ts";
const HLS_SEGMENT_PATTERN = /^seg_\d+\.ts$/;
// The DASH muxer resolves its segment templates against the process working directory, so
// the templates below are passed absolute: without that the segments would be written next
// to whatever directory the host process happens to run in instead of the caller's one.
const DASH_INIT_TEMPLATE = "init-$RepresentationID$.m4s";
const DASH_MEDIA_TEMPLATE = "chunk-$RepresentationID$-$Number%05d$.m4s";
const DASH_INIT_PATTERN = /^init-\d+\.m4s$/;
const DASH_SEGMENT_PATTERN = /^chunk-\d+-\d+\.m4s$/;
// Reporting every produced segment would blow the tool-result budget; the count stays exact.
const MAX_REPORTED_SEGMENTS = 50;

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;

// Only the protocols ffmpeg really carries to a live endpoint: the RTMP family over FLV and
// SRT/UDP/RTP over MPEG-TS. Anything else is refused instead of silently guessed.
const FLV_SCHEMES = new Set(["rtmp", "rtmps", "rtmpt", "rtmpe", "rtmpte", "rtmpts"]);
const MPEGTS_SCHEMES = new Set(["srt", "udp", "rtp"]);

// Arguments each operation owns; a switch belonging to another operation is rejected instead
// of being silently ignored.
const ALLOWED_ARGUMENTS: Record<Operation, readonly string[]> = {
  hls_package: ["input", "outputDir", "segmentSeconds", "playlistName", "videoBitrate", "audioBitrate", "overwrite"],
  dash_package: ["input", "outputDir", "segmentSeconds", "videoBitrate", "audioBitrate", "overwrite"],
  push: ["input", "url", "videoBitrate", "audioBitrate", "allowNetwork"],
  record: ["url", "output", "durationSeconds", "allowNetwork", "overwrite"],
};

type Args = {
  operation: Operation;
  input?: string;
  output?: string;
  outputDir?: string;
  url?: string;
  segmentSeconds?: number;
  playlistName?: string;
  durationSeconds?: number | string;
  videoBitrate?: string;
  audioBitrate?: string;
  allowNetwork?: boolean;
  overwrite?: boolean;
};

type Prepared =
  | { ok: true; source: string; directory: string; manifest: string }
  | { ok: false; response: ToolResponse };

function packaged(code: string, message: string): Prepared {
  return { ok: false, response: failure(code, message) };
}

function schemeOf(value: string): string | null {
  const match = SCHEME.exec(value.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function isNetworkTarget(value: string): boolean {
  return schemeOf(value) !== null;
}

/**
 * Stream keys and credentials regularly ride inside the target URL, so the report keeps the
 * endpoint readable but never echoes userinfo or query parameters back to the caller.
 */
function redactUrl(value: string): string {
  const trimmed = value.trim();
  let masked = trimmed;
  const credentials = /^([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/i.exec(trimmed);
  if (credentials) {
    const [matched, schemePrefix] = credentials;
    if (matched && schemePrefix) masked = `${schemePrefix}***@${trimmed.slice(matched.length)}`;
  }
  const query = masked.indexOf("?");
  return query >= 0 ? `${masked.slice(0, query)}?***` : masked;
}

function networkGate(input: Args): ToolResponse | null {
  if (input.allowNetwork === true) return null;
  return failure("network-not-allowed", "该操作会连接网络目标；如确有需要请显式传 allowNetwork: true");
}

function unusedArguments(input: Args): string[] {
  const allowed = new Set(ALLOWED_ARGUMENTS[input.operation]);
  const provided: Record<string, unknown> = { ...input };
  delete provided["operation"];
  return Object.entries(provided)
    .filter(([name, value]) => value !== undefined && !allowed.has(name))
    .map(([name]) => name);
}

function filesMatching(directory: string, pattern: RegExp): string[] {
  try {
    return readdirSync(directory)
      .filter((name) => pattern.test(name))
      .sort();
  } catch {
    return [];
  }
}

function preparePackage(input: Args, fileName: string): Prepared {
  if (!input.input) {
    return packaged("missing-input", `${input.operation} 需要 input 指定本地输入文件`);
  }
  const inputIssue = inputProblem(input.input);
  if (inputIssue) return packaged("invalid-input", inputIssue);

  if (!input.outputDir) {
    return packaged("missing-output-dir", `${input.operation} 需要 outputDir 指定已存在的输出目录`);
  }
  const directoryIssue = pathProblem(input.outputDir, "outputDir");
  if (directoryIssue) return packaged("invalid-output-dir", directoryIssue);
  if (!isDirectory(input.outputDir)) {
    return packaged("output-dir-missing", `输出目录不存在：${input.outputDir}`);
  }

  const manifest = path.join(input.outputDir, fileName);
  const manifestIssue = outputProblem(manifest, input.overwrite === true);
  if (manifestIssue) return packaged("invalid-output", manifestIssue);

  return { ok: true, source: input.input, directory: input.outputDir, manifest };
}

async function runHls(input: Args): Promise<ToolResponse> {
  const playlistName = input.playlistName ?? DEFAULT_PLAYLIST_NAME;
  if (playlistName.includes("/") || playlistName.includes("\\") || playlistName.includes("\u0000")) {
    return failure("invalid-playlist-name", `playlistName 只能是文件名：${playlistName}`);
  }

  const prepared = preparePackage(input, playlistName);
  if (!prepared.ok) return prepared.response;

  const seconds = input.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    prepared.source,
    "-c:v",
    "libx264",
  ];
  if (input.videoBitrate) args.push("-b:v", input.videoBitrate);
  args.push("-c:a", "aac");
  if (input.audioBitrate) args.push("-b:a", input.audioBitrate);
  args.push(
    "-f",
    "hls",
    "-hls_time",
    toFfmpegSeconds(seconds),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path.join(prepared.directory, HLS_SEGMENT_TEMPLATE),
    prepared.manifest,
  );

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  const segments = filesMatching(prepared.directory, HLS_SEGMENT_PATTERN);
  const reported = segments.slice(0, MAX_REPORTED_SEGMENTS);
  const payload: Record<string, unknown> = {
    ok: true,
    operation: "hls_package",
    playlist: prepared.manifest,
    outputDir: prepared.directory,
    segmentSeconds: seconds,
    segmentCount: segments.length,
    segments: describeOutputs(reported.map((name) => path.join(prepared.directory, name))),
    input: prepared.source,
    inputBytes: totalInputBytes([prepared.source]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  if (segments.length > reported.length) payload.reportedSegments = reported.length;
  return respond(payload);
}

/**
 * Absolute templates keep the segments in the caller's directory, but the muxer then writes
 * those absolute paths into the manifest; the directory prefix is stripped again so the
 * manifest stays a portable, relative-name document.
 */
function relativizeManifest(manifest: string, directory: string): boolean {
  try {
    const raw = readFileSync(manifest, "utf8");
    let rewritten = raw;
    for (const prefix of [`${directory}${path.sep}`, `${directory}/`]) {
      rewritten = rewritten.split(prefix).join("");
    }
    if (rewritten === raw) return false;
    writeFileSync(manifest, rewritten, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function runDash(input: Args): Promise<ToolResponse> {
  const prepared = preparePackage(input, DASH_MANIFEST_NAME);
  if (!prepared.ok) return prepared.response;

  const seconds = input.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    prepared.source,
    "-c:v",
    "libx264",
  ];
  if (input.videoBitrate) args.push("-b:v", input.videoBitrate);
  args.push("-c:a", "aac");
  if (input.audioBitrate) args.push("-b:a", input.audioBitrate);
  args.push(
    "-f",
    "dash",
    "-seg_duration",
    toFfmpegSeconds(seconds),
    "-init_seg_name",
    path.join(prepared.directory, DASH_INIT_TEMPLATE),
    "-media_seg_name",
    path.join(prepared.directory, DASH_MEDIA_TEMPLATE),
    prepared.manifest,
  );

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  const initSegments = filesMatching(prepared.directory, DASH_INIT_PATTERN);
  const segments = filesMatching(prepared.directory, DASH_SEGMENT_PATTERN);
  const reported = segments.slice(0, MAX_REPORTED_SEGMENTS);
  // The manifest is rewritten in place, so a failed rewrite is reported instead of hidden.
  const portable = relativizeManifest(prepared.manifest, prepared.directory);
  const payload: Record<string, unknown> = {
    ok: true,
    operation: "dash_package",
    manifest: prepared.manifest,
    outputDir: prepared.directory,
    segmentSeconds: seconds,
    segmentCount: segments.length,
    segments: describeOutputs(reported.map((name) => path.join(prepared.directory, name))),
    initSegmentCount: initSegments.length,
    initSegments: initSegments.map((name) => path.join(prepared.directory, name)),
    manifestPortable: portable,
    input: prepared.source,
    inputBytes: totalInputBytes([prepared.source]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  if (segments.length > reported.length) payload.reportedSegments = reported.length;
  if (!portable) payload.manifestNote = "清单里的分片引用仍是绝对路径，移到其它目录后需手工修正";
  return respond(payload);
}

async function runPush(input: Args): Promise<ToolResponse> {
  const gate = networkGate(input);
  if (gate) return gate;

  if (!input.url) return failure("missing-url", "push 需要 url 指定推流地址");
  if (!input.input) return failure("missing-input", "push 需要 input 指定本地文件或来源 URL");

  const scheme = schemeOf(input.url);
  if (!scheme) return failure("invalid-url", `url 必须是带协议的网络地址：${redactUrl(input.url)}`);
  const muxer = FLV_SCHEMES.has(scheme) ? "flv" : MPEGTS_SCHEMES.has(scheme) ? "mpegts" : null;
  if (!muxer) {
    return failure(
      "unsupported-push-protocol",
      `push 不支持 ${scheme}:// ，仅支持 rtmp(s) / rtmpt(e) / srt / udp / rtp：${redactUrl(input.url)}`,
    );
  }

  let inputBytes: number | null = null;
  if (!isNetworkTarget(input.input)) {
    const inputIssue = inputProblem(input.input);
    if (inputIssue) return failure("invalid-input", inputIssue);
    inputBytes = totalInputBytes([input.input]);
  }

  // -re feeds the target in real time, which is what a live endpoint expects. -y/-n do not
  // apply because the destination is a URL, not a file.
  const args = ["-hide_banner", "-loglevel", "error", "-re", "-i", input.input, "-c:v", "libx264"];
  if (input.videoBitrate) args.push("-b:v", input.videoBitrate);
  args.push("-c:a", "aac");
  if (input.audioBitrate) args.push("-b:a", input.audioBitrate);
  args.push("-f", muxer, input.url);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  return respond({
    ok: true,
    operation: "push",
    target: redactUrl(input.url),
    protocol: scheme,
    muxer,
    source: isNetworkTarget(input.input) ? redactUrl(input.input) : input.input,
    sourceBytes: inputBytes,
    realTime: true,
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function runRecord(input: Args): Promise<ToolResponse> {
  const gate = networkGate(input);
  if (gate) return gate;

  if (!input.url) return failure("missing-url", "record 需要 url 指定录制来源");
  const scheme = schemeOf(input.url);
  if (!scheme) return failure("invalid-url", `url 必须是带协议的网络地址：${redactUrl(input.url)}`);

  if (!input.output) return failure("missing-output", "record 需要 output 指定录制输出文件");
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  if (input.durationSeconds === undefined) {
    return failure("missing-duration", "录制必须给出 durationSeconds，避免无限运行");
  }
  const seconds = parseTimeToSeconds(input.durationSeconds);
  if (seconds === null || seconds <= 0) {
    return failure(
      "invalid-duration",
      `durationSeconds 不是可识别的正时间：${String(input.durationSeconds)}`,
    );
  }

  // Stream copy keeps the source untouched; a live source is only ever limited by -t.
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    input.url,
    "-c",
    "copy",
    "-t",
    toFfmpegSeconds(seconds),
    input.output,
  ];

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  const payload: Record<string, unknown> = {
    ok: true,
    operation: "record",
    source: redactUrl(input.url),
    protocol: scheme,
    durationSeconds: Number(seconds.toFixed(3)),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  const limitSeconds = Math.floor(resolveOperationTimeoutMs() / 1000);
  if (seconds > limitSeconds) {
    payload.warning = `录制时长（${Math.round(seconds)} 秒）超过单次调用时限（约 ${limitSeconds} 秒），ffmpeg 可能被提前终止`;
  }
  return respond(payload);
}

async function handle(input: Args): Promise<ToolResponse> {
  const unused = unusedArguments(input);
  if (unused.length) {
    return failure(
      "unused-arguments",
      `${unused.join(" / ")} 不用于 ${input.operation}；请确认 operation 与参数是否匹配`,
    );
  }

  switch (input.operation) {
    case "hls_package":
      return runHls(input);
    case "dash_package":
      return runDash(input);
    case "push":
      return runPush(input);
    case "record":
      return runRecord(input);
  }
}

export function registerMediaStream(server: McpServer): void {
  server.registerTool(
    "media_stream",
    {
      title: "Package, push and record streams",
      description:
        "Stream-shaped work on one input. hls_package segments a local file into an HLS playlist plus MPEG-TS segments and dash_package writes a DASH manifest plus fragmented-MP4 segments; both are purely local, write into an outputDir that must already exist and are refused when the manifest is already there. push re-encodes a local file or source URL and sends it in real time to an rtmp/rtmps/srt/udp/rtp endpoint, and record stream-copies a live rtsp/http/HLS source to a file. push and record open a network endpoint, so they need allowNetwork: true, and record always needs durationSeconds so a live source cannot run forever. Every operation reports real on-disk results.",
      inputSchema: {
        operation: z.enum(OPERATIONS),
        input: z.string().optional().describe("Absolute local path, or a source URL for push"),
        output: z.string().optional().describe("Absolute output file (record)"),
        outputDir: z.string().optional().describe("Existing absolute directory (packaging)"),
        url: z.string().optional().describe("Push endpoint or record source URL"),
        segmentSeconds: z.number().min(0.5).max(600).optional().describe("Segment length, default 6"),
        playlistName: z.string().optional().describe("Playlist file name, default index.m3u8"),
        durationSeconds: TIME_ARGUMENT.optional().describe("record only, required length"),
        videoBitrate: z.string().optional().describe("H.264 bitrate, e.g. 2M"),
        audioBitrate: z.string().optional().describe("AAC bitrate, e.g. 128k"),
        allowNetwork: z.boolean().optional().describe("Required for push / record"),
        overwrite: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    (args) => handle(args as Args),
  );
}
