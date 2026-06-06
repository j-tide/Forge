# ADR 0023: Durable one-node Run and Attempt scheduling

Status: Accepted for P2-05 · 2026-09-24

## Decision

- Keep scheduling in the independent Host. `HostRunScheduler` is an internal infrastructure entry, not a Renderer command. A production Start action remains unavailable until the Host can resolve and validate actual workflow, profile and plugin versions; the live fixture's version hashes are test inputs, not production authorization.
- Persist a queued Run, pending Attempt, active workspace lease and launch intent in one SQLite transaction before contacting Codex. Mark running only after a provider session reference exists. One active write Run per project and one writer per workspace are enforced by database indexes and the existing workspace lease.
- Bind every result to the exact Run, Attempt, lease ID and epoch, Task revision and frozen config hash. A duplicate terminal result is idempotent; a stale result is audited and cannot advance the current Run. Terminal success requires the owned process tree to be stopped.
- Unknown launch effects or unconfirmed processes become `interrupted` with a quarantined lease; no automatic replay follows. Retry only an explicitly identified HTTP 429 with explicit no-side-effect evidence, within a bounded time and retry budget. Exhaustion leaves `waiting_input`, not success.
- Store system Run/Attempt events as evidence. This does not create a Workflow Engine, Task state transition to Done, human approval bypass, or a public Start command.

## Evidence and limits

Real SQLite tests cover durable intent and restart, single writer, replay, stale epoch, uncertain launch and blocked 429. A fixture adapter drives the bounded 429 scheduler path; it is deterministic failure injection, not a real upstream 429 claim. `pnpm test:p2-run-live` used the existing authenticated Codex app-server in an owned disposable Git worktree: the Run and Attempt succeeded, source Git remained unchanged, fixture tests passed and a reopened DB retained the result. The approved Task remained TODO.

The current one-node scheduler does not resolve production workflow/profile/plugin content, authorize a user Start action, persist full provider stream as a workflow event log, or recover an uncertain in-flight Run after Host crash. P2-06 adds bounded context, P2-08 owns cancellation, P3-09 owns crash reconciliation, and P4/P5 own production version resolution. Windows x64, macOS Intel, packaging and signed installation remain unverified.
