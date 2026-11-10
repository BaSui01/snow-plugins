import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { containerOf } from "../ffmpeg/formats";
import { resolveOperationTimeoutMs, runBinary } from "../ffmpeg/run";
import {
  asRecord,
  baseArgs,
  describeOutputs,
  failure,
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
  type Payload,
  type ToolResponse,
} from "./shared";

const OPERATIONS = [
  "read",
  "write_tags",
  "strip",
  "remux",
  "attach_cover",
  "set_stream",
  "set_chapters",
  "set_rotation",
] as const;

type Operation = (typeof OPERATIONS)[number];

// Operation-specific switches; one used outside its own operation is rejected instead of
// being silently ignored.
const ARGUMENT_OWNERS: Record<string, Operation[]> = {
  tags: ["write_tags"],
  track: ["set_stream"],
  language: ["set_stream"],
  title: ["set_stream"],
  defaultFlag: ["set_stream"],
  forcedFlag: ["set_stream"],
  chapters: ["set_chapters"],
};

// mp4/mov/m4a carry a cover as an attached picture, matroska as a real attachment.
const MOV_CONTAINERS = new Set(["mp4", "m4v", "mov", "m4a", "m4b", "3gp", "3g2"]);
const MATROSKA_CONTAINERS = new Set(["mkv", "mka", "mks", "webm"]);
const COVER_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

// ffmetadata needs a chapter end: the next chapter's start, else 1s past this one.
const DEFAULT_CHAPTER_MS = 1000;

const inputSchema = {
  input: z.string().min(1).describe("Absolute input media path"),
  operation: z.enum(OPERATIONS),
  output: z.string().optional().describe("Absolute output path; its directory must exist"),
  tags: z.record(z.string(), z.string()).optional().describe("write_tags: tags to write, e.g. { title, artist }"),
  track: z.number().int().min(0).optional().describe("set_stream: 0-based stream ordinal"),
  language: z.string().regex(/^[A-Za-z0-9-]{2,16}$/).optional().describe("set_stream: language tag"),
  title: z.string().regex(/^[^\r\n]+$/).optional().describe("set_stream: stream title tag"),
  defaultFlag: z.boolean().optional().describe("set_stream: default disposition"),
  forcedFlag: z.boolean().optional().describe("set_stream: forced disposition"),
  coverPath: z.string().min(1).optional().describe("attach_cover: absolute image file"),
  degrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  chapters: z
    .array(z.object({ startSeconds: z.number().nonnegative(), title: z.string().min(1) }))
    .min(1)
    .max(200)
    .optional()
    .describe("set_chapters: { startSeconds, title } entries, sorted by start"),
  overwrite: z.boolean().optional(),
};

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

type StreamFlags = { language: string | null; title: string | null; default: boolean; forced: boolean };
type StreamSummary = StreamFlags & { index: number; type: string; codec: string; tags: Record<string, string> };
type ChapterSummary = { index: number; start: number | null; end: number | null; title: string | null };
type ProbeInfo = { container: string | null; durationSeconds: number | null; sizeBytes: number | null };
type ProbeMeta = { ok: true; bitRate: number | null; tags: Record<string, string> };
type ProbeRun = { streams: StreamSummary[]; chapters: ChapterSummary[]; elapsedMs: number; stderrTail: string };
type Probe = ProbeInfo & ProbeMeta & ProbeRun;
type ChapterInput = { startSeconds: number; title: string };

function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Only string tags are reported; any other ffprobe value is left out, never invented.
function stringTags(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const tags: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === "string") tags[key] = item;
  }
  return tags;
}

let tempSequence = 0;

function temporaryPath(extension: string): string {
  tempSequence += 1;
  const stamp = `${process.pid}-${Date.now().toString(36)}-${tempSequence}`;
  return path.join(tmpdir(), `ffmpeg-tools-${stamp}.${extension}`);
}

// The chapter list is temporary material: the caller deletes it in its finally block.
function removeQuietly(file: string): void {
  try {
    unlinkSync(file);
  } catch {
    return;
  }
}

// Raw ffprobe JSON for format, per-stream tags/dispositions and chapters; probe.ts untouched.
async function probeDetailed(file: string): Promise<Probe | ToolResponse> {
  const gate = requireBinary("ffprobe");
  if (!gate.ok) return gate.response;
  const args = ["-v", "error", "-print_format", "json"];
  args.push("-show_format", "-show_streams", "-show_chapters", file);
  const timeoutMs = Math.min(resolveOperationTimeoutMs(), 120_000);
  const outcome = await runBinary(gate.path, args, { timeoutMs });
  if (outcome.spawnError) return failure("ffprobe-spawn-failed", outcome.spawnError);
  if (outcome.timedOut) return failure("timed-out", "读取媒体信息超时", tailOf(outcome));
  if (outcome.code !== 0) {
    return failure("ffprobe-failed", `ffprobe 退出码 ${String(outcome.code)}`, tailOf(outcome));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outcome.stdout);
  } catch {
    return failure("ffprobe-output-invalid", "ffprobe 返回的内容不是 JSON", tailOf(outcome));
  }
  const raw = asRecord(parsed);
  if (!raw) return failure("ffprobe-output-invalid", "ffprobe 返回结构异常");

  const streams: StreamSummary[] = [];
  for (const item of Array.isArray(raw.streams) ? raw.streams : []) {
    const stream = asRecord(item);
    if (!stream || typeof stream.index !== "number") continue;
    const tags = stringTags(stream.tags);
    const disposition = asRecord(stream.disposition);
    streams.push({
      index: stream.index,
      type: stringOf(stream, "codec_type") ?? "unknown",
      codec: stringOf(stream, "codec_name") ?? "unknown",
      language: tags.language ?? null,
      title: tags.title ?? null,
      default: flagOf(disposition, "default"),
      forced: flagOf(disposition, "forced"),
      tags,
    });
  }
  const chapters: ChapterSummary[] = [];
  for (const item of Array.isArray(raw.chapters) ? raw.chapters : []) {
    const chapter = asRecord(item);
    if (!chapter) continue;
    const tags = stringTags(chapter.tags);
    const end = numberOf(chapter.end_time);
    chapters.push({ index: chapters.length, start: numberOf(chapter.start_time), end, title: tags.title ?? null });
  }
  const format = asRecord(raw.format);
  return {
    ok: true,
    container: stringOf(format, "format_name"),
    durationSeconds: numberOf(format?.duration),
    sizeBytes: numberOf(format?.size),
    bitRate: numberOf(format?.bit_rate),
    tags: stringTags(format?.tags),
    streams,
    chapters,
    elapsedMs: outcome.elapsedMs,
    stderrTail: outcome.stderrTail,
  };
}

// Output operations rewrite the container with `-map 0 -c copy`: no stream is re-encoded.
async function runOutput(
  operation: Operation,
  args: Args,
  command: string[],
  extra: Payload = {},
): Promise<ToolResponse> {
  const output = args.output as string;
  command.push(output);
  const run = await runFfmpeg(command);
  if (!run.ok) return run.response;
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

async function runCopy(args: Args, extra: string[] = []): Promise<ToolResponse> {
  const command = baseArgs(args.overwrite === true);
  command.push("-i", args.input, "-map", "0", "-c", "copy", ...extra);
  return runOutput(args.operation, args, command);
}

async function runWriteTags(args: Args): Promise<ToolResponse> {
  const entries = Object.entries(args.tags ?? {});
  if (!entries.length) return failure("missing-tags", "write_tags 需要至少一个 tags 键值对");
  const switches: string[] = [];
  for (const [key, value] of entries) {
    if (!key.trim() || /[=\s:]/.test(key)) return failure("invalid-tag-key", `标签名非法：${key}`);
    if (/[\r\n]/.test(value)) return failure("invalid-tag-value", `标签值不能含换行：${key}`);
    switches.push("-metadata", `${key}=${value}`);
  }
  return runCopy(args, switches);
}

async function runStrip(args: Args): Promise<ToolResponse> {
  // Measured on ffmpeg 9.0.2: -map_metadata -1 drops the global and per-stream tags
  // (container-inherent ones such as major_brand stay) while chapters survive.
  return runCopy(args, ["-map_metadata", "-1"]);
}

async function runAttachCover(args: Args): Promise<ToolResponse> {
  const cover = args.coverPath;
  if (cover === undefined) return failure("missing-cover", "attach_cover 需要 coverPath 指定封面文件");
  const problem = pathProblem(cover, "coverPath");
  if (problem) return failure("invalid-cover-path", problem);
  const mime = COVER_MIME[containerOf(cover)] ?? null;
  if (!mime) return failure("unsupported-cover-format", `封面必须是 jpg / jpeg / png：${cover}`);
  if (!isFile(cover)) return failure("invalid-cover-path", `封面文件不存在或不是文件：${cover}`);
  const container = containerOf(args.output as string);
  const command = baseArgs(args.overwrite === true);
  if (MOV_CONTAINERS.has(container)) {
    // Measured on ffmpeg 9.0.2: the still becomes the next video stream and needs the
    // attached_pic disposition (verified with a jpeg and a png cover).
    const probed = await probeDetailed(args.input);
    if (isResponse(probed)) return probed;
    const videoCount = probed.streams.filter((stream) => stream.type === "video").length;
    command.push("-i", args.input, "-i", cover, "-map", "0", "-map", "1", "-c", "copy");
    command.push(`-disposition:v:${videoCount}`, "attached_pic");
    return runOutput("attach_cover", args, command, { cover, mode: "attached_pic" });
  }
  if (!MATROSKA_CONTAINERS.has(container)) {
    const kind = container || "未知扩展名";
    return failure("unsupported-cover-container", `封面附加只支持 mp4/mov/m4a 与 mkv/webm：${kind}`);
  }
  // Measured on ffmpeg 9.0.2: matroska keeps the picture as an attachment, arriving through
  // -attach plus a mimetype tag (verified with a jpeg and a png cover).
  command.push("-i", args.input, "-attach", cover, "-c", "copy");
  command.push("-metadata:s:t", `mimetype=${mime}`);
  return runOutput("attach_cover", args, command, { cover, mode: "attachment", mimetype: mime });
}

// Measured on ffmpeg 9.0.2: 'default+forced' sets both flags, '0+forced' clears every flag
// first and then sets forced, and '0' clears them all.
function dispositionValue(defaultFlag: boolean | undefined, forcedFlag: boolean | undefined): string | null {
  if (defaultFlag === undefined && forcedFlag === undefined) return null;
  const flags: string[] = [];
  if (defaultFlag === true) flags.push("default");
  if (forcedFlag === true) flags.push("forced");
  if (defaultFlag === false || forcedFlag === false) return flags.length ? `0+${flags.join("+")}` : "0";
  return flags.join("+");
}

async function runSetStream(args: Args): Promise<ToolResponse> {
  const track = args.track;
  if (track === undefined) return failure("missing-track", "set_stream 需要 track 指定 0 基流序号");
  const disposition = dispositionValue(args.defaultFlag, args.forcedFlag);
  if (disposition === null && args.language === undefined && args.title === undefined) {
    return failure("missing-attributes", "set_stream 需要 language / title / defaultFlag / forcedFlag 之一");
  }
  const probed = await probeDetailed(args.input);
  if (isResponse(probed)) return probed;
  if (track >= probed.streams.length) {
    return failure("track-out-of-range", `track 超出范围（0..${probed.streams.length - 1}）`);
  }
  const command = baseArgs(args.overwrite === true);
  command.push("-i", args.input, "-map", "0", "-c", "copy");
  if (args.language !== undefined) command.push(`-metadata:s:${track}`, `language=${args.language}`);
  if (args.title !== undefined) command.push(`-metadata:s:${track}`, `title=${args.title}`);
  if (disposition !== null) command.push(`-disposition:s:${track}`, disposition);
  return runOutput("set_stream", args, command, { track, disposition });
}

// Measured on ffmpeg 9.0.2: a chapter title keeps a backslash only when it is written as
// `\\`; newlines are refused up front because they would cut the ffmetadata line.
function chapterMetadata(chapters: ChapterInput[]): string {
  const lines = [";FFMETADATA1", ""];
  chapters.forEach((chapter, position) => {
    const start = Math.round(chapter.startSeconds * 1000);
    const next = chapters[position + 1];
    const nextStart = next ? Math.round(next.startSeconds * 1000) : null;
    const end = nextStart !== null && nextStart > start ? nextStart : start + DEFAULT_CHAPTER_MS;
    const title = chapter.title.replace(/\\/g, "\\\\");
    lines.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${start}`, `END=${end}`, `title=${title}`, "");
  });
  return lines.join("\n");
}

async function runSetChapters(args: Args): Promise<ToolResponse> {
  const chapters = args.chapters ?? [];
  if (!chapters.length) return failure("missing-chapters", "set_chapters 需要至少一章 chapters");
  for (const chapter of chapters) {
    if (!Number.isFinite(chapter.startSeconds) || chapter.startSeconds < 0) {
      return failure("invalid-chapter-start", `章节起点必须是非负秒数：${String(chapter.startSeconds)}`);
    }
    if (/[\r\n]/.test(chapter.title)) return failure("invalid-chapter-title", "章节标题不能包含换行");
  }
  // END is the following chapter's start, so the list is ordered by start first.
  const ordered = [...chapters].sort((left, right) => left.startSeconds - right.startSeconds);
  const metadataPath = temporaryPath("txt");
  try {
    writeFileSync(metadataPath, chapterMetadata(ordered), "utf8");
    const command = baseArgs(args.overwrite === true);
    command.push("-i", args.input, "-i", metadataPath, "-map_metadata", "1", "-c", "copy");
    return await runOutput("set_chapters", args, command, { chapterCount: ordered.length });
  } finally {
    removeQuietly(metadataPath);
  }
}

async function runSetRotation(args: Args): Promise<ToolResponse> {
  const degrees = args.degrees;
  if (degrees === undefined) return failure("missing-degrees", "set_rotation 需要 degrees（0 / 90 / 180 / 270）");
  const container = containerOf(args.output as string);
  const command = baseArgs(args.overwrite === true);
  if (MOV_CONTAINERS.has(container)) {
    // Measured on ffmpeg 9.0.2: with -c copy the mp4/mov muxer ignores the
    // `-metadata:s:v:0 rotate=` tag (no rotate tag, no Display Matrix in ffprobe), while
    // the input option -display_rotation does write the rotation and must precede -i.
    command.push("-display_rotation", String(degrees));
    command.push("-i", args.input, "-map", "0", "-c", "copy");
    return runOutput("set_rotation", args, command, { degrees, mode: "display_rotation" });
  }
  // Measured on ffmpeg 9.0.2: matroska stores the classic rotate=... stream tag, read back
  // as ROTATE=90 (mp4 ignores it, hence the branch above).
  command.push("-i", args.input, "-map", "0", "-c", "copy");
  command.push("-metadata:s:v:0", `rotate=${degrees}`);
  return runOutput("set_rotation", args, command, { degrees, mode: "rotate_tag" });
}

function unusedArguments(args: Args): string[] {
  const pairs = Object.entries(ARGUMENT_OWNERS);
  const unused = pairs.filter(([name, owners]) => {
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
  if (args.operation !== "read") {
    if (args.output === undefined) return failure("missing-output", `${args.operation} 需要 output`);
    const outputIssue = outputProblem(args.output, args.overwrite === true);
    if (outputIssue) return failure("invalid-output", outputIssue);
  }

  switch (args.operation) {
    case "read":
      return probeReport(args);
    case "write_tags":
      return runWriteTags(args);
    case "strip":
      return runStrip(args);
    case "remux":
      return runCopy(args);
    case "attach_cover":
      return runAttachCover(args);
    case "set_stream":
      return runSetStream(args);
    case "set_chapters":
      return runSetChapters(args);
    case "set_rotation":
      return runSetRotation(args);
  }
}

async function probeReport(args: Args): Promise<ToolResponse> {
  const probed = await probeDetailed(args.input);
  if (isResponse(probed)) return probed;
  return respond({ ...probed, ok: true, operation: "read", input: args.input });
}

export function registerMediaMetadata(server: McpServer): void {
  server.registerTool(
    "media_metadata",
    {
      title: "Container metadata",
      description:
        "Read and rewrite container metadata without re-encoding any stream (-map 0 -c copy). read reports the container, duration, size, bit rate, the format tags, every stream (index, type, codec, language, title, default/forced disposition and its tags) and the chapters; write_tags writes tags into a rewritten container; strip drops them with -map_metadata -1 (chapters survive); remux only changes the container; attach_cover adds a still, as an attached_pic video stream for mp4/mov/m4a or as a real attachment with a mimetype tag for mkv/webm; set_stream sets a stream's language and title plus its default/forced disposition; set_chapters writes an ffmetadata chapter list into os.tmpdir() and maps it in (each END is the next start, else 1s later); and set_rotation writes 0/90/180/270 using -display_rotation for mp4/mov and the matroska rotate tag elsewhere. Nothing is overwritten unless overwrite is true.",
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
