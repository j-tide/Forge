# Python Core migration inventory · MIG-PY-01

2026-09-24. This is an inventory of the actual TypeScript production path before migration. `KEEP` means the module remains in the final UI/client tree; `PORT` means Python must reproduce its behavior and storage format; `TEMP BRIDGE` means it is used only while Python parity is incomplete; `RETIRE` means it must be removed from production entrypoints by MIG-PY-09. Historical source/tests may remain as reference, but cannot be runtime fallback.

MIG-PY-09 cutover update: `apps/desktop/src/main/index.ts` now constructs only `PythonHostController`; the Node `HostController`, `apps/host` executable and TypeScript Core/Persistence/Executor code are no longer in Desktop's runtime dependency path. `pnpm dev:node-host-parity` and their tests remain explicit historical diagnostics. Python Host is the sole writable business runtime and SQLite owner on the verified macOS arm64 development path (ADR 0035).

| Current module | Class | Migration owner / boundary |
| --- | --- | --- |
| `apps/desktop/src/main/window-options.ts`, `ipc-auth.ts`; `apps/desktop/src/preload/index.cts`; `apps/web/src/`, `packages/ui/` | KEEP | Keep Electron shell, sender checks, narrow bridge and shared Vue UI. Add only fixed Python Host wire methods; never expose raw stdio or SQL. |
| `packages/client/src/index.ts` | KEEP | Preserve ForgeClient surface. LocalTransport delegates to Main's Python JSON-RPC adapter; Web without Desktop still shows unavailable. |
| `packages/contracts/src/` | KEEP | Preserve UI/client types and strict validation. Align language-neutral JSON wire schema and Python Pydantic parity in MIG-PY-03/04; no runtime import from reference package. |
| `apps/desktop/src/main/index.ts`, `host-controller.ts`, `host-environment.ts`; `scripts/dev-desktop.mjs` | TEMP BRIDGE | Currently launches Node utilityProcess Host. MIG-PY-03 introduces owned Python stdio controller; MIG-PY-09 removes Node production launch/fallback. Keep OS folder picker and lifecycle safeguards. |
| `apps/host/src/channel.ts`, `config.ts`, `runtime.ts`, `log.ts`, `index.ts` | PORT | Python CLI, framed/versioned protocol, allowlist, health, structured errors/logs and graceful shutdown in MIG-PY-03. Then RETIRE Node production entry. |
| `apps/host/src/projects.ts`, `conversations.ts`, `drafts.ts`, `refiner-model.ts` | PORT | Python P1 services and deterministic/read-only boundaries in MIG-PY-05. |
| `apps/host/src/executors.ts`, `run-resources.ts`, `run-scheduler.ts`, `run-observation.ts`, `snapshots.ts`, `development.ts` | PORT | Python Executor registry, Run/Attempt, event gate, cancellation, Diff and Handoff in MIG-PY-06～08. P2-10's paused Node-only work is not accepted as Python evidence. |
| `packages/core/src/approvals.ts`, `task-revisions.ts`, `task-projection.ts`, `task-queries.ts`, `intent-commands.ts`, `commands.ts` | PORT | Python Task/Approval/Board semantics in MIG-PY-05. Do not keep TS business decisions in production. |
| `packages/core/src/run.ts`, `run-config.ts`, `context.ts`, `handoff.ts` | PORT | Python RunConfig/content hashes, context budget/checkpoints and handoff semantics in MIG-PY-06. |
| `packages/persistence/src/index.ts`, `migrations.ts`, `errors.ts`, `path.ts`, `*-data.ts` | PORT | Python SQLite owner in MIG-PY-04 onward. Keep existing `forge.sqlite`, schema_migrations and migrations v1–v15 byte-compatible; do not create a second production DB. |
| `packages/workspace/src/index.ts`, `snapshot.ts`; `packages/process/src/index.ts` | PORT | Python owned worktrees, safety checks, process groups/leases and snapshot builder in MIG-PY-06; Windows remains unverified until real tests. |
| `plugins/executor-codex/src/index.ts`, `app-server.ts`; `packages/plugin-api/src/index.ts`; `plugins/refiner/src/` | PORT | Python Codex/refiner adapter and public plugin API in MIG-PY-07/08. Keep capability evidence as historical baseline only. |
| Node `apps/host` executable and Node-only business package imports from Desktop launch/production build | RETIRE | Remove from all production entrypoints in MIG-PY-09 after Python parity passes. No hidden fallback. |

## Data and rollout guardrails

- Production SQLite schema currently reaches version 15 in Node tests; actual user DB version must be read, never assumed. MIG-PY-04 first opens a copied, independent test DB and checks migration checksums before any write to real user data.
- TypeScript `@forge/ui`, Vue, ForgeClient and Desktop security checks remain; Python receives only validated business commands and owns DB/Git/executor state.
- Existing `forge-host-protocol/v5` Node message shapes are historical parity inputs. The Python stdio wire receives an explicit independent protocol version; no silent compatibility claim or Node binary fallback.
- The paused P2-10 worktree modifications, tests and screenshots remain intact for comparison. They are not a completed P2-10 result and must be rerun on Python Host after MIG-PY-09.
