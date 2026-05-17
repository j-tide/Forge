# ADR 0003: SQLite 数据库与原生模块策略

日期：2026-09-23。状态：P0-04 已在 macOS arm64 实测；安装包和其他平台待验证。

## 决定

- 沿用蓝图的 SQLite + Drizzle 路线。SQLite 在独立 Host 内由 `@forge/persistence` 独占写连接；Drizzle 当前仅处理内部 `runtime_metadata`，不提前落地参考 `schema.sql` 的业务表。上层只使用 `open/close/migrate/health/transaction` 和受限元数据接口，不取得 SQLite driver 或 SQL 连接。
- 选择 `better-sqlite3@13.0.3`（MIT）和 `drizzle-orm@0.45.3`（Apache-2.0）。前者是原生模块，但 13.x 官方已迁到 N-API，npm 包自带平台 `.node` 预构建文件，13.0.3 没有安装脚本。仓库保持 `ignoreScripts: true`；没有执行 rebuild、全局安装或放宽供应链策略。
- 数据库默认位于系统应用数据目录下的 `Forge/development` 或 `Forge/production`；测试显式指定独立临时目录。Desktop Main 只给 Host 提供 Forge 数据目录，不打开数据库、不运行 SQL，也不向 Renderer 暴露路径。Host 使用 `node:path` 构造文件名。
- 每条迁移按固定序号、SHA-256 checksum 和 `schema_migrations(version, applied_at, checksum)` 记录；SQLite 事务包裹 DDL、记录与 `user_version`。v1 建立迁移记录与 `runtime_metadata`；v2 为后者增加 `updated_at` 和索引。旧版本可升级，重复运行不执行；未知未来版本、缺口或 checksum 不符拒绝打开为 ready。
- Persistence 事务回调必须同步完成；返回 thenable 会回滚，逸出的事务句柄失效。迁移未达当前版本或失败后，公开 metadata 写入被拒绝，Host 将其视为存储不可用。
- 每个 Host 连接启用 `foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000`。WAL 适合单写者和并发读取；备份通过 SQLite backup API 获取一致快照，不复制活跃主 DB 文件代替备份。
- Host 初始化或健康检查失败时状态为 `degraded`，Storage 为 `unavailable`，向 UI 返回安全的 ForgeError 代码，不传内部 SQL/路径。P0-04 扩展了健康契约，因此明确升级 Host 协议为 `forge-host-protocol/v2`；v1 不被静默视为兼容。

## 本机原生模块结果

| Host 运行方式 | 实测 Runtime | `better-sqlite3` |
| --- | --- | --- |
| 独立 Node Host | Node 22.22.0，modules ABI 127，darwin/arm64 | 包内 `darwin-arm64.node` 加载成功；SQLite 3.53.4，schema 2，WAL。 |
| Electron 44.4.3 utilityProcess Host | Node 24.21.0，modules ABI 149，darwin/arm64 | 同一包的 N-API 预构建文件加载成功；构建后 Desktop smoke 取得真实 Storage ready、schema 2。 |

Electron 文档通常要求针对其 ABI 处理原生模块；本次不能仅由 N-API 声明推断兼容，而是以两个真实 Host 的加载结果为准。`pnpm build` 后仍依赖 workspace 安装图里的平台 `.node` 文件。尚未制作 `.asar`/安装包；打包时需确保原生文件随包分发并从 asar 外加载，签名、公证和 Windows/macOS Intel 需要各自实测。未来若替换 driver，只修改 Persistence 内部实现及平台验证，不把 driver 泄漏给 Core/Renderer。

## 范围与风险

本轮不建立任务、审批、事件、插件或记忆业务表。参考 `forge_spec_v1.0/contracts/schema.sql` 的 `schema_migrations` 字段形状已沿用；其完整 DDL 属于后续业务阶段。T086 的业务事务原子性、T089 的真实磁盘满、T090 插件 namespace 权限尚不具备对应业务模块；本轮只验证底层进程中断回滚、SQLite 锁/IO 映射、接口不泄露连接。Windows 与 macOS Intel 未验证，不宣称跨平台验收完成。

来源：[SQLite WAL](https://www.sqlite.org/wal.html)、[SQLite 备份 API](https://www.sqlite.org/backup.html)、[better-sqlite3 v13 N-API 发布说明](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)、[Drizzle SQLite 驱动](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)、[Electron 原生模块](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules)。
