export type MediaTarget = "video" | "audio" | "image";

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "m4v",
  "mkv",
  "mov",
  "webm",
  "avi",
  "ts",
  "flv",
  "wmv",
  "mpg",
  "mpeg",
  "3gp",
]);

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "m4a",
  "aac",
  "wav",
  "flac",
  "ogg",
  "oga",
  "opus",
  "wma",
  "aiff",
]);

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "bmp",
  "tiff",
  "tif",
  "gif",
  "avif",
]);

export function containerOf(output: string): string {
  const base = output.replace(/\\/g, "/").split("/").pop() ?? output;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

// H.264 with yuv420p only accepts even dimensions, so every canvas in this plugin
// is normalized through this single helper.
export function evenDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function inferTarget(output: string): MediaTarget | null {
  const extension = containerOf(output);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return null;
}

export const VIDEO_PRESET_VALUES = [
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow",
] as const;

export const HARDWARE_VALUES = ["nvenc", "qsv", "amf", "videotoolbox"] as const;

export const AUDIO_CODEC_VALUES = ["copy", "aac", "mp3", "flac", "wav", "opus"] as const;

const HARDWARE_ENCODERS: Record<(typeof HARDWARE_VALUES)[number], string> = {
  nvenc: "h264_nvenc",
  qsv: "h264_qsv",
  amf: "h264_amf",
  videotoolbox: "h264_videotoolbox",
};

export function hardwareEncoder(hardware: (typeof HARDWARE_VALUES)[number]): string {
  return HARDWARE_ENCODERS[hardware];
}

// Container-driven defaults, mirroring the encoder each container actually expects.
export function defaultVideoCodec(container: string): string {
  if (container === "webm") return "libvpx-vp9";
  return "libx264";
}

export function defaultAudioCodec(container: string): string {
  if (container === "webm") return "libopus";
  if (container === "avi") return "libmp3lame";
  return "aac";
}

export function supportsFastStart(container: string): boolean {
  return container === "mp4" || container === "m4v" || container === "mov";
}

export function audioCodecFromValue(
  value: (typeof AUDIO_CODEC_VALUES)[number],
): { codec: string; container: string } | null {
  switch (value) {
    case "copy":
      return null;
    case "mp3":
      return { codec: "libmp3lame", container: "mp3" };
    case "aac":
      return { codec: "aac", container: "m4a" };
    case "flac":
      return { codec: "flac", container: "flac" };
    case "wav":
      return { codec: "pcm_s16le", container: "wav" };
    case "opus":
      return { codec: "libopus", container: "opus" };
  }
}

// Coverage-driven reasoning for `-q:v` only applies to the encoders below.
export function imageQualityArgs(codec: string, quality: number | undefined): string[] {
  if (quality === undefined) return [];
  if (codec === "mjpeg" || codec === "libwebp") return ["-q:v", String(quality)];
  return [];
}
