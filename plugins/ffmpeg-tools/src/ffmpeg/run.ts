import { spawn, type ChildProcess } from "node:child_process";

export type RunOutcome = {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  /** Tail of stderr only: progress lines are noise, the last lines carry the failure. */
  stderrTail: string;
  elapsedMs: number;
  spawnError?: string;
};

export type RunOptions = {
  timeoutMs: number;
  stdoutLimitBytes?: number;
  stderrTailChars?: number;
};

const DEFAULT_STDOUT_LIMIT_BYTES = 4 * 1024 * 1024;
const DEFAULT_STDERR_TAIL_CHARS = 2000;

// Arguments are always passed as an argv array; nothing goes through a shell, so
// user-provided paths and titles can never be re-interpreted as shell syntax.
export function runBinary(
  file: string,
  args: string[],
  options: RunOptions,
): Promise<RunOutcome> {
  const startedAt = Date.now();
  const stdoutLimit = options.stdoutLimitBytes ?? DEFAULT_STDOUT_LIMIT_BYTES;
  const stderrTailChars = options.stderrTailChars ?? DEFAULT_STDERR_TAIL_CHARS;

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let runTimedOut = false;

    const finish = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(outcome);
    };

    const emptyOutcome = (spawnError: string): RunOutcome => ({
      code: null,
      signal: null,
      timedOut: false,
      stdout: "",
      stderrTail: "",
      elapsedMs: Date.now() - startedAt,
      spawnError,
    });

    let child: ChildProcess | undefined;
    try {
      child = spawn(file, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish(emptyOutcome(error instanceof Error ? error.message : String(error)));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";

    timer = setTimeout(() => {
      runTimedOut = true;
      child?.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= stdoutLimit) return;
      stdoutBytes += chunk.byteLength;
      stdoutChunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > stderrTailChars * 4) {
        stderr = stderr.slice(-stderrTailChars * 2);
      }
    });

    child.on("error", (error: Error) => {
      finish(emptyOutcome(error.message));
    });

    child.on("close", (code, signal) => {
      finish({
        code,
        signal: signal ?? null,
        timedOut: runTimedOut,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderrTail: stderr.slice(-stderrTailChars).trim(),
        elapsedMs: Date.now() - startedAt,
      });
    });
  });
}

export function resolveOperationTimeoutMs(): number {
  const raw = process.env.FFMPEG_TOOLS_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  // The manifest allows 30 minutes per call; stop before the host kills the call
  // so the caller receives a real error instead of a transport failure.
  return 25 * 60 * 1000;
}
