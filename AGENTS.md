# Forge 仓库实施规则

## 当前唯一工程

- 2026-09-29 用户明确要求删除整个旧 Forge 实现，仅保留 Aperant 衍生桌面；随后授权整理代码结构。桌面现已移至仓库根，使用单一 `package.json`／`package-lock.json`，不再有 `desktop/` 或 npm workspace。
- 产品源码位于 `src/main`、`src/preload`、`src/renderer`、`src/shared`，采用 Electron + React + TypeScript。实际链路是 Renderer → Preload `electronAPI` → Electron Main IPC → TypeScript Agent Workers / Vercel AI SDK。
- 原 Forge 的 Vue 桌面、Python／TypeScript Core、Node Host、插件、契约、任务图和旧验收资料已删除；不得作为迁移参考、业务 fallback 或待接入架构重新引入。
- 本工程基于 Aperant `v2.8.0-beta.6`，须保留根 [LICENSE](LICENSE)、[UPSTREAM.md](UPSTREAM.md)、原作者版权、应用内来源入口及对应源码义务。不得声称 Aperant 官方维护或原创全部上游代码。
- 上游公开历史导入快照不代表导入者原创。已验证原导入历史的本地 bundle 位于 `.git/forge-import-history/`；保留明确来源，不改写已发布版本事实。

## 目录职责

- `src/main/`：Electron 应用服务、领域 IPC、Agent 生命周期、终端、账户和平台集成；`src/main/ai/`：TypeScript Worker、模型、会话、编排、工具、安全检查、记忆与工作树。
- `src/preload/`：面向 Renderer 的 `electronAPI`；`src/renderer/`：React 页面、组件、hooks、Zustand stores 和样式；`src/shared/`：类型、常量、国际化与状态机。
- `resources/`：图标、品牌、平台资源；`prompts/`：运行时提示词；`scripts/build/`、`scripts/dev/`、`scripts/checks/`：构建、启动和静态检查。
- 单元与集成用例仍与 `src/` 模块相邻；独立工具、UI 与端到端用例分别位于 `tests/tooling/`、`tests/ui/`、`tests/e2e/`。
- 当前文档位于 `docs/`，唯一 CI 位于 `.github/workflows/desktop-quality.yml`；`out/`、`dist/`、`output/` 是生成产物或验证证据，不是第二套源码。

## 实施边界

- 按用户当前需求增量修改，一次完成一个可验证功能或缺口，再继续下一项。真实入口与运行结果一致，Demo、模拟和夹具不得冒充真实产品成功。
- 保持 Forge 玻璃视觉、中文／English、亮暗主题、键盘操作及减少动效／透明度有效；不得覆盖已保存偏好。
- Renderer 使用公开 Preload 接口，不增加任意 Node／Shell／IPC 入口。权限、取消、恢复和持久化按现有真实实现验证；不虚构已删除的审批或快照门禁。
- 当前 libSQL 记忆服务主要通过 Main 的 IPC 使用，未完整接入 Agent Worker；Git worktree 创建失败可能回退项目目录。修改或记录时不得承诺强制隔离、完整记忆注入或未实现的配置链。
- 模型及第三方服务请求遵守已有用户认证与计费授权；外部发布、合并、删除真实资源依照用户明确授权。日志、诊断、截图及提交不得包含密钥。
- 保持应用 ID `dev.iamzjt.forgeglasspreview`、用户数据目录 `Forge Glass Preview` 和项目 `.forge-glass-preview/` 身份稳定。不得重置或删除真实用户项目、任务、SQLite、账号与设置。
- 自动上游更新、自动发布及默认错误上报继续关闭。手机、Companion、远程及跨设备新增开发后置。

## 验证与记录

- 使用根 `package-lock.json`、Node.js 24+ 和 npm 10+，命令在仓库根执行。不得更改用户全局工具；新增依赖检查兼容性和许可证。
- 实际执行 i18n、lint、typecheck、test、build；UI／安装态、在线服务、SDK 和目标平台分别按真实结果记录。旧版本或条件夹具不能移作当前完整验收。
- 本地实施记录位于 [docs/implementation-status.md](docs/implementation-status.md)；开发入口见 [docs/development.md](docs/development.md)。结构变更后的检查必须重跑，不借用结构变更前的通过结论。
- 历史 `docs/releases/` 与版本截图只表示发布时状态，保持事实和摘要原值；移动文档可修正失效的相对链接。
- 发布遵循 [docs/releasing.md](docs/releasing.md)。未明确授权时不提交、推送、发布或覆盖既有版本；当前会话已授权的动作无需重复询问。

## Computer Use 生命周期

- 优先连接器、API、浏览器工具与 CLI。初始化 `computer-use`、`@oai/sky` 或 `sky.*` 后，记录同一 `node_repl` 的 `process.pid`；界面显示 `No Active Sessions` 不代表运行时已清理。
- 最终回复前执行 `/Users/iamzjt/.codex/bin/cleanup-computer-use --pid <pid> --shared-if-idle`，默认验证延迟五秒；仅在成功退出且 `result=clean` 时声明清理完成。
- PID 可用时必须按 PID 清理；仅在只读检查确认不会影响其他任务时，以 `--cwd "$PWD"` 作为无 PID 的后备方式。
- 不得全局 `pkill`。仅当用户明确要求停止所有运行时，或只读确认没有其他任务时，先 `--all --dry-run`，再 `--all --confirm-all`。
- 残留进程、IPC 文件或保留的共享运行时必须披露。用户明确要求保留 Computer Use 时不清理，并说明有意保留。
