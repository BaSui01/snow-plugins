import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { runBinary } from "../ffmpeg/run";
import { toFfmpegSeconds } from "../ffmpeg/time";
import {
  describeOutputs,
  failure,
  outputProblem,
  respond,
  requireBinary,
  runFfmpeg,
  type ToolResponse,
} from "./shared";

const OPERATIONS = ["screen", "window", "camera", "audio", "list_devices"] as const;

type Operation = (typeof OPERATIONS)[number];

type RecordingOperation = Exclude<Operation, "list_devices">;

const DEFAULT_FPS = 30;
const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 3600;
const SIZE_PATTERN = /^\d{2,5}x\d{2,5}$/;
// dshow prints its enumeration as log lines: [in#0 @ 0x...] "Device name" (video|audio). The
// optional bracket prefix keeps the parse working on builds that log without the context.
const DEVICE_LINE = /^\s*(?:\[[^\]]*\]\s*)?"(.+)"\s*\((video|audio)\)\s*$/;
// avfoundation prints [AVFoundation indev @ 0x...] [0] Device name.
const AVFOUNDATION_LINE = /^\s*\[[^\]]*\]\s*\[(\d+)\]\s+(.+?)\s*$/;

// The enumeration commands end with a non-zero exit code on Windows even though the list is
// complete, so they run raw and the parsed text decides success instead of the exit code.
const GDIGRAB_LIST_ARGS = ["-hide_banner", "-f", "gdigrab", "-list_devices", "1", "-i", "dummy"];
const DSHOW_LIST_ARGS = ["-hide_banner", "-f", "dshow", "-list_devices", "true", "-i", "dummy"];
const AVFOUNDATION_LIST_ARGS = ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""];
const LIST_TIMEOUT_MS = 30_000;
const LIST_OUTPUT_CHARS = 20_000;

type Args = {
  operation: Operation;
  output?: string;
  durationSeconds?: number;
  overwrite?: boolean;
  fps?: number;
  size?: string;
  offsetX?: number;
  offsetY?: number;
  windowTitle?: string;
  videoDevice?: string;
  audioDevice?: string;
  deviceIndex?: number;
};

type DevicePlan = { ok: true; args: string[]; device: string } | { ok: false; response: ToolResponse };

function stop(code: string, message: string): DevicePlan {
  return { ok: false, response: failure(code, message) };
}

function textProblem(value: string, field: string): string | null {
  if (!value.trim()) return `${field} 不能为空`;
  if (value.includes("\u0000")) return `${field} 含非法字符`;
  return null;
}

function sizeProblem(size: string): string | null {
  return SIZE_PATTERN.test(size.trim()) ? null : `size 必须形如 1280x720：${size}`;
}

function screenPlan(input: Args, fps: number): DevicePlan {
  switch (process.platform) {
    case "win32": {
      const args = ["-f", "gdigrab", "-framerate", String(fps)];
      if (input.size) {
        const problem = sizeProblem(input.size);
        if (problem) return stop("invalid-size", problem);
        args.push("-video_size", input.size.trim());
      }
      if (input.offsetX !== undefined) args.push("-offset_x", String(input.offsetX));
      if (input.offsetY !== undefined) args.push("-offset_y", String(input.offsetY));
      args.push("-i", "desktop");
      return { ok: true, args, device: "gdigrab desktop（整个主显示器）" };
    }
    case "darwin": {
      const index = input.deviceIndex ?? 1;
      const args = ["-f", "avfoundation", "-framerate", String(fps), "-i", `${index}:none`];
      return { ok: true, args, device: `avfoundation 屏幕设备 ${index}` };
    }
    case "linux": {
      if (!input.size) return stop("missing-size", "Linux 屏幕采集必须给出 size，例如 1920x1080");
      const problem = sizeProblem(input.size);
      if (problem) return stop("invalid-size", problem);
      const offsetX = input.offsetX ?? 0;
      const offsetY = input.offsetY ?? 0;
      const args = [
        "-f",
        "x11grab",
        "-framerate",
        String(fps),
        "-video_size",
        input.size.trim(),
        "-i",
        `:0.0+${offsetX},${offsetY}`,
      ];
      return { ok: true, args, device: `x11grab :0.0+${offsetX},${offsetY}` };
    }
    default:
      return stop(
        "unsupported-platform",
        `本机平台 ${process.platform} 没有屏幕采集后端：Windows 用 gdigrab，macOS 用 avfoundation，Linux 用 x11grab`,
      );
  }
}

function windowPlan(input: Args, fps: number): DevicePlan {
  if (process.platform !== "win32") {
    return stop("unsupported-platform", `window 采集仅支持 Windows 的 gdigrab，本机是 ${process.platform}`);
  }
  if (!input.windowTitle) {
    return stop("missing-window-title", "window 采集需要 windowTitle，且需与目标窗口标题一致");
  }
  const problem = textProblem(input.windowTitle, "windowTitle");
  if (problem) return stop("invalid-window-title", problem);
  const args = ["-f", "gdigrab", "-framerate", String(fps), "-i", `title=${input.windowTitle}`];
  return { ok: true, args, device: `gdigrab title=${input.windowTitle}` };
}

function cameraPlan(input: Args): DevicePlan {
  switch (process.platform) {
    case "win32": {
      if (!input.videoDevice) {
        return stop("missing-video-device", "Windows 摄像头采集需要 videoDevice，名称可用 list_devices 查看");
      }
      const problem = textProblem(input.videoDevice, "videoDevice");
      if (problem) return stop("invalid-video-device", problem);
      const args = ["-f", "dshow", "-i", `video=${input.videoDevice}`];
      return { ok: true, args, device: `dshow video=${input.videoDevice}` };
    }
    case "darwin": {
      const source = input.videoDevice ?? String(input.deviceIndex ?? 0);
      const fps = input.fps ?? DEFAULT_FPS;
      const args = ["-f", "avfoundation", "-framerate", String(fps), "-i", `${source}:none`];
      return { ok: true, args, device: `avfoundation 摄像头 ${source}` };
    }
    case "linux": {
      const device = input.videoDevice ?? "/dev/video0";
      const problem = textProblem(device, "videoDevice");
      if (problem) return stop("invalid-video-device", problem);
      return { ok: true, args: ["-f", "v4l2", "-i", device], device: `v4l2 ${device}` };
    }
    default:
      return stop(
        "unsupported-platform",
        `本机平台 ${process.platform} 没有摄像头采集后端：Windows 用 dshow，macOS 用 avfoundation，Linux 用 v4l2`,
      );
  }
}

function audioPlan(input: Args): DevicePlan {
  switch (process.platform) {
    case "win32": {
      if (!input.audioDevice) {
        return stop("missing-audio-device", "Windows 麦克风采集需要 audioDevice，名称可用 list_devices 查看");
      }
      const problem = textProblem(input.audioDevice, "audioDevice");
      if (problem) return stop("invalid-audio-device", problem);
      const args = ["-f", "dshow", "-i", `audio=${input.audioDevice}`];
      return { ok: true, args, device: `dshow audio=${input.audioDevice}` };
    }
    case "darwin": {
      const source = input.audioDevice ?? String(input.deviceIndex ?? 0);
      return { ok: true, args: ["-f", "avfoundation", "-i", `:${source}`], device: `avfoundation 麦克风 ${source}` };
    }
    case "linux":
      return { ok: true, args: ["-f", "alsa", "-i", "default"], device: "alsa default" };
    default:
      return stop(
        "unsupported-platform",
        `本机平台 ${process.platform} 没有麦克风采集后端：Windows 用 dshow，macOS 用 avfoundation，Linux 用 alsa`,
      );
  }
}

function planFor(input: Args, operation: RecordingOperation): DevicePlan {
  const fps = input.fps ?? DEFAULT_FPS;
  switch (operation) {
    case "screen":
      return screenPlan(input, fps);
    case "window":
      return windowPlan(input, fps);
    case "camera":
      return cameraPlan(input);
    case "audio":
      return audioPlan(input);
  }
}

function parseDshowDevices(text: string): { video: string[]; audio: string[] } {
  const video: string[] = [];
  const audio: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = DEVICE_LINE.exec(line);
    const name = match?.[1];
    const kind = match?.[2];
    if (!name || !kind) continue;
    if (kind === "video") video.push(name);
    else audio.push(name);
  }
  return { video, audio };
}

// gdigrab cannot enumerate windows: all it prints is which target syntax to use. The line is
// kept as a hint because window capture takes the title from the caller, not from a list.
function gdigrabHint(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("Please use") && line.includes("title=")) {
      return line.replace(/^\[[^\]]*\]\s*/, "").trim();
    }
  }
  return null;
}

type AvDevice = { index: number; name: string };

function parseAvfoundationDevices(text: string): { video: AvDevice[]; audio: AvDevice[] } {
  const video: AvDevice[] = [];
  const audio: AvDevice[] = [];
  let section: "video" | "audio" | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes("video devices:")) {
      section = "video";
      continue;
    }
    if (line.includes("audio devices:")) {
      section = "audio";
      continue;
    }
    const match = AVFOUNDATION_LINE.exec(line);
    if (!match || !section) continue;
    const index = Number.parseInt(match[1] ?? "", 10);
    const name = match[2];
    if (!Number.isFinite(index) || !name) continue;
    (section === "video" ? video : audio).push({ index, name });
  }
  return { video, audio };
}

type ListAttempt = { command: string; exitCode: number | null; timedOut: boolean };

async function listWindowsDevices(binaryPath: string): Promise<ToolResponse> {
  const gdigrab = await runBinary(binaryPath, GDIGRAB_LIST_ARGS, {
    timeoutMs: LIST_TIMEOUT_MS,
    stderrTailChars: LIST_OUTPUT_CHARS,
  });
  const dshow = await runBinary(binaryPath, DSHOW_LIST_ARGS, {
    timeoutMs: LIST_TIMEOUT_MS,
    stderrTailChars: LIST_OUTPUT_CHARS,
  });
  if (gdigrab.spawnError || dshow.spawnError) {
    return failure("ffmpeg-spawn-failed", gdigrab.spawnError ?? dshow.spawnError ?? "ffmpeg 无法启动");
  }

  const devices = parseDshowDevices(`${dshow.stderrTail}\n${dshow.stdout}`);
  const hint = gdigrabHint(`${gdigrab.stderrTail}\n${gdigrab.stdout}`);
  const attempts: ListAttempt[] = [
    { command: `ffmpeg ${GDIGRAB_LIST_ARGS.join(" ")}`, exitCode: gdigrab.code, timedOut: gdigrab.timedOut },
    { command: `ffmpeg ${DSHOW_LIST_ARGS.join(" ")}`, exitCode: dshow.code, timedOut: dshow.timedOut },
  ];

  if (!devices.video.length && !devices.audio.length) {
    return failure("device-list-unavailable", "没有从 ffmpeg 输出里解析到采集设备；以下是原始输出", {
      platform: process.platform,
      attempts,
      stderrTail: [gdigrab.stderrTail, dshow.stderrTail].filter(Boolean).join("\n"),
      ...(hint ? { windowTargetHint: hint } : {}),
    });
  }

  return respond({
    ok: true,
    operation: "list_devices",
    platform: process.platform,
    videoDevices: devices.video,
    audioDevices: devices.audio,
    windowTargetHint: hint,
    note: "gdigrab 不枚举窗口：window 采集直接传 windowTitle，或用 desktop 抓整个桌面",
    attempts,
  });
}

async function listDarwinDevices(binaryPath: string): Promise<ToolResponse> {
  const outcome = await runBinary(binaryPath, AVFOUNDATION_LIST_ARGS, {
    timeoutMs: LIST_TIMEOUT_MS,
    stderrTailChars: LIST_OUTPUT_CHARS,
  });
  if (outcome.spawnError) return failure("ffmpeg-spawn-failed", outcome.spawnError);

  const devices = parseAvfoundationDevices(`${outcome.stderrTail}\n${outcome.stdout}`);
  if (!devices.video.length && !devices.audio.length) {
    return failure("device-list-unavailable", "没有从 avfoundation 输出里解析到采集设备；以下是原始输出", {
      platform: process.platform,
      exitCode: outcome.code,
      stderrTail: outcome.stderrTail,
    });
  }
  return respond({
    ok: true,
    operation: "list_devices",
    platform: process.platform,
    videoDevices: devices.video,
    audioDevices: devices.audio,
    note: "avfoundation 的 deviceIndex 就是下面的方括号编号",
    exitCode: outcome.code,
  });
}

async function listDevices(): Promise<ToolResponse> {
  const gate = requireBinary("ffmpeg");
  if (!gate.ok) return gate.response;

  if (process.platform === "win32") return listWindowsDevices(gate.path);
  if (process.platform === "darwin") return listDarwinDevices(gate.path);
  if (process.platform === "linux") {
    return failure(
      "list-devices-unsupported",
      "本机平台 linux 没有统一的 ffmpeg 设备枚举命令：屏幕用 x11grab，摄像头默认可试 /dev/video0，麦克风用 alsa 的 default 设备",
    );
  }
  return failure("unsupported-platform", `本机平台 ${process.platform} 没有设备枚举后端`);
}

async function handle(input: Args): Promise<ToolResponse> {
  const operation = input.operation;

  if (operation === "list_devices") {
    const unused = input.output !== undefined ? ["output"] : [];
    if (input.durationSeconds !== undefined) unused.push("durationSeconds");
    if (unused.length) {
      return failure(
        "unused-arguments",
        `${unused.join(" / ")} 只用于录制操作；list_devices 只列出设备，不产生输出文件`,
      );
    }
    return listDevices();
  }

  if (input.durationSeconds === undefined) {
    return failure(
      "missing-duration",
      `录制必须给出 durationSeconds（${MIN_DURATION_SECONDS} 到 ${MAX_DURATION_SECONDS} 秒），否则无法确定何时停止`,
    );
  }
  const seconds = input.durationSeconds;
  if (!Number.isFinite(seconds) || seconds < MIN_DURATION_SECONDS || seconds > MAX_DURATION_SECONDS) {
    return failure(
      "invalid-duration",
      `durationSeconds 必须在 ${MIN_DURATION_SECONDS} 到 ${MAX_DURATION_SECONDS} 秒之间：${String(seconds)}`,
    );
  }

  if (!input.output) return failure("missing-output", `${operation} 需要 output 指定录制输出文件`);
  const outputIssue = outputProblem(input.output, input.overwrite === true);
  if (outputIssue) return failure("invalid-output", outputIssue);

  const plan = planFor(input, operation);
  if (!plan.ok) return plan.response;

  // -t is mandatory for every capture: a screen or microphone grab would otherwise run until
  // the single-call timeout kills it.
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    input.overwrite === true ? "-y" : "-n",
    ...plan.args,
    "-t",
    toFfmpegSeconds(seconds),
    input.output,
  ];

  const run = await runFfmpeg(args);
  if (!run.ok) return run.response;

  const payload: Record<string, unknown> = {
    ok: true,
    operation,
    platform: process.platform,
    device: plan.device,
    durationSeconds: seconds,
    outputs: describeOutputs([input.output]),
    elapsedMs: run.elapsedMs,
    stderrTail: run.stderrTail,
  };
  if (operation === "screen" || operation === "window") payload.fps = input.fps ?? DEFAULT_FPS;
  if (operation === "screen" && process.platform === "win32" && input.size) {
    payload.size = input.size.trim();
  }
  return respond(payload);
}

export function registerMediaCapture(server: McpServer): void {
  server.registerTool(
    "media_capture",
    {
      title: "Capture screen, window, camera and microphone",
      description:
        "Record this machine. screen grabs the desktop (Windows gdigrab, macOS avfoundation, Linux x11grab), window grabs one window by its exact title on Windows, camera and audio open a camera or microphone (Windows dshow, macOS avfoundation, Linux v4l2 / alsa), and list_devices only enumerates what this machine exposes. Recording really captures the screen or microphone, so the operating system may ask for permission and a device may already be busy; every recording needs durationSeconds (1 to 3600) and never overwrites an existing file unless overwrite is true.",
      inputSchema: {
        operation: z.enum(OPERATIONS),
        output: z.string().optional().describe("Absolute output path; required for every recording"),
        durationSeconds: z.number().min(1).max(3600).optional().describe("Required for every recording"),
        overwrite: z.boolean().optional(),
        fps: z.number().positive().max(240).optional().describe("Capture frame rate, default 30"),
        size: z.string().optional().describe("Capture area WIDTHxHEIGHT, e.g. 1920x1080"),
        offsetX: z.number().int().optional().describe("Capture area x offset"),
        offsetY: z.number().int().optional().describe("Capture area y offset"),
        windowTitle: z.string().optional().describe("window only: exact window title"),
        videoDevice: z.string().optional().describe("Camera name (dshow/v4l2) or avfoundation source"),
        audioDevice: z.string().optional().describe("Microphone name (dshow) or avfoundation source"),
        deviceIndex: z.number().int().min(0).max(99).optional().describe("avfoundation device number"),
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
