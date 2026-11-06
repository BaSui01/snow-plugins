import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubWrite, segment } from "../github/client";
import { assertResultSize, run } from "../mcp/result";

const MAX_FILE_BYTES = 1_000_000;
const directoryEntry = z.object({
  name: z.string(),
  type: z.string(),
  path: z.string(),
});
const fileResponse = z.object({
  type: z.string(),
  encoding: z.string().optional(),
  content: z.string().optional(),
  size: z.number(),
  html_url: z.string().nullable(),
  path: z.string(),
});
const contentsResponse = z.union([z.array(directoryEntry), fileResponse]);
const releaseResponse = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  html_url: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
});
const releaseAssetResponse = z.object({
  id: z.number(),
  name: z.string(),
  label: z.string().nullable(),
  state: z.string(),
  size: z.number(),
  content_type: z.string(),
  browser_download_url: z.string(),
});
const putFileResponse = z.object({
  content: z.object({ path: z.string(), html_url: z.string(), sha: z.string() }),
  commit: z.object({ sha: z.string(), html_url: z.string() }),
});

type LineBoundary = { start: number; end: number };

function lineBoundaries(text: string): LineBoundary[] {
  if (!text) return [];
  const lines: LineBoundary[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== "\n" && character !== "\r") continue;
    if (character === "\r" && text[index + 1] === "\n") index += 1;
    lines.push({ start, end: index + 1 });
    start = index + 1;
  }
  lines.push({ start, end: text.length });
  return lines;
}

function selectLines(
  text: string,
  startLine: number | undefined,
  endLine: number | undefined,
): {
  text: string;
  range: { startLine: number; endLine: number } | null;
  totalLines: number;
} {
  const lines = lineBoundaries(text);
  if (!lines.length) return { text, range: null, totalLines: 0 };

  const actualStart = startLine ?? 1;
  if (actualStart > lines.length) {
    throw new Error(
      `startLine ${actualStart} exceeds the file's ${lines.length} lines. Choose a range within the file.`,
    );
  }
  const actualEnd = Math.min(endLine ?? lines.length, lines.length);
  const selected = lines.slice(actualStart - 1, actualEnd);
  const first = selected[0];
  const last = selected.at(-1);
  if (!first || !last) {
    throw new Error("The requested line range does not contain any file content.");
  }
  return {
    text: text.slice(first.start, last.end),
    range: { startLine: actualStart, endLine: actualEnd },
    totalLines: lines.length,
  };
}

function decodeReleaseAsset(contentBase64: string): Uint8Array<ArrayBuffer> {
  const normalized = contentBase64.replace(/\s+/g, "");
  if (
    !normalized ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error("contentBase64 must be non-empty, padded Base64 content.");
  }
  const content = Buffer.from(normalized, "base64");
  if (!content.length || content.toString("base64") !== normalized) {
    throw new Error("contentBase64 is not valid canonical Base64 content.");
  }
  const bytes = new Uint8Array(content.byteLength);
  bytes.set(content);
  return bytes;
}

function encodeRepositoryPath(path: string): string {
  return path.split("/").filter(Boolean).map(segment).join("/");
}

export function registerReleasesAndFiles(server: McpServer): void {
  server.registerTool(
    "github_get_file",
    {
      title: "Read a GitHub file",
      description:
        "Read a repository file as UTF-8 text with original line endings. Use startLine/endLine for a bounded range. Oversized results fail instead of truncating. Directory paths retain their listing response.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        path: z.string().min(1).describe("File path inside the repository"),
        ref: z.string().optional().describe("Branch, tag or commit SHA; defaults to the default branch"),
        startLine: z.number().int().positive().optional().describe("First line to return; defaults to 1"),
        endLine: z.number().int().positive().optional().describe("Last line to return; defaults to the file's last line"),
      },
    },
    ({ owner, repo, path, ref, startLine, endLine }) =>
      run(async () => {
        if (endLine !== undefined && startLine !== undefined && endLine < startLine) {
          throw new Error("endLine must be greater than or equal to startLine.");
        }
        const query = ref ? `?${new URLSearchParams({ ref })}` : "";
        const payload = await githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/contents/${encodeRepositoryPath(path)}${query}`,
          contentsResponse,
        );
        if (Array.isArray(payload)) return payload;
        const file = payload;
        if (file.type !== "file") {
          throw new Error(`GitHub path is not a file (type: ${file.type})`);
        }
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(
            `File is ${file.size} bytes; GitHub's contents API boundary is ${MAX_FILE_BYTES} bytes. Line ranges cannot bypass that API boundary.`,
          );
        }
        if (file.encoding !== "base64" || typeof file.content !== "string") {
          throw new Error("GitHub did not return base64 content for this file.");
        }
        const text = Buffer.from(file.content.replace(/\s+/g, ""), "base64").toString("utf8");
        const range = selectLines(text, startLine, endLine);
        const result = {
          path: file.path,
          html_url: file.html_url,
          size: file.size,
          ...range,
        };
        assertResultSize(
          result,
          "Reduce the requested line range with startLine and endLine, then retry the read with a smaller range.",
        );
        return result;
      }),
  );

  server.registerTool(
    "github_create_release",
    {
      title: "Create a GitHub release",
      description:
        "Create a release for a tag. GitHub creates the tag at targetCommitish when it does not exist. Requires an authenticated token with repository write access.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        tagName: z.string().min(1).describe("Tag name, e.g. v1.2.0"),
        name: z.string().optional().describe("Release title"),
        body: z.string().optional().describe("Markdown release notes"),
        targetCommitish: z.string().optional().describe("Branch or commit the tag points at"),
        draft: z.boolean().optional().describe("Create as a draft"),
        prerelease: z.boolean().optional().describe("Mark as a prerelease"),
      },
    },
    ({ owner, repo, tagName, name, body, targetCommitish, draft, prerelease }) =>
      run(() =>
        githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/releases`,
          "POST",
          {
            tag_name: tagName,
            ...(name !== undefined ? { name } : {}),
            ...(body !== undefined ? { body } : {}),
            ...(targetCommitish !== undefined ? { target_commitish: targetCommitish } : {}),
            ...(draft !== undefined ? { draft } : {}),
            ...(prerelease !== undefined ? { prerelease } : {}),
          },
          releaseResponse,
        ),
      ),
  );

  server.registerTool(
    "github_upload_release_asset",
    {
      title: "Upload a GitHub release asset",
      description:
        "Upload caller-provided, non-empty Base64 bytes to GitHub's release asset endpoint. This performs a remote write and does not read an arbitrary local file path. Authentication is required.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        releaseId: z.number().int().positive().describe("Numeric release ID, not the tag name"),
        name: z.string().min(1).describe("Asset file name shown by GitHub"),
        contentBase64: z.string().min(1).describe("Non-empty canonical Base64 content supplied by the caller"),
        contentType: z.string().trim().min(1).describe("MIME Content-Type for the raw asset bytes"),
        label: z.string().min(1).optional().describe("Optional short asset label"),
      },
    },
    ({ owner, repo, releaseId, name, contentBase64, contentType, label }) =>
      run(async () => {
        const content = decodeReleaseAsset(contentBase64);
        const query = new URLSearchParams({ name });
        if (label !== undefined) query.set("label", label);
        return githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/releases/${releaseId}/assets?${query}`,
          releaseAssetResponse,
          {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: content,
          },
          { host: "uploads", requireToken: true },
        );
      }),
  );

  server.registerTool(
    "github_put_file",
    {
      title: "Create or update a GitHub file",
      description:
        "Commit one UTF-8 text file through the contents API. Provide sha to update an existing file. Requires an authenticated token with repository write access. This creates one commit on the branch.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        path: z.string().min(1).describe("File path inside the repository"),
        message: z.string().min(1).describe("Commit message"),
        content: z.string().describe("Full UTF-8 file content"),
        branch: z.string().optional().describe("Branch to commit to; defaults to the default branch"),
        sha: z.string().optional().describe("Blob SHA of the existing file when updating"),
      },
    },
    ({ owner, repo, path, message, content, branch, sha }) =>
      run(async () => {
        const payload = await githubWrite(
          `/repos/${segment(owner)}/${segment(repo)}/contents/${encodeRepositoryPath(path)}`,
          "PUT",
          {
            message,
            content: Buffer.from(content, "utf8").toString("base64"),
            ...(branch !== undefined ? { branch } : {}),
            ...(sha !== undefined ? { sha } : {}),
          },
          putFileResponse,
        );
        return {
          path: payload.content.path,
          html_url: payload.content.html_url,
          sha: payload.content.sha,
          commit_sha: payload.commit.sha,
          commit_url: payload.commit.html_url,
        };
      }),
  );
}
