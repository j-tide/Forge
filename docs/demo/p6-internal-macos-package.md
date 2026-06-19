# Forge internal macOS arm64 package · 2026-09-25

## 最新源码对齐的独立内部 QA 包 · 2026-09-27

- [desktop-board-spacing-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-board-spacing-20260927.dmg)：Forge 0.0.1、327642199 bytes、SHA-256 `802318f79f88bbd82edb36c4c5b551d1e1b4a3360200dc4bbfc0834a21932048`，**INTERNAL / ADHOC / UNNOTARIZED**。独立 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Board Spacing 20260927.app` 已普通 `open -n` 常驻；包内 Python Host 与专属空 SQLite schema36/`quick_check=ok`，原项目数据未覆盖。看板卡片顶部重复留白已修，[1440×900](../../output/playwright/desktop-board-spacing-20260927-board-top-1440x900.png)、[1600×1000](../../output/playwright/desktop-board-spacing-20260927-board-top-1600x1000.png)为真实安装版实图。现存 Planner Profile 的正式页面[只读状态](../../output/playwright/desktop-board-spacing-20260927-planner-profile-readonly-1440x900.png)与保存禁用由隔离 Host 数据驱动。标准/严格模板仍无 Planner Runtime；没有新模型 Turn，完整 Desktop/P6、Claude、Windows/Intel 与签名公证仍未通过，手机远程新增开发后置。

## 前一源码对齐的独立内部 QA 包 · 2026-09-27

- [desktop-planner-role-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-planner-role-20260927.dmg)：Forge 0.0.1、330519685 bytes、SHA-256 `32c21e4948ee459e4298dc861156d1fabef2857aeb916f7086a66be8765179c8`，**INTERNAL / ADHOC / UNNOTARIZED**。独立安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Planner Role 20260927.app` 已经普通 `open -n` 常驻；包内 Python Host 与独立空 SQLite schema36/`quick_check=ok` 可读，旧项目/运行数据不动。
- 标准模板在真实安装版呈现[只读 Planner](../../output/playwright/desktop-planner-role-20260927-standard-planner-role-1440x900.png)，缺少 Planner Runtime 时[预检拒绝发布](../../output/playwright/desktop-planner-role-20260927-standard-planner-unavailable-1440x900.png)。这修正看板列与角色混淆，不声称标准/严格模板已经能执行。当前本机已有 Codex 登录在 Finder 风格最小 PATH 下完成包外 CLI 发现及真实 app-server 能力握手；没有模型 Turn 或新在线 Task Run。
- 从新 `.app` 进入「设置」检查 Git/Codex CLI/登录/代理，再「项目」主动选择并信任 `/Users/iamzjt/Documents/Forge Desktop QA Finder Safe 20260927/Forge 测试项目 01`。手工或当前已授权模型整理草稿、单独审批 TODO、明确 Start、Review/Verify/人审的真实在线完整链只在下方注明的旧 DMG/独立测试库中有证据。当前新包仍有 Planner/计划门禁、可信凭据 broker、知识场景 Review/Owner、物理重启正向、安全跨 Host writer 对账等桌面缺口；外部 Claude、Windows/Intel、签名公证与正式更新未通过，P7/P8 新开发后置。

## 前一源码对齐独立内部 QA 包 · 2026-09-27

- [desktop-plugin-config-final-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-config-final-20260927.dmg)：Forge 0.0.1、324410337 bytes、SHA-256 `679d6697bfe93035a894dd2c884b1dd8c769ced56d9ee8c1ca18f764adda97bc`，**INTERNAL / ADHOC / UNNOTARIZED**。已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Plugin Config Final 20260927.app`；无环境覆盖 `open -n` 实测 Main/包内 Python Host 常驻，独立 QA SQLite schema36、`quick_check=ok`、零 Project。原 QA 与日常数据未覆盖。
- 正式插件页保存内置 Codex 1–60 秒启动握手超时；同一 DMG 的独立安装版真实保存 2 秒→显示待重启→关闭 owned Host→重新打开→Host 和页面读回已应用。截图：[待重启](../../output/playwright/desktop-plugin-config-final-20260927-plugin-config-pending-1440x900.png)、[已应用](../../output/playwright/desktop-plugin-config-final-20260927-plugin-config-applied-1440x900.png)。Python 真实归属协议子进程测了不同握手超时；没有为本次配置运行在线 Codex 模型，也没有实现插件凭据 broker/第三方安装。
- 同一 DMG 在另一隔离安装会话用 Finder 风格最小 PATH、当前用户 HOME 与合法登录验证包外依赖：`codex-cli 0.155.1` 被包内 Host 发现，保存 2 秒配置生效，真实 app-server 初始化与 `model/list` 返回 7 个模型；[设置页实图](../../output/playwright/desktop-plugin-config-finder-20260927-finder-cli-authenticated-1440x900.png)。没有发起模型 Turn，不是新任务端到端验收；全新用户、新机代理和正式发行仍待验。
- 演示：打开新 `.app` → 设置检查 Git/Codex CLI/登录和代理 → 到「项目」主动选择并信任 `/Users/iamzjt/Documents/Forge Desktop QA Finder Safe 20260927/Forge 测试项目 01` → 保存需求、手工或已授权模型整理草稿 → 人工审批只入 TODO → 明确 Start → 分别核对隔离 Diff、独立 Review、获批 Verify、逐项验收和 Owner 接受 → 重启读回。该新 QA 数据为空，未预填或伪造运行；真实在线完整 Workflow 与知识运行保留旧包/SHA 的原始证据。完整 Desktop/P6 发布门禁、Claude、Windows/Intel、签名公证、物理重启旧 Run 正向与知识场景 Review/Owner 仍待验；P7/P8 新增工作后置。

## 前一可从 Finder 打开的独立内部 QA 包 · 2026-09-27

- [desktop-finder-safe-final-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-finder-safe-final-20260927.dmg)：0.0.1、SHA-256 `0f6075d7bc62462b3849d1120cc975cedbefc5e08ea633b7057f2849d671d919`，**INTERNAL / ADHOC / UNNOTARIZED**。从该 DMG 单独安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Finder Safe Final 20260927.app`；已用 `open -n` 无环境覆盖常驻启动，包内 Python Host、沙箱 Renderer、独立 QA 数据库 schema36/`quick_check=ok`、0 Project/Run。内部 QA 包的唯一身份自动把默认数据置于 `~/Library/Application Support/Forge Internal QA/05d77bb86c01d376/Forge`，不再误入日常 Forge 数据。多包并行的旧 QA 数据和应用均保留。这证明本 Mac 上**当前内部包**的 LaunchServices 启动，不证明新机 Gatekeeper、Developer ID 或公证。
- 可丢弃、无 remote、Git clean 的演示项目：`/Users/iamzjt/Documents/Forge Desktop QA Finder Safe 20260927/Forge 测试项目 01`，`npm test` 通过。打开当前 `.app` → 设置核对 Git/Codex/合法登录/代理 →「项目」选择该目录、只读探测并主动 Trust → 首页保存需求 → 手工或已授权模型草稿 → 人工审批只入 TODO → 明确 Start → 查看真实隔离工作区、Diff 与 Context → 分别完成独立 Review、获批 Verify、逐项验收与 Owner 接受 → 退出再打开查看记录。此数据集为空、未预信任、无假任务；在线执行需已授权预算。[当前包项目页](../../output/playwright/desktop-finder-safe-final-20260927-projects-1440x900.png)、[插件页](../../output/playwright/desktop-finder-safe-final-20260927-plugins-1440x900.png)为真实安装版截图。前一节的真实在线成功与失败记录保留原构建/SHA，不冒充本包新在线验收。
- 当前仍缺：知识场景失败 Review 的单独复审/Owner 交付、非空插件配置的生产消费、物理重启后旧 Run 正向恢复、Claude、Windows/Intel、签名公证、完整 Desktop/P6 发布门禁。P7/P8 手机远程新增工作后置。

## 当前源码对齐的内部包与 Review 失败反馈 · 2026-09-27

- [desktop-review-diagnostic-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-review-diagnostic-20260927.dmg)：0.0.1、324457875 bytes、SHA-256 `b3d01ca3710b6ebd2316b258bc2450652ecf869fb06a267cb40c04420906d3a1`，**INTERNAL / ADHOC / UNNOTARIZED**。双击 `/Users/iamzjt/Documents/Forge Desktop QA Review Diagnostic 20260927/Open Forge Desktop QA.command`，从独立安装的 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Review Diagnostic 20260927.app` 打开；使用同目录独立空白数据和需主动选择、信任的 `sample-project`，不会触碰日常数据库。已实际观察 Main、沙箱 Renderer、包内 Python Host 常驻，schema36/`quick_check=ok`、零 Project/Run。多份相同 bundle ID 的 QA 包并行时 Finder/LaunchServices 打开仍待验证，以该 `.command` 作为当前实际可操作入口。
- 新包在独立测试数据中从旧知识 Run 的真实 SQLite 做 online backup，读取原有 Review `inconclusive`/无结构化结果，正式任务抽屉[如实显示任务未完成](../../output/playwright/desktop-review-diagnostic-20260927-inconclusive-1440x900.png)。旧记录没有可证明的细分原因，因此显示通用解释；**新审查作业**将缺失或无效结果的受限原因码保存在已有作业字段，重启后可解释。无新模型调用，未把旧 Review 改成 approved。需要用户明确重试只读 Review 并另行完成人工接受；知识场景仍 active。此包没有重新执行下节的成功在线 Workflow，那个成功记录只属于其原构建及 SHA。
- 录屏顺序：从 `.command` 打开 → 设置核对 Git、Codex CLI、登录与网络 → 在项目页选择同目录 `sample-project`、阅读只读探测并主动信任 → 保存消息、手工或获授权模型草稿、人工审批进入 TODO → 明确 Start → 查看真实 Diff、Review、获批 Verify、逐项人工接受与重启记录。空白 QA 数据无预填任务；在线模型需要现有合法登录与已授权预算。完整 Desktop/P6 Gate、该知识场景 Review/Owner 闭环、非空插件配置消费、物理重启安全恢复正向、Finder、Claude、Windows/Intel、签名公证及正式更新仍未验收；P7/P8 手机远程新增工作后置。

## 当前已安装的自定义工作流真实闭环 · 2026-09-27

- [desktop-workflow-binding-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-workflow-binding-20260927.dmg)：0.0.1、330992035 bytes、SHA-256 `c3e6fb58ad7dbd13f9d47243414d0d77d59d233b3ab651e91e1b1adbbf53fe84`，**INTERNAL / ADHOC / UNNOTARIZED**。双击 `/Users/iamzjt/Documents/Forge Desktop QA Workflow Binding 20260927/Open Forge Desktop QA.command`；它在 Terminal 中直接运行独立 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Workflow Binding 20260927.app`，保持独立空白数据与需主动选择、信任的 `sample-project`。该 launcher 已运行到包内 Python Host，schema36/`quick_check=ok`，0 Project/Run；`open -n --env` 在多份同标识 QA 包并行时只留下无 Host Main，Finder/LaunchServices 路径未通过，不以其代替本入口。
- 同一 DMG 的另一隔离安装 `output/qa/desktop-workflow-binding-full-20260927-run5/` 完成真实 Codex `gpt-6-luna` 自定义 quick 流程。正式任务抽屉锁定发布时 Developer Profile/模型，明确 Start 的 Run `85a88480-4371-4346-85b5-8ac7878edd8b` 修改 `arithmetic.js`/`arithmetic.test.js` 的独立 worktree，[快照与 Diff](../../output/playwright/workflow-binding-run5-20260927-delivery-1440x900.png)；批准的 Verify exit 0、[只读 Review approved](../../output/playwright/workflow-binding-run5-20260927-review-1440x900.png)、逐项人工[最终接受](../../output/playwright/workflow-binding-run5-20260927-accepted-1440x900.png)后 Task 才 Done。独立 Run `a2d7c242-27e4-47d4-9385-f16394a3b280` 取消后不算交付，重启仍能查看交付，源 Git clean。只读 QA evaluator 报 1 accepted/1 cancelled/0 failed，SQLite `quick_check=ok`。该 QA 是历史真实记录，**不在空白演示数据中预置假运行**。
- 同包前两次尝试中，50,000 和 100,000 Token 观测上限分别实际触发 `RUN_TOKEN_BUDGET_EXCEEDED`，Run 失败且无交付；第三次明确选择产品已有的 200,000 档才完成。观测用量可能延迟、包含 cached input，不能把该档说成精确费用上限。同包另一隔离安装的第 9 页知识场景把检索文档和已确认记忆真正带入在线 Codex Run，随后撤销在[任务 Context](../../output/playwright/workflow-context-run1-20260927-context-source-1440x900.png)显示 revoked；无命中/冲突拒绝启动、Verify 通过。但其独立 Review 报 `inconclusive`/无结构化结果，任务仍 active、验收脚本 exit 1，没有人工交付。P4-04 非空插件配置、该场景 Review/Owner 闭环、物理重启后的旧 Run 恢复正向、Finder 式打开、Claude、Windows/Intel、签名公证和正式更新尚未完成；完整 Desktop/P6 门禁保持未通过，P7/P8 后置。

## 前一源码对齐且可操作的内部 QA 包 · 2026-09-27

- [desktop-boot-recovery-20260927 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-boot-recovery-20260927.dmg)：0.0.1、329444493 bytes、SHA-256 `44a6c16b0af98cecbf931b5f1cc3d71fff0835e54c8fe15a4ba6ef28957e9052`，**INTERNAL / ADHOC / UNNOTARIZED**。`/Users/iamzjt/Documents/Forge Desktop QA Boot Recovery 20260927/Open Forge Desktop QA.command` 打开独立安装的 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Boot Recovery 20260927.app` 和独立空白数据；旁边的 `sample-project` 无 remote、Git clean，未自动信任。
- 包内 CPython 3.12.13、SQLite 3.50.4/schema36、Renderer sandbox、Host 生命周期通过安装 smoke。[空白首页](../../output/playwright/desktop-boot-recovery-20260927-home-1440x900.png)可开始录屏；安装版从旧真实 Codex 崩溃数据库的 online backup 读取 `interrupted`/`quarantined`，当前启动会话拒绝解除并保留数据，[任务抽屉实图](../../output/playwright/desktop-boot-recovery-20260927-1440x900.png)。物理重启后的正向解除尚未实测，不要把测试注入的另一个 boot ID 说成实机验证。
- 3～5 分钟无模型介绍：双击 launcher →「设置」核对外部 Git/Codex/登录 →「项目」选择 `sample-project` 并手动信任 → 首页保存需求并走手工草稿 → 单独人工审批进入 TODO（零 Run）→ 讲解明确 Start 和 Review/Verify/Owner 的独立门禁。要演示真实开发/交付，须有合法 Codex 登录、可用网络与已授权预算，真实操作结果按应用显示；此新包没有重新做在线全链。签名公证、Windows/Intel、Claude 与完整 Desktop/P6 验收仍待办，P7/P8 手机远程后置。

## 前一可操作内部 QA 包 · 2026-09-27

- [desktop-settings-first-20260926 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-settings-first-20260926.dmg)：0.0.1，329725663 bytes，SHA-256 `da8c6fadf7dad1ddc295a46db6664fa7de762543b93afef1d691378b34e64894`，**INTERNAL / ADHOC / UNNOTARIZED**。另装的 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Settings First 20260927.app` 可由 `/Users/iamzjt/Documents/Forge Desktop QA Settings First 20260927/Open Forge Desktop QA.command` 常驻打开；独立空数据、无 remote 的 `sample-project` 未被自动信任。不要直接双击 `.app` 使用日常数据目录。
- 安装版 Settings 优先显示本机能力；[顶部](../../output/playwright/desktop-settings-first-diagnostics-20260926-settings-top-1440x900.png)与[受限诊断](../../output/playwright/desktop-settings-first-diagnostics-20260926-1440x900.png)来自此包。诊断经原生 Save 导出逐字节一致，测试 token/路径未泄露；包内 CPython 3.12.13、SQLite 3.50.4/schema35、Renderer 沙箱与 owned Host 启停实测。此包没有新模型运行；下面不同 SHA 的 Codex 交付案例是历史证据，不会出现在此空白 QA 集中。
- 手工演示顺序：打开 Launcher → 左侧「项目」选择同目录 `sample-project` → 查看只读 Git/script 探测 → 主动 Trust → 首页保存需求 → 模型整理或手工草稿 → 编辑并逐项确认 → 单独审批进入 TODO → 明确 Start → 真 Codex 修改隔离 worktree → Review、获批命令 Verify、逐项验收、Owner 接受 → 重启查看交付。模型、Git、CLI/登录、网络需实际可用；任何未运行或失败步骤按真实状态展示，不把旧截图当当前实时结果。完整步骤与限制见[用户指南](../user-guide/internal-macos-arm64.md)。

## 当前源码包 · 2026-09-26 · 续用 Thread 的 Run 用量

- [内部 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-run-usage-20260926.dmg)，版本 0.0.1，SHA-256 `fd867901b7f3ee2e78842411c8477f77e5a4d87ce0e3b5a526ae1e9235a214bd`，**INTERNAL / ADHOC / UNNOTARIZED**。从该 DMG 单独安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Run Usage 20260926.app`，双击 `/Users/iamzjt/Documents/Forge Desktop QA Run Usage 20260926/Open Forge Desktop QA.command` 用独立空数据常驻运行；不要直接双击 `.app` 使用日常数据。
- 同目录 `sample-project` 为干净、无 remote 的可丢弃 Git 仓库。正常操作：在 UI 主动选择/信任项目→保存需求→模型或手工草稿→回答澄清且修订正式合同→人工批准 TODO→明确 Start→查看真实 Diff/Context→独立 Review/Verify→逐项验收→Owner 接受。批准不自动开发，Done 不自动合并、推送或部署。执行前在设置页检查外部 Git、Codex CLI 0.155.1、合法登录和需要的代理；空白 QA 数据不预填任务。
- 本包修正 Codex 续用 thread 时把前一 Run token 重算进本 Run 的问题。只读 DMG 安装 smoke、包内 Host/SQLite schema35/Renderer 安全及关闭确认通过；独立历史 SQLite 备份副本在同包读回旧真实交付和冻结预算，[当前包空白首页](../../output/playwright/desktop-run-usage-20260926-packaged-home-1440x900.png)、[历史 Run 读回](../../output/playwright/desktop-run-usage-20260926-frozen-run-1440x900.png)可复核。离线归一化测试通过；**本包没有新在线 Codex 超限或完整业务链重跑**，T119、精确费用硬限额、安全 Restore/签名更新、Windows/Intel/Claude 仍待验。旧包和用户数据均保留。

## 前一源码包 · 2026-09-26 · Run 观测预算

- [内部 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-observed-budget-final-20260926.dmg)，版本 0.0.1，SHA-256 `a03cdde3fefc4971c674d5de453dad0036cd43f26d3394d135751a9329518f49`，**INTERNAL / ADHOC / UNNOTARIZED**。单独安装到 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Observed Budget 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Observed Budget 20260926/Open Forge Desktop QA.command` 常驻打开新独立空数据。不要直接双击 `.app` 使用日常 Forge 数据目录。
- 同目录 `sample-project` 是干净、无 remote 的可丢弃 Git 仓库。先在 UI 选择并信任，再保存消息→生成模型或手工草稿→回答澄清并改正式合同→人工审批入 TODO→明确 Start→查看真实工作区/Diff/Context→独立 Review/Verify→逐项验收→Owner 接受；批准不自动开工，Done 不合并/推送/部署。真实 Codex 需要外部 Git、Codex CLI、合法登录及可用网络；当前空白 QA 数据没有预填任务或假日志。
- 最终 DMG 从只读镜像安装/启动通过包内 Host、SQLite schema35、安全 Renderer 和 ad-hoc 签名检查；[安装版空工作区](../../output/playwright/desktop-observed-budget-final-20260926-packaged-home-1440x900.png)。另一隔离备份数据通过同 DMG 读回旧真实交付及冻结 Run 预算：[Agents](../../output/playwright/desktop-observed-budget-final-20260926-agents-1440x900.png)、[Run 详情](../../output/playwright/desktop-observed-budget-final-20260926-frozen-run-1440x900.png)。这不是新包在线模型预算超限验收；观测事件可能延迟，T119 保持递延。详细命令与仍缺条件见[实施状态](../implementation-status.md)。

## 前一源码对齐且可操作的独立桌面安装（2026-09-26）

- DMG：[desktop-plugin-capability-20260926](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-capability-20260926.dmg)，0.0.1，SHA-256 `c7e72e4f7df8d8007deab956650a0ad2340f2dd4937409690e1db2ddfbb3a26c`，**INTERNAL / ADHOC / UNNOTARIZED**。
- 已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Plugin Capability 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Plugin Capability 20260926/Open Forge Desktop QA.command` 常驻打开独立空数据。同目录 `sample-project` 是 clean/无 remote 的可丢弃 Git fixture，须在 UI 中选择并信任。实测 Main PID 68040/包内 Host PID 68050、schema35/`quick_check=ok`、零 Project/Task/Run。
- 从同一只读 DMG 安装后的 smoke 验证安全 Renderer、包内 Host/SQLite；真实已批准 TODO 的隔离副本使用空 Codex 登录目录时，插件[已装配但不可启动](../../output/playwright/desktop-plugin-capability-20260926-plugin-unavailable-1440x900.png)，[任务入口](../../output/playwright/desktop-plugin-capability-20260926-not-logged-in-1440x900.png)禁用 Start、Run 为 0。另从旧在线交付的 SQLite backup 副本读回冻结 Run/Done/交付；没有新模型调用。完整操作顺序、外部 Git/Codex 前置和未验收项见下文。
- `pnpm demo:open` 仍打开旧版的保留历史录屏数据；当前源码包请使用本节的独立 `.command`。两套数据不会互相覆盖。

## 前一源码对齐且可操作的独立桌面安装（2026-09-26）

- DMG：[desktop-codex-diagnostics-20260926](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-codex-diagnostics-20260926.dmg)，0.0.1，SHA-256 `23ab7d8090c2cb0c8bd58935f65055b15fdc6d938afd0946cf7ceffbd06b1254`，**INTERNAL / ADHOC / UNNOTARIZED**。
- 已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Codex Diagnostics 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Codex Diagnostics 20260926/Open Forge Desktop QA.command` 常驻打开独立空数据。同目录 `sample-project` 是干净、无 remote 的可丢弃 Git fixture，须在 UI 中选择并信任。Main PID 39992/包内 Host PID 40002、SQLite schema35/`quick_check=ok`、零 Project/Task/Run 已实测，旧安装和 QA 历史未覆盖。
- 从只读 DMG 复制的 `pnpm smoke:package:mac` exit 0；外观重载保持和 Renderer 隔离仍有效。[安装版首页](../../output/playwright/desktop-codex-diagnostics-20260926-home-1440x900.png)、[设置](../../output/playwright/desktop-codex-diagnostics-20260926-settings-1440x900.png)。本包将 Codex CLI/登录/版本/能力证据不足分别提示，未通过时禁止启动 Run；空登录目录的真实 CLI 只读探测得到未认证。旧在线交付 QA 的 SQLite backup 副本在本包读回两个冻结 Run、Done 与交付，[Agents](../../output/playwright/desktop-codex-diagnostics-20260926-agents-1440x900.png)、[Run](../../output/playwright/desktop-codex-diagnostics-20260926-frozen-run-1440x900.png)来自正式 UI；**没有新在线模型调用**。操作仍按下文项目→草稿→审批 TODO→明确 Start→Review/Verify→逐项验收→Owner 接受；安全 Restore/签名升级、Windows/Intel、Claude 与发行 Gate 均未通过。
- 同一最终 DMG 的另一安装副本，在真实获批 TODO/零 Run 的 SQLite backup 副本上以空登录目录运行。[任务详情实图](../../output/playwright/desktop-codex-diagnostics-20260926-not-logged-in-1440x900.png)显示 `CODEX_NOT_AUTHENTICATED` 对应提示、禁用 Start，运行数仍为 0；验证脚本 exit 0、未调用模型。

## 前一源码对齐且可操作的独立桌面安装（2026-09-26）

- DMG：[desktop-appearance-20260926](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-appearance-20260926.dmg)，0.0.1，SHA-256 `406a8291001ecfc80c1c511e9cabf6a8f9f9bcccc3526d583e6d3950914f393d`，**INTERNAL / ADHOC / UNNOTARIZED**。
- 已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Appearance 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Appearance 20260926/Open Forge Desktop QA.command` 常驻打开独立空数据。首次在「项目」选择同目录 `sample-project` 并主动确认信任；它是 clean、无 remote 的 Git fixture。此安装实际 Main PID 28915、包内 Host PID 28926、SQLite schema35/`quick_check=ok`、零 Project/Task/Run，旧安装与 QA 历史未覆盖。
- `pnpm smoke:package:mac` 从只读 DMG 复制并启动安装版，通过包内 Host/安全属性与外观三项设置重载保持；[实际空白首页](../../output/playwright/desktop-appearance-20260926-home-1440x900.png)、[保存后设置](../../output/playwright/desktop-appearance-20260926-persisted-settings-1440x900.png)已核对。项目→需求→草稿→审批 TODO→明确 Start→Review/Verify→逐项验收→Owner 接受的操作仍按下文指南，但**新包未重新做在线模型全链**，前一包的真实记录保留原 SHA。外部 Git/Codex CLI/已授权登录仍为前置；应用内安全 Restore/签名升级、Windows/Intel、Claude 和正式发行 Gate 均未通过。

## 前一源码对齐且可操作的独立桌面安装（2026-09-26）

- DMG：[desktop-profile-context-20260926](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-profile-context-20260926.dmg)，0.0.1，SHA-256 `5700b1f6d681ba3943bf5070543d6b5eefc864432ae8c997b12aadc4be838487`，**INTERNAL / ADHOC / UNNOTARIZED**。
- 已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Profile Context 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Profile Context 20260926/Open Forge Desktop QA.command` 使用新建独立空数据常驻启动。首次在「项目」选择同目录 `sample-project` 并主动确认信任；它是 clean/无 remote Git fixture。实测 Main PID 76060、包内 Python Host PID 76070、SQLite schema35/`quick_check=ok`、零 Project/Task/Run，旧安装和 QA 历史未覆盖。
- 此包包含正式 Agents 页面编辑 Developer `maxSeconds` 与项目知识检索许可、Host 启动前权限门禁、Run Context 页冻结预算读回。同一 DMG 的另一个临时安装用前一包真实在线交付的保留 QA 库只读复核：两个 Run 均冻结 420 秒，Board Done、交付存在，正式 UI [Agents 配置](../../output/playwright/desktop-profile-context-20260926-agents-1440x900.png)与[冻结 420 秒](../../output/playwright/desktop-profile-context-20260926-frozen-run-1440x900.png)。这次没有新的模型调用；下节的在线 Review blocker→返工→复审→Verify→Owner 证据属于前一构建。
- 操作仍按下文项目→消息/草稿→审批 TODO→明确 Start→Review/Verify→逐项验收→Owner 接受；外部 Git/Codex CLI/合法登录是执行前置。此包不代表应用内安全 Restore、签名升级、Windows/Intel、Claude 或正式发行 Gate 已通过。

## 前一源码对齐且可操作的独立桌面安装（2026-09-26）

- DMG：[desktop-profile-budget-20260926](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-profile-budget-20260926.dmg)，0.0.1，SHA-256 `4b51d673c3ec64d4fbf7a0dc8004927c1946d26d4fe1d0c9226abe441e84bd17`，**INTERNAL / ADHOC / UNNOTARIZED**。
- 已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Profile Budget 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Profile Budget 20260926/Open Forge Desktop QA.command` 用独立空数据常驻启动。首次在「项目」选择同目录 `sample-project` 并明确确认信任；此 Git fixture 干净且无远端。不要直接双击 `.app` 而落到日常数据目录。
- 相同 DMG 的另一独立 QA 安装在真实 Codex fixture 上走完 Review 阻断→Host 自动返工→原 Reviewer Profile v1 复审通过→获批 `node test.js` Verify→逐项 AC→Owner 接受→重启交付，源 Git 未改动；[复审截图](../../output/playwright/desktop-review-rework-resumed-20260926-1440x900.png)、[最终交付截图](../../output/playwright/desktop-review-rework-accepted-20260926-1440x900.png)。这些历史 QA 不预填到供手工操作的空白数据。Run/报告/交付 ID 和首次 180 秒预算超时的保留失败见[实施状态](../implementation-status.md)。
- 操作仍按本页下方项目→消息/草稿→审批 TODO→明确 Start→Review/Verify→逐项验收→Owner 接受脚本执行。Git/Codex CLI 与合法登录是外部前置；设置页可查看本次环境的真实检测结果。此内部包不代表应用内 Restore、签名更新、Windows/Intel、Claude 或正式发行 Gate 已通过。

## 前一 Desktop QA 安装 · 2026-09-26

- 内部 DMG：[desktop-rework-recovery-20260926](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-recovery-20260926.dmg)，0.0.1，SHA-256 `e868ebce8a4a5d13ba7f1cb65fef580dbabd7298251c24e8720deceaa6ee0f6a`；仅 **INTERNAL / ADHOC / UNNOTARIZED**。
- 已从该 DMG 另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Recovery 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Recovery 20260926/Open Forge Desktop QA.command`。它用独立 `isolated-app-data`、初始空 schema35 库和无 remote 的干净 Git `sample-project`，不修改现有 Demo/旧 QA 数据。实际 Main/包内 Host 常驻，SQLite `quick_check=ok`，初始 0 Project/Task/Run。
- 新修复：自动返工后 Review/Verify 启动失败并产生 `blocked` 时，仅同 Run/快照/同类闸门的后续有效成功报告能解除当前阻断，原故障保留；次数上限、Review/AC/Owner 门禁不变。真实 Git/SQLite/子进程 Verify 故障后手工复验与错类报告拒绝测试通过；全量 Python 212 项、Web/构建/安全 smoke 和安装包 smoke 通过。[实际安装版空白首页](../../output/playwright/desktop-rework-recovery-20260926-home-1440x900.png)已核对。
- **验收边界**：此新包没有执行在线 Codex Review blocker 自动返工或全任务交付；下一节较早包的真实模型澄清、正常交付/取消和 Verify 失败返工各保留原构建身份。外部 Git/Codex 登录、Claude、Windows/Intel、签名/公证/正式升级条件仍如用户指南所述；P7/P8 新增开发已后置。

## 前一可操作的桌面内部 QA（2026-09-26）

- 最新安装包：[desktop-rework-reason-20260926 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-reason-20260926.dmg)，0.0.1，SHA-256 `f1692e492a38ada73d826eed60ea4cee634f006b0a823a74110d576a853f50a5`；**INTERNAL / ADHOC / UNNOTARIZED**。
- 已安装应用：`/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Rework 20260926.app`。双击 `/Users/iamzjt/Documents/Forge Desktop QA Rework 20260926/Open Forge Desktop QA.command`，使用同目录独立 `isolated-app-data`；实际常驻包内 Python Host、SQLite schema35/`quick_check=ok`，初始 0 Project/0 Task/0 Run。旧 QA 应用和数据未替换。
- 演示仓库：选择同目录的 `sample-project`。它从既有干净演示仓库克隆，含 `math.js`、`test.js`、`docs/add-contract.md`，无 remote，`node test.js` 通过；先在「项目」页只读探测并人工信任。可以提出「只接受有限 JavaScript 数字，其他输入抛出 TypeError，并补测试」；保存消息→模型或手工草稿→人工审阅/审批→TODO→明确 Start。若启用 Verify，先在项目环境配置并独立批准 `node test.js`，再按实际 Review、逐项 AC 与 Owner 结果继续。项目未预填任何 Task，旧 Run 只作历史证据。
- 新包修正返工诊断：`REWORK_LIMIT_REACHED` 才显示“已达上限”，后续 Review/Verify 闸门失败显示“已阻断”及真实错误码。6 个真实 Host/SQLite/子进程返工测试、3 个 Web 组件测试、全量质量链及安装版 Host smoke 通过；[实际空白首页](../../output/playwright/desktop-rework-reason-20260926-home-1440x900.png)。这不是本包 Review blocker 在线自动返工或全业务链验收。手机/远程仍后置，正式签名、公证、Windows/Intel、Claude 与安装升级未通过。
- 同包另一隔离 QA：现有合法 Codex 整理器从真实保存的消息提出「空格邮箱」与「测试框架/位置」两项澄清；安装版先拒绝只回答、不改合同，再逐项回答并把两项都写入正式目标与必需验收，独立人工审批只进入 TODO，关闭重启仍是 1 Draft v2/1 TODO/0 Run，SQLite `quick_check=ok`、源 Git clean。[真实模型草稿](../../output/playwright/desktop-rework-refiner-20260926-generated-draft-1440x900.png)、[修订来源](../../output/playwright/desktop-rework-refiner-20260926-revision-1440x900.png)、[重启 TODO](../../output/playwright/desktop-rework-refiner-20260926-todo-restored-1440x900.png)。这不是供用户操作的空白数据，也没有执行 Coding Run。

## 前一桌面内部 QA（2026-09-26）

- 安装包：[desktop-clarification-guard-20260926 DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-clarification-guard-20260926.dmg)，0.0.1，SHA-256 `3ac7dce68decfd2681a7c58ba048c6d894c83a7a4680fd4560f2ece784`；**INTERNAL / ADHOC / UNNOTARIZED**，不是签名公证发行版。
- 已安装：`/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Clarification 20260926.app`。双击 `/Users/iamzjt/Documents/Forge Desktop QA Clarification 20260926/Open Forge Desktop QA.command`；此启动器只用新目录 `isolated-app-data`，与下面旧 Demo 和本机日常数据隔离。已验证应用常驻、包内 Python Host、SQLite schema35/`quick_check=ok`，初始 0 Project；供完整操作的可丢弃 Git 项目为同目录 `sample-project`，**尚未信任或预填任务**。它从已有的干净演示仓库克隆，未在 Forge 仓库自动提交；已移除克隆仓库的 `origin`，`node test.js` 通过，Git 工作树干净。现有 `project` 空白 fixture 仍保留。
- 操作：在「项目」选择上述 `sample-project`→查看只读 Probe→主动 Trust→首页保存需求→主动生成模型草稿（须已有合法 Codex CLI/登录与可用网络）或使用手工草稿→回答待澄清问题，并把答案写入目标/验收等正式合同字段→保存 revision→单独请求和确认审批→看板 TODO（不会自动 Start）。要开发，再明确 Start；必须按实际 Review/Verify/逐项验收和人工接受状态推进，Done 不自动合并/推送/部署。
- 同一新 DMG 的另一隔离测试项目已实际完成手工待澄清 v2 → 只答问题时[拒绝保存](../../output/playwright/desktop-clarification-guard-20260926-contract-guard-1440x900.png) → 编辑目标与必需验收 v3 → 人工批准 TODO → [重启保留](../../output/playwright/desktop-clarification-guard-20260926-todo-restored-1440x900.png)，SQLite 1 TODO/0 Run、源 Git clean，**没有调用模型**。先前 plugin-gate 包有真实 Codex 整理和任务闭环证据，但其中一条澄清答案未进入合同；旧批准数据未改写，不能把旧包与新包拼成同一在线全链验收。
- 外部前置：系统 Git、用户自行安装的 Codex CLI、合法登录及需要时的网络代理；包内 Python 不依赖开发仓库 `.venv`。在 Settings 查看本次启动环境的真实依赖状态；不要在录屏中展示凭据。Claude、Windows/Intel、Developer ID/公证、签名升级/恢复和新版包的完整新在线模型链未验收。正常 Desktop 不开启远程监听，手机/远程新增开发后置。

以下旧包路径、截图和 Run ID 是按生成时间保留的历史证据；不代表当前新安装的空白数据已有那些任务。

## 2026-09-26 最新 Desktop QA 安装与常驻入口

当前源码对应的内部包是 [`desktop-plugin-gate-20260926` DMG](../../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-gate-20260926.dmg)，版本 `0.0.1`，SHA-256 `028e33ee66f798b8f6323a2ea44c4cdd2250bb07a300b40e4d64b69fb7d961fe`。已从此 DMG 另外安装到 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA 20260926.app`，保留下面的旧 `Current.app` 及其历史数据。双击 `/Users/iamzjt/Documents/Forge Desktop QA 20260926/Open Forge Desktop QA.command` 启动**常驻**应用；启动器验证 ad-hoc 签名、拒绝与另一 Forge 应用并行，并只将这份应用指向 `/Users/iamzjt/Documents/Forge Desktop QA 20260926/isolated-app-data`。不要直接双击 `.app` 来使用隔离演示数据。已实际调用启动器：应用 PID 75349、包内 Python Host 子进程及 sandboxed Renderer 存在；全新独立 SQLite 的 `quick_check=ok`、schema35、0 Project/0 Task。此目录和应用供后续人工操作，**不会在测试结束清理**。

可丢弃项目是 `/Users/iamzjt/Documents/Forge Desktop QA 20260926/project`，从原本 clean 的 Demo Git fixture 复制，复制前后 HEAD 相同且副本工作树 clean；Forge 还没有自动导入或信任它。首次打开后按本页下方步骤，选择这个目录，查看 Probe，再明确 Trust；保存消息/草稿、批准入 TODO 和 Start 都需要分别操作。当前包的插件阻断、多项目切换、备份读回及旧真实 Run 历史可见性已有安装版证据，**这份全新 QA 数据尚无在线 Codex Task 或交付**，不要把下方旧 Demo 的历史 Run 说成它的当前记录。同一 DMG 的**另一独立安装/数据**现已真实完成新 Codex 任务、Review/Verify/Owner Done、独立取消和重启交付，详情见[实施状态](../implementation-status.md)，没有写入这份留给用户的空白数据。系统 Git 与外部 Codex CLI 0.155.1/合法登录是实际执行前置；在设置页确认本次启动环境的依赖状态。包仍为 `INTERNAL / ADHOC / UNNOTARIZED`，完整桌面验收与公开发布门禁尚未通过。

## 当前可录屏 Demo（同日更新的独立内部构建）

再次运行 `.command` 已实测识别现存同一安装版进程并退出，不会为同一演示数据库再启动第二实例。**录屏时请从此 `.command` 或 `pnpm demo:open` 启动；直接双击 `.app` 不会自动注入独立演示数据目录，可能打开日常 Forge 数据。**

推荐打开 `/Users/iamzjt/Applications/Forge INTERNAL Current.app`。双击 `/Users/iamzjt/Documents/Forge Demo Current/Open Forge Demo Current.command`，或在本仓库运行 `pnpm demo:open`。`.command` 核验已安装包的 ad-hoc 签名，用本机 `/usr/bin/python3` 只启动应用并退出；应用与包内 Python Host 会继续常驻，不像 smoke 自动关闭。当前真实持久 Demo 数据为 `/Users/iamzjt/Documents/Forge Demo Current/recorded-acceptance/isolated-app-data`，项目为 `/Users/iamzjt/Documents/Forge Demo Current/recorded-acceptance/Forge fixture 空格`；请不要清理。原先 `/Users/iamzjt/Documents/Forge Demo/` 的项目与数据仍保留，互不覆盖。

- 新 DMG：`/Users/iamzjt/Desktop/my/myapp/Forge/build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-demo-20260925.dmg`；SHA-256 `91595c5cbf5278ecc68227a3eb5a92ded84d26408b227d28371832e6de283eb6`；版本仍为 `0.0.1 INTERNAL / ADHOC / UNNOTARIZED`。原已验收 DMG 及 SHA-256 均未覆盖。
- 当前构建包含本机 Plugins 停用/启用入口。安装版三次 Electron 启动实际验证停用持久、启用须重启，见 [停用截图](../../output/playwright/p7-current-plugin-control-disabled-1440x900.png)。普通 Desktop 启动**没有远端 HTTP 监听**；P7/P8 手机能力尚未通过。
- 新 DMG 在包内 CPython 3.12、SQLite schema32、独立安装路径下通过 Host 启动及退出后再次 `codesign --verify --deep --strict`。构建脚本现在先重建源码，并让 packaged Host 禁止在签名包里生成新 `.pyc`；旧安装包运行后确实曾因五个新 `.pyc` 使签名复核失败，旧 app/数据未被本次修复覆盖。当前推荐使用新装的 `Current.app`。
- 对新 DMG 运行了独立真实 Codex 闭环并保留了 fixture/SQLite：1 个受信任项目、2 张真实任务、2 个 Run、1 条交付记录。开发 Run `e0234f52-b5bb-4838-acf6-e49bcb8c08b2` 在隔离工作区修改 `math.js`/`test.js`，Verify `7db35298-2c3b-4413-809b-84c85950702e` 返回 exit 0，Review `503ee8b4-2195-416d-849c-bf018e573790` approved，人工接受决定 `053b4a4e-0067-4965-bc5d-364721d29bca` 令任务 `34dfe0a4-111d-4b1a-8f3b-4bb1739dab1a` 为 Done，交付 `88a28094-d529-4f3e-bb52-8af337688fc2` 存在，**未自动合并/推送/部署**。另一 Run `9e81d1e0-dab1-4038-8446-9b617f8fdfa5` 真实取消，重开后仍非 Done。演示源仓库 `git status --porcelain` 为空。当前持久应用读取的是这份记录；这些是**历史案例**，不伪装成正在运行。
- 新包真实截图：[Home](../../output/playwright/p7-current-packaged-home-1440x900.png)、[Diff/交付](../../output/playwright/p7-current-packaged-delivery-1440x900.png)、[验收矩阵](../../output/playwright/p7-current-packaged-matrix-1440x900.png)、[Review](../../output/playwright/p7-current-packaged-review-1440x900.png)、[Done](../../output/playwright/p7-current-packaged-accepted-1440x900.png)。截图来自实际安装版 Electron；不会用参考设计图替代。
- 新安装版的 Workflow 页面从 Host 加载 3 个模板；隔离数据库副本中经实际 Agents UI 保存 Developer/Reviewer Profile，再从 quick 模板新建，编辑节点与绑定、预检、保存并发布 v1，Host 回读已发布节点值相同。见[画布截图](../../output/playwright/p7-current-packaged-workflow-editor-1440x900.png)与[发布截图](../../output/playwright/p7-current-packaged-workflow-published-1440x900.png)。这还不是“当前安装版新 Run 已引用新发布版本”的证据。Knowledge 的安装版独立 QA 路径使用旧 Demo 仓库已有 `docs/add-contract.md`：系统选目录并人工信任后，UI 只读导入、检索 `finite` 命中 1 个带行号/哈希的片段；从该来源提议/确认记忆后检索为 1 条，撤销后为 0，项目 Git 工作树不变。见[检索截图](../../output/playwright/p7-current-packaged-knowledge-search-1440x900.png)与[确认截图](../../output/playwright/p7-current-packaged-memory-confirmed-1440x900.png)。此 QA 数据与当前持久 Task 案例分开；不能把它描述为该历史 Run 已引用的知识。
- 对同一 DMG 的另一个独立 Git fixture 运行了**新的已发布 quick Workflow**：真实 Codex 完成 Run `f1f01724-c01d-42e7-8edd-6fea51cfe679`，修改隔离工作区的 `math.js`/`test.js`，产生快照 `6394ffad-9dff-47c8-b2a4-d5a7bce8fc18`，源 Git clean。运行中的 SQLite 冻结配置断言 workflow `workflow.fixture.quick@1`、Developer/Reviewer Profile ID，Host `run.config` 的内容哈希和实际节点 `develop` 一致；[任务抽屉截图](../../output/playwright/p7-workflow-packaged-delivery-1440x900.png)。此脚本整体 **exit 1**：末尾重启断言错误地要求一个只完成开发、尚未 Review/Verify/人工验收的 Task 已 Done；实际仍为 Active 符合产品语义。测试断言已按状态修正，但遵守“不重复消耗同一模型场景”未再次在线运行，因此这次自定义流程的重启恢复仍待验证；先前默认完整闭环的重启证据不受影响。
- 前置条件仍是 macOS arm64、系统 Git、外部 Codex CLI 0.155.1、已有合法 ChatGPT 登录，以及当前网络需要的代理。包内只包含 Python Host，不包含 Git/Codex。终端运行 `codex --version` 和 `codex login status` 可检查 CLI/登录；不要在聊天或录屏中展示凭据。Finder 直接双击 `.app` 时的 PATH/代理发现不保证；优先使用上述 `.command`。Claude 继续不可选。

**录屏顺序：**打开当前 Demo → 顶部确认 Host connected → 项目切换器选历史 fixture → 看板打开已接受 Task，并说明这是历史真实 Run → 展示隔离 Diff、快照、Verify、Review、逐项验收和 Done 但未合并 → 到 Plugins 看真实装配状态 → 到 Workflow/Knowledge 查看当前真实页面。要录制一张全新任务，从现有 fixture 再保存消息和手工草稿、人工批准，确认 TODO 无自动运行，然后明确 Start。复用同一项目时，请用新任务目标，避免让 Codex 重复修改已验证文件。独立取消演示另建一张任务。实际模型时间可能超过 5 分钟；不要把历史记录当直播。

## 原始已验收内部包（保留历史证据，当前优先使用上方新 Demo）

已从本页原始 SHA-256 的 DMG 安装至 `/Users/iamzjt/Applications/Forge INTERNAL.app`，原独立项目和数据均保留。原启动器在旧应用运行后遭遇包内新增 `.pyc` 导致的签名复核失败；请使用上方已修正并重新验证的 Current Demo。原包当时验证的 PID 2958、包内 Python Host PID 2977 和独立 SQLite 创建仍是历史证据，不代表当前新包状态。

- 演示项目：`/Users/iamzjt/Documents/Forge Demo/project`。这是独立、可丢弃的 Git 仓库，初始 `main` 工作树 clean，包含 `math.js`、`test.js`、`docs/add-contract.md` 与 `pnpm` 无关的 `node test.js`；不使用真实用户仓库。仅此合成 fixture 有自己的初始 Git 提交，Forge 仓库未提交。
- 演示数据：`/Users/iamzjt/Documents/Forge Demo/app-data/Forge/production/forge.sqlite`。它与 Forge 日常数据目录不同；**不要删除此目录**，项目、任务、Run 和交付记录会留给下一次录屏。首次准备时数据库为空，既有一次性 QA Run 只在下面的历史验收证据中，不冒充本 Demo 正在执行的 Run。
- 演示版前置：macOS arm64、系统 Git、外部 Codex CLI 0.155.1、用户已有合法 ChatGPT 登录，以及当前环境实际需要的授权网络/代理。`codex login status` 在本机显示 `Logged in using ChatGPT`，未读取或记录凭据内容。通过 `pnpm demo:open`/`.command` 的终端环境传递 PATH；单纯在 Finder 双击 `.app` 的 Codex CLI/代理发现尚未验收。Claude 仍不可选。
- 当前版本仍为 `0.0.1 INTERNAL / ADHOC / UNNOTARIZED`；不要对外分发、绕过 Gatekeeper、把它称为已签名公证的正式版。DMG 摘要与包内 Host 证据见下文。

**人工录屏脚本（在持续打开的 Demo 应用里操作）：**

1. 确认顶部真实 `Host connected`。进入「项目」→「选择文件夹」，选择上述演示 Git 仓库；查看 Git 分支、工作树与检测到的 `test` script，再明确点击「信任项目」。探测本身不运行仓库脚本。
2. 回到首页，输入“给 `add(a,b)` 增加有限数字输入校验，非法输入抛出 `TypeError`，补充测试”。保存消息，生成/编辑草稿；核对范围与验收项，人工批准。切看板说明任务**只在 TODO**，这一步尚无 Run。
3. 在任务抽屉明确选择当前可用 Codex/模型，点击 Start；观察真实活动与所选隔离工作区。等待 Run 完成，再打开 Diff、CodeSnapshot 与 Handoff。源项目的 `git status` 应保持 clean；变化应在 Forge Worktree 内。模型耗时不保证 3～5 分钟。
4. 若项目已配置并人工批准 `node test.js` Command Preset，运行 Verify 并查看真实退出码；Review 读取固定快照。按实际报告处理返工，逐项关联验收依据，再单独执行 Owner 最终接受。请勿把未运行的 Verify 或 Review 说成通过。
5. 展示 Done 与交付记录，同时指出“尚未自动合并/推送/部署”。正常退出后再用上述入口重开，检查任务与交付仍可查看。**不要为了重录屏重建或清理演示数据。** 独立取消演示应另建一张任务，等待确实启动后取消并核对没有继续写入。
6. 若录制知识与记忆，再进入「知识」：只读导入项目内 `docs/add-contract.md`，检索 `finite`，打开片段定位；可从该来源提议记忆，人工确认后检索，再撤销。检查新 Run 的 Stage Context 是否确实包含该来源；如果没有，按“未引用”展示，不从搜索结果推断它已进入 Run。

本节说明是可操作的人工路径；下文带 Run ID 的真实结果来自**先前一次性隔离验收**，不会预填入当前持久 Demo 数据库。若 Codex、网络或模型不可用，保留当前项目与草稿，并如实展示不可用诊断，不用历史结果代替直播。

## Artifact and scope

- App: `build/macos/Forge-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.app`
- DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`
- DMG SHA-256: `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`
- Version: `0.0.1`; platform actually tested: macOS arm64.
- Distribution status: **INTERNAL / ADHOC / UNNOTARIZED**. No Developer ID, Apple notarization, public release or signed upgrade claim.

The checked DMG was mounted read-only, its app copied to a separate QA installation directory containing a space, ad-hoc signature verified, and **that copied executable** launched. Electron reported `isPackaged=true`. The Host PID's command line pointed inside `Forge INTERNAL.app/Contents/Resources/forge-python/runtime/bin/python3.12`, not the repository `.venv`. The package contained the Python Host wheel, its production Python dependencies, plugin lock, Web build and `app.asar`. The Host reported SQLite schema 30. `FORGE_INTERNAL_TEST_HOME` works only because this internal artifact has the test marker; it redirected Forge app data to an isolated disposable directory. The source project was a separate disposable Git fixture, never this repository.

The package is **not fully self-contained for coding**. Git comes from the operating system. Codex CLI 0.155.1 and an authorized ChatGPT login were external. The live acceptance launched the installed app with the current user's PATH and login location; it did not use the development Python Host. A separate clean-PATH package smoke found Codex `available=false` while the Host/UI stayed healthy. A Finder launch with a minimal PATH may therefore require Codex to be installed on a GUI-visible PATH; this has **not** been accepted as a fresh-user setup. No Anthropic API or Claude call was used. Host forwarding excludes arbitrary secrets and credential-bearing proxy URLs; the live Codex path used the existing authorized environment, while Finder proxy availability is unverified.

## Actual installed-app acceptance

Command: `FORGE_VERTICAL_PACKAGED=1 FORGE_VERTICAL_FINAL_ONLY=1 FORGE_VERTICAL_TERMINATION=cancel FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` (exit 0). The harness installs from the DMG on each run and removes only its own QA app/data/fixture after evidence capture. It never starts `pnpm dev:desktop` or the development Host.

1. Native folder selection returned a disposable Git project. Host probe found Git; explicit trust saved a real Project.
2. A message was stored, a manual Task Draft was revised, and a separate human approval created TODO. Board inspection before Start found no Run.
3. Explicit `run.start` invoked real Codex through the packaged Python Host. It changed only `math.js` and `test.js` in a Forge worktree. A real `node test.js` succeeded there; source Git HEAD/status and source files stayed unchanged. The saved CodeSnapshot, Diff and Handoff were read back.
4. The approved command preset produced a real Verify report (`passed`, exit 0). A separate read-only Codex Review returned `approved`. Each acceptance criterion was explicitly linked to current-snapshot evidence before local Owner final acceptance. The Board showed Done, and the delivery record existed without merge, push or deployment. Source Git HEAD stayed at its original commit.
5. A second Run entered a long `hold.js` command. Explicit cancellation returned `cancelled`; its owned app-server exited, no Handoff was created, and `math.js` did not change during the post-cancel observation window. The workspace was not reported cleaned merely from the UI state.
6. After quitting and relaunching the same installed app against the isolated data directory, the Done Task and delivery record remained; the cancelled Task was not Done. The owned Host exited on final quit. No app or test fixture remained after cleanup.

Evidence IDs: development Run `c893f0b3-b2e1-42a1-b16c-ab7b9b54fe0c`; CodeSnapshot `0b770a5e-56c0-40a3-ab79-d5eda8b0532e`; Verify `a60c6601-a8de-41f9-ba8a-428d4cae7caa`; Review `372cfd82-94a3-4f50-9821-1942c4ec1af5`; cancelled Run `0125505d-df90-44f2-8462-366f4339be60`; Project `65196f38-d923-4a71-bf66-c297bbc68485`; delivery `642321d2-4f38-4db6-921f-0703dd41dd5b`. These are disposable QA records, not user production data.

Real installed-app screenshots: [Home](../../output/playwright/p6-06-packaged-home-1440x900.png), [CodeSnapshot and delivery](../../output/playwright/p6-06-packaged-delivery-1440x900.png), [acceptance matrix](../../output/playwright/p6-06-packaged-matrix-1440x900.png), [Review](../../output/playwright/p6-06-packaged-review-1440x900.png), [Done and unmerged delivery](../../output/playwright/p6-06-packaged-accepted-1440x900.png). These files are generated QA artifacts excluded from Git; the script can regenerate them with an authorized Codex login.

## Internal use and 3–5 minute walkthrough

For a controlled internal arm64 QA machine, verify the DMG SHA-256, mount it, copy `Forge INTERNAL.app` to an isolated QA application location, and run the copied app. Do not disable Gatekeeper globally or remove quarantine/system protections to force a public install. The ad-hoc build may be blocked on an unconfigured machine; that is an unresolved public distribution gate. A disposable project and separate Forge data directory are recommended for QA. The shipped UI can select a local folder; local Git and an external Codex CLI/login are prerequisites for a coding demonstration.

The short walkthrough: (1) choose and trust the disposable Git project; (2) save a message, create/revise a manual Draft, approve it and point out that it is only TODO; (3) explicitly Start and inspect live observations, isolated Diff and CodeSnapshot; (4) show Verify and Review reports, link acceptance evidence and make the separate Owner decision; (5) show Done plus the still-unmerged delivery, quit/reopen and show the persisted record. Runtime length depends on the live model and can exceed five minutes. A second independent cancellation fixture can be run separately.

## Limits and deferred acceptance

T111 has only internal mount/copy/start/remove and retained-data evidence; a fresh physical Mac user with Gatekeeper and a Developer ID/notarized installer is untested. T112 signed upgrade/interruption/rollback and T113 legitimate credential continuity remain `DEFERRED_VERIFICATION`. macOS Intel/x64, Windows x64, real system DPI, installer/UAC, public code signing, notarization and Codex launched from Finder are unverified. P6-06 stays **BLOCKED**; the user authorized only a precise P6-06→P6-07 development scheduling exception. P4 Claude online acceptance and the full multi-Executor release gate are independently blocked.
