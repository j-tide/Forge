# Forge

> **Python Core**：Desktop 的唯一业务 Runtime 是独立 Python Host。Electron Main 负责窗口、目录选择和 Host 生命周期；Vue/TypeScript 通过固定 Preload API 与 Main 通信，Main 以有版本的 JSON-RPC stdio 连接 Python。历史 Node Host 仅保留为迁移对照，不是生产 fallback。MIG-PY-09 和 P2 Phase Gate 已在 macOS arm64 开发环境通过；见 [迁移计划](docs/forge-python-core-migration-plan.md) 与 [P2 阶段报告](docs/p2-completion-report.md)。SQLite 数据不重置。

Forge 是自然语言驱动的多 Agent 研发工作台。需求先成为可编辑的 Task Contract，经人工批准进入 TODO；开发、Review、验证与人工验收依靠真实状态和证据。Done 不代表合并或部署。Forge 与 ProofRun 完全独立。

## 当前状态

P5 已提供版本化 Workflow 模板、Python 编译预检、Desktop 线性编辑、Vue Flow 画布与发布版本冻结；受信项目资料支持只读导入、原文定位、项目/环境限定检索和经人工确认的记忆生命周期。**仅与 quick 模板同语义的已发布四阶段线性 Workflow** 可以通过真实 Codex 路径运行：冻结 Developer/Reviewer Profile 与版本，经独立的 Develop、Review、Verify 和人工验收步骤完成；其他图形运行时拒绝。带资料查询的开发 Run 会拒绝无答案/冲突，并把实际使用的来源冻结到 ContextBundle；来源后来撤销会在历史 Run 中标明失效，旧输入不被改写。当前没有通用 Workflow Engine，也没有第二真实执行器。P4-05/P4-10 与完整 P4 Gate 仍因 Claude 在线验收及生产插件替换证据不足而阻塞；P5 仅在用户授权的单执行器开发范围推进。

P0 工程阶段已收口。P1 离线手工闭环已在 Python-only Desktop 的独立临时 SQLite 库上验收：项目选择/信任、保存消息、草稿、人工批准入 TODO、重启恢复。P2 已用真实 Codex 在隔离工作区修改代码、生成 Diff/快照/交接，并验证真实失败与用户取消。P3-01～12 与 P3 Phase Gate 已在当前 macOS arm64 开发环境通过：固定快照 Review、命令验证、逐条 AC、有限返工、最终人工验收、独立本地合并、崩溃对账、版本失效、WAL 备份和交付样例。开发、Review 或单条命令通过都不等于 Task Done；Done 仍不等于已合并或部署。Python Host 以非破坏性迁移升级到 schema 30；项目移除只归档元数据。Web 与 Desktop Renderer 共用 Vue App；普通 Web 没有本地 Host。版本号仍为 `0.0.1`。P6-06 的同一内部 Mac 包已完成真实单 Codex 产品闭环、取消和重启恢复；公开签名/公证与升级验收仍 BLOCKED。P6-07～P6-10 仅按精确开发例外推进，Windows、安装更新和完整发布验收未通过。

工程规格在 `forge_spec_v1.0/`；新版视觉方向在 `forge_glass_v1.1/`。两份目录均为只读参考。后续界面实现采用新版银白雾面方向、清晰阅读表面与减少透明度/动效回退；原型 HTML 与截图均不参与产品构建。

## 前置条件

- Python Core 工具链：`uv 0.11.14` 与 CPython `3.12.13`；`python/.python-version` 和 `python/uv.lock` 固定版本。开发 Desktop 使用项目本地 `python/.venv` 中的解释器，先运行 `pnpm py:sync`；内部打包版捆绑独立 Python 运行时。
- Node.js `>=22.13.0 <23`；本机验证版本为 `22.22.0`。Vite 8 自身要求 Node `22.12+` 或 `20.19+`，当前仓库采用更窄的 Node 22 约束。
- pnpm `12.3.4`；仓库通过 `packageManager` 固定版本。无需修改全局开发环境；安装或切换工具请自行使用符合版本的本地工具链。
- 开发 Desktop 时需让本机端口 `5173` 可用。Electron 首次启动会按官方安装流程下载对应平台的预编译二进制，需要可访问 Electron 发布源的网络；pnpm 依赖安装脚本保持禁用。生产业务库由 Python 标准库 `sqlite3` 独占。历史 Node `better-sqlite3` 仅用于迁移对照测试。

## 启动

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev:web
pnpm dev:desktop
pnpm dev:host
```

`dev:desktop` 先执行 Python 冻结同步，再启动 Web 开发服务和 Electron；Desktop 自己只启动一个可写 Python Host。`dev:host` 是 `dev:python-host` 的别名，独立运行 Python Host stdio 协议，不开放本地 TCP；直接运行时需 JSON-RPC 客户端。`pnpm test:python-db-parity` 继续用独立临时库验证 Node↔Python schema 15 历史数据互通。

### 内部 macOS 测试包

仅在已核验的 macOS arm64 构建环境运行：

```sh
pnpm package:mac:internal
pnpm smoke:package:mac
```

产物在 `build/macos/`，文件名明确标注 `INTERNAL-ADHOC-UNNOTARIZED`。第二条命令真实挂载 DMG、复制并启动 `.app`，使用隔离用户数据目录，检查包内 Python Host、Renderer 安全设置、退出清理和移除应用后保留数据。该包只作内部 QA，**没有 Developer ID 签名或 Apple 公证，不能作为公开发布安装包**；macOS x64、Gatekeeper 新用户安装、签名升级与凭据连续性尚未通过。见 [ADR 0073](docs/decisions/0073-internal-macos-package-and-distribution-gate.md)。

同一内部 DMG 的完整业务闭环、独立取消与重启已用真实 Codex 验证；外部 Git/Codex 登录与 Finder PATH 限制见 [安装包验收与演示](docs/demo/p6-internal-macos-package.md)、[内部用户指南](docs/user-guide/internal-macos-arm64.md) 和 [内部版本说明](release/INTERNAL-0.0.1-macos-arm64.md)。`FORGE_VERTICAL_PACKAGED=1 FORGE_VERTICAL_FINAL_ONLY=1 FORGE_VERTICAL_TERMINATION=cancel FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 是显式、有模型用量的安装包端到端测试；不要在已有同一产物证据足够时反复运行。`pnpm package:windows:internal` 与 `pnpm smoke:package:windows` 只在真实 Windows x64 上可运行，目前**没有** Windows 包/安装签名验收。P6-08 的离线更新完整性/迁移预检尚不是安装版自动更新；[当前 P6 验收缺口](docs/p6-current-scope-acceptance.md) 保留原 Test ID。

`pnpm test:python-codex-live` 是显式在线测试，使用现有 Codex 登录和临时 Git/SQLite 目录验证 Python app-server Adapter 的真实写入、事件、结构化输出、取消、审批、continuation 及独立 Python Host Run/Handoff。`FORGE_VERTICAL_MODEL=gpt-6-sol pnpm smoke:python-vertical-live` 从真实 Electron Renderer 经固定桥调用 Python Host 完成隔离 Git fixture 的开发 Run、不可变交接和提供方进程故障路径；`FORGE_VERTICAL_SKIP_SUCCESS=1 FORGE_VERTICAL_TERMINATION=cancel node scripts/smoke-python-vertical-live.mjs` 额外验证用户取消。`FORGE_VERTICAL_REVIEW_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 则对真实开发快照显式启动只读 Reviewer，核对结构化报告、Job 幂等、来源 Git 隔离与 UI 截图。模型 ID 需以实时 capability 为准。`pnpm test:review-copy-live` 在固定 CodeSnapshot 的独立审查副本中测试生产 `read-only + approval: never` 门禁、真实 Codex 结构化 Reviewer 输出与写入审批拒绝；这个独立探测本身**不会**发布正式 Review 结论。普通 `pnpm test` 不调用云端模型。
`FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 额外在同一真实 Desktop 链路中批准隔离 fixture 的 `node test.js` Preset，对固定开发快照执行命令验证、刷新逐条验收矩阵、明确关联当前报告与 AC，并核对源仓库不变。此命令仅使用可丢弃临时项目和现有 Codex 认证；命令通过不会自动把 AC 标为已验证，逐条覆盖也不会自动将 Task 标为 Done。

`pnpm test:p3-acceptance` 使用独立 Git/SQLite/进程 fixture 重跑正常交付、Review 退回、测试失败返工、人工建议豁免和 Host 崩溃对账。`pnpm test:p3-live` 另调用现有已登录 Codex，经真实 Electron→Python Host 完成隔离开发、测试、Review、人审和显式本地合并；这是显式联网测试，普通 `pnpm test` 不调用云端模型。任务抽屉的验证报告与输出以纯文本显示，不执行报告里的链接或脚本。详情见 [P3 验收样例](docs/demo/p3-delivery.md)。

`dev:web` 提供普通浏览器入口，不启动或连接本地 Host；`dev:desktop` 启动同一 Web 开发服务、Electron 和由 Desktop 管理的 Python Host。默认 Forge 数据目录按平台放在用户应用数据目录下的 `Forge/development`；正式打包时为 `Forge/production`。测试使用独立临时目录。要加载构建后的页面，可运行 `pnpm start:desktop`。`pnpm smoke:desktop` 用临时数据库验证 Python Host 握手、SQLite 健康、无效数据库降级、崩溃及退出清理。`pnpm dev:node-host-parity` 仅供历史迁移对照，不是 Desktop 的运行依赖。

Desktop 中点击顶部项目名称或侧栏“项目”，再点 **Choose folder**。查看 Git/工作树、lockfile、技术栈与声明脚本后，点击 **Trust this project** 才会保存。Trust 不执行脚本，也不自动批准未来的发布、推送或删除。`pnpm smoke:projects` 用独立临时 Git/非 Git fixture 和受控系统选择器返回值验证向导、取消、脏树、信任、重启、切换和仅删除元数据，并生成 1440×900 的真实 Electron 截图到 `output/playwright/`。本机还单独操作 macOS 原生面板选中临时目录并看到真实 Host 探测结果。

在已信任的 Desktop 项目中，左侧输入区可将消息保存到该项目的本地会话；保存输入本身不会请求 AI。消息旁的 **整理为草稿** 会显式调用当前本机已登录的 Codex app-server，只传有限项目摘要与该消息，在只读模式生成提议。**手工草稿** 不调用模型；手工或无效输出可编辑并保存原文。草稿卡片可打开编辑抽屉，编辑 Title/Goal/验收项/范围，回答未解问题；每次确认修改要求用户决定摘要，Host 用 CAS 保存新 revision 和差异历史。未解问题阻止批准。准备完成后，用户可在同一抽屉请求审批，查看绑定的 revision、摘要和范围，并主动批准入 TODO 或拒绝；批准**不会**启动 Agent。`pnpm smoke:projects` 验证消息、草稿、澄清、审批和 TODO 在 Electron/Host 重启后仍存在，HTML 仅作为文本显示。`pnpm smoke:p1-offline` 关闭 ModelProvider，在隔离模型认证和不可达代理的真实 Electron/Host/SQLite 路径下重跑手工消息→草稿→审批→TODO；它不提供操作系统级断网保证。`pnpm validate:task-map` 对照只读权威规划校验 Playbook 的 P1～P9 任务编号、依赖、Phase Gate 与验收引用。

研发看板只显示当前项目由 Host 返回的真实 Task。可以按标题、状态、优先级和已分配 Executor 筛选；TODO 卡片可在同列拖放或使用键盘可操作的上/下按钮排序。跨列移动不能绕过 Review、Verify 和人工验收门禁。**手工创建任务**会先生成带来源的手工草稿，仍需用户单独批准才进入 TODO。已启动的真实开发 Run 投影到 Development；取消或失败返回 TODO 并显示原因，成功只表示开发快照已生成，仍待 Review/Verify。Host 不可用时不会保留旧在线卡片。1280 宽度下五列横向滚动，长列只渲染可见窗口。点击卡片可查看不可变 Task revision、来源、Run 事件、Diff 和交接状态；`#/tasks/<taskId>` 是同项目内可重载的稳定详情链接。`pnpm smoke:projects` 验证 Desktop 看板创建、排序、越列拒绝和重启持久化。

Design System 检视页只在 Vite 开发模式开放：运行 `pnpm dev:web` 后访问 `http://127.0.0.1:5173/#/dev/ui`。这不是正式导航或业务页面。`packages/ui/src/tokens/values.json` 是工程 token 来源；修改后运行 `node packages/ui/scripts/build-tokens.mjs` 更新 CSS，`pnpm build` 会检查二者一致。`pnpm build && node scripts/capture-ui.mjs` 会从真实 Electron Renderer 生成 1440×900、1600×1000 与 1280 宽模拟缩放截图，输出到被 Git 忽略的 `output/playwright/`；本机生成结果见实施记录。减少透明度/动效目前是当前窗口的外观开关，不会持久化。

Desktop 侧栏“插件”页从 Python Host 读取锁定内置 Codex 插件的真实版本、兼容性和配置 Schema。当前 Codex Schema 没有可编辑字段；通用表单已支持未来受限字段和凭据引用，但本轮没有配置保存或凭据管理，页面不会显示虚假的保存成功。普通 Web 没有本地插件读取能力。`pnpm smoke:desktop` 同时验证这一条固定只读桥和真实插件页面。

P4-08 已建立 Python Host 的受控 ToolRegistry：注册工具不等于执行授权，调用须由 Core/Policy 授予一次性精确范围，输入/输出经封闭 Schema 检验，结果始终是不可信数据；当前不连接任意外部 MCP。P4-09 为受信内置插件提供激活、运行和卸载的安全故障诊断，Desktop 插件页能显示具体 code 与受影响 Run，项目/看板读路径仍可用；这不是恶意第三方 Python 插件的 OS 沙箱。

Desktop 的“项目资料”入口要求先选择并信任项目，只接受白名单目录和不超过 1 MiB 的 Markdown/TXT/OpenAPI 文本；不运行项目脚本。发布 Workflow 不会自动启动任务；目前只有通过严格拓扑/能力校验的 quick 型四阶段链可运行，且 Review、Verify 与人工验收各需独立明确操作。普通 Web 不获得本地 Host/项目文件能力。P4-10 完整替换性验收仍 BLOCKED，单 Codex 实测不等于双执行器通过。见 [P5-11 架构记录](docs/decisions/0067-published-linear-workflow-runtime-and-retrieval-freeze.md) 和 [P4 开发范围报告](docs/p4-development-scope-report.md)。

导入 Workflow 画布 JSON 时只接受 `forge-workflow-canvas/v1` 且语义定义 `schemaVersion: "1.0"`；不兼容版本会明确报错并保留当前草稿/数据库行。当前本地接口是封闭 JSON-RPC stdio；参考 OpenAPI 描述未来 Gateway，没有启用 HTTP 服务。P5 的契约、迁移与用户操作说明见 [Workflow 契约与迁移](docs/p5-workflow-contract-and-migration.md)。

P4-06 已新增版本化 Developer/Reviewer Agent Profile；Host 在启动 Run/Review 时重新检查真实执行器的模型、只读、审批和网络能力。P4-07 将整理器改为独立 Python ModelProvider 接口，内置 Codex 0.0.2 插件同时注册 Executor 与模型提供方。`pnpm test:model-provider-live` 显式使用当前 Codex 登录验证结构化结果、增量文本和原生 usage；普通 `pnpm test` 不调用模型。`FORGE_MODEL_PROVIDER=disabled pnpm dev:desktop` 仅关闭模型整理器，手工草稿与看板仍可用。缺少某家模型凭据不会让其他 Provider 自动替代，Claude 仍不可选。

P4-05 的 Claude 集成目前 **BLOCKED**：本机没有 Anthropic API Key，用户决定暂不运行有成本的真实验收。`pnpm probe:claude-offline` 只检查已锁定的 Python SDK 与随包 CLI 能在受控子进程中加载，不登录、不请求模型、不执行任务，也不使 Claude 出现在可用 Executor 列表。继续 P4-05 时需要在仓库外安全配置授权的 API Key，再进行独立临时 Git fixture 的有上限在线验证；不能借用 Claude 订阅登录。用户已批准精确的单执行器开发依赖例外：P4-06～P4-09 可使用已验证 Codex 路径继续开发，权威依赖不变，P4-05 不因此完成，完整 P4 验收与多执行器发布仍被阻塞。见 `docs/development-dependency-exceptions.json`。

Desktop 的 Task 详情现在可打开独立应用预览窗口：用户明确输入 `http://127.0.0.1:<port>/` 后，只允许该本地 origin 的资源；Forge 不替用户启动项目服务。预览无 Preload、Node 或 Host API。Run 的变更文件与 Diff 只浏览 Host 已捕获、脱敏的只读记录，不读取当前工作树。`pnpm smoke:preview` 用一次性本地 HTTP fixture 实测隔离和越域阻断；普通 Web 不提供本地预览。完整凭据引用、诊断导出以及部分原生弹窗安全验收仍待 P6 后续门禁，见 [ADR 0070](docs/decisions/0070-isolated-local-app-preview.md)。

## 工程检查

在仓库根目录运行：

```sh
pnpm py:sync
pnpm py:lint
pnpm py:typecheck
pnpm py:test
pnpm py:check
pnpm install --frozen-lockfile
pnpm validate:contracts
pnpm validate:task-map
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:python-refiner-live
pnpm test:model-provider-live
```

`pnpm validate:contracts` 检查参考包的 JSON Schema、示例、Workflow、Profile、Plugin Manifest、OpenAPI、SQL、任务/阶段/验收引用、精确版本与许可证记录及生产 token；错误返回非零退出码，警告会显示。构建后可运行 `node packages/contract-validator/dist/cli.js --reporter=json` 获取纯 JSON 报告。它只读参考资料，SQLite 检查使用内存库，不等于产品验收。`pnpm typecheck` 先构建契约、Core、Client 和 Persistence 的公开入口，`pnpm test` 先构建当前工作区，再运行 Node/Vue/真实 SQLite 测试。首次变更依赖并重新生成 lockfile 时才运行普通 `pnpm install`；CI 使用冻结锁文件安装。`pnpm-workspace.yaml` 禁用依赖安装脚本；Electron 二进制由首次运行时单独获取。

Codex P0-05 开发诊断可运行 `pnpm probe:codex`：只检查已锁 `codex-cli 0.155.1`、本地登录、app-server 握手、实时模型列表和与当前平台/版本匹配的实测能力记录，不启动写入任务。`pnpm test:codex-live` 在**独立临时 Git fixture** 中依次运行 SDK、app-server 只读/结构化输出、写入和测试、取消/跨连接及跨 Node 进程继续、审批接受/拒绝。它需要已配置的 Codex 登录与正常上游连接，属于显式 opt-in 的真实网络测试；2026-09-23 的首次重跑因代理环境遗漏而中断；修正后整套通过，见实施记录。没有 API Key 配置流程或 Renderer 凭据入口。

P0-06 的 `pnpm test:workspace-live` 是另一个显式在线测试：先将可丢弃 Git fixture 放入独立 worktree，启动真实 Codex 长命令与子孙进程，取消后核对 PID、心跳、源仓库状态与 worktree 释放。默认 `pnpm test` 只运行确定性的 Git/Node 进程树测试。当前进程树后端仅在 macOS arm64 实测；Windows 后端明确不可用，不能把此命令或 macOS smoke 当成 Windows 验收。Host 崩溃的旧归属记录只报告可能 orphan，不会按历史 PID 自动杀进程或清理目录。

P2-04 的 `pnpm test:p2-codex-live`、P2-05～09 的 `pnpm test:p2-run-live`、P2-08 的 `pnpm test:p2-cancel-live` 和原 `pnpm test:p2-vertical-live` 是旧 Node Host 历史 parity 测试，**不是**当前 Desktop 生产 Python Host 的验收入口。当前真实入口为上述 `smoke:python-vertical-live` 与 `test:review-copy-live`。它们依赖本机现有认证与外部模型服务，普通 `pnpm test` 不调用。

P1-04 的 `pnpm test:refiner-live` 与 `pnpm smoke:refiner-live` 是显式 opt-in 的真实 Codex 模型测试，需要现有合法登录和上游连接。前者验证 feature、bug、模糊需求的结构化结果；后者通过真实 Electron/Host/SQLite 生成一个未批准草稿并核对 fixture Git 树未变。普通 `pnpm test`、`pnpm smoke:desktop` 不依赖云服务。

检查和 smoke test 覆盖当前应用壳、Host 系统/项目/会话/Run 协议、SQLite 持久性与安全边界；显式 `pnpm test:p3-live` 另覆盖真实 Codex 开发、Verify、Review、人类最终验收和显式本地合并。P5-11 的真实自定义 quick 型链与资料引用测试需显式运行 `FORGE_VERTICAL_CUSTOM_WORKFLOW=1 FORGE_VERTICAL_FINAL_ONLY=1 node scripts/smoke-python-vertical-live.mjs` 和 `FORGE_VERTICAL_CONTEXT_ONLY=1 node scripts/smoke-python-vertical-live.mjs`；普通 `pnpm test` 不调用模型。通用 Workflow Engine、P6/P9 Agent 评测仍未验收。Host 使用私有进程消息通道与固定命令；协议为 `forge-host-protocol/v5`。Desktop 退出时仅关闭自己启动的 Host。内部 macOS arm64 `.asar`/DMG 已实测，公开签名/公证包、Windows 与 macOS Intel 仍未验证；实际结果见 `docs/implementation-status.md` 和 `docs/compatibility-record.md`。
