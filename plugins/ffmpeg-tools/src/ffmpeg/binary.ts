import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

export type BinaryName = "ffmpeg" | "ffprobe";

export type BinaryInfo = {
  name: BinaryName;
  path: string;
  source: "env" | "plugin-bin" | "path";
};

// Single definition of how an operator can point the plugin at a binary.
const ENV_KEY: Record<BinaryName, string> = {
  ffmpeg: "FFMPEG_PATH",
  ffprobe: "FFPROBE_PATH",
};

const cache = new Map<BinaryName, BinaryInfo | null>();

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Windows resolves executables through PATHEXT; POSIX needs no suffix.
function executableSuffixes(): string[] {
  if (process.platform !== "win32") return [""];
  const raw = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD";
  const suffixes = raw
    .split(";")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return suffixes.length ? suffixes : [".exe"];
}

function resolveInDirectory(name: BinaryName, directory: string): string | null {
  for (const suffix of executableSuffixes()) {
    const candidate = path.join(directory, name + suffix);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

// The manifest passes the plugin install directory through FFMPEG_TOOLS_DIR, so a
// portable build dropped into <plugin>/bin works without touching the system PATH.
function pluginBinDirectory(): string | null {
  const directory = process.env.FFMPEG_TOOLS_DIR?.trim();
  return directory ? path.join(directory, "bin") : null;
}

export function resolveBinary(name: BinaryName): BinaryInfo | null {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;

  const resolved = resolveUncached(name);
  cache.set(name, resolved);
  return resolved;
}

function resolveUncached(name: BinaryName): BinaryInfo | null {
  const fromEnv = process.env[ENV_KEY[name]]?.trim();
  if (fromEnv && isExecutableFile(fromEnv)) {
    return { name, path: fromEnv, source: "env" };
  }

  const binDirectory = pluginBinDirectory();
  if (binDirectory) {
    const fromPlugin = resolveInDirectory(name, binDirectory);
    if (fromPlugin) return { name, path: fromPlugin, source: "plugin-bin" };
  }

  const dirs = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const directory of dirs) {
    const fromPath = resolveInDirectory(name, directory);
    if (fromPath) return { name, path: fromPath, source: "path" };
  }

  return null;
}

export function installGuidance(missing: BinaryName[]): string[] {
  const steps: string[] = [];
  if (process.platform === "win32") {
    steps.push("winget install --id Gyan.FFmpeg -e");
    steps.push(
      "或从 https://www.gyan.dev/ffmpeg/builds/ 下载构建包，解压后将其中的 bin 目录加入 PATH",
    );
  } else if (process.platform === "darwin") {
    steps.push("brew install ffmpeg");
  } else {
    steps.push("sudo apt install ffmpeg   (Debian / Ubuntu)");
    steps.push("sudo dnf install ffmpeg   (Fedora)");
  }
  steps.push(
    `也可设置环境变量 ${missing.map((name) => ENV_KEY[name]).join(" / ")} 指向对应可执行文件`,
  );
  steps.push("或把 ffmpeg 与 ffprobe 放进本插件安装目录的 bin 子目录");
  steps.push("安装后在应用设置里重新启用本插件，或重新询问一次");
  return steps;
}

export function envKeyOf(name: BinaryName): string {
  return ENV_KEY[name];
}
