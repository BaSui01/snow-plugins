import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { containerOf } from "../ffmpeg/formats";
import { resolveOperationTimeoutMs, runBinary } from "../ffmpeg/run";
import {
  asRecord,
  baseArgs,
  describeOutputs,
  escapeFilterPath,
  failure,
  fileSize,
  flagOf,
  inputProblem,
  isFile,
  isResponse,
  outputProblem,
  pathProblem,
  respond,
  requireBinary,
  runFfmpeg,
  stringOf,
  tailOf,
  totalInputBytes,
  type MediaRun,
  type Payload,
  type ToolResponse,
} from "./shared";

const OPERATIONS = ["list", "extract", "convert", "burn", "mux", "offset"] as const;

type Operation = (typeof OPERATIONS)[number];

// .ssa maps to the ass codec: the SSA and ASS encoders share one implementation.
const TEXT_CODEC: Record<string, string> = { srt: "srt", ass: "ass", ssa: "ass", vtt: "webvtt" };

// The container decides the subtitle codec: mp4/mov only carry mov_text, webm only
// webvtt, and matroska keeps subrip/ass/webvtt streams as they are.
const MOV_CONTAINERS = new Set(["mp4", "m4v", "mov", "m4a", "m4b", "3gp", "3g2"]);
const MATROSKA_CONTAINERS = new Set(["mkv", "mka", "mks", "webm"]);
const COPYABLE_SUBTITLES = new Set(["subrip", "ass", "ssa", "webvtt", "text"]);

// This build's `ffmpeg -codecs` lists these as bitmap subtitle decoders (other builds
// also expose xsub). They cannot become text, so they are refused instead of faked.
const BITMAP_CODECS = new Set(["dvd_subtitle", "hdmv_pgs_subtitle", "dvb_subtitle", "xsub"]);
const BITMAP_MESSAGE = "位图字幕无法转成文本，请改用 burn 烧录或先做 OCR";
const REQUIRES_OUTPUT = new Set<Operation>(["extract", "burn", "mux", "offset"]);

// Operation-specific switches; a switch used outside its own operation is rejected
// instead of being silently ignored.
const ARGUMENT_OWNERS: Record<string, Operation[]> = {
  subtitlePath: ["burn", "mux"],
  track: ["list", "extract"],
  language: ["mux"],
  title: ["mux"],
  style: ["burn"],
  delaySeconds: ["offset"],
};

const inputSchema = {
  input: z.string().min(1).describe("Absolute input path: media file, or subtitle file for convert / offset"),
  operation: z.enum(OPERATIONS),
  output: z.string().optional().describe("Absolute output path; its directory must exist"),
  subtitlePath: z.string().min(1).optional().describe("burn / mux: absolute subtitle file to burn or mux in"),
  track: z.number().int().min(0).optional().describe("list / extract: 0-based subtitle stream ordinal, default 0"),
  language: z.string().regex(/^[A-Za-z0-9-]{2,16}$/).optional().describe("mux: language tag, e.g. eng"),
  title: z.string().regex(/^[^\r\n]+$/).optional().describe("mux: title tag for the added subtitle stream"),
  style: z.string().optional().describe("burn: raw force_style text for the subtitles filter"),
  delaySeconds: z.number().optional().describe("offset: seconds to shift the timeline, negative allowed"),
  overwrite: z.boolean().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

type SubtitleTrack = {
  index: number;
  codec: string;
  language: string | null;
  title: string | null;
  default: boolean;
  forced: boolean;
};

type Probe = MediaRun & { ok: true; tracks: SubtitleTrack[]; hasVideo: boolean };
type SubtitleSource = { path: string; codec: string; label: string };

// Raw ffprobe JSON: stream tags and dispositions are reported exactly as they arrive, so
// nothing is invented, and ../ffmpeg/probe.ts stays untouched.
async function probeStreams(file: string): Promise<Probe | ToolResponse> {
  const gate = requireBinary("ffprobe");
  if (!gate.ok) return gate.response;
  const args = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file];
  const timeoutMs = Math.min(resolveOperationTimeoutMs(), 120_000);
  const outcome = await runBinary(gate.path, args, { timeoutMs });
  if (outcome.spawnError) return failure("ffprobe-spawn-failed", outcome.spawnError);
  if (outcome.timedOut) return failure("timed-out", "读取媒体信息超时", tailOf(outcome));
  if (outcome.code !== 0) {
    const code = `ffprobe 退出码 ${String(outcome.code)}`;
    return failure("ffprobe-failed", code, tailOf(outcome));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch {
    const message = "ffprobe 返回的内容不是 JSON";
    return failure("ffprobe-output-invalid", message, tailOf(outcome));
  }
  const raw = asRecord(parsed);
  if (!raw) return failure("ffprobe-output-invalid", "ffprobe 返回结构异常");

  const tracks: SubtitleTrack[] = [];
  let hasVideo = false;
  for (const item of Array.isArray(raw.streams) ? raw.streams : []) {
    const stream = asRecord(item);
    if (!stream) continue;
    const type = typeof stream.codec_type === "string" ? stream.codec_type : "";
    if (type === "video") hasVideo = true;
    if (type !== "subtitle" || typeof stream.index !== "number") continue;
    const tags = asRecord(stream.tags);
    const disposition = asRecord(stream.disposition);
    tracks.push({
      index: tracks.length,
      codec: stringOf(stream, "codec_name") ?? "unknown",
      language: stringOf(tags, "language"),
      title: stringOf(tags, "title"),
      default: flagOf(disposition, "default"),
      forced: flagOf(disposition, "forced"),
    });
  }
  return { ok: true, tracks, hasVideo, elapsedMs: outcome.elapsedMs, stderrTail: outcome.stderrTail };
}

function isAssFamily(codec: string): boolean {
  return codec === "ass" || codec === "ssa";
}

function isBitmap(codec: string): boolean {
  return BITMAP_CODECS.has(codec.toLowerCase());
}

function textCodecFor(output: string): string | null {
  return TEXT_CODEC[containerOf(output)] ?? null;
}

function selectTrack(tracks: SubtitleTrack[], wanted: number | undefined): SubtitleTrack | ToolResponse {
  if (!tracks.length) return failure("no-subtitle-stream", "输入里没有字幕流，可先用 list 查看");
  const index = wanted ?? 0;
  if (index >= tracks.length) return failure("track-out-of-range", `track 超出范围（0..${tracks.length - 1}）`);
  return tracks[index] as SubtitleTrack;
}

function emptyOutputProblem(output: string, stderrTail: string): ToolResponse | null {
  const size = fileSize(output);
  if (size !== null && size > 0) return null;
  const message = "字幕处理没有写出可用内容，已避免交付空文件";
  return failure("empty-subtitle-output", message, { stderrTail });
}

async function resolveSubtitleSource(args: Args): Promise<SubtitleSource | ToolResponse> {
  const value = args.subtitlePath;
  if (value === undefined) {
    const message = `${args.operation} 需要 subtitlePath 指定字幕文件，内嵌字幕可先用 extract 导出`;
    return failure("missing-subtitle-path", message);
  }
  const problem = pathProblem(value, "subtitlePath");
  if (problem) return failure("invalid-subtitle-path", problem);
  if (value.includes("'")) return failure("unsupported-subtitle-path", "字幕路径不能包含单引号");
  if (!isFile(value)) return failure("invalid-subtitle-path", `字幕文件不存在或不是文件：${value}`);
  const probed = await probeStreams(value);
  if (isResponse(probed)) return probed;
  const track = probed.tracks[0];
  if (!track) return failure("no-subtitle-stream", `${value} 里没有字幕流`);
  if (isBitmap(track.codec)) return failure("bitmap-subtitles-unsupported", BITMAP_MESSAGE);
  return { path: value, codec: track.codec, label: `subtitlePath:${value}` };
}

function buildBurnFilter(file: string, codec: string, style: string | undefined): string {
  const escaped = escapeFilterPath(file);
  if (style !== undefined && style !== "") return `subtitles=${escaped}:force_style='${style}'`;
  if (isAssFamily(codec)) return `ass=${escaped}`;
  return `subtitles=${escaped}`;
}

function targetSubtitleCodec(container: string, sourceCodec: string): string {
  if (MOV_CONTAINERS.has(container)) return "mov_text";
  if (container === "webm") return sourceCodec === "webvtt" ? "copy" : "webvtt";
  if (MATROSKA_CONTAINERS.has(container)) return COPYABLE_SUBTITLES.has(sourceCodec) ? "copy" : "srt";
  return "copy";
}

function streamMetadata(trackIndex: number, args: Args): string[] {
  const switches: string[] = [];
  if (args.language !== undefined) switches.push(`-metadata:s:s:${trackIndex}`, `language=${args.language}`);
  if (args.title !== undefined) switches.push(`-metadata:s:s:${trackIndex}`, `title=${args.title}`);
  return switches;
}

function artifactPayload(
  operation: Operation,
  args: Args,
  run: { elapsedMs: number; stderrTail: string },
  output: string,
  extra: Payload = {},
): ToolResponse {
  const common: Payload = {
    ok: true,
    operation,
    input: args.input,
    inputBytes: totalInputBytes([args.input]),
    outputs: describeOutputs([output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  return respond({ ...common, ...extra });
}

async function writeText(args: Args, trackIndex: number, codec: string, output: string): Promise<MediaRun> {
  const command = baseArgs(args.overwrite === true);
  command.push("-i", args.input, "-map", `0:s:${trackIndex}`, "-c:s", codec, output);
  return runFfmpeg(command);
}

async function runList(args: Args): Promise<ToolResponse> {
  const probed = await probeStreams(args.input);
  if (isResponse(probed)) return probed;
  const payload: Payload = {
    ok: true,
    operation: "list",
    input: args.input,
    list: probed.tracks,
    elapsedMs: probed.elapsedMs,
    stderrTail: probed.stderrTail,
  };
  if (!probed.tracks.length) payload.hint = "list 为空表示该文件没有字幕流，外部字幕请用 convert 处理";
  return respond(payload);
}

// extract and convert are the same write with a different source check: extract picks a
// subtitle stream inside a media file, convert works on a subtitle file's only stream.
async function runTextOutput(args: Args): Promise<ToolResponse> {
  const fromMedia = args.operation === "extract";
  const output = args.output as string;
  const codec = textCodecFor(output);
  if (!codec) return failure("unsupported-subtitle-format", `${args.operation} 输出需字幕扩展名：${output}`);
  if (!fromMedia && !textCodecFor(args.input)) {
    return failure("unsupported-subtitle-format", `convert 输入需字幕文件：${args.input}`);
  }
  const probed = await probeStreams(args.input);
  if (isResponse(probed)) return probed;
  const track = fromMedia ? selectTrack(probed.tracks, args.track) : probed.tracks[0];
  if (isResponse(track)) return track;
  if (!track) return failure("no-subtitle-stream", `${args.input} 里没有字幕流`);
  if (isBitmap(track.codec)) return failure("bitmap-subtitles-unsupported", BITMAP_MESSAGE);

  const run = await writeText(args, track.index, codec, output);
  if (!run.ok) return run.response;
  const empty = emptyOutputProblem(output, run.stderrTail);
  if (empty) return empty;
  const extra: Payload = fromMedia ? { track: track.index, subtitleCodec: codec } : { subtitleCodec: codec };
  return artifactPayload(args.operation, args, run, output, extra);
}

async function runBurn(args: Args): Promise<ToolResponse> {
  const output = args.output as string;
  const probed = await probeStreams(args.input);
  if (isResponse(probed)) return probed;
  if (!probed.hasVideo) return failure("missing-video-stream", `${args.input} 没有视频流，无法烧录字幕`);

  const source = await resolveSubtitleSource(args);
  if (isResponse(source)) return source;
  const command = baseArgs(args.overwrite === true);
  command.push("-i", args.input, "-vf", buildBurnFilter(source.path, source.codec, args.style));
  command.push("-c:v", "libx264", "-crf", "23", "-c:a", "copy", output);
  const run = await runFfmpeg(command);
  if (!run.ok) return run.response;
  const extra = { subtitleSource: source.label, subtitleCodec: source.codec };
  return artifactPayload("burn", args, run, output, { ...extra, forceStyle: args.style ?? null });
}

async function runMux(args: Args): Promise<ToolResponse> {
  const output = args.output as string;
  const container = containerOf(output);
  const probed = await probeStreams(args.input);
  if (isResponse(probed)) return probed;

  // -map 0 -map 1 -c copy keeps every original stream and adds the subtitle as a second
  // input; only the subtitle codec is adapted to what the target container accepts.
  const source = await resolveSubtitleSource(args);
  if (isResponse(source)) return source;
  const command = baseArgs(args.overwrite === true);
  command.push("-i", args.input, "-i", source.path, "-map", "0", "-map", "1", "-c", "copy");
  const trackIndex = probed.tracks.length;
  const subtitleCodec = targetSubtitleCodec(container, source.codec);
  if (subtitleCodec !== "copy") command.push("-c:s", subtitleCodec);
  command.push(...streamMetadata(trackIndex, args), output);
  const run = await runFfmpeg(command);
  if (!run.ok) return run.response;
  const extra = { container: container || null, subtitleSource: source.label, subtitleCodec };
  return artifactPayload("mux", args, run, output, extra);
}

async function runOffset(args: Args): Promise<ToolResponse> {
  const output = args.output as string;
  if (!textCodecFor(args.input)) {
    return failure("unsupported-subtitle-format", `offset 输入需字幕文件：${args.input}`);
  }
  if (!textCodecFor(output)) {
    return failure("unsupported-subtitle-format", `offset 输出需字幕文件：${output}`);
  }
  const delay = args.delaySeconds;
  if (delay === undefined) return failure("missing-delay", "offset 需要 delaySeconds（秒，可正可负）");
  if (!Number.isFinite(delay)) return failure("invalid-delay", `delaySeconds 非法：${String(delay)}`);

  // -itsoffset is an input option, so it must precede -i. Measured on ffmpeg 9.0.2: +1.5
  // turned 00:00:00,000-00:00:01,500 into 00:00:01,500-00:00:03,000, a negative value moved
  // a cue at 2s back to 1.5s, and cues pushed before zero are clamped to zero.
  const command = baseArgs(args.overwrite === true);
  command.push("-itsoffset", String(delay), "-i", args.input, "-c", "copy", output);
  const run = await runFfmpeg(command);
  if (!run.ok) return run.response;
  const empty = emptyOutputProblem(output, run.stderrTail);
  if (empty) return empty;
  return artifactPayload("offset", args, run, output, { delaySeconds: delay });
}

function unusedArguments(args: Args): string[] {
  const entries = Object.entries(ARGUMENT_OWNERS);
  const unused = entries.filter(([name, owners]) => {
    return args[name as keyof Args] !== undefined && !owners.includes(args.operation);
  });
  return unused.map(([name]) => name);
}

async function handle(args: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(args.input);
  if (inputIssue) return failure("invalid-input", inputIssue);
  const unused = unusedArguments(args);
  if (unused.length) {
    const message = `${unused.join(" / ")} 不用于 ${args.operation}，请改用合适的 operation`;
    return failure("unused-arguments", message);
  }
  if (REQUIRES_OUTPUT.has(args.operation)) {
    if (args.output === undefined) return failure("missing-output", `${args.operation} 需要 output`);
    const outputIssue = outputProblem(args.output, args.overwrite === true);
    if (outputIssue) return failure("invalid-output", outputIssue);
  }

  switch (args.operation) {
    case "list":
      return runList(args);
    case "extract":
    case "convert":
      return runTextOutput(args);
    case "burn":
      return runBurn(args);
    case "mux":
      return runMux(args);
    case "offset":
      return runOffset(args);
  }
}

export function registerMediaSubtitles(server: McpServer): void {
  server.registerTool(
    "media_subtitles",
    {
      title: "Subtitles",
      description:
        "Work with subtitle tracks: list reports a file's subtitle streams (0-based track ordinal, codec, language, title, default and forced), extract writes one track out as .srt/.ass/.ssa/.vtt text, convert rewrites a subtitle file between those text formats, burn hardcodes the subtitlePath file into a re-encoded video with an optional raw force_style, mux copies a video plus the subtitlePath file into a new container using the subtitle codec that container accepts (mp4/mov -> mov_text, mkv -> stream copy, webm -> webvtt) and can tag it with language/title, and offset shifts a subtitle file's timeline with -itsoffset (negative values clamp at zero). Bitmap subtitle codecs (dvd_subtitle, hdmv_pgs_subtitle, dvb_subtitle, xsub) are refused instead of producing an empty text file, and nothing is overwritten unless overwrite is true.",
      inputSchema,
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
