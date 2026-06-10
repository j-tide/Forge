# ADR 0032 · Python Workspace, Process, Run and Handoff Port

Status: ACCEPTED for MIG-PY-06 on 2026-09-24 (within user-approved Python Core migration).

## Decision

The Python Host owns Git worktrees, the process controller, immutable RunConfig and ContextBundle records, Run/Attempt state, bounded observations, cancellation, CodeSnapshot and Handoff. Electron Main continues to own only the Python Host process. Vue and Main cannot call Git, SQL or an executor directly. The one-node development entry is internal to Python Host and remains provider-neutral; it becomes available through fixed `run.start`/`run.cancel` RPC only after a real Executor is registered.

`WorkspaceManager` creates a uniquely identified task worktree from a verified source Git root and commit. A durable JSON ownership record contains runtime, source Git common-dir, run, workspace, lease and epoch identity. Releasing a lease requires a stopped run; disposing a worktree requires verified ownership and a clean tree. Historical records are reported as orphans and never automatically killed, pruned or deleted. Changed worktrees are retained. Git is invoked with argv, with hooks disabled for Forge Git plumbing.

`ProcessController` launches argv commands in a new POSIX session on the tested macOS arm64 runtime. Cancellation first requests provider shutdown, then uses the in-memory child handle and owned process-group ID with finite TERM/KILL bounds. Historical PIDs are evidence only; restart does not grant kill authority over them. Runs with uncertain launch or process exit become `interrupted` and their lease/worktree is quarantined. A second writer cannot proceed while that state remains unresolved. Windows behavior is explicitly unverified, not represented by a success stub.

Only an explicit 429 response with `sideEffect=none` may be retried, with finite backoff and a deadline. Exhaustion leaves an unlaunched Run `waiting_input`; uncertain side effects are never retried. Executor events pass a strict sequence/type gate. Observations have project scope, redaction, a 2,000-row bound, cursor reads and a real but bounded Git diff preview. WorkingCheckpoint records retain only provenance-tagged observations and budgets. The immutable CodeSnapshot uses a separate Git tree/commit/ref; the Handoff records an actual artifact and keeps every Task acceptance criterion `unverified` because Review and Verify have not run.

## Evidence and staged acceptance

Isolated macOS arm64 tests use real Unicode/space Git worktrees, SQLite, parent/child/grandchild processes, a disposable executable fixture, source cleanliness, Run A/B/user-process separation, port release, cancellation, restart persistence, snapshot reconstruction and Handoff hash verification. A real Python Host stdio subprocess reads the persisted Run inspection and rejects an unregistered production start. `pnpm py:check` passes 29 pytest cases, Ruff and strict mypy over 22 source files. Frozen install, contract/task map checks, TS lint/typecheck/test/build, DB parity, Desktop smoke and diff check pass in the same migration turn.

MIG-PY-06's infrastructure acceptance is complete. Real Codex execution is owned by MIG-PY-07, plugin resolution by MIG-PY-08, and the Python-only Desktop P2-01～P2-09 rerun by MIG-PY-09. These later checks remain **DEFERRED_VERIFICATION**, not PASSED. The historical Node P2 checks remain parity reference only. No P2-10 or P3 acceptance is claimed.

Canonical Test IDs remain intact: P2-03/04 `T041–T045` need the MIG-PY-07 live adapter; `T031–T035`, `T046–T050`, `T061–T065` and `T071–T075` have infrastructure fixture evidence here but require MIG-PY-09's Python-only Desktop and Codex rerun for product acceptance. Existing later-phase deferrals in `docs/deferred-verification.json` are unchanged.

## Known limits

- Python P1/P2 services still call the private SQLite helper in `ForgePersistence`; MIG-PY-09 must enforce the typed repository boundary before production cutover.
- The Python Host has no registered production Executor yet. `run.start` returns `MODEL_UNAVAILABLE` after strict payload validation; no hidden Node fallback is used for Python RPC.
- The Desktop still routes P1/P2 business commands through the temporary Node Host until MIG-PY-09. The current Electron smoke validates the dual-Host migration state, not Python-only product behavior.
- macOS Intel, Windows x64, installed package, code signing, DPI and crash recovery of an abandoned provider process remain unverified.
- Git ref creation and SQLite Handoff commit are separate durability operations; an interrupted publish can leave a Forge-owned ref for later reconciliation. It must not be deleted from name pattern alone.
