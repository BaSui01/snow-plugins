# ADR-0005：工具卡本地媒体预览（`plugin-media://` 协议 + `ui.media` 增量契约）

- 状态：已实施（宿主源码），尚未进入任何已发布宿主版本
- 日期：2026-11-10
- 涉及仓库：snow-app（宿主）、snow-plugins（插件）

## 背景

`plugins/ffmpeg-tools` 渲染的产物（MP4 / WebM / MP3 / WAV / 封面 PNG/JPG）目前只有两种查看方式：

1. 路径单元格由宿主 `[data-path]` 委托处理，但 `usePathClickOpen` 只在按住 Ctrl/Cmd
   时才接管，普通点击不会打开任何东西；
2. Ctrl+点击走 `openBrowserFile()` → 内置浏览器标签页加载 `file://`，能播放，但需要
   离开对话、切到右侧面板，且没有缩略图。

渲染进程现状（源码证据）：

- `src/renderer/index.html` 的 CSP 为 `default-src 'self'; … img-src 'self' data: blob: theme-bg: img-proxy:; … frame-src …`，
  **没有 `media-src`，也不允许 `file:`**。因此 `<video>` / `<audio>` 直接指向
  `file://` 或本地路径一定被 CSP 拦下。
- 宿主已有三个本地协议可参考：`theme-bg://`（`src/main/app/themeBgProtocol.ts`）、
  `img-proxy://`（`src/main/app/imageProxyProtocol.ts`）、`html-preview://`
  （`src/main/app/htmlPreviewProtocol.ts`），均在 `bootstrap.ts` 的 `whenReady`
  之前声明 scheme 特权、在 `whenReady` 中注册 `protocol.handle`。
- 工具卡 API（`src/renderer/plugins/pluginToolCall.tsx`）的 `ui` 只有
  `React / icon / toolCallRendererVersion / ToolCallNode / DataTableViewer / localizeToolError`，
  没有“把本地文件变成可播放 URL”的入口；`links.open` 只放行 `http(s)`。
- 插件侧 `src/renderer/index.ts` 用 `api.ui.toolCallRendererVersion !== 1` 做硬等值判断，
  因此**不能靠提升版本号表达新能力**，否则所有已安装的旧插件卡会立即消失。

## 决策

### 1. 新增 `plugin-media://` 自定义协议（宿主主进程）

- 纯函数模块 `src/renderer/utils/pluginMediaUrl.ts`（与 `themeBgUrl.ts` 同构，不导入
  electron）**单点定义**扩展名 → MIME 表、`pluginMediaKind()`、`pluginMediaUrl()`；
  主进程与渲染进程都从这一处消费，禁止第二份扩展名表。
- `src/main/app/pluginMediaProtocol.ts` 在 `whenReady` 前声明
  `{ standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }`，
  在 `whenReady` 中 `protocol.handle`。
- URL 形如 `plugin-media://localhost/<encodeURIComponent(绝对路径)>`，与 `theme-bg://` 一致。
- 安全边界（只读、最小面）：
  - 只接受**绝对路径**，拒绝含控制字符/空字节的路径，拒绝 UNC 前缀；
  - **扩展名必须命中媒体白名单**（mp4 / m4v / webm / ogv / mp3 / m4a / ogg / oga / opus /
    wav / flac / png / jpg / jpeg / jfif / gif / webp / avif / bmp / ico）；
    不含 `svg`（唯一的“可带活动内容”的图片类型）、不含文本/HTML/JSON/PDF；
  - `stat` 结果必须是普通文件，目录与不存在的文件返回 404；
  - 无写路径、无目录枚举、无任意扩展名回退；越权一律 403。
- **Range 必须支持**：`<video>` 拖动进度条会发 `Range: bytes=…`。处理器用
  `createReadStream(start, end)` + `Readable.toWeb()` 返回 206，并给出
  `Accept-Ranges` / `Content-Range` / `Content-Length`；非法范围返回 416。
  不把整文件读进内存（成片可达数百 MB）。

### 2. CSP 只放开媒体与缩略图

`src/renderer/index.html`：

- `img-src` 追加 `plugin-media:`（图片缩略图、`<video poster>`）；
- 新增 `media-src 'self' blob: plugin-media:`。

`bypassCSP` 保持 `false`，不放开 `file:`，不追加 `*`。

### 3. 工具卡 API 以“只增不改”的方式扩展（`ui.media`）

在 `PluginToolCallApi.ui` 上新增**可选**的 `media`：

```ts
type PluginMediaApi = {
  url(path: string): string | undefined;      // 非媒体/相对路径 → undefined
  open(path: string): boolean;                // 内置浏览器标签页播放；无 MIME 支持 → false
  supports(path: string): "video" | "audio" | "image" | undefined;
  Preview: React.ComponentType<PluginMediaPreviewProps>;
};
```

- `toolCallRendererVersion` **保持 1**：这是契约主版本，新增可选字段不构成破坏性变更；
  插件用 `api.ui.media?.Preview` 探测能力，缺失即沿用旧渲染（当前插件已装旧宿主时不崩）。
- `Preview` 是宿主组件，只接受**本地绝对路径**并在内部转成 `plugin-media://`；
  插件不接触协议拼接逻辑，宿主可以随时更换 scheme。
- `Preview` 行为：
  - `mode="inline"`：`<video controls>` / `<audio controls>` / `<img>`；
  - `mode="thumbnail"`：视频渲染为“封面 + 播放键”的按钮（封面优先用 `poster`，
    否则取 `src#t=0.1` 首帧），点击后切换为内嵌播放器 —— 即“点一下就播”；
    图片渲染为小尺寸缩略图；
  - 音频始终是一行原生控制条（缩略图对音频无意义）；
  - 加载失败返回 `null`，卡片其余内容（路径、大小、“在浏览器中打开”）不受影响。
- `open(path)` 复用既有 `openBrowserFile()`，不新增 IPC、不新增 preload 通道。

### 4. 插件消费策略（ffmpeg-tools）

- `types.ts` 增加 `ui.media?` 的结构副本（宿主类型不参与运行时）。
- `factsBody` 在摘要表格之后插入产物预览：按 `outputs[].path` 去重，最多 3 个；
  第一个 `inline`，其余 `thumbnail`。
- `probeBody` 对探测目标（`arguments.path`）插入同样的预览，用于“先看再处理”。
- 预览标题用插件字典 `label.preview`（三语同步），不向宿主写死中文。

## 备选方案

1. **CSP 放开 `file:`**：等于让渲染进程里的任意内容读本地文件，且 Chromium 对
   `file://` 的媒体加载在打包后路径下不稳定。否决。
2. **把文件读成 Blob URL**：需要经 preload 传数百 MB 数据，内存与 IPC 双爆。否决。
3. **只用 `openBrowserFile()`（现状 Ctrl+点击）**：没有缩略图、没有内嵌播放，
   用户必须离开对话。不满足“卡片内嵌播放器 / 点一下就播”。否决。
4. **提升 `toolCallRendererVersion` 到 2**：现有插件做等值判断，旧卡会全部退回默认渲染；
   版本号应表达破坏性变更。否决。
5. **允许插件自行拼接协议 URL**：把 scheme、编码与白名单复制到每个插件里，重复逻辑
   且无法统一收紧。否决（`url()` 仅供确有需要的插件读取，仍由宿主生成）。

## 影响与后果

- 向后兼容：旧宿主没有 `ui.media`，插件走 `?.` 降级；旧插件不读 `ui.media`，行为不变。
- 宿主改动：`src/renderer/utils/pluginMediaUrl.ts`（新）、`src/main/app/pluginMediaProtocol.ts`（新）、
  `bootstrap.ts`（两处注册）、`index.html`（CSP 两条）、`pluginToolCall.tsx`（`ui.media`）、
  `src/renderer/plugins/pluginMedia.tsx`（新）、`styles.css`（`.plugin-media-*`）。
- 插件改动：`types.ts`、`renderer/index.ts`（两处预览）、`style.css`、三语字典各 +1 键。
- 安全：新增的读取面仅限“媒体扩展名的普通文件”，且只有应用自身的渲染进程能构造该 scheme；
  不引入远程内容、不引入写操作、不暴露目录。
- 验证边界：宿主 `npm run check`（tsc + cargo check）、插件 `npm run check` 与
  `python scripts/release.py validate`；媒体协议的真实播放/拖动未做浏览器端到端验收
  （用户明确不做 E2E），以编译与静态检查为门禁。
