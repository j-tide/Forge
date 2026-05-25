# Forge 版本与兼容性记录

## P0-08 · 契约校验工具链

核验日期：2026-09-23。本机 Node 22.22.0、pnpm 12.3.4、macOS 27.0 arm64。新增精确依赖：`ajv@8.20.0`（MIT，registry 解包 1,033,496 字节）、`ajv-formats@3.0.1`（MIT，56,763 字节）、`yaml@2.9.1`（ISC，686,297 字节）。复用现有 `better-sqlite3@13.0.3` N-API 预构建和 `@forge/persistence` 公开 migration 列表；没有启用安装脚本或新增 native driver。当前 macOS 安装树许可证清单为 200 个 name/version 项，见 `docs/dependency-licenses.json`。

| 组合 | 本机真实结果 | 限制 |
| --- | --- | --- |
| Ajv 2020 + formats | 13 个参考 Schema 严格编译，示例/Profile/Workflow 校验与无效 Schema mutation 通过 | 将来新增 Schema dialect 需独立适配；静态合法不等于业务运行有效 |
| YAML + OpenAPI | 默认 Workflow、OpenAPI 3.1 解析；本地引用、operationId、response、security 与命令表校验通过 | 仅覆盖本轮明确规则，不宣称完整 OpenAPI 规范认证或远端 Gateway 运行 |
| SQLite DDL/migrations | `:memory:` 中参考 DDL、生产 v1→v2 SQL 执行与无效 DDL mutation 通过 | 不连接真实开发 DB；不能代替 P0-04 的持久性/安装包实测 |
| GitHub Actions | quality.yml 已加入独立 contract validation 步骤并继续 frozen install/lint/typecheck/test/build | GitHub Linux runner 尚未触发；当前只在 macOS arm64 执行命令 |

官方核验来源：[Ajv draft 2020-12](https://ajv.js.org/json-schema)、[Ajv 入门](https://ajv.js.org/guide/getting-started)、[YAML API](https://eemeli.org/yaml/)、[ajv npm](https://www.npmjs.com/package/ajv)、[ajv-formats npm](https://www.npmjs.com/package/ajv-formats)、[yaml npm](https://www.npmjs.com/package/yaml)。版本、许可证和包大小于本日从 registry 查询；Windows x64、macOS Intel 和实际 GitHub Linux job 未执行。参考 preset 的 `codex-sdk` / `forge.refiner` 只静态声明，真实 app-server Adapter 不等同于 Plugin Host 安装状态。


## P0-07 · Design System 与 UI 运行时

核验日期：2026-09-23。本机 macOS 27.0 arm64，Node 22.22.0、pnpm 12.3.4、Electron 44.4.3（内置 Node 24.21.0）、Vue 3.5.43、Vite 8.3.0、TypeScript 5.9.3、vue-tsc 3.3.11。`@forge/ui` 只复用已经锁定的 Vue/TS 工具链；**没有引入新的第三方版本、headless UI 包、字体、原生模块或安装脚本**。许可证分别为 Vue/vue-tsc MIT、TypeScript Apache-2.0；现有安装树的 `docs/dependency-licenses.json` 仍是本机许可证清单。`pnpm-workspace.yaml` 的 `ignoreScripts: true` 保持不变。

| 场景 | macOS arm64 实测 | 限制 |
| --- | --- | --- |
| Web 开发 / 生产入口 | Vite 开发浏览器显示 `Local Host unavailable`；`/#/dev/ui` 可检视正式 UI 组件；生产构建根路径显示真实空状态且不展示 Showcase | Showcase 仅开发模式；普通 Web 没有本地 Host |
| Desktop Renderer | 构建后 Electron 真实启动并通过 Host 握手；1440×900、1600×1000 截图无水平溢出，Host connected 来自真实 health | 原生标题栏不变；安装包、签名、公证未测 |
| 窄窗口与放大 | 1280×800、125% **CSS zoom 模拟**下无水平溢出，输入动作仍在面板内，可纵向滚动到按钮 | Playwright Electron viewport 报 `devicePixelRatio=1`；这不是 Mac Retina 或 Windows OS 125%/150% DPI 实机结论 |
| 可访问性 | Dialog 真实浏览器 Shift+Tab 环绕、Escape 关闭和触发器焦点返回；组件测试覆盖 Tabs 箭头键、Drawer 关闭、字段错误与状态文字；不透明阅读面/状态文字静态 4.5:1 检查通过 | 全面读屏器、背景实际合成对比度、暗色主题、Windows 高对比度未审计 |
| 偏好回退 | `data-reduce-transparency=true` 实际 `backdrop-filter: blur(0px)`；`data-reduce-motion=true` 实际页面动画 `0s`；浏览器 `prefers-reduced-motion: reduce` 的 token 为 `0ms`，动画约 `0.01ms` | 平台系统“减少透明度”媒体查询未在本机自动触发实测；当前窗口开关未持久化 |

新增 UI package 时普通离线安装曾因本机 pnpm registry metadata 缺失失败；随后联网安装通过。pnpm 对该新增 workspace importer 最初给出未物化的 Vue/vue-tsc 无 peer 实例链接，锁文件将 importer 指向**已有** `typescript@5.9.3` peer 变体后，`pnpm install --frozen-lockfile` 和 strict typecheck 均通过。没有绕过供应链检查或开放 install scripts。Forge glass v1.1 的高透明设计目标以阅读性和平台回退为前提，具体决策见 [ADR 0006](decisions/0006-forge-design-system-architecture.md)。

Windows x64、macOS Intel、真实 Mac Retina/Windows DPI、Windows 原生字体与 scrollbar：**UNVERIFIED**。规格 T107 的暗色主题没有当前 glass v1.1 视觉基准；本轮保留浅色产品主题并记录冲突。T109 的业务卡片详情要等后续 Task UI，当前不冒充该验收。

## P0-06 · Git worktree 与进程树

核验日期：2026-09-23。当前机器 macOS 27.0 arm64；Node 22.22.0、Electron 44.4.3 内置 Node 24.21.0、Git 2.55.0。新增 `@forge/workspace`、`@forge/process` 两个内部 `workspace:*` 包，只复用已有的 `zod@4.6.4` 与 `@types/node@22.20.4`；无新增第三方包、原生模块或安装脚本，现有供应链策略不变。精确版本与许可证仍见 `versions.lock.json`、`docs/dependency-licenses.json`。

| 组合 | macOS arm64 实际结果 | 限制 |
| --- | --- | --- |
| Git worktree | 中文/空格/长路径下 detached SHA worktree 创建、检查、修改、移除；源仓库 HEAD、dirty marker 与 Git status 未改变；无需 `git worktree prune` | T047 正式 snapshot 与 T050 分支前移合并重验属于后续阶段 |
| Forge 直接进程 | Node `detached` 建独立 POSIX 进程组；父子孙终止、父先退出、超时强制停止、Run B 与非 Forge 用户进程保持运行、端口再绑定实测 | Linux 未测；PID/PGID journal 仅用于报告可能 orphan，不用于重启后自动 kill |
| Codex 命令树 | app-server 与命令不同 PGID；`turn/interrupt` 后实际三代命令 PID 消失、心跳停止，Forge 直接拥有的 app-server 组确认退出后才释放 worktree | 内部命令组依赖 Codex 当前中断行为；恶意自行脱组、上游未来版本与安装包未证实 |
| Host shutdown | Host Registry 停新 Run、取消 owned group；未释放的 workspace 标记 failed 留存诊断。Desktop 等待 Host shutdown 上限 8 秒 | 活动真实 Run 的 Electron utilityProcess Host 退出路径尚未端到端验证 |

Windows x64：**UNVERIFIED / 当前进程树 backend 不可用**。macOS Intel：**UNVERIFIED**。Git worktree 并非安全沙箱；本轮未证明任意读取、联网和故意脱组子进程被隔离。版本与清理决策见 [ADR 0005](decisions/0005-workspace-and-process-ownership.md)。官方依据：[Git worktree](https://git-scm.com/docs/git-worktree)、[Node child_process](https://nodejs.org/api/child_process.html)、[Node process.kill](https://nodejs.org/api/process.html)。

## P0-05 · Codex SDK 与 app-server 实测

核验日期：2026-09-23；macOS 27.0 arm64、Node 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、pnpm 12.3.4。`@openai/codex@0.155.1` 与 `@openai/codex-sdk@0.155.1` 均为 Apache-2.0，npm registry 解包大小分别 13,206 和 79,412 字节；lockfile 的 macOS arm64 可选平台二进制为 `@openai/codex@0.155.1-darwin-arm64`，实际下载约 127.46 MB。应用仍固定 `zod@4.6.4`、`@types/node@22.20.4`。11 个 workspace，当前 macOS arm64 依赖许可证清单 194 项；精确版本见 `versions.lock.json`，完整安装图见 `pnpm-lock.yaml`。没有启用 install script、sudo、全局安装或 API Key 配置。

| 验证项 | SDK 0.155.1 | app-server 0.155.1 |
| --- | --- | --- |
| 真实认证与只读 | 现有 ChatGPT CLI 登录下，独立临时 Git repo 只读 turn 成功；返回 thread ID、事件、实际 token usage | 同一登录下本地 stdio 初始化、模型列表、只读 turn 与结构化 JSON 输出成功；隔离 `CODEX_HOME` 返回 `EXECUTOR_AUTH_FAILED` |
| 文件写入 / streaming | 本轮未用 SDK 写入，不据此声称支持写任务 | 临时 fixture 中 `add(a,b)` 输入校验和测试真实修改，`npm test` 通过；最终 Host Registry 事件链 240 条顺序标准事件包含消息、命令、文件、usage、完成；临时父目录标记未变 |
| cancel / resume | SDK 公共 API 有 AbortSignal/resumeThread；本次未分别做真实取消/跨进程恢复 | `turn/interrupt` 在长命令启动后得到 cancelled；新连接与两个不同 PID 的 Node Host Registry 进程均持同一 thread ID 继续成功；不等于 Electron utilityProcess 重启或 Forge Attempt 自动恢复 |
| approval | TypeScript SDK 当前公开类型未提供本轮需要的客户端审批决议入口；真实 approve/reject 未验证 | 只读写入引发真实命令审批；approve 写入，reject 不写入；无自动批准 |
| sandbox / cwd | SDK `workingDirectory` + read-only 成功；未验证跨根拒绝 | fixture cwd 的读写/只读已实测；读权限完整隔离、网络策略未验证 |
| 模型 / usage / cost | 实际 token usage 可取；单独模型选择和结构化输出未测 | `model/list` 返回当前账号模型；先前 `gpt-6-luna`、最终实时选择的 `gpt-6-astra` 与 outputSchema 均成功；token usage 真实，费用未提供可靠值 |

当前 `pnpm probe:codex` 的 supported 布尔值只针对本机锁定版本下已经成功过的 Adapter 真实测试；版本、平台或登录不匹配则返回 false。`modelSelection=true` 和 `structuredOutput=true` 由最终显式选择当时 `model/list` 返回的 `gpt-6-astra`、通过 Adapter 获得结构化结果支持；模型列表会随账号状态变化，不能固定显示旧列表。`toolEvents=false` 专指尚未真实触发的 MCP tool-call；命令/文件活动已经作为独立标准事件到达。`networkPolicyEnforced=false`，不能用 prompt 代替强制网络隔离。`available=true` 是本地 CLI、登录和握手可用，**不代表上游模型请求即时可用**。

首次 `pnpm test:codex-live` 重跑在 app-server 只读阶段收到多个 `responseStreamDisconnected`（无 HTTP 状态），超过 120 秒未完成；之后 Adapter 结构化输出重跑也超时。检查本机环境变量名称后发现需使用无凭据本地代理，而本轮新加的子进程环境白名单遗漏代理变量。仅补入可解析且 URL 无用户信息的 HTTP(S) 代理后，直接只读和 Adapter 结构化输出单独通过，随后**整套 `pnpm test:codex-live` 通过**；这是修复后的真实证据，保留首次失败记录。默认 lint/typecheck/test/build 与 Desktop smoke 不依赖在线模型，已通过；上游长时稳定性、Windows x64、macOS Intel、Electron 打包后的 CLI 平台二进制路径、签名/公证仍待验证。

官方来源：[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[Codex app-server](https://learn.chatgpt.com/docs/app-server)。官方文档当前示例与锁定 CLI 0.155.1 的 `thread/start.sandbox`、`turn/start.sandboxPolicy.type` 枚举不同；本轮按实际错误响应和成功运行确认两个位置分别使用 kebab-case 与 camelCase。选型及运行边界见 [ADR 0004](decisions/0004-codex-integration-layer.md)。

## P0-04 · SQLite、N-API 与 Host 双运行时

核验日期：2026-09-23。环境为 macOS 27.0 arm64，pnpm 12.3.4。新增直接依赖：`better-sqlite3@13.0.3`（MIT，registry 解包 27,302,969 字节）、`drizzle-orm@0.45.3`（Apache-2.0，10,516,772 字节）、`@types/better-sqlite3@9.6.0`（MIT，9,548 字节）；Host/Persistence 共用已锁的 `@types/node@22.20.4`。具体精确版本见 `versions.lock.json`，当前平台安装树的 191 项许可证见 `docs/dependency-licenses.json`。

| 真实运行方式 | Node / Electron | modules ABI | 原生 SQLite 加载和构建结果 |
| --- | --- | --- | --- |
| 独立 Host：`pnpm dev:host`、构建后 `pnpm --filter @forge/host start` | Node 22.22.0；无 Electron | 127 | `darwin-arm64.node` 加载成功；SQLite 3.53.4；schema 2、FK/WAL、重启持久性通过。 |
| Electron `utilityProcess` Host：`pnpm dev:desktop` 与构建后 `pnpm smoke:desktop` | Electron 44.4.3，内置 Node 24.21.0 | 149 | 同一 N-API 平台预构建文件加载成功；真实 health 为 Storage ready、schema 2、WAL。无效 SQLite 文件显示 degraded，未伪报 ready。 |

`better-sqlite3` 13.0.3 的 npm 包包含 `prebuilds/darwin-arm64.node` 等目标平台文件，package `scripts` 没有 install/postinstall；本轮没有执行 `electron-rebuild`、node-gyp、sudo 或启用全局安装脚本。N-API 的跨运行时意图来自[项目 v13 发布说明](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)，但实际兼容性结论只限上表的本机加载结果。[Electron 原生模块文档](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)仍要求对原生模块打包和 ABI 保持检查。

正式 DB 默认属于 Forge 的用户应用数据目录，不在项目、源码或构建目录；dev/prod 分离，测试使用独立临时目录。单 Host 持有 SQLite 连接；Main 只传数据目录，Renderer/Preload 不获取路径或 SQL。迁移 v1/v2 与参考 `schema_migrations` 字段相符，未安装业务 DDL。启用 [SQLite WAL](https://www.sqlite.org/wal.html)、FK 和 busy timeout；备份使用[官方 backup API](https://www.sqlite.org/backup.html)。Drizzle 的 SQLite driver 选择符合[官方驱动说明](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)。健康契约扩展后协议版本明确升到 `forge-host-protocol/v2`，不会把旧 v1 静默视为兼容。

当前 `pnpm build` 只构建代码，原生 `.node` 仍从 workspace 安装图加载；这已实测，**不代表安装包验证**。`.asar` 外置、签名/公证、Windows x64 与 macOS Intel 的预构建文件加载和迁移仍待目标平台及打包产物验证。真实磁盘满、跨版本升级前备份和长时间运行未执行。详细决策见 `docs/decisions/0003-database-and-native-module-strategy.md`。

## P0-03 · 历史独立 Host 与本地协议

核验日期：2026-09-23。当前平台 macOS 27.0 arm64，本机 Node 22.22.0、pnpm 12.3.4；Electron 44.4.3 内置 Node 24.21.0。锁文件与 `versions.lock.json` 记录精确直接版本；当前安装树许可证清单为 187 项。新增第三方直接依赖只有 `zod@4.6.4`（MIT，npm registry `dist.unpackedSize` 6,138,878 字节），用于严格校验 Host wire/system 协议；Host 另复用已锁的 `@types/node@22.20.4`。`@forge/core`、`@forge/client`、`@forge/host` 与其他包使用 `workspace:*`，均是仓库内部私有包。

| 组合 | 本机结果 | 平台限制 |
| --- | --- | --- |
| Electron `utilityProcess` ↔ Host | 真实 Desktop smoke 中 ready → 协议及产品/Host 版本握手 → health → connected；异常退出被检测，关闭 Desktop 后 owned PID 消失。 | Windows x64、macOS Intel 和打包后路径未验证。 |
| 独立 Node Host | `pnpm dev:host` 实际生成随机 hostId、PID 和日志；Ctrl+C 后 PID 消失；真实 fork 集成测试通过。 | 仅本机 Node 22.22.0 实测。 |
| Host protocol / Zod | `forge-host-protocol/v1` 的输入输出 strict schema、未知命令拒绝、非法字段拒绝、版本失配、超时与断连测试通过。 | 后续业务 `command-envelope`、写命令持久幂等和 RemoteTransport 尚未实现。 |
| Vue/Web | 普通浏览器显示 `Local Host unavailable`，没有访问 Electron bridge；Desktop 复用同一 Vue App，真实健康与崩溃状态可见。 | 移动端/PWA 与远程 Host 未验证。 |

实现依据：[Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[Electron parentPort](https://www.electronjs.org/docs/latest/api/parent-port)、[Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)、[Zod 官方基础文档](https://zod.dev/basics)。这些官方资料确认私有子进程通信与 schema API；跨平台可靠性结论只来自上述 macOS arm64 本机测试，不外推至 Windows/Intel。当前本地 Host 不开放 HTTP/WebSocket/公网端口，Renderer 不能直接访问 Node、Electron IPC 或 Host；Main 只处理生命周期与受控通道。

`forge_spec_v1.0/contracts/command-envelope.schema.json` 面向业务命令，和本轮系统命令字段不同；差异及范围决策见 `docs/decisions/0002-host-process-and-system-protocol.md`。SQLite/Drizzle、Codex/Claude SDK 原生组合仍待后续任务。

## P0-02 · 历史 Desktop / Web 基线

核验日期：2026-09-23。版本由 `package.json`、各 workspace manifest、`pnpm-lock.yaml` 和 `versions.lock.json` 精确锁定。`pnpm install --frozen-lockfile` 在 macOS 27.0 arm64、Node 22.22.0、pnpm 12.3.4 上通过供应链策略检查。下表记录本轮新增的直接依赖；完整直接版本与 npm registry 许可证及解包大小见 `versions.lock.json`，186 项当前平台已安装依赖见 `docs/dependency-licenses.json`。

| 组件 | 精确版本 / 许可证 | 当前机器上的验证 |
| --- | --- | --- |
| Electron | 44.4.3 / MIT | macOS arm64 真实窗口、打包前的本地构建加载、Preload bridge 和 sandbox smoke 通过。内置 Node 24.21.0、modules ABI 149、N-API 10、Chromium 152.0.7977.130；这是 Electron 运行时版本，不等同于本机 Node 22.22.0 的 ABI 127。 |
| Vue | 3.5.43 / MIT | 普通 Web 浏览器与 Electron Renderer 使用同一 App；挂载测试、实际 Web 启动和 Desktop smoke 通过。 |
| Vite / Vue 插件 | 8.3.0 / 6.0.9，均 MIT | Web dev/build 与 Desktop `file://` 加载通过。Vite 8 官方要求 Node 20.19+ 或 22.12+；Vue 插件 peer 接受 Vite 8 / Vue 3。 |
| vue-tsc / Vitest / happy-dom | 3.3.11 / 5.0.1 / 20.14.5，均 MIT | strict Vue typecheck 与 3 项挂载测试通过。 |
| @types/node | Web 22.20.4、Desktop 24.9.0 / MIT | 两侧 TypeScript 检查通过；Desktop 声明版本对应 Electron 内置 Node 24 主版本。 |
| eslint-plugin-vue / globals | 10.11.0 / 17.12.0，均 MIT | Vue 单文件组件及 Web/Node globals lint 通过。 |
| playwright-core | 1.63.0 / Apache-2.0 | 真实 Electron smoke 在本机通过；其 Electron API 官方仍标为 experimental，不作为跨平台兼容性保证。 |

Electron 44.4.4 的 registry 发布时间为 2026-09-22T18:41:55Z，处于当前 pnpm 最短发布时间策略窗口内；冻结安装实际失败。最终选择 2026-09-18 发布的 44.4.3，并移除自动生成的例外配置；新的 lockfile 冻结安装通过。44.4.3 的第一次二进制下载因 `fetch failed` 失败，重试成功，说明首次启动仍依赖发布源网络。没有启用依赖安装脚本，也没有更改全局工具。

Electron 设置为 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`、`webviewTag: false`；Preload 只暴露冻结的 `{ platform }`，无通用 IPC/文件系统/Shell。macOS 真实 smoke 已读取运行中的 `webPreferences`，其前三项与配置一致。Windows x64、macOS Intel、不同 DPI、打包/签名、平台快捷键、SQLite/SDK 原生组合均未验证。

本轮官方核验来源：[Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)、[Electron 安装方式](https://www.electronjs.org/docs/latest/tutorial/installation)、[Vite 入门与 Node 要求](https://vite.dev/guide/)、[Vue 快速开始](https://vuejs.org/guide/quick-start.html)、[Playwright Electron API](https://playwright.dev/docs/api/class-electron)、[pnpm 设置](https://pnpm.io/settings)。各精确包的版本、license、engines、peer 与大小于 2026-09-23 从 npm registry 核验。当前本地运行结果只支持上述 macOS arm64 结论。

## P0-01 · 历史工具链基线

核验日期：2026-09-23。以下保留 P0-01 当时仅有工具链的记录；其中“Electron 未安装”等状态仅描述 P0-01 时点，不代表当前 P0-02 状态。

| 项目 | 锁定版本 | 许可证 | 本轮证据与结果 |
| --- | --- | --- | --- |
| Node.js | 本地/CI 基线 22.22.0；`engines` 接受 22.13.0–22.x | MIT | 本机 `node --version` = 22.22.0；`process.versions.modules` = 127、N-API = 10。只验证 macOS arm64 上本轮工具链。 |
| pnpm | 12.3.4 | MIT | 本机 `pnpm --version`；官方安装页确认 pnpm 12 支持 Node 22；冻结 lockfile 安装通过。 |
| TypeScript | 5.9.3 | Apache-2.0 | registry 精确版本/engines；与 typescript-eslint 的 `<6.1.0` peer 范围相符；strict typecheck 与构建通过。 |
| ESLint | 10.11.0 | MIT | 官方文档要求 Node `^22.13.0` 或兼容版本；registry 精确版本/engines；lint 通过。 |
| @eslint/js | 10.0.1 | MIT | registry peer 需要 ESLint `^10.0.0`；lint 通过。 |
| typescript-eslint | 8.70.1 | MIT | 官方 flat config 用法；registry peer 接受 ESLint 10 和 TypeScript 5.9；lint 通过。 |

上述直接依赖的分发方式为 npm registry 包，pnpm 使用内容寻址 store 和锁文件完整性字段。`versions.lock.json` 中的 `registryUnpackedBytes` 来自对应精确版本的 npm registry 元数据，不是 Forge 分发包体积；Electron 等原生分发物未安装，体积待测。`@forge/contracts` 为仓库内部私有包，不是第三方许可证项。

P0-01 当时 `docs/dependency-licenses.json` 有 96 项；该清单现已随 P0-03 更新为 187 项（不含外部 pnpm 可执行文件）。当前许可证类型为 MIT、Apache-2.0、BSD-2-Clause、BSD-3-Clause、ISC、BlueOak-1.0.0。跨平台可选依赖树还需在目标平台重新盘点。冻结安装报告锁文件通过供应链策略检查；本轮未进行漏洞审计或代码签名验证。

## 核验来源

- [pnpm 安装与 Node 兼容性](https://pnpm.io/installation)、[pnpm install 与冻结 lockfile](https://pnpm.io/cli/install)、[pnpm workspace](https://pnpm.io/workspaces)、[pnpm 12 设置位置](https://pnpm.io/settings)
- [ESLint 安装前置条件](https://eslint.org/docs/latest/use/getting-started)、[typescript-eslint flat config](https://typescript-eslint.io/getting-started/)
- [TypeScript 5.9 发布说明](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- 各精确版本、许可证、engines、peerDependencies 和解包大小：2026-09-23 执行 `pnpm view <name>@<version> version license engines peerDependencies dist.unpackedSize --json`，具体结果由 `versions.lock.json` 和本记录保存。

## P0-01 时点验证矩阵（历史）

| 组合 | 状态 | 后续任务 |
| --- | --- | --- |
| Electron + 内置 Node、macOS/Windows 启动及 IPC | 未安装、未验证 | P0-02 |
| Vue 3 + Vite 共享 UI | 未安装、未验证 | P0-02 |
| Host 独立入口与 CommandBus | 未实现、未验证 | P0-03 |
| SQLite/Drizzle 与 Electron/Node ABI | 未安装、未验证 | P0-04 |
| Codex SDK / CLI 真实认证、取消、恢复 | 未安装、未验证 | P0-05 |
| macOS Intel、Windows x64 | 无本轮实机结果 | 后续平台验证 |

参考矩阵在 `forge_spec_v1.0/docs/compatibility-record.md`；它仍保持原样。本记录不把本机 Node ABI 当作未来 Electron ABI。
