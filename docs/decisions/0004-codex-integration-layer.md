# ADR 0004: Codex Executor 集成层

日期：2026-09-23。状态：P0-05 在 macOS arm64 完成最小实现与真实探测；修正代理环境白名单后整套 live 重跑通过。

## 决定

Forge 首个 Codex Executor 选择 **Codex app-server 的本地 stdio 协议**。它作为 `@forge/executor-codex` 的子进程运行在 Forge Host 之下；Host 通过公开 `@forge/plugin-api` 使用适配器，Core 和 Renderer 不导入 Codex 类型。版本固定为 `@openai/codex@0.155.1`；`@openai/codex-sdk@0.155.1` 仅用于同版本对比实验，作为未来简化批处理的备用方式。绝不使用 app-server 的 WebSocket/远程监听入口。

蓝图 M09 预设 SDK 为第一执行器、app-server 只做实验；本轮用户明确要求两者实测并允许更改选型。app-server 在真实 approve/reject 和 `turn/interrupt` 控制方面更适合 Forge 的长期人工审批与暂停/恢复需求，因此本 ADR 记录相对蓝图的技术选型差异。业务 Task、Approval 和 Run 状态语义未改变。

参考任务 P0-05 原本只要求只读探测，完整 ExecutorAdapter 公共接口和真实写入分别列在 P2-03/P2-04；本轮用户明确扩大到最小公开接口与**可丢弃 fixture 写入**。因此当前 API 只带 spike 所需的 runId/taskId/workspace 等字段，不冒充参考 `plugin-api.ts` 的完整 Attempt、lease、credential 与 artifact 服务；这些 P2 契约仍须在对应任务落实。

| 维度 | TypeScript SDK 0.155.1 | app-server 0.155.1 |
| --- | --- | --- |
| 真实运行 | 独立临时 Git fixture 中只读 turn 成功，返回 thread ID、事件与 token usage | 只读结构化输出、真实写入和测试、取消、跨连接及跨 Node 进程 resume、审批接受/拒绝均曾成功 |
| 生命周期 / 事件 | `runStreamed` 提供较粗的 thread/turn/item 事件；`AbortSignal` 用于取消 | stdio JSON-RPC 的 thread/turn、item delta、usage、server-initiated approvals 与 `turn/interrupt`；Forge 映射成标准事件 |
| session / 恢复 | 官方 `resumeThread(id)`，本次未单独做 SDK 跨进程恢复测试 | `thread/resume` 用保存的 thread ID 在新连接和另一个 Node 进程中成功继续；持久身份由 Codex 管理，Forge 只保存引用；Electron utilityProcess 重启未测 |
| 审批 | TypeScript SDK 公共类型没有客户端 approve/reject 回调，本次未验证可驱动人工审批 | 真实 `item/commandExecution/requestApproval` 接受后写入，拒绝后未写入；Adapter 不自动接受 |
| workspace / sandbox | SDK `workingDirectory`、`sandboxMode`；只读 fixture 成功，未独立测试 SDK 越界写入 | `cwd` 和 `read-only` / `workspace-write` 生效；只读写入需审批。默认读范围并非严格只读根限制，不能视为完整工作区隔离 |
| 模型 / 结构化输出 / usage | SDK 公共 API 支持 model、outputSchema，真实 usage 已收到；后两项 SDK 能力未逐项实测 | `model/list` 返回当前账号模型，显式选择当时可用模型 + outputSchema 返回合法 JSON；真实 token usage 到达，未提供可靠实际费用 |
| 认证 | 现有 ChatGPT 登录可执行真实只读 turn | `codex login status` 确认同一会话；隔离 CODEX_HOME 后明确 `EXECUTOR_AUTH_FAILED`；不接收 Renderer 凭据 |
| 工具 / 维护 | SDK 封装 CLI，调用面较小；不能满足本次审批控制 | 命令、文件变化可标准化；MCP tool-call 自身未实测。app-server 命令被 CLI 标为 experimental，协议需要锁版本、严格校验和升级回归 |
| 打包与平台 | SDK 依赖同版本 CLI 平台二进制 | 当前 npm 可选包含 macOS arm64 原生 CLI（约 127 MB 下载）；Host 子进程运行已验证，安装包、Windows、macOS Intel 均未验证 |

## Host、权限与清理

- `apps/host` 的最小 Registry 只登记内置 Codex Adapter 与转发标准 ExecutorEvent；不负责完整插件生命周期，也没有 Renderer → Executor 命令。真实运行入口只给开发 spike；任务状态仍须由未来 Core 决定。
- Adapter 每次 Run 使用私有 stdio app-server，检查工作目录、认证、模型列表、请求与响应结构；未知交互请求终止 Run。命令和文件审批只能由明确的 `respondToApproval` 接受或拒绝，120 秒未答复自动拒绝。每个事件含 `runId`、序号、时间；原始 provider 对象不穿透公开 API。Run 终态与 Host 退出会关闭本次子进程和监听器。
- 子进程环境只继承运行所需的路径、账户、语言/临时目录变量及 `CODEX_HOME`，不继承 Forge ownership token 或 `OPENAI_API_KEY` 等任意环境值。使用本机现有合法 ChatGPT 登录；不复制、记录或存储认证秘密。
- 能力探测先读实时 CLI 版本、登录状态和模型列表，再与 `verified-capabilities.json` 的平台/版本实测记录匹配。版本或平台不符时详细能力均为 false。`available` 仅代表本地运行时/会话可用，不保证上游模型连接实时可用。

## 未完成边界与风险

- `resume` 是 Codex thread 继续，不是 Forge Task/Attempt 持久恢复；Forge 还未实现租约、事件持久化、重放或审批身份校验。`cancel()` 对应 app-server 的中断，当前没有独立的“暂停且保持运行现场”能力。
- `model/list` 仅展示当前登录会话实际返回的候选，且启动前明确拒绝未知模型；模型是否可用仍受账号策略影响。费用 metadata 未验证，不能由 token 数估算为实际费用。
- 首次 live 重跑在 app-server 只读阶段连续收到 `responseStreamDisconnected`（无 HTTP 状态）并超时。根因是本轮子进程环境白名单遗漏了本机所需的无凭据代理变量；加入仅限无 URL 用户信息的代理变量后，直接只读、Adapter 结构化输出与完整 `pnpm test:codex-live` 均通过。默认离线质量检查与 Desktop smoke 不依赖模型网络；上游长期稳定性仍未验证。
- TypeScript SDK 本次只验证只读流与 usage；SDK 取消、审批、结构化输出及跨进程恢复未实测，记录为未验证而非不支持。app-server 的 MCP tool events、网络策略强制、严格可读根、Windows/Intel 和安装包未实测。

来源：[Codex SDK 官方文档](https://learn.chatgpt.com/docs/codex-sdk)、[Codex app-server 官方文档](https://learn.chatgpt.com/docs/app-server)。具体 0.155.1 请求值以本机真实协议错误与成功运行校对：`thread/start.sandbox` 使用 `read-only` / `workspace-write`，`turn/start.sandboxPolicy.type` 使用 `readOnly` / `workspaceWrite`；不能直接照搬可能较新的文档字段到锁定旧版。
