# ADR 0007: 契约校验与权威来源边界

日期：2026-09-23。状态：P0-08 在当前 macOS arm64 工程中采用。

## 决定

- `forge_spec_v1.0/contracts/`、`planning/`、`presets/`、`tests/` 是只读的参考产品契约来源。`@forge/contract-validator` 从仓库根目录读取这些文件并输出 `ValidationReport`；不会修复或写回参考包。正式应用运行时仍只依赖 `packages/contracts` 的公开入口，Host 不从参考目录加载 Schema。
- `packages/ui/src/tokens/values.json` 是正式视觉 token 的唯一手工维护来源，`tokens.css` 由已有构建脚本生成。`forge_glass_v1.1/design/tokens.json` 是视觉参考，不要求与工程 token 字节相同。
- Ajv 8 使用 draft 2020-12 严格编译 13 个参考 Schema，并校验匹配的示例、Profile 与 Workflow。YAML 2 解析工作流和 OpenAPI，重复键作为错误。`ReferenceIndex` 按 schema、task、test、module、phase、profile、workflow、plugin、executor 等 namespace 收集 ID 和跨文件引用。静态绑定声明只表示参考包中的名称可解析，不代表已安装、已探测或可运行。
- OpenAPI 校验限定为 3.1 版本、路径/方法、唯一 operationId、响应、security scheme、本地 `$ref` 和命令声明一致性；它不是完整 OpenAPI 规范证明。工作区直接依赖还需与 `versions.lock.json` 和已安装许可证清单一致。SQL 校验在独立的 SQLite `:memory:` 实例执行参考 DDL，并在另一实例按序执行当前生产 migration SQL；不连接用户开发库，也不复制 P0-04 migration runner。
- CLI 的错误有稳定代码、文件、字段路径和非零退出码；warning 保留但不默认阻断。`pnpm validate:contracts` 在 CI 中独立于测试运行。Linux CI 不运行 Electron smoke、真实 Codex 或工作区在线探测；它们保留为本机/目标平台验收。

## 当前规格差异与边界

- 参考 Profile 的 `codex-sdk` 来自示例 Manifest，`forge.refiner` 是参考声明；当前实际 Codex Adapter 主要使用 app-server，完整 Plugin Host 尚未实现。校验器提示 reference-only warning，不把它们写为 runtime-supported，也不改只读基线。后续 P4 建立实际 manifest/装配后再由生产注册表验证。
- 参考任务 P0-08 关联 T116–T120，它们描述评测公平性、隐藏验收、策略回滚、成本与取消统计，并非本轮静态契约校验的可执行验收。P0-08 的工程校验由新增 mutation/unit 测试、CLI 非零退出码与 CI 步骤证明。T116–T120 仍为 `specified_not_executed`，不改原任务清单。
- 静态工具不能证明 SDK、Windows/macOS Intel、安装包、代码签名、DPI 或未来业务运行时契约正确；这些需要各自的真实验收。
