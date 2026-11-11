<p align="left">
  <img src="assets/icon.svg" alt="FFmpeg 媒体工具" width="36" height="36">
</p>

# FFmpeg 媒体工具

`com.snow.ffmpeg-tools` · 版本 `0.3.1` · 最低宿主 未声明 · [Release](https://github.com/BaSui01/snow-plugins/releases/tag/ffmpeg-tools/v0.3.1 "FFmpeg 媒体工具 v0.3.1 安装包") · [返回仓库首页](../../README.md)

`com.snow.ffmpeg-tools` 是 Snow App 的**工具插件**：插件服务器在本机以子进程调用 ffmpeg / ffprobe，把媒体处理能力交给 AI 助手按需检索和调用，并随包提供一个 **Skill** 说明工作流。用户把图片、音频或视频发进对话（附件），或指向项目内的媒体文件，助手即可探测、分析、转码、压缩、剪辑、抽帧、提取音轨、拼接合成、加特效与字幕、改元数据、导出动图、打包分片、推流与录屏。

默认不联网、不上传媒体，也不下载 ffmpeg；只有显式请求推流/录制并传入 `allowNetwork: true` 时才会连接调用方给出的网络地址。

## 前置条件

| 项 | 要求 |
| --- | --- |
| Node.js | 18 或更高（MCP 服务器以 `node server.js` 启动） |
| ffmpeg / ffprobe | 本机可执行；未安装时工具会返回安装引导，不代替用户安装 |

ffmpeg 来源解析顺序（单一实现见 `src/ffmpeg/binary.ts`）：

1. 环境变量 `FFMPEG_PATH` / `FFPROBE_PATH`；
2. 插件安装目录下的 `bin/`（可放便携版，无需改系统 PATH）；
3. 系统 `PATH`（Windows 按 `PATHEXT` 解析 `.exe` 等后缀）。

未安装时的引导示例（工具返回值中的 `guidance`）：

- Windows：`winget install --id Gyan.FFmpeg -e`，或从 gyan.dev 下载构建包并把 `bin` 加入 PATH；
- macOS：`brew install ffmpeg`；
- Linux：`sudo apt install ffmpeg` 或 `sudo dnf install ffmpeg`。

## 安装

1. 下载本插件的 Release 压缩包并解压，或克隆本仓库；
2. 在 Snow App「插件列表 → 工具插件」中选择直接包含 `plugin.json` 的目录（源码安装选 `plugins/ffmpeg-tools`）；
3. 工具插件**默认在所有项目停用**，需在目标项目的「工具插件 / 项目范围」中显式启用（全局开关需打开），助手才会检索到本插件的工具；随包 Skill 同样只在项目启用后加载。

重复安装同一插件标识会替换已安装副本并保留启用状态；源码改动不会自动更新已安装副本。

## 提供的工具

工具公开名由宿主生成为 `<公开服务器名>-<工具名>`，会随插件与服务器配置变化，**不要写死**；用 `toolSearch-discover` 搜索后使用结果中的完整名称。下表为本插件注册的操作标识与用途。

| 操作标识 | 用途 | 只读 |
| --- | --- | --- |
| `media_env_check` | 报告 ffmpeg/ffprobe 是否可用、来源、版本与关键编码器；缺失时给出安装引导 | 是 |
| `media_capabilities` | 查询本机 ffmpeg 构建支持什么：各能力族计数、硬件加速方法与协议，并按名在任一能力族内检索 | 是 |
| `media_probe` | 读取真实容器与流信息（编码、分辨率、帧率、采样率、时长、码率、体积） | 是 |
| `media_analyze` | 只读测量并返回解析后的结论：黑帧、静音、冻结、场景切换、黑边、响度、音频统计 | 是 |
| `media_visualize` | 生成波形图、频谱图、矢量示波器、联系表、代表帧等单张图片 | 否 |
| `media_transcode` | 转码与压缩（视频/音频/图片），支持滤镜链、码率控制、两遍编码与硬件编码器 | 否 |
| `media_cut` | 剪辑片段，默认流复制（快、起点对齐关键帧），可选精确重编码 | 否 |
| `media_extract_audio` | 提取音轨，支持不重编码或转 aac/mp3/flac/wav/opus | 否 |
| `media_frames` | 封面、指定时间单帧、等间隔 N 帧或按间隔批量截图 | 否 |
| `media_gif` | 导出动图 GIF（两遍调色板）或动图 WebP | 否 |
| `media_effects` | 画面稳定、降噪、锐化、去隔行、变速、倒放、淡入淡出、模糊、暗角、调色、LUT、色彩空间 | 否 |
| `media_draw` | 裁剪、补边、旋转、翻转、写字、抠色（chromakey）、去台标 | 否 |
| `media_subtitles` | 列出/提取/转换/烧录/封装/时间平移字幕；位图字幕明确拒绝 | 否 |
| `media_metadata` | 容器元数据：读取、写标签、剥离、换容器不重编码、加封面、流语言与默认/强制标记、章节、旋转 | 否 |
| `media_compose` | 多段拼接、图片序列（可配乐、可运镜）转视频、替换音轨 | 否 |
| `media_layers` | 图层叠加与水印、多画面拼版、背景音乐与 ducking 混音 | 否 |
| `media_stream` | HLS/DASH 打包分片、RTMP/SRT/RIST/UDP 推流、录制 URL 源 | 否 |
| `media_capture` | 录屏/录窗口/摄像头/麦克风，以及列出本机可用设备 | 否 |
| `media_run` | 长尾兜底：按 argv 直通任意 ffmpeg/ffprobe 参数 | 否 |

### GPU 加速

`media_env_check` 会给出本机可用的硬件编码器、可用硬件接口与推荐编码参数；`media_transcode` 与 `media_compose` 传 `hardware: "nvenc" | "qsv" | "amf" | "videotoolbox"` 即可让编码走显卡（插件自动补厂商质量开关，请求不可用的厂商直接报错），`media_run` 可自行拼 `-c:v h264_nvenc …`。

边界：`zoompan` / `rotate` / `xfade` 等滤镜仍在 CPU，滤镜越重收益越小；同码率下硬件编码画质略低于 libx264。本机实测同一条 560 s 幻灯片：CPU 142 s → NVENC 78–82 s，同码率 PSNR 45.5 dB / SSIM 0.99。

### 产物预览

- **卡片内嵌预览**：产物最多显示 3 个——第一个直接给播放器或图片，其余给「点一下就播」封面（视频取首帧）；图片点击在内置浏览器打开原图。即使播放在卡片里，拖动进度条也可用（宿主 `plugin-media://` 只读协议支持 Range）。
- 其余带 `data-path` 的值（产物、输入、音视频）仍支持 **Ctrl+点击**：宿主的路径委托会把本地文件解析后打开——mp4/mp3/m4a/wav/flac/webm 在内置浏览器里直接播放，图片与 PDF 也走内置浏览器，其余文件进右侧文件阅读器。
- 预览是宿主 `ui.media` 的增量能力：旧宿主没有该字段时自动退回纯路径展示；协议只读媒体扩展名（音视频与位图，不含 SVG/PDF/HTML），`links.open` 仍仅 HTTP(S)。

只读列与工具自身声明的 `annotations.readOnlyHint` 一致；标为「否」的工具同样能只做只读操作（如 `media_metadata` 的 `read`、`media_subtitles` 的 `list`、`media_capture` 的 `list_devices`）。

共同约束：

- 输入与输出都必须是**绝对路径**；输出目录必须已存在（工具不会静默创建目录）；
- 输出文件已存在时**拒绝覆盖**，只有显式传 `overwrite: true` 才覆盖；
- 参数以 argv 数组直接传给 ffmpeg，**不经过 shell**；ffmpeg 失败时返回真实 stderr 摘要，不改写为成功；
- 单次调用时限：清单声明 `timeoutMs: 1800000`（30 分钟），插件自身在 25 分钟（可用 `FFMPEG_TOOLS_TIMEOUT_MS` 覆盖）先终止并返回真实超时错误；
- 硬件编码仅在请求且本机编码器真实存在时使用；不可用时直接报错，不静默回退软件编码；
- **需要联网的操作必须先授权**：`media_stream` 的 `push` / `record` 与 `media_run` 传入网络地址时，必须显式传 `allowNetwork: true`，否则在启动进程前就被拒绝；地址里的凭据在返回文本中打码；
- **采集类操作会真实录制本机**：`media_capture` 必须给定 `durationSeconds`，可能触发系统权限提示；`list_devices` 只执行设备枚举，不打开设备；
- 两遍类操作（`twoPass` 转码、画面稳定、响度归一、GIF 调色板）会真的运行两遍 ffmpeg，并依据第一遍的真实输出决定第二遍参数。

工具卡片（`src/renderer/` → `index.js` 的 `tool-call` 渲染器）：

- **默认折叠**；折叠态就是产物文件名加两个关键事实——探测显示「类型 · 分辨率」，处理显示「容器 · 体积」，压缩类场景显示「输入体积 → 产物体积」（体积取自真实磁盘文件，不是估算），打包显示分片数，分析显示命中数。
- 头部三层各司其职：插件来源（宿主 `PluginIcon` + 插件名，由插件显式传 `sourcePluginId`，不依赖会过期的工具归属索引）、工具徽章（`badgeIcon` 传入该工具专属的 lucide 图标 + 本地化工具名）、文件名。19 个图标名逐一对齐宿主安装的 lucide 1.28.0，并在构建产物中校验存在。
- 展开后按「事实网格 + 列表块」平铺：先列本次用到的素材与产物（含真实体积）、耗时，再把工具回报的每个标量字段逐条列出（字段标签来自本插件语言包，`label.<字段>` 未覆盖的字段回退显示原始技术名，绝不隐藏）；列表型数据用宿主表格渲染——媒体/元数据的流表（流/类型/编码/语言/默认/强制）、字幕轨道表、章节表，分片则以「文件名 → 体积」列出。单行事实严格键值成对排布（不会出现标签与值错列）；超长 ffmpeg 日志只保留首 8 行与末 4 行，并用「另 N 行已省略」如实标注。
- 运行态卡片显示**真实耗时**（运行满 1 秒后才出现，亚秒级工具不会闪一下「已用 0s」；超过一分钟按 `1:15` 显示）与**确定进度条**：耗时取宿主 `startedAt`，进度只在调用参数本身给出了总时长（`media_capture` 与 `media_stream record` 的 `durationSeconds`）时计算，`media_cut` 的片段 `duration` 不会被误当成总长，其余情况不画进度条——不编造百分比、不用定时器伪造进度。调用完成后头部改为显示真实 `elapsedMs`。
- 卡片只消费宿主主题令牌，无 Hex、无内联样式；宿主未提供的能力（如复制路径）不做假按钮，预览能力缺失时退回纯文本路径。

## 隐私契约

- `privacy.scopes: ["messages"]` 只服务于调试用的工具调用卡片（渲染当前调用的只读快照）。
- 插件服务器读写**仅限本次调用给出的路径**：读输入文件、写调用方指定的输出文件；临时文件（图片序列清单、两遍编码日志、章节 ffmetadata、drawtext 文本）写在系统临时目录并在调用结束时删除。
- **默认不联网、不上传媒体**：只有 `media_stream` 的 `push`/`record` 与 `media_run` 的网络地址在显式传 `allowNetwork: true` 后才会连接调用方给出的地址；URL 凭据在返回文本里打码。
- 不读取会话正文、不读取密钥、不写应用数据库、不改系统设置，也不代替用户安装 ffmpeg。
- `media_capture` 只在用户要求时真实录制本机屏幕/窗口/摄像头/麦克风，且必须给定时长；`list_devices` 仅做设备枚举。
- 工具结果只包含命令摘要、媒体信息与产物路径，不含媒体内容本身；未安装 ffmpeg 时只返回安装引导。

## 目录结构

```
plugins/ffmpeg-tools/
  plugin.json          清单元数据、mcpServers、工具卡贡献点、内置 Skill 声明
  server.js            MCP 服务器产物（由 src/ 构建，不直接编辑）
  index.js             工具卡渲染产物（由 src/ 构建，不直接编辑）
  src/ffmpeg/          二进制解析、进程调用、能力探测、ffprobe、容器与时间工具
  src/tools/           十九个工具定义与共享校验（含 media_run argv 直通）
  src/renderer/        工具卡渲染入口
  skills/ffmpeg-media/ 内置 Skill 与工具速查
  scripts/build.mjs    单文件打包与产物一致性校验
  style.css            工具卡样式（只消费宿主主题令牌）
  locales/             中英繁文案
```

开发命令（在插件目录内）：

```sh
npm ci
npm run build   # 由 src/ 生成 server.js 与 index.js
npm run check   # tsc --noEmit + 产物与源码一致性校验
```

## 兼容性边界

- 工具插件（`kind: "tool"` + `mcpServers`）、插件内置 `skills` 与 ESM 工具卡插槽均为宿主既有能力；**最低可用的已发布宿主版本尚未验证**，不在此声明。
- 工具徽章的专属图标依赖宿主 `ToolCallNode` 的 `badgeIcon` 属性（宿主**源码已支持**，尚未进入任何已发布宿主版本，见 `docs/adr/0002-tool-call-node-badge-icon.md`）；旧宿主会忽略该属性，卡片自动回退为宿主按类别给出的图标，不报错。`sourcePluginId` 是宿主既有属性。
- 运行态耗时依赖宿主把 `startedAt` 传入插件上下文（宿主**源码已支持**，见 `docs/adr/0003-tool-card-started-at.md`）；旧宿主不传时卡片只显示状态文案，**不会**自己造一个计时。
- 旧宿主若忽略 `kind` / `mcpServers` / `skills`，本插件不会提供工具，也不会报错；`index.js` 与 `server.js` 不依赖相邻宿主仓库即可构建。
- 工具公开名带宿主生成的服务器前缀，可能随插件与服务器配置改变；插件不自称固定名称。

## 未验证项

- 未在真实 Snow App 界面中完成「安装 → 项目启用 → 助手检索 → 调用 → 卡片展示」的端到端人工验收；
- 最小宿主版本未验证，市场条目（`market.json` 的 `minAppVersion`）因此未提供；
- 硬件编码路径只按编码器存在性做前置判定，未在对应 GPU 上验证画质与吞吐；
- `media_stream` 的 `push`/`record` 与 `media_capture` 的各录制路径只验证了参数规划与失败路径，未在真实网络端点或真实设备上完成端到端验收（本机无摄像头，也不主动联网推流）；
- 大体积素材（多 GB）下的内存与耗时表现未验证，两遍类操作的长素材耗时未做压测。

## 0.3.1 改动摘要

- 修复 `media_layers` 的 `overlay` 在未传 `overlayScale` / `opacity` 时叠加输入标签缺少方括号、生成非法滤镜链（ffmpeg 报 `No option name near …`）的问题；现在裸 `overlay` 与带缩放/透明度的分支都可正常输出。
- 修复 `media_capabilities` 的能力清单解析：识别 ffmpeg 9 的 `Formats:` 标题、接受单字符标志列（`-muxers` / `-demuxers` / `-devices`），并按裸名解析 `-bsfs`；`D.. = …` 这类图例不再被当成能力名。本机 ffmpeg 9.0.2 实测由 `muxers 1 / demuxers 1 / bitstream_filters null` 修正为 `184 / 367 / 51`。
- `server.js` 由 `src/` 重新构建，`npm run check` 通过；工具名、参数与返回字段均未变化。

## 许可证

MIT，见 [LICENSE](LICENSE)。
