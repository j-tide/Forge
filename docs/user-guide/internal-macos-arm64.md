# Forge 内部使用指南（macOS arm64，0.0.1 QA 包）

> **INTERNAL / ADHOC / UNNOTARIZED。** 此文档对应 DMG SHA-256 `a3bc0a9816dbc03a44b249305a708e8d51f5ceaf124cd820d3c5acba1e3187d9`。它不是已签名、公证或公开发布的 v1.0。构建后的 P6-07 Windows 源码准备和 P6-08 更新预检源码**不在这个既有 DMG 中**。

## 准备和安装范围

当前实测仅 macOS arm64。内部包在仓库 `build/macos/Forge-0.0.1-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`；真正的 QA 脚本把 DMG 只读挂载、复制应用至独立位置并从复制后的可执行文件启动。需核对上面的 SHA-256。由于仅 ad-hoc 签名，未配置过的 Mac 可能被 Gatekeeper 阻止；不要为试用全局关闭 Gatekeeper、删除隔离属性或绕过安全限制。若无法正常打开，记录为分发验收待办，不要把开发版运行结果替代安装结果。移除内部 `.app` 不删除 Forge 的用户数据；本机隔离 QA smoke 验证了这一点。

包内自带 CPython 3.12.13、Python Forge Host、SQLite、Web UI、插件和 Schema。**Git 和 Codex CLI 没有捆绑**；真实 Coding Run 还需要外部 `codex-cli 0.155.1` 和用户已有、合法的 ChatGPT 登录。可在自己的终端用 `git --version`、`codex --version`、`codex login status` 检查版本/登录状态，切勿把认证文件或令牌发给 Forge/聊天。GUI 启动进程的 PATH 可能与开发终端不同；在 clean PATH 下 Forge 能启动并把 Codex 显示为不可用，Finder 下自动发现用户级 CLI 仍未验收。网络代理只允许非凭据 URL 通过 Host 白名单；实际 Finder 代理和新用户认证也未验证。没有 Claude API Key 时 Claude 始终不可选。

## 首次项目与任务

1. 打开 Forge Desktop，确认 Host 是真实的 **connected** 状态。选择一个可丢弃的本地 Git 项目；Project Probe 只读检查 Git、分支、未提交变更、锁文件和声明的脚本，**不运行安装、构建或测试脚本**。
2. 查看探测结果和工作树 dirty 提示。明确点击 **Trust project** 才把项目保存为 Forge Project；Trust 只允许 Forge 将其作为可执行项目，不代表以后每个危险操作自动批准。
3. 保存需求消息，建立或整理一个可编辑 Task Draft。核对范围与验收条件后，另行人工批准。批准后的任务只进入 **TODO**，不会自动启动 Codex。
4. 在已批准任务中明确选择可用 Codex 模型并点击 Start。Forge Host 创建独立 Git Worktree，Codex 只修改隔离工作区。可看实时观察、实际 Diff、CodeSnapshot 和 Handoff；源项目目录不因一次开发 Run 自动改动。
5. Verify 只运行事先经人确认的 Command Preset，报告以真实退出码/快照为依据。Review 对固定快照独立只读执行；必要时按有限返工状态处理。逐条关联验收证据后，由项目 Owner 另行最终验收。只有最终验收才能使 Task 进入 Done。**Done 不表示已合并、推送或部署**；本地合并也需要独立显式操作和确认。
6. 退出并重新打开后，可在看板/任务抽屉查看持久化任务、Run 快照、Verify/Review 与交付记录。内部包真实验收了这一链路；[证据和截图](../demo/p6-internal-macos-package.md) 包含 Run ID、取消场景和 DMG 摘要。

## 取消与恢复

- 取消 Run 后必须等待实际归属进程退出。若退出无法确认，工作区应隔离并显示异常，不能把它当作已清理或成功。独立的长命令测试在内部包中确认取消后无继续写入。
- 活跃 Run 关窗时现有 Desktop 会提示取消关闭、留在托盘或安全停止并退出。托盘继续要求电脑和用户会话保持可用；睡眠/注销可能中断任务。当前 macOS 开发版真实测试了托盘和安全退出；不是 Windows/安装版全平台证明。
- Host 不可用或 Storage degraded 时查看 Settings 的受限诊断预览。诊断只显示版本、协议、存储状态、聚合数量与清理候选，导出前可预览；默认不包含源码、凭据和完整路径。数据库损坏时不要删除或重建 `forge.sqlite`；保留数据和 Forge 备份，记录安全错误码。没有经过验证的自动恢复向导。
- 已保存任务跨启动恢复，但中断的 Agent/合并操作不会因重启被无条件自动重放。无法确认的历史进程归属不会仅凭旧 PID 被终止。
- 当前没有签名自动更新器。P6-08 的离线签名元数据校验及迁移预演是**源码开发能力**，不是此 DMG 的安装升级功能。更新用户数据库前必须有实际安装包、备份、停机独占和回滚验收；不要手工复制新数据库覆盖旧数据。

## 已测范围与限制

| 项目 | 状态 |
| --- | --- |
| macOS arm64 内部 DMG 复制启动、包内 Python Host/SQLite、项目到 Done、取消、重启 | 当前 DMG 真实通过 |
| Codex 0.155.1 | 当前用户外部 CLI/ChatGPT 登录下真实通过；**非包内组件** |
| Web 普通浏览器 | 可渲染 UI；本轮没有本地项目选择/Host |
| macOS Developer ID、公证、新用户 Gatekeeper、x64/Intel、签名升级和凭据连续性 | **未验证 / 发布阻塞** |
| Windows x64 安装器、签名、UAC、中文路径、DPI 和完整任务 | **未验证 / P6-07 阻塞**；只有尚未运行的内部构建/测试入口 |
| Claude 第二真实执行器、完整多执行器发布 | **阻塞**；不以 Codex 替代 Claude |
| Planner/strict/任意图工作流、远程 Host、移动端、自动部署 | 尚未作为本内部包能力验收 |
| 完整 P6-09 T001–T095/T106–T120 和 P6 Phase Gate | **未通过**；见 [当前范围验收审计](../p6-current-scope-acceptance.md) |

Forge 与 ProofRun 独立。若需要检查当前源码的开发版，请用根 README 的 `pnpm dev:desktop`，但开发版运行不能用来证明这个 DMG 的安装行为。
