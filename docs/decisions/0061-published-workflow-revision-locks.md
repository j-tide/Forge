# ADR 0061 · Published Workflow revision locks

Date: 2026-09-24

Status: Accepted for P5-05

## Context

P5-03 introduced mutable drafts and immutable published rows in SQLite schema26. Existing RunConfig already freezes a `VersionLock`, but a caller could supply any matching workflow ID and arbitrary hash. A new draft or publication must not alter an existing Run, and a custom Workflow must not start on an unverified draft.

## Decision

- The Python Host owns published Workflow definitions and exposes a read-only impact preview. It reports immutable published revisions, the difference between the saved draft and current publication, and counts of actual frozen RunConfig snapshots by revision. It does not migrate or launch Runs.
- `WorkflowDraftService.published_lock()` derives the ID, revision and content hash from an actual `workflow_revisions` row and validates the stored definition against the compiler hash. Publication rows remain immutable by existing SQLite triggers.
- When `RunConfigService.create()` receives a `workflow.*` reference, it verifies the exact published revision and content hash inside the same SQLite transaction that writes the immutable RunConfig. Unknown, unapproved, mismatched and corrupted versions fail closed. The legacy P2/P3 `standard` path remains unchanged.
- A Run explicitly selects a published revision at creation. Publishing a newer revision affects neither existing RunConfig snapshots nor active Run records. The Desktop shows the impact preview from Host data; unsaved edits are labeled separately.

## Evidence and limits

A real SQLite Project/Task/approval fixture started an old Run with revision1, published revision2 while that Run was active, verified its frozen v1 lock, canceled it, queued a new Run with v2, then reopened the database and verified both locks and impact counts. This verifies version identity and Run state, not custom Workflow node execution or actual Codex activity. The latter belongs to P5-11, where the corresponding T031–T035 and T029 execution variants remain deferred. No schema migration, new dependency, model request or Renderer privilege was added. Windows x64, macOS Intel and installer paths remain unverified.
