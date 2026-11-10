# ADR-0003：工具卡插件上下文增加 `startedAt`，让运行态卡片显示真实耗时

- 状态：已实施（宿主源码），尚未进入任何已发布宿主版本
- 日期：2026-11-10
- 涉及仓库：snow-app（宿主）、snow-plugins（插件）

## 背景

`plugins/ffmpeg-tools` 的 `tool-call` 渲染器在工具运行期间只能显示一行「处理中」：
转码、录屏、推流这类调用可能持续数十秒到数十分钟，用户看不到任何时间信息。

宿主 `ToolCallInfo` 已经有 `startedAt?: number`（`conversationTypes.ts`：
「Epoch milliseconds when the tool transitioned to "running"」，Bash 卡片用它渲染超时倒计时），
`toolExecution.ts` 在调用进入运行态时写入 `Date.now()`。但 `PluginToolCallContext.toolCall`
没有把这个字段交给插件渲染器（`pluginToolCall.tsx` 只传了 name / originalToolName /
arguments / interactionId / status / result / streamingStdout / streamingStderr）。

插件侧缺口证据：渲染器拿不到任何时间基准，只能自己记录「组件挂载时刻」，
而卡片可能在调用进行到一半时才挂载（切换会话、消息重放），据此显示耗时会失真。

## 决策

在 `PluginToolCallContext.toolCall` 上新增**可选**字段 `startedAt?: number`，
由 `PluginToolCall.tsx` 直接透传 `toolCall.startedAt`。

- 语义：调用进入 running 的宿主时间戳（epoch ms）；缺省（历史消息、非运行态）时不传。
- 边界：只读时间戳，不含任何标识或内容；不新增 IPC / preload / 持久化契约；
  旧插件忽略未知字段，渲染不变。
- 插件消费策略（ffmpeg-tools）：运行态卡片以 `Date.now() - startedAt` 每秒刷新显示
  「已用 Ns」；**只有当调用参数本身给出了总时长**（`media_capture` / `media_stream record`
  的 `durationSeconds`）才显示确定进度条，其余情况只显示耗时、不画进度条，
  避免用编造的百分比冒充进度。

## 备选方案

1. **插件用组件挂载时间当起点**：卡片晚挂载时耗时不真实（可能少算数十秒）。否决。
2. **插件自行调用 `Date.now()` 并假定调用刚开始**：同上，且无法区分 pending / running。否决。
3. **宿主把开始时间做成新的元数据域**：需要一次 IPC 往返，且与「卡片已有上下文」重复。否决。
4. **插件按 `streamingStderr` 里 ffmpeg 的 `time=` 推算进度**：MCP 工具调用目前不会把
   子进程输出流式送到宿主（`streamingStdout/Stderr` 只在内置工具的执行链路上填充），
   该数据源对插件不可用；且并非每次调用都有可解析的进度行。否决。

## 影响与后果

- 向后兼容：可选字段，旧插件不受影响。
- 宿主改动：`pluginToolCall.tsx` 的类型 + `PluginToolCall.tsx` 的上下文构造各一行。
- 验证边界：宿主 `npm run check`（tsc + cargo check）与插件 `npm run check`、
  `python scripts/release.py validate` 静态校验；运行态卡片的渲染用真实 payload
  驱动构建产物核对元素树，未做浏览器端到端验收。
