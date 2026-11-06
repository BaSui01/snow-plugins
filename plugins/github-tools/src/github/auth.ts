import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let tokenPromise: Promise<string | undefined> | null = null;

// Token priority: GITHUB_TOKEN / GH_TOKEN, then the local gh CLI. Only a
// successful process result is cached; a later call rechecks after failure.
export async function resolveToken(): Promise<string | undefined> {
  const fromEnv =
    process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  if (!tokenPromise) {
    tokenPromise = execFileAsync("gh", ["auth", "token"], {
      encoding: "utf8",
      timeout: 5_000,
    }).then(
      ({ stdout }) => {
        const token = stdout.trim() || undefined;
        if (!token) tokenPromise = null;
        return token;
      },
      (error: unknown) => {
        tokenPromise = null;
        console.error(
          `[github-tools] GITHUB_TOKEN/GH_TOKEN is not set and "gh auth token" failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return undefined;
      },
    );
  }
  return tokenPromise;
}
