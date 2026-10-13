# 外部工具渲染（桌面 P0）

- ID：`com.snow.external-tool-renderer`
- 独立版本：`0.1.0`，**开发版本，尚未发布；本轮未自动安装插件**。
- 目录：`plugins/external-tool-renderer`（直接包含 `plugin.json`），不能安装仓库根目录。

## 宿主要求与范围

当前 Snow App **0.4.23 源码已配套** `contributions.toolCallRenderers` 与受限的桌面 v1 工具卡片 API；**正式版 0.4.23 不包含新插槽**。源码版本号不保证安装包能力，`minAppVersion` 也不是能力保证，因此此开发清单不填写未经正式验证的最低版本。只有提供 `api.ui.toolCallRendererVersion === 1` 的配套构建才能渲染。工厂对非 v1、已中止 API、非匹配工具或 React 实例不一致返回 `null`，其他上下文失效由宿主受限 API 校验和 fallback 处理。

本轮仅迁移**桌面**当前 Anysearch、DBX；mobile 未迁移，保持旧实现，**不是两端已完成**。其他外部 MCP 不在范围内，未来的新协议需在插件侧适配。卡片无独立面板，无常驻后台任务。

## 功能

- Anysearch：兼容 `anysearch-` / `anysearch_`，归一化操作名；保留网页检索、批量分组、JSON 正文提取、子领域能力 Markdown 解析、摘要/全文、执行状态和原文 fallback。页面正文以文本展示，不执行 HTML。
- DBX：兼容 `dbx-` / `dbx_`、服务/工具双重前缀、`execute_redis_comman` 原拼写；保留 SQL/Redis 摘要、连接/会话状态、JSON 多格式及 MCP Markdown 表格解析、空表和原文 fallback。新操作保留操作名与通用表格/文本展示，不宣称所有 DBX 新协议都有专属卡片。
- 操作名徽章由插件词条或规范化操作名提供；显式分类为 `web` / `database`，不依赖宿主的 Anysearch/DBX 名表。
- 用户点击链接时才调用 `api.links.open(url, 'browser' | 'external')`；HTTP(S)、用户激活及上下文有效性校验由宿主负责。插件不使用 `window.open`、`window.snow` 或宿主事件总线。

## 独立开发

```sh
cd plugins/external-tool-renderer
npm ci
npm run build
npm run check
# 仓库根目录：
python scripts/release.py validate
```

`npm run check` 是生产校验：`tsc --noEmit` 加内存重建比较 `index.js`，不是新增测试。构建仅需本目录，不需要相邻 Snow App 源码。`index.js` 是单文件 ESM 生成物，不手工修改；Blob URL 入口不能保留相对 import。依赖仅为本地编译开发依赖 `esbuild`、`typescript`、`@types/react`。

`src/runtime.ts` 只捕获 `window.SnowAppPlugin.React` 和 React 常量；**不捕获加载期全局 API**（该 API 会被 abort）。每个同步工厂返回绑定该张卡 API 的 `ApiContext.Provider` 子树，工厂无 hooks/Promise；hooks 只在组件内运行。图标包装组件通过当前卡 API 的 `ui.icon` 获取宿主图标，`ToolCallNode`、`DataTableViewer`、通用 `localizeToolError` 均复用宿主。构建拒绝非 `src/` 输入或运行时 import，避免打包第二份 React/lucide 或引入宿主仓库模块。

## 文案、样式及来源

- 三语 `locales/{en,zh-CN,zh-TW}.json` 各 **83** 条且等键：Anysearch 卡片 30、DBX 卡片 25、Anysearch 工具名 4、DBX 工具名 24。完整复制原值，不覆盖宿主全局字典；公共词条通过 `api.t` 的宿主 fallback 解析。以后只修改插件专属词条。
- `style.css` 完整迁移 Anysearch 专属分组/能力清单，以及 DBX 命令、表格、空结果、meta 等全部 **32** 个专属选择器；加 `.snow-external-tool-renderer` 根作用域，避免改变宿主其他卡片。继续复用宿主 `tool-call-websearch-*` 与通用 UI 样式。DBX shared meta 被宿主 AppLogs 复用，宿主仍需保留其共享样式。
- 颜色、边框、字体和圆角继续使用已核实存在于宿主 `themes/tokens.css` 的主题变量，无新增硬编码颜色。
- 迁移来源、MIT 版权见 [NOTICE](NOTICE)、[LICENSE](LICENSE)。原实现的解析边界仍保留；未知格式需实际 UI 验收，不把静态校验等同端到端通过。

## 隐私与发布

清单强制 `esm` 和 `privacy.scopes: ['messages']`。仅当前工具快照只读（名称、参数、状态、结果、流式输出），不主动读取其他消息、不调用工具或数据库、不修改数据、不持久化、不主动联网。结果本身可能含敏感信息，分享截图前须脱敏。ESM 属可信本地代码，**不等于隔离沙箱**。

独立标签/安装包按 `external-tool-renderer/v0.1.0` 约定；本轮不创建标签、不打包发布、不更新市场、不自动安装。现有 `release.py` 安装包排除 `src/`、`scripts/`、`package*.json`、`tsconfig.json` 和 `node_modules`，保留入口、清单、样式、词条、文档、LICENSE/NOTICE。正式最低宿主版本和桌面交互须后续实际验收后确定。
