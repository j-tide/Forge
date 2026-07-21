# Forge 版本与兼容性记录

## 2026-09-25 · bundled Codex local enablement control

macOS arm64 当前源码上的 Electron 44.4.3 / Python 3.12.13 实测固定 Preload→Main→Host 停用通道、无活跃 Run 时 DisposableScope 清理、SQLite 偏好重启保存及重启装配。无新依赖、native 模块、外部凭据或模型费用。启用不热替换已绑定的调度器，必须退出并重开 Forge；原安装版 DMG 尚未包含该 UI/Host 改动，Windows/macOS Intel 未验证。`pnpm smoke:plugin-control` 的两张截图来自真实 Electron 开发构建而非原型。此修复不改变插件权限，也不使 Claude 可用。

## 2026-09-25 · P7-04 remote session loopback probe

macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Electron 44.4.3 / Vue 3.5.43；无新增 npm/PyPI 依赖、安装脚本、外部服务或付费调用。独立临时库从 schema31→32 真实迁移、online backup、数据保留和重启通过；Host 正常开发启动达 schema32，Renderer 安全桥不变。真实 127.0.0.1 HTTP 用例在 Host-owned SQLite event loop 上验证同源、Secure HttpOnly SameSite=Strict cookie、CSRF、rotation、revoke 和限速。该 HTTP 不代替**私网 HTTPS/真机浏览器**；已安装内部 Mac Demo 是先前 schema30 原 DMG，未重打包。Windows x64、macOS Intel、正式签名/升级、用户生产数据库迁移、代理证书和第二手机 **UNVERIFIED**。P6 公开发行与 Claude 第二执行器仍 BLOCKED。见 ADR 0078。

## 2026-09-25 · P7-03 local pairing

macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Electron 44.4.3 / Vue 3.5.43 当前开发路径；无新增 npm/PyPI 依赖、安装脚本、模型调用或网络监听。独立临时库 schema30→31 使用既有 WAL online backup 与事务 migration，保留旧 metadata、Project/Task/Run 数据模型，重启可读；真正用户生产目录升级 **UNVERIFIED**。当前已安装内部 DMG 的 bundled Host 仍是 schema30，SHA-256 和隔离 Demo 数据未变。真实 Python Host stdio、Electron arm64 smoke 和 185 Python pytest 通过。私网 HTTPS、手机、cookie session、CSRF、SSE、Windows x64、macOS Intel、签名、公证、正式升级仍 **UNVERIFIED**；Claude 在线验收继续 BLOCKED。见 ADR 0077。

## 2026-09-25 · Windows staging and offline update preflight

Windows x64 package/staged Host paths are implemented but have **not run on Windows**. The manual Windows QA workflow is not evidence until executed; there is no signed Windows installer, UAC/Chinese path/DPI/full-task or uninstall result. On macOS arm64, packaged Python path tests and an intentional Windows-builder platform rejection pass. Existing Electron 44.4.3/uv CPython 3.12.13 versions remain pinned. `cryptography==50.0.1` (Apache-2.0 OR BSD-3-Clause), already transitive in `python/uv.lock`, is now exact direct dependency for Ed25519 update preflight; [official PyPI metadata](https://pypi.org/project/cryptography/50.0.1/) lists Python 3.12 and Windows x64/macOS arm64 wheels, but Forge Windows use remains **UNVERIFIED**. Offline signed-fixture integrity and schema29→30 staged SQLite migration passed on current macOS; no production release public key, installed updater, Host-exclusive DB cutover, signed package or credential continuity has been tested. P6-07/P6-08 release acceptance remain BLOCKED; exact development exceptions do not pass P6 Gate.

## 2026-09-25 · Internal installed-app product workflow

The existing macOS arm64 `Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg` (SHA-256 `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`) was mounted and copied to a separate QA install location. Its packaged Electron 44.4.3 launched its bundled CPython 3.12.13 Host, SQLite schema30, production Web and plugin lock. A real Codex 0.155.1 run, independent Review, Verify, Owner acceptance, cancellation and restart durability passed against isolated data and a disposable Git repo. The installed app was launched with the current user's PATH and authorized ChatGPT login. With a clean Finder-like PATH and empty Codex home, the same package stayed healthy but reported Codex unavailable. Therefore Codex CLI/login/Git and any necessary approved proxy are external prerequisites; Finder PATH and fresh-user Codex discovery remain **UNVERIFIED**, not a self-contained claim. Full evidence and screenshots: `docs/demo/p6-internal-macos-package.md`. P6-06 signing/notarization/T111–T113 and Windows/macOS Intel remain **BLOCKED/UNVERIFIED**; the `P6-06 → P6-07` exception is development-only.

## P6-06 · 内部 Mac 包与分发门禁 · 2026-09-25

本机 macOS arm64、Electron 44.4.3、Node 22.22.0、pnpm 12.3.4、uv 0.11.14、uv-managed CPython 3.12.13、Python SQLite 3.50.4/schema30。`@electron/asar@4.3.0`（MIT，官方要求 Node >=22.12）精确锁定；其新增 `glob@13.0.6`、`minipass@7.1.3`、`path-scurry@2.0.2`、`lru-cache@11.5.3` 为 BlueOak-1.0.0，已列入许可证清单。依赖仅用于构建内部 `app.asar`，不开放安装脚本、权限或新网络端口。官方 [Electron 应用分发文档](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[签名文档](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[@electron/asar 4.3.0 release](https://github.com/electron/asar/releases/tag/v4.3.0)、[uv managed Python](https://docs.astral.sh/uv/concepts/python-versions/) 于 2026-09-25 核验。

真实 `pnpm package:mac:internal` 组装 ad-hoc 签名、未公证 `.app` 与经 `hdiutil verify` 的 DMG；`pnpm smoke:package:mac` 从挂载 DMG 拷贝到隔离 QA 安装目录，使用一次性用户数据根，Electron packaged 分支、Web UI、安全沙盒、包内 Python Host/SQLite schema30、退出归属 PID 清理和移除 app 后用户数据保留通过。`codesign --verify --deep --strict` 通过仅说明本机 ad-hoc 密封一致；`Signature=adhoc`、`TeamIdentifier=not set`，不能证明 Developer ID、公证或 Gatekeeper 分发。Keychain 当前只有 Apple Development 身份。macOS x64、真实新用户账号/系统 Gatekeeper、正式安装升级/回滚、凭据跨签名升级、Finder 启动 Codex、Windows 和 CI runner **UNVERIFIED**。P6-06 BLOCKED，完整 P4/Claude BLOCKED；见 ADR 0073。

## P6-05 · macOS Desktop window/tray and owned Host lifecycle

核验日期 2026-09-25。macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 的开发路径，未新增 npm/PyPI 依赖、数据库 schema、native addon、安装脚本或外部付费服务。真实 Codex app-server 长任务的关窗取消、托盘后台、第二实例复用原 Host、应用安全退出与归属 PID 消失已验证。损坏 SQLite 的 degraded Host 可提供零活跃工作摘要并正常关闭；crashed Host 退出需要明确确认。174 Python pytest/Ruff/mypy、TS test/lint/typecheck/build、真实 Desktop/诊断/生命周期 smoke 通过。macOS 实际系统休眠、正式签名包内托盘资源、Windows x64 托盘行为、macOS Intel、强制 Renderer 崩溃和物理 DPI **UNVERIFIED**；T003/T004/T005 仍递延，T002/T114 当前范围有真证据。P4-05/P4-10/full P4 Gate 继续 **BLOCKED**。见 [ADR 0072](decisions/0072-owned-host-window-and-tray-lifecycle.md)。

## P6-04 · Diagnostic bundle and imported artifact retention

核验日期 2026-09-25。macOS arm64 的 Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 开发路径上，Python-only Host 的增量 schema29→30 在独立临时数据库通过，旧 Artifact 在显式清理前仍可读取；清理仅使过期导入正文为空并保留墓碑，重启后不可读，较新记录不受影响。真实 Electron Settings 的预览/导出字节相同；含 token 日志和项目路径未入包。没有新 npm/PyPI 依赖、native module、安装脚本、网络端口或模型调用。`pnpm py:check` 173 测试/Ruff/严格 mypy、合约/任务图、TS lint/typecheck/test/build、真实 Desktop/诊断 smoke 均通过。Windows x64、macOS Intel、真实用户 DB 迁移、签名安装包与凭据跨升级 **UNVERIFIED**；T111～T114 及完整 T084 保留精确递延，P4-05/P4-10/full P4 Gate 仍 **BLOCKED**。见 [ADR 0071](decisions/0071-allowlisted-diagnostics-and-imported-artifact-retention.md)。

## P6-03 · Isolated local preview and saved Run diff

核验日期 2026-09-25。macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 版本不变；无新增 npm/PyPI 依赖、native artifact、数据库 migration 或安装脚本。真实 Electron 临时 localhost Preview `webContents` 在 ephemeral session 中没有 preload/Node/Forge bridge，sandbox/contextIsolation/webSecurity/disableDialogs 为 true；HTTP/WebSocket 跨 origin、`file:` 导航与新窗口被阻断。Playwright 1.63.0 对 `disableDialogs` 已压制的 alert 会发出失效 Dialog 事件，无法用该驱动宣称 JS/原生弹窗全项通过；T083 完整用例留 P6-09。T081 凭据引用与 T085 多层权限交集也留 P6-09；T084 导出预览留 P6-04。Windows、macOS Intel、安装包/签名、真实用户数据、原生文件选择/打印 **UNVERIFIED**。P4-05/P4-10/full P4 Gate 不变，Claude 未调用。见 [ADR 0070](decisions/0070-isolated-local-app-preview.md)。

## P6-02 · Keyboard, long Chinese text and layout stress

核验日期 2026-09-25。当前 macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 不变；无新依赖、native build、数据库 schema 或安装脚本。真实 Electron 离线 fixture 的 Ctrl/Cmd+K、嵌套焦点与 120 字中文 Task/长 Unicode Project 路径、Desktop 重启及抽屉焦点恢复通过。1280×800/1600×1000 的 CSS zoom 100/125/150% 只验证当前 Web 布局；媒体仿真的 reduced-motion 只验证 CSS 状态。Windows 150% 与 Mac Retina 物理 DPI **UNVERIFIED**，T108→P6-07；真实 Run/Workflow 减少动画全链 T110→P6-09。P4-05/P4-10/full P4 Gate 继续 BLOCKED，Claude 未调用。见 [ADR 0069](decisions/0069-keyboard-overlay-and-dpi-evidence.md)。

## P6-01 · Light/dark production tokens and read-only Workflow history

核验日期 2026-09-25。macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 的现有版本未变化；无新 npm/PyPI 依赖、native 构建、安装脚本或数据库 schema。真实 Electron 使用当前 Python Host 的 JSON-RPC stdio 和新增固定只读 `workflow.getPublished`，两端严校验，旧 RunConfig 不改变。浅/暗阅读卡实测正文对比 4.85:1 / 9.63:1，1280 CSS zoom 125% 非 Windows 系统 DPI 证明。Windows x64、macOS Intel、安装包/签名、真实用户 DB 升级仍 **UNVERIFIED**。T029 同一 fixture 的旧 Run/新发布版 UI 全链路仍归 P6-09，P4-05/P4-10/full P4 Gate **BLOCKED**；Claude 未调用。见 [ADR 0068](decisions/0068-p6-visual-theme-and-published-workflow-readback.md)。

## P5-12 · Populated schema25→29 upgrade and DSL version diagnostics

2026-09-25，在 macOS arm64/Python 3.12.13/SQLite 3.50.4/Electron 44.4.3/Vue 3.5.43 开发路径，含真实 P3 批准 Task、Run/RunConfig 与 P4 Profile 的独立 schema25 临时库升级到 schema29 并重复迁移后仍可读，`foreign_key_check` 无错误，备份存在。Python Host 与 Desktop 画布导入对未来 Workflow DSL schemaVersion 明确诊断；无自动降级或数据重写。171 Python pytest/Ruff/mypy、冻结安装、合同/任务图、TS lint/typecheck/test/build、真实 Desktop smoke 和 diff check 通过。没有新增依赖、安装脚本、网络端口或付费模型调用。生产参考 OpenAPI 仍仅描述未来远程 Gateway，本地 JSON-RPC stdio 继续使用 `forge-local-jsonrpc/v1`；不宣称 HTTP 可用。P5 Phase Gate 在共用 DSL 与已验证 quick 链的开发范围通过，Planner/strict 运行没有验收。实际用户数据、Windows x64、macOS Intel、安装包/签名、DPI **UNVERIFIED**；P4 full Gate 仍 BLOCKED。见 [P5 报告](p5-completion-report.md)。

## P5-11 · Published linear Workflow / retrieval freeze

2026-09-25，macOS arm64 的 Electron 44.4.3、Vue 3.5.43、Python 3.12.13 与 SQLite 3.50.4 开发路径：真实 Codex app-server 经 Python Host 在已发布 quick 同语义四阶段链上形成开发快照，独立 Verify/Review/人工最终验收完成；另一次知识 Run 的当前引用被撤销后，Desktop 历史上下文正确标记 revoked。实际本机 schema29，未新增 npm/PyPI 依赖、安装脚本、数据库迁移、网络端口或 Renderer Node/SQL 权限；没有 Claude/Anthropic 调用。自定义工作流运行只支持严格线性四节点，其他发布定义仍可编辑但执行时拒绝。全局 16 次尝试预算在真实 SQLite/Verifier fixture 中触发 blocked；默认旧 standard 路径仍为 20。`pnpm py:check` 169 测试及全量 TS/合约/任务图/Desktop smoke 结果见实施状态。P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED；Windows x64、macOS Intel、安装包、真实用户库升级、非线性图及第二 Executor **UNVERIFIED/UNSUPPORTED**。见 ADR 0067。

## P5-10 · Memory Center Desktop bridge and Vue UI

2026-09-25，在 macOS arm64 的 Electron 44.4.3/Vue 3.5.43/TypeScript strict/Python 3.12.13/SQLite 3.50.4 开发路径，固定 `invokeMemory` 与 Pydantic/Zod 双侧封闭命令、候选编辑 CAS、人工确认/撤销、FTS 清理及实际窗口交互通过。截图 `output/playwright/p5-10-memory-desktop.png` 来自真实 Electron。未新增依赖、安装脚本、网络端口、Renderer Node/SQL 能力或付费模型调用。实际用户 DB、Windows x64、macOS Intel、安装包/不同 DPI **UNVERIFIED**；历史 Run 来源撤销显示留 P5-11，见 ADR 0066。P4-05/P4-10/full P4 Gate 不变。

## P5-09 · Host-owned Project Memory / SQLite schema29

2026-09-25 在 macOS arm64、Python 3.12.13、SQLite 3.50.4 上，独立临时库从既有迁移链增量到 schema29；真实 Python Host JSON-RPC 与 162 个 Python pytest、Ruff、严格 mypy、TS lint/typecheck/test/build 和 Electron Desktop smoke 通过。FTS5 trigram 仅索引经过确认的有效记忆；撤销清空正文和索引、保留审计事件。只读数据库也逐项校验过期和来源，避免失效事实进入结果。本轮无新 PyPI/npm 依赖、native addon、安装脚本、网络端口、Renderer DB/文件权限或付费模型调用。Windows x64、macOS Intel、安装包内 SQLite FTS5 和真实用户 DB 28→29 升级 **UNVERIFIED**。P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED，见 ADR 0065。

## P5-08 · Python Stage Context Builder

核验日期：2026-09-25。macOS arm64、Python 3.12.13/SQLite 3.50.4、Electron 44.4.3/Vue 3.5.43 的现有依赖图上实现只读 Stage Context 预览；没有新增依赖、安装脚本、SQLite migration 或模型调用。真实 Host 测试及 Vue UI 测试通过；真实 Electron bridge 验证未知 Run 的明确错误，尚无成功预览的 Electron 截图。UTF-16 字符预算不代表 Codex/Claude 的实际 token 费用。Windows/Intel/安装包/真实用户 DB 升级 **UNVERIFIED**；P4-05/P4-10/full P4 Gate 不变。见 ADR 0064。

## P5-07 · SQLite FTS5 / 中文字符索引

核验日期：2026-09-25。macOS arm64、Python 3.12.13、SQLite 3.50.4 的真实 Python Host 和构建后 Electron Desktop 已运行 schema28 FTS5 trigram；Python/Host/真实 Desktop 的中文短词、`start_date`、跨项目范围和索引撤销测试通过。没有新增 npm/Python 依赖、安装脚本或模型调用。`pnpm smoke:desktop` 使用独立临时数据目录，不改真实用户数据库。Windows x64、macOS Intel、安装包内 SQLite FTS5 支持及真实用户库 schema27→28 升级 **UNVERIFIED**；P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED。详见 ADR 0063。

## P5-06 · Project document ingestion · 2026-09-24

Python Host 在 macOS arm64/Python 3.12.13/SQLite 3.50.4 上以增量 schema27 真正读入受信 fixture 文档、保留 SHA-256/行号，并在撤销时保留无正文墓碑。Electron 44.4.3 + Vue 3.5.43 的实际 Desktop smoke 完成导入、定位、撤销；Node/Renderer 不能直接读取源码。未新增 pnpm/PyPI 依赖、native binary 或安装脚本。Windows x64、macOS Intel、真实用户数据迁移、安装包及高并发恶意文件替换 **UNVERIFIED**。P5-07 的 FTS/中文检索与缓存一致性尚未验证，不能将导入成功当作检索成功。

## P5-05 · Workflow revision locks · 2026-09-24

沿用 Python 3.12.13、SQLite 3.50.4、schema26 与 `forge-host-protocol/v5`；无新增依赖、native binary、安装脚本或数据库 migration。macOS arm64 的真实 SQLite/Host/RunConfig/RunService fixture 验证旧 Run 的 v1/hash 在发布 v2 时不变，新 Run 可明确冻结 v2/hash，重启后保留；Electron smoke 验证只读影响预览。自定义 Workflow 节点运行、Windows x64、macOS Intel、安装包/签名、真实用户数据库升级仍 **UNVERIFIED**。

## P5-04 · Vue Flow canvas · 2026-09-24

macOS arm64 上 `@vue-flow/core@1.48.2` 与 Vue 3.5.43、Vite 8.3.0、Electron 44.4.3 的实际构建和真实窗口 smoke 通过；画布节点、有限返工连线、Host 编译错误高亮和 JSON 往返均在真实 Vue 界面验证。`zod@4.6.4` 是既有精确锁定的工作区版本，现作为 Web 画布文档的直接依赖。Vue Flow 为 MIT、无本轮授权的安装脚本；参考 [官方文档](https://vueflow.dev/)与[仓库许可证](https://github.com/bcakmakoglu/vue-flow/blob/master/LICENSE)。Windows x64、macOS Intel、安装包和不同 DPI 尚未实测；本轮结论只适用于当前 macOS arm64 开发运行时。

## P5-03 · Linear Workflow editor and SQLite schema26

核验日期：2026-09-24；macOS arm64。无新增 pnpm/PyPI 依赖、native addon、安装脚本、网络端口或模型调用。Python SQLite 从 schema25 增量到26，增加 `workflow_drafts` 与对齐参考 SQL 字段的不可变 `workflow_revisions`；临时库迁移/重启/回滚通过，真实用户数据目录升级仍 **UNVERIFIED**。Electron Main/Preload 新增一个固定 `invokeWorkflow` 方法，按精确命令白名单和 TS/Python 双端 Schema 校验；Renderer 仍无 Node/DB/任意 Host 方法。真实 Electron/Python Host 成功保存并发布由本机已验证 Codex Profile 绑定的 quick 模板副本，同时拒绝缺绑定/循环草稿的发布。截图：`output/playwright/p5-03-workflow-desktop.png`。自定义 Workflow 执行、旧 Run 版本冻结、Windows x64、macOS Intel、安装包/签名仍 **UNVERIFIED**。完整 P4 Gate 继续 BLOCKED。见 ADR 0059。

## P5-02 · Python Workflow compiler

核验日期：2026-09-24；macOS arm64 开发路径。沿用 Python 3.12.13、Pydantic v2 与现有 pnpm/uv 锁；不新增依赖、安装脚本、native addon、SQLite migration、网络端口或 Renderer 桥。固定 Host 方法只读预检并在缺少实际 Planner/Verifier 绑定时返回不可运行。冻结安装、contracts/task-map、145 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、真实 Electron smoke 与 diff check 全部通过。三种完整 Workflow 的可执行性、发布版本冻结与运行时行为仍 **UNVERIFIED**；Windows x64、macOS Intel、安装包和签名仍 **UNVERIFIED**。P4-05/P4-10 与完整 P4 Gate 继续 BLOCKED。见 ADR 0058。

## P5-01 · Bundled workflow presets

核验日期：2026-09-24；macOS arm64 开发路径。Python Host 用随 wheel 打包的标准/快速/严格 JSON 定义和 Pydantic 严格类型，不依赖运行时参考目录，不新增 PyPI/npm 包、native addon、安装脚本、SQLite migration、端口或 Renderer 权限。`uv build` 的 wheel 含三份模板；参考 Workflow Schema 校验与本地静态拒绝测试通过，冻结安装、合同/任务图、TS lint/typecheck/test/build、Electron smoke 和 diff check 通过。完整 Workflow 编译器、Planner 运行、已安装绑定/能力匹配、模板发布/版本冻结和三模式端到端运行尚未验证；Windows x64、macOS Intel、发布安装包 **UNVERIFIED**。P4-05/P4-10/P4 Gate 仍 BLOCKED。见 ADR 0057。

## P4-10 · Bounded plugin acceptance and single-Executor development gate

核验日期：2026-09-24；macOS arm64 开发环境，现有 Codex 登录，无 Anthropic Key/在线请求。未新增依赖、native addon、安装脚本、SQLite migration 或 Renderer 权限。局部 Registry adapter 替换 fixture 和 134 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、合同/任务图、真实 Electron smoke 均通过。真实 Codex/Python Host Desktop 全链第一次 Review 无结构化结果而正确失败；一次有限重试通过开发、Verify、Review、人审和显式本地合并。不同的第二 Executor、Claude 在线认证失效、生产 Verifier 插件替换、正式 T116～T120 评测、Windows x64、macOS Intel、发布安装包与签名均 **UNVERIFIED**。P4-05/P4-10/P4 完整 Gate 继续 BLOCKED；P5 仅有开发排期例外。见 `docs/p4-development-scope-report.md`。

## P4-09 · Plugin fault diagnostics

核验日期：2026-09-24；macOS arm64 开发路径。沿用 Python 3.12.13、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、SQLite schema25 与 Codex 0.155.1；无新增依赖、native addon、安装脚本、数据库 migration、任意 Renderer IPC 或外部网络服务。受信内置插件激活/运行/卸载异常只输出稳定安全 code、pluginId、时间和受影响 Run ID。真实 Host/SQLite 项目及 Board 读路径在插件激活失败后仍可用；133 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、真实 Electron smoke、合同/任务图与 diff check 通过。未知第三方插件进程崩溃、恶意同进程 Python 代码、Windows x64、macOS Intel 和发布安装包 **UNVERIFIED**。Claude 运行中凭据失效未在线执行；P4-05 BLOCKED。见 ADR 0056。

## P4-08 · Controlled Tool/MCP contract

核验日期：2026-09-24；macOS arm64 开发路径。`jsonschema==4.26.0`（MIT，Python ≥3.10）由既有传递依赖提升为精确直接依赖；`types-jsonschema==4.26.0.20260518`（Apache-2.0，Python ≥3.10）仅供严格 mypy。版本记录与 uv 锁已更新，没有新 native addon、安装脚本、外部 MCP 服务、数据库迁移或 Renderer 权限。实际运行 128 Python pytest/Ruff/严格 mypy、冻结安装、合同/任务图、TS lint/typecheck/test/build、Electron Desktop smoke 和 diff check，均通过。T076～T080 是本地工具契约和 MCP fixture；任意第三方 MCP 服务的认证、进程/网络所有权及安全隔离未启用/未验收。Windows x64、macOS Intel 与发布安装包 **UNVERIFIED**。见 ADR 0055。

## P4-07 · Python ModelProvider and Codex app-server

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Codex CLI/app-server 0.155.1，现有本机 Codex 登录。锁定内置插件从 `0.0.1` 升为 `0.0.2`（manifest/entry/config 三文件内容 hash 重新计算）；没有新增 PyPI/npm 包、安装脚本或凭据。Python ModelProvider 的 Codex 实现与 Coding Executor 分离；真实 app-server 会话返回结构化 JSON、10 条文本增量及 `thread/tokenUsage/updated` 的 20,629 输入/15 输出 tokens。Usage 事件缺失时保持 `null`；没有从文本估算。官方 [Codex App Server 协议](https://learn.chatgpt.com/docs/app-server) 有 `model/list`、`item/agentMessage/delta`、`thread/tokenUsage/updated`；实际字段由本机 0.155.1 CLI 生成的 Schema 和实测确认。该协议未文档化 turn 级可执行 token 上限，Codex 收到非空 token 限额请求会拒绝，Forge 仅强制执行字节/时间边界。

`pnpm test:python-refiner-live` 独立 Host 草稿与人工审批通过；`FORGE_MODEL_PROVIDER=disabled` 经 Desktop 环境白名单传给 Host，真实离线手工闭环和 TODO 重启恢复通过。普通 Web 不获得本地模型能力。P4-07 完整冻结安装、契约/任务图、121 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、Desktop smoke 与 diff check 通过。旧版插件 hash 冻结在原 RunConfig 中，不把运行中旧版本自动升级或静默续接。Claude/其他 Provider 认证、Windows x64、macOS Intel、安装包与签名仍 **UNVERIFIED**；P4-05 BLOCKED，完整 P4 Gate 未通过。见 ADR 0054。

## P4-06 · Codex-only development dependency exception

核验日期：2026-09-24。公共 Python Executor 契约、现有 Codex app-server 路径、P2/P3 真实闭环和既有只读/审批门禁可用于不依赖 Claude 执行的开发。用户授权的例外仅允许 P4-05→P4-06，及以后完成适用 P4 验收才可能启用的 P4-10→P5-01；权威依赖不变，P4-05 仍 BLOCKED。Claude 未配置 Key、未注册 Adapter、未运行模型，不能宣称可用。完整 P4 Gate 与多执行器发布验收未通过。P4-06 在 macOS arm64 的 Electron→Python Host→Codex 路径上实测 Developer Profile 编码与 Reviewer Profile 只读审查；schema v25 升级与重启保留已有数据的独立临时库测试通过。冻结 pnpm/uv 安装、contracts/task-map、115 Python pytest/Ruff/严格 mypy 46 源文件、TS lint/typecheck/test/build、Electron smoke、diff check 通过；没有新增依赖或许可证变动。Claude 仍不可选，T041 双真实执行器与 P4 完整 Gate 待验。macOS arm64 开发路径是当前证据；Windows x64、macOS Intel、安装包、签名、DPI、真实用户库升级与历史 Codex utilityProcess crash recovery 均 **UNVERIFIED**。见 ADR 0052。

## P4-05 · Claude Agent SDK offline compatibility gate

核验日期：2026-09-24。官方 [Agent SDK 概览](https://code.claude.com/docs/en/agent-sdk/overview) 和 [Python SDK 参考](https://code.claude.com/docs/en/agent-sdk/python) 确认 Python SDK 可管理会话/工具/权限/流；第三方产品认证应走 API Key，不借用 claude.ai 订阅登录。官方 [v0.2.159 release](https://github.com/anthropics/claude-agent-sdk-python/releases/tag/v0.2.159) 对应本轮精确版本。`python/uv.lock` 固定 `claude-agent-sdk==0.2.159`；macOS arm64、Python 3.12.13、uv 0.11.14 的真实受控子进程加载随包 Claude Code CLI `2.1.281` 并只调用 `--version`。`pnpm probe:claude-offline` 返回 `apiKeyConfigured=false`、`liveVerified=false`；无 API 请求、Agent、模型、审批、续接、取消或打包验证。当前本机 `claude` 用户 CLI 2.1.159 不是 Forge SDK 随包 CLI，也未用于 Forge 认证。

SDK Python 代码的包许可证为 MIT；SDK/CLI 服务使用还受 [Anthropic Commercial Terms](https://code.claude.com/docs/en/agent-sdk/overview#license-and-terms) 约束。新增 SDK 直接依赖和 26 个锁定传递依赖，含 `mcp 2.2.0`、`cryptography 50.0.1` 与 `uvicorn 0.53.0`；只作为 SDK 依赖安装，Forge 本地通信未启动 HTTP/TCP Server。许可证见 `docs/python-dependency-licenses.json`；Windows-only `pywin32` 与 Pyodide-only `httpx2-jsfetch` 仅锁定、当前 macOS 未安装，其许可取 PyPI 包元数据。安装使用项目本地 uv 冻结环境，没有全局配置、sudo 或绕过安装脚本。Windows x64、macOS Intel、打包后的随包二进制、认证/网络/事件、SDK CLI 子进程的整树取消与任何真实 Claude Run 均 **UNVERIFIED**。P4-05 **BLOCKED**，见 ADR 0052。

## P4-04 · Plugin schema form and inspection

核验日期：2026-09-24。macOS arm64，Electron 44.4.3、Vue 3.5.43、Vite 8.3.0、Python 3.12.13；独立 Python Host 与实际 Desktop bridge 返回锁校验的内置 `forge.executor.codex@0.0.1` 空配置 Schema，正式插件页在真实 Electron 中打开并截图。`pnpm smoke:desktop` 还验证 sandbox/contextIsolation、无 Node Renderer、degraded/crashed/owned Host cleanup。当前只是受限配置表单与只读兼容诊断；未创建/存储凭据，未保存插件配置，未测试任意第三方插件。T106～T110 的跨页面/双主题/Windows DPI/完整动效部分映射至 P6，未标通过。无依赖、native、SQLite 或锁文件版本变动；Windows x64、macOS Intel、暗主题、安装包和签名路径 **UNVERIFIED**。见 ADR 0051。

## P4-03 · Bundled plugin package lock and Run lease

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、Electron 44.4.3、SQLite 3.50.4/schema24、Codex CLI/app-server 0.155.1。内置插件 `forge.executor.codex@0.0.1` 的 manifest/entry/config 三文件 SHA-256 与包摘要固化在随 wheel 打包的 `plugins.lock.json`；真实 wheel/sdist 构建含四文件。无新 PyPI/npm 依赖、native addon、安装脚本、TCP 或 SQLite migration。真实 Electron→Python Host→Codex Run 的隔离 SQLite RunConfig 保存了插件 ID/版本/内容 hash；完整 Verify/Review/人审/本地合并回归与真实 Desktop smoke/schema24 通过。首次 P3 live 在直接注入测试 Executor 时遇门禁，修复为仅对 Registry-owned 生产 Adapter 生效后完整重跑 exit 0。108 Python pytest、Ruff/严格 mypy、TS lint/typecheck/test/build 通过。锁是同一应用包的完整性约束，不是第三方签名或 OS 沙箱；Windows x64、macOS Intel、发布安装包及真实运行中替换物理插件文件仍 **UNVERIFIED**。见 ADR 0050。

## P4-02 · Python plugin resource scope

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、Electron 44.4.3、SQLite 3.50.4/schema24。仅使用 Python 标准库 asyncio/importlib 与现有 Pydantic；无新增直接/间接包、native addon、安装脚本、TCP 服务或数据库 migration。`DisposableScope` 对同步/异步资源逆序清理，注册句柄幂等；10 次真实 Python 子进程激活/停用均等待自身 PID 退出。105 Python pytest、Ruff/严格 mypy、TS lint/typecheck/test/build、真实 Electron Desktop smoke 和任务图校验通过。当前受信 Codex 插件仍是 Python Host 同进程模块，资源生命周期不构成恶意插件沙箱；Windows x64、macOS Intel、安装包内插件和真实 Codex 长 Run 期间热升级仍 **UNVERIFIED**。见 ADR 0049。

## P4-01 · Python bundled plugin manifest preflight

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、Electron 44.4.3、SQLite 3.50.4/schema24、Codex CLI/app-server 0.155.1。Python API `1.0.0` 与插件 `forgeApiRange` 使用明确 exact/caret 范围解析，和产品版本 `0.0.1` 分开；当前受信 Codex 清单为插件 `0.0.1`/`^1.0.0`，只声明 darwin-arm64。Pydantic 2.13.5 校验公开清单形状，标准库检查包内来源和闭合配置 Schema；没有新包、安装脚本、native addon、网络端口或 SQL migration。98 Python pytest、Ruff/严格 mypy、TS 检查/构建、真实 Electron Desktop smoke/schema24、Codex 本机探测和 diff check 通过。错误清单与 import sentinel 证明非法声明在 entry 执行前被拒；这不等于任意第三方 Python 代码沙箱或 Windows/Intel 已通过。安装包内插件数据路径、Windows x64、macOS Intel、第三方插件故障隔离仍 **UNVERIFIED**。见 ADR 0048。

## P3-12 · Python-only Desktop delivery acceptance

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema24、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Electron→Python Host→Codex 的开发/Verify/Review/人审/显式本地合并及另一套 Electron 混合状态 Board 路径通过；六个隔离 Git/SQLite/进程异常场景通过，正式 P3 截图已目视核对。冻结 pnpm/uv 锁未新增依赖、native addon、安装脚本、TCP 或 Renderer 权限；`pnpm py:check` 83 pytest、Ruff/严格 mypy 和 TS lint/typecheck/test/build、Desktop smoke/schema24 均通过。T116–T120 Agent 评测仍分别映射 P6-09/P9-06 为 `DEFERRED_VERIFICATION`，不是 P3 已通过的测试。真实用户 DB v23→24、Windows x64、macOS Intel、打包后 Python/Codex、安装包/签名/DPI、在线模型强制二次 Review 退回及恶意第三方插件隔离仍 **UNVERIFIED**。见 ADR 0047 与 P3 报告。

## P3-11 · Python SQLite backup/artifact storage, schema v24

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema24、Electron 44.4.3、Vue 3.5.43、Node 22.22.0。使用 Python 标准库 `sqlite3.Connection.backup`，无需 native addon、新包、安装脚本、全局工具或本地 TCP。独立 SQLite/子进程/Host 实测 WAL 在线备份、恢复、FK、v23→24 升级前备份、失败 migration 回滚、真实 SQLite FULL 诊断及私有 Artifact 导入；Desktop smoke 在实际 Python Host 上返回 schema24 并验证 ready/degraded/crashed。插件存储 API 仅提供 manifest-scoped JSON 接口，不代表恶意同进程代码已被 OS 隔离。数据库备份覆盖其内的正式元数据与导入证据，不覆盖外部 Git CodeSnapshot 对象。真实用户库升级、备份的长期轮转/离机恢复、Windows x64、macOS Intel、安装包内 Python/SQLite/Codex、DPI、签名与第三方插件隔离仍 **UNVERIFIED**。见 ADR 0046。

## P3-10 · Python Task revision invalidation and SQLite v23

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema23、Electron 44.4.3、Vue 3.5.43、Node 22.22.0。新增 additive migration v23 与固定 task.change JSON-RPC；无新第三方依赖、native addon、install script、TCP、凭据或 Renderer Node 权限。隔离真实 SQLite/Git、独立 Python Host 重启和 Electron smoke 验证版本记录、旧 RunConfig 保留、当前报告失效及 schema23 健康状态；没有真实 Codex 在中途收到目标修改的在线测试。现有用户数据库 v22→23 升级、Windows x64、macOS Intel、安装包内 Python/SQLite/Codex、系统 DPI、签名及安全接管旧进程仍 **UNVERIFIED**。见 ADR 0045。

## P3-09 · Python Host crash recovery and merge reconciliation

核验日期：2026-09-24；macOS arm64、Python 3.12.13、SQLite 3.50.4/schema22、Electron 44.4.3、Vue 3.5.43、Node 22.22.0。无新增依赖、原生扩展或安装脚本；沿用冻结 pnpm/uv 锁。隔离进程的实际 `os._exit` 注入验证持久 intent 前后 Git commit 的启动对账，不会自动重做合并；真实 Run/lease/journal fixture 验证保留不确定状态与 PID reuse 防护。普通 Electron Desktop smoke 仍通过 Python-only Host 的 ready/degraded/crashed、安全桥与退出；**没有把真实 Codex Host 硬崩溃后的孤儿进程自动清理或原生续接标为通过**。历史 PID 的 kernel start identity 无跨进程可确认来源，本版只报告并隔离，绝不按 PID 猜测杀进程。真实用户旧 DB、Windows x64、macOS Intel、安装包内 Python/Git/Codex、签名/DPI 与外部并发 Git 写者仍 **UNVERIFIED**。见 ADR 0044。

## P3-08 · Python delivery/merge and SQLite v22

核验日期：2026-09-24。macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 22、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Git/SQLite/Host JSON-RPC 验证显式本地双父合并、重复操作键、Git 成功后 Host 重启对账、目标分支前移拒绝、验收后证据变化失效；真实 Electron→Python Host→Codex 的开发/Verify/Review/人审/合并纵向链通过。原生确认取消不创建操作；正式 UI 只更新本地 `main`，无 push/deploy。migration v21→22 仅增加不可变交付与 merge intent 表，隔离库旧 metadata 保留、重复 migration 不重放；真实用户现有数据库升级 **UNVERIFIED**。无新直接依赖、安装脚本、native addon、TCP 服务或 Renderer Node 权限。Git 合并在 Host 线程内有界执行，SQLite 连接未跨线程；并发外部 Git 写者、长合并操作、Windows x64、macOS Intel、安装包内 Python/Git/Codex、签名/DPI、Host 硬崩溃孤儿清理仍 **UNVERIFIED**。T057 通用外部 Artifact 路径/MIME 校验仍属 P3-11。见 ADR 0043。

## P3-07 · Python final acceptance and SQLite v21

核验日期：2026-09-24。macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 21、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。独立 Git/SQLite/Host 测试覆盖证据哈希 CAS、旧快照拒绝、明确 AC 决定、非安全 Reviewer 建议的 Owner 版本化豁免、阻断 Issue 拒绝豁免、接受持久性和人工退回新 Attempt；真实 Electron→Python Host→Codex 完成开发/Verify/Review/最终验收，Board Done 而源 Git 未变。migration v20→21 仅附加两张不可变决定表，隔离库旧记录保持；真实用户现有数据库升级 **UNVERIFIED**。无新增包、install script、native addon、凭据、TCP 服务或 Renderer 权限。真实 Codex 本次未返回 advisory，因此在线豁免路径 **UNVERIFIED**；Host/Git/SQLite fixture 和 Vue 测试通过。Windows x64、macOS Intel、安装包内 Python/Codex、DPI/签名、Host 硬崩溃未知副作用对账（T034→P3-09）仍 **UNVERIFIED**。见 ADR 0042。

## P3-06 · Python bounded rework and SQLite v20

核验日期：2026-09-24。macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 20、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Git/SQLite/owned subprocess 测试覆盖 Review/Verify 共用返工计数、失败快照的独立新 Attempt、三次/二十次上限、取消停止与 source repo 无修改；真实 Electron→Python Host→Codex 开发及通过的 Verify 作纵向回归，但未强制制造 live Codex Review blocker。v19→20 只增加 `rework_cycles`，隔离库中升级与旧数据留存通过；实际用户已有数据库升级 **UNVERIFIED**。没有新增包、安装脚本、native addon、凭据、本地 TCP 或 Renderer 权限。Host 突然死亡后的未知副作用对账 T034 在 P3-09；Windows x64、macOS Intel、安装包内 Python/Codex、签名/DPI 和真实上游 429 **UNVERIFIED**。见 ADR 0041。

## P3-05 · Python acceptance matrix and SQLite v19

核验日期：2026-09-24。macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema 19、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实独立 Python Host、Git/SQLite/子进程和 Electron 固定 bridge 证明逐条 AC 保持 `inconclusive` 直至用户将当前快照的真实报告和理由明确绑定；错误退出不通过，风险接受与覆盖状态不等于最终 Task Done。v18→19 在隔离库真实升级、旧 metadata 保留、重复 migration 无新增变更；真实用户现有库升级 **UNVERIFIED**。UI 真实截图 `output/playwright/p3-05-python-desktop-acceptance-1440x900.png` 已查看。没有新直接依赖、install script、native addon、TCP 服务或凭据；沿用已有 pnpm/uv 锁定版本。Windows x64、macOS Intel、安装包内 Python/Codex、Host 硬崩溃恢复及 T055 正式 Owner 风险接受 actor/version **UNVERIFIED**，后者在 P3-07。见 ADR 0040。

## P3-04 · Python project command verifier and SQLite v18

核验日期：2026-09-24。当前 macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 18、Electron 44.4.3、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Git/SQLite/ProcessController 测试确认批准 argv 的 PASS 文本不能覆盖 exit 7，超时不报成功，无 test 为 `not_configured`，输出证据按项目 UUID 限定、固定 `text/plain`、有界且脱敏；验证副本可删除而源 Git 不变。真实 Electron 固定桥→Python Host→Codex 开发快照→批准 Node 测试 Preset 的纵向链路返回 `passed`/exit 0，快照 `ca377444-d54a-4b09-92cf-4b5c07f2a593`，Verify Job `295339f0-1ef1-4242-b06e-8626419a2924`。v18 只新增 Verifier Job/Report/Artifact 表和不可变触发器，隔离库 v17→18、重启持久和 Host 独立进程通过；用户现有数据库升级 **UNVERIFIED**。没有新增依赖或 install script，使用已有 Python 标准库、Pydantic 和 Git。项目脚本有本机执行能力，当前依赖 Project Trust 与明确批准的 CommandPreset；不声称恶意脚本被 OS 沙箱限制。Windows x64、macOS Intel、安装包内 Python/Node/Git、Host 意外死亡后的进程孤儿清理与通用外部报告文件导入 **UNVERIFIED**；T057/T059/T060 延后追踪。见 ADR 0039。

## P3-03 · Python Review job, SQLite v17 and Desktop read-only Reviewer

核验日期：2026-09-24。macOS arm64、Python 3.12.13、SQLite 3.50.4/schema 17、Electron 44.4.3、Vue 3.5.43、Codex CLI/app-server 0.155.1 与本机现有 gpt-6-sol 认证。真实 Electron/固定桥→独立 Python Host→Codex 完成开发快照后的原生只读 Review，并返回结构化 `approved` 报告；来源 Git 未变，UI 实际截图在 `output/playwright/p3-03-python-desktop-review-1440x900.png`。SQLite v17 只增 Job/Report/Issue/Occurrence/Handoff 表和不可变触发器；隔离库的 v15/16→17、重启持久性与外键通过，实际用户已有数据库升级 **UNVERIFIED**。没有新增 Python/npm 依赖、native addon、install script、凭据或本地网络服务；Review 仍走版本化 stdio。Windows x64、macOS Intel、安装包内 Python/Codex、真实用户数据库、Host 意外死亡后的 Codex orphan 恢复 **UNVERIFIED**。见 ADR 0038。

## P3-02 · Reviewer structured output

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Pydantic 2.13.5、Codex CLI/app-server 0.155.1、gpt-6-sol。在真实固定 CodeSnapshot 的只读审查副本中，Codex 的 `run.completed.structuredOutput` 满足本地 `ReviewResult` Schema，实际结果为 `inconclusive`（输入未含完整 Diff），未当成批准。真实读取命令事件可观察，另一次写入审批被拒且无文件变化。生产 Reviewer Profile 与 prompt 随 wheel 打包；参考 Profile 的 `codex-sdk` 名称保留，生产映射为 `executor.codex`。本任务未新增第三方依赖、安装脚本、数据库迁移、Renderer IPC 或凭据。Windows x64、macOS Intel、安装包内可执行文件/沙箱行为及 Host 异常死亡恢复 **UNVERIFIED**。见 ADR 0037。

## P3-01 · Snapshot-pinned read-only review copy

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Git CLI、Codex 0.155.1 app-server 的真实隔离副本和写入审批拒绝通过；能力探测明确 `readOnlyEnforced=true`/`native-sandbox` 才允许准备副本，生产请求固定 `read-only + approval: never`，运行后真实 Git status/tree 校验。未增加第三方依赖、install script、数据库 migration、Renderer IPC、模型凭据或全局工具。`pnpm test:review-copy-live` 有真实 `approval.requested`/`approval.resolved=reject` 事件且无文件写入；模型文本没有结构化命令事件时不当作命令执行证据。Windows x64、macOS Intel、安装包内 Codex/沙箱可用性、Host 异常死亡孤儿副本恢复仍 **UNVERIFIED**。T050 的旧 base 合并重验属于 P3-08，当前没有执行或标通过。

## P2-10 · Python-only real vertical Demo

核验日期：2026-09-24。macOS arm64，Electron 44.4.3、Python 3.12.13、SQLite schema 16、Codex CLI/app-server 0.155.1；真实 gpt-6-sol Run 经 Desktop 固定 bridge 和本地 stdio 完成隔离工作区修改、测试、Diff、CodeSnapshot/Handoff。真实提供方中断和独立用户取消分别留下 failed/cancelled 证据；无 Handoff 被伪造为成功。人工 Diff 记录见 `docs/demo/p2-python-vertical.md`。没有新增直接依赖、安装脚本、数据库 migration、Renderer 权限或全局工具变化。模型能力和网络认证是本机即时状态；一次 no-change 的真实 Codex 完成被正确拒绝作为 P2 成功证据。Windows x64、macOS Intel、安装包内 Python/Codex、签名/公证、DPI、Git SHA-256 与 Host 突然死亡后的 owned 子进程恢复仍 **UNVERIFIED**。

## Python-only Desktop cutover · MIG-PY-09

核验日期：2026-09-24。当前 macOS arm64：Electron 44.4.3、Vue 3.5.43、Vite 8.3.0、Node 22.22.0 用于 UI 构建，Desktop 唯一业务 Host 是项目本地 CPython 3.12.13，SQLite 3.50.4/schema 16，Codex CLI/app-server 0.155.1。Main→Host 的 `forge-local-jsonrpc/v1` 经 stdio；无本地 TCP/FastAPI，Node utilityProcess Host 未从 Desktop 启动。系统握手、真实 Project P1 离线闭环、真实 Codex 开发 Run/Diff/Handoff、真实取消、存储降级、Host 崩溃、退出 PID 清理与 dev launcher Ctrl+C 清理通过。Python 的 migration v16 只增 `python_host_metadata`，隔离库上 v15→v16 与旧行存续通过；实际用户开发 DB 文件不存在，**真实用户数据升级 UNVERIFIED**。没有新增第三方依赖、运行时模型凭据或全局工具变动。

CI 增加官方 `astral-sh/setup-uv` action 的固定 commit `c771a70e6277c0a99b617c7a806ffedaca235ff9`（v9.0.0）和 uv 0.11.14 / Python 3.12.13 的 `pnpm py:check`；配置依据为 [uv 官方 GitHub Actions 指南](https://github.com/astral-sh/uv/blob/main/docs/guides/integration/github.md)。本轮只在 macOS arm64 本机执行质量链，**GitHub Linux CI 运行结果 UNVERIFIED**。Windows x64、macOS Intel、Linux 生产 Host、DPI、安装包 `.asar`/Python/Codex 打包路径、签名、公证与突然 Host 死亡后的 Codex orphan 处理仍 **UNVERIFIED**。旧 Node `better-sqlite3` ABI 记录是历史 parity，不再代表 Desktop 生产数据库。见 ADR 0035。

## Python bundled plugin runtime · MIG-PY-08

核验日期：2026-09-24，macOS arm64、Python 3.12.13、Pydantic 2.13.5。内置 `forge.executor.codex` 的 manifest、空配置 Schema、入口与真实 adapter 均在 wheel 中；发现时不执行入口，API `^1.0.0`、`process.v1`、`workspace.read/write` 与 `process.spawn` 通过 Python Registry 门禁。真实独立 Python Host 经 Registry 解析 Codex 后完成隔离 Git fixture Run/Handoff；无新增包、安装脚本、全局环境变动或用户 DB 修改。`supportedPlatforms` 当前仅声明已测的 `darwin-arm64`；Windows x64、macOS Intel、安装包路径与签名仍 **UNVERIFIED**。同进程内置插件是受信代码，不是第三方安全沙箱。见 ADR 0034。

## Python Codex app-server Executor · MIG-PY-07

核验日期：2026-09-24。本机 macOS arm64、Python 3.12.13、现有 `codex-cli 0.155.1`/ChatGPT 登录、Pydantic 2.13.5。Python Host 经 `ProcessController` 启动 app-server stdio；十组真实 live case 覆盖认证、动态模型目录、结构化输出、独立 Git worktree 中两文件修改与 fixture 测试、文本/命令/文件/usage 事件、长命令取消、审批批准与拒绝、跨 Python 进程 continuation，以及 Python Host P1 批准 TODO→Run→Handoff。实测能力文件随 wheel 打包，严格匹配 CLI 版本与平台；MCP tool-call 未触发，`toolEvents=false`，网络策略未强制，`networkPolicyEnforced=false`。没有新 Python/npm 包、install script、全局安装、API Key 或用户数据修改。Python 使用本机 `PATH` 上的已有 Codex 可执行文件并核对精确版本；安装包内可执行文件发现、Windows x64、macOS Intel、离线网络、Host 突然死亡后的子进程恢复 **UNVERIFIED**。Desktop 仍由旧 Node Host 写业务库；Python-only 切换/验收在 MIG-PY-09。见 ADR 0033。

## Python worktree, process and Run infrastructure · MIG-PY-06

核验日期：2026-09-24。本机 macOS arm64、Python 3.12.13、标准库 SQLite 3.50.4、Git CLI、Electron 44.4.3。独立测试仓库中真实 Git worktree、来源隔离、任务分支、进程组父子孙取消、端口释放、Run/Attempt/Context/快照/交接及重启持久化通过；Python Host stdio 独立进程读取真实 Run。没有新增 Python 包、native addon 或 install script，`uv.lock`/`pnpm-lock.yaml` 的直接依赖未因 MIG06 变动。Desktop smoke 仍是 Node 业务 Host + 只读 Python Host 的**迁移中**组合，尚非 Python-only 产品验收。真实 Codex 写入/事件/批准/取消映射需 MIG-PY-07，Python-only Desktop P1/P2 验收需 MIG-PY-09。Windows x64、macOS Intel、Linux process backend、安装包、签名、DPI、异常 Host 死亡后孤儿进程的可确认清理 **UNVERIFIED**；历史 PID 不作为自动杀进程依据。见 ADR 0032。

## Python P1 domain and Codex refiner · MIG-PY-05

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Pydantic 2.13.5、SQLite 3.50.4；真实 Python Host 子进程对 schema 15 的隔离 SQLite 完成离线手工 Task 闭环与重启持久化。现有本机 `codex-cli 0.155.1` app-server 和已登录会话在只读隔离目录完成在线结构化草稿、澄清/人工审批/TODO、重启读回；无新增依赖、凭据或安装脚本。Codex [官方 app-server 文档](https://learn.chatgpt.com/docs/app-server)核对了 stdio JSON-RPC、thread/turn、结构化输出及只读权限，本机实时 `model/list` 选择可用模型；模型可用性是动态的，不宣称跨版本稳定。Refiner 只收到有限项目摘要，不读取项目源码，也不运行项目脚本。

当前 Desktop 的 P1 命令仍经历史 Node Host；Python Host 对共享库只读，尚未成为生产业务写者。直接使用 `ForgePersistence` 私有 SQL helper 的服务边界、Codex 子进程树归属、安装包内 Python/Codex 路径均需 MIG-PY-06/09 完成与复验。Windows x64、macOS Intel、系统 DPI、安装包/签名、Codex utilityProcess crash recovery **UNVERIFIED**。见 ADR 0031。

## Python SQLite parity · MIG-PY-04

核验日期：2026-09-24。macOS arm64：Python 3.12.13 内置 `sqlite3` 报 SQLite **3.50.4**，Node `better-sqlite3@13.0.3` 在 Desktop smoke 报 SQLite **3.53.4**。冻结旧 15 版 SQL/checksum 与 Node registry 严格一致；同一隔离库的 Project/Task/Run 行与事务写入互通。Python 自身 v16 additive migration 只在测试库执行，未对用户库升级。Desktop 迁移桥的 Python Host 用只读连接，真实 schema 15 ready 与损坏库 degraded 已实测。没有新增数据库第三方包/native 安装脚本，Python 标准库 SQLite 即驱动。用户实际 development DB 文件在核验时不存在；Windows x64、macOS Intel、安装包、共享库长期双进程压力、真实用户库升级 v16 **UNVERIFIED**。见 ADR 0030。

## Python Host stdio · MIG-PY-03

核验日期：2026-09-24。macOS arm64 的 Python 3.12.13 Host 由 Electron 44.4.3 Main 以独立受控子进程启动；`forge-local-jsonrpc/v1` 行分帧与 `forge-host-protocol/v5` 握手真实通过。Desktop 诊断读到真实 PID、Python 版本、degraded Storage；主动 SIGKILL Python Host 后 UI 显示 crashed，Renderer 无 Node/任意 IPC。`pnpm py:check`、`pnpm smoke:desktop` 通过。当前使用开发工作区 `.venv` 可执行文件；安装包内嵌 Python/跨平台可执行路径、Windows x64、macOS Intel、Linux CI **UNVERIFIED**。Python Host 尚未打开 SQLite；既有 Node/utilityProcess 的 Storage ready 不是 Python Storage ready。

## Python Core bootstrap · MIG-PY-02

核验日期：2026-09-24。macOS 27 arm64 上 `uv 0.11.14` 使用项目本地 CPython `3.12.13`，系统 `python3` 仍为 3.11.9，未修改全局环境。精确直接版本：Pydantic 2.13.5、pytest 9.1.1、pytest-asyncio 1.4.0、Ruff 0.16.8、mypy 2.3.1、构建后端 Hatchling 1.32.4；来源为各包 [PyPI 官方元数据](https://pypi.org/)，锁定传递版本和哈希见 `python/uv.lock`，许可证逐包见 `docs/python-dependency-licenses.json`。uv 的 [项目同步文档](https://docs.astral.sh/uv/concepts/projects/sync/)确认 `--frozen` 按现有 lockfile 同步。`uv lock --check`、`uv build --no-sources`、`pnpm py:check` 均通过；Pydantic-core 原生 wheel 在本机真实导入。uv/hatchling 构建会执行其受控构建后端；没有打开 pnpm 全局安装脚本或使用 sudo。Windows x64、macOS Intel、Linux CI、安装包内 Python 运行时与 Python Host 启动 **UNVERIFIED**。

## Python Core migration baseline · MIG-PY-01

核验日期：2026-09-24。用户批准 Python 3.12+ 独立 Host 替代 Node/TypeScript 业务 Runtime，Desktop/UI 保留 Electron/Vue/TypeScript。本地协议目标是有版本 JSON-RPC over stdio；MIG-PY-01 尚未引入 Python 依赖、启动 Python Host 或改变 SQLite。既有 frozen pnpm 安装、契约、任务图、lint、typecheck、test、build、真实 Electron Desktop smoke 和 diff check 在 macOS arm64 最终通过。下面 P0～P2 的 Node/Electron utilityProcess 结果是**历史 parity baseline**，不能写作 Python、Windows x64 或 macOS Intel 验收通过。现有 `forge.sqlite` 数据与 schema_migrations 必须保持兼容；迁移测试用独立副本，不重置真实用户数据。P2-10 暂停，P3 未启动。见 ADR 0029。

## P2-09 · Git CodeSnapshot and structured handoff

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3`，SQLite schema 15。真实 Git SHA-1 工作区 commit/tree 与 `refs/forge/snapshots`、临时 index 和源码 worktree 隔离已验证；Git SHA-256 格式仓库尚未实测。已认证 `@openai/codex@0.155.1` app-server 真正创建未跟踪测试文件，快照哈希和 Host-only SQLite 交接记录在重启后保持。没有新增第三方依赖、native addon、安装脚本或 Renderer 权限。内置 secret gate 对已知路径/模式、符号链接和未扫描二进制采取保守拒绝，但不能保证发现所有未知凭据。Git ref 与 SQLite 事务无法跨系统原子提交，未发布 orphan ref 的回收待 P3-09。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 与全链正式工作流仍 **UNVERIFIED**。

## P2-08 · Host-internal Run cancellation and bounded timeout

核验日期：2026-09-24。macOS 27.0 arm64，Node Host 22.22.0；Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3` SQLite schema 14。新增 `run_cancel_intents` 持久化取消原因/时间，原 v11 Run CHECK 与旧 migration checksum 不变。真实本机 Node 父子孙进程树和已认证 `gpt-6-luna` app-server 长命令取消均确认退出，取消后无继续写入；桌面 utilityProcess 构建/启动与 schema 14 健康探测经 smoke 回归。无新第三方依赖、原生模块、安装脚本或 Renderer 权限。进程组不确定时保留隔离；Windows 进程后端仍不可用。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 和跨 Host 重启副作用对账仍 **UNVERIFIED**。

## P2-07 · Read-only Run inspection and bounded Diff

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、Vue 3.5.43、Vite 8.3.0、`better-sqlite3@13.0.3`。SQLite schema 13 真实迁移并在 Electron Desktop 加载；固定私有 `forge-host-protocol/v4` 仅新增 `run.list`/`run.inspect` 只读命令，Renderer 没有 FS/SQL/任意 IPC。真实已认证 Codex app-server Run 与 Desktop 读模型、文本 Diff 截图在 macOS arm64 验证；没有新增包、原生安装脚本或许可证项。已知密钥模式、Cookie 与 Authorization 被脱敏，但通用机密识别不作绝对保证，正式交付产物需 P2-09 secret gate。事件与 Diff 均有明确上限；`cost=null` 表示未知而非零。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-06 · Bounded ContextBundle and working checkpoints

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3` SQLite schema 12。真实 Codex app-server `@openai/codex@0.155.1` 隔离写入时生成、持久化并重启读取有来源的 ContextBundle 与 12 个 checkpoint；Electron Desktop smoke 和 P1 离线 Desktop 回归在 schema 12 通过。无新增依赖、原生模块、安装脚本或 Renderer 权限。字符上限不是精确 token 预算；tokens/turn 未由 Provider 报告时保留 unknown，不记成 0。真实预算超额的记录不被丢弃，跨角色预算停止属于后续。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-05 · Host Run/Attempt durable scheduler

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3` SQLite schema 11、本机锁定的 `@openai/codex@0.155.1` app-server。真实临时 Git 工作区 Codex Run 写入、标准事件、sessionRef、fixture 测试及重启 DB 持久性通过；Electron Desktop smoke 和 P1 离线 Desktop 闭环在 schema 11 回归通过。429 测试使用确定性故障注入，未声称真实服务发生 429。无新增第三方包、原生模块、安装脚本、Renderer 权限或生产 Start 命令。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、真实上游 429、Codex utilityProcess crash recovery 与生产版本内容解析继续 **UNVERIFIED**。

## P2-04 · Codex scheduled write probe

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、锁定 `@openai/codex@0.155.1` 本地 app-server、SQLite schema 10。当前已有 ChatGPT session/模型目录可用；无需新账号或 Key。独立临时任务分支真实写入、事件流、sessionRef、fixture `npm test` 和源工作树未变通过；现有 `pnpm test:workspace-live` 长命令取消与父/子/孙退出再次通过。未增加依赖、安装脚本、数据库迁移或 Renderer 权限。Codex `networkPolicyEnforced=false`；提示词中的禁止联网不是强制隔离。正式 Run 状态、Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-03 · Executor 公共契约与上游消息门禁

核验日期：2026-09-24。macOS 27.0 arm64，Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、SQLite schema 10。无新增第三方包、原生模块、安装脚本、迁移或 Renderer IPC。继续使用 `@openai/codex@0.155.1` 本地 stdio app-server；本轮补的是标准 Attempt request 与上游结构校验，未重新进行云端写入/live cancel 验收。真实双适配器、Profile/model 选择和正式 Run 失败语义保留至各自 Task。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-02 · Git task worktree 与租约 epoch

核验日期：2026-09-24。macOS 27.0 arm64、Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、SQLite schema 10；未新增依赖、原生模块、安装脚本或 migration。真实 Git 中文/空格路径 fixture 的 Forge 任务分支、base commit/tree、并发单写、lease epoch 递增、旧 lease 拒绝及源工作树不变已验证；P1 离线 Electron/SQLite 闭环回归通过。`@forge/workspace` 的 JSON journal 是当前 Host 的私有所有权记录，尚不是跨 Host 的事务锁；生产 Run/Attempt 数据库租约要在 P2-05 验证。工作区排除策略目前只冻结配置，P2-09 才会执行交付快照过滤。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-01 · RunConfig 冻结快照

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3`，生产 SQLite schema 10 在真实 Desktop smoke 中加载。新增 migration 只含 Host 内部 `run_config_snapshots` 与不可变触发器；精确依赖版本、锁文件、许可证、原生安装脚本策略均未改变。已批准 TODO + Environment 的冻结、变更设置后读取、存储重启、拒绝陈旧/跨项目/重复请求在真 SQLite 测试通过。尚未启动 Run，workflow/profile/plugin 的真实版本解析和运行中动态设置隔离需 P2-05 及 P4/P5 实证；T031–T035 保留 `DEFERRED_VERIFICATION`。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-10 · 离线手工集成路径与阶段门禁

核验日期：2026-09-24。本机 macOS 27.0 arm64 的 Electron 44.4.3 utilityProcess Node 24.21.0、Node Host 22.22.0、Vue 3.5.43、Vite 8.3.0、SQLite schema 9。`pnpm smoke:p1-offline` 真实加载 Host/SQLite：独立空 `CODEX_HOME`、空 Key 项与不可达 HTTP(S) 代理下，手工消息→草稿→批准→TODO→重启保留通过；没有调用 Codex 或执行 fixture 的项目脚本。不可达代理只覆盖相应 HTTP(S) 客户端设置，**不是**操作系统网络隔离。无新增包、原生模块、安装脚本或数据库 migration。P1-10 权威验收引用与后续 Run/身份/Agent 评测前置能力的冲突见 ADR 0018；用户已批准阶段范围 DONE；未运行的 T116–T120 与其他后续能力用例仍为 `DEFERRED_VERIFICATION`，不计作通过。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-09 · 自然语言控制提议

核验日期：2026-09-24。本机 macOS 27.0 arm64，Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、Vue 3.5.43、Vite 8.3.0、SQLite schema 9。未添加第三方依赖、原生模块、安装脚本或迁移；私有 `forge-host-protocol/v4` 仅增加严格固定的 `intent.propose`，旧 Host 命令和握手回归通过。真实 Host/SQLite 与 Electron smoke 验证持久化用户消息可生成来源绑定提议，恶意 `intent.execute` 无白名单入口，已批准 TODO 未被改变。该规则解析器仅适合有限明确表达，模型解释、真实 Run 暂停/恢复、已批准任务优先级变更均待后续契约与验收。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-08 · Task 详情来源读模型

核验日期：2026-09-24。macOS 27.0 arm64 的 Electron 44.4.3 utilityProcess Host、Node Host 22.22.0、Vue 3.5.43、Vite 8.3.0、SQLite schema 9 真实加载；未增加外部依赖、原生模块或安装脚本。私有 `forge-host-protocol/v4` 的固定 Board 命令增量加入 `task.detail`，旧命令与握手回归通过。Task 深链使用 URL hash，Main 的 IPC 来源校验仅忽略同一文档的 hash，查询参数/路径/来源窗口仍受限；本机安全测试和 Electron smoke 均通过。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-07 · 看板投影与同列排序

核验日期：2026-09-24。本机 macOS 27.0 arm64：Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、Vue 3.5.43、Vite 8.3.0、`better-sqlite3@13.0.3`，SQLite schema 9 真实加载。新增的只有 `apps/web`→`@forge/core` 内部 `workspace:*` 依赖，精确第三方版本、许可证库存和安装脚本策略未变。v8 含已批准 TODO 的真实 SQLite 迁移测试证明 position 与事件游标回填正确；Electron Desktop 的真实 Host/SQLite 看板、手工草稿批准、同列重排、重启持久化和 1280×800 水平滚动通过。Web 无本地 Host 时仍只显示不可用，不越权访问 SQLite。

私有 `forge-host-protocol/v4` 增加严格 `board.snapshot` 与 `tasks.reorder` 白名单命令；旧 Host/Renderer 组合不会被误认为兼容。当前生产 `tasks.state` 只有 `todo` 可达；五列中其余状态取决于后续业务状态机，不能把纯投影 fixture 写成运行时验收。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-06 · 人类审批与 SQLite 原子入 TODO

核验日期：2026-09-24。本机 macOS 27.0 arm64：Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3`，生产 SQLite schema 8 真实加载。私有 `forge-host-protocol/v4` 增加固定批准命令，旧命令与桌面 Host 握手回归通过；不同版本 Desktop/Host 的混用仍由协议握手拒绝。新依赖只有内部 `@forge/core` workspace 链接；其直接类型依赖是**既有精确版本** `@types/node@22.20.4`，MIT，已同步 `pnpm-lock.yaml`、`versions.lock.json` 和既有许可证库存。安装脚本继续禁用。

真实 Node Host IPC 并发和 Electron/SQLite smoke 通过：重复批准仅一个 TODO/事件，事件插入故障会回滚 Task/Revision/Decision，Host 重启后已批准状态仍在；Desktop Renderer 无 Node/Shell/DB。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。

## P1-05 · 草稿修订与澄清

核验日期：2026-09-24。没有新增第三方依赖或安装脚本；继续使用 Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、better-sqlite3 13.0.3 与现有 pnpm lockfile。SQLite schema 由 6 升为 7，macOS 27.0 arm64 的 Node/真实 Electron Desktop 加载和读写通过；v6 当前草稿仅回填一个可验证快照，无法捏造迁移前的完整编辑历史。私有 Host 协议 `/v4` 只扩展固定 `draft.revise`/`draft.history` 命令；安全边界和既有握手不变。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-04 · 整理器与草稿（macOS arm64 实测）

核验日期：2026-09-24。Node Host 22.22.0、Electron 44.4.3 utilityProcess 内 Node 24.21.0、macOS 27.0 arm64。未增加新的第三方版本：`@forge/refiner` 复用已锁定的 `zod@4.6.4` (MIT)，`@openai/codex@0.155.1` (Apache-2.0) 由既有 Executor Adapter 按明确只读权限启动。精确工作区依赖已在 `pnpm-lock.yaml` 与 `versions.lock.json` 记录；依赖脚本仍关闭。SQLite schema 6 在 Node Host 与 Electron utilityProcess 本机加载；新的 Draft 协议为既有私有 `forge-host-protocol/v4` 的固定命令扩展。

Node Host 的真实模型调用已对 feature、bug 和模糊需求生成结构化结果并保留澄清问题；无需新 API Key，依赖本机已登录的 Codex 会话。第一次 Electron 在线 Smoke 失败：UtilityProcess 的 `process.execPath` 是 Electron Helper，原 CLI 子进程没有 `ELECTRON_RUN_AS_NODE`，草稿得到真实 `REFINER_FAILED`。只对 Electron Host 所拥有的 Codex CLI 子进程显式设置 `ELECTRON_RUN_AS_NODE=1` 后，CLI/app-server 确实启动；第二次 Electron 在线 Smoke 仍收到 `EXECUTOR_TIMEOUT`，发现 Main 原先只给 Host 三个 Forge 环境变量，没有转发当前本机模型连接所需的无凭据 HTTP(S) 代理。现已加入 Main→Host 的最小运行时/代理环境白名单，第三次真实 Electron 在线 smoke 已通过，结构化草稿在 Renderer 显示，独立 Git fixture 源码没有变化；没有转发 API Key 或全量环境。Electron 官方 [环境变量说明](https://www.electronjs.org/docs/latest/api/environment-variables)与 [fuses 文档](https://www.electronjs.org/docs/latest/tutorial/fuses)确认运行机制和打包时可禁用的风险。尚未证明实际 `.asar`/安装包使用该路径可用；未来若禁用 RunAsNode fuse，需要改为直接启动已锁定的平台二进制，并重新实测。

Windows x64、macOS Intel、系统 DPI、安装包、签名/公证、Codex utilityProcess crash recovery 与 Refiner 网络隔离继续 **UNVERIFIED**。当前 read-only sandbox 的 macOS 写防护沿用 P0-05 实测；它并非通用文件/网络隔离。

## P1-03 · 会话持久化与本地流

核验日期：2026-09-23。生产 SQLite schema 5 已在 Node Host 集成测试与 Electron 44.4.3 utilityProcess 的 macOS 27.0 arm64 Desktop smoke 中加载；Node Host 22.22.0，Electron 内置 Node 24.21.0。Host 私有协议仍为向后兼容的 `forge-host-protocol/v4`，只增加固定会话命令/事件，既有 Project/Web 路径回归通过。未添加外部包或安装脚本；许可证/lockfile 不变。流式 responder 仅 fixture 实测，真实模型流待 P1-04；Windows x64、macOS Intel、DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。

## P1-02 · 项目、环境与命令预设数据

核验日期：2026-09-23。Node 22.22.0、pnpm 12.3.4、Electron 44.4.3（utilityProcess Node 24.21.0）、better-sqlite3 13.0.3；macOS 27.0 arm64。没有新增第三方依赖、原生安装脚本或许可证项。生产 SQLite 从 schema 3 升到 4，私有 Host 协议从 `forge-host-protocol/v3` 升到 `/v4`。旧 v3 实体数据迁移和重启无重复回填测试通过；新版本 Desktop 在本机真实启动，SQLite N-API 载入、Host ready/schema 4、Project 向导正常。旧 Desktop/Host 二进制与新协议不混用；协议握手会明确拒绝。

Windows x64、macOS Intel、系统 DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。当前 Git 子模块、大小写不敏感路径冲突、跨设备项目搬迁及并发多 Host 同库写入没有验收。命令预设仅保存，不运行用户代码；后续执行仍需权限策略和逐项审批。

## P1-01 · 本地项目选择与信任

核验日期：2026-09-23。本机 macOS 27.0 arm64，Node 22.22.0、pnpm 12.3.4、Electron 44.4.3、Git 2.55.0。没有新增第三方依赖或安装脚本；继续复用已锁定的 Electron、Zod、better-sqlite3、Vue 与 Playwright。生产数据库从 schema 2 迁移到 schema 3；Host 协议因新增 project 命令从 `/v2` 升至 `/v3`。

| 场景 | 当前结果 | 限制 |
| --- | --- | --- |
| Node Host Project Probe | 独立中文/空格 Git fixture 的 clean/dirty、branch、lockfile、声明脚本和非 Git 目录真实读取；脚本没有执行，源目录状态不变 | Git 命令依赖本机 Git；极大仓库和特殊 fsmonitor/权限配置还需补充边界测试 |
| Electron utilityProcess Host | 真实 Desktop IPC、SQLite schema 3、信任记录、当前项目重启恢复、项目切换与仅元数据移除通过；macOS 原生面板实际选择独立临时目录并显示 Host 探测结果 | 完整向导自动化用受控选择器返回值；Windows 原生面板未测 |
| Web | 无 Desktop bridge 时显示本地项目不可用，不提供 `webkitdirectory` 或本地文件读取 | RemoteTransport 未实现 |
| 供应链 | 没有新增 package；`pnpm install --frozen-lockfile`、严格类型检查与原生 SQLite 加载沿用 P0 锁定组合 | Windows x64/macOS Intel 与安装包中的原生依赖仍未实测 |

Windows x64、macOS Intel、真实系统 DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 仍为 **UNVERIFIED**。P0-06 Windows 进程树 backend 仍不可用。项目 Probe 不执行脚本，后续执行仍需逐项 Policy/Approval；见 [ADR 0008](decisions/0008-project-probe-and-trust-boundary.md)。

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
# 2026-09-25 · P7-05 loopback HTTP command adapter checkpoint

Current macOS arm64 Python Host/SQLite and optional 127.0.0.1 HTTP gateway passed authenticated Project-scoped Project, Board and real approved Task Contract reads and explicit denial of all remote writes; it was not tested over TLS, on a phone, or on Windows/macOS Intel. The current installed internal Demo is listener-free on normal startup; the added Task-detail read postdates its build. Reference OpenAPI `TaskSummary.state` omits production `blocked`, so the adapter returns 409 for that board instead of emitting a nonconforming or false state. Remote write-method names/payloads differ from the current Host API and require an explicit mapping plus operation grants and idempotency/CAS tests. See ADR 0079. No remote execution support claim yet.
# 2026-09-25 · Current internal Mac Demo package integrity

The original installed ad-hoc app produced five additional `.pyc` files under its signed bundled Python package after runtime imports; `codesign --verify --deep --strict` then failed. The original DMG/checksum and all existing Demo data remain untouched. A separate `0.0.1` arm64 internal DMG (SHA-256 `91595c5cbf5278ecc68227a3eb5a92ded84d26408b227d28371832e6de283eb6`) was built from current sources with `PYTHONDONTWRITEBYTECODE=1` in the packaged Host environment. A read-only DMG install, clean-path Host startup, schema32, bundle Python loading, exit and subsequent ad-hoc signature verification passed. The exact new DMG also passed a real Codex task/Verify/Review/acceptance/cancel/restart cycle with retained isolated fixture/data. This verifies only macOS arm64 internal ad-hoc packaging; Developer ID, notarization, Gatekeeper on a fresh account, Windows/macOS Intel, signed updates and Finder PATH/proxy remain unverified. The Python system interpreter used by the optional local `.command` launcher is separate from the bundled Host runtime.

An additional installed-app UI probe used a SQLite backup, not the retained Demo DB: the first quick-template publish correctly failed because no Agent Profiles were installed; after saving real Developer/Reviewer Profiles through the app, binding them and editing a node, Host preflight, draft save, publish v1 and published-definition readback succeeded. This verifies the package's editor/publish route without a model call. A new installed-app Run bound to that published version remains unverified.

A separate live invocation of the **same DMG** used an isolated fixture to publish quick v1 and start a real Codex Run. The Run succeeded, changed only isolated `math.js`/`test.js`, and its SQLite RunConfig plus Host readback matched the published Workflow/Profile IDs and content hash. The overall command exited 1 on a harness-only final assertion that wrongly expected Done after development alone; actual Task state was Active because Review/Verify/human acceptance had not run. The assertion has been corrected, but the paid scenario was not repeated merely to turn the exit code green. Its custom-Workflow restart readback therefore remains UNVERIFIED; no formal P6/P7 release gate changes.
