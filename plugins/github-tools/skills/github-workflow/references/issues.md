# 议题管理

- 列：`github_list_issues` 按 state 和 `page/perPage` 查询；此端点也可能返回 PR，使用 `pull_request` 标记区分。
- 读：`github_get_issue` 按 owner/repo/issueNumber 读取完整正文、标签、状态、作者、评论数、PR 标记与链接。
- 建：`github_create_issue`，标题必填，标签与指派可选（上限 20 / 10）。
- 改：`github_update_issue` 至少给一个字段；labels / assignees 是整体替换，不是追加。
- 关：`state: "closed"`；重开用 `"open"`。
- 讨论：`github_comment` 发表普通评论；议题与 PR 共用 issues comments 端点。差异行评论使用 `github_comment_pull_request_line`，不要混用。
- 写操作需要真实认证和对应仓库权限；不自动重试，失败保留 GitHub 原始错误信息。
