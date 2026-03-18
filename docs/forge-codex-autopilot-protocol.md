# Forge Codex Autopilot Protocol v1.1

> 本文件用于覆盖 `docs/forge-codex-execution-playbook.md` 中“每完成一个 Task 就停止”的行为。
>
> **优先级**：
> 1. 根 `AGENTS.md`
> 2. 已批准的产品/架构规格与 ADR
> 3. `docs/forge-codex-execution-playbook.md`
> 4. **本文件：仅覆盖“执行节奏 / 是否自动继续”相关规则**
>
> 本文件不覆盖任何安全边界、Do Not、验收要求、产品语义或依赖约束。

> 2026-09-24：用户批准 [ADR 0018](decisions/0018-p1-closure-acceptance-scope-conflict.md) 的 A，新增下面的跨阶段验收映射与最小安全可逆决策规则。权威 Test ID 和任务引用保持原样。

任务 ID、名称、依赖与 Phase Gate 固定来自 `forge_spec_v1.0/planning/tasks.json` 和 `planning/phases.json`；Playbook 只承载这些权威 Task 的实施说明。

> **2026-09-24 单执行器开发依赖放行**：用户仅授权 `P4-05 → P4-06` 和将来满足前提的 `P4-10 → P5-01` 两条开发排期例外，详见 [ADR 0052](decisions/0052-claude-sdk-api-key-gate.md) 与 `docs/development-dependency-exceptions.json`。P4-05 保持 BLOCKED，P4-10 的第二真实执行器验收不得伪造或标 PASSED，P4 完整 Phase Gate 和多执行器发布不得宣称通过。只允许 Codex 和执行器无关的 P4-06～09 / 后续 P5 工作；不借用订阅登录、不请求新凭据、不自动批准工具。此例外不改变权威 Depends on，也不允许一般性跳过 BLOCKED。

> **2026-09-25 P6 限定开发排期放行**：用户明确授权 `P6-06 → P6-07`，在同一内部 macOS arm64 DMG 已真实安装、包内 Python Host 与隔离数据通过后，先补该安装包的真实业务验收，再进行不依赖 Developer ID/公证的 Windows 准备。该安装版完整 Codex/取消/重启闭环已执行；P6-06 仍 `BLOCKED`，T111–T113 不得标通过。P6-07 的 Windows x64 内部 staging/测试入口已准备，但无 Windows 环境或签名，正式验收仍 `BLOCKED`；用户本次授权的精确 `P6-07 → P6-08` 只覆盖离线签名元数据校验、隔离数据库迁移预演，不覆盖安装更新。后续每一条 P6 权威依赖边须单独核查、记录证据与限制，才可继续 P6-09～P6-10 的独立部分。不能跳过进程取消、权限、数据完整性、更新完整性等失败；P6 完整 Gate 与公开发布继续阻塞。详见 [ADR 0073](decisions/0073-internal-macos-package-and-distribution-gate.md)、[ADR 0074](decisions/0074-windows-internal-staging-and-platform-gate.md) 和 `docs/development-dependency-exceptions.json`。

> P6-08 离线 Ed25519/SQLite 预检在隔离 fixture 中通过，但尚无生产信任根与已安装签名版 cutover/回滚；正式验收仍 `BLOCKED`。精确 `P6-08 → P6-09` 仅允许对当前实现和平台运行真实适用验收，必须列出未执行 Test ID，不能把无签名更新、Windows 或 Claude 的用例标成通过。见 [ADR 0075](decisions/0075-offline-update-integrity-and-migration-rehearsal.md)。

> P6-09 当前平台单 Codex/安装版适用验收有真实证据，但完整安全/平台/多执行器/评测用例仍 `BLOCKED`。精确 `P6-09 → P6-10` 只允许编写当前可用能力的内部安装、首次任务、恢复和限制说明，不允许宣布完整 v1.0、自动上传或发布；详见 `docs/p6-current-scope-acceptance.md`。

> **2026-09-25 本地 Demo 先行与 P7/P8 开发放行**：用户新增精确 `P6-10 → P7-01` 开发排期例外，授权随后按权威顺序推进 P7/P8，但不使 P6-10/P6 Gate 通过。先交付由同一已验收 DMG 安装、使用独立项目/数据的常驻人工 Demo；桌面功能依用户给定 PDF 页清单逐项核对，缺口映射回权威 Task。P7/P8 默认关闭远程入口，只在 loopback 或明确授权私网验证；设备认证、项目隔离、审批版本、Origin/CSRF、撤销、离线不重放等失败不能以发布凭据例外跳过。手机真机需用户参与时先完成独立工程，再集中给操作清单。P9 不在本次授权范围；精确例外见 `docs/development-dependency-exceptions.json`。

> **Python Core 迁移覆盖已完成**（用户于 2026-09-24 明确批准）：MIG-PY-01～09 已在 macOS arm64 的 Python-only Desktop 开发路径真实验证。P2-10 的 Python 纵向验收与 P2 Phase Gate 已通过当前阶段范围；Autopilot 回到权威产品任务图，继续 P3。旧 Node Host 只作历史对照，不是业务 fallback。此记录不更改权威 Task/Test ID、产品语义或安全规则。

---

# 1. 目标

进入 Forge Autopilot 后，Codex 应持续执行可运行任务：

```text
读取状态
→ 找到下一个可执行 Task
→ 实施
→ 真实验证
→ 更新状态
→ 继续下一个 Task
→ ...
```

**不要在每个 Task 完成后等待用户重新发送“继续”。**

只要：
- 当前会话仍可运行；
- 存在依赖已满足的 `TODO` Task；
- 没有触发 Hard Stop；

就继续执行。

---

# 2. Autopilot 主循环

持续执行下面的循环：

## STEP 1 — Refresh

每个 Task 开始前重新读取：

- `AGENTS.md`
- `docs/forge-codex-execution-playbook.md`
- `docs/implementation-status.md`
- `docs/compatibility-record.md`
- `docs/forge-autopilot-state.md`
- 当前任务相关 ADR
- 当前任务在 `forge_spec_v1.0` 中引用的 contracts / acceptance cases

重新检查：

```bash
git status --short
```

不能仅依赖上一任务的内存上下文。

---

## STEP 2 — Select Next Task

从 Playbook 中寻找：

1. `Status: TODO`
2. 所有 `Depends on` 均为 `DONE`
3. 当前环境具备实施条件

优先顺序：

1. 当前 Phase 内依赖满足的最早任务
2. Phase Closure Task
3. 下一 Phase 的入口任务

如果一个 Task 为 `BLOCKED`：

- 不得假装完成；
- 可以寻找与它无依赖关系、仍然可执行的其他任务；
- 如果所有后续任务都被其依赖阻塞，则触发 Hard Stop。

唯一例外：先核对 `docs/development-dependency-exceptions.json` 的精确依赖边、前置证据和开发限定范围，并运行 `pnpm validate:task-map`；只对获授权的下一任务解除**开发调度**阻塞。例外不使上游任务成为 DONE，不通过 Phase Gate，也不免除原 Test ID。第二执行器仍不可用时不反复询问相同 API Key；仅用户后来明确提供合法授权和测试预算时补验。与本次例外无关的新安全、数据破坏或付费问题继续 Hard Stop。

---

## STEP 3 — Mark IN_PROGRESS

开始真正修改代码前：

将当前任务：

```text
Status: TODO
```

改为：

```text
Status: IN_PROGRESS
```

并更新：

`docs/forge-autopilot-state.md`

记录：

- currentTask
- phase
- startedAt
- baselineStatus
- lastCompletedTask
- activeBlockers

---

## STEP 4 — Baseline

按 Playbook 当前任务要求执行 baseline。

最低：

```bash
pnpm validate:contracts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Desktop 相关：

```bash
pnpm smoke:desktop
```

Executor / Workspace / Provider 任务：
执行对应真实 probe/live test。

如果 baseline 本身失败：

1. 判断是否由上一任务引入。
2. 若能安全定位，先修复回归。
3. 不允许通过删除测试、降低安全配置或跳过正式代码来变绿。
4. 3 次有实质差异的修复尝试后仍无法解决：
   - 当前任务标记 `BLOCKED`
   - 写入 blocker
   - 判断是否有其他独立 Task 可继续

---

## STEP 5 — Implement Current Task

严格依据 Playbook 当前 Task 的：

- Goal
- Read First
- Implement
- Architecture
- Safety
- Tests
- Acceptance
- Do Not

一次只实施当前 Task 的范围。

**Autopilot 的“持续执行”不代表一个 Task 可以越界实现后续功能。**

---

## STEP 6 — Verify

必须运行当前 Task 的真实验证。

规则：

- Mock 只能用于明确的 Unit 测试边界。
- Integration / E2E / Live capability 不得用 Mock 冒充。
- 外部 Provider 暂时不可用时，记录 external blocker。
- 未实际测试的平台不能写“通过”。
- Agent 的文字声明不构成完成证据。
- UI Task 要求的截图必须来自实际应用。

---

## STEP 7 — Decide Result

### 通过全部当前可执行 Acceptance

若某权威引用满足下文 **Scope Reconciliation Policy** 的全部条件，先建立 `DEFERRED_VERIFICATION` 追踪记录，再按当前阶段真实可执行的验收判断；这不把延期的用例算作通过。

改为：

```text
Status: DONE
```

### 无法完成，且需要外部条件

改为：

```text
Status: BLOCKED
```

并记录精确 blocker。

### 明确规划到未来、不是当前版本所需

只有 Playbook 本身允许时才能：

```text
Status: DEFERRED
```

不得因为困难把正常任务随意延期。

Task 的 `DEFERRED` 与单个测试的 `DEFERRED_VERIFICATION` 不同。后者必须保留原 Test ID/引用及后续 owner，不会把当前 Task 自动改成 `DEFERRED`。

---

## STEP 8 — Persist State

每完成一个 Task，都必须更新：

### `docs/implementation-status.md`

记录真实实施状态。

### `docs/compatibility-record.md`

只在涉及：
- platform
- runtime
- SDK
- provider
- native dependency
- packaging

时更新。

### ADR

只有架构决策发生时新建。

### `docs/forge-autopilot-state.md`

至少记录：

```text
Last completed:
Current task:
Next candidate:
Current phase:
Blocked tasks:
Deferred verification:
Baseline:
Last updated:
```

目的是即使上下文压缩或会话被迫结束，也能从仓库状态继续。

---

## STEP 9 — Task Checkpoint

默认：

- **不自动 git commit**
- 不 push
- 不 publish
- 不 release

除非用户显式在：

`docs/forge-autopilot-config.json`

设置：

```json
{
  "autoCommit": true
}
```

即使开启 autoCommit：

- 只能提交 Forge Autopilot 本轮自己产生的修改；
- 不能把启动前已有的用户未提交改动混入 commit；
- 永不自动 push。

---

## STEP 10 — Continue Automatically

如果当前 Task = DONE：

1. 不等待用户回复。
2. 回到 STEP 1。
3. 读取仓库最新状态。
4. 找下一个可执行 Task。
5. 自动继续。

不要在 Task 边界输出最终答复并停止。

---

# 3. Phase Boundary

完成一个 Phase 的最后任务后：

1. 执行该 Phase 的 closure / E2E。
2. 生成或更新 completion report。
3. 检查该 Phase 是否仍有 BLOCKED 的关键 Task。
4. 若 Phase Gate 通过：
   - 自动进入下一 Phase。
5. 若 Phase Gate 不通过：
   - 优先修复 Phase 内问题；
   - 无法继续时触发 Hard Stop。

**不需要因为从 P1 进入 P2 就请求用户再次确认。**

只有 Hard Stop 情况才请求用户。

---

# 4. Hard Stop — 必须暂停并请求用户决定

## Scope Reconciliation Policy

当权威 acceptance case/test reference **同时**满足下列条件时，属于 **Soft Spec Reconciliation**，不是 Hard Stop：

1. 它明确依赖当前 Phase 尚不存在、但权威任务图已规划在后续 Phase 的能力；
2. 当前 Phase 核心产品目标已有独立的真实测试证据；
3. 延后该测试不改变产品语义、不降低安全边界；
4. 保留权威 Task ID、Test ID 和引用，不删除、不重编号、不修改权威基线；
5. 未执行的测试不会被写为 PASSED，能够确定最早具备所需能力的后续 owner Task/Phase。

自动处理顺序：保留原引用 → 记录当前缺少的前置能力和现有证据 → 找到最早 owner → 在 `docs/deferred-verification.json` 以 `DEFERRED_VERIFICATION` 登记 → 更新 ADR、implementation status 和 phase completion report → 按当前 Phase 可实现的真实验收收口 → 自动继续下一个依赖满足的 Task。Owner 开始时必须重新读取映射；仅在真实验证后才能把对应测试改成 PASSED。`pnpm validate:task-map` 校验映射的 ID、阶段与依赖方向，但不能替代运行测试。

这条规则只处理**验收时间与能力归属**，不改变验收内容。当前 Phase 的核心功能如果没有真实验收证据，仍不能过 Phase Gate。

## 默认工程决策

如果多个技术处理方案中有一个同时满足：不改变产品语义、不扩大权限、不破坏已有数据、不降低验收标准、保持向后兼容、可回滚、与现有 ADR/架构一致，则自动采用该最小、安全、可逆方案，记录取舍并继续。普通工程实现与规格引用清理不要求用户在 A/B/C 中选择。真正涉及产品、架构、安全、不可逆变化或明显费用的决定仍按以下 Hard Stop 规则处理。

## 仍需 Hard Stop 的边界

除下列各节列出的具体情况外，下列任一情形也必须暂停：改变核心产品语义；降低安全边界；破坏性数据迁移；替换核心架构；两种方案会产生明显不同的用户行为且权威规格无法判断；需要新付费账号、凭据或明显费用；无法判断验收项属于当前还是未来阶段；延期会使当前 Phase 核心功能在未获真实验证时进入后续阶段。

以下情况不允许 Codex自行拍板：

## 产品语义

- 改变 Forge 的核心产品定位
- 改变 Task Approval 语义
- 改变 Done / Merge / Deploy 的边界
- 将 ProofRun 并入 Forge
- 删除原本明确要求的核心功能

## 核心架构

- 替换 Electron / Vue / Forge Host 主架构
- 放弃 Plugin API 边界
- 让 Main 承载业务 Runtime
- 让 Renderer 直接获得 Node / Shell / DB
- 替换 SQLite 主持久化路线且涉及迁移

## 安全

- 需要放宽 sandbox / contextIsolation / webSecurity
- 需要全局开放安装脚本
- 需要任意 Shell endpoint
- 需要扩大 Project Trust 为无限权限
- 需要删除用户数据或源码
- 需要运行破坏性 migration

## 成本 / 外部账户

- 需要用户提供新的付费服务账号
- 需要新的 API Key / 登录
- 会产生用户未授权的明显费用
- 需要创建云资源

## 数据迁移

- destructive migration
- irreversible schema change
- 无法确认用户数据是否安全

## 规格冲突

- `forge_spec_v1.0`
- 已落地 ADR
- 当前真实代码

之间出现无法通过兼容实现解决的核心冲突。符合上文 Scope Reconciliation Policy 的跨阶段测试引用按 Soft Spec Reconciliation 处理，不重复触发本项。

## 连续失败

当前关键 Task：
- 已进行至少 3 次有实质差异的修复尝试；
- 仍无法通过；
- 且所有后续任务都被该任务阻塞。

此时必须停下，并给出：

```text
Blocked Task
What failed
What was attempted
Evidence
Options A/B/C
Recommended option
Impact of each option
```

---

# 5. Soft Block — 不要打扰用户，继续其他可执行任务

以下情况通常不需要停：

- Windows 实机暂时没有，但当前 Task 可以完成 macOS 实现
- macOS Intel 未验证
- 某个 optional live test 因外部网络临时失败
- 非关键截图工具失败，但业务验证可完成
- 当前 Phase 存在一个非依赖型 BLOCKED Task，还有其他独立 Task 可做

记录并继续。

---

# 6. Context Management

Forge 项目很长，不能依赖一个巨大聊天上下文。

每完成一个 Task：

1. 将决定写入代码 / ADR / status。
2. 将当前运行状态写入 `docs/forge-autopilot-state.md`。
3. 下一任务重新从文件读取。
4. 不通过“我记得上一轮”替代仓库事实。

如果 Codex 需要压缩上下文：
优先保留：

- 当前 Task ID
- Playbook 路径
- implementation status
- compatibility status
- ADR
- Git diff
- failing tests

而不是保留长篇自然语言历史。

---

# 7. Progress Reporting

Autopilot 运行期间可以输出简短进度：

```text
[P1-01] DONE
[P1-02] IN_PROGRESS
```

不要每个 Task 都输出完整最终总结后停下。

完整总结仅在：

1. Hard Stop
2. 所有非 DEFERRED 任务完成
3. 当前执行环境/平台强制结束会话

时输出。

---

# 8. 会话被平台强制结束时

Codex 不能保证一次会话无限运行。

如果因为：

- 会话时限
- 工具时限
- 客户端强制结束
- context 限制

不得继续：

必须先尽量更新：

`docs/forge-autopilot-state.md`

然后最终输出：

```text
AUTOPILOT PAUSED BY RUNTIME

Last completed:
Current task:
Current status:
Next action:
Resume command:
继续 Forge Autopilot
```

这样下一次用户只需要发送：

> 继续 Forge Autopilot

不需要重新贴长 Prompt。

---

# 9. 完成条件

Autopilot 持续运行，直到：

- P8 所有非 DEFERRED Task 均 DONE，且每个 Phase Gate 均通过；或
- 用户主动停止；或
- 触发 Hard Stop；或
- 平台强制结束。

权威 `planning/tasks.json` 中的 P8 是手机 PWA Companion，属于正常任务链；P9 才是可选增强，默认 DEFERRED，不自动实施，除非用户后续明确开启。
