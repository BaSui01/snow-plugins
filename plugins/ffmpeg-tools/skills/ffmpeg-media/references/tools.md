# 工具速查

`media_*` 只是插件内部的工具标识，不是可直接调用的公开工具名；公开名以 `toolSearch-discover` 结果为准（宿主会加服务器前缀，不要写死）。

## 通用约定

- 输入与输出一律**绝对路径**；输出所在目录必须已存在，插件不创建目录。
- 输出已存在即拒绝，只有显式 `overwrite: true` 才覆盖（`media_run` 例外：`-y/-n` 由调用方在 `args` 里自行给出）。
- 参数以 argv 数组直接传给 ffmpeg，**不经过 shell**；失败时如实返回真实 stderr 摘要。
- **参数归属严格**：每个 operation 只接受自己的参数，用不到的参数会被 `unused-arguments` 拒绝，而不是静默忽略。
- 单次调用时限：清单声明 30 分钟，插件自身在 25 分钟（`FFMPEG_TOOLS_TIMEOUT_MS` 可调）先终止并返回真实超时错误。
- 两遍类操作会真的跑两遍并依据第一遍真实结果定第二遍参数：`media_transcode` 的 `twoPass`、`media_effects` 的 `stabilize` 与 `normalize_audio`、`media_gif` 的 GIF 调色板。
- **默认不联网**：只有 `media_stream` 的 `push`/`record` 与 `media_run` 含网络协议的参数需要显式 `allowNetwork: true`；否则在启动进程前就被拒绝（`network-not-allowed`）。
- 时间参数（`start`/`end`/`duration`/`totalDuration`/`imageDuration`/`delaySeconds` 等标记为「时间」的）都接受秒数或 `HH:MM:SS(.mmm)`。

## 选择表

| 工具 | 什么时候用 | 关键参数 |
| --- | --- | --- |
| `media_env_check` | 任何媒体任务开始前确认 ffmpeg/ffprobe 可用 | 无参数 |
| `media_capabilities` | 不确定本机是否支持某滤镜/编码器/封装/协议时查证 | `kind`（filters/muxers/demuxers/encoders/decoders/protocols/hwaccels/pix_fmts/devices/bitstream_filters）、`query`、`limit`（默认 100，上限 500） |
| `media_probe` | 读真实容器与流信息 | `path`（必填） |
| `media_analyze` | 黑帧/静音/冻结/场景切换/黑边/响度/音频统计（只读，不产出文件） | `input`、`operation`（7 值）、`duration`、`threshold`、`noiseDb`、`limit`、`round` |
| `media_visualize` | 波形图/频谱图/矢量示波器/联系表/代表帧 | `input`、`output`、`operation`（5 值）、`size`、`color`、`mode`、`intervalSeconds`、`count`、`columns`、`rows`、`tileWidth`、`format`、`batches` |
| `media_transcode` | 换格式、压体积、改编码、码率控制、滤镜链、两遍编码 | `input`、`output`、`target`、`videoCodec`、`audioCodec`、`crf`、`preset`、`scale`、`fps`、`videoBitrate`、`audioBitrate`、`maxrate`、`bufsize`、`twoPass`、`videoFilters`、`audioFilters`、`quality`、`hardware` |
| `media_cut` | 截取一段 | `input`、`output`、`start`/`end`/`duration`（至少一个，`duration` 与 `end` 互斥）、`mode`、`crf`、`preset` |
| `media_extract_audio` | 抠出音轨 | `input`、`output`、`codec`（copy/aac/mp3/flac/wav/opus，默认 aac）、`bitrate`、`track` |
| `media_frames` | 封面、指定时间单帧、等间隔 N 帧、按间隔批量截图 | `input`、`mode`（cover/at/count/every，默认 cover）、`time`、`count`、`intervalSeconds`、`output`、`outputDir`、`prefix`、`size`、`format` |
| `media_gif` | 导出 GIF / 动图 WebP | `input`、`output`、`fps`（12）、`width`（480）、`start`、`duration`、`loop`（0=无限）、`maxColors`（256）、`dither` |
| `media_effects` | 稳定、响度归一、降噪、锐化、去隔行、变速、倒放、淡入淡出、模糊、暗角、调色、LUT、色彩空间 | `input`、`output`、`effect`（必填，14 值）+ 该 effect 的专属参数 |
| `media_draw` | 裁剪、补边、旋转、翻转、写字、抠色、去台标 | `input`、`output`、`operation`（必填，7 值）+ 专属参数 |
| `media_subtitles` | 字幕列出/提取/转换/烧录/封装/平移 | `input`、`operation`（必填，6 值）、`output`、`subtitlePath`、`track`、`language`、`title`、`style`、`delaySeconds` |
| `media_metadata` | 标签、章节、封面、流语言与默认/强制标记、旋转、换容器 | `input`、`operation`（必填，8 值）、`output`、`tags`、`track`、`language`、`title`、`defaultFlag`、`forcedFlag`、`coverPath`、`degrees`、`chapters` |
| `media_compose` | 多段拼接、图片序列（可配乐/可运镜）转视频、替换音轨 | `operation`（必填，3 值）、`inputs`、`video`、`audio`、`output`、`fps`、`size`、`mode`、`totalDuration`、`imageDuration`、`effect`、`effectStrength`、`fit`、`hardware`、`preset` |
| `media_layers` | 图层叠加/水印、多画面拼版、背景音乐与 ducking | `operation`（必填，3 值）、`output`、`video`、`overlay`、`position`、`margin`、`x`、`y`、`overlayScale`、`opacity`、`inputs`、`layout`、`columns`、`size`、`audio`、`mode`、`musicVolume`、`originalVolume`、`audioBitrate` |
| `media_stream` | HLS/DASH 打包分片、RTMP 等推流、录制 URL 源 | `operation`（必填，4 值）、`input`、`output`、`outputDir`、`url`、`segmentSeconds`、`playlistName`、`durationSeconds`、`videoBitrate`、`audioBitrate`、`allowNetwork` |
| `media_capture` | 录屏/录窗口/摄像头/麦克风、列出设备 | `operation`（必填，5 值）、`output`、`durationSeconds`、`fps`、`size`、`offsetX`、`offsetY`、`windowTitle`、`videoDevice`、`audioDevice`、`deviceIndex` |
| `media_run` | 上面都不覆盖的长尾能力（任意滤镜/封装/协议） | `args`（必填 argv 数组）、`binary`（ffmpeg/ffprobe）、`timeoutMs`、`allowNetwork`、`expectOutput` |

## 分工具要点

### media_capabilities

- 不传参数：返回各能力族的名称数量、硬件加速方法与协议。
- `{ kind, query }`：在某一族内按名筛选；只有 `{ query }` 时跨族搜索（filters/encoders/decoders/muxers/demuxers/protocols/bitstream_filters，各族最多 25 条）。

### media_analyze

- `operation`：`black_frames`、`silence`、`freeze`、`scene_changes`、`black_bars`、`loudness`、`audio_stats`。
- 各 operation 的默认阈值：黑帧 0.1 秒 / 像素阈值 0.1；静音 -30 dB 且 0.5 秒；冻结 -60 dB 且 2 秒；场景切换阈值 10；黑边 limit 24 / round 2。只读，不写文件。

### media_transcode

- `target` 缺省按输出扩展名判断；视频默认 H.264 + CRF 23 + preset medium；`scale` 形如 `1280:-2`。
- `twoPass` 需要 `videoBitrate`；`hardware`（nvenc/qsv/amf/videotoolbox）本机不存在时直接报错，不静默回退软件编码。
- `videoFilters` / `audioFilters` 追加在 scale 之后，按顺序 join 成单条 `-vf` / `-af`。

### media_cut

- 缺省 `mode: "copy"`（不重编码、快，起点可能对齐关键帧）；需要精确起点用 `mode: "reencode"`。

### media_frames

- `cover`（默认，视频取 0.5 秒，静图/极短片段取首帧）与 `at` 写单个文件（`output`）；`count` / `every` 写进已存在的目录（`outputDir` + `prefix`）。

### media_gif

- 按输出扩展名分派：`.gif` 走两遍调色板（`maxColors` + `dither`），`.webp` 走动图 WebP。

### media_effects

- 每个 effect 只用自己的参数：`stabilize`（smoothing 10 / shakiness 5 / accuracy 9 / crop black|keep）、`normalize_audio`（targetI -16 / targetTP -1.5 / targetLRA 11）、`denoise`（spatial 4 / chroma 3 / temporal 6）、`denoise_audio`（noiseFloor -30）、`sharpen`（amount 1 / size 5，须为奇数）、`deinterlace`（mode auto|frame|field）、`speed`（factor **必填**，keepAudio 默认 true）、`reverse`（audioOnly 默认 false）、`fade`（inSeconds / outSeconds，两者都为 0 会被拒绝）、`blur`（sigma 5）、`vignette`（angle 0.628）、`color`（brightness/contrast/saturation/gamma，至少给一个）、`lut3d`（lutPath **必填**，interpolation 默认 tetrahedral）、`colorspace`（to 默认 bt709，range tv|pc，tonemap 开关）。

### media_draw

- `operation`：`crop`、`pad`、`rotate`、`flip`、`text`、`chromakey`、`delogo`。
- `crop`/`pad`/`delogo` 需要 `width`/`height`；`x`/`y` 省略时 crop 居中、pad 居中，delogo 必须给；`rotate` 的 90/180/270 用 transpose，其它角度用 rotate 滤镜。
- `text` 需要 `text`；本机 fontconfig 缺少默认配置，**请显式给 `fontFile`**；`chromakey` 需要 `color`，`key` 默认 colorkey（RGB），也可选 chromakey（YUV）。

### media_subtitles

- `operation`：`list`、`extract`、`convert`、`burn`、`mux`、`offset`。
- `output` 在 `extract` / `burn` / `mux` / `offset` 下**必填**；`list` 不需要，`convert` 由输出扩展名决定目标编码（`.srt`/`.vtt`/`.ass`/`.ssa`）。
- `burn` / `mux` 需要 `subtitlePath`（内嵌字幕先用 `extract` 导出）；`burn` 走 `-vf subtitles=...`（`.ass`/`.ssa` 且无 `style` 时用 `ass=`），`style` 是原样 `force_style` 文本；`mux` 按容器选字幕编码（mp4/mov→mov_text，mkv→copy，webm→webvtt），可用 `language`/`title` 标注新流。
- `offset` 需要 `delaySeconds`（可为负，推到 0 之前会被夹到 0）。
- 位图字幕（dvd_subtitle / hdmv_pgs_subtitle / dvb_subtitle / xsub）会被明确拒绝，提示改用 `burn` 或先 OCR。

### media_metadata

- `operation`：`read`、`write_tags`、`strip`、`remux`、`attach_cover`、`set_stream`、`set_chapters`、`set_rotation`。
- 除 `read` 外 `output` 必填；全部写操作都是 `-map 0 -c copy` 重写容器，**不重编码**。
- `write_tags` 需要 `tags`；`strip` 用 `-map_metadata -1`（章节仍在）；`attach_cover` 需要 `coverPath`（jpg/jpeg/png，mp4/mov 走 attached_pic，mkv/webm 走附件 + mimetype）；`set_stream` 需要 `track`，可给 `language`/`title`/`defaultFlag`/`forcedFlag`；`set_chapters` 需要 `chapters`（`{ startSeconds, title }`，按起点排序，每章结束即下一章起点，末章 +1 秒）；`set_rotation` 需要 `degrees`（0/90/180/270），mp4/mov 用 `-display_rotation`，其它容器写 matroska rotate 标签。

### media_compose

- `operation`：`concat`（`inputs` ≥ 1，直接拼接，混用有声/无声输入会拒绝）、`images_to_video`（`inputs` 图片序列，可配 `audio`）、`replace_audio`（`video` + `audio`，`mode` 默认 copy）。
- 幻灯片：一旦给了 `totalDuration` / `imageDuration` / `audio` / `fit` / `effect` 任一项就走运镜幻灯片路径，否则是一图一帧的普通序列；`totalDuration` 优先级高于 `imageDuration` 与音频时长；都不给且无音频时每图 5 秒。`effectStrength` 默认 0.15，`fit` 默认 cover。

### media_layers

- `operation`：`overlay`（`video` 底 + `overlay` 图/视频，`position` 默认 bottom-right，`margin` 默认 16，`position: custom` 时必须给 `x`/`y`，`opacity` 0<x≤1）、`stack`（`inputs` ≥ 2，`layout` hstack|vstack|grid，grid 用 `columns` 默认 2，`size` 是每格尺寸；**音轨会被丢弃并在结果里如实回报**）、`mix_audio`（`video` + `audio`，`mode` mix|replace|duck，`musicVolume` 0.3 / `originalVolume` 1，duck 用 sidechaincompress 侧链压缩）。

### media_stream

- `operation`：`hls_package`、`dash_package`（都要已存在的 `outputDir`，`segmentSeconds` 默认 6，`playlistName` 默认 index.m3u8）、`push`（`input` + `url` + `allowNetwork: true`，支持 rtmp/rtmps/rtmpt/rtmpe/srt/udp/rtp，其它协议拒绝）、`record`（`url` + `output` + `durationSeconds` + `allowNetwork: true`）。
- URL 里的凭据在返回文本中打码；打包产物只报真实写出的分片。

### media_capture

- `operation`：`screen`、`window`、`camera`、`audio`、`list_devices`。
- 录制类必须给 `output` 与 `durationSeconds`（1–3600 秒），会真实采集本机设备，可能触发系统权限提示；`list_devices` 只枚举设备，且拒绝传入录制参数。
- `window` 需要 `windowTitle`；Windows 下 `camera`/`audio` 需要设备名（先用 `list_devices` 查）；`size` 在 Linux 抓屏时必需。本机若无摄像头，`camera` 会以真实 ffmpeg 报错返回。

### media_run

- `args` 是完整的、紧跟二进制之后的参数数组（如 `["-i", in, "-vf", "hflip", out]`）；`binary` 默认 ffmpeg。
- 任何一个参数里出现网络协议前缀（rtmp/srt/udp/http/ftp/tcp/… ）时都必须 `allowNetwork: true`；`-y/-n` 等覆盖策略由调用方自己负责。
- `expectOutput` 给出产物绝对路径时，结果会附带该文件的体积变化，便于确认真的写出了东西。

## GPU 加速

- `media_env_check` 回报 `acceleration`（可用硬件编码器）、`gpuApi`（可用硬件接口）、`gpuArgs`（推荐编码参数）、`gpuNotes`（使用说明）；没有硬件编码器时明确说明只能走 CPU。
- 高层工具：`media_transcode` 与 `media_compose` 传 `hardware: "nvenc" | "qsv" | "amf" | "videotoolbox"`。插件会自动补该厂商的质量开关（nvenc：`-preset p6 -tune hq -rc vbr -cq 20 -b:v 0`；给了 `videoBitrate` 就改用码率控制），请求不可用的厂商直接报 `encoder-unavailable`，不静默回退。
- `media_run`：自行拼 `-c:v h264_nvenc …`；纯转码还可加 `-hwaccel cuda` 让解码也上显卡。
- 边界：`zoompan` / `rotate` / `xfade` 等滤镜仍在 CPU，滤镜越重收益越小；同码率下硬件编码画质略低于 libx264，控体积用 `-b:v`/`-maxrate`。
- 参考实测（RTX 5070 Ti，1080×1440 幻灯片 560 s）：CPU 142 s → NVENC 78–82 s；同码率 PSNR 45.5 dB / SSIM 0.99。

## 产物预览

- 产物最多 3 个在卡片内嵌预览：第一个给播放器/图片，其余为「点一下就播」封面；图片点击用内置浏览器打开原图。宿主 `plugin-media://` 是只读协议、支持 Range，可拖动进度条。
- 其余带 `data-path` 的值（产物、输入、音视频）支持 **Ctrl+点击**：宿主解析为真实文件后，mp4/mp3/m4a/wav/flac/webm 等在内置浏览器播放，图片与 PDF 同样走内置浏览器，其余进右侧文件阅读器。
- 预览依赖宿主 `ui.media`（增量能力）；旧宿主没有该字段时只显示纯路径。协议只读媒体扩展名（音视频与位图，不含 SVG/PDF/HTML），`links.open` 只接受 HTTP(S)；插件不要自己拼 `file://` 导航。

## 常见失败与处理

| 现象 | 含义 | 处理 |
| --- | --- | --- |
| `ffmpeg-not-found` / `ffprobe-not-found` + `guidance` | 本机没有对应二进制 | 把引导原样交给用户；可用 `FFMPEG_PATH`/`FFPROBE_PATH` 或插件目录 `bin/` 指定自备二进制 |
| `output-exists` | 目标文件已存在 | 换输出名；用户明确要求覆盖时才传 `overwrite: true` |
| `path-not-absolute` / `output-dir-missing` / `missing-output` | 路径不合法或该 operation 需要输出却没给 | 给绝对路径并确认输出目录已存在 |
| `unused-arguments` | 该 operation 用不到的参数被传入 | 按上表只传该 operation 的参数，不要复用别的 operation 的字段 |
| `network-not-allowed` | 需要联网但没授权 | 先向用户确认目标地址，再显式传 `allowNetwork: true` |
| `unsupported-push-protocol` | 推流协议不在支持列表内 | 换 rtmp/rtmps/srt/udp/rtp 等支持的协议 |
| `missing-duration` / `invalid-duration` | 录制类没给时长或越界 | 给 1–3600 秒 |
| `bitmap-subtitles-unsupported` | 位图字幕无法转文本 | 改用 `burn` 烧录，或先做 OCR |
| `missing-factor` / `missing-lut` / `missing-color-argument` / `missing-position` / `missing-inputs` | 某个 effect / operation 的必需参数缺失 | 按提示补齐对应参数 |
| `timed-out` | 超过单次调用时限 | 缩短片段、降低分辨率/质量，或分批处理 |
| `ok: false` + stderr 摘要 | ffmpeg 真实报错 | 如实转述关键行，不要改写成成功 |

输出体积与编码器/滤镜可用性取决于本机 ffmpeg 构建；`media_env_check` 与 `media_capabilities` 返回的就是本机真实检测结果。
