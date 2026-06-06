# ADR 0019: Immutable RunConfig snapshot boundary

Status: Accepted for P2-01 · 2026-09-24

## Decision

- `@forge/contracts` exposes a strict RunConfig selection/snapshot with the approved Task Contract revision and digest, exact workflow/profile/plugin version references and content hashes, bounded budget, and a full non-secret Environment configuration at a checked revision. `envRefs` are symbolic names; credential values and raw environment variables are absent.
- `@forge/core/run-config` creates and verifies a canonical SHA-256 snapshot. It rejects a stale Task/Environment revision, mismatched workflow reference, duplicate plugin or profile executor plugin missing from the selected lock set. This Core function has no access to mutable settings, SQLite, Electron or Codex.
- Forge Host owns SQLite migration v10. `run_config_snapshots` is insert-only; SQL triggers reject UPDATE/DELETE. Creation occurs in a transaction that reads the same-project, approved TODO `task_revisions` and current Environment, checks the Task digest and revision, then saves the snapshot. The same runId and exact selection replay returns the existing snapshot even if mutable Environment settings later change; a different selection for the same runId conflicts. Read verifies the stored content hash and project scope. Restart does not alter it.
- P2-01 does **not** expose a Renderer command, create an active Run, launch an Executor, lease a workspace or claim resolved workflow/profile/plugin compatibility. The selected lock descriptors are provided by a future trusted Host resolver; tests use explicit fixtures. P2-05 must bind this frozen snapshot to actual Run startup, verify installed versions and prove that later global settings changes do not affect the **running** Run. P4/P5 will supply production profile/plugin/workflow resolution and must reject unresolved or incompatible descriptors. A hash string supplied by an arbitrary caller is never sufficient authorization to execute.

## Why

The mutable Project Environment and later global plugin/model/workflow settings cannot be read again during a Run without changing the meaning of approval and budget. A durable, integrity-checked snapshot gives future scheduling a fixed input while preserving the existing approval and Host ownership boundary. The migration adds one internal table and leaves approved TODO data intact. No new dependency, network permission or execution authority is introduced.

## Deferred verification

The P2-01 authoritative references T031–T035 describe scheduler/result/cancel behaviour that appears in P2-05 and P2-08; T034's post-crash side-effect reconciliation first belongs to P3-09. Their absence does not count as a pass in P2-01. The task's own frozen-config acceptance is exercised with a real approved Task, Environment mutation and Host persistence restart. Full “already started Run” semantics must be rechecked when P2-05 exists.
