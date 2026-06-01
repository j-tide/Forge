# ADR 0008: Project 探测、信任与持久化边界

日期：2026-09-23。状态：P1-01 macOS arm64 实现；Windows 与 macOS Intel 未验证。

## 决定

- Desktop Main 只提供 Electron `dialog.showOpenDialog({properties:['openDirectory']})` 的固定入口，并核对调用 frame。Main 在当前窗口内存中只允许刚由该选择器选中的路径（和 Host 返回的规范根路径）用于 `project.probe/create`，取消选择会撤销旧路径；Renderer 不能用 project 命令探测任意新路径。Preload 只暴露 `chooseProjectFolder` 与受 Schema 约束的 `invokeProject`；Renderer 不获得 `fs`、Git、SQL 或任意 IPC。Main 不保存 Project，也不探测仓库。
- Host 收到所选路径后重新 `realpath`、确认目录，并只读取仓库顶层受限清单及 Git 本地状态。Git 以 `execFile(executable, argv[])` 运行；关闭 terminal prompt 和可选锁，禁用 fsmonitor，不执行依赖安装、项目 script、hook 或网络请求。Git 子目录规范化到真实 Git root；非 Git 目录允许保存，worktree 能力明确为 false。符号链接 manifest 不读取；用户所选根目录的符号链接规范化后在 UI 显示真实目标。
- Probe 生成规范路径、Git/lockfile/script 摘要及 SHA-256 fingerprint。`project.create` 要求明确的 `project-trust/v1` 与 `approved:true`，Host 在写入前重新探测，fingerprint 改变时拒绝并要求重新查看。信任只允许 Forge 把项目作为未来的可执行上下文，不免除后续危险操作审批。Trust 审计仅记录版本、时间、环境摘要 hash 和 `local-user`，不记录凭据。
- Project 有独立 UUID；规范根路径在当前 Forge Host 数据库中唯一。环境快照通过严格 Zod Schema 验证后存 JSON，并有独立 environmentId。当前项目 ID 存于 Host 元数据；再次选择相同 realpath/Git root 返回已有 Project。移除只执行 SQLite 记录删除，绝不删源码。项目从磁盘移动后，旧路径不会因 ID 变化被误认为新项目；重新定位路径属于后续数据服务任务。
- P1-01 增加生产 migration v3 的最小 `projects` 与 `project_trust_decisions` 表。参考 `forge_spec_v1.0/contracts/schema.sql` 是完整产品 DDL，包含当前尚无稳定逻辑 Host 身份的 `host_id`、trust_mode、revision/archived_at 和未来关联表；本轮未复制完整 DDL，也未修改只读参考。P1-02 的环境/命令预设、CAS 和归档设计需对齐这些字段。本轮 `remove` 是无关联业务表时的元数据移除；未来有 Task/Run 后不能沿用简单物理删除。
- Host 私有协议增加经过严格 payload 校验的 project 命令，并显式从 `forge-host-protocol/v2` 升到 `/v3`，防止旧 Host 在握手成功后不支持项目命令。系统命令继续保留原语义。

## 安全与尚未验证

Project Probe 不是对不可信仓库的沙箱：本轮只允许 Git 内建只读命令和受限顶层文件读取，不承诺未来 Agent 的文件/网络隔离。项目脚本只是**声明**，不等于安全或测试通过。Probe 对路径与输出长度设上限、错误消息不返回原始 SQL 或敏感环境变量；不会自动 `git init`、stash、reset 或清理。

macOS arm64 的真实 Electron Host + fixture 向导、重启持久化和源码不变已测。稳定自动化借助受控 `dialog.showOpenDialog` 返回值覆盖完整路径；另在实际 macOS 原生面板通过 UI 操作选中独立临时非 Git 目录，Renderer 显示 Host 返回的规范路径和非 Git 探测结果。Windows 中文路径、大小写归一、UAC/权限、macOS Intel、安装包、DPI 和代码签名均未实测。P0 报告中的 Codex utilityProcess crash recovery 与 Windows 进程树风险继续保留。
