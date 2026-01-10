# ADR 0022: Scheduled Codex write adapter on owned worktree

Status: Accepted for P2-04 · 2026-09-24

## Decision

- Keep Codex app-server stdio as the primary integration selected in ADR 0004. The locked `@openai/codex@0.155.1` adapter remains under independent Forge Host ownership; no Codex type enters Core, Renderer or public Executor events.
- Add `HostRunResources.startScheduled` to bind the strict Attempt request to the active worktree's exact lease ID and epoch before calling the adapter. The existing P0 spike path remains available only for developer/refiner uses. This is an infrastructure launch boundary, not a production Task Start command or Scheduler.
- The disposable live acceptance creates a Git fixture with a Forge task branch under a private worktree root, checks current authenticated/model capabilities, selects a model from the actual reported catalog, then asks Codex to implement input validation and tests. Host's event gate receives standard run, text, command, usage, file and completion events. The test verifies actual source diff and `npm test`, provider session reference, unchanged source HEAD/status and parent canary. The temporary fixture is removed after verification.

## Evidence and limits

`pnpm probe:codex` on macOS arm64 reported app-server `codex-cli 0.155.1`, existing ChatGPT session, model selection and workspace-write capability. The first live attempt completed code and tests but the acceptance script used `trim()` on Git porcelain output, stripping the leading status space and producing a false filename mismatch; changing to `trimEnd()` fixed the test. The second live run passed with `gpt-6-luna`, 312 contiguous standard events, two changed fixture files, passing tests and no source/parent change. These are real provider events, not mocked logs.

The worktree is isolation from the user's working directory, not a security sandbox. The capability probe reports `networkPolicyEnforced=false`, so the prompt's “do not use network” line is advisory and must not be represented as enforcement. No new account, API key, dependency or broad Renderer capability was added. P2-05 must bind RunConfig, Task and Attempt business state transactionally; P2-08 must confirm full production cancellation. T041 dual-provider acceptance awaits P4-10; Profile/model and authentication Run behaviour await the mapped later tasks. Windows x64, macOS Intel, packaging and Codex utilityProcess recovery remain unverified.
