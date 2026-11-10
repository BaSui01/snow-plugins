import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { installGuidance, resolveBinary } from "../ffmpeg/binary";
import { readCapabilities } from "../ffmpeg/capabilities";
import { detectHardware, hardwareArgsHint, hardwareGuidance } from "../ffmpeg/hardware";
import { readInventory } from "../ffmpeg/inventory";
import { respond, type ToolResponse } from "./shared";

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

async function handle(): Promise<ToolResponse> {
  const ffmpeg = resolveBinary("ffmpeg");
  const ffprobe = resolveBinary("ffprobe");
  const missing = [
    ...(ffmpeg ? [] : ["ffmpeg" as const]),
    ...(ffprobe ? [] : ["ffprobe" as const]),
  ];

  const presence = {
    ffmpeg: ffmpeg ? { path: ffmpeg.path, source: ffmpeg.source } : null,
    ffprobe: ffprobe ? { path: ffprobe.path, source: ffprobe.source } : null,
  };

  if (missing.length) {
    return respond({
      ok: false,
      error: "ffmpeg-tools-unavailable",
      missing,
      message: "本机缺少 ffmpeg 或 ffprobe，媒体处理工具无法执行",
      binaries: presence,
      guidance: installGuidance(missing),
    });
  }

  const capabilities = await readCapabilities();
  const payload: Record<string, unknown> = {
    ok: capabilities.ok,
    binaries: presence,
    version: capabilities.version,
    encoders: capabilities.encoders,
  };

  // GPU guidance: which hardware encoders this build has, and how to use them.
  const available = await detectHardware();
  const hwaccel = await readInventory("hwaccels");
  payload.acceleration = available.length
    ? available.map((item) => `${item.label}（${item.encoder}）`).join(" · ")
    : "未检测到硬件编码器（仅 CPU）";
  if (hwaccel?.names.length) payload.gpuApi = hwaccel.names.slice(0, 10).join(" · ");
  const argsHint = hardwareArgsHint(available);
  if (argsHint) payload.gpuArgs = argsHint;
  payload.gpuNotes = hardwareGuidance(available);

  if (!capabilities.ok) {
    payload.error = "capability-probe-failed";
    payload.message = "无法读取本机 ffmpeg 编码器清单";
    if (capabilities.stderrTail) payload.stderrTail = capabilities.stderrTail;
  }
  return respond(payload);
}

export function registerMediaEnvCheck(server: McpServer): void {
  server.registerTool(
    "media_env_check",
    {
      title: "Check ffmpeg environment",
      description:
        "Report whether this machine has ffmpeg and ffprobe, where they were found, the ffmpeg version, which encoders exist, and which GPU encoders (NVENC / Quick Sync / AMF / VideoToolbox) this machine can really initialize — with the exact arguments and the caveat that filters still run on the CPU. Returns install guidance when a binary is missing. Read-only: no file is read or written.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () => handle(),
  );
}
