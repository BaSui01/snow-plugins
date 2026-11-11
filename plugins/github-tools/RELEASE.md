# GitHub 0.5.2 发布

独立插件 `com.snow.github-tools` 版本 `0.5.2`，最低宿主 `0.5.12`。不是宿主更新；不自动安装。

- 工具由 26 个增至 **41 个**，新增只读能力：
  - 讨论：`github_list_discussions` / `github_get_discussion`（GraphQL 游标分页，必须认证）。
  - 通知：`github_list_notifications` / `github_get_notification`（必须认证，`perPage` 上限 50）。
  - 部署：`github_list_deployments` / `github_get_deployment`。
  - 检查运行：`github_list_check_runs` / `github_get_check_run`（`output` 默认不返回）。
  - 组织与团队：`github_get_organization`、`github_list_teams`、`github_get_team`。
  - Gist：`github_list_gists` / `github_get_gist`（默认不返回文件内容，需 `includeContent`）。
  - 软件包：`github_list_packages` / `github_get_package`（必须认证）。
- 新增讨论、通知、部署、组织、Gist、软件包 6 个只读视图与统一结果卡片，补齐 zh-CN / en / zh-TW 词条。
- `github-workflow` 技能能力地图同步新增工具、分页契约与视图说明。
- 凭据优先级保持 `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token`，不写入插件目录或额外日志；构件下载只接受官方 HTTPS `Location`，不自动下载，不写本地文件。
- 远端写操作仍需认证与 GitHub 实际权限，由宿主逐次授权；插件不自动重试写请求。

公开仓库 REST 读取可按 GitHub 规则匿名使用；代码搜索、通知、团队、软件包与讨论必须认证。Notifications 不支持 fine-grained PAT 或 GitHub App token。首次上架仍需维护者审核市场条目。
