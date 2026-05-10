# Forge 实施状态

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
