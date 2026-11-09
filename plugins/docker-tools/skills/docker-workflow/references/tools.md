# Docker 工具参考

调用前先用 `toolSearch-discover` 获取完整工具名。下表只用于选择工具，不替代运行时 Schema。

## 只读

| 工具 | 用途 | 关键参数 | 说明 |
| --- | --- | --- | --- |
| `containers_list` | 列容器 | `all`、`status`、`name`、`limit` | 返回紧凑字段；默认只列运行中容器 |
| `container_inspect` | 容器详情 | `container`、`includeEnv` | 默认不返回环境变量值；`includeEnv=true` 时敏感键脱敏 |
| `container_logs` | 日志尾部 | `container`、`tail`、`since`、`timestamps` | 上限 2000 行 / 64 KiB；不 follow |
| `container_stats` | 一次性资源采样 | `container` | 省略容器时采样全部运行容器 |
| `images_list` | 本地镜像 | `all`、`dangling`、`reference`、`limit` | 默认最多 100 条 |
| `compose_status` | Compose 状态 / 日志 | `action`、`projectDir`、`files`、`services`、`tail` | `ps` 需要 Compose v2.21+ 的 JSON 输出 |
| `system_info` | 版本、context、磁盘 | 无 | 写操作前先用它确认 context |

## 写操作

| 工具 | 用途 | 关键参数 | 风险 |
| --- | --- | --- | --- |
| `container_start` | 启动容器 | `container` | 低 |
| `container_stop` | 停止容器 | `container`、`timeoutSecs` | 会中断服务 |
| `container_restart` | 重启容器 | `container`、`timeoutSecs` | 会中断服务 |
| `container_remove` | 删除容器 | `container`、`force`、`volumes` | 删除；`force` 可删运行中容器 |
| `container_exec` | 容器内执行 | `container`、`command`、`workdir`、`user`、`timeoutMs` | 任意命令；可能触碰挂载的主机路径 |
| `image_pull` | 拉取镜像 | `image`、`platform` | 访问镜像仓库 |
| `compose_control` | Compose 生命周期 | `action`、`projectDir`、`files`、`services`、`build`、`removeVolumes`、`timeoutSecs` | `down` 可删除卷 |

## 参数约定

- `container`：容器名或 ID，必须以字母或数字开头，最长 128。
- `image`：镜像引用，例如 `nginx:alpine`、`ghcr.io/owner/app:tag`。
- `command`：argv 数组，不拼接 shell 字符串。
- `projectDir`：绝对路径，并且必须是已存在的目录。
- `services`：Compose 服务名数组；省略表示整个项目。
- `files`：Compose 文件路径；相对路径按 `projectDir` 解析。

## 返回约定

- 列表类工具返回 `count`、`total` 和 `truncated`。
- 日志 / exec / Compose 输出返回 `truncated` 和 `originalBytes`。
- Docker 命令失败返回 `isError: true`，包含 `code`、`message`、`exitCode`、`stderr`；不要重写成空结果。
- `container_exec` 的命令退出码非 0 时仍返回正常结果，由 `exitCode` 表达失败。
