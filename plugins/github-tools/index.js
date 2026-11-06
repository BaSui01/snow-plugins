// Generated from src/renderer/ by scripts/build.mjs — edit the TypeScript sources, not this file.

// src/renderer/runtime.ts
var React = window.SnowAppPlugin.React;
var { useMemo, useState } = React;

// src/renderer/parsing.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asText = (value) => typeof value === "string" ? value : "";
var asNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
var parseJson = (raw) => {
  if (raw === void 0 || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};
var parseArgs = (raw) => {
  const parsed = parseJson(raw);
  return isRecord(parsed) ? parsed : {};
};
var unwrapResult = (value) => {
  if (isRecord(value) && Array.isArray(value.content)) {
    const text = value.content.flatMap(
      (block) => isRecord(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : []
    ).join("\n");
    if (text) {
      const parsed = parseJson(text);
      return isRecord(parsed) || Array.isArray(parsed) || typeof parsed === "string" ? parsed : text;
    }
  }
  if (isRecord(value) && "result" in value) return unwrapResult(value.result);
  if (isRecord(value) || Array.isArray(value) || typeof value === "string")
    return value;
  return null;
};
var errorText = (payload) => {
  if (typeof payload === "string") return payload;
  if (isRecord(payload) && typeof payload.message === "string")
    return payload.message;
  return payload === null ? "" : JSON.stringify(payload);
};
var safeUrl = (value) => {
  const text = asText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

// src/renderer/config.ts
var TOOL_KINDS = {
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
  github_graphql: "graphql"
};
var TOOL_CATEGORIES = {
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
  graphql: "git"
};
var TOOL_FIELDS = {
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
  graphql: []
};
var WRITE_KINDS = /* @__PURE__ */ new Set([
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
  "putFile"
]);
function summarize(t, kind, args) {
  const owner = asText(args.owner);
  const repo = asText(args.repo);
  const path = asText(args.path);
  const ownerRepo = owner && repo ? `${owner}/${repo}` : "";
  const issueNumber = asNumber(args.issueNumber);
  const pullNumber = asNumber(args.pullNumber);
  const runId = asNumber(args.runId);
  const summarizeText = (value, fallback) => {
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
        t("github.tool.uploadReleaseAsset")
      );
    case "listWorkflowRuns":
      return ownerRepo || t("github.tool.listWorkflowRuns");
    case "getWorkflowRun":
    case "listWorkflowRunArtifacts":
      return runId !== null ? `${ownerRepo} · ${t("github.result.run")} ${runId}` : ownerRepo || t(`github.tool.${kind}`);
    case "downloadWorkflowArtifact":
      return summarizeText([ownerRepo, asNumber(args.artifactId)].filter(Boolean).join(" · "), t("github.tool.downloadWorkflowArtifact"));
    case "graphql": {
      const operation = /^(?:\s|#[^\r\n]*(?:\r\n|\n|\r|$))*mutation\b/i.test(asText(args.query)) ? t("github.graphql.mutation") : t("github.graphql.query");
      return `${t("github.tool.graphql")} · ${operation}`;
    }
    default:
      return t("github.tool.searchRepositories");
  }
}

// src/renderer/presentation.tsx
var truncate = (value, max) => value.length > max ? `${value.slice(0, max)}…` : value;
function CopyButton({
  t,
  value,
  label
}) {
  const [outcome, setOutcome] = useState("idle");
  const text = outcome === "copied" ? t("github.action.copied") : outcome === "error" ? t("github.action.copyFailed") : label ?? t("github.action.copy");
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: `gh-copy${outcome === "error" ? " gh-copy--error" : ""}`,
      title: text,
      "aria-label": text,
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(value);
          setOutcome("copied");
        } catch {
          setOutcome("error");
        }
      }
    },
    /* @__PURE__ */ React.createElement("span", { "aria-live": "polite" }, text)
  );
}
function HostIcon({
  api,
  name,
  size = 12
}) {
  const Icon = api.ui.icon(name);
  return Icon ? /* @__PURE__ */ React.createElement(Icon, { size, className: "gh-icon" }) : null;
}
function OpenButton({
  api,
  url,
  label,
  title,
  className = "gh-link"
}) {
  const safe = safeUrl(url);
  if (!safe) return /* @__PURE__ */ React.createElement("span", { className }, label);
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className,
      title: title ?? safe,
      onClick: () => api.links.open(safe, "browser")
    },
    label
  );
}
function SectionTitle({
  children
}) {
  return /* @__PURE__ */ React.createElement("div", { className: "gh-section-title" }, /* @__PURE__ */ React.createElement("span", null, children));
}
function Params({
  t,
  kind,
  args
}) {
  const fields = TOOL_FIELDS[kind].filter((field) => args[field] !== void 0);
  if (!fields.length) return null;
  return /* @__PURE__ */ React.createElement("dl", { className: "gh-params" }, fields.map((field) => {
    const value = args[field];
    const label = t(`github.field.${field}`, { defaultValue: field });
    const state = (field === "state" || field === "status") && typeof value === "string";
    const text = state ? t(`github.state.${String(value)}`, { defaultValue: String(value) }) : field === "event" && typeof value === "string" ? t(`github.event.${value}`, { defaultValue: value }) : field === "mergeMethod" && typeof value === "string" ? t(`github.mergeMethod.${value}`, { defaultValue: value }) : typeof value === "boolean" ? t(value ? "github.value.yes" : "github.value.no") : Array.isArray(value) ? value.filter((item) => typeof item === "string").join(", ") || t("github.value.empty") : typeof value === "string" || typeof value === "number" ? String(value) : "";
    return /* @__PURE__ */ React.createElement("div", { className: "gh-param", key: field }, /* @__PURE__ */ React.createElement("dt", null, label), /* @__PURE__ */ React.createElement("dd", null, state ? /* @__PURE__ */ React.createElement("span", { className: `gh-state gh-state--${String(value)}` }, text) : /* @__PURE__ */ React.createElement("code", { className: "gh-param-value", title: text }, truncate(text, 160))));
  }));
}
function Pagination({
  t,
  payload
}) {
  if (!isRecord(payload.pagination)) return null;
  const page = asNumber(payload.pagination.page);
  const perPage = asNumber(payload.pagination.perPage);
  if (page === null || perPage === null) return null;
  const hasNext = payload.pagination.hasNextPage === true;
  return /* @__PURE__ */ React.createElement("div", { className: "gh-hint gh-pagination" }, /* @__PURE__ */ React.createElement("span", null, t("github.pagination.page", { values: { page } })), /* @__PURE__ */ React.createElement("span", null, t("github.pagination.perPage", { values: { count: perPage } })), /* @__PURE__ */ React.createElement("span", null, t(hasNext ? "github.pagination.hasNext" : "github.pagination.noNext")));
}
function RawBlock({
  t,
  payload
}) {
  return /* @__PURE__ */ React.createElement("details", { className: "gh-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("github.result.raw")), /* @__PURE__ */ React.createElement("pre", null, JSON.stringify(payload, null, 2)));
}

// src/renderer/views/repositories.tsx
function RepoStats({
  api,
  repo
}) {
  const { t } = api;
  const stats = [
    { icon: "Star", value: asNumber(repo.stargazers_count), label: t("github.result.stars") },
    { icon: "GitFork", value: asNumber(repo.forks_count), label: t("github.result.forks") },
    { icon: "CircleDot", value: asNumber(repo.open_issues_count), label: t("github.result.issues") }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "gh-stats" }, stats.map(
    ({ icon, value, label }) => value !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-stat", key: icon, title: label, "aria-label": `${label}: ${value}` }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: icon, size: 11 }), value.toLocaleString()) : null
  ));
}
function Tags({ values }) {
  const tags = Array.isArray(values) ? values.filter((value) => typeof value === "string") : [];
  if (!tags.length) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "gh-tags" }, tags.slice(0, 6).map((tag) => /* @__PURE__ */ React.createElement("span", { className: "gh-tag", key: tag }, tag)), tags.length > 6 ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, "+", tags.length - 6) : null);
}
function RepoList({
  api,
  payload
}) {
  const { t } = api;
  const [limit, setLimit] = useState(8);
  const items = useMemo(
    () => (Array.isArray(payload.items) ? payload.items : []).filter(isRecord),
    [payload]
  );
  const total = asNumber(payload.total_count) ?? items.length;
  if (!items.length)
    return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  const visible = items.slice(0, limit);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, visible.map((repo, index) => {
    const fullName = asText(repo.full_name) || asText(repo.name) || `#${index + 1}`;
    const description = asText(repo.description);
    const language = asText(repo.language);
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item", key: `${fullName}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
      OpenButton,
      {
        api,
        url: asText(repo.html_url),
        label: fullName,
        className: "gh-link gh-link--strong"
      }
    ), /* @__PURE__ */ React.createElement(RepoStats, { api, repo })), description ? /* @__PURE__ */ React.createElement("p", { className: "gh-desc" }, truncate(description, 220)) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, language ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-language" }, language) : null));
  }), items.length > visible.length ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gh-more",
      onClick: () => setLimit((current) => current + 8)
    },
    t("github.action.more"),
    " · ",
    items.length - visible.length
  ) : null, total > items.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, t("github.result.total", {
    values: { total }
  })) : null);
}
function RepoDetails({
  api,
  repo
}) {
  const { t } = api;
  const description = asText(repo.description);
  const license = isRecord(repo.license) ? asText(repo.license.spdx_id) || asText(repo.license.name) : "";
  const homepage = safeUrl(repo.homepage);
  const fullName = asText(repo.full_name) || [asText(repo.owner && isRecord(repo.owner) ? repo.owner.login : ""), asText(repo.name)].filter(Boolean).join("/");
  return /* @__PURE__ */ React.createElement("div", { className: "gh-repo" }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(repo.html_url),
      label: fullName || t("github.result.repository"),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement(RepoStats, { api, repo })), description ? /* @__PURE__ */ React.createElement("p", { className: "gh-desc" }, description) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, repo.private === true ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.state.private")) : null, repo.archived === true ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, t("github.state.archived")) : null, asText(repo.language) ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-language" }, asText(repo.language)) : null, license ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, license) : null, asText(repo.default_branch) ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.field.defaultBranch"), ": ", asText(repo.default_branch)) : null, homepage ? /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: homepage,
      label: homepage.replace(/^https?:\/\//, ""),
      className: "gh-link"
    }
  ) : null), /* @__PURE__ */ React.createElement(Tags, { values: repo.topics }), asText(repo.updated_at) ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint gh-updated" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Clock" }), t("github.result.updated", {
    values: { date: asText(repo.updated_at).slice(0, 10) }
  })) : null);
}

// src/renderer/views/issues.tsx
function IssueItem({
  api,
  issue,
  detailed = false
}) {
  const { t } = api;
  const number = asNumber(issue.number);
  const state = asText(issue.state);
  const labels = Array.isArray(issue.labels) ? issue.labels.map((label) => isRecord(label) ? asText(label.name) : asText(label)).filter(Boolean) : [];
  const isPullRequest = Boolean(issue.pull_request);
  const author = isRecord(issue.user) ? asText(issue.user.login) : "";
  const comments = asNumber(issue.comments);
  const updated = asText(issue.updated_at);
  const created = asText(issue.created_at);
  const body = asText(issue.body);
  return /* @__PURE__ */ React.createElement("article", { className: `gh-item gh-issue-item${detailed ? "" : " gh-item--compact"}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(issue.html_url),
      title: asText(issue.title),
      label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: isPullRequest ? "GitPullRequest" : "CircleDot" }), number !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", number) : null, /* @__PURE__ */ React.createElement("span", null, asText(issue.title) || t("github.result.issue"))),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "gh-state-row" }, isPullRequest ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, "PR") : null, state ? /* @__PURE__ */ React.createElement("span", { className: `gh-state gh-state--${state}` }, t(`github.state.${state}`, { defaultValue: state })) : null)), body ? detailed ? /* @__PURE__ */ React.createElement("pre", { className: "gh-comment-body" }, body) : /* @__PURE__ */ React.createElement("p", { className: "gh-desc" }, truncate(body.trim(), 180)) : null, labels.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-tags" }, (detailed ? labels : labels.slice(0, 5)).map((label) => /* @__PURE__ */ React.createElement("span", { className: "gh-tag", key: label }, label))) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, author ? /* @__PURE__ */ React.createElement("span", { title: t("github.field.author") }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "User" }), author) : null, comments !== null ? /* @__PURE__ */ React.createElement("span", { title: t("github.result.comments"), "aria-label": `${t("github.result.comments")}: ${comments}` }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "MessageSquare" }), comments) : null, detailed && created ? /* @__PURE__ */ React.createElement("time", { dateTime: created }, t("github.result.created", { values: { date: created } })) : null, updated ? /* @__PURE__ */ React.createElement("time", { dateTime: updated }, t("github.result.updated", { values: { date: updated } })) : null));
}
function IssueList({
  api,
  items
}) {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length) return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  const visible = items.slice(0, limit);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, visible.map((issue, index) => /* @__PURE__ */ React.createElement(IssueItem, { api, issue, key: `${asNumber(issue.number) ?? index}` })), items.length > visible.length ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "gh-more", onClick: () => setLimit((current) => current + 10) }, t("github.action.more"), " · ", items.length - visible.length) : null);
}
function IssueDetails({
  api,
  issue
}) {
  return /* @__PURE__ */ React.createElement(IssueItem, { api, issue, detailed: true });
}

// src/renderer/views/commits.tsx
function CommitList({
  api,
  items
}) {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length) return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  const visible = items.slice(0, limit);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, visible.map((commit, index) => {
    const sha = asText(commit.sha);
    const message = asText(commit.message);
    const title = message.split(/\r?\n/)[0] || t("github.result.commit");
    const author = asText(commit.author);
    const date = asText(commit.date);
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact", key: `${sha}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
      OpenButton,
      {
        api,
        url: asText(commit.html_url),
        label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitCommitHorizontal" }), sha ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, sha.slice(0, 7)) : null, title),
        className: "gh-link gh-link--strong"
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "gh-state-row" }, author ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, author) : null, date ? /* @__PURE__ */ React.createElement("span", { className: "gh-hint", title: date }, date.slice(0, 10)) : null)));
  }), items.length > visible.length ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "gh-more", onClick: () => setLimit((current) => current + 10) }, t("github.action.more"), " · ", items.length - visible.length) : null);
}
function CommitDetails({
  api,
  commit
}) {
  const { t } = api;
  const sha = asText(commit.sha);
  const message = asText(commit.message);
  const parents = Array.isArray(commit.parents) ? commit.parents.filter(isRecord) : [];
  const files = Array.isArray(commit.files) ? commit.files.filter(isRecord) : [];
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, /* @__PURE__ */ React.createElement("article", { className: "gh-item" }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(commit.html_url),
      label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitCommitHorizontal" }), /* @__PURE__ */ React.createElement("span", null, message.split(/\r?\n/)[0] || t("github.result.commit"))),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement(CopyButton, { t, value: sha, label: t("github.action.copySha") })), /* @__PURE__ */ React.createElement("div", { className: "gh-sha-row" }, /* @__PURE__ */ React.createElement("code", { title: sha }, sha)), message ? /* @__PURE__ */ React.createElement("pre", { className: "gh-comment-body" }, message) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, asText(commit.author) ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "User" }), asText(commit.author)) : null, asText(commit.date) ? /* @__PURE__ */ React.createElement("time", { dateTime: asText(commit.date) }, asText(commit.date)) : null), parents.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-sha-list" }, /* @__PURE__ */ React.createElement("span", null, t("github.result.parents"), ":"), parents.map((parent, index) => {
    const parentSha = asText(parent.sha);
    return /* @__PURE__ */ React.createElement(
      OpenButton,
      {
        api,
        url: asText(parent.html_url),
        label: parentSha.slice(0, 10) || `${index + 1}`,
        title: parentSha,
        className: "gh-link",
        key: `${parentSha}-${index}`
      }
    );
  })) : null), files.map((file, index) => {
    const filename = asText(file.filename);
    const additions = asNumber(file.additions);
    const deletions = asNumber(file.deletions);
    const changes = asNumber(file.changes);
    const patch = file.patch;
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact", key: `${filename}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement("code", { className: "gh-write-title", title: filename }, filename), /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, asText(file.status))), /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, additions !== null ? /* @__PURE__ */ React.createElement("span", null, "+", additions) : null, deletions !== null ? /* @__PURE__ */ React.createElement("span", null, "−", deletions) : null, changes !== null ? /* @__PURE__ */ React.createElement("span", null, t("github.result.changes", { values: { count: changes } })) : null), typeof patch === "string" ? /* @__PURE__ */ React.createElement("details", { className: "gh-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("github.result.patch")), /* @__PURE__ */ React.createElement("pre", null, patch)) : null);
  }));
}

// src/renderer/views/files.tsx
function DirectoryList({
  api,
  items
}) {
  const { t } = api;
  if (!items.length) return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, items.map((entry, index) => /* @__PURE__ */ React.createElement("div", { className: `gh-dir-row${asText(entry.type) === "dir" ? " gh-dir-row--folder" : ""}`, key: `${asText(entry.path)}-${index}` }, /* @__PURE__ */ React.createElement(
    HostIcon,
    {
      api,
      name: asText(entry.type) === "dir" ? "Folder" : "FileText",
      size: 12
    }
  ), /* @__PURE__ */ React.createElement("code", { className: "gh-dir-path" }, asText(entry.path) || asText(entry.name)), /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, asText(entry.type) || t("github.result.file")))));
}
function FileView({
  api,
  payload
}) {
  const { t } = api;
  const [expanded, setExpanded] = useState(false);
  const text = asText(payload.text);
  const lines = useMemo(() => text.split(/\r\n|\n|\r/), [text]);
  const range = isRecord(payload.range) ? payload.range : null;
  const totalLines = asNumber(payload.totalLines) ?? lines.length;
  const rangeStart = range ? asNumber(range.startLine) : null;
  const rangeEnd = range ? asNumber(range.endLine) : null;
  const preview = expanded ? text : lines.slice(0, 24).join("\n");
  return /* @__PURE__ */ React.createElement("div", { className: "gh-file" }, /* @__PURE__ */ React.createElement("div", { className: "gh-file-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(payload.html_url),
      label: asText(payload.path) || t("github.result.file"),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "gh-file-actions" }, /* @__PURE__ */ React.createElement("span", { className: "gh-hint" }, rangeStart !== null && rangeEnd !== null ? `${t("github.result.range", { values: { start: rangeStart, end: rangeEnd } })} · ` : "", t("github.result.totalLines", { values: { count: totalLines } }), asNumber(payload.size) !== null ? ` · ${(asNumber(payload.size) ?? 0).toLocaleString()} B` : ""), /* @__PURE__ */ React.createElement(CopyButton, { t, value: text, label: t("github.action.copyFile") }))), /* @__PURE__ */ React.createElement("pre", { className: "gh-code" }, preview), lines.length > 24 ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gh-more",
      onClick: () => setExpanded((current) => !current)
    },
    expanded ? t("github.action.collapse") : t("github.action.expand")
  ) : null);
}
function CodeList({
  api,
  payload
}) {
  const { t } = api;
  const [limit, setLimit] = useState(8);
  const items = useMemo(
    () => (Array.isArray(payload.items) ? payload.items : []).filter(isRecord),
    [payload]
  );
  const total = asNumber(payload.total_count) ?? items.length;
  if (!items.length)
    return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  const visible = items.slice(0, limit);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, visible.map((item, index) => {
    const repository = isRecord(item.repository) ? asText(item.repository.full_name) : "";
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact", key: `${asText(item.path)}-${index}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
      OpenButton,
      {
        api,
        url: asText(item.html_url),
        label: asText(item.path) || asText(item.name) || t("github.result.file"),
        className: "gh-link gh-link--strong"
      }
    ), repository ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, repository) : null));
  }), items.length > visible.length ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gh-more",
      onClick: () => setLimit((current) => current + 8)
    },
    t("github.action.more"),
    " · ",
    items.length - visible.length
  ) : null, total > items.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, t("github.result.total", {
    values: { total }
  })) : null);
}

// src/renderer/views/pull-requests.tsx
function PullRequestState({
  api,
  pullRequest
}) {
  const { t } = api;
  const state = asText(pullRequest.state);
  return /* @__PURE__ */ React.createElement("span", { className: "gh-state-row" }, pullRequest.draft === true ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, t("github.state.draft")) : null, state ? /* @__PURE__ */ React.createElement("span", { className: `gh-state gh-state--${state}` }, t(`github.state.${state}`, { defaultValue: state })) : null);
}
function BranchFlow({
  api,
  pullRequest,
  withSha = false
}) {
  const { t } = api;
  const head = isRecord(pullRequest.head) ? pullRequest.head : null;
  const base = isRecord(pullRequest.base) ? pullRequest.base : null;
  if (!head || !base) return null;
  const label = (reference) => {
    const ref = asText(reference.ref) || t("github.value.empty");
    const sha = asText(reference.sha);
    return withSha && sha ? `${ref}@${sha.slice(0, 10)}` : ref;
  };
  const headText = label(head);
  const baseText = label(base);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-branch-flow" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitBranch" }), /* @__PURE__ */ React.createElement("code", { title: `${asText(head.ref)} ${asText(head.sha)}`.trim() }, headText), /* @__PURE__ */ React.createElement(HostIcon, { api, name: "ArrowRight" }), /* @__PURE__ */ React.createElement("code", { title: `${asText(base.ref)} ${asText(base.sha)}`.trim() }, baseText));
}
function PullRequestList({
  api,
  items
}) {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length) return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, items.slice(0, limit).map((pullRequest, index) => {
    const number = typeof pullRequest.number === "number" ? pullRequest.number : index + 1;
    const author = isRecord(pullRequest.user) ? asText(pullRequest.user.login) : "";
    const updated = asText(pullRequest.updated_at);
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact", key: `${asText(pullRequest.node_id)}-${number}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
      OpenButton,
      {
        api,
        url: asText(pullRequest.html_url),
        label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitPullRequest" }), /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", number), /* @__PURE__ */ React.createElement("span", null, asText(pullRequest.title) || t("github.result.pullRequest"))),
        className: "gh-link gh-link--strong"
      }
    ), /* @__PURE__ */ React.createElement(PullRequestState, { api, pullRequest })), /* @__PURE__ */ React.createElement(BranchFlow, { api, pullRequest, withSha: true }), author || updated ? /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, author ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "User" }), author) : null, updated ? /* @__PURE__ */ React.createElement("time", { dateTime: updated }, t("github.result.updated", { values: { date: updated } })) : null) : null);
  }), items.length > limit ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "gh-more", onClick: () => setLimit((current) => current + 10) }, t("github.action.more"), " · ", items.length - limit) : null);
}
function RepositoryLink({
  api,
  label,
  value
}) {
  const { t } = api;
  if (!isRecord(value)) {
    return /* @__PURE__ */ React.createElement("span", { className: "gh-hint" }, label, ": ", t("github.result.repositoryUnavailable"));
  }
  return /* @__PURE__ */ React.createElement("span", { className: "gh-meta-row" }, /* @__PURE__ */ React.createElement("span", null, label, ":"), /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(value.html_url),
      label: asText(value.full_name) || asText(value.name) || t("github.result.repository"),
      className: "gh-link"
    }
  ));
}
function PullRequestDetails({
  api,
  pullRequest
}) {
  const { t } = api;
  const body = asText(pullRequest.body);
  const mergeable = pullRequest.mergeable;
  const head = isRecord(pullRequest.head) ? pullRequest.head : null;
  const base = isRecord(pullRequest.base) ? pullRequest.base : null;
  return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-issue-item" }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(pullRequest.html_url),
      label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitPullRequest" }), /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", asNumber(pullRequest.number) ?? ""), /* @__PURE__ */ React.createElement("span", null, asText(pullRequest.title) || t("github.result.pullRequest"))),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement(PullRequestState, { api, pullRequest })), body ? /* @__PURE__ */ React.createElement("pre", { className: "gh-comment-body" }, body) : null, /* @__PURE__ */ React.createElement(BranchFlow, { api, pullRequest, withSha: true }), /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.nodeId"), ": ", /* @__PURE__ */ React.createElement("code", null, asText(pullRequest.node_id))), /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.merged"), ": ", t(pullRequest.merged === true ? "github.value.yes" : "github.value.no")), /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.mergeable"), ": ", mergeable === null ? t("github.state.calculating") : t(mergeable === true ? "github.value.yes" : "github.value.no")), asText(pullRequest.mergeable_state) ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.mergeableState"), ": ", asText(pullRequest.mergeable_state)) : null), head ? /* @__PURE__ */ React.createElement(RepositoryLink, { api, label: t("github.field.headRepository"), value: head.repo }) : null, base ? /* @__PURE__ */ React.createElement(RepositoryLink, { api, label: t("github.field.baseRepository"), value: base.repo }) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, asText(pullRequest.created_at) ? /* @__PURE__ */ React.createElement("time", { dateTime: asText(pullRequest.created_at) }, t("github.result.created", { values: { date: asText(pullRequest.created_at) } })) : null, asText(pullRequest.updated_at) ? /* @__PURE__ */ React.createElement("time", { dateTime: asText(pullRequest.updated_at) }, t("github.result.updated", { values: { date: asText(pullRequest.updated_at) } })) : null));
}

// src/renderer/views/actions.tsx
function StateTag({ api, value }) {
  const text = asText(value);
  if (!text) return null;
  return /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, api.t(`github.state.${text}`, { defaultValue: text }));
}
function WorkflowRun({
  api,
  run
}) {
  const { t } = api;
  const id = asNumber(run.id);
  const number = asNumber(run.run_number);
  const attempt = asNumber(run.run_attempt);
  const branch = asText(run.head_branch);
  const sha = asText(run.head_sha);
  const created = asText(run.created_at);
  const updated = asText(run.updated_at);
  return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact" }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(run.html_url),
      label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Workflow" }), /* @__PURE__ */ React.createElement("span", null, asText(run.name) || t("github.result.workflowRun")), number !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", number) : null),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "gh-state-row" }, /* @__PURE__ */ React.createElement(StateTag, { api, value: run.status }), /* @__PURE__ */ React.createElement(StateTag, { api, value: run.conclusion }))), /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, id !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.run"), ": ", id) : null, attempt !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.attempt"), ": ", attempt) : null, asText(run.event) ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, asText(run.event)) : null), branch || sha ? /* @__PURE__ */ React.createElement("div", { className: "gh-branch-flow" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitBranch" }), branch ? /* @__PURE__ */ React.createElement("code", null, branch) : null, sha ? /* @__PURE__ */ React.createElement("code", { title: sha }, sha.slice(0, 10)) : null) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, created ? /* @__PURE__ */ React.createElement("time", { dateTime: created }, t("github.result.created", { values: { date: created } })) : null, updated ? /* @__PURE__ */ React.createElement("time", { dateTime: updated }, t("github.result.updated", { values: { date: updated } })) : null));
}
function WorkflowRunList({
  api,
  items
}) {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length) return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, items.slice(0, limit).map((run, index) => /* @__PURE__ */ React.createElement(WorkflowRun, { api, run, key: `${asNumber(run.id) ?? index}` })), items.length > limit ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "gh-more", onClick: () => setLimit((current) => current + 10) }, t("github.action.more"), " · ", items.length - limit) : null);
}
function WorkflowRunDetails({
  api,
  run
}) {
  return /* @__PURE__ */ React.createElement(WorkflowRun, { api, run });
}
function ArtifactList({
  api,
  items
}) {
  const { t } = api;
  if (!items.length) return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, items.map((artifact, index) => {
    const size = asNumber(artifact.size_in_bytes);
    const expires = asText(artifact.expires_at);
    const created = asText(artifact.created_at);
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact", key: `${asNumber(artifact.id) ?? index}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Package" }), /* @__PURE__ */ React.createElement("span", null, asText(artifact.name) || t("github.result.artifact")), /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", asNumber(artifact.id) ?? "")), artifact.expired === true ? /* @__PURE__ */ React.createElement("span", { className: "gh-state gh-state--closed" }, t("github.state.expired")) : null), /* @__PURE__ */ React.createElement("div", { className: "gh-item-foot" }, size !== null ? /* @__PURE__ */ React.createElement("span", null, t("github.result.bytes", { values: { count: size } })) : null, created ? /* @__PURE__ */ React.createElement("time", { dateTime: created }, t("github.result.created", { values: { date: created } })) : null, expires ? /* @__PURE__ */ React.createElement("time", { dateTime: expires }, t("github.result.expires", { values: { date: expires } })) : null));
  }));
}
function ArtifactDownload({
  api,
  payload
}) {
  const { t } = api;
  const seconds = asNumber(payload.expiresInSeconds);
  const expiration = seconds === null ? t("github.value.empty") : t("github.result.downloadExpires", { values: { seconds } });
  return /* @__PURE__ */ React.createElement("div", { className: "gh-write" }, /* @__PURE__ */ React.createElement("div", { className: "gh-write-head" }, /* @__PURE__ */ React.createElement("span", { className: "gh-write-symbol gh-badge--ok" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Package", size: 14 })), /* @__PURE__ */ React.createElement("span", { className: "gh-write-title" }, t("github.result.artifact"), " #", asNumber(payload.artifactId) ?? ""), /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(payload.downloadUrl),
      label: t("github.action.downloadArtifact"),
      title: expiration,
      className: "gh-link gh-write-link gh-open-link"
    }
  )), /* @__PURE__ */ React.createElement("p", { className: "gh-write-warning" }, expiration));
}

// src/renderer/views/writes.tsx
function writeBadge(t, kind, record) {
  if (kind === "mergePullRequest") {
    return record.merged === true ? { label: t("github.state.merged"), tone: "ok" } : { label: t("github.state.notMerged"), tone: "warn" };
  }
  if (kind === "reviewPullRequest") {
    const state = asText(record.state);
    const key = state === "APPROVED" ? "approved" : state === "CHANGES_REQUESTED" ? "changesRequested" : "commented";
    return {
      label: t(`github.state.${key}`),
      tone: key === "changesRequested" ? "warn" : "ok"
    };
  }
  if (kind === "revertPullRequest") {
    return { label: t("github.state.revertPullRequestCreated"), tone: "ok" };
  }
  if (kind === "commentPullRequestLine") {
    return { label: t("github.state.lineCommentSubmitted"), tone: "ok" };
  }
  if (kind === "uploadReleaseAsset") {
    return { label: t("github.state.assetUploaded"), tone: "ok" };
  }
  if (kind === "createIssue" || kind === "updateIssue" || kind === "createPullRequest") {
    if (kind === "createPullRequest" && record.draft === true) {
      return { label: t("github.state.draft"), tone: "muted" };
    }
    const state = asText(record.state);
    return state ? {
      label: t(`github.state.${state}`, { defaultValue: state }),
      tone: state === "closed" ? "muted" : "ok"
    } : { label: t("github.state.done"), tone: "ok" };
  }
  if (kind === "createRelease") {
    if (record.draft === true) return { label: t("github.state.draft"), tone: "muted" };
    if (record.prerelease === true) return { label: t("github.state.prerelease"), tone: "warn" };
    return { label: t("github.state.published"), tone: "ok" };
  }
  if (kind === "comment") return { label: t("github.state.commented"), tone: "ok" };
  return { label: t("github.state.committed"), tone: "ok" };
}
function WriteResult({
  api,
  kind,
  payload
}) {
  const { t } = api;
  if (!isRecord(payload)) return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
  const record = payload;
  const url = safeUrl(record.html_url) || safeUrl(record.url) || safeUrl(record.browser_download_url);
  const number = asNumber(record.number);
  const title = asText(record.title) || asText(record.name) || asText(record.tag_name) || asText(record.path);
  const message = asText(record.message);
  const body = asText(record.body);
  const sha = asText(record.sha);
  const commitSha = asText(record.commit_sha) || asText(record.commit_id);
  const head = asText(record.head) || asText(record.headRefName);
  const base = asText(record.base) || asText(record.baseRefName);
  const created = asText(record.created_at) || asText(record.submitted_at);
  const line = asNumber(record.line);
  const side = asText(record.side);
  const size = asNumber(record.size);
  const contentType = asText(record.content_type);
  const badge = writeBadge(t, kind, record);
  const icon = kind === "mergePullRequest" ? "GitMerge" : kind === "comment" || kind === "commentPullRequestLine" ? "MessageSquare" : kind === "createIssue" || kind === "updateIssue" ? "CircleDot" : kind === "createPullRequest" || kind === "revertPullRequest" ? "GitPullRequest" : kind === "reviewPullRequest" ? "ClipboardCheck" : kind === "createRelease" ? "Tag" : kind === "uploadReleaseAsset" ? "Package" : "FileUp";
  return /* @__PURE__ */ React.createElement("div", { className: `gh-write gh-write--${kind}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-write-head" }, /* @__PURE__ */ React.createElement("span", { className: `gh-write-symbol gh-badge--${badge.tone}` }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: icon, size: 14 })), /* @__PURE__ */ React.createElement("span", { className: `gh-badge gh-badge--${badge.tone}` }, badge.label), number !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", number) : null, title ? /* @__PURE__ */ React.createElement("span", { className: "gh-write-title", title }, title) : null, url ? /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url,
      title: url,
      label: /* @__PURE__ */ React.createElement(React.Fragment, null, t("github.action.open"), /* @__PURE__ */ React.createElement(HostIcon, { api, name: "ExternalLink" })),
      className: "gh-link gh-write-link gh-open-link"
    }
  ) : null), message && record.merged !== true ? /* @__PURE__ */ React.createElement("p", { className: "gh-write-warning" }, message) : null, head && base ? /* @__PURE__ */ React.createElement("div", { className: "gh-branch-flow" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitBranch" }), /* @__PURE__ */ React.createElement("code", { title: head }, head), /* @__PURE__ */ React.createElement(HostIcon, { api, name: "ArrowRight" }), /* @__PURE__ */ React.createElement("code", { title: base }, base)) : null, kind === "commentPullRequestLine" && (line !== null || side) ? /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, line !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.field.line"), ": ", line) : null, side ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.field.side"), ": ", side) : null) : null, body && (kind === "comment" || kind === "commentPullRequestLine") ? /* @__PURE__ */ React.createElement("pre", { className: "gh-comment-body" }, truncate(body, 1200)) : null, kind === "uploadReleaseAsset" && (size !== null || contentType) ? /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, size !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.result.bytes", { values: { count: size } })) : null, contentType ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, contentType) : null) : null, sha || commitSha ? /* @__PURE__ */ React.createElement("div", { className: "gh-sha-list" }, sha ? /* @__PURE__ */ React.createElement("span", { className: "gh-sha-row" }, /* @__PURE__ */ React.createElement("span", null, t("github.result.blobSha")), /* @__PURE__ */ React.createElement("code", { title: sha }, sha.slice(0, 12)), /* @__PURE__ */ React.createElement(CopyButton, { t, value: sha, label: t("github.action.copySha") })) : null, commitSha ? /* @__PURE__ */ React.createElement("span", { className: "gh-sha-row" }, /* @__PURE__ */ React.createElement("span", null, t("github.result.commit")), /* @__PURE__ */ React.createElement("code", { title: commitSha }, commitSha.slice(0, 12)), /* @__PURE__ */ React.createElement(CopyButton, { t, value: commitSha, label: t("github.action.copySha") })) : null, asText(record.commit_url) ? /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(record.commit_url),
      label: t("github.action.viewCommit"),
      className: "gh-link gh-commit-link"
    }
  ) : null) : null, created ? /* @__PURE__ */ React.createElement("time", { className: "gh-hint gh-created", dateTime: created, title: created }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Clock" }), created) : null);
}

// src/renderer/views/index.tsx
function ResultView({
  api,
  kind,
  payload
}) {
  const { t } = api;
  if (payload === null) return null;
  if (WRITE_KINDS.has(kind)) return /* @__PURE__ */ React.createElement(WriteResult, { api, kind, payload });
  const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items.filter(isRecord) : null;
  const pagination = isRecord(payload) ? /* @__PURE__ */ React.createElement(Pagination, { t, payload }) : null;
  if (kind === "searchRepositories" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(RepoList, { api, payload }), pagination);
  }
  if (kind === "getRepository" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(RepoDetails, { api, repo: payload });
  }
  if (kind === "listIssues" && items) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(IssueList, { api, items }), pagination);
  }
  if (kind === "getIssue" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(IssueDetails, { api, issue: payload });
  }
  if (kind === "listCommits" && items) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CommitList, { api, items }), pagination);
  }
  if (kind === "getCommit" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(CommitDetails, { api, commit: payload });
  }
  if (kind === "listPullRequests" && items) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(PullRequestList, { api, items }), pagination);
  }
  if (kind === "getPullRequest" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(PullRequestDetails, { api, pullRequest: payload });
  }
  if (kind === "getFile") {
    if (Array.isArray(payload)) return /* @__PURE__ */ React.createElement(DirectoryList, { api, items: payload.filter(isRecord) });
    if (isRecord(payload) && typeof payload.text === "string") return /* @__PURE__ */ React.createElement(FileView, { api, payload });
    return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
  }
  if (kind === "searchCode" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(CodeList, { api, payload }), pagination);
  }
  if (kind === "listWorkflowRuns" && items) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(WorkflowRunList, { api, items }), pagination);
  }
  if (kind === "getWorkflowRun" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(WorkflowRunDetails, { api, run: payload });
  }
  if (kind === "listWorkflowRunArtifacts" && items) {
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(ArtifactList, { api, items }), pagination);
  }
  if (kind === "downloadWorkflowArtifact" && isRecord(payload)) {
    return /* @__PURE__ */ React.createElement(ArtifactDownload, { api, payload });
  }
  return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
}

// src/renderer/index.tsx
function GitHubCard({
  api,
  toolCall,
  kind
}) {
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const args = useMemo(() => parseArgs(toolCall.arguments), [toolCall.arguments]);
  const rawResult = useMemo(() => parseJson(toolCall.result), [toolCall.result]);
  const payload = useMemo(() => unwrapResult(rawResult), [rawResult]);
  const failed = toolCall.status === "error" || isRecord(rawResult) && rawResult.isError === true;
  const rejectedMerge = kind === "mergePullRequest" && isRecord(payload) && payload.merged === false;
  const message = failed ? localizeToolError(t, errorText(payload)) : "";
  const total = isRecord(payload) ? asNumber(payload.total_count) : null;
  const count = total ?? (Array.isArray(payload) ? payload.length : isRecord(payload) && Array.isArray(payload.items) ? payload.items.length : void 0);
  const summary = summarize(t, kind, args);
  return /* @__PURE__ */ React.createElement(
    ToolCallNode,
    {
      toolName: toolCall.name,
      badgeName: t(`github.tool.${kind}`),
      category: TOOL_CATEGORIES[kind],
      status: failed || rejectedMerge ? "error" : toolCall.status,
      displayName: summary,
      displayNameTitle: summary,
      meta: count !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "gh-count gh-head-count" }, t("github.result.count", { values: { count } })) : null,
      className: "gh-tool-card",
      lazyBody: true
    },
    /* @__PURE__ */ React.createElement("div", { className: "gh-body" }, /* @__PURE__ */ React.createElement(Params, { t, kind, args }), failed ? /* @__PURE__ */ React.createElement("div", { className: "gh-error" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "AlertCircle", size: 12 }), /* @__PURE__ */ React.createElement("span", null, message || t("github.error"))) : payload === null ? /* @__PURE__ */ React.createElement("div", { className: `gh-empty${toolCall.status === "running" ? " gh-running" : ""}` }, /* @__PURE__ */ React.createElement(
      HostIcon,
      {
        api,
        name: toolCall.status === "running" ? "LoaderCircle" : "Clock",
        size: 14
      }
    ), /* @__PURE__ */ React.createElement("span", null, toolCall.status === "running" ? t("github.result.running") : toolCall.status === "pending" ? t("github.result.pending") : t("github.result.empty"))) : /* @__PURE__ */ React.createElement("section", { className: "gh-results", "aria-label": t("github.result.title") }, /* @__PURE__ */ React.createElement(SectionTitle, null, t("github.result.title")), /* @__PURE__ */ React.createElement(ResultView, { api, kind, payload })))
  );
}
function renderGitHubTool(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call")
    return null;
  const originalToolName = context.toolCall.originalToolName;
  const kind = originalToolName ? TOOL_KINDS[originalToolName] : void 0;
  if (!kind) return null;
  return /* @__PURE__ */ React.createElement(GitHubCard, { api, toolCall: context.toolCall, kind });
}
export {
  renderGitHubTool
};
