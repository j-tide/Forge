# Forge

<img src="apps/desktop/resources/icon-256.png" alt="Forge" width="80" />

Forge 是亮色／暗色磨砂玻璃桌面 AI 研发工作台。此 npm 工程作为独立 `desktop/` 目录归入 [Forge 仓库](https://github.com/j-tide/Forge/tree/main/desktop)。原 Forge 的 Python Host、契约及 Vue 历史实现保留在仓库根；**当前衍生 Desktop 尚未连接该 Python Host，不代表完整 Forge 产品已验收**。代码来源、AGPL 许可证及修改记录见 [UPSTREAM.md](UPSTREAM.md) / [LICENSE](LICENSE)。

## 当前版本：0.1.0-preview.3

[Forge Releases](https://github.com/j-tide/Forge/releases/tag/v0.1.0-preview.3) 提供 macOS arm64 内部 DMG、ZIP、完整对应源码及 SHA256SUMS。该版本包括：

- 普通界面、原生窗口、工具与诊断统一使用 Forge 品牌，保留来源／许可证入口。
- 原创斜切 F 标识接入侧栏展开／收起、欢迎、向导、关于、设置、favicon、Dock / Finder 及平台图标。亮暗主题共用同一透明轮廓与主题色。
- API Profile 写入既有隔离数据目录中的 `forge/profiles.json`，新文件不存在时兼容读取旧配置；旧文件不删除，凭据文件保持私有权限。
- 内置工具使用 `mcp__forge__` 命名空间，已存配置保留明确兼容别名；数据所有权和安全排除规则保持。
- 中文／English 设置即时切换并持久保存；不改写用户内容、模型输出、路径、代码及模型 ID。

**INTERNAL / ADHOC / UNNOTARIZED，预发布。**不是 Developer ID 签名或正式产品发行；Windows、macOS Intel、Python Host 集成、完整任务闭环和第二执行器验收尚未在此基座完成。

## 安装和正常打开

1. 从 Release 下载 `Forge-0.1.0-preview.3-darwin-arm64-INTERNAL.dmg` 或 `.zip`，核对同页 SHA256SUMS。
2. 打开 DMG，将 `Forge.app` 拖到自己的 Applications 文件夹，或解压 ZIP。
3. 用 Finder 正常打开应用。应用常驻，不使用测试／Smoke 入口。
4. 若系统提示无法验证开发者，按 macOS“隐私与安全性”中的用户确认流程操作；不要全局关闭 Gatekeeper。
5. **设置 → 语言 → 中文 / English**；主题与语言均保留用户已有显式选择。

已发布版本的本机构建位于 `apps/desktop/dist/0.1.0-preview.3/mac-arm64/Forge.app`。如果存在本地修复构建 `apps/desktop/dist/settings-unreleased/mac-arm64/Forge.app`，`npm run preview:open` 和根目录 `pnpm desktop:open` 优先打开它；也接受明确的 `.app` 路径。这是未发布的工作区构建，已发布资产和历史包保留，不覆盖。

## 前置条件、数据和能力边界

- 实际项目操作需要 Git，以及所选 provider 自己合法配置的认证／可执行程序／网络。此包不是完全自包含的 Coding Agent。
- 使用稳定应用 ID `dev.iamzjt.forgeglasspreview`、用户数据目录 `Forge Glass Preview`、项目数据目录 `.forge-glass-preview/` 与独立 Claude profiles。品牌改名和仓库归拢不迁移或重置原 Forge SQLite，也不导入其他产品的项目和账号。
- 当前界面和图标验收没有调用付费模型；不能把单元 fixture 或 Logo 截图当成真实 Agent / Review / Verify 验收。
- 自动上游更新／发布关闭；错误上报默认关闭，仅可显式选择及使用衍生版专用配置。
- 第一次执行任务请使用可丢弃项目。工具注册不等于操作授权，项目和凭据不能来自其他产品的未授权登录。

## 从源码运行

在仓库 `desktop/` 目录使用 **Node.js24+ / npm10+** 和该目录独立 npm lockfile；原 Python/pnpm 项目不并入这个 npm workspace。

```sh
cd desktop
npm ci --ignore-scripts
node node_modules/electron/install.js
npm --workspace apps/desktop run postinstall
npm run dev
```

Electron 安装脚本仅下载其官方固定版本运行时；Desktop postinstall 本地构建所需原生依赖，不下载上游预编译包、不更改全局工具。Windows 源码原生构建可能需要 Visual Studio C++ Build Tools；本版本没有 Windows 运行通过证据。

```sh
npm run check:i18n
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:logo:desktop
npm run test:i18n:desktop
```

Logo／语言实际 Electron 检查当前支持 macOS，本机使用独立临时 profile，不修改日常数据、不调用模型。Linux CI 运行静态／单元／构建检查，不声称桌面视觉实机通过。

## 验证与资产

[版本验证记录](docs/releases/0.1.0-preview.3.md)记录最终版本、真实命令、包摘要及未验项。原创资产／完整 imagegen 提示词／格式转换说明位于 [resources/branding](apps/desktop/resources/branding/README.md)。

[亮色](docs/screenshots/0.1.0-preview.3/home-light-1440.png)、[暗色](docs/screenshots/0.1.0-preview.3/home-dark-1440.png)、[收起侧栏](docs/screenshots/0.1.0-preview.3/home-collapsed-dark-1440.png)均来自实际 Electron 实现。旧[0.1.0-preview.2](https://github.com/j-tide/Forge-Aperant/releases/tag/v0.1.0-preview.2)和未发布 Logo 构建的记录保留为对应版本的历史证据。

已知 production npm audit 基线33项风险（10 high／9 moderate／14 low）；新版本没有增加依赖或擅自更新依赖，本次实际复核结果见版本验证记录。完整业务、Windows/Intel、签名公证、正式更新、Claude及Python Host集成等验收不因预览发布而通过。手机和远程开发继续后置。
