import { React, useMemo, useState } from "./runtime";
import type {
  ToolCallApi,
  ToolCallContext,
  ToolCallInfo,
  ToolCategory,
  Translate,
} from "./types";

/**
 * GitHub 工具卡：只读查询与写操作共用一套卡片，按工具类型渲染参数摘要与
 * 结果视图。所有文案来自插件 locales（en / zh-CN / zh-TW），宿主只提供卡片
 * 外壳、图标与错误本地化。
 */

type ToolKind =
  | "searchRepositories"
  | "getRepository"
  | "listIssues"
  | "listCommits"
  | "getFile"
  | "searchCode"
  | "mergePullRequest"
  | "comment"
  | "createIssue"
  | "updateIssue"
  | "createPullRequest"
  | "reviewPullRequest"
  | "createRelease"
  | "putFile";

type Args = Record<string, unknown>;
type Payload = Record<string, unknown> | unknown[] | string | null;

const TOOL_KINDS: Record<string, ToolKind> = {
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
  github_put_file: "putFile",
};

const TOOL_CATEGORIES: Record<ToolKind, ToolCategory> = {
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
  putFile: "create",
};

const TOOL_FIELDS: Record<ToolKind, string[]> = {
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
    "perPage",
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
  putFile: ["owner", "repo", "path", "branch"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value: unknown): string =>
  typeof value === "string" ? value : "";

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseJson = (raw: string | undefined): unknown => {
  if (raw === undefined || raw === "") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const parseArgs = (raw: string): Args => {
  const parsed = parseJson(raw);
  return isRecord(parsed) ? parsed : {};
};

/** MCP 结果信封解包：`{content:[{type:"text",text}]}` / `{result}` → 实际载荷。 */
const unwrapResult = (value: unknown): Payload => {
  if (isRecord(value) && Array.isArray(value.content)) {
    const text = value.content
      .filter(isRecord)
      .filter(
        (block) => block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text as string)
      .join("\n");
    if (text) {
      const parsed = parseJson(text);
      return isRecord(parsed) || Array.isArray(parsed) || typeof parsed === "string"
        ? parsed
        : text;
    }
  }
  if (isRecord(value) && "result" in value) return unwrapResult(value.result);
  if (isRecord(value) || Array.isArray(value) || typeof value === "string")
    return value;
  return null;
};

const errorText = (payload: Payload): string => {
  if (typeof payload === "string") return payload;
  if (isRecord(payload) && typeof payload.message === "string")
    return payload.message;
  return payload === null ? "" : JSON.stringify(payload);
};

const safeUrl = (value: unknown): string => {
  const text = asText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
};

/** 工具全名去掉宿主派生的公开服务器名前缀，得到清单内的工具名。 */
const shortToolName = (name: string): string => {
  if (TOOL_KINDS[name]) return name;
  const separator = name.indexOf("-");
  return separator >= 0 ? name.slice(separator + 1) : name;
};

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}…` : value;

function HostIcon({
  api,
  name,
  size = 12,
}: {
  api: ToolCallApi;
  name: string;
  size?: number;
}): React.JSX.Element | null {
  const Icon = api.ui.icon(name) as
    | React.ComponentType<{ size?: number; className?: string }>
    | undefined;
  return Icon ? <Icon size={size} className="gh-icon" /> : null;
}

function OpenButton({
  api,
  url,
  label,
  title,
  className = "gh-link",
}: {
  api: ToolCallApi;
  url: string;
  label: React.ReactNode;
  title?: string;
  className?: string;
}): React.JSX.Element {
  const safe = safeUrl(url);
  if (!safe) return <span className={className}>{label}</span>;
  return (
    <button
      type="button"
      className={className}
      title={title ?? safe}
      onClick={() => api.links.open(safe, "browser")}
    >
      {label}
    </button>
  );
}

function SectionTitle({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}): React.JSX.Element {
  return (
    <div className="gh-section-title">
      <span>{children}</span>
      {count !== undefined ? <span className="gh-count">{count}</span> : null}
    </div>
  );
}

function Params({
  t,
  kind,
  args,
}: {
  t: Translate;
  kind: ToolKind;
  args: Args;
}): React.JSX.Element | null {
  const fields = TOOL_FIELDS[kind].filter((field) => args[field] !== undefined);
  if (!fields.length) return null;
  return (
    <dl className="gh-params">
      {fields.map((field) => {
        const value = args[field];
        const label = t(`github.field.${field}`, { defaultValue: field });
        const state = field === "state" && typeof value === "string";
        return (
          <div className="gh-param" key={field}>
            <dt>{label}</dt>
            <dd>
              {state ? (
                <span className="gh-chip">
                  {t(`github.state.${value}`, { defaultValue: value })}
                </span>
              ) : typeof value === "string" ? (
                <code className="gh-param-value" title={value}>
                  {truncate(value, 160)}
                </code>
              ) : (
                <code className="gh-param-value">{String(value)}</code>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function RepoStats({
  api,
  repo,
}: {
  api: ToolCallApi;
  repo: Record<string, unknown>;
}): React.JSX.Element {
  const stars = asNumber(repo.stargazers_count);
  const forks = asNumber(repo.forks_count);
  const issues = asNumber(repo.open_issues_count);
  return (
    <div className="gh-stats">
      {stars !== null ? (
        <span className="gh-stat">
          <HostIcon api={api} name="Star" size={11} />
          {stars}
        </span>
      ) : null}
      {forks !== null ? (
        <span className="gh-stat">
          <HostIcon api={api} name="GitFork" size={11} />
          {forks}
        </span>
      ) : null}
      {issues !== null ? (
        <span className="gh-stat">
          <HostIcon api={api} name="CircleDot" size={11} />
          {issues}
        </span>
      ) : null}
    </div>
  );
}

function Tags({ values }: { values: unknown }): React.JSX.Element | null {
  const tags = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string")
    : [];
  if (!tags.length) return null;
  return (
    <div className="gh-tags">
      {tags.slice(0, 6).map((tag) => (
        <span className="gh-tag" key={tag}>
          {tag}
        </span>
      ))}
      {tags.length > 6 ? (
        <span className="gh-tag gh-tag--muted">+{tags.length - 6}</span>
      ) : null}
    </div>
  );
}

function RepoList({
  api,
  payload,
}: {
  api: ToolCallApi;
  payload: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(8);
  const items = useMemo(
    () =>
      (Array.isArray(payload.items) ? payload.items : []).filter(isRecord),
    [payload],
  );
  const total = asNumber(payload.total_count) ?? items.length;
  if (!items.length)
    return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((repo, index) => {
        const fullName =
          asText(repo.full_name) || asText(repo.name) || `#${index + 1}`;
        const description = asText(repo.description);
        const language = asText(repo.language);
        return (
          <article className="gh-item" key={`${fullName}-${index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(repo.html_url)}
                label={fullName}
                className="gh-link gh-link--strong"
              />
              <RepoStats api={api} repo={repo} />
            </div>
            {description ? (
              <p className="gh-desc">{truncate(description, 220)}</p>
            ) : null}
            <div className="gh-meta-row">
              {language ? <span className="gh-tag">{language}</span> : null}
              <Tags values={repo.topics} />
            </div>
          </article>
        );
      })}
      {items.length > visible.length ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setLimit((current) => current + 8)}
        >
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
      {total > items.length ? (
        <div className="gh-hint">
          {t("github.result.truncated", {
            values: { shown: items.length, total },
          })}
        </div>
      ) : null}
    </div>
  );
}

function RepoDetails({
  api,
  repo,
}: {
  api: ToolCallApi;
  repo: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const description = asText(repo.description);
  const license = isRecord(repo.license)
    ? asText(repo.license.spdx_id) || asText(repo.license.name)
    : "";
  const homepage = safeUrl(repo.homepage);
  const fullName =
    asText(repo.full_name) ||
    [asText(repo.owner && isRecord(repo.owner) ? repo.owner.login : ""), asText(repo.name)]
      .filter(Boolean)
      .join("/");
  return (
    <div className="gh-repo">
      <div className="gh-item-head">
        <OpenButton
          api={api}
          url={asText(repo.html_url)}
          label={fullName || t("github.result.repository")}
          className="gh-link gh-link--strong"
        />
        <RepoStats api={api} repo={repo} />
      </div>
      {description ? <p className="gh-desc">{description}</p> : null}
      <div className="gh-meta-row">
        {asText(repo.language) ? (
          <span className="gh-tag">{asText(repo.language)}</span>
        ) : null}
        {license ? <span className="gh-tag">{license}</span> : null}
        {asText(repo.default_branch) ? (
          <span className="gh-tag">
            {t("github.field.defaultBranch")}: {asText(repo.default_branch)}
          </span>
        ) : null}
        {homepage ? (
          <OpenButton
            api={api}
            url={homepage}
            label={homepage.replace(/^https?:\/\//, "")}
            className="gh-link"
          />
        ) : null}
      </div>
      <Tags values={repo.topics} />
    </div>
  );
}

function IssueList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length)
    return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((issue, index) => {
        const number = asNumber(issue.number);
        const state = asText(issue.state);
        const labels = Array.isArray(issue.labels)
          ? issue.labels
              .map((label) =>
                isRecord(label) ? asText(label.name) : asText(label),
              )
              .filter(Boolean)
          : [];
        return (
          <article className="gh-item gh-item--compact" key={`${number ?? index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(issue.html_url)}
                label={
                  <span className="gh-issue-title">
                    {number !== null ? (
                      <span className="gh-issue-number">#{number}</span>
                    ) : null}
                    {asText(issue.title) || t("github.result.issue")}
                  </span>
                }
                className="gh-link gh-link--strong"
              />
              <span className="gh-state-row">
                {issue.pull_request ? (
                  <span className="gh-tag gh-tag--muted">PR</span>
                ) : null}
                {state ? (
                  <span className={`gh-state gh-state--${state}`}>
                    {t(`github.state.${state}`, { defaultValue: state })}
                  </span>
                ) : null}
              </span>
            </div>
            {labels.length ? (
              <div className="gh-tags">
                {labels.slice(0, 5).map((label) => (
                  <span className="gh-tag" key={label}>
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
      {items.length > visible.length ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setLimit((current) => current + 10)}
        >
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
    </div>
  );
}

function CommitList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(10);
  if (!items.length)
    return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((commit, index) => {
        const sha = asText(commit.sha);
        const message = asText(commit.message);
        const title = message.split(/\r?\n/)[0] || t("github.result.commit");
        const author = asText(commit.author);
        const date = asText(commit.date);
        return (
          <article className="gh-item gh-item--compact" key={`${sha}-${index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(commit.html_url)}
                label={
                  <span className="gh-issue-title">
                    {sha ? (
                      <span className="gh-issue-number">{sha.slice(0, 7)}</span>
                    ) : null}
                    {title}
                  </span>
                }
                className="gh-link gh-link--strong"
              />
              <span className="gh-state-row">
                {author ? (
                  <span className="gh-tag gh-tag--muted">{author}</span>
                ) : null}
                {date ? (
                  <span className="gh-hint" title={date}>
                    {date.slice(0, 10)}
                  </span>
                ) : null}
              </span>
            </div>
          </article>
        );
      })}
      {items.length > visible.length ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setLimit((current) => current + 10)}
        >
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
    </div>
  );
}

function DirectoryList({
  api,
  items,
}: {
  api: ToolCallApi;
  items: Record<string, unknown>[];
}): React.JSX.Element {
  const { t } = api;
  return (
    <div className="gh-list">
      {items.map((entry, index) => (
        <div className="gh-dir-row" key={`${asText(entry.path)}-${index}`}>
          <HostIcon
            api={api}
            name={asText(entry.type) === "dir" ? "Folder" : "FileText"}
            size={12}
          />
          <code className="gh-dir-path">{asText(entry.path) || asText(entry.name)}</code>
          <span className="gh-tag gh-tag--muted">
            {asText(entry.type) || t("github.result.file")}
          </span>
        </div>
      ))}
    </div>
  );
}

function FileView({
  api,
  payload,
}: {
  api: ToolCallApi;
  payload: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const [expanded, setExpanded] = useState(false);
  const text = asText(payload.text);
  const lines = useMemo(() => text.split(/\r?\n/), [text]);
  const preview = expanded ? text : lines.slice(0, 24).join("\n");
  return (
    <div className="gh-file">
      <div className="gh-file-head">
        <OpenButton
          api={api}
          url={asText(payload.html_url)}
          label={asText(payload.path) || t("github.result.file")}
          className="gh-link gh-link--strong"
        />
        <span className="gh-hint">
          {t("github.result.lines", { values: { count: lines.length } })}
          {asNumber(payload.size) !== null
            ? ` · ${asNumber(payload.size)} B`
            : ""}
        </span>
      </div>
      <pre className="gh-code">{preview}</pre>
      {lines.length > 24 ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("github.action.collapse") : t("github.action.expand")}
        </button>
      ) : null}
    </div>
  );
}

function CodeList({
  api,
  payload,
}: {
  api: ToolCallApi;
  payload: Record<string, unknown>;
}): React.JSX.Element {
  const { t } = api;
  const [limit, setLimit] = useState(8);
  const items = useMemo(
    () =>
      (Array.isArray(payload.items) ? payload.items : []).filter(isRecord),
    [payload],
  );
  const total = asNumber(payload.total_count) ?? items.length;
  if (!items.length)
    return <div className="gh-empty">{t("github.result.empty")}</div>;
  const visible = items.slice(0, limit);
  return (
    <div className="gh-list">
      {visible.map((item, index) => {
        const repository = isRecord(item.repository)
          ? asText(item.repository.full_name)
          : "";
        return (
          <article className="gh-item gh-item--compact" key={`${asText(item.path)}-${index}`}>
            <div className="gh-item-head">
              <OpenButton
                api={api}
                url={asText(item.html_url)}
                label={asText(item.path) || asText(item.name) || t("github.result.file")}
                className="gh-link gh-link--strong"
              />
              {repository ? (
                <span className="gh-tag gh-tag--muted">{repository}</span>
              ) : null}
            </div>
          </article>
        );
      })}
      {items.length > visible.length ? (
        <button
          type="button"
          className="gh-more"
          onClick={() => setLimit((current) => current + 8)}
        >
          {t("github.action.more")} · {items.length - visible.length}
        </button>
      ) : null}
      {total > items.length ? (
        <div className="gh-hint">
          {t("github.result.truncated", {
            values: { shown: items.length, total },
          })}
        </div>
      ) : null}
    </div>
  );
}

function RawBlock({
  t,
  payload,
}: {
  t: Translate;
  payload: Payload;
}): React.JSX.Element {
  return (
    <details className="gh-raw">
      <summary>{t("github.result.raw")}</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

const WRITE_KINDS: ReadonlySet<ToolKind> = new Set<ToolKind>([
  "mergePullRequest",
  "comment",
  "createIssue",
  "updateIssue",
  "createPullRequest",
  "reviewPullRequest",
  "createRelease",
  "putFile",
]);

type Badge = { label: string; tone: "ok" | "warn" | "muted" };

function writeBadge(
  t: Translate,
  kind: ToolKind,
  record: Record<string, unknown>,
): Badge {
  if (kind === "mergePullRequest") {
    return record.merged === true
      ? { label: t("github.state.merged"), tone: "ok" }
      : { label: t("github.state.notMerged"), tone: "warn" };
  }
  if (kind === "reviewPullRequest") {
    const state = asText(record.state);
    const key =
      state === "APPROVED"
        ? "approved"
        : state === "CHANGES_REQUESTED"
          ? "changesRequested"
          : "commented";
    return {
      label: t(`github.state.${key}`),
      tone: key === "changesRequested" ? "warn" : "ok",
    };
  }
  if (
    kind === "createIssue" ||
    kind === "updateIssue" ||
    kind === "createPullRequest"
  ) {
    const state = asText(record.state);
    return state
      ? {
          label: t(`github.state.${state}`, { defaultValue: state }),
          tone: state === "closed" ? "muted" : "ok",
        }
      : { label: t("github.state.done"), tone: "ok" };
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
  payload,
}: {
  api: ToolCallApi;
  kind: ToolKind;
  payload: Payload;
}): React.JSX.Element {
  const { t } = api;
  if (!isRecord(payload)) return <RawBlock t={t} payload={payload} />;
  const record = payload;
  const url = safeUrl(record.html_url);
  const number = asNumber(record.number);
  const title =
    asText(record.title) ||
    asText(record.name) ||
    asText(record.tag_name) ||
    asText(record.path);
  const message = asText(record.message);
  const body = asText(record.body);
  const sha = asText(record.sha);
  const commitSha = asText(record.commit_sha);
  const head = asText(record.head);
  const base = asText(record.base);
  const created = asText(record.created_at) || asText(record.submitted_at);
  const badge = writeBadge(t, kind, record);

  return (
    <div className="gh-write">
      <div className="gh-write-head">
        <span className={`gh-badge gh-badge--${badge.tone}`}>
          {badge.label}
        </span>
        {number !== null ? (
          <span className="gh-issue-number">#{number}</span>
        ) : null}
        {title ? (
          <span className="gh-write-title" title={title}>
            {title}
          </span>
        ) : null}
        {url ? (
          <OpenButton
            api={api}
            url={url}
            label={t("github.action.open")}
            className="gh-link gh-write-link"
          />
        ) : null}
      </div>
      {message && record.merged !== true ? (
        <p className="gh-desc">{message}</p>
      ) : null}
      {head && base ? (
        <div className="gh-hint">
          {head} → {base}
        </div>
      ) : null}
      {body && kind === "comment" ? (
        <pre className="gh-comment-body">{truncate(body, 1200)}</pre>
      ) : null}
      {sha ? <div className="gh-hint">SHA {sha}</div> : null}
      {commitSha ? (
        <div className="gh-hint">
          {t("github.result.commit")} {commitSha}
        </div>
      ) : null}
      {created ? <div className="gh-hint">{created}</div> : null}
    </div>
  );
}

function summarize(
  t: Translate,
  kind: ToolKind,
  args: Args,
): string {
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
      return pullNumber !== null
        ? `${ownerRepo}#${pullNumber}`
        : ownerRepo || t(`github.tool.${kind}`);
    case "comment":
    case "updateIssue":
      return issueNumber !== null
        ? `${ownerRepo}#${issueNumber}`
        : ownerRepo || t(`github.tool.${kind}`);
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
  payload,
}: {
  api: ToolCallApi;
  kind: ToolKind;
  payload: Payload;
}): React.JSX.Element | null {
  const { t } = api;
  if (payload === null) return null;
  if (WRITE_KINDS.has(kind))
    return <WriteResult api={api} kind={kind} payload={payload} />;
  if (kind === "searchRepositories" && isRecord(payload))
    return <RepoList api={api} payload={payload} />;
  if (kind === "getRepository" && isRecord(payload))
    return <RepoDetails api={api} repo={payload} />;
  if (kind === "listIssues") {
    if (Array.isArray(payload))
      return (
        <IssueList api={api} items={payload.filter(isRecord)} />
      );
    return <RawBlock t={t} payload={payload} />;
  }
  if (kind === "listCommits") {
    if (Array.isArray(payload))
      return (
        <CommitList api={api} items={payload.filter(isRecord)} />
      );
    return <RawBlock t={t} payload={payload} />;
  }
  if (kind === "getFile") {
    if (Array.isArray(payload))
      return <DirectoryList api={api} items={payload.filter(isRecord)} />;
    if (isRecord(payload) && typeof payload.text === "string")
      return <FileView api={api} payload={payload} />;
    return <RawBlock t={t} payload={payload} />;
  }
  if (kind === "searchCode" && isRecord(payload))
    return <CodeList api={api} payload={payload} />;
  return <RawBlock t={t} payload={payload} />;
}

function GitHubCard({
  api,
  toolCall,
  kind,
}: {
  api: ToolCallApi;
  toolCall: ToolCallInfo;
  kind: ToolKind;
}): React.JSX.Element {
  const { t } = api;
  const { ToolCallNode, localizeToolError } = api.ui;
  const args = useMemo(() => parseArgs(toolCall.arguments), [toolCall.arguments]);
  const payload = useMemo(
    () => unwrapResult(parseJson(toolCall.result)),
    [toolCall.result],
  );
  const failed = toolCall.status === "error";
  const message = failed ? localizeToolError(t, errorText(payload)) : "";
  const count =
    isRecord(payload) && asNumber(payload.total_count) !== null
      ? (asNumber(payload.total_count) as number)
      : Array.isArray(payload)
        ? payload.length
        : undefined;

  return (
    <ToolCallNode
      toolName={toolCall.name}
      badgeName={t(`github.tool.${kind}`)}
      category={TOOL_CATEGORIES[kind]}
      status={toolCall.status}
      displayName={summarize(t, kind, args)}
      displayNameTitle={toolCall.name}
      meta={
        count !== undefined ? <span className="gh-count">{count}</span> : null
      }
      className="gh-tool-card"
      lazyBody
    >
      <div className="gh-body">
        <Params t={t} kind={kind} args={args} />
        {failed ? (
          <div className="gh-error">
            <HostIcon api={api} name="AlertCircle" size={12} />
            <span>{message || t("github.error")}</span>
          </div>
        ) : (
          <>
            <SectionTitle count={count}>{t("github.result.title")}</SectionTitle>
            <ResultView api={api} kind={kind} payload={payload} />
          </>
        )}
      </div>
    </ToolCallNode>
  );
}

/** 同步工厂：返回组件子树，钩子留在宿主 React 上下文内。 */
export function renderGitHubTool(
  api: ToolCallApi,
  context: ToolCallContext,
): React.ReactNode | null {
  if (
    api.signal.aborted ||
    api.ui.toolCallRendererVersion !== 1 ||
    api.ui.React !== React ||
    context.slot !== "tool-call"
  )
    return null;
  const kind = TOOL_KINDS[shortToolName(context.toolCall.name)];
  if (!kind) return null;
  return <GitHubCard api={api} toolCall={context.toolCall} kind={kind} />;
}
