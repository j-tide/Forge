# Forge 仓库实施规则

## 当前唯一工程

- 2026-09-29 用户明确确认：整个旧 Forge 实现全部删除，只保留新 `desktop/`。旧 Vue/Electron 桌面、Node Host、Python Core、TypeScript Core、插件、契约、任务图、旧验收资料及根 pnpm 工程均已退出当前仓库；不得作为迁移参考或 fallback 重新引入。
- 唯一产品源码在 `desktop/`，采用独立 npm workspace、Electron + React + TypeScript。实际链路是 Renderer → Preload `electronAPI` → Electron Main IPC → Agent Workers → TypeScript AI Runtime / Vercel AI SDK。不要再描述为 Python Host 架构或待接入旧 Core。
- 根目录仅保留项目介绍、实施规则、Git 配置和新桌面 CI。根目录没有 package.json / pnpm workspace；开发与验证在 `desktop/` 执行。
- 新桌面基于 Aperant `v2.8.0-beta.6`，须保留上游署名、`desktop/LICENSE`、`desktop/UPSTREAM.md`、版权、应用内来源入口及对应源码义务。不得声称 Aperant 官方维护或原创全部上游代码。
- 上游公开历史导入快照不代表导入者原创。完整原导入历史的已验证本地 bundle 位于 `.git/forge-import-history/`；保留来源明确的原上游链接，不改写已发布版本的事实。

## 实施边界

- 按用户明确的当前需求增量修改。一次完成一个可验证功能或缺口，再继续下一项；真实用户入口与运行结果必须一致，不以 Demo 或模拟状态冒充成功。
- 保持 Forge 的玻璃视觉、中文/English、亮暗主题、键盘操作及减少动效/透明度真实有效；已保存偏好不覆盖。
- Renderer 使用公开 Preload 接口，不新增任意 Node/Shell/IPC 入口。身份、权限、执行取消与恢复按当前实际实现验证；不虚构已删除的 Task Contract / snapshot / Python Host 门禁。
- 模型及第三方服务的真实请求遵守用户认证和计费授权；外部发布、合并、删除真实资源依照用户明确授权。日志、诊断、截图及提交不得泄漏密钥。
- 保持应用 ID `dev.iamzjt.forgeglasspreview`、用户数据目录 `Forge Glass Preview` 及项目数据身份稳定。不得重置或删除真实用户项目、任务、SQLite、账号与设置。
- 自动上游更新、自动发布及默认错误上报继续关闭。手机、Companion、远程与跨设备新增开发后置。

## 验证与记录

- 使用 `desktop/package-lock.json`、Node.js 24+ 与 npm 10+。不得改用户全局工具；新增依赖须检查兼容性和许可证。
- 实际执行 i18n、lint、typecheck、test、build；UI/安装态、在线服务、SDK 与目标平台按真实验证结果记录，不将旧 Forge 的验收或条件夹具移用为当前产品证明。
- 当前实施记录位于 [desktop/docs/implementation-status.md](desktop/docs/implementation-status.md)。历史桌面预发布说明仅表示其发布时状态；当前路线不再受旧 Forge 架构约束。
- 发布遵循 [desktop/RELEASE.md](desktop/RELEASE.md)。未明确授权时不提交、推送、发布或覆盖既有版本；当前会话已授权的动作无需重复询问。

## Computer Use 生命周期

- 优先连接器、API、浏览器工具与 CLI。初始化 computer-use / @oai/sky / sky.* 后，记录同一 node_repl 的 process.pid；结束前运行 `/Users/iamzjt/.codex/bin/cleanup-computer-use --pid <pid> --shared-if-idle`。
- 仅在退出成功且 result=clean 时声明清理完成。PID 可用时必须按 PID 清理；不得用全局 pkill 或无授权的 --all。用户明确要求保留运行时则不清理并说明。
