# Forge Desktop 实施状态

## 2026-09-29：唯一桌面工程

用户明确要求“整个旧 Forge 实现全部删除，只保留新 desktop/”。本次按这一范围删除根目录旧源码与旧资料：apps/、packages/、plugins/、python/、tests/、scripts/、docs/、release/，以及 pnpm、旧 lint/typecheck/版本配置和旧 CI，共 **726 个受 Git 管理的文件**。旧生成文件、依赖和 QA 缓存同时清理。

唯一源码工作区为 desktop/。实际运行链路：React Renderer → Preload electronAPI → Electron Main IPC → Agent Workers → TypeScript AI Runtime / Vercel AI SDK。任务/配置使用当前实现的 JSON 与文件，记忆使用 libSQL；Git worktree 和 PTY 由新桌面服务管理。当前不存在原 Forge Python Core，也没有待接入旧 Core 的路线。Agent Worker 与 libSQL 记忆服务未完整接线；工作树创建失败时仍可能回退项目目录，不能承诺强制隔离执行。

README、架构说明、AGENTS 与 CI 已围绕这一实现整理。现有 preview.5 安装包本身使用该新桌面；删除旧根源码不改变其生产业务代码、锁文件、应用 ID 或数据目录。已发布 tag、安装包和对应源码仍是相应版本发布时的内容，不覆盖历史附件。

真实用户设置、账号、项目、任务和 SQLite 未删除。preview.5 原始验证记录移动到 desktop/output/release-preview5/；原上游导入历史的已验证 Git bundle 和映射保存在 .git/forge-import-history/。它们不是第二套可运行产品。

## 验证范围

- 当前编译与依赖仅来自 desktop/；已检查相对源码导入、npm workspace 链接、打包许可/资源路径不依赖根旧目录。
- preview.5 的 336 个 Vitest 文件／5762 项测试、10 项 Node 检查、两主题真实 UI 与 DMG 安装态证据保持版本限定，见 [发布说明](releases/0.1.0-preview.5.md)。历史说明里的原 Python 工程检查只描述当时状态，不能作为当前工程门禁。
- 删除后重新执行 i18n、lint、typecheck、test、build，全部 exit 0；336 个 Vitest 文件／5762 项测试与 10 项 Node 检查通过。i18n 36 namespaces／5373 strings、0 errors／warnings；lint 保留 774 warnings／5 infos。验证记录于 desktop/output/legacy-removal/；未执行在线模型调用。完整在线 Agent、外部认证、Windows/macOS Intel 与正式签名/公证仍需各自真实验收。

## 来源

基于 Aperant v2.8.0-beta.6，保留 [AGPL LICENSE](../LICENSE)、[上游来源与修改记录](../UPSTREAM.md)、应用内来源入口及对应源码。
