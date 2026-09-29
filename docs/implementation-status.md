# Forge Desktop 实施状态

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
