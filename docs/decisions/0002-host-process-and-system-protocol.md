# ADR 0002: 独立 Host 与本地系统协议

日期：2026-09-23。状态：P0-03 实施决定。

## 决定

- `apps/host` 是不导入 Electron/Vue 的 Node 兼容入口。同一入口由 Desktop 的 `utilityProcess.fork()` 承载，也可用 Node 直接启动或通过 Node IPC 做集成测试。这遵循蓝图第 06–07 节对 Desktop Host 的明确选择。
- Renderer → Preload → Main 只提供固定的状态、健康和系统命令方法。Main 校验 senderFrame、输入与 Host 响应；Main → Host 使用 `utilityProcess` 私有消息通道，不开放本地 TCP/HTTP 端口。`packages/client` 隐藏本地桥接；未来 RemoteTransport 实现同一客户端接口，但本轮不实现网络网关。
- Host 创建一次性的 `hostId`、启动时间和运行状态。Main 创建仅限这次子进程使用的 ownership token，保存子进程句柄、PID 和握手确认的 hostId；优雅关闭超时后只针对该句柄与已核实的 PID 做有限清理。手工启动的 Host 不属于 Desktop。
- Host 系统命令仅 `system.health`、`system.info`、`system.ping`。Host 从受控传输注入调用上下文，客户端不能提交 actor/scopes。`commandId` 的同内容重试返回已有结果；异内容复用拒绝。当前缓存仅在本次 Host 进程内有效，因为没有写命令或持久化系统。

## 规格边界

`forge_spec_v1.0/contracts/command-envelope.schema.json` 是后续业务命令的公共格式，字段为 `method`、`idempotencyKey`、`expectedRevision` 等，并禁止额外字段。本轮要求的系统握手/健康命令需要 `type`、`createdAt`、`protocolVersion`；直接扩展原 Schema 会发生实质冲突。因此新增独立的、严格校验的 **Host system protocol**，不修改参考 Schema，也不把它宣称为业务 CommandEnvelope。未来引入业务命令时，必须在同一 Host CommandService 中映射到参考 Schema，并实施持久幂等/CAS/身份验证；不得让系统协议绕过业务审批。

任务清单 P0-03 提到“项目读取”，但本轮用户明确禁止项目业务和假数据。当前只提供系统级只读命令。T091–T094 涉及远端 actor、写命令 CAS 与事件游标，依赖后续能力；T095 未知命令在本轮覆盖。未实现项记录在实施状态中。
