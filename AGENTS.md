# Forge 仓库实施规则

## 资料与优先级

- 产品边界、状态、权限、审批、插件及安全规则：`forge_spec_v1.0/AGENTS.md`、`forge_spec_v1.0/docs/forge_blueprint_v1.0.md`。
- 公共字段和数据格式：`forge_spec_v1.0/contracts/` 的 Schema 与公开契约。正文与 Schema 有实质冲突时，记录问题与建议；不要静默修改基线。
- 任务顺序与验收：`forge_spec_v1.0/planning/tasks.json`、`forge_spec_v1.0/tests/acceptance-cases.json`。
- 页面组织、视觉、材质和动效：`forge_glass_v1.1/README.md`、`forge_glass_v1.1/design/`。旧规格包中的铜橙主题、深色侧栏、旧设计 tokens 与旧原型不是界面实现基准。
- 两个资料目录是只读基线。不要移动、删除或把原型 HTML 当生产入口；参考包既有测试结果不是产品测试结果。

## 开发边界

- Forge 独立于 ProofRun。一次仅实现当前获授权的任务；检查真实工作区状态后增量修改。
- 使用 pnpm workspace、Electron + Vue 3 + TypeScript + Vite。`apps/desktop` 负责 Main/Preload，`apps/web` 负责共享 UI，`apps/host` 负责独立 Host；当前只创建任务需要的包。
- Renderer 不直接访问 Node、Shell、数据库或执行器 SDK；Main 不处理任务调度；Host/Core 不依赖 Vue 或具体 Agent；插件只依赖公开 API。
- TypeScript strict，包通过 `exports` 暴露公共入口，内部包依赖必须用 `workspace:` 协议。不要把演示任务、日志或在线设备当成真实产品状态。
- 自然语言先生成可编辑 Task Contract；人工批准只进入 TODO，默认不自动开工。Done 不代表合并或部署。
- 视觉后续采用银白/浅蓝灰雾面、浅色窄侧栏、圆润面板、深色胶囊按钮和清晰阅读表面；动效克制，并提供减少透明度与减少动效回退。

## 验证与记录

- 版本固定在 `package.json`、`pnpm-lock.yaml` 与 `versions.lock.json`；新依赖需查官方兼容资料并记录许可证。不要更改用户全局工具。
- 新增功能须有有意义的 lint、typecheck、test、build 结果；不能用空脚本冒充检查。平台与 SDK 未实际探测时标记未验证。
- 本地实施进度写入根目录 `docs/implementation-status.md`，不篡改参考包中的任务状态。涉及产品语义、安全或技术路线的变更先写 `docs/decisions/` ADR 并取得确认。
- 遵守 `forge_spec_v1.0/AGENTS.md` 的状态、身份、租约、证据及凭据规则。不得擅自提交、推送或发布。
