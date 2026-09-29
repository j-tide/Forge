# Forge 版本与兼容性记录

## 2026-09-29 · 0.1.0-preview.5 发布构建

macOS arm64 · INTERNAL / ADHOC / UNNOTARIZED。Desktop package／npm lock／`versions.lock.json.desktopPreview` 同步 `.5`，根 Python／pnpm 版本保持0.0.1，依赖不变。Desktop 5762＋Node10测试、lint／typecheck／build／i18n与实际两主题／语言重启通过；原 Forge pnpm／Python独立检查通过。最终DMG只读挂载的 `.5` 包有资源／原生模块／偏好重启／签名一致性验证，用户文件摘要未变，应用与挂载已关闭。

ASAR `b699edafc7257596098af48977e8bd5b4d761709721376fe31b86bf1d9c62f1b`。下载资产、准确检查与边界见 [preview.5](../desktop/docs/releases/0.1.0-preview.5.md)。生产依赖33风险（10 high／9 moderate／14 low）和774 lint warnings／5 infos保留；Python Host、Agent项目MCP路径、完整在线业务、Claude、其它平台、正式签名／公证仍未验或未接通。历史版本记录保留，不移用验收。


## 2026-09-28 · 0.1.0-preview.4 当前发布构建

`forge-0.1.0-preview.4-9864843c064e` / macOS arm64 / INTERNAL / ADHOC / UNNOTARIZED。独立 Desktop 版本及 npm lock 同步 `.4`，根 Python / pnpm 版本保持；`versions.lock.json.desktopPreview` 明确独立工作区。依赖版本不变：Electron 40.0.0、React 19.2.4、TypeScript 5.9.3、Vite 7.3.1、electron-vite 5.0.0、motion 12.36.0；无新增依赖或 install script。

本次 `.4` Desktop 5057 tests、lint / typecheck / build / i18n、双主题全页面、语言重启、Portal / 实际滚轮 / 文件引用通过。根 frozen install / contracts / task-map / lint / typecheck / test（含 build）/ Python Host Desktop smoke、Python Ruff / mypy / 286 passed / 1 skipped 通过。DMG 和 ZIP 完整性通过，实际 DMG 挂载 `.app` 的版本 / 编译资源 / 图标 / 许可证 / 来源一致，启动后签名验证通过；用户设置 / 项目 / API Profile 摘要未变。完整结果及摘要见 [preview.4](../desktop/docs/releases/0.1.0-preview.4.md) 和 [实施状态](implementation-status.md)。

本次模型调用 0。生产 npm audit 仍 33 项（10 high / 9 moderate / 14 low），797 条既有 lint warnings / 5 infos 保留，未声明已修复。Python Host 接入此衍生 Desktop、完整任务 / Planner / Review / Verify / Owner 业务、Claude、Windows x64、macOS Intel、各平台 DPI / 辅助技术、Developer ID、公证、正式更新仍 UNVERIFIED / BLOCKED。内部预览发布不改变正式产品门禁，手机与远程继续后置。旧版本记录和旧包摘要保留在下方。

## 2026-09-28 · 本地 UI / UX 修订与包内一致性

当前 `desktop/` 本地未发布构建 `forge-ui-ux-20260928-70c0c93c2593`，`0.1.0-preview.3`，macOS arm64，**UNRELEASED / INTERNAL / ADHOC / UNNOTARIZED**。Electron 40.0.0、React 19.2.4、TypeScript 5.9.3、Vite 7.3.1、electron-vite 5.0.0、motion 12.36.0 与现有锁保持；无新增依赖、原生模块、SQL migration、凭据路径或网络监听。亮 / 暗玻璃外壳与可读表面共用布局，系统 / 用户减少动效和透明度保留。

独立 npm lint / typecheck / test / build / i18n 通过：283 Vitest 文件 / 5057 tests；36 namespaces / 5224 strings 无 i18n 错误。lint 仍有 797 条既有 warnings 和 5 infos，不声称零警告。真实 Electron 双主题全页面 QA 60 条记录 / 70 张截图；项目设置只保存项目偏好，重启恢复、Portal 弹层、键盘与文件补全真实读回通过。无认证账户时不会显示假的无限额度；无密钥 UI fixture 不证明 provider 可用。

[本地 .app](../desktop/apps/desktop/dist/ui-redesign-unreleased/mac-arm64/Forge.app) 的 `app.asar` SHA-256：`70c0c93c2593b16fd6cad1d6e2f113f831ca4897744a59f1e1e463728423fe13`。8 份编译资源、4 份原生图标及 LICENSE / UPSTREAM 逐字节与构建核对，真实 packaged 启动及随后 ad-hoc deep / strict 签名验证通过。只读安装态检查前后现有设置、项目与 API Profile 摘要一致，没有关闭正在使用的旧 Forge。普通打开须先正常退出旧应用；发布的旧 DMG / ZIP 没有被覆盖。验证结论及原始证据位置见 [实施状态](implementation-status.md)。

该验证限于界面和受影响本地服务，不新增 Forge Python Host 集成、真实在线执行器或完整任务交付证据。本轮在线模型调用 0。Windows x64、macOS Intel、系统 DPI / 辅助技术、Claude、Developer ID、公证、正式更新、衍生版 Python Core 集成及完整安装业务验收仍 **UNVERIFIED / BLOCKED**，沿用原记录。33 项继承生产依赖 audit 风险未宣称关闭；手机 / 远程后置，未放宽写入或权限安全。未提交、推送或发布。

## 2026-09-28 · Forge 仓库源码归拢 / 0.1.0-preview.3

用户明确授权按功能提交、推送到 `j-tide/Forge` 并发布预览。衍生 Desktop 完整源码与历史归入 `desktop/`，原 Python Host、规格、Vue 历史实现及 SQLite 用户数据原位保留；许可/来源和独立 npm 边界见 ADR 0087。当前预览仍未连接 Forge Python Host，不是完整产品验收。普通打开使用根 `pnpm desktop:open`，开发入口位于 `desktop/`；详细变更、当前截图、检查结果及未验项见 [0.1.0-preview.3](../desktop/docs/releases/0.1.0-preview.3.md)。

本轮追加 `pnpm py:check`：Ruff/mypy 通过，286 passed / 1 opt-in skipped。最终归拢构建的 DMG/ZIP 及安装态启动通过，摘要见当前预览 build-info。本轮安装依赖不变。衍生 npm i18n/lint/typecheck/test/build、亮暗 Logo 和语言重启 QA、真实 .app smoke、ad-hoc 签名通过；原 pnpm frozen install/contracts/lint/typecheck/test（含 build）与真实 Python Host Desktop smoke 通过。现有用户数据哈希保持不变，没有模型调用。app.asar SHA-256 `9ef7f2c49c3d21a330d42760a56f58409f133fafb2944e3bb43241d0bb007b53`。生产依赖 audit 仍 33 项（10 high/9 moderate/14 low），未消除。Windows/Intel、Claude、签名/公证、正式更新与衍生 Python 集成保持未验。手机远程后置。提交时间沿用用户指定随机 1～3 天排期；实际开发与验证为 2026-09-28，二者明确区分。


### 发布前远程 CI 平台修正 · 2026-09-28

`0.1.0-preview.3` 对应提交 `5ad0585b` 的衍生 `desktop-quality` 在 GitHub Linux runner 上通过。原 Forge `quality` 首次在继承的 Ubuntu runner 上失败（13 failed / 273 passed / 1 skipped）：生产插件 manifest 只声明 `darwin-arm64`，Linux 被 `PLUGIN_PLATFORM_UNSUPPORTED` 正确拒绝，导致下游 Registry/Host 断言无法进入目标路径。

仅将原 quality gate 的 runner 调整为 GitHub 标准 `macos-14` arm64，并增加实际平台断言；所有 Python、契约、task-map、lint、typecheck、test、build gate 保留。不扩大 manifest 平台、修改权限、跳过断言或宣称 Linux/Windows/Intel 生产支持。衍生桌面独立 Linux CI 保持。Runner 依据 [GitHub 官方文档](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)，公开仓库标准 runner 不新增付费服务。

这是发布包切出后的 CI/记录提交，`desktop/` 源码和安装包字节不变。已推送的 `v0.1.0-preview.3` 标签保留 `5ad0585b`，不重写标签或历史；公开 Release/对应 source archive 保持同一构建来源，主分支另包含这项 CI 修正。远程通过结果以实际 Actions 为准，不把首次 Linux 失败改写为通过。

原 `quality` 调整到 macOS arm64 后，Ruff/mypy 与 Python 286 passed / 1 skipped 真正通过；随后干净检出暴露 `validate:contracts` 漏构建 `@forge/core`，Persistence 的公开类型无法解析。本轮仅补上已有 Core 包的构建前置，不扩张 Node 业务 Runtime、改契约或降低 strict。`pnpm install --frozen-lockfile` 与修正后的 `pnpm validate:contracts` 本地通过（47 files / 0 errors / 4 既有 warnings）；远程干净检出完整回归继续执行。桌面目录、安装包、发布标签和 source archive 保持原字节；主分支包含 CI 与工程入口的补充修复。

## 2026-09-28 · Forge original logo and native icon resources

Original Forge mark/app-tile generated with built-in imagegen. Canonical PNGs, exact prompts and source hashes reside in the sibling desktop `resources/branding/`; existing Pillow12.1.1/macOS iconutil convert platform formats only. No added dependency, model execution or credential change. The mark uses one alpha silhouette in both themes; native assets cover macOS ICNS, Windows ICO, Linux PNG sizes, existing web app icons and original Forge template trays.

macOS arm64: converter verifies14PNG outputs plus ICO sizes/content and ICNS content; 248 files/4763 Vitest +10 Node tests, i18n, lint (825 pre-existing warnings/5infos), typecheck/build pass. Real Electron validates two themes, expanded/collapsed navigation, welcome, About, settings-rerun onboarding and favicon loading. The new unpublished bundle `dist/logo-unreleased/mac-arm64/Forge.app` (`forge-logo-20260928-f3383f498f87`, ASAR `f3383f498f87f4c96ae7f3a0376b45496bdd4a6d6e4b19d1695918a21c13bba5`) launches, matches8 compiled JS/CSS/PNG files and4 native resources, decodes its256px native icon, and passes ad-hoc signature verification after exit. Existing settings/projects/profile file hashes/existence unchanged. This verifies assets/startup, not notification delivery or full business runtime.

Original Vue/Desktop code receives the same asset bytes; targeted UI7/Web224/Desktop17 tests, typechecks, relevant ESLint and builds pass. Its old installed Python packages are preserved, not rebuilt; packaging configuration now embeds Forge.icns for the next build. The original Windows hand-built ZIP's PE executable icon and all Windows/Intel runtime display remain UNVERIFIED. No claims of signed/notarized release, second-executor acceptance or completed derivative Python Host integration. Historical artifacts, AGPL notices, dependency audit findings, formal gates and paused mobile/remote state remain intact.

## 2026-09-28 · Unreleased Forge display-name and namespace change

The independent sibling Desktop now displays **Forge** while retaining `dev.iamzjt.forgeglasspreview` and the stable, separate `Forge Glass Preview` user-data directory. The npm package/workspace names and built-in MCP namespace changed consistently, with explicit aliases for saved configuration IDs. API profiles use `userData/forge/profiles.json`; only a missing new file allows reading the legacy path within this same isolated userData. Real filesystem tests verify profile preservation, no old-file deletion, and private 0600 permissions. Existing Graphiti database namespaces, OAuth parameters, legacy project-data exclusions and historical process-name protections remain compatibility/safety details, not promotional branding.

Build `forge-branding-20260928-c067d26d1f35` (`app.asar` SHA-256 `c067d26d1f35551948fb09b5d0cf412547c55c10fa234f20e1796cf5fc8509a4`) is **UNRELEASED / INTERNAL / ADHOC / UNNOTARIZED**, based on 0.1.0-preview.2. Real macOS arm64 Electron language/theme/restart QA and packaged startup passed; all six major compiled files match source build outputs byte-for-byte. Packaged LICENSE/UPSTREAM match sources and the ad-hoc bundle signature remains valid after startup. Existing settings, projects and both possible API-profile file states/hashes were unchanged. No provider calls, new dependencies, global environment changes, commit, push, or release were performed.

This is branding/localization/data-compatibility verification, not a new Forge Python Host integration or business workflow acceptance. The previously published assets remain unchanged. Existing Windows/Intel, Developer ID/notarization, Claude, formal updates, inherited dependency audit findings and original Forge release gates retain their previous UNVERIFIED/BLOCKED status. Mobile and remote additions remain paused.


## 2026-09-28 · 衍生预览 0.1.0-preview.2 汉化与语言持久化

独立Forge-Aperant的私有prerelease已上传DMG、ZIP、源码和校验表，4资产远端digest/大小与本地一致，main/tag=`1798ba81d9957cdd714c3d3d850bb072da7d3e81`。Node工具24.19.0、npm10.8.2、Electron40.0.0、React19.2.4、i18next25.8.18；没有新增依赖或改变原Forge版本锁。新profile默认zh-CN；旧en/fr偏好保留；设置立即保存仅language字段；原生菜单／通知按保存设置切换，中文不启用英文词典。没有改模型、认证、权限、SQLite或Task语义。

macOS arm64：36 namespaces/5167文本、4032静态引用校验0错误0警告，251动态key另由组件／运行检查覆盖，不宣称静态通过；typecheck、lint（825warning/5info）、4735 Vitest+6 mutation、build及双主题真实切换／重启均通过。最终包isPackaged=true/version正确、6主要编译文件与ASAR一致、启动后codesign deep/strict、hdiutil verify、ZIP校验通过。包内许可证／UPSTREAM与源文件一致。已有安装profile的en未被自动改为中文；该安装启动与独立QA中文截图的证据分开记录。

本版为ADHOC/UNNOTARIZED内部预览。未验证Windows/Intel、正式签名、公证、更新、Python Host连接与完整Agent运行；不能沿用原Forge验收。在线production npm audit仍33项（10 high/9 moderate/14 low）。离线npm ci的0 vulnerabilities输出不视作安全审计结果。完整证据见衍生仓库docs/releases/0.1.0-preview.2.md；P0～P6外部未验项与Claude阻塞保留，手机／远程不恢复。

## 2026-09-27 · 独立 Aperant 衍生桌面预览（与原 Forge 构建分开）

经 [ADR 0087](decisions/0087-aperant-derived-desktop-base.md) 批准，独立私有仓库 `j-tide/Forge-Aperant` 基于 Aperant `v2.8.0-beta.6` / `cba7a0270ec794a14ac71615bc6c48085807ede6`。该预览使用上游 Electron 40.0.0、React 19.2.4 与 npm workspace；构建在本机 Node 24.19.0 上完成，不能把原 Forge 的 Vue/pnpm/Python Host 检查结果算到此版本。应用 ID `dev.iamzjt.forgeglasspreview`，项目目录 `.forge-glass-preview/`，与原 Aperant 和 Forge 数据隔离；当前尚未接入 Forge Python Host、SQLite 项目/任务/审批/Run，亦未做在线 Agent 业务验收。

本机 macOS arm64 上，`npm ci --ignore-scripts --offline`、`npm run lint`（exit 0，有 827 条继承的 warning）、Desktop typecheck、`npm run test`（219 文件 / 4632 测试）、`npm run build`、真实 Electron 亮暗主题空项目启动及最新打包 `.app` 启动均通过。`electron-builder --mac dir --publish never --config.mac.identity=-` 在关闭证书自动发现后生成 ad-hoc `.app`；原生 `ditto` ZIP 校验、`hdiutil` DMG 校验及 `codesign --verify --deep --strict` 通过。常规 `npm run package:mac` 在本机下载 DMG helper 时中断，不记为通过。内部 DMG SHA-256 为 `c72b6ad3d2c2b45ab7cebd9916a675abac03330c756b1b15c4a6973f15047f14`，**INTERNAL / ADHOC / UNNOTARIZED**。在线 `npm audit --omit=dev` 仍报告 33 项生产依赖风险（10 high、9 moderate、14 low），公开发布前须处置。Windows x64、macOS Intel、开发者签名、公证、完整任务链、与 Python Host 集成及原 Forge 数据迁移均 **UNVERIFIED**。

## 2026-09-27 · Current video-glass polish / internal macOS arm64 build

The approved [ADR 0086](decisions/0086-video-glass-visual-with-current-desktop-ia.md) sets the current silver and pale-blue frosted visual and restrained motion direction; [ADR 0085](decisions/0085-aperant-reference-desktop-redesign.md) remains the interaction and information architecture reference. This source revision changes `@forge/ui` light/dark shell and panel tokens, ambient gradients and the independently authored Forge rail mark; it narrows the true empty-board hero, orders the real conversation before the New Task composer, and reduces duplicated Workflow/Role/Plugin UI. Existing light/dark, reduced transparency/motion, and compact Desktop structure remain. There is no new dependency, native module, SQLite schema, local protocol, network listener, credential path, model invocation, or Renderer permission.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check` passed for this revision. Real macOS arm64 Electron smoke passed Python Host readiness and crash handling, sandbox/context isolation/Node-disabled Renderer, theme persistence, reduced transparency and motion, and 1040/1600 viewport checks. A separate multi-page Electron visual sweep captured 1440×900 light/dark screens with Host ready, zero page errors, and no horizontal overflow. Current source screenshots are linked from [implementation status](implementation-status.md); static captures do not prove every animation frame or a full business delivery.

The source-aligned internal [Forge 0.0.1 glass-polish DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-glass-polish-20260927.dmg) has SHA-256 `38428e17e8f2a37eda9727f044f6cdac8c63d190edb2eb41773c3e721a124f20` and remains **INTERNAL / ADHOC / UNNOTARIZED**. Installed-package smoke passed with bundled CPython 3.12.13, SQLite schema 38, sandboxed Renderer, and isolated QA data. The unique [installed copy](</Users/iamzjt/Applications/Forge INTERNAL Glass Polish 20260927.app>) passed `codesign --verify --deep --strict` for its ad-hoc signature and launched with ordinary `open -n`, with its bundled Python Host observed; the [installed home capture](../output/playwright/forge-glass-polish-packaged-home-20260927.png) is from the smoke-installed temporary copy of the same DMG. This exact SHA has not rerun an online Codex refinement or full Develop→Review→Verify→Owner chain. Windows x64, macOS Intel, Claude online, Developer ID signing, notarization, signed updates, and full Desktop/P6 release acceptance remain **UNVERIFIED/BLOCKED** as applicable. New P7/P8 mobile and remote development remains paused.

## 2026-09-27 · Historical Aperant 2.x referenced Desktop redesign / prior internal macOS build

[ADR 0085](decisions/0085-aperant-reference-desktop-redesign.md) superseded the earlier glass visual direction at this historical checkpoint; ADR 0086 now governs the visual direction. Forge independently implemented an in-place project picker, one sidebar New Task entry, a five-column Host-backed board, a near-full-screen task detail, and reorganized Workflow/Role/Plugin/Knowledge/Settings pages. Dark was the default in this older build; light/system and reduced-transparency/motion choices existed. Aperant 2.x was an interaction reference, not a bundled dependency, copied AGPL source, or claim about a public 3.0 release. Business state still crosses the fixed Client/Preload/Main JSON-RPC stdio path to the Python Host; `dev:web` has no local Host.

**Checks at that checkpoint** passed after the single-panel draft correction: 24/24 focused App/component tests, 23 project-smoke stages, offline P1 smoke, 1280/1600/zoom checks, `pnpm lint`, `pnpm typecheck`, `pnpm test` (including build), `pnpm py:check` (286 passed, 1 skipped; Ruff/mypy passed), contract validation (47 files, 0 errors, 4 existing reference warnings), task-map validation, and Desktop smoke. An earlier real Electron capture showed nested New Task/DraftSheet drawers; the single-panel flow passed its reruns.

**Then-current internal package**: [macOS arm64 Forge 0.0.1 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-aperant-redesign-20260927.dmg), 328909833 bytes, SHA-256 `55d5c61065c60a19b33293e7f0da28a2f62fdcf52f222b8030f1d81f1982c53b`, **INTERNAL / ADHOC / UNNOTARIZED**. Package smoke passed after updating two obsolete UI assertions, and checked bundled CPython 3.12.13, SQLite schema 38, sandboxed Renderer, and isolated QA data. The copied [QA app](</Users/iamzjt/Applications/Forge INTERNAL Aperant Redesign 20260927.app>) passed `codesign --verify --deep --strict` and launched with ordinary `open -n`; its data root is `~/Library/Application Support/Forge Internal QA/072243e56d709b43/Forge`. Installed screenshots for the board, Workflow, Roles, Plugins, Knowledge, and Projects are linked from [implementation status](implementation-status.md). The signature check verifies this internal ad-hoc bundle; it is not Developer ID signing, notarization, or a public release.

One authenticated installed-app Codex `gpt-6-luna` refinement smoke passed: a nonempty assistant reply and structured draft appeared in the [New Task panel](../output/playwright/aperant-redesign-20260927-generated-draft-1440x900.png), and the isolated Git fixture remained clean. That draft was **not approved**, did not enter TODO, and started no Run. The new package has not rerun a full online Develop→Review→Verify→Owner delivery. Earlier DMG hashes, SDK observations, and completed runs below retain their named-build scope; they do not validate a full delivery or the remaining Desktop/P6, Claude, Windows/Intel, signing/notarization and update gates for this redesign. P7/P8 new development remains deferred.

The records below retain their original build-specific scope.

## 2026-09-27 · Installed Standard Workflow and delivery provenance

The existing internal `desktop-planner-context-20260927` DMG completed one authenticated Codex `gpt-6-sol` standard Plan→automatic Developer→read-only Review→approved local Verify→criterion decisions→human acceptance on macOS arm64, using isolated installed-app data and a disposable clean Git repository. Plan artifact, retrieved source, frozen workflow/profile/preset, CodeSnapshot, delivery and Done survived application restart. The same DMG's strict path produced a valid Plan and human-approved Developer handoff but failed its frozen 200000 observed-token cap; strict end-to-end remains unverified. A newer source-aligned `desktop-standard-provenance-20260927` internal DMG (SHA-256 `e03946ed4f927904511d38b335a74edfe9485fc3d32aa18a61b3391995fcd3a9`) passed installed Host/SQLite/Renderer smoke and read the old immutable Standard delivery from an isolated SQLite online backup with corrected historical wording. It did not make a new online Codex Run or re-materialize the old delivery: SQLite correctly refused deletion even in the QA copy. New-summary Plan provenance is covered by source-level Git/SQLite/Host and contract/UI tests, not a new installed Codex acceptance. No new dependency, native ABI, migration or protocol method. Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update and production upgrade remain unverified or blocked. P7/P8 mobile/remote work remains paused.

## 2026-09-27 · Installed planned-context build and observed budget failure

The current source-aligned macOS arm64 internal DMG is `desktop-planner-context-20260927`, Forge 0.0.1, 328726862 bytes, SHA-256 `6f58d456d87121795e01b848b3a9c743192e7bd3df4c349fa7038936485fdbd9`, **INTERNAL / ADHOC / UNNOTARIZED**. Its installed Electron uses bundled CPython 3.12.13, SQLite 3.50.4/schema37 and the sandboxed Renderer; the external Codex CLI 0.155.1 with the existing authorized login was found on this Mac. The same DMG saved and reread a Planner Profile with explicit project-context permission, published quick/standard/strict via real installed UI, and restarted without losing the profiles/publications. A separate installed-app disposable Git/SQLite run produced one real read-only strict Plan Artifact with a frozen retrieved knowledge source, unchanged source Git, and persistent restart readback. Explicit human Plan approval then started an actual Developer Run with the frozen Plan and knowledge refs. It modified only the isolated worktree and `node test.js` passed, but observed input usage reached 216374 tokens against the UI-selected 200000 cap; Forge marked the Run `failed`/`RUN_TOKEN_BUDGET_EXCEEDED` and created no accepted CodeSnapshot or delivery. This is a tested failure path, not successful strict end-to-end acceptance. The same retained QA database and worktree remain isolated; no frozen budget, model or user database was changed. No new dependency, native module, public network listener, SQLite migration beyond schema37, or Renderer privilege. Current full Python regression: 265 passed, 1 opt-in online skipped; TS tests/build/lint/typecheck and installed-package smoke passed. Windows x64, macOS Intel, Claude online, signed/notarized package/update, standard/strict full online flow and full Desktop/P6 release gate remain UNVERIFIED/BLOCKED. P7/P8 mobile/remote additions remain paused. Entries below describe their respective earlier artifacts.

## 2026-09-27 · Historical source checkpoint before packaging

Current source now permits an explicitly opted-in read-only Planner to receive bounded retrieved project knowledge and validated memory, freezes the actual source refs in Plan and Developer ContextBundles, and rejects revoked/superseded/expired sources before handoff. It also preserves current sources for a new rework attempt. Existing direct-Developer Runs without a historical ContextBundle continue the old rework path; first full Python regression exposed the compatibility edge and the targeted 23-case rework/Owner/Plan rerun passed after repair. Python source mypy/Ruff and relevant Vue/contract tests passed. The last installed `desktop-planner-runtime-20260927` DMG does not contain this extension. It requires a new package and installed-app acceptance; no new Codex model turn, dependency, schema migration, platform claim or network permission is implied.

## 2026-09-27 · Installed Planner runtime / schema 37

Current source-aligned macOS arm64 internal DMG `desktop-planner-runtime-20260927`: Forge 0.0.1, 329963912 bytes, SHA-256 `1b6275423012ef13cac7545d238a23aa19e72e8b8d53eccbb730f3a4ca090793`, **INTERNAL / ADHOC / UNNOTARIZED**. Installed Electron launched bundled CPython 3.12.13 / SQLite 3.50.4 in isolated temporary data and migrated to schema 37. The Python Host kept Planner role/profile revision 2 through a restart; quick, standard and strict template publications passed real installed UI preflight and restart readback. Finder-style external Codex CLI 0.155.1 was authenticated and listed seven models without a new model turn. Source-level authenticated strict Plan ran once in a disposable Git fixture and wrote a validated Artifact, but the current installed package has **no online Plan→Developer→Review→Verify→Owner acceptance**. Offline process/SQLite fixture tests verify these planned handoffs and error paths without claiming Codex execution. No new dependency, native addon, local network listener or Renderer privilege. `pnpm py:check` 260 passed/1 opt-in online skipped plus Ruff/mypy; TS quality, contract validation, Desktop and installed-package smoke passed. Windows x64, macOS Intel, Claude online, signed/notarized installer, signed update and full Desktop/P6 release gate remain UNVERIFIED/BLOCKED. Mobile/remote additions remain paused. Older schema36 paragraphs below are historical package results, not the current artifact.

## 2026-09-27 · Planner source/runtime probe, packaging pending

Current source adds SQLite schema 37 (`plan_artifacts`, `plan_continuations`) and fixed local `run.planGet` / `run.planAct` v5 methods; no new npm/Python dependency, native addon, network listener, arbitrary IPC or Renderer privilege. Migration 36→37 and restart were exercised only on disposable QA databases, not the user's daily SQLite. Authenticated external Codex CLI 0.155.1/app-server on macOS arm64 completed one actual read-only strict Planner turn with a valid hashed Plan artifact and unchanged source Git. Three preceding turns failed with observable budget/structured-output reasons; no artifact was accepted for them. Standard automatic and strict human-gated Plan→Developer paths, plus interrupted standard handoff recovery, passed real Git/SQLite/Host-service tests using an offline fixture Executor; those are not online Developer or installed-app acceptance. The last installed `desktop-board-spacing-20260927` internal DMG still contains schema36 and does not include Planner runtime/schema37. Windows x64, macOS Intel, packaged Planner, full published standard/strict Review/Verify/Owner loop, Claude, Developer ID signing/notarization and signed update remain UNVERIFIED or BLOCKED under their existing gates. Mobile/remote additions stay paused.

## 2026-09-27 · Board top spacing and saved Profile role integrity

Source-aligned internal macOS arm64 DMG `desktop-board-spacing-20260927`: Forge 0.0.1, 327642199 bytes, SHA-256 `802318f79f88bbd82edb36c4c5b551d1e1b4a3360200dc4bbfc0834a21932048`, **INTERNAL / ADHOC / UNNOTARIZED**. Installed package smoke measured the project card within 32px of the content top at 1440×900 and 1600×1000. Host-owned persisted Planner Profile stayed revision 1 and read-only in the actual Electron UI; unsupported role remains non-runnable. Separate Finder-opened QA app runs its bundled CPython 3.12.13/SQLite 3.50.4 schema36, `quick_check=ok`, isolated from existing data. No new dependency, native ABI, SQLite migration, network endpoint, Renderer permission, or paid model call. Windows x64/macOS Intel, Claude online, Planner runtime, signed/notarized distribution and full Desktop/P6 acceptance remain open; P7/P8 new development deferred.


## 2026-09-27 · Standard Planner role and source-aligned installed macOS package

Forge 0.0.1 internal macOS arm64 DMG `desktop-planner-role-20260927`, 330519685 bytes, SHA-256 `32c21e4948ee459e4298dc861156d1fabef2857aeb916f7086a66be8765179c8`, remains **INTERNAL / ADHOC / UNNOTARIZED**. It bundles CPython 3.12.13, SQLite 3.50.4/schema36 and the same Electron 44.4.3/Vue 3.5.43/Vite 8.3.0 stack. No new dependency, install script, schema migration, Host protocol, Renderer permission or network listener. The authoritative standard/strict Plan node uses the development board column but the Planner role; compiler and UI now classify it by `plan-result`. Missing or runtime-unsupported Planner still fails closed before launch. `pnpm py:check` 244 pytest/Ruff/mypy, TS lint/typecheck/test/build and the actual mounted DMG package smoke pass. A separately installed app stays open with its own empty schema36/`quick_check=ok` QA database, and a test install with minimal Finder PATH plus the current authorized HOME found external `codex-cli 0.155.1`, authenticated app-server and 7 model IDs without a model Turn. Package screenshots show the actual Plan role and disabled publish diagnostics. This Mac evidence does not verify Planner execution, signed distribution, Windows x64, macOS Intel, physical reboot recovery, Claude online or the complete Desktop/P6 gates. Mobile/remote new work remains deferred.

## 2026-09-27 · Bundled Codex configuration in installed macOS Desktop

Source-aligned Forge 0.0.1 internal macOS arm64 DMG `desktop-plugin-config-final-20260927`: 324410337 bytes, SHA-256 `679d6697bfe93035a894dd2c884b1dd8c769ced56d9ee8c1ca18f764adda97bc`, **INTERNAL / ADHOC / UNNOTARIZED**. The bundled Codex plugin is version 0.0.3, exact locked content hash `c988a0a0a9613bcbfa0794b1e2b515f117fb6be9e2ae9398e60891fba2e7ae2d`. Its sole new setting is a bounded app-server initialization timeout. No npm/Python dependency, native module, SQLite schema, Host protocol version, network permission, model/credential policy or platform ABI changed. The fixed Desktop bridge and Python Host apply revision-checked Host-owned metadata only after restart. A real owned protocol-fixture child process confirmed 1-second timeout versus 6-second success; it is not a paid Codex model call. The installed app saved 2 seconds, stopped its owned Host, reopened, and read back an applied revision. Bundled CPython 3.12.13, SQLite 3.50.4/schema36, sandboxed Renderer, ad-hoc signature and separate Finder-style `open -n` QA app/data passed on this Mac arm64. The clean PATH package probe correctly marked unbundled Codex CLI unavailable. An optional second probe of this same installed DMG used the current authorized HOME with Finder-style minimal PATH and the isolated test data: bundled Host found external `codex-cli 0.155.1`, detected its existing login, applied the saved 2-second setting and completed an actual Codex app-server `initialize`/`model/list` with 7 models, without invoking a paid model Turn. This verifies real CLI discovery and protocol startup on the current machine, not a new coding Run or fresh-user installation. The older Finder-safe and online Workflow/knowledge evidence keeps its own SHA. Windows x64/macOS Intel, Claude online, signed/notarized distribution/update, physical reboot recovery positive and complete Desktop/P6 gates remain unverified or blocked. New P7/P8 mobile/remote work remains deferred.

## 2026-09-27 · LaunchServices-opened internal QA bundle with isolated data

Source-aligned `desktop-finder-safe-final-20260927` macOS arm64 DMG: Forge 0.0.1, SHA-256 `0f6075d7bc62462b3849d1120cc975cedbefc5e08ea633b7057f2849d671d919`, **INTERNAL / ADHOC / UNNOTARIZED**. The internal package uses a bounded QA identity `05d77bb86c01d376` in both its validated marker and unique `CFBundleIdentifier`; the packaged Main defaults to `Application Support/Forge Internal QA/<id>` instead of normal Forge data when launched without a test-home override. An invalid/linked marker fails startup, and a public bundle without the marker ignores the QA override. No dependency, native ABI, SQLite schema, Host protocol, permission, credential or network change. Same DMG mount/copy/signature/package smoke passed with bundled CPython 3.12.13, SQLite 3.50.4/schema36 and sandboxed Renderer. The separately installed app started through macOS `open -n` without override: Main PID 80685, bundled Host PID 80689, new isolated database `quick_check=ok` and 0 projects/runs. This resolves the prior **local multi-copy QA LaunchServices** gap for the current internal build only; fresh-user Gatekeeper, Developer ID, notarization and normal signed distribution remain unverified/blocked. `pnpm --filter @forge/desktop test` 15 passed, full TypeScript tests/build/typecheck, lint and Python 240/Ruff/mypy passed. Windows x64/macOS Intel, Claude online, signed updater, physical reboot recovery positive, plugin nonempty config and full Desktop/P6 gates remain open; P7/P8 additions stay deferred.

## 2026-09-27 · Installed Desktop Review diagnostic

Current source-aligned internal macOS arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-review-diagnostic-20260927.dmg`, version 0.0.1, 324457875 bytes, SHA-256 `b3d01ca3710b6ebd2316b258bc2450652ecf869fb06a267cb40c04420906d3a1`. Installed package smoke loaded bundled CPython 3.12.13, SQLite 3.50.4/schema36 and sandboxed Renderer. Optional `diagnosticCode` extends the current local Review report response; the bounded code is persisted in existing `review_jobs.error_code`, with no migration, new permission, raw provider output, network listener or native ABI change. A real older installed-app Review QA database was online-backed up to a disposable profile, then read by this DMG: the older report remained `inconclusive` with no fabricated code, Task remained active, and the new Vue UI showed that no final acceptance had occurred. A separate empty QA app ran via its `.command` with Main PID 47422 and owned bundled Host PID 47443; Finder/LaunchServices in this multiple-copy environment remains unverified. Full `pnpm py:check` rerun passed **240 pytest** plus Ruff/mypy; lint/typecheck/TS tests/build/Desktop/package smoke/contracts/task map passed. There was no new model call. The old knowledge scenario still needs a successful independent Review and Owner acceptance; plugin nonempty configuration, physical reboot positive recovery, Windows/Intel, Claude, Developer ID/notarization and signed update remain unverified/blocked. Desktop/P6 release gate remains open; P7/P8 additions stay deferred.

## 2026-09-27 · Installed custom Workflow binding and full Codex loop

Source-aligned internal macOS arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-workflow-binding-20260927.dmg`, version 0.0.1, 330992035 bytes, SHA-256 `c3e6fb58ad7dbd13f9d47243414d0d77d59d233b3ab651e91e1b1adbbf53fe84`. Same-version DMG smoke loaded bundled CPython 3.12.13, SQLite 3.50.4/schema36 and sandboxed Renderer. The optional `workflowBinding` field extends the current local protocol v5 response without changing its version or granting Renderer authority; Python Host remains the final published Workflow/Profile/model validator. No dependency, native ABI, migration, permission, remote listener or credential was added.

A separate installation of this exact DMG, with isolated SQLite/Git fixture and the previously authorized Codex CLI 0.155.1 login, completed a real `gpt-6-luna` custom quick Workflow from UI Start through worktree edits, approved local Verify, independent Review, explicit Owner acceptance, and restart readback. A second Run was cancelled and was not delivered; evaluator reports 1 accepted/1 cancelled and source Git clean. Initial 50k and 100k observed-token attempts failed with `RUN_TOKEN_BUDGET_EXCEEDED` (actual 62915 and 115123 input tokens respectively) and are retained as failures; the 200k explicit-choice run completed. Token observations are not precise cost limits. Full Python 239 tests/Ruff/mypy, TS/Vue checks, lint, contracts/task map, Desktop and package smoke passed. A fresh QA app copied from the DMG runs via a Terminal `.command` with isolated empty schema36 data; Main PID 11475 and bundled Host PID 11479 were observed. In this multi-copy QA environment, LaunchServices `open -n --env` instead left a Main without Renderer/Host, so direct Finder-style launch is **unverified** and tracked as a Desktop experience gap; no Gatekeeper setting was changed.

One more isolated installation of the same DMG proved document import/retrieval and owner-validated memory entered a frozen ContextBundle consumed by a real successful Codex Run. After revocation, the Desktop Run context still shows both historical citations with revoked status; no-answer and conflicting-source starts were rejected. Local Verify passed. The independent Reviewer returned a durable `inconclusive` report with no structured result, so this second Task remains active and has no accepted delivery. The script exited nonzero and retained the data as failure evidence; Knowledge/Memory source consumption is verified, its complete Review/Owner chain is not.

The physical reboot positive recovery branch, nonempty plugin configuration consumption, the second scenario's structured Review/Owner acceptance, Windows x64, macOS Intel, Claude online, Developer ID/notarization and signed updater remain unverified or blocked. Complete Desktop/P6 publication acceptance remains open. P7/P8 mobile/remote additions stay deferred by user priority.

## 2026-09-27 · Installed Mac boot-session recovery guard

Current source-aligned internal arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-boot-recovery-20260927.dmg`, version 0.0.1, 329444493 bytes, SHA-256 `44a6c16b0af98cecbf931b5f1cc3d71fff0835e54c8fe15a4ba6ef28957e9052`. Installed package smoke loaded bundled CPython 3.12.13, SQLite 3.50.4/schema36 and the sandboxed Renderer. Migration 35→36 is additive to data, transactionally replaces the active-Run unique index so an interrupted Run stops blocking a future explicit Start **only after** a durable recovery decision, and uses the existing backup-before-upgrade preflight. No new dependency, native ABI, model credential, remote listener or protocol version was introduced. The fixed local protocol-v5 Run commands and native Main confirmation do not expose the boot ID, raw process control or an arbitrary channel to Renderer.

`/usr/sbin/sysctl -n kern.bootsessionuuid` returned a stable UUID twice on this macOS arm64 machine. A real old Codex Host-crash SQLite backup loaded in a separate installation returned `awaiting_reboot`, rejected native-confirmed same-boot resolution with `RUN_RECOVERY_PROOF_REQUIRED`, and kept the old Run/lease and source Git intact. Python 238 tests/Ruff/mypy, JS/Web lint/typecheck/test/build, contracts/task map, development Desktop and installed package smoke passed. A test-injected second boot ID exercises the positive state/SQLite path only; **physical reboot and installed positive recovery are unverified**. Older read-only schema35 reports `unavailable`; the current Mac QA app starts with separate empty schema36 data. Windows x64 lacks a verified boot-session adapter and fails closed; macOS Intel, Claude online, current-bundle full Codex delivery, Developer ID/notarization, signed update and complete Desktop/P6 acceptance remain unverified or blocked. See ADR 0084. P7/P8 new work remains deferred.

## 2026-09-27 · Torn process journal blocks a Desktop data-profile switch

Current source-aligned internal Mac arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-journal-fence-20260927.dmg`, version 0.0.1, 327209166 bytes, SHA-256 `3c9f9682e8e99ec54a9d4fb9fc4e3bf5a1859c17284026478a5a4216265eb3c6`. Bundled CPython 3.12.13, SQLite 3.50.4/schema35 and sandboxed Renderer passed package smoke. The fixed local protocol-v5 `system.profileSwitchSafety` now counts malformed JSON, torn `.tmp`, symlink and other unrecognized process-journal entries separately from parseable prior-runtime records. Main refuses switching on any nonzero fence without signaling a historical PID. Installed app QA completed normal backup/restore/trust renewal/original return and separately refused restore from a previously crashed real Codex Run and from a deliberately malformed test journal. Host PID, profile, backup hash and disposable source Git remained unchanged. A separate installed copy verified the Codex plugin disable/restart/run refusal/re-enable lifecycle without a model call. Full Python 236, Ruff/mypy, JS/Web lint/typecheck/test/build, contracts/task-map, development Desktop and packaged smoke passed. No new dependency, migration, native ABI, credentials or network method. A user-openable persistent QA app with isolated empty data was installed separately; its Main/Host were observed running. Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update, safe cross-Host process reconciliation and full Desktop/P6 acceptance remain unverified or blocked. P7/P8 new work stays deferred.

An additional installation of the exact same DMG started a real approved local verifier process (PID 95322) in a disposable Git fixture. The Project removal dialog refused metadata archive while that process was active; the verifier subsequently passed and the source Git HEAD/status remained unchanged. `scripts/smoke-packaged-active-verifier-remove.mjs` exited 0 and saved `output/playwright/desktop-journal-fence-20260927-remove-blocked-1440x900.png`. Only fixture construction used source-tree Python; the running verifier and Project command used the bundled Host. This is not an installed live Codex Run archive test. The current read-only QA evaluator also classified genuine historical cancelled and Host-interrupted Runs separately with zero accepted deliveries; it did not invoke a model or establish a new installed-bundle T120 end-to-end pass.

## 2026-09-27 · Durable Desktop recovery fence in internal Mac package

Previous source-aligned macOS arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-recovery-fence-20260927.dmg`, 324834922 bytes, SHA-256 `90f71bc9891452fe0c512fe159360c96dab0a2ec390b322c643ed51e0f9292da`. Package smoke loaded bundled CPython 3.12.13, SQLite 3.50.4/schema35 and a sandboxed Renderer. A separate installed package completed backup → new profile → trust renewal → original profile. Another installed copy read the SQLite backup from a real earlier Codex Host crash, preserved `interrupted` Run and `quarantined` lease, and refused a Settings restore with `RUN_RECOVERY_REQUIRED`; Host PID, profile pointer, backup checksum, Run/lease and source Git remained unchanged. The persistent QA launcher opens this package with a separate empty data root; Finder/Terminal launch was observed with Main/Host PIDs, SQLite `quick_check=ok` and no Project/Run. Shell-only launcher invocation did not persist after the tool session and is not the documented user launch path.

The new fixed read-only `system.profileSwitchSafety` uses current protocol v5 and strict TS schema; Main consumes it before staging and after quiesce. An interrupted Review/Verify now also blocks Project metadata removal. No new dependency, migration, native ABI, credential exposure or remote network method. Full Python 236 tests/Ruff/mypy, JS/Web lint/typecheck/test/build, contract/task-map checks, development Desktop and installed package smoke passed. This is a conservative fence: safe reconciliation or cleanup of old Codex child processes is still unavailable. No online model was invoked in this build. Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update and full Desktop/P6 acceptance remain unverified or blocked; P7/P8 new work stays deferred.

The same DMG additionally passed an isolated installed plugin control run: disabled Codex persisted across restart; `run.capabilities` and `run.start` refused a newly approved TODO with `RUN_PLUGIN_UNAVAILABLE` and zero Runs; explicit re-enable required a second restart. The disposable Git source stayed clean and `FORGE_MODEL_PROVIDER=disabled` prevented model calls. This verifies the current package's lifecycle gate, not a nonempty config/credential consumption path; the bundled Codex config schema is still a closed empty object.

## 2026-09-27 · Final project archive/start interlock in packaged Python Host

Current source-aligned internal macOS arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-archive-race-20260927.dmg`, 326090997 bytes, SHA-256 `41f95ad87599cedbc638b6a5b55c220687ae8d28bee59dca8945389780876eab`. Bundled CPython 3.12.13, SQLite 3.50.4/schema35 and sandboxed Electron Renderer passed package smoke. Developer, Review and Verify now recheck the current trusted, non-archived Project inside the final SQLite intent transaction after asynchronous workspace/copy preparation. Real temporary Git/SQLite/process tests proved that an active verifier blocks Project archive, and archiving during verifier workspace preparation rejects launch and releases its disposable worktree. Full Python 234/234, lint, typecheck, TS tests/build, contracts/task map and development Desktop smoke passed after correcting an inactive-project test fixture. No dependency, schema, protocol, native ABI, network exposure or model call changed. The same DMG was installed separately as a persistent empty writable QA app; its isolated SQLite quick_check is `ok`. Installed active Codex archive refusal, cross-Host orphan process reconciliation, Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update and full Desktop/P6 gates remain unverified or blocked. P7/P8 new development stays deferred.

The same `desktop-archive-race-20260927` DMG additionally passed disposable installed-app Project picker/probe/trust/switch/restart/metadata-only remove QA; both Git sources stayed clean. A separate installed copy launched a real owned local Verify process through its bundled Python Host. While the process was live, the normal Projects removal dialog received `PROJECT_BUSY`, kept the Project, and then the verifier finished `passed` with exit 0; disposable SQLite `quick_check=ok`, source Git unchanged. Evidence: `output/playwright/desktop-archive-race-20260927-remove-blocked-1440x900.png`, `output/qa/desktop-active-verifier-l1JkZM/`. This is an offline verifier and does not establish installed live Codex Run archive refusal or cross-Host orphan cleanup. No new model call.

## 2026-09-27 · Installed historical read-only Desktop UI

Previous internal macOS arm64 DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-readonly-ui-final-20260927.dmg`, 327961146 bytes, SHA-256 `331c75a0ca2de200e20a301b2f1ac9b2a9dda459a9b383f099288b912f37c167`. Bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and owned Host exit passed package smoke. The internal isolated SQLite `mode=ro` profile now reports optional `storage.readOnly` under existing protocol v5 and rejects non-query Host methods as `DATABASE_READ_ONLY` before service execution. Installed-app QA read a real historical Task from an online SQLite backup, rejected `project.remove`, preserved Project rows and passed `quick_check`. Desktop hides its normal mutation controls and displays a full-width history banner; actual 1440×900 screenshots were inspected. The same DMG is installed separately as an empty writable QA app with a clean disposable Git fixture. No new dependency, DB migration, native ABI, network listener or model call. This does not validate cross-Host orphan cleanup, a new end-to-end Codex Run in this SHA, Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update or full Desktop/P6 gates. P7/P8 new work stays deferred.

## 2026-09-27 · Project archive fence in the internal Mac package

`desktop-project-fence-20260927` is the current source-aligned macOS arm64 internal DMG: 0.0.1, 324693864 bytes, SHA-256 `62b49efc525131267a444165de164883196f85f2c91303efe22dddcec27a5a29`. Installed package smoke loaded bundled CPython 3.12.13 and SQLite 3.50.4/schema35; the bundled Python source contains the Host-side `PROJECT_BUSY` archive guard. Separate installed-app QA completed two real disposable Git Project selections, explicit trust, switching, restart and metadata-only removal with clean source trees. Python tests cover the older schema 15 remove path plus active Run/Verify and quarantined lease refusal. Web tests cover the fixed dialog error. There is no new dependency, database migration, protocol version or network permission; `PROJECT_BUSY` is an additive error code in existing protocol v5. A truly running Codex/Verifier archive refusal has not been performed in this installed DMG and is not claimed. Windows x64, macOS Intel, Claude online, Developer ID/notarization and signed update remain unverified or blocked. P7/P8 new development stays deferred.

## 2026-09-27 · Installed macOS Retina subcase

The same source-aligned `desktop-settings-first-20260926` internal DMG was mounted sequentially for a native Electron window on the actual macOS arm64 Retina primary display. `pnpm smoke:package:mac` with `FORGE_PACKAGE_RETINA_TAG=desktop-retina-20260927` and the optional surfaces tag exited 0; Electron display scale was 2, Renderer `devicePixelRatio` was 2, and installed Home, Settings, Projects, Workflows, Agents, Plugins and Knowledge had no document-level horizontal overflow. Their seven physical screenshots are 2880×1736 pixels (`output/playwright/desktop-retina-20260927-*-retina-native.png`), captured after entrance animation and Host data readiness; the displayed images were inspected. The first QA attempt emulated DPR 1 through Playwright `setViewportSize`; running the native DPR probe before optional viewport emulation fixed the test order, not the application. A separate installed-app disposable Git/SQLite run created a 120-character manual Task, approved it to TODO without a Run, reopened the app and checked its long-title Task Drawer at native Renderer DPR 2 (`output/playwright/desktop-retina-task-20260927-long-task-drawer-retina-native.png`); the panel and close action remained inside the viewport, and both source Git trees stayed clean. This is a T108 macOS Retina first-level empty-state plus Task Drawer subcase, not Windows 150% DPI, every long-data state, or full accessibility/platform acceptance. Artifact hash and bundled runtime are recorded below. No dependency, model, product, or package change.

The same installed Mac package smoke exercised `Meta+K`, focused quick-navigation search, selection of the Knowledge page, a second `Meta+K`, Escape close and return to Home. This is a T004 Mac shortcut subcase; Windows `Ctrl+K`, the full shortcut matrix and cross-platform acceptance remain unverified. Full repository lint/typecheck and diff checks passed after QA-script changes.

## 2026-09-26 · Installed Desktop-first Settings and diagnostic export

Current source-aligned internal macOS arm64 artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-settings-first-20260926.dmg`, 0.0.1, 329725663 bytes, SHA-256 `da8c6fadf7dad1ddc295a46db6664fa7de762543b93afef1d691378b34e64894`. The installed app orders local appearance/dependencies/diagnostics/backup before its retained, default-off loopback/device controls. Its bundled CPython 3.12.13 and SQLite 3.50.4/schema35 generated a fixed `forge-diagnostics/v1` preview and exported identical bytes through the native Save dialog; a planted QA token and sensitive path were absent. The installed package smoke checked sandboxed Renderer and owned Host shutdown. Web 148 tests, lint, typecheck and complete pnpm test/build passed. Parallel DMG mount initially made `hdiutil` fail for package smoke; a sequential retry succeeded. No new dependency, ABI, database migration, protocol version, network listener, model invocation or credential storage change. This is Mac arm64 internal package evidence, not Windows x64/macOS Intel, Developer ID/notarization/signed update, Claude online or full Desktop/P6 acceptance. P7/P8 new work remains deferred.

## 2026-09-26 · Installed desktop contrast and keyboard baseline

Current source-aligned macOS arm64 internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-accessibility-20260926.dmg`, version 0.0.1, 329689293 bytes, SHA-256 `c34dea0ceb7ab611f3a97015424fcea97e27e69bf7058605c204896468369eda`. Production light semantic text colors were darkened just enough for selected opaque reading/control surfaces to meet 4.5:1 in the formal token test. The installed app verified the light Project UI at 1280px with a long Unicode path, accessible full path, usable controls, removal Dialog focus trap/restore/Escape and actual reduced-transparency/reduced-motion computed styles. The system reduced-motion media preference also worked with the app toggle off. The same installed DMG additionally created a 120-character Chinese Task through the normal UI, obtained separate human approval, confirmed zero Executor Runs, and verified the Task drawer at 100/125/150% CSS zoom, keyboard focus containment/Escape/return focus and restart readback. The first transient 5px close-button measurement was during the entrance animation; the settled layout passed without product-code changes. A separate installed read-only session previewed the existing real Codex crash worktree, with interrupted Run/quarantined lease and source Git unchanged; no new model call. This is selected T106/T107/T109/T110 evidence, not a comprehensive WCAG or Windows 150% system DPI result; T108 and other screens remain unverified. Bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and installed package smoke passed. No new dependency, DB migration, Python runtime, protocol version or network listener change. Claude, Windows x64, macOS Intel, Developer ID/notarization/signed update and full Desktop/P6 gates remain unverified or blocked; P7/P8 new work stays deferred.

## 2026-09-26 · Installed read-only quarantined worktree preview

Previous macOS arm64 internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-quarantined-preview-20260926.dmg`, version 0.0.1, 328176291 bytes, SHA-256 `a6b0679109ea8a8522584f5db7e7d78feef9c1407ef24f4c315a5e45148e30a6`. The fixed local Host command `run.recoveryPreview` checks an interrupted Run, quarantined lease, historical workspace record and Git identity before returning a bounded redacted **current** Diff. An installed app opened the existing isolated real Codex crash data in SQLite read-only mode and displayed `hold.started`; before/after DB Run/lease and source Git state were unchanged. An online backup of that SQLite file without its worktree was rejected with `RUN_RECOVERY_EVIDENCE_INVALID`. Bundled CPython 3.12.13/SQLite 3.50.4/schema35, Renderer sandbox and package smoke passed. Python 230 pytest/Ruff/mypy, TS/Vue lint/typecheck/test/build, contract/task-map and Desktop smoke passed. No dependency, SQLite migration, native ABI or network listener change; the local JSON-RPC method was added under the existing v5 protocol and strict schema. The preview is not a frozen snapshot or proof that a former writer is gone. No lease release/retry was added. Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update, full Desktop/P6 gates and safe cross-Host reconciliation remain unverified or blocked; P7/P8 new work stays deferred.

## 2026-09-26 · Installed interrupted-Run recovery fence

Current source-aligned internal macOS arm64 artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-interrupted-recovery-20260926.dmg`, version 0.0.1, 328571185 bytes, SHA-256 `2f6c8ad31dca53936759659a72679d9f9e713d066292b9d53894032091786e34`. The Python Host now reports `RUN_RECOVERY_REQUIRED` and `available=false` for a Project with an interrupted Run or quarantined lease, and rejects a new start before preparing another workspace. An installed-copy readback of the prior build's real Codex crash record showed `interrupted`/`quarantined` in Python Host and the Vue Task drawer, with no new Start action or model call. This is a safety fence, **not** automated reconciliation: Codex child commands can be in a different process group from app-server, and historical PID/start timestamps cannot prove ownership. The QA app is installed separately with a clean SQLite schema35 profile and disposable Git fixture. Bundled CPython 3.12.13/SQLite 3.50.4, Renderer sandbox, Mac package smoke, development Desktop smoke, 230 Python tests/Ruff/mypy and JS/Vue build/tests passed. No new dependency, ABI, schema migration, protocol version, network listener or credential handling. Windows x64, macOS Intel, Claude online, notarization, signed update, complete Desktop/P6 gates and safe cross-Host orphan reconciliation remain unverified or blocked; P7/P8 new development is deferred.

## 2026-09-26 · Packaged explicit owned Python Host restart

Previous macOS arm64 artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-host-restart-20260926.dmg`, version 0.0.1, 331964399 bytes, SHA-256 `3bd3dcac99b1447857d179108aa03d47c4ee0bb59101498129a7487244f971c6`. Main adds a fixed, sender-checked, zero-argument restart only when its prior Python Host has exited and status is crashed. A native confirmation explains interrupted Runs and quarantined leases; cancel leaves the Host crashed. The Preload does not forward extra arguments; Web has no restart capability. An installed DMG copy on macOS arm64 showed actual crash diagnostics and a newly connected Host ID/PID after explicit restart, with bundled CPython 3.12.13, SQLite 3.50.4/schema35 and sandboxed Renderer. A separate persistent isolated install is running with an empty healthy database and disposable Git fixture. `pnpm typecheck`, lint, all TS/Vue tests/build, development Desktop smoke and package smoke passed. This build made no new online model request; real active Codex cancellation/crash evidence remains bound to the previous build SHA. No dependency, native ABI, database schema, Host protocol version or network listener change. Windows x64, macOS Intel, Claude online, Developer ID/notarization, signed update and full Desktop/P6 gates remain unverified or blocked; P7/P8 new work remains deferred.

## 2026-09-26 · Real installed Codex Host crash, interrupted evaluation

The same `desktop-plugin-inspection-final-20260926` arm64 internal DMG ran authenticated Codex in a disposable Unicode/space Git fixture and isolated SQLite profile. After its owned `node hold.js` command started, only that package's Python Host PID 43246 was killed for crash testing. The Desktop displayed real `Host crashed`; reopening the same QA profile reconciled the Run to `interrupted`, quarantined the workspace lease, and retained `quick_check=ok`. No late completion marker or source-repository change appeared. The read-only evaluation CLI reported one interrupted, zero accepted; a separate real cancellation on this same DMG reported one cancelled, zero accepted. First-pass automation waited at the Desktop's correct native unknown-Host exit confirmation; after the test-owned Codex process had exited, only the test Main PID 43230 was terminated to let the harness continue. The harness now answers that confirmation, but the full paid run was not repeated. Evidence: `output/playwright/desktop-live-host-crashed-20260926-1440x900.png`, `output/qa/desktop-live-host-crash-HuiRdh/`. This is current Mac arm64 internal-package evidence, not unattended CI, Windows/Intel validation, signed update, Claude, or full P6 release acceptance.

## 2026-09-26 · Installed active Codex Run restore refusal

The source-aligned `desktop-plugin-inspection-final-20260926` internal DMG (SHA-256 `30436883685b9cda93e51f88d2a96d0f7aa1701d53fd134590afcf3119292555`) was copied from a read-only mount and launched with its bundled Python Host against isolated SQLite and disposable Git data. A real authenticated Codex `gpt-6-luna` Run reached an owned isolated `node hold.js` command. The actual Settings restore control refused the backup while the Run was active, kept the same Host PID/profile and unchanged backup, and left the Run running until an explicit cancellation. SQLite persisted `cancelled` and passed `quick_check`; the source Git tree remained clean, no post-cancel completion marker appeared, and the test Host exited. See `output/playwright/desktop-active-restore-refused-20260926-1440x900.png` and `output/qa/desktop-active-restore-LfJoVR/`. This validates one macOS arm64 internal-package safety path, not a live Host-crash T120 evaluation or signed update. No dependency, native ABI, schema, protocol, platform support or release-gate claim changes. Windows x64, macOS Intel, Claude online, Developer ID/notarization and signed update remain unverified or blocked; mobile/remote new development remains deferred.

## 2026-09-26 · Installed Desktop plugin manifest visibility and Knowledge layout

The current source-aligned INTERNAL/ADHOC/UNNOTARIZED macOS arm64 DMG is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-inspection-final-20260926.dmg`, version 0.0.1, 326540256 bytes, SHA-256 `30436883685b9cda93e51f88d2a96d0f7aa1701d53fd134590afcf3119292555`. Installed smoke used bundled CPython 3.12.13, SQLite 3.50.4/schema35 and sandboxed Electron Renderer. The Host exposes only the already locked bundled Codex Manifest's declared contributions, permissions, required services, platform and content digest. The Desktop shows these declarations separately from runtime Codex availability; a clean PATH correctly reports the unbundled CLI unavailable. The bundled config Schema is empty, so no plugin setting or credential persistence is claimed. A Knowledge empty-state Grid layout defect was fixed and confirmed in actual packaged screenshots. Full Python 230 tests, lint, typecheck, TS/Vue tests/build, contract and task-map validation, Electron and package smoke passed; no dependency, native ABI, database schema, network listener or Host protocol version changed. The persistent QA copy is isolated and did not run a new online model task. The previous read-only historical viewer and its data remain separate. Windows x64, macOS Intel, Claude online acceptance, Developer ID/notarization, signed update, active Codex restore refusal and full Desktop/P6 gates remain unverified or blocked. Mobile/remote new development remains deferred.

## 2026-09-26 · Corrected installed historical SQLite read-only mode

The current source-aligned internal macOS arm64 artifact is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-history-readonly-20260926.dmg`, version 0.0.1, 332213155 bytes, SHA-256 `a3d9125b45c4bcfd193294cc210614bfe35457a83c917cbc08561366658cebfd`. The earlier historical-viewer launcher set `FORGE_PYTHON_DB_READ_ONLY=1`, but Electron Main did not forward it; an actual packaged-app `project.remove` write against a **disposable QA backup** succeeded. The original retained QA database, daily user data, and persistent Documents historical copy were not changed. The old viewer Main/Host were gracefully stopped after confirming its only Run had succeeded.

Main now forwards only the exact read-only flag when an isolated INTERNAL test home is explicitly set. Python Host still opens SQLite with `mode=ro`; no arbitrary environment variables or secrets are forwarded. The new packaged-app smoke backed up a real QA database with SQLite's online backup API, read the completed Task, then sent the same fixed `project.remove` command: Host returned `DATABASE_IO_ERROR`, Project rows remained identical, `quick_check=ok`, and the test exited 0. `pnpm smoke:package:mac` independently verified installation, ad-hoc signature, bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and owned Host shutdown. The actual image is `output/playwright/desktop-read-only-history-20260926-1440x900.png`. Two separate copies of this new app now run from isolated launchers: writable blank QA (Main/Host 82032/82045) and genuine read-only history (81761/81772); both databases passed `quick_check`. Full local regression passed: Python 230 pytest/Ruff/mypy, TypeScript/Vue tests, lint, typecheck, build, Desktop smoke, 47-file contract validation (0 errors/4 existing warnings) and 9-phase/92-task/120-case task-map validation. This build made no new online model call and did not change dependencies, schema, Host protocol or network listeners. Windows x64, macOS Intel, Claude, Developer ID/notarization, signed update and full Desktop/P6 release gates remain unverified or blocked. P7/P8 new work remains deferred.

## 2026-09-26 · Current DMG knowledge readback and QA accounting

The `desktop-integrity-gate-20260926` DMG SHA below was installed again against an isolated SQLite online backup of a retained real Codex knowledge-and-memory Run. The packaged Host and Vue Run detail returned both frozen source kinds (`retrieved_knowledge`, `validated_memory`) with revoked current-source status, plus the frozen Workflow/Reviewer, passing Verify and retained Owner delivery after reopen. See `output/playwright/integrity-gate-knowledge-20260926-context-sources-1440x900.png`. This is historical evidence read by the current binary, with **no new provider request**. The legacy Run has no command-preset lock; the readback explicitly opted into that legacy-only expectation. Separately, the repository-only QA outcome CLI now checks each structurally linked delivery through the Host's current final-acceptance basis projection. The actual accepted QA DB reports 1 accepted/exit 0; a disposable copy with an appended post-acceptance criterion decision fails with `EVALUATION_DELIVERY_STALE`/exit 1. The app binary, dependency set, native ABI and schema are unchanged. T120 and all external platform/release gates retain their existing unverified status.

## 2026-09-26 · Current installed macOS arm64 accepted-integrity gate build

Current source-aligned internal DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-integrity-gate-20260926.dmg`, 329664459 bytes, SHA-256 `7ce3bd3ddd0966cfc0b087b3dd378621f07cfea2928bed5f9bcbdbf1945967f6`. Read-only DMG install and package smoke passed on macOS arm64. A separate installed QA app launched with bundled CPython 3.12.13 / SQLite 3.50.4, schema 35, isolated DB `quick_check=ok`, Main PID 40845 and owned Host PID 40856. Installed historical readback and isolated tamper guard passed without an online model call. The package remains INTERNAL / ADHOC / UNNOTARIZED. Windows x64, macOS Intel, fresh-user Gatekeeper, Developer ID/notarization, signed updates, and Claude remain unverified or blocked as tracked below. The fresh single-Codex flow was verified subsequently as recorded in the next paragraph.

Subsequent evidence for the **same DMG SHA**: a disposable Git project and isolated installed-app data set ran a fresh Codex `gpt-6-luna` Development Run (`1385645e-5e0d-4d27-b9f8-fc14e67d12de`) with the explicitly selected 200,000 observed-token setting. It succeeded with 155638 input / 1229 output observed tokens; the source Git tree stayed clean. A second installation from the same DMG continued that retained Run through real read-only Review approved, approved Node test Verify passed/exit 0, criterion decision, Owner acceptance and installed-app restart to Board Done/delivery. QA log and screenshots are in `output/qa/desktop-integrity-gate-closeout-20260926.log` and `output/playwright/integrity-gate-online-closeout-*.png`. The first 100,000-token attempt stopped at its limit; a separate old fixture run was cancelled after waiting on an unrelated long command. Those attempts were retained and were not counted as success. This establishes this internal macOS arm64 single-Codex positive flow; external platform, Claude and release gates remain open.

## 2026-09-26 · Prior installed macOS arm64 accepted-evidence lock build

Current source-aligned internal DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-evidence-lock-20260926.dmg`, SHA-256 `0549a6866b5412677d6bb5c41f35e2fd5bbf855604bce7b8f6aa21b47fd01a02`, 327073954 bytes. The read-only DMG install/package smoke and a separate persistent QA app passed on actual macOS arm64 with bundled CPython 3.12.13, SQLite 3.50.4/schema35, Electron Renderer sandbox and an owned Python Host. An installed copy read a retained real accepted Run only through a disposable SQLite online backup; the Host rejected new Review, Verify, criterion decision and advisory waiver with source-stale errors, leaving Jobs and acceptance basis unchanged. The app shows historical evidence but no Done-state decision form. The current package did **not** rerun a paid online Developer→Owner chain; prior online evidence retains its own build identity. Python 229 tests, full TypeScript tests/build/lint/typecheck, contract and task-map validation, Electron and package smoke passed. No dependency, native module, migration, protocol, credential path or network listener changed. Windows x64, macOS Intel, Claude online acceptance, active Codex restore refusal, Developer ID/notarization, signed upgrade/rollback and full Desktop/P6 Gate remain **UNVERIFIED/BLOCKED**. P7/P8 new development stays deferred.

## 2026-09-26 · Prior installed macOS arm64 accepted-snapshot gate build

The source-aligned internal DMG is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-accepted-gate-final-20260926.dmg`, SHA-256 `6fd470f49e1f2838bdb8b4c2ca9f26169141a0013038338b7f5e5dc216e01028`, 331977326 bytes. Its read-only install/package smoke and separate persistent QA app passed with bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Electron Renderer and owned Python Host on real macOS arm64. A retained real Owner-accepted Task was opened only through an isolated SQLite online backup: the installed UI disabled a new Review, and fixed Renderer→Host commands returned `REVIEW_RESULT_STALE` and `VERIFY_SOURCE_STALE` without creating Jobs or calling a model. Python tests also forced acceptance during asynchronous Review-copy and Verify-workspace preparation and verified the final transaction guard and owned-copy cleanup. The previous package's Reviewer model isolation remains present. No dependency, migration, native module, Host protocol version, credential path or listener changed. The original online Run belongs to earlier identified packages; this DMG did not rerun a fresh online Developer→Owner chain. Windows x64, macOS Intel, Claude online acceptance, active Codex restore refusal, Developer ID/notarization, signed upgrade/rollback and full Desktop/P6 Gate remain **UNVERIFIED/BLOCKED**. P7/P8 new development remains deferred.

## 2026-09-26 · Prior installed macOS arm64 independent Reviewer-model build

The prior source-aligned internal DMG was `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-reviewer-model-20260926.dmg`, SHA-256 `3c9501d57295accf6880dc6903ff3707f4baa03dfbfb92f5f125f61827ecb9a5`, 324926179 bytes. Actual read-only DMG installation and a separate persistent QA app used bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Electron Renderer and owned Python Host on macOS arm64. The new UI separates the built-in Reviewer model from the Developer model; a saved Reviewer Profile continues to lock its own model, and a published Workflow's frozen binding takes precedence. A component test verified distinct `run.reviewStart` payloads. The installed UI read a **SQLite backup copy** of a retained real Run, displayed the true Codex model list and allowed a separate Reviewer model selection without a model request. This package did not rerun a fresh Developer/Reviewer/Verify/Owner online chain; the prior review-revision package retains that cross-package evidence. No dependency, native module, migration, protocol version, credential handling or listener changed. Windows x64, macOS Intel, Claude online acceptance, active Codex restore refusal, Developer ID/notarization, signed upgrade/rollback and the full Desktop/P6 Gate remain **UNVERIFIED/BLOCKED**. P7/P8 new development remains deferred by user priority.

## 2026-09-26 · Prior installed macOS arm64 Reviewer revision build

The source-aligned internal DMG is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-review-revision-20260926.dmg`, SHA-256 `9cabc437e9337833e12550ca100d98c16d14787c784613926a21448dca917656`, 331858701 bytes. Read-only DMG install and a separate persistent app used bundled CPython 3.12.13, SQLite 3.50.4/schema35, the sandboxed Electron Renderer and owned Python Host on actual macOS arm64. The new UI offers an explicit per-Run observed token threshold of 50k/100k/200k; 50k remains default. This is not an exact cost or provider-side limit. An installed 50k Codex Run previously stopped at 64,318 input/379 output tokens with `RUN_TOKEN_BUDGET_EXCEEDED`; an explicit 200k UI Start subsequently produced a real isolated snapshot in the prior budget-choice DMG. That package's first read-only Reviewer returned a mismatched profile revision and failed closed. This current package passed a fresh real Reviewer on the retained snapshot, frozen approved `test` Verify (exit 0), per-criterion and Owner acceptance, durable Done/delivery after restart, and clean source Git. A separate offline installed-app run passed backup→restored TODO→fresh trust→original profile return and visually verified the 200k selector. The same final DMG with an empty `CODEX_HOME` reported `CODEX_NOT_AUTHENTICATED`, disabled Start, and kept zero Runs; an installed plugin page showed execution unavailable without a model call. The earlier failed Reviewer job remains failed history. This was a cross-package retained Run, not a fresh Developer run in this final DMG. No new dependency, native module, migration, protocol version, credential path or public listener was added. Windows x64, macOS Intel, active Codex restore rejection, Developer ID/notarization, signed upgrade/rollback, Claude second Executor and the full Desktop/P6 release gate remain **UNVERIFIED/BLOCKED**; P7/P8 new work stays deferred.

## 2026-09-26 · Latest installed macOS arm64 data-switch build

The current source-aligned internal DMG is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-data-switch-final-20260926.dmg`, SHA-256 `14b8d507a7216986bb04e6d3517700ca830fba591b72b14bac9e15cb82ac28fc`, 331954902 bytes. On actual macOS arm64, its read-only install smoke and separate UI QA used bundled CPython 3.12.13, SQLite 3.50.4/schema35 and a sandboxed Electron Renderer. The packaged Host retained a real manually approved TODO through SQLite export, independent restored profile selection and Desktop restart. Starting that TODO before fresh Project trust was rejected; returning to the original profile preserved its source Git and database. UI QA also exercised keyboard containment/restoration in the remove Dialog and accessibility of a long Unicode project path. The native dialogs were controlled by the QA harness, not manually clicked. A real Python Host regression now checks quiesce/reject/resume behavior, and `RESTORE_IN_PROGRESS` is a public ForgeError code rather than an `INTERNAL_ERROR` fallback. No new package dependency, native module, Host protocol version, public network listener or credential was added. Live active-Codex restore rejection, new online full-task execution in this exact package, Windows x64, macOS Intel, Developer ID/notarization, signed upgrade/rollback, Claude online acceptance and the full Desktop/P6 release gate remain **UNVERIFIED/BLOCKED**. The prior restore-profile DMG below is retained as historical evidence.

## 2026-09-26 · Installed macOS arm64 data-profile restore

The source-aligned internal DMG is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-restore-profile-final-20260926.dmg`, SHA-256 `1a5b2649f67977755dab2fdce62b2f1fdd35668ec8d8b5d88d2afcf869327ebd`, 333022618 bytes. A read-only DMG install smoke and separate installed-app UI restore/restart exercise passed on actual macOS arm64 with bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and owned Python Host. A standalone backup was staged in a new Forge data profile; the original database and source repository remained unchanged, imported Project trust required fresh native picker/probe/approval, and imported device sessions were revoked. The installed app returned to the original profile. Python tests cover corrupt/future backups, migration failure, schema transition, source immutability and trust/device fencing. No new package dependency, native module, Host protocol version, published network listener or credential was added. The automated native dialogs were controlled by the QA harness; live active-Codex restore rejection, Windows x64, macOS Intel, Developer ID/notarization, signed upgrade/rollback, Claude online acceptance and full Desktop/P6 release gate remain **UNVERIFIED/BLOCKED**. The old run-usage build below is historical, no longer source aligned; P7/P8 new work remains deferred.

## 2026-09-26 · Installed Workflow v2 Review through Owner acceptance

The existing `desktop-run-usage-20260926` arm64 internal DMG (SHA-256 `fd867901b7f3ee2e78842411c8477f77e5a4d87ce0e3b5a526ae1e9235a214bd`) was mounted read-only and copied to a temporary install location for a retained isolated QA Project. The previously successful Workflow v2 / Developer Profile v2 Run was continued in the actual Electron UI: one real Codex read-only Review approved its frozen snapshot, the approved `test` preset passed with exit 0, per-criterion and Owner decisions produced a delivery, and reopening the installed app retained Done/delivery. Original Git HEAD/status stayed clean. This adds no dependency, ABI claim, migration, entitlement or product binary change. The first two QA harness attempts failed on navigation blocked by the already open task drawer; the corrected idempotent script completed without repeating the online Review. Evidence and IDs are in `implementation-status.md`. This does not validate Windows x64, macOS Intel, Claude, Developer ID/notarization, signed update, safe live Restore, or the complete P6 evaluation gate.


## 2026-09-26 · Desktop Host crash accounting follow-up

On macOS arm64, an independently exited Python Host process with a real owned fixture child and isolated Git worktree was reopened against the same temporary SQLite database. Production startup reconciliation persisted `interrupted` and quarantined the lease; the read-only evaluation report counted one interrupted Run and zero accepted deliveries. `pnpm py:check` passed 218 tests, Ruff and strict mypy. This is a local process-level test, not a live Codex crash or an installed-app T120 completion. The existing `desktop-run-usage-20260926` DMG remains product-source aligned because no packaged source changed; Windows x64 and macOS Intel remain unverified.

## 2026-09-26 · Current installed macOS arm64 Desktop run-usage build

Source-aligned internal DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-run-usage-20260926.dmg`, SHA-256 `fd867901b7f3ee2e78842411c8477f77e5a4d87ce0e3b5a526ae1e9235a214bd`, 329540902 bytes. On real macOS arm64, read-only DMG mount/copy/start and a separate persistent install passed: bundled CPython 3.12.13, SQLite 3.50.4/schema35 (`quick_check=ok`), Electron Renderer sandbox, context isolation, ad-hoc signature and owned Python Host. A separate SQLite online-backup clone from a prior authenticated Codex delivery read back two frozen Runs, Done and delivery in this exact package; no new model call was made. The locked Codex CLI 0.155.1 generated protocol includes `thread/tokenUsage/updated.total` (thread lifetime) and `last` (latest response). Python Executor now subtracts the first current-turn `last` from `total` as the baseline for this Run and reports later deltas. Offline fixture tests cover resumed-thread earlier usage, multiple responses, duplicate event and counter reset; no online Codex budget overrun was performed. All source checks, 217 Python tests, Desktop and package smoke passed. No dependency, ABI, SQLite migration, Host protocol version, network listener or credential path changed. Token events can arrive late; T119 and exact cost enforcement remain unverified. Windows x64, macOS Intel, Claude second online Executor, Developer ID/notarization, signed update, safe in-app restore, live Codex Host-crash recovery and the full Desktop/P6 acceptance remain **UNVERIFIED/BLOCKED**. P7/P8 new work stays deferred by user priority.

## 2026-09-26 · Prior installed macOS arm64 Desktop observed-budget build

The current source-aligned internal artifact is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-observed-budget-final-20260926.dmg`, SHA-256 `a03cdde3fefc4971c674d5de453dad0036cd43f26d3394d135751a9329518f49`, 333039712 bytes. Real read-only DMG mount/copy/start and a separate persistent install passed on macOS arm64: bundled CPython 3.12.13, SQLite 3.50.4/schema35 (`quick_check=ok`), sandboxed Renderer, ad-hoc signature and owned Python Host. The isolated persistent install began with zero Projects/Tasks/Runs; a separate online-backup clone of prior authenticated Codex work read back two frozen Runs, Done and delivery in this exact build without another model call. The new Host observer stops an owned fixture process at recorded total/output-token or tool-call thresholds and persists a failed Run reason; upstream usage events can arrive late, so this is **not** an exact cost cap or complete T119. Profile `maxTurns` does not bound Codex internal tool iterations. No dependency, native binary, SQLite migration, protocol version, network listener, or credential path changed. Full source checks and installed package smoke passed; no real Codex budget-overrun run was made. Windows x64, macOS Intel, Claude online second Executor, Developer ID/notarization, signed update, safe in-app restore, live Codex Host-crash recovery and the full P6/Desktop acceptance remain **UNVERIFIED/BLOCKED**. P7/P8 new mobile/remote work stays deferred by user priority.

## 2026-09-26 · Current installed macOS arm64 Desktop plugin capability build

The source-aligned internal DMG is `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-capability-20260926.dmg`, SHA-256 `c7e72e4f7df8d8007deab956650a0ad2340f2dd4937409690e1db2ddfbb3a26c`, 332891530 bytes. Actual macOS arm64 DMG installation and isolated persistent launch used bundled CPython 3.12.13, SQLite schema35 (`quick_check=ok`), sandboxed Renderer and ad-hoc signing. With an isolated empty Codex login and one real approved TODO, the installed app showed the bundled Codex plugin as loaded but its Executor as unavailable, disabled Task Start and left zero Runs. Real prior Review/rework/delivery records were read from an SQLite online-backup clone with the same DMG, without a new model call. Vue component tests, 216 Python tests, 136 Web tests, full lint/typecheck/test/build, contract/task-map validation, Desktop/package smokes passed. No new dependency, protocol, migration, credential read or network listener. Windows x64, macOS Intel, Claude online second Executor, Developer ID/notarization, signed update, in-app restore, live Codex Host-crash recovery and full release acceptance remain **UNVERIFIED/BLOCKED**; P7/P8 remote/mobile development remains deferred.

## 2026-09-26 · Prior installed macOS arm64 Desktop Codex diagnostics build

Source-aligned internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-codex-diagnostics-20260926.dmg`, SHA-256 `23ab7d8090c2cb0c8bd58935f65055b15fdc6d938afd0946cf7ceffbd06b1254`, 327372507 bytes. On macOS arm64, the real CLI's `login status` with an isolated empty `CODEX_HOME` exited 1; Forge's Python Adapter classified that as `CODEX_NOT_AUTHENTICATED` and exposed zero runnable models. No model call or credential value was used. The mounted/copied DMG passed installed app smoke with bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and ad-hoc signature; a separate isolated persistent install passed `quick_check=ok` with zero Projects/Tasks/Runs. The same DMG read prior real Done/delivery data through an SQLite online-backup clone, without a new online Codex run. No new package, migration, Host protocol or network listener was introduced. Windows x64, macOS Intel, Claude online second Executor, Developer ID/notarization, signed update, in-app restore, live Codex Host-crash recovery and full P6 release acceptance remain **UNVERIFIED/BLOCKED**. P7/P8 mobile/remote new development remains deferred by user priority.

The final `desktop-codex-diagnostics-20260926` installed DMG also passed a real Task-entry negative path with an isolated, empty `CODEX_HOME` and a SQLite online-backup copy containing one approved TODO and zero Runs. The Python Host returned `CODEX_NOT_AUTHENTICATED`; the installed Vue drawer displayed the login action, disabled Start, and still had zero Runs. `scripts/smoke-packaged-codex-prerequisite.mjs` exited 0 and produced `output/playwright/desktop-codex-diagnostics-20260926-not-logged-in-1440x900.png`. No model call or original QA database write occurred. This does not prove a fresh authenticated Codex task on this package.

## 2026-09-26 · Prior installed macOS arm64 Desktop appearance build

Prior source-aligned internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-appearance-20260926.dmg`, SHA-256 `406a8291001ecfc80c1c511e9cabf6a8f9f9bcccc3526d583e6d3950914f393d`, 326502760 bytes. `pnpm smoke:package:mac` mounted the DMG read-only and copied/launched its app: bundled CPython 3.12.13, SQLite 3.50.4/schema35, Electron Renderer sandbox/context isolation, ad-hoc signature, Python Host startup/shutdown, and persisted Desktop appearance settings after Renderer reload passed on macOS arm64. A separately installed app launched with an isolated empty SQLite database (`quick_check=ok`, zero Projects/Tasks/Runs) and a clean no-remote Git fixture; it did not use a development `.venv` or overwrite prior QA data. This same DMG also read back two frozen 420-second Runs, Done and a delivery from an online SQLite backup clone through the installed Python Host and Vue UI; `scripts/smoke-packaged-profile-context-readback.mjs` exited 0. This package received no new online Codex run; earlier online delivery evidence remains tied to its original package SHA. No new dependency, schema migration, Host protocol, or network listener was introduced for appearance persistence or the read-only QA evaluator. Windows x64, macOS Intel, Claude online second Executor, Developer ID/notarization, signed update, in-app restore, Codex Host-crash recovery during a live run, and full P6 release acceptance remain **UNVERIFIED/BLOCKED**. P7/P8 mobile/remote new development remains deferred by user priority.

## 2026-09-26 · Prior installed macOS arm64 Desktop Profile context build

Prior source-aligned internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-profile-context-20260926.dmg`, SHA-256 `5700b1f6d681ba3943bf5070543d6b5eefc864432ae8c997b12aadc4be838487`. Actual DMG mount/copy/start smoke and a separate persistent install used bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and ad-hoc signature; the persistent install has a new isolated `quick_check=ok` database with zero Projects/Tasks/Runs. An additional temporary install of this exact DMG read the prior retained real Review/rework delivery: both Runs had frozen 420000 ms, Board projected Done, delivery existed and the Vue Context tab displayed 420 seconds. That was **readback without a new model call**; the full online Review blocker sequence belongs to the prior `desktop-profile-budget-20260926` DMG/SHA. No new package manager dependency, native module, migration, protocol or network listener was introduced. Developer Profile `maxTurns/maxOutputTokens` remain persisted policy metadata without provider enforcement. Windows x64, macOS Intel, Claude online second Executor, Developer ID/notarization, signed update, in-app restore and full P6 release acceptance remain **UNVERIFIED/BLOCKED**. P7/P8 mobile/remote new development remains deferred by user priority.

## 2026-09-26 · Prior installed macOS arm64 Desktop Profile budget / Review rework build

Prior internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-profile-budget-20260926.dmg`, SHA-256 `4b51d673c3ec64d4fbf7a0dc8004927c1946d26d4fe1d0c9226abe441e84bd17`. Mount/copy/start smoke verified bundled CPython 3.12.13, SQLite 3.50.4/schema35, Electron Renderer sandbox, and ad-hoc code signature. A separate installation of the **same DMG** completed a real authenticated Codex development run, `changes_requested` Review, automatic rework in a new worktree, locked Reviewer Profile v1 / model `gpt-6-luna` approval, approved Node command Verify (exit 0), per-criterion human judgment, Owner acceptance and restart persistence. Source Git remained clean; no merge/push/deploy. The new Development duration budget uses the selected Profile's `maxSeconds` within a published Workflow node timeout; rework retains its frozen original budget. No npm/PyPI dependency, native module, migration, protocol, local network listener, credential forwarding, or permission baseline changed. Other Profile limits are not claimed as provider-enforced. Windows x64, macOS Intel, Claude online second Executor, Developer ID/notarization, signed update, in-app restore and full P6 release acceptance remain **UNVERIFIED/BLOCKED**. P7/P8 mobile/remote new development remains deferred by user priority.

## 2026-09-26 · Prior installed internal Desktop rework recovery build

Latest macOS arm64 internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-recovery-20260926.dmg`, SHA-256 `e868ebce8a4a5d13ba7f1cb65fef580dbabd7298251c24e8720deceaa6ee0f6a`. It was mounted, copied and started with its own isolated data; bundled CPython 3.12.13/SQLite 3.50.4/schema35, sandboxed Renderer, ad-hoc signature and Host lifecycle passed package smoke. A separate persistent install uses the same DMG with zero initial Projects/Tasks/Runs and a clean, remote-free Git fixture. A real local Git/SQLite/process fixture verified that a failed automatic Verify gate after rework remains blocked until a completed, matching Host Verify job returns a `passed` report; other gates and the attempt limit stay blocked. No native dependency, migration, public network listener, credential path, protocol or permission changed. The current DMG has **no new online Review-blocker or complete Coding Run proof**; earlier Codex evidence retains its build identity. Windows x64, macOS Intel, second Claude Executor, signed update and in-app restore, Developer ID/notarization, and full P6 release gate remain unverified or blocked. P7/P8 mobile/remote new development remains deferred by user priority.

## 2026-09-26 · Current installed internal Desktop rework-reason build

Latest macOS arm64 internal artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-reason-20260926.dmg`, SHA-256 `f1692e492a38ada73d826eed60ea4cee634f006b0a823a74110d576a853f50a5`. It contains the previous clarification guard and distinguishes `REWORK_LIMIT_REACHED` from a blocked follow-up Review/Verify gate in the Python Board and Vue rework panel. The exact DMG passed mount/copy/start/shutdown smoke with bundled CPython 3.12.13, SQLite 3.50.4/schema35, sandboxed Renderer and ad-hoc signature verification. A separate installed app now runs persistently with its own empty SQLite data and clean Git sample. No dependency, native module, migration, credential, network listener or process ownership rule changed. The exact artifact subsequently used the existing authorized Codex login for one real ModelProvider Draft with two clarification questions. Its installed UI rejected answer-only editing, saved both decisions into the formal goal and acceptance, approved TODO separately and retained it after restart: one Draft revision 2, one TODO, zero coding Runs, SQLite `quick_check=ok`, clean source Git. No new online Coding Run, Review, Verify or knowledge Run was performed on this artifact; those earlier results remain tied to their identified builds. Windows x64, macOS Intel, Claude online second Executor, Review-blocker online rework, Developer ID/notarization, signed update and in-app restore remain unverified or blocked. Mobile/remote new development remains deferred by user priority; prior safety code remains intact.

## 2026-09-26 · Current internal Desktop clarification guard

Current macOS arm64 internal QA artifact: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-clarification-guard-20260926.dmg`, SHA-256 `3ac7dce68decfd2681a7c58ba048c6dca2c6d894c83a7a4680fd4560f2ece784`. The new Python Host and Vue drawer reject a clarification revision that removes a question without changing a substantive Task Contract field (`DRAFT_CLARIFICATION_NOT_APPLIED`). A freshly installed copy of this exact DMG saved a manual question, rejected answer-only revision, accepted an explicit goal/required-criterion edit, approved v3 to TODO, and retained it after restart: one Task, zero Runs, SQLite schema35/`quick_check=ok`, source Git clean. Package smoke confirmed bundled CPython 3.12.13, SQLite 3.50.4 and the existing Electron security baseline. Another isolated, initially empty installed copy is persistently open through its own launcher and bundled Host; older app/data were preserved. No npm/PyPI dependency, native module, migration, network listener, signing identity or credential handling changed. The prior package had a real Codex model clarification and full task evidence; **those online calls were not repeated on this changed package**. Windows x64, macOS Intel, Claude second Executor, Review-blocker online rework, Developer ID/notarization, signed upgrade and in-app restore remain unverified or blocked.

## 2026-09-26 · Packaged model Draft clarification and TODO restart

The unchanged `desktop-plugin-gate-20260926` macOS arm64 DMG reopened its retained real Codex-refined Draft in a separate installed app. The user-facing drawer saved clarification as revision 2, then required a separate approval request and explicit owner confirmation. The Task entered TODO only; after app/Host restart SQLite was `quick_check=ok` with one Draft v2, one TODO and zero Runs, and source Git stayed clean. `scripts/smoke-packaged-refiner-resume.mjs` exited 0 without a new model call. The first two script attempts timed out on collapsed revision-history `<details>` content after saving v2; the corrected script resumed the existing data, opened v2 and passed. This is installed-app approval/restart evidence on the same macOS package, not Windows/Intel, Claude or release-signing evidence.

## 2026-09-26 · Packaged Codex model refiner still works after plugin gate

The same `desktop-plugin-gate-20260926` macOS arm64 DMG used an existing authorized Codex login in a separate installed-app/isolated Git fixture. The Desktop UI saved a user message, explicitly invoked the model refiner, and received one `needs_clarification` Draft asking about whitespace-only email input; SQLite had one Draft and zero Tasks/Runs, and source Git remained clean. The script exited 0 and the actual packaged UI screenshot is `output/playwright/desktop-current-refiner-20260926-generated-draft-1440x900.png`. This is Codex ModelProvider evidence, not a Claude Executor call, Task approval or coding Run. Package bytes and dependency/runtime versions are unchanged; Windows/Intel and external release gates remain unverified.

## 2026-09-26 · Current DMG new ContextBundle run

The same `desktop-plugin-gate-20260926` macOS arm64 DMG ran a new authorized Codex `gpt-6-sol` task in an isolated installed-app copy, freezing both a real imported knowledge citation and an owner-validated memory into Run `0de98a50-ade8-49e1-aea1-18491088d8a4`. A conflicting source and a no-source query were rejected before execution. After both sources were revoked, a current read-only Stage Context preview on an SQLite backup returned `insufficient_sources` with no current knowledge or memory items; the historical Run retained its frozen citations marked revoked. The installed UI screenshot is `output/playwright/desktop-current-context-20260926-context-source-1440x900.png`. This is a new same-DMG online knowledge check, not a new package build, full Review/Verify/Owner acceptance, Claude proof, Windows/Intel verification or a signed update. The package SHA-256 and all runtime/dependency versions remain unchanged.

## 2026-09-26 · Real business acceptance on the exact current DMG

The `desktop-plugin-gate-20260926` DMG below now also has a **new** installed-app macOS arm64 online Codex acceptance in an isolated Git/SQLite fixture: explicit TODO→Start, real worktree edit, Verify exit 0, independent read-only Review approved, evidence-linked AC, local Owner Done and unmerged delivery. A second real Run was cancelled; its owned app-server exited, no later file write occurred, and restart retained Done/Delivery while the cancelled task stayed non-Done. The packaged app used bundled CPython 3.12.13, SQLite schema35 and external Codex CLI 0.155.1 with the existing authorized login. This validates the positive path after the `RUN_PLUGIN_UNAVAILABLE` gate fix; disabled-plugin denial is separately tested on the same DMG. Fixture and screenshots are retained under `output/qa/desktop-current-full-20260926-run1/` and `output/playwright/desktop-current-full-20260926-*`. No package bytes, dependency, native module, migration or network listener changed. Windows/Intel, Claude, Developer ID/notarization, signed update/restore and fresh-user Finder remain unverified or blocked.

## 2026-09-26 · Separate persistent install of current internal Desktop package

The exact `desktop-plugin-gate-20260926` DMG below was copied to `/Users/iamzjt/Applications/Forge INTERNAL Desktop QA 20260926.app` without replacing the older Demo app. Its dedicated launcher opened a persistent Electron process with bundled Python Host and sandboxed Renderer; after launch `codesign --verify --deep --strict` still passed, isolated SQLite `quick_check` returned `ok` at schema 35 with zero Projects/Tasks, and Main/Host had no TCP listener. The independently copied clean Git fixture and isolated data are in `/Users/iamzjt/Documents/Forge Desktop QA 20260926/`. This is a current-app launch and empty-data check, **not** a fresh online Codex run, Finder double-click from a new account, notarized installation or signed update. The same DMG additionally passed a two-Git-project UI switch/restart/remove check while preserving both source repositories. No runtime/dependency version or platform support changed.

## 2026-09-26 · Current internal Desktop plugin gate package

Current arm64 internal artifact: [desktop-plugin-gate-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-plugin-gate-20260926.dmg), version 0.0.1, SHA-256 `028e33ee66f798b8f6323a2ea44c4cdd2250bb07a300b40e4d64b69fb7d961fe`, 326,375,086 bytes. It remains ad-hoc signed and unnotarized. Installed DMG smoke confirmed bundled CPython 3.12.13, SQLite 3.50.4/schema35, Electron 44.4.3 and Renderer isolation. Real installed-app plugin disable/restart/enable and blocked TODO Run, project metadata-only removal, and retained Knowledge/Memory ContextBundle readback passed without a model call. The public `RUN_PLUGIN_UNAVAILABLE` error is now preserved by the Electron bridge and shown in Task detail; an initial test exposed its absence in the error enum and a later restart test exposed the no-adapter fallback, both fixed and retested. No dependency, native module, SQLite schema, network listener, credential or platform support claim changed. Windows x64, Intel Mac, fresh Finder account, Claude live acceptance, Developer ID/notarization, signed installed update/rollback and in-app database restore remain UNVERIFIED/BLOCKED where applicable.

## 2026-09-26 · Installed Desktop failed Verify to automatic rework

The **same** `desktop-owner-return-ui-20260926` internal DMG (0.0.1, SHA-256 7120dd359515bb031edc5433ab115c29628eade779c128435a4902db22ce1ddb) now has real macOS arm64 installed-app evidence for an approved project command returning exit 1, a failed immutable Verify report, an automatic bounded second Codex development Attempt, automatic passing recheck on a new snapshot, independent read-only Codex Review, UI AC/Owner acceptance and restart retention. The source Git repository remained clean. The first QA script failed only when a drawer overlay blocked its final screenshot navigation; retained Host/SQLite evidence was continued with no repeated development run. No product code, package bytes, dependency, migration, permission or remote listener changed. Review-blocker auto rework, Windows x64, Intel Mac, Claude, fresh Finder account, signed/notarized upgrade and user database restore remain UNVERIFIED/BLOCKED as applicable.

## 2026-09-26 · Installed Desktop Owner return and Workflow v2

Latest internal arm64 QA artifact: [desktop-owner-return-ui-20260926 DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-owner-return-ui-20260926.dmg), version 0.0.1, SHA-256 7120dd359515bb031edc5433ab115c29628eade779c128435a4902db22ce1ddb, 324,851,322 bytes. Ad-hoc signed and unnotarized, **not** a public release. The DMG was installed on macOS arm64: bundled CPython 3.12.13, Electron 44.4.3, SQLite 3.50.4/schema35, Renderer sandbox/context isolation and isolated data retention passed. Current installed build also used the existing legal Codex CLI 0.155.1/login for a new Workflow v2/Profile v2 development Run, retained the older v1 locks after restart and left source Git clean. The prior same-source internal build completed a real UI Owner-return → new Codex Attempt → Verify/Review → Owner accept chain; the current build re-opened those saved reports/Delivery and displayed corrected Done-state messaging. This does not claim a new full return run on the final DMG. No new npm/PyPI dependency, migration, native addon, permission or network listener. Windows x64, macOS Intel, fresh-account Finder login, Claude second Executor, Developer ID/notarization, installed signed update/rollback and user database replacement remain UNVERIFIED/BLOCKED. Historical sections below retain their build-time meaning; their older “latest” labels do not supersede this artifact.

## 2026-09-26 · Finder-style local CLI discovery in owned Python Host

Recovery drill against the **same installed DMG**: copied the UI-exported SQLite file to a separate QA data root, started its bundled Python Host and read Project, Done Task, Run and Delivery; the export SHA-256 was unchanged. [Installed recovered board](../output/playwright/desktop-recovery-drill-20260926-1440x900.png). User-data replacement, version migration, automatic rollback and signed updater are still unverified.

Latest internal macOS arm64 QA artifact: [`desktop-finder-path-20260926` DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-finder-path-20260926.dmg), version `0.0.1`, SHA-256 `0d30f5db9729e84db798f9e4e1380620d7a0c4d9fb03e89cce0f9ce4d87362ff`, 331,834,451 bytes. Main appends existing standard macOS user/Homebrew CLI directories to the **owned Host** PATH after system directories. It does not run shell startup files or forward arbitrary credentials. With a Finder-style four-directory PATH in the installed app and isolated Forge data, Host detected Apple Git 2.54.0, external Codex CLI 0.155.1 plus current authorized login, and a real available Codex Executor probe; no model call. Separate isolated-home package smoke still reported Codex unavailable. This is an app-launch simulation, **not** a new macOS account or Finder double-click verification. Electron 44.4.3, bundled CPython 3.12.13, SQLite 3.50.4/schema35; no new dependencies, native addon, migration or network listener. Windows/Intel, Claude, Developer ID/notarization, signed update, new-account credential handling and package live rework remain unverified/blocked.

## 2026-09-26 · Current internal Desktop build after rework status refresh

`desktop-rework-status-20260926` [DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-rework-status-20260926.dmg) is the latest source build, version `0.0.1`, SHA-256 `25d342b2cce2454b1b29e903cd98a8a0c7302172f018c9bda151a3f4a20c497d`, 330,891,311 bytes. Installed macOS arm64 package and retained-run restart passed, including SQLite backup export/integrity. Rework polling is source/component verified and packaged; no fresh online rework run was made on this DMG. Dependencies and schema remain Electron 44.4.3, bundled CPython 3.12.13, SQLite 3.50.4/schema35. Windows/Intel, Claude, Developer ID/notarization, Finder first-account setup and signed update remain unverified or blocked; this remains an ad-hoc internal artifact.

## 2026-09-26 · Desktop SQLite backup export, internal arm64 package

Latest source package `desktop-backup-20260926`: [DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-backup-20260926.dmg), version `0.0.1`, SHA-256 `5f812394f0e22c7ce254a18e4f3741b5ae9ecba5a505f79cc7f9912cb761465b`, 329,801,681 bytes. No new npm/PyPI dependency, native module, migration or network listener. Electron 44.4.3, bundled CPython 3.12.13, SQLite 3.50.4/schema35 on macOS arm64. An installed copy used the Python Host SQLite online backup and a native save/confirm dialog; exported DB passed SQLite `quick_check` and retained one Project/Task. Source and destination containment, symlink refusal and no-overwrite have component tests. This does **not** prove restore, signed update, another machine, Windows x64, macOS Intel, Finder first launch with a fresh Codex install, new account authentication or Claude. Developer ID, notarization and P6 release remain blocked; package is ad-hoc internal QA only.

## 2026-09-26 · Desktop dependency probe and current internal arm64 build

Current source package `desktop-dependencies-20260926`: [DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-dependencies-20260926.dmg), version `0.0.1`, SHA-256 `185bba1e93ead9b8d90a8ca1cbb236aa485ede15cab3a18c55d49df593438cb0`, 331,720,183 bytes. Built-in Electron 44.4.3, CPython 3.12.13, SQLite 3.50.4/schema35; no new npm/PyPI dependency, migration, native addon or open network listener. macOS arm64 package installation and retained-task restart passed. Host-side bounded `git --version`, `codex --version`, `codex login status` run without a shell; only allowlisted statuses/versions and proxy configured/not configured reach the UI. Installed app observed Git 2.55.0 and external Codex CLI 0.155.1 with existing ChatGPT login; it did not call a model for this check. The app does **not** bundle Git/Codex or manage a new API Key. Fresh Finder launch PATH, new-account login, credential continuity across signed update, Windows x64, macOS Intel, system DPI, Claude live acceptance, Developer ID/notarization and real update rollback remain **UNVERIFIED/BLOCKED**. Ad-hoc internal package is not a public release. An initial concurrent DMG mount failed and a first restart UI Verify wait timed out; checksum verification and subsequent serialized smoke/restart passed. Cold-start timing remains a regression watch item.

## 2026-09-26 · Desktop priority internal QA package

最新仅供内部 QA 的 macOS arm64 包为 `desktop-priority-final-20260926`：[DMG](../build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-desktop-priority-final-20260926.dmg)，SHA-256 `7ff8aedd3d32504e9aad80eded81d1936de1e652c08850d1b279a47d1f4aa890`，330,948,543 bytes，版本 `0.0.1`。从 DMG 真实安装启动验证 Electron 44.4.3、包内 CPython 3.12.13 / SQLite 3.50.4 / schema35、Host/安全渲染器和隔离数据重启；无新增 npm/PyPI 依赖、native addon、migration 或网络监听。干净 PATH 下外部 Codex 不可用被如实报告，不宣称包内自带 CLI/认证。前一相邻 `desktop-priority-20260926` 包用用户现有合法 ChatGPT 登录与 Codex CLI 0.155.1 真实运行自定义 Workflow、知识/记忆 ContextBundle、Verify、Review、Owner 接受；最终包只有 Reviewer/Done 状态 UI 修复，已从其 DMG 新装并真实读取前次独立 QA 保留数据，**没有**重跑模型。现有模型额度读取显示当时正常可用，但不等于新付费授权或跨机器认证。最终包仍 **INTERNAL / ADHOC / UNNOTARIZED**；Windows x64、macOS Intel、Finder 启动的 Codex/代理发现、Developer ID、公证、正式升级/回滚、Claude 在线验收及手机/私网 HTTPS 继续 UNVERIFIED/BLOCKED。

## 2026-09-26 · Desktop-first 排期与兼容性边界

此轮优先级调整未改变 Electron/Python/SQLite 版本、依赖、协议或权限。最新内部 Mac arm64 包仍是下述 `mobile-route-20260926`，它的安装/启动和本机移动回环证据不等于 Desktop 自定义 Workflow、知识/记忆实际 Run 或当前包完整任务闭环。原持久 Demo 的较早包有真实 Codex/Review/Verify/取消/重启证据，仍需把最新源码和安装产物对齐。Windows x64、macOS Intel、真实 DPI、Developer ID/公证、签名升级、Claude 在线验收与远程实体设备均保持原未验证/阻塞状态；手机/远程只是后置，不是兼容性通过。

## 2026-09-26 · local two-device approval contention

在当前 macOS arm64/CPython 3.12.13 上，两个独立配对的本机 HTTP 会话并发批准同一 Host/SQLite 草稿：结果恰为一个 `200`、一个 `409 REMOTE_APPROVAL_STALE`，胜者幂等重试返回原回执，败者不可读胜者回执，库中一条 TODO/一条匹配回执/零 Run。`pnpm py:check` 为 205 pytest、Ruff、mypy 全通过；无新增依赖、migration 或已安装应用代码变更。此证据不能推广为 iOS/Android 设备、私网 HTTPS、远端拒绝或其他平台的实测；P7-05/P7-09/P8 Gate 仍开放。

## 2026-09-26 · latest mobile-route internal macOS arm64 build

`mobile-route-20260926` 内部 DMG 为 `0.0.1`，SHA-256 `716ebcdc61c7c826636cce3bbc88fbcee094e2ab20c627c7a227b2fa48f4ca7d`，328,029,595 bytes。实际 DMG 安装/启动和同包 Desktop→包内 Python Host→390×844/844×390 Chromium 流程通过。显式 `/#/m` 手机路由在横屏保持 Companion；真实中文长输入、本机草稿重载恢复、焦点、≥44px 导航和无页面横向溢出已验。[844×390 实图](../output/playwright/mobile-route-20260926-packaged-landscape-844x390.png)已目视检查；旧 `policy-fence` 的横屏截图曾错误切成 Web 桌面壳，不能沿用。新包还重跑离线审批无 POST/重放、二次人工确认入 TODO、同 Project 缩权及撤销清理；隔离 Host 仍为 1 TODO/0 Run。包内 Electron 44.4.3/CPython 3.12.13/SQLite 3.50.4/schema35；ad-hoc 签名不是 Developer ID 或公证，包外 Git/Codex 仍为前置条件。Web 114 项/全 pnpm test、lint/typecheck/build、Electron smoke 通过；Python 204 项在同一 Host 源码变更后已通过。**实体 iOS/Android、私网 HTTPS、Windows/Intel 和正式发行继续未验证。**

## 2026-09-26 · previous policy-fence internal macOS arm64 build

新 `policy-fence-20260926` 内部 DMG 为 `0.0.1`，SHA-256 `937e284620d97213b6e226b47e5db307012ff03082c67177b6e2be52e1f7bdc7`，329,385,646 bytes。`pnpm smoke:package:mac` 从 DMG 安装并启动，包内 Electron 44.4.3/CPython 3.12.13/SQLite 3.50.4/schema35、隔离数据和 ad-hoc 签名验证通过；clean PATH 下 Codex CLI 不被误报为内置。`pnpm smoke:package:mobile-local` 对同一新包证明断网审批无 POST/无自动重放、缩权后的同 Project 手机会话仍有效但已读 Host 正文被自动清除、撤销后缓存/Worker 清除及旧 cookie 403；Host 数据保留 1 TODO/0 Run。新 `policyRevision` 来源于 Host SQLite；旧 SSE 修订被明确拒绝并在客户端触发权威会话重读。Python 204 pytest、Web 113 项、客户端 12 项，以及 lint/typecheck/test/build、契约/任务图和 Desktop smoke 通过。**INTERNAL / ADHOC / UNNOTARIZED**；本机 Chromium 不代替实体手机、私网 HTTPS、Windows x64、macOS Intel、Developer ID/公证、Claude 或本包 Codex 在线完整流程。旧持久 Demo 未替换。

## 2026-09-26 · previous remote-session internal macOS arm64 build

`remote-session-20260926` 内部 DMG 为 `0.0.1`，SHA-256 `e5369e497a0345b14d054a9510f7c49ada52cb0ef9441058f81843d38687f182`，328,661,673 bytes。`pnpm smoke:package:mac` 实际从 DMG 安装启动，包内 Electron 44.4.3/CPython 3.12.13/SQLite 3.50.4/schema35、安全 BrowserWindow 与隔离数据通过；测试 App 移除后数据保留，Clean PATH 下未把包外 Codex 宣称可用。更新 smoke 脚本后，`pnpm smoke:package:mobile-local` 对**同一不变的 DMG** 再次通过 Desktop→包内 Host→本机 390×844 Chromium 消息/审批→TODO→Desktop 看板，故意旧 CSRF 403 后重新人工确认，隔离库 1 TODO/0 Run。随后 Desktop 撤销设备，手机布局页面自动失去连接并清除已读 Host 消息，先前存在的 Forge PWA 静态缓存和 Worker 注册被清除，旧 cookie 得到 `403 REMOTE_AUTH_REVOKED`；三个预期原生对话框由测试控制器代行。新包包含浏览器原生能力不可用显示、会话身份防护，但安装版未实际制造有效会话轮换/SSE 无心跳；Web 111 项与客户端 12 项覆盖相应逻辑。无新依赖或 migration，未调用付费模型、未开放公网。**INTERNAL / ADHOC / UNNOTARIZED**；物理手机、私网 HTTPS、Windows/Intel、Developer ID/公证、Claude 与本包 Codex 全业务闭环仍未通过。旧可录屏 Demo 未被替换。

## 2026-09-26 · mobile session identity fence

同一项目的移动会话撤销/轮换现在使 Host 来源的会话、消息和草稿视图立即失效；迟到 HTTP 响应不能回填旧正文，重连后原会话不存在也不会把保留的未发送文字自动发到其他会话。无新增依赖、原生接口或 SQLite 迁移。`pnpm lint`、`pnpm typecheck`、`pnpm test`（Web 111 项，含 build）与真实 macOS arm64 Electron/Python Host smoke 通过。该源码现已装入上方新包，但安装 smoke 未专门制造轮换；实体手机、私网 HTTPS、Windows/Intel 仍未验证。

## 2026-09-26 · P8-10 browser/native boundary, no native runtime

PWA 指南引用 2026-09-26 查阅的 [Apple iPhone Web App 安装说明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27)、[Google Chrome Android Web App 安装说明](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en-CO)及 [Chrome PWA 安装条件](https://web.dev/articles/install-criteria)。`MobilePlatformBridge` 只是 `@forge/client` 的类型和浏览器不可用报告；没有新增 Capacitor、系统推送、Keychain/Keystore、摄像头、npm/PyPI 包或原生权限。`@forge/client` 12 tests、当时 Web 109 tests、TypeScript lint/typecheck/test/build 与任务图校验通过。本机 Chromium 390×844 构建后页面实际显示 Host 未连接和三项原生能力未接入，截图 `output/playwright/p8-10-browser-native-unavailable-390x844.png`；预览进程已定向结束。此增量已装入上方新包；Mac 以外的 iOS/Android、私网 HTTPS、Windows/Intel 与公开发行仍 **UNVERIFIED/BLOCKED**。P8-09、P8-10 均未通过完整验收。

## 2026-09-26 · packaged P8-08 reconnect QA increment

`remote-reconnect-20260926` macOS arm64 INTERNAL/ADHOC/UNNOTARIZED DMG SHA-256 `7f7e8c46ae2da02648c6aed4429800486979ab773e6a8d9b2735efebcafefc49`，324,288,597 bytes；版本 `0.0.1`，包内 Electron 44.4.3/CPython 3.12.13/SQLite 3.50.4/schema35。实际 DMG 安装/启动/包内 Host smoke 与同包 Desktop→本机浏览器授权消息/审批→TODO→Desktop 看板 smoke 均通过，旧 CSRF 拒绝后须再次人工确认。SSE 无响应建连、无心跳、停止后迟到响应、通知读失败不阻止 Task 权威刷新由 11 项客户端与 109 项 Web 测试覆盖；安装版没有主动制造断流。`pnpm py:check` 204 pytest/Ruff/mypy、TypeScript lint/typecheck/test/build、contract/task-map、Electron smoke 通过。无新增依赖、native module、SQLite migration、付费模型调用或公网 listener。实体 iOS/Android、私网 HTTPS、Windows x64、macOS Intel、签名/公证、Claude 在线验收及本包 Codex 业务闭环仍 **UNVERIFIED/BLOCKED**。

## 2026-09-26 · previous remote-boundary QA build

独立 `remote-boundary-20260925` macOS arm64 内部 DMG SHA-256 `c6c41b4f11bbcab6b453d7022ca9d7101e9f6c8b964eab875767843f16ebe40e`，330,165,715 bytes；包内 Electron 44.4.3/CPython 3.12.13/SQLite 3.50.4/schema35。实际从 DMG 安装启动和同包 Desktop→Python Host→本机 390×844 Chromium 授权消息/审批→TODO→Desktop 看板 smoke 通过；首次故意旧 CSRF 写被 403 拒绝，重新人工确认才成功。安全回归的源码包括旧回执的当前操作 scope 复核及 SSE CRLF/UTF-8 字节界限。无新增依赖/native module/迁移。未实测物理手机、私网 HTTPS、Windows x64、macOS Intel、签名/公证或 Claude 在线执行；本包也未用于新的付费 Codex 业务验收。

## 2026-09-25 · remote protocol source increment after last QA package

当前 Python 3.12.13/macOS arm64 源码在真实 SQLite/loopback HTTP 中验证设备操作 scope 缩小后旧回执返回 403；TypeScript `@forge/client` 的 SSE 测试验证 CRLF 分帧和 UTF-8 字节上限。未增加直接依赖或原生模块，SQLite schema 仍为 35。上一份已安装 `mobile-write-csrf-20260925` 包先于此增量，不将新源码测试记为该包的验证；私网 HTTPS、iOS/Android 实机、Windows x64/macOS Intel、签名公证、Claude 在线验收仍未验证。

## 2026-09-25 · latest installed-app mobile write QA artifact

独立 Mac arm64 内部 DMG `mobile-write-csrf-20260925` 的 SHA-256 为 `cb8114047684894c70c5a61144731b38aedc6785c4324d6459b09b5ef04ee1db`，328,707,678 bytes；真实安装/启动、包内 CPython 3.12.13/SQLite 3.50.4/schema35 通过。三种移动写入口（消息、人工草稿、当前草稿批准）对 Host 的 `REMOTE_CSRF_REJECTED` 均不会自动重放；108 项 Web 测试覆盖拒绝反馈/保留输入。新包浏览器验收故意轮换 CSRF，第一次审批 POST 真实 403，重新取得 token 后再次人工审阅/确认才得到 TODO；安装版 Desktop 看板可见，独立 SQLite 1 TODO/0 Run，listener/Host 定向关闭。截图 `output/playwright/mobile-write-csrf-20260925-packaged-mobile-{message,todo}-390x844.png` 已目视核对。没有新依赖、native 模块或 migration。原生确认由限定对话框的测试控制器执行；这不是物理手机或异机私网 HTTPS，也没有新的付费 Codex 调用。Windows/Intel、Developer ID/公证、Claude 及发布升级仍未验证。

## 2026-09-25 · previous installed-app approval QA artifact

独立 macOS arm64 `mobile-approval-csrf-20260925` QA DMG（SHA-256 `a24ccb3da54ae92c6deb4ba1cdb75bcd3951dfb38fd59afbe4a79fd725d31fc7`，332,000,332 bytes）实际挂载、安装、启动、退出。Electron 44.4.3 携带 CPython 3.12.13 与 SQLite 3.50.4/schema35；没有新 npm/PyPI 依赖、native addon 或 migration。新包的同 Host 本机回环浏览器验收从 Desktop 手工草稿/审批请求到手机布局浏览器显式批准，再到 Desktop 看板，退出后直接查隔离数据库为 1 TODO/0 Run，监听和拥有的 Host 已关闭。两张新截图 `output/playwright/mobile-approval-csrf-20260925-packaged-mobile-{message,todo}-390x844.png` 已目视检查。CSRF 轮换被 Host 拒绝时，页面现在提示本次未提交并刷新会话，绝不自动重放；组件测试通过。原生确认由测试控制器代行，仍非物理手机或异机私网 HTTPS；本包未重跑付费 Codex。Windows x64、macOS Intel、Developer ID/公证/正式升级、Claude 在线验收仍未验证/阻塞。

## 2026-09-25 · prior internal QA package and Draft CAS

新独立 macOS arm64 QA 包标识 `product-history-cas-20260925`；DMG SHA-256 `3c915ca5c5247a82d925ae4c9970913d35a0c7de5782456bfefd875b38aaec52`。对该包的挂载/复制/启动 smoke 确认 Electron 44.4.3、包内 Python 3.12.13、SQLite 3.50.4/schema35 与隔离数据，截图 `output/playwright/product-history-cas-20260925-packaged-home-1440x900.png` 来自真实安装应用。后续 `pnpm smoke:package:mobile-local` 在这份已安装包中由 Desktop UI 保存消息、创建/修订草稿并发起审批，同 Python Host 开启本机预览并批准设备；390×844 Chromium 读回真实消息后审阅并批准，Host 原子写入 TODO，Desktop 看板读到同一 Task。截图 `output/playwright/product-history-cas-20260925-packaged-mobile-{message,todo}-390x844.png` 已目视核对，进程/监听清理通过。该 fixture 由开发 Python 在独立临时数据目录预置 Project，但业务操作与移动页面均来自已安装包及其内置 Host；未用开发 Host 替代。测试控制器代行原生确认，不是真人或物理手机验收。一次额外测试请求轮换了 CSRF 而没有更新页面 token，审批 POST 按安全设计返回 403；移除测试干扰并完整重跑成功。尚未重做 Codex 完整业务或手机跨设备操作。源码额外以两条同版本真实 HTTP `tasks.revise` 竞争一个 Draft，证实一提交一 409、单修订/单回执；T093 完整私网多设备 Task 场景仍未验证。无新增依赖、native addon、数据库 migration 或模型调用；Windows x64/macOS Intel、真机私网 HTTPS、Developer ID/公证、正式升级及 Claude 在线验收保持未验证/阻塞。

## 2026-09-25 · mobile Host message read after preceding QA package

当前源码在 macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Chromium 390×844 验证固定授权的会话正文只读路径；没有新依赖、SQLite migration、模型调用或外网监听。真实临时 Host/SQLite 及构建后 Vue 页面显示两条用户消息；工具/系统消息、附件、无 `task:draft` grant 的设备均不通过该路径。新截图 `output/playwright/p8-06-mobile-host-message-history-390x844.png` 来自实际浏览器并已目视检查。下方 `product-progress-20260925` DMG 构建于该增量之前；上方新 QA 包也已经过安装版→同 Host→本机浏览器单条消息回读，仍不能替代真机私网 HTTPS、Windows/Intel 验收。

## 2026-09-25 · current-source internal QA package

独立标识 `product-progress-20260925` 的 macOS arm64 内部 DMG 使用 Electron 44.4.3、包内 CPython 3.12.13、SQLite 3.50.4；SHA-256 `a9f4812df03b98c5c9a4f5cb7362a55a2cb8cbfecabb7d40de9059351107c762`。从 DMG 安装到独立 QA 目录后的真实 Electron smoke 读取 Host schema 35，确认包内 Python、隔离测试数据和 ad-hoc 签名；无 Codex CLI 的 clean PATH 正确显示不可用。未在此包上运行 Codex 产品任务、物理手机、私网 HTTPS、Windows x64/macOS Intel、Developer ID/公证/正式升级，因此不能把包可启动等同完整验收。

## 2026-09-25 · P8-06 manual Contract and bounded revision checkpoint

当前 macOS arm64 的 Python 3.12.13/SQLite 3.50.4、Electron 44.4.3、Vue 3.5.43；没有新增依赖、原生模块、SQLite migration、模型调用或公网 listener。构建后 390×844 Chromium 与独立 loopback Python Host/SQLite 实测设备配对（测试控制器显式批准）、用户消息→人工 Contract→显式原因修订：数据库为 1 Message、1 Draft、2 Revisions、0 Tasks、0 Runs。截图 `output/playwright/p8-06-manual-draft-revision-390x844.png` 来自新构建的实际 Vue 页面并已视觉检查。`tasks.createDraft`/窄 `tasks.revise` 依赖实时 Project/`task:draft`/CSRF、来源和版本复核及同事务回执；手机离线文本草稿仅存当前标签的 `sessionStorage`，不自动发命令。此记录更新了下方旧检查点“草稿写仍拒绝”的历史结论。刷新页面后从同一隔离 Host 重读当前草稿并续修已在第二个构建后浏览器 fixture 验证，截图 `output/playwright/p8-06-reopened-host-draft-revision-390x844.png`；解决澄清、范围/验收删除确认、真机私网 HTTPS、当前内部旧 DMG、Windows x64/macOS Intel、Claude 与签名公证仍未验收；P7-05/P8 Gate 不变。

本轮最新源代码回归：204 个 Python pytest、Ruff/mypy、根 TS lint/typecheck/test/build、contract/task-map、Electron Desktop 和远端设备 smoke、frozen lockfile、`git diff --check` 均通过。安装版和目标平台未由这些开发路径检查代替。

## 2026-09-25 · P8-08 local reconnect and notifications checkpoint

当前源码 macOS arm64、Python 3.12.13/SQLite 3.50.4、Vue 3.5.43、Electron 44.4.3；没有新增 npm/PyPI 依赖、原生模块、SQLite migration、模型费用或公开监听。实际构建 Web 390×844 Chromium 在隔离 loopback Host/SQLite 上自动接收已提交 SSE 失效事件，再取权威 Task/Approval 快照；离页后 Host 继续新增，重新打开显示最新 3 条 Task；断网旧快照禁用操作，联网后显示最新 4 条。通知为经当前设备项目授权的最近 20 条元数据，未做后台推送。截图 `output/playwright/p8-08-mobile-notifications-390x844.png`、`output/playwright/p8-08-reopen-authoritative-tasks-390x844.png` 已视觉检查。`pnpm py:check` 203 pytest/Ruff/mypy、`pnpm test`（含 build）、合同/任务图/diff check 通过。私网 HTTPS、物理 iOS/Android、实际安装后的 Desktop→手机协同、睡眠恢复、重复 Start 幂等和当前旧 DMG 增量 **UNVERIFIED**；P8-08 IN_PROGRESS，P7/P8 门禁及 P4/P6 旧风险不变。

## 2026-09-25 · P8-07 static PWA shell checkpoint

当前 macOS arm64、Vue 3.5.43、Electron 44.4.3、Python 3.12.13/SQLite 3.50.4；本检查点没有新增依赖、原生模块、数据库 migration、模型调用或公网监听。构建后的移动 Web 在 Chromium 390×844 本地回环地址真正安装 Worker 和 `forge-shell-…` CacheStorage；隔离 Host 授权读取后断网重载显示标时脱敏数量，Host 未连接，缓存无 Task/Project 标题或正文。Host 策略服务撤销设备后，下一次浏览器联网检查移除摘要、CacheStorage 与 Worker；独立临时 SQLite 仍存 1 Project/1 Task。截图 `output/playwright/p8-07-redacted-offline-summary-scrolled-390x844.png` 和 `output/playwright/p8-07-host-revoked-cache-cleared-390x844.png`。Worker 仅持有固定静态资源，不拦截 `/v1`、POST 或证据。正式 iOS/Android 安装、私网 HTTPS 和真实 Desktop→手机异机撤销 **UNVERIFIED**；P8-07 IN_PROGRESS，P7/P8 发布门禁不变。见 ADR 0082。

## 2026-09-25 · P8-06 existing-conversation mobile message checkpoint

当前源码 macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Vue 3.5.43 / Electron 44.4.3：新增只读 Project 会话元数据与既有有授权消息写入 UI，没有新增包、native 模块、数据库 migration、模型调用或公网 listener。真实临时 Host/SQLite 和构建后浏览器 390×844 验证一次中文消息入库与 conversation revision 1→2；只读越权、分页旧 cursor、Host 原子写/回执及 UI 不确定结果不重发分别有自动检查。截图 `output/playwright/p8-06-mobile-message-{saved,receipt}-390x844.png`。只在 loopback 测试控制器批准配对，未在私网 HTTPS/真机/当前内部 DMG 验收；`tasks.createDraft`/`tasks.revise` 仍无法从权威公开 payload 无损映射本地来源与用户决定，保持拒绝。P8-06 IN_PROGRESS，Windows x64/macOS Intel、Developer ID/公证、Claude 与 P7/P8 Gate 的既有未验证状态不变。

## 2026-09-25 · P8-02 same-Desktop loopback pairing checkpoint

当前源码 macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Electron 44.4.3 / Vue 3.5.43：普通 Desktop 默认无 HTTP listener；本机原生确认后可让**同一个** Python Host 在 `127.0.0.1` 临时端口启动构建后 Web，固定 Main/Preload/Client 控制仅有 inspect/start/stop。真实独立 stdio Host 测试证明领取一次性 nonce 后 HTTP claim 改变同 Host 的配对状态、显式停止和 Host 退出都关闭端口。`pnpm smoke:remote-devices` 在实际 Electron Settings 中开启本机预览，浏览器 HTTP claim 后 Desktop 读取 claimed，选择 `task:approve` 并经原生测试控制器确认；同一 Host 回读当前 Project、操作 grant 和 cookie 会话，关闭后端口拒绝。截图 `output/playwright/p8-02-same-desktop-preview.png` 和 `p8-02-same-desktop-loopback.png` 来自实际 Electron 页面，不显示临时 nonce。无新依赖、模型费用、migration 或公网监听。它**不是**真实手机、私网 HTTPS、扫码或当前内部 DMG 的验收；Windows/Intel、签名公证、Claude 与 P7/P8 Gate 仍未验证/阻塞。见 ADR 0076。

## 2026-09-25 · P8-05 approve-only mobile checkpoint

当前源码 macOS arm64 的 Python 3.12.13 / SQLite 3.50.4 / Vue 3.5.43 / Electron 44.4.3 未增加包、native 模块、migration 或模型调用。构建后的 Web 在 390×844 Chromium 与独立 loopback Host/SQLite 完成真实当前 Task 草稿审批，最终由 Host 持久化 TODO 且运行 0 次；Python HTTP/设备策略与 Web 组件覆盖新鲜度、授权、版本/哈希、重复点击、离线和原命令回执。`pnpm py:check` 201 项 pytest、Ruff/mypy，`pnpm lint/typecheck/test`（含 build）、contracts、macOS Electron smoke/schema35 通过；期满拒绝另有定向真实 SQLite 测试。截图在 `output/playwright/p8-05-approval-{review,confirm}-390x844.png`、`output/playwright/p8-05-approved-todo-390x844.png`，截图后仅微调权限文字。当前内部已安装 DMG 不含本次增量。真机 iOS/Android、私网 HTTPS、同一 Desktop 配对、双设备并发/拒绝、其他远端危险操作 **UNVERIFIED/未实现**；P7-05/P7-10/P8 Gate 不因此通过。Windows x64、macOS Intel、签名公证、Claude 仍维持原状态。

## 2026-09-25 · P8-04 mobile Task detail and persisted Diff

当前 macOS arm64 源码构建、Python 3.12.13 / SQLite 3.50.4 / Vue 3.5.43 / Electron 44.4.3：经当前设备 Project grant 的固定同源任务详情、活动和已保存 Diff 在 Python Host/真实临时 SQLite 与 390×844 Chromium 中分层验证；实际子进程在隔离 Git 工作区产生的 Diff 经另一 Host 实例配对会话读回。Review、Verify 和人工接受证据只返回真实 SQLite 元数据，历史状态不冒充当前验收。无新增依赖、native 模块、migration、付费模型或公网监听。`pnpm py:check` 201 tests/Ruff/严格 mypy、TS lint/typecheck/test/build、合同与任务图、Electron Desktop smoke/schema35 全通过；同一源码的最新手机详情截图 `output/playwright/p8-04-mobile-task-detail-390x844.png`。Diff 筛选隐藏文件、典型凭据文件名和已知 secret 模式，不保证检测普通源码中任意未知秘密；私网 HTTPS/真机、安全闸门及新安装包 **UNVERIFIED**。Windows x64/macOS Intel、Developer ID/公证、Claude 凭据和正式升级状态不变。

## 2026-09-25 · P8-03 read-only mobile Host projection

当前源码 macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Vue 3.5.43 / Electron 44.4.3：Python Host 的可选 loopback gateway 按现有设备会话、项目授权投影当前审批和 revision-bound Task cursor page；普通 Desktop 仍不开 HTTP listener。真实 Host/临时 SQLite 的两条任务翻页、过期 cursor 409、越权拒绝和 390×844 实际 Chromium 读取/断线只读提示已验证，截图在 `output/playwright/p8-03-mobile-host-{inbox,tasks}-390x844.png`。参考 OpenAPI `TaskSummary.state` 缺少现有 Host 的 `blocked` 值且未定义 `/v1/approvals` 响应和 Task 分页端点，当前仅在生产增量 Schema 保留 Host 真实状态；只读基线未改。无新 npm/PyPI 依赖、native 模块、迁移、模型调用或公网端口。私网 HTTPS、真机 iOS/Android、同一 Desktop 实例人工配对/弱网、完整移动审批和安装版更新 **UNVERIFIED**；Windows x64/macOS Intel、Developer ID/公证和 Claude 仍是原阻塞。

## 2026-09-25 · P8-01 layout / P8-02 pairing UI in progress

当前 macOS arm64 的普通 Chromium Web 窗口实际检查 390×844 纵屏、844×390 触屏横屏、Inbox 优先导航及无 Host 的明确空态；前者 52px 导航目标，二者实际截图在 `output/playwright/p8-01-mobile-*.png`。P8-02 仅在已有同源安全网关可识别时提供一次性 nonce 输入、等待 Desktop 人工确认、Host session 状态回读与显式撤销；页面内存存储 claimSecret，长期会话由 Host 的 Secure HttpOnly SameSite cookie 承担，不持久化浏览器本地 secret。普通 Vite Web 对 `/v1/session/current` 的 HTML 回应会判为不可用并拒绝配对；截图 `output/playwright/p8-02-mobile-gateway-unavailable-390x844.png`。独立测试数据与实际构建 Web/Host 的浏览器 loopback 流程已验证 401→202→pending→本机显式批准→cookie 回读/刷新恢复→撤销/刷新拒绝；截图 `output/playwright/p8-02-mobile-loopback-paired-390x844.png`。真实联调暴露 claim 响应的 `expiresAt` 缺字段，修复并重跑成功。70 项 Vue 测试、TypeScript lint/typecheck、Web build 通过；没有新增依赖或模型调用。私网 TLS、真机 Chrome/Safari、扫码、同一 Desktop 的人工批准、真实手机配对/撤销、弱网与审批 **UNVERIFIED**。P7-10 安全闸门不通过，已安装的旧内部 DMG 不含此移动代码。

## 2026-09-25 · P7-05 narrow write / P7-09 failure checks

当前源码还新增公开 `tasks.approve` 的精确 Host-owned 授权/版本映射：批准、TODO 与持久回执使用原 SQLite 事务，不增加驱动或安装脚本。隔离 SQLite 双设备与真实 loopback HTTP 已验证成功、原命令重放、竞争新请求 409、错版/错 hash 409、缩权和撤销拒绝；未运行手机私网 HTTPS、安装版升级或指定平台。下段仅记录此前只有消息写的检查点。

macOS arm64 当前源码 Python 3.12.13 / SQLite 3.50.4 的 schema34→35 增量迁移、隔离数据库重启与在线备份检查已运行；无新增包、native addon、install script、模型费用或公网监听。真实 Host 所有的可选 loopback HTTP 现在仅允许带设备/Project/`task:draft` 授权的空附件 `conversations.send`；SQLite 同事务保存消息、revision CAS、SSE 失效与持久 CommandReceipt。跨 Host 重启同 key 重放、冲突 409、私有回执 GET、两设备同 key 隔离和撤权后拒绝已真实测试。真实独立 Host/gateway 测试进程被精确 PID kill 后 SSE EOF、端口拒绝，新进程可读取原数据和会话；session 到期关流、旧 cookie 401。其他远端写、私网 HTTPS、真机浏览器/睡眠、现有用户真实数据目录升级、新安装包、Windows x64、macOS Intel、签名/公证/升级仍 **UNVERIFIED/BLOCKED**。不把当前 loopback 证据扩展成 P7-05/09 整项通过。

## 2026-09-25 · P7-08 local device-management UI

当前 macOS arm64 源码构建的真实 Electron→Preload→Main→Python Host→SQLite 路径，使用独立临时数据目录及 Project 服务生成设备后，通过 Settings 完成列表、只读缩权、审计和本机确认撤销；Host 回读 revision 3/会话 0。真实窗口截图 `output/playwright/p7-08-remote-device-{management,authorized}-1440x900.png` 已视觉检查。普通 Web 无本地设备访问；正常 Desktop 不启动远程网关，不存在可提供的 Host 地址或证书。私网 HTTPS、真实手机、Windows/Intel、现有用户数据库升级与安装包新版本 **UNVERIFIED**；仍无正向远程写入。没有新增依赖或模型调用。

## 2026-09-25 · P7-07 device operation policy

macOS arm64 当前源码：Python 3.12.13 / SQLite 3.50.4、schema33→34 增量迁移和在线备份实测；已批准旧设备默认无操作 scope，Project/operation 缩权、撤销、审计及重启保持。真实 Draft/Approval 修订使远端旧批准 409；认证 loopback HTTP 的缩权、第二设备撤销和 SSE 关闭/旧 cookie 写 403 实测。`pnpm py:check` 198 pytest/Ruff/mypy、TS lint/typecheck/test/build、合约/任务图、Electron smoke/schema34 通过；未新增依赖或执行付费模型。当前已安装的内部包不是此 schema34 构建；实际用户数据迁移、私网 HTTPS/手机、Windows x64、macOS Intel、签名/公证/升级 **UNVERIFIED**。P7-05 正向写仍 403。见 ADR 0081。

## 2026-09-25 · P7-06 project event stream

macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Electron 44.4.3 / Vue 3.5.43 当前源码实测。SQLite schema32→33 仅新增 project-scoped remote event outbox/index/triggers；含旧 Task/Run 的独立测试 DB 迁移、重复迁移和重启游标真实通过。Host/loopback HTTP 测试覆盖已提交的 Run/Approval 等最小事件、过期游标 snapshot 恢复、重复订阅、项目隔离、撤销/缩权和 8 流限制；完整 194 Python 测试、Ruff/mypy、TypeScript build/test、Electron smoke/schema33 通过。无新 npm/PyPI 依赖、install script、模型调用或公开端口。当前已安装的内部 DMG 仍是先前 schema32 构建，未自动升级；真实用户数据库升级、私网 HTTPS、浏览器 Secure Cookie、手机、Windows x64、macOS Intel、签名升级 **UNVERIFIED**。远端写入继续 403，P7-05 与 P6/P4 正式门禁不变。见 ADR 0080。

## 2026-09-25 · bundled Codex local enablement control

macOS arm64 当前源码上的 Electron 44.4.3 / Python 3.12.13 实测固定 Preload→Main→Host 停用通道、无活跃 Run 时 DisposableScope 清理、SQLite 偏好重启保存及重启装配。无新依赖、native 模块、外部凭据或模型费用。启用不热替换已绑定的调度器，必须退出并重开 Forge；原安装版 DMG 尚未包含该 UI/Host 改动，Windows/macOS Intel 未验证。`pnpm smoke:plugin-control` 的两张截图来自真实 Electron 开发构建而非原型。此修复不改变插件权限，也不使 Claude 可用。

## 2026-09-25 · P7-04 remote session loopback probe

macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Electron 44.4.3 / Vue 3.5.43；无新增 npm/PyPI 依赖、安装脚本、外部服务或付费调用。独立临时库从 schema31→32 真实迁移、online backup、数据保留和重启通过；Host 正常开发启动达 schema32，Renderer 安全桥不变。真实 127.0.0.1 HTTP 用例在 Host-owned SQLite event loop 上验证同源、Secure HttpOnly SameSite=Strict cookie、CSRF、rotation、revoke 和限速。该 HTTP 不代替**私网 HTTPS/真机浏览器**；已安装内部 Mac Demo 是先前 schema30 原 DMG，未重打包。Windows x64、macOS Intel、正式签名/升级、用户生产数据库迁移、代理证书和第二手机 **UNVERIFIED**。P6 公开发行与 Claude 第二执行器仍 BLOCKED。见 ADR 0078。

## 2026-09-25 · P7-03 local pairing

macOS arm64 / Python 3.12.13 / SQLite 3.50.4 / Electron 44.4.3 / Vue 3.5.43 当前开发路径；无新增 npm/PyPI 依赖、安装脚本、模型调用或网络监听。独立临时库 schema30→31 使用既有 WAL online backup 与事务 migration，保留旧 metadata、Project/Task/Run 数据模型，重启可读；真正用户生产目录升级 **UNVERIFIED**。当前已安装内部 DMG 的 bundled Host 仍是 schema30，SHA-256 和隔离 Demo 数据未变。真实 Python Host stdio、Electron arm64 smoke 和 185 Python pytest 通过。私网 HTTPS、手机、cookie session、CSRF、SSE、Windows x64、macOS Intel、签名、公证、正式升级仍 **UNVERIFIED**；Claude 在线验收继续 BLOCKED。见 ADR 0077。

## 2026-09-25 · Windows staging and offline update preflight

Windows x64 package/staged Host paths are implemented but have **not run on Windows**. The manual Windows QA workflow is not evidence until executed; there is no signed Windows installer, UAC/Chinese path/DPI/full-task or uninstall result. On macOS arm64, packaged Python path tests and an intentional Windows-builder platform rejection pass. Existing Electron 44.4.3/uv CPython 3.12.13 versions remain pinned. `cryptography==50.0.1` (Apache-2.0 OR BSD-3-Clause), already transitive in `python/uv.lock`, is now exact direct dependency for Ed25519 update preflight; [official PyPI metadata](https://pypi.org/project/cryptography/50.0.1/) lists Python 3.12 and Windows x64/macOS arm64 wheels, but Forge Windows use remains **UNVERIFIED**. Offline signed-fixture integrity and schema29→30 staged SQLite migration passed on current macOS; no production release public key, installed updater, Host-exclusive DB cutover, signed package or credential continuity has been tested. P6-07/P6-08 release acceptance remain BLOCKED; exact development exceptions do not pass P6 Gate.

## 2026-09-25 · Internal installed-app product workflow

The existing macOS arm64 `Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg` (SHA-256 `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`) was mounted and copied to a separate QA install location. Its packaged Electron 44.4.3 launched its bundled CPython 3.12.13 Host, SQLite schema30, production Web and plugin lock. A real Codex 0.155.1 run, independent Review, Verify, Owner acceptance, cancellation and restart durability passed against isolated data and a disposable Git repo. The installed app was launched with the current user's PATH and authorized ChatGPT login. With a clean Finder-like PATH and empty Codex home, the same package stayed healthy but reported Codex unavailable. Therefore Codex CLI/login/Git and any necessary approved proxy are external prerequisites; Finder PATH and fresh-user Codex discovery remain **UNVERIFIED**, not a self-contained claim. Full evidence and screenshots: `docs/demo/p6-internal-macos-package.md`. P6-06 signing/notarization/T111–T113 and Windows/macOS Intel remain **BLOCKED/UNVERIFIED**; the `P6-06 → P6-07` exception is development-only.

## P6-06 · 内部 Mac 包与分发门禁 · 2026-09-25

本机 macOS arm64、Electron 44.4.3、Node 22.22.0、pnpm 12.3.4、uv 0.11.14、uv-managed CPython 3.12.13、Python SQLite 3.50.4/schema30。`@electron/asar@4.3.0`（MIT，官方要求 Node >=22.12）精确锁定；其新增 `glob@13.0.6`、`minipass@7.1.3`、`path-scurry@2.0.2`、`lru-cache@11.5.3` 为 BlueOak-1.0.0，已列入许可证清单。依赖仅用于构建内部 `app.asar`，不开放安装脚本、权限或新网络端口。官方 [Electron 应用分发文档](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[签名文档](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[@electron/asar 4.3.0 release](https://github.com/electron/asar/releases/tag/v4.3.0)、[uv managed Python](https://docs.astral.sh/uv/concepts/python-versions/) 于 2026-09-25 核验。

真实 `pnpm package:mac:internal` 组装 ad-hoc 签名、未公证 `.app` 与经 `hdiutil verify` 的 DMG；`pnpm smoke:package:mac` 从挂载 DMG 拷贝到隔离 QA 安装目录，使用一次性用户数据根，Electron packaged 分支、Web UI、安全沙盒、包内 Python Host/SQLite schema30、退出归属 PID 清理和移除 app 后用户数据保留通过。`codesign --verify --deep --strict` 通过仅说明本机 ad-hoc 密封一致；`Signature=adhoc`、`TeamIdentifier=not set`，不能证明 Developer ID、公证或 Gatekeeper 分发。Keychain 当前只有 Apple Development 身份。macOS x64、真实新用户账号/系统 Gatekeeper、正式安装升级/回滚、凭据跨签名升级、Finder 启动 Codex、Windows 和 CI runner **UNVERIFIED**。P6-06 BLOCKED，完整 P4/Claude BLOCKED；见 ADR 0073。

## P6-05 · macOS Desktop window/tray and owned Host lifecycle

核验日期 2026-09-25。macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 的开发路径，未新增 npm/PyPI 依赖、数据库 schema、native addon、安装脚本或外部付费服务。真实 Codex app-server 长任务的关窗取消、托盘后台、第二实例复用原 Host、应用安全退出与归属 PID 消失已验证。损坏 SQLite 的 degraded Host 可提供零活跃工作摘要并正常关闭；crashed Host 退出需要明确确认。174 Python pytest/Ruff/mypy、TS test/lint/typecheck/build、真实 Desktop/诊断/生命周期 smoke 通过。macOS 实际系统休眠、正式签名包内托盘资源、Windows x64 托盘行为、macOS Intel、强制 Renderer 崩溃和物理 DPI **UNVERIFIED**；T003/T004/T005 仍递延，T002/T114 当前范围有真证据。P4-05/P4-10/full P4 Gate 继续 **BLOCKED**。见 [ADR 0072](decisions/0072-owned-host-window-and-tray-lifecycle.md)。

## P6-04 · Diagnostic bundle and imported artifact retention

核验日期 2026-09-25。macOS arm64 的 Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 开发路径上，Python-only Host 的增量 schema29→30 在独立临时数据库通过，旧 Artifact 在显式清理前仍可读取；清理仅使过期导入正文为空并保留墓碑，重启后不可读，较新记录不受影响。真实 Electron Settings 的预览/导出字节相同；含 token 日志和项目路径未入包。没有新 npm/PyPI 依赖、native module、安装脚本、网络端口或模型调用。`pnpm py:check` 173 测试/Ruff/严格 mypy、合约/任务图、TS lint/typecheck/test/build、真实 Desktop/诊断 smoke 均通过。Windows x64、macOS Intel、真实用户 DB 迁移、签名安装包与凭据跨升级 **UNVERIFIED**；T111～T114 及完整 T084 保留精确递延，P4-05/P4-10/full P4 Gate 仍 **BLOCKED**。见 [ADR 0071](decisions/0071-allowlisted-diagnostics-and-imported-artifact-retention.md)。

## P6-03 · Isolated local preview and saved Run diff

核验日期 2026-09-25。macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 版本不变；无新增 npm/PyPI 依赖、native artifact、数据库 migration 或安装脚本。真实 Electron 临时 localhost Preview `webContents` 在 ephemeral session 中没有 preload/Node/Forge bridge，sandbox/contextIsolation/webSecurity/disableDialogs 为 true；HTTP/WebSocket 跨 origin、`file:` 导航与新窗口被阻断。Playwright 1.63.0 对 `disableDialogs` 已压制的 alert 会发出失效 Dialog 事件，无法用该驱动宣称 JS/原生弹窗全项通过；T083 完整用例留 P6-09。T081 凭据引用与 T085 多层权限交集也留 P6-09；T084 导出预览留 P6-04。Windows、macOS Intel、安装包/签名、真实用户数据、原生文件选择/打印 **UNVERIFIED**。P4-05/P4-10/full P4 Gate 不变，Claude 未调用。见 [ADR 0070](decisions/0070-isolated-local-app-preview.md)。

## P6-02 · Keyboard, long Chinese text and layout stress

核验日期 2026-09-25。当前 macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 不变；无新依赖、native build、数据库 schema 或安装脚本。真实 Electron 离线 fixture 的 Ctrl/Cmd+K、嵌套焦点与 120 字中文 Task/长 Unicode Project 路径、Desktop 重启及抽屉焦点恢复通过。1280×800/1600×1000 的 CSS zoom 100/125/150% 只验证当前 Web 布局；媒体仿真的 reduced-motion 只验证 CSS 状态。Windows 150% 与 Mac Retina 物理 DPI **UNVERIFIED**，T108→P6-07；真实 Run/Workflow 减少动画全链 T110→P6-09。P4-05/P4-10/full P4 Gate 继续 BLOCKED，Claude 未调用。见 [ADR 0069](decisions/0069-keyboard-overlay-and-dpi-evidence.md)。

## P6-01 · Light/dark production tokens and read-only Workflow history

核验日期 2026-09-25。macOS arm64 / Electron 44.4.3 / Vue 3.5.43 / Python 3.12.13 / SQLite 3.50.4 的现有版本未变化；无新 npm/PyPI 依赖、native 构建、安装脚本或数据库 schema。真实 Electron 使用当前 Python Host 的 JSON-RPC stdio 和新增固定只读 `workflow.getPublished`，两端严校验，旧 RunConfig 不改变。浅/暗阅读卡实测正文对比 4.85:1 / 9.63:1，1280 CSS zoom 125% 非 Windows 系统 DPI 证明。Windows x64、macOS Intel、安装包/签名、真实用户 DB 升级仍 **UNVERIFIED**。T029 同一 fixture 的旧 Run/新发布版 UI 全链路仍归 P6-09，P4-05/P4-10/full P4 Gate **BLOCKED**；Claude 未调用。见 [ADR 0068](decisions/0068-p6-visual-theme-and-published-workflow-readback.md)。

## P5-12 · Populated schema25→29 upgrade and DSL version diagnostics

2026-09-25，在 macOS arm64/Python 3.12.13/SQLite 3.50.4/Electron 44.4.3/Vue 3.5.43 开发路径，含真实 P3 批准 Task、Run/RunConfig 与 P4 Profile 的独立 schema25 临时库升级到 schema29 并重复迁移后仍可读，`foreign_key_check` 无错误，备份存在。Python Host 与 Desktop 画布导入对未来 Workflow DSL schemaVersion 明确诊断；无自动降级或数据重写。171 Python pytest/Ruff/mypy、冻结安装、合同/任务图、TS lint/typecheck/test/build、真实 Desktop smoke 和 diff check 通过。没有新增依赖、安装脚本、网络端口或付费模型调用。生产参考 OpenAPI 仍仅描述未来远程 Gateway，本地 JSON-RPC stdio 继续使用 `forge-local-jsonrpc/v1`；不宣称 HTTP 可用。P5 Phase Gate 在共用 DSL 与已验证 quick 链的开发范围通过，Planner/strict 运行没有验收。实际用户数据、Windows x64、macOS Intel、安装包/签名、DPI **UNVERIFIED**；P4 full Gate 仍 BLOCKED。见 P5 报告（已归档）。

## P5-11 · Published linear Workflow / retrieval freeze

2026-09-25，macOS arm64 的 Electron 44.4.3、Vue 3.5.43、Python 3.12.13 与 SQLite 3.50.4 开发路径：真实 Codex app-server 经 Python Host 在已发布 quick 同语义四阶段链上形成开发快照，独立 Verify/Review/人工最终验收完成；另一次知识 Run 的当前引用被撤销后，Desktop 历史上下文正确标记 revoked。实际本机 schema29，未新增 npm/PyPI 依赖、安装脚本、数据库迁移、网络端口或 Renderer Node/SQL 权限；没有 Claude/Anthropic 调用。自定义工作流运行只支持严格线性四节点，其他发布定义仍可编辑但执行时拒绝。全局 16 次尝试预算在真实 SQLite/Verifier fixture 中触发 blocked；默认旧 standard 路径仍为 20。`pnpm py:check` 169 测试及全量 TS/合约/任务图/Desktop smoke 结果见实施状态。P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED；Windows x64、macOS Intel、安装包、真实用户库升级、非线性图及第二 Executor **UNVERIFIED/UNSUPPORTED**。见 ADR 0067。

## P5-10 · Memory Center Desktop bridge and Vue UI

2026-09-25，在 macOS arm64 的 Electron 44.4.3/Vue 3.5.43/TypeScript strict/Python 3.12.13/SQLite 3.50.4 开发路径，固定 `invokeMemory` 与 Pydantic/Zod 双侧封闭命令、候选编辑 CAS、人工确认/撤销、FTS 清理及实际窗口交互通过。截图 `output/playwright/p5-10-memory-desktop.png` 来自真实 Electron。未新增依赖、安装脚本、网络端口、Renderer Node/SQL 能力或付费模型调用。实际用户 DB、Windows x64、macOS Intel、安装包/不同 DPI **UNVERIFIED**；历史 Run 来源撤销显示留 P5-11，见 ADR 0066。P4-05/P4-10/full P4 Gate 不变。

## P5-09 · Host-owned Project Memory / SQLite schema29

2026-09-25 在 macOS arm64、Python 3.12.13、SQLite 3.50.4 上，独立临时库从既有迁移链增量到 schema29；真实 Python Host JSON-RPC 与 162 个 Python pytest、Ruff、严格 mypy、TS lint/typecheck/test/build 和 Electron Desktop smoke 通过。FTS5 trigram 仅索引经过确认的有效记忆；撤销清空正文和索引、保留审计事件。只读数据库也逐项校验过期和来源，避免失效事实进入结果。本轮无新 PyPI/npm 依赖、native addon、安装脚本、网络端口、Renderer DB/文件权限或付费模型调用。Windows x64、macOS Intel、安装包内 SQLite FTS5 和真实用户 DB 28→29 升级 **UNVERIFIED**。P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED，见 ADR 0065。

## P5-08 · Python Stage Context Builder

核验日期：2026-09-25。macOS arm64、Python 3.12.13/SQLite 3.50.4、Electron 44.4.3/Vue 3.5.43 的现有依赖图上实现只读 Stage Context 预览；没有新增依赖、安装脚本、SQLite migration 或模型调用。真实 Host 测试及 Vue UI 测试通过；真实 Electron bridge 验证未知 Run 的明确错误，尚无成功预览的 Electron 截图。UTF-16 字符预算不代表 Codex/Claude 的实际 token 费用。Windows/Intel/安装包/真实用户 DB 升级 **UNVERIFIED**；P4-05/P4-10/full P4 Gate 不变。见 ADR 0064。

## P5-07 · SQLite FTS5 / 中文字符索引

核验日期：2026-09-25。macOS arm64、Python 3.12.13、SQLite 3.50.4 的真实 Python Host 和构建后 Electron Desktop 已运行 schema28 FTS5 trigram；Python/Host/真实 Desktop 的中文短词、`start_date`、跨项目范围和索引撤销测试通过。没有新增 npm/Python 依赖、安装脚本或模型调用。`pnpm smoke:desktop` 使用独立临时数据目录，不改真实用户数据库。Windows x64、macOS Intel、安装包内 SQLite FTS5 支持及真实用户库 schema27→28 升级 **UNVERIFIED**；P4-05/P4-10 与完整 P4 Gate 仍 BLOCKED。详见 ADR 0063。

## P5-06 · Project document ingestion · 2026-09-24

Python Host 在 macOS arm64/Python 3.12.13/SQLite 3.50.4 上以增量 schema27 真正读入受信 fixture 文档、保留 SHA-256/行号，并在撤销时保留无正文墓碑。Electron 44.4.3 + Vue 3.5.43 的实际 Desktop smoke 完成导入、定位、撤销；Node/Renderer 不能直接读取源码。未新增 pnpm/PyPI 依赖、native binary 或安装脚本。Windows x64、macOS Intel、真实用户数据迁移、安装包及高并发恶意文件替换 **UNVERIFIED**。P5-07 的 FTS/中文检索与缓存一致性尚未验证，不能将导入成功当作检索成功。

## P5-05 · Workflow revision locks · 2026-09-24

沿用 Python 3.12.13、SQLite 3.50.4、schema26 与 `forge-host-protocol/v5`；无新增依赖、native binary、安装脚本或数据库 migration。macOS arm64 的真实 SQLite/Host/RunConfig/RunService fixture 验证旧 Run 的 v1/hash 在发布 v2 时不变，新 Run 可明确冻结 v2/hash，重启后保留；Electron smoke 验证只读影响预览。自定义 Workflow 节点运行、Windows x64、macOS Intel、安装包/签名、真实用户数据库升级仍 **UNVERIFIED**。

## P5-04 · Vue Flow canvas · 2026-09-24

macOS arm64 上 `@vue-flow/core@1.48.2` 与 Vue 3.5.43、Vite 8.3.0、Electron 44.4.3 的实际构建和真实窗口 smoke 通过；画布节点、有限返工连线、Host 编译错误高亮和 JSON 往返均在真实 Vue 界面验证。`zod@4.6.4` 是既有精确锁定的工作区版本，现作为 Web 画布文档的直接依赖。Vue Flow 为 MIT、无本轮授权的安装脚本；参考 [官方文档](https://vueflow.dev/)与[仓库许可证](https://github.com/bcakmakoglu/vue-flow/blob/master/LICENSE)。Windows x64、macOS Intel、安装包和不同 DPI 尚未实测；本轮结论只适用于当前 macOS arm64 开发运行时。

## P5-03 · Linear Workflow editor and SQLite schema26

核验日期：2026-09-24；macOS arm64。无新增 pnpm/PyPI 依赖、native addon、安装脚本、网络端口或模型调用。Python SQLite 从 schema25 增量到26，增加 `workflow_drafts` 与对齐参考 SQL 字段的不可变 `workflow_revisions`；临时库迁移/重启/回滚通过，真实用户数据目录升级仍 **UNVERIFIED**。Electron Main/Preload 新增一个固定 `invokeWorkflow` 方法，按精确命令白名单和 TS/Python 双端 Schema 校验；Renderer 仍无 Node/DB/任意 Host 方法。真实 Electron/Python Host 成功保存并发布由本机已验证 Codex Profile 绑定的 quick 模板副本，同时拒绝缺绑定/循环草稿的发布。截图：`output/playwright/p5-03-workflow-desktop.png`。自定义 Workflow 执行、旧 Run 版本冻结、Windows x64、macOS Intel、安装包/签名仍 **UNVERIFIED**。完整 P4 Gate 继续 BLOCKED。见 ADR 0059。

## P5-02 · Python Workflow compiler

核验日期：2026-09-24；macOS arm64 开发路径。沿用 Python 3.12.13、Pydantic v2 与现有 pnpm/uv 锁；不新增依赖、安装脚本、native addon、SQLite migration、网络端口或 Renderer 桥。固定 Host 方法只读预检并在缺少实际 Planner/Verifier 绑定时返回不可运行。冻结安装、contracts/task-map、145 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、真实 Electron smoke 与 diff check 全部通过。三种完整 Workflow 的可执行性、发布版本冻结与运行时行为仍 **UNVERIFIED**；Windows x64、macOS Intel、安装包和签名仍 **UNVERIFIED**。P4-05/P4-10 与完整 P4 Gate 继续 BLOCKED。见 ADR 0058。

## P5-01 · Bundled workflow presets

核验日期：2026-09-24；macOS arm64 开发路径。Python Host 用随 wheel 打包的标准/快速/严格 JSON 定义和 Pydantic 严格类型，不依赖运行时参考目录，不新增 PyPI/npm 包、native addon、安装脚本、SQLite migration、端口或 Renderer 权限。`uv build` 的 wheel 含三份模板；参考 Workflow Schema 校验与本地静态拒绝测试通过，冻结安装、合同/任务图、TS lint/typecheck/test/build、Electron smoke 和 diff check 通过。完整 Workflow 编译器、Planner 运行、已安装绑定/能力匹配、模板发布/版本冻结和三模式端到端运行尚未验证；Windows x64、macOS Intel、发布安装包 **UNVERIFIED**。P4-05/P4-10/P4 Gate 仍 BLOCKED。见 ADR 0057。

## P4-10 · Bounded plugin acceptance and single-Executor development gate

核验日期：2026-09-24；macOS arm64 开发环境，现有 Codex 登录，无 Anthropic Key/在线请求。未新增依赖、native addon、安装脚本、SQLite migration 或 Renderer 权限。局部 Registry adapter 替换 fixture 和 134 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、合同/任务图、真实 Electron smoke 均通过。真实 Codex/Python Host Desktop 全链第一次 Review 无结构化结果而正确失败；一次有限重试通过开发、Verify、Review、人审和显式本地合并。不同的第二 Executor、Claude 在线认证失效、生产 Verifier 插件替换、正式 T116～T120 评测、Windows x64、macOS Intel、发布安装包与签名均 **UNVERIFIED**。P4-05/P4-10/P4 完整 Gate 继续 BLOCKED；P5 仅有开发排期例外。见 `docs/p4-development-scope-report.md`。

## P4-09 · Plugin fault diagnostics

核验日期：2026-09-24；macOS arm64 开发路径。沿用 Python 3.12.13、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、SQLite schema25 与 Codex 0.155.1；无新增依赖、native addon、安装脚本、数据库 migration、任意 Renderer IPC 或外部网络服务。受信内置插件激活/运行/卸载异常只输出稳定安全 code、pluginId、时间和受影响 Run ID。真实 Host/SQLite 项目及 Board 读路径在插件激活失败后仍可用；133 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、真实 Electron smoke、合同/任务图与 diff check 通过。未知第三方插件进程崩溃、恶意同进程 Python 代码、Windows x64、macOS Intel 和发布安装包 **UNVERIFIED**。Claude 运行中凭据失效未在线执行；P4-05 BLOCKED。见 ADR 0056。

## P4-08 · Controlled Tool/MCP contract

核验日期：2026-09-24；macOS arm64 开发路径。`jsonschema==4.26.0`（MIT，Python ≥3.10）由既有传递依赖提升为精确直接依赖；`types-jsonschema==4.26.0.20260518`（Apache-2.0，Python ≥3.10）仅供严格 mypy。版本记录与 uv 锁已更新，没有新 native addon、安装脚本、外部 MCP 服务、数据库迁移或 Renderer 权限。实际运行 128 Python pytest/Ruff/严格 mypy、冻结安装、合同/任务图、TS lint/typecheck/test/build、Electron Desktop smoke 和 diff check，均通过。T076～T080 是本地工具契约和 MCP fixture；任意第三方 MCP 服务的认证、进程/网络所有权及安全隔离未启用/未验收。Windows x64、macOS Intel 与发布安装包 **UNVERIFIED**。见 ADR 0055。

## P4-07 · Python ModelProvider and Codex app-server

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Codex CLI/app-server 0.155.1，现有本机 Codex 登录。锁定内置插件从 `0.0.1` 升为 `0.0.2`（manifest/entry/config 三文件内容 hash 重新计算）；没有新增 PyPI/npm 包、安装脚本或凭据。Python ModelProvider 的 Codex 实现与 Coding Executor 分离；真实 app-server 会话返回结构化 JSON、10 条文本增量及 `thread/tokenUsage/updated` 的 20,629 输入/15 输出 tokens。Usage 事件缺失时保持 `null`；没有从文本估算。官方 [Codex App Server 协议](https://learn.chatgpt.com/docs/app-server) 有 `model/list`、`item/agentMessage/delta`、`thread/tokenUsage/updated`；实际字段由本机 0.155.1 CLI 生成的 Schema 和实测确认。该协议未文档化 turn 级可执行 token 上限，Codex 收到非空 token 限额请求会拒绝，Forge 仅强制执行字节/时间边界。

`pnpm test:python-refiner-live` 独立 Host 草稿与人工审批通过；`FORGE_MODEL_PROVIDER=disabled` 经 Desktop 环境白名单传给 Host，真实离线手工闭环和 TODO 重启恢复通过。普通 Web 不获得本地模型能力。P4-07 完整冻结安装、契约/任务图、121 Python pytest/Ruff/严格 mypy、TS lint/typecheck/test/build、Desktop smoke 与 diff check 通过。旧版插件 hash 冻结在原 RunConfig 中，不把运行中旧版本自动升级或静默续接。Claude/其他 Provider 认证、Windows x64、macOS Intel、安装包与签名仍 **UNVERIFIED**；P4-05 BLOCKED，完整 P4 Gate 未通过。见 ADR 0054。

## P4-06 · Codex-only development dependency exception

核验日期：2026-09-24。公共 Python Executor 契约、现有 Codex app-server 路径、P2/P3 真实闭环和既有只读/审批门禁可用于不依赖 Claude 执行的开发。用户授权的例外仅允许 P4-05→P4-06，及以后完成适用 P4 验收才可能启用的 P4-10→P5-01；权威依赖不变，P4-05 仍 BLOCKED。Claude 未配置 Key、未注册 Adapter、未运行模型，不能宣称可用。完整 P4 Gate 与多执行器发布验收未通过。P4-06 在 macOS arm64 的 Electron→Python Host→Codex 路径上实测 Developer Profile 编码与 Reviewer Profile 只读审查；schema v25 升级与重启保留已有数据的独立临时库测试通过。冻结 pnpm/uv 安装、contracts/task-map、115 Python pytest/Ruff/严格 mypy 46 源文件、TS lint/typecheck/test/build、Electron smoke、diff check 通过；没有新增依赖或许可证变动。Claude 仍不可选，T041 双真实执行器与 P4 完整 Gate 待验。macOS arm64 开发路径是当前证据；Windows x64、macOS Intel、安装包、签名、DPI、真实用户库升级与历史 Codex utilityProcess crash recovery 均 **UNVERIFIED**。见 ADR 0052。

## P4-05 · Claude Agent SDK offline compatibility gate

核验日期：2026-09-24。官方 [Agent SDK 概览](https://code.claude.com/docs/en/agent-sdk/overview) 和 [Python SDK 参考](https://code.claude.com/docs/en/agent-sdk/python) 确认 Python SDK 可管理会话/工具/权限/流；第三方产品认证应走 API Key，不借用 claude.ai 订阅登录。官方 [v0.2.159 release](https://github.com/anthropics/claude-agent-sdk-python/releases/tag/v0.2.159) 对应本轮精确版本。`python/uv.lock` 固定 `claude-agent-sdk==0.2.159`；macOS arm64、Python 3.12.13、uv 0.11.14 的真实受控子进程加载随包 Claude Code CLI `2.1.281` 并只调用 `--version`。`pnpm probe:claude-offline` 返回 `apiKeyConfigured=false`、`liveVerified=false`；无 API 请求、Agent、模型、审批、续接、取消或打包验证。当前本机 `claude` 用户 CLI 2.1.159 不是 Forge SDK 随包 CLI，也未用于 Forge 认证。

SDK Python 代码的包许可证为 MIT；SDK/CLI 服务使用还受 [Anthropic Commercial Terms](https://code.claude.com/docs/en/agent-sdk/overview#license-and-terms) 约束。新增 SDK 直接依赖和 26 个锁定传递依赖，含 `mcp 2.2.0`、`cryptography 50.0.1` 与 `uvicorn 0.53.0`；只作为 SDK 依赖安装，Forge 本地通信未启动 HTTP/TCP Server。许可证见 `docs/python-dependency-licenses.json`；Windows-only `pywin32` 与 Pyodide-only `httpx2-jsfetch` 仅锁定、当前 macOS 未安装，其许可取 PyPI 包元数据。安装使用项目本地 uv 冻结环境，没有全局配置、sudo 或绕过安装脚本。Windows x64、macOS Intel、打包后的随包二进制、认证/网络/事件、SDK CLI 子进程的整树取消与任何真实 Claude Run 均 **UNVERIFIED**。P4-05 **BLOCKED**，见 ADR 0052。

## P4-04 · Plugin schema form and inspection

核验日期：2026-09-24。macOS arm64，Electron 44.4.3、Vue 3.5.43、Vite 8.3.0、Python 3.12.13；独立 Python Host 与实际 Desktop bridge 返回锁校验的内置 `forge.executor.codex@0.0.1` 空配置 Schema，正式插件页在真实 Electron 中打开并截图。`pnpm smoke:desktop` 还验证 sandbox/contextIsolation、无 Node Renderer、degraded/crashed/owned Host cleanup。当前只是受限配置表单与只读兼容诊断；未创建/存储凭据，未保存插件配置，未测试任意第三方插件。T106～T110 的跨页面/双主题/Windows DPI/完整动效部分映射至 P6，未标通过。无依赖、native、SQLite 或锁文件版本变动；Windows x64、macOS Intel、暗主题、安装包和签名路径 **UNVERIFIED**。见 ADR 0051。

## P4-03 · Bundled plugin package lock and Run lease

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、Electron 44.4.3、SQLite 3.50.4/schema24、Codex CLI/app-server 0.155.1。内置插件 `forge.executor.codex@0.0.1` 的 manifest/entry/config 三文件 SHA-256 与包摘要固化在随 wheel 打包的 `plugins.lock.json`；真实 wheel/sdist 构建含四文件。无新 PyPI/npm 依赖、native addon、安装脚本、TCP 或 SQLite migration。真实 Electron→Python Host→Codex Run 的隔离 SQLite RunConfig 保存了插件 ID/版本/内容 hash；完整 Verify/Review/人审/本地合并回归与真实 Desktop smoke/schema24 通过。首次 P3 live 在直接注入测试 Executor 时遇门禁，修复为仅对 Registry-owned 生产 Adapter 生效后完整重跑 exit 0。108 Python pytest、Ruff/严格 mypy、TS lint/typecheck/test/build 通过。锁是同一应用包的完整性约束，不是第三方签名或 OS 沙箱；Windows x64、macOS Intel、发布安装包及真实运行中替换物理插件文件仍 **UNVERIFIED**。见 ADR 0050。

## P4-02 · Python plugin resource scope

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、Electron 44.4.3、SQLite 3.50.4/schema24。仅使用 Python 标准库 asyncio/importlib 与现有 Pydantic；无新增直接/间接包、native addon、安装脚本、TCP 服务或数据库 migration。`DisposableScope` 对同步/异步资源逆序清理，注册句柄幂等；10 次真实 Python 子进程激活/停用均等待自身 PID 退出。105 Python pytest、Ruff/严格 mypy、TS lint/typecheck/test/build、真实 Electron Desktop smoke 和任务图校验通过。当前受信 Codex 插件仍是 Python Host 同进程模块，资源生命周期不构成恶意插件沙箱；Windows x64、macOS Intel、安装包内插件和真实 Codex 长 Run 期间热升级仍 **UNVERIFIED**。见 ADR 0049。

## P4-01 · Python bundled plugin manifest preflight

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、Electron 44.4.3、SQLite 3.50.4/schema24、Codex CLI/app-server 0.155.1。Python API `1.0.0` 与插件 `forgeApiRange` 使用明确 exact/caret 范围解析，和产品版本 `0.0.1` 分开；当前受信 Codex 清单为插件 `0.0.1`/`^1.0.0`，只声明 darwin-arm64。Pydantic 2.13.5 校验公开清单形状，标准库检查包内来源和闭合配置 Schema；没有新包、安装脚本、native addon、网络端口或 SQL migration。98 Python pytest、Ruff/严格 mypy、TS 检查/构建、真实 Electron Desktop smoke/schema24、Codex 本机探测和 diff check 通过。错误清单与 import sentinel 证明非法声明在 entry 执行前被拒；这不等于任意第三方 Python 代码沙箱或 Windows/Intel 已通过。安装包内插件数据路径、Windows x64、macOS Intel、第三方插件故障隔离仍 **UNVERIFIED**。见 ADR 0048。

## P3-12 · Python-only Desktop delivery acceptance

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema24、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Electron→Python Host→Codex 的开发/Verify/Review/人审/显式本地合并及另一套 Electron 混合状态 Board 路径通过；六个隔离 Git/SQLite/进程异常场景通过，正式 P3 截图已目视核对。冻结 pnpm/uv 锁未新增依赖、native addon、安装脚本、TCP 或 Renderer 权限；`pnpm py:check` 83 pytest、Ruff/严格 mypy 和 TS lint/typecheck/test/build、Desktop smoke/schema24 均通过。T116–T120 Agent 评测仍分别映射 P6-09/P9-06 为 `DEFERRED_VERIFICATION`，不是 P3 已通过的测试。真实用户 DB v23→24、Windows x64、macOS Intel、打包后 Python/Codex、安装包/签名/DPI、在线模型强制二次 Review 退回及恶意第三方插件隔离仍 **UNVERIFIED**。见 ADR 0047 与 P3 报告。

## P3-11 · Python SQLite backup/artifact storage, schema v24

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema24、Electron 44.4.3、Vue 3.5.43、Node 22.22.0。使用 Python 标准库 `sqlite3.Connection.backup`，无需 native addon、新包、安装脚本、全局工具或本地 TCP。独立 SQLite/子进程/Host 实测 WAL 在线备份、恢复、FK、v23→24 升级前备份、失败 migration 回滚、真实 SQLite FULL 诊断及私有 Artifact 导入；Desktop smoke 在实际 Python Host 上返回 schema24 并验证 ready/degraded/crashed。插件存储 API 仅提供 manifest-scoped JSON 接口，不代表恶意同进程代码已被 OS 隔离。数据库备份覆盖其内的正式元数据与导入证据，不覆盖外部 Git CodeSnapshot 对象。真实用户库升级、备份的长期轮转/离机恢复、Windows x64、macOS Intel、安装包内 Python/SQLite/Codex、DPI、签名与第三方插件隔离仍 **UNVERIFIED**。见 ADR 0046。

## P3-10 · Python Task revision invalidation and SQLite v23

核验日期：2026-09-24；macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema23、Electron 44.4.3、Vue 3.5.43、Node 22.22.0。新增 additive migration v23 与固定 task.change JSON-RPC；无新第三方依赖、native addon、install script、TCP、凭据或 Renderer Node 权限。隔离真实 SQLite/Git、独立 Python Host 重启和 Electron smoke 验证版本记录、旧 RunConfig 保留、当前报告失效及 schema23 健康状态；没有真实 Codex 在中途收到目标修改的在线测试。现有用户数据库 v22→23 升级、Windows x64、macOS Intel、安装包内 Python/SQLite/Codex、系统 DPI、签名及安全接管旧进程仍 **UNVERIFIED**。见 ADR 0045。

## P3-09 · Python Host crash recovery and merge reconciliation

核验日期：2026-09-24；macOS arm64、Python 3.12.13、SQLite 3.50.4/schema22、Electron 44.4.3、Vue 3.5.43、Node 22.22.0。无新增依赖、原生扩展或安装脚本；沿用冻结 pnpm/uv 锁。隔离进程的实际 `os._exit` 注入验证持久 intent 前后 Git commit 的启动对账，不会自动重做合并；真实 Run/lease/journal fixture 验证保留不确定状态与 PID reuse 防护。普通 Electron Desktop smoke 仍通过 Python-only Host 的 ready/degraded/crashed、安全桥与退出；**没有把真实 Codex Host 硬崩溃后的孤儿进程自动清理或原生续接标为通过**。历史 PID 的 kernel start identity 无跨进程可确认来源，本版只报告并隔离，绝不按 PID 猜测杀进程。真实用户旧 DB、Windows x64、macOS Intel、安装包内 Python/Git/Codex、签名/DPI 与外部并发 Git 写者仍 **UNVERIFIED**。见 ADR 0044。

## P3-08 · Python delivery/merge and SQLite v22

核验日期：2026-09-24。macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 22、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Git/SQLite/Host JSON-RPC 验证显式本地双父合并、重复操作键、Git 成功后 Host 重启对账、目标分支前移拒绝、验收后证据变化失效；真实 Electron→Python Host→Codex 的开发/Verify/Review/人审/合并纵向链通过。原生确认取消不创建操作；正式 UI 只更新本地 `main`，无 push/deploy。migration v21→22 仅增加不可变交付与 merge intent 表，隔离库旧 metadata 保留、重复 migration 不重放；真实用户现有数据库升级 **UNVERIFIED**。无新直接依赖、安装脚本、native addon、TCP 服务或 Renderer Node 权限。Git 合并在 Host 线程内有界执行，SQLite 连接未跨线程；并发外部 Git 写者、长合并操作、Windows x64、macOS Intel、安装包内 Python/Git/Codex、签名/DPI、Host 硬崩溃孤儿清理仍 **UNVERIFIED**。T057 通用外部 Artifact 路径/MIME 校验仍属 P3-11。见 ADR 0043。

## P3-07 · Python final acceptance and SQLite v21

核验日期：2026-09-24。macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 21、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。独立 Git/SQLite/Host 测试覆盖证据哈希 CAS、旧快照拒绝、明确 AC 决定、非安全 Reviewer 建议的 Owner 版本化豁免、阻断 Issue 拒绝豁免、接受持久性和人工退回新 Attempt；真实 Electron→Python Host→Codex 完成开发/Verify/Review/最终验收，Board Done 而源 Git 未变。migration v20→21 仅附加两张不可变决定表，隔离库旧记录保持；真实用户现有数据库升级 **UNVERIFIED**。无新增包、install script、native addon、凭据、TCP 服务或 Renderer 权限。真实 Codex 本次未返回 advisory，因此在线豁免路径 **UNVERIFIED**；Host/Git/SQLite fixture 和 Vue 测试通过。Windows x64、macOS Intel、安装包内 Python/Codex、DPI/签名、Host 硬崩溃未知副作用对账（T034→P3-09）仍 **UNVERIFIED**。见 ADR 0042。

## P3-06 · Python bounded rework and SQLite v20

核验日期：2026-09-24。macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 20、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Git/SQLite/owned subprocess 测试覆盖 Review/Verify 共用返工计数、失败快照的独立新 Attempt、三次/二十次上限、取消停止与 source repo 无修改；真实 Electron→Python Host→Codex 开发及通过的 Verify 作纵向回归，但未强制制造 live Codex Review blocker。v19→20 只增加 `rework_cycles`，隔离库中升级与旧数据留存通过；实际用户已有数据库升级 **UNVERIFIED**。没有新增包、安装脚本、native addon、凭据、本地 TCP 或 Renderer 权限。Host 突然死亡后的未知副作用对账 T034 在 P3-09；Windows x64、macOS Intel、安装包内 Python/Codex、签名/DPI 和真实上游 429 **UNVERIFIED**。见 ADR 0041。

## P3-05 · Python acceptance matrix and SQLite v19

核验日期：2026-09-24。macOS arm64 开发路径，Python 3.12.13、SQLite 3.50.4/schema 19、Electron 44.4.3、Vue 3.5.43、Node 22.22.0、Codex CLI/app-server 0.155.1。真实独立 Python Host、Git/SQLite/子进程和 Electron 固定 bridge 证明逐条 AC 保持 `inconclusive` 直至用户将当前快照的真实报告和理由明确绑定；错误退出不通过，风险接受与覆盖状态不等于最终 Task Done。v18→19 在隔离库真实升级、旧 metadata 保留、重复 migration 无新增变更；真实用户现有库升级 **UNVERIFIED**。UI 真实截图 `output/playwright/p3-05-python-desktop-acceptance-1440x900.png` 已查看。没有新直接依赖、install script、native addon、TCP 服务或凭据；沿用已有 pnpm/uv 锁定版本。Windows x64、macOS Intel、安装包内 Python/Codex、Host 硬崩溃恢复及 T055 正式 Owner 风险接受 actor/version **UNVERIFIED**，后者在 P3-07。见 ADR 0040。

## P3-04 · Python project command verifier and SQLite v18

核验日期：2026-09-24。当前 macOS arm64 开发路径：Python 3.12.13、SQLite 3.50.4/schema 18、Electron 44.4.3、Node 22.22.0、Codex CLI/app-server 0.155.1。真实 Git/SQLite/ProcessController 测试确认批准 argv 的 PASS 文本不能覆盖 exit 7，超时不报成功，无 test 为 `not_configured`，输出证据按项目 UUID 限定、固定 `text/plain`、有界且脱敏；验证副本可删除而源 Git 不变。真实 Electron 固定桥→Python Host→Codex 开发快照→批准 Node 测试 Preset 的纵向链路返回 `passed`/exit 0，快照 `ca377444-d54a-4b09-92cf-4b5c07f2a593`，Verify Job `295339f0-1ef1-4242-b06e-8626419a2924`。v18 只新增 Verifier Job/Report/Artifact 表和不可变触发器，隔离库 v17→18、重启持久和 Host 独立进程通过；用户现有数据库升级 **UNVERIFIED**。没有新增依赖或 install script，使用已有 Python 标准库、Pydantic 和 Git。项目脚本有本机执行能力，当前依赖 Project Trust 与明确批准的 CommandPreset；不声称恶意脚本被 OS 沙箱限制。Windows x64、macOS Intel、安装包内 Python/Node/Git、Host 意外死亡后的进程孤儿清理与通用外部报告文件导入 **UNVERIFIED**；T057/T059/T060 延后追踪。见 ADR 0039。

## P3-03 · Python Review job, SQLite v17 and Desktop read-only Reviewer

核验日期：2026-09-24。macOS arm64、Python 3.12.13、SQLite 3.50.4/schema 17、Electron 44.4.3、Vue 3.5.43、Codex CLI/app-server 0.155.1 与本机现有 gpt-6-sol 认证。真实 Electron/固定桥→独立 Python Host→Codex 完成开发快照后的原生只读 Review，并返回结构化 `approved` 报告；来源 Git 未变，UI 实际截图在 `output/playwright/p3-03-python-desktop-review-1440x900.png`。SQLite v17 只增 Job/Report/Issue/Occurrence/Handoff 表和不可变触发器；隔离库的 v15/16→17、重启持久性与外键通过，实际用户已有数据库升级 **UNVERIFIED**。没有新增 Python/npm 依赖、native addon、install script、凭据或本地网络服务；Review 仍走版本化 stdio。Windows x64、macOS Intel、安装包内 Python/Codex、真实用户数据库、Host 意外死亡后的 Codex orphan 恢复 **UNVERIFIED**。见 ADR 0038。

## P3-02 · Reviewer structured output

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Pydantic 2.13.5、Codex CLI/app-server 0.155.1、gpt-6-sol。在真实固定 CodeSnapshot 的只读审查副本中，Codex 的 `run.completed.structuredOutput` 满足本地 `ReviewResult` Schema，实际结果为 `inconclusive`（输入未含完整 Diff），未当成批准。真实读取命令事件可观察，另一次写入审批被拒且无文件变化。生产 Reviewer Profile 与 prompt 随 wheel 打包；参考 Profile 的 `codex-sdk` 名称保留，生产映射为 `executor.codex`。本任务未新增第三方依赖、安装脚本、数据库迁移、Renderer IPC 或凭据。Windows x64、macOS Intel、安装包内可执行文件/沙箱行为及 Host 异常死亡恢复 **UNVERIFIED**。见 ADR 0037。

## P3-01 · Snapshot-pinned read-only review copy

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Git CLI、Codex 0.155.1 app-server 的真实隔离副本和写入审批拒绝通过；能力探测明确 `readOnlyEnforced=true`/`native-sandbox` 才允许准备副本，生产请求固定 `read-only + approval: never`，运行后真实 Git status/tree 校验。未增加第三方依赖、install script、数据库 migration、Renderer IPC、模型凭据或全局工具。`pnpm test:review-copy-live` 有真实 `approval.requested`/`approval.resolved=reject` 事件且无文件写入；模型文本没有结构化命令事件时不当作命令执行证据。Windows x64、macOS Intel、安装包内 Codex/沙箱可用性、Host 异常死亡孤儿副本恢复仍 **UNVERIFIED**。T050 的旧 base 合并重验属于 P3-08，当前没有执行或标通过。

## P2-10 · Python-only real vertical Demo

核验日期：2026-09-24。macOS arm64，Electron 44.4.3、Python 3.12.13、SQLite schema 16、Codex CLI/app-server 0.155.1；真实 gpt-6-sol Run 经 Desktop 固定 bridge 和本地 stdio 完成隔离工作区修改、测试、Diff、CodeSnapshot/Handoff。真实提供方中断和独立用户取消分别留下 failed/cancelled 证据；无 Handoff 被伪造为成功。人工 Diff 记录见 `docs/demo/p2-python-vertical.md`。没有新增直接依赖、安装脚本、数据库 migration、Renderer 权限或全局工具变化。模型能力和网络认证是本机即时状态；一次 no-change 的真实 Codex 完成被正确拒绝作为 P2 成功证据。Windows x64、macOS Intel、安装包内 Python/Codex、签名/公证、DPI、Git SHA-256 与 Host 突然死亡后的 owned 子进程恢复仍 **UNVERIFIED**。

## Python-only Desktop cutover · MIG-PY-09

核验日期：2026-09-24。当前 macOS arm64：Electron 44.4.3、Vue 3.5.43、Vite 8.3.0、Node 22.22.0 用于 UI 构建，Desktop 唯一业务 Host 是项目本地 CPython 3.12.13，SQLite 3.50.4/schema 16，Codex CLI/app-server 0.155.1。Main→Host 的 `forge-local-jsonrpc/v1` 经 stdio；无本地 TCP/FastAPI，Node utilityProcess Host 未从 Desktop 启动。系统握手、真实 Project P1 离线闭环、真实 Codex 开发 Run/Diff/Handoff、真实取消、存储降级、Host 崩溃、退出 PID 清理与 dev launcher Ctrl+C 清理通过。Python 的 migration v16 只增 `python_host_metadata`，隔离库上 v15→v16 与旧行存续通过；实际用户开发 DB 文件不存在，**真实用户数据升级 UNVERIFIED**。没有新增第三方依赖、运行时模型凭据或全局工具变动。

CI 增加官方 `astral-sh/setup-uv` action 的固定 commit `c771a70e6277c0a99b617c7a806ffedaca235ff9`（v9.0.0）和 uv 0.11.14 / Python 3.12.13 的 `pnpm py:check`；配置依据为 [uv 官方 GitHub Actions 指南](https://github.com/astral-sh/uv/blob/main/docs/guides/integration/github.md)。本轮只在 macOS arm64 本机执行质量链，**GitHub Linux CI 运行结果 UNVERIFIED**。Windows x64、macOS Intel、Linux 生产 Host、DPI、安装包 `.asar`/Python/Codex 打包路径、签名、公证与突然 Host 死亡后的 Codex orphan 处理仍 **UNVERIFIED**。旧 Node `better-sqlite3` ABI 记录是历史 parity，不再代表 Desktop 生产数据库。见 ADR 0035。

## Python bundled plugin runtime · MIG-PY-08

核验日期：2026-09-24，macOS arm64、Python 3.12.13、Pydantic 2.13.5。内置 `forge.executor.codex` 的 manifest、空配置 Schema、入口与真实 adapter 均在 wheel 中；发现时不执行入口，API `^1.0.0`、`process.v1`、`workspace.read/write` 与 `process.spawn` 通过 Python Registry 门禁。真实独立 Python Host 经 Registry 解析 Codex 后完成隔离 Git fixture Run/Handoff；无新增包、安装脚本、全局环境变动或用户 DB 修改。`supportedPlatforms` 当前仅声明已测的 `darwin-arm64`；Windows x64、macOS Intel、安装包路径与签名仍 **UNVERIFIED**。同进程内置插件是受信代码，不是第三方安全沙箱。见 ADR 0034。

## Python Codex app-server Executor · MIG-PY-07

核验日期：2026-09-24。本机 macOS arm64、Python 3.12.13、现有 `codex-cli 0.155.1`/ChatGPT 登录、Pydantic 2.13.5。Python Host 经 `ProcessController` 启动 app-server stdio；十组真实 live case 覆盖认证、动态模型目录、结构化输出、独立 Git worktree 中两文件修改与 fixture 测试、文本/命令/文件/usage 事件、长命令取消、审批批准与拒绝、跨 Python 进程 continuation，以及 Python Host P1 批准 TODO→Run→Handoff。实测能力文件随 wheel 打包，严格匹配 CLI 版本与平台；MCP tool-call 未触发，`toolEvents=false`，网络策略未强制，`networkPolicyEnforced=false`。没有新 Python/npm 包、install script、全局安装、API Key 或用户数据修改。Python 使用本机 `PATH` 上的已有 Codex 可执行文件并核对精确版本；安装包内可执行文件发现、Windows x64、macOS Intel、离线网络、Host 突然死亡后的子进程恢复 **UNVERIFIED**。Desktop 仍由旧 Node Host 写业务库；Python-only 切换/验收在 MIG-PY-09。见 ADR 0033。

## Python worktree, process and Run infrastructure · MIG-PY-06

核验日期：2026-09-24。本机 macOS arm64、Python 3.12.13、标准库 SQLite 3.50.4、Git CLI、Electron 44.4.3。独立测试仓库中真实 Git worktree、来源隔离、任务分支、进程组父子孙取消、端口释放、Run/Attempt/Context/快照/交接及重启持久化通过；Python Host stdio 独立进程读取真实 Run。没有新增 Python 包、native addon 或 install script，`uv.lock`/`pnpm-lock.yaml` 的直接依赖未因 MIG06 变动。Desktop smoke 仍是 Node 业务 Host + 只读 Python Host 的**迁移中**组合，尚非 Python-only 产品验收。真实 Codex 写入/事件/批准/取消映射需 MIG-PY-07，Python-only Desktop P1/P2 验收需 MIG-PY-09。Windows x64、macOS Intel、Linux process backend、安装包、签名、DPI、异常 Host 死亡后孤儿进程的可确认清理 **UNVERIFIED**；历史 PID 不作为自动杀进程依据。见 ADR 0032。

## Python P1 domain and Codex refiner · MIG-PY-05

核验日期：2026-09-24。macOS arm64、Python 3.12.13、Pydantic 2.13.5、SQLite 3.50.4；真实 Python Host 子进程对 schema 15 的隔离 SQLite 完成离线手工 Task 闭环与重启持久化。现有本机 `codex-cli 0.155.1` app-server 和已登录会话在只读隔离目录完成在线结构化草稿、澄清/人工审批/TODO、重启读回；无新增依赖、凭据或安装脚本。Codex [官方 app-server 文档](https://learn.chatgpt.com/docs/app-server)核对了 stdio JSON-RPC、thread/turn、结构化输出及只读权限，本机实时 `model/list` 选择可用模型；模型可用性是动态的，不宣称跨版本稳定。Refiner 只收到有限项目摘要，不读取项目源码，也不运行项目脚本。

当前 Desktop 的 P1 命令仍经历史 Node Host；Python Host 对共享库只读，尚未成为生产业务写者。直接使用 `ForgePersistence` 私有 SQL helper 的服务边界、Codex 子进程树归属、安装包内 Python/Codex 路径均需 MIG-PY-06/09 完成与复验。Windows x64、macOS Intel、系统 DPI、安装包/签名、Codex utilityProcess crash recovery **UNVERIFIED**。见 ADR 0031。

## Python SQLite parity · MIG-PY-04

核验日期：2026-09-24。macOS arm64：Python 3.12.13 内置 `sqlite3` 报 SQLite **3.50.4**，Node `better-sqlite3@13.0.3` 在 Desktop smoke 报 SQLite **3.53.4**。冻结旧 15 版 SQL/checksum 与 Node registry 严格一致；同一隔离库的 Project/Task/Run 行与事务写入互通。Python 自身 v16 additive migration 只在测试库执行，未对用户库升级。Desktop 迁移桥的 Python Host 用只读连接，真实 schema 15 ready 与损坏库 degraded 已实测。没有新增数据库第三方包/native 安装脚本，Python 标准库 SQLite 即驱动。用户实际 development DB 文件在核验时不存在；Windows x64、macOS Intel、安装包、共享库长期双进程压力、真实用户库升级 v16 **UNVERIFIED**。见 ADR 0030。

## Python Host stdio · MIG-PY-03

核验日期：2026-09-24。macOS arm64 的 Python 3.12.13 Host 由 Electron 44.4.3 Main 以独立受控子进程启动；`forge-local-jsonrpc/v1` 行分帧与 `forge-host-protocol/v5` 握手真实通过。Desktop 诊断读到真实 PID、Python 版本、degraded Storage；主动 SIGKILL Python Host 后 UI 显示 crashed，Renderer 无 Node/任意 IPC。`pnpm py:check`、`pnpm smoke:desktop` 通过。当前使用开发工作区 `.venv` 可执行文件；安装包内嵌 Python/跨平台可执行路径、Windows x64、macOS Intel、Linux CI **UNVERIFIED**。Python Host 尚未打开 SQLite；既有 Node/utilityProcess 的 Storage ready 不是 Python Storage ready。

## Python Core bootstrap · MIG-PY-02

核验日期：2026-09-24。macOS 27 arm64 上 `uv 0.11.14` 使用项目本地 CPython `3.12.13`，系统 `python3` 仍为 3.11.9，未修改全局环境。精确直接版本：Pydantic 2.13.5、pytest 9.1.1、pytest-asyncio 1.4.0、Ruff 0.16.8、mypy 2.3.1、构建后端 Hatchling 1.32.4；来源为各包 [PyPI 官方元数据](https://pypi.org/)，锁定传递版本和哈希见 `python/uv.lock`，许可证逐包见 `docs/python-dependency-licenses.json`。uv 的 [项目同步文档](https://docs.astral.sh/uv/concepts/projects/sync/)确认 `--frozen` 按现有 lockfile 同步。`uv lock --check`、`uv build --no-sources`、`pnpm py:check` 均通过；Pydantic-core 原生 wheel 在本机真实导入。uv/hatchling 构建会执行其受控构建后端；没有打开 pnpm 全局安装脚本或使用 sudo。Windows x64、macOS Intel、Linux CI、安装包内 Python 运行时与 Python Host 启动 **UNVERIFIED**。

## Python Core migration baseline · MIG-PY-01

核验日期：2026-09-24。用户批准 Python 3.12+ 独立 Host 替代 Node/TypeScript 业务 Runtime，Desktop/UI 保留 Electron/Vue/TypeScript。本地协议目标是有版本 JSON-RPC over stdio；MIG-PY-01 尚未引入 Python 依赖、启动 Python Host 或改变 SQLite。既有 frozen pnpm 安装、契约、任务图、lint、typecheck、test、build、真实 Electron Desktop smoke 和 diff check 在 macOS arm64 最终通过。下面 P0～P2 的 Node/Electron utilityProcess 结果是**历史 parity baseline**，不能写作 Python、Windows x64 或 macOS Intel 验收通过。现有 `forge.sqlite` 数据与 schema_migrations 必须保持兼容；迁移测试用独立副本，不重置真实用户数据。P2-10 暂停，P3 未启动。见 ADR 0029。

## P2-09 · Git CodeSnapshot and structured handoff

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3`，SQLite schema 15。真实 Git SHA-1 工作区 commit/tree 与 `refs/forge/snapshots`、临时 index 和源码 worktree 隔离已验证；Git SHA-256 格式仓库尚未实测。已认证 `@openai/codex@0.155.1` app-server 真正创建未跟踪测试文件，快照哈希和 Host-only SQLite 交接记录在重启后保持。没有新增第三方依赖、native addon、安装脚本或 Renderer 权限。内置 secret gate 对已知路径/模式、符号链接和未扫描二进制采取保守拒绝，但不能保证发现所有未知凭据。Git ref 与 SQLite 事务无法跨系统原子提交，未发布 orphan ref 的回收待 P3-09。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 与全链正式工作流仍 **UNVERIFIED**。

## P2-08 · Host-internal Run cancellation and bounded timeout

核验日期：2026-09-24。macOS 27.0 arm64，Node Host 22.22.0；Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3` SQLite schema 14。新增 `run_cancel_intents` 持久化取消原因/时间，原 v11 Run CHECK 与旧 migration checksum 不变。真实本机 Node 父子孙进程树和已认证 `gpt-6-luna` app-server 长命令取消均确认退出，取消后无继续写入；桌面 utilityProcess 构建/启动与 schema 14 健康探测经 smoke 回归。无新第三方依赖、原生模块、安装脚本或 Renderer 权限。进程组不确定时保留隔离；Windows 进程后端仍不可用。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 和跨 Host 重启副作用对账仍 **UNVERIFIED**。

## P2-07 · Read-only Run inspection and bounded Diff

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、Vue 3.5.43、Vite 8.3.0、`better-sqlite3@13.0.3`。SQLite schema 13 真实迁移并在 Electron Desktop 加载；固定私有 `forge-host-protocol/v4` 仅新增 `run.list`/`run.inspect` 只读命令，Renderer 没有 FS/SQL/任意 IPC。真实已认证 Codex app-server Run 与 Desktop 读模型、文本 Diff 截图在 macOS arm64 验证；没有新增包、原生安装脚本或许可证项。已知密钥模式、Cookie 与 Authorization 被脱敏，但通用机密识别不作绝对保证，正式交付产物需 P2-09 secret gate。事件与 Diff 均有明确上限；`cost=null` 表示未知而非零。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-06 · Bounded ContextBundle and working checkpoints

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3` SQLite schema 12。真实 Codex app-server `@openai/codex@0.155.1` 隔离写入时生成、持久化并重启读取有来源的 ContextBundle 与 12 个 checkpoint；Electron Desktop smoke 和 P1 离线 Desktop 回归在 schema 12 通过。无新增依赖、原生模块、安装脚本或 Renderer 权限。字符上限不是精确 token 预算；tokens/turn 未由 Provider 报告时保留 unknown，不记成 0。真实预算超额的记录不被丢弃，跨角色预算停止属于后续。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-05 · Host Run/Attempt durable scheduler

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3` SQLite schema 11、本机锁定的 `@openai/codex@0.155.1` app-server。真实临时 Git 工作区 Codex Run 写入、标准事件、sessionRef、fixture 测试及重启 DB 持久性通过；Electron Desktop smoke 和 P1 离线 Desktop 闭环在 schema 11 回归通过。429 测试使用确定性故障注入，未声称真实服务发生 429。无新增第三方包、原生模块、安装脚本、Renderer 权限或生产 Start 命令。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、真实上游 429、Codex utilityProcess crash recovery 与生产版本内容解析继续 **UNVERIFIED**。

## P2-04 · Codex scheduled write probe

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、锁定 `@openai/codex@0.155.1` 本地 app-server、SQLite schema 10。当前已有 ChatGPT session/模型目录可用；无需新账号或 Key。独立临时任务分支真实写入、事件流、sessionRef、fixture `npm test` 和源工作树未变通过；现有 `pnpm test:workspace-live` 长命令取消与父/子/孙退出再次通过。未增加依赖、安装脚本、数据库迁移或 Renderer 权限。Codex `networkPolicyEnforced=false`；提示词中的禁止联网不是强制隔离。正式 Run 状态、Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-03 · Executor 公共契约与上游消息门禁

核验日期：2026-09-24。macOS 27.0 arm64，Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、SQLite schema 10。无新增第三方包、原生模块、安装脚本、迁移或 Renderer IPC。继续使用 `@openai/codex@0.155.1` 本地 stdio app-server；本轮补的是标准 Attempt request 与上游结构校验，未重新进行云端写入/live cancel 验收。真实双适配器、Profile/model 选择和正式 Run 失败语义保留至各自 Task。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-02 · Git task worktree 与租约 epoch

核验日期：2026-09-24。macOS 27.0 arm64、Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、SQLite schema 10；未新增依赖、原生模块、安装脚本或 migration。真实 Git 中文/空格路径 fixture 的 Forge 任务分支、base commit/tree、并发单写、lease epoch 递增、旧 lease 拒绝及源工作树不变已验证；P1 离线 Electron/SQLite 闭环回归通过。`@forge/workspace` 的 JSON journal 是当前 Host 的私有所有权记录，尚不是跨 Host 的事务锁；生产 Run/Attempt 数据库租约要在 P2-05 验证。工作区排除策略目前只冻结配置，P2-09 才会执行交付快照过滤。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P2-01 · RunConfig 冻结快照

核验日期：2026-09-24。macOS 27.0 arm64；Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3`，生产 SQLite schema 10 在真实 Desktop smoke 中加载。新增 migration 只含 Host 内部 `run_config_snapshots` 与不可变触发器；精确依赖版本、锁文件、许可证、原生安装脚本策略均未改变。已批准 TODO + Environment 的冻结、变更设置后读取、存储重启、拒绝陈旧/跨项目/重复请求在真 SQLite 测试通过。尚未启动 Run，workflow/profile/plugin 的真实版本解析和运行中动态设置隔离需 P2-05 及 P4/P5 实证；T031–T035 保留 `DEFERRED_VERIFICATION`。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-10 · 离线手工集成路径与阶段门禁

核验日期：2026-09-24。本机 macOS 27.0 arm64 的 Electron 44.4.3 utilityProcess Node 24.21.0、Node Host 22.22.0、Vue 3.5.43、Vite 8.3.0、SQLite schema 9。`pnpm smoke:p1-offline` 真实加载 Host/SQLite：独立空 `CODEX_HOME`、空 Key 项与不可达 HTTP(S) 代理下，手工消息→草稿→批准→TODO→重启保留通过；没有调用 Codex 或执行 fixture 的项目脚本。不可达代理只覆盖相应 HTTP(S) 客户端设置，**不是**操作系统网络隔离。无新增包、原生模块、安装脚本或数据库 migration。P1-10 权威验收引用与后续 Run/身份/Agent 评测前置能力的冲突见 ADR 0018；用户已批准阶段范围 DONE；未运行的 T116–T120 与其他后续能力用例仍为 `DEFERRED_VERIFICATION`，不计作通过。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-09 · 自然语言控制提议

核验日期：2026-09-24。本机 macOS 27.0 arm64，Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、Vue 3.5.43、Vite 8.3.0、SQLite schema 9。未添加第三方依赖、原生模块、安装脚本或迁移；私有 `forge-host-protocol/v4` 仅增加严格固定的 `intent.propose`，旧 Host 命令和握手回归通过。真实 Host/SQLite 与 Electron smoke 验证持久化用户消息可生成来源绑定提议，恶意 `intent.execute` 无白名单入口，已批准 TODO 未被改变。该规则解析器仅适合有限明确表达，模型解释、真实 Run 暂停/恢复、已批准任务优先级变更均待后续契约与验收。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-08 · Task 详情来源读模型

核验日期：2026-09-24。macOS 27.0 arm64 的 Electron 44.4.3 utilityProcess Host、Node Host 22.22.0、Vue 3.5.43、Vite 8.3.0、SQLite schema 9 真实加载；未增加外部依赖、原生模块或安装脚本。私有 `forge-host-protocol/v4` 的固定 Board 命令增量加入 `task.detail`，旧命令与握手回归通过。Task 深链使用 URL hash，Main 的 IPC 来源校验仅忽略同一文档的 hash，查询参数/路径/来源窗口仍受限；本机安全测试和 Electron smoke 均通过。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-07 · 看板投影与同列排序

核验日期：2026-09-24。本机 macOS 27.0 arm64：Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、Vue 3.5.43、Vite 8.3.0、`better-sqlite3@13.0.3`，SQLite schema 9 真实加载。新增的只有 `apps/web`→`@forge/core` 内部 `workspace:*` 依赖，精确第三方版本、许可证库存和安装脚本策略未变。v8 含已批准 TODO 的真实 SQLite 迁移测试证明 position 与事件游标回填正确；Electron Desktop 的真实 Host/SQLite 看板、手工草稿批准、同列重排、重启持久化和 1280×800 水平滚动通过。Web 无本地 Host 时仍只显示不可用，不越权访问 SQLite。

私有 `forge-host-protocol/v4` 增加严格 `board.snapshot` 与 `tasks.reorder` 白名单命令；旧 Host/Renderer 组合不会被误认为兼容。当前生产 `tasks.state` 只有 `todo` 可达；五列中其余状态取决于后续业务状态机，不能把纯投影 fixture 写成运行时验收。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-06 · 人类审批与 SQLite 原子入 TODO

核验日期：2026-09-24。本机 macOS 27.0 arm64：Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、`better-sqlite3@13.0.3`，生产 SQLite schema 8 真实加载。私有 `forge-host-protocol/v4` 增加固定批准命令，旧命令与桌面 Host 握手回归通过；不同版本 Desktop/Host 的混用仍由协议握手拒绝。新依赖只有内部 `@forge/core` workspace 链接；其直接类型依赖是**既有精确版本** `@types/node@22.20.4`，MIT，已同步 `pnpm-lock.yaml`、`versions.lock.json` 和既有许可证库存。安装脚本继续禁用。

真实 Node Host IPC 并发和 Electron/SQLite smoke 通过：重复批准仅一个 TODO/事件，事件插入故障会回滚 Task/Revision/Decision，Host 重启后已批准状态仍在；Desktop Renderer 无 Node/Shell/DB。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。

## P1-05 · 草稿修订与澄清

核验日期：2026-09-24。没有新增第三方依赖或安装脚本；继续使用 Node Host 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、better-sqlite3 13.0.3 与现有 pnpm lockfile。SQLite schema 由 6 升为 7，macOS 27.0 arm64 的 Node/真实 Electron Desktop 加载和读写通过；v6 当前草稿仅回填一个可验证快照，无法捏造迁移前的完整编辑历史。私有 Host 协议 `/v4` 只扩展固定 `draft.revise`/`draft.history` 命令；安全边界和既有握手不变。Windows x64、macOS Intel、系统 DPI、`.asar`/安装包、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。

## P1-04 · 整理器与草稿（macOS arm64 实测）

核验日期：2026-09-24。Node Host 22.22.0、Electron 44.4.3 utilityProcess 内 Node 24.21.0、macOS 27.0 arm64。未增加新的第三方版本：`@forge/refiner` 复用已锁定的 `zod@4.6.4` (MIT)，`@openai/codex@0.155.1` (Apache-2.0) 由既有 Executor Adapter 按明确只读权限启动。精确工作区依赖已在 `pnpm-lock.yaml` 与 `versions.lock.json` 记录；依赖脚本仍关闭。SQLite schema 6 在 Node Host 与 Electron utilityProcess 本机加载；新的 Draft 协议为既有私有 `forge-host-protocol/v4` 的固定命令扩展。

Node Host 的真实模型调用已对 feature、bug 和模糊需求生成结构化结果并保留澄清问题；无需新 API Key，依赖本机已登录的 Codex 会话。第一次 Electron 在线 Smoke 失败：UtilityProcess 的 `process.execPath` 是 Electron Helper，原 CLI 子进程没有 `ELECTRON_RUN_AS_NODE`，草稿得到真实 `REFINER_FAILED`。只对 Electron Host 所拥有的 Codex CLI 子进程显式设置 `ELECTRON_RUN_AS_NODE=1` 后，CLI/app-server 确实启动；第二次 Electron 在线 Smoke 仍收到 `EXECUTOR_TIMEOUT`，发现 Main 原先只给 Host 三个 Forge 环境变量，没有转发当前本机模型连接所需的无凭据 HTTP(S) 代理。现已加入 Main→Host 的最小运行时/代理环境白名单，第三次真实 Electron 在线 smoke 已通过，结构化草稿在 Renderer 显示，独立 Git fixture 源码没有变化；没有转发 API Key 或全量环境。Electron 官方 [环境变量说明](https://www.electronjs.org/docs/latest/api/environment-variables)与 [fuses 文档](https://www.electronjs.org/docs/latest/tutorial/fuses)确认运行机制和打包时可禁用的风险。尚未证明实际 `.asar`/安装包使用该路径可用；未来若禁用 RunAsNode fuse，需要改为直接启动已锁定的平台二进制，并重新实测。

Windows x64、macOS Intel、系统 DPI、安装包、签名/公证、Codex utilityProcess crash recovery 与 Refiner 网络隔离继续 **UNVERIFIED**。当前 read-only sandbox 的 macOS 写防护沿用 P0-05 实测；它并非通用文件/网络隔离。

## P1-03 · 会话持久化与本地流

核验日期：2026-09-23。生产 SQLite schema 5 已在 Node Host 集成测试与 Electron 44.4.3 utilityProcess 的 macOS 27.0 arm64 Desktop smoke 中加载；Node Host 22.22.0，Electron 内置 Node 24.21.0。Host 私有协议仍为向后兼容的 `forge-host-protocol/v4`，只增加固定会话命令/事件，既有 Project/Web 路径回归通过。未添加外部包或安装脚本；许可证/lockfile 不变。流式 responder 仅 fixture 实测，真实模型流待 P1-04；Windows x64、macOS Intel、DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 仍 **UNVERIFIED**。

## P1-02 · 项目、环境与命令预设数据

核验日期：2026-09-23。Node 22.22.0、pnpm 12.3.4、Electron 44.4.3（utilityProcess Node 24.21.0）、better-sqlite3 13.0.3；macOS 27.0 arm64。没有新增第三方依赖、原生安装脚本或许可证项。生产 SQLite 从 schema 3 升到 4，私有 Host 协议从 `forge-host-protocol/v3` 升到 `/v4`。旧 v3 实体数据迁移和重启无重复回填测试通过；新版本 Desktop 在本机真实启动，SQLite N-API 载入、Host ready/schema 4、Project 向导正常。旧 Desktop/Host 二进制与新协议不混用；协议握手会明确拒绝。

Windows x64、macOS Intel、系统 DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 继续 **UNVERIFIED**。当前 Git 子模块、大小写不敏感路径冲突、跨设备项目搬迁及并发多 Host 同库写入没有验收。命令预设仅保存，不运行用户代码；后续执行仍需权限策略和逐项审批。

## P1-01 · 本地项目选择与信任

核验日期：2026-09-23。本机 macOS 27.0 arm64，Node 22.22.0、pnpm 12.3.4、Electron 44.4.3、Git 2.55.0。没有新增第三方依赖或安装脚本；继续复用已锁定的 Electron、Zod、better-sqlite3、Vue 与 Playwright。生产数据库从 schema 2 迁移到 schema 3；Host 协议因新增 project 命令从 `/v2` 升至 `/v3`。

| 场景 | 当前结果 | 限制 |
| --- | --- | --- |
| Node Host Project Probe | 独立中文/空格 Git fixture 的 clean/dirty、branch、lockfile、声明脚本和非 Git 目录真实读取；脚本没有执行，源目录状态不变 | Git 命令依赖本机 Git；极大仓库和特殊 fsmonitor/权限配置还需补充边界测试 |
| Electron utilityProcess Host | 真实 Desktop IPC、SQLite schema 3、信任记录、当前项目重启恢复、项目切换与仅元数据移除通过；macOS 原生面板实际选择独立临时目录并显示 Host 探测结果 | 完整向导自动化用受控选择器返回值；Windows 原生面板未测 |
| Web | 无 Desktop bridge 时显示本地项目不可用，不提供 `webkitdirectory` 或本地文件读取 | RemoteTransport 未实现 |
| 供应链 | 没有新增 package；`pnpm install --frozen-lockfile`、严格类型检查与原生 SQLite 加载沿用 P0 锁定组合 | Windows x64/macOS Intel 与安装包中的原生依赖仍未实测 |

Windows x64、macOS Intel、真实系统 DPI、安装包/`.asar`、签名/公证、Codex utilityProcess crash recovery 仍为 **UNVERIFIED**。P0-06 Windows 进程树 backend 仍不可用。项目 Probe 不执行脚本，后续执行仍需逐项 Policy/Approval；见 [ADR 0008](decisions/0008-project-probe-and-trust-boundary.md)。

## P0-08 · 契约校验工具链

核验日期：2026-09-23。本机 Node 22.22.0、pnpm 12.3.4、macOS 27.0 arm64。新增精确依赖：`ajv@8.20.0`（MIT，registry 解包 1,033,496 字节）、`ajv-formats@3.0.1`（MIT，56,763 字节）、`yaml@2.9.1`（ISC，686,297 字节）。复用现有 `better-sqlite3@13.0.3` N-API 预构建和 `@forge/persistence` 公开 migration 列表；没有启用安装脚本或新增 native driver。当前 macOS 安装树许可证清单为 200 个 name/version 项，见 `docs/dependency-licenses.json`。

| 组合 | 本机真实结果 | 限制 |
| --- | --- | --- |
| Ajv 2020 + formats | 13 个参考 Schema 严格编译，示例/Profile/Workflow 校验与无效 Schema mutation 通过 | 将来新增 Schema dialect 需独立适配；静态合法不等于业务运行有效 |
| YAML + OpenAPI | 默认 Workflow、OpenAPI 3.1 解析；本地引用、operationId、response、security 与命令表校验通过 | 仅覆盖本轮明确规则，不宣称完整 OpenAPI 规范认证或远端 Gateway 运行 |
| SQLite DDL/migrations | `:memory:` 中参考 DDL、生产 v1→v2 SQL 执行与无效 DDL mutation 通过 | 不连接真实开发 DB；不能代替 P0-04 的持久性/安装包实测 |
| GitHub Actions | quality.yml 已加入独立 contract validation 步骤并继续 frozen install/lint/typecheck/test/build | GitHub Linux runner 尚未触发；当前只在 macOS arm64 执行命令 |

官方核验来源：[Ajv draft 2020-12](https://ajv.js.org/json-schema)、[Ajv 入门](https://ajv.js.org/guide/getting-started)、[YAML API](https://eemeli.org/yaml/)、[ajv npm](https://www.npmjs.com/package/ajv)、[ajv-formats npm](https://www.npmjs.com/package/ajv-formats)、[yaml npm](https://www.npmjs.com/package/yaml)。版本、许可证和包大小于本日从 registry 查询；Windows x64、macOS Intel 和实际 GitHub Linux job 未执行。参考 preset 的 `codex-sdk` / `forge.refiner` 只静态声明，真实 app-server Adapter 不等同于 Plugin Host 安装状态。


## P0-07 · Design System 与 UI 运行时

核验日期：2026-09-23。本机 macOS 27.0 arm64，Node 22.22.0、pnpm 12.3.4、Electron 44.4.3（内置 Node 24.21.0）、Vue 3.5.43、Vite 8.3.0、TypeScript 5.9.3、vue-tsc 3.3.11。`@forge/ui` 只复用已经锁定的 Vue/TS 工具链；**没有引入新的第三方版本、headless UI 包、字体、原生模块或安装脚本**。许可证分别为 Vue/vue-tsc MIT、TypeScript Apache-2.0；现有安装树的 `docs/dependency-licenses.json` 仍是本机许可证清单。`pnpm-workspace.yaml` 的 `ignoreScripts: true` 保持不变。

| 场景 | macOS arm64 实测 | 限制 |
| --- | --- | --- |
| Web 开发 / 生产入口 | Vite 开发浏览器显示 `Local Host unavailable`；`/#/dev/ui` 可检视正式 UI 组件；生产构建根路径显示真实空状态且不展示 Showcase | Showcase 仅开发模式；普通 Web 没有本地 Host |
| Desktop Renderer | 构建后 Electron 真实启动并通过 Host 握手；1440×900、1600×1000 截图无水平溢出，Host connected 来自真实 health | 原生标题栏不变；安装包、签名、公证未测 |
| 窄窗口与放大 | 1280×800、125% **CSS zoom 模拟**下无水平溢出，输入动作仍在面板内，可纵向滚动到按钮 | Playwright Electron viewport 报 `devicePixelRatio=1`；这不是 Mac Retina 或 Windows OS 125%/150% DPI 实机结论 |
| 可访问性 | Dialog 真实浏览器 Shift+Tab 环绕、Escape 关闭和触发器焦点返回；组件测试覆盖 Tabs 箭头键、Drawer 关闭、字段错误与状态文字；不透明阅读面/状态文字静态 4.5:1 检查通过 | 全面读屏器、背景实际合成对比度、暗色主题、Windows 高对比度未审计 |
| 偏好回退 | `data-reduce-transparency=true` 实际 `backdrop-filter: blur(0px)`；`data-reduce-motion=true` 实际页面动画 `0s`；浏览器 `prefers-reduced-motion: reduce` 的 token 为 `0ms`，动画约 `0.01ms` | 平台系统“减少透明度”媒体查询未在本机自动触发实测；当前窗口开关未持久化 |

新增 UI package 时普通离线安装曾因本机 pnpm registry metadata 缺失失败；随后联网安装通过。pnpm 对该新增 workspace importer 最初给出未物化的 Vue/vue-tsc 无 peer 实例链接，锁文件将 importer 指向**已有** `typescript@5.9.3` peer 变体后，`pnpm install --frozen-lockfile` 和 strict typecheck 均通过。没有绕过供应链检查或开放 install scripts。Forge glass v1.1 的高透明设计目标以阅读性和平台回退为前提，具体决策见 [ADR 0006](decisions/0006-forge-design-system-architecture.md)。

Windows x64、macOS Intel、真实 Mac Retina/Windows DPI、Windows 原生字体与 scrollbar：**UNVERIFIED**。规格 T107 的暗色主题没有当前 glass v1.1 视觉基准；本轮保留浅色产品主题并记录冲突。T109 的业务卡片详情要等后续 Task UI，当前不冒充该验收。

## P0-06 · Git worktree 与进程树

核验日期：2026-09-23。当前机器 macOS 27.0 arm64；Node 22.22.0、Electron 44.4.3 内置 Node 24.21.0、Git 2.55.0。新增 `@forge/workspace`、`@forge/process` 两个内部 `workspace:*` 包，只复用已有的 `zod@4.6.4` 与 `@types/node@22.20.4`；无新增第三方包、原生模块或安装脚本，现有供应链策略不变。精确版本与许可证仍见 `versions.lock.json`、`docs/dependency-licenses.json`。

| 组合 | macOS arm64 实际结果 | 限制 |
| --- | --- | --- |
| Git worktree | 中文/空格/长路径下 detached SHA worktree 创建、检查、修改、移除；源仓库 HEAD、dirty marker 与 Git status 未改变；无需 `git worktree prune` | T047 正式 snapshot 与 T050 分支前移合并重验属于后续阶段 |
| Forge 直接进程 | Node `detached` 建独立 POSIX 进程组；父子孙终止、父先退出、超时强制停止、Run B 与非 Forge 用户进程保持运行、端口再绑定实测 | Linux 未测；PID/PGID journal 仅用于报告可能 orphan，不用于重启后自动 kill |
| Codex 命令树 | app-server 与命令不同 PGID；`turn/interrupt` 后实际三代命令 PID 消失、心跳停止，Forge 直接拥有的 app-server 组确认退出后才释放 worktree | 内部命令组依赖 Codex 当前中断行为；恶意自行脱组、上游未来版本与安装包未证实 |
| Host shutdown | Host Registry 停新 Run、取消 owned group；未释放的 workspace 标记 failed 留存诊断。Desktop 等待 Host shutdown 上限 8 秒 | 活动真实 Run 的 Electron utilityProcess Host 退出路径尚未端到端验证 |

Windows x64：**UNVERIFIED / 当前进程树 backend 不可用**。macOS Intel：**UNVERIFIED**。Git worktree 并非安全沙箱；本轮未证明任意读取、联网和故意脱组子进程被隔离。版本与清理决策见 [ADR 0005](decisions/0005-workspace-and-process-ownership.md)。官方依据：[Git worktree](https://git-scm.com/docs/git-worktree)、[Node child_process](https://nodejs.org/api/child_process.html)、[Node process.kill](https://nodejs.org/api/process.html)。

## P0-05 · Codex SDK 与 app-server 实测

核验日期：2026-09-23；macOS 27.0 arm64、Node 22.22.0、Electron 44.4.3 utilityProcess Node 24.21.0、pnpm 12.3.4。`@openai/codex@0.155.1` 与 `@openai/codex-sdk@0.155.1` 均为 Apache-2.0，npm registry 解包大小分别 13,206 和 79,412 字节；lockfile 的 macOS arm64 可选平台二进制为 `@openai/codex@0.155.1-darwin-arm64`，实际下载约 127.46 MB。应用仍固定 `zod@4.6.4`、`@types/node@22.20.4`。11 个 workspace，当前 macOS arm64 依赖许可证清单 194 项；精确版本见 `versions.lock.json`，完整安装图见 `pnpm-lock.yaml`。没有启用 install script、sudo、全局安装或 API Key 配置。

| 验证项 | SDK 0.155.1 | app-server 0.155.1 |
| --- | --- | --- |
| 真实认证与只读 | 现有 ChatGPT CLI 登录下，独立临时 Git repo 只读 turn 成功；返回 thread ID、事件、实际 token usage | 同一登录下本地 stdio 初始化、模型列表、只读 turn 与结构化 JSON 输出成功；隔离 `CODEX_HOME` 返回 `EXECUTOR_AUTH_FAILED` |
| 文件写入 / streaming | 本轮未用 SDK 写入，不据此声称支持写任务 | 临时 fixture 中 `add(a,b)` 输入校验和测试真实修改，`npm test` 通过；最终 Host Registry 事件链 240 条顺序标准事件包含消息、命令、文件、usage、完成；临时父目录标记未变 |
| cancel / resume | SDK 公共 API 有 AbortSignal/resumeThread；本次未分别做真实取消/跨进程恢复 | `turn/interrupt` 在长命令启动后得到 cancelled；新连接与两个不同 PID 的 Node Host Registry 进程均持同一 thread ID 继续成功；不等于 Electron utilityProcess 重启或 Forge Attempt 自动恢复 |
| approval | TypeScript SDK 当前公开类型未提供本轮需要的客户端审批决议入口；真实 approve/reject 未验证 | 只读写入引发真实命令审批；approve 写入，reject 不写入；无自动批准 |
| sandbox / cwd | SDK `workingDirectory` + read-only 成功；未验证跨根拒绝 | fixture cwd 的读写/只读已实测；读权限完整隔离、网络策略未验证 |
| 模型 / usage / cost | 实际 token usage 可取；单独模型选择和结构化输出未测 | `model/list` 返回当前账号模型；先前 `gpt-6-luna`、最终实时选择的 `gpt-6-astra` 与 outputSchema 均成功；token usage 真实，费用未提供可靠值 |

当前 `pnpm probe:codex` 的 supported 布尔值只针对本机锁定版本下已经成功过的 Adapter 真实测试；版本、平台或登录不匹配则返回 false。`modelSelection=true` 和 `structuredOutput=true` 由最终显式选择当时 `model/list` 返回的 `gpt-6-astra`、通过 Adapter 获得结构化结果支持；模型列表会随账号状态变化，不能固定显示旧列表。`toolEvents=false` 专指尚未真实触发的 MCP tool-call；命令/文件活动已经作为独立标准事件到达。`networkPolicyEnforced=false`，不能用 prompt 代替强制网络隔离。`available=true` 是本地 CLI、登录和握手可用，**不代表上游模型请求即时可用**。

首次 `pnpm test:codex-live` 重跑在 app-server 只读阶段收到多个 `responseStreamDisconnected`（无 HTTP 状态），超过 120 秒未完成；之后 Adapter 结构化输出重跑也超时。检查本机环境变量名称后发现需使用无凭据本地代理，而本轮新加的子进程环境白名单遗漏代理变量。仅补入可解析且 URL 无用户信息的 HTTP(S) 代理后，直接只读和 Adapter 结构化输出单独通过，随后**整套 `pnpm test:codex-live` 通过**；这是修复后的真实证据，保留首次失败记录。默认 lint/typecheck/test/build 与 Desktop smoke 不依赖在线模型，已通过；上游长时稳定性、Windows x64、macOS Intel、Electron 打包后的 CLI 平台二进制路径、签名/公证仍待验证。

官方来源：[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[Codex app-server](https://learn.chatgpt.com/docs/app-server)。官方文档当前示例与锁定 CLI 0.155.1 的 `thread/start.sandbox`、`turn/start.sandboxPolicy.type` 枚举不同；本轮按实际错误响应和成功运行确认两个位置分别使用 kebab-case 与 camelCase。选型及运行边界见 [ADR 0004](decisions/0004-codex-integration-layer.md)。

## P0-04 · SQLite、N-API 与 Host 双运行时

核验日期：2026-09-23。环境为 macOS 27.0 arm64，pnpm 12.3.4。新增直接依赖：`better-sqlite3@13.0.3`（MIT，registry 解包 27,302,969 字节）、`drizzle-orm@0.45.3`（Apache-2.0，10,516,772 字节）、`@types/better-sqlite3@9.6.0`（MIT，9,548 字节）；Host/Persistence 共用已锁的 `@types/node@22.20.4`。具体精确版本见 `versions.lock.json`，当前平台安装树的 191 项许可证见 `docs/dependency-licenses.json`。

| 真实运行方式 | Node / Electron | modules ABI | 原生 SQLite 加载和构建结果 |
| --- | --- | --- | --- |
| 独立 Host：`pnpm dev:host`、构建后 `pnpm --filter @forge/host start` | Node 22.22.0；无 Electron | 127 | `darwin-arm64.node` 加载成功；SQLite 3.53.4；schema 2、FK/WAL、重启持久性通过。 |
| Electron `utilityProcess` Host：`pnpm dev:desktop` 与构建后 `pnpm smoke:desktop` | Electron 44.4.3，内置 Node 24.21.0 | 149 | 同一 N-API 平台预构建文件加载成功；真实 health 为 Storage ready、schema 2、WAL。无效 SQLite 文件显示 degraded，未伪报 ready。 |

`better-sqlite3` 13.0.3 的 npm 包包含 `prebuilds/darwin-arm64.node` 等目标平台文件，package `scripts` 没有 install/postinstall；本轮没有执行 `electron-rebuild`、node-gyp、sudo 或启用全局安装脚本。N-API 的跨运行时意图来自[项目 v13 发布说明](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)，但实际兼容性结论只限上表的本机加载结果。[Electron 原生模块文档](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)仍要求对原生模块打包和 ABI 保持检查。

正式 DB 默认属于 Forge 的用户应用数据目录，不在项目、源码或构建目录；dev/prod 分离，测试使用独立临时目录。单 Host 持有 SQLite 连接；Main 只传数据目录，Renderer/Preload 不获取路径或 SQL。迁移 v1/v2 与参考 `schema_migrations` 字段相符，未安装业务 DDL。启用 [SQLite WAL](https://www.sqlite.org/wal.html)、FK 和 busy timeout；备份使用[官方 backup API](https://www.sqlite.org/backup.html)。Drizzle 的 SQLite driver 选择符合[官方驱动说明](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)。健康契约扩展后协议版本明确升到 `forge-host-protocol/v2`，不会把旧 v1 静默视为兼容。

当前 `pnpm build` 只构建代码，原生 `.node` 仍从 workspace 安装图加载；这已实测，**不代表安装包验证**。`.asar` 外置、签名/公证、Windows x64 与 macOS Intel 的预构建文件加载和迁移仍待目标平台及打包产物验证。真实磁盘满、跨版本升级前备份和长时间运行未执行。详细决策见 `docs/decisions/0003-database-and-native-module-strategy.md`。

## P0-03 · 历史独立 Host 与本地协议

核验日期：2026-09-23。当前平台 macOS 27.0 arm64，本机 Node 22.22.0、pnpm 12.3.4；Electron 44.4.3 内置 Node 24.21.0。锁文件与 `versions.lock.json` 记录精确直接版本；当前安装树许可证清单为 187 项。新增第三方直接依赖只有 `zod@4.6.4`（MIT，npm registry `dist.unpackedSize` 6,138,878 字节），用于严格校验 Host wire/system 协议；Host 另复用已锁的 `@types/node@22.20.4`。`@forge/core`、`@forge/client`、`@forge/host` 与其他包使用 `workspace:*`，均是仓库内部私有包。

| 组合 | 本机结果 | 平台限制 |
| --- | --- | --- |
| Electron `utilityProcess` ↔ Host | 真实 Desktop smoke 中 ready → 协议及产品/Host 版本握手 → health → connected；异常退出被检测，关闭 Desktop 后 owned PID 消失。 | Windows x64、macOS Intel 和打包后路径未验证。 |
| 独立 Node Host | `pnpm dev:host` 实际生成随机 hostId、PID 和日志；Ctrl+C 后 PID 消失；真实 fork 集成测试通过。 | 仅本机 Node 22.22.0 实测。 |
| Host protocol / Zod | `forge-host-protocol/v1` 的输入输出 strict schema、未知命令拒绝、非法字段拒绝、版本失配、超时与断连测试通过。 | 后续业务 `command-envelope`、写命令持久幂等和 RemoteTransport 尚未实现。 |
| Vue/Web | 普通浏览器显示 `Local Host unavailable`，没有访问 Electron bridge；Desktop 复用同一 Vue App，真实健康与崩溃状态可见。 | 移动端/PWA 与远程 Host 未验证。 |

实现依据：[Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)、[Electron parentPort](https://www.electronjs.org/docs/latest/api/parent-port)、[Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)、[Zod 官方基础文档](https://zod.dev/basics)。这些官方资料确认私有子进程通信与 schema API；跨平台可靠性结论只来自上述 macOS arm64 本机测试，不外推至 Windows/Intel。当前本地 Host 不开放 HTTP/WebSocket/公网端口，Renderer 不能直接访问 Node、Electron IPC 或 Host；Main 只处理生命周期与受控通道。

`packages/contract-validator/fixtures/contracts/command-envelope.schema.json` 面向业务命令，和本轮系统命令字段不同；差异及范围决策见 `docs/decisions/0002-host-process-and-system-protocol.md`。SQLite/Drizzle、Codex/Claude SDK 原生组合仍待后续任务。

## P0-02 · 历史 Desktop / Web 基线

核验日期：2026-09-23。版本由 `package.json`、各 workspace manifest、`pnpm-lock.yaml` 和 `versions.lock.json` 精确锁定。`pnpm install --frozen-lockfile` 在 macOS 27.0 arm64、Node 22.22.0、pnpm 12.3.4 上通过供应链策略检查。下表记录本轮新增的直接依赖；完整直接版本与 npm registry 许可证及解包大小见 `versions.lock.json`，186 项当前平台已安装依赖见 `docs/dependency-licenses.json`。

| 组件 | 精确版本 / 许可证 | 当前机器上的验证 |
| --- | --- | --- |
| Electron | 44.4.3 / MIT | macOS arm64 真实窗口、打包前的本地构建加载、Preload bridge 和 sandbox smoke 通过。内置 Node 24.21.0、modules ABI 149、N-API 10、Chromium 152.0.7977.130；这是 Electron 运行时版本，不等同于本机 Node 22.22.0 的 ABI 127。 |
| Vue | 3.5.43 / MIT | 普通 Web 浏览器与 Electron Renderer 使用同一 App；挂载测试、实际 Web 启动和 Desktop smoke 通过。 |
| Vite / Vue 插件 | 8.3.0 / 6.0.9，均 MIT | Web dev/build 与 Desktop `file://` 加载通过。Vite 8 官方要求 Node 20.19+ 或 22.12+；Vue 插件 peer 接受 Vite 8 / Vue 3。 |
| vue-tsc / Vitest / happy-dom | 3.3.11 / 5.0.1 / 20.14.5，均 MIT | strict Vue typecheck 与 3 项挂载测试通过。 |
| @types/node | Web 22.20.4、Desktop 24.9.0 / MIT | 两侧 TypeScript 检查通过；Desktop 声明版本对应 Electron 内置 Node 24 主版本。 |
| eslint-plugin-vue / globals | 10.11.0 / 17.12.0，均 MIT | Vue 单文件组件及 Web/Node globals lint 通过。 |
| playwright-core | 1.63.0 / Apache-2.0 | 真实 Electron smoke 在本机通过；其 Electron API 官方仍标为 experimental，不作为跨平台兼容性保证。 |

Electron 44.4.4 的 registry 发布时间为 2026-09-22T18:41:55Z，处于当前 pnpm 最短发布时间策略窗口内；冻结安装实际失败。最终选择 2026-09-18 发布的 44.4.3，并移除自动生成的例外配置；新的 lockfile 冻结安装通过。44.4.3 的第一次二进制下载因 `fetch failed` 失败，重试成功，说明首次启动仍依赖发布源网络。没有启用依赖安装脚本，也没有更改全局工具。

Electron 设置为 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`、`webviewTag: false`；Preload 只暴露冻结的 `{ platform }`，无通用 IPC/文件系统/Shell。macOS 真实 smoke 已读取运行中的 `webPreferences`，其前三项与配置一致。Windows x64、macOS Intel、不同 DPI、打包/签名、平台快捷键、SQLite/SDK 原生组合均未验证。

本轮官方核验来源：[Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)、[Electron 安装方式](https://www.electronjs.org/docs/latest/tutorial/installation)、[Vite 入门与 Node 要求](https://vite.dev/guide/)、[Vue 快速开始](https://vuejs.org/guide/quick-start.html)、[Playwright Electron API](https://playwright.dev/docs/api/class-electron)、[pnpm 设置](https://pnpm.io/settings)。各精确包的版本、license、engines、peer 与大小于 2026-09-23 从 npm registry 核验。当前本地运行结果只支持上述 macOS arm64 结论。

## P0-01 · 历史工具链基线

核验日期：2026-09-23。以下保留 P0-01 当时仅有工具链的记录；其中“Electron 未安装”等状态仅描述 P0-01 时点，不代表当前 P0-02 状态。

| 项目 | 锁定版本 | 许可证 | 本轮证据与结果 |
| --- | --- | --- | --- |
| Node.js | 本地/CI 基线 22.22.0；`engines` 接受 22.13.0–22.x | MIT | 本机 `node --version` = 22.22.0；`process.versions.modules` = 127、N-API = 10。只验证 macOS arm64 上本轮工具链。 |
| pnpm | 12.3.4 | MIT | 本机 `pnpm --version`；官方安装页确认 pnpm 12 支持 Node 22；冻结 lockfile 安装通过。 |
| TypeScript | 5.9.3 | Apache-2.0 | registry 精确版本/engines；与 typescript-eslint 的 `<6.1.0` peer 范围相符；strict typecheck 与构建通过。 |
| ESLint | 10.11.0 | MIT | 官方文档要求 Node `^22.13.0` 或兼容版本；registry 精确版本/engines；lint 通过。 |
| @eslint/js | 10.0.1 | MIT | registry peer 需要 ESLint `^10.0.0`；lint 通过。 |
| typescript-eslint | 8.70.1 | MIT | 官方 flat config 用法；registry peer 接受 ESLint 10 和 TypeScript 5.9；lint 通过。 |

上述直接依赖的分发方式为 npm registry 包，pnpm 使用内容寻址 store 和锁文件完整性字段。`versions.lock.json` 中的 `registryUnpackedBytes` 来自对应精确版本的 npm registry 元数据，不是 Forge 分发包体积；Electron 等原生分发物未安装，体积待测。`@forge/contracts` 为仓库内部私有包，不是第三方许可证项。

P0-01 当时 `docs/dependency-licenses.json` 有 96 项；该清单现已随 P0-03 更新为 187 项（不含外部 pnpm 可执行文件）。当前许可证类型为 MIT、Apache-2.0、BSD-2-Clause、BSD-3-Clause、ISC、BlueOak-1.0.0。跨平台可选依赖树还需在目标平台重新盘点。冻结安装报告锁文件通过供应链策略检查；本轮未进行漏洞审计或代码签名验证。

## 核验来源

- [pnpm 安装与 Node 兼容性](https://pnpm.io/installation)、[pnpm install 与冻结 lockfile](https://pnpm.io/cli/install)、[pnpm workspace](https://pnpm.io/workspaces)、[pnpm 12 设置位置](https://pnpm.io/settings)
- [ESLint 安装前置条件](https://eslint.org/docs/latest/use/getting-started)、[typescript-eslint flat config](https://typescript-eslint.io/getting-started/)
- [TypeScript 5.9 发布说明](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- 各精确版本、许可证、engines、peerDependencies 和解包大小：2026-09-23 执行 `pnpm view <name>@<version> version license engines peerDependencies dist.unpackedSize --json`，具体结果由 `versions.lock.json` 和本记录保存。

## P0-01 时点验证矩阵（历史）

| 组合 | 状态 | 后续任务 |
| --- | --- | --- |
| Electron + 内置 Node、macOS/Windows 启动及 IPC | 未安装、未验证 | P0-02 |
| Vue 3 + Vite 共享 UI | 未安装、未验证 | P0-02 |
| Host 独立入口与 CommandBus | 未实现、未验证 | P0-03 |
| SQLite/Drizzle 与 Electron/Node ABI | 未安装、未验证 | P0-04 |
| Codex SDK / CLI 真实认证、取消、恢复 | 未安装、未验证 | P0-05 |
| macOS Intel、Windows x64 | 无本轮实机结果 | 后续平台验证 |

参考矩阵在 `已归档的产品设计资料`；它仍保持原样。本记录不把本机 Node ABI 当作未来 Electron ABI。
# 2026-09-25 · P7-05 loopback HTTP command adapter checkpoint

Current macOS arm64 Python Host/SQLite and optional 127.0.0.1 HTTP gateway passed authenticated Project-scoped Project, Board and real approved Task Contract reads and explicit denial of all remote writes; it was not tested over TLS, on a phone, or on Windows/macOS Intel. The current installed internal Demo is listener-free on normal startup; the added Task-detail read postdates its build. Reference OpenAPI `TaskSummary.state` omits production `blocked`, so the adapter returns 409 for that board instead of emitting a nonconforming or false state. Remote write-method names/payloads differ from the current Host API and require an explicit mapping plus operation grants and idempotency/CAS tests. See ADR 0079. No remote execution support claim yet.
# 2026-09-25 · Current internal Mac Demo package integrity

The original installed ad-hoc app produced five additional `.pyc` files under its signed bundled Python package after runtime imports; `codesign --verify --deep --strict` then failed. The original DMG/checksum and all existing Demo data remain untouched. A separate `0.0.1` arm64 internal DMG (SHA-256 `91595c5cbf5278ecc68227a3eb5a92ded84d26408b227d28371832e6de283eb6`) was built from current sources with `PYTHONDONTWRITEBYTECODE=1` in the packaged Host environment. A read-only DMG install, clean-path Host startup, schema32, bundle Python loading, exit and subsequent ad-hoc signature verification passed. The exact new DMG also passed a real Codex task/Verify/Review/acceptance/cancel/restart cycle with retained isolated fixture/data. This verifies only macOS arm64 internal ad-hoc packaging; Developer ID, notarization, Gatekeeper on a fresh account, Windows/macOS Intel, signed updates and Finder PATH/proxy remain unverified. The Python system interpreter used by the optional local `.command` launcher is separate from the bundled Host runtime.

An additional installed-app UI probe used a SQLite backup, not the retained Demo DB: the first quick-template publish correctly failed because no Agent Profiles were installed; after saving real Developer/Reviewer Profiles through the app, binding them and editing a node, Host preflight, draft save, publish v1 and published-definition readback succeeded. This verifies the package's editor/publish route without a model call. A new installed-app Run bound to that published version remains unverified.

A separate live invocation of the **same DMG** used an isolated fixture to publish quick v1 and start a real Codex Run. The Run succeeded, changed only isolated `math.js`/`test.js`, and its SQLite RunConfig plus Host readback matched the published Workflow/Profile IDs and content hash. The overall command exited 1 on a harness-only final assertion that wrongly expected Done after development alone; actual Task state was Active because Review/Verify/human acceptance had not run. The assertion has been corrected, but the paid scenario was not repeated merely to turn the exit code green. Its custom-Workflow restart readback therefore remains UNVERIFIED; no formal P6/P7 release gate changes.
