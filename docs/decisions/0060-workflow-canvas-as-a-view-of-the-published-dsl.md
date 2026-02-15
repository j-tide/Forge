# ADR 0060 · Workflow canvas is a view of the existing DSL

Date: 2026-09-24

Status: Accepted for P5-04

## Context

P5-03 already stores and compiles one closed Workflow definition in the Python Host. P5-04 adds Vue Flow without introducing another execution format or permitting v1 parallel writes. Layout is visual metadata; it must not change the meaning of a published revision.

## Decision

- `WorkflowsView` and `WorkflowCanvas` render the same `WorkflowTemplate`. Semantic changes remain in the linear editor and pass through the existing Host draft/CAS/compile/publish boundary. Node dragging changes only device-local visual positions in `localStorage`; it does not call Host or start a Run.
- The `forge-workflow-canvas/v1` JSON envelope carries a strict `definition` plus a separately validated `layout`. Import is size-limited, checks that every node has exactly one position, and populates an unsaved draft. Export/import round trips the semantic definition; import never publishes it.
- Vue Flow is lazy loaded in the Web renderer and supplies presentation/dragging. It is not an execution engine. Edges and bounded rework paths come from the canonical DSL, and compiler issues identify affected nodes. The canvas cannot create parallel writes or bypass approval gates.
- An imported definition must match the currently opened saved workflow ID. Publishing still requires explicit save and fresh Python Host capability compilation.

## Boundaries and remaining work

The local layout is not synchronized across devices and does not affect the published content hash. P5-05 owns immutable version use in RunConfig; P5-11 owns actual custom Workflow execution. Windows x64 and macOS Intel are unverified. The production UI package remains free of Electron and Node access.

`@vue-flow/core@1.48.2` is MIT; `zod@4.6.4` was already in the workspace. Both versions are exact in the lockfile. Dependency install scripts remain disabled. Official package documentation: https://vueflow.dev/ and https://github.com/bcakmakoglu/vue-flow/blob/master/LICENSE.
