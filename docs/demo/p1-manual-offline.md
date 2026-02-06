# P1 手工降级可重复场景

执行：`pnpm smoke:p1-offline`。脚本构建当前代码后，用真实 Electron、utilityProcess Host 和独立 SQLite 临时数据目录运行；用包含中文及空格的**独立临时 Git 仓库**作项目。脚本退出时仅删除它创建的临时目录，不触碰用户项目。

场景有意把 Desktop 子进程的 `CODEX_HOME` 指向空目录、清空 API Key 环境项，并设置不可达的 HTTP(S) 代理。它验证**无需模型认证/调用**的手工路径；代理设置不是操作系统级断网，不能据此声称全机网络已隔离。脚本按真实 UI 顺序选择目录、明确 Trust、保存需求消息、手工建草稿、修订标题及 AC、人工审阅并批准、在看板看到唯一 TODO、重启 Desktop、重新打开 Task 详情。没有调用模型整理器，任务没有自动开工。

fixture 的 `package.json` 声明会写入 `script-ran.txt` 的测试脚本。整个流程前后检查 Git HEAD 与 porcelain status 完全相同，且 `script-ran.txt` 不存在，证明本场景没有执行该项目脚本或修改源仓库。截图来自真实 Electron UI：`output/playwright/p1-10-offline-approved-todo-1440x900.png`。此文件是可重跑步骤说明，实际是否通过以当次命令输出与退出码为准。

## P1 规格验收核对

| Case | 当前证据 | 结论 |
| --- | --- | --- |
| T011 | `plugins/refiner/tests/refiner.test.mjs` 的歧义与澄清；P1-04 Node/Electron 在线整理器记录 | 当前模型路径已验证；离线场景不调用模型 |
| T012 | `plugins/refiner/tests/refiner.test.mjs` 的非法 JSON 两次修复与可编辑降级；`apps/host/tests/drafts.test.mjs` 失败保留 | 当前 fixture 与 Host 路径覆盖；每种上游损坏形态未穷尽 |
| T013 | `apps/host/tests/conversations.test.mjs`、`apps/host/tests/drafts.test.mjs` 的幂等/重复发送 | 真实 SQLite/Host 测试通过 |
| T014 | `apps/host/tests/approval-protocol.test.mjs`、`scripts/smoke-projects.mjs` 的限制提议和伪造执行拒绝 | 真实 Host/Electron 测试通过 |
| T015 | `scripts/smoke-p1-offline.mjs` 的隔离认证、不可达代理与手工批准入列 | 真实 Electron/Host/SQLite 测试通过；未证明 OS 级断网 |
| T016 | 当前没有 `StartTask` 白名单，未批准草稿无法进入 Run；工作区未写入 | 当前边界已覆盖；正式 StartTask 状态冲突 `DEFERRED_VERIFICATION` → P2-05 |
| T017–T020 | `apps/host/tests/approvals.test.mjs`、`approval-protocol.test.mjs`、`scripts/smoke-projects.mjs` 的并发/过期/来源 | 当前本地审批及来源链通过 |
| T021 | `scripts/smoke-projects.mjs` 的 TODO→Done 越列拒绝 | 当前门禁通过；真实 Review/Verify 门禁 `DEFERRED_VERIFICATION` → P3-12 |
| T022 | `packages/core/tests/task-projection.test.mjs` 的多状态 fixture 与 Web 筛选 | 仅投影验证；真实多状态 Run `DEFERRED_VERIFICATION` → P3-12 |
| T023 | `packages/core/tests/task-projection.test.mjs` 和 `apps/host/tests/approvals.test.mjs` 的重复事件/原子入列 | 当前 TODO/投影去重通过 |
| T024 | `apps/web/src/components/BoardView.test.ts` 的空/Host 离线只读状态 | 细粒度只读 principal/scope `DEFERRED_VERIFICATION` → P7-08 |
| T025 | `apps/web/src/components/BoardView.test.ts`、`scripts/smoke-projects.mjs` 的键盘同列移动 | 当前 TODO 语义通过；合法跨列状态命令 `DEFERRED_VERIFICATION` → P3-12 |
| T116 | 尚无公平单 Agent/多角色对照 | `DEFERRED_VERIFICATION` → P6-09 |
| T117 | 尚无隐藏 holdout 评测集 | `DEFERRED_VERIFICATION` → P6-09 |
| T118 | 尚无策略灰度/回滚 | `DEFERRED_VERIFICATION` → P9-06 |
| T119 | 尚无正式 Run 预算执行 | `DEFERRED_VERIFICATION` → P2-05；P6-09 汇总复测 |
| T120 | 尚无 Agent 评测结果汇总 | `DEFERRED_VERIFICATION` → P6-09（P2-08 建立取消状态） |

P1 Phase Gate 的“从想法生成草稿，经人类审批进入 TODO，尚不自动写代码”在本机场景成立。用户已批准 [ADR 0018](../decisions/0018-p1-closure-acceptance-scope-conflict.md) 的阶段范围解释；`docs/deferred-verification.json` 保存每个未执行的原 Test ID、owner 与原因。权威 `tasks.json`/`acceptance-cases.json` 未改。未来任务不能把这些项当成已通过。
