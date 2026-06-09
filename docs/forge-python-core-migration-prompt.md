# Forge Python Core Migration — One-time Codex Prompt

```text
暂停当前 Forge Autopilot 的产品任务推进。

这是用户明确批准的核心架构更正：

Forge Desktop / UI 继续使用 Electron + Vue 3 + TypeScript；
Forge 的 Agent / Workflow / Run / Task / Approval / Plugin / Executor orchestration /
Context / RAG / Memory / Eval 核心 Runtime 改为 Python Host。

当前 Node/TypeScript Forge Host 不再是最终业务 Runtime。

请先阅读：
- 根 AGENTS.md
- docs/forge-codex-execution-playbook.md
- docs/forge-codex-autopilot-protocol.md
- docs/implementation-status.md
- docs/compatibility-record.md
- docs/forge-autopilot-state.md
- docs/forge-python-core-migration-plan.md
- 当前相关 ADR
- forge_spec_v1.0 的权威任务与契约

然后：

1. 不再继续 P2-10，也不开始 P3。
2. 将 P2-10 标记为 PAUSED_FOR_PYTHON_CORE_MIGRATION，不要标 DONE/BLOCKED。
3. 创建用户批准 ADR：Python Core Runtime Architecture。
4. ADR 明确：
   - Electron Main 只做系统集成与 Python Host 生命周期；
   - Vue/TS 保留 UI/Client；
   - Python Forge Host 成为业务与 Agent Runtime；
   - 本地通信使用 versioned JSON-RPC over stdio；
   - 本地不引入 FastAPI/TCP；
   - Remote HTTP/SSE/WebSocket 属于未来独立 Adapter。
5. 更新 AGENTS 和 Playbook 顶部架构规则，阻止后续继续增加 Node Agent Core。
6. 执行 docs/forge-python-core-migration-plan.md 中：
   MIG-PY-01 → MIG-PY-09。
7. 一次只做一个 MIG Task，但通过后自动继续下一个，不等待用户回复。
8. MIG-PY-09 完成后：
   - Python Host 是唯一正常业务 Runtime；
   - P1 / P2-01～P2-09 在 Python Host 上重新真实验收；
   - 将 P2-10 恢复为 TODO；
   - 自动继续原 Forge Autopilot。
9. 不重置 SQLite，不删除已有项目/任务/运行数据。
10. 不推倒 UI、Electron、安全边界和已有产品行为。
11. 现有 TypeScript Host/Core 迁移期间可作为 parity reference，但 MIG-PY-09 后不得作为生产 fallback。
12. ProofRun 继续完全独立。

Python 技术基线：
- Python 3.12+
- uv
- Pydantic v2
- asyncio
- pytest / pytest-asyncio
- Ruff
- 静态类型检查
- SQLite 数据格式保持兼容

不要只输出迁移建议。
先执行 MIG-PY-01，然后按迁移计划自动持续执行。

只有涉及破坏性数据迁移、放宽安全边界、改变核心产品语义或新增付费凭据时才暂停询问用户。

现在开始 Python Core Migration。
```
