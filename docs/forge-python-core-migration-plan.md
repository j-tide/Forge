# Forge Python Core Architecture Migration Plan v1.0

> **User-approved architecture override**
>
> Forge 的 UI / Desktop 使用 Vue 3 + TypeScript + Electron。
>
> Forge 的 **Agent 核心运行时**必须以 Python 为主，包括：
>
> - Task / Workflow Runtime
> - Agent orchestration
> - Agent Profile runtime
> - Executor orchestration
> - Tool / MCP orchestration
> - Context Builder
> - RAG
> - Memory
> - Eval
> - Strategy improvement
> - Run / Attempt lifecycle
> - Approval / Review / Verify orchestration
>
> Node/TypeScript 不再作为 Forge 业务 Host 的最终实现。
>
> ProofRun 继续保持独立项目。

---

# 1. Why This Migration Exists

当前实现从 P0-03 起把 Forge Host 建成了 Node/TypeScript Runtime，并且 P1/P2 的 Task、Run、Context、Codex Adapter、Workspace/Process 等继续在 TypeScript Host 中实现。

这与当前确认的最终架构不一致。

当前阶段必须暂停 P2-10，先完成 Python Core 迁移，再继续 P2-10 / P3。

本迁移不是产品功能 Phase，也不改变权威 P1-P9 产品 Task ID。

使用单独迁移任务：

- MIG-PY-01
- MIG-PY-02
- MIG-PY-03
- MIG-PY-04
- MIG-PY-05
- MIG-PY-06
- MIG-PY-07
- MIG-PY-08
- MIG-PY-09

迁移完成后，回到原权威任务 P2-10。

---

# 2. Final Target Architecture

```text
┌────────────────────────────────────────────┐
│ Forge Desktop                              │
│ Electron + Vue 3 + TypeScript              │
│                                            │
│ apps/desktop                               │
│ apps/web                                   │
│ packages/ui                                │
└──────────────────────┬─────────────────────┘
                       │
               ForgeClient / IPC Bridge
                       │
                       ▼
┌────────────────────────────────────────────┐
│ Electron Main                              │
│                                            │
│ Window / OS integration / Host lifecycle   │
│ NO business workflow                       │
│ NO agent orchestration                     │
└──────────────────────┬─────────────────────┘
                       │
                JSON-RPC over stdio
                       │
                       ▼
┌────────────────────────────────────────────┐
│ Forge Python Host                          │
│ Python 3.12+                               │
│ asyncio + Pydantic                         │
│                                            │
│ Project / Task / Approval                  │
│ Workflow / Run / Attempt                   │
│ Agent Runtime                              │
│ Plugin Host                                │
│ Executor orchestration                     │
│ Workspace / Process ownership              │
│ Persistence                                │
│ Context / RAG / Memory / Eval              │
└──────────────────────┬─────────────────────┘
                       │
        ┌──────────────┼─────────────────┐
        ▼              ▼                 ▼
 Codex app-server   Model APIs        Python Plugins
 Claude SDK         MCP servers       RAG / Memory
 Other executors    Git / tools       Eval
```

## 2.1 TypeScript responsibilities

TypeScript remains responsible for:

- Electron Main
- Preload
- Vue UI
- `@forge/ui`
- ForgeClient
- Desktop local transport bridge
- shared browser/mobile UI
- UI-side contract types
- visualization

TypeScript must **not** be the final owner of:

- Workflow state machine
- Agent orchestration
- Run scheduler
- Task lifecycle
- RAG
- Memory
- Eval
- Plugin runtime
- Executor orchestration

## 2.2 Python responsibilities

Python owns:

- Forge business Host
- canonical Task / Project / Run services
- workflow execution
- multi-agent orchestration
- executor plugin runtime
- verifier runtime
- context providers
- MCP/tool registry
- project knowledge
- RAG
- memory
- eval
- controlled strategy evolution

---

# 3. Local Transport

Do **not** introduce FastAPI just for local Desktop communication.

Local Desktop:

```text
Electron Main
    ↓ spawn
forge-host executable
    ↓
stdin/stdout
    ↓
versioned JSON-RPC
```

Requirements:

- request ID
- method allowlist
- Pydantic validation
- protocol version
- structured error
- cancellation
- event stream
- heartbeat
- graceful shutdown
- max message size
- unknown message rejection

No local TCP port is required.

Future Remote Host may add a separate HTTP/SSE/WebSocket adapter around the same Python Core, without changing Core services.

---

# 4. Python Repository Layout

Target:

```text
forge/
├── apps/
│   ├── desktop/
│   └── web/
├── packages/
│   ├── ui/
│   ├── client/
│   └── contracts/
├── python/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── src/
│   │   └── forge/
│   │       ├── host/
│   │       ├── protocol/
│   │       ├── contracts/
│   │       ├── persistence/
│   │       ├── projects/
│   │       ├── tasks/
│   │       ├── approvals/
│   │       ├── workflows/
│   │       ├── runs/
│   │       ├── agents/
│   │       ├── executors/
│   │       ├── tools/
│   │       ├── plugins/
│   │       ├── workspace/
│   │       ├── processes/
│   │       ├── context/
│   │       ├── knowledge/
│   │       ├── memory/
│   │       └── evals/
│   └── tests/
└── docs/
```

Do not create empty folders only for appearance.

---

# 5. Python Toolchain

Default baseline unless compatibility testing rejects it:

- Python 3.12+
- `uv`
- Pydantic v2
- asyncio
- pytest
- pytest-asyncio
- Ruff
- one static type checker
- SQLite

The existing SQLite database format and user data must be preserved.

Do not replace the database just to change language.

---

# 6. Contract Strategy

Wire contracts must become language-neutral.

Canonical wire protocol:

- JSON Schema / OpenAPI-compatible schema
- explicit protocol versions
- golden request/response fixtures

TypeScript validates the same wire contract.
Python Pydantic models validate the same wire contract.

Add parity tests:

```text
fixture JSON
→ TS validator PASS
→ Python validator PASS
→ serialize
→ semantic equality
```

---

# 7. Plugin Architecture

Python is the primary runtime plugin host.

Plugin categories:

- ExecutorPlugin
- ModelProviderPlugin
- VerifierPlugin
- ContextProviderPlugin
- ToolPlugin
- MemoryPlugin
- EvalPlugin

Core owns task state, approval, run state, permission policy, workflow transition and artifact references.

Plugins must not directly change those states.

---

# 8. Executor Architecture

Codex remains an executor, but its adapter moves to Python.

```text
Forge Python Host
    ↓
ExecutorRegistry
    ↓
CodexExecutor
    ↓
spawn @openai/codex app-server
    ↓
JSON-RPC stdio
```

Reuse behavioral knowledge from the TS spike, but re-test all capabilities from Python.

---

# 9. Persistence Migration

Keep current SQLite DB and schema history.

Migration approach:

1. Python opens the existing DB produced by current Forge.
2. Python reads current `schema_migrations`.
3. Python reproduces current health/version checks.
4. Python reads existing Project / Conversation / Task / Run data.
5. Python can write a new migration.
6. Old TS Host is retired from production path after parity.

Do not reset the DB.

---

# 10. Workspace / Process Migration

Python Host eventually owns:

- worktree lifecycle
- workspace lease
- process ownership
- cancellation
- subprocess tree
- executor processes
- verifier commands

Preserve all safety behavior already validated by the TS implementation.

---

# 11. Migration Tasks

## MIG-PY-01 — Architecture Freeze & Migration Baseline

**Status:** DONE

- pause P2-10
- write Python Core ADR
- update AGENTS
- update Playbook top-level architecture
- update Autopilot state
- inventory current TS Host modules as KEEP / PORT / RETIRE / TEMP BRIDGE
- run full baseline

**Acceptance**
- no P3 task starts
- no user data loss
- baseline remains green

---

## MIG-PY-02 — Python Project Bootstrap

**Depends on:** MIG-PY-01

**Status:** DONE

Create:

- `python/pyproject.toml`
- `python/uv.lock`
- package structure
- Ruff
- pytest / pytest-asyncio
- static type checker
- root pnpm wrapper scripts

Expected commands:

```text
pnpm py:sync
pnpm py:lint
pnpm py:typecheck
pnpm py:test
pnpm py:check
```

**Acceptance**
- clean `uv sync --frozen`
- Python tests pass
- no global Python package requirement
- dependencies locked

---

## MIG-PY-03 — Python Host & Cross-language Protocol

**Depends on:** MIG-PY-02

**Status:** DONE

Implement:

- Python host CLI
- stdin/stdout JSON-RPC framing
- `system.ping`
- `system.info`
- `system.health`
- handshake
- graceful shutdown
- heartbeat
- max frame size
- structured errors
- Electron Main PythonHostController

**Acceptance**
Desktop talks to real Python Host and shows real health.

---

## MIG-PY-04 — Persistence Parity

**Depends on:** MIG-PY-03

**Status:** DONE (storage-level parity; domain behavior remains MIG-PY-05/06)

Python must open the current production SQLite schema and support read/write parity for current entities.

**Acceptance**
- current DB opens
- existing Project/Task/Run data readable
- hashes/revisions preserved
- Python can perform a safe new migration
- no reset

---

## MIG-PY-05 — Project / Task / Approval Core Port

**Depends on:** MIG-PY-04

**Status:** DONE (Python Host service parity on isolated databases; Desktop cutover remains MIG-PY-09)

Port:

- ProjectService
- EnvironmentService
- ConversationService
- DraftService
- ApprovalService
- TaskService
- Board read model

**Acceptance**
Re-run P1 full offline/online scenarios against Python Host.

---

## MIG-PY-06 — Workspace / Process / Run Scheduler Port

**Depends on:** MIG-PY-05

**Status:** DONE — Python infrastructure fixture acceptance on macOS arm64. Real Codex-dependent P2 checks remain `DEFERRED_VERIFICATION` to MIG-PY-07; Python-only Desktop product revalidation remains MIG-PY-09. See ADR 0032. This does not mark any unrun canonical Test ID PASSED.

Port:

- WorkspaceManager
- lease/epoch
- ProcessController
- RunConfig
- RunScheduler
- Attempt
- cancellation
- ContextBundle/checkpoints
- CodeSnapshot/Handoff

**Acceptance**
P2-01～P2-09 behavior passes against Python Host.

---

## MIG-PY-07 — Python Codex Executor

**Depends on:** MIG-PY-06

**Status:** DONE on macOS arm64 — version-matched Python Codex app-server adapter and isolated real Host/fixture execution passed. Canonical dual-adapter/Profile-save/in-flight-auth cases remain `DEFERRED_VERIFICATION` to their existing owners; Python-only Desktop cutover remains MIG-PY-09. See ADR 0033.

Implement Python Codex app-server adapter and re-test:

- auth
- model list
- streaming
- structured output
- commands/files
- approval
- cancellation
- continuation
- usage
- workspace behavior

**Acceptance**
Real fixture task modifies isolated worktree and tests pass.

---

## MIG-PY-08 — Python Plugin Runtime Foundation

**Depends on:** MIG-PY-07

**Status:** DONE on macOS arm64 — the built-in manifest, service registry, permission/API/platform gates, staged activation, Executor resolution, capability probe and disposal are implemented and tested. Full third-party Plugin Host remains P4. See ADR 0034.

Implement minimum:

- plugin manifest
- service registry
- dependency declaration
- activation
- dispose
- capability probe

Register Codex as the first built-in Python Executor plugin.

**Acceptance**
Core resolves executor through Plugin API with no direct Codex dependency.

---

## MIG-PY-09 — Node Host Retirement & P2 Revalidation

**Depends on:** MIG-PY-08

**Status:** DONE on the current macOS arm64 development runtime. Electron now starts only a writable Python Host; P1 offline Desktop and P2-01～09 core capabilities were revalidated using isolated storage, real Codex and the Renderer bridge. Packaged Python/Codex, Windows x64, macOS Intel and upgrade of an existing user database remain UNVERIFIED; no canonical cross-phase Test ID is claimed PASSED. See ADR 0035 and implementation status.

- Desktop defaults to Python Host only
- remove Node business Host from production start path
- retire Node business runtime paths
- keep TS UI/client/contracts adapter
- update docs

Revalidate:
- P1 closure
- P2-01～P2-09
- DB migration
- Desktop smoke
- Host crash
- Codex live
- workspace cancel
- snapshot/handoff

**Acceptance**
No business Agent/Workflow runtime executes in Node.

Then restore P2-10 to TODO and continue the canonical roadmap.

---

# 12. Reuse vs Replace

## Reuse

- Electron shell
- Vue UI
- `@forge/ui`
- visual design
- TS ForgeClient
- Desktop security boundary
- language-neutral contracts
- SQLite user data
- migration semantics
- acceptance fixtures
- UX screenshots
- Codex capability knowledge
- Git safety behavior
- language-independent ADRs

## Port / Replace

Final production path must not keep:

- Node `apps/host` as business runtime
- TS Task/Workflow/Run orchestration
- TS Agent runtime
- TS executor orchestration
- TS RAG/Memory/Eval runtime

During migration they may remain only as parity references.

---

# 13. Autopilot Override

While migration is active:

1. MIG-PY tasks take priority over P2-10.
2. Do not start P3.
3. All existing safety rules remain.
4. After MIG-PY-09:
   - restore P2-10 to TODO
   - resume the canonical roadmap

Hard Stop only for destructive data migration, weakened security, changed product semantics, irreversible platform decisions, or new paid credentials.
