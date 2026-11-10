// Accepts plain seconds, "MM:SS(.ms)" or "HH:MM:SS(.ms)"; returns null when the
// value cannot be understood, so callers fail loudly instead of guessing.
export function parseTimeToSeconds(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    const parsed = Number.parseFloat(part);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    seconds = seconds * 60 + parsed;
  }
  return seconds;
}

export function formatTimeArgument(value: number | string): string {
  return typeof value === "number" ? String(value) : value.trim();
}

// Seconds with millisecond precision, used for ffmpeg arithmetic only.
export function toFfmpegSeconds(seconds: number): string {
  return seconds.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
