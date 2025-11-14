# Forge — Codex 实施规则

你在实现 Forge：自然语言需求 → Task Contract → 人类审批 → 多 Agent 研发流程 → 可核查交付的 Windows/macOS Desktop。

## 先读再改
1. 阅读 `START_HERE.md` 与 `docs/forge_blueprint_v1.0.md` 的产品边界、状态、插件和安全章节。
2. 读取 `planning/tasks.json` 中当前被分配任务的依赖、路径、验收与 testIds。
3. 读取对应 `contracts/` 和 `design/page-specs.json`。先核对现有代码；不要假设上一个任务已经完成。
4. 每次只实现一个可验收任务或经过确认的纵向切片。不把100个任务一次性生成一堆空壳。

## 不可改变的产品边界
- Forge 是独立项目；不得添加 ProofRun 源码依赖、共同业务内核、数据库或专用流程。
- 审批之后只进入 TODO，默认不自动开始。最终 Done 不等于合并或上线。
- 内核掌握审批、权限、任务与执行状态、快照和验收；插件只能提供能力，不能直接写核心数据库或伪造用户身份。
- 手机只是远端控制端；真实仓库、代码写入、CLI与模型会话在Host。离线手机不能排队批准、启动或合并。
- 不支持的能力必须显示不支持；模型、执行器、角色不是任意兼容。

## 实现纪律
- TypeScript strict。公共输入运行时Schema校验，未知字段拒绝。插件依赖公开API而不是core/src内部。
- 状态改变必须经过同一CommandService；本地IPC与远端网关不能有不同的审批规则。
- 身份和scope由Host认证注入，不从模型文本或payload读取。
- 审批绑定revision与scopeHash；审查/验证绑定snapshot。旧结果只能审计，不能推进新任务。
- SQLite事务不可跨LLM或Shell调用。外部动作先记录intent；崩溃后先对账，不盲目再执行。
- 单任务同一工作区最多一个写入者；取消尚未确认进程退出，不能释放写租约。
- Review运行环境和验收规范不可被开发随意修改；主工作区不自动stash、不force、不批量清空。
- raw Model/API/CLI接口先查对应官方文档并冻结版本。不得凭空造SDK方法。没有可用认证就报告阻塞，不用Mock假装验证成功。
- Claude Agent SDK第三方认证按官方要求；不能默认承诺可直接使用个人订阅登录。Codex App Server属于可选后续，不能静默替换默认SDK。
- 不在renderer暴露Node/任意IPC，不加载任意远程代码。子进程和worktree不是恶意代码沙箱。
- 数据日志脱敏；secretValue不进receipt/hash明文日志/诊断；保存不显示完整Key；手机缓存不得包含源码和敏感产物。

## 设计纪律
实现Vue组件，而不是直接搬原型HTML字符串。复用tokens、状态、间距与交互层级。不得用固定setTimeout模拟Agent成功；非真实运行数据必须带Demo标签。没有后端支撑的按钮不能在正式模式声称成功。保留empty/loading/error/stale/offline/unauthorized状态。原型中部分按钮只是说明性toast，实际产品按页面规格和Command契约实现。

## 测试与完成定义
- 先添加对应失败用例，完成实现后运行受影响测试、lint、typecheck与必要集成测试。
- `tests/acceptance-cases.json` 是待实现规格，不是已通过报告；完成时链接真实测试文件与证据。
- 不得删除断言、跳过困难测试、篡改验收标准来通过。证据不足用unverified。
- 产品跨平台验收需要真实macOS/Windows运行记录。Linux容器内的静态校验不能代替。
- 正式提交须列出：任务ID、变更文件、实现行为、运行命令、结果、截图/日志、未完成与风险。
- 测试失败必须说明。无模型Key、签名凭据、Windows/Mac机器时标记blocked；可以完成其余独立工作但不将任务标done。

## 安全例外与变更
发现规格矛盾、安全风险或上游API变更，先创建 `docs/decisions/` ADR，说明冲突和最小修改建议，取得用户确认后同步Schema、文档、测试；不得静默改架构。新增网络调用、依赖安装脚本、第三方可执行插件、权限扩大均需审核。

## 建议的每次任务输出
```text
Task: Pn-nn
Implemented: ...
Files: ...
Tests run: command -> result
Evidence: ...
Not verified / blocked: ...
Next eligible task: ...
```
