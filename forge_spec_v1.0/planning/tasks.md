# Forge 分阶段工程任务

每项都是待实施规格，不是已完成代码。依赖是保守串行顺序，只有在同一阶段不共享写资源且测试独立时，负责人可调整并记录。



## P0 · 工程基线与可行性闸门

可启动的双平台桌面骨架；通过 SDK、SQLite ABI、取消进程树等技术风险验证。



### P0-01 仓库、工作区与版本锁定

模块：M01；依赖：无；版本：desktop-v1.0

文件范围：apps/*；packages/contracts；pnpm-workspace.yaml

实现：建立pnpm工作区、TS严格模式、lint/typecheck/test脚本；填写版本与许可证矩阵，不使用浮动latest。

交付：仓库、工作区与版本锁定的实现、对应自动化测试、运行证据及说明

验收：全新目录可按README安装；lockfile受CI约束；版本均有探测证据。

测试：T001, T002, T003, T004, T005



### P0-02 桌面壳与共享Web入口

模块：M01；依赖：P0-01；版本：desktop-v1.0

文件范围：apps/desktop；apps/web；packages/client

实现：实现Electron安全壳和Vue入口；客户端通过LocalTransport连接Host，不在renderer导入Node。

交付：桌面壳与共享Web入口的实现、对应自动化测试、运行证据及说明

验收：Windows/Mac启动显示Host健康；恶意IPC被拒绝。

测试：T001, T002, T003, T004, T005



### P0-03 Host与CommandBus最小实现

模块：M19；依赖：P0-02；版本：desktop-v1.0

文件范围：apps/host；packages/core/commands

实现：实现typed command、query、event与身份注入；先用ping和项目读取证明无UI可运行。

交付：Host与CommandBus最小实现的实现、对应自动化测试、运行证据及说明

验收：同一命令处理器可从CLI测试与Desktop调用，无重复业务代码。

测试：T091, T092, T093, T094, T095



### P0-04 数据库与原生模块风险测试

模块：M18；依赖：P0-03；版本：desktop-v1.0

文件范围：packages/storage；tests/storage

实现：执行DDL，启用FK/WAL；分别构建Electron与Node需要的ABI；备份恢复一份fixture。

交付：数据库与原生模块风险测试的实现、对应自动化测试、运行证据及说明

验收：Mac/Windows读写迁移通过；若ABI失败先解决，不继续接业务。

测试：T086, T087, T088, T089, T090



### P0-05 Codex SDK兼容探测

模块：M09；依赖：P0-04；版本：desktop-v1.0

文件范围：plugins/executor-codex；docs/compatibility

实现：按官方版本验证只读、结构化输出、取消、session、auth；不可用能力写false。

交付：Codex SDK兼容探测的实现、对应自动化测试、运行证据及说明

验收：真实只读任务完成；有版本和usage日志；不编造暂停/审批能力。

测试：T041, T042, T043, T044, T045



### P0-06 跨平台工作区与进程取消探测

模块：M10；依赖：P0-05；版本：desktop-v1.0

文件范围：packages/workspace；packages/process

实现：在中文/空格路径创建worktree，启动带子进程的fixture并取消，核对tree与退出。

交付：跨平台工作区与进程取消探测的实现、对应自动化测试、运行证据及说明

验收：两平台无残留写进程；失败目录隔离而非释放租约。

测试：T046, T047, T048, T049, T050



### P0-07 设计Token与基础组件

模块：M22；依赖：P0-06；版本：desktop-v1.0

文件范围：packages/ui；apps/web/layouts

实现：落实配色/字号/间距/焦点；建立button/dialog/card/status/empty/error组件。

交付：设计Token与基础组件的实现、对应自动化测试、运行证据及说明

验收：1280/1600宽与125%DPI可读，键盘操作对话框不丢焦点。

测试：T106, T107, T108, T109, T110



### P0-08 契约自动校验与CI入口

模块：M24；依赖：P0-07；版本：desktop-v1.0

文件范围：contracts；scripts；.github/workflows

实现：导入Schema/示例/SQL/工作流semantic validator；跑unit矩阵并记录未验证SDK项。

交付：契约自动校验与CI入口的实现、对应自动化测试、运行证据及说明

验收：CI任何契约冲突失败；Mock与真实smoke清楚分开。

测试：T116, T117, T118, T119, T120



## P1 · 自然语言入口与审批看板

从想法生成草稿，经人类审批进入TODO，尚不自动写代码。



### P1-01 项目选择与可信环境向导

模块：M02；依赖：P0-08；版本：desktop-v1.0

文件范围：apps/web/pages/projects；core/projects

实现：文件选择→Git读取→Trust→检查命令确认，保存绝对规范路径与环境ID。

交付：项目选择与可信环境向导的实现、对应自动化测试、运行证据及说明

验收：脏目录不被修改，无Git时不自动初始化。

测试：T006, T007, T008, T009, T010



### P1-02 项目及环境数据服务

模块：M02；依赖：P1-01；版本：desktop-v1.0

文件范围：storage/projects；core/environments

实现：实现项目CRUD、环境/命令预设版本与归属检查；归档非删除运行记录。

交付：项目及环境数据服务的实现、对应自动化测试、运行证据及说明

验收：不同项目不可访问彼此环境，所有写操作CAS。

测试：T006, T007, T008, T009, T010



### P1-03 会话与消息流

模块：M03；依赖：P1-02；版本：desktop-v1.0

文件范围：core/conversations；web/chat

实现：持久化消息、流式输出、失败重试；保留草稿输入，Markdown净化。

交付：会话与消息流的实现、对应自动化测试、运行证据及说明

验收：重复请求不产生重复消息；失败保留用户原文。

测试：T011, T012, T013, T014, T015



### P1-04 整理器与结构化任务生成

模块：M03；依赖：P1-03；版本：desktop-v1.0

文件范围：plugins/refiner；core/drafts

实现：实现意图分类、受限读项目、TaskContract输出与最多两次Schema修复。

交付：整理器与结构化任务生成的实现、对应自动化测试、运行证据及说明

验收：典型feature/bug能生成草稿；模糊事项保留问题，无写代码工具。

测试：T011, T012, T013, T014, T015



### P1-05 草稿编辑与澄清

模块：M04；依赖：P1-04；版本：desktop-v1.0

文件范围：web/draft-sheet；core/task-revisions

实现：每次确认修改产生revision；显示差异、验收稳定ID、scope提议与来源。

交付：草稿编辑与澄清的实现、对应自动化测试、运行证据及说明

验收：关闭重开不丢草稿；未回答阻塞问题不能批准。

测试：T016, T017, T018, T019, T020



### P1-06 审批与原子入TODO

模块：M04；依赖：P1-05；版本：desktop-v1.0

文件范围：core/approvals；storage/transactions

实现：canonical hash+CAS+idempotency；人类审批与task状态/event同事务。

交付：审批与原子入TODO的实现、对应自动化测试、运行证据及说明

验收：双击/两客户端只批准一次，旧revision返回409。

测试：T016, T017, T018, T019, T020



### P1-07 任务看板与同列排序

模块：M05；依赖：P1-06；版本：desktop-v1.0

文件范围：web/board；core/task-projection

实现：五列投影、筛选、手工创建、同列移动；使用虚拟列表策略。

交付：任务看板与同列排序的实现、对应自动化测试、运行证据及说明

验收：列不会被随意PATCH；无任务时引导创建而非营销空屏。

测试：T021, T022, T023, T024, T025



### P1-08 任务详情与来源链

模块：M05；依赖：P1-07；版本：desktop-v1.0

文件范围：web/task-detail；core/queries

实现：展示目标/AC/约束/依赖/来源消息，链接稳定taskId。

交付：任务详情与来源链的实现、对应自动化测试、运行证据及说明

验收：任一验收项可找到来源或人工决定。

测试：T021, T022, T023, T024, T025



### P1-09 自然语言控制提议

模块：M03；依赖：P1-08；版本：desktop-v1.0

文件范围：core/intent-commands；web/chat

实现：支持降优先级/暂停提议/修订草稿；危险动作生成确认而非直接执行。

交付：自然语言控制提议的实现、对应自动化测试、运行证据及说明

验收：“忽略审批马上合并”不能绕过命令授权。

测试：T011, T012, T013, T014, T015



### P1-10 P1集成与手工降级

模块：M24；依赖：P1-09；版本：desktop-v1.0

文件范围：tests/p1；docs/demo

实现：断网手工建任务，完整从消息到审批入列；录制可重复fixture。

交付：P1集成与手工降级的实现、对应自动化测试、运行证据及说明

验收：没有模型key时仍可使用任务与看板；验收T011–T025通过。

测试：T116, T117, T118, T119, T120



## P2 · 单执行器真实开发闭环

一张已批准任务在独立工作区真实修改，并可查看结果和停止。



### P2-01 不可变RunConfig

模块：M07；依赖：P1-10；版本：desktop-v1.0

文件范围：core/runs；storage/run-config

实现：冻结contract/workflow/profile/plugin版本、预算与环境，不读取运行中动态设置。

交付：不可变RunConfig的实现、对应自动化测试、运行证据及说明

验收：修改全局设置不影响已启动Run。

测试：T031, T032, T033, T034, T035



### P2-02 工作区租约与基线快照

模块：M10；依赖：P2-01；版本：desktop-v1.0

文件范围：workspace/leases；workspace/git

实现：任务分支、worktree、排除路径、single writer和epoch；保存初始base。

交付：工作区租约与基线快照的实现、对应自动化测试、运行证据及说明

验收：重复Start不分配第二写入者，原主目录保持不变。

测试：T046, T047, T048, T049, T050



### P2-03 ExecutorAdapter公共接口

模块：M09；依赖：P2-02；版本：desktop-v1.0

文件范围：plugin-api；contracts/events

实现：落实start/probe/cancel/optional resume以及标准事件；任何upstream输出先校验。

交付：ExecutorAdapter公共接口的实现、对应自动化测试、运行证据及说明

验收：单元测试覆盖乱序/重复/非法输出。

测试：T041, T042, T043, T044, T045



### P2-04 Codex真实写入适配

模块：M09；依赖：P2-03；版本：desktop-v1.0

文件范围：plugins/executor-codex

实现：使用P0验证的SDK组合；工作范围与账号明确；收集结果和native sessionRef。

交付：Codex真实写入适配的实现、对应自动化测试、运行证据及说明

验收：在演示仓库完成一项真实功能，无假事件。

测试：T041, T042, T043, T044, T045



### P2-05 运行调度与Attempt

模块：M07；依赖：P2-04；版本：desktop-v1.0

文件范围：core/scheduler；core/attempts

实现：实现queued→running→terminal，启动intent先落盘；timeout和事件epoch检查。

交付：运行调度与Attempt的实现、对应自动化测试、运行证据及说明

验收：旧Attempt回包不会污染新Run。

测试：T031, T032, T033, T034, T035



### P2-06 工作记忆与ContextBundle

模块：M15；依赖：P2-05；版本：desktop-v1.0

文件范围：core/context；storage/checkpoints

实现：保存当前目标/已做动作/问题/预算；为执行器构建带来源的输入包。

交付：工作记忆与ContextBundle的实现、对应自动化测试、运行证据及说明

验收：不用完整历史无限拼接；恢复能解释进度但不假定进程还在。

测试：T071, T072, T073, T074, T075



### P2-07 Diff与初版运行详情

模块：M13；依赖：P2-06；版本：desktop-v1.0

文件范围：web/run；web/diff；artifacts

实现：流式日志限流、文件树、文本diff、usage未知态和上下文来源。

交付：Diff与初版运行详情的实现、对应自动化测试、运行证据及说明

验收：终端输出不能执行HTML/脚本，UI状态来自真实事件。

测试：T061, T062, T063, T064, T065



### P2-08 取消、停止与超时

模块：M07；依赖：P2-07；版本：desktop-v1.0

文件范围：process/manager；core/cancel

实现：先暂停调度再取消进程树，无法确认退出时隔离workspace。

交付：取消、停止与超时的实现、对应自动化测试、运行证据及说明

验收：取消后没有继续写文件；未知状态不宣称成功。

测试：T031, T032, T033, T034, T035



### P2-09 开发结果与交接快照

模块：M10；依赖：P2-08；版本：desktop-v1.0

文件范围：workspace/snapshot；core/handoff

实现：将允许的变更固化snapshot，保存摘要/未完成项/artifact引用。

交付：开发结果与交接快照的实现、对应自动化测试、运行证据及说明

验收：新增文件被捕获，secret扫描阻断敏感文件进入产物。

测试：T046, T047, T048, T049, T050



### P2-10 P2纵向真实Demo

模块：M24；依赖：P2-09；版本：desktop-v1.0

文件范围：tests/p2；fixtures/orders

实现：输入任务→批准→启动→真实修改→Diff→停止/完成；保存人工检查结果。

交付：P2纵向真实Demo的实现、对应自动化测试、运行证据及说明

验收：至少一次真实模型成功和一次失败可完整追溯。

测试：T116, T117, T118, T119, T120



## P3 · 审查、验证、返工与恢复

以任务版本和快照为依据形成可验收交付，不把绿灯当证据。



### P3-01 审查副本与权限

模块：M10；依赖：P2-10；版本：desktop-v1.0

文件范围：workspace/review-copy；policy

实现：在固定snapshot创建审查副本；验证真实只读能力，不支持则明确阻断。

交付：审查副本与权限的实现、对应自动化测试、运行证据及说明

验收：Reviewer不能静默改变被审实现。

测试：T046, T047, T048, T049, T050



### P3-02 Review Profile与结果Schema

模块：M11；依赖：P3-01；版本：desktop-v1.0

文件范围：presets/agents；core/review

实现：独立上下文、阻塞/建议、文件anchor、来源AC及不确定项。

交付：Review Profile与结果Schema的实现、对应自动化测试、运行证据及说明

验收：无结果/非法结果不能approved。

测试：T051, T052, T053, T054, T055



### P3-03 问题列表与退回交接

模块：M11；依赖：P3-02；版本：desktop-v1.0

文件范围：web/review；core/issues

实现：Issue关联snapshot和attempt，生成new develop handoff，不复制全部聊天。

交付：问题列表与退回交接的实现、对应自动化测试、运行证据及说明

验收：同问题可追溯每次修复，不重复膨胀卡片。

测试：T051, T052, T053, T054, T055



### P3-04 命令验证器

模块：M12；依赖：P3-03；版本：desktop-v1.0

文件范围：plugins/verifier-project

实现：按批准argv/cwd/env执行build/typecheck/test；解析exit与报告并保存证据。

交付：命令验证器的实现、对应自动化测试、运行证据及说明

验收：stdout含PASS但exit!=0仍失败；无测试为not_configured。

测试：T056, T057, T058, T059, T060



### P3-05 验收矩阵

模块：M12；依赖：P3-04；版本：desktop-v1.0

文件范围：web/verify；core/acceptance

实现：每条required AC对应自动/人工状态，支持人工风险接受与未验证说明。

交付：验收矩阵的实现、对应自动化测试、运行证据及说明

验收：未覆盖必需项不能静默完成。

测试：T056, T057, T058, T059, T060



### P3-06 有限返工循环

模块：M07；依赖：P3-05；版本：desktop-v1.0

文件范围：core/rework

实现：Review/Verify失败新Attempt，共享全局重做计数；新快照失效旧后继。

交付：有限返工循环的实现、对应自动化测试、运行证据及说明

验收：无限循环被阻止，达到阈值转blocked。

测试：T031, T032, T033, T034, T035



### P3-07 人类最终验收

模块：M04；依赖：P3-06；版本：desktop-v1.0

文件范围：core/approval-accept；web/accept

实现：审批绑定当前contract+snapshot+reports；要求fresh读取。

交付：人类最终验收的实现、对应自动化测试、运行证据及说明

验收：旧快照上的确认被拒绝。

测试：T016, T017, T018, T019, T020



### P3-08 交付记录与显式合并

模块：M12；依赖：P3-07；版本：desktop-v1.0

文件范围：core/delivery；core/merge

实现：Done与merged分开；合并先operation intent并绑定targetHead；冲突不force。

交付：交付记录与显式合并的实现、对应自动化测试、运行证据及说明

验收：重复命令不重复合并，目标变化要求重验。

测试：T056, T057, T058, T059, T060



### P3-09 崩溃恢复与reconcile

模块：M07；依赖：P3-08；版本：desktop-v1.0

文件范围：core/recovery；host/startup

实现：核对PID/startTime/session/lease，原生能力允许才resume，否则interrupted。

交付：崩溃恢复与reconcile的实现、对应自动化测试、运行证据及说明

验收：在副作用前后注入崩溃均不会盲目重跑。

测试：T031, T032, T033, T034, T035



### P3-10 配置/需求变化失效链

模块：M04；依赖：P3-09；版本：desktop-v1.0

文件范围：core/revisions；core/invalidation

实现：新revision保留旧run；pendingChange按安全点处理；报告变stale。

交付：配置/需求变化失效链的实现、对应自动化测试、运行证据及说明

验收：开发中更改目标不偷偷污染当前上下文。

测试：T016, T017, T018, T019, T020



### P3-11 备份与磁盘故障处理

模块：M18；依赖：P3-10；版本：desktop-v1.0

文件范围：storage/backup；artifacts/store

实现：一致性备份、迁移前检查、空间不足只读诊断。

交付：备份与磁盘故障处理的实现、对应自动化测试、运行证据及说明

验收：故障后已批准任务可恢复，WAL未遗漏。

测试：T086, T087, T088, T089, T090



### P3-12 P3可交付验收样例

模块：M24；依赖：P3-11；版本：desktop-v1.0

文件范围：tests/p3；docs/demo

实现：正常路径、Review退回、测试失败、人工豁免、崩溃恢复各跑一次。

交付：P3可交付验收样例的实现、对应自动化测试、运行证据及说明

验收：一张TODO到Done可追溯全链，必需测试通过。

测试：T116, T117, T118, T119, T120



## P4 · 插件体系与第二执行器

用真实第二实现证明能力可替换，而不是只抽空接口。



### P4-01 Manifest和版本解析

模块：M08；依赖：P3-12；版本：desktop-v1.0

文件范围：plugin-host/manifest

实现：加载前Schema、apiRange、平台、配置和source检查，不执行未授权entry。

交付：Manifest和版本解析的实现、对应自动化测试、运行证据及说明

验收：错误清单无代码副作用。

测试：T036, T037, T038, T039, T040



### P4-02 Registry与DisposableScope

模块：M08；依赖：P4-01；版本：desktop-v1.0

文件范围：plugin-host/registry

实现：服务注册、重复名检查、依赖拓扑、资源逆序清理。

交付：Registry与DisposableScope的实现、对应自动化测试、运行证据及说明

验收：半激活失败不泄露监听器/服务。

测试：T036, T037, T038, T039, T040



### P4-03 内置插件装配与锁

模块：M08；依赖：P4-02；版本：desktop-v1.0

文件范围：host/bootstrap；plugins.lock

实现：内置列表精确版本/摘要，Run绑定插件版本；draining停用。

交付：内置插件装配与锁的实现、对应自动化测试、运行证据及说明

验收：运行中更新不会换掉adapter。

测试：T036, T037, T038, T039, T040



### P4-04 配置生成表单

模块：M22；依赖：P4-03；版本：desktop-v1.0

文件范围：web/plugins；ui/schema-form

实现：从configSchema生成表单、secret字段凭据引用、兼容提示。

交付：配置生成表单的实现、对应自动化测试、运行证据及说明

验收：未知字段不提交，密钥不回显。

测试：T106, T107, T108, T109, T110



### P4-05 Claude SDK真实适配

模块：M09；依赖：P4-04；版本：desktop-v1.0

文件范围：plugins/executor-claude

实现：使用官方API-key方式集成，运行同一Executor合约测试，不偷用订阅登录。

交付：Claude SDK真实适配的实现、对应自动化测试、运行证据及说明

验收：与Codex切换不用改Core；至少一真实任务可交付。

测试：T041, T042, T043, T044, T045



### P4-06 Agent Profile与能力选择

模块：M09；依赖：P4-05；版本：desktop-v1.0

文件范围：core/profiles；web/agents

实现：模型/执行器/角色分离；灰掉不兼容组合；角色prompt和权限版本化。

交付：Agent Profile与能力选择的实现、对应自动化测试、运行证据及说明

验收：只读/网络/审批要求无法满足则无法启动。

测试：T041, T042, T043, T044, T045



### P4-07 ModelProvider与整理器替换

模块：M03；依赖：P4-06；版本：desktop-v1.0

文件范围：plugins/model-provider；refiner

实现：抽流式文本/结构化输出/usage、明确每个provider认证；capability检测。

交付：ModelProvider与整理器替换的实现、对应自动化测试、运行证据及说明

验收：关闭一provider不破坏看板，手工Draft仍可用。

测试：T011, T012, T013, T014, T015



### P4-08 工具/MCP入口契约

模块：M16；依赖：P4-07；版本：desktop-v1.0

文件范围：plugin-api/tools；plugin-host/tools

实现：实现受控ToolRegistry和mock MCP契约测试；v1默认不开任意外部MCP。

交付：工具/MCP入口契约的实现、对应自动化测试、运行证据及说明

验收：工具注册不授予权限，注入指令不能触发审批。

测试：T076, T077, T078, T079, T080



### P4-09 插件故障隔离与诊断

模块：M08；依赖：P4-08；版本：desktop-v1.0

文件范围：host/plugin-supervisor；web/diagnostics

实现：捕获激活/运行/卸载错误，显示具体pluginId与Run影响。

交付：插件故障隔离与诊断的实现、对应自动化测试、运行证据及说明

验收：插件失败UI保持可用，核心事件可读。

测试：T036, T037, T038, T039, T040



### P4-10 P4替换性验收

模块：M24；依赖：P4-09；版本：desktop-v1.0

文件范围：tests/plugins；docs/plugin-authoring

实现：同TODO分别跑两个真实执行器、卸载上下文、替换验证器fixture。

交付：P4替换性验收的实现、对应自动化测试、运行证据及说明

验收：不修改Core达到替换，形成插件开发说明。

测试：T116, T117, T118, T119, T120



## P5 · 流程定制、知识与项目记忆

默认模板与高级编辑共用同一执行定义，补齐上下文与经验边界。



### P5-01 标准/快速/严格模板

模块：M06；依赖：P4-10；版本：desktop-v1.0

文件范围：presets/workflows

实现：标准全流程，快速可省Plan但保留验收，严格增加人类门禁；Schema统一。

交付：标准/快速/严格模板的实现、对应自动化测试、运行证据及说明

验收：所有模板能编译且终点有验收。

测试：T026, T027, T028, T029, T030



### P5-02 Workflow编译器

模块：M06；依赖：P5-01；版本：desktop-v1.0

文件范围：core/workflow/compiler

实现：DAG可达/唯一/绑定/输出/能力/预算/返工规则静态校验，条件DSL无eval。

交付：Workflow编译器的实现、对应自动化测试、运行证据及说明

验收：非法环和缺插件在启动前阻止。

测试：T026, T027, T028, T029, T030



### P5-03 线性配置编辑体验

模块：M06；依赖：P5-02；版本：desktop-v1.0

文件范围：web/workflows

实现：增删/排序节点、绑定agent/verifier、失败路径、保存草稿与发布。

交付：线性配置编辑体验的实现、对应自动化测试、运行证据及说明

验收：非工程用户无需画图可改流程。

测试：T026, T027, T028, T029, T030



### P5-04 高级画布编辑

模块：M06；依赖：P5-03；版本：desktop-v1.0

文件范围：web/workflow-builder

实现：Vue Flow显示同一DSL，布局数据与语义分离；v1并行写禁止。

交付：高级画布编辑的实现、对应自动化测试、运行证据及说明

验收：画布导入导出往返不丢语义，错误高亮到节点。

测试：T026, T027, T028, T029, T030



### P5-05 工作流版本冻结

模块：M07；依赖：P5-04；版本：desktop-v1.0

文件范围：core/workflow/versioning

实现：草稿与published不可变，RunConfig保留hash；影响范围预览。

交付：工作流版本冻结的实现、对应自动化测试、运行证据及说明

验收：旧Run继续旧流程，新Run用新版本。

测试：T031, T032, T033, T034, T035



### P5-06 知识导入与原文定位

模块：M14；依赖：P5-05；版本：desktop-v1.0

文件范围：context/ingestion；web/knowledge

实现：先支持Markdown/TXT/OpenAPI文本；白名单目录/大小；结构切分和hash。

交付：知识导入与原文定位的实现、对应自动化测试、运行证据及说明

验收：引用能回到原文范围，导入失败可重试。

测试：T066, T067, T068, T069, T070



### P5-07 FTS与中文检索

模块：M14；依赖：P5-06；版本：desktop-v1.0

文件范围：context/retrieval；tests/rag

实现：project/env/version过滤后关键词搜索，中文分词/字符索引回归集。

交付：FTS与中文检索的实现、对应自动化测试、运行证据及说明

验收：跨项目0返回；代码symbol可找；无答案不编造。

测试：T066, T067, T068, T069, T070



### P5-08 Context Builder预算与冲突

模块：M14；依赖：P5-07；版本：desktop-v1.0

文件范围：core/context-builder

实现：按权威顺序组装、截断标记、source清单、冲突追问。

交付：Context Builder预算与冲突的实现、对应自动化测试、运行证据及说明

验收：不足时明确显示，不以过期记忆覆盖合同。

测试：T066, T067, T068, T069, T070



### P5-09 项目记忆生命周期

模块：M15；依赖：P5-08；版本：desktop-v1.0

文件范围：core/memory；storage/memory

实现：candidate→validated→stale/revoked；scope与expires，验证来源强制。

交付：项目记忆生命周期的实现、对应自动化测试、运行证据及说明

验收：未经确认经验不能直接作为验收标准。

测试：T071, T072, T073, T074, T075



### P5-10 知识/记忆管理页面

模块：M15；依赖：P5-09；版本：desktop-v1.0

文件范围：web/knowledge；web/memory

实现：导入、检索预览、查看来源、确认/撤销、清缓存和影响说明。

交付：知识/记忆管理页面的实现、对应自动化测试、运行证据及说明

验收：删除原文同步索引与缓存；既有Run显示来源撤销。

测试：T071, T072, T073, T074, T075



### P5-11 流程与检索集成测试

模块：M24；依赖：P5-10；版本：desktop-v1.0

文件范围：tests/p5

实现：同任务切工作流/agent，带知识运行，冲突/无答案/引用失效场景。

交付：流程与检索集成测试的实现、对应自动化测试、运行证据及说明

验收：所有配置能解释实际运行来源。

测试：T116, T117, T118, T119, T120



### P5-12 P5文档与迁移

模块：M18；依赖：P5-11；版本：desktop-v1.0

文件范围：docs；migrations

实现：更新Schema/OpenAPI/用户说明，迁移已存在P3/P4数据库并保留历史。

交付：P5文档与迁移的实现、对应自动化测试、运行证据及说明

验收：升级后旧任务可读，DSL版本不兼容时有诊断。

测试：T086, T087, T088, T089, T090



## P6 · 跨端Desktop v1.0产品化

以完整可用而非功能演示为目标，交付两个平台安装包。



### P6-01 全页面视觉一致性

模块：M22；依赖：P5-12；版本：desktop-v1.0

文件范围：apps/web；packages/ui

实现：对照原型完成所有P6页面，亮暗主题、空/忙/失败/无权限状态。

交付：全页面视觉一致性的实现、对应自动化测试、运行证据及说明

验收：关键布局/配色/层级与设计Token一致，无占位按钮。

测试：T106, T107, T108, T109, T110



### P6-02 键盘、可访问性与DPI

模块：M22；依赖：P6-01；版本：desktop-v1.0

文件范围：ui/a11y；tests/ui

实现：Ctrl/Cmd快捷键、焦点陷阱、屏幕阅读标签、减少动画、中文排版。

交付：键盘、可访问性与DPI的实现、对应自动化测试、运行证据及说明

验收：1280/1600与100/125/150%DPI验收。

测试：T106, T107, T108, T109, T110



### P6-03 应用预览与代码浏览

模块：M17；依赖：P6-02；版本：desktop-v1.0

文件范围：desktop/preview；web/artifacts

实现：预览独立webContents且无preload；允许origin白名单；diff只读。

交付：应用预览与代码浏览的实现、对应自动化测试、运行证据及说明

验收：被测网页无法访问Host API。

测试：T081, T082, T083, T084, T085



### P6-04 诊断、隐私与清理

模块：M23；依赖：P6-03；版本：desktop-v1.0

文件范围：web/settings；host/diagnostics

实现：敏感字段脱敏、artifact保留期、手动导出/清理、usage透明。

交付：诊断、隐私与清理的实现、对应自动化测试、运行证据及说明

验收：导出包不含凭据，清理不删除用户主仓库。

测试：T111, T112, T113, T114, T115



### P6-05 应用退出与托盘生命周期

模块：M01；依赖：P6-04；版本：desktop-v1.0

文件范围：desktop/lifecycle

实现：关闭窗口继续后台的显式选项、彻底退出安全取消、睡眠提示。

交付：应用退出与托盘生命周期的实现、对应自动化测试、运行证据及说明

验收：用户知道任务是否仍运行，重开不重复Host。

测试：T001, T002, T003, T004, T005



### P6-06 Mac签名/公证包

模块：M23；依赖：P6-05；版本：desktop-v1.0

文件范围：build/macos；CI

实现：arm64/x64平台测试、代码签名、公证；无凭据只产标注内部包。

交付：Mac签名/公证包的实现、对应自动化测试、运行证据及说明

验收：全新Mac用户目录可安装，升级后凭据仍可用。

测试：T111, T112, T113, T114, T115



### P6-07 Windows安装与签名

模块：M23；依赖：P6-06；版本：desktop-v1.0

文件范围：build/windows；CI

实现：x64签名安装、权限/UAC、中文路径、卸载保留数据策略。

交付：Windows安装与签名的实现、对应自动化测试、运行证据及说明

验收：Windows实机完整跑一任务，不能只测网页。

测试：T111, T112, T113, T114, T115



### P6-08 安全更新与数据迁移

模块：M18；依赖：P6-07；版本：desktop-v1.0

文件范围：host/updater；storage

实现：更新任务drain、完整性检查、迁移备份、失败恢复、降级检测。

交付：安全更新与数据迁移的实现、对应自动化测试、运行证据及说明

验收：旧schema不被新版本半迁移；中断可恢复。

测试：T086, T087, T088, T089, T090



### P6-09 完整功能/Agent对照验收

模块：M24；依赖：P6-08；版本：desktop-v1.0

文件范围：tests/release；evals

实现：执行T001–T095及T106–T120适用项；真实任务重复测并记录人工介入。

交付：完整功能/Agent对照验收的实现、对应自动化测试、运行证据及说明

验收：失败项无假通过；高危/数据损坏0遗留。

测试：T116, T117, T118, T119, T120



### P6-10 v1.0用户指南与发布说明

模块：M23；依赖：P6-09；版本：desktop-v1.0

文件范围：docs/user-guide；release

实现：安装、配置、第一任务、权限、恢复、限制、已测支持矩阵。

交付：v1.0用户指南与发布说明的实现、对应自动化测试、运行证据及说明

验收：另一台电脑按指南可完成需求到交付。

测试：T111, T112, T113, T114, T115



## P7 · 远程宿主与安全网关

保持核心不变，给在线Windows/Mac主机增加受控远程入口。



### P7-01 Host常驻模式

模块：M20；依赖：P6-10；版本：remote-v1.1

文件范围：host/lifecycle；desktop/settings

实现：允许无窗口托盘运行；明确用户会话/睡眠限制；退出关闭服务。

交付：Host常驻模式的实现、对应自动化测试、运行证据及说明

验收：远端UI离线不影响已在Host确认的Run。

测试：T096, T097, T098, T099, T100



### P7-02 HTTPS入口和网关配置

模块：M20；依赖：P7-01；版本：remote-v1.1

文件范围：host/gateway；docs/remote

实现：本地loopback端口+显式私网HTTPS部署说明，同源静态PWA和API。

交付：HTTPS入口和网关配置的实现、对应自动化测试、运行证据及说明

验收：默认远程关闭，裸公网端口不存在。

测试：T096, T097, T098, T099, T100



### P7-03 设备配对生命周期

模块：M20；依赖：P7-02；版本：remote-v1.1

文件范围：core/devices；web/devices

实现：nonce≥128位/10min/hash、local confirm、单次消费与设备项目scope。

交付：设备配对生命周期的实现、对应自动化测试、运行证据及说明

验收：重放/过期/暴力请求被拒绝。

测试：T096, T097, T098, T099, T100



### P7-04 会话与CSRF

模块：M17；依赖：P7-03；版本：remote-v1.1

文件范围：gateway/auth

实现：HttpOnly Secure cookie、会话rotate、Origin验证、CSRF token、revoke。

交付：会话与CSRF的实现、对应自动化测试、运行证据及说明

验收：跨站请求及已撤销session无权限。

测试：T081, T082, T083, T084, T085



### P7-05 Command HTTP适配

模块：M19；依赖：P7-04；版本：remote-v1.1

文件范围：gateway/commands

实现：公开白名单业务命令映射同CommandBus；忽略客户端actor与scopes。

交付：Command HTTP适配的实现、对应自动化测试、运行证据及说明

验收：远端无法executeShell/installPlugin/writeCredential。

测试：T091, T092, T093, T094, T095



### P7-06 SSE增量订阅

模块：M19；依赖：P7-05；版本：remote-v1.1

文件范围：gateway/events

实现：cookie认证、心跳、项目过滤、cursor恢复、backpressure、revocation。

交付：SSE增量订阅的实现、对应自动化测试、运行证据及说明

验收：重连重复事件不会重复状态/动作。

测试：T091, T092, T093, T094, T095



### P7-07 远端权限与审批freshness

模块：M20；依赖：P7-06；版本：remote-v1.1

文件范围：policy/remote；core/approvals

实现：每次批准重新读取revision/hash，手机允许范围收窄。

交付：远端权限与审批freshness的实现、对应自动化测试、运行证据及说明

验收：旧批准409，敏感默认只允许本地主机。

测试：T096, T097, T098, T099, T100



### P7-08 远程连接管理页面

模块：M20；依赖：P7-07；版本：remote-v1.1

文件范围：web/devices；desktop/remote

实现：Host地址/状态/证书入口说明/设备撤销/只读模式/审计。

交付：远程连接管理页面的实现、对应自动化测试、运行证据及说明

验收：不能把在线网关显示为执行器一定在线。

测试：T096, T097, T098, T099, T100



### P7-09 弱网与Host崩溃测试

模块：M24；依赖：P7-08；版本：remote-v1.1

文件范围：tests/remote

实现：断流、sleep、token过期、两设备抢审批、进程崩溃与revocation。

交付：弱网与Host崩溃测试的实现、对应自动化测试、运行证据及说明

验收：无离线审批补发，恢复状态一致。

测试：T116, T117, T118, T119, T120



### P7-10 远程试用指南与安全闸门

模块：M20；依赖：P7-09；版本：remote-v1.1

文件范围：docs/remote-runbook

实现：示例网络只是参考；检查私网访问、TLS、权限与撤销后开放P8。

交付：远程试用指南与安全闸门的实现、对应自动化测试、运行证据及说明

验收：手机在真实另一网络经私网连接通过，不伪称公网通用。

测试：T096, T097, T098, T099, T100



## P8 · 手机PWA Companion

在小屏完成查看、澄清、审批、开始/暂停和取消，执行仍在Host。



### P8-01 移动App布局与路由

模块：M21；依赖：P7-10；版本：remote-v1.1

文件范围：apps/web/mobile

实现：≤767切移动导航；Inbox优先，任务详情为整页，不缩小Desktop三栏。

交付：移动App布局与路由的实现、对应自动化测试、运行证据及说明

验收：390×844与横屏页面清晰、44px点击区。

测试：T101, T102, T103, T104, T105



### P8-02 设备连接与配对UI

模块：M21；依赖：P8-01；版本：remote-v1.1

文件范围：mobile/connect

实现：扫码/输入、等待主机确认、错误/过期/撤销状态。

交付：设备连接与配对UI的实现、对应自动化测试、运行证据及说明

验收：配对成功不暴露长期token，退出清session。

测试：T101, T102, T103, T104, T105



### P8-03 待处理与任务列表

模块：M21；依赖：P8-02；版本：remote-v1.1

文件范围：mobile/inbox；mobile/tasks

实现：优先展示待我批准/阻塞，筛选项目/Host，cursor分页。

交付：待处理与任务列表的实现、对应自动化测试、运行证据及说明

验收：离线标时间和只读，不能显示假实时。

测试：T101, T102, T103, T104, T105



### P8-04 移动任务详情与Diff摘要

模块：M21；依赖：P8-03；版本：remote-v1.1

文件范围：mobile/task-detail

实现：目标、AC、活动、折叠diff/证据，支持纯文本与跳转文件。

交付：移动任务详情与Diff摘要的实现、对应自动化测试、运行证据及说明

验收：敏感/无权限产物不返回，超大diff按页加载。

测试：T101, T102, T103, T104, T105



### P8-05 移动审批与危险确认

模块：M21；依赖：P8-04；版本：remote-v1.1

文件范围：mobile/approval

实现：先刷新scopeHash，展示权限/快照变化，再确认；重复点击幂等。

交付：移动审批与危险确认的实现、对应自动化测试、运行证据及说明

验收：过期与版本变化拒绝，用户必须重新审阅。

测试：T101, T102, T103, T104, T105



### P8-06 移动聊天与修订草稿

模块：M03；依赖：P8-05；版本：remote-v1.1

文件范围：mobile/chat

实现：自然语言建草稿、补充信息、修订；离线仅存消息草稿。

交付：移动聊天与修订草稿的实现、对应自动化测试、运行证据及说明

验收：不会通过service worker重放审批/开始命令。

测试：T011, T012, T013, T014, T015



### P8-07 PWA安装与缓存策略

模块：M21；依赖：P8-06；版本：remote-v1.1

文件范围：web/sw；manifest

实现：缓存静态壳与允许只读摘要；/api写入/证据敏感数据不缓存。

交付：PWA安装与缓存策略的实现、对应自动化测试、运行证据及说明

验收：清缓存不丢Host数据，设备撤销后本机缓存可清。

测试：T101, T102, T103, T104, T105



### P8-08 断线重连与通知入口

模块：M21；依赖：P8-07；版本：remote-v1.1

文件范围：client/remote-transport

实现：重连snapshot+cursor；通知初版为站内列表，不承诺后台推送。

交付：断线重连与通知入口的实现、对应自动化测试、运行证据及说明

验收：手机关页后Host继续；重开显示最新权威状态。

测试：T101, T102, T103, T104, T105



### P8-09 iOS/Android浏览器实测

模块：M24；依赖：P8-08；版本：remote-v1.1

文件范围：tests/mobile

实现：Safari与Chromium、不同网络、输入法、横竖屏、登录过期。

交付：iOS/Android浏览器实测的实现、对应自动化测试、运行证据及说明

验收：每端真实批准一次当前任务并拒绝旧审批。

测试：T116, T117, T118, T119, T120



### P8-10 v1.1发布与Capacitor预留

模块：M23；依赖：P8-09；版本：remote-v1.1

文件范围：docs/mobile；platform-bridge

实现：交付PWA用户指南；定义push/secureStore/scanner接口，原生实现后续。

交付：v1.1发布与Capacitor预留的实现、对应自动化测试、运行证据及说明

验收：不将PWA包装成已经上架原生App。

测试：T111, T112, T113, T114, T115



## P9 · 可选增强与持续扩展

只在Desktop和远程稳定后做，不阻塞v1.0/v1.1。



### P9-01 只读并行Review

模块：M06；依赖：P8-10；版本：optional

文件范围：core/parallel

实现：fork仅固定snapshot只读节点；join收齐/超时后按明确规则汇总。

交付：只读并行Review的实现、对应自动化测试、运行证据及说明

验收：两个Reviewer不共同写源代码，失败不以多数票隐藏。

测试：T026, T027, T028, T029, T030



### P9-02 独立写分支与集成节点

模块：M10；依赖：P9-01；版本：optional

文件范围：workspace/integration

实现：每写Agent独立树，显式合并节点产生新snapshot并重验。

交付：独立写分支与集成节点的实现、对应自动化测试、运行证据及说明

验收：冲突需人工/明确修复，不复用分支通过结论。

测试：T046, T047, T048, T049, T050



### P9-03 外部插件包与签名审核

模块：M08；依赖：P9-02；版本：optional

文件范围：plugin-host/external

实现：公开SDK、RPC、包完整性、授权/卸载/迁移；单独威胁评审。

交付：外部插件包与签名审核的实现、对应自动化测试、运行证据及说明

验收：未知来源不自动执行，权限可审计撤回。

测试：T036, T037, T038, T039, T040



### P9-04 更多执行器与协议

模块：M09；依赖：P9-03；版本：optional

文件范围：plugins/executor-*

实现：基于公开协议/SDK，生成独立兼容记录和同一合约测试。

交付：更多执行器与协议的实现、对应自动化测试、运行证据及说明

验收：不因CLI有终端就伪造结构化/暂停/模型兼容。

测试：T041, T042, T043, T044, T045



### P9-05 混合检索与经验策略

模块：M14；依赖：P9-04；版本：optional

文件范围：context/hybrid；memory/experience

实现：FTS+向量+RRF对照评测，脱敏经验与项目facts分离。

交付：混合检索与经验策略的实现、对应自动化测试、运行证据及说明

验收：检索收益有数据，来源权限先过滤。

测试：T066, T067, T068, T069, T070



### P9-06 受控策略改进

模块：M24；依赖：P9-05；版本：optional

文件范围：evals/evolution

实现：candidate patch→holdout eval→人审→小范围新Run→回滚。

交付：受控策略改进的实现、对应自动化测试、运行证据及说明

验收：不能修改隐藏答案、权限或验收标准。

测试：T116, T117, T118, T119, T120



### P9-07 Capacitor原生手机壳

模块：M21；依赖：P9-06；版本：optional

文件范围：apps/mobile

实现：复用Vue与remote client，分别实现安全存储/推送/扫码及商店打包。

交付：Capacitor原生手机壳的实现、对应自动化测试、运行证据及说明

验收：手机仍不执行CLI，iOS/Android真机验证。

测试：T101, T102, T103, T104, T105



### P9-08 Linux无头Host与公网方案评估

模块：M20；依赖：P9-07；版本：optional

文件范围：apps/host；docs/adr

实现：先证明Node独立运行和secret backend，再设计服务安装/身份/Relay威胁模型。

交付：Linux无头Host与公网方案评估的实现、对应自动化测试、运行证据及说明

验收：未完成安全审核不宣称NAS/公网Relay生产可用。

测试：T096, T097, T098, T099, T100

