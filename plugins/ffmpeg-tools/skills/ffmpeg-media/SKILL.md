---
name: ffmpeg-media
description: 用 FFmpeg 媒体工具处理用户发来的图片、音频与视频：能力查询、探测分析、转码压缩、剪辑、抽帧、提取音轨、拼接与幻灯片、特效调色、裁剪文字、字幕、元数据、动图、打包推流与屏幕采集。只在本机运行，默认不上传。
---

# FFmpeg 媒体工具

任务涉及图片、音频、视频（聊天附件或项目内媒体文件），或需要转码、压缩、剪辑、抽帧、提取音轨、拼接、做幻灯片、调色特效、加字幕、改元数据、导出动图、打包推流、录屏时，使用本插件提供的工具。

先调用 `toolSearch-discover` 搜索本插件能力（例如「ffmpeg 转码」「extract audio」「video frames」「subtitle」），再使用搜索结果返回的完整工具名调用。公开工具名带宿主生成的服务器前缀，可能随插件与服务器配置变化，不要写死或猜测。

## 能力地图

| 需求 | 用哪个工具 |
| --- | --- |
| 确认本机有没有 ffmpeg | `media_env_check` |
| 问本机 ffmpeg 支持什么（滤镜/编码器/封装/协议/硬件加速） | `media_capabilities`（可传 `query` 跨族搜索，如 `drawtext`、`nvenc`、`hls`） |
| 看一个文件的真实流信息 | `media_probe` |
| 检测黑帧/静音/冻结/场景切换/黑边/响度/音频统计 | `media_analyze`（只读，不产出文件） |
| 换格式、压体积、改编码、调码率、两遍编码、叠加滤镜链 | `media_transcode` |
| 截取一段 | `media_cut` |
| 抠出音轨 | `media_extract_audio` |
| 取封面、按时间取帧、等间隔/按间隔批量截图 | `media_frames` |
| 多段拼接、图片序列（可配乐、可运镜）转视频、换音轨 | `media_compose` |
| 叠加图层/水印、多画面拼版、背景音乐与 ducking | `media_layers` |
| 稳定画面、降噪、锐化、去隔行、变速、倒放、淡入淡出、模糊、暗角、调色、LUT、色彩空间 | `media_effects` |
| 裁剪、补边、旋转、翻转、写字、抠色(chromakey)、去台标 | `media_draw` |
| 列出/提取/转换/烧录/封装/平移字幕 | `media_subtitles` |
| 读写标签与章节、剥离元数据、换容器不重编码、加封面、语言/默认/强制标记、旋转元数据 | `media_metadata` |
| 波形图、频谱图、矢量示波器、拼贴联系表、挑代表帧 | `media_visualize` |
| 导出 GIF / 动图 WebP | `media_gif` |
| HLS/DASH 打包分片、RTMP/SRT/RIST/UDP 推流、录制 URL 源 | `media_stream`（推流/录制要显式 `allowNetwork: true`） |
| 录屏/录窗口/摄像头/麦克风、列出本机设备 | `media_capture`（必须给 `durationSeconds`） |
| 上面都不覆盖的长尾（任意滤镜/封装/协议参数） | `media_run`（安全 argv 直通；网络目标要 `allowNetwork: true`） |

## 执行顺序

1. `media_env_check` 确认本机 ffmpeg/ffprobe 可用。不可用时把返回的安装引导交给用户，不要自行下载或安装二进制。
2. 不确定本机是否支持某个滤镜/编码器/协议时，先用 `media_capabilities` 查证，不要凭印象试。
3. `media_probe` 读取真实媒体信息（流、编码、时长、分辨率、码率）后再决定参数，不要凭文件名猜测。
4. 选择具体工具执行；输入与输出都必须是**绝对路径**，输出所在目录必须已存在。
5. 用真实结果回报产物绝对路径；失败时回报工具返回的错误与 stderr 摘要，不要伪造进度或编造成功。

## 约束

- 不覆盖既有文件：目标已存在时工具会拒绝，只有用户明确要求覆盖才传 `overwrite: true`。
- 只处理用户指定或项目内的文件，不扫描无关目录，不批量删除。
- **默认不联网**：只有用户明确要求推流/录制且给出网络地址时才用 `media_stream` 的 `push`/`record` 或 `media_run`，并显式传 `allowNetwork: true`；不主动上传媒体。
- **采集类操作会真实录制屏幕/窗口/麦克风/摄像头**（`media_capture`），必须先得到用户同意，并给定时长；可能触发系统权限提示。
- 两遍类操作（`stabilize`、`normalize_audio`、GIF 调色板）会真的跑两遍并依据第一遍真实输出决定第二遍参数，不要试图用单遍近似替代。
- 精确参数与常见失败见 [工具速查](references/tools.md)；按任务读取，不预先展开全部资料。
- 产物会由卡片内嵌预览（宿主 `ui.media`；旧宿主缺该能力时退回纯路径），其余产物/输入路径可 **Ctrl+点击** 在内置浏览器打开；不要自己拼 `file://` 导航。

## GPU 加速

1. `media_env_check` 的 `acceleration` 有内容时，说明本机可走硬件编码；`gpuArgs` 是推荐参数，`gpuNotes` 是边界说明。
2. 高层工具传 `hardware: "nvenc" | "qsv" | "amf" | "videotoolbox"`（`media_transcode`、`media_compose`）；`media_run` 里直接写 `-c:v h264_nvenc …`。
3. 滤镜（`zoompan`/`rotate`/`xfade` 等）仍在 CPU，只有编码段上显卡；滤镜很重的任务收益有限，别把"用了 GPU"当成一定更快。
4. 请求不可用的厂商会返回 `encoder-unavailable`，不要静默退回软件编码后仍宣称已加速。
