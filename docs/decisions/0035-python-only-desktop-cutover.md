# ADR 0035 · Python-only Desktop business Host cutover

Date: 2026-09-24  
Status: Accepted under the user's Python Core architecture approval

## Decision

Electron Main now starts exactly one owned, writable Python Forge Host. All fixed Renderer channels for system, project, conversation, draft, approval, board and run commands terminate at `PythonHostController`. It checks the existing strict TypeScript envelopes and validates the resulting public contract before returning data to Preload. The project folder picker remains a Main-only OS operation; its path authorization is checked again by the Python Project service. The Renderer has no arbitrary JSON-RPC, Node, SQLite, shell or Codex handle.

The Host uses `forge-local-jsonrpc/v1` over bounded stdio and `forge-host-protocol/v5`. Product and Host versions, protocol, runtime PID and randomly generated Host ID are checked at startup and on health probes. Main owns only the child it spawned, requests `system.shutdown`, waits a bounded interval, then terminates that same child if necessary. Python Host owns Codex, workspace, processes, database, Task and Run orchestration. `apps/host` and TypeScript Core remain historical parity references and test fixtures; Desktop no longer imports or launches them, and there is no runtime fallback to Node.

Python is the sole SQLite writer. Host startup applies additive migration v16 after checking the immutable v1–15 history. No Project, Task, Run or snapshot table is reset or deleted. The existing development database was absent at cutover; real user-data upgrade remains untested. Services now use `ForgePersistence.session()` and `transaction()` facades instead of obtaining the private `sqlite3.Connection`. SQLite statements remain confined to the Python Host and its persistence-facing services; future repository specialization can narrow this API further without changing Desktop.

`pnpm dev:host` now starts Python. `pnpm dev:node-host-parity` and older Node test commands are explicitly diagnostic; they are not a production entry or fallback. CI runs frozen pnpm and uv checks. Normal Desktop and Web do not call a remote API. Remote HTTP/SSE/WebSocket remains a future independent adapter.

## Verification and limits

On macOS arm64, real Electron startup showed one Python PID, CPython 3.12.13 and SQLite schema 16. The existing fixed Renderer bridge completed project trust, manual P1 approval into TODO, restart persistence and a real Codex development Run through an isolated Git worktree to an immutable Handoff; source Git stayed clean, and formal acceptance remained `unverified`. Corrupt SQLite produced degraded health, killing the Python child produced `crashed`, and Desktop exit reaped its owned PID. The full command-level evidence and remaining checks are in `docs/implementation-status.md`.

The project-local `.venv` interpreter path is a development entry. Packaged Python/Codex discovery, installer, signature, Windows x64, macOS Intel, DPI and unexpected Host death while Codex is running remain **UNVERIFIED**. There is no cross-platform claim or Node business fallback. These deferred checks do not turn unexecuted canonical Test IDs into PASSED.
