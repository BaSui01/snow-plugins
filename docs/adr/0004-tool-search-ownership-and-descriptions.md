# ADR-0004：工具搜索列表的归属自愈与 `toolDescriptions` 本地化约定

- 状态：已实施（宿主源码），尚未进入任何已发布宿主版本
- 日期：2026-11-10
- 涉及仓库：snow-app（宿主）、snow-plugins（插件）

## 背景

工具搜索卡片（`toolCalls/ToolSearchToolCall.tsx`）的每一行这样取名字与描述：

- 名字：`usePluginToolOwnerInfo(tool.name)` 反查归属 → 读取插件语言包的
  `toolNames.<清单内原始工具名>`，取不到就回退显示 MCP 公开名 `plugin_com_snow_ff-media_layers`；
- 描述：直接用 MCP 工具返回的 `description`（英文）。

两个缺口：

1. **归属索引只加载一次**（`plugins/pluginToolIndex.ts` 的 `loaded` 标志 + 模块级 `index`）。
   插件重装或插件服务器重启后新增的工具不在索引里 → 该工具永远显示原始短名。
   实测证据：`plugins/ffmpeg-tools` 从 7 个工具扩到 19 个后，搜索列表里
   「拼接与幻灯片」「抽帧与封面」（最初的 7 个）是中文，
   `plugin_com_snow_ff-media_layers`、`…-media_analyze`、`…-media_capabilities` 仍是原始名。
   同一个索引也被工具卡片的「插件来源」块使用（该处已由插件显式传 `sourcePluginId` 绕开）。
2. **描述没有本地化入口**：宿主全仓没有 `toolDescriptions` 的消费方，
   插件即使写了本地化描述也不会被读取。

## 决策

1. **归属索引按需自愈**：保留"首次订阅加载"，但任一次查询未命中时触发一次重读
   （`refreshWhenUnknown()`：有在途请求则跳过，2 秒节流，成功后经既有订阅机制通知所有使用者）。
   不新增 IPC、不新增持久化，索引结构不变。
2. **新增 `toolDescriptions.<清单内原始工具名>` 约定**：搜索行在 `toolNames` 之外再读这一键，
   命中则用它替换 MCP 描述，未命中回退原文。仅影响展示文案。

## 备选方案

1. **每次渲染都整表重读**：IPC 抖动、无意义重复请求。否决。
2. **插件把中文写进 MCP `description`**：宿主英文界面就变成中文，违反 i18n。否决。
3. **新增元数据域返回工具清单**：与既有 `window.snow.listPluginTools()` 重复。否决。
4. **要求插件安装后重启宿主**：把可用性问题丢给用户。否决。

## 影响与后果

- 向后兼容：旧插件没有 `toolDescriptions.*` 时行为不变；索引自愈只多一次只读查询。
- 宿主改动：`pluginToolIndex.ts`（重读函数 + 两处查询钩子）、`ToolSearchToolCall.tsx`
  （描述回退，一处取键 + 一处渲染）。
- 验证边界：宿主 `npm run check`（tsc + cargo check）与插件 `npm run check`、
  `python scripts/release.py validate` 静态校验；搜索列表的真实 UI 未做浏览器端到端验收。
