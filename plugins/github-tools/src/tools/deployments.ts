import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, githubRequestWithResponse, segment } from "../github/client";
import { pageInput, paginationFromLink } from "../github/pagination";
import { run } from "../mcp/result";

const deploymentResponse = z.object({
  id: z.number(),
  sha: z.string(),
  ref: z.string(),
  task: z.string(),
  payload: z.unknown(),
  environment: z.string(),
  original_environment: z.string(),
  description: z.string().nullable(),
  creator: z.object({ login: z.string() }).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  statuses_url: z.string(),
  repository_url: z.string(),
  transient_environment: z.boolean(),
  production_environment: z.boolean(),
});

const checkRunPullRequest = z.object({
  id: z.number(),
  number: z.number(),
  head: z.object({ ref: z.string(), sha: z.string() }).nullable(),
  base: z.object({ ref: z.string(), sha: z.string() }).nullable(),
});

const checkRunResponse = z.object({
  id: z.number(),
  name: z.string(),
  head_sha: z.string(),
  external_id: z.string().nullable(),
  status: z.string(),
  conclusion: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  output: z.object({
    title: z.string().nullable(),
    summary: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    annotations_count: z.number(),
    annotations_url: z.string(),
  }),
  check_suite: z.object({ id: z.number() }),
  app: z.object({ id: z.number(), slug: z.string() }).nullable(),
  pull_requests: z.array(checkRunPullRequest),
  html_url: z.string().nullable(),
  details_url: z.string().nullable(),
});

const checkRunListResponse = z.object({
  total_count: z.number(),
  check_runs: z.array(checkRunResponse),
});

function projectCheckRun(
  run: z.infer<typeof checkRunResponse>,
  includeOutput: boolean,
): z.infer<typeof checkRunResponse> {
  return {
    ...run,
    output: includeOutput
      ? run.output
      : {
          title: run.output.title,
          annotations_count: run.output.annotations_count,
          annotations_url: run.output.annotations_url,
        },
  };
}

export function registerDeployments(server: McpServer): void {
  server.registerTool(
    "github_list_deployments",
    {
      title: "List GitHub deployments",
      description:
        "List deployments for a repository with optional commit SHA, ref, task and environment filters. Returns Link-based pagination.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        sha: z.string().min(1).optional().describe("Only deployments for this commit SHA"),
        ref: z.string().min(1).optional().describe("Only deployments for this branch or tag"),
        task: z.string().min(1).optional().describe("Only deployments with this task name"),
        environment: z.string().min(1).optional().describe("Only deployments to this environment"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of deployments per page (1-100)"),
      },
    },
    ({ owner, repo, sha, ref, task, environment, page, perPage }) =>
      run(async () => {
        const query = new URLSearchParams({
          page: String(page),
          per_page: String(perPage),
        });
        if (sha !== undefined) query.set("sha", sha);
        if (ref !== undefined) query.set("ref", ref);
        if (task !== undefined) query.set("task", task);
        if (environment !== undefined) query.set("environment", environment);
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/deployments?${query}`,
          z.array(deploymentResponse),
        );
        return {
          items: data,
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_deployment",
    {
      title: "Get a GitHub deployment",
      description:
        "Read one deployment with its commit SHA, ref, environment, creator, task payload and status URL.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        deploymentId: z.number().int().positive().describe("Deployment ID"),
      },
    },
    ({ owner, repo, deploymentId }) =>
      run(() =>
        githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/deployments/${deploymentId}`,
          deploymentResponse,
        ),
      ),
  );

  server.registerTool(
    "github_list_check_runs",
    {
      title: "List check runs for a commit ref",
      description:
        "List check runs for a commit ref with name, status, latest/all filter and app filters. Returns real status, conclusion, output title and annotation counts by default, and Link-based pagination. Set includeOutput to add output.summary and output.text.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        ref: z.string().min(1).describe("Commit SHA, branch or tag"),
        checkName: z.string().min(1).optional().describe("Only check runs with this name"),
        status: z.string().min(1).optional().describe("Only check runs with this status or conclusion"),
        filter: z.enum(["latest", "all"]).default("latest").describe("Return the latest check runs per name, or all of them"),
        appId: z.number().int().positive().optional().describe("Only check runs created by this GitHub App ID"),
        page: pageInput,
        perPage: z.number().int().min(1).max(100).default(20).describe("Number of check runs per page (1-100)"),
        includeOutput: z
          .boolean()
          .default(false)
          .describe("Include output.summary and output.text; off by default to avoid exceeding the 20k character limit"),
      },
    },
    ({ owner, repo, ref, checkName, status, filter, appId, page, perPage, includeOutput }) =>
      run(async () => {
        const query = new URLSearchParams({
          filter,
          page: String(page),
          per_page: String(perPage),
        });
        if (checkName !== undefined) query.set("check_name", checkName);
        if (status !== undefined) query.set("status", status);
        if (appId !== undefined) query.set("app_id", String(appId));
        const { data, response } = await githubRequestWithResponse(
          `/repos/${segment(owner)}/${segment(repo)}/commits/${segment(ref)}/check-runs?${query}`,
          checkRunListResponse,
        );
        return {
          total_count: data.total_count,
          items: data.check_runs.map((run) => projectCheckRun(run, includeOutput)),
          pagination: paginationFromLink(response.headers.get("Link"), page, perPage),
        };
      }),
  );

  server.registerTool(
    "github_get_check_run",
    {
      title: "Get a GitHub check run",
      description:
        "Read one check run with its status, conclusion, timestamps, check suite, app and pull requests. Output returns the title and annotation counts by default; set includeOutput to add summary and text.",
      inputSchema: {
        owner: z.string().min(1).describe("Repository owner"),
        repo: z.string().min(1).describe("Repository name"),
        checkRunId: z.number().int().positive().describe("Check run ID"),
        includeOutput: z
          .boolean()
          .default(false)
          .describe("Include output.summary and output.text; off by default to avoid exceeding the 20k character limit"),
      },
    },
    ({ owner, repo, checkRunId, includeOutput }) =>
      run(async () => {
        const checkRun = await githubRequest(
          `/repos/${segment(owner)}/${segment(repo)}/check-runs/${checkRunId}`,
          checkRunResponse,
        );
        return projectCheckRun(checkRun, includeOutput);
      }),
  );
}
