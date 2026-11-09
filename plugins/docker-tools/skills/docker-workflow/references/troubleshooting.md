# Docker 常见错误

## `DOCKER_NOT_FOUND`

`docker` 不在 PATH。让用户安装 Docker Desktop / Docker Engine，并确认终端里 `docker --version` 可用；安装后重启 Snow App，让 stdio 进程重新继承环境变量。插件仍会被发现（工具清单不依赖 CLI），但每个 Docker 调用都会失败，不要反复重试，先修环境。

## `DOCKER_COMMAND_FAILED`，stderr 包含 `Cannot connect to the Docker daemon`

Docker daemon 未启动。Docker Desktop 需要先启动；Linux 检查 `systemctl status docker`。不要在 daemon 不可用时反复重试同一个命令。

## `permission denied while trying to connect to the Docker daemon socket`

Linux 当前用户没有 Docker socket 权限。让用户把用户加入 `docker` 组并重新登录，或用有权限的账户运行；不要用 `sudo` 包装插件进程。

## Context 指向错误环境

`system_info` 返回的 `context` 不是用户以为的本地环境。先让用户确认 `docker context ls`，必要时切换到正确 context；不要在未确认时执行停止、删除或 `compose down`。

## `projectDir` 不存在或不是绝对路径

Compose 工具要求绝对路径。让用户给出项目根目录；不要从插件进程 cwd 猜。相对 `files` 会按 `projectDir` 解析。

## `docker compose ps --format json` 不支持

Compose 版本过旧，需要 Compose v2.21+。让用户升级 Docker Desktop / Compose 插件；不要改用解析表格文本来伪装成功。

## 容器名非法

`container` 必须以字母或数字开头，只允许字母、数字、`_`、`.`、`-`。不要为绕过校验而拼接 shell 命令。

## 输出被截断

结果带 `truncated: true`。缩小 `tail`、`since`、`limit` 或服务范围后重试；不要把截断内容当成完整日志下结论。JSON 查询超过 4 MiB 会直接报错。

## exec 超时

`container_exec` 默认 30 秒，最大 120 秒。长任务应让用户使用终端工具；超时错误可能意味着命令已经部分执行，不要无脑重试写操作。

## 删除/停止没有生效

检查审批是否被拒绝、容器是否已经处于目标状态，以及是否选错 context。不要把审批拒绝当成 Docker 故障。
