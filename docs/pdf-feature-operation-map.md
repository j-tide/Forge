# Forge 介绍页功能 → 当前真实操作（2026-09-25）

仓库中有 105 页的工程蓝图 PDF 与 17 页的旧设计图集 PDF，但没有与用户指定“第 3～10 页”功能目录相符的独立项目介绍 PDF。**页码与功能名称暂按用户在本轮提供的清单**；拿到原 PDF 后需逐页复核视觉及措辞。工程 Task/Test ID 以只读 `forge_spec_v1.0/` 为准；本表的“可演示/待验证/缺实现/外部阻塞”只是功能核验标签，**不改变** Playbook 的 DONE/BLOCKED 或权威验收状态。截图均是实际 Vue/Electron 代码的输出，旧 design atlas 只作参考。

当前推荐可操作版本是 [内部 macOS arm64 Current Demo](demo/p6-internal-macos-package.md) 的独立新 DMG/安装版；原始已验收 DMG、旧安装目录和证据均保留。新包真实完成 Codex/取消/重启闭环，并在安装版验证 Plugins 操作和 Workflow/Knowledge 页面入口；P7 远程 HTTP 仍默认关闭。下表的开发版证据与当前安装版证据分别标注，不把已有接口自动算作用户可演示。

| PDF页/功能 | 用户入口与操作 | 当前实现与证据 | 缺口；对应权威任务 | 影响 |
| --- | --- | --- | --- | --- |
| 3 自然语言整理与澄清 | 首页左侧连接项目→保存消息→整理草稿→回答澄清 | **可演示**：真实 Codex 整理器和手工草稿均有本地产品链证据；[P1报告](p1-completion-report.md)、[安装版流程](demo/p6-internal-macos-package.md) | 需有可用模型/合法登录；P1-02～P1-05、P4-07 | 完整功能演示的外部条件 |
| 3 草稿编辑、版本审批、TODO | 首页草稿编辑→另行人工批准→看板 TODO | **可演示**：安装版实际确认批准后无自动 Run；[安装版流程](demo/p6-internal-macos-package.md) | 跨设备审批属 P7-07/P8-05；P1-06～P1-10 | 手机演示另验 |
| 4 隔离工作区、活动、Diff、快照、取消 | 看板→任务抽屉→明确 Start→Run Inspector→取消 | **可演示**：同一安装版真实 Codex 写入独立 Worktree、CodeSnapshot/Diff 和另一 Run 取消；[截图](../output/playwright/p6-06-packaged-delivery-1440x900.png) | Codex CLI/登录在包外；P2-01～P2-10、P6-05 | 本地演示前置条件 |
| 4 上下文 | Run Inspector 的 Stage Context 与来源引用 | **已实现待验证**：P5-08 预览/预算、P5-11 Run 引用冻结有 Python/Host/开发版证据；[P5报告](p5-completion-report.md) | 成功预览在此安装版中的同一任务操作尚需复核；P5-08/P5-11 | 完整功能演示 |
| 5 Review、Verify、有限返工 | 任务抽屉→固定快照的 Verify/Review→Issue/返工 | **可演示**：安装版 Verify exit 0、独立 Review approved；有限返工有隔离 Git/SQLite 回归；[Review截图](../output/playwright/p6-06-packaged-review-1440x900.png) | 同一安装版故意触发返工需单独做可丢弃用例；P3-01～P3-06 | 完整功能演示 |
| 5 逐项验收、人工接受 | 任务抽屉→逐条关联证据→Owner 最终接受 | **可演示**：[验收矩阵](../output/playwright/p6-06-packaged-matrix-1440x900.png)、[Done但未合并](../output/playwright/p6-06-packaged-accepted-1440x900.png) | 第二真实 Executor 不在此链；P3-05/P3-07、P4-10 | 多执行器发布阻塞 |
| 6 默认流程、节点编辑、角色绑定、失败路径 | 左侧 Agents→保存真实 Developer/Reviewer Profile；Workflow→quick 模板副本→节点表单/画布→绑定 Profile→预检→保存→发布 | **安装版编辑/发布可演示**：隔离数据库副本里实际从 Host 读取 3 个模板，在 UI 保存两个真实 Profile，修改节点、绑定角色、预检、保存并发布 quick v1；Host 回读发布版的节点名称与编辑值相同。[画布](../output/playwright/p7-current-packaged-workflow-editor-1440x900.png)、[已发布](../output/playwright/p7-current-packaged-workflow-published-1440x900.png)。同一 DMG 的另一隔离 fixture 已真实启动已发布 quick 新 Run，Codex 改动 `math.js`/`test.js`、Run `succeeded`，SQLite 冻结配置的 workflow v1、Developer/Reviewer Profile 与 Host `run.config` 一致；[任务抽屉](../output/playwright/p7-workflow-packaged-delivery-1440x900.png)。该次脚本末尾错误地要求尚未人工验收的 Task 为 Done，整体 exit 1；没有把此项标作完整验收通过 | 不支持任意非线性/strict Planner 运行；新 quick Run 的重启恢复子项因脚本末尾断言未通过而待复核；P5-01～P5-05/P5-11 | 完整功能演示 |
| 6 发布版本冻结/差异 | Workflow→发布历史/影响预览→看旧版与新版差异 | **已实现待验证**：开发版有[发布差异截图](../output/playwright/p6-01-published-diff-desktop-1440x900.png)，Python Host 锁旧 Run 配置 | 同一安装版旧 Run/新发布 UI 连贯用例 T029 仍递延；P5-05、P6-09 | 完整功能演示 |
| 7 插件清单、能力检测与诊断 | 左侧 Plugins→刷新诊断；Agents→看 Executor/Profile 可用性 | **可演示**：Bundled Codex 状态和 fault 为 Host 实值，Claude 无凭据不可用；P4-01～P4-03/P4-06/P4-09 | 不得把可用 Profile 数量当两种真实 Executor；P4-05/P4-10 | 完整多执行器发布阻塞 |
| 7 配置、停用与清理、权限边界 | Plugins→查看 Host 锁定清单/诊断→原生确认停用；启用后重开 Forge | **当前安装版可演示**：从新 DMG 安装的 Electron 在独立数据目录下实测停用、重开保持停用、再启用须重开、非法参数拒绝，[停用截图](../output/playwright/p7-current-plugin-control-disabled-1440x900.png)。现有项目仍可读，新 Run 无法取得停用插件锁；Codex manifest 无可编辑配置项，不伪造模型/凭据保存 | 插件配置编辑只能按真实 manifest 字段提供；第三方插件动态安装/卸载仍非本机入口；P4-02/P4-04/P4-08/P4-09 | 当前内部本地演示可用；完整插件生态仍有限 |
| 8 Python Host、本地契约、数据边界 | 顶部 Host 状态→诊断；Settings→受限导出 | **可演示**：安装版包内 CPython/SQLite、固定 Preload/Main/stdio bridge 和 Host 进程已实测；[安装版报告](demo/p6-internal-macos-package.md) | 远端 Host/手机属 P7，非当前安装版；MIG-PY-01～09、P0-03/P0-04 | 手机演示缺口 |
| 9 文档导入、检索与来源 | 左侧 Knowledge→只读导入项目内相对路径→关键词检索→查看片段行号/哈希 | **当前安装版可演示**：独立旧 Demo Git fixture 在新包中经过真实文件夹选择/Trust，UI 只读导入 `docs/add-contract.md`，检索 `finite` 返回带行号/哈希的 1 个真实片段；[安装版检索截图](../output/playwright/p7-current-packaged-knowledge-search-1440x900.png)。项目 `git status` 未变 | 这组 QA 数据与当前持久 Run 案例数据隔离；P5-06/P5-07 | 本地演示可用 |
| 9 本次 Run 上下文引用 | 任务 Run Inspector→Stage Context/来源 | **已实现待验证**：[上下文截图](../output/playwright/p5-11-context-source-desktop.png) 与 P5-11 来源冻结证据 | 必须在安装版中核对当前 Run 实际引用，不能仅拿检索结果代替；P5-08/P5-11 | 完整功能演示 |
| 9 记忆确认、撤销、作用域 | Knowledge→从来源提议记忆→人工确认→检索记忆→撤销 | **当前安装版可演示**：真实来源提议候选，人工理由确认后检索为 1 条，撤销后重新检索为 0 条；[确认截图](../output/playwright/p7-current-packaged-memory-confirmed-1440x900.png)。环境/来源作用域与历史审计由 Host 实际负责；不是模型自动记忆 | 当前持久 Demo 项目与此 QA 项目不同；需在持久 Demo 的含文档项目手工复演；P5-09/P5-10 | 本地演示可用 |
| 10 远程配对、手机待处理/澄清/审批/控制、离线重连 | 当前安装版 Settings 有本机设备配对入口，但普通启动**不开 HTTP 服务**；手机页面/连接仍不可用 | **局部实现、手机演示缺实现**：P7-03/04 有 Host-owned 配对/会话与真实回环 HTTP 测试，P7-05 的项目、看板、真实 Task Contract 只读适配尚在开发，写命令全部 403；不能用浏览器本地 Web 假扮配对手机 | P7-05～P7-10、P8-01～P8-10；私网 HTTPS、真机、安全门禁与状态一致待验 | 手机与远程演示 |

正式发布另受 P4 两种真实 Executor、P6 Developer ID/公证/Windows/升级与 P6-09 全项验收阻塞；这不取消上面已经真实通过的内部 Mac Task 演示。安全、数据完整性或远程授权失败时不能以本表标签代替验收。
