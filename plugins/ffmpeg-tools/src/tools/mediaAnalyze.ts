import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { toFfmpegSeconds } from "../ffmpeg/time";
import {
  failure,
  inputProblem,
  respond,
  runFfmpegVerbose,
  totalInputBytes,
  type Payload,
  type ToolResponse,
} from "./shared";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const OPERATIONS = [
  "black_frames",
  "silence",
  "freeze",
  "scene_changes",
  "black_bars",
  "loudness",
  "audio_stats",
] as const;

type Operation = (typeof OPERATIONS)[number];

const MAX_LOG_LINES = 20;
const FALLBACK_LOG_LINES = 5;
// A full analysis log can reach megabytes; a failure only carries a short tail.
const STDERR_TAIL_CHARS = 2000;

const DEFAULT_BLACK_DURATION = 0.1;
const DEFAULT_BLACK_PIXEL_THRESHOLD = 0.1;
const DEFAULT_SILENCE_NOISE_DB = -30;
const DEFAULT_SILENCE_DURATION = 0.5;
const DEFAULT_FREEZE_NOISE_DB = -60;
const DEFAULT_FREEZE_DURATION = 2;
const DEFAULT_SCENE_THRESHOLD = 10;
const DEFAULT_CROP_LIMIT = 24;
const DEFAULT_CROP_ROUND = 2;

/**
 * Labels the Overall block of `astats` prints in this ffmpeg build, paired with the
 * payload key they map to (`ffmpeg -h filter=astats` + real runs on 9.0.2).
 * "Dynamic range" only shows up in some builds, so that key stays conditional.
 */
const OVERALL_FIELDS: readonly (readonly [string, string])[] = [
  ["Peak level dB", "overallPeakDb"],
  ["RMS level dB", "overallRmsDb"],
  ["RMS peak dB", "overallRmsPeakDb"],
  ["RMS through dB", "overallRmsTroughDb"],
  ["Flat factor", "overallFlatFactor"],
  ["Noise floor dB", "overallNoiseFloorDb"],
  ["Entropy", "overallEntropy"],
  ["Number of samples", "overallSampleCount"],
  ["Dynamic range", "overallDynamicRange"],
];

type Args = {
  input: string;
  operation: Operation;
  duration?: number;
  threshold?: number;
  noiseDb?: number;
  limit?: number;
  round?: number;
};

type Range = { start: number; end: number | null; durationSeconds: number | null };

type Loudness = {
  integratedLufs: number;
  loudnessRangeLu: number;
  truePeakDbtp: number;
  thresholdLufs: number;
};

type AnalysisRun =
  | { ok: true; log: string; elapsedMs: number }
  | { ok: false; response: ToolResponse };

function linesOf(text: string): string[] {
  return text.split(/\r?\n/);
}

function numberAfter(text: string, pattern: RegExp): number | null {
  const raw = pattern.exec(text)?.[1];
  if (raw === undefined) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(-limit);
}

/**
 * `runFfmpegVerbose` keeps the whole log so findings can be parsed, which is far more
 * than a failure should carry; this shortens only the tail that travels with it.
 */
function cappedFailure(response: ToolResponse): ToolResponse {
  const raw = response.structuredContent.stderrTail;
  if (typeof raw !== "string" || raw.length <= STDERR_TAIL_CHARS) return response;
  return respond({ ...response.structuredContent, stderrTail: truncate(raw, STDERR_TAIL_CHARS) });
}

function evidenceOrTail(evidence: string[], log: string): string[] {
  if (evidence.length) return evidence.slice(0, MAX_LOG_LINES);
  return linesOf(log)
    .filter((line) => line.trim() !== "")
    .slice(-FALLBACK_LOG_LINES);
}

function baseArgs(input: string): string[] {
  return ["-hide_banner", "-loglevel", "info", "-i", input];
}

async function runAnalysis(input: string, filterArgs: string[]): Promise<AnalysisRun> {
  const run = await runFfmpegVerbose([...baseArgs(input), ...filterArgs, "-f", "null", "-"]);
  if (!run.ok) return { ok: false, response: cappedFailure(run.response) };
  return { ok: true, log: run.stderr, elapsedMs: run.elapsedMs };
}

function success(
  input: string,
  operation: Operation,
  payload: Payload,
  run: { log: string; elapsedMs: number },
  evidence: string[],
): ToolResponse {
  return respond({
    ok: true,
    operation,
    input,
    ...payload,
    inputBytes: totalInputBytes([input]),
    logLines: evidenceOrTail(evidence, run.log),
    elapsedMs: run.elapsedMs,
  });
}

/**
 * `blackdetect`, `silencedetect` and `freezedetect` all report `<key>_start`,
 * `<key>_end` and `<key>_duration` on one log line (verified on ffmpeg 9.0.2, where
 * blackdetect prints no space after the colon but the other two do).
 */
function parseRanges(log: string, key: string): Range[] {
  const startPattern = new RegExp(`${key}_start:\\s*(-?[\\d.]+)`);
  const endPattern = new RegExp(`${key}_end:\\s*(-?[\\d.]+)`);
  const durationPattern = new RegExp(`${key}_duration:\\s*(-?[\\d.]+)`);
  const ranges: Range[] = [];
  let pending: number | null = null;
  for (const line of linesOf(log)) {
    const start = numberAfter(line, startPattern);
    if (start !== null) {
      // An unfinished interval is closed with nulls instead of an invented end.
      if (pending !== null) ranges.push({ start: pending, end: null, durationSeconds: null });
      pending = start;
    }
    if (pending === null) continue;
    const end = numberAfter(line, endPattern);
    const durationSeconds = numberAfter(line, durationPattern);
    if (end === null && durationSeconds === null) continue;
    ranges.push({ start: pending, end, durationSeconds });
    pending = null;
  }
  if (pending !== null) ranges.push({ start: pending, end: null, durationSeconds: null });
  return ranges;
}

function summarizeRanges(ranges: Range[]): { count: number; totalSeconds: number } {
  const total = ranges.reduce((sum, range) => sum + (range.durationSeconds ?? 0), 0);
  return { count: ranges.length, totalSeconds: Number(total.toFixed(3)) };
}

function parseSceneChanges(log: string): { timeSeconds: number; score: number }[] {
  const findings: { timeSeconds: number; score: number }[] = [];
  for (const line of linesOf(log)) {
    const score = numberAfter(line, /lavfi\.scd\.score:\s*(-?[\d.]+)/);
    const timeSeconds = numberAfter(line, /lavfi\.scd\.time:\s*(-?[\d.]+)/);
    if (score === null || timeSeconds === null) continue;
    findings.push({ timeSeconds, score });
  }
  return findings;
}

/** `cropdetect` prints one line per analysed frame; the last one is the verdict. */
function lastCrop(log: string): { width: number; height: number; x: number; y: number } | null {
  const pattern = /crop=(\d+):(\d+):(\d+):(\d+)/g;
  let found: { width: number; height: number; x: number; y: number } | null = null;
  let match = pattern.exec(log);
  while (match !== null) {
    const [, width, height, x, y] = match;
    if (width !== undefined && height !== undefined && x !== undefined && y !== undefined) {
      found = { width: Number(width), height: Number(height), x: Number(x), y: Number(y) };
    }
    match = pattern.exec(log);
  }
  return found;
}

function parseLoudness(log: string): { summary: Loudness; block: string[] } | null {
  const lines = linesOf(log);
  const start = lines.findIndex((line) => line.includes("Summary:"));
  if (start < 0) return null;
  const block = lines.slice(start);
  const text = block.join("\n");
  const integratedLufs = numberAfter(text, /I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  const loudnessRangeLu = numberAfter(text, /LRA:\s*(-?\d+(?:\.\d+)?)\s*LU\b/);
  const truePeakDbtp = numberAfter(text, /Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/);
  const thresholdLufs = numberAfter(text, /Threshold:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
  if (
    integratedLufs === null ||
    loudnessRangeLu === null ||
    truePeakDbtp === null ||
    thresholdLufs === null
  ) {
    return null;
  }
  return {
    summary: { integratedLufs, loudnessRangeLu, truePeakDbtp, thresholdLufs },
    block: block.slice(0, MAX_LOG_LINES),
  };
}

function parseAudioStats(log: string): { summary: Payload; block: string[] } | null {
  const lines = linesOf(log);
  // The Overall header carries no colon (the per-channel sections above it do).
  const start = lines.findIndex((line) => /\]\s*Overall\s*$/.test(line) || /^Overall\s*$/.test(line));
  if (start < 0) return null;
  const block = lines.slice(start);
  const text = block.join("\n");
  const summary: Payload = {};
  for (const [label, key] of OVERALL_FIELDS) {
    const value = numberAfter(text, new RegExp(`${label}:\\s*(-?[\\d.]+)`));
    if (value !== null) summary[key] = value;
  }
  if (typeof summary.overallPeakDb !== "number" || typeof summary.overallRmsDb !== "number") {
    return null;
  }
  return { summary, block: block.slice(0, MAX_LOG_LINES) };
}

function rangeProblem(value: number, min: number, max: number, label: string): string | null {
  if (!(value > min) || value > max) {
    return `${label} 需大于 ${min} 且不超过 ${max}，当前收到 ${value}`;
  }
  return null;
}

async function runRanges(
  input: string,
  operation: Operation,
  filterArgs: string[],
  key: string,
): Promise<ToolResponse> {
  const run = await runAnalysis(input, filterArgs);
  if (!run.ok) return run.response;
  const findings = parseRanges(run.log, key);
  const evidence = linesOf(run.log).filter((line) => line.includes(`${key}_`));
  return success(input, operation, { findings, summary: summarizeRanges(findings) }, run, evidence);
}

async function runSceneChanges(input: string, threshold: number): Promise<ToolResponse> {
  const run = await runAnalysis(input, ["-vf", `scdet=threshold=${threshold}`]);
  if (!run.ok) return run.response;
  const findings = parseSceneChanges(run.log);
  const evidence = linesOf(run.log).filter((line) => line.includes("lavfi.scd"));
  return success(input, "scene_changes", { findings, summary: { count: findings.length } }, run, evidence);
}

async function runBlackBars(input: string, limit: number, round: number): Promise<ToolResponse> {
  const run = await runAnalysis(input, ["-vf", `cropdetect=limit=${limit}:round=${round}`]);
  if (!run.ok) return run.response;
  const cropLines = linesOf(run.log).filter((line) => line.includes("crop="));
  const summary = lastCrop(run.log);
  if (!summary) {
    return failure(
      "crop-undetected",
      "cropdetect 没有输出任何 crop= 行，无法判定黑边（输入可能不是视频流）",
      { stderrTail: truncate(run.log, STDERR_TAIL_CHARS) },
    );
  }
  return success(input, "black_bars", { summary, limit, round }, run, cropLines.slice(-5));
}

async function runLoudness(input: string): Promise<ToolResponse> {
  const run = await runAnalysis(input, ["-af", "ebur128=peak=true"]);
  if (!run.ok) return run.response;
  const parsed = parseLoudness(run.log);
  if (!parsed) {
    return failure(
      "loudness-parse-failed",
      "无法从 ebur128 摘要中解析响度数据（输入可能没有音频流）",
      { stderrTail: truncate(run.log, STDERR_TAIL_CHARS) },
    );
  }
  return success(input, "loudness", { summary: parsed.summary }, run, parsed.block);
}

async function runAudioStats(input: string): Promise<ToolResponse> {
  const run = await runAnalysis(input, ["-af", "astats"]);
  if (!run.ok) return run.response;
  const parsed = parseAudioStats(run.log);
  if (!parsed) {
    return failure(
      "audio-stats-parse-failed",
      "无法从 astats 的 Overall 段解析统计值（输入可能没有音频流）",
      { stderrTail: truncate(run.log, STDERR_TAIL_CHARS) },
    );
  }
  return success(input, "audio_stats", { summary: parsed.summary }, run, parsed.block);
}

async function handle(args: Args): Promise<ToolResponse> {
  const inputIssue = inputProblem(args.input);
  if (inputIssue) return failure("invalid-input", inputIssue);

  switch (args.operation) {
    case "black_frames": {
      const threshold = args.threshold ?? DEFAULT_BLACK_PIXEL_THRESHOLD;
      const issue = rangeProblem(threshold, 0, 1, "threshold（pixel_black_th）");
      if (issue) return failure("invalid-threshold", issue);
      const duration = args.duration ?? DEFAULT_BLACK_DURATION;
      const filter = `blackdetect=d=${toFfmpegSeconds(duration)}:pix_th=${threshold}`;
      return runRanges(args.input, "black_frames", ["-vf", filter], "black");
    }
    case "silence": {
      const noiseDb = args.noiseDb ?? DEFAULT_SILENCE_NOISE_DB;
      const duration = args.duration ?? DEFAULT_SILENCE_DURATION;
      const filter = `silencedetect=noise=${noiseDb}dB:d=${toFfmpegSeconds(duration)}`;
      return runRanges(args.input, "silence", ["-af", filter], "silence");
    }
    case "freeze": {
      const noiseDb = args.noiseDb ?? DEFAULT_FREEZE_NOISE_DB;
      const duration = args.duration ?? DEFAULT_FREEZE_DURATION;
      const filter = `freezedetect=n=${noiseDb}dB:d=${toFfmpegSeconds(duration)}`;
      return runRanges(args.input, "freeze", ["-vf", filter], "freeze");
    }
    case "scene_changes": {
      const threshold = args.threshold ?? DEFAULT_SCENE_THRESHOLD;
      const issue = rangeProblem(threshold, 0, 100, "threshold（scdet 阈值）");
      if (issue) return failure("invalid-threshold", issue);
      return runSceneChanges(args.input, threshold);
    }
    case "black_bars": {
      const limit = args.limit ?? DEFAULT_CROP_LIMIT;
      const round = args.round ?? DEFAULT_CROP_ROUND;
      return runBlackBars(args.input, limit, round);
    }
    case "loudness":
      return runLoudness(args.input);
    case "audio_stats":
      return runAudioStats(args.input);
  }
}

export function registerMediaAnalyze(server: McpServer): void {
  server.registerTool(
    "media_analyze",
    {
      title: "Analyze media",
      description:
        "Read-only measurements of a media file, returned as parsed findings instead of raw logs: black_frames (blackdetect), silence (silencedetect), freeze (freezedetect), scene_changes (scdet score/time), black_bars (last cropdetect crop= verdict), loudness (ebur128 summary: integrated LUFS, LRA, true peak, threshold) and audio_stats (astats Overall block). Nothing is written: every run discards the decoded output with -f null -.",
      inputSchema: {
        input: z.string().min(1).describe("Absolute input path"),
        operation: z
          .enum(OPERATIONS)
          .describe("Which detector to run; each one reads its own dedicated options"),
        duration: z
          .number()
          .min(0.01)
          .max(600)
          .optional()
          .describe("black_frames 0.1 / silence 0.5 / freeze 2 seconds of minimum length"),
        threshold: z
          .number()
          .positive()
          .optional()
          .describe("black_frames pixel_black_th (0..1, default 0.1) / scene_changes scdet threshold (1..100, default 10)"),
        noiseDb: z
          .number()
          .min(-120)
          .max(0)
          .optional()
          .describe("silence -30 / freeze -60 dB noise tolerance"),
        limit: z.number().min(0).max(65535).optional().describe("black_bars cropdetect limit, default 24"),
        round: z.number().int().min(0).max(1024).optional().describe("black_bars width/height divisor, default 2"),
      },
      annotations: READ_ONLY,
    },
    (args) => handle(args as Args),
  );
}
