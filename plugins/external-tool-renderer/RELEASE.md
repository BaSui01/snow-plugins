# 0.1.0 — 桌面外部工具渲染 P0（未发布）

独立插件 `com.snow.external-tool-renderer`，不是宿主版本更新，不自动安装。

## 本轮迁移

从 Snow App 原桌面 Anysearch/DBX TSX 组件完整复制协议解析和卡片结构，改为每卡 API Provider。同步导出 `renderAnysearch(api, context)` / `renderDbx(api, context)`，前缀贡献各优先级 10。React、图标、ToolCallNode、DataTableViewer 与通用错误展示由宿主提供，不重复打包。链接动作仅走受限 `api.links.open`。

独立三语词条各 83 个（等键），完整保留 Anysearch/DBX 卡片与工具名词条；通用词条仍 fallback 宿主。32 个专属 CSS 选择器限定在插件根类，保持宿主主题变量，通用 websearch/UI 样式不迁移。MIT 来源许可证和声明保留。

## 兼容性不是版本号承诺

当前宿主 **0.4.23 源码已配套**，但**正式版 0.4.23 不含新工具渲染插槽**。必须使用提供 `ui.toolCallRendererVersion === 1` 的配套桌面构建；`minAppVersion` 不能保证这个能力，本开发清单不伪造正式最低版本。旧宿主无新贡献能力时插件不会提供专属卡片；v1 工厂对不兼容 API 返回 null，fallback 由宿主决定。

mobile 本轮未迁移，保留旧实现；不能宣称两端迁移完成。桌面真实安装、链接操作、三语/主题、执行状态、长表与异常格式交互尚待配套宿主验收；静态构建不代替 UI 验收。

## 开发与发布边界

`npm ci && npm run check` 不依赖相邻仓库，check 是类型检查与生产生成物一致性验证；`npm run build` 生成单文件 `index.js`。仓库现有 `python scripts/release.py validate` 校验默认入口及 toolCallRenderers 资源。CI 增加此插件独立 npm ci/check。现有发布排除开发文件，无新增测试或临时测试脚本。

本轮未 Git 提交/推送、未发布/更新市场、未安装 App 插件、未覆盖用户配置、未改其他插件版本。宿主源码迁移/清理与完整 host build 由主代理统一处理。
