// Generated from src/renderer/ by scripts/build.mjs — edit the TypeScript sources, not this file.

// src/renderer/runtime.ts
var React = window.SnowAppPlugin.React;
var { useMemo, useState } = React;

// src/renderer/index.tsx
var TOOL_KINDS = {
  github_search_repositories: "searchRepositories",
  github_get_repository: "getRepository",
  github_list_issues: "listIssues",
  github_list_commits: "listCommits",
  github_get_file: "getFile",
  github_search_code: "searchCode",
  github_merge_pull_request: "mergePullRequest",
  github_comment: "comment",
  github_create_issue: "createIssue",
  github_update_issue: "updateIssue",
  github_create_pull_request: "createPullRequest",
  github_review_pull_request: "reviewPullRequest",
  github_create_release: "createRelease",
  github_put_file: "putFile"
};
var TOOL_CATEGORIES = {
  searchRepositories: "git",
  getRepository: "git",
  listIssues: "todo",
  listCommits: "git",
  getFile: "read",
  searchCode: "search",
  mergePullRequest: "git",
  comment: "message",
  createIssue: "todo",
  updateIssue: "todo",
  createPullRequest: "git",
  reviewPullRequest: "git",
  createRelease: "create",
  putFile: "create"
};
var TOOL_FIELDS = {
  searchRepositories: ["query", "perPage"],
  getRepository: ["owner", "repo"],
  listIssues: ["owner", "repo", "state", "perPage"],
  listCommits: [
    "owner",
    "repo",
    "ref",
    "path",
    "author",
    "since",
    "until",
    "perPage"
  ],
  getFile: ["owner", "repo", "path", "ref"],
  searchCode: ["query", "perPage"],
  mergePullRequest: ["owner", "repo", "pullNumber", "mergeMethod"],
  comment: ["owner", "repo", "issueNumber"],
  createIssue: ["owner", "repo", "title"],
  updateIssue: ["owner", "repo", "issueNumber", "state"],
  createPullRequest: ["owner", "repo", "head", "base"],
  reviewPullRequest: ["owner", "repo", "pullNumber", "event"],
  createRelease: ["owner", "repo", "tagName", "draft", "prerelease"],
  putFile: ["owner", "repo", "path", "branch"]
};
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
    const text = value.content.filter(isRecord).filter(
      (block) => block.type === "text" && typeof block.text === "string"
    ).map((block) => block.text).join("\n");
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
var shortToolName = (name) => {
  if (TOOL_KINDS[name]) return name;
  const separator = name.indexOf("-");
  return separator >= 0 ? name.slice(separator + 1) : name;
};
var truncate = (value, max) => value.length > max ? `${value.slice(0, max)}…` : value;
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
  children,
  count
}) {
  return /* @__PURE__ */ React.createElement("div", { className: "gh-section-title" }, /* @__PURE__ */ React.createElement("span", null, children), count !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "gh-count" }, count) : null);
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
    const state = field === "state" && typeof value === "string";
    return /* @__PURE__ */ React.createElement("div", { className: "gh-param", key: field }, /* @__PURE__ */ React.createElement("dt", null, label), /* @__PURE__ */ React.createElement("dd", null, state ? /* @__PURE__ */ React.createElement("span", { className: "gh-chip" }, t(`github.state.${value}`, { defaultValue: value })) : typeof value === "string" ? /* @__PURE__ */ React.createElement("code", { className: "gh-param-value", title: value }, truncate(value, 160)) : /* @__PURE__ */ React.createElement("code", { className: "gh-param-value" }, String(value))));
  }));
}
function RepoStats({
  api,
  repo
}) {
  const stars = asNumber(repo.stargazers_count);
  const forks = asNumber(repo.forks_count);
  const issues = asNumber(repo.open_issues_count);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-stats" }, stars !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-stat" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "Star", size: 11 }), stars) : null, forks !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-stat" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "GitFork", size: 11 }), forks) : null, issues !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-stat" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "CircleDot", size: 11 }), issues) : null);
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
    ), /* @__PURE__ */ React.createElement(RepoStats, { api, repo })), description ? /* @__PURE__ */ React.createElement("p", { className: "gh-desc" }, truncate(description, 220)) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, language ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, language) : null, /* @__PURE__ */ React.createElement(Tags, { values: repo.topics })));
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
  ) : null, total > items.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, t("github.result.truncated", {
    values: { shown: items.length, total }
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
  ), /* @__PURE__ */ React.createElement(RepoStats, { api, repo })), description ? /* @__PURE__ */ React.createElement("p", { className: "gh-desc" }, description) : null, /* @__PURE__ */ React.createElement("div", { className: "gh-meta-row" }, asText(repo.language) ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, asText(repo.language)) : null, license ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, license) : null, asText(repo.default_branch) ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag" }, t("github.field.defaultBranch"), ": ", asText(repo.default_branch)) : null, homepage ? /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: homepage,
      label: homepage.replace(/^https?:\/\//, ""),
      className: "gh-link"
    }
  ) : null), /* @__PURE__ */ React.createElement(Tags, { values: repo.topics }));
}
function IssueList({
  api,
  items
}) {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length)
    return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
  const visible = items.slice(0, limit);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, visible.map((issue, index) => {
    const number = asNumber(issue.number);
    const state = asText(issue.state);
    const labels = Array.isArray(issue.labels) ? issue.labels.map(
      (label) => isRecord(label) ? asText(label.name) : asText(label)
    ).filter(Boolean) : [];
    return /* @__PURE__ */ React.createElement("article", { className: "gh-item gh-item--compact", key: `${number ?? index}` }, /* @__PURE__ */ React.createElement("div", { className: "gh-item-head" }, /* @__PURE__ */ React.createElement(
      OpenButton,
      {
        api,
        url: asText(issue.html_url),
        label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, number !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", number) : null, asText(issue.title) || t("github.result.issue")),
        className: "gh-link gh-link--strong"
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "gh-state-row" }, issue.pull_request ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, "PR") : null, state ? /* @__PURE__ */ React.createElement("span", { className: `gh-state gh-state--${state}` }, t(`github.state.${state}`, { defaultValue: state })) : null)), labels.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-tags" }, labels.slice(0, 5).map((label) => /* @__PURE__ */ React.createElement("span", { className: "gh-tag", key: label }, label))) : null);
  }), items.length > visible.length ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gh-more",
      onClick: () => setLimit((current) => current + 10)
    },
    t("github.action.more"),
    " · ",
    items.length - visible.length
  ) : null);
}
function CommitList({
  api,
  items
}) {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length)
    return /* @__PURE__ */ React.createElement("div", { className: "gh-empty" }, t("github.result.empty"));
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
        label: /* @__PURE__ */ React.createElement("span", { className: "gh-issue-title" }, sha ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, sha.slice(0, 7)) : null, title),
        className: "gh-link gh-link--strong"
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "gh-state-row" }, author ? /* @__PURE__ */ React.createElement("span", { className: "gh-tag gh-tag--muted" }, author) : null, date ? /* @__PURE__ */ React.createElement("span", { className: "gh-hint", title: date }, date.slice(0, 10)) : null)));
  }), items.length > visible.length ? /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      className: "gh-more",
      onClick: () => setLimit((current) => current + 10)
    },
    t("github.action.more"),
    " · ",
    items.length - visible.length
  ) : null);
}
function DirectoryList({
  api,
  items
}) {
  const { t } = api;
  return /* @__PURE__ */ React.createElement("div", { className: "gh-list" }, items.map((entry, index) => /* @__PURE__ */ React.createElement("div", { className: "gh-dir-row", key: `${asText(entry.path)}-${index}` }, /* @__PURE__ */ React.createElement(
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
  const lines = useMemo(() => text.split(/\r?\n/), [text]);
  const preview = expanded ? text : lines.slice(0, 24).join("\n");
  return /* @__PURE__ */ React.createElement("div", { className: "gh-file" }, /* @__PURE__ */ React.createElement("div", { className: "gh-file-head" }, /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url: asText(payload.html_url),
      label: asText(payload.path) || t("github.result.file"),
      className: "gh-link gh-link--strong"
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "gh-hint" }, t("github.result.lines", { values: { count: lines.length } }), asNumber(payload.size) !== null ? ` · ${asNumber(payload.size)} B` : "")), /* @__PURE__ */ React.createElement("pre", { className: "gh-code" }, preview), lines.length > 24 ? /* @__PURE__ */ React.createElement(
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
  ) : null, total > items.length ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, t("github.result.truncated", {
    values: { shown: items.length, total }
  })) : null);
}
function RawBlock({
  t,
  payload
}) {
  return /* @__PURE__ */ React.createElement("details", { className: "gh-raw" }, /* @__PURE__ */ React.createElement("summary", null, t("github.result.raw")), /* @__PURE__ */ React.createElement("pre", null, JSON.stringify(payload, null, 2)));
}
var WRITE_KINDS = /* @__PURE__ */ new Set([
  "mergePullRequest",
  "comment",
  "createIssue",
  "updateIssue",
  "createPullRequest",
  "reviewPullRequest",
  "createRelease",
  "putFile"
]);
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
  if (kind === "createIssue" || kind === "updateIssue" || kind === "createPullRequest") {
    const state = asText(record.state);
    return state ? {
      label: t(`github.state.${state}`, { defaultValue: state }),
      tone: state === "closed" ? "muted" : "ok"
    } : { label: t("github.state.done"), tone: "ok" };
  }
  if (kind === "createRelease") {
    if (record.draft === true)
      return { label: t("github.state.draft"), tone: "muted" };
    if (record.prerelease === true)
      return { label: t("github.state.prerelease"), tone: "warn" };
    return { label: t("github.state.published"), tone: "ok" };
  }
  if (kind === "comment")
    return { label: t("github.state.commented"), tone: "ok" };
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
  const url = safeUrl(record.html_url);
  const number = asNumber(record.number);
  const title = asText(record.title) || asText(record.name) || asText(record.tag_name) || asText(record.path);
  const message = asText(record.message);
  const body = asText(record.body);
  const sha = asText(record.sha);
  const commitSha = asText(record.commit_sha);
  const head = asText(record.head);
  const base = asText(record.base);
  const created = asText(record.created_at) || asText(record.submitted_at);
  const badge = writeBadge(t, kind, record);
  return /* @__PURE__ */ React.createElement("div", { className: "gh-write" }, /* @__PURE__ */ React.createElement("div", { className: "gh-write-head" }, /* @__PURE__ */ React.createElement("span", { className: `gh-badge gh-badge--${badge.tone}` }, badge.label), number !== null ? /* @__PURE__ */ React.createElement("span", { className: "gh-issue-number" }, "#", number) : null, title ? /* @__PURE__ */ React.createElement("span", { className: "gh-write-title", title }, title) : null, url ? /* @__PURE__ */ React.createElement(
    OpenButton,
    {
      api,
      url,
      label: t("github.action.open"),
      className: "gh-link gh-write-link"
    }
  ) : null), message && record.merged !== true ? /* @__PURE__ */ React.createElement("p", { className: "gh-desc" }, message) : null, head && base ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, head, " → ", base) : null, body && kind === "comment" ? /* @__PURE__ */ React.createElement("pre", { className: "gh-comment-body" }, truncate(body, 1200)) : null, sha ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, "SHA ", sha) : null, commitSha ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, t("github.result.commit"), " ", commitSha) : null, created ? /* @__PURE__ */ React.createElement("div", { className: "gh-hint" }, created) : null);
}
function summarize(t, kind, args) {
  const owner = asText(args.owner);
  const repo = asText(args.repo);
  const path = asText(args.path);
  const ownerRepo = owner && repo ? `${owner}/${repo}` : "";
  const issueNumber = asNumber(args.issueNumber);
  const pullNumber = asNumber(args.pullNumber);
  switch (kind) {
    case "searchRepositories":
    case "searchCode":
      return asText(args.query) || t(`github.tool.${kind}`);
    case "getRepository":
      return ownerRepo || t("github.tool.getRepository");
    case "listIssues":
      return ownerRepo || t("github.tool.listIssues");
    case "listCommits":
      return ownerRepo || t("github.tool.listCommits");
    case "getFile":
      return path || t("github.tool.getFile");
    case "mergePullRequest":
    case "reviewPullRequest":
      return pullNumber !== null ? `${ownerRepo}#${pullNumber}` : ownerRepo || t(`github.tool.${kind}`);
    case "comment":
    case "updateIssue":
      return issueNumber !== null ? `${ownerRepo}#${issueNumber}` : ownerRepo || t(`github.tool.${kind}`);
    case "createIssue":
    case "createPullRequest":
      return asText(args.title) || t(`github.tool.${kind}`);
    case "createRelease":
      return asText(args.tagName) || t("github.tool.createRelease");
    case "putFile":
      return path || t("github.tool.putFile");
    default:
      return t("github.tool.searchRepositories");
  }
}
function ResultView({
  api,
  kind,
  payload
}) {
  const { t } = api;
  if (payload === null) return null;
  if (WRITE_KINDS.has(kind))
    return /* @__PURE__ */ React.createElement(WriteResult, { api, kind, payload });
  if (kind === "searchRepositories" && isRecord(payload))
    return /* @__PURE__ */ React.createElement(RepoList, { api, payload });
  if (kind === "getRepository" && isRecord(payload))
    return /* @__PURE__ */ React.createElement(RepoDetails, { api, repo: payload });
  if (kind === "listIssues") {
    if (Array.isArray(payload))
      return /* @__PURE__ */ React.createElement(IssueList, { api, items: payload.filter(isRecord) });
    return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
  }
  if (kind === "listCommits") {
    if (Array.isArray(payload))
      return /* @__PURE__ */ React.createElement(CommitList, { api, items: payload.filter(isRecord) });
    return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
  }
  if (kind === "getFile") {
    if (Array.isArray(payload))
      return /* @__PURE__ */ React.createElement(DirectoryList, { api, items: payload.filter(isRecord) });
    if (isRecord(payload) && typeof payload.text === "string")
      return /* @__PURE__ */ React.createElement(FileView, { api, payload });
    return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
  }
  if (kind === "searchCode" && isRecord(payload))
    return /* @__PURE__ */ React.createElement(CodeList, { api, payload });
  return /* @__PURE__ */ React.createElement(RawBlock, { t, payload });
}
function GitHubCard({
  api,
  toolCall,
  kind
}) {
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const args = useMemo(() => parseArgs(toolCall.arguments), [toolCall.arguments]);
  const payload = useMemo(
    () => unwrapResult(parseJson(toolCall.result)),
    [toolCall.result]
  );
  const failed = toolCall.status === "error";
  const message = failed ? localizeToolError(t, errorText(payload)) : "";
  const count = isRecord(payload) && asNumber(payload.total_count) !== null ? asNumber(payload.total_count) : Array.isArray(payload) ? payload.length : void 0;
  return /* @__PURE__ */ React.createElement(
    ToolCallNode,
    {
      toolName: toolCall.name,
      badgeName: t(`github.tool.${kind}`),
      category: TOOL_CATEGORIES[kind],
      status: toolCall.status,
      displayName: summarize(t, kind, args),
      displayNameTitle: toolCall.name,
      meta: count !== void 0 ? /* @__PURE__ */ React.createElement("span", { className: "gh-count" }, count) : null,
      className: "gh-tool-card",
      lazyBody: true
    },
    /* @__PURE__ */ React.createElement("div", { className: "gh-body" }, /* @__PURE__ */ React.createElement(Params, { t, kind, args }), failed ? /* @__PURE__ */ React.createElement("div", { className: "gh-error" }, /* @__PURE__ */ React.createElement(HostIcon, { api, name: "AlertCircle", size: 12 }), /* @__PURE__ */ React.createElement("span", null, message || t("github.error"))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { count }, t("github.result.title")), /* @__PURE__ */ React.createElement(ResultView, { api, kind, payload })))
  );
}
function renderGitHubTool(api, context) {
  if (api.signal.aborted || api.ui.toolCallRendererVersion !== 1 || api.ui.React !== React || context.slot !== "tool-call")
    return null;
  const kind = TOOL_KINDS[shortToolName(context.toolCall.name)];
  if (!kind) return null;
  return /* @__PURE__ */ React.createElement(GitHubCard, { api, toolCall: context.toolCall, kind });
}
export {
  renderGitHubTool
};
