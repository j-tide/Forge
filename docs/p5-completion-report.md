# P5 completion report · macOS arm64 development scope

Date: 2026-09-25. Canonical phase: P5「流程定制、知识与项目记忆」. The canonical exit is “默认模板与高级编辑共用同一执行定义，补齐上下文与经验边界.” **The P5 development phase gate passes for a shared versioned DSL and the currently executable quick-shaped linear path. This is not a full release gate or a claim that every bundled template can run.** P4-05/P4-10 and the full P4 multi-Executor gate remain BLOCKED; P5 work used the user's precise single-Executor development exception.

| Task | Actual evidence | Status |
| --- | --- | --- |
| P5-01 | Standard/quick/strict bundled JSON use one closed WorkflowTemplate and pass static schema/terminal checks. | DONE |
| P5-02 | Python compiler checks graph, capability bindings, budgets and non-eval conditions. | DONE |
| P5-03 | Desktop linear draft CAS, capability-gated explicit publish and immutable revision. | DONE |
| P5-04 | Vue Flow renders/imports/exports the same semantic DSL with layout separate. | DONE |
| P5-05 | RunConfig freezes published ID/revision/hash; old/new real SQLite Run configs survive restart. | DONE |
| P5-06 | Host-only Project document import, versioned exact citations, revoke tombstone. | DONE |
| P5-07 | Project/environment-scoped SQLite FTS with Chinese short terms and current-version filtering. | DONE |
| P5-08 | Bounded read-only Stage Context preview, explicit conflict/no-answer status. | DONE |
| P5-09 | Source-bound Project Memory candidate→human validation→stale/revoke lifecycle. | DONE |
| P5-10 | Desktop Memory Center with real reasoned confirm/revoke and safe fixed bridge. | DONE |
| P5-11 | Real published quick-shaped custom Workflow Develop→Verify→read-only Review→owner acceptance and a separate source-bound Codex Run; historical revocation display and global attempt ceiling. | DONE for supported linear scope |
| P5-12 | Production DSL version diagnostics, Web import feedback, local wire/OpenAPI mapping, populated P3/P4 fixture schema25→29 upgrade and user guidance. | DONE |

The three bundled templates and advanced editor **share the same definition model and version/hash rules**. Only a published quick-shaped four-node chain is admitted by the present runtime; Planner, human Plan approval, condition nodes, arbitrary commands and parallel graphs remain unsupported at launch. The historical `standard` P3 development route is labeled by its own `p2-development/v1` lock and must not be represented as execution of the five-node P5 `standard` template. This limitation is visible and fails closed, but it prevents a claim of complete configurable Workflow coverage. P6 may improve UX and diagnostics within this truthful boundary; full release needs a separate implementation and real evidence for any additionally advertised template. No automatic Task start, approval or Done shortcut was introduced.

The P5-11 real Electron/Python Host/Codex fixture produced a CodeSnapshot, independent approved command Verify, read-only Reviewer conclusion and separate human final acceptance; the source Git working tree stayed clean. Another real Codex fixture rejected no-answer/conflicting retrieval before start, froze an actual knowledge citation, and showed its revocation in historical Run diagnostics without rewriting the bundle. A real SQLite fixture confirmed validated-memory revocation clears current search while preserving a historical Run warning, and a real Verifier fixture hit the custom 16-attempt ceiling. See [ADR 0067](decisions/0067-published-linear-workflow-runtime-and-retrieval-freeze.md) and the [P5 migration/contract guide](p5-workflow-contract-and-migration.md).

P5-12 upgraded a populated independent schema-25 database containing an approved Task, Run, RunConfig and P4 Agent Profile to schema29 twice; all records remained readable with a clean foreign-key check and backup. Incompatible future `schemaVersion` is rejected in local Host commands, stored drafts and Desktop JSON import without changing the document or old row. The read-only reference OpenAPI is for a future authenticated HTTP gateway; no local HTTP/Remote adapter was enabled. P3-11 T086–T090 resilience tests remain in the full regression. No real user data directory was migrated in this test.

Full regression on this machine: frozen pnpm install; 47-file contract validator (0 errors, 4 existing reference-profile warnings); task-map validator (92 tasks, 120 acceptance cases, 43 deferred mappings); 171 Python pytest, Ruff and strict mypy; TS lint/typecheck/test/build; real Electron/Python Host Desktop smoke; and `git diff --check`, all exit 0. Windows x64, macOS Intel, installer/signing, display DPI, real user database upgrade and second Executor remain **UNVERIFIED**.

Deferred references remain intact: T029's full old/new Workflow UI difference is owned by P6-01; T116–T120 cross-role budgeting, holdout and evaluation remain with their P6/P9 owners. These are `DEFERRED_VERIFICATION`, never PASSED. The P4 two-real-Executor requirement and complete release gate remain BLOCKED. Next canonical task is P6-01「全页面视觉一致性」; its work must not imply that unsupported Workflow graphs are runnable.
