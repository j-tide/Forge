# ADR 0037 · Reviewer Profile and fail-closed result contract

Date: 2026-09-24  
Status: Accepted for P3-02 under the approved Python Core architecture

## Decision

The Python Host bundles and validates a Reviewer Profile with an independent prompt and only `task-contract` and `snapshot-diff` context providers. Its `executorId` is `executor.codex`, the current Python Codex app-server adapter. The read-only reference preset still says `codex-sdk`; it is preserved as source material, while this production mapping follows ADR 0033 and does not change the authority of the canonical Task IDs or product semantics. Model selection remains dynamic and cannot be inferred from the Profile name.

The Review context is built from a Host-owned DevelopmentHandoff and immutable RunConfigSnapshot. IDs, contract revision, snapshot ID, Run config hash and Project/Task identity must agree before any Review is considered. It contains bounded goal, criterion IDs/statements, changed files and redacted Diff. Plan, self-check and project rules that do not yet have a trustworthy source are explicitly marked unavailable instead of fabricated. Review runs use the P3-01 snapshot-pinned copy and its enforced `read-only + approval: never` request gate.

The Pydantic `ReviewResult` schema separates blocking issues, suggestions and unknowns. Every issue has a safe relative file/line anchor, reason, impact and an acceptance-criterion or engineering basis. The result binds Task, snapshot, contract revision and Profile revision. Missing, malformed or semantically inconsistent output is `inconclusive`; a result for an old snapshot/revision is `stale` and discarded. `approved` is valid only with no blockers or unknowns, while `changes_requested` requires a concrete blocker. A model's prose is never an approval. No Task transition, waiver, Review persistence, UI result or automatic return-to-Develop is implemented here; those belong to later canonical P3 tasks.

P3-02's reference Test IDs remain intact. T051 empty blocker, T052 stale snapshot and T053 read-only boundary have concrete P3-01/P3-02 evidence. T054 issue dedup/history is `DEFERRED_VERIFICATION` to P3-03, the first owner of the Issue read/write model. T055 human risk acceptance is `DEFERRED_VERIFICATION` to P3-07, the first owner of a fresh human decision bound to the current reports; `waived` must never be represented as `pass`.

## Evidence and limits

`python/tests/test_review.py` checks independent bounded context, secret redaction, missing/malformed/old result, unsupported anchors and sources, and approval semantics. `pnpm test:review-copy-live` additionally sends the real Codex app-server a structured output schema on a true snapshot-pinned read-only copy and parses its returned `run.completed.structuredOutput`. The model returned `inconclusive` because the fixture supplied no complete Diff; this was retained as its actual outcome, not promoted to approval. A separate diagnostic write attempt requested approval, was rejected, and left the copy clean. The Profile/prompt are included in the built wheel.

This is the Reviewer contract and live capability probe, not the full Review workflow. Host-side Review execution, artifact storage and Issue handoff are P3-03 or later. Windows x64, macOS Intel, packaged Codex sandbox behavior and Host-death recovery remain **UNVERIFIED**.
