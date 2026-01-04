# ADR 0013: Task Draft revisions and clarification

日期：2026-09-24。状态：P1-05 已完成（macOS arm64）。

## 决定

- 权威 Task Contract 字段继续来自 `forge_spec_v1.0/contracts/task-contract.schema.json`。`openQuestions` 仍为字符串数组；当前每条未回答问题均阻塞后续批准准备状态，P1-06 才实现真正审批。避免擅自在参考 Schema 中加入 `blocking` 字段。
- Host 从可信来源绑定 `draftId`、`projectId` 和预期 revision。每次用户确认的结构化修改用 CAS 形成新 revision；SQLite migration v7 增加仅追加的 `task_draft_revisions` 快照，迁移时回填现有草稿当前版本。草稿主表保存最新快照；历史独立保留，关闭、重开及 Host 重启后可读取。
- 用户移除验收项必须提交确切旧 ID 清单；范围/排除范围变化必须显式确认。既有验收 ID 和 sourceRefs 保留，修改或新增验收项加 `decision:<uuid>` 来源，整体 Contract 也记录这次用户决定。已回答的澄清问题以问题/答案和决定摘要存在 revision 历史中；未答问题留在 Contract。
- Drawer 在本地预览字段差异，并要求用户提供决定摘要。Host 的严格 Schema 和领域校验是最终门禁，不能依赖前端确认框防护。`draft.revise` 与 `draft.history` 是固定命令，没有任意文件/SQL/执行通道。用户项目文件不受草稿编辑影响。

## 边界与后续

- 这不是 Approval 或正式 Task revision。P1-06 将审批绑定确定的 canonical snapshot/hash 和 CAS，并原子写入 TODO；本轮不生成 TODO、Run 或 Agent 执行。
- 旧 P1-04 草稿在迁移时只有当前快照可回填，迁移前的原始编辑过程无法凭空恢复。Windows、macOS Intel 和打包安装链路仍未验证。
