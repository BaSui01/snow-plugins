---
name: github-workflow
description: GitHub 工作流：先查后写、议题与 PR 生命周期、行级评论、Revert PR、Release 资产、Actions、讨论、通知、部署与 check run、组织/团队、Gist、软件包与 GraphQL 的工具选择和顺序。当需要用 GitHub 插件完成结构化读写时使用。
enable: true
---

# GitHub 工作流

## 适用范围与能力地图

用于 GitHub 插件远端结构化操作：查询仓库、议题、PR、提交、文件、代码与 Actions；查询讨论（GraphQL）、通知、部署与 check run、组织与团队、Gist 与软件包；创建和管理议题、PR、评论与审查；创建 Revert PR、Release 和资产；提交单个文本文件；执行真实 GitHub GraphQL query/mutation。先用只读工具定位，再执行写操作。

- **插件**：远端对象的结构化读写，所有分页由真实 Link 头判断。
- **终端 git**：本地分支、提交、push、冲突处理；插件不操作工作区、不执行 push、不改写历史。
- **`gh` CLI**：负责本机登录态与插件未封装的 CLI 工作流；插件可复用 `gh auth token`。

## 工具发现与按需阅读

不声明固定 `allowed-tools`，因为插件工具公开名会动态变化。仅使用 `toolsearch-discover`、本技能列出的 GitHub 操作，以及必要的 `bash-terminal-execute` 和 `filesystem-read`；实际权限与审批由宿主决定。

资料中的 `github_*` 是检索用操作标识，**不是可直接调用的完整公开名**。调用前用 `toolsearch-discover` 检索目标操作，获取真实完整公开名及参数契约，不自行拼接名称。

只读取当前任务相关资料，**不自动展开全部引用文件**。下列相对路径均基于技能目录；用 `filesystem-read` 读取时，以技能加载结果给出的绝对目录为基准解析。

| 当前任务 | 按需读取 |
| --- | --- |
| 查询定位、选择工具或核对全部能力 | [工具操作地图（全部 41 项）](references/tools.md) |
| 读取、创建、审查、行级评论、合并或 Revert PR | [PR 生命周期](references/pull-requests.md) |
| 读取、创建、更新、关闭、重开议题或普通评论 | [议题管理](references/issues.md) |
| 文件范围读取、Release、资产或单文件提交 | [Release 与文件](references/releases-and-files.md) |
| 讨论列表或详情（GraphQL，`first`/`after` 游标） | [工具操作地图 · 讨论](references/tools.md) |
| 通知、部署与 check run、组织/团队、Gist、软件包 | [工具操作地图对应章节](references/tools.md) |
| Actions 状态、构件下载 URL 或通用 GraphQL | [工具操作地图对应章节](references/tools.md) |

## 共同约束

- 写操作执行前说明目标仓库、对象编号、分支、标签或 Release；执行后只根据真实结果字段回报。每次调用仍受宿主单独授权，GraphQL 不例外。
- 不猜测 SHA、PR GraphQL ID、运行或构件 ID；缺信息时先用只读工具查。
- 不批量循环写同一仓库：一次调用一个对象，失败立即停手并回报错误原文。写请求不会自动重试。
- Revert PR 只创建新的 PR，不撤销已有合并、不自动 merge。
- 文件和 GraphQL 结果超过 20,000 字符会失败而非截断；文件超限需缩小行范围后重新读取。
- 讨论只有 GraphQL 接口，必须认证，列表用 `first`/`after` 游标；通知、团队与软件包工具必须认证，Notifications 不支持 fine-grained PAT。
- Gist 默认不返回文件内容；需要内容时显式 `includeContent: true`，单文件最多 1MB 且可能触发 20,000 字符上限。Check run 的 `output.summary/text` 默认不返回，需要时显式 `includeOutput: true`。
- Actions 构件下载 URL 仅一分钟有效，会进入当前工具结果和展示链；只在用户主动打开时使用，不宣称不落历史。
