# Snow Plugins

Snow App 插件源码集合。两个插件共享源码仓库，分别安装与打包；本仓库不是插件市场索引。

## 插件

| 插件 | 源码目录 | 插件标识 |
| --- | --- | --- |
| 提示词优化 | `plugins/prompt-optimizer` | `com.snow.prompt-optimizer` |
| 会话文件统计 | `plugins/session-file-count` | `com.snow.session-file-count` |

提示词优化提供配置面板与输入栏优化动作，支持已配置服务及模型选择、安全回填与还原。会话文件统计在回复下方展示已记录文件数量和清单，不提供独立面板。

## 本地安装

分别选择包含 `plugin.json` 的插件目录，不要选择仓库根目录。

```text
config-set scope=plugins key=com.snow.prompt-optimizer
value={"sourceDir":"D:/code/snow-plugins/plugins/prompt-optimizer"}

config-set scope=plugins key=com.snow.session-file-count
value={"sourceDir":"D:/code/snow-plugins/plugins/session-file-count"}
```

重复安装同一标识会替换已安装副本，保留启用状态和插件保存偏好。源码更新不等于运行中的插件已重新加载。

## 宿主要求

需要支持专用优化接口、草稿令牌动作、通用回复插槽与文件追踪元数据的 Snow App。请查看各插件说明，不能仅凭相同宿主版本号判断能力是否已具备。配套宿主改动正在 [拉取请求 179](https://github.com/MayDay-wpf/snow-app/pull/179) 中审阅。

## 校验

```bash
npm --prefix plugins/prompt-optimizer run check
node --input-type=module --check < plugins/session-file-count/footer.js
node --input-type=module --check < plugins/session-file-count/index.js
```

这些命令仅检查语法，不代表桌面端或真实模型请求验收。

## 发布与市场上架

同一次发行可以包含两个独立压缩包。每个压缩包只包含对应插件，`plugin.json` 位于压缩包根目录。分别计算最终发行资产的校验值，再向商店仓库提交两个 `app/plugins/<插件标识>.json` 条目。本仓库初始化不发布资产，也未完成市场上架。

## 来源与许可证

源码复制自 `BaSui01/snow-plugin-store` 的提交 `14f6cd398ab871a6c40cfa76940bef40bd8a6ab7` 中两个插件目录。原仓库提交历史保留，新仓库从独立初始化提交开始，并未迁入商店的其他文件或历史。

沿用原有 MIT 许可证及版权声明，详见根目录和插件目录中的许可证文件。
