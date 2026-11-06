# Release 与文件

## 文件范围读取

- `github_get_file` 不传 startLine/endLine 时读取全文；目录路径仍返回列表。
- startLine/endLine 为正整数，同时提供时 endLine 必须不小于 startLine。只给 startLine 时读到文件末尾，只给 endLine 时从第 1 行开始。
- 返回文本保留原始内容及 CRLF/LF/CR 换行；range/totalLines 基于实际内容计算。起始行超出文件会失败。
- GitHub contents API 仍有 1,000,000 字节文件边界；最终工具 JSON 上限为 20,000 字符。过大时明确缩小行范围后重新读取，插件不静默截断、不生成破损 JSON。

## Release

- `github_create_release`：创建 Release；标签不存在时由 GitHub 在 targetCommitish 创建。发布前说明仓库与标签。
- `github_upload_release_asset`：先取得真实数值 releaseId，再传 name、contentBase64、contentType，label 可选。
- 资产内容必须由调用者以非空规范 Base64 提供；插件校验并解码为原始字节，只向官方 uploads.github.com 端点发送，不读取本地路径、不接受外部 uploadUrl。
- 上传是真实远端写操作，需要认证和 GitHub 实际要求的权限，不自动重试。执行后只回报实际资产 id/name/state/size/content_type/browser_download_url。

## 单文件提交

- `github_put_file` 通过 contents API 提交单个 UTF-8 文本文件；更新已有文件必须带真实 blob sha，不猜测 sha。
- 提交前说明目标仓库与分支，执行后回报实际 path、文件 SHA、提交 SHA 与链接。
- 需要提交多个文件时不要逐个循环写：让用户在本地 commit + push，再用插件建 PR。
