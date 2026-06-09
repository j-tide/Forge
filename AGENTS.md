# Forge 仓库实施规则

## 资料与优先级

- 产品边界、状态、权限、审批、插件及安全规则：`forge_spec_v1.0/AGENTS.md`、`forge_spec_v1.0/docs/forge_blueprint_v1.0.md`。
- 公共字段和数据格式：`forge_spec_v1.0/contracts/` 的 Schema 与公开契约。正文与 Schema 有实质冲突时，记录问题与建议；不要静默修改基线。
- 任务顺序与验收：`forge_spec_v1.0/planning/tasks.json`、`forge_spec_v1.0/tests/acceptance-cases.json`。
- 用户已批准 Python Core 架构更正：仅覆盖旧蓝图中 Node/TypeScript 业务 Host 的技术选择；权威产品语义、Task/Test ID、验收与安全边界仍有效。决策见 `docs/decisions/0029-python-core-runtime-architecture.md`，实施顺序见 `docs/forge-python-core-migration-plan.md`。
- 页面组织、视觉、材质和动效：`forge_glass_v1.1/README.md`、`forge_glass_v1.1/design/`。旧规格包中的铜橙主题、深色侧栏、旧设计 tokens 与旧原型不是界面实现基准。
- 两个资料目录是只读基线。不要移动、删除或把原型 HTML 当生产入口；参考包既有测试结果不是产品测试结果。

## 开发边界

- Forge 独立于 ProofRun。一次仅实现当前获授权的任务；检查真实工作区状态后增量修改。
- UI 继续使用 pnpm workspace、Electron + Vue 3 + TypeScript + Vite。`apps/desktop` 负责 Main/Preload，`apps/web` 负责共享 UI；`python/` 下的独立 Forge Host 是最终唯一业务 Runtime。旧 `apps/host` 与 TypeScript Core 仅在迁移期作 parity reference，不得继续扩张 Node Agent/Core 生产能力，也不得在 MIG-PY-09 后作为生产 fallback。
- Renderer 不直接访问 Node、Shell、数据库或执行器 SDK；Main 仅负责系统集成与 Python Host 生命周期，不处理 Task、Run 或 Agent 调度。Python Host/Core 不依赖 Vue/Electron；插件依赖公开 Python API，不直接更改 Core 状态。
- Desktop 本地通信采用有版本的 JSON-RPC over stdio，并实施方法白名单、请求/响应校验、大小与超时边界。不要为本地通信引入 FastAPI/TCP；远程 HTTP/SSE/WebSocket 留给未来独立 Adapter。
- TypeScript strict，包通过 `exports` 暴露公共入口，内部包依赖必须用 `workspace:` 协议。不要把演示任务、日志或在线设备当成真实产品状态。
- 自然语言先生成可编辑 Task Contract；人工批准只进入 TODO，默认不自动开工。Done 不代表合并或部署。
- 视觉后续采用银白/浅蓝灰雾面、浅色窄侧栏、圆润面板、深色胶囊按钮和清晰阅读表面；动效克制，并提供减少透明度与减少动效回退。

## 验证与记录

- 版本固定在 `package.json`、`pnpm-lock.yaml` 与 `versions.lock.json`；新依赖需查官方兼容资料并记录许可证。不要更改用户全局工具。
- 新增功能须有有意义的 lint、typecheck、test、build 结果；不能用空脚本冒充检查。平台与 SDK 未实际探测时标记未验证。
- 本地实施进度写入根目录 `docs/implementation-status.md`，不篡改参考包中的任务状态。涉及产品语义、安全或技术路线的变更先写 `docs/decisions/` ADR 并取得确认。
- 当前用户已批准 Python Core 迁移；MIG-PY-01～09 已在 macOS arm64 的 Python-only Desktop 开发路径完成。P2-10 的真实 Python Host 纵向验收和 P2 Phase Gate 已通过当前阶段范围；后续按权威任务图进入 P3。保留现有 SQLite 数据，不重置或删除项目、任务和运行记录。
- 遵守 `forge_spec_v1.0/AGENTS.md` 的状态、身份、租约、证据及凭据规则。不得擅自提交、推送或发布。
