// Generated from src/ by scripts/build.mjs — edit TypeScript sources, not this file.
// Copyright (c) 2026 BaSui, MIT. See LICENSE.

// src/renderer/index.ts
var KEY_BY_TOOL = {
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
  media_run: "toolNames.media_run"
};
var ICON_BY_TOOL = {
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
  media_run: "Terminal"
};
var MAX_DETAIL_LINES = 12;
var MAX_STREAM_ROWS = 40;
var MAX_LOG_HEAD = 8;
var MAX_LOG_TAIL = 4;
function resolveToolRef(context) {
  const original = context.toolCall.originalToolName;
  const originalKey = original ? KEY_BY_TOOL[original] : void 0;
  if (original && originalKey) return { tool: original, key: originalKey };
  const name = context.toolCall.name;
  const nameKey = KEY_BY_TOOL[name];
  if (nameKey) return { tool: name, key: nameKey };
  for (const [tool, key] of Object.entries(KEY_BY_TOOL)) {
    if (name.endsWith(`-${tool}`) || name.endsWith(`_${tool}`)) return { tool, key };
  }
  return null;
}
function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
function asRows(value) {
  if (!Array.isArray(value)) return [];
  const rows = [];
  for (const item of value) {
    const record = asRecord(item);
    if (record) rows.push(record);
  }
  return rows;
}
function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function basename(target) {
  const parts = target.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? target;
}
function formatBytes(value) {
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
function formatLength(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const fraction = value - totalSeconds;
  const tail = fraction > 0.05 ? `${String(seconds).padStart(2, "0")}.${Math.round(fraction * 10)}` : String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${tail}`;
  return `${minutes}:${tail}`;
}
function formatElapsed(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value >= 1e4 ? `${(value / 1e3).toFixed(0)}s` : `${(value / 1e3).toFixed(1)}s`;
}
function formatBitRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return `${Math.round(value / 1e3)} kbps`;
}
function formatResolution(stream) {
  const width = stream.width;
  const height = stream.height;
  if (typeof width !== "number" || typeof height !== "number") return null;
  return `${width}x${height}`;
}
function formatValue(value, suffix = "") {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}${suffix}`;
  return typeof value === "string" && value !== "" ? `${value}${suffix}` : null;
}
function joinFacts(parts) {
  const kept = parts.filter((part) => typeof part === "string" && part !== "");
  return kept.length ? kept.join(" · ") : null;
}
function joinCapped(names, limit) {
  if (names.length <= limit) return names.join(" · ");
  return `${names.slice(0, limit).join(" · ")} +${names.length - limit}`;
}
function shortMessage(payload) {
  return text(payload.message) ?? text(payload.error);
}
function logExcerpt(api, value) {
  const lines = value.split(/\r?\n/);
  if (lines.length <= MAX_LOG_HEAD + MAX_LOG_TAIL + 1) return value;
  const hidden = lines.length - MAX_LOG_HEAD - MAX_LOG_TAIL;
  const marker = api.t("label.omittedLines", { values: { count: hidden } });
  return [
    ...lines.slice(0, MAX_LOG_HEAD),
    marker,
    ...lines.slice(-MAX_LOG_TAIL)
  ].join("\n");
}
function iconFor(key) {
  return ICON_BY_TOOL[key] ?? null;
}
function iconNode(React, api, key) {
  const iconName = iconFor(key);
  if (!iconName) return void 0;
  const Icon = api.ui.icon(iconName);
  if (!Icon) return void 0;
  return React.createElement(Icon, {
    size: 10,
    strokeWidth: 1.9,
    className: "tool-call-tool-name-icon"
  });
}
function headerMeta(api, payload) {
  if (payload.ok === false) return api.t("status.error");
  const media = asRecord(payload.media);
  if (media) {
    const kind = text(media.kind);
    const videoStream = asRows(media.streams).find((stream) => formatResolution(stream));
    return joinFacts([
      kind ? api.t(`kind.${kind}`) : null,
      videoStream ? formatResolution(videoStream) : null
    ]);
  }
  const counts = asRecord(payload.counts);
  if (counts) {
    const filters = typeof counts.filters === "number" ? counts.filters : null;
    const encoders = typeof counts.encoders === "number" ? counts.encoders : null;
    return joinFacts([
      filters === null ? null : `${filters} ${api.t("label.filters")}`,
      encoders === null ? null : `${encoders} ${api.t("label.encoders")}`
    ]);
  }
  if (typeof payload.version === "string") {
    const match = /^ffmpeg version (\S+)/.exec(payload.version);
    return match?.[1] ? `ffmpeg ${match[1]}` : null;
  }
  if (typeof payload.total === "number") {
    return `${api.t("label.total")} ${payload.total}`;
  }
  if (Array.isArray(payload.findings)) {
    return `${api.t("label.findings")} ${payload.findings.length}`;
  }
  if (payload.exitCode !== void 0 && payload.exitCode !== null) {
    return `${api.t("label.exitCode")} ${String(payload.exitCode)}`;
  }
  const streams = asRows(payload.streams);
  if (streams.length && !asRows(payload.outputs).length) {
    return joinFacts([
      `${streams.length} ${api.t("column.stream")}`,
      formatBytes(payload.sizeBytes)
    ]);
  }
  const deviceCount = (Array.isArray(payload.videoDevices) ? payload.videoDevices.length : 0) + (Array.isArray(payload.audioDevices) ? payload.audioDevices.length : 0);
  if (deviceCount) {
    return `${deviceCount} ${api.t("label.devices")}`;
  }
  const outputs = asRows(payload.outputs);
  const first = outputs[0];
  const outputBytes = first ? first.sizeBytes : void 0;
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
  const comparison = typeof inputBytes === "number" && typeof outputBytes === "number" && text(payload.input) !== null ? `${formatBytes(inputBytes)} → ${formatBytes(outputBytes)}` : formatBytes(outputBytes);
  const effect = text(payload.effect);
  if (effect) return joinFacts([localizedValue(api, "effect", effect), comparison]);
  const container = text(payload.container);
  return joinFacts([container ? container.split(",")[0] : null, comparison]);
}
function primaryPath(payload) {
  const first = asRows(payload.outputs)[0];
  const output = first ? text(first.path) : null;
  if (output) return output;
  return text(payload.outputDir) ?? text(payload.input) ?? text(payload.path);
}
function headerFor(React, api, key, payload, fallbackPath) {
  const header = {};
  const path = primaryPath(payload) ?? fallbackPath ?? null;
  if (path) {
    header.displayName = basename(path);
    header.displayNameTitle = path;
  }
  const meta = headerMeta(api, payload);
  if (meta) header.meta = meta;
  return header;
}
function grid(React, entries) {
  if (!entries.length) return null;
  const children = [];
  entries.forEach(([label, value, path], index) => {
    children.push(
      React.createElement("span", { className: "ffmpeg-tools-key", key: `k:${index}` }, label),
      React.createElement(
        "span",
        {
          className: path ? "ffmpeg-tools-value ffmpeg-tools-path" : "ffmpeg-tools-value",
          key: `v:${index}`,
          title: path ?? value,
          ...path ? { "data-path": path } : {}
        },
        value
      )
    );
  });
  return React.createElement("div", { className: "ffmpeg-tools-grid" }, ...children);
}
function outputsEntries(api, payload) {
  const entries = [];
  for (const output of asRows(payload.outputs)) {
    const path = text(output.path);
    if (!path) continue;
    const size = formatBytes(output.sizeBytes);
    entries.push([api.t("label.output"), size ? `${path}  ${size}` : path, path]);
  }
  return entries;
}
var MAX_PREVIEWS = 3;
function previewPaths(api, payload) {
  const media = api.ui.media;
  if (!media) return [];
  const paths = [];
  for (const output of asRows(payload.outputs)) {
    const path = text(output.path);
    if (!path || paths.includes(path) || !media.supports(path)) continue;
    paths.push(path);
    if (paths.length >= MAX_PREVIEWS) break;
  }
  return paths;
}
function previewBlock(api, paths) {
  const media = api.ui.media;
  if (!media || !paths.length) return null;
  const { React } = api.ui;
  const title = api.t("label.preview");
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-previews" },
    ...paths.map(
      (path, index) => React.createElement(media.Preview, {
        key: path,
        src: path,
        title,
        mode: index === 0 ? "inline" : "thumbnail",
        className: "ffmpeg-tools-preview"
      })
    )
  );
}
function audioFacts(stream, api) {
  return [
    formatValue(stream.codec),
    formatValue(stream.sampleRate, " Hz"),
    formatValue(stream.channels, " ch"),
    formatBitRate(stream.bitRate)
  ].filter((item) => item !== null).join(" · ") || api.t("kind.audio");
}
function probeBody(api, payload, fallbackPath) {
  const { React } = api.ui;
  const media = asRecord(payload.media);
  if (!media) return failureBody(api, payload, JSON.stringify(payload));
  const t = api.t;
  const entries = [];
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
  const children = [];
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
          className: "ffmpeg-tools-preview"
        })
      )
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
      t("column.fps")
    ],
    visualStreams.map((stream) => [
      formatValue(stream.index) ?? "",
      kindCell(api, stream.type),
      formatValue(stream.codec) ?? "",
      formatResolution(stream) ?? "",
      formatValue(stream.fps) ?? ""
    ])
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
          formatValue(stream.fps, " fps")
        ].filter((item) => item !== null).join(" · ")
      ])
    );
    if (fallback) children.push(fallback);
  }
  if (audioStreams.length) {
    const audioGrid = grid(
      React,
      audioStreams.map((stream, index) => [
        `${t("kind.audio")} ${index + 1}`,
        audioFacts(stream, api)
      ])
    );
    if (audioGrid) children.push(audioGrid);
  }
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}
var FIELD_LABELS = {
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
  windowTargetHint: "label.hint"
};
var RESERVED_KEYS = /* @__PURE__ */ new Set([
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
  "total"
]);
var VALUE_FIELDS = /* @__PURE__ */ new Set([
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
  "kind"
]);
function localizedValue(api, field, raw) {
  if (!VALUE_FIELDS.has(field)) return raw;
  const key = `value.${field}.${raw}`;
  const label = api.t(key);
  return label && label !== key ? label : raw;
}
function kindLabel(api, raw) {
  const key = `kind.${raw}`;
  const label = api.t(key);
  return label && label !== key ? label : raw;
}
function kindCell(api, value) {
  const raw = text(value);
  return raw ? kindLabel(api, raw) : "";
}
function fieldValue(key, value, api) {
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
  return names.length ? names.map((name) => localizedValue(api, key, name)).join(" · ") : null;
}
function joinedNames(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string");
  }
  const record = asRecord(value);
  if (!record) return [];
  const names = [];
  for (const [group, list] of Object.entries(record)) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") names.push(`${group}: ${item}`);
    }
  }
  return names;
}
function tableRows(api, tableKey, columns, rows) {
  const Table = api.ui.DataTableViewer;
  if (!Table || !rows.length) return null;
  return api.ui.React.createElement(Table, {
    key: tableKey,
    columns,
    rows,
    className: "ffmpeg-tools-table",
    maxInitialRows: 10,
    enableExport: false
  });
}
function labelFor(api, key) {
  const localeKey = FIELD_LABELS[key];
  return (localeKey ? api.t(localeKey) : "") || key;
}
function factsBody(api, payload) {
  const { React } = api.ui;
  const t = api.t;
  const children = [];
  const entries = [];
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
      sources.length > 4 ? `${shown} +${sources.length - 4}` : shown
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
    const blockEntries = [];
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
      t("label.forced")
    ],
    streams.slice(0, MAX_STREAM_ROWS).map((stream) => [
      formatValue(stream.index) ?? "",
      kindCell(api, stream.type),
      formatValue(stream.codec) ?? "",
      formatValue(stream.language) ?? "",
      stream.default === true ? t("label.yes") : t("label.no"),
      stream.forced === true ? t("label.yes") : t("label.no")
    ])
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
      t("label.forced")
    ],
    tracks.slice(0, MAX_STREAM_ROWS).map((track) => [
      formatValue(track.index) ?? "",
      formatValue(track.codec) ?? "",
      formatValue(track.language) ?? "",
      formatValue(track.title) ?? "",
      track.default === true ? t("label.yes") : t("label.no"),
      track.forced === true ? t("label.yes") : t("label.no")
    ])
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
      formatValue(chapter.title) ?? ""
    ])
  );
  if (chapterTable) children.push(chapterTable);
  const segments = asRows(payload.segments);
  if (segments.length) {
    const segmentGrid = grid(
      React,
      segments.slice(0, MAX_STREAM_ROWS).map((segment) => [
        basename(text(segment.path) ?? ""),
        formatBytes(segment.sizeBytes) ?? ""
      ])
    );
    if (segmentGrid) children.push(segmentGrid);
  }
  const hint = text(payload.hint);
  if (hint) {
    children.push(
      React.createElement("div", { className: "ffmpeg-tools-detail", key: "hint" }, hint)
    );
  }
  const attempts = asRows(payload.attempts);
  const attemptTable = tableRows(
    api,
    "attempts",
    [t("label.command"), t("label.exitCode")],
    attempts.map((attempt) => [
      formatValue(attempt.command) ?? "",
      formatValue(attempt.exitCode) ?? ""
    ])
  );
  if (attemptTable) children.push(attemptTable);
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}
function failureBody(api, payload, raw) {
  const { React } = api.ui;
  const message = shortMessage(payload) ?? api.t("status.error");
  const children = [React.createElement("div", { key: "message" }, message)];
  const guidance = Array.isArray(payload.guidance) ? payload.guidance.filter((item) => typeof item === "string") : [];
  for (const step of guidance.slice(0, MAX_DETAIL_LINES)) {
    if (step === message) continue;
    children.push(
      React.createElement("div", { className: "ffmpeg-tools-detail", key: `g:${step}` }, step)
    );
  }
  const detail = text(payload.stderrTail);
  if (detail) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "stderr" },
        logExcerpt(api, detail)
      )
    );
  } else if (!guidance.length && message === raw) {
    children.push(
      React.createElement("div", { className: "ffmpeg-tools-detail", key: "raw" }, raw)
    );
  }
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-body ffmpeg-tools-failure" },
    ...children
  );
}
function looksLikePayload(value) {
  return value.ok !== void 0 || value.media !== void 0 || value.outputs !== void 0 || value.operation !== void 0;
}
function payloadFromResult(value) {
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
    }
  }
  if (structured) return structured;
  return null;
}
function rawFailureMessage(value) {
  const record = asRecord(value);
  if (!record) return null;
  return text(record.error) ?? text(record.message);
}
function argumentPaths(context) {
  try {
    const parsed = asRecord(JSON.parse(context.toolCall.arguments));
    if (!parsed) return null;
    return text(parsed.output) ?? text(parsed.path) ?? text(parsed.input) ?? null;
  } catch {
    return null;
  }
}
function namedEntries(source, filter) {
  const entries = [];
  if (!source) return entries;
  for (const [name, value] of Object.entries(source)) {
    if (filter(value)) entries.push([name, String(value)]);
  }
  return entries;
}
function environmentBody(api, payload) {
  const { React } = api.ui;
  const entries = [];
  const version = text(payload.version);
  if (version) entries.push([api.t("label.version"), version]);
  const binaries = asRecord(payload.binaries);
  for (const name of ["ffmpeg", "ffprobe"]) {
    const info = binaries ? asRecord(binaries[name]) : null;
    const resolved = info ? text(info.path) : null;
    if (resolved) entries.push([name, resolved]);
  }
  const encoders = asRecord(payload.encoders);
  const available = encoders ? Object.entries(encoders).filter(([, value]) => value === true).map(([name]) => name) : [];
  if (available.length) entries.push([api.t("label.encoders"), available.join(" · ")]);
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-body" },
    grid(React, entries)
  );
}
function capabilitiesBody(api, payload) {
  const { React } = api.ui;
  const t = api.t;
  const counts = asRecord(payload.counts);
  if (counts) {
    const entries = namedEntries(counts, (value) => typeof value === "number");
    const hwaccels = payload.hwaccels?.filter(
      (item) => typeof item === "string"
    );
    const protocols = payload.protocols?.filter(
      (item) => typeof item === "string"
    );
    if (hwaccels?.length) entries.push([t("label.hwaccels"), joinCapped(hwaccels, 10)]);
    if (protocols?.length) entries.push([t("label.protocols"), joinCapped(protocols, 10)]);
    return React.createElement(
      "div",
      { className: "ffmpeg-tools-body" },
      grid(React, entries)
    );
  }
  const names = [];
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
  const children = [];
  const shown = names.slice(0, 20);
  const body = grid(React, shown);
  if (body) children.push(body);
  if (typeof payload.total === "number" || names.length > shown.length) {
    const total = typeof payload.total === "number" ? payload.total : names.length;
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "total" },
        `${t("label.total")} ${total}`
      )
    );
  }
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}
function analyzeBody(api, payload) {
  const { React } = api.ui;
  const t = api.t;
  const children = [];
  const summary = asRecord(payload.summary);
  const summaryEntries = namedEntries(
    summary,
    (value) => typeof value === "number" || typeof value === "string"
  );
  const summaryGrid = grid(React, summaryEntries);
  if (summaryGrid) children.push(summaryGrid);
  const findings = asRows(payload.findings);
  const scored = findings.some((item) => typeof item.score === "number");
  const findingTable = tableRows(
    api,
    "findings",
    scored ? [t("column.stream"), t("label.score")] : [t("label.start"), t("label.end"), t("label.length")],
    findings.slice(0, 100).map(
      (item) => scored ? [
        formatLength(item.timeSeconds) ?? formatValue(item.timeSeconds) ?? "",
        formatValue(item.score) ?? ""
      ] : [
        formatLength(item.start) ?? formatValue(item.start) ?? "",
        formatLength(item.end) ?? formatValue(item.end) ?? "",
        formatValue(item.durationSeconds, "s") ?? ""
      ]
    )
  );
  if (findingTable) {
    children.push(findingTable);
  } else if (findings.length) {
    const fallback = grid(
      React,
      findings.slice(0, 30).map((item, index) => [
        `#${index + 1}`,
        Object.values(item).filter((value) => typeof value === "number" || typeof value === "string").join(" · ")
      ])
    );
    if (fallback) children.push(fallback);
  }
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}
function runBody(api, payload) {
  const { React } = api.ui;
  const t = api.t;
  const entries = [];
  const binary = text(payload.binary);
  if (binary) entries.push([t("label.binary"), binary]);
  if (payload.exitCode !== void 0 && payload.exitCode !== null) {
    entries.push([t("label.exitCode"), String(payload.exitCode)]);
  }
  const elapsed = formatElapsed(payload.elapsedMs);
  if (elapsed) entries.push([t("label.duration"), elapsed]);
  const children = [];
  const summaryGrid = grid(React, entries);
  if (summaryGrid) children.push(summaryGrid);
  const expected = asRecord(payload.expectedOutput);
  if (expected) {
    const expectedEntries = [];
    const target = text(expected.path);
    if (target) expectedEntries.push([t("label.output"), target]);
    const after = formatBytes(expected.sizeBytesAfter);
    if (after) expectedEntries.push([t("label.size"), after]);
    if (typeof expected.written === "boolean") {
      expectedEntries.push([
        t("label.written"),
        expected.written ? t("label.yes") : t("label.no")
      ]);
    }
    const expectedGrid = grid(React, expectedEntries);
    if (expectedGrid) children.push(expectedGrid);
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
            className: "ffmpeg-tools-preview"
          })
        )
      );
    }
  }
  const stdout = text(payload.stdoutTail);
  if (stdout) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "out" },
        `${t("label.stdout")} · ${logExcerpt(api, stdout)}`
      )
    );
  }
  const stderr = text(payload.stderrTail);
  if (stderr) {
    children.push(
      React.createElement(
        "div",
        { className: "ffmpeg-tools-detail", key: "err" },
        `${t("label.stderr")} · ${logExcerpt(api, stderr)}`
      )
    );
  }
  return React.createElement("div", { className: "ffmpeg-tools-body" }, ...children);
}
function useElapsed(React, startedAt) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(timer);
  }, []);
  if (startedAt === void 0) return 0;
  return Math.max(0, Math.round((now - startedAt) / 1e3));
}
function parseClock(value) {
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const numbers = parts.map((part) => Number.parseFloat(part));
  if (numbers.some((item) => !Number.isFinite(item) || item < 0)) return null;
  const first = numbers[0] ?? 0;
  const second = numbers[1] ?? 0;
  const seconds = parts.length === 3 ? first * 3600 + second * 60 + (numbers[2] ?? 0) : first * 60 + second;
  return seconds > 0 ? seconds : null;
}
function progressTotal(tool, raw) {
  if (tool !== "media_capture" && tool !== "media_stream") return null;
  let parsed = null;
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
function formatSeconds(value) {
  const total = Math.max(0, Math.round(value));
  if (total < 60) return `${total}s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
function ElapsedMeta({ api, label, startedAt, totalSeconds }) {
  const seconds = useElapsed(api.ui.React, startedAt);
  if (startedAt === void 0 || seconds < 1) return label;
  if (totalSeconds === null) {
    return api.t("running.elapsed", { values: { time: formatSeconds(seconds) } });
  }
  return api.t("running.progress", {
    values: { current: formatSeconds(Math.min(seconds, totalSeconds)), total: formatSeconds(totalSeconds) }
  });
}
function RunningBody({ api, label, startedAt, totalSeconds }) {
  const { React } = api.ui;
  const seconds = useElapsed(React, startedAt);
  const children = [React.createElement("span", { key: "label" }, label)];
  if (totalSeconds !== null) {
    children.push(
      React.createElement("progress", {
        key: "bar",
        className: "ffmpeg-tools-progress",
        value: Math.min(seconds, totalSeconds),
        max: totalSeconds
      })
    );
  }
  return React.createElement(
    "div",
    { className: "ffmpeg-tools-body ffmpeg-tools-running" },
    ...children
  );
}
function renderMediaToolCall(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1) return null;
  if (context.slot !== "tool-call") return null;
  const ref = resolveToolRef(context);
  if (!ref) return null;
  const key = ref.key;
  const { React, ToolCallNode } = api.ui;
  const { status, result } = context.toolCall;
  let body;
  let header = {};
  if (status === "pending" || status === "running" || result === void 0) {
    const label = api.t(`status.${status}`);
    const startedAt = context.toolCall.startedAt;
    const totalSeconds = progressTotal(ref.tool, context.toolCall.arguments);
    const pendingPath = argumentPaths(context);
    body = React.createElement(RunningBody, { api, label, startedAt, totalSeconds });
    header = {
      displayName: pendingPath ? basename(pendingPath) : void 0,
      displayNameTitle: pendingPath ?? void 0,
      meta: React.createElement(ElapsedMeta, { api, label, startedAt, totalSeconds })
    };
  } else {
    let parsed = null;
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
          React.createElement("div", { className: "ffmpeg-tools-detail" }, result)
        );
      } else {
        const localize = api.ui.localizeToolError;
        const friendly = typeof localize === "function" ? localize(api.t, message) : message;
        header = headerFor(
          React,
          api,
          key,
          { ok: false, message: friendly },
          argumentPaths(context)
        );
        body = React.createElement(
          "div",
          { className: "ffmpeg-tools-body ffmpeg-tools-failure" },
          React.createElement("div", { key: "message" }, friendly)
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
    } else if (payload.exitCode !== void 0) {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = runBody(api, payload);
    } else {
      header = headerFor(React, api, key, payload, argumentPaths(context));
      body = factsBody(api, payload);
    }
  }
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
      meta: header.meta
    },
    body
  );
}
export {
  renderMediaToolCall
};
