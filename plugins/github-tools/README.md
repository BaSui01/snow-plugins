# GitHub

GitHub 插件：向模型注册 14 个可调用工具，通过 MCP stdio 进程访问 GitHub REST API。

只读工具：

- `github_search_repositories`：按关键词搜索仓库
- `github_get_repository`：读取单个仓库的元数据
- `github_list_issues`：列出仓库议题（该接口同时返回 Pull Request）
- `github_list_commits`：列出分支、标签或指定提交上的提交，可按文件路径、作者与时间范围过滤
- `github_get_file`：读取仓库内文件内容（目录返回列表）
- `github_search_code`：全站代码搜索（需要令牌）

写工具（需要令牌写权限）：

- `github_merge_pull_request`：合并 PR（merge / squash / rebase，可传期望的 head SHA）
- `github_comment`：在议题或 PR 下发表评论
- `github_create_issue`：创建议题，可带标签与指派
- `github_update_issue`：更新标题 / 正文 / 标签 / 指派，或关闭、重新打开
- `github_create_pull_request`：从 head 分支向 base 分支创建 PR
- `github_review_pull_request`：提交 APPROVE / REQUEST_CHANGES / COMMENT 审查
- `github_create_release`：创建 Release（标签不存在时由 GitHub 建立）
- `github_put_file`：通过 contents API 提交单个 UTF-8 文本文件（更新时需提供 blob SHA）

插件自带工具调用卡片（源码 `src/renderer/`，构建为 `index.js`）：查询结果以列表、统计与代码块展示，写操作显示结果徽标、编号、分支方向、提交 SHA 与打开链接；文案覆盖简体中文、繁体中文与英文。卡片只读取宿主提供的当前工具调用快照，不读取其他消息。

插件同时自带工作流技能 `skills/github-workflow`（通过 `plugin.json` 的 `skills` 贡献点注册，技能 id 为 `com.snow.github-tools/github-workflow`）：说明工具选择、PR 生命周期与写操作纪律。技能的启停跟随插件本身，插件停用即从 `skills-skill-execute` 消失。

## 与 git / gh CLI 的分工

- **插件（MCP 工具）**：结构化的 GitHub REST 读写，不依赖本机 `gh`，结果直接进工具卡；适合搜索、读取、合并 PR、评论、议题、审查、Release 与单文件提交。
- **`gh` CLI / `gh` skill**：本机登录态、复杂查询、GraphQL、workflow 等未封装能力；插件的令牌也可以直接复用 `gh auth token`。本机安装并使用 `gh` 时需要启用对应的 `gh` skill。
- **git**：本地分支、提交、push、合并与冲突处理仍由终端里的 git 完成。插件不操作工作区，也不替代 `git push`；推送前应在本地提交，推送后再用插件的 PR / 合并工具。

## 运行条件

- Node.js 18 或更高版本（`plugin.json` 通过 `node {{pluginDir}}/server.js` 启动）。
- 读工具可匿名使用（限流 60 次/小时）；代码搜索与全部写工具必须提供令牌：`GITHUB_TOKEN` / `GH_TOKEN` 环境变量，或本机 `gh auth login` 后的 `gh auth token`。写工具需要令牌具备对应仓库的写权限。
- 宿主需要在派发工具配置时展开 `{{pluginDir}}`（本仓库同期宿主改动）。

## 安装与使用

1. 在 Snow App「插件列表 → 从目录安装」选择本目录 `plugins/github-tools`。
2. 确认插件启用（工具插件会显示「工具插件」与工具数量）。
3. 在聊天输入框用 `@` 选中「GitHub」，本会话内模型即可调用上述工具；子代理继承同一选择。未激活时插件工具不进入请求，工具搜索也索引不到。
4. 移除输入区的插件 chip 即取消激活。

## 隐私与边界

- 只访问 `https://api.github.com`，读取或修改你指定的仓库、议题、PR、文件与 Release。
- 令牌只从进程环境或本机 `gh` CLI 读取，不写入插件目录、配置或日志。
- 写工具会以令牌身份修改远端仓库；每次调用仍受宿主工具授权控制。插件不执行 `git push`、不操作本地工作区、不改写提交历史。
- 工具进程在插件目录外运行，`privacy` 声明是安装前告知；宿主无法拦截该进程内部行为。

## 开发

```sh
npm ci
npm run build   # src/index.ts → server.js；src/renderer/ → index.js
npm run check   # tsc --noEmit + 两个产物的一致性检查
```

`server.js` 与 `index.js` 是构建产物，不直接编辑；`src/`、`scripts/`、`package.json` 等开发文件不进入发布安装包。

## 图标与商标

图标使用 GitHub 官方 Invertocat 徽标（白色 mark，深色圆角底），图形比例与留白未改动，符合 [GitHub Brand Toolkit](https://brand.github.com/foundations/logo "GitHub 官方品牌与 Logo 使用规范") 对社交按钮与集成展示的要求。GITHUB 与 Invertocat 是 GitHub, Inc. 的商标；本插件不是 GitHub 官方产品，也未获得其背书。
