# ADR 0024: Bounded ContextBundle and Run working checkpoints

Status: Accepted for P2-06 · 2026-09-24

## Decision

- Keep P2 working memory scoped to one Run in the Host database. A checkpoint records the approved objective, bounded observed actions/issues, source references, observed usage and unknown fields as `null`. It is an append-only progress record, not a claim that a provider process survives Host restart.
- Build an immutable ContextBundle from the frozen approved Task Contract and, for continuation, a specifically identified checkpoint. Mandatory goal, acceptance, scope and constraints cannot be silently truncated. Optional checkpoint items may be omitted under a declared character limit and carry `run_observation` rather than `approved_task` authority. No full chat transcript, raw assistant prose, command text, secret or Project Memory enters this path.
- The Host stores bundle/checkpoint JSON behind strict schemas and a canonical content hash. The bundle must be reproducible from its frozen RunConfig and referenced checkpoint. An independent scheduler rejects an unknown bundle or a goal/context mismatch before a provider launch. Each bundle and checkpoint is immutable in SQLite schema v12.
- A checkpoint recovery read reports `processState: unverified`. Actual process ownership and side-effect reconciliation remain separate; this read does not resume a Run or alter Task status.

## Scope and risk

The current character cap is a deterministic size bound, not a provider token estimate. Observed token counts may be unknown; upstream budget enforcement across all roles is not claimed. Checkpoint summaries come from normalized Executor events and intentionally omit raw command strings and model messages. Live Codex and SQLite tests demonstrate checkpoint creation, provenance, bounded inputs, restart reads and source-repo isolation on macOS arm64.

M15 Project Memory candidate/validation/expiry/conflict/revocation belongs to P5-09/P5-10. Authoritative T071–T075 remain `DEFERRED_VERIFICATION` for those owners. P2-08 owns production pause/resume and process verification. No Renderer memory API, search index, cross-project experience or RAG was added.
