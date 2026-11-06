# PR 生命周期

## 读取定位

- `github_list_pull_requests`：按 open/closed/all 与真实分页列出 PR，取得编号、head/base SHA 和 GraphQL `node_id`。
- `github_get_pull_request`：读取正文、draft、merged、mergeable/mergeable_state、head/base ref+SHA、仓库链接和真实 `node_id`。
- 不猜测编号、SHA 或 GraphQL ID；Revert 前必须从 PR 详情取得真实 `node_id`，并确认已经 merged。

## 创建、审查与评论

1. 本地提交并 push 到 head 分支（由终端完成，先确认分支与远端一致）。
2. `github_create_pull_request` 创建 head → base，记下返回 number。
3. 需要时用 `github_review_pull_request` 提交 APPROVE / REQUEST_CHANGES / COMMENT；后两者必须有非空 body。
4. `github_comment` 发表普通讨论评论；`github_comment_pull_request_line` 使用 commitId、path、line、side 在差异行提交行级评论，不使用废弃 position。

## 合并

- 合并前重新读取 PR，确认 merged、mergeable 和 head SHA；`github_merge_pull_request` 可传 sha 防止检查后 head 变化。
- merge / squash / rebase 都是真实远端写操作。结果只看实际 merged、sha 和 message；merged=false 时回报原文，不重试。

## Revert

- `github_revert_pull_request` 的 `pullRequestId` 是 PR 的 GraphQL ID/IPR，不是 number 或 SHA；title/body/draft 可选。
- 仅对已合并 PR 使用。成功语义是**已创建新的 Revert PR**，不是撤销已有合并，也不自动合并新 PR。
- 执行后回报新 PR 的 number/url/title/isDraft/state/headRefName/baseRefName；后续仍需按正常审查与合并流程处理新 PR。
