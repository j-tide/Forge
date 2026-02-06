# P3 阶段收口报告

日期：2026-09-24；当前平台：macOS arm64。权威阶段出口是“**以任务版本和快照为依据形成可验收交付，不把绿灯当证据。**”
当前 Python-only Desktop 的真实纵向证据及异常场景满足这一阶段出口，
并不宣称 P4 插件隔离、P5 自定义 Workflow 或 P6 Agent 评测已完成。

| Task | 状态 | 当前真实能力 |
| --- | --- | --- |
| P3-01～03 | DONE | 固定 CodeSnapshot 的独立只读 Review 副本、结构化 Reviewer 结果、问题与历史 |
| P3-04～05 | DONE | 批准的 argv 命令验证、不可变证据与当前快照逐项 AC；成功文本不自动变通过 |
| P3-06～07 | DONE | 有上限的 Review/Verify 返工；版本绑定最终 Owner 验收与非安全建议豁免 |
| P3-08～10 | DONE | 不可变交付、显式本地合并、崩溃后对账、获批 Task 版本变更与安全点失效链 |
| P3-11 | DONE | 在线 WAL 一致性备份、迁移前备份/空间检查、磁盘故障诊断与存储边界 |
| P3-12 | DONE（当前阶段范围） | 五类交付场景、真实 Electron→Python Host→Codex→Verify→Review→Owner→Done→显式合并及混合状态看板 |

## Phase Gate

**通过（仅 macOS arm64 开发环境）**。真实 Codex Run 在独立工作区修改两文件，
正式验证报告最初没有自动覆盖 AC；人类绑定报告，Review 与最终 Owner
决定基于同一 Contract revision 和不可变快照。Done 前源 Git 未变，
合并需要额外原生确认，不 push/deploy。Provider/failure、Review 退回、
测试失败返工、人工建议豁免与崩溃后对账都有独立的真实 Git/SQLite/进程
证据，详细 ID、截图和命令见 [P3 交付 Demo](demo/p3-delivery.md)。

最终质量链全部 exit 0：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`
（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase、92 task、
120 case、29 deferred）、`pnpm py:check`（83 pytest、Ruff、严格 mypy 41 源文件）、
`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`
（Python Host schema24 的 ready/degraded/crashed）及 `git diff --check`。
`pnpm test:p3-live` 单独 exit 0，包含真实上游 Codex 与独立 Electron 混合状态看板。

## Deferred verification 与风险

P1-10 的 T021/T022/T025 和 P2-07 的 T064 已在本阶段补充真实证据并从
deferred 表移除。P3-12 保留权威 T116–T120 引用；这些 M24 评测项按
[ADR 0047](decisions/0047-p3-delivery-acceptance-scope.md) 分别追踪到 P6-09/P9-06，
**没有执行也没有标 PASSED**。全角色预算、holdout 隔离、策略回滚均不冒称
本阶段能力。

现有用户数据库升级、Windows x64、macOS Intel、安装包内 Python/Codex、
签名、公证、系统 DPI、真实模型强制触发 Reviewer 返工后的再次在线 Review、
恶意第三方插件的进程隔离和历史 orphan 进程自动安全接管仍 **UNVERIFIED**。
Forge 参考规格与 glass 设计资料未修改，没有提交、推送或发布。
