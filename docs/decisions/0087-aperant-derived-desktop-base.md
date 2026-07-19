# ADR 0087 · Aperant 2.8.0-beta.6 衍生桌面基座

状态：用户明确批准技术路线；独立衍生版开发中，尚未接入 Forge Python Host（2026-09-27）。

## 背景

ADR 0085/0086 选择在原 Forge 仓库独立编写 Vue 桌面，并以 Aperant 公开 2.x 对照交互、以用户视频和 `forge_glass_v1.1/design/` 对照视觉与动效。用户现已明确选择改用 **Aperant 2.8.0-beta.6 的衍生代码**作为未来 Forge Desktop 的基座，在其上实现 Forge 磨砂玻璃视觉。这改变的是未来桌面实现来源，不是对原 Forge 已有 Python Host、SQLite 数据、产品契约或验收证据的追溯替换。

## 决定

- 衍生开发位于独立兄弟仓库 `/Users/iamzjt/Desktop/my/myapp/Forge-Aperant`，从 [Aperant `v2.8.0-beta.6`](https://github.com/AndyMik90/Aperant/tree/v2.8.0-beta.6) 的提交 `cba7a0270ec794a14ac71615bc6c48085807ede6` 建立。保留上游来源、原有版权及许可证声明，显著标明衍生修改；采用独立应用身份与数据目录，避免覆盖既有 Forge 安装及用户数据。此仓库的代码来源应称为 **Aperant 衍生版**，不能称为独立编写的 Forge UI，也不能称为 Aperant 3.0。
- GitHub 使用独立仓库而非平台 fork 关系，以移除 GitHub 的 fork 标识；这只改变仓库元数据，不改变源码来源或 AGPL-3.0 义务。`UPSTREAM.md`、原许可证、上游提交记录及应用内来源说明持续保留。
- 衍生桌面的视觉目标继续沿用 ADR 0086：以用户提供的视频和只读设计资料对照银白/浅蓝灰雾面、亮暗主题、轻柔动效及可访问性回退；不得直接复制视频帧、原型素材或将原型 HTML 用作生产页面。Aperant 原有信息架构可作为起点，具体用户入口仍须符合 Forge 的真实产品状态和人工审批规则。
- 该新路线覆盖 ADR 0085 的「未来桌面必须独立重写且不得移植 Aperant 源码」选择，也覆盖 ADR 0086 对该独立重写路径的假定。ADR 0085/0086 中已实现的原 Forge 界面及其版本限定验收继续保留为历史证据；ADR 0086 的玻璃视觉方向继续有效。本决定不改动只读规格包、权威 Task/Test ID、状态/权限/安全边界或 P7/P8 后置顺序。
- 衍生代码受 [GNU AGPL-3.0](https://www.gnu.org/licenses/agpl.html) 约束，保留上游版权、许可及无担保声明。传播或分发修改版时，标明修改及日期，使受该许可证覆盖的作品遵循 AGPL-3.0，并按许可证第 4～6 节保留交互界面的适用法律声明、提供相应源代码及构建/安装所需脚本；若修改版支持网络交互，还须按第 13 节向远程用户显著提供免费获取相应源代码的入口。发布前核对实际打包内容、依赖许可证及源码交付方式。独立仓库与原 Forge 的许可边界在未来集成和分发前单独核定，不预设原 Forge 代码可在未经评估时并入衍生版。

## 集成边界与验收

原 Forge 仓库中的 Python Host 仍是已批准的最终业务 Runtime，原有 SQLite 项目、任务、Run 和审批记录原位保留；本 ADR 不执行数据迁移、重置、代码替换或安装覆盖。当前 Aperant 衍生版及其原有任务/执行链**尚未与 Forge Python Host 组成一个 Runtime**，不能把 Aperant 的现成功能或衍生版视觉预览记为 Forge Task/Run/Agent 产品验收。

后续迁移须有明确的接口与数据方案：将衍生 Desktop 的正常用户入口连接至 Forge 有版本的本地 Host 协议，逐项映射 Task Contract、人工审批、Run/Attempt、证据、插件、身份和权限；保持 Main/Preload/Renderer 边界与默认关闭的远程入口。先在隔离数据上验证，再以非破坏方式验证既有 SQLite 数据和安装共存。每项必须以当前衍生版的真实入口、Python Host 运行链路、安装态测试和权威验收用例证明；完整 Desktop 里程碑及发布门禁未因本 ADR 自动通过。涉及产品语义、安全或许可边界的实际冲突，先记录并作单独决策。
