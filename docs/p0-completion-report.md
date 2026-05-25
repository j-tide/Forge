# Forge P0 工程阶段收口报告

日期：2026-09-23。当前实际验证平台：macOS 27.0 arm64，Node 22.22.0、pnpm 12.3.4、Electron 44.4.3。Forge 版本仍是 `0.0.1`。本报告按真实代码、实施记录和本轮回归汇总；参考规格包的旧测试报告及 120 条验收描述不算产品测试通过。

| 任务 | 已实现的工程范围 | 验收状态与保留风险 |
| --- | --- | --- |
| P0-01 工作区与版本 | pnpm monorepo、strict TS、根检查命令、精确依赖、锁文件与许可证记录 | macOS 本机工程基线通过；T001–T005 的完整跨平台与窗口行为仍有后续项 |
| P0-02 Desktop / Shared Web | Electron Main/Preload、Vue Web 共享 Renderer、安全窗口与 Web 空状态 | macOS Desktop/Web 启动和 smoke 通过；Windows、macOS Intel、平台快捷键/系统 DPI 未验收 |
| P0-03 Host 与进程通信 | 独立 Host、私有本地 IPC、协议握手、健康/崩溃/owned shutdown | 本机真实 smoke 通过；业务命令的 CAS、持久幂等、RemoteTransport 未实现 |
| P0-04 SQLite 风险 | Host 单 owner、SQLite N-API、v1/v2 migration、WAL、事务与健康映射 | Node 与 Electron utilityProcess 在 macOS arm64 实测；安装包/`.asar`、Windows/Intel ABI 未验收 |
| P0-05 Codex Spike | 公共 Executor API、app-server Adapter、SDK 对比、真实 fixture 写入/事件/审批/恢复探测 | 本机 CLI 与真实模型测试有证据；SDK/上游版本、认证、打包后路径和长期稳定性仍待验证 |
| P0-06 Workspace / Process | Git worktree 隔离、Run 归属、POSIX 进程组取消与安全释放 | macOS arm64 父子孙与 Codex 长命令取消通过；Windows process-tree backend 当前不可用，恶意自行脱组未证明可控 |
| P0-07 Design System | `@forge/ui` 正式 token、组件、共享 AppShell、减少透明度/动效、开发 Showcase | macOS Electron/Web 与真实截图通过；Windows、Mac Retina、系统 DPI、读屏器、暗色主题未验收 |
| P0-08 契约校验 | 独立 `@forge/contract-validator`、Schema/示例/引用/Workflow/Profile/Manifest/OpenAPI/SQL/token 校验、mutation、CI 步骤 | 本机 46 文件 0 error、4 warning，12 组故意错误被拒绝；GitHub Linux job 尚未执行；T116–T120 是后续评测业务场景，未执行 |

## 本轮 P0 回归证据

- `pnpm install --frozen-lockfile`：14 个 workspace，供应链策略与 lockfile 通过。
- `pnpm validate:contracts`：46 文件，0 error，4 warning，exit 0；警告是参考 Profile 的 `codex-sdk` / `forge.refiner` 尚非已安装的运行时能力。
- `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`：均 exit 0；validator 的 13 项测试包含 12 项 mutation，每项检查 CLI exit 1。
- `pnpm smoke:desktop`：真实 Electron utilityProcess Host connected、Storage ready/schema 2、无效 DB 降级、Host 崩溃检测与 Renderer 沙箱边界通过。
- `pnpm probe:codex`：当前 macOS arm64 上锁定的 `codex-cli 0.155.1` 登录与 app-server 握手可用；不保证上游未来稳定。
- `pnpm test:workspace-live`：真实长命令三代 PID 取消、源仓库不变、隔离工作区释放，exit 0。
- `pnpm test:codex-live`：独立 fixture 的 SDK/app-server 只读与结构化输出、真实代码写入及测试、streaming、取消、跨连接/进程 continuation、审批接受/拒绝均 exit 0；依赖当前登录与上游服务。
- `git diff --check`：通过。当前大量 P0-01–P0-07 既有改动仍未提交；本轮未提交、推送或发布。

## 仍未关闭的 P0 工程风险

- **Windows x64：UNVERIFIED**。窗口/原生 SQLite/工作区路径和系统 DPI 未实机执行；P0-06 进程树 backend 当前不可用，不能声明双平台进程取消验收。
- **macOS Intel：UNVERIFIED**。Electron、SQLite 平台预构建、Codex 二进制、进程树与视觉未实测。
- **系统 DPI / 安装包 / 签名：UNVERIFIED**。P0-07 的 125% CSS zoom 只是一项模拟；真实 Retina/Windows DPI、`.asar` native addon 外置、Windows installer、macOS 签名和公证仍需目标产物测试。
- **Codex utilityProcess crash recovery：UNVERIFIED**。跨进程 thread continuation 已在独立 Node Host 探测，不等于 Electron utilityProcess 在真实活动 Run 崩溃后的安全恢复。上游鉴权/网络与模型能力也会变化。
- **规范与代码映射**：参考 `codex-sdk` Profile/Manifest 与现有 app-server Adapter 的运行时 ID/装配还没有生产 Plugin Host；参考 P0-08 的 T116–T120 属于评测阶段，不能算已执行。静态 OpenAPI/SQL 校验不证明未来业务运行时行为。

P0 阶段的本机工程基础已可用于下一项任务，但本报告不声明完整桌面产品或跨平台验收完成。下一项满足依赖的任务是 P1-01「项目选择与可信环境向导」；本轮未开始。
