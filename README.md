# Forge Glass Preview

Forge Glass Preview 是以 [Aperant](https://github.com/AndyMik90/Aperant) `v2.8.0-beta.6` 为基座的独立桌面衍生预览，保留上游工作流，采用 Forge 亮色／暗色磨砂玻璃界面。本仓库不是 Aperant 官方版本，也尚未连接兄弟仓库 Forge 的 Python Host；不能将预览版的界面检查等同于 Forge 完整产品验收。

## 下载、打开与语言切换

当前版本：**0.1.0-preview.2**。在本仓库 [Releases](https://github.com/j-tide/Forge-Aperant/releases) 下载 macOS arm64 的 INTERNAL DMG 或 ZIP，校验同页的 SHA256SUMS。DMG 内的 `Forge Glass Preview.app` 可复制至自己的 Applications 文件夹后正常打开，应用不会像自动化测试那样立即退出。

安装包使用 **ADHOC 签名，UNNOTARIZED**，不是 Developer ID 签名的正式发行版。若 macOS 提示无法验证开发者，使用系统“隐私与安全性”中的用户确认流程；不要全局关闭 Gatekeeper。Windows、macOS Intel 和签名／公证仍未验证。

**设置 → 语言 → 中文 / English**：即时切换、自动保存，重启后保留。新建用户数据默认中文；已有显式语言和主题选择保持不变。任务、设置、上下文、知识／记忆、集成、终端、首次使用向导、原生弹窗与应用自己的错误提示均使用统一语言资源。模型输出、用户文本、代码、命令、路径、模型 ID 和品牌名保持原文；语言切换不会翻译或重写已有项目数据。

## 前置条件与数据隔离

预览版有独立应用 ID、用户数据目录、项目数据目录 `.forge-glass-preview/` 和 Claude profile 目录 `~/.forge-glass-preview/claude-profiles/`。不导入或迁移原 Forge SQLite、Aperant `.auto-claude/` 或 `~/.claude-profiles/` 数据。显式配置某 provider 后，它自己的合法 CLI 登录态可能被读取；实际运行仍需 Git 及所选 provider 的可用配置／认证。翻译与窗口检查没有调用付费模型。

首次任务请使用可丢弃仓库。上游自动更新与发布渠道已经关闭，错误上报默认关闭且需要用户选择及衍生版专用 DSN。此预览不是完全自包含的 Coding Agent，也未验证完整任务运行或第二执行器替换。

## 从源码运行

需要 Node.js 24+、npm 10+，使用仓库独立 npm lockfile，不改原 Forge 的 pnpm workspace。

```sh
npm ci
npm run dev
```

正常构建后运行：

```sh
npm run build
npm --workspace apps/desktop run start
```

检查入口：

```sh
npm run check:i18n
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:i18n:desktop
```

`check:i18n` 检查中文／英文 namespace、key、插值、标签及静态源码引用，支持 `--reporter=json`。Electron 语言测试用独立临时 profile，验证亮色和暗色中的切换、保存与重启；不会修改日常预览项目数据，不会调用模型。

## 内部打包与验证边界

macOS arm64 本地检查与截图见 [0.1.0-preview.2 验证记录](docs/releases/0.1.0-preview.2.md)。`package:mac` 的上游 DMG helper 下载曾阻塞，当前内部包通过以下方式生成应用，再用 macOS `ditto` / `hdiutil` 包装 ZIP / DMG：

```sh
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false ../../node_modules/.bin/electron-builder --mac dir --publish never --config.mac.identity=-
```

保留上游依赖的 **33 项 production npm audit 风险（10 high、9 moderate、14 low；基线检查 2026-09-27）**。本轮没有新增依赖，也未声称风险已修复。公开正式发行、Windows / Intel、Python Host 迁移与完整业务验收仍需独立完成。界面截图来自当前 Electron 实现：[中文亮色](docs/screenshots/0.1.0-preview.2/home-zh-light-1440.png)、[中文暗色](docs/screenshots/0.1.0-preview.2/home-zh-dark-1440.png)、[语言设置](docs/screenshots/0.1.0-preview.2/settings-language-zh-light-1440.png)。

## 来源与许可证

完整来源、上游 revision 和修改日期见 [UPSTREAM.md](UPSTREAM.md)。保留原 [GNU AGPL v3.0](LICENSE)、copyright 和上游署名。发布资产附带对应源码；更换品牌不会改变来源或许可证义务。本预览由 Forge 独立修改，与 ProofRun 无关。
