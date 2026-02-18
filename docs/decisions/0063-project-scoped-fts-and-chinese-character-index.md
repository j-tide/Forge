# ADR 0063 · Project-scoped FTS and Chinese character index

Date: 2026-09-25

Status: Accepted for P5-07

## Decision

- Python Host owns the only knowledge search index. SQLite schema28 adds a source environment identity, an FTS5 trigram table keyed to the source chunk row, and a short Han character/bigram posting table. Existing schema27 active sources are backfilled in the same migration transaction. No external tokenizer, search service or model call is introduced.
- `knowledge.search` requires a trusted Project, its exact current environment ID, a bounded query and optional exact source/version filters. Every returned row must also satisfy active source and current source version predicates. Search tokens come from a fixed parser and bound SQL parameters; arbitrary SQL, JSON-RPC methods and project paths are rejected.
- Three-or-more character words use FTS5 trigram; one/two Han characters use explicit character/bigram postings. Exact substring predicates reject FTS phrase false positives. A punctuation-only query yields an empty result. Responses carry index version, saved source UUID, version, ordinal, line range, text and SHA-256. No answer is synthesized from an empty query.
- Import replacement removes old postings and installs the new version in one transaction. Revocation removes FTS and short postings before clearing stored text in that same transaction, retaining the citation tombstone. There is no search cache in this task.
- The UI calls the same fixed Desktop bridge used by ingestion. Main and Preload gain no arbitrary query capability for the Renderer. Plain Web remains without local Host access.

## Evidence and remaining boundary

Real SQLite tests cover two trusted projects with the same Chinese/code terms, environment/version/source scope, no match, source update, restart, schema27 backfill and revocation. Real Electron/Python Host smoke exercised Chinese plus `start_date`, empty results and post-revocation zero results; screenshot: `output/playwright/p5-07-search-desktop.png`. T066, T068 and T069 have current P5-07 evidence. T067 conflict resolution belongs to P5-08 and T070 authoritative source-reference admission belongs to P5-09; original IDs remain deferred. Windows x64, macOS Intel, installer SQLite builds and upgrade of a real user database from schema27 are unverified. Context Builder, rule conflict resolution and Memory are not implemented here.
