# ADR 0005: 工作区与进程归属策略

日期：2026-09-23。状态：P0-06 macOS arm64 基础设施 Spike 已实测；Windows、macOS Intel 与安装包未验证。

## 决定与范围

- `@forge/workspace` 提供公开 `WorkspaceDescriptor` 与 create/acquire/inspect/release/dispose。P0-06 使用 **detached Git worktree**，基线固定为解析后的 commit SHA。源仓库可为脏树，但 Forge 不清理、stash、reset 或改写其工作树。完整任务分支、snapshot、lease epoch 和集成合并仍属 P2/P3。
- 工作区放在 Host 自有数据目录的 `workspaces/trees/<UUID>`；owner 记录放在同根 `records/<UUID>.json`，包含 workspaceId、runId、创建时间、Host runtimeId、随机 ownershipId、规范 source repo 与 Git common dir identity、base SHA。当前测试覆盖中文、空格和较长目录名。所有 Git 调用使用 executable + argv，并通过受控空目录覆盖 `core.hooksPath`；真实恶意 `post-checkout` fixture 未被执行。不用 shell string，也不执行 `git worktree prune`。
- `@forge/process` 提供严格描述符和 `ProcessController`。每个 Forge 直接启动的顶层子进程在 macOS/Linux 上使用独立 POSIX 进程组；内存中的 child handle、随机 processId、runId、Host runtimeId、PID、父记录 ID、启动时间与进程组共同构成当前运行期的归属证据。对本轮当前运行期的组先发 SIGTERM，有限等待后只对该组发 SIGKILL，再确认组退出。Node `shell:false`，可执行文件和 `argv[]` 分开传递。默认环境只带基础运行变量；Codex 另有自己的受限认证/代理白名单。
- Windows 不具备本轮已验证的等价 Node 进程组终止能力；`ProcessController.spawn()` 在 win32 明确拒绝，不提供返回成功的 stub。未来需要可核验的 Windows Job Object 或等价后端。Linux 代码路径存在但尚未实测。本 ADR 不把 macOS 结果写成双平台通过。

## Codex、取消与 Host 生命周期

Codex CLI 短命令和 app-server 都经 `ProcessController` 启动；Host Registry 注入 Host 所拥有的 Controller。实际观察到 app-server PID **不与** Codex 命令组共用 PGID：一次长任务中 app-server 29065，命令父/子/孙为 29485/29486/29487，三者 PGID 29485。因此只杀 app-server 进程组不足以声明 Codex 命令树停止。正常取消先调用 app-server `turn/interrupt`，等待 provider 报告 interrupted；Adapter 在确认其直接拥有的 app-server 组停止后才发 `run.cancelled`。P0-06 独立 fixture 进一步验证三个命令 PID 消失、心跳不再写入，然后才允许 HostRunResources 释放 worktree。Codex 内部命令组当前依赖 provider 中断实现清理；任意自行 `setsid` 脱离的恶意子进程尚未证明可收拢，不能把 worktree 当安全沙箱。

HostRunResources 的基础设施路径是：受控 descriptor → 启动 → 请求 provider 取消 → 等待有限超时 → 检查 Forge 直接拥有的组与本次探测的子孙退出 → release。provider 未确认、验证失败或仍有已知活动进程时，workspace 记为 `failed`（隔离），不伪报 cancelled，也不复用写租约。Host shutdown 先停止接受新 Run，dispose Executor/Controller 后把仍未释放的 workspace 标记为 `failed`；Desktop Main 仍只管理 Host 进程，等待上限从 2 秒调整为 8 秒。

## 删除与重启安全

- 清理只能接受 WorkspaceManager 已登记的 UUID。释放前重新验证受控根目录内路径、非 symlink、Git top-level/common-dir 和 `worktree list` 记录；脏工作区需显式 `discardChanges`。二次 release 幂等；运行中进程阻止 release。失败保留记录与目录供诊断，不能按目录名前缀删除。源仓库其他 worktree 不受影响。
- 进程强制信号只依据当前 Controller 内存中的 child handle 和从未观察到消失的进程组；不会根据历史 journal 的裸 PID 自动 kill。进程组消失后视为不可再次信号，降低 PID reuse 误伤风险。Host 崩溃后，新的 runtime 仅读取旧记录并报告**可能 orphan**，不自动恢复或清理；历史 PID 与目录名都不是足够的清理授权。
- 进程与工作区私有 journal 只保存非凭据归属字段。没有正式 Task 数据库表，也没有 Renderer/Main 的文件或进程 API。Host 异常退出时，工作区与可能残留进程需人工检查；当前不会用不确定的旧 PID 进行自动清理。

## 本机证据与未验证

真实 Git fixture 在中文/空格/长路径创建、修改、移除 detached worktree；源仓库 dirty marker、HEAD 与 Git status 不变；恶意 ID、symlink 替换与活动进程阻止清理。真实 Node 父/子/孙进程组取消含强制超时，Run B 与非 Forge 用户进程保持在线，原端口可再绑定；父进程先退出时也能发现旧组并取消。Host Registry 退出路径停接新 Run 并清理已启动的子孙进程。真实 Codex 长任务的 PID、PGID、心跳、源仓库与 release 结果由 `pnpm test:workspace-live` 记录。

规格 P0-06 引用 T046–T050，其中单写者与路径/Git 参数基础防护在本轮测到；T047 完整未跟踪文件 snapshot 和 T050 分支前移后的合并重验属于 P2/P3，不能冒充已完成。P0-06 任务表写“两平台无残留写进程”，当前只能声明 macOS arm64 实测通过；Windows x64、macOS Intel、Linux、安装包与异常脱组子进程仍未验证。

依据：[Git worktree 官方文档](https://git-scm.com/docs/git-worktree)、[Node child_process 官方文档](https://nodejs.org/api/child_process.html)、[Node process.kill 官方文档](https://nodejs.org/api/process.html)。Node 官方资料明确：POSIX `detached` 创建新进程组；Windows 行为不同，且 `subprocess.killed` 仅表示信号发送，不代表进程已经退出。上面的兼容结论以本机实测为限。
