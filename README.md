# Forge

Forge 是自然语言驱动的多 Agent 研发工作台。需求先成为可编辑的 Task Contract，经人工批准进入 TODO；开发、Review、验证与人工验收依靠真实状态和证据。Done 不代表合并或部署。Forge 与 ProofRun 完全独立。

## 当前状态

当前 v0.0.1 只完成 P0-01 的工作区与版本基线。尚无可启动的 Desktop、Web 或 Host，也没有 Agent、模型、数据库或真实任务流。`packages/contracts` 目前提供可构建的公开入口和与规格基线同步的 Schema 名称表；Schema 校验系统属于后续 P0-08。

工程规格在 `forge_spec_v1.0/`；新版视觉方向在 `forge_glass_v1.1/`。两份目录均为只读参考。后续界面实现采用新版银白雾面方向、清晰阅读表面与减少透明度/动效回退；原型 HTML 与截图均不参与产品构建。

## 前置条件

- Node.js `>=22.13.0 <23`；本轮本机验证版本为 `22.22.0`。
- pnpm `12.3.4`；仓库通过 `packageManager` 固定版本。无需修改全局开发环境；安装或切换工具请自行使用符合版本的本地工具链。

## 安装与检查

在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` 会先构建 `@forge/contracts`，再执行 Node 测试。首次变更依赖并重新生成 lockfile 时才运行普通 `pnpm install`；CI 使用冻结锁文件安装。`pnpm-workspace.yaml` 禁用依赖安装脚本；添加需要安装脚本的原生依赖前须单独审查。

本轮检查只覆盖当前工作区包、公开入口和规格 Schema 名称同步，不等于 Desktop/Host 产品验收。实际结果与未验证项见 `docs/implementation-status.md` 和 `docs/compatibility-record.md`。
