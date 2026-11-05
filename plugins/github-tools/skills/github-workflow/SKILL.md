---
name: github-workflow
description: GitHub 工作流：先查后写、PR 生命周期（建 PR → 审查 → 合并）、议题管理、Release 与单文件提交的工具选择与顺序。当需要用 GitHub 插件完成提交、评论、合并、发布等写操作时使用。
enable: true
---

# GitHub 工作流

## 工具选择

本技能不声明固定 `allowed-tools`，因为插件工具公开名会动态变化。仅使用 `toolsearch-discover`、下列 GitHub 操作，以及必要的 `bash-terminal-execute` 和 `filesystem-read`；实际权限与审批由宿主决定。下列 `github_*` 是检索用的操作标识，不是可直接调用的公开名。

只读（可匿名，先做定位）：

- `github_search_repositories`：按关键词找仓库
- `github_get_repository`：读单个仓库元数据（默认分支、话题、star）
- `github_list_issues`：列议题（同时返回 PR，用 `pull_request` 字段区分）
- `github_list_commits`：列提交，可按分支、文件路径、作者与时间范围过滤
- `github_get_file`：读文件内容；目录返回列表
- `github_search_code`：全站代码搜索（必须令牌）

写（需要令牌写权限，按宿主授权与审批规则执行）：

- `github_create_issue` / `github_update_issue`（改标题、正文、标签、指派，或 `state: closed` 关闭）
- `github_comment`：议题或 PR 评论
- `github_create_pull_request`：head → base
- `github_review_pull_request`：`APPROVE` / `REQUEST_CHANGES` / `COMMENT`（后两者必须带 body）
- `github_merge_pull_request`：`merge` / `squash` / `rebase`，可传 `sha` 校验 head 未变
- `github_create_release`：标签不存在时由 GitHub 创建
- `github_put_file`：contents API 提交单个 UTF-8 文本文件，更新已有文件必须带 blob `sha`

## 分工：插件 / git / gh

- **本地分支、提交、push、冲突处理**：终端 git。插件不操作工作区、不执行 push、不改写历史。
- **插件**：远端对象的结构化读写。适合合并、评论、议题、审查、Release 与单文件提交。
- **`gh` CLI**：插件没封装的能力（workflow、GraphQL、复杂分页）。令牌共用 `gh auth token`。

## PR 生命周期

1. 本地提交并 `git push` 到 head 分支（终端完成，先确认分支与远端一致）。
2. 创建 PR，记下返回的 `number`。
3. 需要时提交审查；`REQUEST_CHANGES` 必须写清要改什么。
4. 合并前先查仓库或议题确认 base 分支与状态，再合并 PR；传 `sha` 可避免 head 在你检查后被更新。
5. 合并结果只看返回的 `merged` 与 `sha`；`merged: false` 时把 `message` 原文回给用户，不重试。

## 写操作纪律

- 合并、关闭、发布、提交文件属于不可逆动作：执行前说明目标（仓库、编号、分支、标签），执行后回报结果字段。
- 不猜测 `sha`、不猜测 PR 编号；缺信息时先用只读工具查。
- 不批量循环写同一仓库：一次调用一个对象，失败立即停手并回报错误原文。
- 写失败（401/403/404/422）不要换工具重试；把 GitHub 返回的 message 原样交给用户判断权限或参数问题。
- 需要提交多个文件时不要用 `github_put_file` 逐个写：让用户在本地 commit + push，再用插件建 PR。

## 议题管理

- 建：`github_create_issue`，标题必填，标签与指派可选（上限 20 / 10）。
- 改：`github_update_issue` 至少给一个字段；`labels` / `assignees` 是**整体替换**，不是追加。
- 关：`state: "closed"`；重开用 `"open"`。
- 讨论：`github_comment`，议题与 PR 共用同一接口。
