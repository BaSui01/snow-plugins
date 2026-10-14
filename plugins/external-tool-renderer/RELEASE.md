# 0.3.0 — 工具画廊：24 类外部 MCP 全量核对与卡片美化

独立插件 `com.snow.external-tool-renderer` 版本升至 `0.3.0`。不是宿主更新；不自动安装。

## 本版改动

### 1. 以官方工具清单为驱动，做到 100% 操作名覆盖

此前的操作名与结果字段存在大量推测成分，与官方工具名不符（例如 Sentry 实为 `search_issues`/`find_projects` 系列而非 `sentry-list-issues`；K8s 实为 `pods_list`/`pods_log` 而非 `list-pods`；Postman 官方名为 camelCase；Brave 逐条返回单结果 JSON 文本而非数组）。本版先取回 22 个 provider 的**完整**官方工具清单，再以该清单为驱动统计覆盖率：

| Provider | 官方工具数 | 词条覆盖 |
| --- | ---: | ---: |
| GitLab | 275 | 100% |
| GitHub | 96 | 100% |
| Sentry | 76（15 顶层 + 61 catalog） | 100% |
| Playwright | 72 | 100% |
| Chrome DevTools | 59 | 100% |
| Kubernetes | 53 | 100% |
| Postman | 42 | 100% |
| Supabase | 33 | 100% |
| Firecrawl | 30 | 100% |
| Notion | 24 | 100% |
| Linear | 24 | 100% |
| Docker | 19 | 100% |
| Brave / Tavily / Exa / Perplexity / Linkup / SearXNG / Parallel / SerpApi / Kagi / Context7 | 2–8 各 | 100% |
| **合计** | **841** | **841 / 841 = 100%** |

- **首轮实测覆盖率仅 39.5%（332/841）**；此前报告的「765 组合缺失 0」是用插件自身词条反推工具清单的循环验证，不成立。本版改为以官方清单为基准。
- 补齐 509 条操作词条；删除与官方工具名不符且不可达的旧词条（`sentry-list-issues`、`list-pods`、`get-pod-logs`、`get-schemas`、`perplexity-search` 等）。
- 三语词典由 347 条扩至 **1264 条等键**（en / zh-CN / zh-TW，`missing 0 / extra 0`）。
- 标签由完整词元字典（约 500 个词元 + 短语表 + 全操作显式覆盖）组合生成，审计确认**无意外英文残留**；仅保留产品专名（Docker / Helm / Kiali / Gist / Copilot / Pod / Wiki / Dependabot 等）。
- **边界**：该 100% 指**操作名本地化覆盖**，不等于每个工具都有专属结果解析器。

### 2. 形态视图：按「输出长什么样」而不是「是哪个工具」渲染

811 个工具操作的返回，绝大多数落在少数几种视觉形态里。新增 `src/shapes.ts`（内容嗅探）与 `src/ShapeViews.tsx`（6 个视图）：

| 形态 | 触发条件 | 视图 |
| --- | --- | --- |
| 差异 | `diff --git` / `@@` 块 | 文件分组、+/− 着色、增删统计 |
| 目录树 | box-drawing 树或 GitHub `tree[]` JSON | 缩进列表、目录高亮、计数 |
| 日志 | `msgid=`/`reqid=` 行，或时间戳/级别前缀占多数 | 级别着色、级别筛选、分页 |
| 无障碍快照 | Chrome `uid=1_0 Role "name"` / Playwright `- role "name" [ref=eN]` | 缩进树、role 徽章、ref |
| 进度 | `status` 或 `completed/total` | 进度条、指标列表 |
| 检查清单 | `vulnerabilities`/`alerts`/`findings`/`lints` 等数组 ≥2 项 | 级别色标、级别计数 |

**为什么是形态而非一对一工具**：811 个工具里约 35% 是变更/动作（返回 `{"success":true}`），一对一写解析器无收益；真正受益的是约 20 种输出形态。形态嗅探还带来一个额外好处——**未核实 schema 的服务（GitLab / Docker / Linear）同样受益**，且匹配失败时安全回退通用渲染。

**验证**：解析器在官方来源的真实样例上验证（Chrome DevTools 官方 `McpResponse` 快照测试、Playwright 官方无障碍快照、标准 unified diff、GitLab 目录树、pod 日志、Chrome 控制台/网络行），15 项全部通过，其中 **5 项为误报防护**——散文不得被误判为 diff / 日志 / 树 / 清单 / 进度。

### 3. `providerId` 形参真正生效

`src/searchFeeds.ts` 原先接收 `providerId` 却从未使用，注释宣称的「各服务专属字段」实为通用扫描。现按服务分支处理：

- SerpApi / SearXNG / Tavily / Parallel / Linkup / Firecrawl / Brave 各自的真实结果数组键；
- **Brave**：把 `content[]` 中逐条单结果 JSON 文本合并为结果列表；
- **Tavily**：解析 `Answer` + `Title/URL/Content` 纯文本报告；
- **Perplexity**：从回答正文尾部拆出 `Citations:` 引用块，并新增来源链接清单。

### 4. 按 provider 的参数摘要（新增 `src/summaries.ts`）

为 22 个 provider 各维护真实参数名顺序表（GitHub 的 `owner/repo/method`、K8s 的 `namespace/pod/apiVersion/kind`、SerpApi 的 `q/engine/location` 等），SerpApi 的 `params` 自动解包；摘要最多 8 个字段，其余字段仍在参数树中完整可读。

### 5. 集合键按 provider 区分

`src/providers.ts` 新增 `collections` 字段，`BrowserView`/`GenericView` 不再共用一份硬编码键列表（原实现含 `schemas` 等从未存在于任何真实返回中的键）。

### 6. 卡片样式统一与美化

`style.css` 新增 101 条选择器（全部限定在 `.sno************************` 根类下，仅使用宿主主题变量）：章节标签化、摘要与错误左侧色条、药丸状指标、来源清单、结果卡悬停反馈、等宽数字分页。

### 7. 徽章分类贴合语义

`category` 改用宿主完整 `ToolCategory` 联合类型：GitHub/GitLab→git、Sentry→telemetry、Docker/K8s→terminal、Linear→todo、Notion→outline、Postman→workflow、Context7→read。

### 宿主要求与兼容性

- 仍需提供 `ui.toolCallRendererVersion === 1`、共享 `ui.React` 的桌面构建才能渲染。
- 该插槽已随上游 [PR #201](https://github.com/MayDay-wpf/snow-app/pull/201 "插件工具调用渲染插槽贡献已合并") 合并进上游 `main`（提交 `408f1fb2`），但**尚未随任何正式标签发布**：已发布的正式版 `0.4.23` 不含该插槽。
- 插件不更新宿主，不伪造 `minAppVersion`。mobile 未迁移。

### 安全边界

沿用 0.2.x 的边界：新增卡片仅纯文本/受控树，不执行返回 HTML 或脚本；仅用户主动点击、安全 HTTP(S) URL 经 `api.links.open` 打开；合规 MCP inline 图片经签名与编码大小校验后须主动点击才显示，巨大 base64、SVG、resource blob 不全文渲染；敏感键、表单输入、提示词、代码、请求体默认隐藏。没有 metadata/network/write、自动工具执行、轮询、持久化、全局 DOM 或结果日志。可信 ESM 不是安全沙箱。

### 验证

- `npm run build`（esbuild 重建 `index.js`）通过。
- `npm run check`（`tsc --noEmit` 与内存重建比较 `index.js`）通过。
- 根目录 `python scripts/release.py validate` 通过（`Validated 3 plugins`）。
- 脚本化覆盖率验证（以官方工具清单为驱动）：22 个 provider 共 841 个官方工具，词条覆盖 **841/841 = 100%**；三语 1264 条等键；集合键与字段标签缺失 0；非专名英文残留 0。
- 形态解析器验证：15 项全部通过（含 5 项误报防护），样例取自官方来源。
- CSS 作用域验证：158 条选择器全部限定在插件根类下，花括号配平。
- 未新增测试/mock/fixture/临时测试脚本。

实际桌面安装、主题/三语、链接用户激活、图片解码、长列表分页/流式更新及不同 MCP 版本真实格式的端到端验收尚未完成，静态通过不能替代 UI 验收。

## 历史版本

### 0.2.1 — DBX 全量工具卡与图标

#### 本版改动

##### 1. DBX 渲染器补齐到 22 个工具

`src/DbxToolCall.tsx` 原先只覆盖 12 个操作，本版对齐 DBX MCP 0.4.x 的**全部 22 个工具**，新增分支：

`list-databases`、`duplicate-connection`、`list-routines`、`get-routine-source`、`execute-batch`、`salesforce-current-user`、`salesforce-prepare-write`、`salesforce-apply-write`、`peek-messages`、`send-message`

- `execute-batch` 的脚本同时接入与 `execute-query` / `execute-redis-command` 一致的命令行展示。
- 未列入 switch 的未来工具由 `default` 分支回退为操作名摘要 + 通用结果渲染，不会因新增工具而白屏。

##### 2. 敏感字段不进折叠摘要

- `salesforce-prepare-write` 的一次性 `confirm_token` **不进入卡片摘要**，只提示「待确认」；完整原文仍由下方结果区按原文展示。
- `peek-messages` 的 base64 消息体**只统计条数**，不在摘要中展开。

##### 3. 三语词条补齐并等键

- 三语词典补齐至 **347 条等键**（en / zh-CN / zh-TW，`missing 0 / extra 0`，无重复键）。
- 同时覆盖宿主可能暴露的两种公开工具名形式：`dbx-dbx_<tool>`（server 名 + 工具自带前缀）与 `dbx_<tool>`。
- 依据 DBX 二进制实测更正 Redis 工具名拼写：`dbx_execute_redis_command`（旧词条误写为 `dbx_execute_redis_comman`）；源码内旧的短拼写映射保留为兜底。

##### 4. 新增矢量图标

新增 `assets/icon.svg`（数据库柱体 + 外部挂载星标，深蓝渐变底），替换原 `lucide:Blocks` 占位图标。清单 `icon` 指向 `assets/icon.svg`。

##### 5. 显示名与描述改写

- 显示名：`工具画廊` / `Tool Gallery` / `工具畫廊`（原「外部工具渲染 / External Tool Renderer」）。
- 描述改为功能优先文案：先说明提供统一卡片（参数摘要、表格、内容块、错误状态），再说明覆盖 24 类搜索与开发服务，最后给出宿主要求。
- **ID 保持不变**（`com.snow.external-tool-renderer`），不影响已安装记录的更新。

#### 宿主要求与兼容性

- 仍需提供 `ui.toolCallRendererVersion === 1`、共享 `ui.React` 的桌面构建才能渲染。
- 该插槽已随上游 [PR #201](https://github.com/MayDay-wpf/snow-app/pull/201 "插件工具调用渲染插槽贡献已合并") 合并进上游 `main`（提交 `408f1fb2`），但**尚未随任何正式标签发布**：已发布的正式版 `0.4.23` 不含该插槽。
- 插件不更新宿主，不伪造 `minAppVersion`。mobile 未迁移。

#### 安全边界

沿用 0.2.0 的边界：新增卡片仅纯文本/受控树，不执行返回 HTML 或脚本；仅用户主动点击、安全 HTTP(S) URL 经 `api.links.open` 打开；合规 MCP inline 图片经签名与编码大小校验后须主动点击才显示，巨大 base64、SVG、resource blob 不全文渲染；敏感键、表单输入、提示词、代码、请求体默认隐藏。没有 metadata/network/write、自动工具执行、轮询、持久化、全局 DOM 或结果日志。可信 ESM 不是安全沙箱。

#### 验证

- `npm run build`（esbuild 重建 `index.js`）通过。
- `npm run check`（`tsc --noEmit` 与内存重建比较 `index.js`）通过。
- 根目录 `python scripts/release.py validate` 通过（`Validated 3 plugins`）。
- 三语等键与重复键扫描通过（各 347 条）。
- 未新增测试/mock/fixture/临时测试脚本。

实际桌面安装、主题/三语、链接用户激活、图片解码、长列表分页/流式更新及不同 MCP 版本真实格式的端到端验收尚未完成，静态通过不能替代 UI 验收。
