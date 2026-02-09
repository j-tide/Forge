# ADR 0045 · Approved Task revisions and safe-point invalidation

Date: 2026-09-24<br>
Status: Accepted for P3-10 on the Python Core path

## Decision

The Python Host alone owns an approved Task revision change. A change is a durable proposal containing the entire next `TaskContract`, prior revision, exact content/scope hashes, a new decision source reference, an idempotency key and a user reason. A separate explicit Owner decision names the proposal and expected hash. `TaskContract` revisions and old RunConfig/Run/Attempt snapshots remain immutable. The current contract is swapped by revision CAS in one SQLite transaction only after approval and an execution safe point. Migration v23 adds `task_change_requests` and a unique open-proposal constraint; it neither rewrites earlier migrations nor resets user data.

An active Run, Review, Verify or rework cycle prevents application. Approval then persists `awaiting_safe_point`; it does not inject the new goal into the running context. A further explicit apply request is required after work has stopped. A new Run, Review or Verify cannot start across an approved pending change, and an old Handoff cannot start Review/Verify after the revision changes. Interrupted Runs are unsafe until their lease/ownership ambiguity is resolved. The Host never silently resumes or abandons them for this edit. An immediate safe point allows the separately approved revision to apply in the decision transaction. Rejection preserves the old revision. Stale revision/hash, duplicate open proposal, reused key with changed payload, missing source provenance and unconfirmed scope changes fail closed.

The application preserves historical reports and source links. Current Acceptance Matrix, final acceptance and Done projection require a snapshot/RunConfig matching the current Contract revision, so old evidence becomes stale for current acceptance. Review issues are marked stale on application; the UI labels an old Handoff as historical. A new revision needs a new Run and fresh downstream evidence. Updating the Task does not merge code, run a model, approve a dangerous operation or start work.

## Evidence and limits

Disposable Git/SQLite tests cover a current accepted snapshot becoming stale, old RunConfig and source commit remaining unchanged, active Run blocking the approved change, rejection and concurrent second decision, explicit scope confirmation, invalid extra RPC fields, and independent Python Host restart with persisted proposal/approval. Old Review/Verify launch refusal is exercised before any provider call. Vue tests cover distinct proposal/approval and pending-safe-point feedback. The existing P1 tests for T016–T020 remain the authority for draft start, concurrent initial approval, stale approval, rejection and AC source links; this Task adds approved-version changes without renumbering those cases. No live provider was needed to prove frozen RunConfig isolation, but a real Codex run receiving a mid-turn revision change has not been separately exercised. Existing user DB v22→23, Windows x64, macOS Intel and installer migration remain unverified.
