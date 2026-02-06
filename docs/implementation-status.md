# Forge 实施状态

## P4-05 · Claude SDK真实适配 · 2026-09-24

状态：**BLOCKED，未验收、未标 DONE。** 权威交付要求第二个真实 Executor 用同一契约完成独立编码任务。已按官方资料固定 `claude-agent-sdk==0.2.159` 和 `python/uv.lock`，将直接与传递依赖纳入许可证库存及 `versions.lock.json`。`pnpm probe:claude-offline` 在受 Forge `ProcessController` 管理的真实子进程中调用随包 CLI 的 `--version`：SDK 0.2.159、CLI 2.1.281、darwin/arm64、API Key 未配置、`liveVerified=false`；环境过滤不转发 API Key/OAuth 值。新增测试确认不打印密钥和离线子进程清理。**这只验证安装与本机二进制，不是 Claude Executor 适配或真实任务验收。** Python Registry 仍仅注册 Codex；Host/Core/UI 不声称 Claude 可用。见 [ADR 0052](decisions/0052-claude-sdk-api-key-gate.md)。

用户明确表示目前没有 Claude API，暂不验收此部分。官方文档要求第三方产品使用 API Key，不得使用本机订阅登录替代。未进行在线 Claude 请求或产生模型费用；未实现/验证 Claude 事件归一、工作区写入、审批、取消、续接、模型/认证失败与同一合同切换。T041～T045 保留权威引用，未标 PASSED。P4-06 及其后任务在权威图中依赖 P4-05，没有独立可执行的下一项；按 Autopilot 凭据/费用 Hard Stop 停在本任务。恢复需用户在仓库外安全配置授权的 Anthropic API Key，并明确允许有成本上限的真实 fixture；届时继续实施与真实验收，不跳过 P4-05。Windows/Intel/安装包仍未验证。本轮没有修改 SQLite、用户数据、插件生产注册或 Renderer 权限，没有提交、推送或发布。

本轮检查：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/37 deferred）、`pnpm probe:claude-offline`（SDK 0.2.159/CLI 2.1.281、无 Key、未 live）、`pnpm py:check`（111 pytest、Ruff、严格 mypy 45 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host schema24、degraded/crash/owned cleanup）及 `git diff --check` 均 exit 0。**未运行 Claude live test，不能把 P4-05 标为验收通过。**

## P4-04 · 配置生成表单 · 2026-09-24

状态：**DONE（macOS arm64 当前任务范围）；P4-05 已开始。** Python Host 新增固定无参数 `plugin.inspectBundled` 只读诊断，返回锁校验后的真实内置 Codex manifest 版本、API 范围、兼容/激活状态、问题清单和封闭配置 Schema。Electron Main 仅受信主框架可调用固定 IPC；Preload/Client 不暴露任意 Host 方法、Node、文件系统或凭据。正式 `@forge/ui` 的 `ForgeSchemaForm` 从受限 scalar Schema 生成有标签的控件，仅序列化声明字段；credential 字段用 masked input 且只接受 `credential:<id>`，原始 Key 不返回或提交。Python Manifest 与 TS Schema 同步拒绝未知词汇、未知配置字段、错误类型。Codex 实际 Schema 为空，Desktop 插件页真实显示“无可编辑配置项”，没有虚构 Save 或凭据管理。兼容错误展示 Host 的安全 code/message。见 [ADR 0051](decisions/0051-plugin-schema-form-and-read-only-inspection.md)。

真实 Electron→Python Host smoke：内置 `forge.executor.codex@0.0.1`、API `^1.0.0`、active/compatible、空封闭 Schema 从固定 bridge 返回，Vue 插件页可见；Renderer `require/process/ipcRenderer` 不可用，storage degraded、Host crashed/owned PID 清理回归通过。真实截图已检查：[插件页](../output/playwright/p4-04-plugin-desktop.png)（Retina 2880×1736 像素）。合成字段 fixture 仅用于表单校验，未伪称为已安装插件设置。完整跨页 T106～T110 继续按权威 ID `DEFERRED_VERIFICATION`，映射 P6-01/P6-02/P6-07；亮色 token 对比、既有焦点单测和 reduced-motion CSS 只是局部证据，不算双主题/Windows DPI 全项通过。

本轮命令：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（37 deferred）、`pnpm py:check`（110 pytest、Ruff、严格 mypy 44 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过。无新依赖、安装脚本、SQLite migration 或 API Key。Windows x64、macOS Intel、暗主题和安装包 **UNVERIFIED**。无提交、推送或发布。

## P4-03 · 内置插件装配与锁 · 2026-09-24

状态：**DONE（macOS arm64）；P4-04 已开始。** `python/src/forge/builtin_plugins/plugins.lock.json` 固定内置 Codex manifest/entry/config 的 SHA-256、插件精确版本和包摘要。Registry 在 discover、activate 和新 Run 前核对文件；缺失、重复、被改写或链接的锁/文件在导入 entry 前拒绝并进入只读诊断。新生产 RunConfig 保留既有 Executor/上游 CLI 锁，同时增加 `forge.executor.codex` 包 ID/版本/contentHash 的不可变锁，旧快照/SQLite v1～24 不重写。Development 只对 Registry 实际拥有的生产 Adapter 实施版本门禁，启动前核对包锁并取得 Run lease；返工保持同版本。活跃 Run 请求停用进入 draining，当前 Adapter 保留且新 Run 被拒；最后 lease 释放后才真正 dispose。见 [ADR 0050](decisions/0050-bundled-plugin-lock-and-run-draining.md)。

真实 `pnpm test:p3-live` 最终 exit 0：六个隔离场景、Electron→Python Host→Codex 开发 Run `73dcf502-5737-4684-bf86-a3c9fcf1c4d1`、正式 Verify/Review/人审/显式本地合并及真实混合状态看板；脚本从测试隔离 SQLite 读取 RunConfig，断言插件包 ID/版本/hash 与锁文件完全相同，源 Git 干净。首次 live 在直接注入未注册测试 Executor 的 Review 返工 fixture 因版本门禁失败；限定门禁为 Registry 实际拥有的生产 Adapter 后，定向及完整 live 重跑通过。另以 `uv --directory python build --out-dir output/package-probe` 检查 wheel 包含锁、manifest、entry 和 config schema。最终 `pnpm install --frozen-lockfile`、contracts（47 文件/0 error/4 既有 warning）、task-map（32 deferred）、`pnpm py:check`（108 pytest、Ruff、严格 mypy 44 源文件）、lint/typecheck/test/build、Desktop smoke/schema24 和 `git diff --check` 全部 exit 0。T038 目前受信插件 Registry 语义已实测，T040→P4-09 仍 `DEFERRED_VERIFICATION`。Windows/Intel、安装包执行、实际在运行中替换已签名应用包及第三方恶意代码隔离 **UNVERIFIED**。无新依赖、SQL、凭据、提交或发布。

## P4-02 · Registry与DisposableScope · 2026-09-24

状态：**DONE（macOS arm64）；P4-03 已开始。** Python Host 的 Registry 现在在导入受信 entry 前按依赖拓扑解析 Host 服务；缺失、重复和循环均明确拒绝。每次插件激活有独立 `DisposableScope`；公开 `PluginContext.register_executor()` 返回可幂等注销的 Disposable，额外资源可交给 scope 管理。注册只在激活完全成功后发布；中途异常先尝试插件清理，再逆序释放 scope，Host 自有服务继续可用。停用先撤销贡献，再清理插件和资源；重复 dispose 幂等。T036 实测 10 次激活/停用的监听器式资源回到基线，另 10 次真正拥有的 Python 子进程逐次退出。T037 注入第二资源后失败，逆序清理且无 Executor 泄漏；服务环路在 entry import 前拒绝。详见 [ADR 0049](decisions/0049-plugin-registry-disposable-scope.md)。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（全量检查时 35 deferred，T036/T037 证据登记后移除 2 项，现 33）、`pnpm py:check`（105 pytest、Ruff、严格 mypy 43 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host schema24/ready/degraded/crashed）及 `git diff --check` 全部 exit 0。T038→P4-03、T040→P4-09 仍按原权威引用为 `DEFERRED_VERIFICATION`，未标 PASSED。无新依赖、SQL、凭据或 Renderer 权限；Windows/Intel、安装包插件生命周期、恶意同进程 Python 代码隔离仍 **UNVERIFIED**。没有提交、推送或发布。

## P4-01 · Manifest和版本解析 · 2026-09-24

状态：**DONE（macOS arm64）；P4-02 已开始。** Python Host 的受信内置插件入口新增纯只读 `ManifestReport` 预检，返回具体 code/field/message，不执行 entry。检查权威 Schema 的清单字段、exact/caret SemVer API 范围、固定 allowlist 来源、受控文件大小/路径/symlink、平台、权限、所需服务、贡献类型及有限封闭配置 Schema/值。Registry discover 先拒绝无效静态清单；activate 在首次 import 前重复当前权限/服务预检。T039 的非法 ID、重复 ID、平台、未知权限、错误 API/配置/source 和真实 Registry import sentinel 均验证错误清单、无插件代码副作用及无 Executor 注册。此处不加载第三方插件；配置语法当前保守拒绝复杂 JSON Schema，后续 P4-04 需按正式表单要求扩展。见 [ADR 0048](decisions/0048-python-plugin-manifest-preflight.md)。

最终命令均 exit 0：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（33 deferred）、`pnpm py:check`（98 pytest、Ruff、严格 mypy 42 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host schema24/ready/degraded/crashed）、`pnpm probe:codex` 和 `git diff --check`。`probe:codex` 仍是本机 Codex 可用性诊断，不代表第二 Python Executor 或插件替换性验收。T036/T037→P4-02、T038→P4-03、T040→P4-09 保留 `DEFERRED_VERIFICATION`，未标 PASSED。无新依赖、SQL、凭据、提交或发布；Windows x64、macOS Intel、安装包内插件路径与恶意同进程 Python 代码隔离仍 **UNVERIFIED**。

## P3-12 · P3可交付验收样例与阶段出口 · 2026-09-24

状态：**DONE（macOS arm64 当前阶段范围）；P3 Phase Gate PASSED；P4-01 已开始。** 六个独立 Git/SQLite/Python Host 场景真实覆盖正常交付、混合状态看板、结构化 Review 退回、批准测试失败后的有界返工、非安全建议的人类豁免以及 Git 已更新后 Host 崩溃重启对账。另一次真实 `pnpm test:p3-live` 经 Electron→Python Host→Codex 完成消息/手工 Draft/人工批准 TODO→隔离开发→固定快照→批准命令 Verify→逐项 AC 决定→只读 Review→独立 Owner 验收 Done→另行确认本地合并；原生确认取消时目标不变，最终源 Git 干净。任务抽屉从 Host 读取正式 text/plain 验证报告，Vue 将恶意 HTML/链接当文本渲染。独立 Desktop 混合状态看板测试发现并修复 Host TODO 排序误计 Done 及嵌套键盘 Enter 被卡片拦截的问题，并覆盖越列拒绝、筛选、键盘排序。真实 1440×900 截图与 ID 见 [P3 Demo](demo/p3-delivery.md)；阶段结果见 [P3 报告](p3-completion-report.md) 与 [ADR 0047](decisions/0047-p3-delivery-acceptance-scope.md)。

最终质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/29 deferred）、`pnpm py:check`（83 pytest、Ruff、严格 mypy 41 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host、schema24/ready/degraded/crashed）和 `git diff --check` 均 exit 0。T116–T120 保留原权威引用、映射 P6-09/P9-06 为 `DEFERRED_VERIFICATION`，未标 PASSED。Windows x64、macOS Intel、安装包/签名/DPI、现有用户库升级、线上强制 Reviewer 二次退回与恶意第三方插件隔离仍 **UNVERIFIED**。无新依赖、凭据、提交、推送或发布。

## P3-11 · 备份与磁盘故障处理 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；现有用户数据库和安装包未实测）**。Python Host 的 SQLite 单写者边界新增在线 WAL 一致性备份，先检查完整性与外键，再将仅含 Forge 数据的私有备份原子发布。已有库升级先检查保守可用空间并创建升级前备份；新库不假造升级前版本。migration v24 仅增加限额不可变导入证据和插件 namespace 存储，不修改旧 migration/checksum。失败升级回滚并锁住写入，旧 Task/审批不丢；磁盘满写入回滚、Host storage health unavailable，后续写入拒绝。备份恢复由用户明确操作，本轮不自动覆盖较新数据库。见 [ADR 0046](decisions/0046-wal-backup-artifact-and-disk-fault-boundary.md)。

真实验收：独立子进程在 Task/审批/Run event 同一事务中途 `os._exit`，重启三者均维持先前已提交值（T086）；活跃 WAL 库含已批准 Task 和导入 Artifact，在线备份恢复最新已提交记录且 `foreign_key_check` 通过（T087）。注入错误 SQL 的 v25 测试升级保留 v24 旧值与升级前备份，Host health 不报 ready；真实 v23→v24 独立 Python Host 启动也保留已批准 Task（T088）。SQLite `max_page_count` 触发真实 `SQLITE_FULL` 而非假异常，写入回滚、无成功标记、诊断为 `DATABASE_DISK_FULL`（T089）。插件通过 manifest 声明的 `storage.v1` 只能得到自身 JSON key/value 句柄，不能通过该接口查询 Core 表或获取 SQL 会话；两插件 namespace 隔离（T090）。ArtifactStore 仅从 Forge 拥有且匹配 Project/Verify Job 的私有根读取，拒绝遍历、绝对路径、符号链接和错误 MIME，T057 的通用文件导入边界得到真实测试并从 deferred 中移除。恶意同进程 Python 插件可绕过语言封装，正式第三方进程隔离仍属 P4；SQLite 备份不包含外部 Git CodeSnapshot 对象。

最终质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/28 deferred）、`pnpm py:check`（82 pytest、Ruff、严格 mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host、schema24/ready/degraded/crashed）与 `git diff --check`。首次 Python 全量回归暴露事务包装将约束失败误映射为 IO_ERROR，改为只对 SQLite FULL/IOERR/READONLY/CORRUPT/NOTADB 锁故障后 82 项通过。现有用户 DB v23→24、安装包、Windows x64、macOS Intel、DPI、签名及恶意第三方插件进程隔离 **UNVERIFIED**。无新依赖、凭据、提交、推送或发布。下一权威任务 P3-12 已开始。

## P3-10 · 配置/需求变化失效链 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；不宣称真实 Codex 运行中修改目标已在线实测）**。Python Host 新增独立 Task 版本变更提议、精确 hash/revision 人工决定和安全点应用；SQLite 附加 migration v23 只增加 `task_change_requests`，不重置用户 Project/Task/Run。提议保留旧 RunConfig/Run/Attempt，变更目标或 AC 不注入活跃执行上下文；活跃 Run、Review、Verify、返工及 interrupted Run 时批准仅成为 `awaiting_safe_point`，需全部结束后再次明确应用。批准等待期间拒绝新 Run/Review/Verify；应用后旧 CodeSnapshot、Review/Verify、AC 矩阵与最终人审只作历史记录，不可使当前 Task Done，旧 Review issue 标为 stale。旧 Handoff 不能对新 Contract 启动 Review/Verify。Task 来源保留旧消息/决定并新增本次人类决定；拒绝和 CAS 冲突不改 Task。Vue 任务抽屉提供每条 AC、目标、原因和范围确认的变更入口，不执行模型或自动开发。见 [ADR 0045](decisions/0045-approved-task-revisions-and-safe-point-invalidation.md)。

真实证据：隔离 Git/SQLite fixture 验证当前已接受快照的 Task v2→v3、旧 RunConfig 与源 HEAD 不变、矩阵/最终验收失效、旧 Review/Verify 启动拒绝、活跃 Run 安全点等待、重复 apply 幂等、拒绝后第二客户端不能批准、AC 改动必须确认范围。独立 Python Host stdio 进程提议→退出→新进程批准→再重启读取，非法额外 RPC 字段拒绝；Vue 测试验证提议与批准分离、等待提示及历史 Handoff 不可 Review。既有 P1 测试继续覆盖 T016–T020 的未批准开工、并发初始批准、旧 hash 失效、拒绝与 AC 来源；权威 Test ID 未改。

最终命令：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/29 deferred）、`pnpm py:check`（73 pytest、Ruff、严格 mypy 39 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host、schema23/ready/degraded/crashed）与 `git diff --check` 均通过。首次 Desktop smoke 因旧 UI 断言 schema22 而失败，更新为真实 23 后重跑通过。真实用户现有 DB v22→23、Windows x64、macOS Intel、安装包/签名/DPI、真实 Codex 中途修改目标与历史孤儿进程自动接管仍 **UNVERIFIED**。无新依赖、权限、提交、推送或发布。下一权威任务 P3-11 已开始。

## P3-09 · 崩溃恢复与 reconcile · 2026-09-24

状态：**DONE（macOS arm64 开发路径；不声称可自动接管遗留进程）**。Python Host 首次可写握手在接受新 Run 前扫描上次 runtime 留下的 Run、Attempt、session ref、lease epoch 与进程日志。不能核实 kernel start identity 与原生 session/workspace 所有权时，不按历史 PID 杀进程、不自动恢复或重跑；未完成的 Run/Attempt 进入 `interrupted`，旧 lease 保留为 `quarantined`，审计记录 `host_restart_outcome_unknown`。重复握手不会重复改状态。已完成 Run 保持不变。Merge startup audit 核对目标分支精确双父 commit 及 Forge-owned candidate 工作区证据后才补记 `merged`；目标仍为旧 HEAD 时保留 intent 并要求人工确认；其他结果标 unknown。UI 显示待人工核对，不提供新 key 的盲目合并按钮。无新数据库 migration、依赖、权限或 Node Agent Core。见 [ADR 0044](decisions/0044-startup-recovery-and-side-effect-reconciliation.md)。

真实证据：隔离 Git/SQLite fixture 中独立 Python Host 进程在持久 intent 后、候选双父提交后、目标 branch 更新后分别 `os._exit`。新 Host 启动未执行第二次合并；前两种保留待人工，后一种核对 Forge-owned candidate/共同 Git 目录/唯一 commit 后补记已合并；目标更新但 candidate 证据缺失则标 unknown，源工作树干净。另一组真实 SQLite Run fixture 证明未完成 Attempt 中断、lease 隔离、历史 PID 即使等于当前测试进程也不被信任；重复恢复幂等。T031 terminal 结果重放不增事件，T032 过期 epoch 仅记 `result.stale`；已有有限 429 和真实父子孙取消/端口释放测试覆盖 T033/T035。T034 原 deferred 的 P2-01、P2-05、P3-06 引用在本轮以真实 Host 死亡测试验收，不修改权威 Test ID。

冻结安装、contracts/task-map、`pnpm py:check`（69 pytest、Ruff、严格 mypy 38 源文件）、lint、typecheck、test、build、macOS arm64 Electron Desktop smoke/schema22 和 `git diff --check` 全部 exit 0；新增 UI 告警测试单独复跑通过。真实当前用户 DB 未升级实测，Windows x64、macOS Intel、安装包/签名、历史孤儿进程安全接管或清理、真实 Codex 会话跨 Host 原生续接和外部并发 Git 写者 **UNVERIFIED**。这些不作为已通过验收。下一权威任务 P3-10 依赖已满足，将自动开始。

## P3-08 · 交付记录与显式合并 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；只支持当前已检出的干净本地目标分支）**。Python Host 在当前快照已获人类最终验收时保存不可变交付记录：获批 Contract hash/revision、所有开发 Attempt、最终 CodeSnapshot/base/commit、Review/Verify/逐条 AC 决定、人工豁免与明确风险。正式 Plan 尚未存在，因此 `planStatus=not_configured`，没有捏造 Plan。SQLite 附加 migration v22 只增加 `delivery_records` 和有唯一键的 `merge_operations`。Task Done 与本地 merged 分开：网页需明确勾选，Electron Main 再弹原生确认；Main 不运行 Git/SQL。Host 重查 Trust、最终验收与证据版本、Forge 快照 ref、当前目标分支及干净工作树，严格要求 target HEAD 与已验证 base 一致。合并前先记 operation intent，在 Forge 自有的隔离 worktree 形成固定双父候选，再仅以 `git merge --ff-only` 更新本地目标；不 force、不 reset、不 stash、不 push、不部署。重复 key 返回同一记录，重启后从 Git 双父 HEAD 对账未落库的结果，歧义状态不报成功。见 [ADR 0043](decisions/0043-delivery-record-and-explicit-local-merge.md)。

真实证据：四项独立 Git/SQLite/Host JSON-RPC 测试覆盖交付内容、一次显式双父合并、同 key 重放、合并后未写 receipt 的重启对账、目标前移拒绝且用户工作树不变、验收后 AC 证据变化使旧 Done/交付失效。`FORGE_VERTICAL_MERGE_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终 exit 0：真实 Electron→Python Host→Codex 开发 Run `e50fe6c3-8124-4a1c-bf57-f7def18385ef`，快照 `d35e1147-b00e-4819-a8f0-013626c6dc44`，Verify `efa45630-5654-49ac-a238-6e2bcd62a2d8` passed，Review `1da444a9-939a-406b-aefe-c1b4e205d366` approved，人审决定 `00ddf7f0-ce5b-489b-800e-18300ec7215d`。原生确认第一次取消，源码 HEAD 未变且没有 merge operation；第二次 UI 显式确认生成 operation `42895d6d-d31e-4c01-8592-54ff626cca20` 和双父 commit `ef9e229a8ac85b9087c3ec69b9e000dcd29defbf`，源工作树干净。实际 1440×900 [截图](../output/playwright/p3-08-python-desktop-merged-1440x900.png) 已目视核对。第一次在线测试在脚本未定义字段处停止；第二次暴露 Host 线程池调用 SQLite 的真实错误，修复为 Host 本线程执行有界 Git，并新增 Host JSON-RPC 回归；第三次完整在线运行通过。没有把前两次当成功证据。

最终质量链：冻结安装、contracts/task-map（9 phase/92 task/120 case/32 deferred）、Python pytest/Ruff/严格 mypy、lint、typecheck、test、build、Desktop smoke/schema22 与 diff check 均 exit 0。T050 的旧 base 合并拒绝与 T060 同操作键/重启对账已验证，从 deferred 中移除；T056/T058/T059 沿用此前实际证据，T057 通用外部 Artifact 路径/MIME 导入仍 `DEFERRED_VERIFICATION`→P3-11。真实用户已有 DB v21→22、Windows x64、macOS Intel、安装包/签名、外部并发 Git 写者及长期 Git 操作的 Host 响应性 **UNVERIFIED**。无新依赖、对 Forge 仓库提交、推送或发布。下一权威任务 P3-09 已开始。

## P3-07 · 人类最终验收 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；旧快照与未满足门禁均不能验收）**。Python Host 独占最终验收服务；用户在任务抽屉查看当前获批 Contract revision、不可变 CodeSnapshot、Review、Verify 与逐条 AC 决定后，明确确认接受或填写理由退回。提交带预期 snapshot/revision/basis hash，Host 在同一 SQLite 事务中重算并拒绝过期报告、快照或 AC 决定。缺少成功开发 Run、获批 Review、逐项覆盖、失败 Verify 或仍在运行/返工时不能接受。SQLite 附加 migration v21 保存不可变、幂等的最终决定与非安全 Reviewer 建议风险豁免；Host 固定本地 Owner actor，记录理由和证据版本。阻断性 Review issue 无法豁免。接受仅将当前快照投影为 Board Done，**不合并、不推送、不部署**；人工退回会从固定失败快照启动有来源反馈的新独立 Attempt，旧验收不沿用。见 [ADR 0042](decisions/0042-snapshot-bound-final-human-acceptance.md)。

真实证据：独立 Git/SQLite/Host 测试覆盖报告变化后的 CAS 拒绝、明确 AC 决定、建议问题 Owner 豁免、阻断问题拒绝豁免、接受后重启保持、人工退回新 Attempt/新快照和源 Git 干净。真实 Electron→固定桥→Python Host→Codex 的 `FORGE_VERTICAL_FINAL_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终 exit 0：开发 Run `58925161-f46e-4f9e-91e0-59652ddd6746`，快照 `73f52b25-2186-491c-8959-0bfc5444854c`，Verify `f7237a2e-30b3-41d7-9752-7454f0fe07b2` passed，Review `3fe027a2-00ba-4c8f-9286-fe4850ac94d9` approved，最终决定 `08100199-df15-401a-8f6c-59c53448ac63`，Board Done，源 Git 干净。实际 1440×900 [截图](../output/playwright/p3-07-python-desktop-accepted-1440x900.png) 已目视核对。第一次 live 运行仅因验收脚本在 Run succeeded 后立即读取尚在冻结的 Handoff 而失败；改为有界等待后完整重跑通过。在线模型这次无 advisory，豁免由真实 Host/Git/SQLite fixture 与 Vue 交互测试覆盖，未宣称在线模型豁免实测。

最终质量链：冻结安装、contracts/task-map（9 phase/92 task/120 case/35 deferred）、`pnpm py:check`（58 pytest、Ruff、严格 mypy 36 源文件）、lint、typecheck、test、build、Desktop smoke 和 diff check 全部通过。T055 非安全 advisory 的正式 Owner 版本化豁免、T059 旧快照最终验收拒绝已取得证据，从 deferred 追踪中移除；T034 Host 硬崩溃未知副作用对账仍延后 P3-09。真实用户现有 DB v20→21、Windows x64、macOS Intel、安装包/签名及在线模型主动产生 advisory 后的豁免仍 **UNVERIFIED**。无新增依赖、自动提交、推送或发布。下一权威任务 P3-08 已开始。

## P3-06 · 有限返工循环 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；T034 Host 硬崩溃后副作用对账延后 P3-09）**。Python Host 新增共享 Review/Verify 返工服务与 SQLite 附加 migration v20。当前快照的不可变 `changes_requested` Review 或失败 Verify 报告各可触发一次幂等返工；同一快照不能并发启动两个写者。新 Developer Run/Attempt 从失败快照的固定 Git commit 建立独立工作区，继承冻结的 Task/Environment/RunConfig，加入有界且标明报告来源的反馈；新 Handoff 后只重跑原失败的 Review 或已批准 Verify 门禁。三次返工和二十次总 Attempt 上限共享，触顶投影 Task 为 blocked，不创建 Run、不伪造 Done。取消中的 owned 子进程确实停止，旧快照的 Review/Verify/AC 决定不会被新快照继承。`run.reworkCycles` 是固定只读诊断命令；Renderer、Main 均不执行业务或 SQL。见 [ADR 0041](decisions/0041-bounded-python-rework-loop.md)。

真实证据：`python/tests/test_rework.py` 的五项独立 Git/SQLite/实际子进程测试覆盖 Verify 失败→修复→自动 Verify 通过，Review blocker→有来源反馈的新 Attempt、Review/Verify 混合计数、重复失败触顶、二十 Attempt 上限与运行中取消；来源仓库保持干净。Review fixture 没有真实 ReviewJob，后续门禁正确 fail-closed；生产路径保留原 Reviewer Job/模型，真实 Codex 强制 Review blocker→自动重审循环尚未单独执行。`FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 实际 Electron→Main→Python Host→Codex 生成开发快照 `26662c64-50ee-4755-ac40-4205770da8e5` 与通过的 Verify `cd998b2a-6127-4c00-858c-5a86e8cd2489`，矩阵经过显式报告绑定成为 verified、来源 Git 干净；这次在线回归没有制造返工。首次 Desktop smoke 因仍断言 schema19 失败，修正为实测 schema20 后复跑成功。

质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/37 deferred）、`pnpm py:check`（54 pytest、Ruff、严格 mypy 35 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过；最后一轮计数与测试断言调整后定向五项 Python 测试、Ruff/mypy、contracts/web 测试通过。T031/T032/T033/T035 有确定性故障与幂等/界限证据；T033 的 429 是故障注入，未宣称上游实际返回 429。T034 硬 Host 崩溃未知副作用对账为 `DEFERRED_VERIFICATION`→P3-09。真实用户已有库 v19→20、Windows x64、macOS Intel、安装包、live Codex Review 返工循环仍 **UNVERIFIED**。无新增依赖、提交、推送或发布。下一权威任务 P3-07 已开始。

## P3-05 · 验收矩阵 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发路径的逐条 AC 映射；最终人类验收仍属 P3-07）**。Python Host 新增固定 `run.acceptanceMatrix/acceptanceDecide`：从已批准 Task Contract 当前 revision 逐条投影 AC，绑定 Task 最新不可变 CodeSnapshot，并展示当前快照的 Review 状态及真实 Verify 报告。自动 AC 初始 `unverified`、人工/检查项初始 `manual`；单条命令 `passed` 或 stdout 的成功文字不会自动覆盖任何 AC。用户明确关联当前快照报告并写理由后，自动项才可 `verified`；失败报告不能记作通过。人工判断可记录 `verified/failed/risk_accepted/not_applicable`，其中风险接受与不适用保留明确依据。required AC 未覆盖为 `inconclusive`，失败为 `failed`，全部有决定才为 `covered`；`covered` 不是 Task Done，最终人工验收仍必需。旧快照/旧 Contract/外项目报告、不受信任或非活动项目及任意额外命令字段均拒绝。SQLite 附加 v19 只新增不可变、幂等的逐条决定记录；既有业务库不重置。Vue 任务抽屉使用现有 @forge/ui 展示矩阵与明确的记录入口。见 [ADR 0040](decisions/0040-snapshot-bound-acceptance-matrix.md)。

证据：`python/tests/test_verifier_project.py` 在真实 Git/SQLite/进程/独立 Python Host stdio 中验证无结构结果仍 `inconclusive` 且 Task 不 Done、成功命令未自动绑定 AC、退出 7 的 PASS 文本不能 `verified`、显式风险理由、旧快照/陌生 AC/伪路径拒绝、幂等和重启持久；`python/tests/test_persistence.py` 真实 v18→19 升级且旧 metadata 保留。`packages/contracts/tests/acceptance-matrix.test.mjs` 与 Vue 组件测试校验固定 bridge、必需项缺口和 UI 明确操作。在线纵向命令 `FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终成功：真实 Electron→Main→Python Host→Codex 开发 Run `f84ff677-9220-4039-903e-02dcbb673e64` 生成快照 `2ecc754a-26be-4cb4-b8ed-048596e06f19`，批准的 test Verify `ff5acda7-4576-4b6e-84db-ccaa71b2db9b` 为 passed/exit 0；矩阵先 `inconclusive/unverified`，用户在 Vue 抽屉关联报告并写依据后为 `covered/verified`，仍显示 Review 未完成与最终人类验收要求。来源 Git 干净。实际 1440×900 [截图](../output/playwright/p3-05-python-desktop-acceptance-1440x900.png) 已人工查看。

质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（39 deferred）、`pnpm py:check`（49 pytest、Ruff、严格 mypy 34 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过。Vue 定向复跑最初因测试在 select 选项文字出现时过早断言而失败，改为等待 Host 更新后的覆盖状态再通过；产品逻辑未改。T044 的伪成功输出现在有无结构 Handoff+矩阵 `inconclusive` 且 Task 非 Done 的真实证据，两个历史 source task 的 deferred 条目已移除；T055 的 actor/version/正式 waived 与最终接受仍 `DEFERRED_VERIFICATION`→P3-07，T057→P3-11、T059→P3-07、T060→P3-08 保留。真实用户已有库 v18→19、Windows x64、macOS Intel、安装包和 Host 突然死亡仍 **UNVERIFIED**。无新依赖、凭据、提交、推送或发布。下一权威任务 P3-06 已开始。

## P3-04 · 命令验证器 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发路径；单项命令验证，不是正式验收矩阵）**。Python Host 在版本化 stdio `run.verifyStart/verifyJobs/verifyJob/verifyReport/verifyArtifact` 中，只接受固定项目、Task、Development Run、CodeSnapshot、检查类型、批准 Preset ID 和幂等键。重查 Project Trust、RunConfig/Handoff、当前最新快照、Environment、CommandPreset 审批哈希及脚本哈希后，在 Forge 拥有的 detached Git 快照副本中用 argv 和最小环境运行；ProcessController 管控进程树/超时。SQLite 附加 migration v18 存不可变 Job 报告和 UUID 限定的脱敏 stdout/stderr 证据。exit 0 且进程确认退出才可 `passed`；日志出现 PASS 而 exit 7 为 `failed`；无声明 test 且无 Preset 为 `not_configured`/需人工。副本的 build 产物只经身份核对后删除，用户源仓库不受影响。此服务没有自动设置 required AC 状态或 Task Done。见 [ADR 0039](decisions/0039-python-project-command-verifier.md)。

证据：`python/tests/test_verifier_project.py` 5 个真实 Git/SQLite/子进程/独立 Python Host stdio 测试覆盖 pass、失败、超时、not_configured、快照漂移、无批准拒绝、外部路径拒绝、脱敏证据、幂等、immutable/restart 和源 Git 干净。`FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 在真实 Electron→Main→Python Host→Codex 开发快照 `ca377444-d54a-4b09-92cf-4b5c07f2a593` 后，由已批准 `node test.js` 返回 Verify `295339f0-1ef1-4242-b06e-8626419a2924`，`passed`/exit 0，源 Git 干净。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（41 deferred）、`pnpm py:check`（46 pytest、Ruff、严格 mypy 33 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm smoke:desktop`（schema18）、`uv build --directory python --no-sources`、`git diff --check` 最终均通过。Desktop smoke 首次因旧断言仍期待 schema17 失败，改为真实 schema18 后复跑通过。

验收边界：T056/T058 当前语义真实通过。T057 通用 Artifact 服务的外部报告路径/MIME/root 导入防护→P3-11，T059 旧快照上的最终验收 409→P3-07，T060 合并幂等→P3-08，均保留原 Test ID 为 `DEFERRED_VERIFICATION`，未写 PASSED；[追踪表](deferred-verification.json)。当前只存固定 text/plain stdout/stderr，未来通用报告文件仍需实现。真实用户已有数据库 v17→18、Windows x64、macOS Intel、安装包路径和 Host 突然死亡清理 **UNVERIFIED**。没有新依赖、凭据、自动提交/推送/发布。下一权威任务 P3-05 已开始。

## P3-03 · 问题列表与退回交接 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发运行路径）**。Python Host 在用户显式请求后，从当前 Task 的不可变 DevelopmentHandoff 构建独立 ReviewContext，重新核对项目 Trust、最新 CodeSnapshot、Codex 模型与原生只读能力，再启动固定审查副本中的 Codex Reviewer。Review Job 先落库；Provider 的结构化结果经过 P3-02 Schema/快照门禁后形成不可变报告。附加 SQLite migration v17 保存 Review Job、Report、稳定 Issue thread、每轮 occurrence 和精简 ReworkHandoff，不修改历史表。相同问题在新快照/新 attempt 中保留 issueId；旧 Review 对新快照无效，完整新报告未再提及的问题只标 stale，不猜测 resolved/waived。返工交接含当前 Contract/快照和带锚点的 blocking issues，不复制开发聊天，不自动启动新开发 Attempt。独立 Python Host 固定 `run.reviewStart/reviewJob/reviewReports/issueHistory` 经已有受限 Renderer 桥提供；Vue 任务详情展示真实 Job、报告、Issue 历史及当前快照 Review 状态。见 [ADR 0038](decisions/0038-review-issues-and-rework-handoff.md)。

证据：`python/tests/test_review_issues.py` 使用真实 Git/SQLite/P1 批准 Task，验证同问题跨三个 Review attempt 与两个快照去重、旧结果拒绝、历史保留、后续 approved 使旧问题 stale、返工交接、报告不可变、Host 重启和独立 stdio 进程读取。真实 Electron→Main→Python Host→Codex 纵向命令 `FORGE_VERTICAL_REVIEW_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终 exit 0：开发 Run `e5f51f6e-9ada-4cd4-aa8b-fbb02da3a565`、Review Run `de458133-4ef7-4639-a9f5-0c9422a3460f`，模型返回绑定快照的 `approved`、0 问题，同一启动幂等键返回同一 Job，来源 Git 干净；这仅是 Review 通过，Verify 和人工验收未运行。实际 1440×900 Vue/Electron [截图](../output/playwright/p3-03-python-desktop-review-1440x900.png) 已查看。早先一次 live 运行在 UI 截图时因抽屉遮挡看板按钮失败；改为利用可恢复的 Task 抽屉后重复真实运行通过。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（38 条 deferred）、`pnpm py:check`（41 pytest、Ruff、严格 mypy 32 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（schema 17）、`git diff --check` 最终通过。第一次 Desktop smoke 因旧测试仍期待 schema 16 失败，更新为真实 v17 后复跑通过。

范围与风险：T054 的同问题历史现由真实 Git/SQLite fixture 覆盖，P3-02 的 deferred 条目已清除；T055 人工风险接受仍 `DEFERRED_VERIFICATION`→P3-07。P3-06 才执行有限自动返工调度，本轮仅产生结构化交接。参考 `contracts/schema.sql` 的完整未来 Review 表与当前附加 v17 表映射见 ADR；参考包未改。未在真实用户已有 v16 数据库、Windows x64、macOS Intel 或安装包内执行；Host 意外死亡时 Reviewer orphan 只标 interrupted/报告，不按 PID 自动清理。下一权威任务 P3-04 已开始。无提交、推送或发布。

## P3-02 · Review Profile与结果Schema · 2026-09-24

状态：**DONE（macOS arm64 的 Reviewer 契约与真实结构化输出探测）**。Python Host 包含受严格 Pydantic 校验的生产 Reviewer Profile、独立 prompt、固定 Handoff/RunConfig 构建的有限 ReviewContext，以及 `ReviewResult` 阻塞/建议/未知项 Schema。文件锚点、AC 来源、快照与 Task revision 必须有效；无结果、非法结果、旧快照不能 approved。`approved` 有阻塞或未知项时被拒绝。生产 Profile 将只读参考中的旧 `codex-sdk` 映射到当前 Python app-server `executor.codex`，参考包保持未改。见 [ADR 0037](decisions/0037-review-profile-and-structured-result.md)。本轮无 Task 状态推进或 Reviewer UI。

真实验收：`pnpm test:review-copy-live` 在 P3-01 固定只读审查副本中请求 Codex 0.155.1 的结构化 Reviewer 输出，`run.completed.structuredOutput` 被实际校验；由于 fixture 没提供完整 Diff，模型返回 `inconclusive`，没有伪装 approved。Codex 真实读取文件的结构化 command 事件可观察；独立诊断写入触发审批、显式拒绝后副本/来源 Git 仍干净。`python/tests/test_review.py` 验证空泛阻塞、陈旧结果、非法路径/AC、缺失结果和输出语义；P3-01 的真实只读限制继续有效。`uv build --directory python --no-sources` 的 wheel 包含 Profile 与 prompt。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 个参考 Profile warning）、`pnpm validate:task-map`（39 条 deferred）、`pnpm py:check`（40 pytest、Ruff、严格 mypy 30 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。T054 问题历史→P3-03、T055 人工风险接受→P3-07 保留 `DEFERRED_VERIFICATION`，不算 PASSED。Windows x64、macOS Intel、安装包内 Codex 沙箱和 Host 异常退出恢复仍 **UNVERIFIED**。下一权威任务 P3-03 已开始。

## P3-01 · 审查副本与权限 · 2026-09-24

状态：**DONE（当前 macOS arm64 的固定快照审查副本基础）**。Python Host 新增 `ReviewCopyManager`：核对 CodeSnapshot 的 Forge Git ref/commit/tree 后，在 Host 管理目录创建 detached worktree，记录 snapshot、Run、runtime 与 workspace ownership。只允许当前 Executor 能力明确 `readOnlyEnforced=true` 且 `enforcement=native-sandbox` 时创建；Review 请求必须绑定该副本与 Run，使用 `read-only + approval: never`。前后核对副本 Git 身份、HEAD/tree、tracked/untracked 清洁；活跃进程、修改、异运行时记录或 symlink 逃逸时拒绝释放，不自动清理孤儿副本。没有 Renderer 文件 API、正式 Reviewer 结果或 Task 状态流转。见 [ADR 0036](decisions/0036-snapshot-pinned-review-copy.md)。

真实验收：一次性 Git 仓库中，审查副本包含快照新增/修改文件，目标 main 后来前移也不改变副本，用户来源工作树未改。`pnpm test:review-copy-live` 用 Codex 0.155.1 真实读取副本；生产 `read-only + never` 未写文件；单独诊断使用 `read-only + on-request` 观察到写入 `approval.requested`，显式拒绝后收到 `approval.resolved=reject`，无文件改动。初次生产模式模型文字声称命令被拒，但没有结构化 command 事件，因此没有单凭文本当作强只读证明。`pnpm install --frozen-lockfile`、`pnpm py:check`（38 pytest、Ruff、严格 mypy 29 源文件）、`pnpm validate:contracts`、`pnpm validate:task-map`（37 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0，日志在 `/tmp/forge-p3-01-*.log`；新增测试断言再单独执行也通过。P3-01 引用的 T050 涉及目标分支前移后的合并/重验，保留 `DEFERRED_VERIFICATION`→P3-08；当前只验证副本快照不漂移。Windows x64、macOS Intel、安装包与异常 Host 死亡恢复未验证。P3-02 已开始。

## P2-10 · Python Host 纵向真实 Demo · 2026-09-24

状态：**DONE（当前 macOS arm64 开发运行路径的 P2 阶段范围）**。真正的 Electron Renderer→Main→Python Host→Codex app-server 链路完成系统目录选择/Project Trust→消息→手工 Task Draft→人工修订审批 TODO→显式启动→隔离 Git worktree 中的代码修改→真实 Diff/CodeSnapshot/Handoff。成功 Run `e67668ee-a32f-4718-9831-043ac3919746` 修改 `math.js`/`test.js`、运行 fixture `node test.js` 通过；人工读取生成的 Diff，确认只增加非 number 的 `TypeError` 校验与四个断言。来源仓库 HEAD/status 未变，任务仍处开发交接，正式 AC 为 `unverified`。真实 Codex 进程中断 Run `97b6b00b-8598-4cb3-9952-34871ee40bff` 留下 failed/`run.failed` 且无 Handoff；Desktop 固定 `run.cancel` 对 Run `07698a53-3f18-464b-8b7e-7a5ee6dd57bc` 得到 cancelled/`run.cancelled`，owned 进程停止，工作区无后续写入。一次模型 completed 但无改动的调用被脚本判失败，不算成功证据。完整人工检查见 [P2 Python 纵向 Demo](demo/p2-python-vertical.md)。

回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase、92 task、120 case、36 deferred）、`pnpm py:check`（37 pytest、Ruff、strict mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0；日志 `/tmp/forge-p2-10-*.log`。真实 Demo 命令及截图/Diff 见证据文档。P2 Phase Gate 的已批准任务隔离修改、可查看结果与真实停止在本机通过，[P2 阶段报告](p2-completion-report.md)已建立。P2-10 引用的 T116–T120 仍为 `DEFERRED_VERIFICATION`，映射到 P6/P9，不计 PASSED。Windows x64、macOS Intel、安装包/签名/DPI 与异常 Host 死亡后的 Codex orphan 恢复未验证；下一权威任务 P3-01 已开始。无提交、推送或发布。

## Python Core 迁移 · MIG-PY-09 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发运行环境的 Python-only Desktop 切换与 P1/P2-01～09 核心能力复验）**。Electron Main 不再 import、启动或回退到 Node `HostController`；所有固定 `system/project/conversation/draft/approval/board/run` IPC 命令经过原有 Renderer 来源校验、TypeScript Schema 与 `PythonHostController` 的版本化 JSON-RPC stdio，再由 Python Pydantic Host 执行。Main 仍只负责窗口、系统目录选择、Host 生命周期；Renderer 无 Node/SQLite/Codex 或任意 IPC。Python Host 是唯一 SQLite 写者，握手后执行已在隔离库验证的附加 migration v16；没有重置现有 Project/Task/Run 表。Python 领域服务改用 `ForgePersistence.session()`/`transaction()` 门面，不取得私有 `sqlite3.Connection`。`pnpm dev:host` 指向 Python，Node Host 只保留显式历史 parity 命令和测试。见 [ADR 0035](decisions/0035-python-only-desktop-cutover.md)。

真实验收：`pnpm smoke:desktop` 在 Electron 中核对 CPython 3.12.13 的唯一 Host PID、protocol v5/stdio v1、SQLite 3.50.4/schema 16、Renderer sandbox；损坏数据库为 degraded，强制结束 Python Host 后为 crashed 且命令失败，Desktop 退出后其拥有的 PID 消失。`pnpm smoke:projects` 与 `pnpm smoke:p1-offline` 在独立临时目录完成系统目录选择/信任、只读项目探测、保存消息、手工草稿、人工批准 TODO、看板/详情、重启恢复、切换与元数据移除，源码保持不变。`node scripts/smoke-python-vertical-live.mjs` 经过真实 Electron Renderer→Main→Python Host→Codex，在隔离 Git worktree 中修改 `math.js`/`test.js`、执行 `node test.js`、生成真实 Diff/不可变 CodeSnapshot/Handoff；来源 Git 干净，正式验收结果保持 `unverified`。实际 Vue 任务详情截图：[Python Desktop Run](../output/playwright/mig-py-09-python-desktop-run-1440x900.png)。`uv --directory python run --frozen python spikes/codex_live.py cancel` 确认长命令取消与 `run.cancelled`；MIG-PY-07/08 的 approval、continuation、错误和事件 live 记录继续有效。

回归：`pnpm py:check` 为 37 pytest、Ruff、严格 mypy 28 源文件通过；`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 参考 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/36 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。`pnpm dev:desktop` 启动真实 Python Host/Vite/Electron，Ctrl+C 后本轮 PID 与 5173 监听消失。CI 增加锁定版本的 uv/Python 检查；GitHub Linux runner 本轮未远程执行。权威 T031–T120 中跨阶段或尚无完整前置能力的用例仍按 `docs/deferred-verification.json` 为 `DEFERRED_VERIFICATION`，没有把服务能力回归冒充全部 Test ID 通过。

限制：当前真实用户开发数据库文件不存在，故没有对实际用户 v15 数据执行升级；v15→v16 及 Node↔Python Project/Task/Run parity 只在独立测试库通过。打包安装内 Python/Codex 可执行文件发现、Windows x64、macOS Intel、系统 DPI/签名与 Host 异常死亡时 Codex 子进程恢复仍 **UNVERIFIED**。没有自动提交/推送或发布。MIG-PY-09 完成后 P2-10 已恢复 TODO，当前开始其 Python 纵向真实 Demo；P3 尚未开始。

## Python Core 迁移 · MIG-PY-08 · 2026-09-24

状态：**DONE（内置可信插件基础；完整 P4 Plugin Host 尚未开始）**。`python/src/forge/plugin_api.py` 以 Pydantic 定义与权威 manifest Schema 同字段的公开契约；`plugins.py` 只发现固定白名单中的内置清单，检查 API range、平台、明确授予的权限、依赖服务与 contribution，激活成功前不公开注册，失败清理，停用/Host 退出逆序 dispose。`builtin_plugins/codex.py` 通过声明的 `process.v1` 取得 Host-owned ProcessController，注册 `executor.codex`；Core 的 Run Scheduler 只依赖 ExecutorAdapter 协议，生产 Host 不再直接导入 Codex 实现。未知插件、任意清单 entry、外部进程插件及网络安装均未开放。见 [ADR 0034](decisions/0034-python-bundled-plugin-registry.md)。

真实验收：manifest 路径穿越/未知字段/重复贡献、权限或服务缺失、API 不兼容、激活回滚、重复 dispose 等单测；内置 Registry 接入后，独立 Python Host 再次完成 Project Trust→人工批准 TODO→真实 Codex Run→不可变 Handoff，fixture 测试通过、源 Git 工作树未改。`pnpm py:check` 37 pytest、Ruff、严格 mypy 28 源文件通过；wheel 包含 manifest/config/entry，`pnpm test`（含 build）、`pnpm smoke:desktop`（含 build）和 `git diff --check` 通过。没有新增第三方依赖、用户数据迁移、Renderer 权限或提交/推送。Desktop 仍处双 Host 迁移态；下一项 MIG-PY-09 已开始，P2-10 继续暂停，P3 未开始。

## Python Core 迁移 · MIG-PY-07 · 2026-09-24

状态：**DONE（macOS arm64 的真实 Python Codex Executor；Desktop 生产切换仍属 MIG-PY-09）**。`python/src/forge/codex_app_server.py` 用 `ProcessController` 拥有 Codex 0.155.1 的 `app-server --stdio`，限制 JSON-RPC 帧大小、请求 ID/超时、事件白名单、环境变量和进程树关闭。`codex_executor.py` 将真实 thread/turn、文本、命令、文件、usage、审批、取消及结构化结果转为标准 Executor Event；未知互动拒绝，审批由调用者显式批准/拒绝，120 秒无应答时拒绝。能力声明只读取版本/平台匹配的 Python 实测证据；`toolEvents=false`、`networkPolicyEnforced=false`。Python Host 在成功握手且为写者时注册真实 Adapter；Desktop 迁移期只读 Python Host 不注册写入。

`pnpm test:python-codex-live` 通过十组独立真实检查：缺少认证、无效模型、结构化输出、Codex 修改隔离 Git fixture 两文件并通过 `node test.js`、命令/文件/文本/usage 流、长命令取消且无后续写入、审批批准/拒绝、跨连接及跨 Python 进程 thread continuation，以及独立 Python Host 中 Project Trust→手工 Draft→人工批准 TODO→Codex Run→CodeSnapshot/Handoff。来源仓库工作树未变，Handoff 的 Task 验收仍为 `unverified`。权威示例中的 `workflowRef=standard@1` 与旧 Node 的 `standard` 不一致；Python 兼容两者并冻结实际引用，不修改权威资料。见 [ADR 0033](decisions/0033-python-codex-app-server-executor.md)。

`pnpm py:check`：33 pytest、Ruff、严格 mypy 24 源文件通过。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 参考 warning）、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm smoke:desktop`（各含真实 build）、`uv build --directory python --no-sources`（wheel 含 Adapter 与证据）、`git diff --check` 均 exit 0。没有新增依赖或修改用户数据库。T041 双执行器、T042 Profile 保存路径、T045 运行中认证失效和 Python-only Desktop 验收保持 `DEFERRED_VERIFICATION`，不标通过。下一项 MIG-PY-08 已开始；P2-10 仍暂停，P3 未开始。

## Python Core 迁移 · MIG-PY-06 · 2026-09-24

状态：**DONE（Python Host 基础设施 fixture 验收；真实 Codex/正式 Desktop 复验顺延到 MIG-PY-07/09）**。`python/src/forge/workspaces.py` 以真实 Git worktree 和 JSON ownership journal 实现独立工作区、唯一 ID、来源仓库身份、base SHA/tree、单写 lease/epoch、脏树保留、安全处置及重启 orphan 报告；`processes.py` 以当前运行时拥有的 POSIX process group 实现父子孙取消、有限 TERM/KILL 与端口释放，不按历史 PID 或进程名杀进程。`run_config.py`、`runs.py`、`context.py` 冻结 RunConfig/ContextBundle、Run/Attempt 状态与结果身份、持久化取消、工作检查点；`executor_contracts.py`、`run_scheduler.py` 对标准事件、启动超时、有明确无副作用证据的 429 重试、取消确认及不确定状态隔离建立基础。`run_inspection.py` 保存脱敏且有界的观察/usage、真实 Git Diff，`snapshots.py`/`handoffs.py` 从已停止的工作区生成不可变 Git 快照与 SQLite Artifact/Handoff，验收项保持 `unverified`。`development.py` 是 Host 内的单节点入口，要求真实 Trust、已批准 TODO、活跃项目与 adapter capability；没有自动开工。

macOS arm64 的隔离 fixture 真实验证 Unicode/空格 Git 路径、source repo 不变、并发租约/旧 epoch、路径/symlink 防护、进程父子孙、Run A/B/用户进程不受误杀、端口释放、取消后不继续写、Run 成功/失败/取消/协议异常/Host shutdown、checkpoint/观察/Diff、快照/交接与 SQLite 重启。独立 Python Host stdio 进程读取保存的 Run/inspection；未注册真实执行器时 `run.start` 严格校验后返回 `MODEL_UNAVAILABLE`，不伪装为可运行。`pnpm py:check`：29 pytest、Ruff、strict mypy 22 个源文件通过。完整回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:python-db-parity`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。见 [ADR 0032](decisions/0032-python-workspace-run-and-handoff-port.md)。未增加第三方依赖、修改用户数据、提交或推送。

MIG06 的基础设施范围已真实通过；权威 P2-03/04 的 `T041–T045` 真 Codex 能力需 MIG-PY-07，P2-01～09 的 Python-only Desktop 产品验收需 MIG-PY-09，均记 `DEFERRED_VERIFICATION`，不能把本轮 fixture 或旧 Node 结果标为通过。Windows x64、macOS Intel、安装包和异常 Host 死亡后的孤儿进程自动回收仍未验证。下一项 MIG-PY-07 已开始；P2-10 仍 `PAUSED_FOR_PYTHON_CORE_MIGRATION`，P3 未启动。

## Python Core 迁移 · MIG-PY-05 · 2026-09-24

状态：**DONE（Python Host 的 P1 服务实测；Desktop 生产切换仍属 MIG-PY-09）**。独立 Python Host 已实现 Project/Environment/CommandPreset、会话与持久消息、受来源约束的手工/模型草稿、修订/澄清、人工审批原子入 TODO、Board/Task 只读投影与同列排序。Task 写入合并于审批事务，并未启动 Run。固定 JSON-RPC 方法均校验参数；Project Trust 明确确认，Probe 不执行项目脚本，移除只归档元数据。Pydantic Task Contract 对标现有 TS/参考字段，校验空白文本和依赖 ID。现有 schema 15 及用户数据不重置。

真实 Python 子进程 stdio 测试覆盖：独立临时项目探测/信任→消息→草稿→人工修订→审批→TODO/看板→Host 重启保留；离线消息失败保留原文与幂等；环境/命令预设归属、版本与危险 cwd 拒绝；未知 `agent.run` 无通道。另以现有 Codex 登录实测 Python Host 在线结构化草稿→3 项澄清→人工修订/批准→TODO→重启恢复，项目脚本未运行。`pnpm test:python-refiner-live` 结果为 `draftStatus=needs_clarification`、`approvedState=todo`、`boardRevision=1`；真实测试日志在 `/tmp/forge-mig-py-05-refiner-live.log`。`pnpm py:check`（19 pytest）、`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:python-db-parity`、`pnpm smoke:desktop`、`git diff --check` 均通过，工程日志在 `/tmp/forge-mig-py-05-*.log`。见 [ADR 0031](decisions/0031-python-p1-domain-and-refiner-parity.md)。

Desktop 仍由旧 Node Host 处理 P1 业务，Python 对共享库只读；MIG-PY-09 才切换独占业务写者并重跑真实 Desktop P1 验收。当前 Python 服务仍直接经 `ForgePersistence` 私有 helper 使用 SQL，MIG-PY-09 切换前需收紧 typed repository 边界。MIG-PY-06 已开始；P2-10 保持 `PAUSED_FOR_PYTHON_CORE_MIGRATION`，P3 未开始。

## Python Core 迁移 · MIG-PY-04 · 2026-09-24

状态：**DONE（SQLite 存储层 parity；业务服务尚未移植）**。Python `sqlite3` 读取冻结的旧 1～15 migration SQL 和 SHA-256；按 `schema_migrations`/`user_version` 校验现有库、异版拒绝、`quick_check`、外键、WAL、busy timeout。新增 additive schema 16 只在隔离库测试；Desktop 双 Host 期间 Python 对同一 dataDir 强制只读，旧 Node 暂任业务写者。真实 Node fixture 创建 Project/Task/Run、Python 按相同 schema 读取并在隔离库事务中更新三类行、Node 重启读回；旧 migration/checksum 逐项一致。Python migration 1→15→16、重启持久、事务失败回滚、迁移失败回滚、无效文件、未来版本与错误 checksum 均实测。Electron smoke 中 Python Storage 在 Node 建库后显示 ready/schema 15；损坏 DB 显示 degraded，不泄露路径。当前真实开发数据库文件不存在，未改用户数据。`pnpm py:check`（11 pytest）、`pnpm test:python-db-parity`、`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（由 parity 脚本和 test 入口执行）、`pnpm smoke:desktop`、`git diff --check` 均通过；日志在 `/tmp/forge-mig-py-04-*.log`。见 [ADR 0030](decisions/0030-python-sqlite-parity-and-cutover.md)。Project/Task/Approval 的语义、CAS/幂等和 P1 验收属于 MIG-PY-05；Run 语义属于 MIG-PY-06，不能把存储行对照当作业务通过。P2-10 仍暂停；MIG-PY-05 已开始。

## Python Core 迁移 · MIG-PY-03 · 2026-09-24

状态：**DONE（独立 Python Host 与 Desktop 真实通信；业务移植未完成）**。`python/src/forge/host.py` 经 stdin/stdout 的 `forge-local-jsonrpc/v1` 实现固定 `system.handshake/info/health/ping/shutdown`，每帧 1 MiB 上限、请求 ID、Pydantic 严格字段、版本/ownership 核对、结构化错误与 stderr 结构化生命周期日志。Electron Main 的 `PythonHostController` 用 argv 启动项目本地 Python 3.12.13、定时健康探测、有界超时、受控退出；Preload 只暴露固定只读状态，不提供通用 JSON-RPC。Desktop 顶栏与诊断展示真实 Python 进程状态。迁移期间旧 Node Host 继续承载已有 P1/P2 业务，Python Storage 显示 unavailable/degraded，不能声称 Python 已接管数据库或业务。`pnpm py:check`（5 pytest，包含真实进程握手/拒绝/关闭）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm smoke:desktop` 和 `git diff --check` 通过；Electron smoke 确认 Python PID/版本/health，强制结束 Python 后 UI 显示 crashed 且旧 Host 仍独立。测试使用隔离目录，未接触真实用户数据库。下一任务 MIG-PY-04 已开始。

## Python Core 迁移 · MIG-PY-02 · 2026-09-24

状态：**DONE（Python 工程基线，尚无 Python Host）**。`python/pyproject.toml` 明确 Python 3.12+、Pydantic v2、pytest/pytest-asyncio、Ruff、严格 mypy，`python/.python-version` 固定本机 3.12.13；`python/uv.lock` 锁定并记录哈希。根 `pnpm py:sync`、`py:lint`、`py:typecheck`、`py:test`、`py:check` 直接运行真实 uv 工具链，无空脚本。项目本地 `.venv`，无全局包改动。第三方许可证见 `docs/python-dependency-licenses.json`，精确工具版本见 `versions.lock.json`。`uv lock --check`、`uv build --no-sources`（wheel/sdist）、`pnpm py:check` 通过；Python 3.12.13 下 3 个 pytest 通过，Ruff 和 mypy strict 通过。后续 MIG-PY-03 建立真实 Python Host 和跨语言协议；Node 业务 Host 仍是迁移参考，不代表 Python parity。P2-10 继续暂停。

## Python Core 迁移 · MIG-PY-01 · 2026-09-24

状态：**DONE（用户批准的核心架构冻结与迁移基线；macOS arm64）**。P2-10 已暂停为 `PAUSED_FOR_PYTHON_CORE_MIGRATION`，不是 DONE/BLOCKED；P3 尚未开始。Electron/Vue/TypeScript UI 保留，最终唯一业务 Runtime 改为 Python Host；本地版本化 JSON-RPC over stdio，不引入本地 FastAPI/TCP。见 [ADR 0029](decisions/0029-python-core-runtime-architecture.md)、[迁移计划](forge-python-core-migration-plan.md)及[Node 模块清单](python-core-module-inventory.md)。权威 P1～P9 Task/Test ID 与只读规格不改，现有 SQLite 用户数据不重置。此前 P0/P1/P2-01～09 记录仅是 Node Host 历史实测；MIG-PY-09 前不能声称 Python parity。P2-10 的未提交 Node 路径代码、真实 Codex 成功与取消截图及相关测试被完整保留，仅作迁移参考；它们不构成 P2-10 完成验收。

MIG-PY-01 基线：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`（9 phase、92 task、120 case、36 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 最终全部 exit 0；原始日志在 `/tmp/forge-mig-py-01-*.log`。首轮 lint 两处暂停前 P2-10 局部错误已最小修复；任务图校验器现仅允许 P2-10 进入专用迁移暂停状态，并有错误任务变异测试。Desktop smoke 使用独立临时数据库；未打开、重置或删除用户实际数据库。没有新增依赖、提交、推送或发布。下一任务 MIG-PY-02 已开始；Python Host 还未创建，历史 Node smoke 不等于 Python 验收。

## P2-09 · 开发结果与交接快照 · 2026-09-24

状态：**DONE（Host 内部不可变 CodeSnapshot 与交接；macOS arm64）**。正式 `@forge/contracts` CodeSnapshot、HandoffBundle、StepResult、ArtifactRef 结构与只读参考 Schema 必需字段对齐；`@forge/workspace` 从 Forge 私有且已停止写入的 Git worktree，用临时 index 扫描允许的文件、包含未跟踪新增文件，生成独立 tree/commit 和 `refs/forge/snapshots/<UUID>` 保活引用。未移动用户分支或改动用户索引。`.env`/密钥路径、常见凭据文本、符号链接、二进制和越界文件被拒绝；`node_modules` 排除。空变更需要显式解释。Git 用 argv，禁用 hooks/fsmonitor，不执行项目脚本；所有文件在 Host 内读取，Renderer 没有文件/SQL/快照写入能力。

Host-only `HostSnapshotService` 在 succeeded Run、已释放 writer lease 且无受控活跃进程时发布。SQLite schema v15 一次事务保存 CodeSnapshot、实际 JSON StepResult artifact 和 Handoff Bundle；不可变触发器、项目隔离、哈希复核、重启持久性与幂等读取均已实测。摘要基于文件清单和已有 checkpoint，所有 Task 验收项保持 `unverified`，Review/Verify 明确未运行；Task 仍 TODO。参考 Handoff schema 的 numeric `workflowRevision` 当前 RunConfig 没有，本服务要求可信调用者显式提供，不从 version 字符串猜测，P2-10 的真实配置解析须补齐。快照 Git ref 早于 DB 事务写入，崩溃可能留下未发布 Forge ref；P3-09 负责 orphan 对账，不能声称完全原子跨 Git/SQLite。见 [ADR 0027](decisions/0027-immutable-code-snapshot-and-handoff.md)。

真实工作区测试覆盖 Unicode/空格、形似 Git 选项的文件名、source HEAD/status/index 不变、可从 commit/ref 重建新增文件、敏感路径/文本和 symlink 拒绝。Host/SQLite 测试覆盖同项目保存、跨项目只读拒绝、不可变/重启/重复发布、未解释的 no-change 阻断。两次 `pnpm test:p2-run-live` 均使用已认证 `gpt-6-luna` 与独立临时 Git 仓库；第二次 Agent 真正新建 `tests/invalid.test.mjs` 并修改 `src/add.js`，fixture 测试通过，237 条标准事件、50 条有界观察记录、10 个 checkpoint 与两文件 CodeSnapshot/Artifact/Handoff 在重启后可读取，原仓库工作树未变，正式 AC 仍未验证。T047/T049 当前范围实测；T046 正式 StartTask 并发归 P2-10，T050 主分支前移/合并归 P3-08，T064 正式报告 UI 的脚本链接归 P3-12，均保留权威 ID。当前无面向用户的 Start 或 Artifact 报告页面，不把 Run 成功等同于可交付 Task。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（33 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`pnpm test:workspace-live`、`git diff --check` 均 exit 0。最终 `pnpm test:p2-run-live` 再次使用已认证 Codex 真实创建未跟踪文件并保存快照：280 条事件、57 条观察、12 个 checkpoint、两文件快照、数据库重启保留且源仓库未变。下一权威任务 P2-10 自动开始；无新增依赖、提交、推送或发布。

## P2-08 · 取消、停止与超时 · 2026-09-24

状态：**DONE（Host 内部 Run 取消链路；macOS arm64）**。`HostRunScheduler.cancel()` 在通知执行器前将 `canceling` 意图持久化到 SQLite schema v14，用户重复取消返回同一个终态等待；预算截止与 Host 调度器 shutdown 走同一有界取消路径。先发送 Codex `turn/interrupt`，四秒 grace 后对当前 Run 拥有的进程组执行受控终止；只有确认退出后 Run/Attempt 才能成为 `cancelled`，数据库写租约与受控 worktree lease 才释放。进程退出不确定时记录 `interrupted`、数据库租约 `quarantined`、工作区 `failed`，拒绝新的写 Run。明确无副作用的 429 在未启动进程时可安全取消；未知启动副作用继续隔离。没有新增 Renderer Start/Cancel IPC，也没有自动调度下一节点。见 [ADR 0026](decisions/0026-run-cancellation-and-lease-quarantine.md)。

真实测试：Host 集成测试启动父/子/孙 Node 长期写入进程，双重取消幂等，确认整树退出、取消后文件字节不再变化、源 Git 不变且租约释放；一秒预算超时也进入 `cancelled` 而非成功；故障注入无法确认进程退出时保持 quarantine，第二个写 Run 被拒。`pnpm test:p2-cancel-live` 使用当前认证的 `gpt-6-luna` 在独立临时 Git worktree 真实运行长命令与两个子孙写进程；Host 收到真实 `command.started`、`run.cancelled`，28 条有界观察记录，取消后无继续写入，ProcessController 无活跃进程，SQLite 重启后仍为 `cancelled`，源仓库 HEAD/status 未变。T035 当前范围已实测；T031–T033 的底层幂等/epoch/429 测试沿用 P2-05，T034 Host 杀进程后的对账仍属 P3-09，未标通过。T043 的正式重启恢复声明和 T045 运行中认证失效保持 `DEFERRED_VERIFICATION`，分别指向 P3-09/P4-09。Windows x64、macOS Intel、安装包和 utilityProcess crash recovery 未验证。

最终工程回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均通过；详情在本轮执行记录。下一权威任务 P2-09「开发结果与交接快照」自动开始。没有新增第三方依赖、提交、推送或发布。

## P2-07 · Diff 与初版运行详情 · 2026-09-24

状态：**DONE（当前只读 Run 观察范围；macOS arm64）**。严格 `run.list` / `run.inspect` 通过 ForgeClient→Preload→Main→独立 Host，由 SQLite schema v13 提供按项目隔离的 Run、单调游标分页事件、真实用量和有来源的 ContextBundle 标识。Host 将高频 assistant delta 在 100 ms 内合并，活动上限 2,000 条并显式截断；命令参数不记录，常见 API Key/Token/Cookie/Authorization 文本脱敏。完成后从受控 Git worktree 捕获只读文件树与最多 64 KiB 文本 Diff 预览，敏感扩展名/`.env` 排除、未跟踪大文件截断；预览不等于 P2-09 冻结 CodeSnapshot。任务抽屉使用正式 `@forge/ui` Tabs 显示 Activity、Files、Diff、Context、Usage；HTML/脚本仅作为文本，Host 不可用时不显示旧运行详情，未知费用显示“未知”。历史 running 记录标示“进程未验证”，不假定重启后仍在线。见 [ADR 0025](decisions/0025-read-only-run-inspection.md)。本轮没有生产 Start/Cancel 命令、命令 stdout、正式 Artifact 或 Task 自动推进。

真实 SQLite/Git 测试覆盖乱序拒绝、断点游标、重启保持、同项目范围、凭据脱敏、500 高频事件合并、20 KiB 未跟踪文件截断和源仓库未变；Vue 测试把恶意 `<img onerror>` 按文本渲染、Host 断连清空、未知费用明确提示。最终 `pnpm test:p2-run-live` 在独立临时仓库用已认证 `gpt-6-luna` 真正修改两个文件并通过 fixture 测试；303 条连续标准事件经 Host 存为 58 条有界观察记录、13 个 checkpoint、2 个真实 Diff 文件，数据库重开后读模型一致，Task 仍 TODO，源 Git 不变。真实 Electron utilityProcess Host 读取该 Run，Task 详情展示 completed 与 Diff；截图 `output/playwright/p2-07-run-inspector-1440x900.png` 已从最终代码生成并目视核对。首次 live 验收脚本因 `run.completed` 同时出现在事件类型和文本列触发 Playwright 严格定位错误；改用事件类型列后完整重跑通过。无新增第三方依赖或 Renderer Node 权限。T064 的正式报告 Artifact 注入需 P2-09 产物模型，保留在 [追踪表](deferred-verification.json) 为 `DEFERRED_VERIFICATION`；当前 Activity/Diff 文本安全子集已测试。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（37 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 全部 exit 0。下一权威任务 P2-08「取消、停止与超时」自动开始。

## P2-06 · 工作记忆与 ContextBundle · 2026-09-24

状态：**DONE（当前 Run 的有界工作记忆；macOS arm64）**。正式 `@forge/contracts` 的 ContextBundle/WorkingCheckpoint 严格契约、`@forge/core/context` 的冻结 Task 来源组装与字符预算、Host-only SQLite schema v12 的 append-only checkpoint 和不可变 bundle 已落地。批准的目标、验收、范围、约束与排除项是必需内容，不会为塞进预算静默删掉；可选运行观察超额时记录省略数。每项带来源和 `approved_task`/`run_observation` 等级，恢复读模型明确 `processState: unverified`，不以历史 DB 状态宣称进程仍在线。Scheduler 会核对 bundle ID、RunConfig hash、Task revision、目标与上下文后才启动 Executor；运行时仅从标准事件保留最多 16 条动作/问题及观测预算，定期与终态前落 checkpoint，不存原始聊天或命令文本。见 [ADR 0024](decisions/0024-bounded-context-and-working-checkpoints.md)。

真实 SQLite 测试覆盖项目隔离、严格顺序、不可变触发器、重启后的工作进度与继续用 bundle、伪造上下文拒绝、超过预算的实际消耗仍完整记录。真实 `pnpm test:p2-run-live` 在隔离 Codex 工作区通过：`gpt-6-luna` 修改两个 fixture 文件、fixture 测试通过，280 条连续标准事件、12 个 checkpoint、5 条最终动作；重启数据库后 Run、bundle 与 checkpoint 均保留，源 Git 不变，Task 仍为 TODO。首次在线验证揭示把超预算观测当存储错误会丢失真实消耗，已修正并重新实测。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（36 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 全部 exit 0；最后增加的超预算测试单独复跑 8/8 通过。T071–T075 的项目记忆/索引生命周期属于 P5-09/P5-10，在 [追踪表](deferred-verification.json) 保留为 `DEFERRED_VERIFICATION`，未声称通过。没有新依赖、Renderer IPC、RAG 或跨项目记忆。下一权威任务 P2-07 已开始。

## P2-05 · 运行调度与 Attempt · 2026-09-24

状态：**DONE（Host 内部单节点调度与真实隔离 Codex Run；macOS arm64）**。独立 Host 的 `HostRunScheduler` 在执行器启动前以 SQLite schema v11 原子写入 queued Run、pending Attempt、workspace lease 和启动 intent；真实 sessionRef 返回后才进入 running。一个项目和一个工作区均限制单写者；结果绑定 Run/Attempt/租约 ID 与 epoch、Task revision、冻结配置 hash，重复终态结果幂等，旧结果只留审计而不污染新 Run。成功、失败、取消只有在受控进程已停止后才能持久化终态；未知启动副作用隔离为 interrupted/quarantined，不能盲目重跑。明确 429 且无副作用的故障注入验证有限退避、预算耗尽后 waiting_input；没有把故障注入冒充真实上游 429。见 [ADR 0023](decisions/0023-run-attempt-scheduler.md)。

`pnpm test:p2-run-live` 在本机已认证的 Codex app-server 和独立临时 Git 工作区真实运行：`gpt-6-luna` 修改两个 fixture 文件、fixture 测试通过，279 条连续标准事件与真实 sessionRef 到达 Host，Run/Attempt 均 succeeded；已批准 Task 仍为 TODO，源 Git 未变，关闭再打开 SQLite 仍保留 Run。`pnpm test:workspace-live` 的父/子/孙进程停止和租约安全回归通过。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`（31 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均 exit 0；随后新增的 429 Host 调度集成测试单独复跑 6/6 通过。无新依赖、权限或 Renderer 命令。正式用户 Start、workflow/profile/plugin 内容解析、取消、崩溃对账和产物推进尚未实现；T034/T035 及其他完整纵向用例在 [追踪表](deferred-verification.json) 标记 `DEFERRED_VERIFICATION`，不声称 PASSED。下一权威任务 P2-06 已开始。

## P2-04 · Codex真实写入适配 · 2026-09-24

状态：**DONE（单一 Codex 真实写入；macOS arm64）**。沿用 ADR 0004 实测选定的 `codex-cli 0.155.1` app-server stdio 而非另起 SDK 路径；新增 `HostRunResources.startScheduled`，要求公共 Attempt 请求的 lease ID/epoch 与 Host 当前受控 worktree 匹配。`pnpm probe:codex` 返回本机现有 ChatGPT 登录和实际可用模型。`pnpm test:p2-codex-live` 在独立临时 Git 任务分支使用列表中的 `gpt-6-luna`，真正修改 `src/add.js` 与 `tests/add.test.mjs`，`npm test` 通过；Host 收到 312 条 run/text/command/usage/file/completion 标准事件，序号连续，provider sessionRef 有值，源仓库 HEAD/status 与父目录标记未变。第一次 live 测试仅因验收脚本对 Git porcelain 使用 `trim()` 丢掉首行状态空格而误判；改成 `trimEnd()` 后第二次完整运行通过。见 [ADR 0022](decisions/0022-scheduled-codex-write-adapter.md)。

`pnpm test:workspace-live` 复测真实 Codex 长命令及父/子/孙进程取消，确认所有受控进程停止、源仓库未变、工作区释放。`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（29 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。未建立正式 Task→Run 状态机；T041 双适配器、T042 Profile 模型选择、T043 正式 Run 取消、T044/T045 Run 失败路径在 [追踪表](deferred-verification.json) 保留，均未当作通过。下一权威任务 P2-05 已开始。

## P2-03 · ExecutorAdapter公共接口 · 2026-09-24

状态：**DONE（公共接口与上游校验边界；macOS arm64）**。`@forge/plugin-api` 在 P0 Codex spike 接口之外加入严格的 Scheduled Executor request：Attempt ID、lease epoch/ID、Contract/Profile revision、ContextBundle 与输出 Schema 引用；旧只读整理器仍可使用 spike request，生产调度必须使用新严格契约。`ExecutorEventGate` 要求同 Run、连续序号、首个 started 和唯一终态；Host Registry 在发布前验证，非法输出变成 `EXECUTOR_PROTOCOL_ERROR` 并请求取消。Codex stdio JSON-RPC 消息大小/包络、已知文本 delta、token usage 和审批消息均经过 schema 校验。见 [ADR 0021](decisions/0021-executor-attempt-contract-and-event-gate.md)。

单测有意发送重复/乱序/跨 Run/非法 provider 负载、缺失 Attempt 绑定及错误 RPC 包络，确认拒绝；Host fixture 证明无效事件不会穿透 Registry。`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（24 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。P2-03 未启动正式 Run，也未用第二个真实适配器；T041–T045 在 [追踪表](deferred-verification.json) 分别归 P2-04/P2-05/P4-06/P4-10 验证，未标为通过。下一权威任务 P2-04 已开始。

## P2-02 · 工作区租约与基线快照 · 2026-09-24

状态：**DONE（工作区基础能力；macOS arm64）**。沿用 P0-06 Host-owned `@forge/workspace`，真实 Git fixture 在私有目录创建 `forge/run/<UUID>` 任务分支，固定 base commit/tree、source common-dir identity 与排除策略。单工作区并发 `acquire` 只有一个成功；lease ID/epoch 写入归属记录，`releaseLease` 在无活动归属进程时保留树并允许下一 epoch，旧 lease ID 被拒。Host Executor 启动前重新核对 lease ID/epoch/owner；停止期间不能新授租约。主仓库 HEAD/status 没有变化；清理和 orphan 继续遵守 P0 所有权、路径及 Git identity 检查。见 [ADR 0020](decisions/0020-task-workspace-lease-and-base.md)。

`pnpm validate:contracts`、`pnpm validate:task-map`（19 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0；最后新增 `releaseLease` 与关闭竞态保护后，`@forge/workspace` 4 项真实 Git 测试和 Host Executor 3 项测试再次通过。`pnpm smoke:p1-offline` 在 schema 10 上的真实 Electron/Host/SQLite 回归通过。T046 的正式 Attempt 入口、T047/T049 交付快照、T050 合并前目标分支重验按 [追踪表](deferred-verification.json) 保留为 `DEFERRED_VERIFICATION`；T048 在当前 Workspace API 的生成分支、严格 base hash/argv 与恶意路径测试范围有真实覆盖。不把尚未创建的 Run/CodeSnapshot/merge 记作通过。下一权威任务 P2-03 已开始。

## P2-01 · 不可变RunConfig · 2026-09-24

状态：**DONE（冻结与持久化边界；macOS arm64）**。严格 RunConfig 契约、`@forge/core` SHA-256 冻结与校验、Host 专属 SQLite schema v10 的 insert-only `run_config_snapshots` 已实现。真实已批准 TODO 与同项目 Environment 事务读取后生成快照；更改 Environment 设置、关闭并重开存储后，旧预算/环境/版本锁不变。过期 Task/Environment revision、跨项目、重复 runId 不同内容、篡改及 SQL UPDATE/DELETE 均拒绝。未暴露 Renderer 命令，未启动 Run/Executor，未来 Host 版本解析器必须验证真实 workflow/profile/plugin 内容与兼容性后才能执行。见 [ADR 0019](decisions/0019-immutable-run-config-snapshot.md)。

`pnpm validate:contracts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0；Electron utilityProcess Host 真实加载 SQLite schema 10，正常/损坏数据库/Host crash 路径仍通过。P2-01 引用的 T031–T035 需要正式 Attempt/调度、取消或崩溃对账，按 [追踪表](deferred-verification.json) 记录最早 owner，均为 `DEFERRED_VERIFICATION`，**未**记为 PASSED。任务核心冻结行为由独立真实测试验证；“已启动 Run 修改全局设置”纵向复验归 P2-05。没有新增第三方依赖或更改运行权限。下一权威任务 P2-02 已开始。

## P1-10 · P1集成与手工降级 · 2026-09-24

状态：**DONE（用户批准的 P1 阶段范围；macOS arm64 实测）**。独立 `scripts/smoke-p1-offline.mjs` 构建并启动真实 Electron/utilityProcess Host/SQLite，以中文及空格路径的临时 Git 项目从原生目录选择、信任、保存用户需求消息、手工草稿、CAS 修订、人工审阅批准到唯一 TODO，看板及详情在 Desktop 重启后保持。测试把 `CODEX_HOME` 指向空目录、清空 Key 项、设不可达 HTTP(S) 代理；整个流程不调用模型，证明没有模型认证时仍可使用任务与看板。它**不是**操作系统级断网试验。前后 Git HEAD/status 不变，声明的项目测试脚本未运行。真实 1440×900 截图 `output/playwright/p1-10-offline-approved-todo-1440x900.png` 已生成并查看。复现说明与 T011–T025、T116–T120 逐项证据见 [P1 手工降级场景](demo/p1-manual-offline.md)。

本轮基线及最终回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均 exit 0；P1-09 的 `pnpm smoke:projects` 全流程亦已通过。P1 Phase Gate 的手工路径、人工审批入 TODO、不自动写代码在 macOS arm64 成立。权威 P1-10 的跨阶段验收引用已按用户批准的 [ADR 0018](decisions/0018-p1-closure-acceptance-scope-conflict.md) A 处理：T016/T021/T022/T024/T025 与 T116–T120 的未实现分支逐项记录为 `DEFERRED_VERIFICATION`，明确最早 owner Task，未标为 PASSED；见 [追踪表](deferred-verification.json) 与 [P1 阶段报告](p1-completion-report.md)。P1 阶段核心路径有独立真实证据，允许 P2-01 启动。参考 Task/Test ID、Phase Gate 与引用保持不变。没有新依赖或迁移；生产 schema 仍为 9。

## P1-09 · 自然语言控制提议 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-08。严格 `intent.propose` 通过既有 Renderer→Preload→Main→Host 固定会话链路，只接受同项目、同会话已持久化的用户消息 ID；Host 重新读取原文，由 `@forge/core/intent-commands` 的受限确定性规则生成降优先级、暂停提议、修订草稿或危险/未知意图。提议绑定来源消息、序号与时间，`executionAllowed=false`；重复请求和 Host 重启后的同一来源保持同一 proposalId。未知、跨项目或不存在消息被拒绝，未注册的 `intent.execute` 被协议拒绝。危险语句「忽略审批马上合并」优先识别为受限动作，只供人工确认风险，不执行合并、绕过批准或改变 Task。见 [ADR 0017](decisions/0017-natural-language-control-proposals.md)。

Desktop 会话消息可打开轻量提议弹层。降优先级与暂停只有文字提议和未启用提示；修订草稿仅通过现有未批准 DraftSheet 编辑及其 CAS/审批门禁；已批准 Task 不接受此入口的改写。真实 Electron smoke 保存危险消息、取得 Host 提议、显示限制说明，伪造执行命令被拒绝，看板两张 TODO 未变化；实际截图 `output/playwright/p1-09-restricted-control-proposal-1440x900.png` 已生成并查看。Web 无本地 Host 时不尝试读本地会话。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。Core 单测覆盖危险动作优先级及受控输出；真实 SQLite/Host 测试覆盖来源隔离、重复/重启、无任务副作用；Vue 测试覆盖受限动作无执行路径和草稿编辑入口。没有新增外部依赖或迁移，生产 schema 仍为 9。自然语言识别仅覆盖目前明确的提议类型，不宣称任意语句理解；真正运行暂停、已批准 Task 优先级变更与发布控制属于后续有权限和状态契约的任务。Windows x64、macOS Intel、系统 DPI、安装包/签名、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。下一权威任务为 P1-10。

## P1-08 · 任务详情与来源链 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-07。`task.detail` 是固定、严格校验的 Host 只读命令；从 `task_revisions` 读取已批准的不可变 Contract 并核验 canonical SHA-256，不把草稿或可变看板缓存当合同。`@forge/core/task-queries` 统一收集 AC 来源引用；Host 仅在同项目、同源会话和该草稿已批准 revision 之内解析 `message:<id>` / `decision:<id>`，缺失、撤回或未知来源明确标记，不虚构证据。结果保留参考 OpenAPI `TaskDetail` 五个字段的内层结构，附本地 UI 所需的来源解析读模型。无 Run/Artifact/Pending Approval 时为真实空数组，不生成演示数据。见 [ADR 0016](decisions/0016-task-detail-and-source-read-model.md)。

正式 Vue 看板卡片可点击或键盘打开 `@forge/ui` Drawer，展示目标、逐项 AC 与来源、约束、范围、依赖、revision 和未执行状态。`#/tasks/<taskId>` 用稳定 Task ID 在当前项目重载；其他项目 ID 仍受 Host 项目隔离拒绝。真实 Electron smoke 打开已批准 v4 Task、分别定位 AC 用户决定与原始消息、重启后通过深链重新打开，截图 `output/playwright/p1-08-task-detail-source-1440x900.png` 已生成并查看。最初 smoke 暴露 Main 将 URL hash 当成另一来源，合法深链后的 IPC 被拒绝；修复为仅忽略 hash，仍要求原 WebContents/mainFrame 与原协议、host、path、query，并增加同页 hash 允许与恶意 query 拒绝测试。首次详情 smoke 的来源断言错误地假设改动后的 AC 仍指向原消息；按真实 AC 决定引用与 Task 整体原消息分别验收后通过。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。真实 SQLite/Host IPC 测试覆盖两条 AC 的来源、跨项目拒绝、不可变 approved revision、缺失来源标记及重启保留；Vue 组件测试覆盖来源展开与撤回说明。P1-08 引用的 T021–T025 中与后续 Run/Review/Verify/只读身份相关的状态仍待相应 Task 验证；T020 的来源定位由本项实测。无新增第三方依赖或迁移；生产 schema 仍为 9。Windows x64、macOS Intel、系统 DPI、安装包/签名、Codex utilityProcess crash recovery 继续未验证。

## P1-07 · 任务看板与同列排序 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-06。新 `board.snapshot`/`tasks.reorder` 严格契约贯穿 ForgeClient→Preload→Main→独立 Host。SQLite migration v9 回填 v8 已批准 TODO 的整数位置，建立按项目 board revision、事件游标与重排幂等收据；Host 事务检查同列、相邻目标和 CAS，未知 state PATCH 与越列操作被拒绝。批准入 TODO 同事务推进 board revision/事件。五列真实投影、优先级/状态/Executor/标题筛选、长列窗口化、拖放及键盘上/下移已在 Desktop/Web 共用 Vue App 中落地；空/无项目/Host 不可用有独立状态。手工创建复用已有会话→手工草稿→人工审批，批准前不生成 Task，不启动 Agent。见 [ADR 0015](decisions/0015-task-board-projection-and-ordering.md)。

真实 SQLite 测试：v8→v9 两条已有 TODO 顺序和事件游标保留；批准任务在项目看板只出现一次，Host 重启仍在；同列排序的 revision/幂等、非法邻居拒绝与重复 eventId 唯一约束通过。Core fixture 覆盖多列/优先级/Executor 筛选及重复事件去重；Web 组件测试覆盖真实快照显示、过滤不改源数组、键盘移动、Host 离线不显旧卡片和 240 卡片窗口化。Electron `smoke:projects` 真实批准第一项 TODO、从看板手工创建并批准第二项、排序、尝试拖到 Done 被拒绝、重启保留顺序和项目源码不变；1280×800 的看板列水平滚动实测。截图 `output/playwright/p1-07-board-approved-todo-1440x900.png` 和 `p1-07-board-reordered-1440x900.png` 已生成并查看。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。第一次 P1-07 Desktop smoke 因新增 bridge 测试断言遗漏既有 `invokeProject` 而失败；修正后通过。第一次项目 smoke 的“手工草稿”名称与看板“新建手工草稿”不唯一，改为精确匹配；第二次因新增会话改变默认选中，测试显式选择旧会话后通过。没有新增第三方版本；`apps/web` 新增内部 `@forge/core` workspace 链接。T021–T025 中依赖未来 Run/Review/Verify、细粒度只读身份的部分仍未实际验收，不能据此声称所有状态已可达。Windows x64、macOS Intel、DPI、安装包/签名、Codex utilityProcess crash recovery 继续未验证。

## P1-06 · 审批与原子入TODO · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-05。严格的 `approval.request`/`approval.decide`/`approval.forDraft` 通过 Renderer→Preload→Main→Host 固定链路；用户查看确定的草稿 revision、scopeHash 和摘要后显式批准或拒绝。Core 对 Task Contract 做 canonical SHA-256，Host 用 revision CAS、内容与范围摘要、24 小时过期时间和未解问题门禁拒绝过期/变更请求。批准后只进入 `todo`，**不自动开始执行**；已批准草稿不能继续修订。见 [ADR 0014](decisions/0014-task-approval-and-atomic-todo.md)。

生产 SQLite migration v8 仅增加本任务的 `tasks`、`task_revisions`、`task_approvals`、`task_events`。Task TODO、不可变 revision、批准审计与事件同事务；故意令事件插入失败的测试证明四者均回滚，清除故障后可正常批准。相同批准决议重放结果相同；真实双客户端 Host IPC 并发只产生一个 TODO 和一个事件。拒绝、不匹配的旧 revision/scopeHash、未解澄清问题、到期请求都不能入 TODO；未知 `task.start` 与任意 shell 字段被协议拒绝。Electron UI 真实完成请求与批准，Host 重启后仍显示已批准 TODO；截图 `output/playwright/p1-06-approved-todo-1440x900.png` 已生成并查看。

最终回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。首次并行执行两个 Electron smoke 时 `smoke:desktop` 因 Electron 进程退出失败；串行重跑通过，Host 报真实 schema 8。首次全局 test 发现 workspace 版本清单断言仍为旧空映射，修正断言读取已记录的 `@forge/core` `@types/node@22.20.4` 后全部通过。没有新增外部版本，许可证 MIT 已在既有库存。Windows x64、macOS Intel、DPI、安装包/签名、Codex utilityProcess crash recovery 继续未验证。T016–T020 在本机覆盖上述安全和来源链；跨平台与后续 Task Start 不属于本项验收。

## P1-05 · 草稿编辑与澄清 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。严格 `draft.revise`/`draft.history` 契约、Core 草稿修订规则、Host CAS、SQLite migration v7 的 `task_draft_revisions` 快照、已有 v6 草稿当前版本回填已实现。每次确认修改记录决定 ID/摘要、字段差异和澄清答案；验收项 ID 稳定，删除验收项及范围变更要求明确确认，改动的验收项带用户决定来源，未知来源引用被拒绝。所有未回答的 `openQuestions` 保持后续审批门禁；本轮未实施 Approval 或正式 Task。Desktop 用正式 `@forge/ui` Drawer 编辑、预览字段前后值、查看消息/用户决定来源与历史；Web 无 Host 时仍不可访问本地项目。见 [ADR 0013](decisions/0013-task-draft-revisions-and-clarification.md)。

验证：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。Core 单测覆盖未解问题、稳定验收 ID、删除/范围确认、伪来源与过期版本；真实 SQLite 测试覆盖多次修订、重启、跨项目拒绝、v6→v7 快照回填。Electron/Host smoke 真正编辑手工草稿、回答问题、查看来源与历史、关闭重开并再次启动，源 Git fixture 不变。真实截图 `output/playwright/p1-05-draft-clarification-1440x900.png`、`p1-05-draft-revision-history-1440x900.png` 已生成并查看。T020 的本地消息/用户决定定位已验；T016–T019 涉及权威 P1-06 的正式审批，未执行。Windows x64、macOS Intel、DPI、安装包/签名及 Codex utilityProcess 恢复继续未验证。

## P1-04 · 整理器与结构化任务生成 · 2026-09-24

状态：**DONE（macOS arm64，Node Host 与 Electron 在线模型全链路实测）**。权威 P1-04 依赖 P1-03。已加入参考 TaskContract v1.0 的生产严格契约、TaskDraft/固定 Draft 命令、`@forge/refiner` 的意图分类→结构化草稿与最多两次 Schema 修复、受控只读 Codex app-server 模型适配、SQLite migration v6、来源消息绑定/幂等/重启失败恢复/手工草稿与有限原文 CAS 编辑。模型只接收受限项目摘要，不接收项目路径/源码；草稿无 Approval、TODO、Run 或执行权。Desktop 显示真实草稿状态，Web 无本地 Host。决策见 [ADR 0012](decisions/0012-read-only-refiner-and-task-draft.md)。

已通过：开始前 P1-03 全量基线；`@forge/refiner` 单元测试含 feature、模糊澄清、越权字段、两次修复、control；Host 真 SQLite/IPC 测试含手工草稿、版本 CAS、项目隔离、重启恢复与非法 payload；真实 Node Host Codex feature/bug/vague 生成；Desktop `smoke:projects` 手工草稿、重启、源码不变；迁移 v6 在 Node/Electron Desktop smoke 加载。第一次 `smoke:refiner-live` 真实失败：Electron utilityProcess 中 CLI 子进程未进入 Node 模式，草稿标为 `REFINER_FAILED`；补入受控子进程 `ELECTRON_RUN_AS_NODE` 后 app-server 真实启动，但第二次收到 `EXECUTOR_TIMEOUT`，因 Main→Host 原有环境未转发本机所需无凭据代理。加入最小白名单后，第三次真实 Electron 在线 smoke 通过：结构化澄清草稿在 Renderer 显示，独立 Git fixture 源码不变。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。真实截图 `output/playwright/p1-04-generated-draft-1440x900.png` 与 `p1-04-manual-draft-1440x900.png` 已生成并查看。在线模式依赖本机 Codex 登录和代理；安装包、Windows/Intel 仍未验证。下一权威任务 P1-05 开始，不提前实施审批入 TODO。

## P1-03 · 会话与消息流 · 2026-09-23

状态：**DONE（会话/消息/流式基础设施；生产模型尚未接入）**。生产 migration v5 建立 `conversations`、`messages`、`conversation_requests`；Host 独占写入，Project 归属检查，重启保留与归档。发送键与正文 hash 去重；失败、取消、Host 重启中断均保留用户原文，重试同键不会增加第二条用户消息。严格 Conversation/Message/StreamEvent Schema 及固定 Host→Main→Preload→ForgeClient→Vue 事件通道已建立。Responder 抽象对逐块输出持久化和排序；测试 fixture 的 streaming、cancel、failure、retry、重启恢复通过。**生产没有模型 responder**：真实 Desktop 保存用户消息并显示 unavailable，不显示伪助手回复、不创建 Task。Markdown 源按纯文本展示，不执行 HTML。见 [ADR 0011](decisions/0011-conversation-stream-and-provider-boundary.md)。

`pnpm lint`、`pnpm typecheck`、`pnpm test`（含合同、SQLite、Host IPC、Vue XSS/失败保留）、`pnpm build`、`pnpm smoke:desktop`（Electron utilityProcess schema 5、隔离 preload、Host 崩溃）、`pnpm smoke:projects`（真实 Desktop 保存带 HTML 的会话、重启恢复、项目隔离）、`pnpm validate:contracts`（46 文件，0 error，4 warning）、`pnpm validate:task-map`（9 phase，92 task，64 detail，120 case）与 `git diff --check` 均 exit 0。真实截图：`output/playwright/p1-03-local-conversation-1440x900.png`，已人工查看。无新外部依赖。T013 的重复消息、P1-03 本地流与失败保存已验；T011/T012/T014/T015 涉及后续 Refiner/TaskDraft/Approval，不宣称已通过。下一权威任务 P1-04 已进入 IN_PROGRESS。

## P1-02 · 项目及环境数据服务 · 2026-09-23

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-01 已完成；P1-03 已进入 IN_PROGRESS。`packages/persistence` migration v4 给现有 Project 增加 revision/archived_at，新增 Host 独占的 Environment 与 CommandPreset 表并无损回填旧项目默认环境。Project 更新、激活、归档及 Environment/Preset 保存、审批、归档均要求 expectedRevision CAS；归档保留信任/配置历史，不删除用户项目。跨项目查询与关联按 projectId 隔离，命令预设只保存结构化 executable/argv/cwd/envRefs/timeout 与审批摘要，不执行项目脚本。Host 私有协议升至 `forge-host-protocol/v4`；公共输入输出使用严格 Zod Schema；真实业务入口仍是 Renderer→Preload→Main→Host。

验证：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（46 文件，0 error，4 reference warning）、`pnpm validate:task-map`（9 phase，92 task，64 detail，120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`node scripts/smoke-desktop.mjs`、`pnpm smoke:projects`、`git diff --check` 均 exit 0；迁移 v3→v4、重启保留、不同项目隔离、过期版本拒绝、归档/恢复、真实 Host IPC 命令与重复 commandId 真实测试通过。第一次 `pnpm smoke:desktop` 因旧测试断言 Schema `3` 失败；更新为实际 schema `4` 后直接运行 Desktop smoke 通过。尚需在本阶段最终总回归中再跑完整 `pnpm smoke:desktop`。没有新增外部依赖或改变供应链策略。

边界：T006–T009 的本地只读项目探测与基础符号链接防护沿用 P1-01 测试；T010 要求的 Windows 中文路径/worktree/argv 真机验收仍 UNVERIFIED。没有增加 Task/Run 业务表、执行项目命令、Agent 调度或 Remote API。差异与取舍见 [ADR 0010](decisions/0010-project-environment-cas-and-archive.md)。

## Task Map Reconciliation · 2026-09-23

- 用户选择 ADR 0009 的 A。`docs/forge-codex-execution-playbook.md` 已按只读权威 `planning/tasks.json`/`phases.json` 重建 P1～P9 的 **92 个** Task 标题、编号、模块、顺序、依赖、验收引用与 Phase Gate；P1-01 继续为 DONE。旧 Playbook 64 个详细说明块保留并显式映射到权威任务；P8 恢复为手机 PWA 正常阶段，P9 可选增强默认 DEFERRED。Model Provider 的完整替换接口归 P4-07，P1-04 只承接整理器的最小真实调用，凭据产品化归 P6-04；未改动参考包任务状态或任务图。
- 新增 `pnpm validate:task-map` 与 CI 独立步骤，核对权威实施/验收文本、paths、依赖、阶段出口、120 个验收用例引用及说明映射。故意更改任务名称、依赖、Phase Gate、验收引用的 4 项 mutation test 均正确失败；当前原始 Playbook 校验通过。P1-02 已按权威名称「项目及环境数据服务」进入 IN_PROGRESS；其实现与验收另记。

## Autopilot checkpoint · 2026-09-23

- 按新 Autopilot Protocol 从真实 Git 工作区复查 P1-01：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（46 文件、0 error、4 warning）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 全部 exit 0。Playbook 的 P1-01 已与实际 macOS arm64 验收同步为 DONE；参考任务状态未改。
- 下一个依赖满足的编号 P1-02 在 Playbook 是「模型 Provider 与 Secret Storage」，在权威 `planning/tasks.json`/蓝图是「项目及环境数据服务」；P1 任务总数与 Phase Gate 亦不一致。已记录 [ADR 0009](decisions/0009-p1-autopilot-task-map-conflict.md)，P1-02 暂标 BLOCKED，未开始其代码、模型调用或凭据处理。P1-03 及后续都依赖 P1-02，没有独立可执行任务；等待用户选择如何修订任务映射。

## P1-01 · 项目选择与可信环境向导

状态：**macOS 27.0 arm64 已实现并通过本机端到端验证**。日期：2026-09-23。开始时 `main...origin/main` 干净；P0-01～P0-08 已在当前分支。参考规格和 glass 目录保持只读。实施过程中出现与本任务无关的未跟踪 `docs/forge-codex-execution-playbook.md`，未编辑或纳入本轮代码。

### 实现

- `packages/contracts/src/project.ts` 定义严格 Project/Probe、`project-trust/v1` 和固定 project 命令。Host 协议显式升至 `forge-host-protocol/v3`。Desktop 目录选择由 Main 的 Electron `dialog.showOpenDialog(openDirectory)` 承担；Main 验证来源，只允许本窗口刚选中的路径及 Host 返回的规范 Git root 进入 probe/create。Preload 不暴露任意 IPC、文件、Git 或 SQL。
- `ProjectService` 在 Host 中对路径 `realpath` 并确认目录，只运行参数化本地 Git 读取命令，不触发项目脚本、包安装或网络。读取有大小上限的顶层清单；跳过符号链接 manifest。检测 clean/dirty、分支、本地 remote HEAD、lockfile 冲突、项目类型、声明脚本与受限能力；未知值保持 Unknown。选中 Git 子目录时使用真实 Git root；非 Git 项目允许保存但标记 worktree 不可用。
- 用户先看探测与脏树警告，再单独点 Trust。Host 对路径重新探测并比较 SHA-256 摘要，过期结果拒绝；信任范围不包括未来危险操作自动批准。生产 migration v3 仅添加 `projects` 与 `project_trust_decisions`，保存独立 UUID、规范路径、严格环境快照、信任版本/时间/hash 与当前项目指针。重复 symlink/同仓库不会重复创建；重启后 active project 保留；Remove from Forge 只删除 DB 记录。`project.update` 本轮仅支持安全名称更新；更完整的环境/命令版本与 CAS 留给 P1-02。
- Vue 项目向导和顶部切换入口使用正式 `@forge/ui`、glass v1.1。普通 Web 无本地选择器；自然语言输入、任务看板、Agent 仍明确不可用。决策和参考 DDL 差异见 ADR 0008。

### 本机验证

- 开始前 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check`：全部 exit 0；契约 46 文件、0 error、4 个 reference-only warning。
- Host 单元/集成覆盖真实 Git clean/dirty、中文空格路径、非 Git、多个 lockfile、失效 fingerprint、未确认信任、symlink 去重、外部 symlink manifest 不读取、项目 UUID/持久化/移除源码不变。真实 Node Host IPC 覆盖未握手拒绝、路径错误、schema 拒绝 `approved:false`、probe/create/list/active/remove 和协议不兼容。Web 组件测试验证无本地 picker、信任按钮前没有 create 调用。
- `pnpm smoke:projects`：真实 Electron Renderer/Main/utilityProcess Host/SQLite 全链路，在独立临时 Git/非 Git fixture 中完成目录选择返回、取消、脏树探测、信任、进入工作区、重启恢复、项目切换和只删除 Forge 元数据；首次截图发现探测页按钮超出 1440×900 可视区和首页动画未结束，调整间距/等待后重新截图核对。自动化替换系统选择器返回值以保持稳定；另外通过 macOS 原生目录面板实际选择独立临时非 Git 目录，Forge 页面显示 Host 规范路径与 Non-Git 探测结果。
- 最终回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check`：全部 exit 0。契约校验仍为 46 文件、0 error、4 warning；Desktop smoke 实际握手 `forge-host-protocol/v3`，Storage ready/schema 3，数据库损坏降级与 Host crash 检测通过；项目 smoke 覆盖 choose、cancel、dirty、trust、connected、restart、non-Git、switch、metadata-only remove。正式代码未新增第三方依赖。
- `pnpm dev:web` 启动 Vite 8.3.0；`curl http://127.0.0.1:5173/` 返回正式 Forge 入口，Ctrl+C 后 5173 无监听。Web 组件测试确认无 Desktop bridge 时显示本地选择不可用且不发起 project 命令。
- 真实截图：`output/playwright/p1-01-choose-project-1440x900.png`、`p1-01-project-detected-dirty-1440x900.png`、`p1-01-trust-project-1440x900.png`、`p1-01-connected-ready-1440x900.png`、`p1-01-connected-workspace-1440x900.png`。均由当前 Vue/Electron 代码生成，非参考包图片；目录被 Git 忽略。

### 尚未验证和下一项

Windows x64、macOS Intel、真实 DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 保持 **UNVERIFIED**；Windows 进程树 backend 仍不可用。P1-02「项目及环境数据服务」是下一项依赖满足的任务，本轮不实施。

## P0-08 · 契约自动校验与 CI 入口

状态：**macOS 27.0 arm64 的 P0-08 工程实现与本机校验通过**。Linux GitHub Actions 尚未实际运行；T116–T120 是后续评测业务验收，本轮未执行。版本保持 0.0.1，未提交、推送、发布或进入 P1。日期：2026-09-23。

- 新增 `@forge/contract-validator`，提供只读 `validateContracts()`、统一 issue/report 和独立 CLI。扫描参考包 13 个 JSON Schema、示例、4 个 Agent Profile、默认 Workflow、示例 Plugin Manifest、100 项 Task、10 个 Phase、24 个 Module、120 条待执行 Acceptance Case、44 个命令声明、OpenAPI 与 SQL；另外检查生产设计 token、生产 migration SQL、workspace 依赖版本与许可证清单。当前为 46 个文件、0 error、4 个 reference-only warning，约 100 ms 静态校验。
- 共用 `ReferenceIndex` 区分各 ID namespace，检查重复 ID、缺失引用、Task 循环/阶段顺序、Workflow 可达/有界返工/人工终点、插件服务/权限、OpenAPI 本地引用/命令一致性。Ajv 8 严格编译 draft 2020-12；YAML 2 拒绝重复键；SQLite DDL 与 migration SQL 只在独立内存库执行。生产 Host 不读取参考资料，参考目录未改动。
- 13 项 validator 测试通过，其中 12 项故意破坏契约：重复 Task ID、缺失 Profile、依赖环、非法 Schema、Workflow 死端、未知插件权限、坏验收引用、验收用例反向缺失任务、坏示例、悬空 OpenAPI 引用、无效 SQL、依赖版本漂移。每项验证报告包含目标错误码且 CLI exit 1。CI `.github/workflows/quality.yml` 已单列 `pnpm validate:contracts`，接着运行 lint/typecheck/test/build；GitHub Linux job 尚未触发，不写成 CI 实测通过。
- 供应链：新增 `ajv@8.20.0` MIT、`ajv-formats@3.0.1` MIT、`yaml@2.9.1` ISC；复用 `better-sqlite3@13.0.3`、TypeScript 与类型包。版本/许可证记录和 lockfile 更新，`pnpm install --frozen-lockfile` 通过；安装脚本仍禁用。决策见 ADR 0007。
- 开始前以及最终 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0。最终 `pnpm validate:contracts` exit 0；`pnpm probe:codex` 显示本机 app-server 可用；`pnpm test:workspace-live` 真实长命令取消、三代 PID 停止、源仓库不变、workspace 释放，exit 0。 `pnpm test:codex-live` 在独立 fixture 中 SDK/app-server 只读与结构化输出、真实写入及 fixture 测试、streaming、cancel、跨连接/进程 continuation、approve/reject 全链路 exit 0；这依赖当前认证及上游网络。
- 参考 Profile 的 `codex-sdk` 和 `forge.refiner` 仅有静态参考声明；真实 Plugin Host 装配仍未实现。P0-08 在任务清单关联的 T116–T120 是未来评测场景，不能作为本轮 contract validator 验收通过。完整平台/阶段差异见 `docs/p0-completion-report.md`。


## P0-07 · 设计 Token 与基础组件

状态：**macOS 27.0 arm64 的 P0-07 工程实现与本机 UI 验证完成**；Windows、macOS Intel、真实 Retina/Windows 系统 DPI、读屏器和暗色主题验收仍未执行。版本仍为 `0.0.1`；本轮未提交、推送、发布或进入 P0-08。日期：2026-09-23。

### 本轮实现

- `@forge/ui` 公开 typed token、组件及布局入口。`values.json` 为工程唯一 token 源，脚本生成 CSS，build 执行一致性检查；颜色、字体、间距、圆角、阴影、玻璃、动效、z-index 覆盖 glass v1.1 目标，另外给状态文字增加高对比的派生 token。没有新第三方 UI 依赖或字体。参考资料目录保持只读。
- 新增 GlassSurface、Button/IconButton、Input/Textarea/原生 Select、StatusTag/Badge、Card、Tabs、Tooltip、Popover、Dialog、Drawer、Toast、EmptyState、Spinner、Skeleton，以及 AppShell、IconRail、WorkspaceHeader、CommandPanelShell、ContentArea。Dialog/Drawer 有背景 inert、Tab 环绕、Escape、触发器焦点返回；其他控件使用可访问名称和可见 focus。减少透明度与动效同时接受系统偏好和当前窗口开关。
- Web 首页改用正式 UI 包；Desktop Renderer 继续加载同一 Web 构建，Host diagnostics 和 crash/Storage 状态保持真实。自然语言输入仍禁用发送，不生成 Task；看板、工作流、Agents、插件均只显示真实不可用/空状态。开发 Showcase 在 `pnpm dev:web` 的 `http://127.0.0.1:5173/#/dev/ui`；生产构建同 URL hash 只显示普通首页。
- 1280×800 的 125% CSS zoom 探测发现输入动作曾被挤出面板；给命令面板最小高度后，主内容区滚动且按钮可达。这个结果不等于 Win125%/150% 或 Mac Retina 系统级 DPI 验收。决策见 ADR 0006。

### 命令与真实证据

| 命令 / 场景 | 结果 |
| --- | --- |
| 开始前 AGENTS/README/status/compatibility/ADR、P0-07/T106–T110、glass 设计资料与真实代码检查 | `main...origin/main` 保留 P0-01～P0-06 已有未提交文件；`packages/ui` 原先只有 tokens.css。看过 glass v1.1 的 1440 看板截图及原型结构，未把演示脚本/业务数据移入正式应用。 |
| 开始前 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部 exit 0，已有 P0-06 基线正常。 |
| `pnpm install --offline`、`pnpm install`、`pnpm install --force`、最终 `pnpm install --frozen-lockfile` | 离线第一次因本机 registry metadata 缺失失败；联网安装通过。新增 UI importer 首次 peer 链接指向未物化的 Vue/vue-tsc 变体；锁定已有 TypeScript peer 变体并冻结安装后通过，供应链策略继续启用。没有新外部版本、sudo 或 install script 放宽。 |
| `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 最终回归 | 全部 exit 0；13 个 workspace，57 项自动测试。UI token 一致性、8 组核心文字/状态配色对比、Button/IconButton/Input/interactive Card/Glass/Tabs/Popover/Dialog/Drawer/Web 挂载与旧 Host/Persistence/Executor/Workspace/Process 回归通过。Desktop smoke 的真实 connected、Storage ready、degraded 和 crash-detected 均通过。 |
| `node scripts/capture-ui.mjs` | 真实 Electron + Host：1440×900、1600×1000 无水平溢出；1280×800 的 125% CSS zoom 下动作仍在面板内且主内容可滚动，Playwright viewport 的 DPR=1；减少透明度 computed blur(0px)，减少动效 computed animation=0s。临时 Host DB 已随进程清理。 |
| Playwright CLI 真实浏览器 | Web `Local Host unavailable` 正常；开发 hash 路由显示 Showcase，生产构建同 hash 不显示；Dialog Shift+Tab 环绕、Escape 后焦点回到 Open dialog；`prefers-reduced-motion: reduce` 的 token=0ms、实际动画约 0.01ms。 |

截图来自本轮真实代码，不是参考包图片：

- Electron Home 1440×900：`output/playwright/p0-07-desktop-1440x900.png`
- Electron Home 1600×1000：`output/playwright/p0-07-desktop-1600x1000.png`
- Vite 开发 Showcase：`output/playwright/p0-07-ui-showcase.png`
- Electron 减少透明度与动效：`output/playwright/p0-07-desktop-reduced-transparency.png`
- Electron 1280 宽、125% CSS zoom 模拟：`output/playwright/p0-07-desktop-1280-css-zoom-125.png`

截图位于 Git 忽略的本地 QA 目录。Showcase 只展示组件状态，不提供假的 Agent/Task 结果。

### 验收边界与下一项

- T106：Dialog/Drawer 基础焦点在组件和真实浏览器通过；完整审批/任务抽屉业务尚不存在。T107：静态不透明表面文字/状态对比通过，真实玻璃合成与暗色主题未验收；glass v1.1 当前仅给浅色基准。T108：1280/1600 与 CSS zoom 通过，Win150%/Mac Retina 未测。T109：长文本换行基础已加，正式 120 字任务详情未实现。T110：系统 reduced motion 与当前窗口开关实测通过。
- Windows x64、macOS Intel、真实系统 DPI、原生窗口控件在两平台的视觉、屏幕阅读器、Windows 高对比度、安装包仍为 **UNVERIFIED**。外观开关只在当前窗口有效，完整设置持久化属于后续任务。
- 下一项满足依赖的是 P0-08「契约自动校验与 CI 入口」；本轮不自动开始。

## P0-06 · 跨平台工作区与进程取消探测

状态：**macOS 27.0 arm64 上的最小 Workspace/Process Spike 已实现并真实验证**。Windows 进程树 backend 仍不可用、macOS Intel 未测试，因此任务清单所写“双平台无残留写进程”尚不能跨平台验收；版本保持 `0.0.1`，未提交、推送、发布或进入 P0-07。日期：2026-09-23。

### 已实现与决策

- 新增 `@forge/workspace` 的严格 WorkspaceDescriptor、detached Git worktree 管理、单 Run acquire、owner/runtime/source repo common-dir identity、dirty worktree 显式 discard、路径/符号链接防护、幂等 release，以及 shutdown `failed` 隔离和重启 orphan 检测。Git 调用覆盖为受控空 hooks 目录，真实 `post-checkout` fixture 未执行；Host 自有数据目录持有 workspace，不执行全局 `git worktree prune`。正式分支/快照/合并仍属 P2/P3。
- 新增 `@forge/process` 的受控 executable + argv、ProcessDescriptor、独立 POSIX 进程组、TERM→有限 grace→KILL→确认退出、重复 cancel、运行期归属与只报告不自动清理的旧进程记录。测试确认父进程先退出仍能终止其组；Run A 的取消不影响 Run B 或非 Forge 用户进程，端口可再次绑定。Windows backend 拒绝启动，不伪称可终止进程树。
- Codex CLI 探测及 app-server 现由 ProcessController 启动；Host Registry 在退出前停止接受新 Run 并取消自己拥有的进程，WorkspaceManager 将未释放 lease 标记 failed。`HostRunResources` 只做基础设施启动/取消/确认/释放；失败 quarantine，不推动 Task 状态。Desktop Main 的 Host shutdown 等待上限增至 8 秒，仍不直接管理 Agent 子进程。
- 实际 Codex 长任务在独立 worktree 启动父/子/孙三个进程：app-server 与命令进程组不同，必须先用 provider `turn/interrupt`。本机在线探测确认三个 PID 消失、心跳停止、源仓库 HEAD/status 未变后，才释放 worktree；强制停止任意脱离 Codex 管理的进程尚未证明。详细边界见 ADR 0005。

### 执行记录

| 命令 / 场景 | 实际结果 |
| --- | --- |
| 开始前 AGENTS/README/status/compatibility/ADR/规格/代码与 `git status --short --branch` | `main...origin/main` 上保留 P0-02～P0-05 既有未提交改动；两份资料目录未修改。P0-06 指向 `packages/workspace`、`packages/process`，T047 snapshot/T050 合并重验属于后续阶段。 |
| 开始前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm probe:codex`、`pnpm test:codex-live`、`git diff --check` | 全部通过；当前 macOS arm64 的 P0-05 基线仍成立。 |
| `pnpm --filter @forge/workspace test` | 真实中文/空格/长路径 source→worktree、base SHA、dirty source 隔离、未跟踪文件、release 后 Git metadata、恶意 hook 不执行、恶意 ID/symlink/active process 拒绝、shutdown orphan 检测通过。 |
| `pnpm --filter @forge/process test` | 真实父/子/孙、Run A/B 与非 Forge C 隔离、端口释放、无响应进程强制停止、父先退出后的组取消、重复 cancel 与 argv Unicode/空格通过。 |
| `pnpm test:workspace-live` | 真实 Codex app-server 与三个命令 PID；命令有独立 PGID，provider 中断后 PID 消失、心跳停止、Forge 组退出、源仓库不变、worktree 释放；未使用 Forge 自身仓库作写入目标。 |
| Host Registry shutdown 与失败取消单测 | 停止接收新 Run、已启动子孙进程退出；未确认取消时 workspace 为 failed 并保留文件，未误报 release。 |
| 最终 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部 exit 0；13 个 workspace 项目、48 项自动测试通过。Desktop Electron utilityProcess 的真实 Host connected/Storage ready，原降级和崩溃回归仍通过。 |
| 最终 `pnpm test:workspace-live`、P0-05 `pnpm test:codex-live`、`pnpm probe:codex` | 均通过；P0-06 最终 app-server PID 38421，命令父/子/孙 PID 38763/38764/38765、PGID 38763，取消后全部退出且 worktree released。P0-05 的在线回归在 ProcessController 接入后通过；之后仅有 CLI 清理 lint 写法与 Git hook 空目录的修正，P0-06 live 已在最终代码上复跑。 |
| `pnpm dev:web`、`curl --fail --silent http://127.0.0.1:5173/`、Ctrl+C、5173 监听检查 | Vite 启动、返回 Forge 页面和 `#app`；退出后无监听。 |

### 边界与下一项

- `WorkspaceDescriptor` 是本轮公开边界；完整 WorkspaceService、lease epoch、snapshot、未跟踪文件 hash、分支前移重验、业务 Task DB 均未实现。T046 单写者基础拒绝、T048 argv/参数基础防护、T049 路径/symlink 基础防护已测；T047/T050 的完整业务验收未执行。
- macOS arm64 本机通过不代表 Windows/macOS Intel 通过。Windows Job Object 或等价安全进程树实现、Electron utilityProcess 中有活动 Codex Run 时的退出、安装包和故意 `setsid` 脱组子进程均待验证。旧归属记录仅标记“可能 orphan”，不会基于旧 PID 自动杀进程。
- 下一项满足依赖的任务是 P0-07「设计 Token 与基础组件」；本轮不自动开始。

## P0-05 · Codex Integration Spike / Codex Executor 兼容探测

状态：P0-05 最小 Executor API、Host Registry 与 Codex app-server Adapter 已在 macOS 27.0 arm64 实施并通过真实验收；Windows、macOS Intel 和安装包未验证。日期：2026-09-23。版本仍是 `0.0.1`，未提交、推送、发布或进入 P0-06。

### 已实现

- `@forge/plugin-api` 的严格 ExecutorCapabilities、RunRequest、14 类标准 ExecutorEvent、RunHandle 和错误码。Core 不导入 Codex；`@forge/executor-codex` 使用固定 `@openai/codex@0.155.1` 的私有 stdio app-server，校验请求/关键响应，映射事件并拒绝未知模型和交互请求。
- Host 内置最小 Executor Registry 和事件监听器；只允许开发诊断与独立 fixture 调用，没有 Renderer → Executor 通道、Task 状态推进、持久 Attempt 或业务审批。`pnpm probe:codex` 根据实际本地版本、登录、握手、实时模型列表和版本匹配的 `verified-capabilities.json` 输出能力。后者只适用于本机实测版本，不是跨平台声明。
- 独立临时 Git fixture 的 Codex 实际修改 `src/add.js` 和测试；`npm test` 通过，Host Registry 的事件监听器收到序号连续的标准事件。fixture 父目录的标记文件保持不变，Git diff 仅含指定的两个文件；这是本次任务的实际写入边界观察，不证明任意读取/网络隔离。45 秒命令启动后 `turn/interrupt` 使 Run cancelled，未生成后续文件；新连接以同一 thread ID 继续。另由两个不同 PID 的 Node 进程分别创建 Host Registry，保存 thread ID 后跨进程继续成功；这不是 Electron utilityProcess 的重启测试。只读 sandbox 的 approve 写入、reject 不写入均收到真实请求/决议。隔离 `CODEX_HOME` 证实无认证时返回 `EXECUTOR_AUTH_FAILED`。
- ADR 0004 记录 SDK 与 app-server 选型、与蓝图 SDK 优先的差异、审批和进程边界。app-server 官方文档与本机 0.155.1 实际 enum 变体不同，适配器按固定版本实测值实现。

### 本轮命令和结果

| 命令 / 场景 | 真实结果 |
| --- | --- |
| 开始前 `git status --short --branch`、AGENTS/README/实施记录/ADR/规格与代码检查 | main 保留 P0-02～P0-04 未提交改动，资料目录未修改。 |
| 开始前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部通过；P0-04 基线仍为 33 项测试。 |
| `pnpm install`、`pnpm view @openai/codex{,-sdk}@0.155.1 ...` | 11 个 workspace，新增精确 0.155.1 CLI/SDK；无 install script 放宽，锁文件供应链策略通过。 |
| SDK 只读 spike | 真实 thread/turn 事件和 token usage；临时目录需先 `git init`，否则 SDK 拒绝非可信目录。 |
| app-server 只读 + `gpt-6-astra` + JSON Schema | 真实 thread/turn 完成，返回正确 fixture 包名 JSON，收到 delta 与 token usage。 |
| app-server Codex Adapter 写入 spike | Host Registry 启动真实 Codex Run，最终套件事件总线收到 240 条连续标准事件；真实修改两个 fixture 文件，fixture `npm test` 通过，父目录标记未变。 |
| 最终 live 的真实 usage | 写入 thread 的 `inputTokens=129985`、`cachedInputTokens=101376`、`outputTokens=1140`，`cost/currency=null`（上游未提供实际费用）。SDK 只读 usage 为 input 40971、cached 32768、output 135、reasoning 15。 |
| app-server 生命周期 spike | 长命令已启动后取消，Run 为 cancelled 且无后续文件；新连接用原 thread ID 继续成功。 |
| `resume-process.mjs` | 两个不同 PID 的 Node 进程分别创建 Host Registry；第二进程用第一进程保存的 thread ID 完成 continuation；未模拟完整 Forge Attempt 恢复。 |
| app-server 审批 spike | approve 请求后文件真实写入；reject 请求后文件不存在；两者均有 approval.requested/resolved。 |
| `pnpm test:codex-live` 首次串行重跑 | 认证缺失、无效 workspace/model、SDK 只读先通过；随后 app-server 只读阶段连续 `responseStreamDisconnected`，120 秒未收到终态，命令失败。原因为本轮环境白名单遗漏本机所需代理。 |
| 修正环境白名单后 `pnpm test:codex-live` | **通过**：认证缺失、非法工作区/模型、SDK 只读、app-server 只读/指定模型/结构化输出、Adapter 结构化输出、真实写入和测试、取消/跨连接继续、approve/reject 全部完成。无凭据代理 URL 可传入 Codex 子进程；任意 Key/Forge token 仍被屏蔽。 |
| Host Registry 与实时模型列表的最终 `pnpm test:codex-live` | **通过**：动态选择当前可用的 `gpt-6-astra`；Host 事件链 240 条连续事件、fixture 修改与测试、取消/跨进程恢复和双向审批均通过。 |
| `pnpm probe:codex` | 本地 CLI 0.155.1、ChatGPT 登录、stdio 握手与模型列表可用；详细能力按本机实测证据返回。`available` 只代表本地可用，不代表模型连接健康。 |
| 新代码后 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 离线质量检查、构建与 Desktop 真机回归通过；最终安全/文档修正后的复核见本节后续记录。 |
| 最终冻结安装、lint、typecheck、test、build、Desktop smoke、diff check | 全部 exit 0；工作区共 40 项自动测试通过。Desktop utilityProcess Host 仍为真实 connected / Storage ready，随后无效库降级与崩溃检测通过。 |
| `pnpm dev:web` + `curl http://127.0.0.1:5173/` → Ctrl+C → 端口检查 | Web 返回 Forge 标题和 `#app` 根节点，退出后 5173 无监听；Web 没有本地 Host 依赖。 |

### 验收边界

- T041 的第二个不同厂商 Executor 属于后续 P4，不能把同一 Codex 的 SDK/app-server 算成两个产品执行器。T042 未知模型已真实拒绝。T043 中断及跨进程 thread continuation 已实测，但 Forge Attempt 恢复未实现。T044 不凭文本判成功，真实 fixture 文件和测试均被独立断言；完整业务产物/状态验收仍在 P2。T045 隔离登录缺失已测，运行中凭据过期未测。
- `toolEvents` 的 MCP 工具事件、强制网络策略、严格只读根、实际费用、SDK 审批/恢复、Windows、macOS Intel、安装包均未验证。`resume` 指 Codex thread continuation；没有 Forge Task 自动恢复、人工身份审批服务或 Secret Storage。
- 下一项满足依赖的任务为 P0-06「跨平台工作区与进程取消探测」；本轮不自动开始。macOS 上的 P0-05 通过不代表 Windows/Intel 平台已验收。

## P0-04 · 数据库与原生模块风险验证

状态：macOS 27.0 arm64 上最小 SQLite 基础设施与两种 Host 运行时实测通过；Windows x64、macOS Intel、安装包未验收。日期：2026-09-23。当前仍为 `0.0.1`，没有提交、推送、发布或进入 P0-05。

### 已实现

- 新增 `@forge/persistence`，只向 Host 暴露 `open/close/migrate/health/transaction`、受限内部 metadata 与一致性备份接口。SQLite driver 不进入 Main/Preload/Renderer；数据库默认在 Forge 自己的用户应用数据目录，开发/生产分离，所有集成和 Desktop smoke 使用独立临时目录。
- 固定 `better-sqlite3@13.0.3`、`drizzle-orm@0.45.3`。前者使用包内 N-API 预构建文件，无安装脚本；仍保持 pnpm `ignoreScripts: true`。Drizzle 当前只访问内部 `runtime_metadata`，没有生成业务表。
- 实现两版事务迁移：v1 建立 `schema_migrations` 和 `runtime_metadata`；v2 增加 `updated_at` 与索引。按顺序、checksum 和 `user_version` 校验，失败不记成功，拒绝未来版本。启用 FK、WAL 与 5000ms busy timeout，使用 SQLite backup API 创建一致性备份。
- Host 启动时迁移数据库并写入真实启动元数据；`system.health` 返回 Storage/schema/SQLite 与进程 runtime。数据库失败时 Host 为 degraded、Storage unavailable，错误码不带路径或 SQL。健康契约升级为显式 `forge-host-protocol/v2`；Desktop 诊断只显示 Storage/Schema，不显示数据库路径。
- ADR 0003 记录 driver、N-API、单 Host ownership、迁移、WAL、备份与打包风险。

### 执行记录

| 命令 / 验证 | 实际结果 |
| --- | --- |
| 开始前 `git status --short --branch` 与 P0-03 代码/ADR/规格检查 | main 上保留 P0-02/P0-03 未提交改动；两个只读资料目录未修改。 |
| 开始前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部通过，P0-03 基线测试 22 项。 |
| `pnpm install`、`pnpm install --frozen-lockfile` | 9 个 workspace 项目；锁文件与供应链策略通过，没有打开安装脚本。 |
| Node 直接加载 `better-sqlite3` | Node v22.22.0、modules ABI 127、darwin/arm64；包内原生模块加载，SQLite 3.53.4。 |
| `pnpm dev:host`、构建后 `pnpm --filter @forge/host start`，同一独立临时库重启 | 两次真实 Host 启动；schema 2、内部启动计数从 1→2；Ctrl+C 后 PID 消失。 |
| `pnpm dev:desktop`（独立临时库） | Vite/Electron/utilityProcess Host 真实启动并握手；Ctrl+C 后本次 Host PID 与 5173 监听消失。 |
| `pnpm --filter @forge/persistence test`、`pnpm test` | v1→v2、重复迁移、失败回滚、未来版本、commit/rollback、唯一/FK、锁超时、错误映射、WAL 备份、进程中断恢复及 Host 重启/降级通过；全工作区 33 项通过。 |
| `pnpm dev:web` + Playwright CLI 普通浏览器快照 | Forge 页面加载、`Local Host unavailable`、禁用的 Agent 输入提交和真实空看板仍正常；浏览器与 Vite 已关闭。 |
| `pnpm smoke:desktop` | 构建后 Electron utilityProcess 是 Node 24.21.0、modules ABI 149、Electron 44.4.3、darwin/arm64；原生 driver 加载、SQLite 3.53.4、WAL、schema 2、Storage ready；无效 DB 时 UI 显示 Host degraded/Storage unavailable；原 Host 崩溃回归和退出清理通过。 |
| `pnpm lint`、`pnpm typecheck`、`pnpm build`、`git diff --check` | 通过，正式源码保持 strict；Web/Host/Desktop 产物成功构建。 |
| `pnpm licenses list --json` | 当前 macOS arm64 已安装依赖树 191 项已写入 `docs/dependency-licenses.json`。 |

实现中首次 `pnpm build` 因新包缺少声明输出而失败，补齐 `declaration` 后通过。增加迁移失败写入闸门后，首次单包测试发现 health 把未来 schema 误归为迁移失败；先检查实际 schema 版本再判断迁移状态，复测通过。以上失败均未当成验收通过记录。

### 验收范围与未验证

- T086：仅以内部元数据验证事务中途进程退出无半提交；任务/审批/事件的业务原子性尚未实现。T087：真实 WAL backup API 与恢复读取已通过。T088：v2 失败不标成功、旧数据保留已通过。T089：真实锁超时与 SQLite_FULL 错误映射通过；没有模拟整机磁盘满。T090：Persistence API 不返回 driver；插件 namespace 仍需后续插件阶段。
- 当前 `pnpm build` 后的 Node Host 与 Electron utilityProcess Host 都能加载原生文件；尚未创建 `.asar` 或安装包，原生文件随包分发、签名、公证、Windows x64、macOS Intel 均未验证，不能宣称跨平台原生兼容性完成。
- `forge_spec_v1.0/contracts/schema.sql` 的业务 DDL 未应用；当前正式库只有两个内部表。没有 Task、Agent、Workflow 或 Project Memory 数据。

### 下一项满足依赖的任务

P0-05「Codex SDK 兼容探测」依赖 P0-04；只报告依赖关系，本轮不开始。

## P0-03 · Host 入口与进程通信

状态：当前 macOS 27.0 arm64 上实现并实测通过；Windows x64、macOS Intel 与跨平台验收未验证。日期：2026-09-23。版本仍为 `0.0.1`；本轮没有提交、推送或发布。

### 已实现

- `apps/host` 可作为独立 Node 进程运行；每次生成真实 hostId/PID/startedAt，并有显式状态迁移、结构化生命周期日志、SIGINT/SIGTERM/断连与致命错误收尾。Host 不导入 Electron 或 Vue。
- `packages/contracts` 增加 `forge-host-protocol/v1` 的严格 Zod 请求/响应契约；`packages/core/commands` 只注册 `system.health`、`system.info`、`system.ping`，拒绝未知命令和非法输入，按 commandId 缓存本进程只读响应。
- Desktop Main 使用 `utilityProcess` 私有消息通道启动自己拥有的 Host。经过 ready、产品/Host/协议版本握手及真实 health probe 后才宣告 connected；周期探测、异常退出、超时、失配与无效响应有区分。退出时先优雅关闭，超时仅对持有句柄、PID、hostId、ownership token 的子进程做有限清理。
- `packages/client` 提供 ForgeClient、LocalTransport 和 Web 的 UnavailableTransport。Renderer 只能经固定 Preload bridge → 来源校验的 Main → Host；普通 Web 不会接触 Node/Electron。本轮 UI 只新增真实 Host 状态与诊断弹层，Agent 输入仍不可提交，看板仍为空。
- ADR 0002 记录进程模型、本地通道及规格冲突。参考业务 command-envelope Schema 保持不变；本轮系统协议不冒充业务协议。

### 本轮命令与结果

| 命令 | 本机结果 |
| --- | --- |
| `git status --short --branch`、实际代码/规格/ADR 检查 | 从 main `0ae07ef` 及未提交的 P0-02 工作区继续；参考包未修改；未提交/推送。 |
| P0-03 编辑前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop` | 现有 P0-02 基线全部通过；原测试共 10 项。 |
| `pnpm add zod@4.6.4 --filter @forge/contracts --save-exact`、`pnpm install --frozen-lockfile` | 8 个 workspace 项目，锁文件和现有供应链策略通过。 |
| `pnpm dev:host` → Ctrl+C → `ps -p 53597` | 独立 Host 生成真实 hostId/PID、输出 ready/stopping；Ctrl+C 后该 PID 不存在。 |
| `pnpm dev:desktop` → Ctrl+C → `ps -p 53818`、`lsof -iTCP:5173` | Vite、Electron、utility Host 真实启动并握手；Ctrl+C 后本次 Host PID 与 5173 监听均不存在。 |
| `pnpm dev:web` + Playwright CLI 浏览器打开/快照/诊断弹层 | 普通浏览器显示 Forge 与 `Local Host unavailable`；诊断的 Host 字段为缺省、错误为 HOST_UNAVAILABLE，无假在线信息。浏览器及 Vite 已关闭。 |
| `pnpm lint` | 最终通过。首次发现 AppShell computed 缺少 fallback 返回，补齐后复跑通过。 |
| `pnpm typecheck` | strict 契约/Core/Client/Host/Web/Desktop 全部通过。 |
| `pnpm test` | 通过，Node/Vue 各包及工作区共 22 项；包含真实 Node Host 进程握手、命令、关闭与崩溃测试。 |
| `pnpm build` | 通过，Host/Web/Electron Main/Preload 及所需包均构建成功；`pnpm test` 和 smoke 内也执行构建。 |
| `pnpm smoke:desktop` | 真实 macOS Electron 两次启动：握手成功、真实健康/版本/PID/ID、Renderer ForgeClient 刷新、重载后仍为同一 Host、未知命令/伪造字段拒绝；退出后 Host PID 消失；第二次 SIGKILL 指定 Host 后 UI 转 `Host crashed`、旧 health/info 清空、返回 HOST_EXITED。截图已查看。 |

### 规格边界与未验证

- T095 未知命令已覆盖。T091 的完整 actor/project scope、T092 持久幂等、T093 写命令 CAS、T094 事件游标都依赖后续业务/远端模块，本轮没有假装通过。系统命令调用上下文由 Host 通道注入，当前 commandId 去重仅在 Host 本次进程内。
- 任务清单 P0-03 的“项目读取”与本轮明确禁止项目业务存在范围差异；参考 `command-envelope.schema.json` 与本轮系统 envelope 字段也不同，见 ADR 0002。没有修改只读基线或引入项目假数据。
- Windows x64、macOS Intel、打包/签名、长期运行、云端 CI 均未实测。主机崩溃后没有自动重启；Web 没有 RemoteTransport；无数据库/凭据/模型调用。

### 下一项满足依赖的任务

P0-04「数据库与原生模块风险测试」依赖 P0-03。这里只报告依赖关系，不开始实施；其中 Windows 读写/ABI 验收仍需 Windows 实机。

## P0-02 · Desktop 壳与 Shared Web 入口

状态：应用壳已实现，当前 macOS arm64 实机启动验证通过。日期：2026-09-23。版本号仍为 `0.0.1`，本轮未提交、推送或发布。

### 已实现

- `apps/web` 是普通浏览器与 Electron Renderer 共用的唯一 Vue 3 App；`packages/ui` 提供从 glass 设计提取的正式 CSS tokens。首页、项目、看板和外观入口均为明确的空状态；输入只保留于页面内存。
- `apps/desktop` 提供 Electron Main 和 Preload。Main 管理原生窗口、单实例、固定加载来源以及新窗口/导航/权限拒绝；Preload 只暴露冻结的 `{ platform }`。Renderer 以 capability 判断 Desktop/Web，不能直接访问 Node 或通用 IPC。
- Web/Desktop 分别可用 `pnpm dev:web` / `pnpm dev:desktop` 启动，`pnpm start:desktop` 加载构建后的共享 Web 产物。使用原生标题栏、1440×900 默认窗口和 1280×800 最小窗口。
- 银白与浅蓝灰雾面层、浅色 68px 导航栏、圆角阅读面、深色胶囊按钮、柔和环境光，以及减少动效/减少透明度入口已进入正式 Vue/CSS。参考 HTML 与截图未参与构建。
- 加入 Vue 挂载测试、Web 缺少 Electron API 的测试、token 基线测试、编译后 Preload allowlist 测试和真实 Electron smoke test；更新直接依赖锁定、许可证清单及架构决策记录。

### 本轮命令与结果

| 命令 | 本机结果 |
| --- | --- |
| `git status --short --branch`、资料与 P0-01 文件检查 | 从 main 的 P0-01 已推送基线开始，原工作区干净；两份规格资料保持只读。 |
| `pnpm install`、`pnpm install --frozen-lockfile` | 5 个 workspace 项目安装通过；最终冻结 lockfile 与供应链策略均通过。 |
| `pnpm dev:web` + Playwright 浏览器打开/快照/截图 | 普通 Web 入口加载 `Forge · 工作台`，显示 Web 与 Host 未连接；设置入口和“减少透明度”开关在浏览器内可操作。无应用运行错误；最初仅有缺失 favicon 的 404，已添加图标并复测。 |
| `pnpm dev:desktop` | Vite 与 Electron 在 macOS arm64 启动；进程检查显示 sandboxed Renderer；退出后无 Forge 子进程残留。 |
| `pnpm smoke:desktop` | Electron 44.4.3 真实窗口加载构建后的 Vue 页面；Forge 标识、禁用的草稿按钮、只读 bridge、安全 WebPreferences 及 Renderer 重载后恢复均通过；实际截图已人工查看。 |
| `ELECTRON_RUN_AS_NODE=1 pnpm --filter @forge/desktop exec electron -p ...` | Electron 44.4.3 内置 Node 24.21.0、modules ABI 149、N-API 10、Chromium 152.0.7977.130。 |
| `pnpm licenses list --json` | 生成当前 macOS arm64 已安装依赖的 186 项许可证清单。 |
| `pnpm lint` | 通过，正式 Vue/TS/Node 源码纳入检查。 |
| `pnpm typecheck` | 通过，strict Web、Electron Main/Preload 与契约检查。 |
| `pnpm test` | 通过，构建后 10 项测试通过（UI tokens 2、Vue App 3、Desktop 安全 2、工作区/版本 3）。 |
| `pnpm build` | 通过，Web Vite 产物与 Electron Main/Preload 构建成功。 |

安装时发现 Electron 44.4.4 发布时间未满足当前 pnpm 供应链最短等待期。移除 pnpm 自动产生的例外配置，改锁已过等待期的 44.4.3，重新生成锁文件后冻结安装通过。44.4.3 二进制首次下载出现一次 `fetch failed`，原命令重试后成功；未更改全局环境或绕过策略。

### 验收边界与未验证

- T001：没有业务 IPC，静态测试和真实 smoke 均确认仅有只读 `platform`；后续 IPC channel/schema 的未授权调用测试仍待 P0-03。T003：Renderer 重新加载后保持页面和 bridge 的 smoke 断言已加入。T002 单实例逻辑已实现，第二实例自动化尚未执行；T004 平台快捷键、T005 Windows/DPI 布局仍待后续实机验证。
- 当前仅验证 macOS 27.0 arm64。Windows x64、macOS Intel、签名/打包、完整键盘导航、长时间运行和 CI 云端执行未验证。
- 独立 Host、LocalTransport、Agent/模型、Task Contract、业务看板、数据库及工作流均未实现；没有伪造任务或执行结果。

### 下一项满足依赖的任务

P0-03「Host 入口与进程通信」依赖 P0-02。本轮只记录依赖关系，不开始实施。

## P0-01 · 仓库、工作区与版本锁定

状态：工程基线已实现并经本机检查；T001–T005 等待后续 Desktop/Host。日期：2026-09-23。

### 已实现

- 建立 pnpm workspace、根脚本、strict TypeScript 基线与 `@forge/contracts` 公开构建入口；根依赖使用 `workspace:*`。
- 公开 Schema 名称表与只读规格目录中的 JSON Schema 文件名同步，并用 Node 测试验证。
- 固定直接工具依赖、生成 `pnpm-lock.yaml`、`versions.lock.json` 与本机依赖许可证清单；`pnpm-workspace.yaml` 禁用依赖安装脚本。
- 配置 ESLint 与 CI，CI 依次执行冻结安装、lint、typecheck、test、build。两个参考包不会参与生产 lint/build，未来 `apps/`、`packages/`、`plugins/` 正式源码会被 lint。
- 根 AGENTS、README、gitignore 明确工程/新版视觉资料的优先级和未实现范围。

### 本轮命令与结果

| 命令 | 本机结果 |
| --- | --- |
| `pwd`、`rg --files`、`git status --short --branch`、`ls -la`、`find` | 仅两份未跟踪资料包；main 无提交、无应用代码、无根配置。 |
| `node --version`、`pnpm --version`、`corepack --version` | 22.22.0 / 12.3.4 / 0.34.7。 |
| `pnpm view`（四项直接工具依赖和 pnpm） | 精确版本、许可证、Node/peer 范围已记录。 |
| `pnpm install --lockfile-only` | 通过，生成锁文件。 |
| `pnpm install --frozen-lockfile` | 通过，2 个工作区项目、96 个依赖包进入本地 store/安装图。 |
| `pnpm lint`（首次） | 失败：测试缺少 Node URL 导入；已修正。 |
| `pnpm typecheck` | 通过。 |
| `pnpm lint`（修正后） | 通过。 |
| `pnpm test` | 通过：构建后 3 项测试通过，覆盖规格文件名、公开入口与精确版本、许可证清单。 |
| `pnpm config get ignoreScripts/engineStrict/saveExact` | 全部为 `true`。 |
| `pnpm licenses list --json` | 通过：生成已安装依赖的 96 项许可证清单。 |
| `pnpm build` | 通过，生成 `@forge/contracts` 的 JS 与声明文件。 |

初次尝试把 pnpm 配置写在 `.npmrc`；核对 pnpm 12 官方设置文档后已迁至 `pnpm-workspace.yaml`，并通过 `pnpm config get` 与再次冻结安装确认生效。最终五项检查均在该配置下重新通过。

### 验收与未验证

- T001 未授权 IPC、T002 第二实例、T003 Renderer 重载、T004 跨平台快捷键、T005 布局/DPI：均依赖 P0-02 及后续 Host/UI，**尚未执行**。本轮测试不能替代它们。
- 新目录按 README 的冻结安装方式已在当前 macOS arm64 目录验证；全新 checkout、CI 云端执行和 Windows/macOS Intel 未验证。
- Electron、Vue/Vite、SQLite/Drizzle、执行器 SDK、安装包、签名及用户凭据均未接入或验证。
- `forge_spec_v1.0/planning/tasks.json` 与参考测试报告保持原状；视觉原型只读查看，没有作为生产入口运行。

### 下一项满足依赖的任务

P0-02「桌面壳与共享 Web 入口」依赖 P0-01。后续需先按官方资料冻结 Electron/Vue/Vite 版本，再实现安全 Main/Preload 与共享 Vue 入口，并执行 T001–T005 的可行部分。本轮不自动进入 P0-02。
