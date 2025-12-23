# Forge

Forge 是自然语言驱动的多 Agent 研发工作台。需求先成为可编辑的 Task Contract，经人工批准进入 TODO；开发、Review、验证与人工验收依靠真实状态和证据。Done 不代表合并或部署。Forge 与 ProofRun 完全独立。

## 当前状态

当前工作区已实现 P0-01 工程基线、P0-02 Web/Desktop 应用壳、P0-03 独立 Host 通信和 P0-04 最小 SQLite 持久化基础。P0-05 已加入 Host 内置 Codex Executor 的公开契约和 app-server 适配器。P0-06 新增最小 Git worktree 管理与进程归属/取消，在本机 macOS arm64 的独立 fixture 中完成真实探测。P0-07 将 glass v1.1 的正式 token、基础组件与布局放入 `@forge/ui`；P0-08 新增只读契约校验器和独立 CI 步骤。Web 与 Desktop Renderer 继续加载同一套 Vue App。`pnpm dev:web` 可在普通浏览器运行并显示 Local Host unavailable；`pnpm dev:desktop` 启动 Electron 和它拥有的 Host，握手及健康检查通过后显示真实连接状态。Host 自己打开 Forge 数据库、迁移到 schema 2，并把真实 Storage 状态纳入健康检查。页面仍只有本地输入和明确的空状态；Executor 没有接入 Renderer 或任务流程，Agent、模型业务、业务数据库表、任务流尚未启用。版本号仍为 `0.0.1`，本轮没有发布新版本。

工程规格在 `forge_spec_v1.0/`；新版视觉方向在 `forge_glass_v1.1/`。两份目录均为只读参考。后续界面实现采用新版银白雾面方向、清晰阅读表面与减少透明度/动效回退；原型 HTML 与截图均不参与产品构建。

## 前置条件

- Node.js `>=22.13.0 <23`；本机验证版本为 `22.22.0`。Vite 8 自身要求 Node `22.12+` 或 `20.19+`，当前仓库采用更窄的 Node 22 约束。
- pnpm `12.3.4`；仓库通过 `packageManager` 固定版本。无需修改全局开发环境；安装或切换工具请自行使用符合版本的本地工具链。
- 开发 Desktop 时需让本机端口 `5173` 可用。Electron 首次启动会按官方安装流程下载对应平台的预编译二进制，需要可访问 Electron 发布源的网络；pnpm 依赖安装脚本保持禁用。SQLite 使用 `better-sqlite3@13.0.3` 包内的平台 N-API 预构建文件，当前仅在 macOS arm64 的 Node Host 和 Electron utilityProcess 中实测。

## 启动

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm dev:web
pnpm dev:desktop
pnpm dev:host
```

三个 `dev` 命令分别运行，按需选择。`dev:web` 提供普通浏览器入口，不启动或连接本地 Host；`dev:desktop` 启动同一 Web 开发服务、Electron 和由 Desktop 管理的独立 Host；`dev:host` 构建并直接运行独立 Node Host，输出真实运行身份并等待 Ctrl+C，不开放 HTTP/IPC 端口。默认 Forge 数据目录按平台放在用户应用数据目录下的 `Forge/development`；正式打包时为 `Forge/production`。测试使用独立临时目录。也可先 `pnpm build`，再运行 `pnpm --filter @forge/host start`。要加载构建后的页面，可运行 `pnpm start:desktop`。`pnpm smoke:desktop` 会构建并启动真实 Electron，用临时数据库验证握手、SQLite 健康、无效数据库降级、Host 崩溃及退出清理。

Design System 检视页只在 Vite 开发模式开放：运行 `pnpm dev:web` 后访问 `http://127.0.0.1:5173/#/dev/ui`。这不是正式导航或业务页面。`packages/ui/src/tokens/values.json` 是工程 token 来源；修改后运行 `node packages/ui/scripts/build-tokens.mjs` 更新 CSS，`pnpm build` 会检查二者一致。`pnpm build && node scripts/capture-ui.mjs` 会从真实 Electron Renderer 生成 1440×900、1600×1000 与 1280 宽模拟缩放截图，输出到被 Git 忽略的 `output/playwright/`；本机生成结果见实施记录。减少透明度/动效目前是当前窗口的外观开关，不会持久化。

## 工程检查

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm validate:contracts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm validate:contracts` 检查参考包的 JSON Schema、示例、Workflow、Profile、Plugin Manifest、OpenAPI、SQL、任务/阶段/验收引用、精确版本与许可证记录及生产 token；错误返回非零退出码，警告会显示。构建后可运行 `node packages/contract-validator/dist/cli.js --reporter=json` 获取纯 JSON 报告。它只读参考资料，SQLite 检查使用内存库，不等于产品验收。`pnpm typecheck` 先构建契约、Core、Client 和 Persistence 的公开入口，`pnpm test` 先构建当前工作区，再运行 Node/Vue/真实 SQLite 测试。首次变更依赖并重新生成 lockfile 时才运行普通 `pnpm install`；CI 使用冻结锁文件安装。`pnpm-workspace.yaml` 禁用依赖安装脚本；Electron 二进制由首次运行时单独获取。

Codex P0-05 开发诊断可运行 `pnpm probe:codex`：只检查已锁 `codex-cli 0.155.1`、本地登录、app-server 握手、实时模型列表和与当前平台/版本匹配的实测能力记录，不启动写入任务。`pnpm test:codex-live` 在**独立临时 Git fixture** 中依次运行 SDK、app-server 只读/结构化输出、写入和测试、取消/跨连接及跨 Node 进程继续、审批接受/拒绝。它需要已配置的 Codex 登录与正常上游连接，属于显式 opt-in 的真实网络测试；2026-09-23 的首次重跑因代理环境遗漏而中断；修正后整套通过，见实施记录。没有 API Key 配置流程或 Renderer 凭据入口。

P0-06 的 `pnpm test:workspace-live` 是另一个显式在线测试：先将可丢弃 Git fixture 放入独立 worktree，启动真实 Codex 长命令与子孙进程，取消后核对 PID、心跳、源仓库状态与 worktree 释放。默认 `pnpm test` 只运行确定性的 Git/Node 进程树测试。当前进程树后端仅在 macOS arm64 实测；Windows 后端明确不可用，不能把此命令或 macOS smoke 当成 Windows 验收。Host 崩溃的旧归属记录只报告可能 orphan，不会按历史 PID 自动杀进程或清理目录。

检查和 smoke test 覆盖当前应用壳、Host 系统协议、SQLite 基础持久性、安全边界与空状态，不等于任务、Agent 或工作流产品验收。Host 使用私有进程消息通道，只提供 `system.health`、`system.info`、`system.ping`；协议为 `forge-host-protocol/v2`。Desktop 退出时仅关闭自己启动的 Host。当前 `.asar`/安装包、Windows 和 macOS Intel 的原生加载尚未验证；实际结果见 `docs/implementation-status.md` 和 `docs/compatibility-record.md`。
