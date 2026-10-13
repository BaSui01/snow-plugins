# 0.2.0 — 桌面外部 MCP 卡片（开发扩展）

独立插件 `com.snow.external-tool-renderer` 版本升至 `0.2.0`，作者统一为 BaSui。不是宿主更新；不自动安装。

## 原迁移保持不变

原桌面 Anysearch/DBX 协议解析、UI、词条与两项贡献保留。共享 React/ToolCallNode/DataTableViewer 继续由宿主提供；同步工厂通过每卡 API Provider 渲染，无 hooks/Promise、第二份 React 或加载期 API 捕获。MIT 来源声明保留。

## 新增 MCP 扩展

- provider catalog 扩展为覆盖全部 24 类核心服务：
  1. 浏览器与网页提取：Anysearch、DBX、Firecrawl、Chrome DevTools、Playwright、Exa
  2. 代码协作与文档：Context7、GitHub、GitLab、Notion
  3. API 调试与云数据库：Postman、Supabase
  4. 生产监控与工单协同：Linear、Sentry
  5. 容器与云原生运维：Docker、Kubernetes
  6. 综合全网搜索矩阵：Brave Search、Tavily、Perplexity、Parallel、SerpApi、Kagi、Linkup、SearXNG
- 单项最多 6 个字面匹配前缀，完全符合宿主扩展后的 64 项/128 前缀上限。
- 深度优化全链路渲染性能：前缀倒序预编译 + 结果 Map 缓存、参数深层 useMemo 隔离、SearchResults / RecordTable / Metrics / Blocks 采用 React.memo 纯组件隔离。
- 三语词典扩展至 311 条等键词条，覆盖各服务核心操作名与新增实体集合。
- 默认折叠并 lazyBody，集合 20 项/页、内容块 5 块/页、文本 600 字符预览与 12,000 字符/页完整阅读；JSON 超过 8 Mi 字符明确提示并回退文本，完整内容不因专属摘要失败而消失。
- error 状态优先于外层 completed，识别 MCP isError、success:false、非空 error 对象和 failed/error 状态；原始持久化及模型数据不改变。
- 三语等键新增词条、根作用域样式、独立 README 安全/匹配/兼容说明；入口仅由 `npm run build` 生成。

## 安全边界

新增卡片仅纯文本/受控树，不执行返回 HTML 或脚本。仅主动点击、安全 HTTP(S) URL 经 `api.links.open`；拒绝 URL 凭据/危险 scheme/敏感 query，不加载远程图片。合规 MCP inline PNG/JPEG/WebP/GIF 签名与编码大小校验后须主动点击才显示，巨大 base64、SVG、resource blob 不全文渲染。JPEG/WebP 像素上限在解码后检查，不宣称图片解码已隔离。

敏感键、表单输入、提示词、代码、请求体默认隐藏；结果也进行模式过滤，但自由文本/图片并非完备脱敏，截图分享仍需人工审阅。没有 metadata/network/write、自动工具执行、轮询、持久化、全局 DOM 或结果日志。原 Anysearch/DBX 不改动，新过滤不会自动改变其历史行为。可信 ESM 不是安全沙箱。

## 兼容性与验证

必须使用提供 `ui.toolCallRendererVersion === 1` 的配套桌面构建；当前 Snow App 0.4.23 本地源码能力不能当作正式 0.4.23 已支持。插件不更新宿主，不伪造 minAppVersion。mobile 未迁移。

现有验证入口：`npm run build`、`npm run check`（tsc 与生产生成物一致性）；根目录 `python scripts/release.py validate` 由主代理统一执行。未新增测试/mock/fixture/临时测试脚本。

实际桌面安装、主题/三语、链接用户激活、图片解码、长列表分页/流式更新及不同 MCP 版本真实格式的端到端验收尚未完成，静态通过不能替代 UI 验收。本轮未升版、Git 提交/推送、发布、安装或市场更新；同步更新根 README，未修改宿主、其他插件或用户配置。
