import type { ReactNode } from "react";

import type { ToolCallApi, ToolCallContext, Translate } from "./types";

// Manifest tool name -> locale key. The host resolves tool names for plugin tools
// through `toolNames.<manifest name>` in this plugin's locale files, so the header
// badge and the tool-search list share one definition.
const KEY_BY_TOOL: Record<string, string> = {
  media_env_check: "toolNames.media_env_check",
  media_capabilities: "toolNames.media_capabilities",
  media_probe: "toolNames.media_probe",
  media_analyze: "toolNames.media_analyze",
  media_visualize: "toolNames.media_visualize",
  media_transcode: "toolNames.media_transcode",
  media_cut: "toolNames.media_cut",
  media_extract_audio: "toolNames.media_extract_audio",
  media_frames: "toolNames.media_frames",
  media_gif: "toolNames.media_gif",
  media_compose: "toolNames.media_compose",
  media_layers: "toolNames.media_layers",
  media_effects: "toolNames.media_effects",
  media_draw: "toolNames.media_draw",
  media_subtitles: "toolNames.media_subtitles",
  media_metadata: "toolNames.media_metadata",
  media_stream: "toolNames.media_stream",
  media_capture: "toolNames.media_capture",
  media_run: "toolNames.media_run",
};

// Lucide names; the host hands plugins the whole lucide namespace and resolves them with
// `icons[name]`, so every name below was checked against the installed lucide-react
// (1.28.0: `CheckCircle2` and `Waves` are gone, `CircleCheck` and `AudioLines` exist).
const ICON_BY_TOOL: Record<string, string> = {
  media_env_check: "CircleCheck",
  media_capabilities: "List",
  media_probe: "Search",
  media_analyze: "Activity",
  media_visualize: "AudioLines",
  media_transcode: "Repeat",
  media_cut: "Scissors",
  media_extract_audio: "Music",
  media_frames: "Image",
  media_gif: "Film",
  media_compose: "Clapperboard",
  media_layers: "Layers",
  media_effects: "Sparkles",
  media_draw: "PenTool",
  media_subtitles: "Captions",
  media_metadata: "Tags",
  media_stream: "Radio",
  media_capture: "Camera",
  media_run: "Terminal",
};

const MAX_DETAIL_LINES = 12;
const MAX_STREAM_ROWS = 40;
const MAX_LOG_HEAD = 8;
const MAX_LOG_TAIL = 4;

type Frame = typeof import("react");

type ToolRef = { tool: string; key: string };

// Returns the manifest tool name *and* its locale key: the icon table is keyed by the
// tool name, the badge by the locale key, and mixing them up silently hides every icon.
function resolveToolRef(context: ToolCallContext): ToolRef | null {
  const original = context.toolCall.originalToolName;
  const originalKey = original ? KEY_BY_TOOL[original] : undefined;
  if (original && originalKey) return { tool: original, key: originalKey };
  const name = context.toolCall.name;
  const nameKey = KEY_BY_TOOL[name];
  if (nameKey) return { tool: name, key: nameKey };
  for (const [tool, key] of Object.entries(KEY_BY_TOOL)) {
    if (name.endsWith(`-${tool}`) || name.endsWith(`_${tool}`)) return { tool, key };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record) rows.push(record);
  }
  return rows;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function basename(target: string): string {
  const parts = target.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? target;
}

function formatBytes(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`;
}

function formatLength(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const fraction = value - totalSeconds;
  const tail =
    fraction > 0.05
      ? `${String(seconds).padStart(2, "0")}.${Math.round(fraction * 10)}`
      : String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${tail}`;
  return `${minutes}:${tail}`;
}

function formatElapsed(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= 10_000 ? `${(value / 1000).toFixed(0)}s` : `${(value / 1000).toFixed(1)}s`;
}

function formatBitRate(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value / 1000)} kbps`;
}

function formatResolution(stream: Record<string, unknown>): string | null {
  const width = stream.width;
  const height = stream.height;
  if (typeof width !== "number" || typeof height !== "number") return null;
  return `${width}x${height}`;
}

function formatValue(value: unknown, suffix = ""): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}${suffix}`;
  return typeof value === "string" && value !== "" ? `${value}${suffix}` : null;
}

function joinFacts(parts: (string | null | undefined)[]): string | null {
  const kept = parts.filter((part): part is string => typeof part === "string" && part !== "");
  return kept.length ? kept.join(" · ") : null;
}

// 44 protocol names in a single line would flood the card; the remainder is stated.
function joinCapped(names: string[], limit: number): string {
  if (names.length <= limit) return names.join(" · ");
  return `${names.slice(0, limit).join(" · ")} +${names.length - limit}`;
}

function shortMessage(payload: Record<string, unknown>): string | null {
  return text(payload.message) ?? text(payload.error);
}

// An encoder banner is mostly noise in a chat card, so a long log keeps its head and
// tail and states how many lines were cut instead of silently dropping them.
function logExcerpt(api: ToolCallApi, value: string): string {
  const lines = value.split(/\r?\n/);
  if (lines.length <= MAX_LOG_HEAD + MAX_LOG_TAIL + 1) return value;
  const hidden = lines.length - MAX_LOG_HEAD - MAX_LOG_TAIL;
  const marker = api.t("label.omittedLines", { values: { count: hidden } });
  return [
    ...lines.slice(0, MAX_LOG_HEAD),
    marker,
    ...lines.slice(-MAX_LOG_TAIL),
  ].join("\n");
}

type Header = {
  displayName?: ReactNode;
  displayNameTitle?: string;
  meta?: ReactNode;
};

function iconFor(key: string): string | null {
  return ICON_BY_TOOL[key] ?? null;
}

type IconComponent = (props: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) => ReactNode;

// The tool's own icon is handed to the host badge (`badgeIcon`), which owns the glyph
// styling; the plugin only supplies the element from the host's lucide namespace.
function iconNode(React: Frame, api: ToolCallApi, key: string): ReactNode | undefined {
  const iconName = iconFor(key);
  if (!iconName) return undefined;
  const Icon = api.ui.icon(iconName) as IconComponent | undefined;
  if (!Icon) return undefined;
  return React.createElement(Icon, {
    size: 10,
    strokeWidth: 1.9,
    className: "tool-call-tool-name-icon",
  });
}

// The header stays to two facts at most: everything else lives in the body.
function headerMeta(api: ToolCallApi, payload: Record<string, unknown>): string | null {
  // A failure states "failed" in the header; the real message belongs in the body.
  if (payload.ok === false) return api.t("status.error");

  const media = asRecord(payload.media);
  if (media) {
    const kind = text(media.kind);
    const videoStream = asRows(media.streams).find((stream) => formatResolution(stream));
    return joinFacts([
      kind ? api.t(`kind.${kind}`) : null,
      videoStream ? formatResolution(videoStream) : null,
    ]);
  }

  const counts = asRecord(payload.counts);
  if (counts) {
    const filters = typeof counts.filters === "number" ? counts.filters : null;
    const encoders = typeof counts.encoders === "number" ? counts.encoders : null;
    return joinFacts([
      filters === null ? null : `${filters} ${api.t("label.filters")}`,
      encoders === null ? null : `${encoders} ${api.t("label.encoders")}`,
    ]);
  }
  if (typeof payload.version === "string") {
    // "ffmpeg version 9.0.2-full_build-…" -> "ffmpeg 9.0.2"
    const match = /^ffmpeg version (\S+)/.exec(payload.version);
    return match?.[1] ? `ffmpeg ${match[1]}` : null;
  }
  if (typeof payload.total === "number") {
    return `${api.t("label.total")} ${payload.total}`;
  }
  if (Array.isArray(payload.findings)) {
    return `${api.t("label.findings")} ${payload.findings.length}`;
  }
  if (payload.exitCode !== undefined && payload.exitCode !== null) {
    return `${api.t("label.exitCode")} ${String(payload.exitCode)}`;
  }

  const streams = asRows(payload.streams);
  if (streams.length && !asRows(payload.outputs).length) {
    return joinFacts([
      `${streams.length} ${api.t("column.stream")}`,
      formatBytes(payload.sizeBytes),
    ]);
  }
  const deviceCount =
    (Array.isArray(payload.videoDevices) ? payload.videoDevices.length : 0) +
    (Array.isArray(payload.audioDevices) ? payload.audioDevices.length : 0);
  if (deviceCount) {
    return `${deviceCount} ${api.t("label.devices")}`;
  }

  const outputs = asRows(payload.outputs);
  const first = outputs[0];
  const outputBytes = first ? first.sizeBytes : undefined;
  const inputBytes = payload.inputBytes;

  if (!outputs.length && Array.isArray(payload.segments)) {
    return `${api.t("label.segments")} ${payload.segments.length}`;
  }
  if (!outputs.length && Array.isArray(payload.list)) {
    return `${api.t("label.total")} ${payload.list.length}`;
  }
  if (!outputs.length && typeof payload.frameCount === "number") {
    return `${api.t("label.frames")} ${payload.frameCount}`;
  }
  if (!outputs.length && typeof payload.count === "number") {
    return `${api.t("label.count")} ${payload.count}`;
  }

  const comparison =
    typeof inputBytes === "number" &&
    typeof outputBytes === "number" &&
    text(payload.input) !== null
      ? `${formatBytes(inputBytes)} → ${formatBytes(outputBytes)}`
      : formatBytes(outputBytes);

  const effect = text(payload.effect);
  if (effect) return joinFacts([localizedValue(api, "effect", effect), comparison]);
  // ffprobe reports every container alias ("mov,mp4,m4a,3gp,3g2,mj2"); only the first
  // one belongs in a one-line header.
  const container = text(payload.container);
  return joinFacts([container ? container.split(",")[0] : null, comparison]);
}

function primaryPath(payload: Record<string, unknown>): string | null {
  const first = asRows(payload.outputs)[0];
  const output = first ? text(first.path) : null;
  if (output) return output;
  return text(payload.outputDir) ?? text(payload.input) ?? text(payload.path);
}

function headerFor(
  React: Frame,
  api: ToolCallApi,
  key: string,
  payload: Record<string, unknown>,
  fallbackPath?: string | null,
): Header {
  const header: Header = {};
  // Failed calls still name the file they were asked to work on.
  const path = primaryPath(payload) ?? fallbackPath ?? null;
  if (path) {
    header.displayName = basename(path);
    header.displayNameTitle = path;
  }
  const meta = headerMeta(api, payload);
  if (meta) header.meta = meta;
  return header;
}

// A cell may carry the real file path: the host delegates Ctrl+click on [data-path]
// to its file opener, which plays media in the built-in browser and sends images/PDF
// there too.
type GridEntry = [label: string, value: string, path?: string];

function grid(React: Frame, entries: GridEntry[]): ReactNode | null {
  if (!entries.length) return null;
  const children: ReactNode[] = [];
  entries.forEach(([label, value, path], index) => {
    children.push(
      React.createElement("span", { className: "ffmpeg-tools-key", key: `k:${index}` }, label),
      React.createElement(
        "span",
        {
          className: path ? "ffmpeg-tools-value ffmpeg-tools-path" : "ffmpeg-tools-value",
          key: `v:${index}`,
          title: path ?? value,
          ...(path ? { "data-path": path } : {}),
        },
        value,
      ),
    );
  });
  return React.createElement("div", { className: "ffmpeg-tools-grid" }, ...children);
}

function outputsEntries(
  api: ToolCallApi,
  payload: Record<string, unknown>,
): GridEntry[] {
  const entries: GridEntry[] = [];
  for (const output of asRows(payload.outputs)) {
    const path = text(output.path);
    if (!path) continue;
    const size = formatBytes(output.sizeBytes);
    entries.push([api.t("label.output"), size ? `${path}  ${size}` : path, path]);
  }
  return entries;
}

const MAX_PREVIEWS = 3;

// Preview only what the host can actually serve: `ui.media` is absent on older hosts and
// `supports()` rejects non-media extensions, so no player is drawn for an unplayable path.
function previewPaths(
  api: ToolCallApi,
  payload: Record<string, unknown>,
): string[] {
  const media = api.ui.media;
  if (!media) return [];
  const paths: string[] = [];
  for (const output of asRows(payload.outputs)) {
    const path = text(output.path);
    if (!path || paths.includes(path) || !media.supports(path)) continue;
    paths.push(path);
    if (paths.length >= MAX_PREVIEWS) break;
  }
  return paths;
}

// The first artifact gets the real player, the rest "click to play" covers: a card with
// three inline videos would dominate the conversation.
function previewBlock(api: ToolCallApi, paths: string[]): ReactNode | null {
  const media = api.ui.media;
  if (!media || !paths.length) return null;
  const { React } = api.ui;
  const title = api.t("label.preview");
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-previews" },
    ...paths.map((path, index) =>
      React.createElement(media.Preview, {
        key: path,
        src: path,
        title,
        mode: index === 0 ? "inline" : "thumbnail",
        className: "ffmpeg-tools-preview",
      }),
    ),
  );
}

function audioFacts(stream: Record<string, unknown>, api: ToolCallApi): string {
  return (
    [
      formatValue(stream.codec),
      formatValue(stream.sampleRate, " Hz"),
      formatValue(stream.channels, " ch"),
      formatBitRate(stream.bitRate),
    ]
      .filter((item): item is string => item !== null)
      .join(" · ") || api.t("kind.audio")
  );
}

function probeBody(
  api: ToolCallApi,
  payload: Record<string, unknown>,
  fallbackPath?: string | null,
): ReactNode {
  const { React } = api.ui;
  const media = asRecord(payload.media);
  if (!media) return failureBody(api, payload, JSON.stringify(payload));
  const t = api.t;

  const entries: [string, string][] = [];
  const kind = text(media.kind);
  if (kind) entries.push([t("column.type"), t(`kind.${kind}`)]);
  const container = text(media.container);
  if (container) entries.push([t("label.container"), container]);
  const length = formatLength(media.durationSeconds);
  if (length) entries.push([t("label.length"), length]);
  const size = formatBytes(media.sizeBytes);
  if (size) entries.push([t("label.size"), size]);
  const bitRate = formatBitRate(media.bitRate);
  if (bitRate) entries.push([t("label.bitRate"), bitRate]);

  const streams = asRows(media.streams).slice(0, MAX_STREAM_ROWS);
  const visualStreams = streams.filter((stream) => text(stream.type) !== "audio");
  const audioStreams = streams.filter((stream) => text(stream.type) === "audio");

  const children: ReactNode[] = [];
  // Probe answers "what is inside this file", so show the file itself first.
  const source = text(payload.input) ?? text(payload.path) ?? fallbackPath;
  const mediaApi = api.ui.media;
  if (source && mediaApi?.supports(source)) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-previews" },
        React.createElement(mediaApi.Preview, {
          src: source,
          title: t("label.preview"),
          mode: "inline",
          className: "ffmpeg-tools-preview",
        }),
      ),
    );
  }
  const summary = grid(React, entries);
  if (summary) children.push(summary);

  const streamTable = tableRows(
    api,
    "streams",
    [
      t("column.stream"),
      t("column.type"),
      t("column.codec"),
      t("column.resolution"),
      t("column.fps"),
    ],
    visualStreams.map((stream) => [
      formatValue(stream.index) ?? "",
      kindCell(api, stream.type),
      formatValue(stream.codec) ?? "",
      formatResolution(stream) ?? "",
      formatValue(stream.fps) ?? "",
    ]),
  );
  if (streamTable) {
    children.push(streamTable);
  } else if (visualStreams.length) {
    const fallback = grid(
      React,
      visualStreams.map((stream) => [
        `${t("column.stream")} ${formatValue(stream.index) ?? ""}`,
        [
          kindCell(api, stream.type),
          formatValue(stream.codec),
          formatResolution(stream),
          formatValue(stream.fps, " fps"),
        ]
          .filter((item): item is string => item !== null)
          .join(" · "),
      ]),
    );
    if (fallback) children.push(fallback);
  }

  // Audio never needs the video columns, so it gets its own compact block.
  if (audioStreams.length) {
    const audioGrid = grid(
      React,
      audioStreams.map((stream, index) => [
        `${t("kind.audio")} ${index + 1}`,
        audioFacts(stream, api),
      ]),
    );
    if (audioGrid) children.push(audioGrid);
  }

  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}

// Payload key -> locale label. A value without an entry keeps its technical name, so a
// new field is never silently dropped from the card.
const FIELD_LABELS: Record<string, string> = {
  operation: "label.operation",
  target: "label.target",
  container: "label.container",
  durationSeconds: "label.length",
  startSeconds: "label.start",
  endSeconds: "label.end",
  totalSeconds: "label.total",
  frameCount: "label.frames",
  frames: "label.frames",
  count: "label.count",
  sizeBytes: "label.size",
  bitRate: "label.bitRate",
  bitrate: "label.bitRate",
  fps: "label.fps",
  size: "label.size",
  scale: "label.scale",
  width: "label.width",
  height: "label.height",
  loop: "label.loop",
  maxColors: "label.colors",
  dither: "label.dither",
  passes: "label.passes",
  paletteRemoved: "label.palette",
  filter: "label.filter",
  effect: "label.effect",
  effectStrength: "label.strength",
  fit: "label.fit",
  mode: "label.mode",
  layout: "label.layout",
  columns: "label.columns",
  position: "label.position",
  margin: "label.margin",
  opacity: "label.opacity",
  musicVolume: "label.musicVolume",
  originalVolume: "label.originalVolume",
  audioDropped: "label.audioDropped",
  videoCodec: "label.videoCodec",
  audioCodec: "label.audioCodec",
  codec: "label.codec",
  track: "label.track",
  crf: "label.crf",
  preset: "label.preset",
  "hardware": "label.hardware",
  acceleration: "label.acceleration",
  gpuApi: "label.gpuApi",
  gpuArgs: "label.gpuArgs",
  gpuNotes: "label.gpuNotes",
  videoEncoder: "label.videoCodec",
  twoPass: "label.twoPass",
  segmentSeconds: "label.segmentLength",
  segmentCount: "label.segments",
  playlist: "label.playlist",
  playlistName: "label.playlist",
  url: "label.url",
  language: "label.language",
  title: "label.title",
  degrees: "label.degrees",
  subtitlePath: "label.subtitle",
  style: "label.style",
  forceStyle: "label.style",
  binary: "label.binary",
  network: "label.network",
  intervalSeconds: "label.interval",
  version: "label.version",
  items: "label.items",
  audioDevices: "label.audio",
  videoDevices: "label.video",
  note: "label.note",
  platform: "label.platform",
  subtitleCodec: "label.codec",
  samples: "label.count",
  tileWidth: "label.width",
  inputCount: "label.sources",
  withAudio: "label.audio",
  canvas: "label.canvas",
  initSegments: "label.initSegments",
  manifest: "label.manifest",
  manifestPortable: "label.portable",
  videoBitrate: "label.videoBitRate",
  audioBitrate: "label.audioBitRate",
  seekSeconds: "label.position",
  windowTargetHint: "label.hint",
};

// Rendered by a dedicated block (or never shown): everything else becomes a field row.
const RESERVED_KEYS = new Set([
  "ok",
  "error",
  "message",
  "guidance",
  "hint",
  "media",
  "streams",
  "counts",
  "names",
  "matches",
  "findings",
  "summary",
  "outputs",
  "logLines",
  "stderrTail",
  "stdoutTail",
  "binaries",
  "encoders",
  "hwaccels",
  "protocols",
  "unavailable",
  "settings",
  "tags",
  "segments",
  "list",
  "chapters",
  "attempts",
  "expectedOutput",
  "initSegmentCount",
  "input",
  "path",
  "video",
  "audio",
  "overlay",
  "inputs",
  "inputBytes",
  "elapsedMs",
  "outputDir",
  "query",
  "kind",
  "total",
]);

// Payload fields whose value is a fixed enum token; an unknown token keeps its raw name.
const VALUE_FIELDS = new Set([
  "operation",
  "effect",
  "mode",
  "fit",
  "target",
  "hardware",
  "layout",
  "position",
  "dither",
  "axis",
  "key",
  "binary",
  "kind",
]);

function localizedValue(api: ToolCallApi, field: string, raw: string): string {
  if (!VALUE_FIELDS.has(field)) return raw;
  const key = `value.${field}.${raw}`;
  const label = api.t(key);
  return label && label !== key ? label : raw;
}

function kindLabel(api: ToolCallApi, raw: string): string {
  const key = `kind.${raw}`;
  const label = api.t(key);
  return label && label !== key ? label : raw;
}

function kindCell(api: ToolCallApi, value: unknown): string {
  const raw = text(value);
  return raw ? kindLabel(api, raw) : "";
}

function fieldValue(key: string, value: unknown, api: ToolCallApi): string | null {
  if (typeof value === "boolean") return api.t(value ? "label.yes" : "label.no");
  if (typeof value === "number" && Number.isFinite(value)) {
    if (key.endsWith("Bytes")) return formatBytes(value);
    if (key.endsWith("Seconds") || key === "start" || key === "end") return formatLength(value);
    if (key === "bitRate" || key === "bitrate") return formatBitRate(value);
    if (key === "fps") return `${value} fps`;
    return String(value);
  }
  if (typeof value === "string") {
    return value === "" ? null : localizedValue(api, key, value);
  }
  const names = joinedNames(value);
  return names.length
    ? names.map((name) => localizedValue(api, key, name)).join(" · ")
    : null;
}

function joinedNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  const record = asRecord(value);
  if (!record) return [];
  const names: string[] = [];
  for (const [group, list] of Object.entries(record)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") names.push(`${group}: ${item}`);
    }
  }
  return names;
}

// One table builder for every list-shaped payload the card renders.
function tableRows(
  api: ToolCallApi,
  tableKey: string,
  columns: string[],
  rows: unknown[][],
): ReactNode | null {
  const Table = api.ui.DataTableViewer;
  if (!Table || !rows.length) return null;
  return api.ui.React.createElement(Table, {
    key: tableKey,
    columns,
    rows,
    className: "ffmpeg-tools-table",
    maxInitialRows: 10,
    enableExport: false,
  });
}

function labelFor(api: ToolCallApi, key: string): string {
  const localeKey = FIELD_LABELS[key];
  return (localeKey ? api.t(localeKey) : "") || key;
}

// The general body: the files involved, every scalar the tool reported, the real output
// sizes and the list-shaped extras (streams, subtitle tracks, chapters, segments).
function factsBody(api: ToolCallApi, payload: Record<string, unknown>): ReactNode {
  const { React } = api.ui;
  const t = api.t;
  const children: ReactNode[] = [];
  const entries: GridEntry[] = [];

  const source = text(payload.input) ?? text(payload.path);
  if (source) {
    const size = formatBytes(payload.inputBytes);
    entries.push([t("label.input"), size ? `${source}  ${size}` : source, source]);
  }
  const video = text(payload.video);
  if (video) entries.push([t("label.video"), video, video]);
  const audio = text(payload.audio);
  if (audio) entries.push([t("label.audio"), audio, audio]);
  const overlay = text(payload.overlay);
  if (overlay) entries.push([t("label.overlay"), overlay, overlay]);

  const sources = joinedNames(payload.inputs);
  if (sources.length) {
    const shown = sources.slice(0, 4).map(basename).join(" · ");
    entries.push([
      t("label.sources"),
      sources.length > 4 ? `${shown} +${sources.length - 4}` : shown,
    ]);
  }

  for (const [name, value] of Object.entries(payload)) {
    if (RESERVED_KEYS.has(name) || name === "devices") continue;
    const formatted = fieldValue(name, value, api);
    if (formatted) entries.push([labelFor(api, name), formatted]);
  }
  for (const name of joinedNames(payload.devices)) {
    entries.push([t("label.devices"), name]);
  }

  entries.push(...outputsEntries(api, payload));
  const directory = text(payload.outputDir);
  if (directory) entries.push([t("label.directory"), directory]);
  const elapsed = formatElapsed(payload.elapsedMs);
  if (elapsed) entries.push([t("label.duration"), elapsed]);

  const summaryGrid = grid(React, entries);
  const preview = previewBlock(api, previewPaths(api, payload));
  if (preview) children.push(preview);
  if (summaryGrid) children.push(summaryGrid);

  for (const block of [asRecord(payload.settings), asRecord(payload.tags)]) {
    if (!block) continue;
    const blockEntries: [string, string][] = [];
    for (const [name, value] of Object.entries(block)) {
      const formatted = fieldValue(name, value, api);
      if (formatted) blockEntries.push([labelFor(api, name), formatted]);
    }
    const blockGrid = grid(React, blockEntries);
    if (blockGrid) children.push(blockGrid);
  }

  const streams = asRows(payload.streams);
  const streamTable = tableRows(
    api,
    "streams",
    [
      t("column.stream"),
      t("column.type"),
      t("column.codec"),
      t("column.language"),
      t("label.default"),
      t("label.forced"),
    ],
    streams.slice(0, MAX_STREAM_ROWS).map((stream) => [
      formatValue(stream.index) ?? "",
      kindCell(api, stream.type),
      formatValue(stream.codec) ?? "",
      formatValue(stream.language) ?? "",
      stream.default === true ? t("label.yes") : t("label.no"),
      stream.forced === true ? t("label.yes") : t("label.no"),
    ]),
  );
  if (streamTable) children.push(streamTable);

  const tracks = asRows(payload.list);
  const trackTable = tableRows(
    api,
    "tracks",
    [
      t("column.stream"),
      t("column.codec"),
      t("column.language"),
      t("label.title"),
      t("label.default"),
      t("label.forced"),
    ],
    tracks.slice(0, MAX_STREAM_ROWS).map((track) => [
      formatValue(track.index) ?? "",
      formatValue(track.codec) ?? "",
      formatValue(track.language) ?? "",
      formatValue(track.title) ?? "",
      track.default === true ? t("label.yes") : t("label.no"),
      track.forced === true ? t("label.yes") : t("label.no"),
    ]),
  );
  if (trackTable) children.push(trackTable);

  const chapters = asRows(payload.chapters);
  const chapterTable = tableRows(
    api,
    "chapters",
    [t("label.start"), t("label.end"), t("label.title")],
    chapters.map((chapter) => [
      formatLength(chapter.start) ?? formatValue(chapter.start) ?? "",
      formatLength(chapter.end) ?? formatValue(chapter.end) ?? "",
      formatValue(chapter.title) ?? "",
    ]),
  );
  if (chapterTable) children.push(chapterTable);

  const segments = asRows(payload.segments);
  if (segments.length) {
    const segmentGrid = grid(
      React,
      segments.slice(0, MAX_STREAM_ROWS).map((segment) => [
        basename(text(segment.path) ?? ""),
        formatBytes(segment.sizeBytes) ?? "",
      ]),
    );
    if (segmentGrid) children.push(segmentGrid);
  }

  // A tool hint (e.g. "no subtitle stream, use convert") is part of the answer, not noise.
  const hint = text(payload.hint);
  if (hint) {
    children.push(
      React.createElement("div", { className: "ffmpeg-tools-detail", key: "hint" }, hint),
    );
  }

  // Device enumeration records what it tried and how each attempt ended.
  const attempts = asRows(payload.attempts);
  const attemptTable = tableRows(
    api,
    "attempts",
    [t("label.command"), t("label.exitCode")],
    attempts.map((attempt) => [
      formatValue(attempt.command) ?? "",
      formatValue(attempt.exitCode) ?? "",
    ]),
  );
  if (attemptTable) children.push(attemptTable);

  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}

function failureBody(
  api: ToolCallApi,
  payload: Record<string, unknown>,
  raw: string,
): ReactNode {
  const { React } = api.ui;
  const message = shortMessage(payload) ?? api.t("status.error");
  const children: ReactNode[] = [React.createElement("div", { key: "message" }, message)];

  const guidance = Array.isArray(payload.guidance)
    ? payload.guidance.filter((item): item is string => typeof item === "string")
    : [];
  for (const step of guidance.slice(0, MAX_DETAIL_LINES)) {
    if (step === message) continue;
    children.push(
      React.createElement("div", { className: "ffmpeg-tools-detail", key: `g:${step}` }, step),
    );
  }

  const detail = text(payload.stderrTail);
  if (detail) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "stderr" },
        logExcerpt(api, detail),
      ),
    );
  } else if (!guidance.length && message === raw) {
    children.push(
      React.createElement("div", { className: "ffmpeg-tools-detail", key: "raw" }, raw),
    );
  }

  return React.createElement(
    "div",
    { className: "ffmpeg-tools-body ffmpeg-tools-failure" },
    ...children,
  );
}

function looksLikePayload(value: Record<string, unknown>): boolean {
  return (
    value.ok !== undefined ||
    value.media !== undefined ||
    value.outputs !== undefined ||
    value.operation !== undefined
  );
}

/**
 * The card receives the raw MCP CallToolResult
 * (`{ content: [{ type, text }], structuredContent }`), not the tool's own payload,
 * so the payload is unwrapped before anything is rendered.
 */
function payloadFromResult(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (!direct) return null;
  if (looksLikePayload(direct)) return direct;

  const structured = asRecord(direct.structuredContent);
  if (structured && looksLikePayload(structured)) return structured;

  for (const block of Array.isArray(direct.content) ? direct.content : []) {
    const record = asRecord(block);
    const raw = record ? text(record.text) : null;
    if (!raw) continue;
    try {
      const parsed = asRecord(JSON.parse(raw));
      if (parsed && looksLikePayload(parsed)) return parsed;
    } catch {
      // A non-JSON text block is not this plugin's payload; keep looking.
    }
  }
  if (structured) return structured;
  return null;
}

// Transport/permission failures arrive as `{ error }` rather than as this plugin's
// payload; they are reported as a plain sentence instead of a raw JSON blob.
function rawFailureMessage(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;
  return text(record.error) ?? text(record.message);
}

function argumentPaths(context: ToolCallContext): string | null {
  try {
    const parsed = asRecord(JSON.parse(context.toolCall.arguments));
    if (!parsed) return null;
    return text(parsed.output) ?? text(parsed.path) ?? text(parsed.input) ?? null;
  } catch {
    return null;
  }
}

function namedEntries(
  source: Record<string, unknown> | null,
  filter: (value: unknown) => boolean,
): [string, string][] {
  const entries: [string, string][] = [];
  if (!source) return entries;
  for (const [name, value] of Object.entries(source)) {
    if (filter(value)) entries.push([name, String(value)]);
  }
  return entries;
}

// Environment self-check: version, resolved binaries and the encoders that exist.
function environmentBody(api: ToolCallApi, payload: Record<string, unknown>): ReactNode {
  const { React } = api.ui;
  const entries: [string, string][] = [];
  const version = text(payload.version);
  if (version) entries.push([api.t("label.version"), version]);
  const binaries = asRecord(payload.binaries);
  for (const name of ["ffmpeg", "ffprobe"]) {
    const info = binaries ? asRecord(binaries[name]) : null;
    const resolved = info ? text(info.path) : null;
    if (resolved) entries.push([name, resolved]);
  }
  const encoders = asRecord(payload.encoders);
  const available = encoders
    ? Object.entries(encoders)
        .filter(([, value]) => value === true)
        .map(([name]) => name)
    : [];
  if (available.length) entries.push([api.t("label.encoders"), available.join(" · ")]);
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-body" },
    grid(React, entries),
  );
}

// Capability inventory: either the per-family counts or a list of matching names.
function capabilitiesBody(api: ToolCallApi, payload: Record<string, unknown>): ReactNode {
  const { React } = api.ui;
  const t = api.t;
  const counts = asRecord(payload.counts);
  if (counts) {
    const entries = namedEntries(counts, (value) => typeof value === "number");
    const hwaccels = (payload.hwaccels as unknown[] | undefined)?.filter(
      (item): item is string => typeof item === "string",
    );
    const protocols = (payload.protocols as unknown[] | undefined)?.filter(
      (item): item is string => typeof item === "string",
    );
    if (hwaccels?.length) entries.push([t("label.hwaccels"), joinCapped(hwaccels, 10)]);
    if (protocols?.length) entries.push([t("label.protocols"), joinCapped(protocols, 10)]);
    return React.createElement(
      "div",
      { className: "ffmpeg-tools-body" },
      grid(React, entries),
    );
  }

  const names: [string, string][] = [];
  if (Array.isArray(payload.names)) {
    for (const name of payload.names) {
      if (typeof name === "string") names.push([text(payload.kind) ?? "", name]);
    }
  } else {
    const matches = asRecord(payload.matches);
    if (matches) {
      for (const [kind, list] of Object.entries(matches)) {
        if (!Array.isArray(list)) continue;
        for (const name of list) {
          if (typeof name === "string") names.push([kind, name]);
        }
      }
    }
  }
  const children: ReactNode[] = [];
  const shown = names.slice(0, 20);
  const body = grid(React, shown);
  if (body) children.push(body);
  if (typeof payload.total === "number" || names.length > shown.length) {
    const total = typeof payload.total === "number" ? payload.total : names.length;
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "total" },
        `${t("label.total")} ${total}`,
      ),
    );
  }
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}

// Analysis: the scalar summary plus the detected intervals or scene scores.
function analyzeBody(api: ToolCallApi, payload: Record<string, unknown>): ReactNode {
  const { React } = api.ui;
  const t = api.t;
  const children: ReactNode[] = [];

  const summary = asRecord(payload.summary);
  const summaryEntries = namedEntries(
    summary,
    (value) => typeof value === "number" || typeof value === "string",
  );
  const summaryGrid = grid(React, summaryEntries);
  if (summaryGrid) children.push(summaryGrid);

  const findings = asRows(payload.findings);
  const scored = findings.some((item) => typeof item.score === "number");
  const findingTable = tableRows(
    api,
    "findings",
    scored
      ? [t("column.stream"), t("label.score")]
      : [t("label.start"), t("label.end"), t("label.length")],
    findings.slice(0, 100).map((item) =>
      scored
        ? [
            formatLength(item.timeSeconds) ?? formatValue(item.timeSeconds) ?? "",
            formatValue(item.score) ?? "",
          ]
        : [
            formatLength(item.start) ?? formatValue(item.start) ?? "",
            formatLength(item.end) ?? formatValue(item.end) ?? "",
            formatValue(item.durationSeconds, "s") ?? "",
          ],
    ),
  );
  if (findingTable) {
    children.push(findingTable);
  } else if (findings.length) {
    const fallback = grid(
      React,
      findings.slice(0, 30).map((item, index) => [
        `#${index + 1}`,
        Object.values(item)
          .filter((value) => typeof value === "number" || typeof value === "string")
          .join(" · "),
      ]),
    );
    if (fallback) children.push(fallback);
  }

  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}

// Raw escape hatch: exit status plus the real stream tails.
function runBody(api: ToolCallApi, payload: Record<string, unknown>): ReactNode {
  const { React } = api.ui;
  const t = api.t;
  const entries: [string, string][] = [];
  const binary = text(payload.binary);
  if (binary) entries.push([t("label.binary"), binary]);
  if (payload.exitCode !== undefined && payload.exitCode !== null) {
    entries.push([t("label.exitCode"), String(payload.exitCode)]);
  }
  const elapsed = formatElapsed(payload.elapsedMs);
  if (elapsed) entries.push([t("label.duration"), elapsed]);

  const children: ReactNode[] = [];
  const summaryGrid = grid(React, entries);
  if (summaryGrid) children.push(summaryGrid);

  // media_run reports the size change of the file the caller expected it to write.
  const expected = asRecord(payload.expectedOutput);
  if (expected) {
    const expectedEntries: [string, string][] = [];
    const target = text(expected.path);
    if (target) expectedEntries.push([t("label.output"), target]);
    const after = formatBytes(expected.sizeBytesAfter);
    if (after) expectedEntries.push([t("label.size"), after]);
    if (typeof expected.written === "boolean") {
      expectedEntries.push([
        t("label.written"),
        expected.written ? t("label.yes") : t("label.no"),
      ]);
    }
    const expectedGrid = grid(React, expectedEntries);
    if (expectedGrid) children.push(expectedGrid);
    // A written expectOutput is a real artifact, so it gets the same preview as the
    // high-level tools instead of being the only silent output path.
    const created = text(expected.path);
    const mediaApi = api.ui.media;
    if (created && expected.written === true && mediaApi?.supports(created)) {
      children.push(
        React.createElement(
          "div",
          { className: "ffmpeg-tools-previews" },
          React.createElement(mediaApi.Preview, {
            src: created,
            title: t("label.preview"),
            mode: "inline",
            className: "ffmpeg-tools-preview",
          }),
        ),
      );
    }
  }

  const stdout = text(payload.stdoutTail);
  if (stdout) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "out" },
        `${t("label.stdout")} · ${logExcerpt(api, stdout)}`,
      ),
    );
  }
  const stderr = text(payload.stderrTail);
  if (stderr) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "err" },
        `${t("label.stderr")} · ${logExcerpt(api, stderr)}`,
      ),
    );
  }
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}

// The host stamps the moment a call started running; without that stamp the card would
// have to guess, so elapsed time is shown only when the host provided it.
function useElapsed(React: Frame, startedAt: number | undefined): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (startedAt === undefined) return 0;
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

function parseClock(value: string): number | null {
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const numbers = parts.map((part) => Number.parseFloat(part));
  if (numbers.some((item) => !Number.isFinite(item) || item < 0)) return null;
  const first = numbers[0] ?? 0;
  const second = numbers[1] ?? 0;
  const seconds =
    parts.length === 3 ? first * 3600 + second * 60 + (numbers[2] ?? 0) : first * 60 + second;
  return seconds > 0 ? seconds : null;
}

// A progress bar only exists for the operations whose total is bounded by the caller's
// own durationSeconds (recording). Encodes of unknown length get elapsed time only:
// no percentage is invented, and media_cut's "duration" is a clip length, not a total.
function progressTotal(tool: string, raw: string): number | null {
  if (tool !== "media_capture" && tool !== "media_stream") return null;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
  if (!parsed) return null;
  if (tool === "media_stream" && parsed.operation !== "record") return null;
  const value = parsed.durationSeconds;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") return parseClock(value);
  return null;
}

// Compact clock for live facts: 42s, 3:07, 1:02:09.
function formatSeconds(value: number): string {
  const total = Math.max(0, Math.round(value));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

type RunningProps = {
  api: ToolCallApi;
  label: string;
  startedAt: number | undefined;
  totalSeconds: number | null;
};

// Header fact while running: real elapsed time, ticking once per second. Sub-second
// calls (env check, probe, capability inventory) keep the plain status instead of
// flashing a timer that reads 0s.
function ElapsedMeta({ api, label, startedAt, totalSeconds }: RunningProps): ReactNode {
  const seconds = useElapsed(api.ui.React, startedAt);
  if (startedAt === undefined || seconds < 1) return label;
  if (totalSeconds === null) {
    return api.t("running.elapsed", { values: { time: formatSeconds(seconds) } });
  }
  return api.t("running.progress", {
    values: { current: formatSeconds(Math.min(seconds, totalSeconds)), total: formatSeconds(totalSeconds) },
  });
}

// Expanded body while running: the status plus a determinate bar when a total is known.
function RunningBody({ api, label, startedAt, totalSeconds }: RunningProps): ReactNode {
  const { React } = api.ui;
  const seconds = useElapsed(React, startedAt);
  const children: ReactNode[] = [React.createElement("span", { key: "label" }, label)];
  if (totalSeconds !== null) {
    children.push(
      React.createElement("progress", {
        key: "bar",
        className: "ffmpeg-tools-progress",
        value: Math.min(seconds, totalSeconds),
        max: totalSeconds,
      }),
    );
  }
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-body ffmpeg-tools-running" },
    ...children,
  );
}

export function renderMediaToolCall(
  api: ToolCallApi,
  context: ToolCallContext,
): ReactNode {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1) return null;
  if (context.slot !== "tool-call") return null;
  const ref = resolveToolRef(context);
  if (!ref) return null;
  const key = ref.key;

  const { React, ToolCallNode } = api.ui;
  const { status, result } = context.toolCall;

  let body: ReactNode;
  let header: Header = {};
  if (status === "pending" || status === "running" || result === undefined) {
    const label = api.t(`status.${status}`);
    const startedAt = context.toolCall.startedAt;
    const totalSeconds = progressTotal(ref.tool, context.toolCall.arguments);
    // Keep the file name while the call runs: a bare "running" tells the user nothing.
    const pendingPath = argumentPaths(context);
    body = React.createElement(RunningBody, { api, label, startedAt, totalSeconds });
    header = {
      displayName: pendingPath ? basename(pendingPath) : undefined,
      displayNameTitle: pendingPath ?? undefined,
      meta: React.createElement(ElapsedMeta, { api, label, startedAt, totalSeconds }),
    };
  } else {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = null;
    }
    const payload = payloadFromResult(parsed);
    if (!payload) {
      const message = rawFailureMessage(parsed);
      if (!message) {
        body = React.createElement(
          "div",
          { className: "ffmpeg-tools-body" },
          React.createElement("div", { className: "ffmpeg-tools-detail" }, result),
        );
      } else {
        const localize = api.ui.localizeToolError;
        const friendly =
          typeof localize === "function" ? localize(api.t, message) : message;
        header = headerFor(
          React,
          api,
          key,
          { ok: false, message: friendly },
          argumentPaths(context),
        );
        body = React.createElement(
          "div",
          { className: "ffmpeg-tools-body ffmpeg-tools-failure" },
          React.createElement("div", { key: "message" }, friendly),
        );
      }
    } else if (payload.ok === false) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = failureBody(api, payload, result);
    } else if (payload.media) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = probeBody(api, payload, argumentPaths(context));
    } else if (payload.binaries || payload.version) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = environmentBody(api, payload);
    } else if (payload.counts || payload.names || payload.matches) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = capabilitiesBody(api, payload);
    } else if (Array.isArray(payload.findings)) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = analyzeBody(api, payload);
    } else if (payload.exitCode !== undefined) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = runBody(api, payload);
    } else {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = factsBody(api, payload);
    }
  }

  // Collapsed by default: the header carries the file name and the two key facts,
  // the body opens on demand with paths, sizes and stream details.
  return React.createElement(
    ToolCallNode,
    {
      toolName: context.toolCall.name,
      // The plugin knows its own id, so the host does not have to resolve ownership
      // through the tool index (which is loaded once and can be stale after a reinstall).
      sourcePluginId: api.id,
      badgeName: api.t(key),
      badgeIcon: iconNode(React, api, ref.tool),
      status,
      displayName: header.displayName,
      displayNameTitle: header.displayNameTitle,
      meta: header.meta,
    },
    body,
  );
}
