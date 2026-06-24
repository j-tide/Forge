# P1 阶段收口报告

日期：2026-09-24。平台：macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0。权威阶段出口：**从想法生成草稿，经人类审批进入 TODO，尚不自动写代码。** 当前版本的真实 Desktop/Host/SQLite 集成满足该出口；这不表示完整多 Agent 产品、跨平台安装包或所有参考验收用例已经通过。

| Task | 当前阶段结果 | 主要实证 |
| --- | --- | --- |
| P1-01 项目选择与可信环境向导 | DONE | 系统目录选择、Host 只读探测、显式 Trust、持久化及仅元数据移除 |
| P1-02 项目及环境数据服务 | DONE | Project/Environment/CommandPreset 隔离、CAS、归档、迁移与重启 |
| P1-03 会话与消息流 | DONE | 本地消息持久化、幂等、重启与错误保留；无伪造模型回复 |
| P1-04 整理器与结构化任务生成 | DONE | 真实 Codex 只读草稿生成、有限 Schema 修复、离线手工降级 |
| P1-05 草稿编辑与澄清 | DONE | revision CAS、验收来源、未解问题门禁、历史与重启 |
| P1-06 审批与原子入 TODO | DONE | 人工批准绑定 revision/scopeHash；Task、不可变 revision、事件同事务；不会自动开工 |
| P1-07 任务看板与同列排序 | DONE | 真正的 TODO 快照、筛选、同列排序、越列拒绝、空/离线状态 |
| P1-08 任务详情与来源链 | DONE | 已批准不可变合同、逐项 AC 来源、同项目深链重载 |
| P1-09 自然语言控制提议 | DONE | 持久消息来源绑定，只读受控提议；伪造执行命令被拒绝 |
| P1-10 P1集成与手工降级 | DONE（阶段范围） | `pnpm smoke:p1-offline` 真实完成选择/信任→消息→手工草稿→人审→TODO→Desktop 重启，项目源码和脚本未触碰 |

## 验证与证据

- P1-10 最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均 exit 0。此前 `pnpm smoke:projects` 也通过真实项目/会话/草稿/审批/看板回归。
- 独立临时 Git fixture 通过 Electron UI 操作；空 Codex 认证目录及不可达代理下无需模型调用。测试检查源 Git HEAD/status 不变、声明的项目测试脚本未运行。代理不是操作系统级断网。复现细节及逐用例证据见 [P1 手工降级](demo/p1-manual-offline.md)。
- 真正的 1440×900 Electron 看板截图：`output/playwright/p1-10-offline-approved-todo-1440x900.png`，已查看。此路径在本地生成并被 Git 忽略，重跑命令可重新取得。
- 权威规格包 `forge_spec_v1.0/` 的 Task ID、Test ID、依赖、Phase Gate 和引用未改。`pnpm validate:task-map` 也检查了 10 条 `DEFERRED_VERIFICATION` 映射；机器校验不能代替执行测试。

## 延后验收，不计 PASSED

`docs/deferred-verification.json` 是跨阶段验收追踪表。T016→P2-05；T021/T022/T025→P3-12；T024→P7-08；T116/T117/T120→P6-09；T118→P9-06；T119→P2-05，并在 P6-09 复测全角色成本。各项当前部分已测的边界见 [P1 手工降级](demo/p1-manual-offline.md)；依赖后续能力的完整用例状态均为 **DEFERRED_VERIFICATION**，不能被后续报告写成 P1 已通过。用户批准的阶段范围解释与安全条件见 [ADR 0018](decisions/0018-p1-closure-acceptance-scope-conflict.md)。

## 平台与工程风险

Windows x64、macOS Intel、真实系统 DPI、`.asar`/安装包、签名与公证、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。当前不是跨平台发布验收。P1-10 不创建业务 Run，也不证明 Review、Verify、身份 scope、策略回滚或 Agent 评测。P2-01 可依据 P1-10 的阶段范围 DONE 启动；每个延后 case 在 owner Task 必须真实复测。未提交、推送或发布。
