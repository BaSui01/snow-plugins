# 独立插件发布与市场更新

## 组织规则

一个源码仓库支持多个插件。每个插件放在 `plugins/<slug>/`，直接包含 `plugin.json`，具有独立且唯一的插件 ID、版本、Release 和市场条目。发布脚本自动发现目录，不维护固定插件列表。

目录名使用小写字母、数字和单个连字符，如 `prompt-optimizer`。清单版本采用 `major.minor.patch`；标签采用 `<slug>/v<major.minor.patch>[-prerelease]`，基础版本必须与该插件清单一致。

| 插件 | 正式版标签示例 | 预发行标签示例 |
| --- | --- | --- |
| 提示词优化 | `prompt-optimizer/v1.2.0` | `prompt-optimizer/v1.2.0-preview.1` |
| 会话文件统计 | `session-file-count/v1.1.1` | `session-file-count/v1.1.1-preview.1` |

示例不是已发布版本。另一个插件无需同步升版。历史统一标签 `v1.1.0-preview.1` 保留，但新工作流不再接受统一标签。

## CI 与发布流程

- `Plugin CI`：main 推送、PR、手动运行，自动发现并静态校验全部插件清单、资源、JSON 和 JavaScript。不新增测试。
- `Independent plugin release`：监听 `*/v*`；解析真实标签中的目录名并拒绝不存在的插件、非法标签或清单版本不匹配。也可手动输入已存在的专属标签重试。
- 每次只验证、构建目标插件的内容，上传一个 `<slug>-<version>.zip` 和 `SHA256SUMS.txt`。ZIP 根直接包含 `plugin.json`；缺少独立 LICENSE 时附仓库 MIT LICENSE。
- 预发行只发布安装包，不更新市场；正式版发布完成后准备单个市场条目 PR，维护者审核合并，不自动合并。
- Release 不设置为仓库统一 latest，避免多个插件互相抢占“最新版本”。按对应标签和市场条目下载。
- 已有 Release 不覆盖，重试使用实际下载的资产字节；市场更新还核对 ZIP 内 ID、版本及 SHA-256。
- 市场条目 `app/plugins/<id>.json` 单独更新。已有作者、描述、标签、图标、最低宿主版本等字段保留。下载 URL 对带斜杠的标签编码。不手动编辑 `registry.json`。
- 相同插件的发布 job、市场 job 分别串行；不同插件可并行。相同版本已有 PR 不重复创建、不覆盖分支。同插件有前序未合并自动更新 PR 时，发布脚本自动向旧 PR 留言并将其关闭（Supersede 模式），随后提交最新版本的市场 PR。
- 拒绝市场版本降级；同版本对应不同安装包字节时拒绝更新，要求发布新补丁版本。相同版本相同资产可修正下载标签。
- GitHub concurrency 不是持久发布队列；连续推送多个版本可能替换等待中的运行。不要依赖它逐个处理所有版本，检查 Actions，必要时手动重试。

## 后续添加插件

1. 新建真实插件目录 `plugins/<slug>/`，编写清单、入口、资源、使用说明和许可证。ID 不能与已有插件重复。
2. 完成本地安装验收和宿主兼容性确认；明确隐私声明和最低宿主要求。入口可为 ESM 或 iframe，资源必须在目录内。
3. 运行 `python scripts/release.py validate`。自动发现，无需修改 CI 或脚本列表。
4. 提交插件内容及工作流。获授权后创建并推送 `<slug>/v<version>-preview.1`，先验证预发行。
5. 准备好正式上架后，推送该插件正式标签。若市场条目尚不存在，脚本从发布包生成基础条目：ID、名称、简介、来源仓库、主页、版本、下载资产、哈希与隐私声明；作者及 `minAppVersion` 仅在发布包声明时带入，不猜测版本。
6. 首次上架 PR 中人工核实最低宿主版本、作者、标签、图标等展示资料。自动创建 PR 不等于自动获得上架资格。需要特殊字段或完整市场描述时，在审核中完善，不绕过维护者。

此通用流程适用于当前无需编译的目录插件。若未来插件需要依赖安装、构建或产物白名单，应先补充明确的构建契约，不会自动运行插件 package.json 的任意脚本。

本仓库支持 `plugins/<slug>/market.json` 发布元数据，目前仅允许明确的 `minAppVersion`；该字段从最终发布包读取并用于更新市场最低宿主版本，不是宿主运行时接口。修改前须核实宿主发行依据。`plugins/<slug>/RELEASE.md` 会作为 Release 正文，优先于自动生成的仓库提交说明。

## 凭据与权限

本仓库的 `GITHUB_TOKEN` 用于 Release。市场使用 `MARKET_PR_TOKEN` Secret：推荐限定 `BaSui01/snow-plugin-store` 的 fine-grained PAT，Contents 与 Pull requests 读写；有效权限以云端实际执行为准。不要把 Token 写进源码、日志或聊天。

上游为 `MayDay-wpf/snow-plugin-store`，fork 为 `BaSui01/snow-plugin-store`。从上游 main 建立 `release/<slug>/v<version>` 分支，仅提交对应条目到 fork，不覆盖 fork main、不强推、不自动合并。

## 发布前与失败恢复

- 获得发布授权后再创建和推送标签。正式标签会触发 Release、fork 分支写入和上游 PR 创建。
- 本地可调用生产打包命令，例如 `python scripts/release.py package --tag session-file-count/v1.1.1-preview.1 --output <实际输出目录>`；这里只是调用格式，需提供真实目录且清单版本匹配。
- 未提交修改不会进入云端发布。不要覆盖市场已引用资产，内容变化应升版。
- Release 成功、市场失败：检查凭据或网络异常后，用相同标签手动重试；若存在前序版本 PR，脚本会自动执行关闭与替代。工作流从标签读取源码和打包脚本，已有标签不会自动获得 main 的脚本修改。
- Secret 存在、本机 gh 登录、本地静态检查通过都不代表云端发布或市场 PR 已验证。
- 安装包构建不代替宿主行为验收。市场 PR 合并后用户刷新市场并确认更新，不是静默升级。

## 工作流维护与恢复边界

- Actions 使用核实的 checkout v7.0.1、setup-node v7.0.0、setup-python v7.0.0 完整 SHA；Dependabot 每周检查并分组提交 Actions 更新 PR，不自动合并。不启用 npm/pip 依赖自动更新。
- 固定 `ubuntu-24.04`，job 超时 15 分钟，插件校验仍用 Node 22 和 Python 3.12；Actions 自身为 Node 24 运行时。关闭不需要的自动包缓存与 checkout 持久凭据。
- 普通 CI 和打包提前校验 `market.json`。市场更新拒绝降低已登记最低宿主版本；需要降低时单独人工审核，不能放宽自动门槛。
- 同版本 OPEN PR 直接返回现有链接；MERGED PR 要核对上游实际条目；CLOSED 未合并则明确失败，不当作已上架。
- fork 分支推送成功但 PR 创建失败时，重试先核对分支祖先、仅修改目标条目及 JSON 内容完全一致；一致则复用分支，不强推或覆盖。无法确认祖先、分支混入其他修改或内容不同则停止。
- 历史标签保留当时脚本，重跑旧工作流也保留当时 Actions 版本；main 的升级不能更改历史发布。不要移动已有标签。新版本使用新配置；旧版本恢复失败时先分析明确边界，不修改现有资产。
- 未重新执行的发布写入分支仅有静态验证；main CI 成功不等于完整 Release/市场权限流程重验成功。

## 历史状态

2026-10-07 GitHub CLI 核实市场 PR #6 已合并，两个现有条目指向历史预发行 `v1.1.0-preview.1`，版本均为 `1.1.0`。首次切换新标签若包字节不同，应升补丁版，不能复用旧市场版本覆盖内容。收录不代表宿主兼容性验证。
