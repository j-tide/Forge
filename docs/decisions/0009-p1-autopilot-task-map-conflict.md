# ADR 0009: P1 Autopilot 任务映射冲突（待决）

日期：2026-09-23。状态：**用户选择 A，任务映射已修订；参考规格保持只读**。

## 事实

- `forge_spec_v1.0/planning/tasks.json` 和蓝图将 P1-02 定义为 M02「项目及环境数据服务」：项目 CRUD、环境/命令预设版本、归属与写操作 CAS；测试 T006–T010。P1-03 是「会话与消息流」。
- `forge_spec_v1.0/planning/phases.json` 的 P1 依赖链共有 P1-01～P1-10，出口为草稿经人工审批进入 TODO，且不自动写代码。
- 新的 `docs/forge-codex-execution-playbook.md` 将同一 P1-02 编号定义为「模型 Provider 与 Secret Storage」，要求 Electron safeStorage、凭据 UI 和至少一次真实 Provider 请求；它仅列 P1-01～P1-07，随后直接进入 P2。其 P1-03～P1-07 的任务内容也不对应参考任务清单的相同编号。
- Playbook 的首页明确写产品语义、架构与契约以 `forge_spec_v1.0/` 为优先来源。Autopilot Protocol 仅覆盖“做完一个 Task 就停止”的执行节奏，不覆盖任务范围、验收或依赖。

因此，同一 P1-02 编号无法同时代表两个不同领域与验收集合。若直接照 Playbook 运行，会跳过权威 M02 数据服务；若直接照任务清单运行，会静默忽略用户提供的 Model Provider/Secret Storage 步骤。把两者合并进 P1-02 又会违反“一次仅实施一个 Task”的边界。Phase Gate 也无法在 7 项与 10 项的映射下得出一致结论。

## 建议与待决定选项

**A（建议）**：以参考 `planning/tasks.json` 的 P1-01～P1-10 编号、依赖和验收为准，修订 Playbook 的 P1 段。P1-02 先做项目及环境数据服务；把 Model Provider/Secret Storage 明确放到后续独立任务或经批准的 P1-03 前置切片，并给出独立编号/依赖/验收。这样保留原 M02 的项目隔离与 CAS 要求，也不会把 Codex Executor 误用为聊天 Provider。

**B**：以当前 Playbook 的 7 项新 P1 排期为准，正式修订产品规划、Phase 定义与 acceptance 映射，说明原 P1-02 数据服务、P1-08～P1-10 的去向。此项会改变已批准的任务范围与 Phase Gate，须经产品确认；不能只改 Playbook 状态。

**C**：先保持两份计划并行，但为 Model Provider 增加不复用 P1-02 的独立任务 ID，同时定义跨表优先级和 Phase Gate。实施前需解决其依赖顺序及不重复的验收编号。

## 决定与执行结果

用户选择 A：以参考 `planning/tasks.json`、`phases.json`、acceptance cases 与主蓝图为任务 Source of Truth。Playbook 改为 P1～P9 全部 92 个权威任务，编号、名称、依赖、模块、引用测试和每阶段出口逐项一致；P1-01 保持 DONE，P8 手机 PWA 是正常任务链，P9 可选增强默认 DEFERRED。原有 64 个详细说明块保留在 Playbook 文末并标出映射到的权威 ID；Model Provider API 归 P4-07，内置整理器最小调用归 P1-04，凭据基础安全要求随相关调用实施、产品化管理归 P6-04。旧说明不能覆盖权威任务范围。

新增 `pnpm validate:task-map` 和 CI 步骤，检查 9 个阶段、92 个任务、顺序/名称/依赖/Phase Gate、120 个验收用例引用与 64 个说明块映射。参考资料目录未修改，Playbook P1-02 恢复为权威「项目及环境数据服务」并可按依赖继续。
