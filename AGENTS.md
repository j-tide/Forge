# Forge 仓库实施规则

## 资料与优先级

- 产品边界、状态、权限、审批、插件及安全规则：`forge_spec_v1.0/AGENTS.md`、`forge_spec_v1.0/docs/forge_blueprint_v1.0.md`。
- 公共字段和数据格式：`forge_spec_v1.0/contracts/` 的 Schema 与公开契约。正文与 Schema 有实质冲突时，记录问题与建议；不要静默修改基线。
- 任务顺序与验收：`forge_spec_v1.0/planning/tasks.json`、`forge_spec_v1.0/tests/acceptance-cases.json`。
- 用户已批准 Python Core 架构更正：仅覆盖旧蓝图中 Node/TypeScript 业务 Host 的技术选择；权威产品语义、Task/Test ID、验收与安全边界仍有效。决策见 `docs/decisions/0029-python-core-runtime-architecture.md`，实施顺序见 `docs/forge-python-core-migration-plan.md`。
- 2026-09-27 桌面路线先后见 ADR 0085/0086：原 Forge 仓库独立编写的 Vue 界面以 Aperant 公开 2.x 对照交互，以用户磨砂玻璃视频及 `forge_glass_v1.1/design/` 对照视觉与动效；其已有实现和验收是版本限定的历史证据。用户现批准 [ADR 0087](docs/decisions/0087-aperant-derived-desktop-base.md)：未来桌面基座采用当前仓库 `desktop/` 中的（原独立兄弟仓库 `../Forge-Aperant` 归拢） Aperant `v2.8.0-beta.6` AGPL-3.0 衍生版，并继续使用 Forge 玻璃视觉。衍生版须保留上游署名、许可证及相应源码义务；不得声称 Aperant 3.0、已接入 Forge Python Host 或已完成 Forge 产品验收。
- 两个资料目录是只读基线。不要移动、删除或把原型 HTML 当生产入口；参考包既有测试结果不是产品测试结果。

## 开发边界

- Forge 独立于 ProofRun。用户已授权交付权威任务图、已批准 ADR 和产品介绍范围中的全部必做功能；一次只实施一个可验证任务或缺口，完成后继续下一个，不以内部 Demo 或阶段边界作为终点。P9 等权威标为可选的远期增强仍保持可选。检查真实工作区状态后增量修改。
- **当前执行优先级（2026-09-26 用户确认）**：先完成 Desktop 的全部已确认功能及已安装应用验收；P7/P8 中手机、Companion、配对、远程 HTTPS/命令和跨设备协作新增开发后置。已完成代码和证据保留，未完成远程写继续拒绝，网络入口默认关闭。桌面缺口按「真实实现、正常用户入口、Python Host 运行、当前版本验收」逐项修复；不能因权威任务曾标 DONE 或内部 Demo 可打开而跳过。桌面里程碑完成后报告并停止，不自动恢复 P7/P8；权威 Task/Test ID、正式发布门禁和外部未验项不变。
- 原 Forge 仓库现有 UI 使用 pnpm workspace、Electron + Vue 3 + TypeScript + Vite，`apps/desktop` 负责 Main/Preload，`apps/web` 负责共享 UI；未来衍生 Desktop 的集成以 ADR 0087 单独验收。`python/` 下的独立 Forge Host 仍是最终唯一业务 Runtime。旧 `apps/host` 与 TypeScript Core 仅在迁移期作 parity reference，不得继续扩张 Node Agent/Core 生产能力，也不得在 MIG-PY-09 后作为生产 fallback。
- 最终 Forge Desktop 的 Renderer 不直接访问 Node、Shell、数据库或执行器 SDK；Main 仅负责系统集成与 Python Host 生命周期，不处理 Task、Run 或 Agent 调度。Python Host/Core 不依赖 Vue/Electron；插件依赖公开 Python API，不直接更改 Core 状态。Aperant 衍生预览尚未完成这项架构迁移，不能以其现有 Main/Renderer 业务路径声称 Forge 产品验收通过。
- 最终 Forge Desktop 本地通信采用有版本的 JSON-RPC over stdio，并实施方法白名单、请求/响应校验、大小与超时边界；衍生预览目前尚未连接此协议。不要为本地通信引入 FastAPI/TCP；远程 HTTP/SSE/WebSocket 留给未来独立 Adapter。
- 原 Forge pnpm 仓库保持 TypeScript strict、包通过 `exports` 暴露公共入口，内部依赖使用 `workspace:` 协议；`desktop/` 衍生源码遵循其独立 npm workspace 和 `package-lock.json`；原 pnpm/lint gate 不扫描该独立工作区，专用 desktop-quality CI 检查其真实源码。不要把演示任务、日志或在线设备当成真实产品状态。
- 自然语言先生成可编辑 Task Contract；人工批准只进入 TODO，默认不自动开工。Done 不代表合并或部署。
- 原 Forge 仓库现有桌面采用视频中的银白/浅蓝灰雾面、柔和层级和克制动效；亮色与暗色共用紧凑侧栏和页面布局，新安装默认亮色，已保存的主题选择不得覆盖。项目原位选择、单一新建任务入口、五列看板、分区任务详情继续保留；保持 Forge 真正的 Python Host 状态和人工审批。主题切换、减少透明度、系统与用户的减少动效、键盘操作均须真实有效；动效不能冒充任务或 Run 已成功。衍生桌面逐项实现与验收这些产品要求，不能沿用原 Forge 构建的测试结论。

## 验证与记录

- 版本固定在 `package.json`、`pnpm-lock.yaml` 与 `versions.lock.json`；新依赖需查官方兼容资料并记录许可证。不要更改用户全局工具。
- 新增功能须有有意义的 lint、typecheck、test、build 结果；不能用空脚本冒充检查。平台与 SDK 未实际探测时标记未验证。
- 本地实施进度写入根目录 `docs/implementation-status.md`，不篡改参考包中的任务状态。涉及产品语义、安全或技术路线的变更先写 `docs/decisions/` ADR 并取得确认。
- 当前用户已批准 Python Core 迁移；MIG-PY-01～09 已在 macOS arm64 的 Python-only Desktop 开发路径完成。历史阶段结论和递延验收以实施记录为准。完整交付须同时具备真实实现、用户入口、运行链路及当前版本验收；内部 Demo 只是过程证据。保留现有 SQLite 数据，不重置或删除项目、任务和运行记录。缺少 Claude 凭据、签名证书或目标平台时继续独立开发，但不得将未验项写为通过或放宽远程安全门禁。
- 遵守 `forge_spec_v1.0/AGENTS.md` 的状态、身份、租约、证据及凭据规则。不得擅自提交、推送或发布。
