# Forge Desktop 实施状态

## 2026-10-06：修复分支复审、工具收尾与主分支整合

审查 `fix/agent-terminal-outcomes` 的两个提交 `c6d90031`、`4abb1863` 时，额外用真实 SDK 和 Worker 离线复现了两处回归：SDK 致命错误在在途工具结束前返回或刷新认证；后台 Bash 命令阻碍真实线程退出，且结果发布后已关闭的消息端口不能再接收取消。随后补充 `c3927d0b`、`d055cd4b` 两项修复，并经独立复审后快进整合到本地 `main`，保留原提交历史。

会话现在按请求尝试独立取消，等待 Promise 与 AsyncIterable 工具真正结束后，再判定取消、返回错误或刷新认证。绑定工具同时接收 SDK 与原上下文的取消信号，保持共享上下文不变；成功会话不取消仍由任务管理的后台命令。新增真实 SDK 回归覆盖失败收尾、认证重试顺序、流式输出，以及等待工具期间用户取消。

每个 Worker 独立持有 Bash 命令管理对象，并在 MCP、日志、结果与端口关闭前停止并等待自己的命令。macOS 实测 POSIX 进程组定向 TERM／KILL、父进程先退出的后代、独立 stdio 且忽略 TERM 的后代、前台取消、归属隔离，以及超时后返回 0 的命令。后台执行在会话运行期间仍立即返回；输出限制与超时上限保持。

本次在原项目根、Node 24.19.0／npm 10.8.2 下重新执行 i18n、lint、typecheck、npm test、E2E helper 与 build，全部 exit 0：**344 个 Vitest 文件／5857 项测试、12 项工具检查、6 项 helper**；lint 保留 791 warnings／5 infos。合并后的 `main` 另跑 10 文件／142 项终态相关回归，全部通过。测试环境与数据目录隔离，真实 Worker 的后台成功／错误／取消三条新增场景均使用离线 transport 和受控合成子进程，无真实模型或付费请求。

平台边界单独记录：本轮原生进程清理实测为 macOS；Windows 仅保留 PID 定向 taskkill 适配，未做原生验证，父 shell 先退出后使用独立 stdio 的后代仍可能漏清理，这是既有边界未完整补齐。Linux 不回收 zombie 的容器也未验证，组内仅剩 zombie 时的存活检查可能继续等待；主动创建新 session／进程组的后代不属于原进程组。上述结果不能替代 Windows／Linux 原生验收、真实 Electron UI 或在线 Agent 验收。本轮不变更版本号、用户数据身份或既有发布事实。

## 2026-10-06：任务终态与 Worker 退出的本地修复验收

本轮先在 `29004c1d` 的独立副本实施集中修复，随后按用户明确授权将完整 15 文件补丁整合到原项目的 `fix/agent-terminal-outcomes` 分支。基线为 `29004c1d`；按会话终态、Worker 清理两项组织本地提交，测试随对应修复提交。SDK 顶层错误和取消正常闭流不再默认为 completed；Worker 在 MCP 与日志清理后单点发布结果并关闭消息端口，Bridge 追踪到真实线程退出。Main 取消接入 Bridge，killAll 等待清理，旧 spawn 事件不会影响同任务的新运行；清理期间取消和强制终止失败也有回归覆盖。

原项目路径在用户 Mac、Node 24.19.0／npm 10.8.2 下重新执行 i18n、lint、typecheck、build、npm test 与 E2E helper，均 exit 0。完整测试为 342 个 Vitest 文件／5842 项、12 项工具检查、6 项 helper；lint 保留 791 warnings／5 infos。上述原路径检查需要通过文件沙箱审核取得目录写入权限，所有 HOME、appData、userData 与环境均隔离，测试 HTTP 服务仅用本地合成夹具，不使用真实账户或模型。

执行环境区别单独保留：副本阶段默认受限环境的完整测试有 53 项 `listen EPERM 127.0.0.1`，排除 4 个文件后 338 文件／5764 项通过。整合后原路径在默认受限环境另行重跑 `npm test`，12 项工具测试通过，但 Vitest 在写入 `node_modules/.vite-temp` 配置时遇到 EPERM，单元测试未启动；这不计为原路径单元测试通过，也没有修改产品或系统权限来消除限制。

新增 `worker-runtime.test.ts` 独立构建当前 Worker，实际运行 Read→Write→Read、SDK HTTP400、请求中取消、setup 失败、无效配置和可恢复工具错误 6 个场景。原项目新生产构建的 Worker 也在默认受限环境另行运行同样 6 场景，全部自然退出，保存请求、事件、产物和 task_logs.json。仅替换离线 transport，未模拟产品工具或日志持久化；无实际 socket、模型或付费请求，不能替代 Electron UI 与在线 Agent 验收。

整合前原项目为干净 main，结束时处于安全修复分支；用户设置摘要未变，原有 out/ 与 tsbuildinfo 已备份。无需再从副本整合代码；用户另行授权本地 commit，两项修复分拆提交，未推送、合并到 main 或部署。本轮未修改项目 `.env`／MCP 配置链、libSQL 接入或 Electron 签名，也未重跑在线服务与真实 Electron UI。

## 2026-09-29：0.1.0-preview.6 发布验证

本版包含两项已按功能独立提交并推送的改动：`f92de037` 删除旧 Forge 实现，`ac7c8077` 重组根单应用。版本与发行材料另外提交；不重写已有公开提交。

本轮 Node 24.19.0／npm 10.8.2 下 i18n、lint、typecheck、test、E2E helper 与 build 全部 exit 0：340 个 Vitest 文件／5788 项测试、12 项 Node 工具检查、6 项 helper 替身检查；i18n 5373 字符串／4267 静态引用，lint 保留 792 warnings／5 infos。冻结的依赖记录保持；本轮生产审计 33 项（10 high、9 moderate、14 low、0 critical）未修复。

当前编译代码的两主题工作区 60 项、浮层 10 项、文件引用 8 项及中英文偏好重启通过。新 macOS arm64 应用以 ad hoc 签名生成 ZIP 与 UDZO DMG，分别完成归档完整性与 image verify；从只读 DMG 挂载实际启动，15 个编译资源、52 prompts、4 图标及 LICENSE／UPSTREAM 完整匹配，实际 compiled prompt loader、libSQL 与 PTY 检查通过。3 次包内启动均正常退出，原用户文件摘要未变、临时 HOME 已清理、挂载已卸载。

本轮模型调用为 0。内部包仍未公证，完整在线 Agent、外部认证、额外目标平台及 Worker 配置／记忆接线未移作通过。当前版本资产摘要与截图见 [preview.6 发布说明](releases/0.1.0-preview.6.md)，本地原始记录在忽略目录 `output/release-preview6/`；对应源码从最终发布 tag 归档。

## 2026-09-29：根目录单应用布局

用户要求删除整个旧 Forge 实现后，进一步授权重新组织保留的桌面代码。本次将 Aperant 衍生应用从嵌套 `desktop/apps/desktop/` 移到仓库根，合并为单一 `forge-desktop` npm 工程；`desktop/`、`apps/` 和 workspace 外壳不再作为当前目录。

当前结构为 `src/{main,preload,renderer,shared}`、`resources/`、`prompts/`、`scripts/{build,dev,checks}`、`tests/{tooling,ui,e2e}`。单元／集成测试仍与对应源码相邻；用户、开发、发布与实施文档归 `docs/`，历史版本说明及截图保留原始事实和摘要。许可、来源、贡献和实施规则位于根目录。

构建、开发、检查及打包从根 `package.json` 执行，使用根 `package-lock.json`；postinstall 入口为 `scripts/build/postinstall.cjs`。唯一 CI 位于 `.github/workflows/desktop-quality.yml`。`out/`、`dist/`、`output/` 分别承载编译、安装包及验证记录。

实际运行链路仍为 React Renderer → Preload `electronAPI` → Electron Main IPC → TypeScript Agent Workers / Vercel AI SDK。任务／配置采用 JSON 和项目文件，记忆采用本地 libSQL；Git worktree 与 PTY 由桌面服务管理。Agent Worker 尚未完整接入新记忆服务及项目 `.env`／MCP override 配置链；工作树创建失败可能回退项目目录。

这次结构整理不改变应用 ID `dev.iamzjt.forgeglasspreview`、`Forge Glass Preview` 用户数据目录或项目 `.forge-glass-preview/` 身份，不迁移、不删除真实用户设置、账号、项目、任务及数据库。已发布 tag、安装包和对应源码仍是其发布时的内容，没有覆盖历史附件。

重组后的实际验证（macOS arm64，Node.js 24）：

- 全新 `npm ci --ignore-scripts --no-audit --no-fund` 安装 1007 个包，postinstall 原生模块检查通过。锁文件 1125 → 1123 条记录；现有应用依赖版本与 integrity 保持，未引入新依赖版本。
- i18n、lint、typecheck、test、E2E helper、build 全部 exit 0；**340 个 Vitest 文件／5788 项测试、12 项 Node 工具检查、6 项 Electron helper 替身测试**通过。新增 26 项覆盖根路径、共享 chunk、Main／Worker 的提示词资源和开发源码识别。
- i18n 为 36 namespaces／5373 strings、4267 静态引用，0 errors／warnings；lint 检查源码、脚本、测试与根配置，保留 792 warnings／5 infos。E2E helper 结果仅证明启动参数与隔离辅助逻辑。
- 根目录 `npm run dev` 已实际打开 Vite Renderer。该临时启动脚本首次收尾失败，已按记录的专属 PID 完成强制清理并保留失败记录；随后源码 UI 与安装包均另行确认正常关闭。
- 真实 Electron 的中英文／亮暗偏好与重启通过；工作区 60 项、浮层 10 项、文件引用 8 项通过。首轮暗色 tooltip 等待超时；补充窗口就绪后的原生焦点与真实鼠标诊断后，最终两主题均在首次悬停成功，首轮失败证据保留。
- 重新构建的应用位于 `dist/structure-unreleased/mac-arm64/Forge.app`，没有覆盖已发布版本。15 个编译资源、52 份提示词、4 个图标与 2 份来源／许可文件逐字节匹配；实际调用安装包中的共享提示词 loader，从应用外的工作目录读取正确 planner。原生 libSQL 内存查询与受限 PTY 执行通过，ad hoc `codesign --verify --deep --strict` 通过。
- 安装包 3 次启动／退出和 PTY 进程退出均确认；临时 HOME 已清理，真实用户文件摘要未变。本轮模型调用为 0，未验证完整在线 Agent 或额外平台。

本地原始记录位于 `output/restructure/`，属于忽略的验证产物。结构整理前的检查仅作为各自阶段证据。

## 2026-09-29：删除旧实现阶段记录

在本次重组之前，用户明确要求“整个旧 Forge 实现全部删除，只保留新 desktop/”。此前已删除原根工程的 Vue/Electron 桌面、Python／TypeScript Core、Node Host、插件、契约、任务图、旧验收资料及 pnpm／CI 工具，共 **726 个受 Git 管理的文件**，并清理旧生成文件、依赖和 QA 缓存。

当时仅保留 Aperant 衍生 npm workspace；它现已重组为上文的根单应用。当前不存在原 Forge Core，也没有继续接入已删除 Core 的路线。

删除旧实现阶段重新执行 i18n、lint、typecheck、test、build，全部 exit 0；336 个 Vitest 文件／5762 项测试及 10 项 Node 检查通过。i18n 为 36 namespaces／5373 strings、0 errors／warnings；lint 保留 774 warnings／5 infos。原始阶段记录现位于 `output/legacy-removal/`，未执行在线模型调用。

preview.5 原始验证记录现位于 `output/release-preview5/`，对应两主题真实 UI、安装包及版本限定结果见 [发布说明](releases/0.1.0-preview.5.md)。历史说明中的原 Python 工程检查只描述当时状态，不属于当前门禁。

已验证的原上游导入历史 bundle 与映射保存在 `.git/forge-import-history/`，属于版本控制来源记录，不是可运行实现。

## 当前未验与来源

完整在线 Agent、外部认证、全部 provider／工具、Windows／macOS Intel，以及正式签名／公证仍需各自真实验收。阶段模拟或旧发布记录不能代替当前验证。

基于 Aperant `v2.8.0-beta.6`，保留 [AGPL LICENSE](../LICENSE)、[上游来源与修改记录](../UPSTREAM.md)、应用内来源入口及对应源码。
