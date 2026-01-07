# ADR 0015: Task board projection and ordering

日期：2026-09-24。状态：P1-07 已在 macOS arm64 验证。

## 决定

- 看板从 Host 持有的正式 `tasks` 表读权威快照，不从 Renderer 本地推断 Task 状态。五列固定为 TODO、开发中、Review、验证、Done；当前只有经 P1-06 人工批准的 TODO 可实际出现。未来 workflow/Review/Verify 通过领域状态命令产生其他列，P1-07 不开放任意 state PATCH，也不伪造中间列数据。
- 生产 SQLite migration v9 为 Task 增加同列整数 `position`、记录 revision/更新时间，并回填旧 v8 已批准任务的稳定顺序；新增 `board_state` revision、按项目递增游标的 `board_events` 与 `board_reorder_receipts`。批准入 TODO 与看板事件/版本同事务；旧批准事件被迁移到看板事件表。相同 `eventId` 由数据库唯一约束拒绝，重复投递不重复卡片/计数。
- `board.snapshot` 和 `tasks.reorder` 是唯一新增固定命令。排序由 Host 在 SQLite 事务中检查项目、同列相邻目标、看板 revision 与幂等键，更新整数位置并返回新快照；越列和未知 Task 状态命令均拒绝。UI 通过上/下按钮和同列拖放调用相同语义命令；过滤时暂禁重排，避免把隐藏卡片当不存在。
- UI 使用正式 `@forge/ui` 与 glass v1.1 token，五列在窄宽度水平滚动，长列按固定卡片高度窗口化。筛选是纯投影，不改变 Task 状态。无项目、无任务、Host 不可用和读取错误分别展示，不把旧快照冒充当前在线数据。
- “手工创建任务”复用现有会话消息→手工草稿→修订→单独人工审批链路。前几个步骤失败时可能保留可见的会话/草稿，但绝不直接生成正式 Task；用户需在 Drawer 中再次明确批准。来源消息和用户决定引用仍保留。

## 规格映射与后续

- `forge_spec_v1.0/contracts/openapi.yaml` 的 `TaskSummary` 是未来远端公开 API 的权威字段；当前私有 Desktop bridge 的 `BoardTask` 增加 `priority`、`position` 和当前可用的 `executorId:null`，供本地筛选/排序使用。没有启动远端 API，也没有修改参考 Schema。生产 v8 `tasks.state` 目前仅接受 `todo`；未来状态迁移需在对应 workflow/Review/Verify Task 中扩展，并保持审批门禁。当前五列不代表这四个未来状态已可达。
- T021 的 TODO→Done 越列拖动被阻止，并提示 Review、Verify、人工验收门禁；T022 的多状态/Executor fixture 用纯投影测试，真实产品目前没有 Run/Agent 状态；T023 重复 ID 的数据库和投影测试通过；T024 空状态与 Host 不可用实测，细粒度只读 principal/scope 待身份能力；T025 同列键盘按钮与真实 Desktop 排序通过，跨列的合法语义命令属于后续状态能力。
- Windows x64、macOS Intel、系统 DPI、安装包/签名及远端多客户端权限仍未实测。当前 macOS arm64 的 1280×800 窗口已验证横向滚动，不等于 Windows 150% 系统缩放验收。
