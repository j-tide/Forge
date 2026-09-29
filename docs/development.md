# Forge 开发说明

本仓库是一个根目录 npm 工程：**Electron + React + TypeScript**。全部开发、检查与打包命令在仓库根执行。

## 安装与启动

需要 Node.js 24+、npm 10+ 和 Git。macOS 原生依赖需要 Xcode Command Line Tools；Windows 本机构建可能需要 Visual Studio C++ Build Tools。这些前置条件不代表相应平台已通过验收。

```sh
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run postinstall
npm run dev
```

显式 postinstall 入口为 `node scripts/build/postinstall.cjs`，处理本平台原生依赖。Electron 安装脚本下载固定版本运行时；不下载上游应用发布包，不修改全局工具。

`npm run dev` 使用 electron-vite 开发模式；`npm run build` 生成 `out/`，之后 `npm start` 启动已编译应用。`npm start` 本身不执行构建。

## 目录与入口

```text
Forge/
├── package.json / package-lock.json
├── src/
│   ├── main/          Electron 应用服务与 TypeScript AI
│   ├── preload/       Renderer 桥接 API
│   ├── renderer/      React 界面
│   └── shared/        类型、常量、国际化与状态机
├── resources/         图标、品牌与平台资源
├── prompts/           运行时提示词
├── scripts/
│   ├── build/         安装、原生依赖与打包检查
│   ├── dev/           本机启动工具
│   └── checks/        本地静态检查
├── tests/
│   ├── tooling/       Node 工具回归
│   ├── ui/            Electron 界面与安装包检查
│   └── e2e/           Playwright 场景及辅助测试
└── docs/              使用、开发、发布及版本证据
```

| 位置 | 职责与真实入口 |
| --- | --- |
| `src/main/index.ts` | 创建窗口、初始化 Agent／Terminal 服务并注册 IPC。 |
| `src/main/ipc-handlers/` | 项目、任务、设置、文件、终端及各领域请求。 |
| `src/main/agent/` | Agent 生命周期、运行状态、队列与事件转发。 |
| `src/main/ai/` | Worker、provider、session、orchestration、tools、security、memory、worktree；Worker 入口为 `agent/worker.ts`。 |
| `src/main/terminal/` | PTY 与终端会话；账户、配置及平台辅助服务位于 Main 的其他对应目录。 |
| `src/preload/index.ts` | 通过 contextBridge 暴露 `electronAPI`，领域 API 位于 `src/preload/api/`。 |
| `src/renderer/main.tsx` → `App.tsx` | 页面入口；代码位于 `components/`、`contexts/`、`hooks/`、`stores/`、`lib/`、`styles/`。 |
| `src/shared/` | 跨进程类型、IPC 常量、国际化、工具函数及任务状态机。 |

Vitest 单元／集成用例主要与 `src/` 中对应模块相邻。独立 `tests/` 存放运行工具和端到端场景，不是另一套产品实现。

## 运行与持久化

React 使用 Preload 的 `electronAPI`，通过 Electron IPC 访问 Main。Main 启动 TypeScript Agent Worker；Worker 编排规格、规划、编码和 QA 会话，使用 AI SDK、内置工具及 MCP，并回传日志与状态。

- 应用数据：`Forge Glass Preview` 用户数据目录中的设置、项目登记、账户配置与本地 `memory.db`。
- 项目任务：项目 `.forge-glass-preview/specs/<specId>/` 中的规格、计划、元数据和日志。
- 工作树：项目 `.forge-glass-preview/worktrees/tasks/<specId>/`；当前创建失败会回退项目目录。
- 记忆服务：Main IPC 使用本地 libSQL；Agent Worker 尚未完整接通新记忆服务，项目 `.env`／MCP override 配置链也未接通。

移动源码目录不迁移或删除真实用户数据，不改变应用 ID 或项目数据身份。

## 验证命令

```sh
npm run check:i18n
npm run lint
npm run typecheck
npm test
npm run build
```

`npm test` 执行工具回归与 Vitest；可分别运行 `npm run test:tooling`、`npm run test:unit`。其他入口包括 `npm run test:watch`、`npm run test:coverage`、`npm run test:e2e:helpers`。

```sh
# 在 macOS 上验证真实 Electron 本地界面
npm run test:ui:desktop
npm run test:overlays:desktop
npm run test:files:desktop
npm run test:i18n:desktop
npm run test:logo:desktop

# Playwright 场景需要实际 Electron 构建与对应环境
npm run test:e2e
```

运行 UI 检查前同时隔离 HOME、appData 与 userData，并确认实际运行路径。部分脚本只创建临时 userData，调用环境还需隔离 HOME，保护真实账户和配置。真实在线模型、OAuth、目标平台、原生模块和安装包各自需要实际证据，不能从静态检查或本地夹具推断通过。

`out/` 为编译结果，`dist/` 为安装包，`output/` 为本地验证记录；它们不纳入源码目录职责。打包与发布见 [releasing.md](releasing.md)，当前执行结果见 [implementation-status.md](implementation-status.md)。
