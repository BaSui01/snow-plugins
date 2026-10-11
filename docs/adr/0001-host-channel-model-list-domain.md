# ADR-0001：宿主新增 `apiModels` 元数据域，向插件暴露渠道全量模型清单

- 状态：已实施（宿主源码），尚未进入任何已发布宿主版本
- 日期：2026-10-11
- 涉及仓库：snow-app（宿主）、snow-plugins（插件）

## 背景

提示词优化插件（`plugins/prompt-optimizer`）的模型下拉此前只能读取 `apiProfiles`
元数据域返回的 `basicModel` 与 `advancedModel` 两个配置字段（见 `src/profiles.ts`），
无法列出所选服务渠道实际提供的全部模型，用户无法选择这两个字段之外的渠道模型。

宿主本身已具备从渠道拉取全量模型的能力：渲染层 `window.snow.fetchAvailableModelsForConfig`
→ IPC `api-models:fetch-for-config`（`src/main/ipc/handlers/apiConfigHandlers.ts`）
→ 原生 `fetch_available_models_for_config`（`native/src/api/models.rs`，覆盖 OpenAI 兼容
`/v1/models`、Gemini、Anthropic 与 OAuth 订阅渠道）。该能力此前只服务于宿主自身的
模型选择器（输入栏、子代理、工作流、定时任务面板），未向插件暴露。

插件侧缺口证据：
- 插件拿不到 API Key（`apiProfiles` 域按字段剥离 `apiKey`/`visionApiKey`），
  无法自行请求 `/v1/models`；
- 插件可用的 `api.net.fetch` 不携带宿主档案凭据、代理与 OAuth 逻辑，
  用其拼装模型清单会重复实现宿主能力并诱导插件持有密钥。

## 决策

在宿主插件元数据域中新增只读域 `apiModels`：

- 参数：`profileName`（必填语义；为空或找不到档案时整个域返回 `null`，不静默回退其他档案）。
- 返回：`{ profileName, models: string[] | null }`。`models` 为按 id 排序的模型 ID 列表；
  拉取失败（网络 / 凭据 / 超时）为 `null`。只返回模型 ID，不返回任何密钥。
- 隐私：无需声明（返回数据不含密钥；与 `apiProfiles` 的字段级剥离策略一致）。
- 实现：渲染层 collector 用宿主已保存的档案配置调用既有
  `window.snow.fetchAvailableModelsForConfig`，不新增 IPC、不改 preload 契约。
- 行为边界：仅当调用方显式传入 `profileName` 时才发起网络请求；
  `api.metadata.get([])`（请求全部域）不会触发拉取。

插件消费策略（提示词优化）：

- 面板在打开 / 切换服务 / 点击「重新读取服务」时读取该域，下拉展示
  「已配置基础/高级模型 ∪ 渠道清单」去重集合；
- 渠道清单读取失败、为空或宿主不支持该域时，回退为仅显示已配置模型并给出状态提示，
  不阻塞保存；
- 执行前校验：所选模型不在非空渠道清单内时报「模型已失效」；
  清单不可读或为空时不拦截，交由服务端判定。

## 备选方案

1. **插件通过 `api.net.fetch` 自行请求渠道 `/v1/models`**：需要插件持有 API Key、
   重复实现代理 / OAuth / 各协议端点逻辑，且与宿主隐私边界冲突。否决。
2. **向插件暴露 API Key，复用现有 IPC**：泄露密钥。否决。
3. **在 `apiProfiles` 域内附带模型清单**：该域是数据库读取、无网络请求；混入网络拉取会
   使每次档案读取都产生副作用，且无法区分「档案字段」与「实时渠道结果」。否决。

## 影响与后果

- 插件元数据域数量 34 → 35（宿主中英文档、脚本与 config 工具描述同步更新）。
- 元数据读取首次可能触发一次向服务商的出站请求（仅模型列表，不发送任何草稿或上下文）；
  文档与插件隐私说明如实披露。
- 向后兼容：旧宿主无该域时插件自动降级；宿主侧无 IPC / 分层变更。
- 验证边界：本改动经宿主 `npm run check`（tsc + cargo check）与文档检查、
  插件 `npm run check` 与 `python scripts/release.py validate` 静态校验；
  不代表已发布宿主版本支持或真实 UI / 网络失败路径验收。
