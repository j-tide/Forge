# ADR 0028 · P2 vertical development entry

Date: 2026-09-24<br>
Status: Accepted for the P2-10 single executor path

## Decision

- An approved Task remains TODO until a user explicitly selects an available Codex model and starts a Run. Project Trust is required and rechecked by Host, but it is not blanket approval for future operations. The current development node grants the existing `workspace-write` profile inside a Forge-owned Git worktree and does not auto-approve interactive escalations.
- The independent Host resolves one built-in `standard`/`develop` node, profile and registered Codex adapter. It freezes the approved Task revision, environment revision, workflow/profile/plugin identities and content hashes, model choice, budget and bounded ContextBundle before launch. This is a limited P2 entry, not a general workflow engine or plugin loader.
- `run.start`, `run.capabilities`, `run.cancel` and `run.handoff` are fixed, schema-validated protocol v5 commands. Renderer uses ForgeClient through Preload and Main. Main checks the sender and relays to Host; it does not implement Task state or execute Git/Codex itself. Start uses the caller's UUID as a durable Run idempotency key and acknowledges only after the queued intent is committed.
- Host owns workspace, process tree, scheduler, cancellation and CodeSnapshot publication. The board is a read projection of latest real Run state: queued/running/succeeded/interrupted display in Development, while failed/cancelled return to TODO with a visible reason. The approved Task row remains unchanged because its current storage constraint predates the later Review/Verify state machine. A succeeded development Run is **not** Done and does not imply Review, Verify, merge or deployment.
- A Run is deliverable only after the immutable CodeSnapshot and Handoff exist. A succeeded Run with pending snapshot publication stays pending in the UI; a publication failure is shown as a delivery error. Formal acceptance cases remain `unverified` until later stages have Review/Verify.

## Safety and recovery

- The Host reprobes the active trusted project and enforces same-project Task, current approved revision, model from a real Codex capability probe, one database writer and owned workspace lease. A second Start while development is active is rejected. Renderer receives no general shell, file, database or process bridge.
- Cancel intent is durable before provider interruption. The existing P2-08 controller waits for confirmed owned process exit before recording `cancelled` and releasing the lease; uncertainty remains `interrupted`/quarantined. Main shuts down its owned Host; Host first requests cancellation of its active Runs.
- The current UI polls persisted Run detail and updates its list from that read model. Process state after Host restart is not inferred from old SQLite `running` rows. Delivery failure and crash reconciliation remain explicit limits, rather than silently claiming success.
- This vertical entry uses a built-in node and fixed local transport so that a general workflow runtime is not prebuilt in P2. It can be replaced with the future workflow resolver without changing approved Task or Executor public types.

## Evidence and limits

The P2-10 live scenario uses a disposable Git fixture with an actual authenticated Codex app-server Run, a second long-running Codex Run explicitly cancelled through Desktop, real SQLite/Run observations, frozen Git snapshot and a user-visible Diff. The source worktree is checked before and after. `T116`–`T120` remain authoritative cross-phase references and are tracked separately as `DEFERRED_VERIFICATION`; no evaluation/holdout result is inferred from this Demo. macOS arm64 is the only tested platform. Windows x64, macOS Intel, installed-app packaging, and utilityProcess crash recovery remain unverified.
