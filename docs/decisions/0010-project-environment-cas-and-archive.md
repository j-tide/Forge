# ADR 0010: Project/Environment 版本、归属与归档

日期：2026-09-23。状态：P1-02 已在 macOS arm64 验证。

## 决定

- 生产 migration v4 在 P1-01 的 `projects` 基础上增加 `revision` 与 `archived_at`，并只新增 `environments`、`command_presets`。这与参考 `contracts/schema.sql` 的完整未来 DDL 保持同一实体、归属和关键字段；生产库暂不复制 Task/Run/插件等后续表。
- 每次已有 Project、Environment、CommandPreset 写入必须带 `expectedRevision`，SQL 使用 `WHERE revision = ?` 并在同一事务中递增；未命中返回明确冲突，不静默覆盖。创建使用期望版本 0 与唯一约束。Host 根据自己的已认证本地通道确定调用者，输入的 projectId 只能用于定位，不能证明身份。
- Environment 与 CommandPreset 都存 `project_id`，所有读取、修改和引用检查同时限定项目；跨项目资源以不可见处理。CommandPreset 仅保存可审查的 `executable + argv[] + cwdRelative + envRefs + timeoutSeconds` 配置与来源 hash，不在本任务执行项目命令。授权时将精确配置摘要与版本绑定，后续修改会使授权失效。
- `Remove from Forge` 从 P1-01 的无关联物理删除切换为项目归档：保留 trust、环境与命令配置供未来审计，不删除用户仓库或 Forge 历史记录。普通列表和 active project 不显示归档项；归档后写操作拒绝。P1-01 的旧库由无损迁移补上 revision=1。未来 Task/Run 表仍需依外键和保留策略扩展。
- `forge_spec_v1.0/contracts/openapi.yaml` 对完整产品命令使用顶层 `expectedRevision`/`idempotencyKey`；当前 Desktop 私有 Host protocol 仍采用固定本地 project 命令。P1-02 对所有写命令增加期望版本并升协议版本；不把当前私有桥冒充未来 Remote Gateway。独立幂等键/持久 receipt 属于正式 CommandService 阶段，当前 commandId 与唯一约束、CAS 共同避免重复副作用。

## 兼容与边界

参考 `schema.sql` 的 `projects.host_id`、`trust_mode` 是完整产品字段；当前只有单本地 Host 与显式 `project-trust/v1`，仍按 ADR 0008 的渐进迁移保留差异。生产 `environments`/`command_presets` 增加 `archived_at` 与时间戳以支持本阶段的非破坏性归档；参考 DDL 的 `approval_hash` 是非空字符串，生产 API 对未批准配置呈现为 null。参考包不修改，差异写在本 ADR 和兼容记录。Windows 大小写路径、跨设备仓库搬迁及远程身份/权限后续验证。
