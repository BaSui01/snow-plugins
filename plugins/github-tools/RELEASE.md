# GitHub 0.4.1 首次发布

独立插件 `com.snow.github-tools` 版本 `0.4.1`，最低宿主 `0.5.12`。不是宿主更新；不自动安装。

- 通过 stdio MCP 服务注册 26 个 GitHub 工具：仓库、议题、提交、文件、代码搜索、PR、评论与审查、Revert PR、Release 资产、Actions 与 GraphQL。
- 只读 REST 可按 GitHub 规则匿名使用；代码搜索、GraphQL 与写操作需要 `GITHUB_TOKEN` / `GH_TOKEN` 或本机 `gh` CLI 令牌。
- 自带 26 个工具的统一结果卡片与 zh-CN / en / zh-TW 词条，并提供 `github-workflow` 技能。
- 只读取宿主提供的当前工具调用快照；不读取任意本地资产路径，不写入本地输出路径，不把令牌写入插件目录或额外日志。

首次上架仍需维护者审核市场条目。
