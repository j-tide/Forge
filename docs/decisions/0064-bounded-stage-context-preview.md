# ADR 0064 · Bounded Stage Context preview

Date: 2026-09-25

Status: Accepted for P5-08

## Decision

- Python Host assembles a read-only `StageContextPreview` from a verified immutable RunConfig, its approved Task Contract, optional same-snapshot human decision/CodeSnapshot/artifact rows, and current project/environment-scoped knowledge search. Renderer supplies only Project ID, Run ID, bounded query and character budget; it cannot submit arbitrary context entries or SQL. The preview is available through the fixed Run command bridge and displayed in Run Inspector. It does not mutate or replace a Run's frozen ContextBundle.
- Items carry sourceRef, SHA-256/source basis hash, explicit authority/trust label and priority. Approved Task is mandatory at priority 1. Same-snapshot human decisions, CodeSnapshot and stage artifacts follow; imported knowledge is priority 6 and explicitly `untrusted`. Validated project rules and historical Memory have no source yet and therefore are not promoted into priority 5/7. P5-09 owns their lifecycle and validation.
- The budget is UTF-16 characters plus per-item reference overhead, not a claimed provider token count. Approved Task text is never partially emitted. If it exceeds budget, status is `budget_exceeded` with no items. Complete lower-priority items may be omitted with `omittedItems`/`truncated`. A query with no matching source is `insufficient_sources`; no answer is invented.
- Equal headings with different content hashes, including the previous version of a retrieved source, are conservative **potential** conflicts. The Host returns both citation identities and a human question with status `needs_human_decision`; it never silently chooses the new/old rule or feeds an unresolved preview to an Executor. A changed heading can be harmless, so this is a review request rather than proof of semantic contradiction.
- The preview is recomputed from current active sources. Revocation removes it from future previews. The Run's historical frozen evidence remains separate; this task does not retrofit active Runs with new context. P5-11 owns Workflow Engine use of Stage Context and safe-point rules.

## Evidence and limits

Real SQLite/Host tests use an approved Task, frozen RunConfig and imported source to verify priority, source/hash, UTF-16 budget, optional truncation, required-over-budget refusal, no-source status, changed-version conflict with human question, revocation and cross-project/unknown Run rejection. The Vue component test verifies conflict/truncation presentation; a real Electron/Python Host smoke verifies the fixed bridge returns `CONTEXT_RUN_NOT_FOUND` for an unknown Run rather than accepting arbitrary access. An Electron screenshot of a successful Stage Context for an existing Run has not been produced. Source conflict detection is structural; it does not make a model-based semantic judgment. T067 has current preflight evidence; T070 authoritative citation admission remains P5-09. P4-05/P4-10 and the full P4 Gate remain blocked.
