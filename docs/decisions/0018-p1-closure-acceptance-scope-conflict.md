# ADR 0018: P1 closure acceptance scope conflict

Status: Accepted — user approved option A · 2026-09-24

## Evidence

The authoritative `planning/tasks.json` and blueprint describe P1-10 as an offline manual message→draft→approval→TODO integration task. Its acceptance text also requires T011–T025 to pass and attaches T116–T120. The authoritative `acceptance-cases.json` defines T116–T120 as Agent evaluation cases: fair single/multi Agent budget, hidden holdout isolation, prompt strategy rollback, Run usage cap and cancelled Run reporting. The blueprint places M24 evaluation in P6/P9. P1 has no business Run, Reviewer, Verifier or multi Agent orchestration. T022 assumes real multi-state tasks, T024 assumes a read-only principal/scope, and part of T025 assumes later legal cross-column state transitions. The P1 phase exit instead requires an idea→draft→human approval→TODO with no automatic code writing.

The real macOS arm64 offline manual flow and its reproducible fixture are in `docs/demo/p1-manual-offline.md`. It passes that Phase Gate and the available case portions, but cannot honestly claim every T011–T025 branch or T116–T120. The reference files remain untouched. `pnpm validate:task-map` proves the task IDs/references are preserved; it does not execute those acceptance cases.

## Approved decision

The user approved **A**: P1-10 is accepted on the real offline manual message→draft→approval→TODO→restart flow and all currently executable P1 cases. Future-capability portions stay `DEFERRED_VERIFICATION` with explicit owners in `docs/deferred-verification.json`; no authority Task ID, Test ID, reference, or acceptance wording changes. The P1 Phase Gate is evidenced on macOS arm64. This approval permits marking P1-10 DONE and entering P2; it does not mark deferred cases PASSED.

The owner mapping is: T016→P2-05, T021/T022/T025→P3-12, T024→P7-08, T116/T117/T120→P6-09, T118→P9-06, T119→P2-05. T119 receives a further all-role usage regression in P6-09. Each owner must perform its real case when its prerequisites exist. `pnpm validate:task-map` checks existence, reference and forward phase direction; it cannot itself prove the tests passed.

`docs/forge-codex-autopilot-protocol.md` now treats this narrowly defined cross-phase reference pattern as Soft Spec Reconciliation. A core product, security, architecture, irreversible data, ambiguous user-behavior or unverified Phase Gate change remains a Hard Stop. Routine minimal, safe, reversible engineering choices no longer ask the user for A/B/C.
