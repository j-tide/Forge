# ADR 0025: Read-only Run inspection and bounded Diff preview

Status: Accepted for P2-07 · 2026-09-24

## Decision

- The independent Host remains the owner of Run state. A fixed `run.list` / `run.inspect` read-only protocol passes through ForgeClient, Preload and Main. The Renderer receives validated project-scoped data, never SQLite, filesystem paths, provider payloads or a generic IPC channel. No Start/cancel command is introduced by this read model.
- SQLite schema v13 stores append-only sanitized executor observations with a source sequence range and a monotonic database cursor. `assistant.message` deltas are coalesced within 100 ms. The first 2,000 observations are retained, followed by an explicit truncation marker and terminal event; pages are capped at 100. Out-of-order/replayed source ranges are rejected. Provider usage has a separate normalized snapshot; missing cost remains `null`.
- The Host captures a bounded, read-only text Diff preview from the owned Git worktree after provider completion. It records at most 200 paths and 64 KiB text, skips `.env`/key material and symlinks, bounds untracked file reads, disables Git external diff/textconv, and redacts recognized credentials. An inspection failure is a truncated/unavailable preview, never a frozen CodeSnapshot. P2-09 owns canonical artifact/secret scanning and final handoff snapshots.
- Vue Run Inspector is a tabbed section of the real Task detail drawer. It pages by Host cursor and polls active Run state; when Host is unavailable it clears stale details. All message/Diff content uses text interpolation and never executes HTML or javascript URLs. Context shows source references and authority, not private provider state.

## Limits and verification

P2-07 does not add a public Run Start command, command stdout capture, frozen artifacts, cancel/timeout controls or remote transport. A generic secret scanner is impossible from regex alone: known token, cookie, authorization and assignment patterns are redacted, command arguments are omitted, and `.env`/key files are excluded; P2-09 must enforce a stronger artifact secret gate. T064's report-artifact attack remains `DEFERRED_VERIFICATION` to P2-09; its current Activity/Diff text-rendering subset is tested. T061/T062/T063/T065 have local fixture coverage and real Codex/Electron evidence recorded in implementation status. Windows x64, macOS Intel and packaged app remain unverified.
