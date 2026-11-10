# 0.3.1 — 修复 overlay 滤镜链与 ffmpeg 9 能力清单解析

独立插件 `com.snow.ffmpeg-tools` 版本升至 `0.3.1`。不是宿主更新；不自动安装。

## 本版改动

### 1. `media_layers` 的 overlay 滤镜链
- 未传 `overlayScale` 与 `opacity` 时，叠加输入标签缺少方括号，生成 `[0:v]1:voverlay=…`，ffmpeg 直接报 `No option name near …` 并以 `ffmpeg-failed` 失败。
- 已修正为 `[1:v]`；裸 overlay、带缩放、带透明度三条分支均实测写出产物。

### 2. `media_capabilities` 的能力清单解析
- ffmpeg 9 把 `-muxers` / `-demuxers` 的输出标题从 `File formats` 改为 `Formats`，旧解析未识别，导致各能力族计数塌陷。
- 同时修正三处解析：接受单字符标志列（`-muxers` / `-demuxers` / `-devices` 的行首是 ` E ` 这类单标志）、按裸名解析 `-bsfs`（此前为 `null`）、排除 `D.. = Demuxing supported` 一类图例（此前被当作名字 `=`）。
- 本机 ffmpeg 9.0.2 实测：`muxers 1 → 184`、`demuxers 1 → 367`、`devices 1 → 7`、`bitstream_filters null → 51`；`filters` / `pix_fmts` 各减少 1 条，即原先混入的图例。

### 3. 产物与校验
- `server.js` 由 `src/` 重新构建并随提交更新。
- 插件目录 `npm run build`、`npm run check`（`tsc --noEmit` + 产物一致性）通过。
- 工具名、参数、返回字段与隐私契约均未变化；默认仍不联网、不上传媒体。

## 未包含

- 未新增能力，也未改动宿主侧接口。
- 未在真实 GPU 上复测硬件编码，未在真实网络端点或摄像头设备上复测推流与采集。
