# ADR 0062 · Host-owned project document ingestion

Date: 2026-09-24

Status: Accepted for P5-06

## Context

P5 needs cited project context without letting the Renderer inspect arbitrary files or run project scripts. Retrieval and Context Builder are separate tasks. Imported text must remain scoped to a trusted Forge Project and cite an exact source version and line range.

## Decision

- Python Host alone reads project documents. The fixed `knowledge.list/import/chunk/revoke` JSON-RPC methods have strict request/response schemas in the Host and Desktop bridge; there is no arbitrary read, SQL, shell or URL method. Ordinary Web has no local bridge.
- Import accepts only an already trusted, non-archived Project and a project-relative path. Canonical paths must remain inside that Project and inside `docs/`, `spec/`, `specs/`, `knowledge/`, or be root `README.md`/OpenAPI. Files must be UTF-8, at most 1 MiB, and Markdown/TXT or identifiable OpenAPI JSON/YAML. Known credential patterns and private-key material are rejected. No project script executes.
- SQLite schema27 adds `knowledge_sources` and `knowledge_chunks`, with Project scope, stable source UUID, monotonic version, SHA-256, exact line range and chunk hash. Title/heading boundaries and a 4,000-character cap produce bounded chunks. Unchanged reimport is idempotent; failures leave no partial source; corrected files can be retried.
- Revocation atomically clears stored chunk text and keeps IDs, hashes and line ranges as tombstones. It never deletes or rewrites the user's project file. P5-07 will add index/cache revocation; P5-08 will build conflict-aware Context; P5-09 will gate knowledge source references used as validated rules.
- The Desktop view shows real Host sources and an exact stored citation. Its import/revoke UI is deliberate; there is no model answer or search result claimed.

## Evidence and limits

Real SQLite/Host fixtures cover Unicode/space paths, two-project isolation, too-large/binary/secret/invalid OpenAPI input, symlink escape, retry after correction, version increment, restart, revocation tombstones and source preservation. A real Electron/Python Host smoke used a disposable trusted Project, imported `docs/guide.md`, displayed its line citation, revoked it, and verified a declared project `test` script never ran. The automated folder picker uses a disposable fixture path; the file read, Host storage and UI result are real. Windows x64, macOS Intel, installer and concurrent adversarial filesystem mutation are unverified. P5-07 search, P5-08 conflicts and P5-09 rule validation remain deferred under original T066–T070 IDs.
