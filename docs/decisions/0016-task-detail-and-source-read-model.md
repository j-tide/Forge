# ADR 0016: Approved Task detail and source read model

Status: Accepted for P1-08 · 2026-09-24

## Decision

- The independent Host owns `task.detail`. The fixed Board bridge carries this read-only command through ForgeClient, preload and Main; the Renderer receives no filesystem or SQLite access. The public reference `TaskDetail` fields remain the nested `detail` object. Local `sources` is a separate read-model extension for T020; this is not a change to the reference OpenAPI schema.
- Detail reads the approved `task_revisions` row at `tasks.current_revision` and verifies its canonical content hash. It never builds the contract from an editable draft or a UI cache. Runs, artifacts and pending approvals are empty arrays until those services exist.
- Source refs are resolved only within the Task's project and source draft conversation. `message:<id>` refers to an original user message; `decision:<id>` refers to a stored human draft revision decision no newer than the approved Task revision. Unknown, removed or inaccessible refs render as withdrawn. The UI does not infer a source from prose.
- Cards and `#/tasks/<taskId>` open the detail drawer. The Task ID is stable across reorder and reload. A link opened under another project fails as not found. Hash navigation stays in the same Renderer document; Main sender validation ignores only the URL hash while still requiring the exact WebContents, main frame, scheme, host, path and query.

## Boundaries

- This is a read model, not a Task state machine. No Run, delivery history, revision editing or execution controls are introduced.
- Existing reference contracts can omit `sourceRefs`; the UI labels such an AC as having no recorded source. P1-05 production revisions require a decision ref for changed or new criteria, and P1-04 generated criteria carry the source message. We do not alter an already approved immutable revision to manufacture evidence.
- The internal Board Task projection currently covers approved TODO tasks. D03's future Run, Review, Verify and artifact tabs depend on their later authoritative tasks.
