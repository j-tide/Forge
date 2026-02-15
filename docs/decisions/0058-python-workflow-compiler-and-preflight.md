# ADR 0058 · Python Workflow compiler and installed-capability preflight

Date: 2026-09-24
Status: Accepted for P5-02 compiler scope

## Decision

Python Host owns the pure `workflow_compiler.py`. It takes the closed
`WorkflowTemplate` data and produces a deterministic content hash, ordered
normal nodes, bounded diagnostics and an explicit `launchable` flag. A
structure-only compilation is **never launchable**. Immediately before any
future custom Workflow start, compilation must use a snapshot of actually
installed Agent Profiles, real probed Executor capabilities, Verifier IDs and
output schemas. Missing bindings, enforced read-only, model, capability or
Verifier support fail closed before an Executor is started.

The compiler rejects duplicate/unreachable nodes, normal-path cycles,
ambiguous routes, missing predecessor outputs, incompatible output schemas,
unknown capability names, unsafe terminal nodes and excessive retry/time/
total-attempt budgets. Rework edges may return to earlier nodes only with a
finite maxCycles below the global attempt ceiling. The condition syntax is
limited to `when:<whitelisted-field>==<whitelisted-literal>` and one `else`
route; evaluation is a direct mapping comparison, never Python `eval` or
dynamic attribute access. Candidate size has fixed node/edge/rework bounds.

The fixed `workflow.compilePreset` Host method accepts only the three
bundled template IDs, validates its exact payload and returns real installed
capability diagnostics. It neither launches a Run nor modifies the SQLite
database. There is no generic Renderer bridge for this method yet. The
existing P2/P3 single-Develop path remains unchanged; it cannot be silently
reinterpreted as a fully executable standard/quick/strict Workflow. The
Planner role is not presently a runnable Python Executor Profile, and
Verifier plugin replacement is not installed, so the Host correctly reports
the bundled full presets as unavailable for launch. P5-03 can show draft
diagnostics, while subsequent Workflow activation must honor this preflight.

P5-05 owns published immutable Workflow revisions and RunConfig freezing;
P5-02's content hash does not rewrite an old Run. The user's P4-10→P5-01
exception remains development-only. P4-05/P4-10 and full P4 release gate
remain blocked.

## Evidence and limits

Python unit tests compile all three bundled templates structurally, exercise
installed/missing fixture Profiles and Verifier, enforced read-only,
cycle/input/output/budget/condition mutations, hash change and a real Host
preflight against absent installed bindings. No fixture capability is reported
as a real installed Codex/Claude ability. Runtime execution of a custom
Workflow, draft/publish UI and old Run version coexistence are later tasks.
