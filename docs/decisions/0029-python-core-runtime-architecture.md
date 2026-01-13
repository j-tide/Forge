# ADR 0029 · Python Core Runtime Architecture

Date: 2026-09-24  
Status: Accepted by explicit user architecture decision; macOS arm64 development cutover completed in ADR 0035

## Decision and authority

Forge keeps Electron, Vue 3, TypeScript, Vite, pnpm workspace and `@forge/ui` for Desktop, Web and client surfaces. The independent **Python Forge Host** becomes the sole production business runtime for Project, Task, Approval, Workflow, Run/Attempt, Agent, Executor orchestration, plugins, Context, RAG, Memory and Eval. Python baseline is 3.12+, uv, Pydantic v2, asyncio, pytest/pytest-asyncio, Ruff, one static type checker and SQLite.

This user-approved architecture change supersedes only the Node/TypeScript Host language and `utilityProcess` transport choice in the read-only `forge_spec_v1.0` blueprint and historical ADRs 0002–0028. It does not change authoritative Task IDs, Test IDs, contracts, product states, security policy or acceptance criteria. The reference package remains unedited; the discrepancy is explicit here.

Electron Main owns window and system integration plus the Python Host process lifecycle. It does not own business state, SQL, workflow or Agent scheduling. Preload exposes fixed, narrow operations; Vue/TypeScript retains the shared UI, ForgeClient and client-side wire validation. Renderer never gets Node, Shell, database, process control or executor SDK access. Python Core has no Vue/Electron dependency and is independently startable and testable.

## Local and future transport

The local Desktop link is **versioned JSON-RPC over a dedicated Host stdin/stdout pipe**. Every request has an ID and protocol version; methods are allowlisted and arguments/results validated by Pydantic against language-neutral wire contracts. The framing has a bounded message size; invalid/unknown messages receive structured errors. The Host supports heartbeat, events, cancellation and graceful shutdown. Main validates the originating WebContents/frame, enforces timeouts, tracks only the Host it spawned and cleans up only that owned process. Host stdout is protocol-only; diagnostics go to structured stderr without secrets.

Local transport does not open FastAPI, HTTP, WebSocket or a TCP listener. A future RemoteTransport may add an independent HTTP/SSE/WebSocket adapter around the same Python services, with its own authentication and scope policy. Remote networking is outside this migration.

## State, plugins and compatibility

Python Host owns the existing SQLite database and preserves schema history, migration checksums, hashes, revisions, immutable approvals, Run/Attempt records, workspace leases and user data. No reset, destructive migration or best-effort JSON conversion is permitted. Contract parity uses golden JSON fixtures validated by both TypeScript and Python, including errors and unknown-field rejection. The Python plugin registry supplies public services and capabilities; plugins cannot write Task or Approval state directly. Codex remains the first executor, through its app-server subprocess, with capabilities revalidated from Python.

The existing Node `apps/host`, TypeScript `packages/core`, persistence, workspace/process and Codex adapter remain **temporary parity references** while MIG-PY-01～08 are implemented. No new Node Agent/Core business capability is to be added. MIG-PY-09 removes Node business runtime from all production launch paths; it is not kept as a fallback. The old implementation and its historical test results are not evidence that Python parity passed. P1 and P2-01～P2-09 must be revalidated through the Python Host before P2-10 resumes.

## Rollout and limits

`docs/forge-python-core-migration-plan.md` defines MIG-PY-01～09 as a priority track separate from the immutable P1–P9 product task graph. P2-10 is `PAUSED_FOR_PYTHON_CORE_MIGRATION`, not DONE or BLOCKED; P3 cannot start. Once MIG-PY-09 verifies Python-only production behavior and existing data, P2-10 returns to TODO for a fresh vertical acceptance run.

Historical macOS arm64 Node/Electron evidence is preserved as baseline. Python runtime availability, uv lock, Node↔Python protocol parity, existing-database migration, packaged Host path, Windows x64, macOS Intel, signing and crash recovery are **unverified** until their MIG tasks run. ProofRun remains independent.
