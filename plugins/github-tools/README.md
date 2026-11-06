# GitHub

GitHub 插件向模型注册 **26 个**可调用工具，通过 MCP stdio 进程访问 GitHub REST 与 GraphQL API。版本保持 **0.4.1**；本文描述当前源码，不表示已发布、已更新安装副本或已完成真实 UI 验收。

## 工具能力

### 读取与定位

- `github_search_repositories`：按关键词搜索仓库，返回卡片所需的投影字段。
- `github_get_repository`：读取单个仓库的元数据、话题、统计与链接。
- `github_list_issues`：列出仓库议题；GitHub 此接口也返回 PR，以 `pull_request` 标记区分。
- `github_get_issue`：读取单议题正文、标签、状态、作者、评论数、PR 标记与链接。
- `github_list_commits`：按分支、文件路径、作者与时间范围列出提交。
- `github_get_commit`：读取单提交、父提交和文件变更；仅展示 GitHub 实际返回的 `patch`。
- `github_get_file`：读取仓库内 UTF-8 文件或目录列表，支持行范围。
- `github_search_code`：全站代码搜索，必须认证。
- `github_list_pull_requests`：列出 PR 状态、草稿、head/base ref 与 SHA、GraphQL `node_id`。
- `github_get_pull_request`：读取 PR 正文、合并状态、head/base 仓库与真实 GraphQL ID。
- `github_list_workflow_runs`：按分支、状态和分页读取 Actions 运行。
- `github_get_workflow_run`：读取单次运行的状态、结论、事件、分支、SHA、尝试次数与链接。
- `github_list_workflow_run_artifacts`：读取运行构件的名称、大小、过期状态、时间与真实 API 下载端点。
- `github_download_workflow_artifact`：只解析官方 302 中的 HTTPS `Location`，返回一分钟有效的临时下载 URL；不跟随重定向、不下载或写入本地文件。

普通公开仓库 REST 读取可按 GitHub 规则匿名使用；实际可见性与限流由 GitHub 决定。代码搜索必须认证，私有资源与 Actions 访问仍取决于当前身份和仓库权限。匿名读取不代表已认证或具有写权限。

### 远端写操作

- `github_merge_pull_request`：合并 PR（merge / squash / rebase，可传期望 head SHA）。
- `github_comment`：在议题或 PR 下发表普通评论。
- `github_create_issue`：创建议题，可带标签与指派。
- `github_update_issue`：更新标题、正文、标签、指派，或关闭、重开。
- `github_create_pull_request`：从 head 分支向 base 分支创建 PR。
- `github_review_pull_request`：提交 APPROVE / REQUEST_CHANGES / COMMENT 审查。
- `github_comment_pull_request_line`：使用 `line` 与 `side: LEFT/RIGHT` 创建已提交的 PR 行级评论，不使用废弃的 `position`。
- `github_revert_pull_request`：对已合并 PR 的真实 GraphQL ID 调用 `revertPullRequest`，只创建一个新的 Revert PR。
- `github_create_release`：创建 Release，标签不存在时由 GitHub 建立。
- `github_upload_release_asset`：上传调用者提供的非空 Base64 内容对应的原始字节。
- `github_put_file`：通过 contents API 提交单个 UTF-8 文本文件，更新时需要 blob SHA。

写操作需要认证及 GitHub 实际要求的相应权限，不猜测或承诺某个固定 scope。每次工具调用仍由宿主单独授权；插件不自动重试写请求，也不换工具重试。**Revert 不是撤销合并，不修改已合并历史，也不会自动合并新 PR。**

### GraphQL

- `github_graphql`：向 `https://api.github.com/graphql` 发送调用者编写的 query 或 mutation，`variables` 必须是 JSON 对象。
- 必须提供真实令牌。响应有 `errors` 时工具明确失败；否则原样返回真实 `data`，仍受 20,000 字符结果上限约束，不编造 HTTP 状态。
- GraphQL mutation 可能写远端，不能用来绕过宿主授权；宿主把每次通用 GraphQL 调用作为当前工具单独审批。卡片只以 GraphQL 查询/变更摘要和真实结果展示，不把 mutation 宣称为其他专项写工具已完成。

## 分页、文件范围与大小

- 仓库搜索、代码搜索、议题、提交、PR、Actions 运行与构件列表接受可选正整数 `page`，并使用各自的 `perPage`。
- 返回 `pagination: { page, perPage, hasNextPage }`。`hasNextPage` 只由 GitHub 真实 `Link` 响应头的 `rel="next"` 得出，不按数组长度猜测；搜索与 Actions 同时保留真实 `total_count`。
- `github_get_file` 的 `startLine` / `endLine` 为正整数，且两者同时提供时必须 `endLine >= startLine`。不指定则读取全文；只指定一端时另一端分别是文件开头或末尾。目录仍返回原有列表契约。
- 文件文本按原始行边界切片，保留内容及 CRLF/LF/CR 换行。返回 `path/html_url/size/text/range/totalLines`，范围以实际返回内容为依据；起始行超出文件会报错。
- 文件仍受 GitHub contents API 的 1,000,000 字节边界约束。若最终 JSON 序列化结果会超过 **20,000** 字符，文件工具明确要求缩小 `startLine/endLine` 范围后重新读取，其他工具也返回明确大小错误；不静默裁剪、不输出破损 JSON。
- 写操作可能已在 GitHub 生效；序列化或后续结果错误不表示远端已回滚，应先只读确认状态。

## 网络、凭据与隐私

- 每个 HTTP 请求（包括分页、上传、GraphQL 和重定向响应正文读取）统一使用 **30 秒**超时；调用方中止与超时分别报错并保留原始 `cause`。不依赖 Node 18 不一定存在的 `AbortSignal.any`。
- GitHub REST 与 GraphQL 访问 `api.github.com`；Release 资产原始字节只发送到官方 `uploads.github.com` 端点。插件不接受任意外部 `uploadUrl` 或任意转发令牌。
- 令牌优先级为 `GITHUB_TOKEN` → `GH_TOKEN` → 本机 `gh auth token`。只缓存成功的 `gh` 进程内结果；失败或空结果不会永久缓存。凭据不写入插件目录或额外日志，HTTP 错误会遮蔽已知令牌。
- Release 资产的 `contentBase64` 来自调用者，插件拒绝空、非法或非规范内容；`contentType` 成为原始字节请求的 `Content-Type`，可选 `label` 只进入官方 query。插件不读取任意本地文件路径。
- Actions 构件下载采用 `redirect: "manual"`，只接受带有效 HTTPS `Location` 的 302。错误不包含 `Location` 或令牌。卡片仅在用户主动点击时经宿主 `links.open` 打开短期 URL，不自动下载。
- 这一分钟有效的 URL 必要地作为当前工具结果交付给用户并进入宿主工具展示链；应视为可能随宿主历史保留，插件不承诺规避历史记录，但也不额外把 URL 写入自己的日志。
- 不访问任意输出路径、不写本地下载或资产文件、不声明无关 filesystem 权限，也不执行 `git push` 或操作本地工作区。
- 卡片只读取宿主提供的当前工具调用快照（名称、参数、状态、结果）。`context.toolCall.originalToolName` 用于精确匹配完整原始工具名，不对截断公开名做模糊匹配。

## 与 git / gh CLI 的分工

- **插件**：结构化 GitHub 读取、PR、议题、Release、Actions 与 GraphQL，不依赖本机 `gh` 发起 HTTP；找不到环境令牌时才尝试复用 `gh auth token`。
- **`gh` CLI / `gh` skill**：负责本机登录态及插件未封装的 CLI 工作流。本机安装并使用 `gh` 时需要启用对应的 `gh` skill。
- **git**：本地分支、提交、push、合并与冲突处理仍由终端完成。多文件提交应在本地 commit + push 后再创建 PR，不用单文件工具循环替代。

## 运行、安装与宿主

- Node.js 18 或更高版本，宿主展开 `{{pluginDir}}` 后通过 `node {{pluginDir}}/server.js` 启动。
- 自带工具卡需要 Snow App `0.5.12` 的 `toolCall.originalToolName`；旧宿主缺少该字段时回退通用卡片，不猜测工具类型。
- 在 Snow App「插件列表 → 从目录安装」选择本目录，并在当前项目启用。模型通过 `toolsearch-discover` 获取实际公开全名和参数。
- 当前配套宿主行为描述对应源码，不代表已经随正式版本发布；安装或更新插件不会更新宿主。

插件自带[工作流技能](skills/github-workflow/SKILL.md)，入口保留能力地图、任务路由和共同约束，按需链接到[全部 26 项工具操作](skills/github-workflow/references/tools.md)、[PR 流程](skills/github-workflow/references/pull-requests.md)、[议题管理](skills/github-workflow/references/issues.md)及 [Release 与文件](skills/github-workflow/references/releases-and-files.md)。操作标识不是完整公开名，技能启停跟随插件。

## 官方接口参考

- [REST 分页](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api "GitHub 官方 REST Link 分页说明")：使用响应头判断是否还有下一页。
- [PR 行级评论](https://docs.github.com/en/rest/pulls/comments#create-a-review-comment-for-a-pull-request "GitHub 官方创建 PR 审查评论端点")：采用 `commit_id`、`path`、`line`、`side`。
- [Revert PR GraphQL mutation](https://docs.github.com/en/graphql/reference/pulls#mutation-revertpullrequest "GitHub 官方 revertPullRequest 变更契约")：仅对已合并 PR 创建 Revert PR。
- [上传 Release 资产](https://docs.github.com/en/rest/releases/assets#upload-a-release-asset "GitHub 官方 Release 资产上传端点")：原始字节发送到 `uploads.github.com`。
- [下载 Actions 构件](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact "GitHub 官方构件 302 下载说明")：插件只解析短期 URL，不跟随重定向。
- [GraphQL 调用](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql "GitHub 官方 GraphQL endpoint 与认证说明")：查询与变更共用 GraphQL endpoint。

## 工程结构与检查

```text
src/
  index.ts                    # MCP server 与领域注册
  github/auth.ts              # 环境变量与可重新核实的 gh 令牌
  github/client.ts            # 统一 token、30 秒超时、REST/GraphQL/重定向错误链
  github/pagination.ts        # Link 分页元数据
  mcp/result.ts               # MCP 文本结果与 20,000 字符边界
  tools/repositories.ts       # 仓库、代码、提交读取
  tools/issues.ts             # 议题读取与写操作、普通评论
  tools/pull-requests.ts      # PR 读取、行级评论、审查、合并、Revert
  tools/releases-and-files.ts # 文件范围、Release、资产上传、单文件提交
  tools/workflows.ts          # Actions 运行与构件
  tools/graphql.ts            # 通用 GraphQL
  renderer/                   # 精确工具匹配、参数摘要、三语专用卡片
scripts/build.mjs             # src → server.js / index.js
```

`server.js` 与 `index.js` 是生成产物，不直接编辑。完成源码后在插件目录运行：

```sh
npm run build
npm run check
```

再在仓库根目录运行：

```sh
python scripts/release.py validate --plugin github-tools
```

这些检查只证明类型、构建一致性与静态清单通过，不替代真实 GitHub 网络、远端写副作用、Node 18 fetch 行为或宿主 UI 验收。

## 图标与商标

图标使用 GitHub 官方 Invertocat 徽标，GITHUB 与 Invertocat 是 GitHub, Inc. 的商标；本插件不是 GitHub 官方产品，也未获得其背书。
