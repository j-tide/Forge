# ADR 0014: Task approval and atomic TODO admission

日期：2026-09-24。状态：P1-06 已在 macOS arm64 验证。

## 决定

- 人类批准绑定严格的 `approval-request`/`approval-decision` 生产契约、确定的草稿 revision、canonical SHA-256 内容摘要与范围摘要。`trust project` 不代替该次批准。请求有 24 小时有效期；拒绝、到期、修订变化均不能生成 Task。
- `approval.request`、`approval.decide`、`approval.forDraft` 是固定 Host 命令。Desktop Renderer 仅经 ForgeClient、受限 preload、Main 来源校验进入 Host；Main 不计算批准结果，不写数据库。Web 无本地 Host 时不提供批准。
- Host 独占 SQLite migration v8 的 `tasks`、`task_revisions`、`task_approvals`、`task_events`。批准决议与 Task TODO、不可变 revision、`task.approved_to_todo` 事件在**同一事务**提交；插入事件失败时全部回滚。重放同一决议返回既有结果，两个客户端竞争只有一项 Task/事件。已批准草稿不再可修订。
- Task 初态仅为 `todo`，批准不调用执行器、不创建 Run、不自动开工。旧 revision、不同 scopeHash、未知批准或未解澄清问题被 Host 拒绝。当前私有进程协议保持 `forge-host-protocol/v4`，只增加白名单命令。

## 边界与后续

- `requestedBy: local-user` 是当前单用户 Desktop 的审计身份，不等同于账户权限体系。后续跨设备批准需要可靠身份与授权上下文，不能仅复用本地字符串。
- P1-07 才建立 Task 列表投影与看板操作；P1-06 只保证正式 TODO 可被持久读取。批准不是危险操作的无限授权，后续开始执行仍需独立权限/策略。
- Windows x64、macOS Intel、安装包和签名路径未验证。本机测试包括真实 Node Host IPC 并发、Electron/utilityProcess/SQLite、重启持久化、事务故障注入与 UI 人工批准入口。
