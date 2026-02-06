# P2-10 · Python Host 纵向真实 Demo 人工检查

日期：2026-09-24；平台：macOS arm64。使用真实 Electron Desktop、独立 Python Host、已认证的 Codex 0.155.1 app-server、SQLite schema 16 和一次性 Git fixture。所有 Run 都经 Renderer 固定 bridge → Main → Python JSON-RPC stdio；fixture 放在独立临时目录，结束后移除。没有使用 Mock Agent 或在 Forge 源仓库执行写入任务。

## 成功路径

执行 `FORGE_VERTICAL_MODEL=gpt-6-sol node scripts/smoke-python-vertical-live.mjs`，返回 exit 0。Project 由系统目录选择并显式 Trust；保存消息、创建手工 Task Draft、人工修订和审批后进入 TODO；用户显式选择真实可用模型并启动。Run `e67668ee-a32f-4718-9831-043ac3919746` 的终态是 `succeeded`，CodeSnapshot `1590ba02-38f1-4bea-b8b1-218ba171c290`。真实 Codex 仅修改隔离工作区的 `math.js` 和 `test.js`；工作区中执行 `node test.js` 成功，来源仓库 HEAD 与 `git status --porcelain` 保持不变。Desktop 重新加载后，任务详情显示已冻结 CodeSnapshot，截图在 `output/playwright/mig-py-09-python-desktop-run-1440x900.png`。

人工检查生成的 `output/playwright/p2-10-vertical.diff`：`add(a,b)` 对非 number 输入抛出 `TypeError`，保留正常加法；新增了字符串、null、undefined、对象四个拒绝断言。变更与该 fixture 的批准目标相符，未改 `package.json`。这个人工检查只针对 fixture 的代码差异，**不等于**后续 Review/Verify 或用户对正式 Task 的验收；Handoff 中的 AC 仍是 `unverified`，任务没有进入 Done。

## 失败与停止路径

- 同一命令的第二个已批准 Task 运行 `node hold.js` 时，有真实 `command.started` 观察记录。测试按 ProcessController journal 中与该 Run 匹配的 ownership 精确定位本轮 Codex PID，再只终止该 PID。Run `97b6b00b-8598-4cb3-9952-34871ee40bff` 进入 `failed`，留下 `run.failed`，没有 Handoff；来源仓库仍干净。这是实际提供方进程中断，不是伪造错误消息。
- 执行 `FORGE_VERTICAL_SKIP_SUCCESS=1 FORGE_VERTICAL_TERMINATION=cancel node scripts/smoke-python-vertical-live.mjs` 返回 exit 0。长命令启动后，Desktop 固定 `run.cancel` 命令使 Run `07698a53-3f18-464b-8b7e-7a5ee6dd57bc` 进入 `cancelled`，留下 `run.cancelled`；owned app-server 的 process journal 不再为 running，等待 2 秒后隔离工作区没有后续写入，Handoff 为空。测试没有按进程名批量杀进程。
- 一次较早的真实 Codex 调用返回 completed，但没有按目标产生文件修改；验收脚本正确地以 `noChange` 拒绝将它算作成功。这说明模型成功终态本身不是代码交付证据。本报告只把上面有实际 Diff、测试和快照的一次计为成功。

## 可复现性与限制

`pnpm install --frozen-lockfile`、`pnpm validate:contracts`、`pnpm validate:task-map`、`pnpm py:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm smoke:desktop` 和 `git diff --check` 均 exit 0；命令日志在 `/tmp/forge-p2-10-*.log`。`output/` 是本地生成且被 Git 忽略，重新执行成功命令可生成 Diff 与截图。真实 Codex 测试依赖当前本机登录和服务可用性；云端波动或模型不改文件会使验收脚本失败，不被改写成绿色结果。

权威 T116–T120 保持 `DEFERRED_VERIFICATION`，其 P2-10 对应 owner 映射在 `docs/deferred-verification.json`：T116/T117/T119/T120→P6-09，T118→P9-06。没有标为 PASSED。Windows x64、macOS Intel、安装包、签名、公证、系统 DPI、Host 突然死亡后的 Codex orphan 恢复仍未验证。
