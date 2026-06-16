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

## Accepted snapshot gate · 2026-09-26

An Owner's final acceptance is bound to one Task contract revision and one
CodeSnapshot. A later Review or Verify report on that same accepted pair could
change the acceptance basis hash after the Owner signed it. The Python Host
therefore rejects a **new** Review or Verify Job for an accepted pair with the
existing stale-source error before starting a provider or project command.
Both starts prepare an isolated copy asynchronously; Owner acceptance can
occur during that preparation. Each start checks the same immutable decision
again inside the Job-insert transaction and releases its owned temporary copy
when the decision wins that race. A Job inserted first is visible as running
to the acceptance gate, which refuses to sign while a report is pending.
Idempotent retries of a previously created Job retain their existing result.
The Desktop disables the Review start control for a Done Task and keeps
historical reports readable. A controlled Task revision and a new snapshot
still use the normal approval and evidence flow; an old acceptance does not
authorize the new version. The gate reads the immutable final decision in the
Host database; it does not trust Renderer state or `tasks.state`, since Done is
projected from delivery evidence. No migration, new permission or workflow
state was introduced.

The same immutable acceptance fences new criterion decisions and advisory
waivers for that snapshot. Either write would change the signed acceptance
basis without new code. The Host checks the accepted tuple inside each write
transaction; an exact idempotent retry of a previously committed decision
still returns its prior outcome. The Desktop leaves the historical matrix and
issues visible while hiding their write controls for a Done Task. A targeted
tamper fixture still inserts a later criterion row directly into its disposable
SQLite database to prove that delivery and Done projection reject altered
evidence; this bypass is not a product command. No migration was required.

If stored evidence is altered outside the public write path after acceptance,
the old Owner signature cannot be silently reused. The Host marks the view
`ACCEPTANCE_BASIS_CHANGED`, withholds Done and delivery, and refuses a second
accept/return on the same snapshot. Desktop shows a specific integrity warning
instead of offering another signature. This protects against accidental or
external database modification without claiming to repair that database.

Done is only a read projection. If accepted evidence is altered, that projection
falls back to a blocked state with an explicit integrity reason, but the immutable Owner decision still owns
the same Contract revision. The Python Host now checks that decision before
starting a Development Run, while freezing a new Run configuration, and again
inside the durable Run-intent transaction after asynchronous workspace setup.
A controlled, approved Contract revision has a new revision number and may use
the normal Run path; a changed projection alone cannot reopen the accepted
revision. The Task drawer independently reads the Host's final-acceptance view
before offering new Development, Review, Verify or criterion writes. If that
view is unreadable, those controls fail closed while history stays visible.
The Host transaction checks, not the Renderer controls, enforce this rule.
