import { z } from "zod";
import { version } from "../../plugin.json";
import { resolveToken } from "./auth";

const API_BASE = "https://api.github.com";
const UPLOADS_BASE = "https://uploads.github.com";
export const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = `snow-github-tools/${version}`;

export type GitHubRequestOptions = {
  host?: "api" | "uploads";
  requireToken?: boolean;
};

type InternalRequestOptions = GitHubRequestOptions & {
  acceptedStatuses?: readonly number[];
  includeErrorBody?: boolean;
};

function redactToken(value: string, token: string | undefined): string {
  return token ? value.split(token).join("[redacted]") : value;
}

async function requestResponse(
  path: string,
  init: RequestInit,
  options: InternalRequestOptions,
): Promise<{ response: Response; body: string }> {
  const token = await resolveToken();
  if (options.requireToken && !token) {
    throw new Error(
      "This GitHub operation requires authentication: set GITHUB_TOKEN/GH_TOKEN or sign in with `gh auth login`.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", USER_AGENT);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  const callerSignal = init.signal;
  const forwardAbort = (): void => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) forwardAbort();
  else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  let body: string;
  try {
    const base = options.host === "uploads" ? UPLOADS_BASE : API_BASE;
    response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    body = await response.text();
  } catch (error) {
    if (timedOut) {
      throw new Error(
        `GitHub request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        { cause: error },
      );
    }
    if (callerSignal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error("GitHub request was aborted.", { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }

  const accepted = options.acceptedStatuses
    ? options.acceptedStatuses.includes(response.status)
    : response.ok;
  if (!accepted) {
    const statusText = redactToken(response.statusText, token);
    const safeBody = redactToken(body, token);
    const bodyText = safeBody.length > 800
      ? `${safeBody.slice(0, 800)}… (response body excerpt)`
      : safeBody || "(empty body)";
    const detail = options.includeErrorBody === false ? "" : `: ${bodyText}`;
    throw new Error(`GitHub API ${response.status} ${statusText}${detail}`);
  }
  return { response, body };
}

function parseJsonBody(body: string): unknown {
  if (!body) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new Error(
      `GitHub API returned non-JSON content: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function parseWithSchema<T>(
  payload: unknown,
  schema: z.ZodType<T>,
  path: string,
  method: string,
): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `GitHub API ${method} ${path} returned an unexpected payload: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

export async function githubRequestWithResponse<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  options: GitHubRequestOptions = {},
): Promise<{ data: T; response: Response }> {
  const { response, body } = await requestResponse(path, init, options);
  return {
    data: parseWithSchema(parseJsonBody(body), schema, path, init.method ?? "GET"),
    response,
  };
}

export function githubRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
  options?: GitHubRequestOptions,
): Promise<T>;
export function githubRequest(
  path: string,
  schema?: undefined,
  init?: RequestInit,
  options?: GitHubRequestOptions,
): Promise<unknown>;
export async function githubRequest(
  path: string,
  schema?: z.ZodType<unknown>,
  init: RequestInit = {},
  options: GitHubRequestOptions = {},
): Promise<unknown> {
  const { response, body } = await requestResponse(path, init, options);
  const payload = parseJsonBody(body);
  if (!schema) return payload;
  return parseWithSchema(payload, schema, path, init.method ?? "GET");
}

export async function githubWrite<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  payload: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  return githubRequest(
    path,
    schema,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    { requireToken: true },
  );
}

const graphQLError = z.object({ message: z.string() }).passthrough();
const graphQLResponse = z.object({
  data: z.unknown().optional(),
  errors: z.array(graphQLError).optional(),
});

export async function githubGraphQL<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  schema: z.ZodType<T>,
): Promise<T> {
  const payload = await githubRequest(
    "/graphql",
    graphQLResponse,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ...(variables === undefined ? {} : { variables }) }),
    },
    { requireToken: true },
  );
  if (payload.errors?.length) {
    throw new Error(
      `GitHub GraphQL request failed: ${payload.errors.map((error) => error.message).join("; ")}`,
      { cause: payload.errors },
    );
  }
  if (!Object.hasOwn(payload, "data")) {
    throw new Error("GitHub GraphQL response contained neither data nor errors.");
  }
  return parseWithSchema(payload.data, schema, "/graphql", "POST");
}

export async function githubArtifactRedirect(path: string): Promise<string> {
  const { response } = await requestResponse(
    path,
    { method: "GET", redirect: "manual" },
    { acceptedStatuses: [302], includeErrorBody: false },
  );
  const location = response.headers.get("Location");
  if (!location) {
    throw new Error("GitHub artifact download redirect did not include a Location header.");
  }
  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch (error) {
    throw new Error("GitHub artifact download redirect contained an invalid URL.", {
      cause: error,
    });
  }
  if (parsed.protocol !== "https:") {
    throw new Error("GitHub artifact download redirect must use HTTPS.");
  }
  return location;
}

export function segment(value: string): string {
  return encodeURIComponent(value);
}
