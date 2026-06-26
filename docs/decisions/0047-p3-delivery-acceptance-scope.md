# ADR 0047 · P3 delivery acceptance and M24 test ownership

Date: 2026-09-24<br>
Status: Accepted for P3-12 scope reconciliation

## Decision

The authoritative P3 exit is a version- and CodeSnapshot-bound delivery that a
human can inspect and accept without treating green output as sufficient
evidence. P3-12 repeats five actual paths on disposable Git/SQLite fixtures:
normal accepted delivery and explicit local merge, a structured Reviewer change
request, a failed approved test followed by bounded rework, a human non-security
advisory waiver, and a Host process death after a Git side effect followed by
startup reconciliation. A separate real Electron → Python Host → Codex run
exercises message → Draft → approval → TODO → isolated development → fixed
snapshot → approved command Verify → explicit AC decision → read-only Review →
Owner acceptance → Done, followed by separately confirmed local merge.

The same phase exposes the Host's actual Verify report and text evidence in the
Task drawer. The Renderer validates the fixed report/artifact schema and
project/report identity, and displays content with Vue text interpolation, never
HTML rendering or a clickable link. A malicious script/javascript-link fixture
is exercised in a component test. A mixed-status real Desktop/Host fixture
tests Done/TODO filtering, counts, cross-column refusal and keyboard ordering.
The test found and fixed two real issues: Host reorder included Done cards in
TODO neighbors, and the card's Enter shortcut intercepted the nested reorder
button.

## Cross-phase acceptance references

P3-12 retains T116–T120 exactly as written in the read-only specification.
M24 explicitly lands in P6/P9, so they are **DEFERRED_VERIFICATION**, not
PASSED: T116/T117/T119/T120 are owned by P6-09's full evaluation suite;
T118 is owned by P9-06's strategy evaluation and rollback. P3 lacks a second
production Executor, a holdout corpus, all-role budget accounting and strategy
rollout. Deferring those tests neither changes the P3 product semantics nor
weakens its security or its direct delivery acceptance evidence. The mapping
is machine checked in `docs/deferred-verification.json`.

P1-10 T021/T022/T025 and P2-07 T064 are re-exercised in P3's real mixed-state
Host/Desktop path plus the report-rendering test, so their deferred mappings
can be removed. An isolated Reviewer-return fixture intentionally lacks a
second live Reviewer and therefore stops at the gate instead of fabricating
an approved re-review. Full custom workflow orchestration and comparative
Agent evaluation remain later tasks.

## Limits

The current acceptance applies only to the macOS arm64 development runtime.
Windows x64, macOS Intel, packaged Python/Codex, installer/signing/DPI,
existing user DB migration, adversarial third-party plugin isolation and
unattended recovery of historical orphan processes remain unverified.
No source reference package, user repository or existing database is reset.
