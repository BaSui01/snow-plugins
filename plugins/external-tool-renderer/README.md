# 工具画廊（桌面 MCP 扩展，开发版本）

- ID：`com.snow.external-tool-renderer`（保持稳定，未随显示名变更）
- 显示名：`工具画廊` / `Tool Gallery` / `工具畫廊`
- 独立版本：`0.2.1`
- 作者：`BaSui`
- 安装目录：`plugins/external-tool-renderer`（直接包含 `plugin.json`），不能安装仓库根目录。

## 宿主要求与范围

当前 Snow App **0.4.23 本地源码已配套** `contributions.toolCallRenderers` 与受限桌面 v1 API；该插槽已随上游 PR [#201](https://github.com/MayDay-wpf/snow-app/pull/201 "插件工具调用渲染插槽贡献已合并") 合并进上游 `main`（提交 `408f1fb2`），但**尚未随任何正式标签发布**——已发布的正式版 `0.4.23` 不含该插槽。仅提供 `api.ui.toolCallRendererVersion === 1`、共享 `ui.React` 的桌面构建才能渲染。开发清单不伪造正式最低宿主版本。安装或更新插件不会更新 Snow App。

工厂同步返回绑定当前卡 API 的 `ApiContext.Provider`；无 hooks、Promise 或加载期 API 捕获。非 v1、已中止 API、React 不一致、插槽错误或不匹配工具返回 `null`，由宿主回退通用卡片。仅桌面；mobile 不在本轮范围。无独立面板、常驻任务或自动执行工具。

## Provider catalog 与匹配边界

清单共 **24 项贡献**（单项最多 6 个字面前缀，符合宿主 128 项上限）：

| 类别 / Provider | 覆盖前缀与服务 | 核心交互与展示特性 |
| --- | --- | --- |
| 原 Anysearch | `anysearch-`, `anysearch_` | 独立工厂 `renderAnysearch`，搜索/批量/网页提取/能力发现，原文 fallback |
| 原 DBX | `dbx-`, `dbx_` | 独立工厂 `renderDbx`，覆盖 DBX MCP 0.4.x 全部 22 个工具（连接/数据库/表/存储过程/SQL 与批量脚本/会话/Redis/Salesforce 两步写入/Kafka 消息/桌面 UI），SQL 与 Markdown 表格多格式兼容；`confirm_token` 与消息体不落卡片 |
| Firecrawl | `firecrawl-`, `firecrawl_` | 网页/新闻/图片分组，抓取/解析 markdown/html/JSON，研究任务 ID 与状态进度 |
| Chrome DevTools | `chrome-devtools-`, `chrome-devtools_`, `chrome_devtools-`, `chrome_devtools_` | 页面列表、快照、控制台消息、网络请求详情与表格、性能追踪、堆快照、截图 |
| Playwright | `playwright-`, `playwright_` | 浏览器点击/输入/拖拽/选项/等待/媒体模拟/网络/快照/截图，敏感输入遮掩 |
| Context7 | `context7-`, `context7_` | 库标识解析、文档与代码检索、库列表展示、参数 language 摘要 |
| GitHub | `github-`, `github_` | 仓库/文件/提交/PR/Issue/Actions/讨论/Gist，参数 owner/repo 摘要与多集合列表 |
| Exa | `exa-`, `exa_` | 网页搜索/抓取/高级/代理，标题/URL/日期/高亮正文结构化预览与原文兜底 |
| Brave Search | `brave-search-`, `brave_search-`, `brave-` 等 | 网页/本地商户/视频/图片/新闻/地点/总结/LLM 上下文，支持地点与日期识别 |
| Tavily | `tavily-`, `tavily-mcp-`, `tavily_mcp-` 等 | 实时搜索、智能回答 (answer)、网页内容提取、网站站点地图 (map)、深度爬取 (crawl) |
| Perplexity | `perplexity-`, `perplexity_` | 实时搜索、快速问答、深度研究、逻辑推理，突出展示结构化引用与回答正文 |
| Parallel | `parallel-`, `parallel-search-`, `parallel_search-` 等 | 多查询摘要、来源策略、网页正文提取 (web_fetch) 摘录展示 |
| SerpApi | `serpapi-`, `serpapi_` | 多引擎通用检索 (Google/Bing/Yahoo/YT/eBay 等)、分类结果、参数 engine/location 摘要 |
| Kagi | `kagi-`, `kagimcp-` 等 | 综合搜索与镜头过滤 (kagi_search_fetch)、Markdown 正文提取 (kagi_extract) |
| Linkup | `linkup-`, `linkup_` | 标准与深度搜索、页面抓取、异步多步骤深度研究任务与生成回答 |
| SearXNG | `searxng-`, `mcp-searxng-`, `mcp_searxng-` 等 | 尊重隐私的自建/公开实例多引擎搜索、搜索联想词、实例配置信息、网址正文阅读 |
| **Supabase** | `supabase-`, `mcp-server-supabase-`, `mcp-server-postgrest-` | 云数据库管理、执行 SQL、表结构迁移、模式与表格交互展示 |
| **Postman** | `postman-`, `postman-mcp-`, `postman_mcp-` | API 集合、测试工作流、环境变量、工作区管理与运行结果 |
| **Linear** | `linear-`, `linear-mcp-`, `linear_mcp-` | 项目与工单管理、新建与搜索 Issue、状态变更与指派人面板 |
| **Sentry** | `sentry-`, `sentry-mcp-`, `sentry_mcp-` | 生产报错追踪、异常详情读取、堆栈回溯与错误频次指标统计 |
| **GitLab** | `gitlab-`, `gitlab-mcp-`, `gitlab_mcp-` | 企业代码仓库、合并请求 (MR)、Issue、流水线与项目列表 |
| **Docker** | `docker-`, `docker-mcp-`, `docker_mcp-` | 本地容器管理、镜像/数据卷查询、容器运行与日志状态 |
| **Kubernetes** | `kubernetes-`, `k8s-`, `kubernetes-mcp-`, `k8s-mcp-` | 集群控制面、Pod 状态列表、日志流与命名空间资源 |
| **Notion** | `notion-`, `notion-mcp-`, `notion_mcp-` | 知识库检索、页面读取与更新、数据库多维表格内容块展示 |

服务与操作名兼容 `-` / `_` 规范化及重复服务前缀；例如 `firecrawl-firecrawl_scrape` → `scrape`、`chrome_devtools-take_snapshot` → `take-snapshot`、`playwright-browser_snapshot` → `browser-snapshot`。未知操作显示规范化名称，并保留通用内容回退。

除以上 24 类外不贡献额外 MCP 渲染器；**自定义 MCP 服务器名不在清单匹配范围时，仍由宿主通用卡片展示。** 没有通配符、正则或全局兜底前缀，不接管内置专用卡片、授权或拒绝 UI。新增 provider 时须同时维护 `src/providers.ts` 与清单，不超过宿主上限。

## 通用内容与交互

### 性能保障与优化

本插件在宿主与插件两端均实施了性能优化设计，即使面对几十万字或成千上万条工具调用的超大会话也能保证极致流畅：
- **O(1) 路由与前缀查找缓存**：插件内部维护预排序的 `prefixMap`，避免单次工具调用多次动态构建别名数组；并配置 LRU 缓存以实现多次调用免重复计算。
- **宿主级匹配记忆化**：宿主 `PluginToolCall` 维护工具名匹配缓存（Match Cache），在长消息流式渲染过程中避免重复扫描全部插件的定义树。
- **长文本与大 JSON 熔断**：单条文本超过 8 MiB 时自动熔断降级为流式有界纯文本预览，严防卡顿；文本与集合均实施受控分页（大文本按 12,000 字符分页，集合按 20 条分页），收起状态下启用宿主 `lazyBody` 彻底避免 DOM 节点泛滥。
- **React 组件粒度记忆化**：在卡片内部对 `summaryKeys`、`parts`、`summary` 与多引擎结果提取全面进行 `React.useMemo` 细粒度包裹，参数未变更时跳过虚拟 DOM 重新比对。

操作名和参数按当前暴露的 Schema 与官方资料核实：浏览器交互与快照 [Playwright MCP](https://github.com/microsoft/playwright-mcp "官方清单列出 browser_* 工具及 target 等参数")、库标识和文档查询 [Context7](https://github.com/upstash/context7 "官方清单确认 resolve-library-id 与 query-docs 的参数")、仓库与 Issue/PR 操作 [GitHub MCP](https://github.com/github/github-mcp-server "官方清单说明 GitHub 工具名称与结构化内容返回")。不将文档中的全部工具视为当前用户已启用能力。


- `src/mcp.ts` 保留 JSON、MCP `structuredContent`、**全部** `content` 多块及 envelope/transport 辅助字段；文本块可解析嵌套 JSON，resource 保留 URI/MIME/text，未知块回退受控树。结构化副本与文本副本均保留，不悄悄去重或丢块。
- 默认折叠工具卡，body 使用宿主 `lazyBody`；展开后仅挂载当前页。内容块每页 5 个，集合/表格每页 20 项，文本默认预览 600 字符，完整文本每页 12,000 字符。对象字段逐层主动展开；32 层后可主动继续更深内容。
- 表格复用宿主 `DataTableViewer`，单页最多 12 列、单元格最多 300 字符；导出与搜索关闭，避免导出敏感原始数据。完整字段/内容仍在下方树中。专属摘要扫描有限候选，无法提取的内容不会消失。
- 超过 8 Mi 字符不执行 `JSON.parse`，明确提示并回退分页、过滤后的纯文本；此时无法结构化识别 payload 错误。普通 payload 的 `isError: true`、`success: false`、非空 `error`（含对象）或 `status: failed/error` 优先标记为 error，即使调用外层 completed。错误结果仍可查看，不改写原始协议或回传模型数据。
- Firecrawl agent 的 invocation completed 不等于远端研究已完成：卡片额外展示服务返回的 payload status/progress；不将数值强行解释为百分比。

### Exa 协议与边界

兼容 `exa-` / `exa_` 及重复服务前缀，如 `exa-exa_web_search_exa` → `web-search-exa`。本会话实际工具 Schema 中 search 另有 `objective`，仅展示字符长度并在参数树遮掩，不将其假称为官方当前默认参数；fetch 仅摘要网址数量与实际 maxCharacters，不虚构默认值。

依据 [官方搜索实现](https://github.com/exa-labs/exa-mcp-server/blob/main/src/tools/webSearch.ts "官方搜索实现返回 Title、URL、Published、Author 和 Highlights 或 Text 的 MCP 文本") 与 [官方抓取实现](https://github.com/exa-labs/exa-mcp-server/blob/main/src/tools/webFetch.ts "官方抓取实现返回标题、URL、可选日期作者、正文及逐 URL 错误")，`src/Exa.ts` 只对两种明确默认格式提供有界辅助解析。JSON results 数组复用 `searchGroups` / `SearchResults`，日期仅在 Exa 卡片显示。辅助解析扫描前 20 块、每块前 200,000 字符、最多 200 条，正文每条最多 4,000 字符；卡片明确标注预览，原始多块内容和完整文本始终仍可分页展开，不把预览数量当作总结果数。

官方 fetch 的 `isError` 沿用通用错误优先规则；辅助范围内的逐 URL `Error fetching` 也标记 error，但成功网页内容仍可查看。超出辅助范围、格式不匹配或未来协议均保留受控原文回退，不执行 HTML，不自动请求网页图片。

[官方工具注册表](https://github.com/exa-labs/exa-mcp-server/blob/main/src/toolRegistry.ts "官方注册表确认 web_search_advanced_exa 与 agent_run 为可选工具") 中的 `web_search_advanced_exa` 和 `agent_run` 已补三语名称；高级检索仅复用实际 JSON 结果，研究代理和其他协议保留通用内容展示，不宣称全部有专属解析，也不启动或轮询任务。本轮仅新增 Exa，不自动适配其他搜索 MCP。

## 安全与隐私

清单仍为可信本地 ESM，`privacy.scopes: ['messages']`。仅读取宿主冻结的当前工具快照：name/arguments/status/result/streamingStdout/streamingStderr；没有 metadata、network、write、存储或跨会话访问。React、ToolCallNode、DataTableViewer、图标与错误本地化沿用宿主。不记录参数或结果，不访问全局 DOM、`window.snow` 或 `window.open`。

新增通用卡的正文均为**不可信纯文本**：不执行 HTML、Markdown HTML、脚本或工具结果内指令。所有 HTTP(S) 链接拒绝用户名/密码、危险 scheme、空白控制字符及明显敏感 query；仅用户主动点击经 `api.links.open` 打开应用内浏览器，不自动跳转。图片检索/远程截图 URL 仅作链接，不自动请求远程图片。

MCP 内联图片只允许 PNG/JPEG/WebP/GIF，base64 编码不超过 2 Mi 字符且检查格式/签名字节；PNG/GIF 预检尺寸，每边最多 8192、总像素最多 1600 万。显式点击后才挂载本地 data URI 图片，解码失败或超限隐藏；SVG/HTML/其他 MIME、resource blob、巨大 base64 永不全文渲染。JPEG/WebP 像素数在浏览器解码后再检查，未进行安全沙箱隔离或图片转码。

参数默认隐藏 password/token/cookie/auth/headers 等敏感键，以及表单 text/value/elements/fields、prompt、function/script、请求体/代码/拖放数据等；非法/流式未完整的参数不展示原文。结果中的敏感键、明显凭据模式与长二进制串亦过滤。**过滤不是完备脱敏保证**：无标签的秘密、业务数据、图片与自由文本仍可能敏感；分享前须人工脱敏。原 Anysearch/DBX 协议/UI 不改动，本轮新增通用卡安全过滤不自动改变其历史行为。ESM 是可信代码，**不是隔离沙箱**。

DBX 卡片只展示参数与结果摘要：`salesforce-prepare-write` 的一次性 `confirm_token` 不进入折叠摘要（仅提示「待确认」），`peek-messages` 的 base64 消息体只统计条数、不在摘要中展开；完整原文仍由下方结果区按原文展示，插件不做额外持久化。

## 独立开发与文案

```sh
cd plugins/external-tool-renderer
npm run build
npm run check
# 仓库根目录（由整体交付统一执行）：
python scripts/release.py validate
```

`npm run check` 是现有生产校验（`tsc --noEmit` 与内存重建比较 `index.js`），不新增测试。仅编辑 `src/`，`index.js` 由 build 生成，Blob ESM 无相对运行时 import；依赖仍仅本地 esbuild/typescript/@types/react，不打包第二份 React 或宿主源码。

三语词条在原有 83 条 Anysearch/DBX 基础上补齐 DBX 新增工具名与操作名（共 347 条等键，`dbx-dbx_<tool>` 与 `dbx_<tool>` 两种公开名形式都覆盖）；未知操作以规范化名显示。`style.css` 仅在 `.sno************************` 根下补充通用卡片，继续使用宿主主题变量，不改变原卡片规则。MIT 来源、版权见 [NOTICE](NOTICE)、[LICENSE](LICENSE)。

## 发布与验证边界

正式最低宿主版本尚未确定；desktop 真机交互、三语/主题、链接用户激活、图片解码、大结果与各 MCP 服务版本返回格式须由配套宿主实际验收。静态构建不等于 UI 验收；不宣称所有 MCP 协议都具备专属字段展示。

独立标签/安装包按 `<slug>/v<version>` 约定，本版本为 `external-tool-renderer/v0.2.1`。开发/文档/词条改动不会自动更新宿主或已安装插件。
