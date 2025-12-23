# Forge 实施状态

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
