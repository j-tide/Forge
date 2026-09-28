# Forge Desktop UI / UX 走查

日期：2026-09-28。对象：`desktop/` 的 Forge `0.1.0-preview.4` 发布预览构建，macOS arm64。

这份报告记录当前代码的界面修复、实际窗口证据和未覆盖部分。它不是新的路线图，也不修改权威 Task / Test 状态。原 Vue / Python Host 桌面的历史验收不能替代这份衍生桌面的验收。

## 用户看到的问题与本轮处理

### 项目按钮为什么进入应用设置

原来项目标签上的配置按钮与全局设置共用了打开路径，用户点击项目旁的按钮却进入了应用设置。现在两者分开：

- **项目名称旁的配置按钮 → 项目设置**，标题下显示当前项目名，仅包含该项目的常规、Linear、GitHub、GitLab和记忆设置。
- **左下角设置 → 应用设置**，管理外观、语言、账户、路径、通知等全局偏好。
- 保存项目设置调用项目设置接口；不会连带保存全局偏好。
- GitHub / GitLab 的项目配置入口保留当前项目范围。
- 保存失败保留编辑内容并显示错误；自动保存的连接设置与需要点击保存的项目偏好有明确说明。
- 设置页内阻止新建任务、切换工作区等冲突快捷键；返回后恢复到原触发控件。

来源：[项目设置页面](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/apps/desktop/src/renderer/components/settings/ProjectSettingsPage.tsx)、[项目设置测试](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/apps/desktop/src/renderer/components/settings/__tests__/ProjectSettingsPage.test.tsx)。

### 顶部弹层为什么被遮挡

部分 Tooltip、子菜单和搜索下拉仍在带裁剪的父容器内渲染；增加局部 `z-index` 无法跨过父容器的裁剪边界。本轮统一修复为 Portal 弹层，并保留原有定位、键盘和焦点规则。

- 项目与账户 Tooltip 不再被项目标签栏裁剪。
- Dropdown 子菜单、模型搜索、GitHub 仓库、GitLab 项目和默认分支下拉不再被滚动容器遮挡。
- Popover 根据窗口剩余高度限制尺寸，内部可滚动。
- 长账户列表实际滚轮滚动后能到达最后一个账户；切换按钮不再换成两行。
- `@文件` 补全按当前输入框定位，支持中文路径；Escape 关闭补全，不能意外关闭任务编辑器。

实际窗口证据：[弹层验收](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/evidence.json)、[文件补全验收](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/file-autocomplete/evidence.json)。账户列表使用无密钥的元数据夹具，仅证明弹层交互，不证明服务商可以运行。

## 页面与交互覆盖

下表中的“组件测试”包含受控失败、延迟响应和键盘输入；它们不能代替在线模型、第三方集成或完整 Agent 业务验收。“实际窗口”来自真实 Electron，未调用模型。

| 范围 / 用户入口 | 已修复与检查 | 当前验证层级 | 尚未由本轮证明的内容 |
| --- | --- | --- | --- |
| 首页、添加项目 | 项目取消选择、路径选择失败、初始化失败有反馈；保留表单输入，迟到的默认路径不覆盖用户输入 | 组件测试；实际窗口打开与真实 Git 夹具初始化 | 用户系统原生目录选择器的人工操作、已有真实项目的完整业务运行 |
| 顶部项目标签 | 配置按钮只打开项目设置；键盘焦点、标题 Tooltip 与标签行为分开 | 组件测试；实际窗口项目范围保存与返回焦点 | 多项目活跃 Agent 调度 |
| 全局应用设置 | 独立设置入口；亮暗主题、语言、减少动效与透明度；项目配置不混入全局导航 | 组件测试；实际窗口设置页面与偏好重启恢复 | 新凭据认证、在线更新、签名更新 |
| 任务看板 | 六列衍生看板保留；按真实滚动范围定位首尾，键盘可达；列宽调整与持久化；未创建假运行任务 | 组件测试；实际窗口创建本地 backlog 任务、滚动、窗口缩小、打开详情 | 完整开发 → Review / Verify → 人工接受闭环 |
| 新建任务 | 描述与执行配置分区；窄窗口可滚动；取消 / 关闭 / 焦点明确；模型及阶段配置保留 | 组件测试；1440×900 与 1080×760 实际窗口 | 表单中的默认模型名称不等于已有认证或已执行模型 |
| 任务草稿 / Git 选项 | 基础分支、是否使用隔离工作区、模型、审查选项、附件和引用保存与重开不丢失；失效分支明确拒绝，不静默改默认分支 | 草稿和引用组件测试 | 每种 Git 组合的真实 Agent 执行 |
| 文件引用 | Portal 补全、真实输入框定位、中文路径、同名文件相对路径、鼠标和键盘选择；拒绝绝对路径与越界引用 | 组件测试；亮暗两种尺寸的实际窗口；真实任务保存 / 读回 | 在线模型如何使用引用文件 |
| 任务详情与删除 | 删除预检失败或未完成时不能继续删除；支持重试、重复点击防护；异步旧结果不能授权另一任务；没有把失败当作“工作区干净” | Renderer / Main 回归测试；详情实际窗口 | 活跃真实执行器的在线取消与后续删除 |
| 上下文 / 记忆 | 项目切换清空旧数据；请求与项目范围绑定；加载、无结果、搜索失败和写入失败分别反馈；失败不能保留旧绿色状态 | store、组件与 Main 测试；页面实际窗口 | 检索资料进入本次真实 Agent Run、记忆对在线运行的影响 |
| 项目洞察 | 消息绑定真实持久会话 ID；跨项目 / 跨会话迟到事件不污染当前对话；失败保留输入；切换界面不取消另一个运行 | Renderer / Main / preload 回归测试；页面实际窗口 | 在线回复、真实用量、服务商认证 |
| 路线图 | 保存成功后才提交新状态；保存失败不产生虚假卡片；删除 / 归档失败保留确认与错误；转换任务必须收到真实返回任务 | 组件回归测试；页面实际窗口 | 在线路线图生成与生成结果质量 |
| 路线图与创意详情侧板 | 可访问标题、初始焦点、Escape 与焦点恢复；嵌套菜单和确认框优先处理 Escape；背景交互保留 | 组件测试；页面实际窗口 | 在线生成的全部数据组合 |
| MCP / 工具配置 | 所有写操作确认真实 `success`；失败保留输入，弹窗不假成功关闭；加载 / 保存 / 健康检查隔离到项目；中文服务名使用稳定 ID | 组件与持久化回归测试；页面实际窗口 | 外部 MCP 进程激活、网络和工具执行授权 |
| GitHub / GitLab / 分支搜索 | 已有搜索下拉移至 Portal；宽度、剩余高度、上下键、Escape 与焦点恢复；不改第三方权限或自动执行操作 | 组件测试；配置页实际窗口 | 第三方账号在线连接与 Issue 同步 |
| 更新日志、隔离工作区、终端 | 正常导航可达，空状态与当前数据一致；布局不产生整个页面的横向溢出 | 实际窗口页面遍历 | 发布更新日志、真实终端执行、隔离工作区清理 |
| 全局快捷键 | 对话框、设置页、表单等交互范围内不触发冲突导航 / 新建操作；保留正常工作区快捷键 | 键盘单元与组件测试；实际窗口相关场景 | 所有操作系统的全局快捷键冲突 |
| 账户、用量、模型选择 | 未配置账户不显示可用绿灯；无用量监控不显示虚假的“无限”；长弹层可达与菜单焦点正确 | 组件测试；无密钥夹具实际窗口 | Claude / GLM / Codex 等服务商的认证、用量或调用成功 |

## 视觉与可访问性

- 一套布局支持亮色银灰与暗色石墨；玻璃限于侧栏和顶部导航，阅读、代码与表单使用稳定表面。
- 统一圆角、间距、边界、语义色和系统字体，缩小原来的大面积留白及巨型控件。
- 新任务在宽窗口分为描述区与配置区；窄窗口保持独立滚动，不使用整体缩放。
- 主体与次要文字、主按钮和危险提示使用当前颜色计算对比度；已记录最小值约 **5.39:1**。这不是对所有图片、代码高亮和第三方嵌入内容的完整 WCAG 认证。
- 减少透明度时玻璃变为稳定表面；减少动效时非必要动画关闭。系统偏好与用户设置保留。
- 本轮检查可见焦点、菜单键盘导航、Escape 优先级与返回焦点；不会为了隐藏焦点而移除 outline。
- 明确操作结果：保存失败不显示成功、删除检查失败不认为干净、跨项目迟到结果不填入当前页面。

视觉来源：[Forge 工作区样式](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/apps/desktop/src/renderer/styles/forge-workspace.css)。

## 真实截图

以下文件均来自当前 Vue 参考之外的实际 React / Electron 衍生桌面，没有使用参考原型截图。截图中以 `UI 测试` / `fixture` 命名的项目和账户属于独立测试数据。

| 内容 | 当前截图绝对路径 |
| --- | --- |
| 项目设置（用户提到的项目按钮） | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/project-settings-general-light.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/project-settings-general-light.png) |
| 应用外观设置 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/app-settings-appearance-light.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/app-settings-appearance-light.png) |
| 新建任务，1440×900 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/new-task-light-1440.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/new-task-light-1440.png) |
| 文件补全，1080×760 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/file-autocomplete/file-autocomplete-light-1080.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/file-autocomplete/file-autocomplete-light-1080.png) |
| 暗色文件补全 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/file-autocomplete/file-autocomplete-dark-1440.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/file-autocomplete/file-autocomplete-dark-1440.png) |
| 顶部账户提示 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/account-tooltip-light.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/account-tooltip-light.png) |
| 暗色长账户列表，滚动到底部 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/usage-scrolled-dark.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/usage-scrolled-dark.png) |
| 暗色模型搜索菜单 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/model-picker-dark.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/model-picker-dark.png) |
| 上下文页面 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/context-light.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/context-light.png) |
| MCP 配置页面 | [/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/tools-light.png](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/tools-light.png) |

完整截图集合在 `/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/`。该目录保留了不同轮次截图；只有最终证据 JSON 中列出并绑定当前源码摘要的文件，才能用于“最终整组验收通过”的结论。

## 验证结果与证据边界

命令在独立 `desktop/` npm workspace 执行，不借用根 pnpm 仓库的测试结论。

| 命令 / 场景 | 当前实际结果 | 日志 / 证据 |
| --- | --- | --- |
| `npm run typecheck` | 通过，TypeScript 校验未降低 | [release-preview4/desktop-typecheck.log](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/desktop-typecheck.log) |
| `npm run lint` | 命令通过；仍有既有 **797 warnings、5 infos**，不是零警告 | [release-preview4/desktop-lint.log](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/desktop-lint.log) |
| `npm test` | **283 个 Vitest 测试文件、5057 项测试通过**；品牌 / 本地化 Node 测试通过 | [release-preview4/desktop-test.log](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/desktop-test.log) |
| `npm run build` | Main / Preload / Renderer 构建通过 | [release-preview4/desktop-build.log](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/desktop-build.log) |
| `npm run check:i18n` | 36 namespaces、5224 strings，0 errors / warnings；动态引用另由组件和运行时检查 | [release-preview4/desktop-i18n.log](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/desktop-i18n.log) |
| 账户、用量、模型弹层真实窗口 | **通过**；亮 / 暗 1080×760，Portal、遮挡点检测、窗口边界、实际滚动和最后账户可达 | [overlay-audit/evidence.json](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/overlay-audit/evidence.json) |
| 文件补全真实窗口 | **通过**；亮 / 暗 1440×900、1080×760；中文与键盘操作、真实任务引用持久化；任务仍为 backlog | [file-autocomplete/evidence.json](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/file-autocomplete/evidence.json) |
| `npm run test:ui:desktop` 全页面最终复跑 | **通过**；亮 / 暗两主题，60 条场景记录、70 张截图；9 个导航页面、5 个项目设置分区、11 个应用设置分区；项目保存不改全局偏好、快捷键拦截、返回焦点、主题与减少动效 / 透明度重启恢复、真实 backlog 创建未自动 Start | [workspace-redesign/evidence.json](/Users/iamzjt/Desktop/my/myapp/Forge/desktop/output/playwright/workspace-redesign/evidence.json)，记录时间 `2026-09-28T08:37:39.807Z` |
| 最终 `.app` 与当前源码一致性、安装态 smoke | **通过**；`isPackaged=true`，8 份编译文件、4 份原生图标、LICENSE / UPSTREAM 与当前构建一致；ad-hoc 签名验证通过。只读启动前后现有设置、项目及 API Profile 文件摘要未改变；未关闭或终止用户应用 | [packaged-evidence.json](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/packaged/packaged-evidence.json)、[userdata-preservation.json](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/packaged/userdata-preservation.json)、[release-preview4/mounted-smoke-verified.log](/Users/iamzjt/Desktop/my/myapp/Forge/output/release-preview4/mounted-smoke-verified.log) |

真实窗口使用独立数据目录和可丢弃 Git 夹具。弹层与文件补全证据绑定构建资源 SHA-256；当前 Renderer 主资源摘要为 `9f1e22e7151f7cabb0ba8df89492588a1cc00e821ff4e1b7eea78a0324934811`。

先前失败的运行日志和检查点保留。测试脚本修复窗口焦点、DevTools 或自身定位问题后，必须重新执行原断言；不能通过删除遮挡、焦点、滚动和错误断言来取得通过。

## 使用范围与未验事项

- **新增依赖 0，在线模型调用 0。** 本轮没有运行真实在线 Agent、付费模型、外部 MCP 或第三方写操作。
- 这是衍生桌面 UI / UX 验收，不是 Forge Python Host 已接入，也不是完整产品闭环验收。
- Planner / Standard / Strict、知识进入真实 Run、Review / Verify / 人工接受，以及取消后的进程树安全，需要相应当前版本的业务证据；本轮界面走查不替代这些证据。
- 外部认证、Claude 在线验收、第三方项目集成、真实服务商用量及模型可用性未由无密钥 UI 夹具证明。
- Windows x64、macOS Intel、不同系统 DPI / 辅助技术仍未实机验证。
- 当前 macOS 包为内部 / ad-hoc 构建；Developer ID 签名、公证和正式更新发布门禁保持未通过。
- 手机、Companion、远程与跨设备新增开发继续后置；未放宽认证和远程写入。
- 没有修改用户已有 Run 的冻结配置，没有清空真实项目与历史记录，没有关闭用户正在运行的旧 Forge 应用。
- 用户已授权按功能提交、推送和发布本次预览。测试启动的应用与用户旧应用分开管理；打开旧 `.app` 仍可能看到旧逻辑。GitHub 资产和对应源码以 [preview.4 发布页](https://github.com/j-tide/Forge/releases/tag/v0.1.0-preview.4) 为准。

## 最终版本与安装包

最新应用：[Forge.app](../desktop/apps/desktop/dist/0.1.0-preview.4/mac-arm64/Forge.app)，版本 `0.1.0-preview.4`，构建标识 `forge-0.1.0-preview.4-9864843c064e`。

- `app.asar` SHA-256：`9864843c064e35a1a6c8f9f003bd3838e8072675c865349760c0022573d1d2b6`。
- 实际 DMG 只读挂载后启动 `Forge.app`，`isPackaged=true` / version `.4`，8 份编译文件、4 份原生图标及 LICENSE / UPSTREAM 与本次构建一致；启动后 deep / strict ad-hoc 签名验证通过。
- DMG / ZIP 完整性通过，安装态启动前后现有 settings / projects / API profile 文件存在性和摘要一致。没有更改密钥、用户数据库或强行关闭旧应用。
- 当前公开截图和资源摘要：[preview.4 截图目录](../desktop/docs/screenshots/0.1.0-preview.4/)、[验证摘要](../desktop/docs/screenshots/0.1.0-preview.4/verification-summary.json)。账户元数据、Git 项目和 backlog 都是独立 UI 测试夹具，不是在线 Agent 成功记录。
- 本轮 `.4` 弹层首次暗色 hover 超时保留为失败；QA 在渲染就绪后确认原生窗口和页面焦点，再重新执行实际鼠标悬停。亮 / 暗最终 10 条记录通过，Portal / 遮挡命中 / 边界 / 滚动 / 焦点断言均保留。文件补全 `.4` 8 条记录通过，真实任务保存后仍为 backlog，夹具 Git clean。
- 原 `.3` 未发布修订 `ui-redesign-unreleased`（ASAR `70c0c93c2593…`）保留为历史包；本轮 DMG、ZIP 和源码不复用旧发布资产。
- 先保存工作并正常退出旧 Forge，再从 Finder 打开新版本。在根目录执行 `pnpm desktop:open` 或 `desktop/` 执行 `npm run preview:open` 优先选择版本目录的最新包；普通启动常驻，与 smoke 自动退出分开。

版本、下载摘要、验证与外部依赖见 [0.1.0-preview.4](../desktop/docs/releases/0.1.0-preview.4.md)。这仍是 INTERNAL / ADHOC / UNNOTARIZED 预览；未声明完整业务或 Python Host 集成验收通过。
