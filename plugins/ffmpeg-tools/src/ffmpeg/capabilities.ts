import { resolveBinary } from "./binary";
import { runBinary, resolveOperationTimeoutMs } from "./run";

export type Capabilities = {
  version: string | null;
  encoders: Record<string, boolean>;
};

// Encoders worth reporting: the default software encoders the plugin selects plus
// the hardware encoders a caller may ask for explicitly.
const REPORTED_ENCODERS = [
  "libx264",
  "libx265",
  "libvpx-vp9",
  "libsvtav1",
  "aac",
  "libmp3lame",
  "libopus",
  "libvorbis",
  "flac",
  "png",
  "mjpeg",
  "libwebp",
  "h264_nvenc",
  "hevc_nvenc",
  "h264_qsv",
  "h264_amf",
  "h264_videotoolbox",
] as const;

const ENCODER_HEADER = /^\s*[A-Z.]{6}\s+(\S+)/;

let cached: Promise<Set<string> | null> | null = null;

async function readEncoderSet(): Promise<Set<string> | null> {
  const binary = resolveBinary("ffmpeg");
  if (!binary) return null;
  if (!cached) {
    cached = runBinary(binary.path, ["-hide_banner", "-encoders"], {
      timeoutMs: Math.min(resolveOperationTimeoutMs(), 60_000),
      stdoutLimitBytes: 1024 * 1024,
    }).then((outcome) => {
      if (outcome.timedOut || outcome.spawnError || outcome.code !== 0) return null;
      const names = new Set<string>();
      for (const line of outcome.stdout.split(/\r?\n/)) {
        const match = ENCODER_HEADER.exec(line);
        if (match?.[1]) names.add(match[1]);
      }
      return names.size ? names : null;
    });
  }
  return cached;
}

export async function hasEncoder(name: string): Promise<boolean | null> {
  const names = await readEncoderSet();
  if (!names) return null;
  return names.has(name);
}

export async function readCapabilities(): Promise<{
  ok: boolean;
  version: string | null;
  encoders: Record<string, boolean> | null;
  error?: string;
  stderrTail?: string;
}> {
  const binary = resolveBinary("ffmpeg");
  if (!binary) return { ok: false, version: null, encoders: null, error: "ffmpeg-missing" };

  const versionRun = await runBinary(binary.path, ["-version"], {
    timeoutMs: 30_000,
    stdoutLimitBytes: 64 * 1024,
  });
  if (versionRun.spawnError) {
    return {
      ok: false,
      version: null,
      encoders: null,
      error: versionRun.spawnError,
    };
  }
  const versionLine = versionRun.stdout.split(/\r?\n/)[0]?.trim() ?? null;

  const names = await readEncoderSet();
  if (!names) {
    return {
      ok: false,
      version: versionLine,
      encoders: null,
      error: "encoders-unavailable",
      stderrTail: versionRun.stderrTail,
    };
  }

  const encoders: Record<string, boolean> = {};
  for (const name of REPORTED_ENCODERS) {
    encoders[name] = names.has(name);
  }
  return { ok: true, version: versionLine, encoders };
}
