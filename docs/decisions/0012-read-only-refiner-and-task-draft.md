# ADR 0012: Read-only Refiner and proposed Task Draft

日期：2026-09-23。状态：P1-04 已完成（macOS arm64）。

## 决定

- 权威 `forge_spec_v1.0/contracts/task-contract.schema.json` 是字段来源；生产 `@forge/contracts` 镜像 v1.0 并严格拒绝未知字段。Draft 与 Task Contract 分开：Draft 有来源消息、整理状态、可编辑原文和 provider/error 标识；它没有 Approval、TODO 或 Run 权力。P1-05 处理完整结构化编辑/修订，P1-06 才处理批准。
- `@forge/refiner` 是不依赖 Codex、Host、SQLite 或 Vue 的两步转换：意图分类，再生成结构化提议。初次失败最多修复两次；仍失败保留原文和错误，绝不把自由文本伪装成已验证 Task Contract。模型不能生成 taskId、projectId、revision、sourceRefs 或 approval；Forge 从已认证的 Host 上下文和持久消息写入这些字段。控制指令不转成任务执行。
- Host 用既有已锁定的 `CodexExecutorAdapter` 作为**本机特定的整理器模型适配**，不是把 Codex 宣称为可替换的通用 Model Provider。完整 Model Provider 接口仍属 P4-07；凭据产品化仍属 P6-04。此调用使用当前已有合法 Codex 会话，不读取或存储新的 Key。没有可用认证时保留手工草稿入口。
- 每次模型请求使用独立空临时目录、`read-only` sandbox、`approval: never` 和结构化输出；仅送入有长度上限的项目名称、类型、包管理器、分支、脏树状态、声明脚本名称与用户消息。不会把项目路径或源码交给整理器，也不运行项目脚本。若看到 command/file/approval 事件则请求取消并拒绝该输出。既有 P0-05 探测只证实 macOS arm64 的只读文件写入防护；网络策略未被证实，故不把隔离写成通用安全沙箱。
- Electron utilityProcess 内的 `process.execPath` 是 Electron Helper。其拥有的 Codex CLI 子进程需要显式 `ELECTRON_RUN_AS_NODE=1` 才能执行已锁定的 JS CLI；仅在 Electron Host 中对该受控子进程设置。普通 Node Host 不设置。Electron 官方文档指出 `runAsNode` fuse 可在打包时关闭，届时此路径会失效；发布打包前必须验证或改为直接启动已锁定的平台 Codex binary，不能假定打包兼容。
- Desktop Main 过去给 Host 的环境只有 Forge 三个变量。真实在线测试确认 app-server 能启动但上游请求超时；本机 Node Host 的同一模型任务可成功。Main 现在只转发经白名单筛选的运行时路径和无凭据代理 URL（不转发 API Key/任意环境值），供已拥有的 Host 使用；Host 再用自身既有 `codexEnvironment` 白名单启动 CLI。此调整不把环境或凭据交给 Renderer。
- migration v6 只增加 `task_drafts`。Host 独占写入，关联 Project/Conversation/User Message；同一来源消息与 idempotency key 唯一，Host 重启把中断生成标为失败。手工或无效输出可改原文，使用 CAS 修订；不会写用户仓库。Desktop 仅通过固定 `draft-command` 访问，Web 无本地 Host 时不可用。

## 取舍与未验证

- P1-04 的整理器没有通用聊天响应，不改变 P1-03 的 `conversation.send` 保存与 `unavailable` 语义。用户主动在已保存消息旁发起整理或手工草稿；不自动开工。
- 模型输出即使符合结构也仍是未确认提议；模糊需求保留 `openQuestions`。对提示注入的最后防线是无 Approval/执行命令、严格契约、只读 sandbox 与受控事件，不以模型分类文本作为身份或权限。
- 当前仅 macOS arm64 的 Codex app-server 0.155.1 已作真实调用。Windows/Intel、离线模型、网络限制、打包后 Codex 二进制仍未验证；完整 API 凭据管理和跨 Provider 选择留给权威后续任务。
