import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubArtifactRedirect, githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const ARTIFACT_DOWNLOAD_EXPIRES_SECONDS = 60;

const workflowRunResponse = z.object({
  id: z.number(),
  name: z.string().nullable(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  event: z.string(),
  head_branch: z.string().nullable(),
  head_sha: z.string(),
  run_number: z.number(),
  run_attempt: z.number(),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const workflowRunListResponse = z.object({
  total_count: z.number(),
  workflow_runs: z.array(workflowRunResponse),
});

const artifactResponse = z.object({
  id: z.number(),
  name: z.string(),
  size_in_bytes: z.number(),
  archive_download_url: z.string(),
  expired: z.boolean(),
  expires_at: z.string(),
  created_at: z.string(),
});

const artifactListResponse = z.object({
  total_count: z.number(),
  artifacts: z.array(artifactResponse),
});

export function registerWorkflows(server: McpServer): void {
  server.registerTool(
    "github_list_workflow_runs",
    {
      title: "List GitHub workflow runs",
      description:
        "List Actions workflow runs with real run state, branch, commit and timestamps. Supports branch/status filters and Link-based pagination.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of results per page (1-100)"),
        branch: z.string().min(1).optional().describe("Only runs associated with this branch"),
        status: z.string().min(1).optional().describe("GitHub workflow run status or conclusion filter"),
      },
    },
    ({ owner, repo, page, perPage, branch, status }) =>
      run(async () => {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
        });
        if (branch !== undefined) query.set("branch", branch);
        if (status !== undefined) query.set("status", status);
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/actions/runs?${query}`,
          workflowRunListResponse,
        );
        return {
          total_count: data.total_count,
          items: data.workflow_runs,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_workflow_run",
    {
      title: "Get a GitHub workflow run",
      description: "Read the real state, branch, commit, attempt and links for one Actions workflow run.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        runId: z.number().int().positive().describe("Workflow run ID"),
      },
    },
    ({ owner, repo, runId }) =>
      run(() =>
        githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/actions/runs/${runId}`,
          workflowRunResponse,
        ),
      ),
  );

  server.registerTool(
    "github_list_workflow_run_artifacts",
    {
      title: "List workflow run artifacts",
      description:
        "List artifact metadata for one workflow run with Link-based pagination. archive_download_url is the API value, not a downloaded file.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        runId: z.number().int().positive().describe("Workflow run ID"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of artifacts per page (1-100)"),
      },
    },
    ({ owner, repo, runId, page, perPage }) =>
      run(async () => {
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/actions/runs/${runId}/artifacts?${new URLSearchParams({
            page: String(page),
            per_page: String(perPage),
          })}`,
          artifactListResponse,
        );
        return {
          total_count: data.total_count,
          items: data.artifacts,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_download_workflow_artifact",
    {
      title: "Get a workflow artifact download URL",
      description:
        "Resolve one artifact's official 302 redirect without following it or writing a file. Returns an HTTPS URL valid for one minute, delivered in this tool result; open it only on demand.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        artifactId: z.number().int().positive().describe("Workflow artifact ID"),
      },
    },
    ({ owner, repo, artifactId }) =>
      run(async () => {
        const downloadUrl = await githubArtifactRedirect(
          `/repos/${segment(owner)}/${segment(repo)}/actions/artifacts/${artifactId}/zip`,
        );
        return {
          artifactId,
          downloadUrl,
          expiresInSeconds: ARTIFACT_DOWNLOAD_EXPIRES_SECONDS,
        };
      }),
  );
}
