# P3 可交付验收样例

日期：2026-09-24。平台：macOS arm64 开发运行路径，Electron 44.4.3、Python
3.12.13、SQLite schema 24、Codex app-server 0.155.1。所有写入目标都是本轮新建的
独立临时 Git/SQLite fixture；运行结束删除临时目录，没有修改 Forge 源仓库或用户已有数据库。

## 正常路径：真实 Desktop → Python Host → Codex

`pnpm test:p3-live` 最终 exit 0。固定桥先保存消息和手工 Draft，人工单独审阅并批准
为 TODO；用户再明确启动真实 Codex 开发 Run `bf363d89-995f-42e5-8ded-2d35a45ae74b`。
Agent 在隔离工作区修改 `math.js`、`test.js`，生成不可变 CodeSnapshot
`9cbd3e8b-e85b-4f3a-a56d-1a7fd4076781`；fixture 的 `node test.js` 真实通过。
批准的命令验证 `5873406e-f1b5-40e9-ba69-88dcfc33098f` 返回
`passed`/`exitCode=0`，但 AC 先保持 `unverified`，Owner 明确绑定该报告并写理由
后才成为 `verified`。真实只读 Review `b1b0ec13-0304-4ce6-a07f-6482c875c0db`
给出结构化 `approved`；独立最终人类验收决定
`27b67f24-4fb0-499c-8a8a-960bc696f577` 后 Board 才显示 Done。
原生合并确认第一次被取消，目标 HEAD 未变；第二次单独确认才将不可变交付
`ae82b9ae-c949-44dc-b693-df05d1caf951` 合并到 fixture 本地 `main`。
结果双父 commit 为 `5c4f0175028e6bfc0c29ec69ff5b4fd0a168db11`，
来源 HEAD 原为 `18a2b90f5515e10b57bc0854fdc06bebbb1b7f8b`；
源工作树干净，没有 push 或 deploy。

任务抽屉还真实读取了 Host 存储的 `text/plain` stdout 报告并显示
`Forge fixture test completed`。报告面板的 Vue 测试将 `<script>` 和
`javascript:` 链接作为恶意文本输入，确认没有 script/anchor DOM 节点或脚本副作用；
错误 report identity 也被拒绝（T064）。真实截图已目视检查：
[验证报告](../../output/playwright/p3-12-python-desktop-verify-report-1440x900.png)、
[Review](../../output/playwright/p3-12-python-desktop-review-1440x900.png)、
[人类验收](../../output/playwright/p3-12-python-desktop-accepted-1440x900.png)、
[显式本地合并](../../output/playwright/p3-12-python-desktop-merged-1440x900.png)。
截图在本地被 Git 忽略，可重跑命令再生；这些是实际 Vue/Electron 画面，
不是设计参考图。

## 异常与人类路径

`pnpm test:p3-acceptance` 的六个独立 Git/SQLite/Python Host 场景均通过：

| 场景 | 可核查结果 |
| --- | --- |
| 正常交付 | 获批 Review、真实 Verify 与逐项 AC 后才允许 Owner 接受；显式本地合并幂等且重启可对账 |
| 混合状态看板 | 一个已验收 Done 与两个批准 TODO 并存；TODO 重排不含 Done |
| Review 退回 | 结构化 blocker 生成有证据来源的新 Attempt；fixture 无第二 Reviewer 时停在门禁，不伪造批准 |
| 测试失败 | 真实批准命令失败后，从固定失败快照启动有界返工，再次验证通过；源仓库未变 |
| 人工建议豁免 | 本地 Owner 对非安全 advisory 写原因、版本和身份；阻断性问题不能豁免，最终接受独立记录 |
| Host 崩溃 | 子进程在 Git 更新后真实退出；重启检查双父 commit 和 owned candidate，只补记已发生结果，不重放合并 |

另外 `tests/p3/board-live.mjs` 用真实 Electron→Python Host 读取混合状态库，
把尚未 Review 的 TODO 拖向 Done 时拒绝且状态不变；按状态、优先级和已分配
Executor 筛选不写 Task；键盘在排序按钮按 Enter 调用同一 `tasks.reorder`，
焦点回到移动后的卡片。截图：
[混合状态看板](../../output/playwright/p3-12-python-desktop-board-1440x900.png)。
这个探测暴露并修复了 Host 把 Done 计入 TODO 相邻位置、卡片 Enter 拦截嵌套
排序按钮的两个真实问题，新增 Python/Vue 回归测试。P1 的 T021/T022/T025
在这里取得真实 Host/Desktop 证据，从 deferred 映射移除。

## 验收范围与已知限制

权威 P3 阶段出口“以任务版本和快照为依据形成可验收交付，不把绿灯当证据”
已在当前 macOS arm64 开发路径满足。P3-12 引用的 T116–T120 属 M24 Agent
评测：公平单 Agent/多角色预算、隐藏 holdout、策略灰度回滚与评测汇总目前
缺少 P6/P9 能力，仍分别映射 P6-09/P9-06 为
`DEFERRED_VERIFICATION`，**没有标 PASSED**；见 [ADR 0047](../decisions/0047-p3-delivery-acceptance-scope.md)。
Review 退回与测试失败的确定性 fixture 使用真实 Git/SQLite/子进程，但没有
把 fixture 的结构化 Reviewer 输出称作在线 Codex 第二轮 Review；线上正常路径
则使用真实 Codex。Plan 编辑与自定义 Workflow Runtime、第二执行器、
全角色评测还在后续阶段。Windows x64、macOS Intel、安装包/签名/DPI、
现有用户库 v23→24 与无人值守的历史孤儿进程恢复仍未验证。
