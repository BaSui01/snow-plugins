// GPU acceleration: one definition of which hardware encoders exist, what they are
// called and which quality switches keep their output comparable to the software
// default. Only flags verified on a real machine are emitted automatically.
import { resolveBinary } from "./binary";
import { hasEncoder } from "./capabilities";
import { resolveOperationTimeoutMs, runBinary } from "./run";

export const HARDWARE_VENDORS = ["nvenc", "qsv", "amf", "videotoolbox"] as const;
export type HardwareVendor = (typeof HARDWARE_VENDORS)[number];

const ENCODER: Record<HardwareVendor, string> = {
  nvenc: "h264_nvenc",
  qsv: "h264_qsv",
  amf: "h264_amf",
  videotoolbox: "h264_videotoolbox",
};

const LABEL: Record<HardwareVendor, string> = {
  nvenc: "NVIDIA NVENC",
  qsv: "Intel Quick Sync",
  amf: "AMD AMF",
  videotoolbox: "Apple VideoToolbox",
};

// Encoder-side quality switches. A vendor without an entry keeps its own default and
// should be given an explicit videoBitrate instead of guessed flags.
const QUALITY_ARGS: Partial<Record<HardwareVendor, string[]>> = {
  nvenc: ["-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", "20", "-b:v", "0"],
  amf: ["-quality", "balanced"],
};

export type HardwareAvailability = {
  vendor: HardwareVendor;
  encoder: string;
  label: string;
};

export function hardwareEncoder(vendor: HardwareVendor): string {
  return ENCODER[vendor];
}

/** Encoder arguments for a hardware vendor; an explicit bitrate always wins over CQ. */
export function hardwareEncodeArgs(vendor: HardwareVendor, videoBitrate?: string): string[] {
  if (videoBitrate) return ["-b:v", videoBitrate];
  return QUALITY_ARGS[vendor] ?? [];
}

/** Hardware encoders this machine can really initialize (one cached check per vendor). */
export async function detectHardware(): Promise<HardwareAvailability[]> {
  if (!resolved) {
    resolved = (async () => {
      const found: HardwareAvailability[] = [];
      for (const vendor of HARDWARE_VENDORS) {
        if ((await hasEncoder(ENCODER[vendor])) !== true) continue;
        // Being compiled in is not the same as being usable: QSV, for example, fails
        // with "Error creating a MFX session" when no supported GPU is present.
        if (!(await canInitialize(ENCODER[vendor]))) continue;
        found.push({ vendor, encoder: ENCODER[vendor], label: LABEL[vendor] });
      }
      return found;
    })();
  }
  return resolved;
}

let resolved: Promise<HardwareAvailability[]> | null = null;

async function canInitialize(encoder: string): Promise<boolean> {
  const binary = resolveBinary("ffmpeg");
  if (!binary) return false;
  const outcome = await runBinary(
    binary.path,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      // 256x256 is the smallest canvas NVENC accepts; a smaller probe fails on the
      // encoder's "frame dimension less than the minimum" check and would look like
      // "no GPU" on a machine that actually has one.
      "color=c=black:s=256x256:d=0.2:r=30",
      "-frames:v",
      "1",
      "-c:v",
      encoder,
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: Math.min(resolveOperationTimeoutMs(), 60_000) },
  );
  return !outcome.spawnError && !outcome.timedOut && outcome.code === 0;
}

export function hardwareArgsHint(available: HardwareAvailability[]): string | null {
  const first = available[0];
  if (!first) return null;
  const args = ["-c:v", first.encoder, ...hardwareEncodeArgs(first.vendor)].join(" ");
  return args;
}

/**
 * Caller-facing guidance. Kept as one definition so env_check, transcode hints and the
 * bundled skill never drift apart.
 */
export function hardwareGuidance(available: HardwareAvailability[]): string[] {
  if (!available.length) {
    return [
      "本机 ffmpeg 构建没有可用的硬件编码器，只能走 CPU（libx264）。",
      "有独立显卡时请安装厂商驱动与带 NVENC/QSV/AMF 的 ffmpeg 构建，再重新检查。",
    ];
  }
  const names = available.map((item) => `${item.label}（${item.encoder}）`).join("、");
  const first = available[0] as HardwareAvailability;
  const args = ["-c:v", first.encoder, ...hardwareEncodeArgs(first.vendor)].join(" ");
  return [
    `可用硬件编码器（已做真机初始化校验）：${names}`,
    `高层工具：media_transcode 传 hardware: "${first.vendor}"；media_compose 同样支持 hardware。`,
    `自定义滤镜：media_run 里用 ${args}`,
    "硬件只加速编码（可再加 -hwaccel cuda 让解码也上显卡）；zoompan / rotate / xfade 等滤镜仍在 CPU，滤镜越重，收益越小。",
    "gpuApi 是构建包含的硬件接口清单，能否真正使用还取决于驱动与显卡。",
    "同码率下硬件编码画质略低于 libx264：控体积用 -b:v/-maxrate，追画质用 -cq 18~20 并接受更大体积。",
  ];
}
