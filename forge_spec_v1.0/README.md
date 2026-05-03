# Forge · 产品与工程实施包 v1.0

**自然语言驱动的AI研发工作台。** 你表达想法，Forge整理成任务草稿；你确认之后，多Agent按可配置工作流执行开发、审查与验证，最终提交可以检查的代码和证据。

这是完整规格、契约、分阶段任务与交互原型的交付包，**不是已经完成的客户端源码**。

## 打开顺序
1. `START_HERE.md`
2. `design/index.html` — 可点击Desktop与手机原型，完全示例数据
3. `docs/forge_blueprint_v1.0.pdf` / `.docx` / `.md`
4. `AGENTS.md` + `planning/tasks.json`

## 范围
Electron + Vue 3 + TypeScript Desktop，Windows/macOS；独立Forge Host；插件化执行器、模型、上下文、工具、验证器。手机后续用PWA，连接在线Host，代码仍在主机执行。Forge与ProofRun独立，当前不集成。

## 文件
- `contracts/`：数据Schema、OpenAPI、SQL与插件公开TypeScript接口
- `presets/`：默认工作流与角色配置
- `planning/`：24模块、P0–P9阶段、100项工程任务、命令目录
- `tests/`：120条产品测试规格与本交付包静态校验报告
- `design/`：18页面规格、tokens、可点击原型和页面图
- `docs/`：主蓝图、Codex提示词、兼容性记录与来源
- `scripts/`：交付包校验，不运行真实Agent

## 真实状态
所有P任务状态是not_started。120条产品测试是specified_not_executed。只执行了本包Schema/示例/SQL校验与HTML交互冒烟；没有宣称已对实际Forge执行macOS/Windows安装或真实模型测试。图片中的任务、耗时、Token与结果均为演示。

## 使用原则
一次完成一个taskId并真实验证。不要把整个文档交给编程Agent要求一轮全部写完。任何SDK差异、权限实现或数据契约变更都要同步ADR、Schema与测试。
