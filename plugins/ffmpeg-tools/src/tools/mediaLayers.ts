import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { evenDimension } from "../ffmpeg/formats";
import { probeMedia, type MediaInfo } from "../ffmpeg/probe";
import {
  describeOutputs,
  failure,
  inputProblem,
  outputProblem,
  respond,
  requireBinary,
  runFfmpeg,
  totalInputBytes,
  type ToolResponse,
} from "./shared";

const OPERATIONS = ["overlay", "stack", "mix_audio"] as const;
const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "center", "custom"] as const;
const LAYOUTS = ["hstack", "vstack", "grid"] as const;
const MIX_MODES = ["mix", "replace", "duck"] as const;

type Args = {
  operation: (typeof OPERATIONS)[number];
  output: string;
  /** overlay */
  video?: string;
  overlay?: string;
  position?: (typeof POSITIONS)[number];
  margin?: number;
  x?: number;
  y?: number;
  overlayScale?: string;
  opacity?: number;
  /** stack */
  inputs?: string[];
  layout?: (typeof LAYOUTS)[number];
  columns?: number;
  size?: string;
  /** mix_audio */
  audio?: string;
  mode?: (typeof MIX_MODES)[number];
  musicVolume?: number;
  originalVolume?: number;
  audioBitrate?: string;
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

function overlayPosition(input: Args): { x: string; y: string } | null {
  const margin = input.margin ?? 16;
  switch (input.position ?? "bottom-right") {
    case "top-left":
      return { x: `${margin}`, y: `${margin}` };
    case "top-right":
      return { x: `main_w-overlay_w-${margin}`, y: `${margin}` };
    case "bottom-left":
      return { x: `${margin}`, y: `main_h-overlay_h-${margin}` };
    case "bottom-right":
      return { x: `main_w-overlay_w-${margin}`, y: `main_h-overlay_h-${margin}` };
    case "center":
      return { x: "(main_w-overlay_w)/2", y: "(main_h-overlay_h)/2" };
    case "custom":
      if (input.x === undefined || input.y === undefined) return null;
      return { x: `${input.x}`, y: `${input.y}` };
  }
}

async function probed(path: string): Promise<{ ok: true; info: MediaInfo } | { ok: false; response: ToolResponse }> {
  const gate = requireBinary("ffprobe");
  if (!gate.ok) return { ok: false, response: gate.response };
  const result = await probeMedia(path);
  if (!result.ok) {
    return { ok: false, response: failure(result.code, result.error) };
  }
  return { ok: true, info: result.info };
}

async function runOverlay(input: Args): Promise<ToolResponse> {
  if (!input.video || !input.overlay) {
    return failure("missing-inputs", "overlay 需要 video（底图/底视频）与 overlay（叠加素材）");
  }
  for (const candidate of [input.video, input.overlay]) {
    const issue = inputProblem(candidate);
    if (issue) return failure("invalid-input", issue);
  }
  const position = overlayPosition(input);
  if (!position) {
    return failure("missing-position", "position 为 custom 时必须给出 x 与 y");
  }

  const base = await probed(input.video);
  if (!base.ok) return base.response;
  if (!base.info.hasVideo) return failure("missing-video-stream", `${input.video} 没有视频流`);

  const overlayChains: string[] = [];
  if (input.overlayScale) {
    overlayChains.push(`scale=${input.overlayScale}`);
  }
  const opacity = input.opacity;
  if (opacity !== undefined) {
    if (!(opacity > 0 && opacity <= 1)) {
      return failure("invalid-opacity", `opacity 必须在 (0,1] 之间：${opacity}`);
    }
    // The alpha channel only survives when the stream is explicitly rgba.
    overlayChains.push("format=rgba", `colorchannelmixer=aa=${opacity}`);
  }
  const overlayLabel = overlayChains.length ? `[1:v]${overlayChains.join(",")}[ov];` : "";
  const overlayRef = overlayChains.length ? "[ov]" : "1:v";

  const graph = `${overlayLabel}[0:v]${overlayRef}overlay=${position.x}:${position.y}[v]`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    input.video,
    "-i",
    input.overlay,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
  ];
  if (base.info.hasAudio) args.push("-map", "0:a?", "-c:a", "copy");
  else args.push("-an");
  args.push("-c:v", "libx264", "-crf", "23", input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  return respond({
    ok: true,
    operation: "overlay",
    position: input.position ?? "bottom-right",
    opacity: opacity ?? null,
    video: input.video,
    overlay: input.overlay,
    inputBytes: totalInputBytes([input.video, input.overlay]),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function runStack(input: Args): Promise<ToolResponse> {
  const paths = input.inputs ?? [];
  if (paths.length < 2) return failure("missing-inputs", "stack 至少需要两个输入");
  for (const candidate of paths) {
    const issue = inputProblem(candidate);
    if (issue) return failure("invalid-input", issue);
  }

  const infos: MediaInfo[] = [];
  for (const candidate of paths) {
    const result = await probed(candidate);
    if (!result.ok) return result.response;
    if (!result.info.hasVideo) {
      return failure("missing-video-stream", `${candidate} 没有视频流，无法拼版`);
    }
    infos.push(result.info);
  }
  const audioCount = infos.filter((info) => info.hasAudio).length;

  const layout = input.layout ?? "hstack";
  const tile = input.size ? parseSize(input.size) : null;
  if (input.size && !tile) return failure("invalid-size", `size 必须形如 640x360：${input.size}`);

  const firstStream = infos[0]?.streams.find((stream) => stream.type === "video" && stream.width && stream.height);
  const width = tile?.width ?? firstStream?.width;
  const height = tile?.height ?? firstStream?.height;
  if (!width || !height) {
    return failure("unresolved-tile-size", "无法确定每格尺寸；请传 size（例如 640x360）");
  }

  const chains: string[] = [];
  const labels: string[] = [];
  paths.forEach((_, index) => {
    chains.push(
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`,
    );
    labels.push(`[v${index}]`);
  });

  if (layout === "grid") {
    const columns = Math.max(2, Math.min(input.columns ?? 2, paths.length));
    const rows = Math.ceil(paths.length / columns);
    const cells: string[] = [];
    paths.forEach((_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const offsetX = column === 0 ? "0" : `${column}*w0`;
      const offsetY = row === 0 ? "0" : `${row}*h0`;
      cells.push(`${offsetX}_${offsetY}`);
    });
    chains.push(`${labels.join("")}xstack=inputs=${paths.length}:layout=${cells.join("|")}[v]`);
    if (rows * columns < paths.length) {
      return failure("invalid-grid", "grid 布局的列数与输入数量不匹配");
    }
  } else {
    chains.push(`${labels.join("")}${layout}=inputs=${paths.length}[v]`);
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
  ];
  for (const candidate of paths) args.push("-i", candidate);
  // Stacking composes one canvas; per-input audio cannot be merged without a
  // decision the caller must make, so it is dropped and reported.
  args.push("-filter_complex", chains.join(";"), "-map", "[v]", "-an");
  args.push("-c:v", "libx264", "-crf", "23", input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  const payload: Record<string, unknown> = {
    ok: true,
    operation: "stack",
    layout,
    inputCount: paths.length,
    tile: `${width}x${height}`,
    audioDropped: audioCount > 0,
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  if (audioCount > 0) {
    payload.note = "拼版只合成画面，输入音轨未合并；需要音轨请改用其它合成方式";
  }
  return respond(payload);
}

async function runMixAudio(input: Args): Promise<ToolResponse> {
  if (!input.video || !input.audio) {
    return failure("missing-inputs", "mix_audio 需要 video 与 audio 两个输入");
  }
  for (const candidate of [input.video, input.audio]) {
    const issue = inputProblem(candidate);
    if (issue) return failure("invalid-input", issue);
  }
  const videoProbe = await probed(input.video);
  if (!videoProbe.ok) return videoProbe.response;
  if (!videoProbe.info.hasVideo) return failure("missing-video-stream", `${input.video} 没有视频流`);
  const audioProbe = await probed(input.audio);
  if (!audioProbe.ok) return audioProbe.response;
  if (!audioProbe.info.hasAudio) return failure("missing-audio-stream", `${input.audio} 没有音频流`);

  const mode = input.mode ?? "mix";
  if (mode !== "replace" && !videoProbe.info.hasAudio) {
    return failure(
      "missing-audio-stream",
      `${mode} 需要底视频本身带音轨；纯替换音轨请用 mode: "replace"`,
    );
  }

  const musicVolume = input.musicVolume ?? 0.3;
  const originalVolume = input.originalVolume ?? 1;
  let graph: string;
  if (mode === "replace") {
    graph = "[1:a]anull[a]";
  } else if (mode === "duck") {
    // Speech on the base video drives a compressor that pushes the music down.
    graph = [
      `[0:a]volume=${originalVolume},asplit=2[voice][sidechain]`,
      `[1:a]volume=${musicVolume}[music]`,
      `[music][sidechain]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=400[ducked]`,
      `[voice][ducked]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    ].join(";");
  } else {
    graph = [
      `[0:a]volume=${originalVolume}[base]`,
      `[1:a]volume=${musicVolume}[music]`,
      `[base][music]amix=inputs=2:duration=first:dropout_transition=0[a]`,
    ].join(";");
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    "-i",
    input.video,
    "-i",
    input.audio,
    "-filter_complex",
    graph,
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
  ];
  if (input.audioBitrate) args.push("-b:a", input.audioBitrate);
  args.push("-shortest", input.output);

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;
  return respond({
    ok: true,
    operation: "mix_audio",
    mode,
    musicVolume,
    originalVolume,
    video: input.video,
    audio: input.audio,
    inputBytes: totalInputBytes([input.video, input.audio]),
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  });
}

async function handle(input: Args): Promise<ToolResponse> {
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  switch (input.operation) {
    case "overlay":
      return runOverlay(input);
    case "stack":
      return runStack(input);
    case "mix_audio":
      return runMixAudio(input);
  }
}

export function registerMediaLayers(server: McpServer): void {
  server.registerTool(
    "media_layers",
    {
      title: "Overlay, stack and mix",
      description:
        "Compose several streams onto one: overlay places an image or video on top of another (corner presets, margins, opacity), stack joins two or more visuals into one canvas (hstack / vstack / grid; input audio is dropped and reported), and mix_audio blends a background track into a video (mix, replace, or duck where the speech drives a compressor that pushes the music down). Real per-input probing; nothing is overwritten unless overwrite is true.",
      inputSchema: {
        operation: z.enum(OPERATIONS),
        output: z.string().min(1).describe("Absolute output path; its directory must exist"),
        video: z.string().optional().describe("overlay base, or mix_audio video"),
        overlay: z.string().optional().describe("overlay image or video (may carry alpha)"),
        position: z.enum(POSITIONS).optional().describe("Default bottom-right"),
        margin: z.number().int().min(0).max(500).optional().describe("Pixels from the edge, default 16"),
        x: z.number().int().optional().describe("position: custom"),
        y: z.number().int().optional().describe("position: custom"),
        overlayScale: z.string().optional().describe("ffmpeg scale expression for the overlay, e.g. 320:-2"),
        opacity: z.number().gt(0).max(1).optional().describe("Overlay opacity, e.g. 0.6"),
        inputs: z.array(z.string().min(1)).min(2).optional().describe("stack inputs, in order"),
        layout: z.enum(LAYOUTS).optional().describe("Default hstack"),
        columns: z.number().int().min(2).max(6).optional().describe("grid layout columns, default 2"),
        size: z.string().optional().describe("Per-tile WIDTHxHEIGHT, e.g. 640x360"),
        audio: z.string().optional().describe("mix_audio background track"),
        mode: z.enum(MIX_MODES).optional().describe("Default mix"),
        musicVolume: z.number().min(0).max(2).optional().describe("Default 0.3"),
        originalVolume: z.number().min(0).max(2).optional().describe("Default 1"),
        audioBitrate: z.string().optional().describe("e.g. 192k"),
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
