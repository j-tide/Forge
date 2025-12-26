# Forge Codex Execution Playbook

> **用途**：Forge 后续开发的单一可执行实施文档。  
> **当前基线**：MIG-PY-01～09 在当前 macOS arm64 开发环境完成；Desktop 的唯一业务 Host 已切到 Python。P2-10 的 Python Host 纵向真实 Demo 与 P2 Phase Gate 已在 macOS arm64 开发路径通过；历史 Node 结果只作对照，跨平台与安装包仍未验证。  
> **执行模型**：一次只实施一个权威 Task；Autopilot 启用时完成后由 `docs/forge-codex-autopilot-protocol.md` 决定自动继续。  
> **项目边界**：ProofRun 与 Forge 当前完全独立，ProofRun 不进入 Forge 仓库、数据库、工作流或默认插件。未来如需接入，只能通过稳定的公开插件接口。  
> **工程规格优先级**：
>
> 1. 产品语义、架构、安全、契约：`forge_spec_v1.0/`
>    用户批准的 Python Core 架构覆盖其中的 Node/TypeScript Host 技术选择，不改变权威 Task/Test ID 和产品语义；见 ADR 0029。
> 2. 正式生产代码与已落地 ADR
> 3. UI 视觉：`@forge/ui` 与 glass v1.1 设计系统
> 4. 本文档仅对权威 Task 提供详细实施说明，不重定义任务 ID、依赖或 Phase Gate
>
> **重要**：本文件不是概念 Roadmap，而是 Codex 的执行手册。每一个任务都应当可以直接照着做。
>
> **架构冻结**：Electron Main 仅承担窗口、受控 OS 集成和 Python Host 生命周期；Vue/TypeScript 保留 UI、Client 和 wire 类型。Python Host 是唯一的 Task/Approval/Run/Workflow/Agent/Plugin/Executor/Context/RAG/Memory/Eval 业务 Runtime。本地使用有版本的 JSON-RPC over stdio，不开本地 FastAPI/TCP；远程 HTTP/SSE/WebSocket 是未来独立适配器。旧 Node Host/Core 仅作历史行为对照，不得作为生产 fallback。P2-10 与 P2 Phase Gate 已在当前平台通过，P3 继续保持上述边界。

---

# A. Codex 全局执行协议

每一轮都必须严格按以下顺序：

## A1. Before

1. 阅读根目录 `AGENTS.md`。
2. 阅读本文件。
3. 阅读 `docs/implementation-status.md`。
4. 阅读 `docs/compatibility-record.md`。
5. 阅读与当前任务相关 ADR。
6. 阅读 `forge_spec_v1.0` 中当前任务引用的：
   - blueprint
   - contracts
   - planning
   - acceptance cases
7. 检查 Git 状态和用户已有改动。
8. 找到本文件中第一个 `Status: TODO` 且所有 `Depends on` 都是 `DONE` 的任务。
9. 只实施这一项。

## A2. Baseline

每轮开始先执行当前适用的基线：

```bash
pnpm install --frozen-lockfile
pnpm validate:contracts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

涉及 Desktop：

```bash
pnpm smoke:desktop
```

涉及 Codex/Executor：

```bash
pnpm probe:codex
```

涉及 Workspace/Process：

运行当前已存在的 live integration test。

外部服务失败时：

- 区分产品失败与外部失败；
- 不用 Mock 结果冒充通过；
- 能继续的独立工作继续做。

## A3. Hard Rules

永远禁止：

- `git reset --hard`
- `git clean -fd`
- 强制覆盖用户已有修改
- 自动 push / publish / release
- 用假日志、假 Agent 状态、硬编码 `healthy: true` 冒充真实行为
- 为让测试通过而删除断言、降低安全设置、跳过正式源码
- 把 Renderer 直接接到 Node / Shell / DB / Executor
- 把 Electron Main 变成 Forge 业务 Runtime
- 让插件直接写 Core 内部数据库或直接推动 Task 状态
- 把 Model、Executor、Agent Profile、Workflow Stage 混为一个概念
- 将历史 Memory 当作 Task Contract 的权威来源
- 当前阶段把 ProofRun 混入 Forge

## A4. Supply Chain

新增依赖必须：

- 使用精确版本
- 更新 `versions.lock.json`
- 更新 license inventory
- 更新 compatibility record
- 检查维护状态
- 检查 install/build scripts
- 不全局放开未知安装脚本
- 不用 sudo
- 不关闭 TLS/签名/校验

## A5. UI Rules

- 生产 UI 使用 `@forge/ui`。
- glass v1.1：银白 / 浅蓝灰 / 雾面玻璃 / 深色胶囊主按钮。
- 不恢复旧深色侧栏 + 铜橙方案。
- 不直接运行参考 prototype HTML 作为产品。
- 所有运行状态必须来自真实 Host 数据。
- 不显示虚假的在线 Agent、费用、成功率、测试结果。
- Reduced Motion / Reduced Transparency 必须保留。

## A6. After

完成后必须：

1. 更新本任务 `Status`。
2. 更新 `docs/implementation-status.md`。
3. 如涉及平台/依赖能力，更新 `docs/compatibility-record.md`。
4. 如产生架构决策，新建 ADR。
5. 运行本任务要求的真实验证。
6. 按以下格式汇报：

```text
Task
Implemented
Architecture
Files
Verification
Screenshots（UI 任务）
Security / Safety
Blocked / Unverified
Not Implemented
Next
```

7. **停止，不自动执行下一任务。**

---

# B. 当前完成状态

## P0 Foundation

- P0-01 DONE — 工程基线 / workspace / CI
- P0-02 DONE — Electron Desktop + Shared Web
- P0-03 DONE — Forge Host + LocalTransport
- P0-04 DONE — SQLite / Drizzle / Migration / Persistence
- P0-05 DONE — Codex app-server Executor Spike
- P0-06 DONE — WorkspaceManager / ProcessController（macOS arm64）
- P0-07 DONE — Forge Design System / `@forge/ui`
- P0-08 DONE — Contract Validator / CI

## P0 Deferred Risks

必须持续保留：

- Windows x64 实机未验证
- macOS Intel 未验证
- Windows process tree backend 未完成
- DPI / Windows scaling 未验收
- installer / signing / notarization 未完成
- Codex 在 Electron utilityProcess Host 异常退出后的恢复未完整验收
- GitHub CI 远端运行尚需真实触发

---

# Canonical Task Map

以下编号、名称、依赖、模块、验收用例和 Phase Gate 逐项来自只读 `forge_spec_v1.0/planning/tasks.json`、`planning/phases.json`。**权威任务字段在前；文末 D 编号为旧 Playbook 的详细说明归档，按 `Applies to` 映射，不能扩张当前任务范围。** Autopilot 的持续执行由 `docs/forge-codex-autopilot-protocol.md` 控制。

# P1 — 自然语言入口与审批看板

**Phase Gate:** 从想法生成草稿，经人类审批进入TODO，尚不自动写代码。

## P1-01 项目选择与可信环境向导

**Status:** DONE
**Depends on:** P0-08
**Module:** M02
**Acceptance cases:** T006, T007, T008, T009, T010
**Paths:** `apps/web/pages/projects`, `core/projects`

### Authoritative implementation

文件选择→Git读取→Trust→检查命令确认，保存绝对规范路径与环境ID。

### Authoritative acceptance

脏目录不被修改，无Git时不自动初始化。

### Existing detailed guidance

D-001.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-02 项目及环境数据服务

**Status:** DONE
**Depends on:** P1-01
**Module:** M02
**Acceptance cases:** T006, T007, T008, T009, T010
**Paths:** `storage/projects`, `core/environments`

### Authoritative implementation

实现项目CRUD、环境/命令预设版本与归属检查；归档非删除运行记录。

### Authoritative acceptance

不同项目不可访问彼此环境，所有写操作CAS。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

### P1-02 实施细节

1. 以 Host 为 Project/Environment/CommandPreset 的唯一数据拥有者；补齐项目 CRUD、归档、版本号与每次写入的 CAS。`remove` 的 P1-01 语义仅适用于无关联记录的初始阶段；本任务必须对已有记录使用保留历史的归档策略。
2. 按 `contracts/schema.sql` 的 `projects`、`environments`、`command_presets` 最小字段扩展生产 migration。保存环境与命令预设的 revision、projectId 归属；跨项目引用一律拒绝。不要一次引入 Task/Run 等未来业务表。
3. 命令预设使用 `executable + argv[] + cwdRelative + envRefs + timeoutSeconds`，明确检测结果与用户确认的配置版本；不执行项目脚本。参考 `contracts/openapi.yaml` 的 `EnvironmentSave`、`CommandPresetSave/Approve`，旧字段与现有生产模型的差异先写 ADR。
4. 用户所选项目路径仍由 P1-01 的 Desktop picker 授权，Host 重验路径；Renderer 只通过固定 ForgeClient/Host 命令读写数据。所有 Command payload/output 用严格 Schema，错误不泄漏用户路径或凭据。
5. 用两个独立真实 fixture Project 验证归属隔离、并发 CAS、版本持久化、重启恢复与归档后只读历史。保证归档不删除源码，探测不执行命令。P1-02 的验收以“不同项目不可访问彼此环境，所有写操作 CAS”为准。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-03 会话与消息流

**Status:** DONE
**Depends on:** P1-02
**Module:** M03
**Acceptance cases:** T011, T012, T013, T014, T015
**Paths:** `core/conversations`, `web/chat`

### Authoritative implementation

持久化消息、流式输出、失败重试；保留草稿输入，Markdown净化。

### Authoritative acceptance

重复请求不产生重复消息；失败保留用户原文。

### Existing detailed guidance

D-003.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-04 整理器与结构化任务生成

**Status:** DONE
**Depends on:** P1-03
**Module:** M03
**Acceptance cases:** T011, T012, T013, T014, T015
**Paths:** `plugins/refiner`, `core/drafts`

### Authoritative implementation

实现意图分类、受限读项目、TaskContract输出与最多两次Schema修复。

### Authoritative acceptance

典型feature/bug能生成草稿；模糊事项保留问题，无写代码工具。

### Existing detailed guidance

D-002, D-004.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-05 草稿编辑与澄清

**Status:** DONE
**Depends on:** P1-04
**Module:** M04
**Acceptance cases:** T016, T017, T018, T019, T020
**Paths:** `web/draft-sheet`, `core/task-revisions`

### Authoritative implementation

每次确认修改产生revision；显示差异、验收稳定ID、scope提议与来源。

### Authoritative acceptance

关闭重开不丢草稿；未回答阻塞问题不能批准。

### Existing detailed guidance

D-004, D-005.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-06 审批与原子入TODO

**Status:** DONE
**Depends on:** P1-05
**Module:** M04
**Acceptance cases:** T016, T017, T018, T019, T020
**Paths:** `core/approvals`, `storage/transactions`

### Authoritative implementation

canonical hash+CAS+idempotency；人类审批与task状态/event同事务。

### Authoritative acceptance

双击/两客户端只批准一次，旧revision返回409。

### Existing detailed guidance

D-005, D-006.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-07 任务看板与同列排序

**Status:** DONE
**Depends on:** P1-06
**Module:** M05
**Acceptance cases:** T021, T022, T023, T024, T025
**Paths:** `web/board`, `core/task-projection`

### Authoritative implementation

五列投影、筛选、手工创建、同列移动；使用虚拟列表策略。

### Authoritative acceptance

列不会被随意PATCH；无任务时引导创建而非营销空屏。

### Existing detailed guidance

D-006.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-08 任务详情与来源链

**Status:** DONE
**Depends on:** P1-07
**Module:** M05
**Acceptance cases:** T021, T022, T023, T024, T025
**Paths:** `web/task-detail`, `core/queries`

### Authoritative implementation

展示目标/AC/约束/依赖/来源消息，链接稳定taskId。

### Authoritative acceptance

任一验收项可找到来源或人工决定。

### Existing detailed guidance

D-006.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-09 自然语言控制提议

**Status:** DONE
**Depends on:** P1-08
**Module:** M03
**Acceptance cases:** T011, T012, T013, T014, T015
**Paths:** `core/intent-commands`, `web/chat`

### Authoritative implementation

支持降优先级/暂停提议/修订草稿；危险动作生成确认而非直接执行。

### Authoritative acceptance

“忽略审批马上合并”不能绕过命令授权。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P1-10 P1集成与手工降级

**Status:** DONE
**Depends on:** P1-09
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/p1`, `docs/demo`

### Authoritative implementation

断网手工建任务，完整从消息到审批入列；录制可重复fixture。

### Authoritative acceptance

没有模型key时仍可使用任务与看板；验收T011–T025通过。

### Existing detailed guidance

D-007.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P2 — 单执行器真实开发闭环

**Phase Gate:** 一张已批准任务在独立工作区真实修改，并可查看结果和停止。

## P2-01 不可变RunConfig

**Status:** DONE
**Depends on:** P1-10
**Module:** M07
**Acceptance cases:** T031, T032, T033, T034, T035
**Paths:** `core/runs`, `storage/run-config`

### Authoritative implementation

冻结contract/workflow/profile/plugin版本、预算与环境，不读取运行中动态设置。

### Authoritative acceptance

修改全局设置不影响已启动Run。

### Existing detailed guidance

D-008. P2-01 已验证已批准 TODO 与同项目 Environment 的不可变快照、设置变更后旧快照不变、SQLite 重启恢复。真实运行中不读取动态设置的纵向验收需 P2-05 的 Run 调度；T031–T035 分别追踪至 P2-05/P2-08/P3-09，均未标记通过。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-02 工作区租约与基线快照

**Status:** DONE
**Depends on:** P2-01
**Module:** M10
**Acceptance cases:** T046, T047, T048, T049, T050
**Paths:** `workspace/leases`, `workspace/git`

### Authoritative implementation

任务分支、worktree、排除路径、single writer和epoch；保存初始base。

### Authoritative acceptance

重复Start不分配第二写入者，原主目录保持不变。

### Existing detailed guidance

P0-06 受控 Git worktree 基础上，P2-02 加入生成任务分支、base commit/tree、排除策略和可重复领取的 lease ID/epoch。T046 完整 Attempt、T047/T049 快照及 T050 合并重验在对应后续任务保留追踪，当前未标为通过。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-03 ExecutorAdapter公共接口

**Status:** DONE
**Depends on:** P2-02
**Module:** M09
**Acceptance cases:** T041, T042, T043, T044, T045
**Paths:** `plugin-api`, `contracts/events`

### Authoritative implementation

落实start/probe/cancel/optional resume以及标准事件；任何upstream输出先校验。

### Authoritative acceptance

单元测试覆盖乱序/重复/非法输出。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-04 Codex真实写入适配

**Status:** DONE
**Depends on:** P2-03
**Module:** M09
**Acceptance cases:** T041, T042, T043, T044, T045
**Paths:** `plugins/executor-codex`

### Authoritative implementation

使用P0验证的SDK组合；工作范围与账号明确；收集结果和native sessionRef。

### Authoritative acceptance

在演示仓库完成一项真实功能，无假事件。

### Existing detailed guidance

D-011.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-05 运行调度与Attempt

**Status:** DONE
**Depends on:** P2-04
**Module:** M07
**Acceptance cases:** T031, T032, T033, T034, T035
**Paths:** `core/scheduler`, `core/attempts`

### Authoritative implementation

实现queued→running→terminal，启动intent先落盘；timeout和事件epoch检查。

### Authoritative acceptance

旧Attempt回包不会污染新Run。

### Existing detailed guidance

D-008.

Host 内部 one-node 调度器、SQLite queued intent/Attempt/lease 事务及隔离 Codex 真运行构成本任务证据；正式 Renderer Start 与 workflow/profile/plugin 内容解析仍无生产入口。见 ADR 0023。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-06 工作记忆与ContextBundle

**Status:** DONE
**Depends on:** P2-05
**Module:** M15
**Acceptance cases:** T071, T072, T073, T074, T075
**Paths:** `core/context`, `storage/checkpoints`

### Authoritative implementation

保存当前目标/已做动作/问题/预算；为执行器构建带来源的输入包。

### Authoritative acceptance

不用完整历史无限拼接；恢复能解释进度但不假定进程还在。

### Existing detailed guidance

D-010.

P2-06 当前 Run 的有界 checkpoint、批准 Task/观察分级来源与真实隔离 Codex 输入包已验证；T071–T075 的项目记忆生命周期按 ADR 0024 映射至 P5-09/P5-10，不作为已通过测试。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-07 Diff与初版运行详情

**Status:** DONE
**Depends on:** P2-06
**Module:** M13
**Acceptance cases:** T061, T062, T063, T064, T065
**Paths:** `web/run`, `web/diff`, `artifacts`

### Authoritative implementation

流式日志限流、文件树、文本diff、usage未知态和上下文来源。

### Authoritative acceptance

终端输出不能执行HTML/脚本，UI状态来自真实事件。

### Existing detailed guidance

D-012.

P2-07 的只读 Run 观察、事件游标、限流/脱敏、文本 Diff、未知费用和真实 Electron 展示在 macOS arm64 通过。T064 中正式 Artifact 报告脚本注入需 P2-09 产物，按 ADR 0025 保留 deferred 引用；Activity/Diff 文本渲染已有恶意 HTML 测试。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-08 取消、停止与超时

**Status:** DONE
**Depends on:** P2-07
**Module:** M07
**Acceptance cases:** T031, T032, T033, T034, T035
**Paths:** `process/manager`, `core/cancel`

### Authoritative implementation

先暂停调度再取消进程树，无法确认退出时隔离workspace。

### Authoritative acceptance

取消后没有继续写文件；未知状态不宣称成功。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-09 开发结果与交接快照

**Status:** DONE
**Depends on:** P2-08
**Module:** M10
**Acceptance cases:** T046, T047, T048, T049, T050
**Paths:** `workspace/snapshot`, `core/handoff`

### Authoritative implementation

将允许的变更固化snapshot，保存摘要/未完成项/artifact引用。

### Authoritative acceptance

新增文件被捕获，secret扫描阻断敏感文件进入产物。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P2-10 P2纵向真实Demo

**Status:** DONE
**Depends on:** P2-09
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/p2`, `fixtures/orders`

### Authoritative implementation

输入任务→批准→启动→真实修改→Diff→停止/完成；保存人工检查结果。

### Authoritative acceptance

至少一次真实模型成功和一次失败可完整追溯。

### Existing detailed guidance

D-015.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P3 — 审查、验证、返工与恢复

**Phase Gate:** 以任务版本和快照为依据形成可验收交付，不把绿灯当证据。

## P3-01 审查副本与权限

**Status:** DONE
**Depends on:** P2-10
**Module:** M10
**Acceptance cases:** T046, T047, T048, T049, T050
**Paths:** `workspace/review-copy`, `policy`

### Authoritative implementation

在固定snapshot创建审查副本；验证真实只读能力，不支持则明确阻断。

### Authoritative acceptance

Reviewer不能静默改变被审实现。

### Existing detailed guidance

D-016.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-02 Review Profile与结果Schema

**Status:** DONE
**Depends on:** P3-01
**Module:** M11
**Acceptance cases:** T051, T052, T053, T054, T055
**Paths:** `presets/agents`, `core/review`

### Authoritative implementation

独立上下文、阻塞/建议、文件anchor、来源AC及不确定项。

### Authoritative acceptance

无结果/非法结果不能approved。

### Existing detailed guidance

D-016.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-03 问题列表与退回交接

**Status:** DONE
**Depends on:** P3-02
**Module:** M11
**Acceptance cases:** T051, T052, T053, T054, T055
**Paths:** `web/review`, `core/issues`

### Authoritative implementation

Issue关联snapshot和attempt，生成new develop handoff，不复制全部聊天。

### Authoritative acceptance

同问题可追溯每次修复，不重复膨胀卡片。

### Existing detailed guidance

D-017.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-04 命令验证器

**Status:** DONE
**Depends on:** P3-03
**Module:** M12
**Acceptance cases:** T056, T057, T058, T059, T060
**Paths:** `plugins/verifier-project`

### Authoritative implementation

按批准argv/cwd/env执行build/typecheck/test；解析exit与报告并保存证据。

### Authoritative acceptance

stdout含PASS但exit!=0仍失败；无测试为not_configured。

### Existing detailed guidance

D-013, D-018.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-05 验收矩阵

**Status:** DONE
**Depends on:** P3-04
**Module:** M12
**Acceptance cases:** T056, T057, T058, T059, T060
**Paths:** `web/verify`, `core/acceptance`

### Authoritative implementation

每条required AC对应自动/人工状态，支持人工风险接受与未验证说明。

### Authoritative acceptance

未覆盖必需项不能静默完成。

### Existing detailed guidance

D-019.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-06 有限返工循环

**Status:** DONE
**Depends on:** P3-05
**Module:** M07
**Acceptance cases:** T031, T032, T033, T034, T035
**Paths:** `core/rework`

### Authoritative implementation

Review/Verify失败新Attempt，共享全局重做计数；新快照失效旧后继。

### Authoritative acceptance

无限循环被阻止，达到阈值转blocked。

### Existing detailed guidance

D-014, D-017.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-07 人类最终验收

**Status:** DONE
**Depends on:** P3-06
**Module:** M04
**Acceptance cases:** T016, T017, T018, T019, T020
**Paths:** `core/approval-accept`, `web/accept`

### Authoritative implementation

审批绑定当前contract+snapshot+reports；要求fresh读取。

### Authoritative acceptance

旧快照上的确认被拒绝。

### Existing detailed guidance

D-020.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-08 交付记录与显式合并

**Status:** DONE
**Depends on:** P3-07
**Module:** M12
**Acceptance cases:** T056, T057, T058, T059, T060
**Paths:** `core/delivery`, `core/merge`

### Authoritative implementation

Done与merged分开；合并先operation intent并绑定targetHead；冲突不force。

### Authoritative acceptance

重复命令不重复合并，目标变化要求重验。

### Existing detailed guidance

D-021.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-09 崩溃恢复与reconcile

**Status:** DONE
**Depends on:** P3-08
**Module:** M07
**Acceptance cases:** T031, T032, T033, T034, T035
**Paths:** `core/recovery`, `host/startup`

### Authoritative implementation

核对PID/startTime/session/lease，原生能力允许才resume，否则interrupted。

### Authoritative acceptance

在副作用前后注入崩溃均不会盲目重跑。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

P3-09 实施记录：Python Host 启动时将旧 Run 的未知结果转为 interrupted、隔离 lease 并审计；merge intent 只按 Git 精确父提交对账，不自动重跑。隔离进程在合并前/候选提交后/目标分支更新后真实崩溃的测试、重复结果/旧 epoch 测试与原有 429/进程树测试通过。见 ADR 0044；历史进程的安全自动接管并未声明支持。

---

## P3-10 配置/需求变化失效链

**Status:** DONE
**Depends on:** P3-09
**Module:** M04
**Acceptance cases:** T016, T017, T018, T019, T020
**Paths:** `core/revisions`, `core/invalidation`

### Authoritative implementation

新revision保留旧run；pendingChange按安全点处理；报告变stale。

### Authoritative acceptance

开发中更改目标不偷偷污染当前上下文。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

P3-10 实施记录：Python Host 的获批 Task 新版本为独立持久提议与二次明确批准；活跃 Run/Review/Verify/返工时等待安全点并要求再次应用，不更改旧 RunConfig。新版本使旧快照的当前验收、Done、Review/Verify 启动失效，历史证据和来源仍可查。隔离 Git/SQLite、独立 Host 重启及 Vue 测试通过。见 ADR 0045。

---

## P3-11 备份与磁盘故障处理

**Status:** DONE
**Depends on:** P3-10
**Module:** M18
**Acceptance cases:** T086, T087, T088, T089, T090
**Paths:** `storage/backup`, `artifacts/store`

### Authoritative implementation

一致性备份、迁移前检查、空间不足只读诊断。

### Authoritative acceptance

故障后已批准任务可恢复，WAL未遗漏。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P3-12 P3可交付验收样例

**Status:** DONE
**Depends on:** P3-11
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/p3`, `docs/demo`

### Authoritative implementation

正常路径、Review退回、测试失败、人工豁免、崩溃恢复各跑一次。

### Authoritative acceptance

一张TODO到Done可追溯全链，必需测试通过。

### Existing detailed guidance

D-022.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P4 — 插件体系与第二执行器

**Phase Gate:** 用真实第二实现证明能力可替换，而不是只抽空接口。

## P4-01 Manifest和版本解析

**Status:** DONE
**Depends on:** P3-12
**Module:** M08
**Acceptance cases:** T036, T037, T038, T039, T040
**Paths:** `plugin-host/manifest`

### Authoritative implementation

加载前Schema、apiRange、平台、配置和source检查，不执行未授权entry。

### Authoritative acceptance

错误清单无代码副作用。

### Existing detailed guidance

D-023, D-030.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-02 Registry与DisposableScope

**Status:** DONE
**Depends on:** P4-01
**Module:** M08
**Acceptance cases:** T036, T037, T038, T039, T040
**Paths:** `plugin-host/registry`

### Authoritative implementation

服务注册、重复名检查、依赖拓扑、资源逆序清理。

### Authoritative acceptance

半激活失败不泄露监听器/服务。

### Existing detailed guidance

D-023, D-030.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-03 内置插件装配与锁

**Status:** DONE
**Depends on:** P4-02
**Module:** M08
**Acceptance cases:** T036, T037, T038, T039, T040
**Paths:** `host/bootstrap`, `plugins.lock`

### Authoritative implementation

内置列表精确版本/摘要，Run绑定插件版本；draining停用。

### Authoritative acceptance

运行中更新不会换掉adapter。

### Existing detailed guidance

D-023, D-024.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-04 配置生成表单

**Status:** DONE
**Depends on:** P4-03
**Module:** M22
**Acceptance cases:** T106, T107, T108, T109, T110
**Paths:** `web/plugins`, `ui/schema-form`

### Authoritative implementation

从configSchema生成表单、secret字段凭据引用、兼容提示。

### Authoritative acceptance

未知字段不提交，密钥不回显。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-05 Claude SDK真实适配

**Status:** BLOCKED
**Depends on:** P4-04
**Module:** M09
**Acceptance cases:** T041, T042, T043, T044, T045
**Paths:** `plugins/executor-claude`

### Authoritative implementation

使用官方API-key方式集成，运行同一Executor合约测试，不偷用订阅登录。

### Authoritative acceptance

与Codex切换不用改Core；至少一真实任务可交付。

### Existing detailed guidance

D-025.

2026-09-24：已固定官方 Python SDK 0.2.159，并在 macOS arm64 用受控子进程读取随包 CLI 2.1.281 版本；这只是离线供应链探测。用户暂无 Anthropic API Key，且明确要求暂不做此部分真实验收。依据 [ADR 0052](decisions/0052-claude-sdk-api-key-gate.md)，未激活 Claude Adapter，未将 T041～T045 或真实交付标为通过。恢复条件为用户在仓库外配置授权 API Key，并批准有成本上限的独立 fixture；不得借用订阅登录。P4-06 依赖本项，暂不可执行。

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-06 Agent Profile与能力选择

**Status:** TODO
**Depends on:** P4-05
**Module:** M09
**Acceptance cases:** T041, T042, T043, T044, T045
**Paths:** `core/profiles`, `web/agents`

### Authoritative implementation

模型/执行器/角色分离；灰掉不兼容组合；角色prompt和权限版本化。

### Authoritative acceptance

只读/网络/审批要求无法满足则无法启动。

### Existing detailed guidance

D-026.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-07 ModelProvider与整理器替换

**Status:** TODO
**Depends on:** P4-06
**Module:** M03
**Acceptance cases:** T011, T012, T013, T014, T015
**Paths:** `plugins/model-provider`, `refiner`

### Authoritative implementation

抽流式文本/结构化输出/usage、明确每个provider认证；capability检测。

### Authoritative acceptance

关闭一provider不破坏看板，手工Draft仍可用。

### Existing detailed guidance

D-002.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-08 工具/MCP入口契约

**Status:** TODO
**Depends on:** P4-07
**Module:** M16
**Acceptance cases:** T076, T077, T078, T079, T080
**Paths:** `plugin-api/tools`, `plugin-host/tools`

### Authoritative implementation

实现受控ToolRegistry和mock MCP契约测试；v1默认不开任意外部MCP。

### Authoritative acceptance

工具注册不授予权限，注入指令不能触发审批。

### Existing detailed guidance

D-031.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-09 插件故障隔离与诊断

**Status:** TODO
**Depends on:** P4-08
**Module:** M08
**Acceptance cases:** T036, T037, T038, T039, T040
**Paths:** `host/plugin-supervisor`, `web/diagnostics`

### Authoritative implementation

捕获激活/运行/卸载错误，显示具体pluginId与Run影响。

### Authoritative acceptance

插件失败UI保持可用，核心事件可读。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P4-10 P4替换性验收

**Status:** TODO
**Depends on:** P4-09
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/plugins`, `docs/plugin-authoring`

### Authoritative implementation

同TODO分别跑两个真实执行器、卸载上下文、替换验证器fixture。

### Authoritative acceptance

不修改Core达到替换，形成插件开发说明。

### Existing detailed guidance

D-032.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P5 — 流程定制、知识与项目记忆

**Phase Gate:** 默认模板与高级编辑共用同一执行定义，补齐上下文与经验边界。

## P5-01 标准/快速/严格模板

**Status:** TODO
**Depends on:** P4-10
**Module:** M06
**Acceptance cases:** T026, T027, T028, T029, T030
**Paths:** `presets/workflows`

### Authoritative implementation

标准全流程，快速可省Plan但保留验收，严格增加人类门禁；Schema统一。

### Authoritative acceptance

所有模板能编译且终点有验收。

### Existing detailed guidance

D-009, D-010, D-027.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-02 Workflow编译器

**Status:** TODO
**Depends on:** P5-01
**Module:** M06
**Acceptance cases:** T026, T027, T028, T029, T030
**Paths:** `core/workflow/compiler`

### Authoritative implementation

DAG可达/唯一/绑定/输出/能力/预算/返工规则静态校验，条件DSL无eval。

### Authoritative acceptance

非法环和缺插件在启动前阻止。

### Existing detailed guidance

D-008, D-009.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-03 线性配置编辑体验

**Status:** TODO
**Depends on:** P5-02
**Module:** M06
**Acceptance cases:** T026, T027, T028, T029, T030
**Paths:** `web/workflows`

### Authoritative implementation

增删/排序节点、绑定agent/verifier、失败路径、保存草稿与发布。

### Authoritative acceptance

非工程用户无需画图可改流程。

### Existing detailed guidance

D-028.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-04 高级画布编辑

**Status:** TODO
**Depends on:** P5-03
**Module:** M06
**Acceptance cases:** T026, T027, T028, T029, T030
**Paths:** `web/workflow-builder`

### Authoritative implementation

Vue Flow显示同一DSL，布局数据与语义分离；v1并行写禁止。

### Authoritative acceptance

画布导入导出往返不丢语义，错误高亮到节点。

### Existing detailed guidance

D-029.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-05 工作流版本冻结

**Status:** TODO
**Depends on:** P5-04
**Module:** M07
**Acceptance cases:** T031, T032, T033, T034, T035
**Paths:** `core/workflow/versioning`

### Authoritative implementation

草稿与published不可变，RunConfig保留hash；影响范围预览。

### Authoritative acceptance

旧Run继续旧流程，新Run用新版本。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-06 知识导入与原文定位

**Status:** TODO
**Depends on:** P5-05
**Module:** M14
**Acceptance cases:** T066, T067, T068, T069, T070
**Paths:** `context/ingestion`, `web/knowledge`

### Authoritative implementation

先支持Markdown/TXT/OpenAPI文本；白名单目录/大小；结构切分和hash。

### Authoritative acceptance

引用能回到原文范围，导入失败可重试。

### Existing detailed guidance

D-033.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-07 FTS与中文检索

**Status:** TODO
**Depends on:** P5-06
**Module:** M14
**Acceptance cases:** T066, T067, T068, T069, T070
**Paths:** `context/retrieval`, `tests/rag`

### Authoritative implementation

project/env/version过滤后关键词搜索，中文分词/字符索引回归集。

### Authoritative acceptance

跨项目0返回；代码symbol可找；无答案不编造。

### Existing detailed guidance

D-034.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-08 Context Builder预算与冲突

**Status:** TODO
**Depends on:** P5-07
**Module:** M14
**Acceptance cases:** T066, T067, T068, T069, T070
**Paths:** `core/context-builder`

### Authoritative implementation

按权威顺序组装、截断标记、source清单、冲突追问。

### Authoritative acceptance

不足时明确显示，不以过期记忆覆盖合同。

### Existing detailed guidance

D-031, D-036.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-09 项目记忆生命周期

**Status:** TODO
**Depends on:** P5-08
**Module:** M15
**Acceptance cases:** T071, T072, T073, T074, T075
**Paths:** `core/memory`, `storage/memory`

### Authoritative implementation

candidate→validated→stale/revoked；scope与expires，验证来源强制。

### Authoritative acceptance

未经确认经验不能直接作为验收标准。

### Existing detailed guidance

D-037, D-038.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-10 知识/记忆管理页面

**Status:** TODO
**Depends on:** P5-09
**Module:** M15
**Acceptance cases:** T071, T072, T073, T074, T075
**Paths:** `web/knowledge`, `web/memory`

### Authoritative implementation

导入、检索预览、查看来源、确认/撤销、清缓存和影响说明。

### Authoritative acceptance

删除原文同步索引与缓存；既有Run显示来源撤销。

### Existing detailed guidance

D-039.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-11 流程与检索集成测试

**Status:** TODO
**Depends on:** P5-10
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/p5`

### Authoritative implementation

同任务切工作流/agent，带知识运行，冲突/无答案/引用失效场景。

### Authoritative acceptance

所有配置能解释实际运行来源。

### Existing detailed guidance

D-040.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P5-12 P5文档与迁移

**Status:** TODO
**Depends on:** P5-11
**Module:** M18
**Acceptance cases:** T086, T087, T088, T089, T090
**Paths:** `docs`, `migrations`

### Authoritative implementation

更新Schema/OpenAPI/用户说明，迁移已存在P3/P4数据库并保留历史。

### Authoritative acceptance

升级后旧任务可读，DSL版本不兼容时有诊断。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P6 — 跨端Desktop v1.0产品化

**Phase Gate:** 以完整可用而非功能演示为目标，交付两个平台安装包。

## P6-01 全页面视觉一致性

**Status:** TODO
**Depends on:** P5-12
**Module:** M22
**Acceptance cases:** T106, T107, T108, T109, T110
**Paths:** `apps/web`, `packages/ui`

### Authoritative implementation

对照原型完成所有P6页面，亮暗主题、空/忙/失败/无权限状态。

### Authoritative acceptance

关键布局/配色/层级与设计Token一致，无占位按钮。

### Existing detailed guidance

D-041.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-02 键盘、可访问性与DPI

**Status:** TODO
**Depends on:** P6-01
**Module:** M22
**Acceptance cases:** T106, T107, T108, T109, T110
**Paths:** `ui/a11y`, `tests/ui`

### Authoritative implementation

Ctrl/Cmd快捷键、焦点陷阱、屏幕阅读标签、减少动画、中文排版。

### Authoritative acceptance

1280/1600与100/125/150%DPI验收。

### Existing detailed guidance

D-046.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-03 应用预览与代码浏览

**Status:** TODO
**Depends on:** P6-02
**Module:** M17
**Acceptance cases:** T081, T082, T083, T084, T085
**Paths:** `desktop/preview`, `web/artifacts`

### Authoritative implementation

预览独立webContents且无preload；允许origin白名单；diff只读。

### Authoritative acceptance

被测网页无法访问Host API。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-04 诊断、隐私与清理

**Status:** TODO
**Depends on:** P6-03
**Module:** M23
**Acceptance cases:** T111, T112, T113, T114, T115
**Paths:** `web/settings`, `host/diagnostics`

### Authoritative implementation

敏感字段脱敏、artifact保留期、手动导出/清理、usage透明。

### Authoritative acceptance

导出包不含凭据，清理不删除用户主仓库。

### Existing detailed guidance

D-002, D-042, D-047, D-063.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-05 应用退出与托盘生命周期

**Status:** TODO
**Depends on:** P6-04
**Module:** M01
**Acceptance cases:** T001, T002, T003, T004, T005
**Paths:** `desktop/lifecycle`

### Authoritative implementation

关闭窗口继续后台的显式选项、彻底退出安全取消、睡眠提示。

### Authoritative acceptance

用户知道任务是否仍运行，重开不重复Host。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-06 Mac签名/公证包

**Status:** TODO
**Depends on:** P6-05
**Module:** M23
**Acceptance cases:** T111, T112, T113, T114, T115
**Paths:** `build/macos`, `CI`

### Authoritative implementation

arm64/x64平台测试、代码签名、公证；无凭据只产标注内部包。

### Authoritative acceptance

全新Mac用户目录可安装，升级后凭据仍可用。

### Existing detailed guidance

D-043.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-07 Windows安装与签名

**Status:** TODO
**Depends on:** P6-06
**Module:** M23
**Acceptance cases:** T111, T112, T113, T114, T115
**Paths:** `build/windows`, `CI`

### Authoritative implementation

x64签名安装、权限/UAC、中文路径、卸载保留数据策略。

### Authoritative acceptance

Windows实机完整跑一任务，不能只测网页。

### Existing detailed guidance

D-044, D-045.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-08 安全更新与数据迁移

**Status:** TODO
**Depends on:** P6-07
**Module:** M18
**Acceptance cases:** T086, T087, T088, T089, T090
**Paths:** `host/updater`, `storage`

### Authoritative implementation

更新任务drain、完整性检查、迁移备份、失败恢复、降级检测。

### Authoritative acceptance

旧schema不被新版本半迁移；中断可恢复。

### Existing detailed guidance

D-047.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-09 完整功能/Agent对照验收

**Status:** TODO
**Depends on:** P6-08
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/release`, `evals`

### Authoritative implementation

执行T001–T095及T106–T120适用项；真实任务重复测并记录人工介入。

### Authoritative acceptance

失败项无假通过；高危/数据损坏0遗留。

### Existing detailed guidance

D-048.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P6-10 v1.0用户指南与发布说明

**Status:** TODO
**Depends on:** P6-09
**Module:** M23
**Acceptance cases:** T111, T112, T113, T114, T115
**Paths:** `docs/user-guide`, `release`

### Authoritative implementation

安装、配置、第一任务、权限、恢复、限制、已测支持矩阵。

### Authoritative acceptance

另一台电脑按指南可完成需求到交付。

### Existing detailed guidance

D-048.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P7 — 远程宿主与安全网关

**Phase Gate:** 保持核心不变，给在线Windows/Mac主机增加受控远程入口。

## P7-01 Host常驻模式

**Status:** TODO
**Depends on:** P6-10
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `host/lifecycle`, `desktop/settings`

### Authoritative implementation

允许无窗口托盘运行；明确用户会话/睡眠限制；退出关闭服务。

### Authoritative acceptance

远端UI离线不影响已在Host确认的Run。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-02 HTTPS入口和网关配置

**Status:** TODO
**Depends on:** P7-01
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `host/gateway`, `docs/remote`

### Authoritative implementation

本地loopback端口+显式私网HTTPS部署说明，同源静态PWA和API。

### Authoritative acceptance

默认远程关闭，裸公网端口不存在。

### Existing detailed guidance

D-050.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-03 设备配对生命周期

**Status:** TODO
**Depends on:** P7-02
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `core/devices`, `web/devices`

### Authoritative implementation

nonce≥128位/10min/hash、local confirm、单次消费与设备项目scope。

### Authoritative acceptance

重放/过期/暴力请求被拒绝。

### Existing detailed guidance

D-051.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-04 会话与CSRF

**Status:** TODO
**Depends on:** P7-03
**Module:** M17
**Acceptance cases:** T081, T082, T083, T084, T085
**Paths:** `gateway/auth`

### Authoritative implementation

HttpOnly Secure cookie、会话rotate、Origin验证、CSRF token、revoke。

### Authoritative acceptance

跨站请求及已撤销session无权限。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-05 Command HTTP适配

**Status:** TODO
**Depends on:** P7-04
**Module:** M19
**Acceptance cases:** T091, T092, T093, T094, T095
**Paths:** `gateway/commands`

### Authoritative implementation

公开白名单业务命令映射同CommandBus；忽略客户端actor与scopes。

### Authoritative acceptance

远端无法executeShell/installPlugin/writeCredential。

### Existing detailed guidance

D-049.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-06 SSE增量订阅

**Status:** TODO
**Depends on:** P7-05
**Module:** M19
**Acceptance cases:** T091, T092, T093, T094, T095
**Paths:** `gateway/events`

### Authoritative implementation

cookie认证、心跳、项目过滤、cursor恢复、backpressure、revocation。

### Authoritative acceptance

重连重复事件不会重复状态/动作。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-07 远端权限与审批freshness

**Status:** TODO
**Depends on:** P7-06
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `policy/remote`, `core/approvals`

### Authoritative implementation

每次批准重新读取revision/hash，手机允许范围收窄。

### Authoritative acceptance

旧批准409，敏感默认只允许本地主机。

### Existing detailed guidance

D-052.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-08 远程连接管理页面

**Status:** TODO
**Depends on:** P7-07
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `web/devices`, `desktop/remote`

### Authoritative implementation

Host地址/状态/证书入口说明/设备撤销/只读模式/审计。

### Authoritative acceptance

不能把在线网关显示为执行器一定在线。

### Existing detailed guidance

D-049.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-09 弱网与Host崩溃测试

**Status:** TODO
**Depends on:** P7-08
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/remote`

### Authoritative implementation

断流、sleep、token过期、两设备抢审批、进程崩溃与revocation。

### Authoritative acceptance

无离线审批补发，恢复状态一致。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P7-10 远程试用指南与安全闸门

**Status:** TODO
**Depends on:** P7-09
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `docs/remote-runbook`

### Authoritative implementation

示例网络只是参考；检查私网访问、TLS、权限与撤销后开放P8。

### Authoritative acceptance

手机在真实另一网络经私网连接通过，不伪称公网通用。

### Existing detailed guidance

D-057.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P8 — 手机PWA Companion

**Phase Gate:** 在小屏完成查看、澄清、审批、开始/暂停和取消，执行仍在Host。

## P8-01 移动App布局与路由

**Status:** TODO
**Depends on:** P7-10
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `apps/web/mobile`

### Authoritative implementation

≤767切移动导航；Inbox优先，任务详情为整页，不缩小Desktop三栏。

### Authoritative acceptance

390×844与横屏页面清晰、44px点击区。

### Existing detailed guidance

D-053.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-02 设备连接与配对UI

**Status:** TODO
**Depends on:** P8-01
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `mobile/connect`

### Authoritative implementation

扫码/输入、等待主机确认、错误/过期/撤销状态。

### Authoritative acceptance

配对成功不暴露长期token，退出清session。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-03 待处理与任务列表

**Status:** TODO
**Depends on:** P8-02
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `mobile/inbox`, `mobile/tasks`

### Authoritative implementation

优先展示待我批准/阻塞，筛选项目/Host，cursor分页。

### Authoritative acceptance

离线标时间和只读，不能显示假实时。

### Existing detailed guidance

D-054.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-04 移动任务详情与Diff摘要

**Status:** TODO
**Depends on:** P8-03
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `mobile/task-detail`

### Authoritative implementation

目标、AC、活动、折叠diff/证据，支持纯文本与跳转文件。

### Authoritative acceptance

敏感/无权限产物不返回，超大diff按页加载。

### Existing detailed guidance

D-055.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-05 移动审批与危险确认

**Status:** TODO
**Depends on:** P8-04
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `mobile/approval`

### Authoritative implementation

先刷新scopeHash，展示权限/快照变化，再确认；重复点击幂等。

### Authoritative acceptance

过期与版本变化拒绝，用户必须重新审阅。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-06 移动聊天与修订草稿

**Status:** TODO
**Depends on:** P8-05
**Module:** M03
**Acceptance cases:** T011, T012, T013, T014, T015
**Paths:** `mobile/chat`

### Authoritative implementation

自然语言建草稿、补充信息、修订；离线仅存消息草稿。

### Authoritative acceptance

不会通过service worker重放审批/开始命令。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-07 PWA安装与缓存策略

**Status:** TODO
**Depends on:** P8-06
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `web/sw`, `manifest`

### Authoritative implementation

缓存静态壳与允许只读摘要；/api写入/证据敏感数据不缓存。

### Authoritative acceptance

清缓存不丢Host数据，设备撤销后本机缓存可清。

### Existing detailed guidance

D-053.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-08 断线重连与通知入口

**Status:** TODO
**Depends on:** P8-07
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `client/remote-transport`

### Authoritative implementation

重连snapshot+cursor；通知初版为站内列表，不承诺后台推送。

### Authoritative acceptance

手机关页后Host继续；重开显示最新权威状态。

### Existing detailed guidance

D-056.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-09 iOS/Android浏览器实测

**Status:** TODO
**Depends on:** P8-08
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `tests/mobile`

### Authoritative implementation

Safari与Chromium、不同网络、输入法、横竖屏、登录过期。

### Authoritative acceptance

每端真实批准一次当前任务并拒绝旧审批。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P8-10 v1.1发布与Capacitor预留

**Status:** TODO
**Depends on:** P8-09
**Module:** M23
**Acceptance cases:** T111, T112, T113, T114, T115
**Paths:** `docs/mobile`, `platform-bridge`

### Authoritative implementation

交付PWA用户指南；定义push/secureStore/scanner接口，原生实现后续。

### Authoritative acceptance

不将PWA包装成已经上架原生App。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# P9 — 可选增强与持续扩展

**Phase Gate:** 只在Desktop和远程稳定后做，不阻塞v1.0/v1.1。

## P9-01 只读并行Review

**Status:** DEFERRED
**Depends on:** P8-10
**Module:** M06
**Acceptance cases:** T026, T027, T028, T029, T030
**Paths:** `core/parallel`

### Authoritative implementation

fork仅固定snapshot只读节点；join收齐/超时后按明确规则汇总。

### Authoritative acceptance

两个Reviewer不共同写源代码，失败不以多数票隐藏。

### Existing detailed guidance

D-058, D-059.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-02 独立写分支与集成节点

**Status:** DEFERRED
**Depends on:** P9-01
**Module:** M10
**Acceptance cases:** T046, T047, T048, T049, T050
**Paths:** `workspace/integration`

### Authoritative implementation

每写Agent独立树，显式合并节点产生新snapshot并重验。

### Authoritative acceptance

冲突需人工/明确修复，不复用分支通过结论。

### Existing detailed guidance

D-058, D-060.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-03 外部插件包与签名审核

**Status:** DEFERRED
**Depends on:** P9-02
**Module:** M08
**Acceptance cases:** T036, T037, T038, T039, T040
**Paths:** `plugin-host/external`

### Authoritative implementation

公开SDK、RPC、包完整性、授权/卸载/迁移；单独威胁评审。

### Authoritative acceptance

未知来源不自动执行，权限可审计撤回。

### Existing detailed guidance

D-061, D-062.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-04 更多执行器与协议

**Status:** DEFERRED
**Depends on:** P9-03
**Module:** M09
**Acceptance cases:** T041, T042, T043, T044, T045
**Paths:** `plugins/executor-*`

### Authoritative implementation

基于公开协议/SDK，生成独立兼容记录和同一合约测试。

### Authoritative acceptance

不因CLI有终端就伪造结构化/暂停/模型兼容。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-05 混合检索与经验策略

**Status:** DEFERRED
**Depends on:** P9-04
**Module:** M14
**Acceptance cases:** T066, T067, T068, T069, T070
**Paths:** `context/hybrid`, `memory/experience`

### Authoritative implementation

FTS+向量+RRF对照评测，脱敏经验与项目facts分离。

### Authoritative acceptance

检索收益有数据，来源权限先过滤。

### Existing detailed guidance

D-035, D-038.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-06 受控策略改进

**Status:** DEFERRED
**Depends on:** P9-05
**Module:** M24
**Acceptance cases:** T116, T117, T118, T119, T120
**Paths:** `evals/evolution`

### Authoritative implementation

candidate patch→holdout eval→人审→小范围新Run→回滚。

### Authoritative acceptance

不能修改隐藏答案、权限或验收标准。

### Existing detailed guidance

D-064.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-07 Capacitor原生手机壳

**Status:** DEFERRED
**Depends on:** P9-06
**Module:** M21
**Acceptance cases:** T101, T102, T103, T104, T105
**Paths:** `apps/mobile`

### Authoritative implementation

复用Vue与remote client，分别实现安全存储/推送/扫码及商店打包。

### Authoritative acceptance

手机仍不执行CLI，iOS/Android真机验证。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

## P9-08 Linux无头Host与公网方案评估

**Status:** DEFERRED
**Depends on:** P9-07
**Module:** M20
**Acceptance cases:** T096, T097, T098, T099, T100
**Paths:** `apps/host`, `docs/adr`

### Authoritative implementation

先证明Node独立运行和secret backend，再设计服务安装/身份/Relay威胁模型。

### Authoritative acceptance

未完成安全审核不宣称NAS/公网Relay生产可用。

### Existing detailed guidance

None; follow the authoritative task and referenced contracts.

读取本任务引用的契约与验收用例；只实施本编号的权威范围。映射说明中超出本任务的部分在其对应编号实施。

---

# Detailed Implementation Notes — 已映射的旧 Playbook 说明

以下保留旧 Playbook 的详细实施文本，并标出其对应的**权威 Task ID**。旧编号不再是任务编号；一个说明跨多个领域时，以 `Applies to` 指定归属，并只在当前权威任务范围内采用相关段落。说明中的旧 Goal/Acceptance 不得覆盖上文权威实施与验收。

### D-001 项目选择与可信环境向导

**Applies to:** P1-01

<details>
<summary>展开原有实施细节</summary>

### Goal

用户在 Desktop 选择一个真实本地仓库，Forge 只读探测项目，在用户明确 Trust 后保存为 Forge Project，并进入真实 Workspace。

### Read First

- `forge_spec_v1.0/planning/tasks.json`：P1-01
- P1 phase definition
- Project / Environment / Trust 相关 contracts
- P1-01 acceptance cases
- 当前 Host / Persistence / Client / Desktop 实现

### Implement

#### 1. Project Domain

建立正式 `Project`：

- projectId
- name
- rootPath
- canonicalRootPath
- gitRoot
- repositoryType
- currentBranch
- defaultBranch
- trusted
- trustVersion
- probeSnapshot
- createdAt
- updatedAt
- lastOpenedAt

`projectId` 使用 Forge UUID，不以路径作为主键。

#### 2. ProjectService

Host 中至少：

- `probeProject()`
- `createProject()`
- `getProject()`
- `listProjects()`
- `setActiveProject()`
- `removeProject()`

Renderer 不能直接访问文件系统。

#### 3. Folder Picker

Electron Main 只负责系统目录选择器：

- only directory
- cancel safe
- 不把 Node API 暴露给 Renderer

Main 返回路径后，Host 必须重新 canonicalize + validate。

#### 4. ProjectProbe

默认严格只读：

检测：

- path exists
- directory
- Git repo
- git root
- current branch
- dirty status
- local remote metadata
- lockfiles
- package manager
- package manifests
- detected project type
- declared scripts（dev/build/test/lint/typecheck）

禁止：

- `pnpm install`
- `npm install`
- build/test/dev
- postinstall
- 任何项目脚本

#### 5. Git Probe

使用 `executable + argv[]`：

- `git rev-parse --show-toplevel`
- `git status --porcelain`
- `git branch --show-current`

不修改 git config，不 stash/reset/clean。

#### 6. Trust Flow

选择目录 != Trust。

Trust 页面明确：

Forge 未来可能：

- 读取文件
- 创建独立 worktree
- 修改隔离 workspace
- 运行项目 script
- 启动 Coding Agent

用户必须主动点击：

`Trust this project`

Trust 保存：

- trustVersion
- approvedAt
- projectId

Trust != unlimited permissions。

#### 7. Persistence

新增正式 Project migration。

只增加本任务所需业务表。

Host 重启后 Project 仍存在。

#### 8. Duplicate Detection

同一 canonical Git root 再次选择时：

- 识别已有 Project
- 不重复创建

考虑 symlink/case sensitivity。

#### 9. Remove Semantics

按钮必须叫：
`Remove from Forge`

只删 Forge metadata。

绝不能删除：

- 源码
- `.git`
- 用户 worktree

#### 10. UI

真实向导：

Step 1：Choose Project  
Step 2：Project Detected  
Step 3：Trust This Project  
Step 4：Connected

显示：

- Git
- Branch
- Dirty/Clean
- Package manager
- detected stack
- declared scripts（标 `Detected`，不是 `Verified`）

连接后 Header 显示真实 Project。

聊天输入仍未启用，提示 Task Refinement 尚未开放。

Web：

- 无本地 picker
- 显示需要 Desktop / future Remote Host

### Safety

- Host 再验证路径
- path traversal / symlink 防御
- Probe 不执行脚本
- Renderer 不得任意读文件
- remove 不得触碰用户项目

### Tests

Unit：

- project schema
- canonical path
- duplicate repo
- package manager detection
- project type detection
- scripts extraction
- trust version
- invalid path
- symlink

Integration：

- clean Git repo
- dirty repo
- pnpm fixture
- npm fixture
- unknown fixture
- persistence restart
- duplicate detection
- remove does not delete source

Desktop：

- real picker
- cancel picker
- trust
- reopen active project
- switch project
- remove

Web：

- no local picker
- no crash

### Acceptance

- 真目录选择
- 真 Project probe
- Trust 人工确认
- persistence 真保存
- remove 不删除源码
- 所有基线通过
- macOS arm64 实测

### Do Not

- LLM
- Task
- Agent execution
- 项目 script 自动运行
- RAG
- Workflow

### Output

报告 Project model、Probe、Trust、Persistence、真实截图。

</details>

### D-002 模型 Provider 与 Secret Storage

**Applies to:** P1-04, P4-07, P6-04

<details>
<summary>展开原有实施细节</summary>

### Goal

为 Forge 自己的 Refiner/Planner 等“模型驱动角色”建立与 Coding Executor 分离的 Model Provider 层，并安全保存凭据。

### Read First

- Model / Agent Profile contracts
- Secret / Settings 相关规格
- Electron safeStorage 官方能力对应 ADR（如需要）
- 当前 Codex Executor：注意它不是普通 Model Provider

### Architecture

必须明确区分：

```text
Model Provider
Executor
Agent Profile
Workflow Stage
```

Model Provider 提供推理。

Executor 提供“可执行 coding runtime”。

### Implement

#### 1. Model Provider API

最小能力：

- listProviders
- listModels
- probe
- stream
- cancel
- capabilities

标准请求：

- model
- messages / structured input
- response schema（如支持）
- limits
- requestId

标准事件：

- started
- delta
- usage
- completed
- failed
- cancelled

不要将某一家 provider 类型泄露到 Core。

#### 2. Provider Config

保存非敏感配置：

- providerId
- model
- endpoint（允许时）
- capability flags
- createdAt

Secret 不进入普通 DB 明文。

#### 3. Secret Storage

Desktop：
使用 Electron safeStorage / 系统 secure storage 方案。

要求：

- encrypted at rest
- 不写日志
- 不显示完整 secret
- 支持 delete
- 支持 replace
- 失败有明确状态

Web：
当前不保存本机 Secret。

#### 4. Settings UI

新增最小 Model 配置：

- Provider
- Credential
- Probe
- Model
- Status

状态必须来自 probe。

#### 5. Refiner Profile

创建 Forge 内置 `refiner` Agent Profile，但本轮不发业务聊天。

只是绑定：

- provider
- model
- capability

### Security

- Secret 不进入 Renderer state dump
- 不进入 SQLite 明文
- 不进入 diagnostics
- 不进入 event log
- UI 只显示 masked
- 删除后真实不可调用

### Tests

- encrypt/decrypt
- wrong/deleted credential
- provider unavailable
- model list
- streaming minimal request
- cancel
- logs contain no secret
- restart credential works（在安全边界允许时）

### Acceptance

至少一个真实 Provider 请求通过。

### Do Not

- 不做聊天业务
- 不把 Codex app-server 当普通 chat provider
- 不做 Provider marketplace
- 不把所有模型假设为兼容 structured output

</details>

### D-003 Intent Chat 基础会话

**Applies to:** P1-03

<details>
<summary>展开原有实施细节</summary>

### Goal

左侧 Command Panel 真正成为“自然语言研发入口”。

用户可以与 Forge Refiner 对话，但暂不生成正式 Task。

### Implement

#### 1. Conversation Domain

正式模型：

- conversationId
- projectId
- title
- createdAt
- updatedAt
- archivedAt

Message：

- messageId
- conversationId
- role
- content
- createdAt
- provider metadata（受控）
- status

#### 2. Persistence

增加 conversation/message migrations。

重启恢复。

#### 3. Host API

- conversation.create
- conversation.list
- conversation.get
- conversation.send
- conversation.cancel
- conversation.archive

#### 4. Streaming

链路：

UI
→ ForgeClient
→ Host
→ Model Provider
→ normalized stream events
→ UI

支持：

- delta
- completed
- failed
- cancelled

#### 5. Refiner Behavior

系统指令目标：

- 理解用户意图
- 只做需求澄清
- 不操作代码
- 不宣称已创建 Task
- 不编造项目规则
- 缺信息时提出最少必要问题

#### 6. Project Context

只注入基础真实信息：

- project name
- detected stack
- Git status
- manifest summary

本轮不做 RAG。

#### 7. UI

左侧正式聊天：

- message list
- composer
- streaming
- cancel
- new conversation
- conversation history（最小）

### Tests

- true streaming
- cancel
- provider error
- restart restore
- project isolation
- no executor call
- no secret leakage

### Acceptance

聊天真实工作，绝不自动修改代码。

### Do Not

- Task Draft
- TODO
- RAG
- Coding Agent

</details>

### D-004 Task Draft / Task Contract 生成

**Applies to:** P1-04, P1-05

<details>
<summary>展开原有实施细节</summary>

### Goal

把会话转为结构化 Task Draft。

### Implement

#### 1. Task Draft Schema

以正式 contracts 为准，至少：

- draftId
- projectId
- conversationId
- version
- title
- intent
- goal
- acceptanceCriteria[]
- constraints[]
- scope[]
- outOfScope[]
- dependencies[]
- risks[]
- openQuestions[]
- contextRefs[]
- suggestedWorkflow
- createdAt
- updatedAt

#### 2. Structured Generation

Refiner 输出必须经过 Schema validation。

禁止将自由文本解析失败后硬塞进 Task Draft。

#### 3. Open Questions

关键不确定信息必须进入 `openQuestions`。

未确认项不能被模型写入权威 AC。

#### 4. Versioning

每次用户补充导致 Draft 改变：

- version +1
- 保留版本历史
- 记录 changed fields

#### 5. Source Binding

每条重要 AC / Constraint 尽量绑定来源：

- conversation messageId
- user decision

#### 6. UI

聊天旁显示 Draft Card：

- title
- goal
- AC count
- open questions
- scope

点击打开 Editor。

### Tests

- valid structured output
- invalid schema rejected
- open questions
- version increment
- user constraint preserved
- model cannot silently remove AC

### Acceptance

可重复从真实聊天生成合法 Draft。

### Do Not

- 正式 Task
- Approval
- Coding Agent

</details>

### D-005 Task Contract Editor / Approval

**Applies to:** P1-05, P1-06

<details>
<summary>展开原有实施细节</summary>

### Goal

用户可以修改 Draft，并审批“某一个确定版本”。

### Implement

#### 1. Editor

字段：

- Title
- Goal
- AC
- Constraints
- Scope
- Out of Scope
- Risks
- Open Questions
- Workflow preset

#### 2. Approval Domain

Approval：

- approvalId
- draftId
- version
- userDecision
- approvedAt
- snapshot/hash

#### 3. Invalidation

Draft 变化：

- 旧 approval stale
- 不可复用

#### 4. Approval Gate

有 blocking openQuestions：
默认不允许审批，除非规格允许显式风险接受。

#### 5. Audit

记录：

- 用户改了什么
- AI 草稿来源
- 用户最终批准版本

### UI

Glass Drawer / Modal。

主动作：
`Approve & Add to TODO`

审批：

- 进入 TODO
- **不自动执行**

### Tests

- approval version binding
- edit invalidates approval
- double approval idempotency
- stale version reject
- no auto run

</details>

### D-006 TODO Board / Task Persistence

**Applies to:** P1-06, P1-07, P1-08

<details>
<summary>展开原有实施细节</summary>

### Goal

批准 Draft 成为正式 Task，并进入真实看板。

### Implement

#### 1. Task Domain

Task：

- taskId
- projectId
- contractVersion
- status
- priority
- workflowPreset
- createdAt
- updatedAt
- doneAt

Contract snapshot 必须不可被后续 Agent 静默覆盖。

#### 2. Status

首版 Board：

- TODO
- IN_PROGRESS
- REVIEW
- VERIFY
- DONE
- BLOCKED（可作为特殊状态/过滤项）

Board column 是展示，不等同 Workflow Node。

#### 3. TaskService

- createFromApprovedDraft
- list
- get
- updatePriority
- archive
- getContract

不允许 Renderer 直接改 `status=done`。

#### 4. Board UI

真实 Task cards。

Task Drawer 展示：

- Contract
- Approval
- Project
- 当前状态
- 尚无 Run 时真实显示“Not started”

#### 5. Filter

- project
- status
- priority
- search

### Tests

- approved only
- persist restart
- project isolation
- stale approval cannot create
- no duplicate task from same approval
- cannot drag directly to Done

### Acceptance

Intent → Draft → Approval → TODO 已成立。

</details>

### D-007 P1 End-to-End Closure

**Applies to:** P1-10

<details>
<summary>展开原有实施细节</summary>

### Goal

P1 产品链真实收口。

### E2E Scenario

1. 启动 Desktop
2. 选择 fixture project
3. Trust
4. 配置真实 model
5. 输入需求
6. Refiner 澄清
7. 用户回复
8. 生成 Draft
9. 编辑 AC
10. Approve
11. TODO 出现
12. 重启 Desktop
13. Project/Conversation/Draft/Task 全恢复

### Required

- 截图
- P1 completion report
- known risks
- no fake data

---


</details>

### D-008 Workflow Runtime Core

**Applies to:** P2-01, P2-05, P5-02

<details>
<summary>展开原有实施细节</summary>

### Goal

实现 Core 状态机，让 Task 能进入可控 Run。

### Domain

WorkflowRun：

- runId
- taskId
- taskContractVersion
- workflowId/version
- status
- currentStage
- createdAt
- startedAt
- endedAt

StageRun：

- stageRunId
- runId
- stageId
- attempt
- status
- inputArtifactRefs
- outputArtifactRefs
- startedAt
- endedAt

### States

Run：

- pending
- running
- paused
- blocked
- cancelling
- cancelled
- completed
- failed

Stage：

- pending
- running
- waiting_approval
- completed
- failed
- cancelled

### Rules

- Run 固定 Task Contract Version
- 固定 Workflow Version
- 状态只由 Core transition
- Renderer 发送 command，不写 state
- transition 经过 guard
- restart 可恢复状态

### Tests

- valid transitions
- invalid transitions
- pause/resume
- cancel
- restart
- stale command
- idempotent command

</details>

### D-009 Default Workflow Preset Runtime

**Applies to:** P5-01, P5-02

<details>
<summary>展开原有实施细节</summary>

### Goal

把标准流程真正变成可执行配置。

Default：

```text
Plan
→ Develop
→ Review
→ Verify
→ Human Acceptance
```

P2 中：

- Plan 真执行
- Develop 真执行
- Review/Verify 先作为等待/占位 gate，不伪造通过

### Requirements

- Workflow config 经过 validator
- run 创建时 snapshot
- 修改模板不影响 active run
- retry/rework limit 固定

</details>

### D-010 Planner Agent

**Applies to:** P2-06, P5-01

<details>
<summary>展开原有实施细节</summary>

### Goal

Planner 在只读环境中形成结构化 Implementation Plan。

### Input

- approved Task Contract
- Project metadata
- repo tree / relevant files
- project rules

### Output

- impactedAreas[]
- inspectFiles[]
- implementationSteps[]
- risks[]
- validationSuggestions[]
- unknowns[]

### Runtime

可以使用 Executor 的只读/受限模式，或专用模型+代码检索；以实际能力安全边界为准。

### Hard Rule

Planner 不得修改产品代码。

### Tests

- source repo unchanged
- structured output
- failure prevents Develop
- cancellation

</details>

### D-011 Developer Agent Execution

**Applies to:** P2-04

<details>
<summary>展开原有实施细节</summary>

### Goal

批准 Task 真正驱动 Codex 在隔离 Workspace 写代码。

### Flow

1. WorkspaceManager 创建 worktree
2. 创建 Developer StageRun
3. Context Builder（基础版）组织：
   - Task Contract
   - Plan
   - Project metadata
   - project rules
4. Codex Executor run
5. Event 进入 Host
6. changed files / commands / usage 产物化
7. 形成代码快照

### Hard Rules

- source repo 不污染
- Developer 不得修改 Task Contract
- cancel 后进程停止
- workspace ownership
- 所有结果绑定 run/stage

### Tests

- real fixture modification
- diff
- cancel
- crash
- workspace cleanup
- source repo unchanged

</details>

### D-012 Run Inspector UI

**Applies to:** P2-07

<details>
<summary>展开原有实施细节</summary>

### Goal

用户能真实观察 Agent 正在干什么。

### UI Tabs

- Activity
- Commands
- Files
- Diff
- Context
- Usage

### Event Rules

展示：

- 真实工具动作
- 文件变化
- 命令
- 状态
- 对用户可展示的 assistant summary

不展示：

- 隐式 Chain-of-Thought
- provider 内部敏感原始 payload

### Performance

长日志：

- incremental
- limit
- virtualized / paginated

</details>

### D-013 Deterministic Self-Check Gate

**Applies to:** P3-04

<details>
<summary>展开原有实施细节</summary>

### Goal

Developer 说“完成”不够，必须跑确定性检查。

### Project Check Config

来自已 Trust Project 的安全配置：

- lint
- typecheck
- test
- build

首次实际执行前如涉及项目脚本风险，根据策略要求审批。

### Results

每个：

- command
- exit code
- duration
- stdout/stderr artifact
- snapshot

### Rules

- 任一 blocking check fail → Develop Rework
- 不把“命令没配置”当通过
- unsupported / skipped 单独状态

</details>

### D-014 Developer Rework Loop

**Applies to:** P3-06

<details>
<summary>展开原有实施细节</summary>

### Goal

把真实失败反馈交回 Developer，而不是让用户复制日志。

### Handoff

结构化：

- failed check
- exit code
- relevant log
- current diff
- Task AC
- attempt count

### Limits

- max attempts
- max runtime
- max cost/usage（数据可得时）
- 超限 → BLOCKED

### Tests

- fail→fix→pass
- repeated failure→blocked
- cancel mid-rework
- no infinite loop

</details>

### D-015 P2 Closure

**Applies to:** P2-10

<details>
<summary>展开原有实施细节</summary>

### E2E

Approve TODO
→ Start
→ Plan
→ Develop
→ self-check fail
→ Developer fixes
→ self-check pass
→ Review Pending

真实小项目完成。

---


</details>

### D-016 Reviewer Agent

**Applies to:** P3-01, P3-02

<details>
<summary>展开原有实施细节</summary>

### Goal

独立上下文 Reviewer 检查当前代码快照。

### Permissions

默认：

- read workspace snapshot
- run allowed read/check commands
- write review artifact
- **no product code write**

### Input

- Task Contract
- Plan
- current code snapshot
- Git diff
- changed files
- project rules
- self-check

### Output

- blockingIssues[]
- suggestions[]
- unknowns[]
- result

每个 blocking issue：

- location
- reason
- contract/engineering basis
- impact

</details>

### D-017 Review Gate / Rework

**Applies to:** P3-03, P3-06

<details>
<summary>展开原有实施细节</summary>

### Rules

blocking > 0：

- create review artifact
- transition back Develop
- structured handoff
- new code snapshot after fix
- rerun self-check
- rerun Review

Reviewer 不能把“建议”自动当 blocker。

用户可以显式接受某风险，但必须记录 Human Decision。

</details>

### D-018 Verifier Core / Project Checks Plugin Candidate

**Applies to:** P3-04

<details>
<summary>展开原有实施细节</summary>

### Goal

将确定性验证形成独立能力边界。

结果绑定：

- run
- task contract version
- code snapshot

支持：

- lint
- typecheck
- test
- build
- custom safe check（受策略）

</details>

### D-019 Acceptance Criteria Mapping

**Applies to:** P3-05

<details>
<summary>展开原有实施细节</summary>

### Goal

每条 AC 都有明确状态，不用“tests green”冒充全部完成。

### States

- verified
- failed
- manual
- unverified
- not_applicable（需要明确依据）

### Evidence

自动 AC 必须绑定：

- check artifact
- snapshot

无法自动验证：
→ manual

</details>

### D-020 Human Acceptance

**Applies to:** P3-07

<details>
<summary>展开原有实施细节</summary>

### UI

Delivery 页面：

- build
- tests
- review
- AC checklist
- changed files
- diff
- unresolved risks

用户：

`Accept current version`
或
`Return with feedback`

### Rules

Accept：

- Task → Done
- 不自动 merge
- 不自动 push
- 不自动 deploy

Reject：

- 用户说明反馈
- 回到 Develop
- 新 attempt

</details>

### D-021 Delivery Summary

**Applies to:** P3-08

<details>
<summary>展开原有实施细节</summary>

生成可追溯交付记录：

- approved Task Contract
- Plan
- all attempts
- final snapshot
- Review result
- Verification
- Human decisions
- unresolved risks
- final status

</details>

### D-022 Forge MVP Closure

**Applies to:** P3-12

<details>
<summary>展开原有实施细节</summary>

### E2E

Intent
→ Draft
→ Approval
→ TODO
→ Plan
→ Develop
→ Rework
→ Review
→ Verify
→ Human Accept
→ Done

这是第一个真正 Forge MVP。

必须形成：

- MVP completion report
- screenshots
- test evidence
- known limitations

---


</details>

### D-023 Plugin Host

**Applies to:** P4-01, P4-02, P4-03

<details>
<summary>展开原有实施细节</summary>

### Goal

正式实现插件生命周期，取代目前最小 Registry。

### Manifest

至少：

- id
- version
- apiVersion
- entry
- requires.services
- contributes
- requestedPermissions

### Lifecycle

- discover
- validate
- activate
- register contributions
- deactivate
- dispose

### Rules

- Core 不导入插件私有类
- 插件不直接 DB
- 插件不直接 transition Task
- 首版只加载内置受信插件
- 不开放任意网络安装

</details>

### D-024 Codex Executor Plugin 化

**Applies to:** P4-03

<details>
<summary>展开原有实施细节</summary>

将现有 Codex Adapter 迁移为标准 Executor contribution。

验收：

- Core 删除 Codex 特殊分支
- Plugin disabled 时系统如实 unavailable
- 现有 P3 E2E 不回归

</details>

### D-025 第二真实 Executor

**Applies to:** P4-05

<details>
<summary>展开原有实施细节</summary>

实施时重新核实官方稳定 SDK/Runtime。

目标：
证明：

同一 `Executor API`
可以运行第二实现。

不要求行为完全相同，能力通过 `Capabilities` 声明。

</details>

### D-026 Agent Profile Manager

**Applies to:** P4-06

<details>
<summary>展开原有实施细节</summary>

Agent Profile：

- role
- executor
- model
- instructions
- context sources
- permissions
- limits

UI 只显示真实兼容组合。

Profile versioning：
活跃 Run 冻结版本。

</details>

### D-027 Workflow Template Manager

**Applies to:** P5-01

<details>
<summary>展开原有实施细节</summary>

用户可以复制 Forge 默认模板。

可配置：

- stage
- agent profile
- verifier
- human approval
- failure route
- retry/rework

模板发布生成新 version。

</details>

### D-028 Workflow Builder Linear

**Applies to:** P5-03

<details>
<summary>展开原有实施细节</summary>

UI 先做：

- 添加节点
- 删除节点
- 排序
- 失败退回
- 绑定 Agent

不要先做自由画布 DAG。

必须实时 schema/semantic validate。

</details>

### D-029 Workflow DAG

**Applies to:** P5-04

<details>
<summary>展开原有实施细节</summary>

在 Linear 稳定后增加：

- branch
- condition
- fan-out
- join
- parallel

验证：

- unreachable
- dead end
- cycle
- unbounded retry
- join dependencies

</details>

### D-030 Verifier Plugin API

**Applies to:** P4-01, P4-02

<details>
<summary>展开原有实施细节</summary>

把 Project Checks 正式迁移到 Verifier contribution。

Forge Core 只理解标准：

- verification request
- verification result
- evidence refs

当前**不要接 ProofRun**。

</details>

### D-031 Context Provider API

**Applies to:** P4-08, P5-08

<details>
<summary>展开原有实施细节</summary>

为后续 Knowledge/Memory 定义：

- provider capabilities
- query
- result
- source
- scope
- version
- confidence/trust metadata

</details>

### D-032 Plugin / Workflow Closure

**Applies to:** P4-10

<details>
<summary>展开原有实施细节</summary>

E2E：
同一 Task 在不同 Executor / Agent Profile 下运行，不修改 Core。

形成 P4 completion report。

---


</details>

### D-033 Project Knowledge Sources

**Applies to:** P5-06

<details>
<summary>展开原有实施细节</summary>

### Sources

首批：

- `AGENTS.md`
- README
- selected markdown docs
- OpenAPI
- user-selected files

### Pipeline

- discover
- parse
- normalize
- source hash
- version
- chunk
- metadata

不把整个仓库全部自动 embedding。

</details>

### D-034 Keyword / Metadata Retrieval

**Applies to:** P5-07

<details>
<summary>展开原有实施细节</summary>

先实现更可解释的：

- project filter
- module/path filter
- version filter
- doc type
- BM25 / keyword

返回必须绑定：

- source
- range
- hash/version

</details>

### D-035 Vector Retrieval Evaluation

**Applies to:** P9-05

<details>
<summary>展开原有实施细节</summary>

只有通过 eval 证明对项目知识查找有收益才加入。

如果加入：

- local/remote embedding provider 分离
- embedding version
- reindex
- project isolation

不要把 vector store 当 source of truth。

</details>

### D-036 Context Builder

**Applies to:** P5-08

<details>
<summary>展开原有实施细节</summary>

统一构建 Stage Context：

优先级：

1. Approved Task Contract
2. Human Decisions
3. Current Code Snapshot
4. Stage Artifacts
5. Current Project Rules
6. Retrieved Knowledge
7. Historical Reference

记录每次实际用了哪些 source。

</details>

### D-037 Project Memory

**Applies to:** P5-09

<details>
<summary>展开原有实施细节</summary>

Memory 类型：

- environment fact
- project convention
- confirmed decision
- validated workflow hint

状态：

- candidate
- validated
- deprecated
- expired

Agent 只能提交 candidate。

升级 validated：

- human approval
- 或确定性规则证明（仅适合事实类）

</details>

### D-038 Experience Memory

**Applies to:** P5-09, P9-05

<details>
<summary>展开原有实施细节</summary>

从多次 Run 提炼开发经验：

- context pattern
- failed behavior
- better action
- supporting runs
- applicable scope
- counterexamples

默认项目内。

跨项目复用默认关闭。

</details>

### D-039 Memory Center UI

**Applies to:** P5-10

<details>
<summary>展开原有实施细节</summary>

支持：

- view source
- approve candidate
- edit
- deprecate
- delete
- expiry

明确标记：
“Memory is guidance, not acceptance criteria.”

</details>

### D-040 Knowledge & Memory Eval

**Applies to:** P5-11

<details>
<summary>展开原有实施细节</summary>

对照：

- baseline
- knowledge only
- knowledge + memory

指标：

- task success
- wrong context injection
- human corrections
- token
- latency

没有收益的策略不默认开启。

---


</details>

### D-041 Settings

**Applies to:** P6-01

<details>
<summary>展开原有实施细节</summary>

正式设置：

- Appearance
- Models
- Executors
- Project Defaults
- Permissions
- Data Retention
- Notifications
- Diagnostics

</details>

### D-042 Secret / Credential Productization

**Applies to:** P6-04

<details>
<summary>展开原有实施细节</summary>

完善：

- credential lifecycle
- re-auth
- revoke
- migrate
- error UX

</details>

### D-043 macOS Package / Sign / Notarize

**Applies to:** P6-06

<details>
<summary>展开原有实施细节</summary>

真实 installer。

验证：

- clean machine
- Gatekeeper
- first launch
- upgrade
- uninstall semantics
- user data preservation

</details>

### D-044 Windows Process Backend

**Applies to:** P6-07

<details>
<summary>展开原有实施细节</summary>

补齐 P0 技术债。

必须真实 Windows x64：

- process tree
- cancellation
- child cleanup
- workspace paths
- app-server
- SQLite native module

</details>

### D-045 Windows Installer

**Applies to:** P6-07

<details>
<summary>展开原有实施细节</summary>

真实 Windows package。

</details>

### D-046 DPI / Accessibility Matrix

**Applies to:** P6-02

<details>
<summary>展开原有实施细节</summary>

Windows：

- 100%
- 125%
- 150%
- 200%

macOS Retina。

同时：

- keyboard
- reduced motion
- reduced transparency
- contrast
- basic screen-reader semantics

</details>

### D-047 Update / Diagnostics

**Applies to:** P6-04, P6-08

<details>
<summary>展开原有实施细节</summary>

自动更新策略：

- stable channel
- explicit state
- rollback policy（能力允许时）

Diagnostic bundle：

- 用户预览
- 自动脱敏
- 不包含 secrets/source by default

</details>

### D-048 Desktop v1 RC

**Applies to:** P6-09, P6-10

<details>
<summary>展开原有实施细节</summary>

完整 RC checklist。

---


</details>

### D-049 RemoteTransport

**Applies to:** P7-05, P7-08

<details>
<summary>展开原有实施细节</summary>

实现与 LocalTransport 相同 ForgeClient 接口。

Core/UI 不因 Remote 重新写一套调用。

</details>

### D-050 Remote Gateway

**Applies to:** P7-02

<details>
<summary>展开原有实施细节</summary>

Host 增加受控 Remote Gateway。

要求：

- default off
- TLS/private networking strategy
- authentication
- request limits
- event stream
- no raw shell endpoint

</details>

### D-051 Device Pairing

**Applies to:** P7-03

<details>
<summary>展开原有实施细节</summary>

- one-time code
- device identity
- scope
- expiry
- revoke
- session invalidation

</details>

### D-052 Remote Permission Policy

**Applies to:** P7-07

<details>
<summary>展开原有实施细节</summary>

手机默认：
允许：

- read
- approve/reject
- pause/resume
- clarify

默认禁止：

- arbitrary command
- browse host filesystem
- alter security settings
- merge/push
- add plugin

</details>

### D-053 Mobile PWA

**Applies to:** P8-01, P8-07

<details>
<summary>展开原有实施细节</summary>

共享 token/component principles，但重新做移动信息架构。

不把 Desktop 缩放过去。

</details>

### D-054 Mobile Inbox

**Applies to:** P8-03

<details>
<summary>展开原有实施细节</summary>

只展示需要人决策：

- Task approval
- Blocking clarification
- Delivery acceptance
- Failed/blocked run

</details>

### D-055 Mobile Task View

**Applies to:** P8-04

<details>
<summary>展开原有实施细节</summary>

- status
- timeline
- summary
- files summary
- decisions
- pause/resume

不提供任意 terminal。

</details>

### D-056 Offline / Reconnect

**Applies to:** P8-08

<details>
<summary>展开原有实施细节</summary>

危险操作不能离线排队自动重放。

Approval 发送前必须确认当前 Task version / snapshot 未变化。

</details>

### D-057 Remote Closure

**Applies to:** P7-10

<details>
<summary>展开原有实施细节</summary>

真实外部网络：

- connect
- view
- approve
- host continue
- revoke device

---


这些任务默认 `DEFERRED`。只有 Forge MVP 有真实日常使用后再启用。

</details>

### D-058 Parallel Multi-Agent

**Applies to:** P9-01, P9-02

<details>
<summary>展开原有实施细节</summary>



</details>

### D-059 Specialized Review Agents

**Applies to:** P9-01

<details>
<summary>展开原有实施细节</summary>



</details>

### D-060 Agent Handoff Optimization

**Applies to:** P9-02

<details>
<summary>展开原有实施细节</summary>



</details>

### D-061 External Plugin SDK Publication

**Applies to:** P9-03

<details>
<summary>展开原有实施细节</summary>



</details>

### D-062 Third-party Plugin Installation

**Applies to:** P9-03

<details>
<summary>展开原有实施细节</summary>



</details>

### D-063 Cost / Usage Analytics

**Applies to:** P6-04

<details>
<summary>展开原有实施细节</summary>



</details>

### D-064 Eval-driven Strategy Optimization

**Applies to:** P9-06

<details>
<summary>展开原有实施细节</summary>

要求：

- offline eval
- compare old/new
- human approve
- canary
- rollback

禁止将“自动改 Prompt”直接称为自进化。

</details>

# C. Milestones

- P1：自然语言 → Draft → 人工审批 → TODO；不自动写代码。
- P2：批准的任务在独立工作区由单执行器真实修改，并可停止与查看结果。
- P3：Review、Verify、返工与人工验收形成可核查交付。
- P4：Plugin Host 与真实第二执行器证明替换性。
- P5：流程定制、知识与项目记忆。
- P6：macOS/Windows Desktop v1.0 产品化。
- P7：受控远程 Host 与安全网关。
- P8：手机 PWA Companion；执行仍在 Host。
- P9：可选增强，默认 DEFERRED，须用户明确开启。

# D. Git Checkpoint

默认不自动 commit、push、publish 或 release；仅在用户明确授权且 `docs/forge-autopilot-config.json` 允许时提交本轮自产生的文件。

# E. Autopilot 启动方式

按 `docs/forge-codex-autopilot-protocol.md` 的主循环读取本文件与权威规格；每次只实施当前 Task，完成后更新状态并自动继续。遇 Hard Stop 才暂停。
