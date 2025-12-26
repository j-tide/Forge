# Forge Autopilot 一次性启动提示词

把 `forge-codex-autopilot-protocol.md` 放到仓库：

`docs/forge-codex-autopilot-protocol.md`

然后只需要向 Codex 发送一次下面这段：

```text
进入 Forge Autopilot 持续执行模式。

请按以下优先级读取并执行：

1. 根目录 AGENTS.md
2. docs/forge-codex-execution-playbook.md
3. docs/forge-codex-autopilot-protocol.md
4. docs/implementation-status.md
5. docs/compatibility-record.md
6. 当前任务需要的 ADR
7. forge_spec_v1.0 中当前任务引用的规格、contracts 和 acceptance cases

重要：
- `forge-codex-autopilot-protocol.md` 只覆盖 Playbook 里“一个 Task 做完就停止 / 不自动继续下一任务”的规则。
- Playbook 中所有产品边界、安全规则、Do Not、Acceptance、测试要求继续完整生效。
- 一次仍然只实施一个 Task 的范围，但 Task 验收通过后，不要等待我回复，自动刷新仓库状态并继续下一个依赖满足的 TODO。
- Phase 完成后运行 Phase Gate，通过后自动进入下一 Phase。
- 只有 Autopilot Protocol 定义的 Hard Stop 才允许暂停并询问我。
- Soft Block 记录后继续其他可执行任务。
- 禁止 Mock、假日志、硬编码成功状态冒充真实验收。
- ProofRun 是独立项目，不得加入 Forge。
- 不自动 push / publish / release。
- 默认不自动 git commit，除非 docs/forge-autopilot-config.json 明确设置 autoCommit=true。
- 每个 Task 后更新 docs/forge-autopilot-state.md、implementation-status 和必要的 compatibility / ADR。
- 如果会话被平台强制结束，先写入完整 resume state；下次我只会发送“继续 Forge Autopilot”。

从当前仓库真实状态开始：
检查 Git 状态 → 找到第一个可执行 TODO → 实施 → 验证 → 更新状态 → 自动继续。

不要只给计划。现在开始持续执行。
```

之后正常情况下无需再次发送提示词。

若平台强制结束会话，只需发送：

`继续 Forge Autopilot`
