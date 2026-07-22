# Forge 实施状态

## Desktop 基座路线更新 · Aperant 衍生仓库（2026-09-27，内部预览已构建）

用户已明确批准 [ADR 0087](decisions/0087-aperant-derived-desktop-base.md)：未来桌面改以 Aperant `v2.8.0-beta.6` 的 AGPL-3.0 衍生代码为基座，继续实现 Forge 视频方向的玻璃视觉。独立兄弟仓库 `/Users/iamzjt/Desktop/my/myapp/Forge-Aperant` 已检出上游提交 `cba7a0270ec794a14ac71615bc6c48085807ede6`；应用/项目/配置数据隔离、自动发布与更新停用、亮暗玻璃预览和来源声明已提交到本地代码。GitHub 使用独立私有仓库而非平台 fork 关系，移除平台 fork 标识不意味着掩盖源码来源。它是 Aperant 衍生版，不是 Aperant 3.0 或原 Forge Vue 客户端的独立重写；其上游来源、署名、许可证、修改标记和相应源码义务必须持续保留。

衍生仓库的 `main` 已推送至 `https://github.com/j-tide/Forge-Aperant`，远端 SHA `17849d1997aaa90cec120be39b334bb37657e66a` 与本地一致，ahead/behind 为 `0/0`。GitHub 元数据为 `isFork=false`、`parent=null`；完整上游祖先历史随 1,108 个提交上传，远端 `UPSTREAM.md`、保留的许可证及实际界面截图均已核对。提交的作者/提交者时间按用户要求从原 Forge 上一提交之后以 1～3 天间隔设置，与实际操作日期不同。

此衍生版在 macOS arm64 上完成 `npm run lint`、Desktop typecheck、219 文件 / 4632 项测试、`npm run build`、真实 Electron 空项目亮暗主题截图及最终打包 `.app` 启动。本机内部预览包：`/Users/iamzjt/Desktop/my/myapp/Forge-Aperant/apps/desktop/dist/Forge Glass Preview-0.1.0-preview.1-darwin-arm64-INTERNAL.dmg`，SHA-256 `c72b6ad3d2c2b45ab7cebd9916a675abac03330c756b1b15c4a6973f15047f14`，ad-hoc 签名、未公证；[亮色](https://github.com/j-tide/Forge-Aperant/blob/main/docs/screenshots/forge-glass-preview-light.png)与[暗色](https://github.com/j-tide/Forge-Aperant/blob/main/docs/screenshots/forge-glass-preview-dark.png)是该新仓库真实 Electron 界面截图。`npm run package:mac` 在下载 DMG helper 时中断，最终包经 `electron-builder --mac dir` 与 macOS 原生 `hdiutil` 生成并校验。在线 npm audit 仍有 33 项生产依赖风险，发布前须修复。

**当前尚无 Forge 与衍生版的合并 Runtime 或产品验收。**原 Forge 客户端代码、Python Host、现有 SQLite 用户数据及下方内部包和测试证据保持原状；下方“当前包”仅指各记录生成时的原 Forge 构建，不能转记为衍生版结果。后续需逐项完成有版本 Host 接口、Forge 状态与审批映射、数据保护和当前衍生安装版验收。P7/P8 后置、远程默认关闭和正式发布门禁继续有效；本次只记录技术路线，没有在原 Forge 中替换客户端、迁移数据或发布新包。

## Desktop 视觉收敛与当前内部包 · 2026-09-27（macOS arm64）

用户再次反馈界面仍不够好看。本轮沿用 [ADR 0086](decisions/0086-video-glass-visual-with-current-desktop-ia.md) 已批准的视频银蓝雾面方向，实际调整 `@forge/ui` 亮暗 token、环境光、Shell/Panel 层级和侧栏 Forge 标记；压缩无任务看板引导面板的占屏面积。新建任务抽屉把真实消息放在输入区之前，保持阅读顺序；工作流零配置页消除重复模板入口，角色和插件页收紧宽度、减少重复标题，明确区分已安装、Host 可用与缺凭据。减少透明度与减少动效沿用现有回退。没有添加业务能力、伪造任务或模型结果，也没有新增依赖、SQLite migration、Host 协议和权限。

实际验证：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`git diff --check` 均通过；`FORGE_THEME_SCREENSHOT_DIR=output/playwright/forge-visual-polish-final-20260927 node scripts/smoke-desktop.mjs` 对真实 Electron/Python Host 验证 Host ready/crash、Renderer sandbox/context isolation/nodeIntegration=false、亮暗偏好、减少透明度与动效、1040/1600 布局；另一次 1440×900 多页 Electron 视觉巡检为 Host ready、0 page error、无横向溢出。真实源码截图：[亮色空看板](../output/playwright/forge-visual-polish-final-20260927/forge-glass-20260927-light.png)、[暗色空看板](../output/playwright/forge-visual-polish-final-20260927/forge-glass-20260927-dark.png)、[亮色新建任务](../output/playwright/forge-visual-polish-final-20260927/forge-glass-20260927-light-new-task.png)、[工作流](../output/playwright/desktop-visual-sweep/rerun-IsqxnY/light-workflows-1440x900.png)、[角色](../output/playwright/desktop-visual-sweep/rerun-IsqxnY/light-agents-1440x900.png)、[插件](../output/playwright/desktop-visual-sweep/rerun-IsqxnY/light-plugins-1440x900.png)。这些静态截图与 Smoke 验证不等于用户主观视觉认可或完整任务闭环。

当前独立内部包：[Forge 0.0.1 glass-polish DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-glass-polish-20260927.dmg)，SHA-256 `38428e17e8f2a37eda9727f044f6cdac8c63d190edb2eb41773c3e721a124f20`，**INTERNAL / ADHOC / UNNOTARIZED**。DMG 安装 smoke 在隔离 QA 数据目录下通过，核对包内 Python 3.12.13、SQLite schema38 和受限 Renderer；另复制为 [Forge INTERNAL Glass Polish 20260927.app](</Users/iamzjt/Applications/Forge INTERNAL Glass Polish 20260927.app>)，`codesign --verify --deep --strict` 通过。普通 `open -n` 启动观察到 Main 和其包内 Python Host；[安装版首页](../output/playwright/forge-glass-polish-packaged-home-20260927.png)来自同一 DMG 烟测安装的临时副本。该签名只是内部 ad-hoc 完整性检查；当前 SHA 未重新执行在线需求整理或完整 Develop→Review→Verify→Owner；Windows x64、macOS Intel、Claude、Developer ID 签名、公证和正式更新仍未验收。P7/P8 手机与远程新增开发继续暂停。

## Desktop 空状态与页面层级修整 · 2026-09-27（前一 glass-layout 内部包）

用户反馈当前 UI 观感和空白区域不可接受。本次在已批准的 [ADR 0086](decisions/0086-video-glass-visual-with-current-desktop-ia.md) 内，按原视频的银蓝磨砂、少量清晰阅读表面和轻动效方向修整正式 Vue 界面：侧栏收为 68px 图标栏，项目选择器留在顶栏原位；没有项目或没有任务时只展示一处真实下一步操作，确有任务才展开五列看板。新建任务面板把模型状态、输入和发送操作移到首屏；仅在 Host 能力目录确认后显示实际提供方与模型，不伪造回复或任务。字体基线及设置页阅读表面/控件尺寸同步调整。工作流未选中时显示 Host 提供的真实模板入口，角色零配置页显示真实执行器状态；插件可选超时值留空时说明沿用默认值，保存仍不写入覆盖值。未保存的工作流编辑内容可在同一个 Host 会话中切页恢复，切换另一流程前需确认；跨 Host 会话不自动恢复。

验证：`pnpm lint`、`pnpm typecheck`、`pnpm test`（包含 `pnpm build`）、真实 Electron `node scripts/smoke-desktop.mjs` 与 `git diff --check` 均通过。Electron 烟测覆盖 Host ready/crash、受限 Preload、亮暗主题、减少透明度和动效、1040/1600 宽布局；多页视觉检查在独立临时数据、禁用模型的真实 Electron 中拍摄 12 张 1440×900 截图，Host ready、0 page error、无横向溢出。安装包 smoke 首次因沿用旧“先选择项目”选择器超时；更新为实际标题后，对**同一 DMG** 重跑通过，验证包内 Python 3.12.13、SQLite schema38、独立数据及 ad-hoc 签名。此次不调用付费模型，模型“已就绪”只代表本机 Host 能力探测，并非新完成一次在线整理。

此前独立内部包：[Forge 0.0.1 glass-layout DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-glass-layout-20260927.dmg)，SHA-256 `51d6b5056e396e77a2b4c8982a2f4d3ed74b6fc01b87037f39d7ef00d1183165`；独立安装于 [Forge INTERNAL Glass Layout 20260927.app](</Users/iamzjt/Applications/Forge INTERNAL Glass Layout 20260927.app>)，`codesign --verify --deep --strict` 通过。截图：[安装版无项目首页](../output/playwright/forge-visual-layout-final-20260927/forge-glass-packaged-home.png)、[有项目无任务](../output/playwright/forge-visual-layout-final-20260927/forge-glass-20260927-light.png)、[亮色新建任务与实际模型状态](../output/playwright/forge-visual-layout-final-20260927/forge-glass-20260927-light-new-task.png)、[暗色新建任务](../output/playwright/forge-visual-layout-final-20260927/forge-glass-20260927-dark-new-task.png)、[工作流编辑器](../output/playwright/desktop-visual-sweep/rerun-1kiaRK/light-workflow-editor-1440x900.png)、[设置](../output/playwright/desktop-visual-sweep/rerun-1kiaRK/light-settings-1440x900.png)。包仍为 **INTERNAL / ADHOC / UNNOTARIZED**；Windows/Intel、签名公证、Claude、同一旧包的完整在线任务闭环与全量桌面产品验收仍未通过。P7/P8 手机和远程新增开发继续暂停。

## Desktop 视频磨砂视觉与动效 · 2026-09-27（源码与 macOS arm64 内部包视觉检查通过）

用户最新确认沿用先前视频的银白/浅蓝灰雾面材质及轻柔动效，同时保留现行原位项目选择、单一新建任务入口、五列看板和任务详情结构。已定位原始参考视频 `2026-08-27_09.02.16_短耳兔设计_UI设计灵感分享_磨砂玻璃风格UI动效参考.mp4`；[ADR 0086](decisions/0086-video-glass-visual-with-current-desktop-ia.md) 明确覆盖 ADR 0085 的视觉优先级，但不改变信息架构、产品语义或安全边界。`forge_glass_v1.1/design/` 继续作为只读视觉与动效参考，正式生产 token 仍在 `packages/ui`。

当前源码已将亮色改为新安装默认，保留已存的亮色/暗色/跟随系统偏好；生产 token 更新为视频方向的银蓝亮色及同源蓝灰暗色，页面、卡片、弹层和抽屉已接入短时基础动效。系统与 Forge 的减少动效入口、减少透明度的实色回退保持可用；状态反馈继续由真实 Host 数据驱动。此项只涉及视觉表现与偏好，不代表新的 Agent/Task 能力或完整 Desktop 验收。

本次实际检查：`pnpm lint`、`pnpm typecheck`、`pnpm test`、最新 CSS 的 `pnpm build` 均通过；`pnpm py:check` 为 286 passed/1 skipped，Ruff/mypy 通过。`FORGE_THEME_SCREENSHOT_DIR=output/playwright/video-glass-20260927 node scripts/smoke-desktop.mjs` 从真实 Electron/Vue 验证新安装默认 light、暗色切换、跟随系统、Host 既有断言，以及计算样式中的玻璃 blur 18px、overlay blur 7px、卡片 hover 200ms、抽屉 350ms、Dialog 320ms；手动/系统减少动效时非必要动效归零，1040/1600 宽布局通过。截图包括[亮色看板](../output/playwright/video-glass-20260927/forge-glass-20260927-light.png)、[暗色看板](../output/playwright/video-glass-20260927/forge-glass-20260927-dark.png)、[亮色新建任务](../output/playwright/video-glass-20260927/forge-glass-20260927-light-new-task.png)、[暗色新建任务](../output/playwright/video-glass-20260927/forge-glass-20260927-dark-new-task.png)、[亮色减少透明度](../output/playwright/video-glass-20260927/forge-glass-20260927-light-reduced-transparency.png)、[暗色减少透明度](../output/playwright/video-glass-20260927/forge-glass-20260927-dark-reduced-transparency.png)、[1040×720](../output/playwright/video-glass-20260927/forge-glass-20260927-light-1040x720.png)及[1600×1000](../output/playwright/video-glass-20260927/forge-glass-20260927-light-1600x1000.png)。CSS 时长检查和静态截图不等于视频逐帧动效或 Windows 实机验收。

对应内部 macOS arm64 包为 [Forge 0.0.1 video-glass DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-video-glass-20260927.dmg)，SHA-256 `0c8267885eb155858e8d2316d8f60c2066f70cb18a4ed5194d28daeb643268b6`。`pnpm smoke:package:mac` 从该包验证包内 Python 3.12.13、SQLite schema38、独立 HOME 与 ad-hoc 签名；独立复制为 [Forge INTERNAL Video Glass 20260927.app](</Users/iamzjt/Applications/Forge INTERNAL Video Glass 20260927.app>) 后 `codesign --verify --deep --strict` 通过。普通 `open -n` 已让此独立安装常驻启动，并观察到 Main PID 80617 与包内 Python Host 子进程 PID 80635（仅为当时观察值），没有覆盖旧安装或数据；不代表用户已亲自打开。安装态[亮色首页](../output/playwright/video-glass-20260927/forge-glass-20260927-packaged-home.png)及[暗色减少透明度](../output/playwright/video-glass-20260927/forge-glass-20260927-packaged-dark-reduced.png)来自此包。包仍为 **INTERNAL / ADHOC / UNNOTARIZED**；当前 SHA 尚未重新执行完整在线 Develop→Review→Verify→Owner 闭环，Claude、Windows/Intel、正式签名公证与完整 Desktop/P6 门禁仍按旧记录待验。下面 dual-theme 和 Aperant 包各有历史验证，但其旧 SHA、旧视觉不能充当本次安装包证据。

## Desktop 亮色与暗色主题 · 2026-09-27

本节为视频视觉迁移前的双主题检查点；其中“默认深色”和下面的 dual-theme 安装包只描述当时版本，不代表本次新安装默认亮色的源码。

设置 → 外观支持「浅色」「深色」「跟随系统」，默认深色，选择保存在本机。桌面侧栏、顶栏、项目选择器、看板与新建任务面板使用同一套语义颜色和紧凑布局；弹层随当前主题切换。减少透明度与减少动效仍由独立偏好控制。此项只修界面主题，不代表 Desktop 完整业务验收或正式发布通过。

当时源码通过 `pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm smoke:desktop` 与 `git diff --check`。Electron smoke 实测亮/暗切换、刷新后保留、跟随系统改变、新建任务弹层的计算样式和两种主题下危险按钮的文字对比度，隔离用户数据目录运行，不改日常外观设置。[亮色看板](../output/playwright/forge-dual-theme-20260927-light.png)、[暗色看板](../output/playwright/forge-dual-theme-20260927-dark.png)、[亮色新建任务](../output/playwright/forge-dual-theme-20260927-light-new-task.png)、[暗色新建任务](../output/playwright/forge-dual-theme-20260927-dark-new-task.png)均由实际 Electron/Vue 截取。

当时最新的独立内部包：[Forge 0.0.1 dual-theme DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-aperant-dual-theme-20260927.dmg)，SHA-256 `efc2ec01396ab74add820f3892fb76f8d329a2fd4ecf8acde078a6bbf84be05e`；单独安装为 [Forge INTERNAL Dual Theme 20260927.app](</Users/iamzjt/Applications/Forge INTERNAL Dual Theme 20260927.app>)，旧应用未覆盖。重建后 `smoke:package:mac` 验证包内 CPython 3.12.13、SQLite schema38、隔离 HOME、Host 启动和 ad-hoc 签名；`codesign --verify --deep --strict` 对新应用通过。无在线模型调用。此包仍为 **INTERNAL / ADHOC / UNNOTARIZED**，并不代表旧包中未完成的完整业务和正式发布门禁已通过。下方旧包的 SHA 和安装版验收仍只对应各自旧构建。

## Desktop 界面重设计 · Aperant 2.x 对照 · 先前内部包（2026-09-27）

[ADR 0085](decisions/0085-aperant-reference-desktop-redesign.md) 已获批准：以 Aperant 公开 2.x 的信息架构和交互为对照，独立实现 Forge Vue 桌面界面；在当时的视觉优先级中 `forge_glass_v1.1/` 只作历史参考，不复制 Aperant AGPL 源码或素材，也不称为 3.0。该视觉优先级现由 ADR 0086 覆盖。本节只记录当时的重设计源码及该内部包；后续 Planner/Standard 等旧检查点仍按各自构建追踪。

| 当前正常用户入口 | 业务边界 | 本版证据 |
| --- | --- | --- |
| 默认「看板」→左栏项目按钮原位「选择项目」→选择文件夹/信任/切换 | `App.vue`/`AppShell.vue` 读取 Python Host 的真实活动项目；无项目保持五列空态；只在信任后允许任务写入 | 单面板修复后 `smoke:projects` 23 阶段与 `smoke:p1-offline` 通过；[安装版看板](../output/playwright/aperant-redesign-20260927-board-top-1440x900.png)、[项目管理](../output/playwright/aperant-redesign-20260927-projects-1440x900.png) |
| 左栏唯一「新建任务」→任务讨论→「发送并整理」或「手工填写」→同面板草稿审阅 | 消息、非空 assistant reply、模型与结构化草稿均来自 Host/Provider；人工审批只入 TODO，明确 Start 才运行 | 双抽屉已改为单面板，App/组件 24/24；安装态真实 Codex `gpt-6-luna` 只完成回复与[待审阅草稿](../output/playwright/aperant-redesign-20260927-generated-draft-1440x900.png)，未审批/TODO/Run |
| 五列看板卡片→近全屏任务详情→概览/运行/变更/审查与验收 | `board.snapshot`、Task/Run/Review/Verify/Owner 状态由 Python Host 校验；TODO 排序不能跨列绕过门禁 | 当前源码/离线 P1 与 Desktop smoke 已验入口；此新包未重跑在线 Develop→Review→Verify→Owner |
| 左栏工作流、角色、插件、项目资料、项目管理、设置；`Cmd/Ctrl+K` | 固定 Client/Preload/Main/JSON-RPC stdio 桥；深色默认，并有浅色/系统、减少透明度与动效 | 当前内部包[工作流](../output/playwright/aperant-redesign-20260927-workflows-1440x900.png)、[角色](../output/playwright/aperant-redesign-20260927-agents-1440x900.png)、[插件](../output/playwright/aperant-redesign-20260927-plugins-1440x900.png)、[项目资料](../output/playwright/aperant-redesign-20260927-knowledge-1440x900.png)截图；1280/1600 宽度及缩放检查通过 |

**源码质量链**：`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm py:check`（286 passed/1 skipped，Ruff/mypy 通过）、`pnpm validate:contracts`（47 files/0 errors/4 既有参考 warning）、`pnpm validate:task-map`、`pnpm smoke:desktop`、单面板 App/组件 24/24、`smoke:projects` 23 阶段、`pnpm smoke:p1-offline` 和 1280/1600/缩放检查均通过。此前真实 Electron 截图发现新建任务/草稿双抽屉，已修成同一面板并重跑相关用例；旧 [Web 看板](../output/playwright/aperant-shell-20260927/current-web-board-1440.png)与[无 Host 新建任务](../output/playwright/aperant-shell-20260927/current-web-new-task-unavailable-1440.png)只保留浏览器布局/降级证据，普通 Web 没有本地业务 Host。

**当前内部包与可操作入口**：[Forge 0.0.1 macOS arm64 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-aperant-redesign-20260927.dmg)，328909833 bytes，SHA-256 `55d5c61065c60a19b33293e7f0da28a2f62fdcf52f222b8030f1d81f1982c53b`，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。package smoke 在更新旧项目资料标题/深色 token 断言后通过：从 DMG 验证包内 CPython 3.12.13、SQLite schema38、独立 QA 数据和沙箱 Renderer。包复制到 [Forge INTERNAL Aperant Redesign 20260927.app](</Users/iamzjt/Applications/Forge INTERNAL Aperant Redesign 20260927.app>)；`codesign --verify --deep --strict` exit 0，普通 `open -n` 无覆盖启动并观察 Main/包内 Python Host。独立数据根为 `~/Library/Application Support/Forge Internal QA/072243e56d709b43/Forge`；日常 SQLite 与此前 QA 不重置。这是内部 QA 应用，不是 Developer ID 签名、公证或正式发行。

**安装态在线范围**：在上述新包中，单次真实 Codex `gpt-6-luna` 需求整理 smoke PASS，Host 保存非空 Forge 回复与结构化草稿，正式新建任务抽屉显示模型与回复；隔离 Git fixture clean。该草稿只到待审阅状态，**没有审批、TODO 或 Run**。新包的完整在线 Develop→Review→Verify→Owner、严格计划全链及正式发布门禁继续待验；旧包已完成的 Standard/quick 交付证据不能迁记到新 SHA。完整 Desktop/P6、Claude、Windows/Intel、Developer ID/公证、正式更新仍按原门禁追踪；P7/P8 新增开发后置，默认不开放网络入口。不自动合并、推送或部署。

以下为此前构建的验收记录，各自的“当前包”只指写入时注明的包。

## Desktop Agent Profile、Planner 与 Standard 实际验收 · 2026-09-27

现有 macOS arm64 内部 DMG `desktop-planner-context-20260927`（Forge 0.0.1，SHA-256 `6f58d456d87121795e01b848b3a9c743192e7bd3df4c349fa7038936485fdbd9`）的正式 Agents 页面将 Planner v1 保存为 v2，仍为 `planner`/只读且包含显式 `project-context`；包内 Python Host/SQLite 重启读回角色、权限与 revision 不变，[实际截图](../output/playwright/desktop-profile-accept-20260927-planner-profile-saved-1440x900.png)。未知/跨角色保存由契约及 Host 拒绝，旧冻结配置未改。角色与计划路径定向测试 21 passed、1 opt-in online skipped；Web Agents/Workflows/RunInspector 定向 40 passed。只读扫描未发现可证明来源的历史角色误写，没有批量修用户数据。

同一已安装 DMG 的独立 QA Git/SQLite `output/qa/desktop-standard-verified-20260927-bv2g77/`：正式 UI 发布 `standard` v1、人工批准 Task v2 后为 TODO 且 `run.list=[]`，获批 `test` 命令预设先于 Run 冻结。明确 Start 后真实 Codex `gpt-6-sol` 只读 Plan Run `63c843ad-5eda-4894-9c70-1d529d008b7e` 成功，Host 校验并保存 Artifact `327f009f-b304-45f3-b4db-a62b577fb0d7`，绑定任务修订、Git 基线、Workflow/Profile 锁和真实检索来源。自动 Developer `cb933217-4b38-4e73-8697-0af4bd1189b0` 接收该 Plan 与知识来源，修改隔离工作区并生成 CodeSnapshot `1c2fab31-19d0-432c-a17d-4e7df086f97f`；重启后配置、来源和快照仍可读，[Plan 页面](../output/playwright/desktop-standard-verified-20260927-standard-validated-plan-1440x900.png)。后续安装版独立 Review `4ae8cfec-7217-4043-87b0-dee7c7192e6b` approved、获批命令 Verify `46d99245-b01b-42ce-94db-3df62ac328d8` passed/exit 0、逐项 AC 决定和 Owner 人工接受 `17448fe9-b221-4f97-a7b6-0689e28f3fc1`，交付 `b523f337-35e8-48d3-8ff2-1c195c855d97`，重启看板为 Done。源 Git 保持 clean，未合并/推送/部署；[待人工验收](../output/playwright/desktop-standard-verified-closeout-20260927-owner-ready-1440x900.png)、[验收后](../output/playwright/desktop-standard-verified-closeout-20260927-owner-accepted-1440x900.png)。第一次独立 QA 的 Plan→Developer→Review 已成功，但因测试预设未提前冻结，Verify 正确拒绝；未把它算作完整通过，也未为修复同一 Run 重调用模型。

该真实交付截图暴露旧摘要将 Plan+Developer 两个 Run 误称“开发 Attempt 2 次”，且旧 `planStatus=not_configured` 文案暗示没有 Plan。当前源码已改为根据确切 Developer→Plan/Artifact 持久关联生成新交付来源，并校验 Task/Contract/基线/hash；UI 改称“运行记录”并展示正式 Plan ID。旧不可变交付不回填，页面只说明旧摘要未记录 Plan 来源，可在 Run 历史查看。先写的 Python/Vue 复现测试分别因未实现/契约拒绝失败；修复后 Python 18 个定向、Vue 4 个、契约 48 个通过。

源码一致的新内部包 [desktop-standard-provenance-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-standard-provenance-20260927.dmg) 为 0.0.1、331670903 bytes、SHA-256 `e03946ed4f927904511d38b335a74edfe9485fc3d32aa18a61b3391995fcd3a9`，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从 DMG 复制安装通过包内 Python 3.12.13/SQLite schema37、独立数据、Renderer sandbox 与退出清理。另用上一段真实 Standard QA SQLite 的 **online backup 副本** 启动新包，正式交付页显示“运行记录 2 条”“此交付记录未包含独立 Plan 来源；可查看 Run 历史”，[安装版实图](../output/playwright/desktop-standard-provenance-20260927-legacy-delivery-1440x900.png)，且 Review/Verify/Owner 证据仍在。尝试在隔离副本删除旧交付以重新生成时，SQLite `delivery record is immutable` 正确拒绝；没有绕过触发器、没有改原 QA 或用户库。新生成交付的 `completed` Plan 字段目前由 Python 真实 Git/SQLite/Host fixture 和 Vue/契约测试覆盖，**没有在此新包重跑在线 Codex 或新交付**；不得将历史旧交付回填成新记录。

本检查点实际运行：`pnpm lint` exit 0、`pnpm typecheck` exit 0、`pnpm test`（含全量 build）exit 0、`pnpm py:check` 265 passed/1 opt-in online skipped，Ruff/mypy 通过、`pnpm validate:contracts` 47 files/0 errors/4 既有 warning、`pnpm validate:task-map` 9 phases/92 tasks/120 cases/84 deferred、`pnpm smoke:desktop` exit 0（真实 Python Host schema37、Renderer sandbox、Host crash/degraded）、新 DMG 的 `pnpm smoke:package:mac` exit 0、旧交付安装态读回 exit 0、`git diff --check` exit 0。先前 DMG 的在线 Standard 业务证据与新包的无模型回归分开记录。

`quick` 既有安装版正向链保持原证据；`standard` 本次安装版全链已验；`strict` 仅 Plan/人工门禁及 Developer 的真实预算失败已验，完整 Review→Owner 未通过。Planner 成功不自动等于 Task Done。继续桌面其余缺口与最终源码一致的安装包回归；手机/远程 P7/P8 暂停。Claude、Windows/Intel、Developer ID/公证及正式更新按既有递延/门禁追踪，不 commit/push/release。

## Desktop strict Plan 安装态与来源交接 · 2026-09-27

新内部包 [desktop-planner-context-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-planner-context-20260927.dmg) 为 Forge 0.0.1、328726862 bytes、SHA-256 `6f58d456d87121795e01b848b3a9c743192e7bd3df4c349fa7038936485fdbd9`，仍是 **INTERNAL / ADHOC / UNNOTARIZED**。它包含 Planner 与 Developer 双 Profile 显式项目资料许可、Plan→Developer 冻结来源交接和 schema37。DMG 独立安装 smoke 已通过包内 Python 3.12.13/SQLite 3.50.4、Planner v2 项目资料许可保存/重启读回，以及 quick/standard/strict UI 预检/发布/重启读回；没有把发布当成实际节点执行。`pnpm py:check` 265 passed、1 opt-in online skipped、Ruff/mypy 通过；`pnpm test`（含 build）、`pnpm lint`、`pnpm typecheck` 与定向 Vue/契约检查通过。

同一 DMG 在隔离 Git `output/qa/desktop-planner-context-20260927-IkUKq0/Planner fixture 项目` 和独立 SQLite 中，经过安装版正常项目选择/信任、真实文档导入、人工批准 TODO、UI 选择 strict 模板并明确 Start。真实 Codex `gpt-6-luna` 只读 Plan Run `779b4924-018a-4776-884a-cf1bc0363e29` 为 `succeeded`，产出校验过的 Artifact `3ab9f9fc-f10c-437d-a31f-03c9ab140cc2`，绑定 Task v2/基线/Planner v1/工作流 v1；[计划实图](../output/playwright/desktop-planner-context-20260927-strict-installed-plan-1440x900.png)、[冻结知识来源](../output/playwright/desktop-planner-context-20260927-strict-frozen-context-1440x900.png)。Host 重启后 Artifact 哈希一致，源仓库 HEAD/status 未变。独立无模型读回测试 `scripts/smoke-packaged-planned-readback.mjs` 通过；首次联机脚本因误读看板没有的 `latestRunId` 字段 exit 1，后改为正式 `run.list`，未为修脚本重复该 Planner 模型调用。

人工在安装版明确确认该 strict 计划后，Host 真正启动 Developer Run `fe026859-9612-4e5c-8f80-86db656f64e0`，其冻结输入包含同一知识来源及 `plan:` Artifact 引用。Codex 在隔离 worktree 修改 `math.js`、`test.js`，`node test.js` 实际通过；随后观测输入达到 216374 tokens，超过用户在 UI 选择的 200000 上限，Forge 记录 `failed` / `RUN_TOKEN_BUDGET_EXCEEDED`，**没有 CodeSnapshot、Review、Verify 或 Owner 交付**。[失败 Run 实图](../output/playwright/desktop-planner-context-20260927-strict-developer-failed-1440x900.png)。未改写冻结预算、未把工作区文件当交付、未自动重跑或改模型；隔离 QA 数据与失败证据保留，源 Git 仍 clean。standard 自动交接、strict 完整链与当前包 quick 完整链仍未在线收口；旧 quick 成功只属于原构建。下一步先分析此失败和继续不耗模型的桌面缺口，在线重试受既有授权/预算限制。手机/远程继续暂停，原 Claude/Windows/Intel/签名公证门禁不变；不 commit/push/release。

## 历史源码检查点 · 计划流程资料来源交接（当时尚未打包）

在上一安装包之后，源码新增 Planner Profile 的显式 `project-context` 选择。标准/严格计划流程只有 Planner 与 Developer 的冻结 Profile 都允许项目资料时才接受检索词；Host 通过现有知识/记忆检索构造带来源的 Plan ContextBundle，将相同来源交给 Developer，并在交接前检查撤销、版本变化或过期。新返工沿用仍有效的来源；旧无 ContextBundle 的直接开发 Run 保留原返工行为。真实 Git/SQLite/Host + fixture Executor 测试覆盖 standard 来源交接、strict 来源撤销阻断、返工保留与返工撤销阻断；这不是在线 Codex 或安装版验证。此前安装包 `desktop-planner-runtime-20260927` 仍可操作，但**不含本段源码改动**，不可据该包声称计划检索已验收。全量 Python 回归首次发现旧返工/Owner fixture 无 ContextBundle 被误拒绝；修复历史兼容后相关 23 个用例通过，最终全量回归和新包待补。

## Desktop Planner 与角色保存安装态检查点 · 2026-09-27

当前源码对齐的内部 macOS arm64 包为 [desktop-planner-runtime-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-planner-runtime-20260927.dmg)，Forge 0.0.1，329963912 bytes，SHA-256 `1b6275423012ef13cac7545d238a23aa19e72e8b8d53eccbb730f3a4ca090793`，**INTERNAL / ADHOC / UNNOTARIZED**。从 DMG 安装的真实 Electron 使用包内 Python 3.12.13、SQLite 3.50.4/schema37 和独立临时数据目录；安装 smoke 通过，未访问日常 SQLite。下方「尚未重新打包」「当前安装包为 schema36」等段落是当时的历史检查点，现以本节为准。

角色链已在源码和安装版验证：Agents 正式页面保存 Planner Profile v1→v2，角色及只读权限不变；退出并重开后由 Python Host/SQLite 读回 v2，未知角色与同 ID 跨角色 revision 在契约和 Host 中拒绝。冻结的旧 Run/Profile 版本没有迁移或改写；只读扫描日常及 7 份 QA 库未发现可证明的历史误写记录，所以没有批量修数据。[安装版角色保存](../output/playwright/desktop-planner-runtime-20260927-planner-profile-saved-1440x900.png)。

安装版 UI 已从权威 quick、standard、strict 模板分别通过角色/能力预检、保存发布并在 Host 重启后读回；[standard Plan 绑定](../output/playwright/desktop-planner-runtime-20260927-standard-plan-binding-1440x900.png)、[strict Plan 门禁](../output/playwright/desktop-planner-runtime-20260927-strict-plan-binding-1440x900.png)是真实页面。安装 smoke 没有创建 Task 或调用模型；这证明发布和持久化，**不证明三个模板在当前包完成在线节点全链**。独立源码级真实 Codex strict Plan Run `44da7ca8-a3ab-4c7c-a238-325210b83d14` 已产出有效只读 Artifact `f4d22f23-6088-4161-a075-b444d73bc107`；离线 fixture Executor 的真实 Git/SQLite/Host 测试覆盖 standard 自动交接、strict 人工准驳、交接恢复、失败和返工，但不能代替安装版在线 Developer/Review/Verify/Owner。Plan 失败诊断现在保留 `PLAN_RESULT_INVALID`/`PLAN_WORKSPACE_CHANGED`，Main 的计划操作有 25 秒启动窗口，RunInspector 不再为 Plan 索取 Developer 快照。计划流程的检索来源尚未交接，仍明确拒绝。

最终此检查点质量结果：`pnpm py:check` 260 passed、1 opt-in online skipped、Ruff/mypy 通过；`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 files、0 errors、4 reference warnings）、`pnpm validate:task-map`、`pnpm smoke:desktop`、`pnpm smoke:package:mac` 和 `git diff --check` 通过。旧 quick 在线闭环属于旧安装包；当前包 standard/strict 全链、计划检索、知识任务 Review/Owner、跨 Host writer 对账及外部 Claude/Windows/Intel/签名公证仍待证据。手机与远程新增开发继续暂停，不 commit/push/release。

## Desktop Planner 真实运行与标准流程交接 · 2026-09-27（源码检查点，未重新打包）

本次先核对中断后的真实工作区：Agent Profile 角色保持测试、Planner/Refiner 不回退 Developer 的 Vue 与 Host 约束、独立 Python Host 重启读回和旧 Run Profile hash 均已在源码中；没有修改现有用户或 QA 数据。对先前只读扫描的日常与 7 份内部 QA/演示 SQLite，`agent_profiles` 均无已保存记录，无法证明有待自动修复的历史误写；保持原库不变。

新增的 Python Host Plan 节点现将获批 Task Contract、版本、验收 ID、已发布 Workflow/Profile/插件锁和 Git 基线绑定到只读 Codex 请求。结构化结果按 `plan-result` 严格校验：错误 identity、虚构验收证据、修改工作区、非法路径或不完整输出均失败，不产生计划成功状态。有效计划保存为含 hash 的 SQLite `plan_artifacts`，migration 37 仅在隔离测试库执行；Developer 后续独立 Run 明确接收 `plan:<artifactId>` 来源及相同基线。`standard` 已发布模板自动交接 Developer，`strict` 需用户确认或拒绝计划；中断在自动交接写入前的标准流程提供版本绑定的显式恢复，拒绝计划不会启动 Developer。内置 `standard@1` 仍为旧 Task 的兼容直接开发路径，不伪称它含 Plan 节点。正式任务抽屉可选择已发布 Workflow、启动 Plan、查看产物与严格门禁；计划流程的资料检索尚未接入，UI 与 Host 均明确拒绝该组合。

真实在线探测：当前已授权本机 Codex CLI 0.155.1 / app-server / macOS arm64 的 strict Plan 在独立 Git fixture 以只读权限完成，Run `44da7ca8-a3ab-4c7c-a238-325210b83d14`、Artifact `f4d22f23-6088-4161-a075-b444d73bc107`、Task revision 2、基线 `6732b7da7da677fbfa4fb0a0f944df3ec5101e13`，计划 outcome `ready` 且源 Git clean。前三次真实尝试分别因观测 Token 预算、无效 Host identity、`inconclusive` outcome 失败；它们没有产出可交接计划，不能算通过。此在线证据来自 Host 服务测试，**不是安装版 Desktop 全链**，没有随后在线启动 Developer。

无模型费用的真实 Git/SQLite/Host 服务测试分别验证已发布 `standard` Plan→Developer、`strict` 人工批准/拒绝、冻结版本/基线及存储重开、自动交接失败后的显式恢复；这些使用 fixture Executor，不冒充 Codex 在线验收。`pnpm py:check` 在恢复逻辑修改前为 254 passed、1 opt-in online skipped，Ruff/mypy 通过；恢复后的定向 Python 4 passed，Web RunInspector/DraftSheet 26 passed，后续仍需最终全量回归。当前最新**已安装**包仍是上述 `desktop-board-spacing-20260927`，只含早期角色/UI 修正、schema36，**不含本节 Planner Runtime 或 migration37**。`quick` 有旧安装包在线完整交付历史证据；published standard/strict 的 Developer→Review→Verify→人工验收、当前源码安装态与自定义流程失败/取消/返工尚无本版本完整证据，保持未验。下一步继续这些桌面链路与知识来源，不恢复手机/远程；不 commit/push/release。

## Desktop 角色保存链复核 · 2026-09-27（Planner Runtime 后续接入中）

上轮仅修了 Agents 表单在打开既有 Planner/Refiner 时的显示与只读门禁；本轮先以回归测试复现 Host 同一 Profile ID 可跨 revision 从 Planner 写成 Developer，随后在事务内增加角色不变校验并拒绝非只读 Planner/Refiner 权限。Desktop 既有 Profile 的角色选择锁定，TS 公共错误契约加入 `PROFILE_ROLE_MISMATCH`。独立 Python Host 的真实 stdio 测试完成 Planner 保存、跨角色拒绝、关闭并重启后目录读回；旧 revision 的 frozen Profile hash 仍可独立解析。`uv run --frozen pytest tests/test_agent_profiles.py -q` 7 passed，定向 Ruff/mypy、`pnpm --filter @forge/contracts build`、Agents Vue 7 tests、Web typecheck 均通过。

对本机日常、7 份内部 QA 与演示 SQLite 使用 `mode=ro` 检查：现存 `agent_profiles` 表没有已保存 Profile，未发现可证明的角色错写；没有修改任何这些库。当前 Planner 仍未真实执行，`standard`/`strict` 仍不能据此记为通过；最终安装包仍是上节旧构建，尚不含本轮修复。手机与远程新增开发继续后置。

## Desktop 看板顶部间距与 Agent Profile 角色保护 · 2026-09-27

用户指出「当前项目」卡片上方在不同窗口宽度都有多余空白。原因是 `.work-layout` 20px 顶部间距、`.board-pane` 17px padding、`.project-summary` 27px margin 叠加。保留工作区统一边距，去掉额外两层；安装版在 1440×900、1600×1000 实测卡片距内容区顶部不超过 32px，见[1440 截图](../output/playwright/desktop-board-spacing-20260927-board-top-1440x900.png)与[1600 截图](../output/playwright/desktop-board-spacing-20260927-board-top-1600x1000.png)。同时修复既有 Planner/Refiner Profile 在 Agents 编辑器被误转 Developer、Reviewer 的 `read-only-no-network` 权限打开时被重置的风险；未支持角色只读、保存禁用且 Host 仍报真实不可运行原因。[实际安装版 Planner 编辑](../output/playwright/desktop-board-spacing-20260927-planner-profile-readonly-1440x900.png)从隔离 SQLite 保存的真实 Profile 打开，revision 保持 1，未调用模型。

源码对齐内部 [desktop-board-spacing-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-board-spacing-20260927.dmg)：Forge 0.0.1、327642199 bytes、SHA-256 `802318f79f88bbd82edb36c4c5b551d1e1b4a3360200dc4bbfc0834a21932048`，**INTERNAL / ADHOC / UNNOTARIZED**。从此包独立复制的 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Board Spacing 20260927.app` 经 `codesign --verify --deep --strict`，普通 `open -n` 常驻，Main PID 61648、包内 Host PID 61674（仅当时观察）；专属 `Application Support/Forge Internal QA/6d45d02bedeba0e7/Forge/production/forge.sqlite` 为 schema36/`quick_check=ok`、0 Project，不触碰旧 QA 或日常数据。`pnpm test` 含 build 全通过，`pnpm lint`、`pnpm typecheck`、Agents/Workflows 定向 Vitest 11 passed；本 DMG 的真实 package smoke 覆盖两尺寸布局、Planner 工作流预检、持久 Planner Profile 只读门禁、包内 Host/SQLite/Renderer 沙箱。独立无费用检查；本包没有新在线 Codex Run。Planner/严格计划门禁、可信凭据 broker、知识任务 Review/Owner、物理重启恢复正向、跨 Host 旧 writer 对账、Claude、Windows/Intel、正式签名公证仍未完成；完整 Desktop/P6 Gate 未通过，P7/P8 新增开发继续后置。


## Desktop 标准工作流 Planner 职责诊断与最新内部包 · 2026-09-27

权威 `standard`/`strict` 的 Plan Agent 虽在 `development` 看板列，其职责仍是只读 Planner。Python Workflow 编译器现根据 `plan-result` 输出判断 Planner，不再误报 `WORKFLOW_PROFILE_ROLE_MISMATCH`；实际 Planner 运行时仍缺，已安装 Planner Profile 时继续返回 `ROLE_UNSUPPORTED`，未安装则 `WORKFLOW_PROFILE_UNAVAILABLE`，不能发布或启动。正式 Workflow 编辑页也正确显示 Planner、只读约束与真实 Profile 可用性，切换职责会同步输入及输出契约。`quick` 的真实 Develop/Review/Verify/Owner 运行路径与旧冻结 Run 不变；本次**没有**实现标准/严格模板的计划执行或计划后人工门禁，仍列为桌面完整交付缺口。

源码对齐内部 [desktop-planner-role-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-planner-role-20260927.dmg)：Forge 0.0.1、330519685 bytes、SHA-256 `32c21e4948ee459e4298dc861156d1fabef2857aeb916f7086a66be8765179c8`，**INTERNAL / ADHOC / UNNOTARIZED**。从此包独立安装的 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Planner Role 20260927.app` 经 `codesign --verify --deep --strict` 和普通 `open -n` 常驻；实际 Main PID 84743、包内 Python Host PID 84754（仅当时观测），专属空库 `Application Support/Forge Internal QA/6cf750421f7ef087/Forge/production/forge.sqlite` 为 schema36/`quick_check=ok`、0 Project/Run，不改旧 QA/日常数据。当前安装包 [Plan 节点](../output/playwright/desktop-planner-role-20260927-standard-planner-role-1440x900.png)与[预检拒绝](../output/playwright/desktop-planner-role-20260927-standard-planner-unavailable-1440x900.png)均来自真实 Vue/Electron/包内 Host；无模型调用。另一隔离安装使用本机已有合法登录和 Finder 风格最小 PATH，实际 Codex CLI 0.155.1/app-server `initialize`/`model/list` 返回 7 个模型；只读能力探测不算新 Run。

验证：`uv run --frozen pytest tests/test_workflow_compiler.py tests/test_workflow_runtime.py -q` 8 passed，定向 Ruff/mypy、`pnpm --dir apps/web exec vitest run src/components/WorkflowsView.test.ts` 5 passed；`pnpm py:check` 244 passed/Ruff/mypy、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`node --check scripts/smoke-package-macos.mjs`、定向 ESLint、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、指定新 DMG 的 `pnpm smoke:package:mac` 和 `git diff --check` exit 0。安装烟测第一次只因 StatusTag 含装饰圆点、脚本用整段文本精确匹配而超时；产品已返回 `WORKFLOW_PROFILE_UNAVAILABLE`，将选择器限定为状态标签后同一 DMG 两次复跑通过，未改运行门禁。完整 Desktop/P6 Gate、可信凭据 broker、知识场景 Review/Owner、物理重启恢复正向、跨 Host 旧 writer 对账、Claude、Windows/Intel 与正式签名公证仍未完成；P7/P8 手机远程新增开发保持后置，不提交/推送/发布。

## Desktop 内置 Codex 插件配置真实保存与重启应用 · 2026-09-27

当前源码对齐内部 macOS arm64 包：[desktop-plugin-config-final-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-config-final-20260927.dmg)，Forge 0.0.1、324410337 bytes、SHA-256 `679d6697bfe93035a894dd2c884b1dd8c769ced56d9ee8c1ca18f764adda97bc`，**INTERNAL / ADHOC / UNNOTARIZED**。Codex 内置插件升至 0.0.3，锁定内容摘要；新增唯一的非敏感、1–60 秒 `appServerInitializationTimeoutSeconds`。桌面「插件」页通过固定 Preload/Main/Host 方法保存到 Host-owned SQLite metadata，revision 冲突拒绝。保存后新 Run、Review 与模型整理在重启前被拒绝；重启时由 Python Host 校验插件版本/内容锁并注入新 Adapter，旧活动 Run 不被改写。凭据引用仍无可信 broker，明确拒绝持久化，未开放任意配置或权限；无新依赖、Schema migration 或远程入口。见 [ADR 0051 补充](decisions/0051-plugin-schema-form-and-read-only-inspection.md)。

`pnpm install --frozen-lockfile`、`pnpm py:check`（243 pytest、Ruff/mypy 71 文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`git diff --check` 均通过。Python 真实 stdio Host 测试覆盖错误字段/范围、revision 冲突、保存后门禁、重启读取与真实归属子进程的 initialize timeout；此子进程是协议测试 fixture，**不是一次在线 Codex 模型运行**。指定新 DMG 的 `pnpm smoke:package:mac` 在临时独立安装中从正式 Vue 页面保存 2 秒→Host `configRevision=1/configApplied=false`→关闭 owned Host→重新打开同一安装包→Host `configApplied=true`/页面读回 2 秒；[待重启](../output/playwright/desktop-plugin-config-final-20260927-plugin-config-pending-1440x900.png)、[已应用](../output/playwright/desktop-plugin-config-final-20260927-plugin-config-applied-1440x900.png)为真实安装版截图。包内 CPython 3.12.13、SQLite 3.50.4/schema36、Renderer sandbox 与 ad-hoc 签名通过。洁净 PATH 下 Codex CLI 不可用被正确显示，未调用模型。

同一 DMG 又以 `FORGE_PACKAGE_FINDER_CLI=1` 运行可选安装版核验：先在独立数据保存并重启应用 2 秒配置，再以当前合法登录的真实 HOME 与 Finder 风格最小 PATH 重启**同一复制安装**。Host 发现包外 `codex-cli 0.155.1`、登录状态 authenticated，并经真正的 Codex app-server `initialize`/`model/list` 探测到 7 个模型；已保存的配置在新 Host 标记 `configApplied=true`。正式[本机依赖页截图](../output/playwright/desktop-plugin-config-finder-20260927-finder-cli-authenticated-1440x900.png)已目视检查。该调用没有启动模型 Turn 或新的 Task Run，也没有验证跨用户安装、代理网络或模型实际执行；只关闭本机当前登录下的 Finder 风格 CLI 发现与真实 app-server 握手子项。

另装独立常驻 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Plugin Config Final 20260927.app`，`codesign --verify --deep --strict` 通过；`open -n` 无环境覆盖后 Main PID 35191、包内 Host PID 35204（均仅为当时观测），专属数据 `Application Support/Forge Internal QA/363a57dfce5c44f5/Forge/production/forge.sqlite` 为 schema36、`quick_check=ok`、0 Project。此前 Finder-safe QA App/SQLite、旧真实运行证据和日常数据未动。新包实际完成 Codex app-server 探测握手，但尚无使用该配置的在线模型 Run；知识场景 Review/Owner、可信凭据 broker、物理重启旧 Run 正向、安全跨 Host writer 对账仍为桌面缺口。Claude、Windows/Intel、签名公证/正式更新与完整 Desktop/P6 Gate 继续未通过；P7/P8 手机远程新增工作后置，不提交/推送/发布。

## Desktop 内部安装包 Finder 启动与数据隔离 · 2026-09-27

此前源码对齐内部包：[desktop-finder-safe-final-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-finder-safe-final-20260927.dmg)，0.0.1、SHA-256 `0f6075d7bc62462b3849d1120cc975cedbefc5e08ea633b7057f2849d671d919`，**INTERNAL / ADHOC / UNNOTARIZED**。先前多份内部 QA App 使用同一 `CFBundleIdentifier`，Finder/LaunchServices 在并行安装时不能可靠定位实例；而不带 `FORGE_INTERNAL_TEST_HOME` 的直接打开可能使用日常 Forge 数据。本次仅对**新内部 QA 构建**生成严格 16-hex 身份和独立 bundle ID，Main 在启动前校验包内标记，默认数据目录为 `~/Library/Application Support/Forge Internal QA/<id>/Forge`，显式测试覆盖仍可用；标记无效/超大/链接则拒绝启动，正式包无标记时忽略测试覆盖。旧安装、SQLite 和用户数据没有迁移、删除或覆盖；见[ADR 0073 补充](decisions/0073-internal-macos-package-and-distribution-gate.md)。

从该 DMG 只读挂载后另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Finder Safe Final 20260927.app`，`codesign --verify --deep --strict` 成功，macOS `open -n` **无特殊环境变量**启动 Main PID 80685、包内 Host PID 80689、沙箱 Renderer；新目录 `~/Library/Application Support/Forge Internal QA/05d77bb86c01d376/Forge/production/forge.sqlite` 为 schema36、`quick_check=ok`、0 Project/Run。已留一份无 remote、Git clean、`npm test` 通过的独立演示仓库 `/Users/iamzjt/Documents/Forge Desktop QA Finder Safe 20260927/Forge 测试项目 01`，没有预先信任。当前包项目、Workflow、Agents、插件、知识页由安装版真实渲染截图且无横向溢出：[项目](../output/playwright/desktop-finder-safe-final-20260927-projects-1440x900.png)、[插件](../output/playwright/desktop-finder-safe-final-20260927-plugins-1440x900.png)。

验证：`node --test apps/desktop/tests/internal-qa-profile.test.mjs` 1 passed（无标记、合法独立路径、显式覆盖、路径穿越/损坏/链接拒绝）；`pnpm --filter @forge/desktop test` 15 passed；`pnpm typecheck`、`pnpm test`、`pnpm lint`（修复一次 preserve-caught-error 后复跑）、`pnpm build`、`pnpm py:check` 240 passed/Ruff/mypy、指定 DMG 的 `pnpm smoke:package:mac`（含当前页截图）、`git diff --check` 通过；`pnpm smoke:desktop` 最终复核通过（真实 Host connected/degraded/crashed 与 Renderer sandbox）。未重新调用模型；前一包在线 Workflow、知识 Run 和 Review 失败均保留原构建证据，不挪为新包在线通过。最新包仅关闭**内部 QA Finder 打开/日常数据隔离**这一子项；Gatekeeper 新机、Developer ID/公证、Windows/Intel、Claude、非空插件配置、知识 Run 的 Review/Owner、物理重启恢复正向及完整 Desktop/P6 仍未通过。P7/P8 后置，不 commit/push/release。

同一最终 DMG 还通过 `scripts/smoke-packaged-inconclusive-review-readback.mjs` 从**保留的真实知识/记忆 Run QA 库**做 SQLite online backup，包内 Host 和正式任务抽屉读回 Review `inconclusive`/结果 null、Task `active`；[当前包的真实页面](../output/playwright/desktop-finder-safe-final-20260927-inconclusive-1440x900.png)清楚显示 Verify passed 也不能跳过 Review/Owner。原库、源 Git 与旧截图未改；新包没有再次调用模型或完成该任务。

## Desktop Review 无结构化结果诊断 · 2026-09-27

当前源码对齐内部包：[desktop-review-diagnostic-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-review-diagnostic-20260927.dmg)，0.0.1、324457875 bytes、SHA-256 `b3d01ca3710b6ebd2316b258bc2450652ecf869fb06a267cb40c04420906d3a1`，**INTERNAL / ADHOC / UNNOTARIZED**。针对上一包知识+记忆真实 Run 后的 Review `inconclusive`/result null，Python Host 现在只把审查评价的固定原因码 `REVIEW_RESULT_MISSING`/`REVIEW_RESULT_INVALID` 写入已有 `review_jobs.error_code`；公开 Review 报告附加可选只读 `diagnosticCode`，旧报告没有原因码时保持 null。桌面任务抽屉说明任务未完成、需明确重试且重试会再次调用模型，不把 Job `completed` 当审查批准。原始 provider 输出不持久化；无新 SQLite migration、权限、凭据或网络入口。

`pnpm py:check` 完整复跑 **240 pytest/Ruff/mypy exit 0**；新真实 SQLite/Git/Host Review fixture 另以 `uv --directory python run --frozen pytest -q tests/test_review_diagnostics.py` 1 passed，验证缺少结构化结果的原因、Task 非 Done、重启读回和 `quick_check=ok`；原 Review 定向测试与 TS/Vue 155 测试通过。`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm smoke:desktop`、`pnpm validate:contracts`（47/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm package:mac:internal --artifact-suffix=desktop-review-diagnostic-20260927`、指定 DMG `pnpm smoke:package:mac`、脚本语法和 `git diff --check` 均 exit 0；包内 CPython 3.12.13、SQLite 3.50.4/schema36、sandbox Renderer 已实测。最新 DMG 从真实旧 Review QA 库 **online backup 到临时隔离数据**后，经包内 Host/正式任务抽屉读回 `inconclusive`、Task `active`、旧记录原因码 null 并显示[未完成提示](../output/playwright/desktop-review-diagnostic-20260927-inconclusive-1440x900.png)；原 QA DB 未改，**没有重跑在线 Review 或把旧结果补写为新原因码**。

新 DMG 另装独立空白 QA 应用 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Review Diagnostic 20260927.app`；`/Users/iamzjt/Documents/Forge Desktop QA Review Diagnostic 20260927/Open Forge Desktop QA.command` 直接在 Terminal 中启动，实测 Main PID 47422、包内 Host PID 47443、Renderer 存在，schema36/`quick_check=ok`/零 Project/Run；同目录 `sample-project` Git clean、无 remote、未预先信任。此前安装、用户日常数据和真实 QA 历史保留。此包的真实知识场景 **仍未完成 Review/Owner 接受**；非空插件配置消费、物理重启恢复正向、Finder/LaunchServices、Claude/Windows/Intel/签名公证/正式更新也仍待验。Desktop/P6 门禁状态不变，P7/P8 新增工作后置，不自动提交、推送、发布。

## Desktop 自定义 Workflow 已安装包完整链 · 2026-09-27

本轮仍按用户桌面优先级推进，P7/P8 手机和远程新开发后置。已发布自定义 Workflow 的 Task 在启动面板曾可另选不匹配的 Developer Profile，Host 正确拒绝 `WORKFLOW_PROFILE_MISMATCH`，但页面未说明发布绑定。本次 Host `run.capabilities` 在已有协议 v5 上附加可选的发布 Workflow/Developer Profile/模型精确版本绑定，Renderer 只展示并锁定该选择，Start 仍由 Host 重校验；绑定失效时禁用 Start。没有扩大 Renderer/Preload 权限，也未增加新业务 Runtime。契约、Vue 组件与 Python 定向测试覆盖真实发布绑定、失效拒绝与 UI Start。

当前源码对齐包：[desktop-workflow-binding-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-workflow-binding-20260927.dmg)，版本 0.0.1、330992035 bytes、SHA-256 `c3e6fb58ad7dbd13f9d47243414d0d77d59d233b3ab651e91e1b1adbbf53fe84`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm py:check` 239 pytest/Ruff/mypy、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（经测试与 Desktop smoke）、`pnpm validate:contracts` 47 文件/0 error/4 既有 warning、`pnpm validate:task-map` 9 Phase/92 Task/120 Case/84 deferred、`pnpm smoke:desktop`、`pnpm package:mac:internal --artifact-suffix=desktop-workflow-binding-20260927`、指定 DMG `pnpm smoke:package:mac` 和 `git diff --check` 均 exit 0。包内 CPython 3.12.13、SQLite 3.50.4/schema36、Renderer sandbox 经实测。

同一 DMG 的独立真实 Codex 测试 `output/qa/desktop-workflow-binding-full-20260927-run5/`：用户已批准 TODO、发布的 quick Workflow v1 绑定 Developer/Reviewer Profile，正式任务抽屉固定展示模型/Profile，显式 Start 后 Run `85a88480-4371-4346-85b5-8ac7878edd8b` 修改独立 Git worktree 的两个文件；Verify exit 0、独立 Review approved、Owner 逐项人工接受后才 Done；另一个 Run `a2d7c242-27e4-47d4-9385-f16394a3b280` 被真实取消，重启后交付仍可查看，源 Git clean。只读 QA evaluator 为 1 accepted/1 cancelled/0 failed/0 interrupted，SQLite `quick_check=ok`。[开发快照](../output/playwright/workflow-binding-run5-20260927-delivery-1440x900.png)、[Review](../output/playwright/workflow-binding-run5-20260927-review-1440x900.png)、[Owner 接受](../output/playwright/workflow-binding-run5-20260927-accepted-1440x900.png)已目视核对。首次验收脚本选择了新 UI 已禁用的模型/Profile，随后两次真实 Run 分别在 50,000/100,000 Token 观测上限触发 `RUN_TOKEN_BUDGET_EXCEEDED`；这些失败均保留，不记交付。最终独立 Run 由 UI 明确选 200,000 档完成；这不是精确费用上限。测试脚本的异步等待和与发布绑定冲突的独立 Profile 断言已修正。

另从 DMG 安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Workflow Binding 20260927.app`，以 `/Users/iamzjt/Documents/Forge Desktop QA Workflow Binding 20260927/Open Forge Desktop QA.command` 运行独立空白数据，Main PID 11475/包内 Host PID 11479 已观察，schema36/`quick_check=ok`/0 Project/Run，旁边 `sample-project` clean 且未预先信任。此 `.command` 直接在 Terminal 中运行；本机多份同 bundle ID 内部 QA 包并行时，`open -n --env` 仅留下无 Host 的 Main，Finder/LaunchServices 路径未通过，尚须定位；不是正式启动验收。旧安装、日常数据库与历史 QA 均未覆盖。

同一 DMG 另在 `output/qa/desktop-workflow-binding-context-20260927-run1/` 验证第 9 页真实来源链：独立 Git fixture 文档导入与定位→检索 `start_date`→用户确认的记忆→冻结 ContextBundle 含 `retrieved_knowledge/untrusted_project` 与 `validated_memory`→UI 明确 Start 的真实 Codex Run `ff9e77ea-689b-461d-b92f-6fabfa10e540` 成功修改并生成快照→任务抽屉 [Context 实图](../output/playwright/workflow-context-run1-20260927-context-source-1440x900.png)显示两项来源。撤销文档和记忆后，历史来源变为 revoked，源 Git clean；无命中、冲突两种情况分别拒绝 `CONTEXT_NO_SOURCE`、`CONTEXT_REQUIRES_HUMAN`。Verify exit 0、AC verified，但独立 Review Job 完成后报告为 `inconclusive`/result null，验收脚本 exit 1，**该任务仍 active、无 Owner 接受或 Done**；不把第 9 页来源通过误写成整条交付通过。其 SQLite `quick_check=ok`、数据保留，后续需诊断/重试只读 Review 的结构化结果。

同包无模型插件控制补验：`FORGE_PLUGIN_PACKAGED_DMG=<当前 DMG> FORGE_PLUGIN_SCREENSHOT_TAG=desktop-workflow-binding-20260927 node scripts/smoke-plugin-control.mjs` exit 0。从 DMG 独立安装，正式插件页停用 Codex、重启保持停用，已批准 TODO 的新 Run 被 `RUN_PLUGIN_UNAVAILABLE` 拒绝且仍零 Run；重新启用并重启恢复能力，任意非法启用值被固定桥拒绝，源 Git clean。[当前包任务拒绝实图](../output/playwright/desktop-workflow-binding-20260927-run-blocked-1440x900.png)。这证明**启停设置**影响下一 Run，不证明非空 `configSchema` 字段、secret 引用或其他插件运行参数已被 Host 持久消费；该缺口继续保留。

**桌面里程碑仍未结束**：P4-04 非空插件配置真实消费、此知识场景的 Review/最终交付、物理重启后旧 Run 安全恢复正向、Finder 式正常启动、Windows/Intel、Claude 第二执行器、Developer ID/公证/正式更新仍分开待验。P7/P8 新增开发继续后置；无自动 commit/push/release。

## Desktop 中断 Run 的跨系统启动会话恢复入口 · 2026-09-27

当前可操作内部包：[desktop-boot-recovery-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-boot-recovery-20260927.dmg)，0.0.1、329444493 bytes、SHA-256 `44a6c16b0af98cecbf931b5f1cc3d71fff0835e54c8fe15a4ba6ef28957e9052`，**INTERNAL / ADHOC / UNNOTARIZED**。包内 CPython 3.12.13、SQLite 3.50.4/schema36、Renderer sandbox 经安装包 smoke 通过。独立 QA App `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Boot Recovery 20260927.app` 与 `/Users/iamzjt/Documents/Forge Desktop QA Boot Recovery 20260927/Open Forge Desktop QA.command` 已准备；其 `isolated-app-data` 初始库 `quick_check=ok`、schema36、0 Project/Run，`sample-project` Git clean/无 remote；旧安装与日常库未覆盖。[当前包首页](../output/playwright/desktop-boot-recovery-20260927-home-1440x900.png)为安装版空态。

针对 [ADR 0084](decisions/0084-boot-session-interrupted-run-reconciliation.md) 的真实缺口：Python Host 在启动对账时为尚未观察的 `interrupted` Run/`quarantined` 租约持久记录内核启动会话 ID；固定 `run.recoveryStatus` 只返回状态与版本绑定数据，`run.recoveryResolve` 只有在**不同系统启动会话**、无本 Host owned 进程/未知 journal、旧 Git worktree 身份有效且用户在正式任务抽屉看过变更并经 Main 原生确认时，才用单个 SQLite 事务解除旧租约。旧 Run/Attempt 保持 `interrupted`，旧工作区保留、不自动重跑或合并；板上任务才回到 TODO，需另行明确 Start。Schema35→36 采用迁移前备份、事务迁移、新观察表与触发器，未重置原有数据或信任。macOS 读取 `kern.bootsessionuuid`；Windows 仍 fail closed。普通 Web 没有本地 Host 或恢复操作。

实际执行：`uv --directory python run --frozen pytest tests/test_recovery.py tests/test_persistence.py -q` 20 passed；`pnpm py:check` 238 pytest/Ruff/mypy 70 源文件通过；`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。`pnpm test` 与 `smoke:desktop` 均包含真实 build。`pnpm package:mac:internal --artifact-suffix=desktop-boot-recovery-20260927` 和指定 DMG 的 `pnpm smoke:package:mac` 通过。新包另从旧**真实 Codex Host 崩溃** QA SQLite 做 online backup，在独立安装中验证 `awaiting_reboot`、同启动会话的原生确认后 Host 仍返回 `RUN_RECOVERY_PROOF_REQUIRED`、新 Run 禁用/原 Run 与租约不变；[安装版中断任务](../output/playwright/desktop-boot-recovery-20260927-1440x900.png)已目视核对。仅有数据库副本而缺旧 worktree 时预览拒绝；原 schema35 QA 库在同包的只读模式另行打开，可查看原 worktree [变更](../output/playwright/desktop-boot-recovery-readonly-20260927-1440x900.png)，数据/源码仍不变。未伪造可恢复状态或重新调用模型。

**尚未验收**：物理 Mac 重启后从原工作区正向解除隔离、带真实旧 Codex 子命令的同包全链、P4-04 非空插件配置/凭据消费、当前包完整在线交付、Windows x64/macOS Intel、Claude、Developer ID/公证/签名更新。单测注入另一个启动 ID 只验证状态机和事务，不是实机重启或 T120 完整通过；完整 Desktop/P6 Gate 仍未通过。下一桌面缺口优先 P4-04 实际配置消费与恢复正向实机补验，P7/P8 手机远程新增开发后置；不自动提交、推送、发布。

包后 QA 工具兼容补丁：`python/scripts/evaluate_qa_runs.py` 原只接受当时的最新 schema35，现精确接受 35/36。两份旧真实 QA 库分别做 SQLite online backup 并只在隔离副本升级到 36：崩溃 `interrupted=1/accepted=0`、交付＋取消 `accepted=1/cancelled=1` 的新旧 JSON 报告完全相同；另把一次性副本标为未知 schema37 时 CLI 非零并报告 `EVALUATION_SCHEMA_UNSUPPORTED`。`pnpm py:lint`、该脚本 mypy 和 `git diff --check` 再次通过。此脚本不参与上述 DMG 的产品构建；没有修改原始 QA DB 或把旧 Run 重新记为本包在线执行。

## Desktop 损坏进程 journal 恢复门禁与最新内部包 · 2026-09-27

上一个恢复门禁按有效旧 journal 记录统计风险，但损坏 JSON、符号链接及崩溃留下的 `.tmp` 可能被扫描器跳过。Python `ProcessController.uncertain_journal_entries()` 现在只读扫描 Forge 自有目录并验证记录身份；不确定条目单独进入固定 `system.profileSwitchSafety.fences`，使 Main 拒绝数据集切换，绝不凭 journal 猜测旧 PID 可被终止。严格 TS 契约及 Python/Node 定向测试覆盖计数一致性、损坏、残留和 symlink；没有新 Run 状态、SQLite migration、依赖、网络权限或清理命令。见 [ADR 0083](decisions/0083-reversible-desktop-data-profile-restore.md) 和 [ADR 0044](decisions/0044-startup-recovery-and-side-effect-reconciliation.md)。

**最新源码对齐包**：[desktop-journal-fence-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-journal-fence-20260927.dmg)，0.0.1、327209166 bytes、SHA-256 `3c9f9682e8e99ec54a9d4fb9fc4e3bf5a1859c17284026478a5a4216265eb3c6`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm install --frozen-lockfile`、`pnpm py:check`（236 Python tests/Ruff/mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`pnpm package:mac:internal --artifact-suffix=desktop-journal-fence-20260927`、指定包 `pnpm smoke:package:mac` 均 exit 0。包内 CPython 3.12.13、SQLite 3.50.4/schema35 与 Renderer sandbox 实测。新包的独立安装在真实 UI 完成备份→独立恢复→重新信任→原集返回；另一份旧**真实 Codex 崩溃 Run** 的隔离副本保持 `interrupted`/`quarantined` 并拒绝恢复；第三份测试专属数据在原本干净的 journal 放入损坏 JSON，设置页也拒绝恢复、Host PID/profile/备份不变，随后只移除该测试文件。[损坏 journal 拒绝截图](../output/playwright/desktop-journal-fence-corrupt-20260927-journal-restore-refused-1440x900.png)已目视核对，隔离 QA 目录 `output/qa/desktop-profile-restore-wRpaHq/`、`output/qa/desktop-interrupted-readback-FLthr9/` 保留。

同包独立安装的插件启停 QA：已批准 TODO 在正式页面停用 Codex 后 `run.start` 返回 `RUN_PLUGIN_UNAVAILABLE`、零 Run；重启仍停用，启用后再次重启才恢复，测试 Git clean、无在线模型。[任务抽屉实图](../output/playwright/desktop-journal-fence-20260927-plugin-control-run-blocked-1440x900.png)。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Journal Fence 20260927.app` 供用户常驻操作，双击 `/Users/iamzjt/Documents/Forge Desktop QA Journal Fence 20260927/Open Forge Desktop QA.command` 使用独立空数据；当时 Main/包内 Host PID 92755/92762、schema35/`quick_check=ok`/0 Project/Run，sample Git clean/无 remote，旧 App 和数据未覆盖。本包无新在线 Codex 完整链。跨 Host 旧 writer 安全对账、P4-04 非空配置/凭据消费、Claude 第二执行器、Windows/Intel、Developer ID/公证、签名更新和完整 Desktop/P6 仍未验收；P7/P8 后置，不提交/推送/发布。

只读 T120 分类补证：当前 `python/scripts/evaluate_qa_runs.py` 对旧真实安装版取消 QA 库与 Host 崩溃 QA 库分别 exit 0；各含 1 个 Run，结果分别为 `cancelledRuns=1,acceptedDeliveryRuns=0` 与 `interruptedRuns=1,acceptedDeliveryRuns=0`。相对路径参数首次因 `uv --directory python` 工作目录变更而报 `EVALUATION_DATABASE_INVALID`；修正评测脚本从仓库根目录解析相对路径后，两份真实 QA 库以绝对和相对路径分别复跑 exit 0，Ruff 定向检查通过，未修改数据库。旧构建的真实 Run 分类与新包同 SHA 全链/T120 完整自动化验收是两种不同证据，不互相替代。

最新同包活跃验证门禁补证：`FORGE_ACTIVE_VERIFIER_DMG=<desktop-journal-fence-20260927.dmg> FORGE_ACTIVE_VERIFIER_TAG=desktop-journal-fence-20260927 node scripts/smoke-packaged-active-verifier-remove.mjs` exit 0。从 DMG 复制的包内 Host 真实启动获批 `test` 验证子进程 PID 95322；Desktop「项目→Remove from Forge」被 `PROJECT_BUSY` 拒绝，项目仍在，随后验证 `passed`/exit 0，源 Git HEAD/status 不变。[安装版拒绝实图](../output/playwright/desktop-journal-fence-20260927-remove-blocked-1440x900.png)已目视核对，隔离证据目录 `output/qa/desktop-active-verifier-bFD3eI/` 保留。该 fixture 借用开发树 Python 仅构造数据，执行/拒绝路径使用安装包内 Host；未调用模型，也不充当活跃 Codex 开发 Run 的归档负测。

## Desktop 持久恢复安全门禁与最新内部包 · 2026-09-27

前一源码对齐内部 macOS arm64 包：[desktop-recovery-fence-20260927 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-recovery-fence-20260927.dmg)，0.0.1、324834922 bytes、SHA-256 `90f71bc9891452fe0c512fe159360c96dab0a2ec390b322c643ed51e0f9292da`，**INTERNAL / ADHOC / UNNOTARIZED**。延续前包的 Project 归档事务门禁：中断的 Review/Verify Job 现在也会阻止 Project 移除，返回 `RUN_RECOVERY_REQUIRED`，不隐藏尚未对账的执行记录。数据配置恢复原先只查本 Host 的内存活动，Host 崩溃后可能漏掉旧 Run/租约/Job/进程 journal；现由 Python Host 的固定只读 `system.profileSwitchSafety` 汇总持久风险，Main 在 staging 前与静止期后各核对一次。存在不确定性就拒绝切换，保持原 Host、数据指针和备份，不依据旧 PID 杀进程或自动释放租约。Renderer 没有通用通道或数据库访问；协议 v5 中仅增加只读方法及严格响应 Schema，无 migration、依赖或网络权限变化。决策补充在 [ADR 0044](decisions/0044-startup-recovery-and-side-effect-reconciliation.md) 与 [ADR 0083](decisions/0083-reversible-desktop-data-profile-restore.md)。

真实验证：`uv --directory python run --frozen pytest tests/test_verifier_project.py tests/test_recovery.py tests/test_diagnostics.py -q` 24 passed；`pnpm py:check` 236 Python 测试、Ruff/严格 mypy 70 源文件通过；`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 JS/Web build）、`pnpm build`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop` 以及 Main→Host data-switch 定向 Node 测试通过。指定 DMG 的 `pnpm smoke:package:mac` 加载包内 CPython 3.12.13、SQLite 3.50.4/schema35 和沙箱 Renderer，通过主要页面截图；同包安装版备份→独立恢复→重新信任→返回原数据集通过，原数据/备份/源 Git 不变，见 `output/qa/desktop-profile-restore-Ul6eXA/`。另一独立安装用旧**真实 Codex 崩溃 Run** 的 SQLite online backup，正式任务详情保留 `interrupted`/`quarantined`，[设置页拒绝恢复实图](../output/playwright/desktop-recovery-fence-20260927-interrupted-restore-refused-1440x900.png)已目视核对；profile/Host PID/备份 SHA-256/Run 与租约/源 Git 均不变，证据在 `output/qa/desktop-interrupted-readback-l2crEL/`。首次脚本因任务抽屉遮住设置按钮超时，关闭抽屉后同 DMG 复跑 exit 0，未改生产逻辑、未调用模型。

另从该 DMG 独立安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Recovery Fence 20260927.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Recovery Fence 20260927/Open Forge Desktop QA.command` 由 Finder/Terminal 常驻启动，独立空数据 schema35、`quick_check=ok`、零 Project/Run，同目录干净无 remote 的 `sample-project` 未被预置信任。实测 Main PID 60930、包内 Host PID 60936 仅为当时观测。直接在自动化 shell 中运行 `.command` 后子进程未持久，Finder/Terminal 打开才形成独立常驻进程；用户指南按已验证的双击路径描述。原 QA App/数据未覆盖。本包没有新在线 Codex 完整任务链；旧包历史成果继续按原 SHA 追踪。跨 Host 旧 writer 安全对账、P4-04 非空插件配置消费、Claude 在线/第二执行器、Windows/Intel、Developer ID/公证、签名更新和完整 Desktop/P6 Gate 仍未通过；P7/P8 新增工作继续后置，不 commit/push/release。

同一 DMG 又通过独立安装版 `scripts/smoke-plugin-control.mjs`：一个真实批准的 TODO 在 UI 停用 Codex 插件后保持零 Run，Host `run.capabilities`/`run.start` 拒绝 `RUN_PLUGIN_UNAVAILABLE`，重启后停用仍生效；从页面启用并再次重启后才恢复装配。任意非布尔 Preload 参数被拒绝，源 Git clean。[安装版不可启动状态](../output/playwright/desktop-recovery-fence-20260927-plugin-control-run-blocked-1440x900.png)已目视核对；全程 `FORGE_MODEL_PROVIDER=disabled`，没有模型调用。内置 Codex 的正式 configSchema 仍为闭合空对象；该证据仅证明启停生命周期及新 Run 门禁，不代表非空插件配置持久化/消费或 CredentialRef 使用。

## Desktop 项目归档与运行启动事务门禁 · 2026-09-27

当前源码对齐内部 macOS arm64 DMG：[desktop-archive-race-20260927](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-archive-race-20260927.dmg)，0.0.1、326090997 bytes、SHA-256 `41f95ad87599cedbc638b6a5b55c220687ae8d28bee59dca8945389780876eab`，**INTERNAL / ADHOC / UNNOTARIZED**。上一包已阻止已登记的活动 Run/Review/Verify 被归档；本次修复工作区创建与 Job/Run 最终写入之间的竞态。Python Host 在 Developer Run、Review 和 Verify 的最终 SQLite 意图事务内再次确认项目仍是当前、已信任且未归档；若项目在异步准备期间被移除或切换，则拒绝启动，Verify 释放本轮隔离工作区，不会启动其子进程。此门禁不解除旧 Run 的隔离或清理历史 PID。决策补充见 [ADR 0044](decisions/0044-startup-recovery-and-side-effect-reconciliation.md)。

真实临时 Git/SQLite/子进程 fixture：运行中的 Verify 拒绝 `project.remove` 并保留项目与源 Git；另在 Verify 工作区已创建、Job 插入前归档，启动返回 `PROJECT_TRUST_REQUIRED`、零 Verify Job/进程、隔离工作区释放且源 Git clean。首轮全量回归暴露一个旧远程事件夹具先创建第二项目、再绕过 UI 为第一项目建 Run；已在夹具中显式切回目标项目，保留原断言。最终 `pnpm py:check` 234/234、Ruff/mypy，`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、指定 DMG 的 `pnpm smoke:package:mac` 与 `git diff --check` 通过。包内 CPython 3.12.13、SQLite 3.50.4/schema35 和沙箱 Renderer 实测；[本包项目页](../output/playwright/desktop-archive-race-20260927-projects-1440x900.png)来自实际安装烟测。本包**没有**新在线 Codex 调用，也没有在已安装应用中制造活跃模型 Run 归档负测。

同一 DMG 另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Archive Race 20260927.app`，通过双击 `/Users/iamzjt/Documents/Forge Desktop QA Archive Race 20260927/Open Forge Desktop QA.command` 启动独立**可写空数据** QA。跨独立工具调用仍在运行的 Main/包内 Host PID 为 22649/22666（仅当时观测）；SQLite schema35、`quick_check=ok`、零 Project/Run。同目录 `sample-project` 无 remote、Git clean，`node --test` 1 passed，需用户在 UI 主动选择并信任。旧 QA 应用和数据未覆盖。完整 Desktop、P4-04 非空插件配置消费、安全跨 Host 旧 writer 对账、Claude、Windows/Intel、签名/公证及正式更新仍待验；P7/P8 新增开发继续后置，不提交、推送或发布。

同一 `desktop-archive-race-20260927` DMG 的另一隔离安装还通过正式项目界面完成目录选择取消、真实 Git 探测、主动信任、双项目切换、重启和仅移除 Forge metadata；两份源仓库保持 clean。[探测](../output/playwright/desktop-archive-race-20260927-detected-1440x900.png)、[信任](../output/playwright/desktop-archive-race-20260927-trust-1440x900.png)、[移除后](../output/playwright/desktop-archive-race-20260927-removed-1440x900.png)均为该安装版截图；独立 QA 数据保留于 `output/qa/desktop-project-remove-QaWiBZ/`。

本包又在独立真实 Git/SQLite 中从**已安装 App 的包内 Python Host**启动一个获批的本地 Verify 命令；其归属进程 PID 26549 在点击正式项目页「从 Forge 移除」时仍在运行。Host 返回 `PROJECT_BUSY`、确认框保持打开、项目记录未归档；随后该真实命令 exit 0、报告 `passed`，源 Git HEAD/status 未变且 QA DB `quick_check=ok`。[安装版拦截实图](../output/playwright/desktop-archive-race-20260927-remove-blocked-1440x900.png)及 `output/qa/desktop-active-verifier-l1JkZM/` 保留证据。此为离线 Verify 子进程负测，**不是在线 Codex 模型 Run 的安装版负测**；未增加模型费用。

## Desktop 历史查看模式显式只读 · 2026-09-27

历史数据原本只靠 SQLite `mode=ro` 拒绝写入，Desktop 仍展示部分可写控件。包内 Python Host 现在在显式内部只读数据集上通过固定方法白名单拒绝所有写命令，返回 `DATABASE_READ_ONLY`；`system.health.storage.readOnly` 作为协议 v5 的可选只读状态提供给 Client。正常可写工作区不受影响。Vue 在历史模式展示整宽提示，保留真实查询和交付查看，关闭 Project/Task/Run、Profile/Workflow、Plugin/Knowledge、备份恢复及本机预览/配对的写入口。此举不解除中断 Run 的隔离租约。

`python/tests/test_host_protocol.py` 在独立临时 SQLite 上经真实 stdio Host 验证只读健康、查询、六种固定写命令拒绝及正常退出。Python 232 测试、Ruff/mypy、Web 151 测试、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm smoke:desktop` 与 `git diff --check` 均通过。新源码对齐内部 DMG [desktop-readonly-ui-final-20260927](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-readonly-ui-final-20260927.dmg) 为 0.0.1、327961146 bytes、SHA-256 `331c75a0ca2de200e20a301b2f1ac9b2a9dda459a9b383f099288b912f37c167`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm package:mac:internal` 与 `pnpm smoke:package:mac` 通过，包内 CPython 3.12.13、SQLite 3.50.4/schema35 与沙箱 Renderer 实测；独立安装版从真实已完成 QA 数据的 SQLite backup 读取历史任务，`project.remove` 返回 `DATABASE_READ_ONLY`，Project 前后相同，`quick_check=ok`。[任务抽屉](../output/playwright/desktop-readonly-ui-final-20260927-1440x900.png)和[项目页](../output/playwright/desktop-readonly-ui-final-20260927-projects-1440x900.png)已目视核对，提示不再挤压布局。本包没有新在线 Codex Run。

同一 DMG 已另装可操作的独立空数据 QA App `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Readonly UI 20260927.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Readonly UI 20260927/Open Forge Desktop QA.command` 常驻打开。该数据集 schema35/`quick_check=ok`/零 Project 与 Run；同目录无远端、clean 的 `sample-project` 测试 1 passed，仍需在 UI 手动选择和信任。旧应用及其数据保留。完整 Desktop、P4-04 非空插件配置消费、跨 Host 旧 writer 对账、Claude、Windows/Intel、签名公证和正式更新仍未通过；P7/P8 新开发后置，不提交、推送或发布。

## Desktop 项目安全移除拦截 · 2026-09-27

核查项目归档与崩溃隔离后，确认同一路径重新选择会恢复原 Project ID，旧租约无法由此绕过；但现有 `project.remove` 可在 Run/Review/Verify 等工作仍进行时归档项目。Python Host 现于同一 SQLite 归档事务拒绝活跃 Run/租约、Review、Verify、返工或未确定的合并，返回 `PROJECT_BUSY`；中断 Run/隔离租约返回 `RUN_RECOVERY_REQUIRED`。拒绝回滚归档、版本和当前项目指针。Desktop 移除确认框显示具体原因并保持打开；终态项目依旧只归档 Forge metadata，不删除 Git 文件。Schema 15 的旧数据库缺少后续作业表，按实际 schema 有条件检查。决策补充在 [ADR 0044](decisions/0044-startup-recovery-and-side-effect-reconciliation.md)。

`pnpm py:check`：231/231 Python 测试、Ruff、mypy 通过；真实临时 SQLite/Git fixture 验证活跃 Run 与重启隔离拒绝、Verify 工作中拒绝、终态项目正常归档且源 Git 保留。Web 149/149 包括确认框错误显示；`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件、0 error/4 既有 reference warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`git diff --check` 均通过。活跃工作拦截由 Python fixture 状态与组件测试证明；**没有把模型在线 Run 的安装版归档负测说成已执行**。

新的源码对齐内部 DMG：[desktop-project-fence-20260927](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-project-fence-20260927.dmg)，0.0.1，324693864 bytes，SHA-256 `62b49efc525131267a444165de164883196f85f2c91303efe22dddcec27a5a29`，**INTERNAL / ADHOC / UNNOTARIZED**。打包与 `pnpm smoke:package:mac` 通过，包内 CPython 3.12.13/SQLite 3.50.4/schema35、隔离 Host/Renderer 与受控退出已验，包内 `forge/persistence.py` 确含新增 `PROJECT_BUSY` 拦截。此 DMG 的独立安装副本在正常 Desktop UI 完成取消文件夹选择、双 Git 项目探测/信任/切换、重启后 metadata-only 移除，两个源 Git clean；[探测](../output/playwright/desktop-project-fence-20260927-detected-1440x900.png)、[信任](../output/playwright/desktop-project-fence-20260927-trust-1440x900.png)、[移除后](../output/playwright/desktop-project-fence-20260927-removed-1440x900.png)来自该安装版并已目视核对。另一独立、无预置 Project/Task/Run 的常驻 QA 安装由 [用户指南](user-guide/internal-macos-arm64.md)给出，日常数据库和旧安装均未覆盖。没有调用在线模型；完整 Desktop、P4-04 非空插件配置、安全跨 Host 租约对账、Claude/Windows/Intel/签名公证与正式更新仍待验，P7/P8 新开发继续后置，不 commit/push/release。

## Desktop 安装版 Mac Retina 实屏补验 · 2026-09-27

在与当前源码对齐的 `desktop-settings-first-20260926` 内部 DMG 上，使用真实 macOS arm64 主屏和 Electron 原生窗口复跑 `FORGE_PACKAGE_RETINA_TAG=desktop-retina-20260927 FORGE_PACKAGE_SURFACES_TAG=desktop-surfaces-combined-20260927 pnpm smoke:package:mac`（另显式指定同一 DMG），exit 0。主屏 `scaleFactor=2`、Renderer `devicePixelRatio=2`；首页、设置、项目、工作流、Agents、插件、项目资料七个一级桌面页在原生窗口中均无页面水平溢出。Playwright 以设备像素保存安装版截图，[首页](../output/playwright/desktop-retina-20260927-home-retina-native.png)、[设置](../output/playwright/desktop-retina-20260927-settings-retina-native.png)、[工作流](../output/playwright/desktop-retina-20260927-workflows-retina-native.png)、[插件](../output/playwright/desktop-retina-20260927-plugins-retina-native.png)等七图均为 2880×1736 像素；已目视核对。测试脚本将原生 Retina 检查排在可选 `setViewportSize` 页面检查之前，避免后者令 Playwright 仿真 DPR=1，并等待入场动画及 Host 真实页面数据加载后再截图。首次 DPR=1 的失败和初版截图捕获过早的问题保留为 QA 记录；最终同包重跑通过，没有改产品代码或重新打包。

同一 DMG 的独立项目/Task QA `output/qa/desktop-project-remove-YophFO/` 从正常选择/信任 Git fixture 创建 120 字中文手工草稿、人工批准为 TODO，确认零 Run，重启后在**未使用 `setViewportSize` 的原生窗口**打开真实任务抽屉。实际 Renderer DPR=2，长标题和关闭按钮不溢出，截图[长 Task 抽屉 Retina 实图](../output/playwright/desktop-retina-task-20260927-long-task-drawer-retina-native.png)已目视核对；QA 还验证项目切换、metadata-only 移除与两份源 Git clean，命令 exit 0。T108 现在有当前 Mac 的七个一级空态页和长 Task Drawer 子项证据；Windows 150% 系统 DPI、其他长数据状态和 T108 整项继续待验。没有在线模型调用、提交或发布。

同一安装版 `pnpm smoke:package:mac` 还实按 `Meta+K` 打开带真实焦点的「快速导航」，输入「项目资料」进入页面，再次 `Meta+K` 后用 Escape 关闭，返回工作台；这是当前 Mac 包的 T004 快捷键子项。Windows `Ctrl+K`、其他快捷键和 T004 整项仍未验。最后 `pnpm lint`、`pnpm typecheck`、`node --check`、QA 脚本 ESLint 与 `git diff --check` 均 exit 0。生产源码自上述 DMG 后未再改变；这轮新增的是安装版 QA 和追踪记录。

## Desktop 设置入口与安装版诊断补证 · 2026-09-26

正式 Settings 将外观、本机依赖、诊断与数据库备份排在本机浏览器预览/设备管理之前；后者仍保留且默认不开启，未增加远程监听或权限。Web 单测约束顺序；从新 DMG 安装的 Python Host 生成 `forge-diagnostics/v1` 预览，经原生 Save 对话框导出后逐字节一致，隔离 QA 日志中的测试 token/路径未进入导出。`scripts/smoke-diagnostics.mjs` 现支持显式指定内部 DMG，在安装版检查设置顺序并截图：[设置顶部](../output/playwright/desktop-settings-first-diagnostics-20260926-settings-top-1440x900.png)、[诊断预览](../output/playwright/desktop-settings-first-diagnostics-20260926-1440x900.png)，均已目视核对；证据目录 `output/qa/desktop-diagnostics-k8K2nV/`。另一次前一 DMG 的相同导出测试也通过，保留 `output/qa/desktop-diagnostics-SKc9gl/`，不混记其构建。

**当前源码对齐内部包**：[desktop-settings-first-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-settings-first-20260926.dmg)，版本 0.0.1，329725663 bytes，SHA-256 `da8c6fadf7dad1ddc295a46db6664fa7de762543b93afef1d691378b34e64894`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm --filter @forge/web test -- src/App.test.ts`（Web 148/148）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm package:mac:internal --artifact-suffix=desktop-settings-first-20260926`、指定 DMG 的 `pnpm smoke:package:mac`、安装版诊断 smoke 与 `git diff --check` 均 exit 0。首次并行挂载同一 DMG 时 package smoke 遇到 `hdiutil` 挂载冲突、exit 1；顺序重跑后 exit 0，未改产品代码。包内 CPython 3.12.13、SQLite 3.50.4/schema35、sandboxed Renderer 和 owned Host 退出已实际验证。未运行新在线模型；前包完整 Codex 链依旧按原 SHA 追踪。完整 Desktop/发行门禁、P4-04 非空插件配置消费、安全跨 Host 租约对账、T116～T120 适用项、Claude、Windows/Intel、签名/公证及正式更新仍未完成；P7/P8 新增开发继续后置。

2026-09-27 从同一 DMG 另装常驻 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Settings First 20260927.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Settings First 20260927/Open Forge Desktop QA.command` 以独立 `isolated-app-data` 打开，不覆盖此前安装。启动后 Main PID 73681、包内 Host PID 73685，SQLite `quick_check=ok`/35 migration/0 Project/Task/Run；同目录 `sample-project` 是无 remote、Git clean 的可丢弃项目，`node --test test.js` 1 passed，用户仍需手动选择并信任。PID 只代表当时实测，不作为持续在线保证。

同一安装版补跑 T115 当前 macOS arm64 子项：隔离 `CODEX_HOME/auth.json` 写入纯测试标记，并在 QA 日志中放入另一测试 token/项目路径。正式 Settings 的预览、原生保存的 JSON 逐字节一致，均不包含认证文件名、两种测试 token 或隔离路径；[安装版截图](../output/playwright/desktop-settings-first-diagnostics-auth-20260927-1440x900.png)与 `output/qa/desktop-diagnostics-ywFVje/` 留证。`node --check`、定向 ESLint、`git diff --check` 通过。测试未读取真实 Codex 登录，也未调用模型；T115 的当前 Mac 内部包范围通过，不代表 Windows/Intel 或完整发布 Gate。

## Desktop 长 Task 抽屉安装版离线验收 · 2026-09-26

复用当前源码对应的 `desktop-accessibility-20260926` 内部 DMG 和独立安装/数据目录，扩展 `scripts/smoke-packaged-project-remove.mjs` 的可访问性分支：在真实 UI 选择并信任两个独立 Git 项目，在第一个项目创建含 120 个中文字符的手工 Task Draft，单独请求并人工批准；固定 Host `run.list` 返回空，Task 仅进入 TODO。看板 Task 卡片保留完整 `title`，回车打开正式任务抽屉。1280×900 下逐项检查 100%/125%/150% CSS zoom 的页面和抽屉宽度、关闭按钮可达性、Shift+Tab/Tab 在抽屉内回绕、背景 inert、Esc 关闭并将焦点还给原卡片。重启安装版后 Task 仍可从看板读取；两个源 Git 的 HEAD、status 和文件保持不变，移除 Project 只删除 Forge 元数据。[实际安装版任务抽屉](../output/playwright/desktop-a11y-drawer-20260926-long-task-drawer-1280x900.png)已目视检查，保留隔离 QA 记录 `output/qa/desktop-project-remove-5iOxIh/`。没有调用模型或启动 Run。

首次 QA 在抽屉入场动画未完成时测到关闭按钮暂时超出 1280px 5 像素；这不是静止布局溢出。脚本等待真实动画结束后重跑同一 DMG 全链 exit 0，并显式断言零 Run。此证据补充 T106/T109 的当前 macOS 安装版任务抽屉子项；不是 Windows 系统 DPI、完整 WCAG 或 T110 运行态动效验收。产品代码与 DMG 未改变，新增 QA 脚本后 `node --check` 和 `git diff --check` 通过。Desktop/P6 发布门禁、Claude、Windows/Intel、签名公证与旧 Run 安全解除隔离继续未完成；P7/P8 后置。

## Desktop 文本对比度与安装版键盘验收 · 2026-09-26

依据权威 T106/T107/T109/T110 的当前桌面可测子项，核查正式 `@forge/ui` 的 light/dark token。原浅色 `color-eyebrow` 对 `surface-reading` 约 3.02:1、`color-placeholder` 约 2.66:1，且次要文字/成功/警告/错误色在更深的实色控件面上部分低于 4.5:1。仅调整生产 light `values.json` 的语义文字色，不改 glass 材质、布局或设计参考；生成 `tokens.css`，新增针对阅读面与控件面的 4.5:1 测试，dark token 对应检查仍通过。透明叠层、全部状态和所有屏幕的完整 WCAG 审计尚未声称通过。

最新源码对齐内部包：[desktop-accessibility-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-accessibility-20260926.dmg)，0.0.1、329689293 bytes、SHA-256 `c34dea0ceb7ab611f3a97015424fcea97e27e69bf7058605c204896468369eda`，**INTERNAL / ADHOC / UNNOTARIZED**。包内 Python 3.12.13/SQLite 3.50.4/schema35 与 Renderer 沙箱在安装版 smoke 通过。实际安装版[深色＋减少透明度／动效设置](../output/playwright/desktop-accessibility-20260926-dark-reduced-1440x900.png)已经目视核对；重载后两个开关生效，计算样式为实色 `#1e2d44` 与零动效，系统 `prefers-reduced-motion: reduce` 在应用开关关闭时同样给零动效。项目选择/信任/切换/移除测试使用含 101 个连续字母的长中文路径，在 1280px 无页面溢出、按钮可操作、完整路径在 `title` 中可访问；真实移除 Dialog 的 Shift+Tab/Tab 焦点环、Esc 关闭并回到触发按钮、底层 inert 均通过。[安装版长项目截图](../output/playwright/desktop-accessibility-20260926-long-project-1280x900.png)。这些是 T106/T109 的**项目对话框子项**；其他 Drawer/Dialog 和 Windows 150% DPI 的 T108 仍待验。首次安装版动效测试仅因浏览器把零时间计算值规范化为 `0s` 而期待 `0ms` 失败；测试断言接受等价的零时间后，同一 DMG 复跑通过，生产代码未为此放宽。

`pnpm --filter @forge/ui test` 5/5、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build，Web 148 tests）、`pnpm package:mac:internal --artifact-suffix=desktop-accessibility-20260926`、指定 DMG 的 `pnpm smoke:package:mac`、安装版长路径/键盘 smoke 和 `git diff --check` 均 exit 0。Python 代码自上一包未再变，上一包 `pnpm py:check` 的 230 pytest/Ruff/mypy 证据继续适用；新 DMG 另以 SQLite 只读模式对旧真实 Codex 崩溃 QA 再次打开[隔离工作区预览](../output/playwright/desktop-accessibility-quarantined-preview-20260926-1440x900.png)，Run interrupted/租约 quarantined/源 Git 前后不变；本次未重复在线模型调用。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Accessibility 20260926.app`，双击 `/Users/iamzjt/Documents/Forge Desktop QA Accessibility 20260926/Open Forge Desktop QA.command` 可用独立空数据常驻打开；实际 Main/包内 Host PID 48486/48500、SQLite `quick_check=ok`、schema35、0 Project，同目录 sample Git clean 且未预先信任。旧 app/数据保留。完整 Desktop/P6 Gate、Claude、Windows/Intel、签名/公证及正式更新仍未通过；P7/P8 新开发继续后置。

## Desktop 中断 Run 隔离工作区只读预览 · 2026-09-26

沿 P3-09/ADR 0044 的恢复边界，Python Host 新增固定 `run.recoveryPreview` 命令：只接受 `projectId`、`runId`，要求 Run 为 `interrupted`、租约为 `quarantined`，并核对最新 Attempt 的工作区/租约 epoch、历史 ownership 记录、受管目录、Git common dir/branch/worktree 注册。验证后仅捕获**当前**隔离 worktree 中有限、脱敏的 Git Diff；`GIT_OPTIONAL_LOCKS=0` 避免查询时改写索引。它不是冻结 CodeSnapshot，也不能证明旧进程已退出。正式任务抽屉提供「查看隔离工作区当前变更」入口，显示真实文件、Diff、读取时间与不自动释放提示；记录缺失或身份不符时返回 `RUN_RECOVERY_EVIDENCE_INVALID`，不凭 DB 副本臆造工作区。没有新增继续、清理、放行或对历史 PID 发信号的命令。Run、租约、审计、用户源码均保持原状。

当时源码对齐内部包：[desktop-quarantined-preview-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-quarantined-preview-20260926.dmg)，版本 0.0.1、328176291 bytes、SHA-256 `a6b0679109ea8a8522584f5db7e7d78feef9c1407ef24f4c315a5e45148e30a6`，**INTERNAL / ADHOC / UNNOTARIZED**。从 DMG 安装的应用对真实旧 Codex 崩溃 QA 数据以 SQLite 只读模式打开，预览得到 `hold.started` 的现存变更；[实际 1440×900 截图](../output/playwright/desktop-quarantined-preview-20260926-1440x900.png)已目视核对。前后 DB `quick_check=ok`、唯一 Run `interrupted`、租约 `quarantined`，源 Git status 一致。第二次以**仅有该库的 online backup、无对应 worktree**启动同一包，Host 正确拒绝预览 `RUN_RECOVERY_EVIDENCE_INVALID`，任务仍不可 Start。没有再次调用模型；旧崩溃在线证据仍属其原包。

验证：`pnpm py:check`（230 pytest、Ruff、严格 mypy）/`pnpm lint`/`pnpm typecheck`/`pnpm test`（含 build）/`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）/`pnpm validate:task-map`（9 Phase、92 Task、120 Case、84 deferred）/`pnpm smoke:desktop`/`git diff --check` 均 exit 0。新包 `pnpm package:mac:internal --artifact-suffix=desktop-quarantined-preview-20260926`、指定 DMG 的 `pnpm smoke:package:mac`、隔离旧 QA 原库只读预览及无 worktree 副本拒绝测试均 exit 0。当前桌面未完成安全跨 Host 解除隔离、P4-04 非空配置真实消费、T116～T120 适用项和最终安装版全链；Claude、Windows/Intel、签名公证/正式更新另列未验。P7/P8 新开发后置，不提交/推送/发布。

另从该新构建单独安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Quarantined Preview 20260926.app`，`/Users/iamzjt/Documents/Forge Desktop QA Quarantined Preview 20260926/Open Forge Desktop QA.command` 以新建独立空数据常驻打开。实际 Main/包内 Python Host PID 28917/28935；该库 `quick_check=ok`、schema35、0 Project，同目录无 remote 的 `sample-project` Git clean、`node --test test.js` 1 passed。项目没有被预先信任，旧真实崩溃 Run 仅在上述独立 QA 目录中展示；没有覆盖先前常驻 App 或日常数据库。

## Desktop 崩溃 Run 的新任务门禁与安装版读回 · 2026-09-26

沿既有 P3-09/ADR 0044 的保守恢复策略核对了一个真实桌面缺口：Host 把先前活跃 Run 恢复为 `interrupted`、把租约记为 `quarantined` 后，`run.capabilities` 仍可能报告 Executor 可启动，让用户在 TODO 上点击 Start 才遭遇笼统 `RUN_CONFLICT`。Python Host 现在查询本 Project 未对账的 Run/租约，在能力结果中返回 `available=false` 与 `RUN_RECOVERY_REQUIRED`；真正 `run.start` 也在冻结配置或创建新工作区前拒绝。Vue 任务抽屉解释旧 Run 非成功、工作区隔离且不会自动重跑/清理；TODO 的启动入口显示准确阻断原因。旧 Attempt、Diff、审计和用户 Git 仓库不变；没有新增对历史 PID 的信号、自动解除隔离或网络能力。自动清理 Codex 子命令组仍缺少跨 Host 的可验证进程身份，**不能将此门禁写成已完成崩溃恢复**。

最新源码对齐内部包：[desktop-interrupted-recovery-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-interrupted-recovery-20260926.dmg)，0.0.1、328571185 bytes、SHA-256 `2f6c8ad31dca53936759659a72679d9f9e713d066292b9d53894032091786e34`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm package:mac:internal --artifact-suffix=desktop-interrupted-recovery-20260926` 与指定 DMG 的 `pnpm smoke:package:mac` exit 0，后者从只读镜像复制并启动，核对包内 CPython 3.12.13/SQLite 3.50.4/schema35、Renderer sandbox 和 Host 归属退出；项目/Workflow/Agents/Plugins/Knowledge 在 1280/1440/1600 宽度无水平溢出。新脚本 `scripts/smoke-packaged-interrupted-run-readback.mjs` 从**前一包真 Codex 崩溃**的独立 QA SQLite 做 online backup，运行此新安装包的隔离副本，读到 Run `5b9c187b-8286-4221-93ac-9a9132b1a12e` 为 `interrupted`、租约 `quarantined`，Host 返回 `RUN_RECOVERY_REQUIRED`，任务抽屉[实图](../output/playwright/desktop-interrupted-recovery-20260926-1440x900.png)已目视核对；该任务实际投影为 active，故无 Start 按钮。副本 Run/租约、原 QA Git status 均未变。脚本首次以只读 Host 启动时 Executor 故意不装配而返回 `MODEL_UNAVAILABLE`；改为**可写的全新隔离 SQLite 副本**后，第一次 UI 断言误等仅 TODO 才显示的文案；对照真实页面改为断言中断提示/无 Start，最终 exit 0。没有再消耗在线模型额度，也不把旧包在线崩溃写成此包新调用。

`python/.venv/bin/python -m pytest -q python/tests/test_recovery.py` 7 passed；RunInspector 18 组件测试通过；`pnpm py:check` 230 pytest/Ruff/mypy 70 源文件、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm smoke:desktop`、`pnpm smoke:package:mac`、`git diff --check` 均 exit 0。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Interrupted Recovery 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Interrupted Recovery 20260926/Open Forge Desktop QA.command` 使用独立空数据常驻。实际 Main/Host PID 96201/96212，SQLite `quick_check=ok`/schema35/0 Project/Task/Run，同目录干净无 remote `sample-project` 的 `node --test` 1 passed，项目未自动信任。旧安装和用户数据库未覆盖。下一桌面缺口是**安全、用户可操作的中断对账**：现有 app-server 与 Codex 子命令可能属于不同进程组，不能仅凭旧 PID 或 app-server 退出就自动释放租约；继续核查可证明的归属与工作区安全前，不开放重试。P4-04 内置空 Schema、T116～T120 剩余适用项及外部 Claude/平台/签名条件仍独立未验；P7/P8 新开发保持后置，Desktop/P6 Gate 未完成，不提交/推送/发布。

## Desktop 显式 Host 重启与新源码对齐安装包 · 2026-09-26

真实活跃 Codex Host 崩溃试验表明：Desktop 能显示 crashed，重开应用能将旧 Run 对账为 `interrupted`，但普通用户只能退出重开。现于原有 **Main 仅管 owned Python Host 生命周期** 边界内加入固定零参数 `restartPythonHost`：Preload 不转发任意参数，Main 验证当前 WebContents/Frame、原 Host 已确认退出且状态为 crashed，并通过原生确认说明旧未完成 Run 会中断/工作区隔离、不会自动续跑。用户取消保留 crashed；同意才由同一 Controller 启动新 Host。Vue 诊断弹层提供正常用户可找到的按钮和真实失败反馈，Web 无本地 Host 时没有该能力。Python Host/SQLite schema、业务调度、远程监听及旧 Run 内容均未改。修改范围：`packages/{contracts,client}`、`apps/desktop` Main/Preload、安全测试、`apps/web` AppShell/App 和 Desktop/包 QA smoke；ADR 0029 追加生命周期边界。

**当前源码对齐内部包**：[desktop-host-restart-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-host-restart-20260926.dmg)，0.0.1，331964399 bytes，SHA-256 `3bd3dcac99b1447857d179108aa03d47c4ee0bb59101498129a7487244f971c6`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm package:mac:internal --artifact-suffix=desktop-host-restart-20260926` exit 0；`pnpm smoke:package:mac` 从只读 DMG 复制启动实测包内 CPython 3.12.13、SQLite 3.50.4/schema35、沙箱 Renderer、干净 PATH 下不冒充 Codex 可用，并验证新诊断：[安装版崩溃/按钮](../output/playwright/desktop-host-restart-20260926-host-crashed-1440x900.png)、[显式重启后真实新 Host](../output/playwright/desktop-host-restart-20260926-host-restarted-1440x900.png)及项目/Workflow/Agents/Plugins/Knowledge 页面截图已目视核对；同一包复跑 1280/1440/1600×900 的这些页面水平溢出检查均通过。另从该 DMG 装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Host Restart 20260926.app`，双击 `/Users/iamzjt/Documents/Forge Desktop QA Host Restart 20260926/Open Forge Desktop QA.command` 使用独立空白数据库常驻；Main/Host PID 65290/65295、`quick_check=ok`、0 Project/Run，同目录 `sample-project` 干净无 remote、`node --test` 1 passed，未预置信任或 Agent 记录。旧演示安装与用户数据未覆盖。

`pnpm typecheck`、`pnpm lint`、`pnpm test`（含 build）、`pnpm smoke:desktop` 和包 smoke 通过；Desktop smoke 实测取消原生重启确认仍 crashed，再确认重启获新 Host ID/PID。第二轮 smoke 曾因**测试本身**把传给固定零参 Preload 的多余实参错误当成 Main 参数校验而触发了原生确认；只对该开发态测试 Electron PID 62608 退出，断言移到 Preload 安全测试后重跑 `pnpm smoke:desktop` exit 0。新包没有再调用在线模型；上面两条真实取消/崩溃 Run 属于前一 DMG，不能将在线验收转记到本 SHA。完整 Desktop、T116～T120、P6 发布门禁、Claude、Windows/Intel、签名/公证与正式更新仍不宣称通过；P7/P8 手机远程后置。

## Desktop 安装版真实 Codex Host 崩溃对账 · 2026-09-26

沿用**同一** `desktop-plugin-inspection-final-20260926` DMG，在新的一次性 Git/SQLite 安装副本启动真实 Codex `gpt-6-luna` Run `5b9c187b-8286-4221-93ac-9a9132b1a12e`，确认隔离 worktree 的 `node hold.js` 已写 `hold.started`，只对该安装版拥有的 Python Host PID `43246` 发出 `SIGKILL`。Desktop 顶部真实显示 [Host crashed](../output/playwright/desktop-live-host-crashed-20260926-1440x900.png)，截图已目视核对。随后重开同一隔离数据集，Run 由恢复对账写为 `interrupted`、租约 `quarantined`；SQLite `quick_check=ok`、源 Git HEAD/status 未变、无 `hold.finished`。只读 `python/scripts/evaluate_qa_runs.py` 报 1 `interrupted`/0 accepted/exit 0；上节另一个同包取消库报 1 `cancelled`/0 accepted/exit 0。对应 QA 目录 `output/qa/desktop-live-host-crash-HuiRdh/` 和 `output/qa/desktop-active-restore-LfJoVR/` 均保留、与日常数据隔离。原崩溃 Host、该 Run 的 Codex 进程和 QA Main 最终均已退出，其余常驻 Forge App 未触碰。

这次实测的**第一版 QA 脚本**在 Host 崩溃后碰到 Desktop 的真实“Host 状态无法确认，是否退出”原生确认框，`app.close()` 等待；确认测试 Codex 进程已退出后，仅对该 QA 安装副本 Main PID `43230` 执行限定 PID 终止，脚本继续重开并最终 exit 0。`scripts/smoke-packaged-live-host-crash.mjs` 已补上原生确认的受控应答，`node --check`/定向 ESLint 通过；为避免重复在线用量，**修正后的全脚本未重新跑一轮**，不宣称无人值守回归已通过。当前 Mac arm64 包的取消与 Host 崩溃两条真实结果可观察且不计成功；T120 的完整自动化/发布评测与其他平台继续按递延记录追踪。未打开公网、未用 Claude、未修改用户项目。

## Desktop 安装版活跃 Run 拒绝恢复备份 · 2026-09-26

在与当前源码对齐的 `desktop-plugin-inspection-final-20260926` 内部 DMG（SHA-256 `30436883685b9cda93e51f88d2a96d0f7aa1701d53fd134590afcf3119292555`）上，`scripts/smoke-packaged-active-restore-refusal.mjs` 从只读镜像复制安装包，以**独立 SQLite 数据目录和含空格/中文的可丢弃 Git 项目**，在正式 Desktop 中选择并信任项目，保存消息、修订人工草稿、人工批准到 TODO，才明确启动真实 Codex `gpt-6-luna` Run。Run `6c35e221-e516-48fb-bd05-169e05c28e1f` 在隔离 worktree 执行 `node hold.js` 并产生 `hold.started` 后，安装版设置页尝试恢复启动前的 SQLite online backup。实际 UI 显示“仍有工作或请求未结束；请等待完成或安全停止后再恢复。”，同一 Host PID `40732` 未切换，数据 profile 未切换，备份 SHA 不变，Run 在拒绝时仍为 `running`。随后通过固定 Run 通道取消，数据库最终状态 `cancelled`，3 秒观察期内无 `hold.finished`，源项目 HEAD/status 不变；SQLite `quick_check=ok`，测试 Host 已随安装版退出。实图：[活跃运行恢复拒绝](../output/playwright/desktop-active-restore-refused-20260926-1440x900.png)；隔离证据目录 `output/qa/desktop-active-restore-LfJoVR/`，未触碰日常数据或常驻演示 App。

命令 `FORGE_ACTIVE_RESTORE_DMG=<上方实际 DMG> node scripts/smoke-packaged-active-restore-refusal.mjs` exit 0（26.9 秒）；`node --check` 与定向 ESLint 通过。此证据仅关闭**当前 Mac arm64 内部包的活跃 Run 恢复拒绝与取消后不继续写入**这一子项：没有验证真实 Host 崩溃后的完整 T120 评测，也没有验证签名更新、Windows/Intel、Claude 第二执行器或正式发行。使用既有合法 Codex 登录与已授权额度，未调用 Claude、未开放网络服务。P7/P8 手机远程新增工作继续后置。

## Desktop 插件声明可见性与知识页布局 · 2026-09-26

按桌面第 7、9 页缺口增量修复。Python `PluginRegistry.inspect_builtin_config()` 在包内 Manifest、权限、平台、Schema 和内容锁真实校验后，返回受限的贡献点、依赖服务、请求/已授权限、适用平台、内容摘要、Run 引用与 draining 状态；失效包不输出可信声明。`@forge/contracts` 使用闭合 Schema 拒绝未知权限/字段，既有固定 Preload/Main/stdio 通道没有新增任意 IPC。Plugins 正式页面将声明与 Codex CLI 的**实际可启动状态**分开展示，未声明的 Context/Verifier/Tool 不显示成可用；页面仍诚实说明内置 Codex configSchema 为空、没有凭据或模型插件配置保存。Knowledge 的 Grid 空态改为顶部连续排列，修复标题/说明被拉散。修改了 `python/src/forge/plugins.py`、`packages/contracts/src/plugin-config.ts`、`apps/web/src/components/{PluginsView,KnowledgeView}.vue` 及对应 Python/TS/Vue 测试；`scripts/smoke-package-macos.mjs` 增加安装版声明、页面、水平溢出、知识标题聚合和插件底部按钮滚动可达性断言。

**当前源码对齐内部包**：[desktop-plugin-inspection-final-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-inspection-final-20260926.dmg)，0.0.1，326540256 bytes，SHA-256 `30436883685b9cda93e51f88d2a96d0f7aa1701d53fd134590afcf3119292555`，**INTERNAL / ADHOC / UNNOTARIZED**。从只读 DMG 复制的包内 Host 报 CPython 3.12.13、SQLite 3.50.4/schema35；实际声明有 `executor.codex` 和 `model.codex`，Tools/Verifier/Context 均为空，内容摘要 64 位；干净 PATH 下执行器如实显示不可启动。安装版[插件上部](../output/playwright/desktop-plugin-inspection-final-20260926-plugins-1440x900.png)、[滚动后权限/控件](../output/playwright/desktop-plugin-inspection-final-20260926-plugins-controls-1440x900.png)、[知识空态](../output/playwright/desktop-plugin-inspection-final-20260926-knowledge-1440x900.png)已目视核对。另装并常驻 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Plugin Inspection 20260926.app`，从 `/Users/iamzjt/Documents/Forge Desktop QA Plugin Inspection 20260926/Open Forge Desktop QA.command` 使用独立数据；Main/包内 Host PID 38165/38176，数据库 `quick_check=ok`、schema35、0 Project/Run。同目录 `sample-project` 的 `node --test` 1 passed，Git clean、无 remote，未预先信任。前一空白/只读历史 App 与数据仍保留，未覆盖用户日常数据库。

验证：定向 Python 22 passed、Contracts 43 passed、Web 147 passed；`pnpm py:check` 230 pytest/Ruff/mypy 70 源文件、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`git diff --check`、新 DMG 的 `pnpm smoke:package:mac` 均 exit 0。第一次 lint 因新增安装版脚本使用 `document` 未声明而失败，改为 `globalThis.document` 后复跑通过。初版知识页安装截图仍显默认标题外边距，收紧并重新构建最终 DMG 后复拍通过。本包没有新的在线模型调用，也没有将参考原型当生产代码。下一桌面缺口继续核查 P4-04 非空插件配置的真实消费边界、活跃 Codex Run 的应用内 Restore 拒绝和 T116～T120 的适用评测；P4-04 原配置 Schema 为空，不能虚构字段或凭据。完整 Desktop/P6 Gate、Claude、Windows/Intel、Developer ID/公证与签名更新仍未通过；P7/P8 手机远程新开发后置。不自动提交/推送/发布。

## Desktop 历史副本只读保护与源码对齐内部包 · 2026-09-26

在追加安装版写入负测中发现：先前历史查看器虽然在 Launcher 中设置了 `FORGE_PYTHON_DB_READ_ONLY=1`，Electron Main 的 Host 环境白名单却没有转发，故旧历史进程只是**数据隔离副本，并非 SQLite 只读**。负测只对 `output/qa/desktop-integrity-gate-knowledge-readback-20260926/` 的一次性副本调用 `project.remove`，该副本当时被归档；原在线 QA 库、用户数据和 Documents 历史副本未改。旧历史 Main/Host PID 78080/78086 已在确认唯一 Run 为 `succeeded` 后按 PID 温和退出，不留旧 Host。此失败没有被记作通过。

修复：`apps/desktop/src/main/host-environment.ts` 仅在显式内部隔离数据启动时，将**精确值 `1`** 的只读开关交给已拥有的 Python Host；任意 `FORGE_*`、凭据等仍不转发。新增 Host 环境白名单单测与 `scripts/smoke-packaged-read-only-history.mjs`：后者先对真实 QA 库做 SQLite online backup，再从新 DMG 安装 App，读取真实历史任务，并通过固定 Preload→Main→Python Host 发送 `project.remove`；实测 `DATABASE_IO_ERROR`、Project 不变、`PRAGMA quick_check=ok`，exit 0。[当前包历史任务实图](../output/playwright/desktop-read-only-history-20260926-1440x900.png)已目视核对。第一次新 smoke 的写入断言与 DB 检查已通过，但截图脚本忘记打开任务抽屉而超时；加上点击后复跑全程 exit 0，生产代码未再改。

**当前源码对齐内部 DMG**：[desktop-history-readonly-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-history-readonly-20260926.dmg)，0.0.1，332213155 bytes，SHA-256 `a3d9125b45c4bcfd193294cc210614bfe35457a83c917cbc08561366658cebfd`，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm build`、定向 `node --test apps/desktop/tests/security.test.mjs`、`pnpm package:mac:internal --artifact-suffix=desktop-history-readonly-20260926`、安装版只读负测、`pnpm smoke:package:mac`、`pnpm py:check`（230 pytest/Ruff/mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm smoke:desktop`、`pnpm validate:contracts`（47 文件，0 error/4 既有 warning）、`pnpm validate:task-map`（9/92/120/84）、`git diff --check` 均 exit 0；安装 smoke 实测包内 CPython 3.12.13/SQLite 3.50.4/schema35、Renderer 安全与 owned Host 退出。第一次 lint 报新 QA 脚本未使用的 `resolve` import，已删除并复跑通过。当前变更没有 Python Schema、依赖或网络变化；新包没有再次调用模型，前一 `desktop-integrity-gate-20260926` DMG 的在线正向链继续按其原 SHA 追踪。

用户两个常驻入口均已指向**该新包的两个独立安装副本**：空白可写入口 `/Users/iamzjt/Documents/Forge Desktop QA Integrity Gate 20260926/Open Forge Desktop QA.command`，Main/Host PID 82032/82045、0 Project/Task/Run；真实历史 SQLite 只读入口 `/Users/iamzjt/Documents/Forge Desktop Historical Evidence Integrity Gate 20260926/Open Forge Historical Evidence.command`，Main/Host PID 81761/81772、1 Project/Task/Run/Delivery。两库 `quick_check=ok`，历史唯一 Run 为 `succeeded`，用户正式库未触碰。新入口普通打开后常驻，QA smoke 才自动退出。历史 UI 仍可能显示写控件，但 Host/SQLite 会拒绝；需要新任务应使用空白入口。完整 Desktop、P6 发布 Gate、Claude、Windows/Intel、签名公证和正式更新仍待验，P7/P8 手机远程仍后置。

## Desktop 当前包知识来源读回与评测防误计 · 2026-09-26

此前历史证据入口曾用同一旧 `.app` 和独立 SQLite online backup 数据常驻打开，Main/Host PID 78080/78086、Board Done、1 Project/Task/Run/Delivery，`quick_check=ok`；**当时并没有实现真正的 SQLite 只读转发**。上节记录了发现、修复、重装和新 PID。历史来源不冒充当前在线 Agent。

对 `desktop-priority-20260926-run2` 留存的真实 Codex 运行库执行 SQLite online backup，原库和用户数据未改。当前 `desktop-integrity-gate-20260926` 同一 SHA 的安装版在独立副本上通过 `scripts/smoke-packaged-desktop-restart.mjs`：Run `35a7d24d-bedd-4edc-a34b-5251fba8ccf2` 的冻结 ContextBundle 由包内 Host 返回真实 `retrieved_knowledge` 与 `validated_memory`，两项撤销后的来源均标为 `revoked`；已发布 `workflow.fixture.quick@1`、冻结 Reviewer 模型 `gpt-6-sol`、Verify stdout、Owner 交付与重启后 Done 也读回。[当前包 Run 来源实图](../output/playwright/integrity-gate-knowledge-20260926-context-sources-1440x900.png)已目视核对；QA 数据在 `output/qa/desktop-integrity-gate-knowledge-readback-20260926/`。旧 Run 使用较早的无命令预设锁 Schema，测试明确传入 `FORGE_PACKAGE_RESTART_LEGACY_PRESET=1`；首次未传时按预期拒绝。**这次是现有真实 Run 的当前包只读读回，没有再次调用模型，也不能证明当前包新 Run 重新检索来源**；前一同包在线新 Run 的纯开发链见下节。

只读 QA 汇总命令 `python/scripts/evaluate_qa_runs.py` 原先只核对 Run→快照→交付→人工接受记录的结构关联，可能把接受后证据发生变化的交付仍计为 `accepted_delivery`。现对每个候选交付再以只读 `ForgePersistence` 和 Host 现有 `FinalAcceptanceService.get()` 复核当前 basis、快照和决定 ID；无法复核或依据失效时 exit 1，不打印成功报告。当前包真实交付库仍返回 1 accepted；仅在一次性备份中追加验收决定的污染库返回 `EVALUATION_DELIVERY_STALE`/exit 1，原库保持 1 条决定。`pnpm py:check`（230 pytest/Ruff/mypy）、脚本 strict mypy、正负 CLI、`pnpm lint`、`pnpm typecheck`、`pnpm validate:contracts`（47/0 error/4 既有 warning）、`pnpm validate:task-map`（9/92/120/84）、`git diff --check` 均通过。此项是 QA 工具纠错，不修改安装版产品逻辑、SQLite schema 或 T120 的 `DEFERRED_VERIFICATION`；活跃 Codex Host 崩溃及完整评测仍待验。

## Desktop 最终接受依据变更阻断与最新安装包 · 2026-09-26

当前源码对齐内部 DMG：[desktop-integrity-gate-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-integrity-gate-20260926.dmg)，0.0.1，329664459 bytes，SHA-256 `7ce3bd3ddd0966cfc0b087b3dd378621f07cfea2928bed5f9bcbdbf1945967f6`，**INTERNAL / ADHOC / UNNOTARIZED**。从只读 DMG 安装/包 smoke 通过；另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Integrity Gate 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Integrity Gate 20260926/Open Forge Desktop QA.command` 使用独立空数据常驻打开（Main PID 40845、包内 Python Host PID 40856）。独立库 `quick_check=ok`、schema35、0 Project/Task/Run；同目录干净无 remote 的 `sample-project` 执行 `node test.js` 通过。旧 App/数据不变。

Owner 接受同一修订后，Python Host 拒绝新的 Development 配置冻结与 Run 意图；Run 意图在工作区准备后的写事务内复查，避免并发接受竞态。既有最终接受依据若被外部改动，Board 投影为 `blocked` 且给出完整性原因，Desktop 抽屉显示明确警告并禁用新 Run/Review/Verify/AC/豁免入口，历史证据保持可读。旧 Schema 的测试/迁移路径保持兼容。见 [ADR 0047](decisions/0047-p3-delivery-acceptance-scope.md)。

`scripts/smoke-packaged-reviewer-model-readback.mjs` 对保留的真实交付 Run `7c8b818b-805d-4532-bf9d-b66927027ff5` 使用**一次性 SQLite online backup**，在已安装包内读回，再只在该副本注入一条异常逐项决定。包内 Host 拒绝 Review `REVIEW_RESULT_STALE`、Verify `VERIFY_SOURCE_STALE`、AC 与建议豁免 `ACCEPTANCE_SOURCE_STALE`；异常后最终接受为 `unavailable`/`ACCEPTANCE_BASIS_CHANGED`，新接受拒绝 `ACCEPTANCE_SOURCE_STALE`，新 `run.start` 拒绝 `RUN_CONFLICT`，Run 列表不变、无新模型调用。实际安装版 [历史读回](../output/playwright/desktop-integrity-gate-20260926-historical-readback-1440x900.png)、[只读 AC](../output/playwright/desktop-integrity-gate-20260926-historical-readback-1440x900-acceptance.png)、[阻断](../output/playwright/desktop-integrity-gate-20260926-historical-readback-1440x900-tampered.png)、[空工作台](../output/playwright/desktop-integrity-gate-20260926-packaged-home-1440x900.png)已生成；阻断图已目视核对。

同一 SHA 的独立安装版在线补验：`scripts/smoke-python-vertical-live.mjs` 在隔离 QA Git 仓库和数据目录中经真实 UI 选择 200,000 Token 观测档并明确 Start，Codex Run `1385645e-5e0d-4d27-b9f8-fc14e67d12de` 成功修改 `arithmetic.js`、`arithmetic.test.js`，隔离工作区 `node arithmetic.test.js` exit 0，源仓库始终 clean；Run 最终观测用量为 155638 input / 1229 output（其中缓存输入不代表实际收费，Provider 未提供真实费用）。验收脚本在随后核对 Diff 时因 fixture 改名后遗留的两条旧正则退出；生产 Run 与快照已成功，不重跑 Developer。`scripts/smoke-packaged-workflow-v2-closeout.mjs` 复用该 Run 和相同 DMG 的独立安装，真实只读 Review `fd6c7861-3956-4346-8114-8a7f48715d2f` approved、冻结命令 Verify 报告 `6d8d64ab-40d3-4f4c-ad85-0147602a4eef` passed/exit 0、AC `9f4814b8-89e0-4d0e-9f3a-f8bbe264b38f` verified，Owner 接受 `a71a53a0-d7b0-40d4-918e-3d8fb474026b` 生成交付 `50859df4-3488-446f-aa4c-c8357833ad32`。安装版重启后 Board 投影 Done、交付仍可读，`python/scripts/evaluate_qa_runs.py` 在保留 QA DB 上返回 1 accepted_delivery/0 cancelled；源 Git HEAD/status 未变。QA 路径为 `output/qa/desktop-integrity-gate-isolated-names-20260926/`，[开发快照](../output/playwright/integrity-gate-isolated-names-delivery-1440x900.png)、[人工接受前](../output/playwright/integrity-gate-online-closeout-owner-ready-1440x900.png)、[接受后](../output/playwright/integrity-gate-online-closeout-owner-accepted-1440x900.png)是安装版实图，最后一张已目视核对。首次 100,000 档 Run `2c2f3fdb-e7c3-4114-a70d-05b7afa04f88` 因真实 Token 观测上限失败；第二次旧 fixture 含 `hold.js`，Codex 等待该长命令直至运行取消；均保留隔离证据，未记作成功。测试脚本现将成功 fixture 改为 `arithmetic.*`、取消 fixture 改为 `forge-cancel-probe.js`，并修复 Diff 正则；此变更只影响 QA fixture，不改变 DMG 代码。

验证：`pnpm py:check`（230 pytest、Ruff、mypy 70 文件）、`pnpm test`（33 Web files/147 Vue tests 与其他 TS 测试/构建）、`pnpm typecheck`、`pnpm lint`、`pnpm validate:contracts`（47 文件，0 error/4 既有 warning）、`pnpm validate:task-map`（9 phases/92 tasks/120 cases/84 deferred）、`pnpm smoke:desktop`、指定 DMG 的 `pnpm smoke:package:mac`、安装版 readback、`git diff --check` 均 exit 0。历史读回本身没有模型调用；上方同一 SHA 的独立 QA 安装另有 fresh 在线 Developer→Owner 正向链。完整 Desktop/P6 Gate 仍未通过：P4-04 通用插件配置缺真实消费方（内置 Codex 配置 Schema 为零字段）、T116～T120 适用评测、活跃 Codex Run 恢复拒绝以及正式签名更新等另行追踪；Claude、Windows/Intel、Developer ID/公证需外部条件。P7/P8 手机远程新增开发后置，不提交/推送/发布。

## Desktop 已接受交付证据写入门禁与前一安装包 · 2026-09-26

在已有的最终接受后 Review/Verify 启动门禁上，Python Host 现在也禁止对同一 Task 修订和 CodeSnapshot 增加逐项验收决定或 Review 建议豁免；两项检查均在写事务内查询不可变 Owner 接受记录，已有完全相同的幂等重试继续回读原结果。桌面 Task 抽屉对 Done 保留 AC/Review 历史，隐藏逐项决定与豁免输入。此前交付完整性测试原先通过公开 API 追加 AC 决定来模拟污染；现在公开 API 必须拒绝，测试改为只在可丢弃 SQLite fixture 直接插入异常记录，继续验证交付和看板不能把被改动的 basis 当作已接受。无新 Schema/权限/网络/模型调用；见 [ADR 0047](decisions/0047-p3-delivery-acceptance-scope.md)。

最新源码对齐内部包：[desktop-evidence-lock-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-evidence-lock-20260926.dmg)，0.0.1，SHA-256 `0549a6866b5412677d6bb5c41f35e2fd5bbf855604bce7b8f6aa21b47fd01a02`，327073954 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从 DMG 实际安装/启动通过，包内 CPython 3.12.13、SQLite 3.50.4/schema35、Renderer sandbox/context isolation 和 Host 退出清理通过。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Evidence Lock 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Evidence Lock 20260926/Open Forge Desktop QA.command` 以隔离空数据常驻打开；实测 Main PID 51699、包内 Host PID 51714、SQLite `quick_check=ok`/0 Project/Task/Run，同目录干净且无 remote 的 `sample-project` 执行 `node test.js` 通过。旧安装与用户数据未替换。

安装版 `scripts/smoke-packaged-reviewer-model-readback.mjs` 对前一真实已接受 Run 的 QA 数据执行 SQLite online backup，只在一次性副本打开历史 Run `7c8b818b-805d-4532-bf9d-b66927027ff5`。UI 显示 Done 的 Review 禁用和验收决定只读；通过固定 Preload→Main→Python Host 请求新 Review/Verify/AC 决定/建议豁免，分别得到 `REVIEW_RESULT_STALE`、`VERIFY_SOURCE_STALE`、`ACCEPTANCE_SOURCE_STALE`、`ACCEPTANCE_SOURCE_STALE`，Job 列表、矩阵与最终接受 basis 均不变，**没有新模型或项目命令**。[历史 Run](../output/playwright/desktop-evidence-lock-20260926-historical-readback-1440x900.png)、[只读验收矩阵](../output/playwright/desktop-evidence-lock-20260926-historical-readback-1440x900-acceptance.png)、[空数据安装版](../output/playwright/desktop-evidence-lock-20260926-packaged-home-1440x900.png)均为实图并已目视核对。Python 定向 15 和最终 7 pytest、全量 229/Ruff/mypy 70 文件、Vue 定向 6、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、47 文件契约、9 Phase/92 Task/120 Case 任务图、`pnpm smoke:desktop`、安装包 smoke、readback 与 `git diff --check` 均 exit 0。首次包 smoke 与 readback 并发挂载同一 DMG 导致前者挂载失败；改为顺序后通过。第一次 readback 假定历史 AC-02，但该真实任务只有 AC-01；按实际矩阵选择 AC-01 后通过，未更改生产业务数据。

完整 Desktop 仍未收口：P4-04 的通用插件配置提交/凭据引用使用没有真实内置消费方（当前 Codex configSchema 为零字段，停用持久化和新 Run 拒绝已实测）；T116～T120 适用评测、活跃 Codex Run 安全恢复拒绝与本最新包 fresh 在线全链仍缺。Claude、Windows/Intel、Developer ID 签名公证、正式更新需外部条件；P7/P8 新开发后置，不自动提交/推送/发布。

## Desktop 最终接受后 Review/Verify 门禁与安装版验证 · 2026-09-26

Owner 接受 Task 修订与 CodeSnapshot 后，Python Host 拒绝为同一版本启动新的 Review 或 Verify Job；已有 Job 的同一幂等请求仍回读原结果。Job 创建期间会异步准备只读副本或验证工作区，因此在写入 Job 的事务里再次检查最终接受，防止“准备期间接受”的竞态。被拒绝的临时目录释放，源 Git 不变；新的受控 Task 修订与快照仍须走自己的证据和人工批准。正式任务抽屉已禁用 Done 的 Review/Verify 启动入口，保留历史报告可读。见 [ADR 0047](decisions/0047-p3-delivery-acceptance-scope.md)。

最新源码对齐内部包为 [desktop-accepted-gate-final-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-accepted-gate-final-20260926.dmg)，0.0.1，SHA-256 `6fd470f49e1f2838bdb8b4c2ca9f26169141a0013038338b7f5e5dc216e01028`（331977326 bytes），**INTERNAL / ADHOC / UNNOTARIZED**。只读 DMG 安装与包 smoke 验证包内 CPython 3.12.13/SQLite 3.50.4/schema35、Renderer sandbox、归属 Host 生命周期和卸装后隔离数据保留。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Accepted Gate 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Accepted Gate 20260926/Open Forge Desktop QA.command` 以独立空数据常驻打开；实测 Main PID 17259/包内 Python PID 17286、SQLite `quick_check=ok`、0 Project/Task/Run，同目录干净/无 remote 的 `sample-project` 测试通过。旧 App/数据未覆盖。

安装版 `scripts/smoke-packaged-reviewer-model-readback.mjs` 对旧真实 Developer→Review/Verify→Owner 交付的 QA SQLite 做 online backup 后，仅在一次性隔离副本打开历史 Run `7c8b818b-805d-4532-bf9d-b66927027ff5`。实际 UI 显示独立 Reviewer 模型、Owner 已接受提示与禁用的 Review 按钮；通过固定 Preload 命令请求新 Review/Verify，Host 分别返回 `REVIEW_RESULT_STALE` / `VERIFY_SOURCE_STALE`，前后 Job 列表相同，**没有调用模型或执行项目命令**。[1440×900 截图](../output/playwright/desktop-accepted-gate-final-20260926-historical-readback-1440x900.png)已目视核对；[空数据安装版](../output/playwright/desktop-accepted-gate-final-20260926-packaged-home-1440x900.png)另有截图。Python 定向 7/全量 229 pytest、Ruff/mypy 70 源文件、Vue 定向 20、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、47 文件契约、9 Phase/92 Task/120 Case 任务图、`pnpm smoke:desktop`、安装包 smoke、readback、`git diff --check` 均通过。原 Run 的在线交付属于前一包与前前一包的连续真实执行；当前包未重新完成同包在线全链。无新依赖、迁移、协议、凭据或网络入口。

Desktop 全功能及 P6 正式 Gate 继续未完成；P4-04 插件配置/CredentialRef、T116～T120 可适用评测、活跃 Codex Run 恢复拒绝与当前包 fresh 在线闭环仍需验。Claude、Windows/Intel、签名公证、正式更新是另行追踪的外部条件。P7/P8 新开发后置，不自动提交/推送/发布。

## Desktop Reviewer 模型独立选择与前一安装包 · 2026-09-26

修复 P4-06/P6-09 桌面入口：选择自定义 Reviewer Profile 不再写回下一次 Developer 的模型；无冻结 Reviewer 绑定时，内置只读 Reviewer 有独立的模型选择，选择自定义 Profile 则显示其锁定模型。已发布 Workflow 冻结的 Reviewer 仍按 RunConfig 处理。组件测试在真实 Vue 挂载下分别验证内置模型和自定义 Profile 的 `run.reviewStart` 参数、Developer 模型保持不变；本次没有更改 Host 审批/权限或运行语义。

此前源码对齐内部包为 [desktop-reviewer-model-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-reviewer-model-20260926.dmg)，0.0.1，SHA-256 `3c9501d57295accf6880dc6903ff3707f4baa03dfbfb92f5f125f61827ecb9a5`（324926179 bytes），**INTERNAL / ADHOC / UNNOTARIZED**。只读 DMG 实际安装、签名结构检查、包内 CPython 3.12.13/SQLite 3.50.4/schema35、Renderer sandbox 和 owned Host 退出后数据保留 smoke exit 0。另装独立常驻 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Reviewer Model 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Reviewer Model 20260926/Open Forge Desktop QA.command` 启动；Main PID 63256、包内 Python 子进程 63269 在核对时真实运行，隔离 SQLite `quick_check=ok`/schema35/0 Project/Task/Run，同目录 clean/无 remote `sample-project` 的 `node test.js` 通过。旧安装及用户数据未替换。

安装版 `scripts/smoke-packaged-reviewer-model-readback.mjs` 从此前真实 Developer→Review/Verify/Owner 交付数据执行 SQLite online backup 到一次性隔离目录，打开历史 Run `7c8b818b-805d-4532-bf9d-b66927027ff5`，确认正式 UI 的独立 Reviewer 模型下拉、真实 Codex 可用模型列表和实际选择；[1440×900 实图](../output/playwright/desktop-reviewer-model-20260926-historical-readback-1440x900.png)已目视核对。**这里只读旧记录，没有启动模型、生成新 Review 或在当前新包重跑 Developer 全链**；前一包的真实在线交付按其原 SHA 和报告保留。`pnpm install --frozen-lockfile`、Reviewer 组件 16 测试、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm py:check`（Ruff、mypy 70 源文件、226 pytest）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、包 smoke、只读安装版 readback、`git diff --check` 均 exit 0。没有新增依赖/迁移/协议或网络入口。

桌面里程碑仍未完成：P4-04 的可持久插件配置与 CredentialRef 真正使用、T116～T120 适用评测、活跃 Codex Run 的恢复拒绝、当前新包单次完整在线链仍缺；Claude 第二执行器、Windows/Intel、签名公证和正式更新继续受外部条件约束。P7/P8 手机远程新增开发保持后置，不提交/推送/发布。

## Desktop 实际 Codex 预算与 Reviewer 版本绑定安装版补证 · 2026-09-26

前一源码对齐内部包为 [`desktop-review-revision-20260926`](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-review-revision-20260926.dmg)，0.0.1，SHA-256 `9cabc437e9337833e12550ca100d98c16d14787c784613926a21448dca917656`（331858701 bytes），**INTERNAL / ADHOC / UNNOTARIZED**。包内 CPython 3.12.13/SQLite 3.50.4/schema35、沙箱 Renderer、Host 生命周期/崩溃/存储降级经安装版 smoke exit 0。独立常驻安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Review Revision 20260926.app` 由 `/Users/iamzjt/Documents/Forge Desktop QA Review Revision 20260926/Open Forge Desktop QA.command` 打开；Main PID 26320、包内 Host 子进程真实运行，独立空 DB `quick_check=ok`、schema35、0 Project/Task/Run，同目录 clean/no-remote `sample-project` 的 `node test.js` 通过。旧安装和用户数据未覆盖。

真实失败与修复链：前一 data-switch DMG 的一次 Codex Run 在 50,000 默认观测上限下记录 64,318 input/379 output 并以 `RUN_TOKEN_BUDGET_EXCEEDED` 失败，没有 Handoff。任务详情现提供 50,000 默认及需显式选择的 100,000/200,000，公共 Schema 与 Python Host 封闭校验并冻结；不是精确费用上限。前一 `desktop-budget-choice-20260926` DMG 从正式 UI 选 200,000 明确 Start，真实 Developer Run `7c8b818b-805d-4532-bf9d-b66927027ff5` 成功，得到快照 `12bb7198-a0c1-4f7c-b689-5083c4d6f0c8`，源 Git clean；QA 脚本随后被重载仍开的抽屉遮挡导航而退出，后续已修复脚本导航并**复用原 Run**，未重复模型开发。该包第一次 Reviewer `852f2f41-3f41-4491-aaf5-b5bfedee9c4f` 因返回 `profileRevision=2`、冻结内置 Reviewer 版本 1 而正确拒绝为 `REVIEW_RESULT_STALE`，未产生报告。Host 请求现明确传送 Snapshot/Task/Contract/Reviewer 四项绑定，结果按本次冻结 Reviewer revision 验证，自定义 Profile 不再错误地与内置版本比较，错误版本仍拒绝。最终新包在同一冻结 Run 上从任务抽屉重启真实只读 Reviewer，报告 `4be2e791-1710-4378-960e-138334c7d7d3` 为 `approved`；获批 `test` Verify `cf604ce8-6e16-4d67-a082-8294d4121308` 为 `passed`/exit 0，逐项 AC 和 Owner 接受 `b382b2ef-ec08-4d19-ad9d-c95a5b113ee8` 后交付 `647492ee-d129-4040-aa60-cfbe7cca332e`；重启 Task `done`，原 Git clean。[接受前](../output/playwright/desktop-review-revision-closeout-20260926-owner-ready-1440x900.png)、[交付后](../output/playwright/desktop-review-revision-closeout-20260926-owner-accepted-1440x900.png)为新包实图。失败 ReviewJob 保留失败历史，**这是跨两个有标识内部包继续的真实 Run，不是新包重新开发的完整同包链**。

同一最终 DMG 的另一隔离安装版 UI 验证默认 50k、选择 200k、选择本身不产生 Run；[实际选择器截图](../output/playwright/desktop-review-revision-restore-20260926-explicit-run-budget-1440x900.png)已目视核对。该测试还完成正式项目选择/信任→手工草稿与独立批准 TODO→备份→独立恢复→重启保留 TODO→需重新信任→返回原集，源 Git 和原数据均保留；QA root `output/qa/desktop-profile-restore-aLnl9W`，真实任务 `9e6a1f52-7b36-4539-b79f-5e44324cda35`，备份 SHA-256 `81632a0c57c6f0e27bf1f051790e1e79ac6eb45fcde545960254271d37fc017b`。原生 dialog 由自动化控制，不冒充人工弹窗验收。

同一最终 DMG 还在上述隔离 TODO 的独立启动中把 `CODEX_HOME` 指向空目录：Host 报 `CODEX_NOT_AUTHENTICATED`、任务页[提示先登录且 Start 禁用](../output/playwright/desktop-review-revision-prerequisite-not-logged-in-1440x900.png)、[插件页显示执行不可用](../output/playwright/desktop-review-revision-prerequisite-plugin-unavailable-1440x900.png)，Run 仍为 0。`scripts/smoke-packaged-codex-prerequisite.mjs` exit 0；没有模型调用、凭据输入或外部服务替代。

执行结果：`uv --directory python run --frozen pytest tests/test_review.py tests/test_review_issues.py tests/test_rework.py -q` 10 passed；`pnpm py:check` 226 pytest/Ruff/mypy 70 源文件、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 files/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`FORGE_PACKAGE_SMOKE_DMG=<此 DMG> pnpm smoke:package:mac`、两条安装版 QA 脚本及 `git diff --check` 均 exit 0。此前错误的 `pnpm exec pytest`/`ruff` 因二者是 uv 管理的 Python 工具而未找到；改用 uv 后通过。签名/公证、Windows x64、macOS Intel、Claude、活跃 Codex Run 的 Restore 拒绝、T116～T120 全项与当前同包 fresh Developer→交付仍待验；完整 Desktop/P6 Gate 不因此改为通过。P7/P8 新开发保持后置，未自动提交/推送/发布。

## Desktop 最新安装包：数据集切换、真实 TODO 历史和焦点门禁 · 2026-09-26

当前源码对齐内部 DMG 为 [desktop-data-switch-final-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-data-switch-final-20260926.dmg)，0.0.1、331954902 bytes、SHA-256 `14b8d507a7216986bb04e6d3517700ca830fba591b72b14bac9e15cb82ac28fc`，**INTERNAL / ADHOC / UNNOTARIZED**。从只读 DMG 安装的 macOS arm64 应用通过包内 Python Host/SQLite schema35、Renderer 沙箱、Host 退出清理 smoke；另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Data Switch 20260926.app`，用 `/Users/iamzjt/Documents/Forge Desktop QA Data Switch 20260926/Open Forge Desktop QA.command` 与独立空数据常驻打开。同目录有干净无 remote 的可丢弃 `sample-project`。旧 DMG、安装和数据保留为历史证据。

安装版 UI 在隔离 Git 项目保存真实消息、手工 Task Draft 修订和人工版本审批，获批任务 `b08f1d66-dd33-4c5e-a549-139969cd52fd` 只进入 TODO、未启动 Run。随后导出 SQLite 备份，恢复成独立 Profile `57f4e888-d459-4f3b-9d17-35de6e4e1662`：重启前后 Host 和看板都读到同一 TODO；在重新信任前 `run.start` 被 `PROJECT_TRUST_REQUIRED` 拒绝，且首页明确标明恢复项目需要信任。重新选择原目录、只读 Probe 并主动信任后，再返回原数据集，原 Project 仍被信任，原始备份 SHA-256 `3ce699f7b3131b325b028fe01b13977e4bcfb385ca291912a1042660b4e9b450` 和源 Git HEAD/status 未变。恢复后的[看板 TODO](../output/playwright/desktop-data-switch-history-20260926-restored-todo-1440x900.png)、[项目需信任](../output/playwright/desktop-data-switch-history-20260926-needs-trust-1440x900.png)、[重新信任](../output/playwright/desktop-data-switch-history-20260926-renewed-trust-1440x900.png)和[返回原集](../output/playwright/desktop-data-switch-history-20260926-original-returned-1440x900.png)来自同一实际安装包；QA 根 `output/qa/desktop-profile-restore-BVmO4w/` 保留。安装版还验证 Remove 确认 Dialog 的 Tab/Shift+Tab 焦点环、Escape 恢复焦点和长 Unicode 项目路径的完整可访问 title，未删除项目。原生选择/确认框由自动化 harness 驱动，不声称人工原生点击已验。

`RESTORE_IN_PROGRESS` 已加入公开 ForgeError code Schema，避免 quiesce 拒绝被错误归成 `INTERNAL_ERROR`；真实独立 Python Host 测试验证暂停期间新命令拒绝、只读 activity 可查、重复暂停与恢复幂等、恢复后 health 正常以及退出无残留。`pnpm validate:contracts` 47 文件/0 error/4 既有 warning、`pnpm validate:task-map` 9 Phase/92 Task/120 Case/84 deferred、`pnpm typecheck`、`pnpm py:check` 225 pytest/Ruff/mypy、`pnpm test`、定向 Desktop 13 测试、打包、包 smoke、两次安装版恢复脚本和 `git diff --check` 通过。`pnpm lint` 首次因 QA 的浏览器 `document` ESLint 范围报错，改用 `globalThis.document` 后定向 lint 通过；最终全量 lint 与 Desktop smoke 仍待本次复跑，不提前记为通过。本包未重跑在线 Codex 全链，也未实测活跃 Codex Run 时恢复；P6 发布 Gate、Claude、Windows/Intel、签名公证和正式更新保持未通过。P7/P8 新增开发后置。

## Desktop 安装版：独立数据集备份恢复 · 2026-09-26

本次按 Desktop A～H 功能缺口补齐「设置 → 备份与独立恢复数据集」，并保留全部旧工作区改动与 QA 证据。Main 使用固定 Preload 方法和原生文件选择/确认；独立 Python 恢复工具只读检查 SQLite 备份头、`quick_check`、外键、Schema/Project/Task/Run 数量及 WAL/大小边界，用 SQLite backup API 在 Forge 管理根下建立 UUID 新数据集并迁移至 schema35。Main 等 Host 请求排空且 `system.activity=0`，停止归属 Host、等待确认退出后 fsync/原子切换版本化指针并重启；失败时恢复旧指针与 Host。生产原数据集、输入备份和用户源码均不替换或删除。导入项目历史保留但 `trustVersion=project-trust/restored-pending`，须经新的 Desktop 目录选择、只读 Probe 和显式信任；导入设备及会话撤销。Web 不获得文件或数据库桥；Renderer 不可指定路径、SQL 或任意 IPC。见 [ADR 0083](decisions/0083-reversible-desktop-data-profile-restore.md)。这不是签名更新/安装升级。

最终源码对齐内部 DMG：[desktop-restore-profile-final-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-restore-profile-final-20260926.dmg)，0.0.1，333022618 bytes，SHA-256 `1a5b2649f67977755dab2fdce62b2f1fdd35668ec8d8b5d88d2afcf869327ebd`，**INTERNAL / ADHOC / UNNOTARIZED**。macOS arm64 从只读 DMG 复制验证签名、包内 CPython 3.12.13/SQLite 3.50.4/schema35、Renderer 隔离及 Host 停止；隔离安装版真实完成 UI 项目选择/信任→SQLite 导出→独立恢复→Host 重启→重启后仍需信任→重新探测与信任→返回原数据集。QA 根 `output/qa/desktop-profile-restore-BoHTwC/` 保留，原 Project ID `77042bb2-0eb0-47dd-a1a2-5d4f603927e2` 没有变，输入备份 SHA-256 `b13071cf27662211b50d07e8beb8d8d545bc9e912d5872b6bf8f187f6afb9488` 未变，源 Git HEAD/status 干净。[恢复后需信任](../output/playwright/desktop-restore-profile-final-20260926-needs-trust-1440x900.png)、[重新信任](../output/playwright/desktop-restore-profile-final-20260926-renewed-trust-1440x900.png)、[返回原集](../output/playwright/desktop-restore-profile-final-20260926-original-returned-1440x900.png)已目视核对。自动化通过受控 dialog 替身完成原生选择/确认，不声称人工点击原生对话框已验。

`pnpm validate:contracts` 47 文件/0 error/4 既有 warning；`pnpm validate:task-map` 9 Phase/92 Task/120 Case/84 deferred；`pnpm lint`、`pnpm typecheck`、`pnpm py:check`（225 pytest/Ruff/mypy）、`pnpm test`、`pnpm smoke:desktop`、`git diff --check` 已通过；首次 Desktop smoke 因新的固定 bridge 方法未加入测试允许列表失败，补正后复跑通过。最终包 `node scripts/package-macos-internal.mjs --artifact-suffix=desktop-restore-profile-final-20260926`、指定 DMG 的 `pnpm smoke:package:mac`、`scripts/smoke-packaged-data-profile-restore.mjs` 均 exit 0。另从该 DMG 安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Restore Profile 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Restore Profile 20260926/Open Forge Desktop QA.command` 使用独立空数据常驻；Main PID 14803/包内 Host PID 14815，SQLite `quick_check=ok`/schema35/0 Project/Task/Run，同目录新 `sample-project` 尚未被 Forge 信任。没有新在线模型调用、没有替换旧安装或用户数据库。

**未收口**：活跃 Codex Run 期间的安装版恢复拒绝、原生对话框人工操作、Windows/Intel、签名自动更新/回滚、Claude 第二执行器、P4-04 可持久插件配置与凭据、T116～T120 适用项及最终源码包在线全链仍需独立证据；P6 正式 Gate、Desktop 全功能里程碑继续未通过。下一桌面缺口先核查 P4-04 当前空 Codex 配置 Schema 与真实凭据边界，再补可实现的桌面入口/运行/验收。P7/P8 新开发后置，不自动提交、推送或发布。

## Desktop 自定义 Workflow v2 的安装版交付续验 · 2026-09-26

沿用当前源码对齐的 `desktop-run-usage-20260926` 内部 DMG（SHA-256 `fd867901b7f3ee2e78842411c8477f77e5a4d87ce0e3b5a526ae1e9235a214bd`）和 `output/qa/desktop-owner-return-20260926-run1/` 中已保留的真实开发 Run，**未重跑 Developer 模型任务**。从已安装副本的正常任务抽屉明确启动独立只读 Codex Review，当前快照 `027a5e22-5703-4a43-ab94-d1780e1de2ce` 的报告 `04df3ac4-9e78-4946-b500-596c5c9cf24f` 为 `approved`；从正式「验证报告」入口执行冻结环境获批 `test` 预设，报告 `92c8f578-3437-408e-9722-e9243d4b08f8` 为 `passed`、exit 0。逐项 AC 判断后，Owner 在 UI 明确接受，决定 `a459fa3c-130b-4d83-a27f-957439bd5081` 生成交付 `644e2a64-b0f9-4edd-ab6b-7b9ac4975142`。Task `adf54244-caf5-4c7b-bf36-813842354500` 才由此前的 active 变为 Done；关闭、重新打开同一安装副本后 Done/交付仍在，原始 fixture Git `HEAD/status` 未变，未合并、推送或部署。旧 Run 继续冻结 Workflow/Profile v1，本次 Run `574e114d-437d-4758-8bf8-a94a219cdcb2` 继续冻结 `workflow.fixture.quick@2` / Developer Profile v2；Review、Verify/AC/Owner 针对同一 v2 CodeSnapshot。[人工接受前实图](../output/playwright/desktop-workflow-v2-closeout-20260926-owner-ready-1440x900.png)、[交付后实图](../output/playwright/desktop-workflow-v2-closeout-20260926-owner-accepted-1440x900.png)已目视核对。

续验脚本 [smoke-packaged-workflow-v2-closeout.mjs](../scripts/smoke-packaged-workflow-v2-closeout.mjs) 最终 exit 0；首次两次尝试因刷新后任务抽屉覆盖看板点击而超时，真实 Review 已持久保存。修正为识别当前 `#/tasks/<id>` 抽屉后，第三次复用该 Review 报告完成后续链，没有重复在线审查。`node --check`、针对该脚本的 ESLint、`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）通过。本次只增加续验脚本和实施证据，不修改打包产品源码，因此无需把旧 QA 历史伪装成新包执行。P6 正式 Gate、Claude/Windows/Intel/签名公证、安全 Restore/更新、T116–T120 仍按原未验收状态；P7/P8 新开发后置。

## Desktop 缺口复核：Host 异常中断的评测归类 · 2026-09-26

新增 `python/tests/test_recovery.py::test_killed_host_active_run_is_interrupted_not_passed`：在带空格路径的独立 Git 仓库和临时 SQLite 中，通过正式服务批准 TODO、冻结 RunConfig；**独立 Python Host 进程**创建受控 Git worktree、租约与真实 owned 子进程，将 Run 持久化为 running 后 `os._exit(71)`。新 Host 重新打开库时将 Run/Attempt 标为 `interrupted`、租约标为 `quarantined`；同库 `read_run_outcomes` 得到 1 interrupted、0 accepted delivery，重复恢复不改状态，源 Git HEAD/status 不变。子进程限时自行退出，恢复逻辑没有按旧 PID 杀进程。定向 pytest 1 passed，`pnpm py:check` 218 pytest/Ruff/严格 mypy 69 源文件通过。此前的 cancelled 安装版 QA 证据仍单独保留；**这不是在线 Codex 活跃 Run 崩溃，也没有在当前 DMG 重新跑安装版中断评测**，故权威 T120 及 P6-09 完整验收仍递延。仅测试和验收追踪改变，下面 DMG 的产品源码与 SHA 不变；P7/P8 后置。

## Desktop 当前内部包：Codex 续用 Thread 的 Run 用量归一化 · 2026-09-26

当前源码对齐的 [内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-run-usage-20260926.dmg) 是 `0.0.1-INTERNAL-ADHOC-UNNOTARIZED`，SHA-256 `fd867901b7f3ee2e78842411c8477f77e5a4d87ce0e3b5a526ae1e9235a214bd`、329540902 bytes。上一包的 Codex Adapter 错把跨 Run 的 `thread/tokenUsage/updated.total` 计入新 Run 的冻结预算；现从当前 turn 首事件的 `total - last` 建立历史基线，此后只报告本 Run 的累计差额。重复事件不重复计费，缺失/回退计数按协议错误失败，不把旧 Run 的 token 误报为本次超限。固定的官方 CLI 0.155.1 生成协议包含 `total`/`last`；离线续用 thread fixture 检查旧 100000 token、两次新响应、重复事件和计数回退。具体设计与上游延迟限制见 [ADR 0041](decisions/0041-bounded-python-rework-loop.md)。本改动未新增依赖、迁移、协议版本、权限或网络入口。

`python/.venv/bin/python -m pytest -q python/tests/test_codex_executor.py python/tests/test_run_scheduler.py` 8 passed；Ruff/mypy 定向通过；`pnpm validate:contracts` 47 文件/0 error/4 既有 warning，`pnpm validate:task-map` 9 Phase/92 Task/120 Case/84 deferred，`pnpm py:check` 217 pytest/Ruff/mypy 69 源文件、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。`node scripts/package-macos-internal.mjs --artifact-suffix=desktop-run-usage-20260926` 和指定 DMG 的 `pnpm smoke:package:mac` 通过只读挂载、复制、启动、退出：包内 CPython 3.12.13/SQLite 3.50.4/schema35、sandboxed Renderer、ad-hoc 签名与 Host 归属关闭均实测。独立 SQLite 备份副本在同一新 DMG 中读回旧真实 Codex 的两个冻结 Run、Done 与交付，`scripts/smoke-packaged-profile-context-readback.mjs` exit 0；[安装版首页](../output/playwright/desktop-run-usage-20260926-packaged-home-1440x900.png)、[Agents](../output/playwright/desktop-run-usage-20260926-agents-1440x900.png)、[冻结 Run](../output/playwright/desktop-run-usage-20260926-frozen-run-1440x900.png)来自新包，其中首页已目视查看。

另从新 DMG 安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Run Usage 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Run Usage 20260926/Open Forge Desktop QA.command` 用独立空数据常驻打开。实际 Main PID 69164、包内 Host PID 69174，SQLite `quick_check=ok`/schema35/0 Project/Task/Run；同目录干净、无 remote 的 `sample-project` 未预先信任。此前包、QA 数据与旧在线交付证据均保留。**本包没有新在线 Codex 超限或从零全业务运行**；仍不是精确费用硬上限，T119 与完整 Desktop/P6 发布验收未通过。P4-04 插件可信配置/凭据、应用内安全 Restore/签名更新、Claude、Windows/Intel 等待独立补验；P7/P8 手机和远程新增开发仍后置。不自动提交、推送或发布。

## Desktop 前一内部包：真实事件驱动的 Run 预算停止 · 2026-09-26

当前源码对齐的 [内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-observed-budget-final-20260926.dmg) 为 `0.0.1-INTERNAL-ADHOC-UNNOTARIZED`，SHA-256 `a03cdde3fefc4971c674d5de453dad0036cd43f26d3394d135751a9329518f49`，333039712 bytes。已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Observed Budget 20260926.app`；双击 `/Users/iamzjt/Documents/Forge Desktop QA Observed Budget 20260926/Open Forge Desktop QA.command` 以独立空数据常驻打开。同目录 `sample-project` 是从干净 Git fixture 复制的新仓库，无 remote，仍须在 UI 主动选择和信任。实测 Main PID 20674、包内 Python Host PID 20677、SQLite schema35/`quick_check=ok`、初始 0 Project/Task/Run；旧 QA 应用与数据未覆盖。

增量修复属于 P4-06/P6-09 的 Desktop 缺口，不改变权威 Task/Test 状态。Python RunScheduler 使用冻结 RunConfig 的 `maxTokens`/`maxToolCalls` 和锁定 Developer Profile 的 `maxOutputTokens`；只有收到有效的 `usage.updated`/`command.started`/`tool.started` 观测事件后才触发停止，先请求 Executor 退出再核验归属进程。停止确认后 Run 记 `failed`，以现有 SQLite 允许的 `run.failed` 审计事件记录封闭原因码，Run 详情显示原因和冻结上限；未确认退出沿用隔离工作区策略，不伪装成功或用户取消。Profile 页面可以编辑下一版本的输出 Token 观测上限。真实 owned-child fixture 分别触发总 Token、输出 Token、工具调用阈值，确认进程停止、工作区租约释放、源 Git 干净且没有用户取消意图。上游事件可能延迟，阈值**不是精确费用硬限制**；Profile `maxTurns` 尚不能约束 Codex 内部工具循环，权威 T119 仍 `DEFERRED_VERIFICATION`。见 [ADR 0041 补记](decisions/0041-bounded-python-rework-loop.md)。没有新增依赖、协议版本、迁移、网络监听或凭据处理。

`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm py:check`（216 pytest/Ruff/严格 mypy 69 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm smoke:desktop`、`git diff --check` 均 exit 0；最后一行等待任务清理的微调另跑 RunScheduler 定向 2 pytest/Ruff/mypy exit 0。`node scripts/package-macos-internal.mjs --artifact-suffix=desktop-observed-budget-final-20260926` 与指定最终 DMG 的 `pnpm smoke:package:mac` 均 exit 0，真实挂载/复制/启动验证包内 CPython 3.12.13、SQLite schema35、sandboxed Renderer、隔离数据、ad-hoc 签名及退出后 Host 不残留。[安装版空工作区](../output/playwright/desktop-observed-budget-final-20260926-packaged-home-1440x900.png)已查看。同一最终 DMG 从旧真实在线交付的**独立 SQLite 备份副本**读回两个冻结 Run、Done 和交付，`scripts/smoke-packaged-profile-context-readback.mjs` exit 0；[Agents](../output/playwright/desktop-observed-budget-final-20260926-agents-1440x900.png)、[冻结 Run/预算](../output/playwright/desktop-observed-budget-final-20260926-frozen-run-1440x900.png)来自本包。没有新在线模型预算超限测试或完整业务重跑，旧在线交付按原包 SHA 保留。

Desktop 完整里程碑仍未收口：P4-04 的可信配置/凭据闭环、应用内安全 Restore 与签名更新、T116–T120 剩余适用验收、Claude 第二真实 Executor、Windows x64/macOS Intel、Developer ID/公证及新包在线完整闭环仍待验证。P7/P8 新增开发仍按用户优先级后置，P6 正式发布 Gate 仍 BLOCKED，不自动提交、推送或发布。

## Desktop 当前已安装内部包：插件装配与执行能力分离 · 2026-09-26

当前源码包为 [desktop-plugin-capability-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-capability-20260926.dmg)，0.0.1，SHA-256 `c7e72e4f7df8d8007deab956650a0ad2340f2dd4937409690e1db2ddfbb3a26c`，332891530 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。插件页现在分别显示 Python Host 已装配的内置插件和真实 Codex Executor 能力；仅两者都可用时才显示「可启动」，探测失败或插件停用时仍不可启动。页面使用已有 `agentProfileCatalog()` 固定桥和 Host 探测，不增加任意 IPC 或凭据处理。Codex 内置 Manifest 没有可编辑配置项；通用 Schema 表单仍仅本地检查，**未宣称配置保存/凭据经 Host 生效**。`PluginsView.test.ts` 新增装配与不可运行分离测试，6 项通过。

本 DMG 经 `node scripts/package-macos-internal.mjs --artifact-suffix=desktop-plugin-capability-20260926` 构建、`pnpm smoke:package:mac` 从只读 DMG 安装启动，确认包内 CPython 3.12.13、SQLite schema35、安全 Renderer 和 ad-hoc 签名。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Plugin Capability 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Plugin Capability 20260926/Open Forge Desktop QA.command` 在独立空数据常驻运行；Main PID 68040、包内 Host PID 68050、SQLite `quick_check=ok`、0 Project/Task/Run，同目录干净无 remote `sample-project` 未自动信任。真实已批准 TODO 的独立 SQLite backup 副本用空 `CODEX_HOME` 启动本 DMG：Host 返回 `CODEX_NOT_AUTHENTICATED`，任务 Start 禁用、Run 仍为 0，[任务入口](../output/playwright/desktop-plugin-capability-20260926-not-logged-in-1440x900.png)与[插件页真实状态](../output/playwright/desktop-plugin-capability-20260926-plugin-unavailable-1440x900.png)已目视核对。`scripts/smoke-packaged-codex-prerequisite.mjs` 最终 exit 0；首轮 QA 脚本被仍打开的任务抽屉遮挡导航而超时，按真实交互先 Escape 关闭后通过，未改产品逻辑。

同一最终 DMG 再从此前在线 Review/返工/交付的独立数据库备份副本读回两个冻结 420 秒 Run、Done 和交付 `8550daee-244d-407e-bb93-68d650a1687f`；`scripts/smoke-packaged-profile-context-readback.mjs` exit 0，[Agents](../output/playwright/desktop-plugin-capability-20260926-agents-1440x900.png)与[冻结 Run](../output/playwright/desktop-plugin-capability-20260926-frozen-run-1440x900.png)来自此安装版。原 QA 数据和旧包未覆盖，本包**没有新在线模型调用**。当前回归：`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm py:check`（216 pytest/Ruff/mypy 69 源文件）、`pnpm smoke:desktop`、`pnpm smoke:package:mac` 和定向安装版 QA 均 exit 0；Web Vitest 136 项通过。完整 Desktop/正式发行仍未收口：安全 Restore/签名更新、Profile provider 级其余限额、T116–T120、Windows/Intel、Claude 和签名公证待办；P7/P8 新增开发后置。

## Desktop 前一已安装内部包：Codex 依赖诊断与历史交付读回 · 2026-09-26

当前源码对齐的 [desktop-codex-diagnostics-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-codex-diagnostics-20260926.dmg) 为 0.0.1，SHA-256 `23ab7d8090c2cb0c8bd58935f65055b15fdc6d938afd0946cf7ceffbd06b1254`，327372507 bytes，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。Python Codex Adapter 的只读能力探测现返回固定、无凭据原因码：CLI 无法启动、版本不符、未登录、模型列表不可用、探测失败、匹配的真实能力证据不足；Vue Task Run 入口显示对应说明并在能力未通过时禁用 Start。真实 macOS CLI 对隔离空 `CODEX_HOME` 的 `codex login status` exit 1；Adapter 进程探测确认为 `CODEX_NOT_AUTHENTICATED`、零模型、不可运行，未进行模型调用。Python 定向 5 pytest/Ruff/mypy、Web 135 测试/typecheck、ESLint、`pnpm smoke:desktop`（含 build、包内 Host/Renderer 边界/崩溃与外观保持）、`git diff --check` 均 exit 0。

本次源码最终回归另跑 `pnpm py:check`（216 pytest、Ruff、mypy 69 源文件）、`pnpm test`（build、全部 workspace 与根测试，Web 135）、`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）及 `git diff --check`，均 exit 0。`pnpm typecheck`、`pnpm lint` 亦 exit 0；这些离线回归没有调用模型。

同一最终 DMG 的独立安装副本又在 SQLite online backup 得到的**真实已批准 TODO、零 Run** QA 数据上验证了未登录入口。启动前将 `CODEX_HOME` 指向独立空目录；`node --check scripts/smoke-packaged-codex-prerequisite.mjs`、定向 ESLint 和 `FORGE_PACKAGE_PREREQ_DMG=... FORGE_PACKAGE_PREREQ_DATA=... node scripts/smoke-packaged-codex-prerequisite.mjs` 均 exit 0。实际 Host 返回 `CODEX_NOT_AUTHENTICATED`，任务抽屉显示“Codex CLI 尚未登录”，Start 禁用且 Run 仍为 0；[安装版任务入口截图](../output/playwright/desktop-codex-diagnostics-20260926-not-logged-in-1440x900.png)已目视核对。此项未调用模型，不把未登录场景冒充真实 Coding Run。

`node scripts/package-macos-internal.mjs --artifact-suffix=desktop-codex-diagnostics-20260926` 与从只读 DMG 复制启动的 `pnpm smoke:package:mac` exit 0；包内 CPython 3.12.13、SQLite 3.50.4/schema35、ad-hoc 签名和 Renderer 安全属性实测。另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Codex Diagnostics 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Codex Diagnostics 20260926/Open Forge Desktop QA.command` 在新 `isolated-app-data` 常驻启动；Main PID 39992、包内 Host PID 40002、数据库 `quick_check=ok` 且初始 0 Project/Task/Run。`sample-project` 为干净、无 remote 的可丢弃 Git 项目，`node test.js` 通过，未自动导入或信任。[实际安装版首页](../output/playwright/desktop-codex-diagnostics-20260926-home-1440x900.png)、[外观设置](../output/playwright/desktop-codex-diagnostics-20260926-settings-1440x900.png)已目视核对。

用 SQLite online backup 克隆上一真实在线 Review/返工/交付 QA 库到 `output/qa/desktop-codex-diagnostics-readback-20260926`，本次 DMG 的安装副本经正式 Host/UI 读回两个冻结 420 秒 Run、Done 和交付 `8550daee-244d-407e-bb93-68d650a1687f`；`FORGE_PROFILE_READBACK_TAG=desktop-codex-diagnostics-20260926 ... node scripts/smoke-packaged-profile-context-readback.mjs` exit 0，[Agents](../output/playwright/desktop-codex-diagnostics-20260926-agents-1440x900.png)与[冻结 Run](../output/playwright/desktop-codex-diagnostics-20260926-frozen-run-1440x900.png)来自安装版。原 QA DB/旧截图不覆盖、没有新在线 Codex Run。应用内安全 Restore/正式签名更新、Windows/Intel、Claude 第二执行器和完整桌面/P6 Gate 仍未验；手机/远程新增开发保持后置。

## Desktop 前一已安装内部包：外观偏好重载保持 · 2026-09-26

前一源码对齐的 [desktop-appearance-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-appearance-20260926.dmg) 为 0.0.1，SHA-256 `406a8291001ecfc80c1c511e9cabf6a8f9f9bcccc3526d583e6d3950914f393d`，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。构建命令 `node scripts/package-macos-internal.mjs --artifact-suffix=desktop-appearance-20260926` exit 0；从只读 DMG 复制的 `pnpm smoke:package:mac` exit 0，实际验证包内 CPython 3.12.13、SQLite 3.50.4/schema35、ad-hoc 签名、sandboxed Renderer/隔离 Preload、Python Host 启停，以及 Settings 设置深色/减少透明度/减少动效后重载仍保持。已另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Appearance 20260926.app`，使用 `/Users/iamzjt/Documents/Forge Desktop QA Appearance 20260926/Open Forge Desktop QA.command` 在独立 `isolated-app-data` 常驻启动；实测 Main PID 28915、包内 Host PID 28926、SQLite `quick_check=ok` 与初始 0 Project/Task/Run。同目录 `sample-project` 为 clean/无 remote 的可丢弃 Git fixture，需用户主动选择并信任；没有假任务或预置 Agent 日志。[安装版空白首页](../output/playwright/desktop-appearance-20260926-home-1440x900.png)、[重载后持久化设置](../output/playwright/desktop-appearance-20260926-persisted-settings-1440x900.png)已目视核对。另用 SQLite online backup 克隆先前**真实在线 Review 返工/交付**的隔离 QA 数据到 `output/qa/desktop-appearance-readback-20260926`，从本次 DMG 安装临时副本只读调用 Project/Board/Run/Delivery：两个 Run 各冻结 420 秒、Task 仍 Done、交付 `8550daee-244d-407e-bb93-68d650a1687f` 与冻结 Reviewer Profile 均读回；[Agents 页面](../output/playwright/desktop-appearance-20260926-agents-1440x900.png)、[Run 配置](../output/playwright/desktop-appearance-20260926-frozen-run-1440x900.png)已目视核对。`FORGE_PROFILE_READBACK_TAG=desktop-appearance-20260926 ... node scripts/smoke-packaged-profile-context-readback.mjs` exit 0，原 QA DB/旧截图均未覆盖。这次**没有新的在线 Codex 全链**；真实执行证据保留原构建 SHA。尚缺应用内安全 Restore/正式更新、Windows/Intel、Claude 第二执行器、签名/公证和完整桌面/发行 Gate；P7/P8 新增工作仍后置。

## Desktop 设置：外观偏好重载保持 · 2026-09-26

Settings 的主题、减少透明度、减少动效从临时 `ref` 改为版本化、受限的本地显示偏好；无效/不可访问的浏览器存储退回系统主题和默认值，不读取凭据、不写 Host/SQLite，也不修改旧 Run。普通 Web 页面重挂载测试恢复三项；真实 macOS arm64 Electron `pnpm smoke:desktop` 在同一独立数据目录设置深色/两项回退、重载 Renderer 后逐项读回，Host ID/PID 不变，随后恢复默认外观。`@forge/ui` 的系统 `prefers-reduced-motion` 回退继续生效。定向 Web 2 文件/10 测试、Web typecheck、ESLint、`pnpm smoke:desktop` 含 build 均 exit 0。该改动现已进入上方 desktop-appearance 构建并完成安装版重载验收。Desktop 完整里程碑及 P6 正式发行 Gate 不变，P7/P8 新增工作仍后置。

## Desktop 当前 QA：真实 Run 结果只读汇总 · 2026-09-26

为权威 T120 增加 `python/src/forge/evaluation_outcomes.py` 与独立只读 CLI `python/scripts/evaluate_qa_runs.py`。它扫描隔离 QA SQLite 的全部 Run（上限 10,000，超限报错），仅把与同 Project/Task 的真实 CodeSnapshot、DeliveryRecord、人工 `accept` 决定关联的成功 Run 计为 `accepted_delivery`；其它 `succeeded`、`failed`、`cancelled`、`interrupted` 和非终态分别列出。空样本、异常状态、重复 Run 或取消 Run 却有关联交付时拒绝，进行中样本退出非零。CLI 仅接受仓库 `output/qa` 内的 `forge.sqlite`、以 SQLite 只读模式打开并检查 schema35/`quick_check`，不接触用户正式 DB。现有真实安装包 QA 留存 `output/qa/desktop-current-full-20260926-run1/evaluation-outcomes.json`：2 Run＝1 人工交付＋1 cancelled，取消未计成功；真实 Host 重启隔离旧活跃 Run 的测试 fixture 由同一评测器归类为 1 interrupted/0 交付。后者使用人工设置的旧活跃记录，不冒充 Codex 工作中的 Host 崩溃；T120 继续 `DEFERRED_VERIFICATION`。定向 Python 3 pytest、Host 恢复 fixture 1 pytest、Ruff、mypy 与 CLI exit 0；最初 CLI 的错误生产表字段查询已修正并如实保留在此记录。此评测汇总不代表 T116～T119 或 P6-09 正式 Gate 通过，不需新在线模型调用。下方当前安装包与真实业务证据仍有效；尚未为本次纯离线 QA 工具另行重建 DMG。

## Desktop 前一安装版：Profile 配置接入新 Run 与旧交付读回 · 2026-09-26

前一源码内部 DMG 为 [desktop-profile-context-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-profile-context-20260926.dmg)，0.0.1，SHA-256 `5700b1f6d681ba3943bf5070543d6b5eefc864432ae8c997b12aadc4be838487`，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从 DMG 只读挂载/复制/启动，包内 CPython 3.12.13、SQLite 3.50.4/schema35、sandboxed Renderer 与签名复核 exit 0。另安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Profile Context 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Profile Context 20260926/Open Forge Desktop QA.command` 以独立空数据常驻启动；实测 Main PID 76060、包内 Host PID 76070、SQLite `quick_check=ok` 且 0 Project/Task/Run。同目录 `sample-project` 是复制的 clean/无 remote Git fixture，未自动导入或信任，旧应用、用户项目与历史 QA 数据未覆盖。

Agents 页面现在能编辑 Developer Profile 的 `maxSeconds`（1～3600 秒）和显式项目知识/记忆检索许可，保存时保留现有 `maxTurns/maxOutputTokens` 字段但不宣称 provider 强制；Run 启动时 Host 将所选 Profile 预算冻结，并按已发布 Workflow 节点超时设上限，返工沿用原冻结预算。Profile 无 `project-context` 时正式 UI 禁用检索词，直接调用 Host 的显式 `contextQuery` 也在创建 Run 前返回 `PROFILE_CONTEXT_UNSUPPORTED`；旧 Profile/Run 不静默改写。只读 `run.config` 返回冻结 `maxDurationMs`，Task 抽屉 Context 页展示真实秒数。定向 Vue、Python Host/SQLite 测试与 `pnpm smoke:desktop` 实测 Agents UI 保存 v2/Host 读回、非法输入拒绝、检索许可拒绝和冻结预算。完整回归 `pnpm py:check`（212 pytest、Ruff、mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）通过。

同一新 DMG 从**前一包实际在线 Review/自动返工/人工交付留下的隔离 QA 数据**安装启动，`FORGE_PROFILE_READBACK_DATA=... FORGE_PROFILE_READBACK_DMG=... node scripts/smoke-packaged-profile-context-readback.mjs` exit 0（仅调用只读业务命令）：Host 返回两个 Run 各 420000 ms，Board 仍为 Done，交付 `8550daee-244d-407e-bb93-68d650a1687f` 存在，正式 UI 展示“本次冻结最长运行时间：420 秒”，[Agents 配置](../output/playwright/desktop-profile-context-20260926-agents-1440x900.png)和[冻结运行配置](../output/playwright/desktop-profile-context-20260926-frozen-run-1440x900.png)已目视检查。**没有在新包重新调用在线 Codex**；前一 `desktop-profile-budget-20260926` 同包在线 Review blocker→返工→复审→Verify/Owner 全链证据保留其原始 SHA 和 Run ID。应用内安全 Restore/签名升级、Windows/Intel、Claude 第二执行器、Developer ID/公证和完整 P6 Gate 仍未验；Desktop 完整里程碑未收口，P7/P8 新增开发继续后置。

## 前一 Desktop 安装版：真实 Review 阻断 → 自动返工 → 复审 → Verify → 人工交付 · 2026-09-26

前一内部包为 [desktop-profile-budget-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-profile-budget-20260926.dmg)，0.0.1，SHA-256 `4b51d673c3ec64d4fbf7a0dc8004927c1946d26d4fe1d0c9226abe441e84bd17`，仍是 **INTERNAL / ADHOC / UNNOTARIZED**。该 DMG 从只读挂载复制安装、使用包内 CPython 3.12.13 / SQLite 3.50.4 / schema35 与独立测试数据，`pnpm smoke:package:mac` exit 0。当前代码还修正了真实发现的 Profile 时间预算缺口：新 Development Run 冻结已选择 Profile 的 `maxSeconds`，受发布 Workflow Develop 节点上限约束；返工 Run 继承原 Run 冻结预算，自动 Review 继承原 Reviewer Profile ID/版本，不因后来编辑静默切换。Profile v1 420 秒→保存 v2 60 秒后的两个新任务和旧快照不变在真实 SQLite fixture 中通过；`maxTurns/maxTokens/maxToolCalls` 尚未声称全部由 provider 强制执行，见 ADR 0041。

在保留的独立 QA Git/SQLite `output/qa/desktop-review-profile-20260926-run2` 中，**此同一 DMG** 用既有合法 Codex 登录实际完成：Developer Run `f35fee0c-d37a-442e-9864-9a444a8558e3` 冻结 420000 ms 并只改 `math.js`；独立 Review `fe1edd88-78dc-4f0f-af52-531b08be2bc0` 的真实报告 `1358dab0-0afa-4300-b352-6f53f5fa2840` 返回 `changes_requested`；Host 自动发起返工 Run `6b7bf94e-80d1-4633-9504-0ad9c6ca03d8`，在隔离工作区补全 `math.js` 与 `test.js`、生成新快照 `2c341f39-0e1a-47af-b0ce-ed94358e4ee1`；自动 Review `69dd3a37-84a4-4338-899b-92d9191502b6` 沿用冻结 Reviewer Profile v1 和模型 `gpt-6-luna`，报告 `cb7894a8-52e9-4078-87c3-90e3d346387d` 为 `approved`。实际 `node test.js` 与额外反例检查通过。随后同包 UI 对获批 `node test.js` 运行 Verify `3b2ff509-a278-47c0-aee7-ce2d7e4f3244`（passed / exit 0），逐项关联 AC，再由 Owner 独立接受，产生本地交付 `8550daee-244d-407e-bb93-68d650a1687f`；看板投影 Done，退出重启仍可读。源 Git 工作树干净，没有自动合并、推送或部署。[真实返工与复审](../output/playwright/desktop-review-rework-resumed-20260926-1440x900.png)、[真实人工交付](../output/playwright/desktop-review-rework-accepted-20260926-1440x900.png)是该安装版截图，已目视核对。继续脚本 `scripts/smoke-packaged-review-rework-resume.mjs` 从保留的实际模型 Run 接续，复用已完成 Review Job，**没有再次调用模型或伪造 Reviewer**；脚本最终 exit 0。较早同任务 QA 首次因固定 180 秒预算超时，保留为失败证据，不能写成成功。

当前源码质量链：`pnpm py:check`（212 Python pytest、Ruff、mypy 68 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`pnpm smoke:package:mac` 均 exit 0；新 QA 脚本另经语法和 ESLint 检查。这个当前包补齐了此前缺少的**在线 Review blocker 自动返工及最终交付证据**，不表示全部 Desktop 已收口：安全的应用内 Restore/正式签名升级、Profile provider 级其他限额、Windows/Intel、Claude 第二真实 Executor、Developer ID/公证和 P6 正式 Gate 仍待验。手机与远程新增开发继续后置。

## Desktop 返工闸门真实报告恢复与前一安装包 · 2026-09-26

继续 Desktop-first 缺口：自动返工已生成新 CodeSnapshot，但同类 Review/Verify 的自动启动失败后，旧实现把 `rework_cycles.state=blocked` 当作永久硬门禁；即使用户经现有 UI 手工完成同快照有效报告，Board 与最终验收仍阻断。Python Host 现通过只读投影核对**同一返工 Run、同一快照、同类闸门与原冻结 Verify kind/preset 或 Reviewer model**，且后续 Host-owned job 已完成、最新报告为 `passed`/`approved`，才把当前 Cycle 展示为已生成快照并解除 `REWORK_UNRESOLVED`。原 `blocked` 记录和失败码不删除；`REWORK_LIMIT_REACHED`、中断、错误 Run/快照/闸门、失败报告仍阻断。其他 Review、Verify、逐项 AC、人工接受门禁未变，绝不因恢复直接 Done；无迁移/新 Renderer 命令/权限放宽。ADR 0041 追加决策。

真实临时 Git/SQLite/子进程 fixture 注入一次自动 Verify 启动故障，后由实际 Verifier 运行同快照已批准预设并返回 `passed`，Board 从 blocked 恢复而人工最终验收仍因 Review 缺失不可用；来源 Git `HEAD/status` 不变。Review fixture 的错类 Verify 报告未解除旧 Cycle 阻断。定向 Python `7/7`、Web 组件 `4/4`，全量 `pnpm py:check` 212 pytest/Ruff/mypy 68 文件、`pnpm lint`、`pnpm typecheck`、`pnpm test`（包含 build）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。当前源码内部 DMG [desktop-rework-recovery-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-recovery-20260926.dmg) 为 0.0.1，SHA-256 `e868ebce8a4a5d13ba7f1cb65fef580dbabd7298251c24e8720deceaa6ee0f6a`，包内 CPython 3.12.13/SQLite 3.50.4/schema35；从 DMG 复制启动的 `pnpm smoke:package:mac` exit 0，Renderer sandbox 和包内 Host 真实检查通过，[空白首页](../output/playwright/desktop-rework-recovery-20260926-home-1440x900.png)已目视核对。另从 DMG 安装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Recovery 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Recovery 20260926/Open Forge Desktop QA.command` 常驻启动，实际 Main PID 86331/Host PID 86335；独立数据库 `quick_check=ok`、schema35、0 Project/Task/Run，可丢弃 `sample-project` 是 clean Git、无 remote、`node test.js` 通过。旧 QA 应用/数据未覆盖。**本包没有新在线 Codex Review blocker 自动返工，也没有新完整 Coding Run**；前包模型澄清和其他包的 Coding/知识/Verify 证据保留各自构建标识。应用内 Restore/签名升级、Windows/Intel、Claude、Developer ID/公证和完整 P6 Gate 仍未验；P7/P8 新增开发后置，Desktop 里程碑未收口。

## Desktop 返工阻断原因、源码对齐安装包与可操作 fixture · 2026-09-26

按 Desktop-first 缺口复核，发现 Python Board 把**所有**被阻断的 Review/Verify 返工都解释为「次数达到上限」；实际上 `REWORK_GATE_UNAVAILABLE` 等后续闸门启动错误也会进入 `blocked`。现只在 `REWORK_LIMIT_REACHED` 时显示上限说明，其余阻断在看板解释为后续 Review/Verify 无法启动、在返工面板标注「已阻断」并保留 Host 原因码。没有更改状态机、尝试计数、授权、SQLite Schema 或既有 Run。Python 真实 Git/SQLite/子进程返工测试新增 Board 断言；Web 面板新增闸门失败的断言。目标测试 `6/6` 与 `3/3` 通过；一次全量 `pnpm py:check` 初次被 mypy 的 `Row | None` 收窄拦住，修正后 **211 pytest/Ruff/mypy 68 文件通过**。`pnpm lint`、`pnpm typecheck`、`pnpm test`（包含 `pnpm build`）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`pnpm smoke:package:mac`、`git diff --check` 均 exit 0。

最新内部 DMG：[desktop-rework-reason-20260926](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-reason-20260926.dmg)，版本 0.0.1、SHA-256 `f1692e492a38ada73d826eed60ea4cee634f006b0a823a74110d576a853f50a5`。从 DMG 复制安装后，包内 CPython 3.12.13/SQLite 3.50.4/schema35、sandboxed Renderer 和 Host 启停通过。另安装独立可操作 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Rework 20260926.app`，由 `/Users/iamzjt/Documents/Forge Desktop QA Rework 20260926/Open Forge Desktop QA.command` 常驻启动；实际 Main PID 48639、包内 Host PID 48643，独立数据库 `quick_check=ok`、0 Project/Task/Run。新 `sample-project` 从已有干净演示仓库克隆，`node test.js` 通过、源 Git clean、无 remote；未在 Forge 仓库自动提交，旧空白 fixture 与 QA 数据保留。[当前包空白首页](../output/playwright/desktop-rework-reason-20260926-home-1440x900.png)已目视核对。此包随后用既有合法 Codex 登录，在另一隔离安装真实整理出含「空格邮箱」与「测试框架/位置」两项澄清的 v1 Draft；安装版逐项回答、真实拒绝仅答不改合同，随后把两项决定写入 goal 与必需 AC，保存 v2、另行人工批准到 TODO，重启仍是 1 Draft v2/1 TODO/0 Run，SQLite `quick_check=ok` 且源 Git clean。[模型草稿](../output/playwright/desktop-rework-refiner-20260926-generated-draft-1440x900.png)、[修订来源](../output/playwright/desktop-rework-refiner-20260926-revision-1440x900.png)、[重启看板](../output/playwright/desktop-rework-refiner-20260926-todo-restored-1440x900.png)已目视核对。`scripts/smoke-refiner-live.mjs` 和随后无模型的 `scripts/smoke-packaged-refiner-resume.mjs` 均 exit 0；后者为本次模型提出两问而补齐逐项回答的 QA 脚本，`node --check`/lint/diff 检查通过。此证据是同包模型整理→澄清→人工审批→TODO 重启链，**不是 Coding Run、Review/Verify、最终交付**；前一包的在线正向/取消、Verify 自动返工与知识来源 Run 仍按原版本记录。Review blocker 在线返工、应用内安全恢复/签名升级及外部平台/第二执行器仍是桌面未验项。P7/P8 手机和远程新增工作后置；P6 正式 Gate 不变。

## Desktop 澄清答案进入正式 Task Contract 门禁与新版内部包 · 2026-09-26

复核下方旧 DMG 的真实模型草稿时发现：用户回答“仅含空白字符的邮箱也应无效”后，旧 UI/Host 允许只删除 `openQuestions` 并写修订历史；已批准的目标与验收条件仍只覆盖“空邮箱”。**旧包的澄清→TODO 验收只能证明机械流程，不能证明已确认语义进入执行合同。**不改写或删除那份已批准 QA 记录。现于 Python `prepare_revision` 和正式 Vue 抽屉增加同一保守门禁：回答并移除问题时，目标、验收、约束、范围或其他实质合同字段必须至少修改一项；只改 `openQuestions`/来源会得到 `DRAFT_CLARIFICATION_NOT_APPLIED`，UI 指明先把答案写入合同。历史决定仍保留来源，Host 校验直接调用也不能绕开。该检查不能自动判断用户编辑的文字语义是否完整；最终合同仍需人工审阅。

定向 Python 与 UI 测试分别验证拒绝“只填回答”和允许同步修改目标。全量 `pnpm py:check` **211 pytest**/Ruff/mypy 68 源文件、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 `pnpm build`）、`pnpm validate:contracts`（47 文件/0 错/4 既有警告）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/84 deferred）、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。内部新 DMG：[`desktop-clarification-guard-20260926`](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-clarification-guard-20260926.dmg)，0.0.1，SHA-256 `3ac7dce68decfd2681a7c58ba048c6dca2c6d894c83a7a4680fd4560f2ece784`，包内 CPython 3.12.13/SQLite 3.50.4/schema35，**INTERNAL / ADHOC / UNNOTARIZED**；`pnpm smoke:package:mac` exit 0。

在同一新 DMG 的独立 Git/SQLite fixture 上，安装版 UI 保存消息并手工建立含真实待澄清问题的 v2 Draft；**未调用模型**。第一下只回答问题，真实 UI 显示[合同门禁](../output/playwright/desktop-clarification-guard-20260926-contract-guard-1440x900.png)，未保存；随后明确把“空邮箱及仅含空白字符的邮箱”写入目标与必需验收，保存 v3、独立请求/确认审批，只入 TODO。关闭重启仍是 1 Draft v3/1 TODO/**0 Run**，SQLite `quick_check=ok`、源码 Git clean；[重启看板](../output/playwright/desktop-clarification-guard-20260926-todo-restored-1440x900.png)为实际新包截图。首次安装版准备脚本和 package smoke 并行挂同一 DMG 得 macOS“资源忙”，串行重跑；随后手工草稿按钮选择器不精确，改为精确名称并从保留 fixture 续验，最终两条脚本均 exit 0。没有绕过产品门禁或重复付费模型调用。

另装可直接操作的新包至 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA Clarification 20260926.app`，独立启动器 `/Users/iamzjt/Documents/Forge Desktop QA Clarification 20260926/Open Forge Desktop QA.command`，独立**空** SQLite 与可丢弃 Git `project`。启动器实测常驻 PID 19973、包内 Python Host 19978，SQLite schema35/`quick_check=ok`、0 Project；旧常驻 QA app/数据未停止或覆盖。新包尚未重跑在线模型完整交付/Review blocker 自动返工、Claude、Windows/Intel、签名更新与应用内恢复，**Desktop 里程碑仍未收口**；手机/远程新增开发继续后置。

## Desktop 当前安装版模型澄清 → 人工批准 → TODO 重启 · 2026-09-26

复用下文同一 `desktop-plugin-gate-20260926` DMG 和 `desktop-current-refiner-20260926-run1` 隔离 Git/SQLite，**未再次调用模型**。`scripts/smoke-packaged-refiner-resume.mjs` 从 DMG 安装副本重新打开此前真实模型生成的 `needs_clarification` v1 Draft，用户在正式抽屉回答空白字符邮箱问题，写入决定理由并保存 v2；修订历史能展开显示实际澄清。随后明确提交审批、勾选审阅并批准，只进入 TODO，没有自动 Start。第二次关闭/重启后，看板仍显示同一 TODO；只读 SQLite `quick_check=ok`、1 Draft v2、1 TODO、**0 Run**，fixture 源 Git HEAD/status/`package.json` 不变。最终脚本 **exit 0**；首次两次脚本执行因把折叠的 `<details>` 内容当成可见而超时，应用已成功保存 v2，后续脚本从保留数据续验，未重建 Draft 或掩盖这两个脚本错误。[澄清](../output/playwright/desktop-current-refiner-resume-20260926-clarification-1440x900.png)、[修订记录](../output/playwright/desktop-current-refiner-resume-20260926-revision-1440x900.png)、[重启后的 TODO](../output/playwright/desktop-current-refiner-resume-20260926-todo-restored-1440x900.png) 是同一安装版实际 Vue/Electron 截图。此链只验证审批到 TODO；该 Task 尚未执行开发。

## 当前安装版主动模型整理 → 待澄清草稿 · 2026-09-26

`scripts/smoke-refiner-live.mjs` 增加从内部 DMG 安装副本运行的选项，保持独立数据与唯一截图路径。在**同一当前** `desktop-plugin-gate-20260926` DMG 的隔离安装、`output/qa/desktop-current-refiner-20260926-run1/` Git/SQLite 中，用户先明确 Trust 项目，保存“修复空邮箱也能通过登录校验的 bug，补充回归测试”消息，再主动点击「整理为草稿」；现有合法 Codex 登录的模型整理器返回 `needs_clarification` Draft（询问仅含空白字符的邮箱是否也应判无效）。脚本 **exit 0**；[实际安装版草稿截图](../output/playwright/desktop-current-refiner-20260926-generated-draft-1440x900.png)已目视核对。只读 SQLite `quick_check=ok`、1 Draft、**0 Task / 0 Run**，fixture Git clean、`package.json` 未变。整理器与 Coding Executor 仍是不同接口；本次没有代用户回答澄清、批准 Task 或自动启动开发。

这补齐当前包的 P1-03～05/P4-07 模型整理正向入口验收；不是 Claude 第二执行器、全部自然语言意图/澄清边界或完整人工审批的组团通过。原常驻空数据应用未动，DMG 字节、依赖、schema 与权限未变。下方另一独立安装的 Knowledge/Memory 新 Run 证据和默认 Codex 完整交付证据各有独立数据，不能互相冒充同一 Task。

## 当前安装版 Knowledge / Memory → 新 Run 的来源链 · 2026-09-26

在**同一当前** `desktop-plugin-gate-20260926` DMG 的另一个独立安装副本与 `output/qa/desktop-current-context-20260926-run1/` 可丢弃 Git/SQLite 中，`scripts/smoke-python-vertical-live.mjs` 使用已有合法 Codex 登录执行一次真实 Run，**exit 0**。只读导入真实 `docs/context.md`，由来源片段提出记忆并经 fixture Owner 明确确认；故意导入矛盾章节时 `run.start` 返回 `CONTEXT_REQUIRES_HUMAN`，无命中时返回 `CONTEXT_NO_SOURCE`，没有把未经裁决的内容送给执行器。之后明确批准的 TODO 由 `gpt-6-sol` 在隔离 Worktree 运行成功，Run `0de98a50-ade8-49e1-aea1-18491088d8a4` 的 SQLite 冻结 ContextBundle 同时含 `validated_memory` (`memory:e0b1ac51-47f1-4d7c-ab87-769b1904a874@2`) 和低信任 `retrieved_knowledge` (`knowledge:0f5e19d9-9303-43e4-88cd-0a16bf421da0@1#0`)；`executor_context` 的正式调用链把这份 Bundle 送入 Codex request，源 Git status 仍 clean。 [当前安装版来源页](../output/playwright/desktop-current-context-20260926-context-source-1440x900.png) 为实际 Vue/Electron 截图并已目视核对。

此 Run 完成后，fixture Owner 撤销记忆和导入来源；同一 Run 的历史冻结引用仍可在 UI 查看并标为 `revoked`。在该 QA SQLite 的一致性副本上调用当前 `StageContextBuilder.preview`，同一检索词返回 `insufficient_sources`、零条当前 Knowledge/Memory 来源，证实后续组装不会继续引用已撤销内容；原始 QA 库 `PRAGMA quick_check=ok`。本验收证明**当前 DMG 的来源进入新 Run**与撤销语义，不等于该 Task 已经 Review/Verify/Owner Done，也不等于 Claude 第二 Executor 已验。为避免覆盖历史 QA 证据，仅调整脚本在提供 `FORGE_VERTICAL_ARTIFACT_TAG` 时的截图和 Diff 输出路径；没有修改产品包字节、依赖、SQLite schema 或凭据。

## 当前同一 DMG 的真实 Codex 业务闭环与取消 · 2026-09-26

为验证本轮 `run.start` 插件门禁没有误挡正常执行，使用已有合法 Codex 登录与当前授权额度，在**当前相同** `desktop-plugin-gate-20260926` DMG 的独立安装副本、`output/qa/desktop-current-full-20260926-run1/` 可丢弃 Git/SQLite 上运行一次在线正向任务与独立取消，`scripts/smoke-python-vertical-live.mjs` **exit 0**。当前源码仅在事后把 QA 输出字段从易误解的 `formalAcceptance` 改成准确的 `acceptanceAtHandoff`；没有因此重跑模型，产品包字节未变。

用户消息→人工草稿/修订→版本审批只进 TODO→明确 Start 后，Codex Run `4efb0de4-e86f-496c-84c8-d1c23c4ca909` 真正在 Forge Worktree 修改 `math.js`/`test.js`，快照 `1b531822-7299-4f50-a735-bdf86c545a1a`；源 Git HEAD/status 与原 `math.js` 未改。已批准的真实 `node test.js` Verify `df31817a-85c7-4baf-b7e8-e6df54d490a8` 为 **passed / exit 0**，本快照 AC-01 证据被明确关联；独立 Codex Review `a17d1f09-b2f3-4497-bebc-30ce59134aea` 为 **approved**。之后本地 Owner 决定 `cd5becf6-6e61-4205-8ef3-5d7f5835ce9b` 才令 Task `092b5e9c-29a5-43d7-afaf-d59cf47e4ac4` 为 Done，交付 `070631c1-6d53-4730-bbc1-661b57596873` 留在本地，**没有自动合并、推送或部署**。[当前包验收矩阵](../output/playwright/desktop-current-full-20260926-matrix-1440x900.png)、[Review](../output/playwright/desktop-current-full-20260926-review-1440x900.png)、[人工接受与交付](../output/playwright/desktop-current-full-20260926-accepted-1440x900.png)是该安装版截图并已目视核对。

第二个独立 Run `ec67340e-fa5e-47c7-854f-8006561090fb` 正在执行时经 Forge 取消，落库 `cancelled`；归属 app-server 已退出、取消后观察窗口内 `math.js` 无继续写入、无 Handoff，第二任务重启仍非 Done。相同安装应用退出重开后 Host 看板读回第一任务 Done/交付与第二任务 TODO；隔离 SQLite schema35、`quick_check=ok`，含 1 Verify 报告、1 Review 报告、1 最终人工决定、1 交付。此场景不覆盖 Review blocker 自动返工、带知识的新 Run、用户数据库 Restore 或跨平台/第二执行器。常驻的独立空数据 QA 应用仍保留给用户，在线 fixture 也保留；没有覆盖日常数据。

## 最新内部包的独立常驻 Desktop QA 入口 · 2026-09-26

没有覆盖旧 Demo：从当前 `desktop-plugin-gate-20260926` DMG 另装 `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA 20260926.app`，为用户保留 `/Users/iamzjt/Documents/Forge Desktop QA 20260926/Open Forge Desktop QA.command` 和独立可丢弃 Git `project`/空数据目录。启动器实际打开应用且保持运行（启动 PID 75349），包内 Python Host 与 sandboxed Renderer 子进程在，独立 SQLite `quick_check=ok`、schema35、0 Project/0 Task。新数据需要用户自己在 UI 明确信任项目；旧 Demo 的历史记录未复制或伪装为当前在线运行。该内部安装仍需外部 Git/Codex CLI/合法登录；详细操作在 [内部包演示说明](demo/p6-internal-macos-package.md)。当前包已有安装版项目双向切换与插件停用门禁证据，但这份**新空数据**还没有真实 Agent Task。无提交、推送或发布。

## Desktop 安装版插件停用阻断与当前包回归 · 2026-09-26

最新内部 macOS arm64 QA 包为 [desktop-plugin-gate-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-gate-20260926.dmg)，版本 0.0.1、SHA-256 `028e33ee66f798b8f6323a2ea44c4cdd2250bb07a300b40e4d64b69fb7d961fe`、326,375,086 bytes，仍是 **INTERNAL / ADHOC / UNNOTARIZED**。从 DMG 复制安装、包内 Python Host/SQLite schema35 与安全 Renderer smoke 通过。此前的 `desktop-owner-return-ui-20260926` 包仍保存同包真实在线 Verify 失败→自动返工→复验→Review→人工接受证据；新包只改插件停用原因及公开错误码，**未重复付费模型任务**。

插件停用的实际桌面缺口已修复：Python Host 的 `run.capabilities` 在当前进程提供 `RUN_PLUGIN_UNAVAILABLE` 警示，停用后重启无 Executor 时返回同名错误；`run.start` 也明确拒绝，Main 不再把它压成 `INTERNAL_ERROR`，任务抽屉说明需要在「插件」启用并重启。新安装版在独立 Git/SQLite fixture 中人工批准 Task 至 TODO，插件页停用后直接尝试启动获得 `RUN_PLUGIN_UNAVAILABLE`，看板仍 TODO/零 Run、源 Git clean；重启仍停用，启用偏好在下一次重启才生效。[插件停用](../output/playwright/desktop-plugin-gate-20260926-disabled-1440x900.png)、[任务抽屉阻断](../output/playwright/desktop-plugin-gate-20260926-run-blocked-1440x900.png) 为当前安装版实图。没有执行模型、项目脚本或真实用户项目。

同一新 DMG 的另一独立 fixture 从原生目录选择到只读 Probe、人工 Trust，并再导入第二个独立 Git 仓库；UI 往返切换时 Host 的 `project.active` 与当前项目一致。取消移除、确认「Remove from Forge」、重启后保留另一项目并重新设为当前、最后移除两条 Forge 记录均通过；两个源仓库文件、`.git`、HEAD 与工作树未变。[选择](../output/playwright/desktop-project-remove-20260926-choose-1440x900.png)、[探测](../output/playwright/desktop-project-remove-20260926-detected-1440x900.png)、[信任](../output/playwright/desktop-project-remove-20260926-trust-1440x900.png)、[多项目切换](../output/playwright/desktop-project-remove-20260926-switched-1440x900.png)、[移除](../output/playwright/desktop-project-remove-20260926-removed-1440x900.png) 是安装版实图。新包还从**既有真实、独立 QA SQLite** 重启读回自定义 Workflow/Profile/Reviewer 模型冻结、Done/Delivery、Verify 及 `retrieved_knowledge`+`validated_memory` 两种真实 ContextBundle 来源；这只是旧 Run 的同数据读回，**不是新包再次执行知识检索或 Codex**。[当前包来源页](../output/playwright/desktop-plugin-gate-20260926-context-sources-1440x900.png)。该历史 Run 的命令预设早于冻结锁，读回脚本用显式 `LEGACY_PRESET` 选项接受历史缺失；生产 Host 对其新的不安全 Verify 仍拒绝。

本轮 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 参考资料 warning）、`pnpm validate:task-map`（92 Task/120 Case/84 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm py:check`（210 pytest、Ruff、mypy）、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:package:mac`、安装版插件/项目/历史来源专项和 `git diff --check` 均 exit 0。一次新增插件专项在发现公开错误码缺失时失败，一次重启后发现 Host 未附着 Executor 仍泛化 `MODEL_UNAVAILABLE`；两处已修复并复跑通过。没有新增依赖、SQLite migration、凭据、网络入口、提交或发布。

**Desktop 完整交付仍未达成**：Review blocker 自动返工的当前包在线链、应用内安全 Restore/升级 cutover、全新 Finder 账户、Windows/Intel、Claude 第二执行器、Developer ID/公证继续保留原未验/阻塞状态。P7/P8 手机与远程新增开发保持后置，未完成远程写继续拒绝。

## Desktop 安装版自动 Verify 失败与有限返工闭环 · 2026-09-26

在**同一当前内部 DMG** `desktop-owner-return-ui-20260926`（版本 0.0.1、SHA-256 7120dd359515bb031edc5433ab115c29628eade779c128435a4902db22ce1ddb）安装应用和独立 `output/qa/desktop-verify-rework-20260926-run1/` 数据/可丢弃 Git 仓库中，Desktop 项目页保存并经本机人工确认批准 `node verify.js`，然后人工批准 Task 至 TODO、明确 Start。首轮真实 Codex Run `4165fb5f-bbfe-4346-8677-9e5f74957bec` 形成快照 `2a9e5e16-6d70-45a9-b44a-13bfe502e238`；Desktop 任务抽屉明确执行该已冻结命令，真实 exit 1，报告 `1df40097-0e21-4020-b00a-da8ec05fd76b` 为 **failed**，原始 stderr 可读，未误判通过。Host 记录有界 Verify 返工 Cycle `81991bd9-75f7-4021-80ef-aad03b27f887`，把这份失败报告作为 `verify_evidence` 放入下一次 ContextBundle；独立 Codex Run `40a41d30-2eda-4e79-b8a5-a10428869822` 从上一冻结快照创建隔离工作区，真实修改 `math.js` 的报错文案，形成新快照 `fd3e3bed-73cc-417d-a3ff-42783dda4f9b`，Host 自动对同一冻结预设复验 exit 0，报告 `140efda6-53f0-415f-b626-346ef4f6a5cc` **passed**。两个 Run 都 succeeded，但在 Review/AC/Owner 决定前 Task 仍非 Done；源 Git HEAD/status 始终未改。[失败与通过报告](../output/playwright/desktop-verify-rework-20260926-verify-history-1440x900.png)、[返工状态](../output/playwright/desktop-verify-rework-20260926-rework-passed-1440x900.png)均为该 DMG 安装版实图。

随后**复用同一真实数据，不重跑开发模型**：已安装应用的“明确启动只读 Review”启动独立 Codex 审查，当前新快照报告 `1cb1efb8-3e32-40a8-bde1-a3f19f10bfc1` approved；Desktop UI 将本次 passed Verify 报告绑定 AC-01，经本机 Owner 明确接受后 Task 才 Done，交付 `59ab183f-cd56-4697-afde-47687de731d5`。应用退出重开，Cycle、两份 Verify 报告、Done 与交付仍在；未自动合并、推送或部署。[人工验收实图](../output/playwright/desktop-verify-rework-20260926-owner-accepted-1440x900.png)。第一次纵向脚本**仅在终态截图阶段**因已打开抽屉遮挡侧栏按钮而 exit 1，真实两轮 Run/Verify 均已完成；修正脚本导航，使用保留的隔离库进行安装版续验 exit 0，并保留该失败记录。`node --check`、`pnpm lint`、`pnpm validate:task-map`（92 Task/120 Case/84 deferred）与 `git diff --check` 已通过；此前同源码 `pnpm typecheck`、`pnpm test`、`pnpm py:check`、Desktop/package smoke 结果仍适用。此次没有修改产品运行代码、依赖、SQLite schema 或安装包字节。此证据覆盖当前安装版 T058 的 exit code 权威子场景，不把其他 T051～T060 用例成组记为通过。

**仍未收口**：当前最终包上 Review blocker 自动返工全链尚无新的在线证据；应用内安全 Restore/切换、正式签名更新、新用户 Finder 实测、Windows/Intel 与 Claude 第二真实执行器继续未验。P7/P8 仍后置；本轮没有动用户日常项目或数据库。

## Desktop 安装版返工与配置版本复验 · 2026-09-26

**当前源码与最新内部 QA 包**：[macOS arm64 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-owner-return-ui-20260926.dmg) 与相邻 .app，版本 0.0.1，SHA-256 7120dd359515bb031edc5433ab115c29628eade779c128435a4902db22ce1ddb，324,851,322 bytes，仍是 **INTERNAL / ADHOC / UNNOTARIZED**。从 DMG 复制安装后的包内 CPython 3.12.13、SQLite 3.50.4/schema35、安全 Renderer 和隔离数据保留 smoke exit 0。新包修正任务 Done 后验证报告面板误称“尚无冻结快照”的文案：已有报告仍可读，不能重复启动验证；Vue 回归测试和该包安装版[实图](../output/playwright/desktop-owner-return-ui-20260926-done-verify-current-1440x900.png)通过。

**真实 Owner 退回路径**：同源码的前一内部包 desktop-finder-path-20260926 在独立 output/qa/desktop-owner-return-20260926-run1/ 中，由 Desktop UI 使用已批准项目命令，真实 Codex gpt-6-sol 开发 Run cfbcbb94-0734-4236-acdb-ffa151c3b2b9、Verify bf556c8a-84d4-4049-86eb-289ba239f41a passed、Review 9ea1a96a-e0ac-4173-9ad0-eb02e45ad957 approved；Owner **在 UI 明确退回**快照 999eb132-eafb-4e26-be53-fc896eb164a3，Board 未变 Done。Host 以原决策反馈启动独立 Run 9087c097-c29f-47d0-b49d-04569d571d55，模型确实将指定 TypeError 文案及断言写入隔离 Worktree，真实 node test.js、Verify 报告 eac48161-f94a-4c12-865d-3111b0763cad exit 0、独立 Review 45422a1a-6eba-4011-94ae-009f57552ae3 approved。Owner 通过 UI 将新报告绑定 AC-01 后最终接受新快照 1e9757d5-00ea-4cf2-9b1a-e9ac7596ea1e，Task 才 Done；重启后交付 2eaf4cd7-3adc-4a2f-9341-81d83d43f79e 保留，源 Git HEAD/status 未变，未自动合并/推送/部署。[退回](../output/playwright/desktop-owner-return-20260926-owner-returned-1440x900.png)、[新快照待接受](../output/playwright/desktop-owner-return-20260926-rework-ready-1440x900.png)、[接受后](../output/playwright/desktop-owner-return-20260926-rework-accepted-1440x900.png)均为已安装应用实图。第一次纵向脚本在第二份 Review 报告中错误读取不存在的 reviewRunId 字段而 exit 1；已修正为 Run+Snapshot 匹配，并复用保留的真实 QA 数据完成后续 UI 验收，**未重复调用模型**。新 UI 包从 DMG 安装并重启读取同一 Done/两轮 Verify/Review/交付通过，但没有在新包重新执行相同在线退回。

**配置版本影响新 Run**：在上述最新包的同一保留 QA Project 中，用户从 Agents 页面把 Developer Profile 保存为 v2，在 Workflow 页面修改步骤名称、保存并发布 workflow.fixture.quick@2；实际“已发布版本差异”显示 v1→v2，旧两次 Run 仍锁 v1/Profile v1。[发布差异实图](../output/playwright/desktop-workflow-upgrade-20260926-published-diff-1440x900.png)。新任务经人工审批只进入 TODO，明确 Start 后真实 Codex Run 574e114d-437d-4758-8bf8-a94a219cdcb2 在隔离 Worktree 修改代码并通过 node test.js，冻结 Workflow v2 内容哈希与 Developer Profile v2，重启仍保持；源 Git clean。[新 Run 实图](../output/playwright/desktop-workflow-upgrade-20260926-v2-run-1440x900.png)。这个新 Task 状态是 **active**，Review、Verify、逐项验收和 Owner 接受尚未对它执行，绝不因 Develop 成功标 Done。此纵向场景见 [配置升级脚本](../scripts/smoke-packaged-workflow-upgrade-live.mjs)，exit 0。正常 UI 的 Profile、发布 Workflow 确实影响下一次运行，旧 Run 未被迁移。

本次回归：pnpm lint、pnpm typecheck、pnpm test（Web 120 项）、pnpm py:check（210 pytest/Ruff/mypy 68 文件）、pnpm validate:contracts（47 文件、0 error/4 既有 warning）、pnpm validate:task-map（92 Task/120 Case/84 deferred）、pnpm smoke:desktop、新 DMG 的 pnpm smoke:package:mac、两次安装版返工续验/配置升级及 git diff --check 均 exit 0。现有用户数据、参考包与持久 Demo 未覆盖。**桌面完整交付仍未收口**：当前包的全新退回全链一次性 exit 0 脚本待复跑；自动 Verify/Review 触发的失败→有限返工没有此包在线完整证据；应用内 Restore/安全切换、正式签名更新、全新用户 Finder 登录、Windows/Intel、Claude 第二执行器仍待对应条件/实现。P7/P8 继续后置，未完成远程写继续拒绝。

## Desktop Finder 风格依赖发现 · 2026-09-26

**非破坏性恢复演练增量**：从本节所述同一内部 DMG 安装应用，把用户界面导出的真实 QA SQLite **复制**到新建 `output/qa/database-recovery-rKe7OZ/isolated-app-data`，包内 Python Host 在这份副本上启动为 schema35/ready，Desktop 真实看板读回 Project `7c7d19e9-b144-4b4b-9706-b932a7eccadf`、Done Task `d7bfa582-59c6-4fe5-a7ac-bd31f93d759b`、Run `a831b745-04a4-4aa9-84cb-389dad4ad709` 与交付 `ba46510e-c6f6-4ac6-87f2-3745d0c632ca`；原导出文件 SHA-256 前后相同。[`scripts/smoke-packaged-database-recovery.mjs`](../scripts/smoke-packaged-database-recovery.mjs) exit 0，[恢复副本看板实图](../output/playwright/desktop-recovery-drill-20260926-1440x900.png)。这证明备份副本可由当前包读取，**不**构成用户原数据库替换、跨版本迁移或失败回滚的验收。

Electron Main 现在只为其**自有 Python Host 子进程**在继承 PATH 后追加已经存在、非目录符号链接的 macOS 标准 CLI 目录：当前用户 `~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`。继承系统目录保持优先；不启动登录 Shell、不解析用户 shell 配置、不修改全局 PATH，也不把 API Key 传给 Host。真正可用性继续由 Python Host 的固定 `codex --version` / `codex login status` 与 Executor capability probe 决定。安装包测试用仅 `/usr/bin:/bin:/usr/sbin:/sbin` 的子应用 PATH、隔离 Forge 数据和当前本机已有合法 Codex 登录，实测 Codex CLI 0.155.1/已登录、`executor.codex.available=true`；Git 为系统 Apple Git 2.54.0。无模型调用。这是**模拟 Finder 环境的安装版测试**，未在另一个新 macOS 用户会话里双击 Finder 真正验收。

最新内部 QA 包：[DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-finder-path-20260926.dmg) 与相邻 `.app`，`desktop-finder-path-20260926`，版本 `0.0.1`，SHA-256 `0d30f5db9729e84db798f9e4e1380620d7a0c4d9fb03e89cce0f9ce4d87362ff`，331,834,451 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。从该 DMG 安装 smoke 通过；同包 Finder 风格 PATH 下重启读取保留的真实 Run/交付/来源/Verify，设置页再经二次原生确认导出 SHA-256 `f50ce6b4f25ead0386abc90f77d7fb7f815d6d5668d7dfac77fb1ac12a576d31` 的 1,130,496-byte SQLite，独立 `quick_check=ok`。QA 导出文件位于 `output/qa/desktop-environment-20260926-run1/isolated-app-data/database-export-5tRLuf/forge-backup.sqlite`；[依赖实图](../output/playwright/desktop-finder-path-20260926-dependencies-1440x900.png)、[备份实图](../output/playwright/desktop-finder-path-20260926-backup-1440x900.png)。第二次同包安装还确认真实 `executor.codex.available=true`，无重复备份或在线模型调用。Main 单元 10 项、包安装及重启脚本均 exit 0；本轮全 `pnpm test`、Python 210 项、lint/typecheck 已记录于下文。

新包包含活跃返工状态自动刷新，但未在包内执行全新在线返工；用户备份恢复/迁移切换、真实 Finder 新用户登录、Windows/Intel、Claude、签名公证仍未验收。桌面交付继续未收口；P7/P8 继续后置。下方 `desktop-rework-status-20260926` 是上一相邻内部包。

## Desktop 有限返工状态刷新与当前安装包 · 2026-09-26

任务抽屉的有限返工面板此前在初次读取后只靠手工「刷新」，可能停留在“返工中”而不显示后续快照。现在仅当 Host 报告该 Task 的返工处于 pending/launching/running 时每 2 秒读取固定 `run.reworkCycles`；同一 Cycle 从活跃进入终态时通知任务抽屉刷新 Run、Verify/Review 和任务详情；卸载时清理轮询。Web 组件测试验证 Host 数据从 running→succeeded 且只通知一次；既有真实 SQLite/Git/子进程返工测试继续通过。**本包没有触发全新真实 Codex 返工**，不把 UI 测试写成在线 Agent 验收。

最新当前源码内部包：[macOS arm64 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-status-20260926.dmg) 与相邻 `.app`，`desktop-rework-status-20260926`，版本 `0.0.1`，SHA-256 `25d342b2cce2454b1b29e903cd98a8a0c7302172f018c9bda151a3f4a20c497d`，330,891,311 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。从 DMG 安装 smoke 通过；同包安装后重启读取保留的真实 Project/Run/冻结 Workflow/Profile/命令、Verify、Review、已撤销来源与 Done 交付，并由 Settings 导出 1,130,496-byte SQLite，独立 `quick_check=ok`、1 Project/1 Task、SHA-256 `f50ce6b4f25ead0386abc90f77d7fb7f815d6d5668d7dfac77fb1ac12a576d31`。备份 QA 文件在 `output/qa/desktop-environment-20260926-run1/isolated-app-data/database-export-yArMVE/forge-backup.sqlite`；[安装版 Settings 截图](../output/playwright/desktop-rework-status-20260926-backup-1440x900.png)。`pnpm test`（含 Web 119 项）、针对性 Rework 测试 8 项、Web typecheck、lint、包/重启 smoke 均 exit 0；Python 210 项检查来自本轮同一 Python 源码。失败→自动返工→再次 Verify/Review→人工接受的**本包在线完整链仍待验**，恢复/升级切换也未验。下方 `desktop-backup-20260926` 是上一内部包的保留证据。

## Desktop 数据备份导出补证 · 2026-09-26

**Desktop 完整交付仍未收口。** Settings 现可经固定 Preload/Main 通道、原生保存与二次确认对话框，请 Python Host 在无活跃 Run/Job/进程时用 SQLite online backup 生成一致快照，再只把 Host 自有备份复制到用户选择的新文件。Main 校验归属目录、规范化来源、文件名、类型、大小及 SQLite 文件头，拒绝符号链接、越界来源和覆盖已有目标；Renderer 只收到 Schema/大小/SHA-256，不得到数据库路径或 SQL。Web 入口禁用此本地操作。导出文件可能含项目路径、消息及 Task 历史；不含源代码、隔离工作区或外部 Codex 凭据。**当前没有经过验收的用户数据恢复/替换向导**，导出按钮不代表完整更新/回滚通过。

最新内部 macOS arm64 QA 包：[DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-backup-20260926.dmg) 与相邻 `.app`，构建标识 `desktop-backup-20260926`，版本 `0.0.1`，SHA-256 `5f812394f0e22c7ce254a18e4f3741b5ae9ecba5a505f79cc7f9912cb761465b`，329,801,681 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。从同一 DMG 串行安装的 package smoke 通过，包内 Python 3.12.13/SQLite 3.50.4/schema35、Renderer sandbox 与隔离数据保留均实测。另一次安装使用保留的独立 QA 项目/真实 Run，在 Settings 由页面按钮导出 1,130,496-byte SQLite，SHA-256 `f50ce6b4f25ead0386abc90f77d7fb7f815d6d5668d7dfac77fb1ac12a576d31`；独立只读 SQLite 检查 `PRAGMA quick_check=ok`、1 Project/1 Task。QA 导出留在 `output/qa/desktop-environment-20260926-run1/isolated-app-data/database-export-hD8imK/forge-backup.sqlite`；[真实安装版备份截图](../output/playwright/desktop-backup-20260926-backup-1440x900.png)。相同安装副本重读冻结 Workflow/Reviewer/命令、撤销来源、Verify 报告与未合并 Done 交付，exit 0；新包没有新在线 Codex Run。

本增量 `pnpm test`（含 Web 118 项和全 workspace/root）、`pnpm py:check`（210 pytest、Ruff、mypy 68 文件）、`pnpm lint`、`pnpm typecheck`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（92 Task/120 Case/88 deferred）、`node scripts/smoke-desktop.mjs`、新包 `pnpm smoke:package:mac`、`git diff --check` 均通过。首次 Desktop smoke 因固定桥清单未加新方法而失败，更新清单后重跑通过；首次重启脚本使用错误的预期 Workflow ID，在触发备份前失败，改用真实 ID 后同包通过。未掩盖这两个测试脚本错误。下一桌面缺口：安装版失败/返工的完整 UI 链、恢复演练/迁移切换、新用户 Finder 环境与正式发行前置；P7/P8 新增开发仍后置。

## Desktop 环境、验证入口与依赖检测补证 · 2026-09-26

**仍在 Desktop 完整交付过程中；不改变权威 Task/Phase 状态。** 用户可在正式「项目」页只读重新探测已保存且仍受信任的仓库，并保存/单独批准验证命令预设。Host 重新校验 canonical Git 身份，不接受 Renderer 在重启后补传任意路径；预设只对新 Run 生效。本轮发现旧 Run 原先只锁预设 ID，新增不可变 `CommandPresetLock`（ID、修订、批准哈希）并在 Verify/返工启动前校验：编辑及重新批准预设不能改变已有 Run 的实际命令。旧快照缺锁时安全拒绝，不冒用当前命令；生产 schema 仍为 35。任务抽屉可针对本次冻结 CodeSnapshot 明确启动已批准预设；原始 stdout/report 与失败反馈来自 Python Host。Settings 新增只读本机依赖卡，通过固定 `system.dependencies` 命令读取**当前 Host 启动环境**的 Python、Git、Codex CLI 版本/登录及代理是否已转发；不执行模型、项目脚本，不显示 CLI 路径、凭据或代理 URL。Codex CLI 已登录不等于 Executor 已可运行，仍以 Agents/Plugins 的实际 capability probe 为准。普通 Web 没有此本机能力。

最新当前源码内部包：[macOS arm64 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-dependencies-20260926.dmg) 与相邻 `.app`，构建标识 `desktop-dependencies-20260926`、版本 `0.0.1`、SHA-256 `185bba1e93ead9b8d90a8ca1cbb236aa485ede15cab3a18c55d49df593438cb0`、331,720,183 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从该 DMG 安装、启动、检查包内 Python/SQLite schema35、隔离数据保留及安全渲染器通过。`scripts/smoke-packaged-desktop-restart.mjs` 对**同一包**从 DMG 重新安装并读取下述保留的真实 Run：冻结 quick Workflow v1/Reviewer `gpt-6-sol`/预设修订及批准哈希、Verify `passed` exit 0 + 原始 stdout、两条撤销来源、Done/未合并交付均核对通过；Settings 实际显示 Git `2.55.0`、Codex CLI `0.155.1` 与当前用户登录已检测。真实安装版截图：[依赖](../output/playwright/desktop-dependencies-20260926-dependencies-1440x900.png)、[项目命令](../output/playwright/desktop-dependencies-20260926-project-environment-1440x900.png)、[Verify 原始输出](../output/playwright/desktop-dependencies-20260926-verify-report-1440x900.png)、[冻结 Reviewer](../output/playwright/desktop-dependencies-20260926-frozen-reviewer-1440x900.png)。当前 QA 数据继续保留在 `output/qa/desktop-environment-20260926-run1/isolated-app-data`；新包**没有**再次调用模型，在线 Codex 开发/Review 发生于前一 `desktop-environment-20260926` 包，不能说是新包的一次全新在线执行。

验证：`pnpm test`（Web 118 项及全 workspace/root 测试）、`pnpm py:check`（209 pytest、Ruff、mypy 68 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm smoke:desktop`、`pnpm smoke:package:mac`、`pnpm validate:contracts`、`pnpm validate:task-map`、`git diff --check` 均 exit 0。依赖探测的单元/Host 方法白名单测试和安装版页面核对均通过。一次**并行挂载同一 DMG** 的 QA 尝试导致 `hdiutil attach` 失败，镜像 `hdiutil verify` 校验有效、仅针对本次镜像设备 eject 后串行安装 smoke 通过；首次串行重启脚本又在等 Verify 面板时报超时，紧接着同一 DMG/同一数据串行重跑 exit 0。保留这两次失败记录，不把重复通过视为完全消除冷启动波动。

下一桌面缺口：安装版失败→返工→再次 Verify/Review→人工接受的正向/异常链，以及用户可操作的备份/迁移恢复和新用户 Finder 环境依赖/凭据引导。Windows x64、macOS Intel、DPI、Claude 第二真实执行器、Developer ID/公证、正式升级/回滚和手机私网真机均未验证；桌面里程碑尚未收口，P7/P8 新增工作继续后置。

## Desktop 优先首批缺口实测 · 2026-09-26

首轮补证对应 P5-11/P6-09/P5-08/P4-06/P4-02，**不改变原权威 Task DONE 或 P6 BLOCKED 状态**。当前源码先通过 `pnpm validate:task-map`（9 Phase/92 Task/120 Case/88 deferred）、`pnpm validate:contracts`（47 文件/0 错误/4 既有参考警告）、`pnpm py:check`（205 pytest、Ruff、mypy 67 文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 Web build 和 114 项既有 Web 用例）、`pnpm smoke:desktop`、`git diff --check`。自定义 Workflow/来源相关的 5 个真实 SQLite pytest 也单独通过；它们不能代替在线模型验收。

随后从源码生成并实际安装 `desktop-priority-20260926` 内部 arm64 DMG（SHA-256 `8d8f3a091a8d5abba05f7e619f50c51cac9e85680df6604fe1febf8e589f18`）。在独立 `output/qa/desktop-priority-20260926-run2/` Git/SQLite/安装目录上，已授权 Codex 0.155.1 / `gpt-6-sol` 真实执行 Run `35a7d24d-bedd-4edc-a34b-5251fba8ccf2`：已发布 `workflow.fixture.quick@1`、Developer `profile.fixture.workflow.developer@1`、Reviewer `profile.fixture.workflow.reviewer@1` 与 Codex 插件版本/哈希均冻结；只有隔离 Worktree 的 `math.js`、`test.js` 被修改，源 Git clean。导入 `docs/context.md`，从真实 chunk 人工确认 `date.filter` 记忆；Host 拒绝无来源/冲突来源，当前查询把 `knowledge:0d43fd19-72d2-411a-b764-187653ce322a@1#0` 和 `memory:3404d5f4-8561-462c-a00d-3b337b4a9737@2` 一同放入该 Run 冻结的 ContextBundle，UI Context 页展示；撤销后新记忆检索无命中，历史 Run 两条来源均为 revoked，冻结输入未改。Verify `a1d41ca2-976f-44b9-b6b6-26aff2abaa33` 真实 `exit 0`，Review Job `0d3211b2-69ee-46bd-9705-f99132feb91a` approved 且 SQLite 的 Reviewer ID/版本/模型与冻结 Workflow 一致，逐项 AC-01 判断后本地 Owner 决定 `2b3d194a-52bb-434b-8d05-cde1a2a69155` 才令任务 `6fd93f83-b341-493d-be29-4459558096ec` Done；交付 `a3dc4f51-5154-4a9e-a115-161b18c9dce5` 未自动合并/推送/部署。合并验收命令 exit 0；旧 `f1f01724-...` 脚本 exit 1 仍作为历史，不能篡改为通过。

重启证据没有再次调用模型：新写的 `scripts/smoke-packaged-desktop-restart.mjs` 从同一 `desktop-priority-20260926` DMG 重新安装，读取保留的隔离数据库，真实 Host/Board/Run/交付/来源均一致，exit 0。目视检查发现任务抽屉仍把冻结 Reviewer 错显为内置，并把已 Done 的不可再次 Start 误写为 Codex 不可用。现已让 UI 从本次 Run 的 `run.config` 显示锁定 Reviewer，并按该 Profile 的模型/版本提交 Review；缺失/不可用时禁用。已 Done 显示真实任务状态，Review approved 不再声称 Verify/Owner 必未完成。组件针对性 5 项、Web typecheck 和 ESLint 通过。

最后独立构建 `desktop-priority-final-20260926` 内部 DMG：[安装包](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-priority-final-20260926.dmg)，版本 `0.0.1`，SHA-256 `7ff8aedd3d32504e9aad80eded81d1936de1e652c08850d1b279a47d1f4aa890`，330,948,543 bytes，**INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 再次从 DMG 安装并验证包内 CPython/schema35、sandbox/contextIsolation/Node 禁止、干净 PATH 下真实外部 Codex 不可用、退出后 QA 数据保留，exit 0。对**该最终 UI 包**再次从 DMG 安装，读取前述真实 Run 的保留 QA 数据：Done/交付/Workflow v1、两条历史来源、Review Job 的冻结 Profile/`gpt-6-sol`、修正后的 UI 状态均通过，`scripts/smoke-packaged-desktop-restart.mjs` exit 0。[重启看板](../output/playwright/desktop-priority-20260926-restarted-1440x900.png)、[Reviewer UI](../output/playwright/desktop-priority-20260926-frozen-reviewer-1440x900.png)。最终 UI 包未重跑新的在线 Codex Run；这一点继续作为「最终包全新在线链」待验，不把前一包结果冒充最终包。原持久 Demo 及两个资料包未动，QA Git/SQLite 留在独立 `output/qa/`，测试安装副本已退出并移除。

下一桌面缺口：复核正常 UI 的自定义流程 Review/Verify 人工正向与失败返工，以及 A～H 中配置/设置/依赖/备份与新安装版全链；Claude、Windows/Intel、Developer ID/公证和正式更新均保留原未验证/阻塞。手机/远程新增开发继续后置，P7/P8 Gate 未通过。

## Desktop 完整交付优先 · 2026-09-26

用户最新指令把当前里程碑设为 Desktop 全部已确认功能实际可用，P7/P8 手机、Companion、配对、远程 HTTPS/命令及跨设备新增工作从当前安全点后置。检查本机进程未发现活跃 Forge Host/Codex Run；未停止用户进程或丢弃写事务。Playbook/Autopilot 现先按 `docs/pdf-feature-operation-map.md` 的桌面 A～H 四层证据修复缺口。P8-02/05/06/07/08/10 的未完成工作用支持的 `DEFERRED` 状态记录排期；其他远程 DONE 和 BLOCKED 保持历史原状，权威 Task/Test ID、依赖、历史精确开发例外和安全门禁均不改。未完成远程写继续拒绝，正常 Desktop 无网络监听；P7/P8 Phase Gate 仍未通过。

当前桌面第一组缺口：已发布自定义 quick Workflow 的安装版测试误将 Develop 成功直接断言 Task Done，断言虽已修正，该脚本的重启与 Review/Verify/Owner 完整闸门尚未在当前代码/安装包复验；P5-08/P5-11 同一安装版的真实 Knowledge/Memory→ContextBundle→Run 来源链，以及 P4-06/P5-05/P4-02 Profile/模型/插件配置对新 Run 的作用也需补证。已通过的独立 Codex/工作区/默认交付和旧 Demo 证据保留，但不能自动代替最新安装包。Claude、Windows/Intel、Developer ID/公证和正式升级仍独立待验。桌面里程碑完成后报告并停止，不自动恢复 P7/P8。

## P7-09 双设备审批竞争本机补验 · 2026-09-26

新增隔离 Host/SQLite 与真实 loopback HTTP 用例：两个独立配对、同 Project 且持有 `task:approve` 的设备同时用不同命令 ID 提交同一新鲜审批，只有一个 `200` 入 TODO，另一个 `409 REMOTE_APPROVAL_STALE`；胜者重试返回原回执，另一设备读不到该回执，隔离库为 1 Task/1 对应远端回执/0 Run。`pnpm py:check` 实际通过 205 pytest、Ruff 和 mypy。未扩大公开命令白名单、设备权限或 HTTP 监听范围，也未调用模型。该用例只证明本机双设备会话竞争；远端拒绝、实体手机、私网 HTTPS、sleep/弱网与 P7-09/T100 全项仍未通过。当前最新 QA DMG 的产品代码未因这项测试变更而重建。

## 最新独立内部 QA 包：手机明确路由横屏保持 · 2026-09-26

[macOS arm64 内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-mobile-route-20260926.dmg) 与相邻 `.app` 标识 `mobile-route-20260926`，版本 `0.0.1`，SHA-256 `716ebcdc61c7c826636cce3bbc88fbcee094e2ab20c627c7a227b2fa48f4ca7d`，328,029,595 bytes，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。安装版检查发现：在不模拟触屏的 844×390 浏览器中，先前 `/#/m/messages` 会因媒体查询变宽而切回普通 Web 桌面壳；此前长输入断言发生在异步切换前，不能充当横屏验收。现已让明确的 `/#/m` 路由在 Web 横屏保持 Companion，Desktop 仍走自己的壳；Web 新增路由回归测试。

`pnpm smoke:package:mac` 从新 DMG 安装启动、确认包内 Python/schema35、安全边界与测试数据留存。`pnpm smoke:package:mobile-local` 从**同一新 DMG** 真正安装 Desktop，使用包内 Host 与独立 Git/SQLite，在 844×390 Chromium 验证 Companion 路由、中文长文本未提交草稿、可见键盘焦点、≥44px 底部导航目标和无页面横向溢出；回到 390×844 并重载后草稿原文仍在，未提交给 Host。[实际横屏输入截图](../output/playwright/mobile-route-20260926-packaged-landscape-844x390.png) 已目视核对。此安装版还重跑了离线审批不提交/不重放、显式二次确认入 TODO、同 Project 缩权清除旧 Host 消息和撤销清除缓存/Worker；隔离库 **1 TODO/0 Run**，测试拥有的 Host/监听已关闭。此前 `policy-fence` 包的全部正向结论仍在，但它的横屏截图是错误的 Web 壳，不能再作为横屏证据。

当前新源码的 `pnpm lint`、`pnpm typecheck`、`pnpm test`（Web 114 项，含 build）、`pnpm smoke:desktop` 通过；此前同一 Python Host 更改的 `pnpm py:check` 为 204 pytest/Ruff/mypy 通过，契约校验 47 文件/0 错误/4 既有警告、任务图 92 Tasks/88 deferred。此包只证明本机 macOS arm64/Chromium；实体手机、私网 HTTPS、完整远端 Run/Owner 写、同包付费 Codex 闭环和正式签名/公证/Windows/Intel 仍未验证，P7/P8 Gate 未通过。既有持久 Demo 和用户数据未覆盖。

## 前一独立内部 QA 包：设备策略修订与离线审批边界 · 2026-09-26

[macOS arm64 内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-policy-fence-20260926.dmg) 与相邻 `.app` 来自当前源码，版本 `0.0.1`，SHA-256 `937e284620d97213b6e226b47e5db307012ff03082c67177b6e2be52e1f7bdc7`，329,385,646 bytes，仍为 **INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从新 DMG 安装启动，确认包内 CPython 3.12.13/SQLite schema35、独立数据保留与外部 Codex 前置条件；测试安装副本已清理，既有持久 Demo 和用户数据未覆盖。

P8-06/P8-08 增量：Host 当前会话返回数据库中的设备 `policyRevision`；手机将 Project、设备、会话 ID 与修订一起作为 Host 读取边界。缩权或会话轮换时，旧 Task/Approval/详情/通知和消息读取不得回填；同设备未提交的本机文字不自动发送。移动 SSE 带原修订请求头，Host 每次轮询复核修订；同 Project 缩权也会使旧流关闭，旧修订重连返回 403，随后手机重新核对真实会话并清除已读 Host 文本。无新依赖、SQLite migration、付费调用或公网端口。Python 204 pytest/Ruff/mypy、Web 113 项、客户端 12 项、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件/0 错误/4 既有警告）、`pnpm validate:task-map`、Electron `pnpm smoke:desktop`、`git diff --check` 通过。客户端首次与并行构建竞争测试产物失败；顺序重跑 12 项通过，没有修改断言或检查脚本。

`pnpm smoke:package:mobile-local` 对**此新 DMG** 真实安装后完成 Desktop 消息/草稿审批→同一包内 Host 的本机配对→390×844 Chromium 读取消息→故意旧 CSRF 403 后再次人工确认→TODO 在 Desktop 与浏览器一致，隔离库 **1 TODO/0 Run**。另在审批确认弹层断网：确认按钮不可用，联网恢复前后无审批 POST 或自动重放；须重新查看当前范围并人工确认。随后 Desktop 把设备收窄成只读，手机保持有效会话但自动清除之前读到的 Host 消息；[缩权后截图](../output/playwright/policy-fence-20260926-packaged-narrowed-390x844.png) 已目视核对。Desktop 原生确认撤销后页面断开、已读正文和 Forge 静态缓存/Worker 清除，旧 cookie 返回 `403 REMOTE_AUTH_REVOKED`；[撤销后截图](../output/playwright/policy-fence-20260926-packaged-revoked-390x844.png) 已目视核对。测试控制器仅代行预览、配对、撤销三个预期原生对话框，测试拥有的 Host/监听已退出。

这仍是同机回环 Chromium，**不是实体手机或私网 HTTPS**；安装包没有执行付费 Codex Run、有效会话主动轮换或代理断流。P7-05 与 P8-09 仍 BLOCKED，P8-05/06/07/08/10 仍 IN_PROGRESS，P7/P8 Gate 与正式发布未通过；Claude、签名公证、Windows/Intel 条件仍开放。

## 前一独立内部 QA 包：P8-10 接口与移动会话边界 · 2026-09-26

当前源码构建的 [macOS arm64 内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-remote-session-20260926.dmg) 和相邻 `.app` 均标识 `remote-session-20260926`；DMG SHA-256 `e5369e497a0345b14d054a9510f7c49ada52cb0ef9441058f81843d38687f182`，328,661,673 bytes，仍为 `0.0.1` **INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从此 DMG 挂载、安装并实际启动，确认包内 CPython 3.12.13/SQLite schema35、独立数据、Electron 隔离配置、移除测试 App 后用户数据保留；包外 Codex CLI 仍为前置条件。[安装版首页](../output/playwright/remote-session-20260926-packaged-home-1440x900.png) 已目视核对。测试安装副本已按脚本退出并移除，原可录屏 Demo、用户数据和旧 QA 包未替换。

同一 DMG 的 `pnpm smoke:package:mobile-local` 在隔离 Git/SQLite 中完成安装版 Desktop 消息和审批请求→同包 Python Host 回环配对授权→390×844 Chromium 读取真实消息→故意旧 CSRF 请求收到 403、不自动重放→再次人工确认后 TODO 在 Desktop/浏览器一致；数据库为 **1 TODO、0 Run**。同包补验：浏览器再次读取 Host 消息时确有 `forge-shell-*` PWA 静态缓存；Desktop 原生确认撤销该设备后，页面自动显示 Host 未连接并清除已读 Host 正文，Forge 缓存与 Worker 注册也已清除；旧 cookie 的 `/v1/session/current` 返回 `403 REMOTE_AUTH_REVOKED`，而 Host 数据仍为 1 TODO/0 Run。本次监听和拥有的 Host 已关闭。[安装版消息](../output/playwright/remote-session-20260926-packaged-mobile-message-390x844.png)、[TODO](../output/playwright/remote-session-20260926-packaged-mobile-todo-390x844.png)、[撤销后空态](../output/playwright/remote-session-20260926-packaged-mobile-revoked-390x844.png) 已目视核对。此补验只改 smoke 脚本，DMG 字节和摘要不变；原生确认由测试控制器仅对预览、配对、撤销三个预期对话框代行。安装 smoke **没有**主动轮换有效手机会话、制造 SSE 无心跳或调用付费模型；这些故障路径仍由组件/客户端测试覆盖。**实体手机、私网 HTTPS、完整远端运行控制、v1.1 公开发布及 P7/P8 Gate 均未验收。**

## P8-06/P8-08 手机会话切换防护 · 2026-09-26

手机「消息」组件现在将 Project、设备和**会话 ID** 一起作为 Host 文本读取的身份边界。会话失效或轮换时立即清除页面中的 Host 会话/消息/草稿列表，并拒绝旧请求的迟到结果；用户未提交的本机文字在同设备短暂断连时保留。若重连后原会话已不存在，组件不会把这段文字自动指向第一条其他会话，须用户明确选择后才允许发送。新增组件测试覆盖迟到 Host 消息、会话失效、同设备新会话恢复和原会话消失后的显式选择。`pnpm lint`、`pnpm typecheck`、`pnpm test`（Web 111 项，含 build）及 macOS arm64 Electron/Python Host `pnpm smoke:desktop` 均通过；无新依赖、迁移或模型调用。此源码已装入上方新内部 QA 包，但安装版 smoke 未专门模拟会话轮换。这只关闭本机组件的会话污染风险，P8-06/P8-08 仍 IN_PROGRESS，私网 HTTPS、真机及远端敏感写未验收。

## P8-09 外部真机阻塞 / P8-10 独立交付开发 · 2026-09-26

P8-09 **BLOCKED**：尚无用户授权的实体 iOS Safari、Android Chromium 与私网 HTTPS 测试环境；本机 390×844 Chromium/回环安装版不能通过 T116～T120。用户已授权的精确 `P8-09 → P8-10` **development-only** 例外只放行与真机无关的 PWA 指南和 Capacitor 预留，不改变权威依赖或 P8 Phase Gate。P8-10 **IN_PROGRESS**：新增 [当前内部 PWA 指南](mobile/pwa-user-guide.md)（按 Apple/Google 官方安装文档注明未完成的安全前提）；`@forge/client` 定义 push/secureStore/scanner 类型化端口，浏览器适配器将三者全部标为不可用，移动「连接」页如实显示。构建后 Web 在本机 Chromium 390×844 实际打开连接页，DOM 显示 Host 未连接和三项原生能力未接入；[页面截图](../output/playwright/p8-10-browser-native-unavailable-390x844.png) 已目视检查。客户端 12 项与当时 Web 109 项、TypeScript lint/typecheck/test/build 和任务图校验通过；本地预览进程已定向结束。此源码也已装入上方新 DMG，但尚无原生实现、系统推送、实体手机安装或 v1.1 公开发布。T111～T115 未因此通过，P7-05/P8-08 和 P6 正式门禁继续保留。

## 前一独立内部 QA 包：P8-08 连接超时与通知隔离 · 2026-09-26

基于下方源码增量重新构建 [macOS arm64 内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-remote-reconnect-20260926.dmg)，相邻 `.app` 同标识 `remote-reconnect-20260926`；DMG SHA-256 `7f7e8c46ae2da02648c6aed4429800486979ab773e6a8d9b2735efebcafefc49`，324,288,597 bytes。版本仍 `0.0.1`，**INTERNAL / ADHOC / UNNOTARIZED**，包内 CPython 3.12.13、SQLite schema35。`pnpm smoke:package:mac` 从该 DMG 安装并实际启动同包 Host，验证隔离数据、移除 App 后数据仍在及外部 Codex 前置条件。[安装版首页](../output/playwright/remote-reconnect-20260926-packaged-home-1440x900.png) 已目视检查。

同包 `pnpm smoke:package:mobile-local` 再次真实安装后完成 Desktop 消息/手工草稿/审批→同一包内 Host 的本机授权回环→390×844 Chromium 消息回读→旧 CSRF 明确 403 且不重放→再次人工确认入 TODO→Desktop 看板一致；隔离 SQLite 为 **1 TODO、0 Run**，包拥有的 Host 和监听已退出。[手机消息](../output/playwright/remote-reconnect-20260926-packaged-mobile-message-390x844.png) 与 [TODO](../output/playwright/remote-reconnect-20260926-packaged-mobile-todo-390x844.png) 已目视检查。新超时与通知失效路径由客户端和 Vue 回归测试覆盖，**没有**在这个安装包上人为制造断流或完成实体手机/私网 HTTPS 测试，也没有新的付费 Codex Run。P8-08 仍 IN_PROGRESS，P7-05 和完整 P7/P8 Gate 仍 BLOCKED。

## P8-08 客户端连接超时与通知隔离 · 2026-09-26

`@forge/client` 对 SSE 建连设 10 秒、已连接流无字节设 15 秒上限；超时会中止本次请求并按既有有限退避重连。停止旧流后迟到响应不再能报告连接成功或推进游标。Mobile 站内通知是可选元数据：通知读取失败不阻挡 Task/Approval 权威快照和 SSE 游标更新；切换 Project、关闭通知或会话失效时忽略旧通知响应。`@forge/client` 11 项测试包含无响应、无心跳及停止后迟到响应；Web 109 项测试新增通知接口失败但 Task 仍更新的回归。`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm py:check`（204 pytest/Ruff/mypy）、`pnpm validate:contracts`（47 文件/0 错误/4 既有警告）、`pnpm validate:task-map` 与真实 Electron Desktop smoke/schema35 全部通过。该源码已装入上方新内部包；安装版未主动制造断流，实体手机/私网 HTTPS 仍未验收。P8-08 仍 IN_PROGRESS；重复 Start/真机弱网 T105、P7-05 公开 Run 写及 P7/P8 Gate 均未通过。

## 前一独立内部 QA 包：远端回执授权与 SSE 分帧增量 · 2026-09-26

当前源码新建的 macOS arm64 [内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-remote-boundary-20260925.dmg) 与相邻 `.app` 标识 `remote-boundary-20260925`；DMG SHA-256 `c6c41b4f11bbcab6b453d7022ca9d7101e9f6c8b964eab875767843f16ebe40e`，330,165,715 bytes。仍为 **INTERNAL / ADHOC / UNNOTARIZED**，Electron 44.4.3、包内 CPython 3.12.13/SQLite 3.50.4/schema35。`pnpm smoke:package:mac` 从新 DMG 实际安装/启动并验证隔离数据、安全窗口与包内 Host；[安装版首页](../output/playwright/remote-boundary-20260925-packaged-home-1440x900.png) 已目视检查。

同一 DMG 的 `pnpm smoke:package:mobile-local` 真正安装后，Desktop 保存消息、修订手工草稿和请求审批；同 Host 回环配对授权的 390×844 Chromium 读回消息。故意轮换 CSRF 的第一次批准被真实 403 拒绝，不会自动重放；再次明确审阅/确认后，Host 才进入 TODO，同一 Desktop 看板可见。包内 Python 查询独立 SQLite 得到 **1 TODO、0 Run**，本轮端口/拥有的 Host 正常结束；[安装版消息](../output/playwright/remote-boundary-20260925-packaged-mobile-message-390x844.png) 与 [TODO](../output/playwright/remote-boundary-20260925-packaged-mobile-todo-390x844.png) 已目视检查。两个预期的原生确认由受限测试控制器代行；这是本机浏览器布局证据，**不是**实体手机/私网 HTTPS，也没有新付费 Codex Run。旧 Demo、旧 QA 包及用户数据库未覆盖。P7-05 仍 BLOCKED，P8-08 仍 IN_PROGRESS，P7/P8 完整验收和正式发布未通过。

## P7-05 回执权限复核 / P8-08 SSE 分帧加固 · 2026-09-25

当前源码修复两处远端边界。Python Host 读取历史命令回执时，除校验原设备及当前 Project 外，还根据数据库中保存的命令方法重新检查该设备当前操作 scope；缩掉 `task:draft` 后不能再读旧消息回执。独立 Host 重启/SQLite 和真实认证 loopback HTTP 测试通过；既有回执不会被删除。`@forge/client` 的 SSE 读取同时支持 LF/CRLF 和跨读取片段分隔，以 UTF-8 字节限制帧大小，拒绝非法 UTF-8/残缺帧；CRLF 与多字节越界测试通过，事件仍须重新读取 Host 权威快照才推进游标。`pnpm py:check` 为 204 pytest + Ruff + mypy 通过；新增的 HTTP 断言使长 fixture 碰到既有 30 次写入限速（429），移除冗余 POST 后定向 HTTP 测试通过。此源码增量尚未装入上一份 `mobile-write-csrf-20260925` 内部 DMG；P7-05、P8-08、私网 HTTPS 和实体手机验收状态不变。

## 当前独立内部 QA 包：移动写入令牌轮换与人工重审 · 2026-09-25

最新 [macOS arm64 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-mobile-write-csrf-20260925.dmg) 与相邻 `.app` 标识 `mobile-write-csrf-20260925`，SHA-256 `cb8114047684894c70c5a61144731b38aedc6785c4324d6459b09b5ef04ee1db`，328,707,678 bytes。新包内仍是 Electron 44.4.3、CPython 3.12.13、SQLite schema35；`pnpm smoke:package:mac` 从此包挂载/安装/启动/退出通过，[安装版首页](../output/playwright/mobile-write-csrf-20260925-packaged-home-1440x900.png) 来自该应用。与上一个 QA 包相比，手机消息、手工草稿和审批三种写入口均能区分 Host 明确拒绝的旧 CSRF token：保留用户输入，刷新会话，要求重新审阅与人工提交；不会把拒绝当权限不足，也不排队或自动重放。Web 108 项测试通过。

同一新包的 `pnpm smoke:package:mobile-local` 再次真实安装到独立目录，完成 Desktop 保存消息/草稿/审批请求→同 Host 本机预览与设备授权→390×844 Chromium 读回消息。在审批最终确认前，测试从同源额外调用当前会话端点，故意轮换 CSRF：**第一次 POST 收到 403，页面提示本次未提交**；随后用户操作由测试控制器再次打开当前范围并最终确认，Host 才创建 TODO，同一 Desktop 看板可见。退出后包内 Python 查询独立 SQLite 为 **1 TODO、0 Run**；端口与拥有的 Host PID 已关闭。[安装版消息](../output/playwright/mobile-write-csrf-20260925-packaged-mobile-message-390x844.png) 与 [批准后 TODO](../output/playwright/mobile-write-csrf-20260925-packaged-mobile-todo-390x844.png) 已目视检查。原生确认仅对预期的本机预览和设备授权两个对话框由 fixture 控制器代行；未知对话框会失败。没有模型调用、真机或私网 HTTPS。旧可录屏 Demo 和所有旧 QA 包均未替换。P7-05/P8-05 及 P7/P8 完整 Gate 保持未完成；Claude、签名公证、Windows/Intel 继续待验。

## 上一次独立内部 QA 包：安装版跨端审批与 CSRF 拒绝反馈 · 2026-09-25

新增 [macOS arm64 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-mobile-approval-csrf-20260925.dmg) 与相邻 `.app`，标识 `mobile-approval-csrf-20260925`，SHA-256 `a24ccb3da54ae92c6deb4ba1cdb75bcd3951dfb38fd59afbe4a79fd725d31fc7`，332,000,332 bytes。它保留了下方旧 QA 包和用户可录屏 Demo，仍是 **INTERNAL / ADHOC / UNNOTARIZED**。`pnpm smoke:package:mac` 从这个 DMG 真正安装/启动，确认包内 Python 3.12.13、SQLite schema35、隔离数据、ad-hoc 签名及 clean PATH 下外部 Codex 不可用；[安装版首页](../output/playwright/mobile-approval-csrf-20260925-packaged-home-1440x900.png) 来自新包。

`pnpm smoke:package:mobile-local` 再次用**新包**执行 Desktop 保存消息→手工 Task Draft v3→提交审批→同一包内 Host 开启本机回环→显式配对/授权→390×844 浏览器读取消息/人工批准→Host 入 TODO→Desktop 看板显示该 Task。应用退出后，包内 Python 直接读取本次独立 SQLite：**1 个 TODO，0 个 Run**；监听和归属 Host PID 关闭。真实截图：[手机消息](../output/playwright/mobile-approval-csrf-20260925-packaged-mobile-message-390x844.png)、[手机 TODO](../output/playwright/mobile-approval-csrf-20260925-packaged-mobile-todo-390x844.png)，均已目视检查。测试控制器代行原生确认，fixture Project 在独立临时数据中准备；这不是另一台实体手机、私网 HTTPS 或付费 Codex 闭环。

上一轮安装版脚本意外额外调用 `GET /v1/session/current` 后轮换 CSRF、却未更新 Vue token，Host 按设计拒绝了审批 POST。现在手机审批页面对明确的 `REMOTE_CSRF_REJECTED` 显示“未提交”，清除旧待处理命令、请求刷新会话，并要求用户重新审阅与确认；**不自动重放写请求**。新增组件测试覆盖该拒绝路径。当前完整回归 `pnpm py:check`（204 pytest/Ruff/mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build、Web 105 tests）、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（92 tasks/88 deferred）、`git diff --check` 均通过。P8-05/P7-05 与 P7/P8 完整门禁状态不因此改为 DONE；真机/私网 HTTPS、远端 Run/Owner 写、Claude、签名、公证、Windows/Intel 继续待验。

## 此前源码独立内部 QA 包（消息历史与 CAS 补验）· 2026-09-25

新产物 [内部 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-product-history-cas-20260925.dmg) 与相邻同标识 `.app` 均来自本轮源码；DMG SHA-256 `3c915ca5c5247a82d925ae4c9970913d35a0c7de5782456bfefd875b38aaec52`，331,860,239 bytes。此包没有覆盖原可录屏 Demo 或上一次 `product-progress-20260925` QA 包。`pnpm smoke:package:mac` 对**这个** DMG 真实挂载、复制、启动与退出，验证包内 Python 3.12.13、SQLite schema35、Host/Renderer 安全边界、隔离用户数据和 clean PATH 下 Codex 不可用；安装版空工作区截图 [packaged home](../output/playwright/product-history-cas-20260925-packaged-home-1440x900.png) 已目视检查。

新增 `pnpm smoke:package:mobile-local` 使用**同一个 DMG**，安装到独立临时目录，利用受控 fixture 准备独立 Project/SQLite。从已安装 Desktop UI 保存一条中文用户消息、手工创建和修订 Task 草稿、提交审批请求；Desktop 原生确认后开启自身 Python Host 的本机回环预览，创建一次性配对并明确批准该 Project 的 `task:draft` 和 `task:approve` 权限。390×844 Chromium 作为手机布局浏览器连接**同一 Host ID**，读取刚保存的消息、审阅当前审批范围、显式最终确认，Host 将 Task 原子转入 TODO；同一已安装 Desktop 的看板读到该 Task，未自动开工。[安装版手机消息截图](../output/playwright/product-history-cas-20260925-packaged-mobile-message-390x844.png) 与 [批准后 TODO 截图](../output/playwright/product-history-cas-20260925-packaged-mobile-todo-390x844.png) 已目视检查。浏览器关闭、监听停止、Desktop 退出后，本轮拥有的 Host PID 已确认消失，临时 fixture 已清理；最终命令 exit 0，输出 `packaged:true`、`bundledHost:true`、`hostSchema:35`、`messageVisible:true`、`approvalEnteredTodo:true`、`desktopBoardObserved:true`。中间一次 smoke 脚本自行额外请求 `/v1/session/current`，轮换 CSRF 却未更新 Vue 内存 token，导致审批 POST 403；删除该测试干扰后批准通过。另一次仅因脚本切换看板后忘返回设置页，清理按钮不可见而失败；补齐导航后**完整重跑**通过。它仍是 **INTERNAL / ADHOC / UNNOTARIZED**；本包未重跑付费 Codex 完整业务、物理手机或私网 HTTPS，不能称完整产品或正式发行。原生确认由自动化测试控制器代行，不算真人设备验收。

## P7-05 远端修订 CAS 并发补验 · 2026-09-25

**P7-05 仍 BLOCKED；T093 仍 DEFERRED_VERIFICATION。** 在已配对、获 `task:draft` 授权的独立 Host/SQLite fixture 中，两条真实 loopback HTTP `tasks.revise` 请求携带相同 Draft 版本 2 和不同人工标题同时提交；仅一条返回 200，另一条 409 `DRAFT_INVALID_REVISION`。数据库只留下一个版本 3 和胜出命令的回执；败者不覆盖内容。这个证据覆盖已实现的人工 Task Draft 修订竞争，尚非两台物理手机经私网 HTTPS 同时更新已批准 Task，亦未开放 Run/最终接受等远端写。相应精确追踪更新于 `docs/deferred-verification.json`；不修改权威 T093 状态或 P7/P8 Gate。

本检查点回归：`uv --directory python run --frozen pytest tests/test_remote_commands.py -q` 6 passed；首次 `pnpm py:lint` 指出新增测试 `zip()` 缺显式 `strict=`，修正后 lint 通过；`pnpm py:typecheck` 67 源文件通过。当前代码的 `pnpm py:check` 204 passed、`pnpm test`（含 build）、`pnpm lint`、`pnpm typecheck`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase、92 task、88 deferred）、`pnpm smoke:desktop`（真实 Electron/Python Host/schema35）、`pnpm smoke:remote-devices` 及 `git diff --check` 均通过。新增并发测试在全量 Python 回归之后单独通过；其后仅修改了该测试的 `zip(strict=True)` 和文档。未运行新的付费 Codex 场景，也未在手机或 QA DMG 上验证本次增量。

## P8-06 有授权 Host 会话正文回读 · 2026-09-25

**P8-06 仍 IN_PROGRESS。** 手机「消息」页现在可显式读取当前授权 Project/会话中最多 20 条用户或助手文字，向前分页；Python Host 每次复核当前设备的 `task:draft` grant，只从真实 `messages` 表读取，工具/系统内容与附件不外传，单条正文只显示前 4000 字并标明截断。Web 使用闭合 Schema、同源固定路径与纯文本渲染，不缓存正文；断线、换设备或切会话即清除页面内历史。保存新消息后，已打开的列表从 Host 重新读取；旧的在途响应不能覆盖新会话内容。

真实构建后 Chromium 390×844 与独立临时 Python Host/SQLite/显式 fixture 配对，从当前 Host 会话读出两条真实中文用户消息，截图 [手机消息历史](../output/playwright/p8-06-mobile-host-message-history-390x844.png) 经目视核对。Python 真 HTTP 测试覆盖分页、长文截断、工具内容不外传、跨 Project/会话、非法 cursor 和只有 `task:approve` 的设备拒绝；Web 测试覆盖闭合 Schema、路径/顺序检查与恶意 HTML 按文本显示。浏览器 fixture 已定向停止并清理；首次自建 fixture 忘记初始化 Host 存储即失败，补上真实 `storage_health` 初始化后完成上述链路。私网 HTTPS/物理手机及澄清解答仍未验；下方 `product-progress-20260925` 内部 QA 包构建于本次消息历史增量**之前**，没有据其安装 smoke 声称新页面已打包。

## 当前源码独立内部 QA 包 · 2026-09-25

在不覆盖既有 Demo/安装目录的情况下，当前源码另行构建 `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-product-progress-20260925.dmg`，SHA-256 `a9f4812df03b98c5c9a4f5cb7362a55a2cb8cbfecabb7d40de9059351107c762`；相邻 `.app` 为同一构建。`pnpm smoke:package:mac` 指向**这个** DMG，真实挂载、复制到独立 QA 安装目录并启动后，包内 Python 3.12.13/SQLite schema 35、受限 Renderer 和 Host 连通通过；clean PATH 下未打包的 Codex 显示不可用。截图 `output/playwright/product-progress-20260925-packaged-home-1440x900.png` 来自该安装应用且已目视查看。此包仍是 **INTERNAL / ADHOC / UNNOTARIZED**，未替换当前可录屏 Demo，也没有在这个新包上重跑付费业务闭环或私网手机验收；不能称完整产品/正式版本。

## P8-06 / P7-05 真实消息→人工草稿→有限修订 · 2026-09-25

**P8-06 IN_PROGRESS；P7-05 仍 BLOCKED，P8 Phase Gate 未通过。** 手机「消息」现在可显式保存一条当前标签页的未提交文字草稿，离线编辑但不缓存/重放 Host 命令。用户把消息保存到 Host 后可亲自填写 Task Contract；移动端把真实 Host message ID 与本次用户决定 command ID 写入来源引用。Python Host 在同一 SQLite 事务内复核设备会话、CSRF、当前 Project/`task:draft` 授权、真实已完成用户消息所属会话、严格 Contract 和幂等键，创建带不可变修订记录的 Draft 与专属回执。用户可填写修订原因并修改标题、目标、验收文字、类型、优先级或工作流；Host 用当前修订 CAS，保存第二版和回执。因权威公开 `TaskRevise` 没有澄清答案、范围变化或删除验收的明确确认字段，这些操作仍拒绝并提示转 Desktop，不替用户补确认。不自动调用模型、批准、入 TODO 或启动 Agent。

真实构建后 390×844 Chromium→独立临时 Python Host/SQLite：设备配对由 fixture 控制器显式确认；一条中文用户消息→人工草稿版本 1→输入真实修订原因→版本 2。只读查询 SQLite 显示 **1 Message、1 Draft、2 Revisions、0 Tasks、0 Runs**，标题为用户修订后的内容；[移动修订实图](../output/playwright/p8-06-manual-draft-revision-390x844.png) 已视觉查看。Python 真 HTTP 测试覆盖来源跨 Project 拒绝、决策历史、同键重放/冲突、Host 重启回执、旧版本、未确认范围或验收删除、空原因；Web 组件/命令测试覆盖显式表单、来源、修订原因和不会自动创建 Run。此前离线页面草稿实图 `output/playwright/p8-06-offline-message-draft-390x844.png` 是旧构建完成的同功能检查；本轮最终构建重新运行了消息/草稿/修订的正向浏览器链。另一个构建后浏览器 fixture 刷新页面→显式读取 Host 授权草稿→审阅旧版→填写原因→保存版本 2，独立 SQLite 为 1 Message/1 Draft/2 Revisions/0 Tasks/0 Runs，`output/playwright/p8-06-reopened-host-draft-revision-390x844.png` 经视觉检查。私网 HTTPS、物理手机或已安装新版包仍未验收；完整 T011～T015/T091～T093 和 P7/P8 Gate 不据本次局部证据标通过。见 [ADR 0079](decisions/0079-remote-command-adapter-and-write-gate.md)、[ADR 0082](decisions/0082-mobile-static-shell-cache-boundary.md)。

最终回归：`pnpm install --frozen-lockfile`、`pnpm py:check`（204 pytest、Ruff、mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含生产 build）、`pnpm validate:contracts`（47 文件、0 error、4 条既有 warning）、`pnpm validate:task-map`（9 phase、92 task、88 deferred）、`pnpm smoke:desktop`（macOS arm64 Python Host/schema35）、`pnpm smoke:remote-devices` 与 `git diff --check` 均 exit 0。最新 UI 改动会在保存修订后重新读取已打开的 Host 草稿列表；浏览器截图来自该改动前的同一修订链，自动刷新另由组件测试验证。没有把本机回环结果标作真机验收。


## P8-08 重连与站内通知本机检查点 · 2026-09-25

**IN_PROGRESS；本机回环浏览器链路通过，私网 HTTPS/物理手机及重复 Start 仍未验收。** 按精确 `P8-07:P8-08` 开发例外，`@forge/client` 新增同源、cookie 会话绑定的固定 SSE 读取器；事件只作失效提示，成功读取 Host 的 Project-scoped Task/Approval 权威快照后才推进游标。`resync_required` 必须先得到不早于 Host 要求位置的快照；无效帧、未授权、断线和干净 EOF 均有有限重连/停用处理。手机 Inbox 的站内通知只读取 Host 已提交的最近 20 条事件 ID、种类、Task ID 和时间，不包含消息/源码/凭据，也不承诺后台推送或离线写入。断网时页面转为 Host 未连接，旧列表标为只读，操作禁用；联网或重开才重新验证会话和读取权威数据。Host 固定 `GET /v1/projects/{projectId}/notifications` 逐次验证当前设备 Project grant，越权、无会话头、非法上限拒绝；没有新增数据库表、模型调用或外部 listener。

实际构建后 Vue 390×844 Chromium 与独立临时 Python Host/SQLite 完成配对：页面在线时测试控制器用真实 Host 服务新增批准的 TODO，SSE 自动刷新任务数 1→2；打开通知显示真实已提交的 `p:19` 等事件，截图 `output/playwright/p8-08-mobile-notifications-390x844.png` 已视觉核对。导航离开页面后 Host 又新增 TODO，重新打开从权威快照显示 3 条任务，截图 `output/playwright/p8-08-reopen-authoritative-tasks-390x844.png` 已视觉核对；浏览器断网期间 Host 再新增一条，页面显示 Host 未连接/旧快照和禁用操作，恢复联网后自动读取 4 条并重建事件流。测试过程中发现浏览器 `fetch` 被提取为无上下文函数会报 Illegal invocation，已改为在调用处取用全局 `fetch`，重新跑完整浏览器链通过。Python HTTP 测试覆盖通知授权/上限；Client 测试覆盖事件、过期游标、未授权和不可信快照不推进游标；Web、Python 及合同/任务图检查通过。此证据不是物理手机或私网 HTTPS，也没有验证弱网重复 Start；T101–T105 仍按原追踪，P8-07/P8-08、P7/P8 完整门禁不标通过。见 [ADR 0080](decisions/0080-project-scoped-sse-invalidation.md)。

本检查点完整回归：`pnpm py:check` 203 pytest/Ruff/严格 mypy、`pnpm test`（含生产 build 与 4 项流测试）、`pnpm lint`、`pnpm typecheck`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（88 deferred）、`pnpm smoke:desktop`（Python Host/schema35）、`git diff --check` 最终均 exit 0。并发启动两个 Electron smoke 时，设备 smoke 因共享应用 SingletonLock 与另一 smoke 冲突失败；等待桌面 smoke 正常退出后，**单独重跑** `pnpm smoke:remote-devices` exit 0，未据并发冲突判断产品失败。当前内部已安装 DMG 未重打包；截图来自当前源码构建而非安装版。

## P8-07 PWA 静态外壳检查点 · 2026-09-25

**IN_PROGRESS；静态外壳与脱敏只读摘要已实现，真机安装/撤销仍未验收。** 按精确开发依赖例外 `P8-06:P8-07`，构建后的移动 Vue 路由加入 Manifest、真实 192/512 PNG 图标和从当前 Vite 产物生成的版本化 Service Worker。Worker 仅缓存固定 HTML、JS/CSS、Manifest 和图标；`/v1` Host API、POST、证据和任意文件不拦截，不排队或自动重放命令。额外本机摘要只保存最近 Host 确认的项目/任务/待批准/阻塞**数量**、设备 ID 和时间，不含标题、Project/Task ID、代码、证据或凭据，最多 24 小时且不超过会话到期；离线展示标为旧值，无操作能力。Python loopback gateway 仅为明确静态资源扩展白名单。连接页可清除 Forge 静态缓存、摘要并注销 Worker；本机会话撤销和 Host 策略撤销被下次联网检查发现时同样清理，无法确认时明确提示。Host SQLite 项目/Task 数据不由浏览器缓存管理。见 [ADR 0082](decisions/0082-mobile-static-shell-cache-boundary.md)。

当前 macOS arm64 的构建后 390×844 Chromium 真正注册 `forge-shell-…`；隔离 Host/SQLite 授权读取 Project/Task/Approval 后断网重载，页面标时展示脱敏数量，Host 未连接且无操作能力。真实截图 `output/playwright/p8-07-redacted-offline-summary-scrolled-390x844.png` 已视觉查看。首次测试时发现手机端把 Host 实际 `{revoked:true}` 错认成 `{status:'revoked'}`，导致服务器已撤销却误报失败；已修正客户端 Schema/组件测试并在 Python HTTP 测试锁定真实响应。第二次本机会话撤销：浏览器缓存/摘要/Worker 全空，Host SQLite 项目/任务仍各 1 条。第三次由隔离 Host 的策略服务撤销设备，手机下次联网检查明确提示撤销并自动清除浏览器两种缓存和 Worker；数据库仍有 1 Project/1 Task，截图 `output/playwright/p8-07-host-revoked-cache-cleared-390x844.png` 已视觉查看。`tests/pwa-build.test.mjs` 执行生成 Worker，断言 `/v1` GET、POST 和任意文件未被拦截；Web 测试覆盖摘要 TTL/字段边界及仅清 Forge 缓存，Python HTTP 测试确认静态资源提供和私有文件拒绝。此证据不是物理手机、私网 HTTPS 或当前旧内部 DMG 验收。P8-06 与 P8-07 均保持 IN_PROGRESS，P7/P8 完整门禁仍 BLOCKED。

## P8-06 移动既有会话消息检查点 · 2026-09-25

**IN_PROGRESS，移动草稿生成/修订和离线草稿尚未完成。** 精确开发依赖例外 `P8-05:P8-06` 只放行不依赖未完成危险操作的既有会话消息保存，不改权威依赖或 P8-05 状态。Python Host 新增经当前设备会话与 Project grant 校验的固定 `GET /v1/projects/{projectId}/conversations`，仅投影有限会话标题/修订/时间；cursor 与会话版本快照绑定，变化返回 409，不暴露消息正文/本地路径。手机「消息」页可选授权项目与 Desktop 已创建的会话，在有 `task:draft` 操作 grant 时按当前修订向原有 `conversations.send` 提交**仅文字、空附件**，Host 原子存消息和幂等回执；未授权、旧版、断线和未知结果不自动重发，未知结果只允许手工查询原命令回执。

实际构建后 Vue 390×844 浏览器→独立临时 Python Host/SQLite 完成一次性领取、测试控制器显式批准、会话版本 1→2 和中文消息持久化；图片 `output/playwright/p8-06-mobile-message-{saved,receipt}-390x844.png` 已视觉检查，SQLite 用户消息一条。该 fixture 批准不是同一 Desktop 或真机。新 Python 只读分页/越权/无效/过期 cursor、真实 HTTP 写和 Web 组件测试已覆盖。权威 `TaskCreateDraft`/`TaskRevise` 公开 payload 缺 Python Host 必需来源/决定字段，尚不能做无损映射；不得猜来源或制造批准。手机对话历史、离线跨页面草稿、澄清及修订仍为具体缺口；P7-05/P8-05/P8-06 不标 DONE，P7/P8 Gate 仍 BLOCKED。当前内部 DMG 未更新。

## 完整产品交付目标与当前工作 · 2026-09-25

用户已明确授权按权威任务图持续完成全部必做产品范围。内部 macOS Demo、P5/P6 阶段报告及已有测试是过程证据，不是项目终点；P4 Claude、P6 签名/公证/Windows/Intel/升级、P7/P8 私网与手机验收继续保持原阻塞或未验证状态。P7-05 当前仅 `conversations.send` 与 `tasks.approve` 两条严格授权正向写有真实 Host/CAS/持久回执证据，其他正向写仍关闭，任务保持 BLOCKED；P7-06～08 只按精确开发依赖例外推进。自定义 Workflow 的已安装版重启断言、知识来源进入同一真实 Run 的可追踪闭环也须补验。每个功能同时核对实现、用户入口、真实运行和验收；完整缺口追踪继续维护在 `docs/pdf-feature-operation-map.md`，不另建路线图。此目标不授权新付费模型、公开网络入口、自动提交/推送或发布。

P8-02 同一 Desktop 检查点：**IN_PROGRESS，私网 HTTPS/真机/扫码仍未完成。** Settings 中经 Main 原生确认可让当前受管 Python Host 显式开启仅 `127.0.0.1` 的同源本机 Web 预览；固定 `inspect/start/stop` 桥接不暴露任意端口/路径/命令，默认启动无监听，Host 退出前先关闭。实际 Electron 窗口→同一 Python Host ID→浏览器 HTTP claim→Desktop 查看 claimed→默认空权限中只选 `task:approve`→本机测试控制器确认→该 Host 会话回读真实 Project 与授权→关预览端口拒绝，全部在独立临时 SQLite/Project；测试控制器代行点击与原生对话框，**不是真人手机/私网确认**。另有独立 stdio Host 重启/关闭端口测试；截图 `output/playwright/p8-02-same-desktop-{preview,loopback}.png` 实际取自 Electron，未拍 nonce。`pnpm smoke:remote-devices` 通过（首次扩展 smoke 因两张设备卡导致「查看审计」定位不唯一而失败，限定原 fixture 设备后重跑成功）。无新外部依赖、付费模型、数据迁移或公网绑定。旧 DMG 尚无此增量；P7-10/P8 Gate 保持 BLOCKED。

P8-05 当前检查点：**IN_PROGRESS，完整 T101–T105 未通过。** 手机待处理页现在只针对 Host 已允许的当前 Task 草稿 `tasks.approve` 提供正向操作：固定同源 GET 重新读取经设备/Project/`task:approve` 授权的完整合同、scopeHash、actionDigest、修订、到期、权限和“无代码快照”；点击批准前和最终确认时各重新读取，不同范围/过期/已处理即停止，显式二次确认后 POST 闭合命令。重复点击在客户端被挡住；Host 的同事务 TODO/持久回执幂等仍是权威。断网不排队/不自动重放；提交后响应不明只提供原 commandId 的手工回执查询，不把未知结果冒充成功。构建后 Vue 在 390×844 Chromium 与隔离 Python Host/SQLite/一次性配对的真实浏览器流程完成审阅→确认→TODO→Task 详情回读“运行 0 次”；配对批准由测试控制器显式执行，**不是同一 Desktop UI 或手机真机**。截图 `output/playwright/p8-05-approval-{review,confirm}-390x844.png`、`output/playwright/p8-05-approved-todo-390x844.png` 是本轮实际浏览器页面（截图后仅调整权限文案）。Python HTTP 校验当前审批详情、无效 ID/查询、完成后 409 和授权缩小后 404；现有设备策略测试覆盖错版/错 hash、修订/过期、双设备一次性原子决定。Web 85 项测试覆盖三次新鲜读取、显式最终确认、范围变化、离线、错 Task 回执、断线后只查原回执。`pnpm py:check` 201 pytest/Ruff/mypy、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm validate:contracts`（47 文件/4 既有 warning）、`pnpm smoke:desktop`（macOS arm64 Python Host/schema35）通过；增加两个写入拒绝请求到现有长 HTTP 测试一度触发其既有速率上限，撤回该冗余请求后定向测试 4/4 通过。T101 真机离线、T102 Desktop 改版后手机 409、T103 两设备实际并发/拒绝、T104 长中文方向切换、T105 弱网重复 Start 均未标 PASSED。权威公开命令仅有 approve-only `tasks.approve`，不允许把本机 `approvals.decide` 的 reject 任意公开；其他 Run/Owner 写保持 403，P7-05 仍 BLOCKED，P8-02 私网 HTTPS/同 Desktop/真机仍 IN_PROGRESS，当前内部 DMG 未更新。

P8-04 当前只读范围：**DONE；T101–T105 的跨任务手机验收仍 DEFERRED_VERIFICATION。** Python Host 在当前配对会话的 Project 授权下返回真实 Task Contract/AC、分页 Run 活动，以及已存 Review/Verify/Owner/Delivery 的有界历史证据元数据；没有原始报告、命令输出或任意文件下载。最新 Run 的持久 Diff 在 Host 做敏感路径筛选、已知凭据文本脱敏和 8192 字符内哈希 cursor 分页；无可分享文件明确 unavailable，旧 cursor 409。Web 手机详情折叠纯文本 Diff、按文件跳转，并在网络断开时清除详情与差异，保留上次 Task 列表为标时只读快照。隔离 Git fixture 的真实进程产出经重开 Host 配对授权读回 Diff/活动；真实 Review/Verify/Owner 服务产出的报告元数据也通过独立项目隔离测试。构建后的 Vue 在 390×844 Chromium/隔离 Host 展示有批准 Task 但无运行时的准确空态，截图 `output/playwright/p8-04-mobile-task-detail-390x844.png`；有 Run 的移动 Diff 分页由组件测试覆盖，未声称付费模型浏览器闭环。`pnpm install --frozen-lockfile`、`pnpm py:check`（201 pytest/Ruff/mypy）、`pnpm lint/typecheck/test`（含 build）、`pnpm validate:contracts`（47 文件/4 既有 warning）、`pnpm validate:task-map`、`pnpm smoke:desktop`（Python Host/schema35）、`git diff --check` 通过。首次定向 Web 测试因尚未重建 `@forge/contracts/dist` 而失败，重建后重跑通过；一次定向 Python 命令用错 uv 工作目录，改为仓库根目录后 6 项通过。当前已安装内部包尚无此新移动代码，P8-02 配对 QR/同一 Desktop/私网 HTTPS/真机仍 IN_PROGRESS，P7/P8 Gate BLOCKED。下一项 P8-05 已开始：批准/危险操作必须有新鲜 scopeHash 和人类明确确认，远端其他写继续拒绝。

P8-03 当前只读范围：**DONE；T101–T105 仍 DEFERRED_VERIFICATION。** 通过精确 `P8-02 → P8-03` 开发例外，Python Host 在当前会话 Project 授权下提供项目、可决定的 Task 草稿审批与 Board Task 的分页只读投影；task cursor 绑定 board revision，过期返回 409，未授权项目拒绝，客户端使用同源固定路径和闭合 Zod Schema。真实 Python Host/SQLite/loopback HTTP 两条已批准 Task 完成翻页，旧 cursor、无效路径、越权拒绝；Web 76 个组件/读取测试包括分页与失败。新构建 Web 在实际 390×844 Chromium 连到隔离 Host：待处理显示真实审批、任务页显示真实 TODO；停止 Host 后显示未连接、上次确认时间与仅内存只读快照，不把旧数据报作实时。截图：`output/playwright/p8-03-mobile-host-{inbox,tasks}-390x844.png`。本地 fixture 审批由测试控制器显式完成，**不是**同一 Desktop UI 或手机私网 HTTPS；P8-02 继续 IN_PROGRESS。当前 Board 并未产出 `awaiting_acceptance`，完整交付待处理及正向审批/危险确认属 P8-05；澄清/消息属 P8-06；重连/重复 Start 属 P8-08。P8-04 已开始实现任务详情。完整产品、P7/P8 Gate 未通过。

P7-05 最新增量：Python Host 现按公开 `tasks.approve` 的 Approval ID、scope hash 和 envelope revision 严格映射本机批准，不接收客户端 actor、任意决策或其他本机命令。Host-owned 会话/CSRF、当前设备 Project 与 `task:approve` grant、Approval/Draft 新鲜度在写事务内复验；Approval→TODO→持久回执同事务。隔离 SQLite 的两台真实配对设备测试：首台成功，次台新请求 409、仅一个 TODO；错 hash/旧 revision 409、缩权/撤销后拒绝。实际 loopback HTTP 提交得到 TODO，原命令/回执查询一致，竞争新请求 409。此为当前源码本机协议证据，不是手机私网或完整 P7-05；其余公开写仍拒绝。完整 T091～T093 继续递延，P7-05 **BLOCKED**；见 ADR 0079。下段是此前只有消息写的历史检查点。

P7-05 增量：公开 `conversations.send` 的闭合入参可在 Host 持有的设备/Project/`task:draft` 授权下真正写入；schema34→35 同事务提交消息、conversation revision CAS、SSE 失效事件与持久命令回执。真实 loopback HTTP 验证原回执重放、同 key 改内容 409、旧 revision 409、两设备 key 隔离、私有回执 GET、重启保留、撤销/缩权后拒绝；非空附件因无正式存储 422。消息保存不自动调用模型。Task 并发 CAS T093、敏感 actor T091 和其他方法的 T092 覆盖仍待验，故 P7-05 **BLOCKED**，不把单方法通过等同整项完成。此前仅候选映射/全写 403 是历史检查点；见 ADR 0079。实际用户数据库升级、安装版与手机仍未验。

P7-09 当前检查：独立临时库上的真实 loopback SSE 在凭据到期时关闭，旧凭据 GET 401；Host 正常停止后流结束、HTTP 503，不继续返回缓存在线状态；单独启动的 Host+网关进程被定向 kill 后 SSE EOF/端口拒绝，重启后同一授权会话能从权威 Board 恢复空快照。无手机 UI/私网 HTTPS，不能据此声称 T100 完整通过；两设备抢审批因 P7-05 正向批准仍关闭，也没有离线审批补发路径。P7-09 保持 **BLOCKED**，`docs/remote/pilot-runbook.md` 只记录将来的试用安全闸门，P7-10 也不标通过。

P8-01 状态：**DONE（仅权威布局与路由范围；功能验收引用保留递延）。** 普通 Web 小屏使用独立移动 App Shell、Inbox 优先四项底部导航和整页 Task 详情固定路由；Desktop 仍保持原 AppShell。未连接可信 Host 时显示真实不可用状态、无上次确认时间，不制造任务或可点击审批。390×844 与触屏横屏 844×390 的实际 Chromium 页面清晰，底部目标最小 52px；Vue 65 tests 含路由与组件测试、TS lint/typecheck 通过。实际代码截图为 `output/playwright/p8-01-mobile-inbox-390x844.png`、`output/playwright/p8-01-mobile-landscape-844x390.png`。原始 T101–T105 不改 ID，离线审批/过期/双设备/真实输入/重连分别映射 P8-05、P8-06、P8-08 待验；P7-10 私网 HTTPS、安全闸门、真机仍 BLOCKED。旧已安装内部 DMG 不包含此移动代码。

P8-02 状态：**IN_PROGRESS。** 手机「连接」页现在使用闭合相对路径、同源凭据和 HTTPS/loopback 限制探测 Host；普通 Web 的开发端口没有网关时显示不可用并禁止提交。已有同源网关时允许手工输入一次性代码及设备名称，只有 Host claim 成功才进入等待状态，须在 Desktop 人工确认后再次向 Host 查询，成功会话从 Secure/HttpOnly cookie 回读；页面仅在内存保留一次性 claimSecret，显式断开调用 Host revoke，未用 localStorage/sessionStorage。当前 Desktop 设置页进一步增加**默认空权限**的设备授权勾选，仅提供实际已接通的消息保存 `task:draft` 与当前草稿批准 `task:approve`；本机原生对话框仍复核确切 Project/权限，操作不会启动远程网关。Vue 85 项累计测试中有项目选择→手工信任→配对→勾选单一 scope→最终命令字段检查；发现成功提示被随后的状态刷新清空，调整为刷新后显示，定向重跑通过。此前实际 Chromium 浏览器用新构建 `apps/web/dist` 和独立临时 SQLite/Project/loopback Host 执行：未配对 401 → 手工领取 202 → 主机批准前 pending → 测试控制器通过本机 Host Service 显式批准 → 浏览器重新查询并取得 Host cookie/项目 1 → 刷新仍连接 → revoke → 刷新回到未连接；`document.cookie`/localStorage/sessionStorage 未暴露凭据。最初真实 202 因前端 claim Schema 漏 `expiresAt` 被拒，补齐后用新 nonce 重跑全链成功。截图：`output/playwright/p8-02-mobile-gateway-unavailable-390x844.png` 与 `output/playwright/p8-02-mobile-loopback-paired-390x844.png`。这不是 Desktop UI 与同一 Host 的完整配对或真实手机私网 HTTPS；扫码、真机输入/证书、Host 与 Desktop 同实例配对、远端弱网仍待验证，P7-10 安全闸门/P8 Gate BLOCKED。

P7-06 状态：**DONE（当前显式 loopback 协议范围；私网 HTTPS/手机另验）。** 增量 schema32→33 用同事务触发器记录最小 Project 事件索引，覆盖 Board、Conversation、Draft、Approval、Run、Review、Verify、最终接受；不把正文、凭据或 provider 原始事件塞进 SSE。认证 gateway 每次重新检查 session/Project grant，支持有界 `p:<seq>` cursor、5 秒心跳、30 秒流寿命、写超时、8 流并发上限及撤销/缩权关流；只读 120 次/10 分钟与配对/写入 30 次/10 分钟分开。真实 Host/SQLite/HTTP 证据包括旧库 Task/Run 保留、重启、Project 隔离、过期 cursor→权威 Board snapshot→新 cursor、重复订阅无重放（T094 协议路径）、缩权/撤销后退出。完整 `pnpm py:check` 194 pytest/Ruff/mypy、`pnpm test`（含 build）、lint/typecheck、contracts/task-map、macOS arm64 `pnpm smoke:desktop` schema33 和 diagnostics smoke 通过；首次 smoke 因旧 schema32 断言失败，更新期望后重跑通过。普通 Desktop 仍不开监听。T091～T093 正向写、私网 HTTPS/真机及 outbox 物理保留策略尚未验收/实现；P7-05 保持 BLOCKED，P7-07 开始。见 ADR 0080。

P7-07 状态：**DONE（Host/loopback 权限与旧审批拒绝范围；私网 HTTPS/真机另验）。** 增量 schema33→34 给既有设备默认空操作 scope，配对本机确认显示实际 Project/操作；Python Host 每次命令从可信 session 关联的 SQLite 设备记录重查 Project 与操作 grant。本机固定 `devices.pair.narrow/revoke` 使用版本 CAS，仅可缩小并记审计；撤销同时废止所有会话。真实 Draft/Approval 在修订后旧 revision/scope hash 返回 409，敏感及尚无精确映射的正向远端写仍 403。真实 loopback HTTP 验证缩权后旧 Project 命令 403/SSE 关闭，撤销第二设备后旧 cookie 写 403/SSE 关闭；SQLite 迁移、备份、重启和审计测试通过。`pnpm py:check` 198 pytest/Ruff/严格 mypy、`pnpm lint/typecheck/test`、contracts/task-map 与 macOS arm64 Electron smoke/schema34 通过。T097/T099 的私网真机端到端保留 P7-10；P7-05 的正向写仍 BLOCKED，P7-08 页面开始。见 ADR 0081。当前安装版内部 DMG 未包含 schema33/34 代码，不声称已升级。

P7-08 状态：**DONE（当前 Desktop 本机管理页面范围；手机/私网 HTTPS 另验）。** Settings 的正式组件调用 Python Host 的闭合 `devices.pair.list/audit/narrow/revoke`，从 SQLite 展示已批准设备、Project/操作 scope、修订、审计及未过期会话数；数目不标为在线。当前 Desktop 没有启动远程网关或配置 TLS 证书，页面如实说明且不把 Host connected 当执行器/手机在线。固定 Main/Preload bridge 在本地撤销前原生确认；版本 CAS/不可扩权由 Host 执行。独立临时库和 Project 由真实服务创建配对/会话，随后实际 Electron 窗口完成列表→只读缩权→审计→撤销，Host 回读 revision 3、会话 0、两个真实审计事件；空状态及授权设备截图见 `output/playwright/p7-08-remote-device-{management,authorized}-1440x900.png`。普通 Web 没有本地入口。Vue 61 tests、Python 198 tests、Ruff/mypy、TS lint/typecheck/test/build、contracts/task-map 和真实 Electron smoke 均通过；P7-05 正向写仍 403，手机/私网与 P7-09 弱网验证未完成。当前已安装内部 DMG 未包含新页面。

无费用缺口复核：独立 SQLite fixture 重新跑通自定义工作流 v1/v2 RunConfig 冻结、重开后的 queued 状态与任务非 Done；知识来源/经确认记忆进入冻结 ContextBundle 后撤销，重开仍显示来源 revoked 且历史引用未被改写。定向 pytest 3 项通过。此证据不是已安装应用中同一真实 Codex Run 的完整自定义流程或知识引用验收；后者仍留在集中功能表的具体缺口，不重跑未确认剩余预算的在线调用。

## PDF 第 7 页本地插件入口补齐 · 2026-09-25

这项是对既有 P4-02/P4-04/P4-08/P4-09 用户入口的增量修复，不变更权威 Task 状态或 P7-05 顺序。正式 Codex manifest 的 `configSchema` 当前是闭合的空对象，因此 UI 不伪造可保存的模型/凭据字段；新增固定的本机「停用 Codex 插件」操作。Electron Main 校验主框架来源及布尔值、弹原生确认，然后 Python Host 在无活跃 Run/Review/整理任务时持久化偏好并通过 Registry 真实 dispose。停用后新 Run 的插件锁不可获取，Agent Profile 可用性报告不可用，既有项目与看板仍可读。重新启用仅保存偏好，明确提示重启后重新装配，避免热替换正在绑定的调度器。

独立 Python Host stdio 测试覆盖无效参数、停用、数据库保留、重启仍停用、启用后再重启装配；`pnpm py:check` 190 pytest、Ruff 和严格 mypy 64 源文件通过。Vue 组件、TS 契约和 Preload 白名单有测试；`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过。真实 Electron 三次启动的 `node scripts/smoke-plugin-control.mjs` 验证 Host/Renderer 一致、未知值拒绝，截图见 `output/playwright/p4-plugin-control-{active,disabled}-1440x900.png`。首次截图断言因 StatusTag 前导装饰字符而失败，修正定位后全流程通过。没有模型调用。**已安装的旧内部 Demo 未替换**，所以此新入口暂只属于当前源码构建，不能说已在旧 DMG 中可操作。P6 发布、Claude 和跨平台阻塞不变；P7-05 仍为下一权威任务。

## P7-04 会话与 CSRF · 2026-09-25

状态：**DONE（当前显式 loopback HTTP/Host 服务范围）；私网 HTTPS、手机和业务命令仍关闭。** Python Host schema31→32 的增量 migration 增加 hash-only 短会话及配对一次性交付标记，不改已有 Project/Task/Run；已批准设备的 claimSecret 仅交付一次 15 分钟 Secure/HttpOnly/SameSite=Strict cookie 与独立 CSRF token，旧 token 在有界刷新中同事务撤销，显式 revoke 后下次 401。HTTP worker 经有界回调回到 Python Host 的数据库 event loop，不另建写入者。显式创建的 127.0.0.1 认证 gateway 校验 Origin/Fetch Metadata/Host/4 KiB JSON、30 次/10 分钟请求限制与 session-bound CSRF；未知 /v1 业务命令仍 403。正常 Desktop、包内 Host 与静态 CLI 没有启动认证 gateway。

真实验证：SQLite schema31→32 的在线备份/数据保留/重复迁移，session hash/交付一次/有效期/CSRF 更新/rotation/revoke/重启；真实回环 HTTP 请求从 nonce claim→本机批准→cookie/CSRF→刷新→撤销，跨站和非法内容分别 403/400，重放 401/403，限速 429；`pnpm py:check` 189 pytest、Ruff、严格 mypy 64 源文件，`pnpm smoke:desktop` 当前 macOS arm64 Electron/Python Host schema32 成功。参考 [ADR 0078](decisions/0078-host-owned-remote-session-and-origin-boundary.md)。本次并未用手机通过私网 HTTPS 实测浏览器 Cookie/证书/代理；T096/T098 全项转 P7-10，T081～T085 原 ID 的跨范围安全子项精确递延 P7-05/07/10，不记 PASSED。已安装供用户录屏的原内部包仍为 schema30、原校验摘要与隔离 Demo 数据，不会被本轮开发测试替换。P6 正式发行和 P4 Claude 阻塞不变；下一项 P7-05。

## P7-03 设备配对生命周期 · 2026-09-25

状态：**DONE（本机配对服务/人工审批的当前范围）；手机配对、会话和完整远端验收未通过。** Python Host 的增量 SQLite schema30→31 添加配对请求与已批准设备记录；256-bit nonce 和独立 claimSecret 均只存 SHA-256，nonce 10 分钟一次性消费、每配对第 5 次错误猜测拒绝。人工批准在 Host 事务中复核已 claim/未过期/Project ID 有效，并由受限 Desktop Preload/Main 提供本机 Settings 入口和额外原生确认。Renderer 无 Node、任意 IPC 或 claim 方法。远程 loopback 静态网关仍对 /v1 读 401、写 403，未产生手机 session，也没有 TLS、公网或新外部依赖。

真实验证：独立 SQLite 用例覆盖 hash/重放/过期/猜测次数/拒绝/批准/重启、schema30→31 在线备份与数据保留；独立 Python Host stdio 实测只接受本地固定方法，拒绝 claim 与未知字段；`pnpm py:check` 185 pytest、Ruff、严格 mypy 62 源文件通过；`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）和 `pnpm smoke:desktop` 通过，Electron 报 schema31、真实 Host PID、Preload 固定键，Renderer 的 Node/process 不可用；`git diff --check` 通过。开发测试初次因既有 schema30 硬编码期望及 migration fixture 索引而失败，已按新旧版本语义修订并全量复跑通过。本次已安装、供用户录屏的内部 Demo 是更早的原 DMG：SHA-256 未变，仍在独立 schema30 数据目录运行，未被开发测试迁移或替换。详见 [ADR 0077](decisions/0077-local-device-pairing-before-remote-session.md)。

完整 T096 第二设备 HTTPS claim 重放及 T097～T100 的设备撤销/SSE、Origin/CSRF、scope 缩小、远端断线分别递延 P7-10/06/10/07/09，不记 PASSED。Windows/macOS Intel、私网 TLS、真实手机均未验证。P6 正式发行与 P4 Claude 双执行器阻塞维持原状；后续按权威任务推进。没有模型付费调用、Forge commit/push/release。

## P7-02 显式 loopback 静态入口 · 2026-09-25

状态：**DONE（默认关闭、仅本机静态入口的当前任务范围）；私网 HTTPS/手机/API 操作未启用。** `python -m forge.remote_gateway` 必须明确 `--enable-loopback`，仅绑定 `127.0.0.1` 临时端口，服务同源的已构建 Vue 静态资源；`/v1/*` 读为 401、写为 403，不连接业务 Host、SQLite 或执行器。正常 Desktop/Host 启动未调用该模块；对本次已安装 Demo 的 app/Host PID 进行 `lsof` 检查，没有 TCP LISTEN。Python 真实 HTTP 测试覆盖静态资源、Host 伪造、目录穿越、symlink 与拒写，并在关闭后释放 socket；另一次从真实 `apps/web/dist` 读取 HTML/JS，验证随机 loopback 端口及 API 401/403。Ruff、严格 mypy 61 源文件与定向 pytest 2 项通过。详见 [ADR 0076](decisions/0076-loopback-remote-gateway-staging.md) 与 [私网 HTTPS 前置说明](remote/loopback-staging.md)。

没有创建 TLS 证书、反向代理、私网连接、公网入口或手机账号；此入口**不是**可用远程控制。T096～T100 保留原 Task/Test ID，配对、session/CSRF、SSE/撤销、权限、远端离线子项精确递延至 P7-03/04/06/07/09，未标 PASSED。P6-10/P6 Gate、Claude 和签名/Windows 阻塞不变。P7-03 下一项；无新依赖、付费调用、Forge 提交/推送/发布。

## 本地可操作 Demo 与 P7-01 Host 常驻 · 2026-09-25

用户已明确授权精确 `P6-10 → P7-01` **development-only** 放行和随后按权威顺序推进 P7/P8；P6-06～P6-10 仍 BLOCKED，P6 Phase Gate 不通过。已按通过验收的同一内部 Mac DMG（SHA-256 `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`）安装常驻 `/Users/iamzjt/Applications/Forge INTERNAL.app`，创建独立的 `/Users/iamzjt/Documents/Forge Demo/project` Git fixture 与 `app-data` SQLite。`pnpm demo:prepare` 只安装/准备并保留数据，`pnpm demo:open` 与可双击 `.command` 打开后不自动退出；实际检查本次 app PID 2958、包内 Python Host PID 2977、独立 SQLite 已创建，fixture 工作树 clean。Codex CLI 0.155.1/ChatGPT 登录本机可用，但属于外部前置；Finder 直接双击 `.app` 的 PATH/代理发现未验证。操作、录屏脚本和历史安装版验收的区分见 [P6 内部包 Demo](demo/p6-internal-macos-package.md)；[PDF 功能—真实操作集中表](pdf-feature-operation-map.md) 根据用户给的页码清单列出第 3～10 页入口、证据和缺口，仓库没有同页码的独立项目介绍 PDF。

P7-01「Host常驻模式」当前范围 **DONE**：P6-05 已用真实 Codex 活跃 Run 验证留托盘后无窗口仍保留同一 Python Host/归属工作、第二实例恢复、显式安全退出清理；Settings 明示用户会话/睡眠限制，本次安装版 Demo 也未自动关闭。没有开放远程网络。共享引用 T096～T100 中实际依赖后续配对/session/SSE/权限/远端断线 UI 的部分保留原 ID，映射至 P7-03/04/06/07/09 为 `DEFERRED_VERIFICATION`，不伪标 PASSED。`pnpm smoke:desktop` 当前源码真实通过 Host ready/schema30、degraded/crashed 与 P5 Workflow/插件/知识/记忆 UI 路径；`pnpm validate:task-map`、其 17 项精确例外/篡改测试、启动器 ESLint/语法和 `git diff --check` 通过。没有新增依赖、Claude 调用、Forge 仓库提交/推送/发布。P7-02 下一项，默认远程关闭。

## P6-09 当前平台适用验收 · 2026-09-25

状态：**BLOCKED，当前 macOS arm64/单 Codex 适用范围有真实回归证据，但完整 P6-09 和 P6 Gate 不通过。** 同一内部 DMG 的独立应用完整业务闭环、取消与重启结果复用 P6-06 补验，不重复消耗模型额度。`pnpm test:p3-acceptance` 实际通过正常交付、混合看板、Review 退回、Verify 失败返工、人审风险豁免、Host crash merge 对账六个隔离 Git/SQLite 情景。新 `forge.update_preflight` 的签名/篡改/版本/平台/active-operation/SQLite stage 成功与失败测试在 `pnpm py:check` 的 179 个 Python 测试中通过；新增测试确认即使签名有效，缺少协议或产品标识的 manifest 也必须拒绝，无效当前版本不会抛出未映射异常。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（92 Task/120 Case/50 deferred）、`pnpm py:check`（179 pytest/Ruff/严格 mypy 60 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm smoke:desktop` 均 exit 0；增强后的 `pnpm smoke:package:mac` 和包内真实 Codex 闭环亦 exit 0。完整 [适用验收与缺口](p6-current-scope-acceptance.md) 保留 T001–T095/T106–T120 的权威引用及 24 个不同的既有递延 Test ID，未将套件通过等同每个 Test ID 通过。

Windows/签名安装与更新、生产信任根/数据 cutover、Claude 第二真实 Executor、T081/T083～T085 安全全项和 T116～T120 对照评测仍无完整证据；因此不能宣称高危/数据损坏风险零遗留或完整发布通过。用户仅允许精确 `P6-09 → P6-10` 的内部使用说明开发排期；见例外记录。未执行新 Claude/Anthropic 调用、公开发布、提交或推送。

## P6-10 内部使用指南和说明 · 2026-09-25

状态：**BLOCKED；内部文档已完成，另一台电脑的正式发布验收未通过。** [内部 macOS arm64 用户指南](user-guide/internal-macos-arm64.md) 记录安装前提、项目/信任、首个 Task、真实 Run/Review/Verify、人审与 Done/显式合并边界、取消/Host/存储故障处理、外部 Git/Codex/认证/PATH 限制及实测支持矩阵。[内部 0.0.1 QA 说明](../release/INTERNAL-0.0.1-macos-arm64.md) 保留 `INTERNAL-ADHOC-UNNOTARIZED` 标签、DMG SHA-256、实际闭环证据和未完成分发门禁。当前源码新增的 Windows staging 与更新预检**不在既有 DMG 中**，指南已明确。没有在另一台 Windows/Mac 上按指南真实完成需求到交付，也没有 Developer ID 公证/签名升级/凭据连续性；T111～T115 的完整跨平台/发布验收不标 PASSED。P6 Gate 保持 BLOCKED，P7/P8 不在本次授权范围，不自动进入。

## P6-07 Windows安装与签名 · 2026-09-25

状态：**BLOCKED；仅实现平台准备，不宣称 Windows 支持或安装验收通过。** Desktop 打包版 Python 路径在 Windows 改为 `resources/forge-python/runtime/python.exe`，内部测试数据根改用跨平台 `path.isAbsolute`；macOS 测试覆盖两平台路径选择。新增 `pnpm package:windows:internal`，仅在真实 Windows x64 上从锁定的 Electron 44.4.3/uv CPython 3.12.13/Forge wheel/Web build 构造明确 `INTERNAL-UNSIGNED` ZIP 并探测包内 Host；`pnpm smoke:package:windows` 和手工 `workflow_dispatch` Windows QA 入口将来在 Windows 上执行且不上传包。当前 macOS 上包装脚本按设计拒绝运行；没有 Windows 环境，**未生成 Windows 包，也未运行 Windows smoke**。ZIP 也不是安装器；正式签名、UAC、中文路径、卸载保留数据、DPI 与真实一任务均未验证。T004/T005/T108/T111～T113 保持原 ID 和递延状态。见 [ADR 0074](decisions/0074-windows-internal-staging-and-platform-gate.md)。

用户本次仅允许精确 `P6-07 → P6-08` 的独立离线更新/迁移开发，见例外记录；权威 Depends on 不变，P6-07 不能据此标 DONE。macOS 包的业务闭环与 Windows 验收分开；P4 Claude 及 P6-06 正式分发门禁仍阻塞。当前平台 `pnpm --filter @forge/desktop build` 和其 8 个单测通过，`node scripts/package-windows-internal.mjs` 在 macOS 上按预期以“不支持交叉构建”失败；这不是 Windows 构建通过证据。

## P6-08 offline update/migration preflight · 2026-09-25

状态：**BLOCKED；已实现仅适合当前 macOS arm64 开发范围的离线预检。** Python `forge.update_preflight` 对 `forge-release/v1` 精确字节进行 Ed25519 公钥签名验证，再检查版本/目标平台/文件名/大小/SHA-256；没有可信签名或产物篡改时拒绝。活跃操作数非零时拒绝迁移；空闲时仅用 SQLite online backup 从 WAL 提取已提交数据，在 Forge 内部独立 staging DB 从 schema29 升到30并做 quick/FK 检查，原库保持 schema29/原值，失败的迁移也不会半提交到原库。未执行生产数据库切换、自动更新下载或正式签名包升级，未配置生产信任公钥；测试签名密钥是可丢弃 fixture，不能证明真实发布完整性。`cryptography==50.0.1` 从现有锁中的传递依赖提升为精确直接依赖；许可证与版本记录已更新。见 [ADR 0075](decisions/0075-offline-update-integrity-and-migration-rehearsal.md)。T086～T090 沿用真实迁移/故障测试并增加签名/预演单测；T112/T113、签名安装包升级、Host 停机后原子切换/回滚和凭据连续性继续待验。P6-08 不标 DONE。

## P6-06 internal installed-app business acceptance addendum · 2026-09-25

状态仍为 **BLOCKED**。同一 SHA-256 `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9` 的 `0.0.1-INTERNAL-ADHOC-UNNOTARIZED` arm64 DMG 经过真实挂载、复制到独立 QA 安装目录、从复制后的 `.app` 启动后，完成项目探测/信任→消息→手工草稿修订→人审入 TODO（无自动 Run）→明确 Start→包内 Python Host 调用真实 Codex→隔离 Worktree 修改两文件、真实 `node test.js` 通过→快照/Diff/Handoff→Verify `passed`/exit 0→独立 Review `approved`→逐条验收证据→Owner 最终验收 Done。源 Git HEAD/status 未变；未合并、推送、部署。另一个长命令 Run 显式取消，归属 app-server 退出，后续 2 秒无继续写入；应用退出重开后 Done Task/交付记录仍可读，取消的 Task 未变 Done。详见 [安装包验收与演示说明](demo/p6-internal-macos-package.md)，真实截图保存在 `output/playwright/p6-06-packaged-*.png`。本次命令 `FORGE_VERTICAL_PACKAGED=1 FORGE_VERTICAL_FINAL_ONLY=1 FORGE_VERTICAL_TERMINATION=cancel FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` exit 0；增强后的 `pnpm smoke:package:mac` exit 0，并在 clean PATH 下真实看到未打包的 Codex `available=false`。Codex CLI/登录和 Git 是外部前置；包内 Python/插件/Schema/Web 已检查。没有开发 Host 替代安装包、没有 Claude/Anthropic 调用。

用户明确批准精确 `P6-06 → P6-07` **development-only** 调度例外；权威依赖/Test ID 不变，见 `docs/development-dependency-exceptions.json` 和 ADR 0073。P6-06 的 Developer ID 签名、公证、macOS x64、全新 Gatekeeper 用户、签名升级/回滚、凭据跨升级与 T111–T113 正式验收仍未完成；P4-05/P4-10/full P4 Gate 仍 BLOCKED。Windows 实机也未验证。此例外不通过公开发布门禁。

## P6-06 · Mac签名/公证包 · 2026-09-25

状态：**BLOCKED（内部 macOS arm64 安装包真实可用；公开签名/公证与完整验收未完成）。** 新增 `pnpm package:mac:internal`：从冻结 pnpm/uv 锁构建生产 Web、Electron `app.asar`、捆绑的 uv-managed CPython 3.12.13 与 Python Host wheel/生产依赖，产出明确标注 `INTERNAL-ADHOC-UNNOTARIZED` 的 `.app` 和 `.dmg`。Main 的 packaged 路径从 `process.resourcesPath` 寻找 Web/Python，不再依赖源码或开发 `.venv`；正常开发命令仍是 `pnpm dev:desktop`，独立 Host 为 `pnpm dev:host`。Renderer 安全桥与 Python-only Runtime 未改变。`@electron/asar@4.3.0` 为新锁定的 MIT 构建依赖，pnpm 继续禁用安装脚本。见 [ADR 0073](decisions/0073-internal-macos-package-and-distribution-gate.md)。

真实 `pnpm smoke:package:mac` 挂载 DMG、将 `.app` 复制到带空格的独立 QA 安装目录，并在隔离用户数据根启动：Electron `isPackaged=true`、Host health ready、CPython 3.12.13、SQLite schema30、包内解释器路径、Renderer sandbox/context isolation/Node disabled 均已检查。退出后本次归属 Host PID 不残留；删除 `.app` 后隔离用户的 `forge.sqlite` 保留。实际截图 [内部包首页](../output/playwright/p6-06-packaged-home-1440x900.png) 已查看，显示无项目空态和真实 Host connected。内部 DMG SHA-256：`a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`，约 315 MiB，位于 `build/macos/`（被 Git 忽略）。初次未归档的 `Resources/app` 被 Electron 识别为开发模式并在包外寻找 `.venv`；改为官方 `app.asar` 加重命名 Mac 可执行文件后，真实打包路径通过。早期使用 `HOME` 覆盖的失败试验未隔离 Electron 默认的 `@forge/desktop` Chromium 缓存；该既有用户数据目录未清理，未发现新的 `Forge/production` 数据库。正式 smoke 改用仅内部包标记可启用的 `app.setPath`，用户数据完全隔离。首次在 macOS 临时目录中启动复制的 app 遇到系统 sandbox extension 拒绝；最终安装路径为仓库内独立 `build/macos/qa-install-*` 目录。这不是新物理 Mac 用户或 Gatekeeper 测试。

质量结果：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（50 deferred）、`pnpm py:check`（174 pytest、Ruff、严格 mypy 59 文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（作为打包/test/smoke 的真实前置）、`pnpm smoke:desktop`、`pnpm package:mac:internal`、`pnpm smoke:package:mac`、`git diff --check` 已通过。首次 lint 发现新打包产物被纳入源码扫描及 smoke `finally` 显式抛错；仅排除 `build/macos/**` 生成物并修正测试辅助函数后复跑通过。没有 Claude/Anthropic 模型调用、数据库重置、提交、推送或发布。

当前 Keychain 只发现 Apple Development 身份，没有可用于公开分发的 Developer ID Application 身份或公证凭据；ad-hoc 签名不能替代两者。`T111` 仅有内部包安装/移除且数据保留的局部证据，公开 Gatekeeper 全新用户安装仍 **DEFERRED_VERIFICATION**；`T112` 签名升级/中断/回滚与 `T113` 合法凭据跨签名升级仍 **DEFERRED_VERIFICATION**。macOS x64、真实新用户账号、Gatekeeper、Codex 从 Finder 环境运行、公开 CI/代码签名/公证以及 Windows 均 **UNVERIFIED**。P6-07 的权威依赖是 P6-06，当前没有类似 P4 的开发例外；Autopilot 在此 Hard Stop，不自行进入 P6-07。P4-05/P4-10/full P4 Gate 仍 BLOCKED，Claude 不可运行。

## P6-05 · 应用退出与托盘生命周期 · 2026-09-25

状态：**DONE（macOS arm64 当前真实 Codex Run/Host 开发路径）；P6-06 开始。** Python Host `system.activity` 从内存中读取真实启动中/开发/调度/Review/Verify/整理器/归属进程数量；Main 的封闭 Schema 校验总数，未知状态不当作空闲。活跃 Run 关窗或请求退出时，原生对话框提供“取消、留在托盘、安全停止并退出”，并说明电脑睡眠/当前用户会话结束会中断本机工作。留在托盘销毁管理窗口但保留同一 Python Host；托盘、应用激活和第二实例可以重开窗口，不重复启动 Host/Run。安全退出调用已有 Host shutdown，由 Host 取消归属 Run/子进程，Main 只管理自己启动的 Host。空闲 Host 正常退出；Host 崩溃时要求明确确认。见 [ADR 0072](decisions/0072-owned-host-window-and-tray-lifecycle.md)。

真实 macOS arm64 Electron→Python Host→Codex app-server 长命令 `hold.js` fixture：检测 `command.started` 后第一次关窗取消、窗口和 Run 仍在；第二次留托盘后零窗口而 Host/子进程仍存活；另起 Electron 实例重开后 PID 与原 Run 相同；再选择安全退出，Host 与其 app-server PID 均消失，源 Git 保持 clean。原生对话框标题/三个按钮/睡眠说明均从真实 Main 路径检查。第一轮即通过主要链路；加强断言后的第二轮因测试脚本在第二实例已退出后才订阅 `exit` 而挂起，精确清理本轮测试 PID，修正监听顺序后第三轮通过。`T002`、`T114` 有当前实测证据；`T001` 沿用固定桥/伪造 sender 拒绝证据；`T003` 强制 Renderer 崩溃、`T004` 正式 Mac/Windows 快捷键、`T005` Windows 实机 DPI 精确保留 `DEFERRED_VERIFICATION`，不伪称跨平台全过。

最终执行：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（50 deferred）、`pnpm py:check`（174 pytest、Ruff、严格 mypy 59 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`node scripts/smoke-diagnostics.mjs`、`FORGE_P6_LIFECYCLE=1 node scripts/smoke-python-vertical-live.mjs`、`git diff --check` 均通过。无新依赖、数据库迁移、Claude 调用、提交或推送。Windows x64、macOS Intel、签名安装包、真实系统睡眠与用户数据库 **UNVERIFIED**；P4-05/P4-10/full P4 Gate 仍 **BLOCKED**。

## P6-04 · 诊断、隐私与清理 · 2026-09-25

状态：**DONE（macOS arm64 开发版的白名单诊断导出与导入 Artifact 保留/确认清理范围）；P6-05 开始。** Python Host 固定 `diagnostics.prepare/cleanup` 只汇总 Runtime/协议、SQLite 健康与 schema、项目/Task/Run/导入 Artifact 数量、30 天保留候选数；不读取日志、源码、用户路径、环境变量或凭据。Usage 总量未能可靠测量时明确 `unavailable`，不显示估算或 0。Main 严格校验预览、最多缓存 10 分钟，Renderer 只传预览 ID；设置页展示的完整 JSON 与原生 Save 对话框选定文件写入的字节一致。Web 无本地导出桥。导出写入限制 16 KiB 并拒绝符号链接。见 [ADR 0071](decisions/0071-allowlisted-diagnostics-and-imported-artifact-retention.md)。

增量 SQLite schema30 保留既有导入 Artifact 原文与元数据；仅用户在 Settings 看到过期候选、点击清理并通过 Main 原生确认后，Host 才使用单次预览身份在事务里复核 30 天期限并清空最多 500 项旧内容，留下历史墓碑。不会删除用户主仓库、Worktree、项目文件或其他 Artifact 类别。真实 SQLite fixture 验证旧/新内容、单次确认、重复拒绝、重启不可读与源 Git 保留；真实 Electron 临时 Host 数据目录内放入含 token 的日志和项目路径，预览/实际导出均无二者。截图 [诊断预览](../output/playwright/p6-04-diagnostics-preview-1440x900.png) 已查看。T115 当前开发路径有真实证据；T111～T114 依安装、签名更新、凭据跨升级和运行中退出分别递延到 P6-05/06/08；完整 T084 的未来独立 Artifact 导出与更多敏感输出路径留 P6-09，不虚报整项通过。

最终执行：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error/4 既有 warning）、`pnpm validate:task-map`（48 deferred）、`pnpm py:check`（173 pytest、Ruff、严格 mypy 59 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:diagnostics`、`git diff --check` 均通过。过程中严格 UUID 和失败迁移 fixture 的旧期望曾令 Python 测试失败，修复后全量复跑通过。无新 npm/PyPI 依赖、安装脚本、付费模型调用、提交或推送。真实用户数据目录升级、Windows x64、macOS Intel、安装包/签名 **UNVERIFIED**；P4-05/P4-10/full P4 Gate 继续 **BLOCKED**。

## P6-03 · 应用预览与代码浏览 · 2026-09-25

状态：**DONE（macOS arm64 独立本地预览与只读 Run 变更浏览的真实范围）；P6-04 开始。** 用户从 Task 详情明确输入 `http://127.0.0.1:<port>/`，Main 再次校验后用独立 BrowserWindow/临时 session 打开。预览没有 Preload/Node/Forge Host API，sandbox/contextIsolation/webSecurity 为 true，权限/下载/新窗口/越域导航被拒；仅放行选定的同一 origin HTTP 资源，不自动运行项目脚本。普通 Web 只显示不可用。Main 的 Host IPC 仍限制管理窗口 `senderFrame`；预览页的独立 `webContents` 身份不能通过。Run 变更文件列表支持选择并查看 Host 已保存且脱敏的精确补丁，找不到单文件补丁时明确提示，不直接读取项目工作树或把代码当 HTML 执行。见 [ADR 0070](decisions/0070-isolated-local-app-preview.md)。

真实 Electron disposable localhost fixture 加载预览，页内 `window.forge`、`require`、`process`、`ipcRenderer` 均不存在；第二 origin 的 HTTP/WebSocket 请求未到达测试服务，`window.open` 与 `file:` 导航被拒；Main 管理界面仍可用。读取实际 Preview `webPreferences` 确认无 preload、Node 关闭、sandbox/contextIsolation/webSecurity/disableDialogs 启用。截图 [隔离预览](../output/playwright/p6-03-isolated-app-preview.png) 已查看。`disableDialogs` 的直接 alert 自动化被 Playwright 1.63.0 的失效 Dialog 事件干扰，因此不宣称完整原生弹窗用例已通过。Python ArtifactStore 真实临时 SQLite 导入含 OPENSSH 私钥块文本被拒；Run Diff 脱敏同类块。T082 与 T083 中 `file:`/新窗口子路径有证据，完整 T081/T083/T084/T085 保留权威 ID 并分别映射 P6-04/P6-09 `DEFERRED_VERIFICATION`，**不当成整组 PASSED**。

执行：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（44 deferred）、`pnpm py:check`（171 pytest、Ruff、严格 mypy）、`pnpm test`（Web 58 测试）、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:preview`、`git diff --check` 均通过。首次 Desktop smoke 因新固定 bridge key 的旧断言失败，更新断言后全量通过；预览的真实 JavaScript alert 自动化失败如上记录。无新依赖、schema 迁移、付费模型调用、提交或推送。P4-05/P4-10/full P4 Gate 继续 **BLOCKED**；Windows x64、macOS Intel、安装包、系统原生弹窗与真实用户库仍 **UNVERIFIED**。

## P6-02 · 键盘、可访问性与DPI · 2026-09-25

状态：**DONE（macOS arm64 当前 Desktop/Web 键盘和布局范围）；P6-03 开始。** 共享 AppShell 的 Ctrl/Cmd+K 只列真实已实现页面，使用 `@forge/ui` Dialog/输入框，不发送 Host 命令。顶层 Dialog/Drawer 处理 Tab、Shift+Tab、Escape，背景 `inert` 按嵌套层数释放。真实 Electron 回归发现 Task Drawer 随父组件卸载时焦点未回卡片，已修复并加组件测试。长项目路径以省略显示但保留完整 title；看板 120 字中文标题可从 title 属性及完整 Drawer 读取。

真实 Electron/Python Host 离线 fixture：长 Unicode/空格 Git 路径→人工信任→保存消息→手工草稿→人工批准→TODO→Desktop 重启恢复；项目脚本未执行、源 Git 未改、模型调用禁用。键盘快捷键打开快速导航，焦点进入搜索，Shift+Tab 环绕，Escape 回触发器；Task Drawer Escape 回卡片。真实截图：`output/playwright/p6-02-keyboard-nav-1440x900.png`、`p6-02-long-title-board-1440x900.png`、`p6-02-long-title-drawer-1440x900.png`、`p6-02-board-1280-css-zoom-150.png`。1280×800/1600×1000、CSS zoom 100/125/150% 无页面水平溢出；**CSS zoom 不是 Windows 系统 DPI 或 Mac Retina 实测**。`prefers-reduced-motion` 媒体仿真下首页动画为 0，但真实 Run/Workflow 切换时的 T110 全项仍属 P6-09。T106/T109 已有当前真实端到端证据；T108 仍映射 P6-07，T110 仍映射 P6-09，40 项 deferred 未伪标通过。

最终执行：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件，0 error/4 既有 warning）、`pnpm validate:task-map`（40 deferred）、`pnpm py:check`（171 pytest、Ruff、严格 mypy）、`pnpm test`（含 Web 56 测试）、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm smoke:desktop`、`FORGE_P6_A11Y=1 node scripts/smoke-p1-offline.mjs`、`git diff --check` 均通过；第一次 A11y smoke 暴露真实焦点回归，修复后复跑通过。无新依赖、迁移、Anthropic 调用、提交或推送。Windows x64、macOS Intel、物理 DPI、安装包/签名和真实用户 DB 仍 **UNVERIFIED**；P4-05/P4-10/full P4 Gate 仍 **BLOCKED**。见 [ADR 0069](decisions/0069-keyboard-overlay-and-dpi-evidence.md)。

## P6-01 · 全页面视觉一致性 · 2026-09-25

状态：**DONE（macOS arm64 当前 Desktop/Web 页面视觉基线）；P6-02 已开始。** 正式 `@forge/ui` token 生成器现在提供同键名的银雾浅色/蓝灰深色变量与减少透明度回退；设置页支持跟随系统、浅色、深色，仅作用于当前窗口。保持 P0 的减少动效和减少透明度入口。修复 P5 新增的 Workflow 画布、知识页、Agent 页面使用未定义 CSS token 的问题，新增扫描所有生产 Vue/CSS token 引用的测试。首页和项目连接说明已更新为当前真实 Task 能力，没有生成假业务状态。

旧 Run 配置差异使用只读固定 `workflow.getPublished`：Python Host 按版本读取并复核不可变定义与哈希，Main/Client 做封闭 Schema 校验，Desktop 对两份已发布定义逐字段显示差异和各版本冻结 Run 数，不执行 Workflow 或修改旧 Run。实际 Desktop smoke 在独立临时数据库中发布 v2/v3，页面显示名称差异；P5 的旧 Run 锁证据独立存在。**T029 仍缺同一端到端 fixture 中同时打开旧 Run 与新发布版差异**，精确留 P6-09 `DEFERRED_VERIFICATION`，不标 PASSED。T107 有双主题静态语义色对比及真实 Electron 阅读卡测量：浅色正文 4.85:1、深色正文 9.63:1，状态带文字。T106 焦点、T109 长标题、T110 全局减少动效留 P6-02；T108 Windows 150% 留 P6-07。

实际截图：`output/playwright/p0-07-desktop-1440x900.png`（本轮重新生成浅色 Home）、`output/playwright/p6-01-desktop-dark-home-1440x900.png`、`p6-01-desktop-dark-settings-1440x900.png`、`p6-01-desktop-dark-workflows-1440x900.png`、`p6-01-published-diff-desktop-1440x900.png`，均来自本轮真实 Electron 实现并已人工查看。1440×900、1600×1000 无水平溢出；1280 CSS zoom 125% 可操作，**不是 Windows 150% 系统 DPI 实测**。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件，0 error/4 既有 warning）、`pnpm validate:task-map`（42 deferred）、`pnpm py:check`（171 pytest、Ruff、严格 mypy）、`pnpm test`（Web 53 测试含差异 UI）、`pnpm lint`、`pnpm typecheck`、`pnpm build`、真实 `pnpm smoke:desktop` 与 `git diff --check` 均 exit 0；截图脚本 `node scripts/capture-ui.mjs` exit 0。未新增依赖、数据库迁移或模型调用。P4-05/P4-10 与完整 P4 Gate **BLOCKED**；Windows x64、macOS Intel、实际用户数据库升级与安装包 **UNVERIFIED**。见 [ADR 0068](decisions/0068-p6-visual-theme-and-published-workflow-readback.md)。

## P5-12 · P5文档与迁移 / Phase Gate · 2026-09-25

状态：**DONE（macOS arm64 开发范围）；P5 Phase Gate 按共用定义与可运行 quick 链的当前证据通过，P6-01 开始。** 参考 Workflow JSON Schema 仍为只读权威基线；生产 Python Pydantic 与 TS Zod 共同要求 `schemaVersion: 1.0`。Python Host `workflow.saveDraft/compileDraft` 对未来 DSL 版本返回明确 `WORKFLOW_DSL_VERSION_UNSUPPORTED`，已保存的未来版草稿也拒绝读取/执行而不被自动篡改；Desktop 导入画布时给出具体不兼容版本提示并保留原草稿。参考 OpenAPI 是未来 Gateway 合同，本地 Desktop 仍只有封闭 JSON-RPC stdio，不虚构 HTTP 服务。见 [P5 契约与迁移说明](p5-workflow-contract-and-migration.md)。

独立临时 schema25（P3/P4）数据库含真实已批准 Task、Run/RunConfig 与版本化 Agent Profile；schema29 两次迁移后旧 ID/内容可读、外键检查无错误，在线备份文件存在。原 P3-11 的 T086～T090 事务中断、WAL 备份、失败迁移、磁盘写失败和插件 namespace 测试仍在全量回归。**没有对真实用户数据目录执行迁移演练**。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（43 deferred）、`pnpm py:check`（171 pytest、Ruff、严格 mypy 58 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0；画布/版本导入的 Vue 测试也通过。见 [P5 阶段报告](p5-completion-report.md)。

Phase Gate 的“共用同一执行定义”指三个模板与高级编辑都使用同一闭合 Workflow DSL/版本 hash；真正运行验收只覆盖严格 quick 型四节点。含 Planner 的 `standard/strict` 模板仍不可启动，历史 P3 `standard` 开发锁并不冒充这些模板。不能宣称通用 Workflow Runtime 或完整 v1.0 发布。T029 完整新旧版本 UI 差异留 P6-01；T116～T120 的跨阶段评测仍递延。P4-05/P4-10 和完整 P4 Gate **BLOCKED**；Claude 未调用。Windows x64、macOS Intel、安装包/签名、DPI、真实用户库升级均 **UNVERIFIED**。

## P5-11 · 流程与检索集成测试 · 2026-09-25

状态：**DONE（macOS arm64、Codex 单执行器、已发布 quick 同语义线性链的真实集成范围）；P5-12 开始。** Python Host 仅接纳与 quick 模板完全同语义的已发布 Develop→Review→Verify→人工验收四节点定义；非法/不受支持图形、能力不足或变更后的内容 hash 均拒绝启动。实际 Developer/Reviewer Profile 版本与内容 hash、Workflow 版本/hash 在 RunConfig 冻结；Run Context 显示真正已执行节点和只读来源，不把后续节点的配置锁误称为已执行。Review 固定只读能力并以锁定 Profile 启动；Verify 的实际 CommandPreset 必须符合工作流超时上限；自定义 16 次全局尝试上限与三次返工门禁由 Host 执行。重复启动的相同 idempotency key 在 TODO 已推进后仍返回原 Run。见 [ADR 0067](decisions/0067-published-linear-workflow-runtime-and-retrieval-freeze.md)。

带 `contextQuery` 的真实开发 Run 在启动前以 Project/environment 当前来源生成 Stage Context：无答案返回 `CONTEXT_NO_SOURCE`，冲突返回 `CONTEXT_REQUIRES_HUMAN`；只有明确带来源/权限等级的有效知识或人工确认记忆进入冻结 ContextBundle。来源后来撤销不会修改历史输入。固定 `context.sources` 命令从真实 SQLite 来源重新判定失效，Desktop Context 标签显示 `revoked` 及历史输入提示。真实记忆 Run fixture 另证实确认→冻结→撤销后索引清空、审计墓碑保留、历史 Run 标失效、原项目文件不变；T075 的该分支已补验。

实际 macOS arm64 Electron→Python Host→Codex 独立 Git fixture：已发布自定义 Workflow 的开发 Run `8302e433-bbaf-46fe-b560-b53a19d8d287` 形成真实 CodeSnapshot；Verify `d03769e5-efed-402e-8402-1f921c180c5f` exit 0 并绑定 AC；只读 Review `caeab754-3cd5-4217-8df4-105f3616a922` approved；用户明确最终验收决定 `a3d123f3-da69-4899-9036-0f1d90a0d9e2` 后 Task 才 Done，源 Git 保持 clean。独立知识 Run `3349080b-9a0c-4268-a12e-d30b65fedddb` 收到 `retrieved_knowledge/untrusted_project` 真实引用，完成后撤销来源，Host/Desktop 均显示 revoked；无答案与冲突场景没有启动 Codex。截图已人工核对：[实际任务抽屉](../output/playwright/p5-11-workflow-run-desktop.png)、[历史来源撤销](../output/playwright/p5-11-context-source-desktop.png)。全局上限另用真实 SQLite/Verifier fixture 累计 16 次后阻止下一 Run；同 Task 人工改版后的旧/新 RunConfig 均持久保留。首次全量 Python 回归发现同键重放被 TODO 状态误拒，修复后通过；首个自定义 Review 真实链还暴露遗漏的自动 Profile 幂等核对，已修复并复验。P3 共用 RunService/ProcessController 对重复结果、旧 epoch、有限 429、崩溃和取消的真实防护仍在，不新建第二套运行状态机。

`T116–T120` 原权威 Test ID 继续按 `docs/deferred-verification.json` 映射至 P6/P9 的跨角色预算、holdout 与评测；**未执行、未标 PASSED**。`T029` 的旧/新 Workflow 逐项 UI 差异视图仍归 P6-01；本任务仅显示旧 Run 的精确冻结版本/hash 与实际节点，不声称 UI 已提供完整 diff。`T028/T030/T031–T035` 当前安全/运行路径以发布能力拒绝、实际线性链、16 次封顶及共用调度器原有证据覆盖；相应开发期递延记录已关闭，权威 ID 未改。P4-05/P4-10 与完整 P4 Gate 继续 BLOCKED，Claude 无调用、未产生 Anthropic 费用；Windows x64、macOS Intel、安装包、真实用户数据库升级、非线性图和多执行器仍 **UNVERIFIED/UNSUPPORTED**。最终回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（43 deferred）、`pnpm py:check`（169 pytest、Ruff、严格 mypy 58 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check`；这些命令在本轮完成前逐项核实结果。

## P5-10 · 知识/记忆管理页面 · 2026-09-25

状态：**DONE（当前可用的真实来源/记忆管理与人工确认范围）；P5-11 开始。** 共享 Vue Knowledge 页面现可查看原文引用、提议绑定真实来源/hash 的候选记忆、编辑候选及到期日、检索同项目/环境的有效记忆，并经明确理由对话框确认、标记过时或撤销。相同主题的旧有效记忆在确认替换前明确提示；撤销清空 Forge 记忆正文和索引，保留审计墓碑，用户项目文件不删。Web 无本地桥；Desktop 仅新增封闭 `invokeMemory`，Main 校验 sender/命令负载，Python Host 是唯一数据写入者。页面明确说明记忆只是指导信息，不是验收标准，已有冻结 Run 不会静默改变。见 [ADR 0066](decisions/0066-memory-center-ui-and-confirmation-boundary.md)。

真实 Electron/Python Host smoke 使用独立受信 Git fixture 完成“只读导入→来源定位→提议→候选不可检索→人工确认→有效检索→撤销→空检索/无正文墓碑”，且原始项目文件未改、脚本未运行。Renderer 无 Node；未知 `memory` 类型被拒。真实截图已核对：[P5-10 Memory Center](../output/playwright/p5-10-memory-desktop.png)。Host SQLite 测试另覆盖候选编辑 CAS、过时标记、FTS 清理、失效来源、到期与跨项目隔离；Web 组件测试覆盖必须人工填写理由后确认/撤销。`T075` 的 UI 撤销/索引/墓碑分支有证据；**已有 Run 显示所用来源后来撤销**须待 P5-11 把来源轨迹实际用于 Workflow Run，保持原 Test ID 的 `DEFERRED_VERIFICATION`，不标为通过。P4-05/P4-10 和完整 P4 Gate 仍 BLOCKED，无 Claude 调用。Windows/Intel、安装包、真实用户库 28→29 升级 **UNVERIFIED**。

## P5-09 · 项目记忆生命周期 · 2026-09-25

状态：**DONE（macOS arm64 Python Host 的来源绑定记忆生命周期）；P5-10 开始。** 增量 SQLite schema29 加入 `project_memory`、不可变 `memory_events` 与受控 FTS5 索引。候选须绑定同 Project 的当前 Task revision、CodeSnapshot 或同 environment 的有效知识片段及精确 hash；伪造来源拒绝。未确认 candidate 不进入检索或 Stage Context。显式人工确认（reason、expected revision、decisionId）才能 validated；不同当前证据的冲突候选会暂缓旧记忆并提出人工问题，不自动升级候选。过期/来源撤销使旧记忆 stale；显式 revoke 删除索引和记忆正文、留下审计墓碑，不删用户项目文件。检索默认严格 Project/environment 隔离，Stage Context 把有效记忆列在已批准合同及快照之后、普通未信任文档之前，但仍只是只读预览，不自动改变冻结 Run 输入。见 [ADR 0065](decisions/0065-source-bound-project-memory-lifecycle.md)。

真实 SQLite/Host 测试验证 candidate→validated→restart、重复决定、失效来源、过期、跨项目无结果/跨项目引用拒绝、当前证据冲突→显式替换、撤销后的 FTS 清空和审计事件、非法/未知 JSON-RPC 方法拒绝；Stage Context 测试确认冲突候选与旧记忆均不成为权威项。T070 与 T071–T074 的当前核心分支有证据，相关早期 deferred 映射关闭；T075 的真实用户 UI 撤销与影响说明仍归 P5-10，保持 `DEFERRED_VERIFICATION`。本轮 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件，0 error/4 原有 warning）、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm py:check`（162 Python 测试、Ruff、严格 mypy 57 源文件）、`pnpm smoke:desktop`（真实 Electron/Python Host schema29、sandbox/断连/损坏库）和 `git diff --check` 全部通过。没有新增依赖或模型调用。P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED；Windows/Intel、安装包及真实用户数据目录升级 **UNVERIFIED**。P5-10 只接 UI/固定桥和实际用户操作，不把 P5-09 核心测试当成已完成管理页验收。

## P5-08 · Context Builder预算与冲突 · 2026-09-25

状态：**DONE（真实 Python Host 只读 Stage Context 预览范围）；P5-09 开始。** Python `StageContextBuilder` 从冻结 RunConfig/人工批准 Task 合同出发，只读取同快照人工决定、CodeSnapshot/产物以及 P5-07 当前 project/env/version 的真实检索片段，按优先级组装；每项带 sourceRef/hash/trust，资料标 `untrusted`。UTF-16 字符预算不冒充模型 token 计数：批准合同放不下时不输出部分合同，低优先项只能整项省略并显示数量；无来源返回 `insufficient_sources`。同标题不同正文/版本只标记潜在冲突并提出人工问题，不自动选择偏好。固定 `context.preview` Host 方法经封闭 Run bridge 可在 Run 详情 Context 标签只读查看；**预览不替换当前 Run 冻结输入，也不自动送往 Executor**。见 [ADR 0064](decisions/0064-bounded-stage-context-preview.md)。

真实 SQLite/Host 测试用批准 Task 与 RunConfig 验证优先级、预算、截断、来源缺失、旧版/新版 PRD 冲突、撤销后预览无资料、无效/跨项目 Run 拒绝。组件测试验证冲突/截断提示；真实 Electron→Python Host smoke 验证未知 Run 返回 `CONTEXT_RUN_NOT_FOUND` 而非接受任意请求。成功 Stage Context 的 Electron 实机截图尚未生成，不能将组件 fixture 称为该截图。T067 当前预检证据成立；T070 的权威来源引用保存门禁仍归 P5-09，原 ID 保留递延。有效 Project Rule 与历史 Memory 尚无 P5-09 验证来源，未提升权威等级；P5-11 才拥有 Workflow Runtime 消费 Stage Context。P4-05/P4-10 与完整 P4 Gate 保持 BLOCKED；无 Claude 调用。Windows/Intel/安装包、真实用户 DB 升级 **UNVERIFIED**。

## P5-07 · FTS与中文检索 · 2026-09-25

状态：**DONE（macOS arm64 真实检索范围）；P5-08 开始。** Python Host schema28 在既有 Project 来源上增补 environment ID、FTS5 trigram 和短中文字符/双字 postings，迁移事务回填 schema27 的当前有效片段。固定 `knowledge.search` 要求受信 Project 与匹配环境，按 project/env/current version/active source 限定真实片段，可选 exact source/version；不允许任意 SQL。3 字及以上走 trigram，1–2 个汉字走字符索引，返回索引版本及真实 `sourceId@version#ordinal`、行号、正文和 hash。无结果保持空列表，不生成答案。重导入、撤销与索引同步在同一 SQLite 事务，撤销留引用墓碑但不留可检索文本。见 [ADR 0063](decisions/0063-project-scoped-fts-and-chinese-character-index.md)。

真实 SQLite/Host 测试覆盖两项目同词隔离、错误 environment 拒绝、中文 1/2/4 字和 `start_date` 混合检索、source/version 筛选、无答案、旧版本移出索引、schema27 升级回填、重启保持、撤销无命中。真实 Electron/Python Host smoke 从受信 fixture 文档检索并显示引用，空结果和撤销后的零结果均通过；截图已人工核对：[P5-07 Desktop 检索](../output/playwright/p5-07-search-desktop.png)。T066/T068/T069 有本任务证据；T067 的跨版本冲突询问归 P5-08，T070 的伪造来源引用门禁归 P5-09，保留 `DEFERRED_VERIFICATION`，不冒充通过。P4-05/P4-10 和完整 P4 Gate 仍 BLOCKED；没有调用 Claude 或新付费服务。Windows/Intel、安装包 SQLite FTS5、真实用户库 schema27→28 升级 **UNVERIFIED**。

## P5-06 · 知识导入与原文定位 · 2026-09-24

状态：**DONE（macOS arm64 只读导入与引用定位）；P5-07 开始。** Python Host 的 `KnowledgeIngestionService` 仅接收已信任 Project 内文档白名单的相对路径，重新 canonicalize 并验证目录/扩展名/UTF-8/1 MiB 上限；只导入 Markdown、TXT 与可识别的 OpenAPI JSON/YAML 文本，不运行安装、测试或构建脚本。已知密钥形式与私钥文本被拒绝。schema27 以 Project+路径保存稳定 source UUID、版本、内容 SHA-256，按标题/行数界限分块并保留每个 chunk 的行范围、原文和 hash。导入失败不留下半成品，可修复后重试；同内容重导入幂等。撤销只清空 Forge 保存的片段正文，保留引用墓碑，不删用户文件。固定 `knowledge.list/import/chunk/revoke` Host→Main→Preload→Vue 通道均有封闭校验；Web 无本地访问。见 [ADR 0062](decisions/0062-host-owned-project-document-ingestion.md)。

真实 SQLite/Host 测试覆盖含空格/中文路径、双项目隔离、symlink 越界、路径遍历、过大/错误编码/敏感内容/伪 OpenAPI、失败重试、源版本升级、restart、撤销墓碑和原文保留。真实 Electron/Python Host smoke 在独立受信 fixture Project 中，从 Desktop 只读导入 `docs/guide.md`、显示 `knowledge:<id>@1#0` 的第1–2行，再撤销并确认项目原文未删、声明的 `test` 脚本未执行；截图已人工查看：[P5-06 项目资料](../output/playwright/p5-06-knowledge-desktop.png)。T066 的读取隔离和 T068 的墓碑为当前局部证据；检索隔离/索引撤销 T066/T068/T069 归 P5-07，规则冲突 T067 归 P5-08，权威规则引用门禁 T070 归 P5-09，66 条 deferred 映射保留，均未标 PASSED。没有构建 FTS、Context Builder 或 Memory。P4-05/P4-10、完整 P4 Gate 仍 BLOCKED；Claude 未调用。Windows/Intel、安装包、真实用户 DB schema26→27 和并发恶意路径替换 **UNVERIFIED**。

## P5-05 · 工作流版本冻结 · 2026-09-24

状态：**DONE（真实 SQLite/RunConfig 版本冻结与 Desktop 影响预览）；P5-06 开始。** Python Host 从不可变 `workflow_revisions` 读取并复算已发布定义的内容哈希，生成明确的 Workflow `VersionLock`；`RunConfigService.create` 在同一数据库事务中核对 `workflow.*` 的发布版本/hash，拒绝草稿、未知、伪造或损坏版本。Host 固定只读 `workflow.impact` 返回已发布版本、草稿变化和实际冻结 Run 数；Desktop 预览区展示这些真实计数，未保存编辑另有说明。没有自动迁移旧 Run，也不把发布解释为执行。见 [ADR 0061](decisions/0061-published-workflow-revision-locks.md)。

真实 SQLite fixture：批准 Task 引用同一 Workflow，v1 RunConfig 启动到 `running`；发布 v2 后该 Run 仍引用 v1/hash；取消并确认终态后，新 Run 明确选择 v2/hash 进入队列；独立 reopen 后两个 RunConfig 仍各自保留版本，影响预览计数为 v1/v2 各 1。错误版本/hash 在创建时拒绝。真实 Electron→Python Host smoke 读取 `workflow.impact`，确认发布 v2 后版本列表和零 Run 计数，并在 Vue 显示影响预览；沙盒 Renderer 仍无 Node。**此处未运行自定义 Workflow 的节点或 Codex Agent**，其 T029/T031～T035 运行变体仍标 `DEFERRED_VERIFICATION` 归 P5-11。P4-05/P4-10 和完整 P4 Gate 仍 BLOCKED；未请求 Claude 凭据或产生 Anthropic 费用。Windows/Intel、真实用户数据库升级与安装包 **UNVERIFIED**。

## P5-04 · 高级画布编辑 · 2026-09-24

状态：**DONE（macOS arm64 当前画布范围）；P5-05 开始。** Vue Flow 懒加载展示 P5-03 同一份封闭 Workflow DSL：正常边与有限返工边从定义生成，Host 编译诊断高亮对应节点。拖动仅改变设备本地布局，不写 Host 或触发 Run。严格 `forge-workflow-canvas/v1` 导入导出携带语义定义和独立布局，限制 256 KB、节点 ID 全量匹配、未知字段拒绝；导入落在未保存草稿，明确保存与重新编译后才能发布。画布不创建并行写，也不改变人工门禁。见 [ADR 0060](decisions/0060-workflow-canvas-as-a-view-of-the-published-dsl.md)。

Web 单测覆盖语义往返、布局独立与畸形输入拒绝；真实 Electron→Python Host smoke 在临时 schema26 库中先检查未绑定 Profile 的 Host 发布错误能高亮节点，再发布实际可用 Codex Profile 的草稿，导出/导入后确认数据库的发布版本未改变。截图已人工查看：[P5-04 画布](../output/playwright/p5-04-canvas-desktop.png)。T026/T027 的画布操作与错误定位有当前证据；T028/T029/T030 的自定义运行/旧 Run/全局返工上限部分保留到 P5-11/P5-05/P5-11，`docs/deferred-verification.json` 保留原 Test ID。Claude P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED；没有调用模型或修改参考规格。`@vue-flow/core@1.48.2`、既有 `zod@4.6.4` 精确锁定，许可证与兼容记录已更新。Windows/Intel、跨设备布局同步和安装包 **UNVERIFIED**。

## P5-03 · 线性配置编辑体验 · 2026-09-24

状态：**DONE（真实 Desktop/Host 草稿与发布当前任务范围）；P5-04 已开始。** 共用 Vue `WorkflowsView` 从 Python Host 的正式 quick/standard/strict 模板新建，按顺序添加/删除/移动节点，绑定当前真实保存的 Agent Profile，配置有限失败返工路径并显示逐字段预检诊断；末端人工验收门禁不可删除。普通 Web 不调用本地 Host。固定 Preload/Main 桥仅允许 `presets/list/get/saveDraft/compileDraft/publish` 六种命令，Main 和 Host 都校验封闭负载；不开放任意 JSON-RPC。Python Host schema26 增量保存草稿 CAS、内容 hash 与不可变 `workflow_revisions` 发布记录，不改既有 Project/Task/Run。发布前按实时已安装能力重编译；不启动 Run，也不授予工具操作。见 [ADR 0059](decisions/0059-linear-workflow-drafts-and-publish-gate.md)。

真实 Electron→Python Host 临时数据库中，先保存 quick 草稿并确认未绑定 Profile 时发布被拒，再保存当前已探测可用的 Codex Developer/Reviewer Profile，经页面选择绑定、保存 v2，明确点击发布后读回 `publishedRevision=2`。这不调用模型生成，也不是自定义 Workflow 已可运行。另在 SQLite/Host 测试中保留主路径环草稿，发布拒绝且定位 `WORKFLOW_NORMAL_CYCLE`；检查缺绑定、重复发布、CAS、重启读回、不可变发布行、未知命令与额外字段拒绝。实际 Desktop 截图：[P5-03 线性编辑](../output/playwright/p5-03-workflow-desktop.png)。T026/T027 的当前发布路径已有真实证据；T028/T029/T030 的运行/旧 Run/全局尝试上限部分仍分别归 P5-11/P5-05/P5-11，53 条 deferred 映射保留。P4-05/P4-10 和完整 P4 Gate 仍 BLOCKED，Claude 未调用。Windows x64、macOS Intel、安装包与真实用户 DB schema25→26 升级 **UNVERIFIED**。

## P5-02 · Workflow编译器 · 2026-09-24

状态：**DONE（静态编译与真实已安装能力预检的当前任务范围）；P5-03 已开始。** Python `workflow_compiler.py` 对封闭 Workflow DSL 生成确定性哈希、主路径拓扑顺序及逐项诊断；结构检查覆盖不可达/环、绑定、输入输出、能力、预算、有限返工、条件路由。条件仅接受白名单字段和值，不执行 `eval`。仅注入实际已安装 Profile/Executor/Verifier 的 Catalog 时才可能 `launchable=true`；Host 固定 `workflow.compilePreset` 只读预检实际安装状态，不写库、不启动 Run。当前内置完整模板因 Planner/Verifier 绑定未安装而正确报不可运行，既有 P2/P3 单 Develop 路径保持原样。见 [ADR 0058](decisions/0058-python-workflow-compiler-and-preflight.md)。

T026～T030 的完整编辑/运行/版本用例继续 `DEFERRED_VERIFICATION` 到 P5-03/P5-05/P5-11，不能以静态 fixture 宣称通过。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`（54 deferred）、`pnpm py:check`（145 pytest、Ruff、严格 mypy 53 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。未新增依赖、数据库迁移或 Renderer 权限；P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED。

## P5-01 · 标准/快速/严格模板 · 2026-09-24

状态：**DONE（版本化模板定义与静态准入的当前任务范围）；P5-02 已开始。** Python Host wheel 内新增 `standard@1`（Plan→Develop→Review→Verify→人工验收）、`quick@1`（仅省 Plan，保留 Review/Verify/人审）和 `strict@1`（Plan 后再加人工门禁）三份正式 JSON。`WorkflowTemplate` 使用封闭严格模型加载，静态拒绝未知字段/绑定、不可达节点、正常主路径环、非人类终点、无界返工和不足的总尝试预算；测试逐份对照权威 `workflow.schema.json`，打包 wheel 实测包含全部 JSON。生产运行时不读取只读参考目录，不修改现有 RunConfig/SQLite。见 [ADR 0057](decisions/0057-bundled-workflow-template-source.md)。

**这些模板目前不是可运行的三种 Workflow。** 现有 Python Host 仍保留已验证的单 Develop 入口，Planner 和通用 Verifier 插件替换没有安装，P5-02 全量编译/能力解析、P5-05 版本冻结后才能进入对应运行流程。T026～T030 保留权威引用，分别递延到 P5-02/P5-05，未标通过。`uv --directory python build --out-dir /tmp/forge-p5-01-wheel` 成功，wheel 中实有 quick/standard/strict 三个 JSON；`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`（49 deferred）、`pnpm py:check`（139 pytest、Ruff、严格 mypy 52 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` exit 0。P4-05/P4-10 和完整 P4 Gate 仍 BLOCKED；P5 只在用户授权的单执行器开发范围推进。无新依赖、迁移、Anthropic 调用或发布。

## P4-10 · P4替换性验收 · 2026-09-24

状态：**BLOCKED；当前单 Codex/执行器无关的适用检查已执行，完整 P4 Phase Gate 未通过。** P4-10 本地插件生命周期替换 fixture 证明旧上下文卸载并可重新解析新适配器，但不是两个真实执行器。当前 Python Host 的生产 `ProjectCommandVerifier` 仍由 Host 直接持有，PluginContext 尚无真正的 Verifier 插件注册路径，不能声称不改 Core 即可替换验证器。插件开发边界见 [说明](plugin-authoring.md)，完整证据与未完成项见 [P4 开发范围报告](p4-development-scope-report.md)。权威任务/Test ID 和 Depends on 不变；T041～T045 的 Claude 真实部分、T116～T120 的 P6/P9 评测均保留追踪，不当作 PASSED。

实际 `pnpm test:p3-live` 的六个本地场景和真实 Codex 开发/Verify 通过，但第一次 Reviewer 未返回结构化结果，验收脚本正确失败。对同一隔离 Desktop/Python Host 路径仅重试一次后，真实 Codex Develop→Verify→Review→Owner 人工验收→独立本地合并成功，源 Git 保持干净；Run `31f78df5-79e8-4cb4-9f57-2c39a8dc7085`，Review `d73ad1c7-5856-4d5e-bbf2-c5cd29b40425`。这只有一个真实 Executor。`pnpm validate:contracts`、`pnpm validate:task-map`（44 deferred）、`pnpm py:check`（134 pytest、Ruff、严格 mypy 50 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0；冻结安装沿用 P4-09 已通过结果。没有调用 Claude，也没有 Anthropic 费用。用户允许 P5 中不依赖第二执行器真实运行的开发按精确 `P4-10 → P5-01` 例外继续；因此 P5-01 已开始，但 P4-10 未标 DONE，完整多执行器发布仍 BLOCKED。

## P4-09 · 插件故障隔离与诊断 · 2026-09-24

状态：**DONE（当前受信内置插件/Codex 单执行器开发范围）；P4-10 已开始。** Python PluginRegistry 现在对激活、Run 交付和卸载故障保留最多 50 条只含稳定 code、pluginId、阶段、UTC 时间与受影响 Run ID 的诊断，不把异常原文、路径、凭据或堆栈传给 Renderer。固定 `plugin.inspectBundled` 桥把真实故障返回 Desktop 插件页；错误插件不能发布半激活贡献，卸载报错仍撤销贡献并清理 scope。实际注入激活异常后真实 Host 仍可探测/信任项目、读取 Board 快照和健康状态；运行异常/失败保留具体 Run 影响，Vue 故障视图可读。先前 T036～T039 的资源释放、回滚、Run 锁和预导入拒绝测试保留；T040 的“激活异常”分支已实测，故先前 P4-01～03 对 T040 的递延记录已关闭。恶意第三方同进程 Python 插件的 OS 级隔离、外部插件进程崩溃和 Windows/Intel 未实测。见 [ADR 0056](decisions/0056-plugin-fault-diagnostics-and-core-isolation.md)。

Claude 未配置时仍不可选，未启动 Claude、未产生 Anthropic 费用；T045 的“运行中认证失效”仍需合法凭据、P4-05 真实适配和 P4-10 补验，保持 `DEFERRED_VERIFICATION`。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm py:check`（133 pytest、Ruff、严格 mypy 50 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop` 与 `git diff --check` 均 exit 0；全量测试首跑发现合同测试 fixture 未加新 `faults` 字段，已修复并复跑。P4-05 和完整 P4 Phase Gate 仍 BLOCKED，未发布多执行器支持。

## P4-08 · 工具/MCP入口契约 · 2026-09-24

状态：**DONE（当前受控本地契约范围）；P4-09 已开始。** Python Host 的 `ToolRegistry` 接收插件声明，但注册本身不授予运行权限。仅可信 Core/Policy 可签发绑定 tool、Project、Run、Attempt、具体权限和到期时间的一次性授权；调用前后以封闭 JSON Schema 和大小限制校验，超时只尝试一次，结果显式标记 `untrusted`，工具文本不能触发或伪造审批。PluginContext 的工具注册随激活阶段暂存，贡献/权限不符或重复 ID 会回滚；当前内置 Codex 插件声明零 Forge 工具。`McpSession`/`McpToolProxy` 只定义固定文本结果接口并用本地 fixture 验证，不启动任意外部 MCP 服务、不开放 Renderer 工具通道。见 [ADR 0055](decisions/0055-controlled-tool-and-mcp-entry.md)。

T076～T080 的本地变异/时限/权限/重复注册测试在真实 Python Registry 上通过；T078 的 MCP 服务是受控本地 fixture，不是第三方服务器在线验收。Python 新增精确直接依赖 `jsonschema==4.26.0` 和仅开发类型包 `types-jsonschema==4.26.0.20260518`，已同步 uv 锁、版本和许可证。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm py:check`（128 pytest、Ruff、严格 mypy 50 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0。P4-05 仍 BLOCKED，第二真实 Executor 和完整 P4 Phase Gate 未验收；Windows x64、macOS Intel、安装包与外部 MCP 实连均 **UNVERIFIED**。

## P4-07 · ModelProvider与整理器替换 · 2026-09-24

状态：**DONE，仅已授权 Codex 单执行器/模型提供方的开发范围。** Python Host 的 `ModelProvider`/`ModelSession` 公共契约把结构化生成、逐条文本、可空 usage、运行时 capability 与认证方式和 Coding `ExecutorAdapter` 分开。Refiner 从锁定的 Plugin Registry 获取 Provider；内置 Codex 插件升级为 `0.0.2` 并更新精确内容 hash。Refiner 继续只提出源消息绑定的 Task Contract，人工审批仍单独决定 TODO。Codex app-server 使用只读临时目录、`approvalPolicy: never`，发现命令/文件/MCP item 即拒绝；当前未开放任意模型工具。非空 token 上限在 Codex 无法保障时拒绝，真实执行的是输出字节上限和超时。缺少其他供应商凭据不会自动切到新付费服务，Claude 仍不可用。见 [ADR 0054](decisions/0054-python-model-provider-and-refiner-boundary.md)。

真实 macOS arm64 证据：`pnpm test:model-provider-live` 对现有已授权 Codex 登录获得结构化 JSON、10 条顺序文本增量和原生 usage（20,629 input / 15 output），无工具事件；`pnpm test:python-refiner-live` 经独立 Python Host 得到带澄清问题的 Draft，人工审批后才进入 TODO。`FORGE_MODEL_PROVIDER=disabled` 的真实 Electron `node scripts/smoke-p1-offline.mjs` 检查 `MODEL_PROVIDER_DISABLED`，并完成受信项目→保存消息→手工草稿→人审 TODO→重启恢复，项目脚本未运行。离线 fixture 覆盖非法 JSON 三次失败、模型替换、权限边界；插件测试覆盖注册/卸载/禁用 Provider 时 Executor 保持可用。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（42 deferred）、`pnpm py:check`（121 pytest、Ruff、严格 mypy 48 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0。截图：`output/playwright/p4-07-model-provider-desktop.png`。Windows/Intel/安装包仍 **UNVERIFIED**；P4-05 与完整 P4 Gate 仍阻塞。

## P4-06 · Agent Profile与能力选择 · 2026-09-24

状态：**DONE，仅获授权的 Codex 单执行器开发范围；Claude 专属验收仍待补。** 用户明确允许 P4-05 的 Claude 外部凭据阻塞不阻止不依赖 Claude 实际运行的 P4-06～09，但 P4-05 仍为 BLOCKED，权威 `Depends on`、Task/Test ID 未变。精确例外见 [ADR 0052](decisions/0052-claude-sdk-api-key-gate.md) 和 `docs/development-dependency-exceptions.json`；任务图校验器拒绝其他 BLOCKED 边或把开发例外用于完整发布。已存在的公共 `ExecutorAdapter`/`ExecutorCapabilities`、Codex app-server 实测路径和审查只读/审批门禁支持当前限定工作；不能满足的权限或能力必须拒绝启动。Claude 仅完成 SDK/CLI 离线安装探测，**没有适配器实现、本地契约完整测试或在线验收**，不可选。`T041` 的两个不同真实执行器完成同一 TODO、Claude 取消/续接/运行中认证失效，以及完整 P4 Phase Gate 和多执行器发布继续待验；用户以后提供合法凭据并授权预算后再补验，不反复询问 Key。

当前实际启动命令：`pnpm dev:desktop`（先本地冻结同步 Python，再启动 Vue/Vite、Electron 与唯一业务 Python Host）；`pnpm start:desktop` 加载已构建界面；`pnpm dev:web` 没有本地 Host。MIG-PY-01～09、P2 Python-only Desktop 纵向闭环和 P3 开发→Verify→Review→人工验收→独立本地合并已有真实 macOS arm64 证据，见 [P2](p2-completion-report.md)、[P3](p3-completion-report.md) 报告。当前 Codex 可演示受信项目、手工/模型草稿、人审入 TODO、隔离开发、真实 Diff、验证、只读审查、人类终验和显式本地合并；不表示自动部署或 Claude 可用。

P4-06 开始前复查：`pnpm validate:task-map`、`pnpm py:check`（111 pytest、Ruff、严格 mypy 45 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`git diff --check` 均 exit 0。P4-06 真实实现：Python Host 的 schema v25 新增不可变 Agent Profile 版本；Developer/Reviewer 的角色职责、上下文、权限、模型与限制独立保存，并在运行时用注册执行器的真实 capabilities 重新核验。选中版本及 hash 冻结进 RunConfig/Review job；不可满足只读、网络限制、审批或模型要求时拒绝启动。Electron Agents 页展示真实 Codex 与不可用 Claude，Web 无本地写入桥。单测覆盖 CAS、重启、SQLite 迁移、各能力拒绝；真实 Desktop/Codex Profile Run 修改隔离 fixture、测试通过、源仓库无变化，Reviewer Profile 完成固定快照的只读 Review。截图见 `output/playwright/p4-06-agents-desktop.png` 与 `output/playwright/p3-03-python-desktop-review-1440x900.png`。完整回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（42 deferred）、`pnpm py:check`（115 pytest/Ruff/严格 mypy 46 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过；Windows x64、macOS Intel、打包/签名、真实用户数据库升级与 Codex utilityProcess 历史恢复风险仍未实测。

## P4-05 · Claude SDK真实适配 · 2026-09-24

状态：**BLOCKED，未验收、未标 DONE。** 权威交付要求第二个真实 Executor 用同一契约完成独立编码任务。已按官方资料固定 `claude-agent-sdk==0.2.159` 和 `python/uv.lock`，将直接与传递依赖纳入许可证库存及 `versions.lock.json`。`pnpm probe:claude-offline` 在受 Forge `ProcessController` 管理的真实子进程中调用随包 CLI 的 `--version`：SDK 0.2.159、CLI 2.1.281、darwin/arm64、API Key 未配置、`liveVerified=false`；环境过滤不转发 API Key/OAuth 值。新增测试确认不打印密钥和离线子进程清理。**这只验证安装与本机二进制，不是 Claude Executor 适配或真实任务验收。** Python Registry 仍仅注册 Codex；Host/Core/UI 不声称 Claude 可用。见 [ADR 0052](decisions/0052-claude-sdk-api-key-gate.md)。

用户明确表示目前没有 Claude API，暂不验收此部分。官方文档要求第三方产品使用 API Key，不得使用本机订阅登录替代。未进行在线 Claude 请求或产生模型费用；未实现/验证 Claude 事件归一、工作区写入、审批、取消、续接、模型/认证失败与同一合同切换。T041～T045 保留权威引用，未标 PASSED。此段记录 P4-05 初次暂停时的状态；用户随后批准精确开发依赖放行，现已完成 Codex-only P4-06 并继续 P4-07，P4-05 仍 BLOCKED。恢复需用户在仓库外安全配置授权的 Anthropic API Key，并明确允许有成本上限的真实 fixture；届时继续实施与真实验收，不跳过 P4-05。Windows/Intel/安装包仍未验证。本轮没有修改 SQLite、用户数据、插件生产注册或 Renderer 权限，没有提交、推送或发布。

本轮检查：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（9 Phase/92 Task/120 Case/37 deferred）、`pnpm probe:claude-offline`（SDK 0.2.159/CLI 2.1.281、无 Key、未 live）、`pnpm py:check`（111 pytest、Ruff、严格 mypy 45 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host schema24、degraded/crash/owned cleanup）及 `git diff --check` 均 exit 0。**未运行 Claude live test，不能把 P4-05 标为验收通过。**

## P4-04 · 配置生成表单 · 2026-09-24

状态：**DONE（macOS arm64 当前任务范围）；P4-05 已开始。** Python Host 新增固定无参数 `plugin.inspectBundled` 只读诊断，返回锁校验后的真实内置 Codex manifest 版本、API 范围、兼容/激活状态、问题清单和封闭配置 Schema。Electron Main 仅受信主框架可调用固定 IPC；Preload/Client 不暴露任意 Host 方法、Node、文件系统或凭据。正式 `@forge/ui` 的 `ForgeSchemaForm` 从受限 scalar Schema 生成有标签的控件，仅序列化声明字段；credential 字段用 masked input 且只接受 `credential:<id>`，原始 Key 不返回或提交。Python Manifest 与 TS Schema 同步拒绝未知词汇、未知配置字段、错误类型。Codex 实际 Schema 为空，Desktop 插件页真实显示“无可编辑配置项”，没有虚构 Save 或凭据管理。兼容错误展示 Host 的安全 code/message。见 [ADR 0051](decisions/0051-plugin-schema-form-and-read-only-inspection.md)。

真实 Electron→Python Host smoke：内置 `forge.executor.codex@0.0.1`、API `^1.0.0`、active/compatible、空封闭 Schema 从固定 bridge 返回，Vue 插件页可见；Renderer `require/process/ipcRenderer` 不可用，storage degraded、Host crashed/owned PID 清理回归通过。真实截图已检查：[插件页](../output/playwright/p4-04-plugin-desktop.png)（Retina 2880×1736 像素）。合成字段 fixture 仅用于表单校验，未伪称为已安装插件设置。完整跨页 T106～T110 继续按权威 ID `DEFERRED_VERIFICATION`，映射 P6-01/P6-02/P6-07；亮色 token 对比、既有焦点单测和 reduced-motion CSS 只是局部证据，不算双主题/Windows DPI 全项通过。

本轮命令：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（37 deferred）、`pnpm py:check`（110 pytest、Ruff、严格 mypy 44 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过。无新依赖、安装脚本、SQLite migration 或 API Key。Windows x64、macOS Intel、暗主题和安装包 **UNVERIFIED**。无提交、推送或发布。

## P4-03 · 内置插件装配与锁 · 2026-09-24

状态：**DONE（macOS arm64）；P4-04 已开始。** `python/src/forge/builtin_plugins/plugins.lock.json` 固定内置 Codex manifest/entry/config 的 SHA-256、插件精确版本和包摘要。Registry 在 discover、activate 和新 Run 前核对文件；缺失、重复、被改写或链接的锁/文件在导入 entry 前拒绝并进入只读诊断。新生产 RunConfig 保留既有 Executor/上游 CLI 锁，同时增加 `forge.executor.codex` 包 ID/版本/contentHash 的不可变锁，旧快照/SQLite v1～24 不重写。Development 只对 Registry 实际拥有的生产 Adapter 实施版本门禁，启动前核对包锁并取得 Run lease；返工保持同版本。活跃 Run 请求停用进入 draining，当前 Adapter 保留且新 Run 被拒；最后 lease 释放后才真正 dispose。见 [ADR 0050](decisions/0050-bundled-plugin-lock-and-run-draining.md)。

真实 `pnpm test:p3-live` 最终 exit 0：六个隔离场景、Electron→Python Host→Codex 开发 Run `73dcf502-5737-4684-bf86-a3c9fcf1c4d1`、正式 Verify/Review/人审/显式本地合并及真实混合状态看板；脚本从测试隔离 SQLite 读取 RunConfig，断言插件包 ID/版本/hash 与锁文件完全相同，源 Git 干净。首次 live 在直接注入未注册测试 Executor 的 Review 返工 fixture 因版本门禁失败；限定门禁为 Registry 实际拥有的生产 Adapter 后，定向及完整 live 重跑通过。另以 `uv --directory python build --out-dir output/package-probe` 检查 wheel 包含锁、manifest、entry 和 config schema。最终 `pnpm install --frozen-lockfile`、contracts（47 文件/0 error/4 既有 warning）、task-map（32 deferred）、`pnpm py:check`（108 pytest、Ruff、严格 mypy 44 源文件）、lint/typecheck/test/build、Desktop smoke/schema24 和 `git diff --check` 全部 exit 0。T038 目前受信插件 Registry 语义已实测，T040→P4-09 仍 `DEFERRED_VERIFICATION`。Windows/Intel、安装包执行、实际在运行中替换已签名应用包及第三方恶意代码隔离 **UNVERIFIED**。无新依赖、SQL、凭据、提交或发布。

## P4-02 · Registry与DisposableScope · 2026-09-24

状态：**DONE（macOS arm64）；P4-03 已开始。** Python Host 的 Registry 现在在导入受信 entry 前按依赖拓扑解析 Host 服务；缺失、重复和循环均明确拒绝。每次插件激活有独立 `DisposableScope`；公开 `PluginContext.register_executor()` 返回可幂等注销的 Disposable，额外资源可交给 scope 管理。注册只在激活完全成功后发布；中途异常先尝试插件清理，再逆序释放 scope，Host 自有服务继续可用。停用先撤销贡献，再清理插件和资源；重复 dispose 幂等。T036 实测 10 次激活/停用的监听器式资源回到基线，另 10 次真正拥有的 Python 子进程逐次退出。T037 注入第二资源后失败，逆序清理且无 Executor 泄漏；服务环路在 entry import 前拒绝。详见 [ADR 0049](decisions/0049-plugin-registry-disposable-scope.md)。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（全量检查时 35 deferred，T036/T037 证据登记后移除 2 项，现 33）、`pnpm py:check`（105 pytest、Ruff、严格 mypy 43 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host schema24/ready/degraded/crashed）及 `git diff --check` 全部 exit 0。T038→P4-03、T040→P4-09 仍按原权威引用为 `DEFERRED_VERIFICATION`，未标 PASSED。无新依赖、SQL、凭据或 Renderer 权限；Windows/Intel、安装包插件生命周期、恶意同进程 Python 代码隔离仍 **UNVERIFIED**。没有提交、推送或发布。

## P4-01 · Manifest和版本解析 · 2026-09-24

状态：**DONE（macOS arm64）；P4-02 已开始。** Python Host 的受信内置插件入口新增纯只读 `ManifestReport` 预检，返回具体 code/field/message，不执行 entry。检查权威 Schema 的清单字段、exact/caret SemVer API 范围、固定 allowlist 来源、受控文件大小/路径/symlink、平台、权限、所需服务、贡献类型及有限封闭配置 Schema/值。Registry discover 先拒绝无效静态清单；activate 在首次 import 前重复当前权限/服务预检。T039 的非法 ID、重复 ID、平台、未知权限、错误 API/配置/source 和真实 Registry import sentinel 均验证错误清单、无插件代码副作用及无 Executor 注册。此处不加载第三方插件；配置语法当前保守拒绝复杂 JSON Schema，后续 P4-04 需按正式表单要求扩展。见 [ADR 0048](decisions/0048-python-plugin-manifest-preflight.md)。

最终命令均 exit 0：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（33 deferred）、`pnpm py:check`（98 pytest、Ruff、严格 mypy 42 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host schema24/ready/degraded/crashed）、`pnpm probe:codex` 和 `git diff --check`。`probe:codex` 仍是本机 Codex 可用性诊断，不代表第二 Python Executor 或插件替换性验收。T036/T037→P4-02、T038→P4-03、T040→P4-09 保留 `DEFERRED_VERIFICATION`，未标 PASSED。无新依赖、SQL、凭据、提交或发布；Windows x64、macOS Intel、安装包内插件路径与恶意同进程 Python 代码隔离仍 **UNVERIFIED**。

## P3-12 · P3可交付验收样例与阶段出口 · 2026-09-24

状态：**DONE（macOS arm64 当前阶段范围）；P3 Phase Gate PASSED；P4-01 已开始。** 六个独立 Git/SQLite/Python Host 场景真实覆盖正常交付、混合状态看板、结构化 Review 退回、批准测试失败后的有界返工、非安全建议的人类豁免以及 Git 已更新后 Host 崩溃重启对账。另一次真实 `pnpm test:p3-live` 经 Electron→Python Host→Codex 完成消息/手工 Draft/人工批准 TODO→隔离开发→固定快照→批准命令 Verify→逐项 AC 决定→只读 Review→独立 Owner 验收 Done→另行确认本地合并；原生确认取消时目标不变，最终源 Git 干净。任务抽屉从 Host 读取正式 text/plain 验证报告，Vue 将恶意 HTML/链接当文本渲染。独立 Desktop 混合状态看板测试发现并修复 Host TODO 排序误计 Done 及嵌套键盘 Enter 被卡片拦截的问题，并覆盖越列拒绝、筛选、键盘排序。真实 1440×900 截图与 ID 见 [P3 Demo](demo/p3-delivery.md)；阶段结果见 [P3 报告](p3-completion-report.md) 与 [ADR 0047](decisions/0047-p3-delivery-acceptance-scope.md)。

最终质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/29 deferred）、`pnpm py:check`（83 pytest、Ruff、严格 mypy 41 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host、schema24/ready/degraded/crashed）和 `git diff --check` 均 exit 0。T116–T120 保留原权威引用、映射 P6-09/P9-06 为 `DEFERRED_VERIFICATION`，未标 PASSED。Windows x64、macOS Intel、安装包/签名/DPI、现有用户库升级、线上强制 Reviewer 二次退回与恶意第三方插件隔离仍 **UNVERIFIED**。无新依赖、凭据、提交、推送或发布。

## P3-11 · 备份与磁盘故障处理 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；现有用户数据库和安装包未实测）**。Python Host 的 SQLite 单写者边界新增在线 WAL 一致性备份，先检查完整性与外键，再将仅含 Forge 数据的私有备份原子发布。已有库升级先检查保守可用空间并创建升级前备份；新库不假造升级前版本。migration v24 仅增加限额不可变导入证据和插件 namespace 存储，不修改旧 migration/checksum。失败升级回滚并锁住写入，旧 Task/审批不丢；磁盘满写入回滚、Host storage health unavailable，后续写入拒绝。备份恢复由用户明确操作，本轮不自动覆盖较新数据库。见 [ADR 0046](decisions/0046-wal-backup-artifact-and-disk-fault-boundary.md)。

真实验收：独立子进程在 Task/审批/Run event 同一事务中途 `os._exit`，重启三者均维持先前已提交值（T086）；活跃 WAL 库含已批准 Task 和导入 Artifact，在线备份恢复最新已提交记录且 `foreign_key_check` 通过（T087）。注入错误 SQL 的 v25 测试升级保留 v24 旧值与升级前备份，Host health 不报 ready；真实 v23→v24 独立 Python Host 启动也保留已批准 Task（T088）。SQLite `max_page_count` 触发真实 `SQLITE_FULL` 而非假异常，写入回滚、无成功标记、诊断为 `DATABASE_DISK_FULL`（T089）。插件通过 manifest 声明的 `storage.v1` 只能得到自身 JSON key/value 句柄，不能通过该接口查询 Core 表或获取 SQL 会话；两插件 namespace 隔离（T090）。ArtifactStore 仅从 Forge 拥有且匹配 Project/Verify Job 的私有根读取，拒绝遍历、绝对路径、符号链接和错误 MIME，T057 的通用文件导入边界得到真实测试并从 deferred 中移除。恶意同进程 Python 插件可绕过语言封装，正式第三方进程隔离仍属 P4；SQLite 备份不包含外部 Git CodeSnapshot 对象。

最终质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/28 deferred）、`pnpm py:check`（82 pytest、Ruff、严格 mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host、schema24/ready/degraded/crashed）与 `git diff --check`。首次 Python 全量回归暴露事务包装将约束失败误映射为 IO_ERROR，改为只对 SQLite FULL/IOERR/READONLY/CORRUPT/NOTADB 锁故障后 82 项通过。现有用户 DB v23→24、安装包、Windows x64、macOS Intel、DPI、签名及恶意第三方插件进程隔离 **UNVERIFIED**。无新依赖、凭据、提交、推送或发布。下一权威任务 P3-12 已开始。

## P3-10 · 配置/需求变化失效链 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；不宣称真实 Codex 运行中修改目标已在线实测）**。Python Host 新增独立 Task 版本变更提议、精确 hash/revision 人工决定和安全点应用；SQLite 附加 migration v23 只增加 `task_change_requests`，不重置用户 Project/Task/Run。提议保留旧 RunConfig/Run/Attempt，变更目标或 AC 不注入活跃执行上下文；活跃 Run、Review、Verify、返工及 interrupted Run 时批准仅成为 `awaiting_safe_point`，需全部结束后再次明确应用。批准等待期间拒绝新 Run/Review/Verify；应用后旧 CodeSnapshot、Review/Verify、AC 矩阵与最终人审只作历史记录，不可使当前 Task Done，旧 Review issue 标为 stale。旧 Handoff 不能对新 Contract 启动 Review/Verify。Task 来源保留旧消息/决定并新增本次人类决定；拒绝和 CAS 冲突不改 Task。Vue 任务抽屉提供每条 AC、目标、原因和范围确认的变更入口，不执行模型或自动开发。见 [ADR 0045](decisions/0045-approved-task-revisions-and-safe-point-invalidation.md)。

真实证据：隔离 Git/SQLite fixture 验证当前已接受快照的 Task v2→v3、旧 RunConfig 与源 HEAD 不变、矩阵/最终验收失效、旧 Review/Verify 启动拒绝、活跃 Run 安全点等待、重复 apply 幂等、拒绝后第二客户端不能批准、AC 改动必须确认范围。独立 Python Host stdio 进程提议→退出→新进程批准→再重启读取，非法额外 RPC 字段拒绝；Vue 测试验证提议与批准分离、等待提示及历史 Handoff 不可 Review。既有 P1 测试继续覆盖 T016–T020 的未批准开工、并发初始批准、旧 hash 失效、拒绝与 AC 来源；权威 Test ID 未改。

最终命令：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/29 deferred）、`pnpm py:check`（73 pytest、Ruff、严格 mypy 39 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（真实 Electron/Python Host、schema23/ready/degraded/crashed）与 `git diff --check` 均通过。首次 Desktop smoke 因旧 UI 断言 schema22 而失败，更新为真实 23 后重跑通过。真实用户现有 DB v22→23、Windows x64、macOS Intel、安装包/签名/DPI、真实 Codex 中途修改目标与历史孤儿进程自动接管仍 **UNVERIFIED**。无新依赖、权限、提交、推送或发布。下一权威任务 P3-11 已开始。

## P3-09 · 崩溃恢复与 reconcile · 2026-09-24

状态：**DONE（macOS arm64 开发路径；不声称可自动接管遗留进程）**。Python Host 首次可写握手在接受新 Run 前扫描上次 runtime 留下的 Run、Attempt、session ref、lease epoch 与进程日志。不能核实 kernel start identity 与原生 session/workspace 所有权时，不按历史 PID 杀进程、不自动恢复或重跑；未完成的 Run/Attempt 进入 `interrupted`，旧 lease 保留为 `quarantined`，审计记录 `host_restart_outcome_unknown`。重复握手不会重复改状态。已完成 Run 保持不变。Merge startup audit 核对目标分支精确双父 commit 及 Forge-owned candidate 工作区证据后才补记 `merged`；目标仍为旧 HEAD 时保留 intent 并要求人工确认；其他结果标 unknown。UI 显示待人工核对，不提供新 key 的盲目合并按钮。无新数据库 migration、依赖、权限或 Node Agent Core。见 [ADR 0044](decisions/0044-startup-recovery-and-side-effect-reconciliation.md)。

真实证据：隔离 Git/SQLite fixture 中独立 Python Host 进程在持久 intent 后、候选双父提交后、目标 branch 更新后分别 `os._exit`。新 Host 启动未执行第二次合并；前两种保留待人工，后一种核对 Forge-owned candidate/共同 Git 目录/唯一 commit 后补记已合并；目标更新但 candidate 证据缺失则标 unknown，源工作树干净。另一组真实 SQLite Run fixture 证明未完成 Attempt 中断、lease 隔离、历史 PID 即使等于当前测试进程也不被信任；重复恢复幂等。T031 terminal 结果重放不增事件，T032 过期 epoch 仅记 `result.stale`；已有有限 429 和真实父子孙取消/端口释放测试覆盖 T033/T035。T034 原 deferred 的 P2-01、P2-05、P3-06 引用在本轮以真实 Host 死亡测试验收，不修改权威 Test ID。

冻结安装、contracts/task-map、`pnpm py:check`（69 pytest、Ruff、严格 mypy 38 源文件）、lint、typecheck、test、build、macOS arm64 Electron Desktop smoke/schema22 和 `git diff --check` 全部 exit 0；新增 UI 告警测试单独复跑通过。真实当前用户 DB 未升级实测，Windows x64、macOS Intel、安装包/签名、历史孤儿进程安全接管或清理、真实 Codex 会话跨 Host 原生续接和外部并发 Git 写者 **UNVERIFIED**。这些不作为已通过验收。下一权威任务 P3-10 依赖已满足，将自动开始。

## P3-08 · 交付记录与显式合并 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；只支持当前已检出的干净本地目标分支）**。Python Host 在当前快照已获人类最终验收时保存不可变交付记录：获批 Contract hash/revision、所有开发 Attempt、最终 CodeSnapshot/base/commit、Review/Verify/逐条 AC 决定、人工豁免与明确风险。正式 Plan 尚未存在，因此 `planStatus=not_configured`，没有捏造 Plan。SQLite 附加 migration v22 只增加 `delivery_records` 和有唯一键的 `merge_operations`。Task Done 与本地 merged 分开：网页需明确勾选，Electron Main 再弹原生确认；Main 不运行 Git/SQL。Host 重查 Trust、最终验收与证据版本、Forge 快照 ref、当前目标分支及干净工作树，严格要求 target HEAD 与已验证 base 一致。合并前先记 operation intent，在 Forge 自有的隔离 worktree 形成固定双父候选，再仅以 `git merge --ff-only` 更新本地目标；不 force、不 reset、不 stash、不 push、不部署。重复 key 返回同一记录，重启后从 Git 双父 HEAD 对账未落库的结果，歧义状态不报成功。见 [ADR 0043](decisions/0043-delivery-record-and-explicit-local-merge.md)。

真实证据：四项独立 Git/SQLite/Host JSON-RPC 测试覆盖交付内容、一次显式双父合并、同 key 重放、合并后未写 receipt 的重启对账、目标前移拒绝且用户工作树不变、验收后 AC 证据变化使旧 Done/交付失效。`FORGE_VERTICAL_MERGE_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终 exit 0：真实 Electron→Python Host→Codex 开发 Run `e50fe6c3-8124-4a1c-bf57-f7def18385ef`，快照 `d35e1147-b00e-4819-a8f0-013626c6dc44`，Verify `efa45630-5654-49ac-a238-6e2bcd62a2d8` passed，Review `1da444a9-939a-406b-aefe-c1b4e205d366` approved，人审决定 `00ddf7f0-ce5b-489b-800e-18300ec7215d`。原生确认第一次取消，源码 HEAD 未变且没有 merge operation；第二次 UI 显式确认生成 operation `42895d6d-d31e-4c01-8592-54ff626cca20` 和双父 commit `ef9e229a8ac85b9087c3ec69b9e000dcd29defbf`，源工作树干净。实际 1440×900 [截图](../output/playwright/p3-08-python-desktop-merged-1440x900.png) 已目视核对。第一次在线测试在脚本未定义字段处停止；第二次暴露 Host 线程池调用 SQLite 的真实错误，修复为 Host 本线程执行有界 Git，并新增 Host JSON-RPC 回归；第三次完整在线运行通过。没有把前两次当成功证据。

最终质量链：冻结安装、contracts/task-map（9 phase/92 task/120 case/32 deferred）、Python pytest/Ruff/严格 mypy、lint、typecheck、test、build、Desktop smoke/schema22 与 diff check 均 exit 0。T050 的旧 base 合并拒绝与 T060 同操作键/重启对账已验证，从 deferred 中移除；T056/T058/T059 沿用此前实际证据，T057 通用外部 Artifact 路径/MIME 导入仍 `DEFERRED_VERIFICATION`→P3-11。真实用户已有 DB v21→22、Windows x64、macOS Intel、安装包/签名、外部并发 Git 写者及长期 Git 操作的 Host 响应性 **UNVERIFIED**。无新依赖、对 Forge 仓库提交、推送或发布。下一权威任务 P3-09 已开始。

## P3-07 · 人类最终验收 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；旧快照与未满足门禁均不能验收）**。Python Host 独占最终验收服务；用户在任务抽屉查看当前获批 Contract revision、不可变 CodeSnapshot、Review、Verify 与逐条 AC 决定后，明确确认接受或填写理由退回。提交带预期 snapshot/revision/basis hash，Host 在同一 SQLite 事务中重算并拒绝过期报告、快照或 AC 决定。缺少成功开发 Run、获批 Review、逐项覆盖、失败 Verify 或仍在运行/返工时不能接受。SQLite 附加 migration v21 保存不可变、幂等的最终决定与非安全 Reviewer 建议风险豁免；Host 固定本地 Owner actor，记录理由和证据版本。阻断性 Review issue 无法豁免。接受仅将当前快照投影为 Board Done，**不合并、不推送、不部署**；人工退回会从固定失败快照启动有来源反馈的新独立 Attempt，旧验收不沿用。见 [ADR 0042](decisions/0042-snapshot-bound-final-human-acceptance.md)。

真实证据：独立 Git/SQLite/Host 测试覆盖报告变化后的 CAS 拒绝、明确 AC 决定、建议问题 Owner 豁免、阻断问题拒绝豁免、接受后重启保持、人工退回新 Attempt/新快照和源 Git 干净。真实 Electron→固定桥→Python Host→Codex 的 `FORGE_VERTICAL_FINAL_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终 exit 0：开发 Run `58925161-f46e-4f9e-91e0-59652ddd6746`，快照 `73f52b25-2186-491c-8959-0bfc5444854c`，Verify `f7237a2e-30b3-41d7-9752-7454f0fe07b2` passed，Review `3fe027a2-00ba-4c8f-9286-fe4850ac94d9` approved，最终决定 `08100199-df15-401a-8f6c-59c53448ac63`，Board Done，源 Git 干净。实际 1440×900 [截图](../output/playwright/p3-07-python-desktop-accepted-1440x900.png) 已目视核对。第一次 live 运行仅因验收脚本在 Run succeeded 后立即读取尚在冻结的 Handoff 而失败；改为有界等待后完整重跑通过。在线模型这次无 advisory，豁免由真实 Host/Git/SQLite fixture 与 Vue 交互测试覆盖，未宣称在线模型豁免实测。

最终质量链：冻结安装、contracts/task-map（9 phase/92 task/120 case/35 deferred）、`pnpm py:check`（58 pytest、Ruff、严格 mypy 36 源文件）、lint、typecheck、test、build、Desktop smoke 和 diff check 全部通过。T055 非安全 advisory 的正式 Owner 版本化豁免、T059 旧快照最终验收拒绝已取得证据，从 deferred 追踪中移除；T034 Host 硬崩溃未知副作用对账仍延后 P3-09。真实用户现有 DB v20→21、Windows x64、macOS Intel、安装包/签名及在线模型主动产生 advisory 后的豁免仍 **UNVERIFIED**。无新增依赖、自动提交、推送或发布。下一权威任务 P3-08 已开始。

## P3-06 · 有限返工循环 · 2026-09-24

状态：**DONE（macOS arm64 开发路径；T034 Host 硬崩溃后副作用对账延后 P3-09）**。Python Host 新增共享 Review/Verify 返工服务与 SQLite 附加 migration v20。当前快照的不可变 `changes_requested` Review 或失败 Verify 报告各可触发一次幂等返工；同一快照不能并发启动两个写者。新 Developer Run/Attempt 从失败快照的固定 Git commit 建立独立工作区，继承冻结的 Task/Environment/RunConfig，加入有界且标明报告来源的反馈；新 Handoff 后只重跑原失败的 Review 或已批准 Verify 门禁。三次返工和二十次总 Attempt 上限共享，触顶投影 Task 为 blocked，不创建 Run、不伪造 Done。取消中的 owned 子进程确实停止，旧快照的 Review/Verify/AC 决定不会被新快照继承。`run.reworkCycles` 是固定只读诊断命令；Renderer、Main 均不执行业务或 SQL。见 [ADR 0041](decisions/0041-bounded-python-rework-loop.md)。

真实证据：`python/tests/test_rework.py` 的五项独立 Git/SQLite/实际子进程测试覆盖 Verify 失败→修复→自动 Verify 通过，Review blocker→有来源反馈的新 Attempt、Review/Verify 混合计数、重复失败触顶、二十 Attempt 上限与运行中取消；来源仓库保持干净。Review fixture 没有真实 ReviewJob，后续门禁正确 fail-closed；生产路径保留原 Reviewer Job/模型，真实 Codex 强制 Review blocker→自动重审循环尚未单独执行。`FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 实际 Electron→Main→Python Host→Codex 生成开发快照 `26662c64-50ee-4755-ac40-4205770da8e5` 与通过的 Verify `cd998b2a-6127-4c00-858c-5a86e8cd2489`，矩阵经过显式报告绑定成为 verified、来源 Git 干净；这次在线回归没有制造返工。首次 Desktop smoke 因仍断言 schema19 失败，修正为实测 schema20 后复跑成功。

质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/37 deferred）、`pnpm py:check`（54 pytest、Ruff、严格 mypy 35 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过；最后一轮计数与测试断言调整后定向五项 Python 测试、Ruff/mypy、contracts/web 测试通过。T031/T032/T033/T035 有确定性故障与幂等/界限证据；T033 的 429 是故障注入，未宣称上游实际返回 429。T034 硬 Host 崩溃未知副作用对账为 `DEFERRED_VERIFICATION`→P3-09。真实用户已有库 v19→20、Windows x64、macOS Intel、安装包、live Codex Review 返工循环仍 **UNVERIFIED**。无新增依赖、提交、推送或发布。下一权威任务 P3-07 已开始。

## P3-05 · 验收矩阵 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发路径的逐条 AC 映射；最终人类验收仍属 P3-07）**。Python Host 新增固定 `run.acceptanceMatrix/acceptanceDecide`：从已批准 Task Contract 当前 revision 逐条投影 AC，绑定 Task 最新不可变 CodeSnapshot，并展示当前快照的 Review 状态及真实 Verify 报告。自动 AC 初始 `unverified`、人工/检查项初始 `manual`；单条命令 `passed` 或 stdout 的成功文字不会自动覆盖任何 AC。用户明确关联当前快照报告并写理由后，自动项才可 `verified`；失败报告不能记作通过。人工判断可记录 `verified/failed/risk_accepted/not_applicable`，其中风险接受与不适用保留明确依据。required AC 未覆盖为 `inconclusive`，失败为 `failed`，全部有决定才为 `covered`；`covered` 不是 Task Done，最终人工验收仍必需。旧快照/旧 Contract/外项目报告、不受信任或非活动项目及任意额外命令字段均拒绝。SQLite 附加 v19 只新增不可变、幂等的逐条决定记录；既有业务库不重置。Vue 任务抽屉使用现有 @forge/ui 展示矩阵与明确的记录入口。见 [ADR 0040](decisions/0040-snapshot-bound-acceptance-matrix.md)。

证据：`python/tests/test_verifier_project.py` 在真实 Git/SQLite/进程/独立 Python Host stdio 中验证无结构结果仍 `inconclusive` 且 Task 不 Done、成功命令未自动绑定 AC、退出 7 的 PASS 文本不能 `verified`、显式风险理由、旧快照/陌生 AC/伪路径拒绝、幂等和重启持久；`python/tests/test_persistence.py` 真实 v18→19 升级且旧 metadata 保留。`packages/contracts/tests/acceptance-matrix.test.mjs` 与 Vue 组件测试校验固定 bridge、必需项缺口和 UI 明确操作。在线纵向命令 `FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终成功：真实 Electron→Main→Python Host→Codex 开发 Run `f84ff677-9220-4039-903e-02dcbb673e64` 生成快照 `2ecc754a-26be-4cb4-b8ed-048596e06f19`，批准的 test Verify `ff5acda7-4576-4b6e-84db-ccaa71b2db9b` 为 passed/exit 0；矩阵先 `inconclusive/unverified`，用户在 Vue 抽屉关联报告并写依据后为 `covered/verified`，仍显示 Review 未完成与最终人类验收要求。来源 Git 干净。实际 1440×900 [截图](../output/playwright/p3-05-python-desktop-acceptance-1440x900.png) 已人工查看。

质量链：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（39 deferred）、`pnpm py:check`（49 pytest、Ruff、严格 mypy 34 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均通过。Vue 定向复跑最初因测试在 select 选项文字出现时过早断言而失败，改为等待 Host 更新后的覆盖状态再通过；产品逻辑未改。T044 的伪成功输出现在有无结构 Handoff+矩阵 `inconclusive` 且 Task 非 Done 的真实证据，两个历史 source task 的 deferred 条目已移除；T055 的 actor/version/正式 waived 与最终接受仍 `DEFERRED_VERIFICATION`→P3-07，T057→P3-11、T059→P3-07、T060→P3-08 保留。真实用户已有库 v18→19、Windows x64、macOS Intel、安装包和 Host 突然死亡仍 **UNVERIFIED**。无新依赖、凭据、提交、推送或发布。下一权威任务 P3-06 已开始。

## P3-04 · 命令验证器 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发路径；单项命令验证，不是正式验收矩阵）**。Python Host 在版本化 stdio `run.verifyStart/verifyJobs/verifyJob/verifyReport/verifyArtifact` 中，只接受固定项目、Task、Development Run、CodeSnapshot、检查类型、批准 Preset ID 和幂等键。重查 Project Trust、RunConfig/Handoff、当前最新快照、Environment、CommandPreset 审批哈希及脚本哈希后，在 Forge 拥有的 detached Git 快照副本中用 argv 和最小环境运行；ProcessController 管控进程树/超时。SQLite 附加 migration v18 存不可变 Job 报告和 UUID 限定的脱敏 stdout/stderr 证据。exit 0 且进程确认退出才可 `passed`；日志出现 PASS 而 exit 7 为 `failed`；无声明 test 且无 Preset 为 `not_configured`/需人工。副本的 build 产物只经身份核对后删除，用户源仓库不受影响。此服务没有自动设置 required AC 状态或 Task Done。见 [ADR 0039](decisions/0039-python-project-command-verifier.md)。

证据：`python/tests/test_verifier_project.py` 5 个真实 Git/SQLite/子进程/独立 Python Host stdio 测试覆盖 pass、失败、超时、not_configured、快照漂移、无批准拒绝、外部路径拒绝、脱敏证据、幂等、immutable/restart 和源 Git 干净。`FORGE_VERTICAL_VERIFY_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 在真实 Electron→Main→Python Host→Codex 开发快照 `ca377444-d54a-4b09-92cf-4b5c07f2a593` 后，由已批准 `node test.js` 返回 Verify `295339f0-1ef1-4242-b06e-8626419a2924`，`passed`/exit 0，源 Git 干净。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（41 deferred）、`pnpm py:check`（46 pytest、Ruff、严格 mypy 33 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`（含 build）、`pnpm smoke:desktop`（schema18）、`uv build --directory python --no-sources`、`git diff --check` 最终均通过。Desktop smoke 首次因旧断言仍期待 schema17 失败，改为真实 schema18 后复跑通过。

验收边界：T056/T058 当前语义真实通过。T057 通用 Artifact 服务的外部报告路径/MIME/root 导入防护→P3-11，T059 旧快照上的最终验收 409→P3-07，T060 合并幂等→P3-08，均保留原 Test ID 为 `DEFERRED_VERIFICATION`，未写 PASSED；[追踪表](deferred-verification.json)。当前只存固定 text/plain stdout/stderr，未来通用报告文件仍需实现。真实用户已有数据库 v17→18、Windows x64、macOS Intel、安装包路径和 Host 突然死亡清理 **UNVERIFIED**。没有新依赖、凭据、自动提交/推送/发布。下一权威任务 P3-05 已开始。

## P3-03 · 问题列表与退回交接 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发运行路径）**。Python Host 在用户显式请求后，从当前 Task 的不可变 DevelopmentHandoff 构建独立 ReviewContext，重新核对项目 Trust、最新 CodeSnapshot、Codex 模型与原生只读能力，再启动固定审查副本中的 Codex Reviewer。Review Job 先落库；Provider 的结构化结果经过 P3-02 Schema/快照门禁后形成不可变报告。附加 SQLite migration v17 保存 Review Job、Report、稳定 Issue thread、每轮 occurrence 和精简 ReworkHandoff，不修改历史表。相同问题在新快照/新 attempt 中保留 issueId；旧 Review 对新快照无效，完整新报告未再提及的问题只标 stale，不猜测 resolved/waived。返工交接含当前 Contract/快照和带锚点的 blocking issues，不复制开发聊天，不自动启动新开发 Attempt。独立 Python Host 固定 `run.reviewStart/reviewJob/reviewReports/issueHistory` 经已有受限 Renderer 桥提供；Vue 任务详情展示真实 Job、报告、Issue 历史及当前快照 Review 状态。见 [ADR 0038](decisions/0038-review-issues-and-rework-handoff.md)。

证据：`python/tests/test_review_issues.py` 使用真实 Git/SQLite/P1 批准 Task，验证同问题跨三个 Review attempt 与两个快照去重、旧结果拒绝、历史保留、后续 approved 使旧问题 stale、返工交接、报告不可变、Host 重启和独立 stdio 进程读取。真实 Electron→Main→Python Host→Codex 纵向命令 `FORGE_VERTICAL_REVIEW_ONLY=1 FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` 最终 exit 0：开发 Run `e5f51f6e-9ada-4cd4-aa8b-fbb02da3a565`、Review Run `de458133-4ef7-4639-a9f5-0c9422a3460f`，模型返回绑定快照的 `approved`、0 问题，同一启动幂等键返回同一 Job，来源 Git 干净；这仅是 Review 通过，Verify 和人工验收未运行。实际 1440×900 Vue/Electron [截图](../output/playwright/p3-03-python-desktop-review-1440x900.png) 已查看。早先一次 live 运行在 UI 截图时因抽屉遮挡看板按钮失败；改为利用可恢复的 Task 抽屉后重复真实运行通过。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件/0 error/4 既有 warning）、`pnpm validate:task-map`（38 条 deferred）、`pnpm py:check`（41 pytest、Ruff、严格 mypy 32 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`（schema 17）、`git diff --check` 最终通过。第一次 Desktop smoke 因旧测试仍期待 schema 16 失败，更新为真实 v17 后复跑通过。

范围与风险：T054 的同问题历史现由真实 Git/SQLite fixture 覆盖，P3-02 的 deferred 条目已清除；T055 人工风险接受仍 `DEFERRED_VERIFICATION`→P3-07。P3-06 才执行有限自动返工调度，本轮仅产生结构化交接。参考 `contracts/schema.sql` 的完整未来 Review 表与当前附加 v17 表映射见 ADR；参考包未改。未在真实用户已有 v16 数据库、Windows x64、macOS Intel 或安装包内执行；Host 意外死亡时 Reviewer orphan 只标 interrupted/报告，不按 PID 自动清理。下一权威任务 P3-04 已开始。无提交、推送或发布。

## P3-02 · Review Profile与结果Schema · 2026-09-24

状态：**DONE（macOS arm64 的 Reviewer 契约与真实结构化输出探测）**。Python Host 包含受严格 Pydantic 校验的生产 Reviewer Profile、独立 prompt、固定 Handoff/RunConfig 构建的有限 ReviewContext，以及 `ReviewResult` 阻塞/建议/未知项 Schema。文件锚点、AC 来源、快照与 Task revision 必须有效；无结果、非法结果、旧快照不能 approved。`approved` 有阻塞或未知项时被拒绝。生产 Profile 将只读参考中的旧 `codex-sdk` 映射到当前 Python app-server `executor.codex`，参考包保持未改。见 [ADR 0037](decisions/0037-review-profile-and-structured-result.md)。本轮无 Task 状态推进或 Reviewer UI。

真实验收：`pnpm test:review-copy-live` 在 P3-01 固定只读审查副本中请求 Codex 0.155.1 的结构化 Reviewer 输出，`run.completed.structuredOutput` 被实际校验；由于 fixture 没提供完整 Diff，模型返回 `inconclusive`，没有伪装 approved。Codex 真实读取文件的结构化 command 事件可观察；独立诊断写入触发审批、显式拒绝后副本/来源 Git 仍干净。`python/tests/test_review.py` 验证空泛阻塞、陈旧结果、非法路径/AC、缺失结果和输出语义；P3-01 的真实只读限制继续有效。`uv build --directory python --no-sources` 的 wheel 包含 Profile 与 prompt。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 个参考 Profile warning）、`pnpm validate:task-map`（39 条 deferred）、`pnpm py:check`（40 pytest、Ruff、严格 mypy 30 源文件）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。T054 问题历史→P3-03、T055 人工风险接受→P3-07 保留 `DEFERRED_VERIFICATION`，不算 PASSED。Windows x64、macOS Intel、安装包内 Codex 沙箱和 Host 异常退出恢复仍 **UNVERIFIED**。下一权威任务 P3-03 已开始。

## P3-01 · 审查副本与权限 · 2026-09-24

状态：**DONE（当前 macOS arm64 的固定快照审查副本基础）**。Python Host 新增 `ReviewCopyManager`：核对 CodeSnapshot 的 Forge Git ref/commit/tree 后，在 Host 管理目录创建 detached worktree，记录 snapshot、Run、runtime 与 workspace ownership。只允许当前 Executor 能力明确 `readOnlyEnforced=true` 且 `enforcement=native-sandbox` 时创建；Review 请求必须绑定该副本与 Run，使用 `read-only + approval: never`。前后核对副本 Git 身份、HEAD/tree、tracked/untracked 清洁；活跃进程、修改、异运行时记录或 symlink 逃逸时拒绝释放，不自动清理孤儿副本。没有 Renderer 文件 API、正式 Reviewer 结果或 Task 状态流转。见 [ADR 0036](decisions/0036-snapshot-pinned-review-copy.md)。

真实验收：一次性 Git 仓库中，审查副本包含快照新增/修改文件，目标 main 后来前移也不改变副本，用户来源工作树未改。`pnpm test:review-copy-live` 用 Codex 0.155.1 真实读取副本；生产 `read-only + never` 未写文件；单独诊断使用 `read-only + on-request` 观察到写入 `approval.requested`，显式拒绝后收到 `approval.resolved=reject`，无文件改动。初次生产模式模型文字声称命令被拒，但没有结构化 command 事件，因此没有单凭文本当作强只读证明。`pnpm install --frozen-lockfile`、`pnpm py:check`（38 pytest、Ruff、严格 mypy 29 源文件）、`pnpm validate:contracts`、`pnpm validate:task-map`（37 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0，日志在 `/tmp/forge-p3-01-*.log`；新增测试断言再单独执行也通过。P3-01 引用的 T050 涉及目标分支前移后的合并/重验，保留 `DEFERRED_VERIFICATION`→P3-08；当前只验证副本快照不漂移。Windows x64、macOS Intel、安装包与异常 Host 死亡恢复未验证。P3-02 已开始。

## P2-10 · Python Host 纵向真实 Demo · 2026-09-24

状态：**DONE（当前 macOS arm64 开发运行路径的 P2 阶段范围）**。真正的 Electron Renderer→Main→Python Host→Codex app-server 链路完成系统目录选择/Project Trust→消息→手工 Task Draft→人工修订审批 TODO→显式启动→隔离 Git worktree 中的代码修改→真实 Diff/CodeSnapshot/Handoff。成功 Run `e67668ee-a32f-4718-9831-043ac3919746` 修改 `math.js`/`test.js`、运行 fixture `node test.js` 通过；人工读取生成的 Diff，确认只增加非 number 的 `TypeError` 校验与四个断言。来源仓库 HEAD/status 未变，任务仍处开发交接，正式 AC 为 `unverified`。真实 Codex 进程中断 Run `97b6b00b-8598-4cb3-9952-34871ee40bff` 留下 failed/`run.failed` 且无 Handoff；Desktop 固定 `run.cancel` 对 Run `07698a53-3f18-464b-8b7e-7a5ee6dd57bc` 得到 cancelled/`run.cancelled`，owned 进程停止，工作区无后续写入。一次模型 completed 但无改动的调用被脚本判失败，不算成功证据。完整人工检查见 [P2 Python 纵向 Demo](demo/p2-python-vertical.md)。

回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase、92 task、120 case、36 deferred）、`pnpm py:check`（37 pytest、Ruff、strict mypy）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0；日志 `/tmp/forge-p2-10-*.log`。真实 Demo 命令及截图/Diff 见证据文档。P2 Phase Gate 的已批准任务隔离修改、可查看结果与真实停止在本机通过，[P2 阶段报告](p2-completion-report.md)已建立。P2-10 引用的 T116–T120 仍为 `DEFERRED_VERIFICATION`，映射到 P6/P9，不计 PASSED。Windows x64、macOS Intel、安装包/签名/DPI 与异常 Host 死亡后的 Codex orphan 恢复未验证；下一权威任务 P3-01 已开始。无提交、推送或发布。

## Python Core 迁移 · MIG-PY-09 · 2026-09-24

状态：**DONE（当前 macOS arm64 开发运行环境的 Python-only Desktop 切换与 P1/P2-01～09 核心能力复验）**。Electron Main 不再 import、启动或回退到 Node `HostController`；所有固定 `system/project/conversation/draft/approval/board/run` IPC 命令经过原有 Renderer 来源校验、TypeScript Schema 与 `PythonHostController` 的版本化 JSON-RPC stdio，再由 Python Pydantic Host 执行。Main 仍只负责窗口、系统目录选择、Host 生命周期；Renderer 无 Node/SQLite/Codex 或任意 IPC。Python Host 是唯一 SQLite 写者，握手后执行已在隔离库验证的附加 migration v16；没有重置现有 Project/Task/Run 表。Python 领域服务改用 `ForgePersistence.session()`/`transaction()` 门面，不取得私有 `sqlite3.Connection`。`pnpm dev:host` 指向 Python，Node Host 只保留显式历史 parity 命令和测试。见 [ADR 0035](decisions/0035-python-only-desktop-cutover.md)。

真实验收：`pnpm smoke:desktop` 在 Electron 中核对 CPython 3.12.13 的唯一 Host PID、protocol v5/stdio v1、SQLite 3.50.4/schema 16、Renderer sandbox；损坏数据库为 degraded，强制结束 Python Host 后为 crashed 且命令失败，Desktop 退出后其拥有的 PID 消失。`pnpm smoke:projects` 与 `pnpm smoke:p1-offline` 在独立临时目录完成系统目录选择/信任、只读项目探测、保存消息、手工草稿、人工批准 TODO、看板/详情、重启恢复、切换与元数据移除，源码保持不变。`node scripts/smoke-python-vertical-live.mjs` 经过真实 Electron Renderer→Main→Python Host→Codex，在隔离 Git worktree 中修改 `math.js`/`test.js`、执行 `node test.js`、生成真实 Diff/不可变 CodeSnapshot/Handoff；来源 Git 干净，正式验收结果保持 `unverified`。实际 Vue 任务详情截图：[Python Desktop Run](../output/playwright/mig-py-09-python-desktop-run-1440x900.png)。`uv --directory python run --frozen python spikes/codex_live.py cancel` 确认长命令取消与 `run.cancelled`；MIG-PY-07/08 的 approval、continuation、错误和事件 live 记录继续有效。

回归：`pnpm py:check` 为 37 pytest、Ruff、严格 mypy 28 源文件通过；`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 参考 warning）、`pnpm validate:task-map`（9 phase/92 task/120 case/36 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。`pnpm dev:desktop` 启动真实 Python Host/Vite/Electron，Ctrl+C 后本轮 PID 与 5173 监听消失。CI 增加锁定版本的 uv/Python 检查；GitHub Linux runner 本轮未远程执行。权威 T031–T120 中跨阶段或尚无完整前置能力的用例仍按 `docs/deferred-verification.json` 为 `DEFERRED_VERIFICATION`，没有把服务能力回归冒充全部 Test ID 通过。

限制：当前真实用户开发数据库文件不存在，故没有对实际用户 v15 数据执行升级；v15→v16 及 Node↔Python Project/Task/Run parity 只在独立测试库通过。打包安装内 Python/Codex 可执行文件发现、Windows x64、macOS Intel、系统 DPI/签名与 Host 异常死亡时 Codex 子进程恢复仍 **UNVERIFIED**。没有自动提交/推送或发布。MIG-PY-09 完成后 P2-10 已恢复 TODO，当前开始其 Python 纵向真实 Demo；P3 尚未开始。

## Python Core 迁移 · MIG-PY-08 · 2026-09-24

状态：**DONE（内置可信插件基础；完整 P4 Plugin Host 尚未开始）**。`python/src/forge/plugin_api.py` 以 Pydantic 定义与权威 manifest Schema 同字段的公开契约；`plugins.py` 只发现固定白名单中的内置清单，检查 API range、平台、明确授予的权限、依赖服务与 contribution，激活成功前不公开注册，失败清理，停用/Host 退出逆序 dispose。`builtin_plugins/codex.py` 通过声明的 `process.v1` 取得 Host-owned ProcessController，注册 `executor.codex`；Core 的 Run Scheduler 只依赖 ExecutorAdapter 协议，生产 Host 不再直接导入 Codex 实现。未知插件、任意清单 entry、外部进程插件及网络安装均未开放。见 [ADR 0034](decisions/0034-python-bundled-plugin-registry.md)。

真实验收：manifest 路径穿越/未知字段/重复贡献、权限或服务缺失、API 不兼容、激活回滚、重复 dispose 等单测；内置 Registry 接入后，独立 Python Host 再次完成 Project Trust→人工批准 TODO→真实 Codex Run→不可变 Handoff，fixture 测试通过、源 Git 工作树未改。`pnpm py:check` 37 pytest、Ruff、严格 mypy 28 源文件通过；wheel 包含 manifest/config/entry，`pnpm test`（含 build）、`pnpm smoke:desktop`（含 build）和 `git diff --check` 通过。没有新增第三方依赖、用户数据迁移、Renderer 权限或提交/推送。Desktop 仍处双 Host 迁移态；下一项 MIG-PY-09 已开始，P2-10 继续暂停，P3 未开始。

## Python Core 迁移 · MIG-PY-07 · 2026-09-24

状态：**DONE（macOS arm64 的真实 Python Codex Executor；Desktop 生产切换仍属 MIG-PY-09）**。`python/src/forge/codex_app_server.py` 用 `ProcessController` 拥有 Codex 0.155.1 的 `app-server --stdio`，限制 JSON-RPC 帧大小、请求 ID/超时、事件白名单、环境变量和进程树关闭。`codex_executor.py` 将真实 thread/turn、文本、命令、文件、usage、审批、取消及结构化结果转为标准 Executor Event；未知互动拒绝，审批由调用者显式批准/拒绝，120 秒无应答时拒绝。能力声明只读取版本/平台匹配的 Python 实测证据；`toolEvents=false`、`networkPolicyEnforced=false`。Python Host 在成功握手且为写者时注册真实 Adapter；Desktop 迁移期只读 Python Host 不注册写入。

`pnpm test:python-codex-live` 通过十组独立真实检查：缺少认证、无效模型、结构化输出、Codex 修改隔离 Git fixture 两文件并通过 `node test.js`、命令/文件/文本/usage 流、长命令取消且无后续写入、审批批准/拒绝、跨连接及跨 Python 进程 thread continuation，以及独立 Python Host 中 Project Trust→手工 Draft→人工批准 TODO→Codex Run→CodeSnapshot/Handoff。来源仓库工作树未变，Handoff 的 Task 验收仍为 `unverified`。权威示例中的 `workflowRef=standard@1` 与旧 Node 的 `standard` 不一致；Python 兼容两者并冻结实际引用，不修改权威资料。见 [ADR 0033](decisions/0033-python-codex-app-server-executor.md)。

`pnpm py:check`：33 pytest、Ruff、严格 mypy 24 源文件通过。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 参考 warning）、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm smoke:desktop`（各含真实 build）、`uv build --directory python --no-sources`（wheel 含 Adapter 与证据）、`git diff --check` 均 exit 0。没有新增依赖或修改用户数据库。T041 双执行器、T042 Profile 保存路径、T045 运行中认证失效和 Python-only Desktop 验收保持 `DEFERRED_VERIFICATION`，不标通过。下一项 MIG-PY-08 已开始；P2-10 仍暂停，P3 未开始。

## Python Core 迁移 · MIG-PY-06 · 2026-09-24

状态：**DONE（Python Host 基础设施 fixture 验收；真实 Codex/正式 Desktop 复验顺延到 MIG-PY-07/09）**。`python/src/forge/workspaces.py` 以真实 Git worktree 和 JSON ownership journal 实现独立工作区、唯一 ID、来源仓库身份、base SHA/tree、单写 lease/epoch、脏树保留、安全处置及重启 orphan 报告；`processes.py` 以当前运行时拥有的 POSIX process group 实现父子孙取消、有限 TERM/KILL 与端口释放，不按历史 PID 或进程名杀进程。`run_config.py`、`runs.py`、`context.py` 冻结 RunConfig/ContextBundle、Run/Attempt 状态与结果身份、持久化取消、工作检查点；`executor_contracts.py`、`run_scheduler.py` 对标准事件、启动超时、有明确无副作用证据的 429 重试、取消确认及不确定状态隔离建立基础。`run_inspection.py` 保存脱敏且有界的观察/usage、真实 Git Diff，`snapshots.py`/`handoffs.py` 从已停止的工作区生成不可变 Git 快照与 SQLite Artifact/Handoff，验收项保持 `unverified`。`development.py` 是 Host 内的单节点入口，要求真实 Trust、已批准 TODO、活跃项目与 adapter capability；没有自动开工。

macOS arm64 的隔离 fixture 真实验证 Unicode/空格 Git 路径、source repo 不变、并发租约/旧 epoch、路径/symlink 防护、进程父子孙、Run A/B/用户进程不受误杀、端口释放、取消后不继续写、Run 成功/失败/取消/协议异常/Host shutdown、checkpoint/观察/Diff、快照/交接与 SQLite 重启。独立 Python Host stdio 进程读取保存的 Run/inspection；未注册真实执行器时 `run.start` 严格校验后返回 `MODEL_UNAVAILABLE`，不伪装为可运行。`pnpm py:check`：29 pytest、Ruff、strict mypy 22 个源文件通过。完整回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:python-db-parity`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。见 [ADR 0032](decisions/0032-python-workspace-run-and-handoff-port.md)。未增加第三方依赖、修改用户数据、提交或推送。

MIG06 的基础设施范围已真实通过；权威 P2-03/04 的 `T041–T045` 真 Codex 能力需 MIG-PY-07，P2-01～09 的 Python-only Desktop 产品验收需 MIG-PY-09，均记 `DEFERRED_VERIFICATION`，不能把本轮 fixture 或旧 Node 结果标为通过。Windows x64、macOS Intel、安装包和异常 Host 死亡后的孤儿进程自动回收仍未验证。下一项 MIG-PY-07 已开始；P2-10 仍 `PAUSED_FOR_PYTHON_CORE_MIGRATION`，P3 未启动。

## Python Core 迁移 · MIG-PY-05 · 2026-09-24

状态：**DONE（Python Host 的 P1 服务实测；Desktop 生产切换仍属 MIG-PY-09）**。独立 Python Host 已实现 Project/Environment/CommandPreset、会话与持久消息、受来源约束的手工/模型草稿、修订/澄清、人工审批原子入 TODO、Board/Task 只读投影与同列排序。Task 写入合并于审批事务，并未启动 Run。固定 JSON-RPC 方法均校验参数；Project Trust 明确确认，Probe 不执行项目脚本，移除只归档元数据。Pydantic Task Contract 对标现有 TS/参考字段，校验空白文本和依赖 ID。现有 schema 15 及用户数据不重置。

真实 Python 子进程 stdio 测试覆盖：独立临时项目探测/信任→消息→草稿→人工修订→审批→TODO/看板→Host 重启保留；离线消息失败保留原文与幂等；环境/命令预设归属、版本与危险 cwd 拒绝；未知 `agent.run` 无通道。另以现有 Codex 登录实测 Python Host 在线结构化草稿→3 项澄清→人工修订/批准→TODO→重启恢复，项目脚本未运行。`pnpm test:python-refiner-live` 结果为 `draftStatus=needs_clarification`、`approvedState=todo`、`boardRevision=1`；真实测试日志在 `/tmp/forge-mig-py-05-refiner-live.log`。`pnpm py:check`（19 pytest）、`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:python-db-parity`、`pnpm smoke:desktop`、`git diff --check` 均通过，工程日志在 `/tmp/forge-mig-py-05-*.log`。见 [ADR 0031](decisions/0031-python-p1-domain-and-refiner-parity.md)。

Desktop 仍由旧 Node Host 处理 P1 业务，Python 对共享库只读；MIG-PY-09 才切换独占业务写者并重跑真实 Desktop P1 验收。当前 Python 服务仍直接经 `ForgePersistence` 私有 helper 使用 SQL，MIG-PY-09 切换前需收紧 typed repository 边界。MIG-PY-06 已开始；P2-10 保持 `PAUSED_FOR_PYTHON_CORE_MIGRATION`，P3 未开始。

## Python Core 迁移 · MIG-PY-04 · 2026-09-24

状态：**DONE（SQLite 存储层 parity；业务服务尚未移植）**。Python `sqlite3` 读取冻结的旧 1～15 migration SQL 和 SHA-256；按 `schema_migrations`/`user_version` 校验现有库、异版拒绝、`quick_check`、外键、WAL、busy timeout。新增 additive schema 16 只在隔离库测试；Desktop 双 Host 期间 Python 对同一 dataDir 强制只读，旧 Node 暂任业务写者。真实 Node fixture 创建 Project/Task/Run、Python 按相同 schema 读取并在隔离库事务中更新三类行、Node 重启读回；旧 migration/checksum 逐项一致。Python migration 1→15→16、重启持久、事务失败回滚、迁移失败回滚、无效文件、未来版本与错误 checksum 均实测。Electron smoke 中 Python Storage 在 Node 建库后显示 ready/schema 15；损坏 DB 显示 degraded，不泄露路径。当前真实开发数据库文件不存在，未改用户数据。`pnpm py:check`（11 pytest）、`pnpm test:python-db-parity`、`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`（由 parity 脚本和 test 入口执行）、`pnpm smoke:desktop`、`git diff --check` 均通过；日志在 `/tmp/forge-mig-py-04-*.log`。见 [ADR 0030](decisions/0030-python-sqlite-parity-and-cutover.md)。Project/Task/Approval 的语义、CAS/幂等和 P1 验收属于 MIG-PY-05；Run 语义属于 MIG-PY-06，不能把存储行对照当作业务通过。P2-10 仍暂停；MIG-PY-05 已开始。

## Python Core 迁移 · MIG-PY-03 · 2026-09-24

状态：**DONE（独立 Python Host 与 Desktop 真实通信；业务移植未完成）**。`python/src/forge/host.py` 经 stdin/stdout 的 `forge-local-jsonrpc/v1` 实现固定 `system.handshake/info/health/ping/shutdown`，每帧 1 MiB 上限、请求 ID、Pydantic 严格字段、版本/ownership 核对、结构化错误与 stderr 结构化生命周期日志。Electron Main 的 `PythonHostController` 用 argv 启动项目本地 Python 3.12.13、定时健康探测、有界超时、受控退出；Preload 只暴露固定只读状态，不提供通用 JSON-RPC。Desktop 顶栏与诊断展示真实 Python 进程状态。迁移期间旧 Node Host 继续承载已有 P1/P2 业务，Python Storage 显示 unavailable/degraded，不能声称 Python 已接管数据库或业务。`pnpm py:check`（5 pytest，包含真实进程握手/拒绝/关闭）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm smoke:desktop` 和 `git diff --check` 通过；Electron smoke 确认 Python PID/版本/health，强制结束 Python 后 UI 显示 crashed 且旧 Host 仍独立。测试使用隔离目录，未接触真实用户数据库。下一任务 MIG-PY-04 已开始。

## Python Core 迁移 · MIG-PY-02 · 2026-09-24

状态：**DONE（Python 工程基线，尚无 Python Host）**。`python/pyproject.toml` 明确 Python 3.12+、Pydantic v2、pytest/pytest-asyncio、Ruff、严格 mypy，`python/.python-version` 固定本机 3.12.13；`python/uv.lock` 锁定并记录哈希。根 `pnpm py:sync`、`py:lint`、`py:typecheck`、`py:test`、`py:check` 直接运行真实 uv 工具链，无空脚本。项目本地 `.venv`，无全局包改动。第三方许可证见 `docs/python-dependency-licenses.json`，精确工具版本见 `versions.lock.json`。`uv lock --check`、`uv build --no-sources`（wheel/sdist）、`pnpm py:check` 通过；Python 3.12.13 下 3 个 pytest 通过，Ruff 和 mypy strict 通过。后续 MIG-PY-03 建立真实 Python Host 和跨语言协议；Node 业务 Host 仍是迁移参考，不代表 Python parity。P2-10 继续暂停。

## Python Core 迁移 · MIG-PY-01 · 2026-09-24

状态：**DONE（用户批准的核心架构冻结与迁移基线；macOS arm64）**。P2-10 已暂停为 `PAUSED_FOR_PYTHON_CORE_MIGRATION`，不是 DONE/BLOCKED；P3 尚未开始。Electron/Vue/TypeScript UI 保留，最终唯一业务 Runtime 改为 Python Host；本地版本化 JSON-RPC over stdio，不引入本地 FastAPI/TCP。见 [ADR 0029](decisions/0029-python-core-runtime-architecture.md)、[迁移计划](forge-python-core-migration-plan.md)及[Node 模块清单](python-core-module-inventory.md)。权威 P1～P9 Task/Test ID 与只读规格不改，现有 SQLite 用户数据不重置。此前 P0/P1/P2-01～09 记录仅是 Node Host 历史实测；MIG-PY-09 前不能声称 Python parity。P2-10 的未提交 Node 路径代码、真实 Codex 成功与取消截图及相关测试被完整保留，仅作迁移参考；它们不构成 P2-10 完成验收。

MIG-PY-01 基线：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`（9 phase、92 task、120 case、36 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 最终全部 exit 0；原始日志在 `/tmp/forge-mig-py-01-*.log`。首轮 lint 两处暂停前 P2-10 局部错误已最小修复；任务图校验器现仅允许 P2-10 进入专用迁移暂停状态，并有错误任务变异测试。Desktop smoke 使用独立临时数据库；未打开、重置或删除用户实际数据库。没有新增依赖、提交、推送或发布。下一任务 MIG-PY-02 已开始；Python Host 还未创建，历史 Node smoke 不等于 Python 验收。

## P2-09 · 开发结果与交接快照 · 2026-09-24

状态：**DONE（Host 内部不可变 CodeSnapshot 与交接；macOS arm64）**。正式 `@forge/contracts` CodeSnapshot、HandoffBundle、StepResult、ArtifactRef 结构与只读参考 Schema 必需字段对齐；`@forge/workspace` 从 Forge 私有且已停止写入的 Git worktree，用临时 index 扫描允许的文件、包含未跟踪新增文件，生成独立 tree/commit 和 `refs/forge/snapshots/<UUID>` 保活引用。未移动用户分支或改动用户索引。`.env`/密钥路径、常见凭据文本、符号链接、二进制和越界文件被拒绝；`node_modules` 排除。空变更需要显式解释。Git 用 argv，禁用 hooks/fsmonitor，不执行项目脚本；所有文件在 Host 内读取，Renderer 没有文件/SQL/快照写入能力。

Host-only `HostSnapshotService` 在 succeeded Run、已释放 writer lease 且无受控活跃进程时发布。SQLite schema v15 一次事务保存 CodeSnapshot、实际 JSON StepResult artifact 和 Handoff Bundle；不可变触发器、项目隔离、哈希复核、重启持久性与幂等读取均已实测。摘要基于文件清单和已有 checkpoint，所有 Task 验收项保持 `unverified`，Review/Verify 明确未运行；Task 仍 TODO。参考 Handoff schema 的 numeric `workflowRevision` 当前 RunConfig 没有，本服务要求可信调用者显式提供，不从 version 字符串猜测，P2-10 的真实配置解析须补齐。快照 Git ref 早于 DB 事务写入，崩溃可能留下未发布 Forge ref；P3-09 负责 orphan 对账，不能声称完全原子跨 Git/SQLite。见 [ADR 0027](decisions/0027-immutable-code-snapshot-and-handoff.md)。

真实工作区测试覆盖 Unicode/空格、形似 Git 选项的文件名、source HEAD/status/index 不变、可从 commit/ref 重建新增文件、敏感路径/文本和 symlink 拒绝。Host/SQLite 测试覆盖同项目保存、跨项目只读拒绝、不可变/重启/重复发布、未解释的 no-change 阻断。两次 `pnpm test:p2-run-live` 均使用已认证 `gpt-6-luna` 与独立临时 Git 仓库；第二次 Agent 真正新建 `tests/invalid.test.mjs` 并修改 `src/add.js`，fixture 测试通过，237 条标准事件、50 条有界观察记录、10 个 checkpoint 与两文件 CodeSnapshot/Artifact/Handoff 在重启后可读取，原仓库工作树未变，正式 AC 仍未验证。T047/T049 当前范围实测；T046 正式 StartTask 并发归 P2-10，T050 主分支前移/合并归 P3-08，T064 正式报告 UI 的脚本链接归 P3-12，均保留权威 ID。当前无面向用户的 Start 或 Artifact 报告页面，不把 Run 成功等同于可交付 Task。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（33 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`pnpm test:workspace-live`、`git diff --check` 均 exit 0。最终 `pnpm test:p2-run-live` 再次使用已认证 Codex 真实创建未跟踪文件并保存快照：280 条事件、57 条观察、12 个 checkpoint、两文件快照、数据库重启保留且源仓库未变。下一权威任务 P2-10 自动开始；无新增依赖、提交、推送或发布。

## P2-08 · 取消、停止与超时 · 2026-09-24

状态：**DONE（Host 内部 Run 取消链路；macOS arm64）**。`HostRunScheduler.cancel()` 在通知执行器前将 `canceling` 意图持久化到 SQLite schema v14，用户重复取消返回同一个终态等待；预算截止与 Host 调度器 shutdown 走同一有界取消路径。先发送 Codex `turn/interrupt`，四秒 grace 后对当前 Run 拥有的进程组执行受控终止；只有确认退出后 Run/Attempt 才能成为 `cancelled`，数据库写租约与受控 worktree lease 才释放。进程退出不确定时记录 `interrupted`、数据库租约 `quarantined`、工作区 `failed`，拒绝新的写 Run。明确无副作用的 429 在未启动进程时可安全取消；未知启动副作用继续隔离。没有新增 Renderer Start/Cancel IPC，也没有自动调度下一节点。见 [ADR 0026](decisions/0026-run-cancellation-and-lease-quarantine.md)。

真实测试：Host 集成测试启动父/子/孙 Node 长期写入进程，双重取消幂等，确认整树退出、取消后文件字节不再变化、源 Git 不变且租约释放；一秒预算超时也进入 `cancelled` 而非成功；故障注入无法确认进程退出时保持 quarantine，第二个写 Run 被拒。`pnpm test:p2-cancel-live` 使用当前认证的 `gpt-6-luna` 在独立临时 Git worktree 真实运行长命令与两个子孙写进程；Host 收到真实 `command.started`、`run.cancelled`，28 条有界观察记录，取消后无继续写入，ProcessController 无活跃进程，SQLite 重启后仍为 `cancelled`，源仓库 HEAD/status 未变。T035 当前范围已实测；T031–T033 的底层幂等/epoch/429 测试沿用 P2-05，T034 Host 杀进程后的对账仍属 P3-09，未标通过。T043 的正式重启恢复声明和 T045 运行中认证失效保持 `DEFERRED_VERIFICATION`，分别指向 P3-09/P4-09。Windows x64、macOS Intel、安装包和 utilityProcess crash recovery 未验证。

最终工程回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均通过；详情在本轮执行记录。下一权威任务 P2-09「开发结果与交接快照」自动开始。没有新增第三方依赖、提交、推送或发布。

## P2-07 · Diff 与初版运行详情 · 2026-09-24

状态：**DONE（当前只读 Run 观察范围；macOS arm64）**。严格 `run.list` / `run.inspect` 通过 ForgeClient→Preload→Main→独立 Host，由 SQLite schema v13 提供按项目隔离的 Run、单调游标分页事件、真实用量和有来源的 ContextBundle 标识。Host 将高频 assistant delta 在 100 ms 内合并，活动上限 2,000 条并显式截断；命令参数不记录，常见 API Key/Token/Cookie/Authorization 文本脱敏。完成后从受控 Git worktree 捕获只读文件树与最多 64 KiB 文本 Diff 预览，敏感扩展名/`.env` 排除、未跟踪大文件截断；预览不等于 P2-09 冻结 CodeSnapshot。任务抽屉使用正式 `@forge/ui` Tabs 显示 Activity、Files、Diff、Context、Usage；HTML/脚本仅作为文本，Host 不可用时不显示旧运行详情，未知费用显示“未知”。历史 running 记录标示“进程未验证”，不假定重启后仍在线。见 [ADR 0025](decisions/0025-read-only-run-inspection.md)。本轮没有生产 Start/Cancel 命令、命令 stdout、正式 Artifact 或 Task 自动推进。

真实 SQLite/Git 测试覆盖乱序拒绝、断点游标、重启保持、同项目范围、凭据脱敏、500 高频事件合并、20 KiB 未跟踪文件截断和源仓库未变；Vue 测试把恶意 `<img onerror>` 按文本渲染、Host 断连清空、未知费用明确提示。最终 `pnpm test:p2-run-live` 在独立临时仓库用已认证 `gpt-6-luna` 真正修改两个文件并通过 fixture 测试；303 条连续标准事件经 Host 存为 58 条有界观察记录、13 个 checkpoint、2 个真实 Diff 文件，数据库重开后读模型一致，Task 仍 TODO，源 Git 不变。真实 Electron utilityProcess Host 读取该 Run，Task 详情展示 completed 与 Diff；截图 `output/playwright/p2-07-run-inspector-1440x900.png` 已从最终代码生成并目视核对。首次 live 验收脚本因 `run.completed` 同时出现在事件类型和文本列触发 Playwright 严格定位错误；改用事件类型列后完整重跑通过。无新增第三方依赖或 Renderer Node 权限。T064 的正式报告 Artifact 注入需 P2-09 产物模型，保留在 [追踪表](deferred-verification.json) 为 `DEFERRED_VERIFICATION`；当前 Activity/Diff 文本安全子集已测试。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（37 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 全部 exit 0。下一权威任务 P2-08「取消、停止与超时」自动开始。

## P2-06 · 工作记忆与 ContextBundle · 2026-09-24

状态：**DONE（当前 Run 的有界工作记忆；macOS arm64）**。正式 `@forge/contracts` 的 ContextBundle/WorkingCheckpoint 严格契约、`@forge/core/context` 的冻结 Task 来源组装与字符预算、Host-only SQLite schema v12 的 append-only checkpoint 和不可变 bundle 已落地。批准的目标、验收、范围、约束与排除项是必需内容，不会为塞进预算静默删掉；可选运行观察超额时记录省略数。每项带来源和 `approved_task`/`run_observation` 等级，恢复读模型明确 `processState: unverified`，不以历史 DB 状态宣称进程仍在线。Scheduler 会核对 bundle ID、RunConfig hash、Task revision、目标与上下文后才启动 Executor；运行时仅从标准事件保留最多 16 条动作/问题及观测预算，定期与终态前落 checkpoint，不存原始聊天或命令文本。见 [ADR 0024](decisions/0024-bounded-context-and-working-checkpoints.md)。

真实 SQLite 测试覆盖项目隔离、严格顺序、不可变触发器、重启后的工作进度与继续用 bundle、伪造上下文拒绝、超过预算的实际消耗仍完整记录。真实 `pnpm test:p2-run-live` 在隔离 Codex 工作区通过：`gpt-6-luna` 修改两个 fixture 文件、fixture 测试通过，280 条连续标准事件、12 个 checkpoint、5 条最终动作；重启数据库后 Run、bundle 与 checkpoint 均保留，源 Git 不变，Task 仍为 TODO。首次在线验证揭示把超预算观测当存储错误会丢失真实消耗，已修正并重新实测。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（36 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 全部 exit 0；最后增加的超预算测试单独复跑 8/8 通过。T071–T075 的项目记忆/索引生命周期属于 P5-09/P5-10，在 [追踪表](deferred-verification.json) 保留为 `DEFERRED_VERIFICATION`，未声称通过。没有新依赖、Renderer IPC、RAG 或跨项目记忆。下一权威任务 P2-07 已开始。

## P2-05 · 运行调度与 Attempt · 2026-09-24

状态：**DONE（Host 内部单节点调度与真实隔离 Codex Run；macOS arm64）**。独立 Host 的 `HostRunScheduler` 在执行器启动前以 SQLite schema v11 原子写入 queued Run、pending Attempt、workspace lease 和启动 intent；真实 sessionRef 返回后才进入 running。一个项目和一个工作区均限制单写者；结果绑定 Run/Attempt/租约 ID 与 epoch、Task revision、冻结配置 hash，重复终态结果幂等，旧结果只留审计而不污染新 Run。成功、失败、取消只有在受控进程已停止后才能持久化终态；未知启动副作用隔离为 interrupted/quarantined，不能盲目重跑。明确 429 且无副作用的故障注入验证有限退避、预算耗尽后 waiting_input；没有把故障注入冒充真实上游 429。见 [ADR 0023](decisions/0023-run-attempt-scheduler.md)。

`pnpm test:p2-run-live` 在本机已认证的 Codex app-server 和独立临时 Git 工作区真实运行：`gpt-6-luna` 修改两个 fixture 文件、fixture 测试通过，279 条连续标准事件与真实 sessionRef 到达 Host，Run/Attempt 均 succeeded；已批准 Task 仍为 TODO，源 Git 未变，关闭再打开 SQLite 仍保留 Run。`pnpm test:workspace-live` 的父/子/孙进程停止和租约安全回归通过。`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`（31 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均 exit 0；随后新增的 429 Host 调度集成测试单独复跑 6/6 通过。无新依赖、权限或 Renderer 命令。正式用户 Start、workflow/profile/plugin 内容解析、取消、崩溃对账和产物推进尚未实现；T034/T035 及其他完整纵向用例在 [追踪表](deferred-verification.json) 标记 `DEFERRED_VERIFICATION`，不声称 PASSED。下一权威任务 P2-06 已开始。

## P2-04 · Codex真实写入适配 · 2026-09-24

状态：**DONE（单一 Codex 真实写入；macOS arm64）**。沿用 ADR 0004 实测选定的 `codex-cli 0.155.1` app-server stdio 而非另起 SDK 路径；新增 `HostRunResources.startScheduled`，要求公共 Attempt 请求的 lease ID/epoch 与 Host 当前受控 worktree 匹配。`pnpm probe:codex` 返回本机现有 ChatGPT 登录和实际可用模型。`pnpm test:p2-codex-live` 在独立临时 Git 任务分支使用列表中的 `gpt-6-luna`，真正修改 `src/add.js` 与 `tests/add.test.mjs`，`npm test` 通过；Host 收到 312 条 run/text/command/usage/file/completion 标准事件，序号连续，provider sessionRef 有值，源仓库 HEAD/status 与父目录标记未变。第一次 live 测试仅因验收脚本对 Git porcelain 使用 `trim()` 丢掉首行状态空格而误判；改成 `trimEnd()` 后第二次完整运行通过。见 [ADR 0022](decisions/0022-scheduled-codex-write-adapter.md)。

`pnpm test:workspace-live` 复测真实 Codex 长命令及父/子/孙进程取消，确认所有受控进程停止、源仓库未变、工作区释放。`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（29 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。未建立正式 Task→Run 状态机；T041 双适配器、T042 Profile 模型选择、T043 正式 Run 取消、T044/T045 Run 失败路径在 [追踪表](deferred-verification.json) 保留，均未当作通过。下一权威任务 P2-05 已开始。

## P2-03 · ExecutorAdapter公共接口 · 2026-09-24

状态：**DONE（公共接口与上游校验边界；macOS arm64）**。`@forge/plugin-api` 在 P0 Codex spike 接口之外加入严格的 Scheduled Executor request：Attempt ID、lease epoch/ID、Contract/Profile revision、ContextBundle 与输出 Schema 引用；旧只读整理器仍可使用 spike request，生产调度必须使用新严格契约。`ExecutorEventGate` 要求同 Run、连续序号、首个 started 和唯一终态；Host Registry 在发布前验证，非法输出变成 `EXECUTOR_PROTOCOL_ERROR` 并请求取消。Codex stdio JSON-RPC 消息大小/包络、已知文本 delta、token usage 和审批消息均经过 schema 校验。见 [ADR 0021](decisions/0021-executor-attempt-contract-and-event-gate.md)。

单测有意发送重复/乱序/跨 Run/非法 provider 负载、缺失 Attempt 绑定及错误 RPC 包络，确认拒绝；Host fixture 证明无效事件不会穿透 Registry。`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（24 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0。P2-03 未启动正式 Run，也未用第二个真实适配器；T041–T045 在 [追踪表](deferred-verification.json) 分别归 P2-04/P2-05/P4-06/P4-10 验证，未标为通过。下一权威任务 P2-04 已开始。

## P2-02 · 工作区租约与基线快照 · 2026-09-24

状态：**DONE（工作区基础能力；macOS arm64）**。沿用 P0-06 Host-owned `@forge/workspace`，真实 Git fixture 在私有目录创建 `forge/run/<UUID>` 任务分支，固定 base commit/tree、source common-dir identity 与排除策略。单工作区并发 `acquire` 只有一个成功；lease ID/epoch 写入归属记录，`releaseLease` 在无活动归属进程时保留树并允许下一 epoch，旧 lease ID 被拒。Host Executor 启动前重新核对 lease ID/epoch/owner；停止期间不能新授租约。主仓库 HEAD/status 没有变化；清理和 orphan 继续遵守 P0 所有权、路径及 Git identity 检查。见 [ADR 0020](decisions/0020-task-workspace-lease-and-base.md)。

`pnpm validate:contracts`、`pnpm validate:task-map`（19 条 deferred）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 均 exit 0；最后新增 `releaseLease` 与关闭竞态保护后，`@forge/workspace` 4 项真实 Git 测试和 Host Executor 3 项测试再次通过。`pnpm smoke:p1-offline` 在 schema 10 上的真实 Electron/Host/SQLite 回归通过。T046 的正式 Attempt 入口、T047/T049 交付快照、T050 合并前目标分支重验按 [追踪表](deferred-verification.json) 保留为 `DEFERRED_VERIFICATION`；T048 在当前 Workspace API 的生成分支、严格 base hash/argv 与恶意路径测试范围有真实覆盖。不把尚未创建的 Run/CodeSnapshot/merge 记作通过。下一权威任务 P2-03 已开始。

## P2-01 · 不可变RunConfig · 2026-09-24

状态：**DONE（冻结与持久化边界；macOS arm64）**。严格 RunConfig 契约、`@forge/core` SHA-256 冻结与校验、Host 专属 SQLite schema v10 的 insert-only `run_config_snapshots` 已实现。真实已批准 TODO 与同项目 Environment 事务读取后生成快照；更改 Environment 设置、关闭并重开存储后，旧预算/环境/版本锁不变。过期 Task/Environment revision、跨项目、重复 runId 不同内容、篡改及 SQL UPDATE/DELETE 均拒绝。未暴露 Renderer 命令，未启动 Run/Executor，未来 Host 版本解析器必须验证真实 workflow/profile/plugin 内容与兼容性后才能执行。见 [ADR 0019](decisions/0019-immutable-run-config-snapshot.md)。

`pnpm validate:contracts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0；Electron utilityProcess Host 真实加载 SQLite schema 10，正常/损坏数据库/Host crash 路径仍通过。P2-01 引用的 T031–T035 需要正式 Attempt/调度、取消或崩溃对账，按 [追踪表](deferred-verification.json) 记录最早 owner，均为 `DEFERRED_VERIFICATION`，**未**记为 PASSED。任务核心冻结行为由独立真实测试验证；“已启动 Run 修改全局设置”纵向复验归 P2-05。没有新增第三方依赖或更改运行权限。下一权威任务 P2-02 已开始。

## P1-10 · P1集成与手工降级 · 2026-09-24

状态：**DONE（用户批准的 P1 阶段范围；macOS arm64 实测）**。独立 `scripts/smoke-p1-offline.mjs` 构建并启动真实 Electron/utilityProcess Host/SQLite，以中文及空格路径的临时 Git 项目从原生目录选择、信任、保存用户需求消息、手工草稿、CAS 修订、人工审阅批准到唯一 TODO，看板及详情在 Desktop 重启后保持。测试把 `CODEX_HOME` 指向空目录、清空 Key 项、设不可达 HTTP(S) 代理；整个流程不调用模型，证明没有模型认证时仍可使用任务与看板。它**不是**操作系统级断网试验。前后 Git HEAD/status 不变，声明的项目测试脚本未运行。真实 1440×900 截图 `output/playwright/p1-10-offline-approved-todo-1440x900.png` 已生成并查看。复现说明与 T011–T025、T116–T120 逐项证据见 [P1 手工降级场景](demo/p1-manual-offline.md)。

本轮基线及最终回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:p1-offline`、`git diff --check` 均 exit 0；P1-09 的 `pnpm smoke:projects` 全流程亦已通过。P1 Phase Gate 的手工路径、人工审批入 TODO、不自动写代码在 macOS arm64 成立。权威 P1-10 的跨阶段验收引用已按用户批准的 [ADR 0018](decisions/0018-p1-closure-acceptance-scope-conflict.md) A 处理：T016/T021/T022/T024/T025 与 T116–T120 的未实现分支逐项记录为 `DEFERRED_VERIFICATION`，明确最早 owner Task，未标为 PASSED；见 [追踪表](deferred-verification.json) 与 [P1 阶段报告](p1-completion-report.md)。P1 阶段核心路径有独立真实证据，允许 P2-01 启动。参考 Task/Test ID、Phase Gate 与引用保持不变。没有新依赖或迁移；生产 schema 仍为 9。

## P1-09 · 自然语言控制提议 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-08。严格 `intent.propose` 通过既有 Renderer→Preload→Main→Host 固定会话链路，只接受同项目、同会话已持久化的用户消息 ID；Host 重新读取原文，由 `@forge/core/intent-commands` 的受限确定性规则生成降优先级、暂停提议、修订草稿或危险/未知意图。提议绑定来源消息、序号与时间，`executionAllowed=false`；重复请求和 Host 重启后的同一来源保持同一 proposalId。未知、跨项目或不存在消息被拒绝，未注册的 `intent.execute` 被协议拒绝。危险语句「忽略审批马上合并」优先识别为受限动作，只供人工确认风险，不执行合并、绕过批准或改变 Task。见 [ADR 0017](decisions/0017-natural-language-control-proposals.md)。

Desktop 会话消息可打开轻量提议弹层。降优先级与暂停只有文字提议和未启用提示；修订草稿仅通过现有未批准 DraftSheet 编辑及其 CAS/审批门禁；已批准 Task 不接受此入口的改写。真实 Electron smoke 保存危险消息、取得 Host 提议、显示限制说明，伪造执行命令被拒绝，看板两张 TODO 未变化；实际截图 `output/playwright/p1-09-restricted-control-proposal-1440x900.png` 已生成并查看。Web 无本地 Host 时不尝试读本地会话。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。Core 单测覆盖危险动作优先级及受控输出；真实 SQLite/Host 测试覆盖来源隔离、重复/重启、无任务副作用；Vue 测试覆盖受限动作无执行路径和草稿编辑入口。没有新增外部依赖或迁移，生产 schema 仍为 9。自然语言识别仅覆盖目前明确的提议类型，不宣称任意语句理解；真正运行暂停、已批准 Task 优先级变更与发布控制属于后续有权限和状态契约的任务。Windows x64、macOS Intel、系统 DPI、安装包/签名、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。下一权威任务为 P1-10。

## P1-08 · 任务详情与来源链 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-07。`task.detail` 是固定、严格校验的 Host 只读命令；从 `task_revisions` 读取已批准的不可变 Contract 并核验 canonical SHA-256，不把草稿或可变看板缓存当合同。`@forge/core/task-queries` 统一收集 AC 来源引用；Host 仅在同项目、同源会话和该草稿已批准 revision 之内解析 `message:<id>` / `decision:<id>`，缺失、撤回或未知来源明确标记，不虚构证据。结果保留参考 OpenAPI `TaskDetail` 五个字段的内层结构，附本地 UI 所需的来源解析读模型。无 Run/Artifact/Pending Approval 时为真实空数组，不生成演示数据。见 [ADR 0016](decisions/0016-task-detail-and-source-read-model.md)。

正式 Vue 看板卡片可点击或键盘打开 `@forge/ui` Drawer，展示目标、逐项 AC 与来源、约束、范围、依赖、revision 和未执行状态。`#/tasks/<taskId>` 用稳定 Task ID 在当前项目重载；其他项目 ID 仍受 Host 项目隔离拒绝。真实 Electron smoke 打开已批准 v4 Task、分别定位 AC 用户决定与原始消息、重启后通过深链重新打开，截图 `output/playwright/p1-08-task-detail-source-1440x900.png` 已生成并查看。最初 smoke 暴露 Main 将 URL hash 当成另一来源，合法深链后的 IPC 被拒绝；修复为仅忽略 hash，仍要求原 WebContents/mainFrame 与原协议、host、path、query，并增加同页 hash 允许与恶意 query 拒绝测试。首次详情 smoke 的来源断言错误地假设改动后的 AC 仍指向原消息；按真实 AC 决定引用与 Task 整体原消息分别验收后通过。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 既有 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。真实 SQLite/Host IPC 测试覆盖两条 AC 的来源、跨项目拒绝、不可变 approved revision、缺失来源标记及重启保留；Vue 组件测试覆盖来源展开与撤回说明。P1-08 引用的 T021–T025 中与后续 Run/Review/Verify/只读身份相关的状态仍待相应 Task 验证；T020 的来源定位由本项实测。无新增第三方依赖或迁移；生产 schema 仍为 9。Windows x64、macOS Intel、系统 DPI、安装包/签名、Codex utilityProcess crash recovery 继续未验证。

## P1-07 · 任务看板与同列排序 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-06。新 `board.snapshot`/`tasks.reorder` 严格契约贯穿 ForgeClient→Preload→Main→独立 Host。SQLite migration v9 回填 v8 已批准 TODO 的整数位置，建立按项目 board revision、事件游标与重排幂等收据；Host 事务检查同列、相邻目标和 CAS，未知 state PATCH 与越列操作被拒绝。批准入 TODO 同事务推进 board revision/事件。五列真实投影、优先级/状态/Executor/标题筛选、长列窗口化、拖放及键盘上/下移已在 Desktop/Web 共用 Vue App 中落地；空/无项目/Host 不可用有独立状态。手工创建复用已有会话→手工草稿→人工审批，批准前不生成 Task，不启动 Agent。见 [ADR 0015](decisions/0015-task-board-projection-and-ordering.md)。

真实 SQLite 测试：v8→v9 两条已有 TODO 顺序和事件游标保留；批准任务在项目看板只出现一次，Host 重启仍在；同列排序的 revision/幂等、非法邻居拒绝与重复 eventId 唯一约束通过。Core fixture 覆盖多列/优先级/Executor 筛选及重复事件去重；Web 组件测试覆盖真实快照显示、过滤不改源数组、键盘移动、Host 离线不显旧卡片和 240 卡片窗口化。Electron `smoke:projects` 真实批准第一项 TODO、从看板手工创建并批准第二项、排序、尝试拖到 Done 被拒绝、重启保留顺序和项目源码不变；1280×800 的看板列水平滚动实测。截图 `output/playwright/p1-07-board-approved-todo-1440x900.png` 和 `p1-07-board-reordered-1440x900.png` 已生成并查看。

最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。第一次 P1-07 Desktop smoke 因新增 bridge 测试断言遗漏既有 `invokeProject` 而失败；修正后通过。第一次项目 smoke 的“手工草稿”名称与看板“新建手工草稿”不唯一，改为精确匹配；第二次因新增会话改变默认选中，测试显式选择旧会话后通过。没有新增第三方版本；`apps/web` 新增内部 `@forge/core` workspace 链接。T021–T025 中依赖未来 Run/Review/Verify、细粒度只读身份的部分仍未实际验收，不能据此声称所有状态已可达。Windows x64、macOS Intel、DPI、安装包/签名、Codex utilityProcess crash recovery 继续未验证。

## P1-06 · 审批与原子入TODO · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-05。严格的 `approval.request`/`approval.decide`/`approval.forDraft` 通过 Renderer→Preload→Main→Host 固定链路；用户查看确定的草稿 revision、scopeHash 和摘要后显式批准或拒绝。Core 对 Task Contract 做 canonical SHA-256，Host 用 revision CAS、内容与范围摘要、24 小时过期时间和未解问题门禁拒绝过期/变更请求。批准后只进入 `todo`，**不自动开始执行**；已批准草稿不能继续修订。见 [ADR 0014](decisions/0014-task-approval-and-atomic-todo.md)。

生产 SQLite migration v8 仅增加本任务的 `tasks`、`task_revisions`、`task_approvals`、`task_events`。Task TODO、不可变 revision、批准审计与事件同事务；故意令事件插入失败的测试证明四者均回滚，清除故障后可正常批准。相同批准决议重放结果相同；真实双客户端 Host IPC 并发只产生一个 TODO 和一个事件。拒绝、不匹配的旧 revision/scopeHash、未解澄清问题、到期请求都不能入 TODO；未知 `task.start` 与任意 shell 字段被协议拒绝。Electron UI 真实完成请求与批准，Host 重启后仍显示已批准 TODO；截图 `output/playwright/p1-06-approved-todo-1440x900.png` 已生成并查看。

最终回归：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。首次并行执行两个 Electron smoke 时 `smoke:desktop` 因 Electron 进程退出失败；串行重跑通过，Host 报真实 schema 8。首次全局 test 发现 workspace 版本清单断言仍为旧空映射，修正断言读取已记录的 `@forge/core` `@types/node@22.20.4` 后全部通过。没有新增外部版本，许可证 MIT 已在既有库存。Windows x64、macOS Intel、DPI、安装包/签名、Codex utilityProcess crash recovery 继续未验证。T016–T020 在本机覆盖上述安全和来源链；跨平台与后续 Task Start 不属于本项验收。

## P1-05 · 草稿编辑与澄清 · 2026-09-24

状态：**DONE（macOS arm64 本机范围）**。严格 `draft.revise`/`draft.history` 契约、Core 草稿修订规则、Host CAS、SQLite migration v7 的 `task_draft_revisions` 快照、已有 v6 草稿当前版本回填已实现。每次确认修改记录决定 ID/摘要、字段差异和澄清答案；验收项 ID 稳定，删除验收项及范围变更要求明确确认，改动的验收项带用户决定来源，未知来源引用被拒绝。所有未回答的 `openQuestions` 保持后续审批门禁；本轮未实施 Approval 或正式 Task。Desktop 用正式 `@forge/ui` Drawer 编辑、预览字段前后值、查看消息/用户决定来源与历史；Web 无 Host 时仍不可访问本地项目。见 [ADR 0013](decisions/0013-task-draft-revisions-and-clarification.md)。

验证：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 reference warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。Core 单测覆盖未解问题、稳定验收 ID、删除/范围确认、伪来源与过期版本；真实 SQLite 测试覆盖多次修订、重启、跨项目拒绝、v6→v7 快照回填。Electron/Host smoke 真正编辑手工草稿、回答问题、查看来源与历史、关闭重开并再次启动，源 Git fixture 不变。真实截图 `output/playwright/p1-05-draft-clarification-1440x900.png`、`p1-05-draft-revision-history-1440x900.png` 已生成并查看。T020 的本地消息/用户决定定位已验；T016–T019 涉及权威 P1-06 的正式审批，未执行。Windows x64、macOS Intel、DPI、安装包/签名及 Codex utilityProcess 恢复继续未验证。

## P1-04 · 整理器与结构化任务生成 · 2026-09-24

状态：**DONE（macOS arm64，Node Host 与 Electron 在线模型全链路实测）**。权威 P1-04 依赖 P1-03。已加入参考 TaskContract v1.0 的生产严格契约、TaskDraft/固定 Draft 命令、`@forge/refiner` 的意图分类→结构化草稿与最多两次 Schema 修复、受控只读 Codex app-server 模型适配、SQLite migration v6、来源消息绑定/幂等/重启失败恢复/手工草稿与有限原文 CAS 编辑。模型只接收受限项目摘要，不接收项目路径/源码；草稿无 Approval、TODO、Run 或执行权。Desktop 显示真实草稿状态，Web 无本地 Host。决策见 [ADR 0012](decisions/0012-read-only-refiner-and-task-draft.md)。

已通过：开始前 P1-03 全量基线；`@forge/refiner` 单元测试含 feature、模糊澄清、越权字段、两次修复、control；Host 真 SQLite/IPC 测试含手工草稿、版本 CAS、项目隔离、重启恢复与非法 payload；真实 Node Host Codex feature/bug/vague 生成；Desktop `smoke:projects` 手工草稿、重启、源码不变；迁移 v6 在 Node/Electron Desktop smoke 加载。第一次 `smoke:refiner-live` 真实失败：Electron utilityProcess 中 CLI 子进程未进入 Node 模式，草稿标为 `REFINER_FAILED`；补入受控子进程 `ELECTRON_RUN_AS_NODE` 后 app-server 真实启动，但第二次收到 `EXECUTOR_TIMEOUT`，因 Main→Host 原有环境未转发本机所需无凭据代理。加入最小白名单后，第三次真实 Electron 在线 smoke 通过：结构化澄清草稿在 Renderer 显示，独立 Git fixture 源码不变。最终 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`（47 文件、0 error、4 warning）、`pnpm validate:task-map`（9 phase、92 task、64 detail、120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 均 exit 0。真实截图 `output/playwright/p1-04-generated-draft-1440x900.png` 与 `p1-04-manual-draft-1440x900.png` 已生成并查看。在线模式依赖本机 Codex 登录和代理；安装包、Windows/Intel 仍未验证。下一权威任务 P1-05 开始，不提前实施审批入 TODO。

## P1-03 · 会话与消息流 · 2026-09-23

状态：**DONE（会话/消息/流式基础设施；生产模型尚未接入）**。生产 migration v5 建立 `conversations`、`messages`、`conversation_requests`；Host 独占写入，Project 归属检查，重启保留与归档。发送键与正文 hash 去重；失败、取消、Host 重启中断均保留用户原文，重试同键不会增加第二条用户消息。严格 Conversation/Message/StreamEvent Schema 及固定 Host→Main→Preload→ForgeClient→Vue 事件通道已建立。Responder 抽象对逐块输出持久化和排序；测试 fixture 的 streaming、cancel、failure、retry、重启恢复通过。**生产没有模型 responder**：真实 Desktop 保存用户消息并显示 unavailable，不显示伪助手回复、不创建 Task。Markdown 源按纯文本展示，不执行 HTML。见 [ADR 0011](decisions/0011-conversation-stream-and-provider-boundary.md)。

`pnpm lint`、`pnpm typecheck`、`pnpm test`（含合同、SQLite、Host IPC、Vue XSS/失败保留）、`pnpm build`、`pnpm smoke:desktop`（Electron utilityProcess schema 5、隔离 preload、Host 崩溃）、`pnpm smoke:projects`（真实 Desktop 保存带 HTML 的会话、重启恢复、项目隔离）、`pnpm validate:contracts`（46 文件，0 error，4 warning）、`pnpm validate:task-map`（9 phase，92 task，64 detail，120 case）与 `git diff --check` 均 exit 0。真实截图：`output/playwright/p1-03-local-conversation-1440x900.png`，已人工查看。无新外部依赖。T013 的重复消息、P1-03 本地流与失败保存已验；T011/T012/T014/T015 涉及后续 Refiner/TaskDraft/Approval，不宣称已通过。下一权威任务 P1-04 已进入 IN_PROGRESS。

## P1-02 · 项目及环境数据服务 · 2026-09-23

状态：**DONE（macOS arm64 本机范围）**。权威依赖 P1-01 已完成；P1-03 已进入 IN_PROGRESS。`packages/persistence` migration v4 给现有 Project 增加 revision/archived_at，新增 Host 独占的 Environment 与 CommandPreset 表并无损回填旧项目默认环境。Project 更新、激活、归档及 Environment/Preset 保存、审批、归档均要求 expectedRevision CAS；归档保留信任/配置历史，不删除用户项目。跨项目查询与关联按 projectId 隔离，命令预设只保存结构化 executable/argv/cwd/envRefs/timeout 与审批摘要，不执行项目脚本。Host 私有协议升至 `forge-host-protocol/v4`；公共输入输出使用严格 Zod Schema；真实业务入口仍是 Renderer→Preload→Main→Host。

验证：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（46 文件，0 error，4 reference warning）、`pnpm validate:task-map`（9 phase，92 task，64 detail，120 case）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`node scripts/smoke-desktop.mjs`、`pnpm smoke:projects`、`git diff --check` 均 exit 0；迁移 v3→v4、重启保留、不同项目隔离、过期版本拒绝、归档/恢复、真实 Host IPC 命令与重复 commandId 真实测试通过。第一次 `pnpm smoke:desktop` 因旧测试断言 Schema `3` 失败；更新为实际 schema `4` 后直接运行 Desktop smoke 通过。尚需在本阶段最终总回归中再跑完整 `pnpm smoke:desktop`。没有新增外部依赖或改变供应链策略。

边界：T006–T009 的本地只读项目探测与基础符号链接防护沿用 P1-01 测试；T010 要求的 Windows 中文路径/worktree/argv 真机验收仍 UNVERIFIED。没有增加 Task/Run 业务表、执行项目命令、Agent 调度或 Remote API。差异与取舍见 [ADR 0010](decisions/0010-project-environment-cas-and-archive.md)。

## Task Map Reconciliation · 2026-09-23

- 用户选择 ADR 0009 的 A。`docs/forge-codex-execution-playbook.md` 已按只读权威 `planning/tasks.json`/`phases.json` 重建 P1～P9 的 **92 个** Task 标题、编号、模块、顺序、依赖、验收引用与 Phase Gate；P1-01 继续为 DONE。旧 Playbook 64 个详细说明块保留并显式映射到权威任务；P8 恢复为手机 PWA 正常阶段，P9 可选增强默认 DEFERRED。Model Provider 的完整替换接口归 P4-07，P1-04 只承接整理器的最小真实调用，凭据产品化归 P6-04；未改动参考包任务状态或任务图。
- 新增 `pnpm validate:task-map` 与 CI 独立步骤，核对权威实施/验收文本、paths、依赖、阶段出口、120 个验收用例引用及说明映射。故意更改任务名称、依赖、Phase Gate、验收引用的 4 项 mutation test 均正确失败；当前原始 Playbook 校验通过。P1-02 已按权威名称「项目及环境数据服务」进入 IN_PROGRESS；其实现与验收另记。

## Autopilot checkpoint · 2026-09-23

- 按新 Autopilot Protocol 从真实 Git 工作区复查 P1-01：`pnpm install --frozen-lockfile`、`pnpm validate:contracts`（46 文件、0 error、4 warning）、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check` 全部 exit 0。Playbook 的 P1-01 已与实际 macOS arm64 验收同步为 DONE；参考任务状态未改。
- 下一个依赖满足的编号 P1-02 在 Playbook 是「模型 Provider 与 Secret Storage」，在权威 `planning/tasks.json`/蓝图是「项目及环境数据服务」；P1 任务总数与 Phase Gate 亦不一致。已记录 [ADR 0009](decisions/0009-p1-autopilot-task-map-conflict.md)，P1-02 暂标 BLOCKED，未开始其代码、模型调用或凭据处理。P1-03 及后续都依赖 P1-02，没有独立可执行任务；等待用户选择如何修订任务映射。

## P1-01 · 项目选择与可信环境向导

状态：**macOS 27.0 arm64 已实现并通过本机端到端验证**。日期：2026-09-23。开始时 `main...origin/main` 干净；P0-01～P0-08 已在当前分支。参考规格和 glass 目录保持只读。实施过程中出现与本任务无关的未跟踪 `docs/forge-codex-execution-playbook.md`，未编辑或纳入本轮代码。

### 实现

- `packages/contracts/src/project.ts` 定义严格 Project/Probe、`project-trust/v1` 和固定 project 命令。Host 协议显式升至 `forge-host-protocol/v3`。Desktop 目录选择由 Main 的 Electron `dialog.showOpenDialog(openDirectory)` 承担；Main 验证来源，只允许本窗口刚选中的路径及 Host 返回的规范 Git root 进入 probe/create。Preload 不暴露任意 IPC、文件、Git 或 SQL。
- `ProjectService` 在 Host 中对路径 `realpath` 并确认目录，只运行参数化本地 Git 读取命令，不触发项目脚本、包安装或网络。读取有大小上限的顶层清单；跳过符号链接 manifest。检测 clean/dirty、分支、本地 remote HEAD、lockfile 冲突、项目类型、声明脚本与受限能力；未知值保持 Unknown。选中 Git 子目录时使用真实 Git root；非 Git 项目允许保存但标记 worktree 不可用。
- 用户先看探测与脏树警告，再单独点 Trust。Host 对路径重新探测并比较 SHA-256 摘要，过期结果拒绝；信任范围不包括未来危险操作自动批准。生产 migration v3 仅添加 `projects` 与 `project_trust_decisions`，保存独立 UUID、规范路径、严格环境快照、信任版本/时间/hash 与当前项目指针。重复 symlink/同仓库不会重复创建；重启后 active project 保留；Remove from Forge 只删除 DB 记录。`project.update` 本轮仅支持安全名称更新；更完整的环境/命令版本与 CAS 留给 P1-02。
- Vue 项目向导和顶部切换入口使用正式 `@forge/ui`、glass v1.1。普通 Web 无本地选择器；自然语言输入、任务看板、Agent 仍明确不可用。决策和参考 DDL 差异见 ADR 0008。

### 本机验证

- 开始前 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check`：全部 exit 0；契约 46 文件、0 error、4 个 reference-only warning。
- Host 单元/集成覆盖真实 Git clean/dirty、中文空格路径、非 Git、多个 lockfile、失效 fingerprint、未确认信任、symlink 去重、外部 symlink manifest 不读取、项目 UUID/持久化/移除源码不变。真实 Node Host IPC 覆盖未握手拒绝、路径错误、schema 拒绝 `approved:false`、probe/create/list/active/remove 和协议不兼容。Web 组件测试验证无本地 picker、信任按钮前没有 create 调用。
- `pnpm smoke:projects`：真实 Electron Renderer/Main/utilityProcess Host/SQLite 全链路，在独立临时 Git/非 Git fixture 中完成目录选择返回、取消、脏树探测、信任、进入工作区、重启恢复、项目切换和只删除 Forge 元数据；首次截图发现探测页按钮超出 1440×900 可视区和首页动画未结束，调整间距/等待后重新截图核对。自动化替换系统选择器返回值以保持稳定；另外通过 macOS 原生目录面板实际选择独立临时非 Git 目录，Forge 页面显示 Host 规范路径与 Non-Git 探测结果。
- 最终回归 `pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm smoke:projects`、`git diff --check`：全部 exit 0。契约校验仍为 46 文件、0 error、4 warning；Desktop smoke 实际握手 `forge-host-protocol/v3`，Storage ready/schema 3，数据库损坏降级与 Host crash 检测通过；项目 smoke 覆盖 choose、cancel、dirty、trust、connected、restart、non-Git、switch、metadata-only remove。正式代码未新增第三方依赖。
- `pnpm dev:web` 启动 Vite 8.3.0；`curl http://127.0.0.1:5173/` 返回正式 Forge 入口，Ctrl+C 后 5173 无监听。Web 组件测试确认无 Desktop bridge 时显示本地选择不可用且不发起 project 命令。
- 真实截图：`output/playwright/p1-01-choose-project-1440x900.png`、`p1-01-project-detected-dirty-1440x900.png`、`p1-01-trust-project-1440x900.png`、`p1-01-connected-ready-1440x900.png`、`p1-01-connected-workspace-1440x900.png`。均由当前 Vue/Electron 代码生成，非参考包图片；目录被 Git 忽略。

### 尚未验证和下一项

Windows x64、macOS Intel、真实 DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 保持 **UNVERIFIED**；Windows 进程树 backend 仍不可用。P1-02「项目及环境数据服务」是下一项依赖满足的任务，本轮不实施。

## P0-08 · 契约自动校验与 CI 入口

状态：**macOS 27.0 arm64 的 P0-08 工程实现与本机校验通过**。Linux GitHub Actions 尚未实际运行；T116–T120 是后续评测业务验收，本轮未执行。版本保持 0.0.1，未提交、推送、发布或进入 P1。日期：2026-09-23。

- 新增 `@forge/contract-validator`，提供只读 `validateContracts()`、统一 issue/report 和独立 CLI。扫描参考包 13 个 JSON Schema、示例、4 个 Agent Profile、默认 Workflow、示例 Plugin Manifest、100 项 Task、10 个 Phase、24 个 Module、120 条待执行 Acceptance Case、44 个命令声明、OpenAPI 与 SQL；另外检查生产设计 token、生产 migration SQL、workspace 依赖版本与许可证清单。当前为 46 个文件、0 error、4 个 reference-only warning，约 100 ms 静态校验。
- 共用 `ReferenceIndex` 区分各 ID namespace，检查重复 ID、缺失引用、Task 循环/阶段顺序、Workflow 可达/有界返工/人工终点、插件服务/权限、OpenAPI 本地引用/命令一致性。Ajv 8 严格编译 draft 2020-12；YAML 2 拒绝重复键；SQLite DDL 与 migration SQL 只在独立内存库执行。生产 Host 不读取参考资料，参考目录未改动。
- 13 项 validator 测试通过，其中 12 项故意破坏契约：重复 Task ID、缺失 Profile、依赖环、非法 Schema、Workflow 死端、未知插件权限、坏验收引用、验收用例反向缺失任务、坏示例、悬空 OpenAPI 引用、无效 SQL、依赖版本漂移。每项验证报告包含目标错误码且 CLI exit 1。CI `.github/workflows/quality.yml` 已单列 `pnpm validate:contracts`，接着运行 lint/typecheck/test/build；GitHub Linux job 尚未触发，不写成 CI 实测通过。
- 供应链：新增 `ajv@8.20.0` MIT、`ajv-formats@3.0.1` MIT、`yaml@2.9.1` ISC；复用 `better-sqlite3@13.0.3`、TypeScript 与类型包。版本/许可证记录和 lockfile 更新，`pnpm install --frozen-lockfile` 通过；安装脚本仍禁用。决策见 ADR 0007。
- 开始前以及最终 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 全部 exit 0。最终 `pnpm validate:contracts` exit 0；`pnpm probe:codex` 显示本机 app-server 可用；`pnpm test:workspace-live` 真实长命令取消、三代 PID 停止、源仓库不变、workspace 释放，exit 0。 `pnpm test:codex-live` 在独立 fixture 中 SDK/app-server 只读与结构化输出、真实写入及 fixture 测试、streaming、cancel、跨连接/进程 continuation、approve/reject 全链路 exit 0；这依赖当前认证及上游网络。
- 参考 Profile 的 `codex-sdk` 和 `forge.refiner` 仅有静态参考声明；真实 Plugin Host 装配仍未实现。P0-08 在任务清单关联的 T116–T120 是未来评测场景，不能作为本轮 contract validator 验收通过。完整平台/阶段差异见 `docs/p0-completion-report.md`。


## P0-07 · 设计 Token 与基础组件

状态：**macOS 27.0 arm64 的 P0-07 工程实现与本机 UI 验证完成**；Windows、macOS Intel、真实 Retina/Windows 系统 DPI、读屏器和暗色主题验收仍未执行。版本仍为 `0.0.1`；本轮未提交、推送、发布或进入 P0-08。日期：2026-09-23。

### 本轮实现

- `@forge/ui` 公开 typed token、组件及布局入口。`values.json` 为工程唯一 token 源，脚本生成 CSS，build 执行一致性检查；颜色、字体、间距、圆角、阴影、玻璃、动效、z-index 覆盖 glass v1.1 目标，另外给状态文字增加高对比的派生 token。没有新第三方 UI 依赖或字体。参考资料目录保持只读。
- 新增 GlassSurface、Button/IconButton、Input/Textarea/原生 Select、StatusTag/Badge、Card、Tabs、Tooltip、Popover、Dialog、Drawer、Toast、EmptyState、Spinner、Skeleton，以及 AppShell、IconRail、WorkspaceHeader、CommandPanelShell、ContentArea。Dialog/Drawer 有背景 inert、Tab 环绕、Escape、触发器焦点返回；其他控件使用可访问名称和可见 focus。减少透明度与动效同时接受系统偏好和当前窗口开关。
- Web 首页改用正式 UI 包；Desktop Renderer 继续加载同一 Web 构建，Host diagnostics 和 crash/Storage 状态保持真实。自然语言输入仍禁用发送，不生成 Task；看板、工作流、Agents、插件均只显示真实不可用/空状态。开发 Showcase 在 `pnpm dev:web` 的 `http://127.0.0.1:5173/#/dev/ui`；生产构建同 URL hash 只显示普通首页。
- 1280×800 的 125% CSS zoom 探测发现输入动作曾被挤出面板；给命令面板最小高度后，主内容区滚动且按钮可达。这个结果不等于 Win125%/150% 或 Mac Retina 系统级 DPI 验收。决策见 ADR 0006。

### 命令与真实证据

| 命令 / 场景 | 结果 |
| --- | --- |
| 开始前 AGENTS/README/status/compatibility/ADR、P0-07/T106–T110、glass 设计资料与真实代码检查 | `main...origin/main` 保留 P0-01～P0-06 已有未提交文件；`packages/ui` 原先只有 tokens.css。看过 glass v1.1 的 1440 看板截图及原型结构，未把演示脚本/业务数据移入正式应用。 |
| 开始前 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部 exit 0，已有 P0-06 基线正常。 |
| `pnpm install --offline`、`pnpm install`、`pnpm install --force`、最终 `pnpm install --frozen-lockfile` | 离线第一次因本机 registry metadata 缺失失败；联网安装通过。新增 UI importer 首次 peer 链接指向未物化的 Vue/vue-tsc 变体；锁定已有 TypeScript peer 变体并冻结安装后通过，供应链策略继续启用。没有新外部版本、sudo 或 install script 放宽。 |
| `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` 最终回归 | 全部 exit 0；13 个 workspace，57 项自动测试。UI token 一致性、8 组核心文字/状态配色对比、Button/IconButton/Input/interactive Card/Glass/Tabs/Popover/Dialog/Drawer/Web 挂载与旧 Host/Persistence/Executor/Workspace/Process 回归通过。Desktop smoke 的真实 connected、Storage ready、degraded 和 crash-detected 均通过。 |
| `node scripts/capture-ui.mjs` | 真实 Electron + Host：1440×900、1600×1000 无水平溢出；1280×800 的 125% CSS zoom 下动作仍在面板内且主内容可滚动，Playwright viewport 的 DPR=1；减少透明度 computed blur(0px)，减少动效 computed animation=0s。临时 Host DB 已随进程清理。 |
| Playwright CLI 真实浏览器 | Web `Local Host unavailable` 正常；开发 hash 路由显示 Showcase，生产构建同 hash 不显示；Dialog Shift+Tab 环绕、Escape 后焦点回到 Open dialog；`prefers-reduced-motion: reduce` 的 token=0ms、实际动画约 0.01ms。 |

截图来自本轮真实代码，不是参考包图片：

- Electron Home 1440×900：`output/playwright/p0-07-desktop-1440x900.png`
- Electron Home 1600×1000：`output/playwright/p0-07-desktop-1600x1000.png`
- Vite 开发 Showcase：`output/playwright/p0-07-ui-showcase.png`
- Electron 减少透明度与动效：`output/playwright/p0-07-desktop-reduced-transparency.png`
- Electron 1280 宽、125% CSS zoom 模拟：`output/playwright/p0-07-desktop-1280-css-zoom-125.png`

截图位于 Git 忽略的本地 QA 目录。Showcase 只展示组件状态，不提供假的 Agent/Task 结果。

### 验收边界与下一项

- T106：Dialog/Drawer 基础焦点在组件和真实浏览器通过；完整审批/任务抽屉业务尚不存在。T107：静态不透明表面文字/状态对比通过，真实玻璃合成与暗色主题未验收；glass v1.1 当前仅给浅色基准。T108：1280/1600 与 CSS zoom 通过，Win150%/Mac Retina 未测。T109：长文本换行基础已加，正式 120 字任务详情未实现。T110：系统 reduced motion 与当前窗口开关实测通过。
- Windows x64、macOS Intel、真实系统 DPI、原生窗口控件在两平台的视觉、屏幕阅读器、Windows 高对比度、安装包仍为 **UNVERIFIED**。外观开关只在当前窗口有效，完整设置持久化属于后续任务。
- 下一项满足依赖的是 P0-08「契约自动校验与 CI 入口」；本轮不自动开始。

## P0-06 · 跨平台工作区与进程取消探测

状态：**macOS 27.0 arm64 上的最小 Workspace/Process Spike 已实现并真实验证**。Windows 进程树 backend 仍不可用、macOS Intel 未测试，因此任务清单所写“双平台无残留写进程”尚不能跨平台验收；版本保持 `0.0.1`，未提交、推送、发布或进入 P0-07。日期：2026-09-23。

### 已实现与决策

- 新增 `@forge/workspace` 的严格 WorkspaceDescriptor、detached Git worktree 管理、单 Run acquire、owner/runtime/source repo common-dir identity、dirty worktree 显式 discard、路径/符号链接防护、幂等 release，以及 shutdown `failed` 隔离和重启 orphan 检测。Git 调用覆盖为受控空 hooks 目录，真实 `post-checkout` fixture 未执行；Host 自有数据目录持有 workspace，不执行全局 `git worktree prune`。正式分支/快照/合并仍属 P2/P3。
- 新增 `@forge/process` 的受控 executable + argv、ProcessDescriptor、独立 POSIX 进程组、TERM→有限 grace→KILL→确认退出、重复 cancel、运行期归属与只报告不自动清理的旧进程记录。测试确认父进程先退出仍能终止其组；Run A 的取消不影响 Run B 或非 Forge 用户进程，端口可再次绑定。Windows backend 拒绝启动，不伪称可终止进程树。
- Codex CLI 探测及 app-server 现由 ProcessController 启动；Host Registry 在退出前停止接受新 Run 并取消自己拥有的进程，WorkspaceManager 将未释放 lease 标记 failed。`HostRunResources` 只做基础设施启动/取消/确认/释放；失败 quarantine，不推动 Task 状态。Desktop Main 的 Host shutdown 等待上限增至 8 秒，仍不直接管理 Agent 子进程。
- 实际 Codex 长任务在独立 worktree 启动父/子/孙三个进程：app-server 与命令进程组不同，必须先用 provider `turn/interrupt`。本机在线探测确认三个 PID 消失、心跳停止、源仓库 HEAD/status 未变后，才释放 worktree；强制停止任意脱离 Codex 管理的进程尚未证明。详细边界见 ADR 0005。

### 执行记录

| 命令 / 场景 | 实际结果 |
| --- | --- |
| 开始前 AGENTS/README/status/compatibility/ADR/规格/代码与 `git status --short --branch` | `main...origin/main` 上保留 P0-02～P0-05 既有未提交改动；两份资料目录未修改。P0-06 指向 `packages/workspace`、`packages/process`，T047 snapshot/T050 合并重验属于后续阶段。 |
| 开始前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`pnpm probe:codex`、`pnpm test:codex-live`、`git diff --check` | 全部通过；当前 macOS arm64 的 P0-05 基线仍成立。 |
| `pnpm --filter @forge/workspace test` | 真实中文/空格/长路径 source→worktree、base SHA、dirty source 隔离、未跟踪文件、release 后 Git metadata、恶意 hook 不执行、恶意 ID/symlink/active process 拒绝、shutdown orphan 检测通过。 |
| `pnpm --filter @forge/process test` | 真实父/子/孙、Run A/B 与非 Forge C 隔离、端口释放、无响应进程强制停止、父先退出后的组取消、重复 cancel 与 argv Unicode/空格通过。 |
| `pnpm test:workspace-live` | 真实 Codex app-server 与三个命令 PID；命令有独立 PGID，provider 中断后 PID 消失、心跳停止、Forge 组退出、源仓库不变、worktree 释放；未使用 Forge 自身仓库作写入目标。 |
| Host Registry shutdown 与失败取消单测 | 停止接收新 Run、已启动子孙进程退出；未确认取消时 workspace 为 failed 并保留文件，未误报 release。 |
| 最终 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部 exit 0；13 个 workspace 项目、48 项自动测试通过。Desktop Electron utilityProcess 的真实 Host connected/Storage ready，原降级和崩溃回归仍通过。 |
| 最终 `pnpm test:workspace-live`、P0-05 `pnpm test:codex-live`、`pnpm probe:codex` | 均通过；P0-06 最终 app-server PID 38421，命令父/子/孙 PID 38763/38764/38765、PGID 38763，取消后全部退出且 worktree released。P0-05 的在线回归在 ProcessController 接入后通过；之后仅有 CLI 清理 lint 写法与 Git hook 空目录的修正，P0-06 live 已在最终代码上复跑。 |
| `pnpm dev:web`、`curl --fail --silent http://127.0.0.1:5173/`、Ctrl+C、5173 监听检查 | Vite 启动、返回 Forge 页面和 `#app`；退出后无监听。 |

### 边界与下一项

- `WorkspaceDescriptor` 是本轮公开边界；完整 WorkspaceService、lease epoch、snapshot、未跟踪文件 hash、分支前移重验、业务 Task DB 均未实现。T046 单写者基础拒绝、T048 argv/参数基础防护、T049 路径/symlink 基础防护已测；T047/T050 的完整业务验收未执行。
- macOS arm64 本机通过不代表 Windows/macOS Intel 通过。Windows Job Object 或等价安全进程树实现、Electron utilityProcess 中有活动 Codex Run 时的退出、安装包和故意 `setsid` 脱组子进程均待验证。旧归属记录仅标记“可能 orphan”，不会基于旧 PID 自动杀进程。
- 下一项满足依赖的任务是 P0-07「设计 Token 与基础组件」；本轮不自动开始。

## P0-05 · Codex Integration Spike / Codex Executor 兼容探测

状态：P0-05 最小 Executor API、Host Registry 与 Codex app-server Adapter 已在 macOS 27.0 arm64 实施并通过真实验收；Windows、macOS Intel 和安装包未验证。日期：2026-09-23。版本仍是 `0.0.1`，未提交、推送、发布或进入 P0-06。

### 已实现

- `@forge/plugin-api` 的严格 ExecutorCapabilities、RunRequest、14 类标准 ExecutorEvent、RunHandle 和错误码。Core 不导入 Codex；`@forge/executor-codex` 使用固定 `@openai/codex@0.155.1` 的私有 stdio app-server，校验请求/关键响应，映射事件并拒绝未知模型和交互请求。
- Host 内置最小 Executor Registry 和事件监听器；只允许开发诊断与独立 fixture 调用，没有 Renderer → Executor 通道、Task 状态推进、持久 Attempt 或业务审批。`pnpm probe:codex` 根据实际本地版本、登录、握手、实时模型列表和版本匹配的 `verified-capabilities.json` 输出能力。后者只适用于本机实测版本，不是跨平台声明。
- 独立临时 Git fixture 的 Codex 实际修改 `src/add.js` 和测试；`npm test` 通过，Host Registry 的事件监听器收到序号连续的标准事件。fixture 父目录的标记文件保持不变，Git diff 仅含指定的两个文件；这是本次任务的实际写入边界观察，不证明任意读取/网络隔离。45 秒命令启动后 `turn/interrupt` 使 Run cancelled，未生成后续文件；新连接以同一 thread ID 继续。另由两个不同 PID 的 Node 进程分别创建 Host Registry，保存 thread ID 后跨进程继续成功；这不是 Electron utilityProcess 的重启测试。只读 sandbox 的 approve 写入、reject 不写入均收到真实请求/决议。隔离 `CODEX_HOME` 证实无认证时返回 `EXECUTOR_AUTH_FAILED`。
- ADR 0004 记录 SDK 与 app-server 选型、与蓝图 SDK 优先的差异、审批和进程边界。app-server 官方文档与本机 0.155.1 实际 enum 变体不同，适配器按固定版本实测值实现。

### 本轮命令和结果

| 命令 / 场景 | 真实结果 |
| --- | --- |
| 开始前 `git status --short --branch`、AGENTS/README/实施记录/ADR/规格与代码检查 | main 保留 P0-02～P0-04 未提交改动，资料目录未修改。 |
| 开始前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部通过；P0-04 基线仍为 33 项测试。 |
| `pnpm install`、`pnpm view @openai/codex{,-sdk}@0.155.1 ...` | 11 个 workspace，新增精确 0.155.1 CLI/SDK；无 install script 放宽，锁文件供应链策略通过。 |
| SDK 只读 spike | 真实 thread/turn 事件和 token usage；临时目录需先 `git init`，否则 SDK 拒绝非可信目录。 |
| app-server 只读 + `gpt-6-astra` + JSON Schema | 真实 thread/turn 完成，返回正确 fixture 包名 JSON，收到 delta 与 token usage。 |
| app-server Codex Adapter 写入 spike | Host Registry 启动真实 Codex Run，最终套件事件总线收到 240 条连续标准事件；真实修改两个 fixture 文件，fixture `npm test` 通过，父目录标记未变。 |
| 最终 live 的真实 usage | 写入 thread 的 `inputTokens=129985`、`cachedInputTokens=101376`、`outputTokens=1140`，`cost/currency=null`（上游未提供实际费用）。SDK 只读 usage 为 input 40971、cached 32768、output 135、reasoning 15。 |
| app-server 生命周期 spike | 长命令已启动后取消，Run 为 cancelled 且无后续文件；新连接用原 thread ID 继续成功。 |
| `resume-process.mjs` | 两个不同 PID 的 Node 进程分别创建 Host Registry；第二进程用第一进程保存的 thread ID 完成 continuation；未模拟完整 Forge Attempt 恢复。 |
| app-server 审批 spike | approve 请求后文件真实写入；reject 请求后文件不存在；两者均有 approval.requested/resolved。 |
| `pnpm test:codex-live` 首次串行重跑 | 认证缺失、无效 workspace/model、SDK 只读先通过；随后 app-server 只读阶段连续 `responseStreamDisconnected`，120 秒未收到终态，命令失败。原因为本轮环境白名单遗漏本机所需代理。 |
| 修正环境白名单后 `pnpm test:codex-live` | **通过**：认证缺失、非法工作区/模型、SDK 只读、app-server 只读/指定模型/结构化输出、Adapter 结构化输出、真实写入和测试、取消/跨连接继续、approve/reject 全部完成。无凭据代理 URL 可传入 Codex 子进程；任意 Key/Forge token 仍被屏蔽。 |
| Host Registry 与实时模型列表的最终 `pnpm test:codex-live` | **通过**：动态选择当前可用的 `gpt-6-astra`；Host 事件链 240 条连续事件、fixture 修改与测试、取消/跨进程恢复和双向审批均通过。 |
| `pnpm probe:codex` | 本地 CLI 0.155.1、ChatGPT 登录、stdio 握手与模型列表可用；详细能力按本机实测证据返回。`available` 只代表本地可用，不代表模型连接健康。 |
| 新代码后 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 离线质量检查、构建与 Desktop 真机回归通过；最终安全/文档修正后的复核见本节后续记录。 |
| 最终冻结安装、lint、typecheck、test、build、Desktop smoke、diff check | 全部 exit 0；工作区共 40 项自动测试通过。Desktop utilityProcess Host 仍为真实 connected / Storage ready，随后无效库降级与崩溃检测通过。 |
| `pnpm dev:web` + `curl http://127.0.0.1:5173/` → Ctrl+C → 端口检查 | Web 返回 Forge 标题和 `#app` 根节点，退出后 5173 无监听；Web 没有本地 Host 依赖。 |

### 验收边界

- T041 的第二个不同厂商 Executor 属于后续 P4，不能把同一 Codex 的 SDK/app-server 算成两个产品执行器。T042 未知模型已真实拒绝。T043 中断及跨进程 thread continuation 已实测，但 Forge Attempt 恢复未实现。T044 不凭文本判成功，真实 fixture 文件和测试均被独立断言；完整业务产物/状态验收仍在 P2。T045 隔离登录缺失已测，运行中凭据过期未测。
- `toolEvents` 的 MCP 工具事件、强制网络策略、严格只读根、实际费用、SDK 审批/恢复、Windows、macOS Intel、安装包均未验证。`resume` 指 Codex thread continuation；没有 Forge Task 自动恢复、人工身份审批服务或 Secret Storage。
- 下一项满足依赖的任务为 P0-06「跨平台工作区与进程取消探测」；本轮不自动开始。macOS 上的 P0-05 通过不代表 Windows/Intel 平台已验收。

## P0-04 · 数据库与原生模块风险验证

状态：macOS 27.0 arm64 上最小 SQLite 基础设施与两种 Host 运行时实测通过；Windows x64、macOS Intel、安装包未验收。日期：2026-09-23。当前仍为 `0.0.1`，没有提交、推送、发布或进入 P0-05。

### 已实现

- 新增 `@forge/persistence`，只向 Host 暴露 `open/close/migrate/health/transaction`、受限内部 metadata 与一致性备份接口。SQLite driver 不进入 Main/Preload/Renderer；数据库默认在 Forge 自己的用户应用数据目录，开发/生产分离，所有集成和 Desktop smoke 使用独立临时目录。
- 固定 `better-sqlite3@13.0.3`、`drizzle-orm@0.45.3`。前者使用包内 N-API 预构建文件，无安装脚本；仍保持 pnpm `ignoreScripts: true`。Drizzle 当前只访问内部 `runtime_metadata`，没有生成业务表。
- 实现两版事务迁移：v1 建立 `schema_migrations` 和 `runtime_metadata`；v2 增加 `updated_at` 与索引。按顺序、checksum 和 `user_version` 校验，失败不记成功，拒绝未来版本。启用 FK、WAL 与 5000ms busy timeout，使用 SQLite backup API 创建一致性备份。
- Host 启动时迁移数据库并写入真实启动元数据；`system.health` 返回 Storage/schema/SQLite 与进程 runtime。数据库失败时 Host 为 degraded、Storage unavailable，错误码不带路径或 SQL。健康契约升级为显式 `forge-host-protocol/v2`；Desktop 诊断只显示 Storage/Schema，不显示数据库路径。
- ADR 0003 记录 driver、N-API、单 Host ownership、迁移、WAL、备份与打包风险。

### 执行记录

| 命令 / 验证 | 实际结果 |
| --- | --- |
| 开始前 `git status --short --branch` 与 P0-03 代码/ADR/规格检查 | main 上保留 P0-02/P0-03 未提交改动；两个只读资料目录未修改。 |
| 开始前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop`、`git diff --check` | 全部通过，P0-03 基线测试 22 项。 |
| `pnpm install`、`pnpm install --frozen-lockfile` | 9 个 workspace 项目；锁文件与供应链策略通过，没有打开安装脚本。 |
| Node 直接加载 `better-sqlite3` | Node v22.22.0、modules ABI 127、darwin/arm64；包内原生模块加载，SQLite 3.53.4。 |
| `pnpm dev:host`、构建后 `pnpm --filter @forge/host start`，同一独立临时库重启 | 两次真实 Host 启动；schema 2、内部启动计数从 1→2；Ctrl+C 后 PID 消失。 |
| `pnpm dev:desktop`（独立临时库） | Vite/Electron/utilityProcess Host 真实启动并握手；Ctrl+C 后本次 Host PID 与 5173 监听消失。 |
| `pnpm --filter @forge/persistence test`、`pnpm test` | v1→v2、重复迁移、失败回滚、未来版本、commit/rollback、唯一/FK、锁超时、错误映射、WAL 备份、进程中断恢复及 Host 重启/降级通过；全工作区 33 项通过。 |
| `pnpm dev:web` + Playwright CLI 普通浏览器快照 | Forge 页面加载、`Local Host unavailable`、禁用的 Agent 输入提交和真实空看板仍正常；浏览器与 Vite 已关闭。 |
| `pnpm smoke:desktop` | 构建后 Electron utilityProcess 是 Node 24.21.0、modules ABI 149、Electron 44.4.3、darwin/arm64；原生 driver 加载、SQLite 3.53.4、WAL、schema 2、Storage ready；无效 DB 时 UI 显示 Host degraded/Storage unavailable；原 Host 崩溃回归和退出清理通过。 |
| `pnpm lint`、`pnpm typecheck`、`pnpm build`、`git diff --check` | 通过，正式源码保持 strict；Web/Host/Desktop 产物成功构建。 |
| `pnpm licenses list --json` | 当前 macOS arm64 已安装依赖树 191 项已写入 `docs/dependency-licenses.json`。 |

实现中首次 `pnpm build` 因新包缺少声明输出而失败，补齐 `declaration` 后通过。增加迁移失败写入闸门后，首次单包测试发现 health 把未来 schema 误归为迁移失败；先检查实际 schema 版本再判断迁移状态，复测通过。以上失败均未当成验收通过记录。

### 验收范围与未验证

- T086：仅以内部元数据验证事务中途进程退出无半提交；任务/审批/事件的业务原子性尚未实现。T087：真实 WAL backup API 与恢复读取已通过。T088：v2 失败不标成功、旧数据保留已通过。T089：真实锁超时与 SQLite_FULL 错误映射通过；没有模拟整机磁盘满。T090：Persistence API 不返回 driver；插件 namespace 仍需后续插件阶段。
- 当前 `pnpm build` 后的 Node Host 与 Electron utilityProcess Host 都能加载原生文件；尚未创建 `.asar` 或安装包，原生文件随包分发、签名、公证、Windows x64、macOS Intel 均未验证，不能宣称跨平台原生兼容性完成。
- `forge_spec_v1.0/contracts/schema.sql` 的业务 DDL 未应用；当前正式库只有两个内部表。没有 Task、Agent、Workflow 或 Project Memory 数据。

### 下一项满足依赖的任务

P0-05「Codex SDK 兼容探测」依赖 P0-04；只报告依赖关系，本轮不开始。

## P0-03 · Host 入口与进程通信

状态：当前 macOS 27.0 arm64 上实现并实测通过；Windows x64、macOS Intel 与跨平台验收未验证。日期：2026-09-23。版本仍为 `0.0.1`；本轮没有提交、推送或发布。

### 已实现

- `apps/host` 可作为独立 Node 进程运行；每次生成真实 hostId/PID/startedAt，并有显式状态迁移、结构化生命周期日志、SIGINT/SIGTERM/断连与致命错误收尾。Host 不导入 Electron 或 Vue。
- `packages/contracts` 增加 `forge-host-protocol/v1` 的严格 Zod 请求/响应契约；`packages/core/commands` 只注册 `system.health`、`system.info`、`system.ping`，拒绝未知命令和非法输入，按 commandId 缓存本进程只读响应。
- Desktop Main 使用 `utilityProcess` 私有消息通道启动自己拥有的 Host。经过 ready、产品/Host/协议版本握手及真实 health probe 后才宣告 connected；周期探测、异常退出、超时、失配与无效响应有区分。退出时先优雅关闭，超时仅对持有句柄、PID、hostId、ownership token 的子进程做有限清理。
- `packages/client` 提供 ForgeClient、LocalTransport 和 Web 的 UnavailableTransport。Renderer 只能经固定 Preload bridge → 来源校验的 Main → Host；普通 Web 不会接触 Node/Electron。本轮 UI 只新增真实 Host 状态与诊断弹层，Agent 输入仍不可提交，看板仍为空。
- ADR 0002 记录进程模型、本地通道及规格冲突。参考业务 command-envelope Schema 保持不变；本轮系统协议不冒充业务协议。

### 本轮命令与结果

| 命令 | 本机结果 |
| --- | --- |
| `git status --short --branch`、实际代码/规格/ADR 检查 | 从 main `0ae07ef` 及未提交的 P0-02 工作区继续；参考包未修改；未提交/推送。 |
| P0-03 编辑前 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop` | 现有 P0-02 基线全部通过；原测试共 10 项。 |
| `pnpm add zod@4.6.4 --filter @forge/contracts --save-exact`、`pnpm install --frozen-lockfile` | 8 个 workspace 项目，锁文件和现有供应链策略通过。 |
| `pnpm dev:host` → Ctrl+C → `ps -p 53597` | 独立 Host 生成真实 hostId/PID、输出 ready/stopping；Ctrl+C 后该 PID 不存在。 |
| `pnpm dev:desktop` → Ctrl+C → `ps -p 53818`、`lsof -iTCP:5173` | Vite、Electron、utility Host 真实启动并握手；Ctrl+C 后本次 Host PID 与 5173 监听均不存在。 |
| `pnpm dev:web` + Playwright CLI 浏览器打开/快照/诊断弹层 | 普通浏览器显示 Forge 与 `Local Host unavailable`；诊断的 Host 字段为缺省、错误为 HOST_UNAVAILABLE，无假在线信息。浏览器及 Vite 已关闭。 |
| `pnpm lint` | 最终通过。首次发现 AppShell computed 缺少 fallback 返回，补齐后复跑通过。 |
| `pnpm typecheck` | strict 契约/Core/Client/Host/Web/Desktop 全部通过。 |
| `pnpm test` | 通过，Node/Vue 各包及工作区共 22 项；包含真实 Node Host 进程握手、命令、关闭与崩溃测试。 |
| `pnpm build` | 通过，Host/Web/Electron Main/Preload 及所需包均构建成功；`pnpm test` 和 smoke 内也执行构建。 |
| `pnpm smoke:desktop` | 真实 macOS Electron 两次启动：握手成功、真实健康/版本/PID/ID、Renderer ForgeClient 刷新、重载后仍为同一 Host、未知命令/伪造字段拒绝；退出后 Host PID 消失；第二次 SIGKILL 指定 Host 后 UI 转 `Host crashed`、旧 health/info 清空、返回 HOST_EXITED。截图已查看。 |

### 规格边界与未验证

- T095 未知命令已覆盖。T091 的完整 actor/project scope、T092 持久幂等、T093 写命令 CAS、T094 事件游标都依赖后续业务/远端模块，本轮没有假装通过。系统命令调用上下文由 Host 通道注入，当前 commandId 去重仅在 Host 本次进程内。
- 任务清单 P0-03 的“项目读取”与本轮明确禁止项目业务存在范围差异；参考 `command-envelope.schema.json` 与本轮系统 envelope 字段也不同，见 ADR 0002。没有修改只读基线或引入项目假数据。
- Windows x64、macOS Intel、打包/签名、长期运行、云端 CI 均未实测。主机崩溃后没有自动重启；Web 没有 RemoteTransport；无数据库/凭据/模型调用。

### 下一项满足依赖的任务

P0-04「数据库与原生模块风险测试」依赖 P0-03。这里只报告依赖关系，不开始实施；其中 Windows 读写/ABI 验收仍需 Windows 实机。

## P0-02 · Desktop 壳与 Shared Web 入口

状态：应用壳已实现，当前 macOS arm64 实机启动验证通过。日期：2026-09-23。版本号仍为 `0.0.1`，本轮未提交、推送或发布。

### 已实现

- `apps/web` 是普通浏览器与 Electron Renderer 共用的唯一 Vue 3 App；`packages/ui` 提供从 glass 设计提取的正式 CSS tokens。首页、项目、看板和外观入口均为明确的空状态；输入只保留于页面内存。
- `apps/desktop` 提供 Electron Main 和 Preload。Main 管理原生窗口、单实例、固定加载来源以及新窗口/导航/权限拒绝；Preload 只暴露冻结的 `{ platform }`。Renderer 以 capability 判断 Desktop/Web，不能直接访问 Node 或通用 IPC。
- Web/Desktop 分别可用 `pnpm dev:web` / `pnpm dev:desktop` 启动，`pnpm start:desktop` 加载构建后的共享 Web 产物。使用原生标题栏、1440×900 默认窗口和 1280×800 最小窗口。
- 银白与浅蓝灰雾面层、浅色 68px 导航栏、圆角阅读面、深色胶囊按钮、柔和环境光，以及减少动效/减少透明度入口已进入正式 Vue/CSS。参考 HTML 与截图未参与构建。
- 加入 Vue 挂载测试、Web 缺少 Electron API 的测试、token 基线测试、编译后 Preload allowlist 测试和真实 Electron smoke test；更新直接依赖锁定、许可证清单及架构决策记录。

### 本轮命令与结果

| 命令 | 本机结果 |
| --- | --- |
| `git status --short --branch`、资料与 P0-01 文件检查 | 从 main 的 P0-01 已推送基线开始，原工作区干净；两份规格资料保持只读。 |
| `pnpm install`、`pnpm install --frozen-lockfile` | 5 个 workspace 项目安装通过；最终冻结 lockfile 与供应链策略均通过。 |
| `pnpm dev:web` + Playwright 浏览器打开/快照/截图 | 普通 Web 入口加载 `Forge · 工作台`，显示 Web 与 Host 未连接；设置入口和“减少透明度”开关在浏览器内可操作。无应用运行错误；最初仅有缺失 favicon 的 404，已添加图标并复测。 |
| `pnpm dev:desktop` | Vite 与 Electron 在 macOS arm64 启动；进程检查显示 sandboxed Renderer；退出后无 Forge 子进程残留。 |
| `pnpm smoke:desktop` | Electron 44.4.3 真实窗口加载构建后的 Vue 页面；Forge 标识、禁用的草稿按钮、只读 bridge、安全 WebPreferences 及 Renderer 重载后恢复均通过；实际截图已人工查看。 |
| `ELECTRON_RUN_AS_NODE=1 pnpm --filter @forge/desktop exec electron -p ...` | Electron 44.4.3 内置 Node 24.21.0、modules ABI 149、N-API 10、Chromium 152.0.7977.130。 |
| `pnpm licenses list --json` | 生成当前 macOS arm64 已安装依赖的 186 项许可证清单。 |
| `pnpm lint` | 通过，正式 Vue/TS/Node 源码纳入检查。 |
| `pnpm typecheck` | 通过，strict Web、Electron Main/Preload 与契约检查。 |
| `pnpm test` | 通过，构建后 10 项测试通过（UI tokens 2、Vue App 3、Desktop 安全 2、工作区/版本 3）。 |
| `pnpm build` | 通过，Web Vite 产物与 Electron Main/Preload 构建成功。 |

安装时发现 Electron 44.4.4 发布时间未满足当前 pnpm 供应链最短等待期。移除 pnpm 自动产生的例外配置，改锁已过等待期的 44.4.3，重新生成锁文件后冻结安装通过。44.4.3 二进制首次下载出现一次 `fetch failed`，原命令重试后成功；未更改全局环境或绕过策略。

### 验收边界与未验证

- T001：没有业务 IPC，静态测试和真实 smoke 均确认仅有只读 `platform`；后续 IPC channel/schema 的未授权调用测试仍待 P0-03。T003：Renderer 重新加载后保持页面和 bridge 的 smoke 断言已加入。T002 单实例逻辑已实现，第二实例自动化尚未执行；T004 平台快捷键、T005 Windows/DPI 布局仍待后续实机验证。
- 当前仅验证 macOS 27.0 arm64。Windows x64、macOS Intel、签名/打包、完整键盘导航、长时间运行和 CI 云端执行未验证。
- 独立 Host、LocalTransport、Agent/模型、Task Contract、业务看板、数据库及工作流均未实现；没有伪造任务或执行结果。

### 下一项满足依赖的任务

P0-03「Host 入口与进程通信」依赖 P0-02。本轮只记录依赖关系，不开始实施。

## P0-01 · 仓库、工作区与版本锁定

状态：工程基线已实现并经本机检查；T001–T005 等待后续 Desktop/Host。日期：2026-09-23。

### 已实现

- 建立 pnpm workspace、根脚本、strict TypeScript 基线与 `@forge/contracts` 公开构建入口；根依赖使用 `workspace:*`。
- 公开 Schema 名称表与只读规格目录中的 JSON Schema 文件名同步，并用 Node 测试验证。
- 固定直接工具依赖、生成 `pnpm-lock.yaml`、`versions.lock.json` 与本机依赖许可证清单；`pnpm-workspace.yaml` 禁用依赖安装脚本。
- 配置 ESLint 与 CI，CI 依次执行冻结安装、lint、typecheck、test、build。两个参考包不会参与生产 lint/build，未来 `apps/`、`packages/`、`plugins/` 正式源码会被 lint。
- 根 AGENTS、README、gitignore 明确工程/新版视觉资料的优先级和未实现范围。

### 本轮命令与结果

| 命令 | 本机结果 |
| --- | --- |
| `pwd`、`rg --files`、`git status --short --branch`、`ls -la`、`find` | 仅两份未跟踪资料包；main 无提交、无应用代码、无根配置。 |
| `node --version`、`pnpm --version`、`corepack --version` | 22.22.0 / 12.3.4 / 0.34.7。 |
| `pnpm view`（四项直接工具依赖和 pnpm） | 精确版本、许可证、Node/peer 范围已记录。 |
| `pnpm install --lockfile-only` | 通过，生成锁文件。 |
| `pnpm install --frozen-lockfile` | 通过，2 个工作区项目、96 个依赖包进入本地 store/安装图。 |
| `pnpm lint`（首次） | 失败：测试缺少 Node URL 导入；已修正。 |
| `pnpm typecheck` | 通过。 |
| `pnpm lint`（修正后） | 通过。 |
| `pnpm test` | 通过：构建后 3 项测试通过，覆盖规格文件名、公开入口与精确版本、许可证清单。 |
| `pnpm config get ignoreScripts/engineStrict/saveExact` | 全部为 `true`。 |
| `pnpm licenses list --json` | 通过：生成已安装依赖的 96 项许可证清单。 |
| `pnpm build` | 通过，生成 `@forge/contracts` 的 JS 与声明文件。 |

初次尝试把 pnpm 配置写在 `.npmrc`；核对 pnpm 12 官方设置文档后已迁至 `pnpm-workspace.yaml`，并通过 `pnpm config get` 与再次冻结安装确认生效。最终五项检查均在该配置下重新通过。

### 验收与未验证

- T001 未授权 IPC、T002 第二实例、T003 Renderer 重载、T004 跨平台快捷键、T005 布局/DPI：均依赖 P0-02 及后续 Host/UI，**尚未执行**。本轮测试不能替代它们。
- 新目录按 README 的冻结安装方式已在当前 macOS arm64 目录验证；全新 checkout、CI 云端执行和 Windows/macOS Intel 未验证。
- Electron、Vue/Vite、SQLite/Drizzle、执行器 SDK、安装包、签名及用户凭据均未接入或验证。
- `forge_spec_v1.0/planning/tasks.json` 与参考测试报告保持原状；视觉原型只读查看，没有作为生产入口运行。

### 下一项满足依赖的任务

P0-02「桌面壳与共享 Web 入口」依赖 P0-01。后续需先按官方资料冻结 Electron/Vue/Vite 版本，再实现安全 Main/Preload 与共享 Vue 入口，并执行 T001–T005 的可行部分。本轮不自动进入 P0-02。
# P7-05 Command HTTP 适配 · 开发中 · 2026-09-25

可选回环网关已通过真实 HTTP→Python Host CommandBus→SQLite 链路提供按当前设备 Project 白名单过滤的项目列表、看板及 Task 详情读取；测试创建真实批准的 TODO Task，再从 HTTP 读取合同。无 Project ID 的 Task URL 只在已授权项目中查找；本地路径、来源原文与本机专属 allowedCommands 不回传。权威 `/v1/commands` 写 envelope 的字段、版本、CSRF、会话、项目范围、客户端 actor/scopes 拒绝和方法白名单已接入，写请求保持 64 KiB 入站上限。当前没有设备操作 grant，所有计划写入均明确 `REMOTE_WRITE_SCOPE_UNAVAILABLE` 403；未知或本机专属方法 403。撤销后同一 cookie 的读写立即失效。定向 HTTP 测试和 Ruff/mypy 通过，未调用模型。

**状态仍为 IN_PROGRESS。** 权威写命令与现有 Host 本地方法/payload 不同，尚未建立可授权的映射、幂等/CAS 真实写入；T091～T093 的完整双路径未通过，T094 SSE 游标归 P7-06，T095 未知命令拒绝已有真实回环证据。静态测试对照权威 `planning/commands.json` 的远端写白名单。参考 OpenAPI TaskSummary 缺少生产 `blocked` 状态，当前遇到该状态返回 409，不能伪造看板；详见 [ADR 0079](decisions/0079-remote-command-adapter-and-write-gate.md)。全量 `pnpm py:check` 为 191 pytest 通过、Ruff/mypy 通过；`pnpm validate:contracts` 0 error/4 既有 warning、`pnpm validate:task-map` 74 deferred、`pnpm lint`/`typecheck`/`test`/`build`/`smoke:desktop`/`git diff --check` 通过。Task 详情补充后的定向 pytest/Ruff/mypy 通过；P7-06 尚不因本记录开始。当前安装版正常启动不会打开 HTTP listener，新补充的 Task 详情属于安装包之后的源码变化。P6 正式发布与 Claude 阻塞不变。
Task 详情增量的最新回归：`pnpm py:check` 192/192 pytest、Ruff、严格 mypy 通过；`pnpm validate:contracts` 0 error/4 既有 warning，`pnpm validate:task-map` 通过，`git diff --check` 通过。上一段的 191 是增加本测试前的历史结果。

P7-05 出现权威公开写命令与 Python Host 必填字段不一致、以及 P7-07 才定义设备操作授权的任务顺序冲突。已在 ADR 0079 列出两条保守实施路径并向用户请求范围决定；在回复前不开放写命令、不改权威任务图、P7-05 保持 IN_PROGRESS，P7-06 不启动。独立的当前安装版 Demo/PDF 本地验证继续进行。

# 2026-09-25 · 可录屏 Current Demo 与安装包签名复核

**这是内部演示交付，不改变 P6 正式发布状态。**原始已验收 DMG 保留原 SHA；发现旧安装版运行后，包内 CPython 动态导入生成 5 个签名外 `.pyc`，导致再次 `codesign --verify --deep --strict` 失败。构建入口现在先执行当前源码 build，packaged Host 明确设置 `PYTHONDONTWRITEBYTECODE=1`。另行生成不覆盖旧包的 `0.0.1 INTERNAL / ADHOC / UNNOTARIZED` Demo DMG（SHA-256 `91595c5cbf5278ecc68227a3eb5a92ded84d26408b227d28371832e6de283eb6`），从 DMG 安装至 `/Users/iamzjt/Applications/Forge INTERNAL Current.app`。新包的启动、包内 Python Host/schema32、退出后签名复核通过，且安装版 Plugins 真正停用/启用三次重开测试通过；Workflow 真实加载 3 个模板、Knowledge 页面读取备份 Project 数据。原旧安装目录与数据库均未删除/迁移。

新包通过真实付费许可范围内的单 Codex 安装版闭环：独立 Git fixture 的真实消息/草稿/审批/TODO、显式 Start、隔离 Diff/CodeSnapshot、Verify exit 0、Review approved、逐项验收与人工接受、Done 无自动合并、单独取消和重启读取均有证据。历史记录保留于 `/Users/iamzjt/Documents/Forge Demo Current/recorded-acceptance/isolated-app-data`（schema32、1 Project、2 Task、2 Run、1 Delivery），源 fixture clean，未清理。`pnpm demo:open` 与独立 `.command` 可常驻打开相同安装版及数据，不从开发 `.venv` 启动。独立安装版 QA 又以真实旧 Demo 仓库完成文件夹信任、只读导入、来源定位、关键词检索、记忆确认→检索→撤销→0 条，源 Git 未变；Workflow 页面读取 3 个 Host 模板。见 [内部 Demo 操作与证据](demo/p6-internal-macos-package.md)。当前包没有手机远程控制、公网监听、Developer ID/公证；Windows/Intel/Claude 和正式升级仍未验收。新安装版在同一持久项目的 Workflow 配置→发布→新 Run 与知识来源→实际 Run Context 交互仍需补验，PDF 对应表保持准确标签。

安装版 Workflow 的后续独立 UI 验证在该历史数据库的临时备份中完成：通过 Agents 页面保存真实 Developer/Reviewer Profile，绑定 quick 模板节点、修改步骤、Host 预检、保存草稿、发布 v1，并从 Host 回读发布定义；画布与发布截图见演示指南。首次尝试因未保存 Profile 被 Host 正确阻止发布；补齐真实 Profile 后通过。没有自动启动 Run，也没有把这个单独的版本发布测试算成“安装版新 Run 已引用此版本”。`.command` 重复启动识别现存进程，原持久数据库不受上述临时测试影响。

另一次与持久 Demo 隔离的**同一 DMG 自定义 quick 新 Run**已经真实执行：Codex 成功修改独立 Worktree 的 `math.js`/`test.js`，Run `f1f01724-c01d-42e7-8edd-6fea51cfe679` 为 `succeeded`，生成快照 `6394ffad-9dff-47c8-b2a4-d5a7bce8fc18`；运行前通过已发布 quick `workflow.fixture.quick@1` 的启动检查，运行中从 SQLite 冻结快照和 Host `run.config` 验证实际 Workflow/Profile/哈希/节点一致。测试脚本末尾曾把“仅开发完成”的任务误断言为 Done，实际 Active 正确，故本次完整命令 **exit 1**；已修正该断言，但不重复消耗相同付费模型场景。此次自定义流程的重启读取子项仍未通过，不能把先前默认流程的重启证据转移过来。
