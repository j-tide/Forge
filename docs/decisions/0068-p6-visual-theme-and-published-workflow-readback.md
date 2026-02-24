# ADR 0068 · P6 visual theme and published Workflow readback

Status: Accepted for P6-01 development scope, 2026-09-25.

Forge keeps one production token source in `packages/ui/src/tokens/values.json` and a same-key dark override in `dark.json`. The generator emits CSS variables for light/dark and reduced-transparency variants; Vue pages use the same components in Desktop and ordinary Web. Theme choice is a current-window appearance setting (`system`, `light`, `dark`), not a Host permission or persisted project decision. System dark-mode changes apply only while `system` is selected. Motion and transparency reductions remain independent.

P5 left immutable published Workflow revisions and frozen RunConfig locks, but the UI could only show version IDs/counts. P6-01 adds the narrow read-only `workflow.getPublished(workflowId, revision)` command. Electron Main validates the fixed command and response; Python Host revalidates an exact published row and content hash. The client computes a labeled field difference between two published definitions. It never compares an unsaved draft as if it were the old Run definition, changes a frozen Run, executes a Workflow, or grants a capability.

Existing `standard` and `strict` templates remain non-launchable at runtime until their required stages are supported. The current Desktop screenshot uses two real published quick revisions; a same-fixture old-Run/new-publication UI end-to-end case remains T029 `DEFERRED_VERIFICATION` to P6-09. T106/T108/T109/T110 retain their separate keyboard, DPI, long-text and motion owners. Windows and macOS Intel are not claimed.
