# ADR-0002：`ToolCallNode` 转发 `badgeIcon`，让工具插件为每个工具提供专属徽章图标

- 状态：已实施（宿主源码），尚未进入任何已发布宿主版本
- 日期：2026-11-10
- 涉及仓库：snow-app（宿主）、snow-plugins（插件）

## 背景

`plugins/ffmpeg-tools` 的 `tool-call` 渲染器用宿主提供的 `api.ui.ToolCallNode` 绘制卡片。
卡片头部由宿主拼装，顺序是：状态点 → 插件来源（`PluginIcon` + 插件名）→ `ToolNameBadge`
（工具名 + 图标）→ `/` → 工具自报的 `displayName`。

两个缺口都会让用户看到「没有图标」：

1. **插件来源图标依赖工具归属索引。** `ToolCallNode` 通过 `usePluginToolOwner(toolName)`
   反查归属（`pluginToolIndex.ts`），而该索引只在首次订阅时 `listPluginTools()` 加载一次；
   插件重装、工具在索引加载后才被发现时，索引里查不到该工具 → 不渲染插件图标与名称。
   卡片本身是插件自己绘制的，它知道自己的 `pluginId`（`PluginToolCallApi.id`），
   而 `ToolCallNode` 早已提供 `sourcePluginId`（原语义：已确认的插件归属），插件却无法
   单方面让来源块生效以外的任何内容改变 —— 这一项由插件传 `sourcePluginId` 即可修复，无需宿主改动。
2. **工具徽章只能显示通用图标。** `ToolNameBadge` 的 props 里有 `icon?: ReactNode`
   （注释写明「自定义图标节点（插件图标等），优先于 category」），但 `ToolCallNode` 只转发
   `badgeName` 与 `category`，不转发 `icon`。于是 `category` 缺省为 `generic` 时，
   19 个媒体工具在徽章上全部显示同一个 `Plug` 图标。
   插件若把专属图标塞进 `displayName`，图标会落在 `/` 之后的文件名区域，语义上属于「文件」
   而不是「工具」，并且在没有 `displayName`（失败、无产物）的调用上完全消失。

插件侧缺口证据（本仓库 `plugins/ffmpeg-tools/src/renderer/index.ts`）：
- 19 个工具已各自映射到宿主 lucide 命名空间中的图标名（`ICON_BY_TOOL`），并且在宿主安装的
  lucide-react 1.28.0 类型声明中逐一核对存在；
- 当前只能把图标拼进 `displayName` 的 `<span>`；失败或无路径的调用没有图标位。

## 决策

在 `ToolCallNode` 上新增**可选**属性 `badgeIcon?: ReactNode`，原样转发给
`<ToolNameBadge icon={badgeIcon}>`。

- 语义：插件为该工具自选的徽章图标节点；不传时行为完全不变（仍按 `category` 取图标）。
- 边界：宿主不解释、不校验该节点，不引入新的 IPC、preload 或持久化契约；
  `ToolNameBadge` 的既有 `icon` 分支即为落点，宿主只补一层转发。
- 插件消费策略（ffmpeg-tools）：图标节点用 `api.ui.icon(name)` 取宿主 lucide 组件，
  `size=10`、复用宿主类名 `tool-call-tool-name-icon`；同时把 `sourcePluginId: api.id`
  传给 `ToolCallNode`，让插件来源块不再依赖可能过期的归属索引；
  `displayName` 回归纯文件名，不再承载工具图标。

## 备选方案

1. **只让插件传 `category`**：类别只有 read/edit/search/terminal/web 等粗粒度枚举，
   19 个媒体工具会退化成几枚重复图标，且语义错误（裁剪与转码不该同图标）。否决。
2. **插件把图标继续拼进 `displayName`**：图标位置在文件名区，失败调用无图标位，
   与「工具图标」语义不符。否决。
3. **宿主按工具名自动推断图标**：宿主无法知道插件业务的图标语义，且等于在宿主内复制
   插件的工具清单。否决。
4. **宿主在归属索引缺失时用插件服务器名模糊匹配**：`listPluginTools()` 的 `publicServerName`
   由宿主派生、可能变化，模糊匹配会误归属。否决（归属仍以 `sourcePluginId` 为准）。

## 影响与后果

- 向后兼容：新增可选 prop；不传 `badgeIcon` 的插件/内置工具渲染不变。
- 宿主改动仅 `ToolCallNode.tsx` 一处 props 与一处转发，无 IPC / 分层 / 存储变更。
- 验证边界：宿主 `npm run check`（tsc + cargo check）与插件 `npm run check`、
  `python scripts/release.py validate` 静态校验；不代表已发布宿主版本支持，也不含真实 UI 验收。
