# 从这里开始实施 Forge

本包是一套产品/工程规格与可点击设计，不是已经实现的Forge程序，也不是可安装客户端。

## 1. 先看产品
在浏览器打开 `design/index.html`。左侧输入、任务草稿审批、看板、运行详情、Review、验收、流程、角色、插件、知识、设备和设置都可切换。底部 Mobile Companion 打开手机页面。原型无网络依赖，所有任务与日志都是示例。

## 2. 阅读顺序
- `docs/forge_blueprint_v1.0.md`：权威主文档；PDF/Word方便阅读。
- `AGENTS.md`：Codex每轮必须遵守的工程规则。
- `planning/tasks.json`：100项带编号、依赖、路径、实现方法和验收条件的任务。
- `contracts/`：JSON Schema、SQL、OpenAPI与TypeScript公开契约。
- `design/page-specs.json`：18个页面的行为与状态。
- `tests/acceptance-cases.json`：120条待实现测试规格。

## 3. 建仓库时的放置
创建独立 `forge` 仓库，把本包作为规格保留。AGENTS.md放根目录；docs、planning、contracts、design、tests保留相对位置。应用代码从 `apps/desktop`、`apps/host`、`packages/*` 开始建立。`design/index.html`是参照，不是生产代码入口。

## 4. 第一轮交给Codex
使用 `docs/codex-task-prompt.md`，任务ID先填 **P0-01**。读取P0全部风险后，只实现P0-01；测试通过再推进。P0不做复杂Agent，不做远程，也不装插件市场。

P0的最重要结果：双平台Electron壳能启动；Host独立；本地命令与数据库可验证；真实SDK能力、SQLite ABI、进程取消和工作区路径在目标平台完成探测。验证不过则调整ADR，不能带着未知风险直接做界面。

## 5. 第一个有用的里程碑
P3结束：一个真实TODO经批准后，由开发、Review、既有测试与人工验收完成；有差异、日志、快照、失败返工和恢复，不需要先完成所有配置页。

P0–P6：Desktop v1.0完整范围。P7–P8：远程网关与手机PWA，作为v1.1。P9：高级并行、第三方扩展、混合检索和受控策略优化，不阻塞v1.0。

## 6. 运行本包的静态校验（不是产品测试）
在隔离Python环境安装 `jsonschema` 和 `PyYAML`，执行：
```bash
python scripts/validate_pack.py
```
它只检查Schema/示例、依赖与测试引用、SQL约束、默认流程和API引用，不会调用模型或Git写入用户仓库。已执行报告在 `tests/pack-validation.json`。原型交互冒烟报告在 `tests/prototype-smoke.json`。

## 7. 不能跳过的发布确认
真实模型认证与计费授权由你配置；签名/公证证书需要开发者账号；最低OS版本、SDK与原生模块兼容性在P0实测填写。文档不给“一次提示即可生成所有功能”的保证，也不把样例截图当产品完成。
