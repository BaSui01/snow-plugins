# 工具画廊（桌面 MCP 扩展，开发版本）

- ID：`com.snow.external-tool-renderer`（保持稳定，未随显示名变更）
- 显示名：`工具画廊` / `Tool Gallery` / `工具畫廊`
- 独立版本：`0.3.1`
- 作者：`BaSui`
- 安装目录：`plugins/external-tool-renderer`（直接包含 `plugin.json`），不能安装仓库根目录。

## 宿主要求与范围

该插槽已随上游 PR [#201](https://github.com/MayDay-wpf/snow-app/pull/201 "插件工具调用渲染插槽贡献已合并") 合并进上游 `main`（提交 `408f1fb2`），并**自正式标签 `v0.4.24` 起随发行版发布**（`v0.4.24` / `v0.4.25` 均包含）。仅提供 `api.ui.toolCallRendererVersion === 1`、共享 `ui.React` 的桌面构建才能渲染。

**最低宿主版本为 `0.4.24`**（`plugin.json` 与 `market.json` 一致声明）。原因是宿主对 `contributions.toolCallRenderers` 的清单扫描上限在 `v0.4.23` 及更早版本为 **16 项 / 32 前缀**，本插件声明了 **24 项 / 86 前缀**，在旧宿主上会被静默截断到前 16 项（`exa`、`brave`、`tavily` 及其后 8 个 provider 的专属卡片不会生效）。该上限自 `v0.4.24` 起放宽到 **64 项 / 128 前缀**，同版本还加入了工具名匹配记忆化缓存。安装或更新插件不会更新 Snow App。

> `0.4.23` 及更早版本**完全不含**该插槽，卡片不会渲染（回退通用卡片）；`0.4.24`+ 可完整渲染 24 项。宿主对该字段目前只记录与展示，不做安装拦截，因此旧宿主上仍是「能装但卡片不全」。

工厂同步返回绑定当前卡 API 的 `ApiContext.Provider`；无 hooks、Promise 或加载期 API 捕获。非 v1、已中止 API、React 不一致、插槽错误或不匹配工具返回 `null`，由宿主回退通用卡片。仅桌面；mobile 不在本轮范围。无独立面板、常驻任务或自动执行工具。

## Provider catalog 与匹配边界

清单共 **24 项贡献**（单项最多 6 个字面前缀，符合宿主 128 项上限）：

| 类别 / Provider | 覆盖前缀与服务 | 核心交互与展示特性 |
| --- | --- | --- |
| 原 Anysearch | `anysearch-`, `anysearch_` | 独立工厂 `renderAnysearch`，搜索/批量/网页提取/能力发现，原文 fallback |
| 原 DBX | `dbx-`, `dbx_` | 独立工厂 `renderDbx`，覆盖 DBX MCP 0.4.x 全部 22 个工具（连接/数据库/表/存储过程/SQL 与批量脚本/会话/Redis/Salesforce 两步写入/Kafka 消息/桌面 UI），SQL 与 Markdown 表格多格式兼容；`confirm_token` 与消息体不落卡片 |
| Firecrawl | `firecrawl-`, `firecrawl_` | 30 个官方工具（含 monitor/research/feedback 系列）全覆盖（scrape/search/map/crawl/check_crawl_status/parse/agent/agent_status/interact/interact_stop/find_tools/developer_search/gov_search/credit_usage/extract）；网页/新闻/图片分组、研究任务状态与额度用量 |
| Chrome DevTools | `chrome-devtools-`, `chrome-devtools_`, `chrome_devtools-`, `chrome_devtools_` | 59 个工具：输入自动化、导航与页面、模拟、性能追踪、网络、调试与快照、堆快照与录屏；`pageId`/`uid` 摘要 |
| Playwright | `playwright-`, `playwright_` | 72 个 `browser_*` 工具（含 network/storage/testing/devtools/vision caps）：导航/快照/查找/点击/悬停/拖拽/输入/表单/按键/截图/标签页/网络/脚本/媒体模拟；敏感输入遮掩 |
| Context7 | `context7-`, `context7_` | `resolve-library-id` 与 `query-docs`（旧名 `get-library-docs` 已由官方移除），库列表与文档正文展示 |
| GitHub | `github-`, `github_` | 官方工具集 repos/issues/pull_requests/actions/discussions/gists/context/labels/notifications 等 96 项；`owner`/`repo`/`method` 摘要与多集合表格 |
| Exa | `exa-`, `exa_` | 网页搜索/抓取/高级/代理，标题/URL/日期/高亮正文结构化预览与原文兜底 |
| Brave Search | `brave-search-`, `brave_search-`, `brave-` 等 | 8 个官方工具；逐条单结果 JSON 文本合并为结果列表，`brave_llm_context` 的 `grounding`/`sources` 结构化展示 |
| Tavily | `tavily-`, `tavily-mcp-`, `tavily_mcp-` 等 | 5 个工具（search/extract/crawl/map/research）；`Answer` + `Title/URL/Content` 纯文本报告解析为结果列表 |
| Perplexity | `perplexity-`, `perplexity_` | 4 个工具；从回答正文尾部拆出 `Citations:` 引用块并单列来源链接 |
| Parallel | `parallel-`, `parallel-search-`, `parallel_search-` 等 | `web_search`/`web_fetch`，`results[].excerpts[]` 结构化结果与 `errors` 失败项 |
| SerpApi | `serpapi-`, `serpapi_` | `search` 覆盖全引擎（参数在 `params` 内，摘要自动解包）；`organic_results`/`news_results`/`local_results`/`shopping_results`/`top_stories`/`related_questions` 等分组 |
| Kagi | `kagi-`, `kagimcp-` 等 | `kagi_search_fetch` 与 `kagi_extract`（`kagi_fastgpt`/`kagi_summarizer` 已由官方移除） |
| Linkup | `linkup-`, `linkup_` | `linkup-search`/`linkup-research`/`linkup-get-research`/`linkup-fetch`；异步研究任务状态 |
| SearXNG | `searxng-`, `mcp-searxng-`, `mcp_searxng-` 等 | `searxng_web_search`/`searxng_search_suggestions`/`searxng_instance_info`/`web_url_read`；`results`/`suggestions`/`answers`/`infoboxes` 分组 |
| **Supabase** | `supabase-`, `mcp-server-supabase-`, `mcp-server-postgrest-` | 33 个工具：数据库（`list_tables`/`list_extensions`/`list_migrations`/`apply_migration`/`execute_sql`）、调试（`query_logs`/`get_advisors`）、开发、Edge Functions、账户、分支、Storage |
| **Postman** | `postman-`, `postman-mcp-`, `postman_mcp-` | 42 个工具；官方工具名为 **camelCase**（`getCollections`/`runCollection`/`getWorkspaces`…），与旧 kebab-case 文档不同 |
| **Linear** | `linear-`, `linear-mcp-`, `linear_mcp-` | 24 项：工单/项目/团队/用户/评论/周期/标签/状态（官方为托管服务，未枚举工具名，按规范化操作名渲染） |
| **Sentry** | `sentry-`, `sentry-mcp-`, `sentry_mcp-` | 76 个工具（15 顶层 + 61 catalog）：`find_organizations`/`find_projects`/`search_issues`/`search_errors`/`search_traces`/`search_logs`/`search_metrics`/`search_replays`/`search_profiles`/`find_dropped_events`/`analyze_issue_with_seer`/`get_sentry_resource`/`search_sentry_tools`/`execute_sentry_tool`/`update_issue` |
| **GitLab** | `gitlab-`, `gitlab-mcp-`, `gitlab_mcp-` | 275 项：合并请求、工单、仓库文件与分支、项目/组、CI 流水线与作业、标签、`my_issues`/`whoami`/`health_check` |
| **Docker** | `docker-`, `docker-mcp-`, `docker_mcp-` | 19 项：官方 `docker` 单工具（`args` 子命令）+ 容器/镜像/网络/数据卷操作 |
| **Kubernetes** | `kubernetes-`, `k8s-`, `kubernetes-mcp-`, `k8s-mcp-` | 53 项：`pods_*`/`nodes_*`/`namespaces_list`/`events_list`/`resources_*`/`configuration_*`/`targets_list`/`helm_*`；兼容 kubectl 风格命名 |
| **Notion** | `notion-`, `notion-mcp-`, `notion_mcp-` | 24 项：页面、数据源、内容块、评论、用户、`post-search`；文本内 JSON 结构解析 |

以上操作名与参数均按各服务**官方仓库源码 / 官方文档**核实。覆盖率以**官方工具清单为驱动**统计：22 个通用 provider 共 **841 个官方工具**，本地化操作名词条覆盖 **841 / 841 = 100%**（缺失 0）。三语词典 1264 条等键（en / zh-CN / zh-TW，`missing 0 / extra 0`）。

> 该 100% 指**操作名本地化覆盖**：每个官方工具名都能显示中文/繁中操作标签，不会回退为英文规范化名（如 `get-heapsnapshot-retaining-paths`）。**不等于**每个工具都有专属结果解析器——结果解析仍按 `kind`（search / browser / generic）与 `collections` 分流，未核实返回结构的工具走通用内容渲染。

## 形态视图（0.3.0 新增）

除按 provider 分流的通用卡片外，插件还会对结果**内容**做形态嗅探：不看是哪个工具，只看输出长什么样。因此未核实 schema 的服务（GitLab / Docker / Linear 等）同样受益，且匹配失败时安全回退到通用渲染。

| 形态 | 触发条件 | 视图 |
| --- | --- | --- |
| 差异 | 出现 `diff --git` / `@@` 块 | 文件分组、+/− 着色、增删统计 |
| 目录树 | box-drawing 树（`├──`）或 GitHub `tree[]` JSON | 缩进列表、目录高亮、目录/文件计数 |
| 日志 | `msgid=`/`reqid=` 行，或时间戳/级别前缀占多数 | 级别着色、级别筛选 chips、分页 |
| 无障碍快照 | Chrome `uid=1_0 Role name` 或 Playwright `- role name [ref=eN]` | 缩进树、role 徽章、ref 显示 |
| 进度 | 存在 `status` 或 `completed/total` 比值 | 进度条、指标列表 |
| 检查清单 | `vulnerabilities`/`alerts`/`findings`/`lints` 等数组 ≥2 项 | 级别色标、级别计数、详情链接 |

解析器均在**官方来源的真实样例**上验证：Chrome DevTools 官方 `McpResponse` 快照测试、Playwright 官方无障碍快照、标准 unified diff、GitLab 目录树、pod 日志。共 15 项验证全部通过，其中 5 项为**误报防护**（散文不得被判定为 diff/日志/树/清单/进度）。

服务与操作名兼容 `-` / `_` 规范化及重复服务前缀；例如 `firecrawl-firecrawl_scrape` → `scrape`、`chrome_devtools-take_snapshot` → `take-snapshot`、`playwright-browser_snapshot` → `browser-snapshot`。未知操作显示规范化名称，并保留通用内容回退。

除以上 24 类外不贡献额外 MCP 渲染器；**自定义 MCP 服务器名不在清单匹配范围时，仍由宿主通用卡片展示。** 没有通配符、正则或全局兜底前缀，不接管内置专用卡片、授权或拒绝 UI。新增 provider 时须同时维护 `src/providers.ts` 与清单，不超过宿主上限。

## 通用内容与交互

### 性能保障与优化

本插件在宿主与插件两端均实施了性能优化设计，即使面对几十万字或成千上万条工具调用的超大会话也能保证极致流畅：
- **O(1) 路由与前缀查找缓存**：插件内部维护预排序的 `prefixMap`，避免单次工具调用多次动态构建别名数组；并配置 LRU 缓存以实现多次调用免重复计算。
- **宿主级匹配记忆化**：宿主 `PluginToolCall` 维护工具名匹配缓存（Match Cache），在长消息流式渲染过程中避免重复扫描全部插件的定义树。
- **长文本与大 JSON 熔断**：单条文本超过 8 MiB 时自动熔断降级为流式有界纯文本预览，严防卡顿；文本与集合均实施受控分页（大文本按 12,000 字符分页，集合按 20 条分页），收起状态下启用宿主 `lazyBody` 彻底避免 DOM 节点泛滥。
- **React 组件粒度记忆化**：在卡片内部对 `summary`、`groups`、`records`、`parsed` 与多引擎结果提取全面进行 `React.useMemo` 细粒度包裹，参数未变更时跳过虚拟 DOM 重新比对。
- **按 provider 的字段优先级表**：`src/summaries.ts` 为 22 个 provider 各自维护真实参数名顺序表（如 GitHub 的 `owner/repo/method`、K8s 的 `namespace/pod/apiVersion/kind`、SerpApi 的 `q/engine/location`），摘要只读取该表前 8 个命中字段，避免全量遍历参数对象。

操作名、参数名与结果结构均按各服务官方仓库源码 / 官方文档核实，覆盖 22 个通用 provider（Anysearch 与 DBX 为独立渲染器）：

| 服务 | 官方来源 |
| --- | --- |
| Firecrawl | [firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server "官方 README 与 tools 文档列出 29 个已注册工具名") |
| Chrome DevTools | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp "官方 tool-reference 按 Input/Navigation/Emulation/Performance/Network/Debugging/Memory 分类") |
| Playwright | [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp "官方 caps 表格列出 24 个 core 与可选 browser_* 工具及 target 等参数") |
| Context7 | [upstash/context7](https://github.com/upstash/context7 "官方源码确认仅 resolve-library-id 与 query-docs，get-library-docs 已移除") |
| GitHub | [github/github-mcp-server](https://github.com/github/github-mcp-server "官方 README 自动化区块列出各 toolset 工具名，返回紧凑 JSON 字符串") |
| Brave | [brave/brave-search-mcp-server](https://github.com/brave/brave-search-mcp-server "官方源码确认 8 个工具，web/news 搜索逐条返回单结果 JSON 文本") |
| Tavily | [tavily-ai/tavily-mcp](https://github.com/tavily-ai/tavily-mcp "官方源码 name 为 tavily_search 等下划线形式，返回纯文本报告") |
| Perplexity | [perplexityai/modelcontextprotocol](https://github.com/perplexityai/modelcontextprotocol "官方 registerTool 确认 4 个工具，引用以 Citations 文本块内嵌于 response") |
| Parallel | [parallel-web/search-mcp](https://github.com/parallel-web/search-mcp "官方文档确认仅 web_search 与 web_fetch，参数为 objective/search_queries") |
| SerpApi | [serpapi/serpapi-mcp](https://github.com/serpapi/serpapi-mcp "官方仓库确认 search 主工具，参数在 params 对象内") |
| Kagi | [kagisearch/kagimcp](https://github.com/kagisearch/kagimcp "官方仓库确认仅 kagi_search_fetch 与 kagi_extract") |
| Linkup | [LinkupPlatform/linkup-mcp-server](https://github.com/LinkupPlatform/linkup-mcp-server "官方仓库确认 4 个工具及 depth/mode 参数") |
| SearXNG | [ihor-sokoliuk/mcp-searxng](https://github.com/ihor-sokoliuk/mcp-searxng "官方 docs/tools.md 确认 searxng_ 前缀的 4 个工具") |
| Supabase | [supabase/mcp](https://github.com/supabase/mcp "官方文档按 Database/Debugging/Development/Edge Functions/Account/Branching 分组列出 29 个工具") |
| Postman | [postmanlabs/postman-mcp-server](https://github.com/postmanlabs/postman-mcp-server "官方工具名为 camelCase，旧 kebab-case 已废弃") |
| Linear | [Linear MCP 官方文档](https://linear.app/docs/mcp "官方托管服务未枚举工具名，按规范化操作名渲染") |
| Sentry | [getsentry/sentry-mcp](https://github.com/getsentry/sentry-mcp "官方 TOP_LEVEL_TOOL_NAMES 列出 15 个顶层工具") |
| GitLab | [zereight/gitlab-mcp](https://github.com/zereight/gitlab-mcp "官方工具目录按 MR/Issue/仓库/项目/CI 分组") |
| Docker | [Docker MCP Catalog](https://hub.docker.com/mcp "官方 docker:cli 仅暴露单个 docker(args) 工具，其余为社区服务器") |
| Kubernetes | [containers/kubernetes-mcp-server](https://github.com/containers/kubernetes-mcp-server "官方 toolset 确认 pods_*/nodes_*/resources_* 等命名") |
| Notion | [makenotion/notion-mcp-server](https://github.com/makenotion/notion-mcp-server "官方 v2.0.0 为 22 个工具，content[0].text 为 JSON 字符串") |

不将文档中的全部工具视为当前用户已启用能力；未核实的返回结构不做专属解析，一律回退通用内容渲染。


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

三语词条在原有 83 条 Anysearch/DBX 基础上，本轮补齐 22 个 provider 的**真实**操作名、字段标签、集合名与分组名，共 **1264 条等键**（en / zh-CN / zh-TW，`missing 0 / extra 0`）。已删除与官方工具名不符且不可达的旧词条（如 `sentry-list-issues`、`list-pods`、`perplexity-search` 等）。未知操作以规范化名显示，不会空白。`style.css` 仅在 `.sno************************` 根下补充通用卡片与美化规则（101 条选择器全部限定在该根类下，仅使用宿主主题变量），不改变原 Anysearch/DBX 卡片规则。MIT 来源、版权见 [NOTICE](NOTICE)、[LICENSE](LICENSE)。

## 本轮（0.3.1）改动摘要

本版为宿主兼容性声明对齐，不改动任何卡片渲染逻辑与词条：

- 新增 `market.json`（`{"minAppVersion": "0.4.24"}`），`plugin.json` 同步补 `minAppVersion`；版本升至 `0.3.1`。
- 更正宿主要求说明：插槽**自 `v0.4.24` 起已随正式标签发布**（原文写「尚未随任何正式标签发布」已过时），并补充 `0.4.24` 起 64 项 / 128 前缀上限这一代际差。
- 其余源码、`index.js`、`style.css`、三语词条与 0.3.0 完全一致。

## 0.3.0 改动摘要

- `src/providers.ts`：新增 `collections` 字段（每个 provider 的真实结果集合名），`category` 改用宿主完整 `ToolCategory` 联合类型，使徽章图标贴合语义（GitHub/GitLab→git、Sentry→telemetry、Docker/K8s→terminal、Linear→todo、Notion→outline）。
- `src/summaries.ts`（新增）：按 provider 的真实参数名生成折叠态摘要，SerpApi 自动解包 `params`。
- `src/searchFeeds.ts`：`providerId` 形参**真正生效**——按服务分支抽取 `organic_results`/`news_results`/`suggestions`/`infoboxes`/`failed_results` 等；新增 Brave 逐条单结果 JSON 合并、Tavily 纯文本报告解析、Perplexity `Citations:` 引用拆分，并新增 `sources` 来源清单展示。
- `src/McpToolCall.tsx`：`BrowserView`/`GenericView` 改为使用 provider 各自的集合键列表（不再共用一份硬编码键）。
- `style.css`：新增卡片排版统一与美化（章节标签、药丸指标、来源清单、悬停反馈、等宽数字分页）。
- 词条：三语从 347 条扩至 1264 条，覆盖官方工具名、字段标签、集合名与分组名。

## 发布与验证边界

最低宿主版本 `0.4.24` 已由 `market.json` 与 `plugin.json` 一致声明，但 desktop 真机交互、三语/主题、链接用户激活、图片解码、大结果与各 MCP 服务版本返回格式仍须由配套宿主实际验收。静态构建不等于 UI 验收；不宣称所有 MCP 协议都具备专属字段展示。

独立标签/安装包按 `<slug>/v<version>` 约定，本版本为 `external-tool-renderer/v0.3.1`。开发/文档/词条改动不会自动更新宿主或已安装插件。
