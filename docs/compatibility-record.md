# Forge 版本与兼容性记录

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
