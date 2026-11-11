<p align="left">
  <img src="assets/icon.svg" alt="Docker" width="36" height="36">
</p>

# Docker 工具插件

`com.snow.docker-tools` · 版本 `0.1.0` · 最低宿主 `0.5.12` · [Release](https://github.com/BaSui01/snow-plugins/releases/tag/docker-tools/v0.1.0 "Docker v0.1.0 安装包") · [返回仓库首页](../../README.md)

Snow App 工具插件：通过本机 `docker` CLI 查看和操作容器、镜像与 Compose 项目。

## 工具

- 只读：`containers_list`、`container_inspect`、`container_logs`、`container_stats`、`images_list`、`compose_status`、`system_info`
- 写操作：`container_start`、`container_stop`、`container_restart`、`container_remove`、`container_exec`、`image_pull`、`compose_control`

## 运行前提

- 需要本机 `docker` CLI。只装了 Docker Desktop 但 CLI 不在 `PATH` 时，插件仍可安装、工具仍可被发现（工具清单由 MCP 进程提供），但所有调用都会返回 `DOCKER_NOT_FOUND`，卡片按当前语言显示安装 / PATH / 重启步骤。
- Docker daemon 必须已启动；否则 `docker` 返回连接错误，卡片保留原始 stderr，便于判断是 daemon 未启动还是权限问题。
- 修改 `PATH` 或安装 Docker 后需重启 Snow App，插件 stdio 进程才会继承新的环境变量。

## 开发

需要 Node.js 18+、npm 和本机 Docker。

```powershell
Set-Location D:\code\snow-plugins\plugins\docker-tools
npm install
npm run build
npm run check
```

安装：Plugins → Install from directory，选择本目录；或

```text
config-set scope=plugins key="new" value={sourceDir: "D:\\code\\snow-plugins\\plugins\\docker-tools"}
```

安装后在插件页启用，并按项目启用；模型通过 `toolSearch-discover` 发现工具。

## 边界

- 不提供 `docker run`、`--privileged`、任意主机目录挂载或任意 CLI 透传。
- 工具进程拥有当前用户权限；Docker socket 访问等同本机高权限。写操作仍由 Snow App 的调用审批控制。
- 日志和 exec 输出上限 64 KiB；JSON 查询上限 4 MiB。
- `container_inspect` 默认不返回环境变量值；`includeEnv=true` 时对敏感键脱敏。

## 图标

图标来自 [Simple Icons](https://simpleicons.org/) 的 Docker 图标（图标集 CC0）。Docker 名称和鲸鱼标志是 Docker, Inc. 的商标，本项目仅用于标识 Docker 工具集成。
