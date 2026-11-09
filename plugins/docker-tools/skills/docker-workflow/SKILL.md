---
name: docker-workflow
description: 查看和操作本机 Docker 容器、镜像与 Compose 项目。用于容器排障、日志、inspect、资源占用、启停删、容器内执行、镜像拉取和 Compose 生命周期；本机需已安装 docker CLI 且 daemon 在运行，调用前先用 toolSearch-discover 找到 Docker 工具。
---

# Docker 工作流

先调用 `toolSearch-discover`，查询 `docker container logs compose`，使用返回的完整工具名。不要凭记忆拼工具名。

## 先确认环境

1. 任何 Docker 操作前先调用 `system_info`：它同时验证 `docker` CLI 和 daemon 是否可用，并给出当前 context。
2. 返回 `DOCKER_NOT_FOUND` 表示本机没有可用的 `docker` CLI（未安装，或不在 Snow App 继承的 PATH 中）。直接告诉用户：安装 Docker Desktop / Docker Engine，先在终端确认 `docker --version` 可用，再重启 Snow App 后重试。不要重复调用工具，也不要把这当成插件缺陷，更不要尝试用终端替用户安装或改 PATH。
3. 返回 `DOCKER_COMMAND_FAILED` 且 stderr 含 `Cannot connect to the Docker daemon` 时，让用户先启动 Docker Desktop（Linux 用 `systemctl start docker`），再继续。
4. 环境未修好前不要执行停止、删除、`compose down` 等写操作。

## 安全顺序

1. 写操作前先调用 `system_info`，确认当前 Docker context。Context 可能指向远程或生产环境。
2. 目标来自用户或 `containers_list` 的真实结果；不要猜容器名、服务名或项目目录。
3. 停止、重启、删除、`compose down`、`container_exec` 都依赖 Snow App 的调用审批。不要请求或伪造免审批，也不要把审批描述成插件自己的能力。
4. 插件不提供 `docker run`、`--privileged`、任意主机目录挂载或任意 CLI 透传。需要这些能力时，建议用户使用终端工具并自行确认命令。

## 容器排障

按最小必要顺序执行，避免一次拉取过多输出：

1. `containers_list`：先看 `state`、`status` 和端口；需要停止的容器时传 `all=true`。
2. `container_logs`：默认 `tail=200`；按错误时间传 `since`，不要一上来拉 2000 行。
3. `container_inspect`：确认镜像、重启策略、挂载、网络和 `state.exitCode`；默认不返回环境变量值。
4. `container_stats`：确认 CPU、内存、网络和 PIDs 是否异常。
5. 只有根因和影响范围明确后才 `container_restart` / `container_stop`。删除前确认 `force` 和 `volumes` 的后果。

## 容器内执行

`container_exec` 的 `command` 是 argv 数组，不经过 shell：

- 查看文件：`["cat","/etc/nginx/nginx.conf"]`
- 查看进程：`["ps","aux"]`
- 需要 shell 语义时显式传 `["sh","-lc","..."]`，并说明这是有意为之。

命令退出码非 0 时，结果仍会返回 `exitCode`、`stdout` 和 `stderr`；不要把它当成插件失败，也不要忽略 `stderr`。

## Compose

- `compose_status`：`action=ps` 看服务状态，`action=logs` 看有界日志。
- `compose_control`：`up` 总是 `-d`，不支持交互式；`down` 默认不删除卷，只有 `removeVolumes=true` 才删除。
- `projectDir` 必须是绝对路径；`files` 可传相对项目目录的 Compose 文件。
- 用户只说“这个项目”时，先确认目录，不要从插件进程的工作目录推断。

## 镜像

- `images_list`：按 `reference`、`dangling` 筛选，默认最多 100 条。
- `image_pull`：会访问镜像仓库；确认镜像名和 tag，避免误拉 `latest`。

## 输出与截断

- 日志和 exec 输出上限 64 KiB；Compose 输出上限 64 KiB；结果带 `truncated` 时明确告诉用户，不要假装是完整输出。
- JSON 查询超过 4 MiB 会直接报错，应缩小筛选范围。
- 更多参数和工具选择见 [工具参考](references/tools.md)。
- 常见错误见 [排障参考](references/troubleshooting.md)。
