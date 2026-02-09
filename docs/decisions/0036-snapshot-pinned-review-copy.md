# ADR 0036 · Snapshot-pinned review copy and enforced read-only gate

Date: 2026-09-24<br>
Status: Accepted for P3-01 under the existing Python Core and security boundaries

## Decision

The Python Host owns a `ReviewCopyManager` under its own data directory. It checks that a supplied `CodeSnapshot` has a Forge snapshot ref whose commit and tree match the frozen values, then creates a separate detached Git worktree at that exact commit. The review copy is neither the developer's mutable worktree nor the user's source working tree. Branch movement after the snapshot does not change what the Reviewer will read. The manager journals a UUID, source Run, snapshot, review Run, runtime and workspace ownership identity. Restart only reports orphan records; it never deletes or reuses a historical worktree automatically.

Creation fails before Git mutation unless the selected Executor's current capability probe reports `available`, `readOnlyEnforced=true` and `enforcement=native-sandbox`. A review request must use this exact owned root, review Run ID, `permission=read-only` and `approval=never`; `workspace-write`, another path or another Run is rejected. Before and after use, the manager verifies Git worktree identity, HEAD/tree and clean tracked/untracked status. It will not release an active or modified copy. Source and review paths are never exposed as arbitrary Renderer filesystem commands; P3-02 must load a Host-validated Handoff and use this internal boundary.

The production permission contract is `read-only + approval: never`. A separate diagnostic run deliberately used `read-only + approval: on-request` in an isolated copy, observed a real Codex `approval.requested`, explicitly rejected it, observed `approval.resolved=reject`, and confirmed no file was written. That diagnostic does **not** relax the production request gate. An earlier production-mode probe reported a failed write in model text but emitted no structured command event; the text alone was not counted as proof. The physical copy remained clean, and the explicit diagnostic supplied the capability evidence. The sandbox is the provider's enforced read-only mode, not a claim that Git worktrees or filesystem permissions form a hostile-code sandbox.

No Review result, Task transition, general workflow engine, SQLite Review table or Renderer IPC is introduced by P3-01. P3-02 will add the Reviewer Profile/result contract; later Review execution must recheck capability and copy integrity. The canonical T050 target-branch-advance merge/revalidation case is preserved as `DEFERRED_VERIFICATION` with P3-08 as owner. This task only proves the review copy stays on its fixed snapshot when main moves.

## Evidence and limits

`python/tests/test_review_copies.py` uses real disposable Git repos with Unicode/space paths. It verifies a frozen tracked and newly added file, a later main commit not appearing in the copy, false capability rejection, forged snapshot ref rejection, foreign runtime rejection, active process guard, changed copy preservation, symlink path escape rejection, safe repeated release and clean source. `pnpm test:review-copy-live` used Codex 0.155.1 on macOS arm64; the copied snapshot was read in a real isolated directory, a diagnostic write requested approval, rejection left no file, and source Git stayed clean. `pnpm py:check`, contract/task-map validation, lint/typecheck/test/build/Desktop smoke and `git diff --check` passed in the P3-01 record.

Only macOS arm64 development execution has been tested. Windows x64, macOS Intel, installer packaging, filesystem policy differences, malicious unsandboxed external executors and Host-death orphan recovery remain **UNVERIFIED**. Capabilities that cannot prove native read-only must be blocked, not silently downgraded to a trusted local write-capable mode.
