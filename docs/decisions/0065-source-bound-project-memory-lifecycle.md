# ADR 0065 · Source-bound Project Memory lifecycle

Status: Accepted for P5-09 on macOS arm64, 2026-09-25.

Project Memory belongs to the Python Host, not Electron Main or Renderer. Additive SQLite schema 29 stores project/environment scope, candidate/validated/stale/revoked status, source references and hashes, expiry, revision, an FTS5 trigram index and immutable decision events. Existing Project, Task and Run rows are preserved.

Proposal is only a candidate. The Host verifies a source reference against the current, same-project Task revision, CodeSnapshot or active, same-environment knowledge chunk and its exact hash. Unsupported/fabricated references fail closed. An explicit `memory.decide` confirmation and reason promote a candidate; a plugin has no direct MemoryService validation capability. Retrieval uses only validated, unexpired, still-current evidence and never shares across projects. A current conflicting candidate backed by different valid evidence withholds the older memory and asks for a human decision; it does not silently promote the candidate. A replacement must explicitly name the old memory. Revocation removes indexed text and clears the stored text while keeping an audit tombstone. Source revocation and expiry mark dependent validated memory stale. Read-only database retrieval also filters invalid/expired evidence even when it cannot update the stale marker.

Stage Context ranks validated memory below approved Task, human decision and CodeSnapshot, above untrusted retrieved project documents. Candidate and conflicted old memory never enter that context. This task only builds a read-only preview; it does not modify frozen Run input or grant Executor authority. P5-10 owns the user-facing confirmation/revocation workflow and impact display. P5-11 owns runtime consumption and longitudinal provenance checks.

The FTS index is an accelerator; SQLite rows and current source evidence remain authoritative. No external service, new dependency, Renderer filesystem/SQL capability or model call was added. Windows/Intel, installer SQLite FTS5 support and migration of a real user data directory remain unverified.
