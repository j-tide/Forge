# Forge internal macOS arm64 package · 2026-09-25

## 当前可录屏 Demo（同日更新的独立内部构建）

再次运行 `.command` 已实测识别现存同一安装版进程并退出，不会为同一演示数据库再启动第二实例。**录屏时请从此 `.command` 或 `pnpm demo:open` 启动；直接双击 `.app` 不会自动注入独立演示数据目录，可能打开日常 Forge 数据。**

推荐打开 `/Users/iamzjt/Applications/Forge INTERNAL Current.app`。双击 `/Users/iamzjt/Documents/Forge Demo Current/Open Forge Demo Current.command`，或在本仓库运行 `pnpm demo:open`。`.command` 核验已安装包的 ad-hoc 签名，用本机 `/usr/bin/python3` 只启动应用并退出；应用与包内 Python Host 会继续常驻，不像 smoke 自动关闭。当前真实持久 Demo 数据为 `/Users/iamzjt/Documents/Forge Demo Current/recorded-acceptance/isolated-app-data`，项目为 `/Users/iamzjt/Documents/Forge Demo Current/recorded-acceptance/Forge fixture 空格`；请不要清理。原先 `/Users/iamzjt/Documents/Forge Demo/` 的项目与数据仍保留，互不覆盖。

- 新 DMG：`/Users/iamzjt/Desktop/my/myapp/Forge/build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64-demo-20260925.dmg`；SHA-256 `91595c5cbf5278ecc68227a3eb5a92ded84d26408b227d28371832e6de283eb6`；版本仍为 `0.0.1 INTERNAL / ADHOC / UNNOTARIZED`。原已验收 DMG 及 SHA-256 均未覆盖。
- 当前构建包含本机 Plugins 停用/启用入口。安装版三次 Electron 启动实际验证停用持久、启用须重启，见 [停用截图](../../output/playwright/p7-current-plugin-control-disabled-1440x900.png)。普通 Desktop 启动**没有远端 HTTP 监听**；P7/P8 手机能力尚未通过。
- 新 DMG 在包内 CPython 3.12、SQLite schema32、独立安装路径下通过 Host 启动及退出后再次 `codesign --verify --deep --strict`。构建脚本现在先重建源码，并让 packaged Host 禁止在签名包里生成新 `.pyc`；旧安装包运行后确实曾因五个新 `.pyc` 使签名复核失败，旧 app/数据未被本次修复覆盖。当前推荐使用新装的 `Current.app`。
- 对新 DMG 运行了独立真实 Codex 闭环并保留了 fixture/SQLite：1 个受信任项目、2 张真实任务、2 个 Run、1 条交付记录。开发 Run `e0234f52-b5bb-4838-acf6-e49bcb8c08b2` 在隔离工作区修改 `math.js`/`test.js`，Verify `7db35298-2c3b-4413-809b-84c85950702e` 返回 exit 0，Review `503ee8b4-2195-416d-849c-bf018e573790` approved，人工接受决定 `053b4a4e-0067-4965-bc5d-364721d29bca` 令任务 `34dfe0a4-111d-4b1a-8f3b-4bb1739dab1a` 为 Done，交付 `88a28094-d529-4f3e-bb52-8af337688fc2` 存在，**未自动合并/推送/部署**。另一 Run `9e81d1e0-dab1-4038-8446-9b617f8fdfa5` 真实取消，重开后仍非 Done。演示源仓库 `git status --porcelain` 为空。当前持久应用读取的是这份记录；这些是**历史案例**，不伪装成正在运行。
- 新包真实截图：[Home](../../output/playwright/p7-current-packaged-home-1440x900.png)、[Diff/交付](../../output/playwright/p7-current-packaged-delivery-1440x900.png)、[验收矩阵](../../output/playwright/p7-current-packaged-matrix-1440x900.png)、[Review](../../output/playwright/p7-current-packaged-review-1440x900.png)、[Done](../../output/playwright/p7-current-packaged-accepted-1440x900.png)。截图来自实际安装版 Electron；不会用参考设计图替代。
- 新安装版的 Workflow 页面从 Host 加载 3 个模板；隔离数据库副本中经实际 Agents UI 保存 Developer/Reviewer Profile，再从 quick 模板新建，编辑节点与绑定、预检、保存并发布 v1，Host 回读已发布节点值相同。见[画布截图](../../output/playwright/p7-current-packaged-workflow-editor-1440x900.png)与[发布截图](../../output/playwright/p7-current-packaged-workflow-published-1440x900.png)。这还不是“当前安装版新 Run 已引用新发布版本”的证据。Knowledge 的安装版独立 QA 路径使用旧 Demo 仓库已有 `docs/add-contract.md`：系统选目录并人工信任后，UI 只读导入、检索 `finite` 命中 1 个带行号/哈希的片段；从该来源提议/确认记忆后检索为 1 条，撤销后为 0，项目 Git 工作树不变。见[检索截图](../../output/playwright/p7-current-packaged-knowledge-search-1440x900.png)与[确认截图](../../output/playwright/p7-current-packaged-memory-confirmed-1440x900.png)。此 QA 数据与当前持久 Task 案例分开；不能把它描述为该历史 Run 已引用的知识。
- 对同一 DMG 的另一个独立 Git fixture 运行了**新的已发布 quick Workflow**：真实 Codex 完成 Run `f1f01724-c01d-42e7-8edd-6fea51cfe679`，修改隔离工作区的 `math.js`/`test.js`，产生快照 `6394ffad-9dff-47c8-b2a4-d5a7bce8fc18`，源 Git clean。运行中的 SQLite 冻结配置断言 workflow `workflow.fixture.quick@1`、Developer/Reviewer Profile ID，Host `run.config` 的内容哈希和实际节点 `develop` 一致；[任务抽屉截图](../../output/playwright/p7-workflow-packaged-delivery-1440x900.png)。此脚本整体 **exit 1**：末尾重启断言错误地要求一个只完成开发、尚未 Review/Verify/人工验收的 Task 已 Done；实际仍为 Active 符合产品语义。测试断言已按状态修正，但遵守“不重复消耗同一模型场景”未再次在线运行，因此这次自定义流程的重启恢复仍待验证；先前默认完整闭环的重启证据不受影响。
- 前置条件仍是 macOS arm64、系统 Git、外部 Codex CLI 0.155.1、已有合法 ChatGPT 登录，以及当前网络需要的代理。包内只包含 Python Host，不包含 Git/Codex。终端运行 `codex --version` 和 `codex login status` 可检查 CLI/登录；不要在聊天或录屏中展示凭据。Finder 直接双击 `.app` 时的 PATH/代理发现不保证；优先使用上述 `.command`。Claude 继续不可选。

**录屏顺序：**打开当前 Demo → 顶部确认 Host connected → 项目切换器选历史 fixture → 看板打开已接受 Task，并说明这是历史真实 Run → 展示隔离 Diff、快照、Verify、Review、逐项验收和 Done 但未合并 → 到 Plugins 看真实装配状态 → 到 Workflow/Knowledge 查看当前真实页面。要录制一张全新任务，从现有 fixture 再保存消息和手工草稿、人工批准，确认 TODO 无自动运行，然后明确 Start。复用同一项目时，请用新任务目标，避免让 Codex 重复修改已验证文件。独立取消演示另建一张任务。实际模型时间可能超过 5 分钟；不要把历史记录当直播。

## 原始已验收内部包（保留历史证据，当前优先使用上方新 Demo）

已从本页原始 SHA-256 的 DMG 安装至 `/Users/iamzjt/Applications/Forge INTERNAL.app`，原独立项目和数据均保留。原启动器在旧应用运行后遭遇包内新增 `.pyc` 导致的签名复核失败；请使用上方已修正并重新验证的 Current Demo。原包当时验证的 PID 2958、包内 Python Host PID 2977 和独立 SQLite 创建仍是历史证据，不代表当前新包状态。

- 演示项目：`/Users/iamzjt/Documents/Forge Demo/project`。这是独立、可丢弃的 Git 仓库，初始 `main` 工作树 clean，包含 `math.js`、`test.js`、`docs/add-contract.md` 与 `pnpm` 无关的 `node test.js`；不使用真实用户仓库。仅此合成 fixture 有自己的初始 Git 提交，Forge 仓库未提交。
- 演示数据：`/Users/iamzjt/Documents/Forge Demo/app-data/Forge/production/forge.sqlite`。它与 Forge 日常数据目录不同；**不要删除此目录**，项目、任务、Run 和交付记录会留给下一次录屏。首次准备时数据库为空，既有一次性 QA Run 只在下面的历史验收证据中，不冒充本 Demo 正在执行的 Run。
- 演示版前置：macOS arm64、系统 Git、外部 Codex CLI 0.155.1、用户已有合法 ChatGPT 登录，以及当前环境实际需要的授权网络/代理。`codex login status` 在本机显示 `Logged in using ChatGPT`，未读取或记录凭据内容。通过 `pnpm demo:open`/`.command` 的终端环境传递 PATH；单纯在 Finder 双击 `.app` 的 Codex CLI/代理发现尚未验收。Claude 仍不可选。
- 当前版本仍为 `0.0.1 INTERNAL / ADHOC / UNNOTARIZED`；不要对外分发、绕过 Gatekeeper、把它称为已签名公证的正式版。DMG 摘要与包内 Host 证据见下文。

**人工录屏脚本（在持续打开的 Demo 应用里操作）：**

1. 确认顶部真实 `Host connected`。进入「项目」→「选择文件夹」，选择上述演示 Git 仓库；查看 Git 分支、工作树与检测到的 `test` script，再明确点击「信任项目」。探测本身不运行仓库脚本。
2. 回到首页，输入“给 `add(a,b)` 增加有限数字输入校验，非法输入抛出 `TypeError`，补充测试”。保存消息，生成/编辑草稿；核对范围与验收项，人工批准。切看板说明任务**只在 TODO**，这一步尚无 Run。
3. 在任务抽屉明确选择当前可用 Codex/模型，点击 Start；观察真实活动与所选隔离工作区。等待 Run 完成，再打开 Diff、CodeSnapshot 与 Handoff。源项目的 `git status` 应保持 clean；变化应在 Forge Worktree 内。模型耗时不保证 3～5 分钟。
4. 若项目已配置并人工批准 `node test.js` Command Preset，运行 Verify 并查看真实退出码；Review 读取固定快照。按实际报告处理返工，逐项关联验收依据，再单独执行 Owner 最终接受。请勿把未运行的 Verify 或 Review 说成通过。
5. 展示 Done 与交付记录，同时指出“尚未自动合并/推送/部署”。正常退出后再用上述入口重开，检查任务与交付仍可查看。**不要为了重录屏重建或清理演示数据。** 独立取消演示应另建一张任务，等待确实启动后取消并核对没有继续写入。
6. 若录制知识与记忆，再进入「知识」：只读导入项目内 `docs/add-contract.md`，检索 `finite`，打开片段定位；可从该来源提议记忆，人工确认后检索，再撤销。检查新 Run 的 Stage Context 是否确实包含该来源；如果没有，按“未引用”展示，不从搜索结果推断它已进入 Run。

本节说明是可操作的人工路径；下文带 Run ID 的真实结果来自**先前一次性隔离验收**，不会预填入当前持久 Demo 数据库。若 Codex、网络或模型不可用，保留当前项目与草稿，并如实展示不可用诊断，不用历史结果代替直播。

## Artifact and scope

- App: `build/macos/Forge-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.app`
- DMG: `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`
- DMG SHA-256: `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`
- Version: `0.0.1`; platform actually tested: macOS arm64.
- Distribution status: **INTERNAL / ADHOC / UNNOTARIZED**. No Developer ID, Apple notarization, public release or signed upgrade claim.

The checked DMG was mounted read-only, its app copied to a separate QA installation directory containing a space, ad-hoc signature verified, and **that copied executable** launched. Electron reported `isPackaged=true`. The Host PID's command line pointed inside `Forge INTERNAL.app/Contents/Resources/forge-python/runtime/bin/python3.12`, not the repository `.venv`. The package contained the Python Host wheel, its production Python dependencies, plugin lock, Web build and `app.asar`. The Host reported SQLite schema 30. `FORGE_INTERNAL_TEST_HOME` works only because this internal artifact has the test marker; it redirected Forge app data to an isolated disposable directory. The source project was a separate disposable Git fixture, never this repository.

The package is **not fully self-contained for coding**. Git comes from the operating system. Codex CLI 0.155.1 and an authorized ChatGPT login were external. The live acceptance launched the installed app with the current user's PATH and login location; it did not use the development Python Host. A separate clean-PATH package smoke found Codex `available=false` while the Host/UI stayed healthy. A Finder launch with a minimal PATH may therefore require Codex to be installed on a GUI-visible PATH; this has **not** been accepted as a fresh-user setup. No Anthropic API or Claude call was used. Host forwarding excludes arbitrary secrets and credential-bearing proxy URLs; the live Codex path used the existing authorized environment, while Finder proxy availability is unverified.

## Actual installed-app acceptance

Command: `FORGE_VERTICAL_PACKAGED=1 FORGE_VERTICAL_FINAL_ONLY=1 FORGE_VERTICAL_TERMINATION=cancel FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs` (exit 0). The harness installs from the DMG on each run and removes only its own QA app/data/fixture after evidence capture. It never starts `pnpm dev:desktop` or the development Host.

1. Native folder selection returned a disposable Git project. Host probe found Git; explicit trust saved a real Project.
2. A message was stored, a manual Task Draft was revised, and a separate human approval created TODO. Board inspection before Start found no Run.
3. Explicit `run.start` invoked real Codex through the packaged Python Host. It changed only `math.js` and `test.js` in a Forge worktree. A real `node test.js` succeeded there; source Git HEAD/status and source files stayed unchanged. The saved CodeSnapshot, Diff and Handoff were read back.
4. The approved command preset produced a real Verify report (`passed`, exit 0). A separate read-only Codex Review returned `approved`. Each acceptance criterion was explicitly linked to current-snapshot evidence before local Owner final acceptance. The Board showed Done, and the delivery record existed without merge, push or deployment. Source Git HEAD stayed at its original commit.
5. A second Run entered a long `hold.js` command. Explicit cancellation returned `cancelled`; its owned app-server exited, no Handoff was created, and `math.js` did not change during the post-cancel observation window. The workspace was not reported cleaned merely from the UI state.
6. After quitting and relaunching the same installed app against the isolated data directory, the Done Task and delivery record remained; the cancelled Task was not Done. The owned Host exited on final quit. No app or test fixture remained after cleanup.

Evidence IDs: development Run `c893f0b3-b2e1-42a1-b16c-ab7b9b54fe0c`; CodeSnapshot `0b770a5e-56c0-40a3-ab79-d5eda8b0532e`; Verify `a60c6601-a8de-41f9-ba8a-428d4cae7caa`; Review `372cfd82-94a3-4f50-9821-1942c4ec1af5`; cancelled Run `0125505d-df90-44f2-8462-366f4339be60`; Project `65196f38-d923-4a71-bf66-c297bbc68485`; delivery `642321d2-4f38-4db6-921f-0703dd41dd5b`. These are disposable QA records, not user production data.

Real installed-app screenshots: [Home](../../output/playwright/p6-06-packaged-home-1440x900.png), [CodeSnapshot and delivery](../../output/playwright/p6-06-packaged-delivery-1440x900.png), [acceptance matrix](../../output/playwright/p6-06-packaged-matrix-1440x900.png), [Review](../../output/playwright/p6-06-packaged-review-1440x900.png), [Done and unmerged delivery](../../output/playwright/p6-06-packaged-accepted-1440x900.png). These files are generated QA artifacts excluded from Git; the script can regenerate them with an authorized Codex login.

## Internal use and 3–5 minute walkthrough

For a controlled internal arm64 QA machine, verify the DMG SHA-256, mount it, copy `Forge INTERNAL.app` to an isolated QA application location, and run the copied app. Do not disable Gatekeeper globally or remove quarantine/system protections to force a public install. The ad-hoc build may be blocked on an unconfigured machine; that is an unresolved public distribution gate. A disposable project and separate Forge data directory are recommended for QA. The shipped UI can select a local folder; local Git and an external Codex CLI/login are prerequisites for a coding demonstration.

The short walkthrough: (1) choose and trust the disposable Git project; (2) save a message, create/revise a manual Draft, approve it and point out that it is only TODO; (3) explicitly Start and inspect live observations, isolated Diff and CodeSnapshot; (4) show Verify and Review reports, link acceptance evidence and make the separate Owner decision; (5) show Done plus the still-unmerged delivery, quit/reopen and show the persisted record. Runtime length depends on the live model and can exceed five minutes. A second independent cancellation fixture can be run separately.

## Limits and deferred acceptance

T111 has only internal mount/copy/start/remove and retained-data evidence; a fresh physical Mac user with Gatekeeper and a Developer ID/notarized installer is untested. T112 signed upgrade/interruption/rollback and T113 legitimate credential continuity remain `DEFERRED_VERIFICATION`. macOS Intel/x64, Windows x64, real system DPI, installer/UAC, public code signing, notarization and Codex launched from Finder are unverified. P6-06 stays **BLOCKED**; the user authorized only a precise P6-06→P6-07 development scheduling exception. P4 Claude online acceptance and the full multi-Executor release gate are independently blocked.
