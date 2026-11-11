import type { ToolCategory, Translate } from "./types";
import { asNumber, asText } from "./parsing";

export type { ToolKind, Args, Payload };
export {
  TOOL_KINDS,
  TOOL_CATEGORIES,
  TOOL_FIELDS,
  WRITE_KINDS,
  summarize,
};

type ToolKind =
  | "searchRepositories"
  | "getRepository"
  | "listIssues"
  | "getIssue"
  | "listCommits"
  | "getCommit"
  | "getFile"
  | "searchCode"
  | "listPullRequests"
  | "getPullRequest"
  | "mergePullRequest"
  | "comment"
  | "createIssue"
  | "updateIssue"
  | "createPullRequest"
  | "reviewPullRequest"
  | "commentPullRequestLine"
  | "revertPullRequest"
  | "createRelease"
  | "uploadReleaseAsset"
  | "putFile"
  | "listWorkflowRuns"
  | "getWorkflowRun"
  | "listWorkflowRunArtifacts"
  | "downloadWorkflowArtifact"
  | "graphql"
  | "listDiscussions"
  | "getDiscussion"
  | "listNotifications"
  | "getNotification"
  | "listDeployments"
  | "getDeployment"
  | "listCheckRuns"
  | "getCheckRun"
  | "getOrganization"
  | "listTeams"
  | "getTeam"
  | "listGists"
  | "getGist"
  | "listPackages"
  | "getPackage";

type Args = Record<string, unknown>;
type Payload = Record<string, unknown> | unknown[] | string | null;

const TOOL_KINDS: Record<string, ToolKind> = {
  github_search_repositories: "searchRepositories",
  github_get_repository: "getRepository",
  github_list_issues: "listIssues",
  github_get_issue: "getIssue",
  github_list_commits: "listCommits",
  github_get_commit: "getCommit",
  github_get_file: "getFile",
  github_search_code: "searchCode",
  github_list_pull_requests: "listPullRequests",
  github_get_pull_request: "getPullRequest",
  github_merge_pull_request: "mergePullRequest",
  github_comment: "comment",
  github_create_issue: "createIssue",
  github_update_issue: "updateIssue",
  github_create_pull_request: "createPullRequest",
  github_review_pull_request: "reviewPullRequest",
  github_comment_pull_request_line: "commentPullRequestLine",
  github_revert_pull_request: "revertPullRequest",
  github_create_release: "createRelease",
  github_upload_release_asset: "uploadReleaseAsset",
  github_put_file: "putFile",
  github_list_workflow_runs: "listWorkflowRuns",
  github_get_workflow_run: "getWorkflowRun",
  github_list_workflow_run_artifacts: "listWorkflowRunArtifacts",
  github_download_workflow_artifact: "downloadWorkflowArtifact",
  github_graphql: "graphql",
  github_list_discussions: "listDiscussions",
  github_get_discussion: "getDiscussion",
  github_list_notifications: "listNotifications",
  github_get_notification: "getNotification",
  github_list_deployments: "listDeployments",
  github_get_deployment: "getDeployment",
  github_list_check_runs: "listCheckRuns",
  github_get_check_run: "getCheckRun",
  github_get_organization: "getOrganization",
  github_list_teams: "listTeams",
  github_get_team: "getTeam",
  github_list_gists: "listGists",
  github_get_gist: "getGist",
  github_list_packages: "listPackages",
  github_get_package: "getPackage",
};

const TOOL_CATEGORIES: Record<ToolKind, ToolCategory> = {
  searchRepositories: "git",
  getRepository: "git",
  listIssues: "todo",
  getIssue: "read",
  listCommits: "git",
  getCommit: "git",
  getFile: "read",
  searchCode: "search",
  listPullRequests: "git",
  getPullRequest: "read",
  mergePullRequest: "git",
  comment: "message",
  createIssue: "todo",
  updateIssue: "todo",
  createPullRequest: "git",
  reviewPullRequest: "git",
  commentPullRequestLine: "message",
  revertPullRequest: "git",
  createRelease: "create",
  uploadReleaseAsset: "create",
  putFile: "create",
  listWorkflowRuns: "workflow",
  getWorkflowRun: "workflow",
  listWorkflowRunArtifacts: "workflow",
  downloadWorkflowArtifact: "web",
  graphql: "git",
  listDiscussions: "message",
  getDiscussion: "message",
  listNotifications: "message",
  getNotification: "message",
  listDeployments: "git",
  getDeployment: "git",
  listCheckRuns: "workflow",
  getCheckRun: "workflow",
  getOrganization: "read",
  listTeams: "read",
  getTeam: "read",
  listGists: "read",
  getGist: "read",
  listPackages: "read",
  getPackage: "read",
};

const TOOL_FIELDS: Record<ToolKind, string[]> = {
  searchRepositories: ["page", "perPage"],
  getRepository: [],
  listIssues: ["state", "page", "perPage"],
  getIssue: [],
  listCommits: ["ref", "path", "author", "since", "until", "page", "perPage"],
  getCommit: ["ref"],
  getFile: ["ref", "startLine", "endLine"],
  searchCode: ["page", "perPage"],
  listPullRequests: ["state", "page", "perPage"],
  getPullRequest: [],
  mergePullRequest: ["mergeMethod", "commitTitle", "sha"],
  comment: [],
  createIssue: ["labels", "assignees"],
  updateIssue: ["state", "labels", "assignees"],
  createPullRequest: ["draft", "maintainerCanModify"],
  reviewPullRequest: ["event"],
  commentPullRequestLine: ["commitId", "line", "side"],
  revertPullRequest: ["pullRequestId", "title", "draft"],
  createRelease: ["targetCommitish", "draft", "prerelease"],
  uploadReleaseAsset: ["releaseId", "name", "contentType", "label"],
  putFile: ["branch", "sha"],
  listWorkflowRuns: ["branch", "status", "page", "perPage"],
  getWorkflowRun: [],
  listWorkflowRunArtifacts: ["page", "perPage"],
  downloadWorkflowArtifact: [],
  graphql: [],
  listDiscussions: ["first", "after", "categoryId", "answered"],
  getDiscussion: [],
  listNotifications: ["all", "participating", "since", "before", "page", "perPage"],
  getNotification: ["threadId"],
  listDeployments: ["ref", "task", "environment", "page", "perPage"],
  getDeployment: ["deploymentId"],
  listCheckRuns: ["ref", "checkName", "status", "filter", "appId", "page", "perPage", "includeOutput"],
  getCheckRun: ["checkRunId", "includeOutput"],
  getOrganization: [],
  listTeams: ["teamType", "page", "perPage"],
  getTeam: ["teamSlug"],
  listGists: ["since", "page", "perPage"],
  getGist: ["gistId", "includeContent"],
  listPackages: ["ownerType", "packageType", "visibility", "page", "perPage"],
  getPackage: ["ownerType", "packageType", "packageName"],
};

const WRITE_KINDS: ReadonlySet<ToolKind> = new Set<ToolKind>([
  "mergePullRequest",
  "comment",
  "createIssue",
  "updateIssue",
  "createPullRequest",
  "reviewPullRequest",
  "commentPullRequestLine",
  "revertPullRequest",
  "createRelease",
  "uploadReleaseAsset",
  "putFile",
]);

function summarize(t: Translate, kind: ToolKind, args: Args): string {
  const owner = asText(args.owner);
  const repo = asText(args.repo);
  const path = asText(args.path);
  const ownerRepo = owner && repo ? `${owner}/${repo}` : "";
  const issueNumber = asNumber(args.issueNumber);
  const pullNumber = asNumber(args.pullNumber);
  const runId = asNumber(args.runId);
  const summarizeText = (value: string, fallback: string): string => {
    const text = value || fallback;
    return text.length > 72 ? `${text.slice(0, 72)}…` : text;
  };
  const title = asText(args.title);
  const issueTarget = issueNumber !== null ? `${ownerRepo}#${issueNumber}` : ownerRepo;
  const pullTarget = pullNumber !== null ? `${ownerRepo}#${pullNumber}` : ownerRepo;
  const fileTarget = [ownerRepo, path].filter(Boolean).join("/");
  switch (kind) {
    case "searchRepositories":
    case "searchCode":
      return summarizeText(asText(args.query), t(`github.tool.${kind}`));
    case "getRepository":
    case "listIssues":
    case "listCommits":
    case "listPullRequests":
      return ownerRepo || t(`github.tool.${kind}`);
    case "getIssue":
      return issueTarget || t("github.tool.getIssue");
    case "getCommit":
      return summarizeText([ownerRepo, asText(args.ref)].filter(Boolean).join("@"), t("github.tool.getCommit"));
    case "getFile":
    case "putFile":
      return summarizeText(fileTarget, t(`github.tool.${kind}`));
    case "getPullRequest":
    case "mergePullRequest":
    case "reviewPullRequest":
      return pullTarget || t(`github.tool.${kind}`);
    case "commentPullRequestLine":
      return summarizeText([pullTarget, path].filter(Boolean).join(" · "), t("github.tool.commentPullRequestLine"));
    case "comment":
    case "updateIssue":
      return issueTarget || t(`github.tool.${kind}`);
    case "createIssue":
    case "createPullRequest":
      return summarizeText([ownerRepo, title].filter(Boolean).join(" · "), t(`github.tool.${kind}`));
    case "revertPullRequest":
      return summarizeText(asText(args.pullRequestId), t("github.tool.revertPullRequest"));
    case "createRelease":
      return summarizeText([ownerRepo, asText(args.tagName)].filter(Boolean).join("@"), t("github.tool.createRelease"));
    case "uploadReleaseAsset":
      return summarizeText(
        [ownerRepo, asNumber(args.releaseId), asText(args.name)].filter(Boolean).join(" · "),
        t("github.tool.uploadReleaseAsset"),
      );
    case "listWorkflowRuns":
      return ownerRepo || t("github.tool.listWorkflowRuns");
    case "getWorkflowRun":
    case "listWorkflowRunArtifacts":
      return runId !== null ? `${ownerRepo} · ${t("github.result.run")} ${runId}` : ownerRepo || t(`github.tool.${kind}`);
    case "downloadWorkflowArtifact":
      return summarizeText([ownerRepo, asNumber(args.artifactId)].filter(Boolean).join(" · "), t("github.tool.downloadWorkflowArtifact"));
    case "graphql": {
      const operation = /^(?:\s|#[^\r\n]*(?:\r\n|\n|\r|$))*mutation\b/i.test(asText(args.query))
        ? t("github.graphql.mutation")
        : t("github.graphql.query");
      return `${t("github.tool.graphql")} · ${operation}`;
    }
    case "listDiscussions":
    case "getDiscussion": {
      const discussionNumber = asNumber(args.number);
      const discussionTarget = discussionNumber !== null ? `${ownerRepo}#${discussionNumber}` : ownerRepo;
      return summarizeText(discussionTarget, t(`github.tool.${kind}`));
    }
    case "listNotifications": {
      const scope = [
        args.all === true ? t("github.field.all") : "",
        args.participating === true ? t("github.field.participating") : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return summarizeText(scope, t("github.tool.listNotifications"));
    }
    case "getNotification":
      return summarizeText(asText(args.threadId), t("github.tool.getNotification"));
    case "listDeployments":
      return summarizeText(
        [ownerRepo, asText(args.environment)].filter(Boolean).join(" · "),
        t("github.tool.listDeployments"),
      );
    case "getDeployment": {
      const deploymentId = asNumber(args.deploymentId);
      return deploymentId !== null
        ? `${ownerRepo} · ${t("github.result.deployment")} ${deploymentId}`
        : ownerRepo || t("github.tool.getDeployment");
    }
    case "listCheckRuns":
      return summarizeText(
        [ownerRepo, asText(args.ref)].filter(Boolean).join("@"),
        t("github.tool.listCheckRuns"),
      );
    case "getCheckRun": {
      const checkRunId = asNumber(args.checkRunId);
      return checkRunId !== null
        ? `${ownerRepo} · ${t("github.result.checkRun")} ${checkRunId}`
        : ownerRepo || t("github.tool.getCheckRun");
    }
    case "getOrganization":
    case "listTeams":
      return summarizeText(asText(args.org), t(`github.tool.${kind}`));
    case "getTeam":
      return summarizeText(
        [asText(args.org), asText(args.teamSlug)].filter(Boolean).join("/"),
        t("github.tool.getTeam"),
      );
    case "listGists":
      return summarizeText(asText(args.username), t("github.tool.listGists"));
    case "getGist":
      return summarizeText(asText(args.gistId), t("github.tool.getGist"));
    case "listPackages":
      return summarizeText(
        [asText(args.owner) || asText(args.ownerType), asText(args.packageType)]
          .filter(Boolean)
          .join(" · "),
        t("github.tool.listPackages"),
      );
    case "getPackage":
      return summarizeText(
        [asText(args.owner), asText(args.packageName)].filter(Boolean).join("/"),
        t("github.tool.getPackage"),
      );
    default:
      return t("github.tool.searchRepositories");
  }
}
