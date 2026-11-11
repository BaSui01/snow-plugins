# 工具操作地图

以下列出插件全部 **41 个**工具操作标识及用途，不复制完整参数 schema。`github_*` 是供 `toolsearch-discover` 检索的操作标识，不是完整公开名；真实名称与参数契约以发现结果为准。

## REST 读取

- `github_search_repositories`：按关键词搜索仓库。
- `github_get_repository`：读取单个仓库元数据、默认分支、话题与统计。
- `github_list_issues`：列出议题，同时可能返回带 `pull_request` 标记的 PR。
- `github_get_issue`：读取单议题正文、标签、状态、作者、评论数与链接。
- `github_list_commits`：按分支、文件路径、作者与时间范围列提交。
- `github_get_commit`：读取单提交、父提交、文件变更与实际存在的 patch。
- `github_get_file`：读取文件或目录；文件可用 `startLine/endLine` 限定范围，超限会明确要求缩小范围。
- `github_search_code`：全站代码搜索，必须认证。
- `github_list_pull_requests`：列 PR 的状态、draft、head/base ref 与 SHA、GraphQL `node_id`。
- `github_get_pull_request`：读取 PR 正文、合并状态、真实 GraphQL ID 与 head/base 仓库信息。

普通公开资源的 REST 读取可匿名尝试；实际可见性与限流由 GitHub 决定。仓库搜索、代码搜索、议题、提交与 PR 列表均支持 `page/perPage`，`hasNextPage` 只来自 Link 响应头。

## 远端写

以下操作都需要认证和 GitHub 实际要求的权限，按宿主授权与审批执行，插件不自动重试：

- `github_create_issue`：创建议题。
- `github_update_issue`：改标题、正文、标签、指派，或关闭、重开。
- `github_comment`：议题或 PR 普通评论。
- `github_create_pull_request`：创建 head → base 的 PR。
- `github_review_pull_request`：提交 `APPROVE` / `REQUEST_CHANGES` / `COMMENT` 审查。
- `github_merge_pull_request`：以 merge / squash / rebase 合并，可传 SHA 校验 head。
- `github_comment_pull_request_line`：用 commit SHA、路径、行号和 `LEFT/RIGHT` 创建已提交的行级评论。
- `github_revert_pull_request`：对已合并 PR 的真实 GraphQL ID 创建 Revert PR；不撤销合并，不自动合并新 PR。
- `github_create_release`：创建 Release，标签不存在时由 GitHub 创建。
- `github_upload_release_asset`：把调用者提供的非空规范 Base64 解码为原始字节，上传到官方 Release 资产端点；不读取本地路径。
- `github_put_file`：contents API 提交单个 UTF-8 文本文件；更新已有文件必须传 blob SHA。

## Actions

- `github_list_workflow_runs`：按可选 branch/status 与 `page/perPage` 列运行状态、结论、分支、SHA、事件和链接。
- `github_get_workflow_run`：按真实 `runId` 读取单次运行。
- `github_list_workflow_run_artifacts`：按运行 ID 和真实 Link 分页列构件名称、大小、过期信息及 API `archive_download_url`。
- `github_download_workflow_artifact`：按真实 `artifactId` 只解析官方 302 的 HTTPS Location。得到一分钟有效的 URL，不跟随、不写文件；URL 会作为当前工具结果交付并进入展示链，只在用户点击时打开。

## 讨论（GraphQL）

- `github_list_discussions`：按更新时间倒序列出仓库讨论；`first`/`after` 游标分页，可选 `categoryId`、`answered`。必须认证。
- `github_get_discussion`：读取单个讨论的正文、作者、分类、是否已回答、票数与评论总数。必须认证。

## 通知

- `github_list_notifications`：列出当前用户通知，支持 `all`、`participating`、`since`、`before`；`per_page` 上限 50。必须认证。
- `github_get_notification`：读取单个通知 thread。必须认证。

## 部署与 check run

- `github_list_deployments`：按 `sha`、`ref`、`task`、`environment` 列出仓库部署。
- `github_get_deployment`：读取单个部署。
- `github_list_check_runs`：按 ref 列出 check run，支持 `check_name`、`status`、`filter`、`app_id`；默认不含 `output.summary/text`，需要时 `includeOutput: true`。
- `github_get_check_run`：读取单个 check run；默认返回输出标题与注解计数，`includeOutput: true` 时附带摘要与正文。

## 组织与团队

- `github_get_organization`：读取组织公开资料。
- `github_list_teams`：列出组织团队，支持 `team_type`。必须认证。
- `github_get_team`：按 slug 读取团队。必须认证。

## Gist 与软件包

- `github_list_gists`：列出用户 Gist。
- `github_get_gist`：读取单个 Gist；默认不返回文件内容，`includeContent: true` 时返回，单文件最多 1MB。
- `github_list_packages`：按 `ownerType`（authenticated/user/org）与 `packageType` 列出软件包；必须认证。
- `github_get_package`：读取单个软件包；必须认证。

## GraphQL

- `github_graphql`：发送 query 或 mutation 与可选对象 variables，必须认证。返回真实 `data`；存在 `errors` 时失败。query 用于读取，mutation 可能产生远端写副作用，每次调用仍由宿主单独授权，不用于规避其他写工具权限。结果超过统一 20,000 字符上限时明确失败，不截断。
