# ADR 0011: Conversation stream and provider boundary

日期：2026-09-23。状态：P1-03 本机工程验收完成。

## 决定

- `@forge/contracts` 公开严格的 Conversation、Message、Send、StreamEvent 及本地命令 Schema。Host 是唯一消息写入者；生产 migration v5 只添加会话、消息及发送幂等记录，不提前建立 Task/Run 表。
- 用户消息以 `(conversationId,idempotencyKey)` 与正文 hash 去重。相同键重放返回同一 messageId，正文变化返回冲突。失败与取消不会删除用户原文；助手响应尝试保留独立消息记录。Host 重启将中断中的助手消息标为 failed，之后可用同一键重试，仍只有一条用户消息。
- 流式响应使用可替换的 `ConversationResponder` AsyncIterable 接口；Host 按序写入增量、发送受 Schema 约束的事件，再经固定 Host→Main→Preload→Client 事件通道到 Vue。取消通过 AbortSignal 传给 responder。P1-03 的独立 fixture 真实执行流式生成、取消、失败与重试测试；生产未装配模型 responder 时明确返回 `unavailable`，绝不生成伪助手内容。P1-04 才负责真实 Refiner 调用及 TaskDraft。
- 当前消息展示使用 Vue 文本插值，不把 Markdown 源解析成 HTML。HTML 标签、链接与脚本均作为文本显示，因此即使上游内容不可信也不会在 Renderer 执行；以后加入富 Markdown 前必须有单独的净化测试与策略。
- `conversation.send` 可以在无模型时把用户原文存入本地会话；UI 明示未生成回复，保留输入框用于修改。它不能创建 Task、调用 Codex Executor 或执行项目脚本。普通 Web 仍无本地 Host。

## 差异与后续

参考 `contracts/schema.sql` 只有最小 conversations/messages 字段；生产增加 revision、archived_at、message status、sequence 和幂等表，以满足 P1-03 的失败恢复与跨项目隔离。参考 OpenAPI `conversations.send` 是未来认证 Gateway 命令；当前 Desktop 使用私有 Host protocol v4 内的固定本地通道，没有暴露任意 IPC 或 RemoteTransport。真实模型流与输出 Schema 在 P1-04 验证前不宣称可用。
