# Forge Desktop

<img src="apps/desktop/resources/icon-256.png" alt="Forge" width="80" />

Forge 的桌面工作台：围绕代码项目组织任务、配置模型与智能体，查看开发活动、终端和文件变化。当前工程是独立的 **Electron + React + TypeScript** npm workspace；亮色与暗色使用同一套紧凑布局。

## 当前版本：0.1.0-preview.5

[下载 macOS Apple Silicon 预览版](https://github.com/j-tide/Forge/releases/tag/v0.1.0-preview.5)。发布页提供 DMG、ZIP、对应源码与 `SHA256SUMS`。

本版重点改进：

- 银灰亮色与石墨暗色重新整理导航、表单和内容层级；保留磨砂外壳、可见键盘焦点、减少动效与透明度。
- 项目标签的配置按钮打开**项目设置**；左下角入口打开**应用设置**。项目保存不会覆盖全局偏好。
- 顶部提示、模型搜索、仓库／分支菜单脱离父容器裁切，长列表可以滚动；新任务分开显示需求与执行配置。
- 草稿保留基准分支与执行配置，中文 `@文件` 引用保留完整相对路径；无效分支与路径明确拒绝。
- Context、记忆、Insights 与 MCP 的迟到结果不会串到其他项目；保存失败保留输入，删除预检失败时阻止删除并提供重试。
- 中文／English 即时切换，主题、语言与辅助偏好在重启后保留。

**INTERNAL / ADHOC / UNNOTARIZED 预发布。**当前衍生桌面尚未连接仓库中的 Forge Python Host；完整在线任务闭环、Windows、macOS Intel、Claude、正式签名／公证及签名更新仍待相应验收。

## 安装与正常打开

1. 从发布页下载 `Forge-0.1.0-preview.5-darwin-arm64-INTERNAL.dmg` 或 `.zip`，核对同页 `SHA256SUMS`。
2. 打开 DMG，将 `Forge.app` 拖入自己的 Applications 文件夹；也可以解压 ZIP。
3. 保存工作并**正常退出旧 Forge**，再从 Finder 打开新版。普通应用会常驻，自动化 smoke 才会结束自己的测试实例。
4. 此包尚未公证，遵循 macOS 自身安全提示；不全局关闭 Gatekeeper。

仓库本机构建路径为 `apps/desktop/dist/0.1.0-preview.5/mac-arm64/Forge.app`。在 `desktop/` 执行 `npm run preview:open`，或在仓库根执行 `pnpm desktop:open`，优先打开当前版本；可在命令后传入明确的 `.app` 路径。旧已发布包与未发布修复包保留，不覆盖其历史证据。

## 操作入口

| 目标 | 入口与操作 |
| --- | --- |
| 打开项目 | 首页「打开项目」选择代码目录；按实际提示初始化项目。首次使用建议选择可丢弃的 Git 仓库。 |
| 配置当前项目 | 顶部项目标签旁的配置按钮 → 项目设置；修改项目偏好后点「保存项目设置」。 |
| 配置应用与模型 | 左下角「设置」→ 账户／智能体设置／路径。按服务商配置合法认证与所需可执行程序。 |
| 创建任务 | 侧栏「新建任务」→ 描述目标、选择阶段模型、检查基准分支和审阅／推送选项 → 创建。 |
| 查看任务 | 任务看板 → 任务详情，查看进度、子任务、日志与文件。开始执行需要独立明确操作。 |
| 项目分析与工具 | 侧栏「项目洞察」「路线图」「上下文」「MCP 概览」；外部服务需要各自的认证与授权。 |
| 调整外观 | 应用设置 → 外观／语言；可选择亮暗主题、中英文、减少透明度和动效。 |

## 前置条件与数据

- 项目操作需要 **Git**；模型调用需要所选服务商的有效认证与网络，部分执行器需要单独安装 CLI。打开窗口或出现配置项不代表模型已可用。
- 应用 ID `dev.iamzjt.forgeglasspreview`、数据目录 `Forge Glass Preview` 与项目目录 `.forge-glass-preview/` 保持稳定。版本升级不重置原 Forge SQLite，不导入其他产品的账户和项目。
- API Profile 写入隔离用户数据目录中的 `forge/profiles.json`，新文件缺失时兼容读取旧配置；不删除旧文件，不在 Renderer 展示密钥。
- 自动上游更新与发布保持关闭。错误上报默认关闭，仅可显式选择衍生版配置。
- 本版 UI 验收没有在线模型调用；无密钥账户夹具只用于界面检查，不证明服务商认证、实际额度或完整 Agent 流程。

## 源码开发

使用 **Node.js 24+、npm 10+** 和本目录的 `package-lock.json`。macOS 原生构建需要 Xcode Command Line Tools。仓库根的 pnpm／Python 工程保持独立。

```sh
cd desktop
npm ci --ignore-scripts
node node_modules/electron/install.js
npm --workspace apps/desktop run postinstall
npm run dev
```

Electron 安装脚本下载其固定版本官方运行时；Desktop postinstall 使用平台原生依赖或本地构建，不下载上游应用的预编译发布包，不修改全局工具。Windows 原生构建可能需要 Visual Studio C++ Build Tools；本版没有 Windows 实机通过证据。

```sh
npm run check:i18n
npm run lint
npm run typecheck
npm test
npm run build

# 真实 Electron 界面与本地交互；没有模型调用
npm run test:ui:desktop
npm run test:overlays:desktop
npm run test:files:desktop
npm run test:i18n:desktop
npm run test:logo:desktop
```

macOS 界面检查使用独立临时数据目录；Linux CI 检查静态类型、单元测试与构建，不代替桌面实机验收。手工打包与发布要求见 [RELEASE.md](RELEASE.md)。

## 截图与验证

[版本说明](docs/releases/0.1.0-preview.5.md)记录实际检查、安装包摘要与未验项目。[实施状态](../docs/implementation-status.md)记录本地修复、验证结论及未验项。

| 亮色 | 暗色 |
| --- | --- |
| ![亮色首页](docs/screenshots/0.1.0-preview.5/home-light-1440.png) | ![暗色首页](docs/screenshots/0.1.0-preview.5/home-dark-1440.png) |
| ![亮色新任务](docs/screenshots/0.1.0-preview.5/new-task-light-1440.png) | ![暗色新任务](docs/screenshots/0.1.0-preview.5/new-task-dark-1440.png) |

截图来自实际 `.5` 编译代码运行的 Electron。标有「UI 测试」的项目与任务是独立验收夹具，没有执行在线 Agent；完整来源与文件摘要见 [screenshots.json](docs/screenshots/0.1.0-preview.5/screenshots.json)。

继承 production npm audit 风险仍为 **33 项：10 high、9 moderate、14 low、0 critical**。本版没有新增依赖，也未将这些风险标为解决。手机与远程新增开发继续后置。

## 来源与许可证

衍生桌面基于 Aperant `v2.8.0-beta.6`，采用 [AGPL-3.0](LICENSE)。原作者、版权及修改记录保留在 [UPSTREAM.md](UPSTREAM.md)；发布页提供与 tag 对应的完整源码。仓库原 Forge Python Host、契约及 Vue 历史实现的验收不能直接转移给本衍生应用。
