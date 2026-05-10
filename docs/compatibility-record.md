# P0-01 版本与兼容性记录

核验日期：2026-09-23。范围仅为仓库开发工具链，不代表 Forge Desktop/Host 或 SDK 兼容性。

| 项目 | 锁定版本 | 许可证 | 本轮证据与结果 |
| --- | --- | --- | --- |
| Node.js | 本地/CI 基线 22.22.0；`engines` 接受 22.13.0–22.x | MIT | 本机 `node --version` = 22.22.0；`process.versions.modules` = 127、N-API = 10。只验证 macOS arm64 上本轮工具链。 |
| pnpm | 12.3.4 | MIT | 本机 `pnpm --version`；官方安装页确认 pnpm 12 支持 Node 22；冻结 lockfile 安装通过。 |
| TypeScript | 5.9.3 | Apache-2.0 | registry 精确版本/engines；与 typescript-eslint 的 `<6.1.0` peer 范围相符；strict typecheck 与构建通过。 |
| ESLint | 10.11.0 | MIT | 官方文档要求 Node `^22.13.0` 或兼容版本；registry 精确版本/engines；lint 通过。 |
| @eslint/js | 10.0.1 | MIT | registry peer 需要 ESLint `^10.0.0`；lint 通过。 |
| typescript-eslint | 8.70.1 | MIT | 官方 flat config 用法；registry peer 接受 ESLint 10 和 TypeScript 5.9；lint 通过。 |

上述直接依赖的分发方式为 npm registry 包，pnpm 使用内容寻址 store 和锁文件完整性字段。`versions.lock.json` 中的 `registryUnpackedBytes` 来自对应精确版本的 npm registry 元数据，不是 Forge 分发包体积；Electron 等原生分发物未安装，体积待测。`@forge/contracts` 为仓库内部私有包，不是第三方许可证项。

`docs/dependency-licenses.json` 是本机已安装依赖树的 96 个名称、版本及许可证清单，由 `pnpm licenses list --json` 生成（不含外部 pnpm 可执行文件）。当前许可证类型为 MIT、Apache-2.0、BSD-2-Clause、BSD-3-Clause、ISC、BlueOak-1.0.0。跨平台可选依赖树还需在目标平台重新盘点。冻结安装报告锁文件通过供应链策略检查；本轮未进行漏洞审计或代码签名验证。

## 核验来源

- [pnpm 安装与 Node 兼容性](https://pnpm.io/installation)、[pnpm install 与冻结 lockfile](https://pnpm.io/cli/install)、[pnpm workspace](https://pnpm.io/workspaces)、[pnpm 12 设置位置](https://pnpm.io/settings)
- [ESLint 安装前置条件](https://eslint.org/docs/latest/use/getting-started)、[typescript-eslint flat config](https://typescript-eslint.io/getting-started/)
- [TypeScript 5.9 发布说明](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- 各精确版本、许可证、engines、peerDependencies 和解包大小：2026-09-23 执行 `pnpm view <name>@<version> version license engines peerDependencies dist.unpackedSize --json`，具体结果由 `versions.lock.json` 和本记录保存。

## 后续验证矩阵

| 组合 | 状态 | 后续任务 |
| --- | --- | --- |
| Electron + 内置 Node、macOS/Windows 启动及 IPC | 未安装、未验证 | P0-02 |
| Vue 3 + Vite 共享 UI | 未安装、未验证 | P0-02 |
| Host 独立入口与 CommandBus | 未实现、未验证 | P0-03 |
| SQLite/Drizzle 与 Electron/Node ABI | 未安装、未验证 | P0-04 |
| Codex SDK / CLI 真实认证、取消、恢复 | 未安装、未验证 | P0-05 |
| macOS Intel、Windows x64 | 无本轮实机结果 | 后续平台验证 |

参考矩阵在 `forge_spec_v1.0/docs/compatibility-record.md`；它仍保持原样。本记录不把本机 Node ABI 当作未来 Electron ABI。
