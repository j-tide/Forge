# P2 阶段收口报告

日期：2026-09-24；当前平台：macOS arm64。权威阶段出口是“**一张已批准任务在独立工作区真实修改，并可查看结果和停止。**”Python-only Desktop 上有真实证据满足这个出口；这不表示 Review、Verify、Done、合并或部署已实现。

| Task | 阶段状态 | 当前能力与证据 |
| --- | --- | --- |
| P2-01 | DONE | RunConfig 冻结批准版本、环境、模型与预算；Python Host 与 SQLite 复验 |
| P2-02 | DONE | Git worktree 隔离、来源 HEAD 不变、lease/epoch 与 ownership |
| P2-03 | DONE（阶段范围） | 标准 Executor request/event 门禁；第二实现相关 T041/T042 延后 |
| P2-04 | DONE（阶段范围） | 真实 Codex app-server 的能力探测、工作区写入、事件与取消 |
| P2-05 | DONE | SQLite Run/Attempt 持久化、有限调度、终态/过期结果防护 |
| P2-06 | DONE | 有来源和上限的 ContextBundle/Checkpoint |
| P2-07 | DONE | 真实观察流与 Diff 只读投影；Desktop 可查看 |
| P2-08 | DONE | 持久取消意图、owned 进程停止确认后才记 cancelled |
| P2-09 | DONE | 真实 Git CodeSnapshot、SQLite Handoff；正式 AC 留 unverified |
| P2-10 | DONE（阶段范围） | 一次真实 Codex 代码修改、Diff 与 fixture 测试；一次真实提供方失败、一条真实 Desktop 取消；人工 Diff 检查 |

P2-10 的完整路径、Run ID、人工检查结果、失败与取消证据见 [Python 纵向 Demo](demo/p2-python-vertical.md)。其真实截图和 Diff 位于本地生成的 `output/playwright/`，可用所记命令重建。Electron Renderer 只经固定 bridge 调用 Python Host；没有回退到 Node 业务 Host。项目源码工作树未被 Agent 改动，只有 Forge 创建的隔离 worktree 被修改。

## Phase Gate 判断

已批准 TODO 经用户显式 Start，在 Git worktree 修改两文件并通过 fixture 测试；Desktop 能读到观察、Diff、CodeSnapshot 和 Handoff；用户取消长命令后 Run 与进程实际停止。Phase Gate 在当前 macOS arm64 的开发运行路径 **通过**。一个 `succeeded` 但 `noChange` 的真实模型调用未计为成功；正式验收状态保持 `unverified`。权威 Test ID 与只读规格未改，P2-10 的 T116–T120 仍由 `docs/deferred-verification.json` 追踪到 P6/P9，未执行的完整验收不计 PASSED。

## 回归与剩余风险

冻结安装、契约/任务图、Python Ruff/mypy/37 pytest、TS lint/typecheck/test/build、Electron Desktop smoke、diff check 均通过，详见 [Demo 证据](demo/p2-python-vertical.md)。当前真实用户 development DB 文件不存在，升级只在隔离库验证。Windows x64、macOS Intel、系统 DPI、安装包/内嵌 Python/Codex、签名、公证、Host 意外死亡时的 Codex orphan 恢复以及 Git SHA-256 仓库仍 **UNVERIFIED**。这些风险保留在 `docs/compatibility-record.md`，不宣称跨平台通过。下一权威 Task 是 P3-01；进入 P3 不改变 P2 产物的 Review/Verify 未完成事实。
