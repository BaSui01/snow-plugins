# 0.2.1 — 工具画廊：DBX 全量工具卡与图标

独立插件 `com.snow.external-tool-renderer` 版本升至 `0.2.1`（显示名改为「工具画廊 / Tool Gallery」，ID 保持不变）。不是宿主更新；不自动安装。

## 本版改动

### 1. DBX 渲染器补齐到 22 个工具

`src/DbxToolCall.tsx` 原先只覆盖 12 个操作，本版对齐 DBX MCP 0.4.x 的**全部 22 个工具**，新增分支：

`list-databases`、`duplicate-connection`、`list-routines`、`get-routine-source`、`execute-batch`、`salesforce-current-user`、`salesforce-prepare-write`、`salesforce-apply-write`、`peek-messages`、`send-message`

- `execute-batch` 的脚本同时接入与 `execute-query` / `execute-redis-command` 一致的命令行展示。
- 未列入 switch 的未来工具由 `default` 分支回退为操作名摘要 + 通用结果渲染，不会因新增工具而白屏。

### 2. 敏感字段不进折叠摘要

- `salesforce-prepare-write` 的一次性 `confirm_token` **不进入卡片摘要**，只提示「待确认」；完整原文仍由下方结果区按原文展示。
- `peek-messages` 的 base64 消息体**只统计条数**，不在摘要中展开。

### 3. 三语词条补齐并等键

- 三语词典补齐至 **347 条等键**（en / zh-CN / zh-TW，`missing 0 / extra 0`，无重复键）。
- 同时覆盖宿主可能暴露的两种公开工具名形式：`dbx-dbx_<tool>`（server 名 + 工具自带前缀）与 `dbx_<tool>`。
- 依据 DBX 二进制实测更正 Redis 工具名拼写：`dbx_execute_redis_command`（旧词条误写为 `dbx_execute_redis_comman`）；源码内旧的短拼写映射保留为兜底。

### 4. 新增矢量图标

新增 `assets/icon.svg`（数据库柱体 + 外部挂载星标，深蓝渐变底），替换原 `lucide:Blocks` 占位图标。清单 `icon` 指向 `assets/icon.svg`。

### 5. 显示名与描述改写

- 显示名：`工具画廊` / `Tool Gallery` / `工具畫廊`（原「外部工具渲染 / External Tool Renderer」）。
- 描述改为功能优先文案：先说明提供统一卡片（参数摘要、表格、内容块、错误状态），再说明覆盖 24 类搜索与开发服务，最后给出宿主要求。
- **ID 保持不变**（`com.snow.external-tool-renderer`），不影响已安装记录的更新。

## 宿主要求与兼容性

- 仍需提供 `ui.toolCallRendererVersion === 1`、共享 `ui.React` 的桌面构建才能渲染。
- 该插槽已随上游 [PR #201](https://github.com/MayDay-wpf/snow-app/pull/201 "插件工具调用渲染插槽贡献已合并") 合并进上游 `main`（提交 `408f1fb2`），但**尚未随任何正式标签发布**：已发布的正式版 `0.4.23` 不含该插槽。
- 插件不更新宿主，不伪造 `minAppVersion`。mobile 未迁移。

## 安全边界

沿用 0.2.0 的边界：新增卡片仅纯文本/受控树，不执行返回 HTML 或脚本；仅用户主动点击、安全 HTTP(S) URL 经 `api.links.open` 打开；合规 MCP inline 图片经签名与编码大小校验后须主动点击才显示，巨大 base64、SVG、resource blob 不全文渲染；敏感键、表单输入、提示词、代码、请求体默认隐藏。没有 metadata/network/write、自动工具执行、轮询、持久化、全局 DOM 或结果日志。可信 ESM 不是安全沙箱。

## 验证

- `npm run build`（esbuild 重建 `index.js`）通过。
- `npm run check`（`tsc --noEmit` 与内存重建比较 `index.js`）通过。
- 根目录 `python scripts/release.py validate` 通过（`Validated 3 plugins`）。
- 三语等键与重复键扫描通过（各 347 条）。
- 未新增测试/mock/fixture/临时测试脚本。

实际桌面安装、主题/三语、链接用户激活、图片解码、长列表分页/流式更新及不同 MCP 版本真实格式的端到端验收尚未完成，静态通过不能替代 UI 验收。
