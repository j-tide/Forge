<div align="center">

<img src="desktop/apps/desktop/resources/icon-256.png" alt="Forge 标志" width="64" height="64" />

# Forge

### 从想法，到有证据的交付。

任务契约 · Agent 分工 · 代码快照 · 人工验收

[![Preview](https://img.shields.io/badge/desktop-0.1.0--preview.4-476b9b?style=flat-square)](https://github.com/j-tide/Forge/releases/tag/v0.1.0-preview.4) [![Python Core](https://img.shields.io/badge/core-Python_3.12%2B-3776AB?style=flat-square)](python/) [![Desktop CI](https://github.com/j-tide/Forge/actions/workflows/desktop-quality.yml/badge.svg)](https://github.com/j-tide/Forge/actions/workflows/desktop-quality.yml) [![Desktop License](https://img.shields.io/badge/desktop_license-AGPL--3.0-64748b?style=flat-square)](desktop/LICENSE)

[**核心亮点**](#核心亮点) · [系统架构](#系统架构) · [数据流](#从需求到交付数据如何流动) · [桌面预览](#桌面预览) · [开始使用](#开始使用)

**简体中文** / [English](README.en.md)

</div>

Forge 是面向 **可审查交付** 的开源 AI 编程工作台。自然语言先形成可编辑的任务契约，再由规划、开发、审查与验证协作完成工作；完整流程串联运行配置、上下文、代码快照和检查结果。**你掌握任务批准、开始执行、最终接受与合并的决定。**

> **当前进展**：Forge 由独立的 **Python Core** 和 **Desktop** 组成。下述交付流程已有 Core 实现及原 Forge 桌面的版本限定验证记录；当前发布的 `desktop/` 衍生预览正在整合中，**尚未接入 Python Host**。[查看验证范围](#项目进展)。

## 系统架构

**界面负责交互，Core 掌握状态，插件提供执行能力。** Forge 将任务生命周期与具体模型、执行器和桌面界面分开，使审批、权限和证据遵循同一套规则。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/architecture.zh-CN.dark.svg" />
  <img src="docs/assets/readme/architecture.zh-CN.light.svg" alt="Forge 系统架构：桌面入口、Python Host 业务核心、插件与执行器、状态和代码存储；衍生桌面到 Host 的待接入路径单独标注" width="100%" />
</picture>

[查看架构大图](docs/assets/readme/architecture.zh-CN.light.svg) · [图示源文件](docs/assets/readme/architecture.zh-CN.json)

图中区分原 Forge 桌面的已有运行路径与当前衍生桌面的待接入路径。Python Host 边界源于 [ADR 0029](docs/decisions/0029-python-core-runtime-architecture.md)，桌面整合路线见 [ADR 0087](docs/decisions/0087-aperant-derived-desktop-base.md)。

| 层次 | 负责什么 | 关键边界 |
| --- | --- | --- |
| **Desktop / Client** | 项目、看板、任务详情、配置与证据展示。 | 最终集成中，Renderer 通过受限桥接访问 Host；Main 负责系统集成与 Host 生命周期。 |
| **Python Host / Core** | 任务契约、审批、工作流、Run 调度、上下文、审查、验证与交付。 | 统一决定业务状态，通过有版本的 JSON-RPC over stdio 与桌面通信。 |
| **Plugins / Executors** | 接入模型、执行器与受控工具能力。 | 通过公开 Python API 注册能力；插件不能直接修改 Core 状态或生成有效的人类审批。 |
| **Persistence / Workspace** | SQLite 状态、Git 工作树、代码快照、报告与交付记录。 | 保存版本和来源关系；同一工作区只允许一个写入者。 |

## 核心亮点

### 01 · 先把需求说清楚，再让 Agent 动手

Forge 将自然语言整理为 **Task Contract**：目标、验收标准、允许修改的范围、明确排除的事项，以及仍需澄清的问题。你可以编辑和修订契约，再批准对应版本。

批准绑定任务版本与范围摘要；任务进入待办后，由你另行开始执行。需求发生变化时，旧审批不会悄悄成为新任务的授权。

### 02 · 让规划、开发、审查与验证各司其职

**Planner** 产出结构化计划，**Developer** 在隔离工作树修改代码，**Reviewer** 面向固定快照进行独立只读审查，**Verifier** 运行已批准的项目检查命令。

Planner、Developer、Reviewer 拥有各自的 Profile、模型和能力要求；Workflow 明确阶段顺序与门禁。审查意见和失败检查可以形成返工交接，保留问题来源，并受到轮次、尝试次数和运行预算约束。

### 03 · 每条验收标准，都能追到对应证据

代码产出被固化为 **CodeSnapshot**。Review、Verify 和逐条验收决定，都关联同一任务版本与代码快照。验收矩阵区分已验证、失败、待人工检查、未验证和明确接受的风险。

最终交付记录串起运行、计划、代码快照、审查与检查报告，以及人的接受决定，可以沿引用查看配置与代码差异。代码或验收依据变化后，旧结论不能推进新版本。

### 04 · 隔离修改，也认真处理停止与中断

开发使用独立 **Git worktree** 和固定基线，工作区租约保证单一写入者。取消运行时，Host 确认所属进程退出后才释放租约；无法确认的中断保留隔离状态、Diff 和诊断记录。

这让“在哪里改、谁在改、是否真的停下”都成为系统状态。任务标记为 **Done** 后，合并仍需要单独决定。

### 05 · 流程可以升级，运行中的任务保持原样

已发布的 Workflow、Agent Profile、插件版本、模型和预算被固定在 **RunConfig** 中。后续调整配置不会改写已有运行；历史任务仍能回看当时采用的流程与参数。

当前支持经过校验的 `quick`、`standard`、`strict` 线性流程。工作流画布和配置用于表达流程，是否允许执行由 Core 检查。

### 06 · 项目记忆有出处，也能被纠正

项目知识保留原文位置、版本与哈希；记忆从候选开始，经过人工确认才参与上下文。内容按项目与环境隔离，支持冲突处理、过期、替换和撤销。

运行使用的资料来源会被冻结，之后仍能查看来源是否失效。项目经验可以辅助执行，验收依据始终来自批准的任务契约。

## 从需求到交付，数据如何流动

下面展示 **Python Core 的任务与证据链**。每个阶段接收有明确来源的输入，并产出可持久保存的记录；图示不代表当前桌面预览已接通整条链路。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/task-flow.zh-CN.dark.svg" />
  <img src="docs/assets/readme/task-flow.zh-CN.light.svg" alt="Forge 任务数据流：需求形成 Task Contract，人工批准和显式开始后冻结运行配置，规划产出计划，开发产出代码快照，审查和验证形成验收证据，最终人工接受并记录交付；失败走有限返工" width="100%" />
</picture>

[查看数据流大图](docs/assets/readme/task-flow.zh-CN.light.svg) · [图示源文件](docs/assets/readme/task-flow.zh-CN.json)

### 贯穿全程的五份记录

| 记录 | 固定了什么 | 解决的问题 |
| --- | --- | --- |
| **Task Contract** | 目标、范围、验收标准、版本及批准依据。 | 这次究竟要完成什么？ |
| **RunConfig + ContextBundle** | 流程、角色、模型、预算、命令预设及知识来源。 | Agent 当时按什么规则、参考什么资料执行？ |
| **CodeSnapshot** | 某次开发产出的固定代码版本与差异。 | 这份审查或检查针对哪一版代码？ |
| **Review / Verify / Acceptance** | 审查问题、真实命令结果及逐项验收决定。 | 有哪些证据支持接受，哪些要求仍未验证？ |
| **Delivery Record** | 被接受的快照、关联报告、风险和人工决定。 | 最终交付了什么，由谁依据什么接受？ |

**返工启动新的运行，开发成功后生成新快照。** 系统保留失败原因与原始证据；新代码需要对应的新检查，不能借用旧版本的“通过”。达到限制时，流程停止并留下待处理原因。

### 一个具体例子：为订单页面增加 CSV 导出

下面是任务契约的**简化字段示意**，用来说明如何把一句需求变成可检查的目标；它不是完整的导入文件，也不代表已经运行过这个示例。

```yaml
title: 为订单页面增加 CSV 导出
goal: 让用户导出当前筛选范围内的订单
scope:
  - 订单列表页面及导出服务
  - 对应的自动化测试
outOfScope:
  - 修改订单数据库结构
  - 更改其他页面的交互
acceptance:
  - id: AC-1
    statement: 导出结果与当前筛选条件一致
    method: automated
    required: true
  - id: AC-2
    statement: 中文、逗号和换行字段正确转义
    method: automated
    required: true
  - id: AC-3
    statement: 空结果和导出失败有明确反馈
    method: manual
    required: true
```

Planner 根据边界制定计划；Developer 实现；Reviewer 检查代码快照；Verifier 执行已批准的检查。你可以逐项查看 AC-1 至 AC-3 的证据，选择接受或退回。**接受交付、合并代码、发布应用是三个独立决定。**

## Agent 分工与工作流

### 职责明确，结果可交接

| 角色 / 服务 | 输入 | 产出与权限 |
| --- | --- | --- |
| **Refiner · 需求整理** | 用户消息与允许使用的项目上下文。 | 可编辑契约、澄清问题；不直接开始开发。 |
| **Planner · 规划** | 已批准契约、固定 Git 基线与阶段上下文。 | 带版本与来源的 Plan Artifact；只读规划。 |
| **Developer · 开发** | 契约，以及适用的计划或返工反馈。 | 隔离工作树中的代码变更和开发交接。 |
| **Reviewer · 审查** | 固定快照、Diff 与独立审查上下文。 | 结构化问题与审查结论；使用只读副本。 |
| **Verifier · 项目检查服务** | 固定快照与已批准的命令预设。 | 命令退出状态与报告；它是执行检查的服务，不是模型自述。 |
| **Owner · 人** | 任务、计划或交付证据。 | 批准、开始、退回、风险决定与最终接受。 |

### 三种流程，保留明确的验收门禁

| 流程 | 阶段 | 适合的任务 |
| --- | --- | --- |
| **Quick** | Develop → Review → Verify → 人工验收 | 范围明确的小修改，省略独立规划阶段。 |
| **Standard** | Plan → Develop → Review → Verify → 人工验收 | 需要先整理实施步骤的功能开发与重构。 |
| **Strict** | Plan → **人工确认计划** → Develop → Review → Verify → 人工验收 | 希望先批准实施方案，再允许代码修改的任务。 |

阶段顺序定义交接关系，具体推进受 Host 门禁控制。Standard 在计划成功后自动继续 Developer；Strict 先等待计划批准。Review、Verify 首次启动仍为显式操作，返工后的相应复核由受控返工链触发，最终接受始终由人决定。

原 Forge 安装版已有 Standard 的真实 Codex 完整路径证据，Strict 完整路径仍未验收。定义见[流程预设](python/src/forge/workflow_presets/)，运行边界见 [ADR 0067](docs/decisions/0067-published-linear-workflow-runtime-and-retrieval-freeze.md)。

## 桌面预览

当前桌面围绕项目组织任务、模型配置、终端与工作树。银灰亮色与石墨暗色共用紧凑布局，支持中文 / English、键盘操作、减少动效与透明度。

### 描述需求，配置一次任务

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="desktop/docs/screenshots/0.1.0-preview.4/new-task-dark-1440.png" />
  <img src="desktop/docs/screenshots/0.1.0-preview.4/new-task-light-1440.png" alt="Forge 当前预览版新建任务界面：需求描述、文件与图片上下文、阶段模型和 Git 选项" width="100%" />
</picture>

### 在同一个工作台里管理项目与偏好

| 项目设置 | English / 暗色界面 |
| --- | --- |
| ![Forge 项目设置](desktop/docs/screenshots/0.1.0-preview.4/project-settings-general-light.png) | ![Forge 英文暗色语言设置](desktop/docs/screenshots/0.1.0-preview.4/settings-language-en-dark-1440.png) |

这些是 `0.1.0-preview.4` 的真实 Electron 截图，项目与任务使用隔离 UI 测试数据，未在截图过程中执行在线 Agent。[截图来源与摘要](desktop/docs/screenshots/0.1.0-preview.4/screenshots.json)。

## 开始使用

### 下载桌面预览

当前版本 **0.1.0-preview.4**，提供 **macOS Apple Silicon（M 系列芯片）** 安装包。

| 下载 | 用途 |
| --- | --- |
| [**macOS DMG**](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/Forge-0.1.0-preview.4-darwin-arm64-INTERNAL.dmg) | 打开后将 `Forge.app` 拖入 Applications。 |
| [macOS ZIP](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/Forge-0.1.0-preview.4-darwin-arm64-INTERNAL.zip) | 解压后打开 `Forge.app`。 |
| [对应源码](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/Forge-0.1.0-preview.4-source.tar.gz) | 与发布 tag 对应的完整源码。 |
| [SHA256SUMS](https://github.com/j-tide/Forge/releases/download/v0.1.0-preview.4/SHA256SUMS) | 核对下载文件摘要。 |

安装包为 **INTERNAL / ADHOC / UNNOTARIZED** 预发布，使用 ad-hoc 签名，尚未完成 Developer ID 签名与公证。核对下载摘要后正常退出旧版，再从 Finder 打开新版；遵循 macOS 的安全提示，无需全局关闭 Gatekeeper。

### 第一次使用

1. **打开项目**：选择本地 Git 目录，按提示完成初始化；首次试用建议使用测试仓库。
2. **配置模型**：在「设置 → 账户」配置自己的认证，在「智能体设置」选择阶段模型；需要 CLI 时配置可执行程序路径。
3. **创建任务**：描述目标，引用文件或添加图片，检查基准分支、工作树、审阅与推送选项后保存。
4. **明确开始**：创建后在看板点击「开始」；通过任务详情、终端和工作树检查活动。当前预览的完整在线链路仍待验收。

项目功能需要 **Git**，模型调用需要有效认证与网络；部分执行器需要对应 CLI。更多入口和数据目录说明见[桌面文档](desktop/README.md)。

## 项目进展

| 范围 | 已有实现与证据 | 当前边界 |
| --- | --- | --- |
| **Python Core 交付链** | 任务契约、角色分工、隔离执行、快照审查、命令验证、人工验收和交付记录。原 Forge macOS arm64 安装版有真实 Codex Standard 路径记录。 | 证据属于对应历史构建；不代表当前衍生预览已打通，也不代表全部验收用例通过。 |
| **当前衍生 Desktop** | 亮暗界面、本地任务保存、项目设置、键盘与偏好重启恢复；DMG 安装启动和包内一致性检查。 | 尚未接入 Forge Python Host，完整在线任务闭环待验。 |
| **执行器与扩展** | Codex 真实路径、公开 Python 插件 API、能力与权限校验。 | Claude 完整路径、外部 MCP 和第三方集成仍待相应验收。 |
| **分发与平台** | macOS Apple Silicon 内部预览；Linux CI 静态检查、单元测试与构建。 | Windows、Intel Mac 实机、正式签名、公证与签名更新待验。 |
| **手机与远程** | 保留已有代码与历史记录。 | 新增开发后置，远程网络入口默认关闭。 |

下一步重点是 **新桌面与 Core 的真实接入、桌面功能逐项验收，以及安装版交付链验证**。已知依赖审计风险见[发布说明](desktop/docs/releases/0.1.0-preview.4.md#未关闭风险)；进度和版本限定证据见[实施记录](docs/implementation-status.md)。

## 本地开发

### Desktop · Electron + React + TypeScript

前置条件：**Node.js 24+、npm 10+、Git**。macOS 原生构建需要 Xcode Command Line Tools。

```sh
git clone https://github.com/j-tide/Forge.git
cd Forge/desktop

npm ci --ignore-scripts
node node_modules/electron/install.js
npm --workspace apps/desktop run postinstall
npm run dev
```

在 `desktop/` 执行检查和构建：

```sh
npm run check:i18n
npm run lint
npm run typecheck
npm test
npm run build
```

修改界面交互后，在 macOS 执行实际 Electron 回归。测试使用隔离数据，不调用在线模型：

```sh
npm run test:ui:desktop
npm run test:overlays:desktop
npm run test:files:desktop
npm run test:i18n:desktop
```

### Core · Python + asyncio + Pydantic + SQLite

Python 使用 **3.12+** 和 uv。仓库根的独立 pnpm 工程要求 **Node.js `>=22.13.0 <23`、pnpm `12.3.4`**；与 `desktop/` 使用不同的 Node 要求和锁文件。切换到对应环境后，在仓库根执行：

```sh
pnpm install --frozen-lockfile
pnpm py:check          # 同步依赖，运行 Ruff、mypy 与 pytest
pnpm dev:python-host   # 独立启动 stdio Host
```

Host 标准输出用于协议通信。独立启动 Host 不会自动接通衍生桌面。工具版本见 [versions.lock.json](versions.lock.json)。

### 仓库结构

```text
Forge/
├── desktop/              # 当前衍生桌面，独立 npm workspace
├── python/src/forge/     # 任务、工作流、执行、上下文、证据与插件 Core
├── python/tests/         # Python Core 测试
├── apps/                 # 原 Forge 桌面 / Vue UI；旧 Node Host 对照
├── packages/             # 公开契约、客户端、共享 UI 与校验器
├── plugins/              # 原 TypeScript 插件迁移对照
├── tests/                # 集成测试与验收夹具
└── docs/                 # 架构决策、图示、实施记录与验证证据
```

## 深入阅读与参与贡献

| 你想了解 | 从这里开始 |
| --- | --- |
| 任务契约如何定义 | [Task Contract 模型](python/src/forge/drafts.py) · [审批与待办](docs/decisions/0014-task-approval-and-atomic-todo.md) |
| 一次运行如何保持一致 | [RunConfig](python/src/forge/run_config.py) · [发布工作流与上下文冻结](docs/decisions/0067-published-linear-workflow-runtime-and-retrieval-freeze.md) |
| 交付结论如何形成 | [验收矩阵](python/src/forge/acceptance_matrix.py) · [最终人工接受](docs/decisions/0042-snapshot-bound-final-human-acceptance.md) |
| 扩展能力如何接入 | [插件开发](docs/plugin-authoring.md) · [公开 Python API](python/src/forge/plugin_api.py) |
| 桌面如何运行与构建 | [桌面文档](desktop/README.md) · [打包说明](desktop/RELEASE.md) |
| 已验证到哪一步 | [版本说明](desktop/docs/releases/0.1.0-preview.4.md) · [实施记录](docs/implementation-status.md) |

欢迎文档、翻译、界面和 Core 贡献。通过 [Issues](https://github.com/j-tide/Forge/issues) 提交使用场景或可复现的问题；PR 聚焦一个改进，附真实验证结果，界面修改附截图。日志与截图请移除密钥和个人信息。

修改前阅读 [AGENTS.md](AGENTS.md)。涉及架构、权限或产品状态的变更先讨论方案；桌面与根工程分别执行对应检查，并保留用户数据、版权与来源声明。

## 致谢与许可证

当前桌面基于 [Aperant](https://github.com/AndyMik90/Aperant) **`v2.8.0-beta.6`** 衍生开发，采用 [GNU AGPL-3.0](desktop/LICENSE)。感谢 AndyMik90 与上游贡献者；原版权、许可证和来源声明保留，Forge 由本项目独立维护。

导入版本、原始提交与修改记录见 [UPSTREAM.md](desktop/UPSTREAM.md)。发布页提供对应完整源码；其他目录的许可边界遵循各自声明与 [ADR 0087](docs/decisions/0087-aperant-derived-desktop-base.md)。
