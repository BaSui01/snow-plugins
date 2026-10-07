# Snow Plugins

[![Plugin CI](https://github.com/BaSui01/snow-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/BaSui01/snow-plugins/actions/workflows/ci.yml "查看真实插件静态校验工作流")
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Snow App 插件源码集合。两个插件可分别安装，本仓库不是插件市场索引。

## 插件、版本与下载

| 插件 / ID | 清单版本 | 下载与发行状态 | 最低宿主（基础功能） | 使用说明 |
| --- | --- | --- | --- | --- |
| 提示词优化 / `com.snow.prompt-optimizer` | `1.1.0` | [历史预发行 v1.1.0-preview.1](https://github.com/BaSui01/snow-plugins/releases/tag/v1.1.0-preview.1 "提示词优化的历史预发行安装包") | Snow App `v0.4.16` | [配置与使用](plugins/prompt-optimizer/README.md) |
| 会话文件统计 / `com.snow.session-file-count` | `1.1.2` | [Release session-file-count/v1.1.2](https://github.com/BaSui01/snow-plugins/releases/tag/session-file-count/v1.1.2 "会话文件统计1.1.2安装包与兼容说明") | Snow App `v0.4.16`（统计展示） | [使用说明](plugins/session-file-count/README.md) · [发布说明](plugins/session-file-count/RELEASE.md) |

- 提示词优化：配置优化规则、上下文与模型服务，通过输入栏魔杖改写草稿；支持安全回填和还原，不自动发送。
- 会话文件统计：当前开发源码在每次任务的结束回复下方展示该任务及子代理的独立文件数和清单，旧卡片保留并支持历史恢复；无独立面板。统计不是完整审计，没有记录不等于没有修改。
- 版本、标签和安装包按插件独立管理；历史统一预发行标签不是两个插件当前版本的统一下载入口。

## 安装与更新

1. 从上表选择所需插件的 Release，下载对应压缩包并解压；也可下载或克隆本仓库。
2. 在 Snow App 插件管理页点击「从目录安装」。
3. 选择直接包含 `plugin.json` 的解压目录；从源码安装时分别选择 `plugins/prompt-optimizer` 或 `plugins/session-file-count`，不要选择仓库根目录。
4. 确认插件已启用，并按该插件说明验收功能。

重复安装同一标识会替换已安装副本，并保留启用状态和已保存偏好。修改下载的源码不会自动更新已安装副本，更新时需重新安装相应目录。**安装或更新插件不会更新 Snow App。**

## 宿主兼容性

配套能力通过 [Snow App PR #179](https://github.com/MayDay-wpf/snow-app/pull/179 "两个插件基础能力的配套宿主改动已合并") 合并并进入正式版本 **v0.4.16**；v0.4.15 不包含这些能力。

- 提示词优化的基础功能需要专用优化接口、输入栏动作与安全草稿回填能力。
- 会话文件统计的基础功能需要通用回复插槽及增强文件追踪元数据。
- **Snow App v0.4.16 的 footer 没有 `write` API，不支持修饰键文件导航。** 当前开发源码的普通点击在文件下方内联展开/收起最新记录的 diff，无需 footer diff write 能力；已发布安装包的行为请参阅对应发行说明。
- 当前会话文件统计源码保留 Windows/Linux Ctrl+点击、macOS ⌘+点击打开当前文档，仍需 footer 的受限 `panels.openFile` 动作。配套能力安排为 Snow App `v0.4.17` 新功能，正式版及跨系统 UI 验收尚未完成；市场最低版本仍为 `0.4.16`，不要将基础安装门槛等同于修饰键导航兼容版本。内联 diff 仅展示最新记录快照，非当前文件或累计净差异；此次源码改动未升版或发布。

当前开发源码的独立任务历史另需本次配套宿主构建（含原生任务结束元数据保存与恢复），尚未确认正式发行版本；旧宿主或旧历史缺可靠边界时只提示兼容问题，不展示累计替代统计。源码、版本和已发布安装包应区分，未安装、升版或发布。

## 市场状态

2026-10-07 通过 GitHub CLI 只读核实：[市场 PR #6](https://github.com/MayDay-wpf/snow-plugin-store/pull/6 "历史插件条目请求已合并") 已合并；[市场 PR #8](https://github.com/MayDay-wpf/snow-plugin-store/pull/8 "市场更新请求仍打开待审核") 待审核。市场收录不代表所有宿主功能已经验证；源码仍由本仓库维护，Release 已发布也不等于市场更新已合并。

## 贡献、发布与安全

- [贡献指南](CONTRIBUTING.md)：目录、ID、版本约定、验证要求与协作边界。
- [独立插件发布指南](RELEASING.md)：独立标签、安装包、Release 与市场更新流程；发布需明确授权。
- [安全政策](SECURITY.md)：脱敏报告、凭据泄露处置与私密联系边界。
- [报告问题](https://github.com/BaSui01/snow-plugins/issues/new?template=bug_report.yml "填写插件和宿主版本及脱敏复现资料") · [提出功能建议](https://github.com/BaSui01/snow-plugins/issues/new?template=feature_request.yml "描述需求与宿主兼容性边界")。

## 来源与许可证

源码复制自 `BaSui01/snow-plugin-store` 的提交 `14f6cd398ab871a6c40cfa76940bef40bd8a6ab7` 中两个插件目录。原仓库提交历史保留，本仓库从独立初始化提交开始，未迁入商店的其他文件或历史。

沿用原有 MIT 许可证与版权声明，详见 [LICENSE](LICENSE) 和 [提示词优化许可证](plugins/prompt-optimizer/LICENSE)。
