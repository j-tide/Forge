# ADR 0026 · Run cancellation and lease quarantine

Date: 2026-09-24<br>
Status: Accepted for the P2-08 Host-internal scheduler

## Context

P2-05 persisted Run/Attempt and held a single writer lease; P2-07 exposed read-only observations. Neither connected a cancellation request to the durable Run state. A provider interrupt acknowledgement alone cannot prove that a long-running tool command and its descendants have stopped. Releasing a worktree while a writer may still be active would allow concurrent writes and false `cancelled` results.

## Decision

- The Host-only `HostRunScheduler` accepts `user`, `timeout`, and `shutdown` cancellation. The request is stored once in SQLite schema 14 (`run_cancel_intents`) and moves the Run to `canceling` before sending a provider interrupt. The active project/Run gate prevents another writer. Duplicate requests share the same terminal wait.
- The Codex adapter receives its normal `turn/interrupt` first. After a finite four-second grace, the Host calls the existing `ProcessController` for the owned POSIX process group. Only a confirmed stop allows a `cancelled` Attempt and lease release. The workspace remains available for inspection; no source-repo writes or automatic next node follow.
- If the process tree cannot be confirmed stopped, the Run becomes `interrupted`, the database writer lease remains `quarantined`, and `WorkspaceManager` marks the worktree failed. The next Run cannot claim the project writer slot. No unknown exit is recorded as success. Runtime expiry follows the same path. Host shutdown stops accepting new Runs and requests cancellation of all active Runs.
- A cancellation during a known no-side-effect 429 retry can complete without a provider session. Unknown launch side effects remain quarantined. Historical `running`/`canceling` rows after Host loss are not interpreted as live processes; P3-09 owns durable crash reconciliation.
- No Renderer Start/Cancel command is added in P2-08. The scheduler remains an internal Host infrastructure path pending P2-10's authorized vertical entry and configuration resolution. Main continues to own only the Host process.

## Evidence and limits

macOS arm64 tests use a real parent/child/grandchild Node process group writing to an isolated Git worktree. Cancellation stops all descendants, prevents later writes, leaves the source repo untouched, and releases the lease only after confirmation. A real authenticated Codex app-server Run started the same nested command in a disposable worktree; provider cancellation yielded `run.cancelled`, no active owned process and no later writes. Failure injection proves unconfirmed ownership produces `interrupted` plus quarantine. SQLite restart preserves the cancel intent and terminal state. A one-second deadline test verifies finite timeout cancellation.

Windows process-tree support, macOS Intel, Host-crash reconciliation, installer packaging, and transient mid-run authentication loss remain unverified. T034 belongs to P3-09; T043 native resume and T045 auth-loss diagnostics retain deferred owners in `docs/deferred-verification.json`. T035's current cancel/tree/quarantine semantics have real Host and Codex evidence. No new external dependency is introduced.
