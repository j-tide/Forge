# ADR 0050 · Bundled plugin lock and Run draining

Date: 2026-09-24<br>
Status: Accepted for canonical P4-03

## Decision

The Python Host ships a `plugins.lock.json` with the exact bundled Codex
manifest version and SHA-256 digests of its manifest, entry module and config
schema. A canonical digest of that file map becomes the plugin package's
`contentHash`. Discovery and activation both verify the lock before any entry
import. A changed, missing, linked, duplicate or mismatched bundle fails
closed, and the read-only inspector reports the lock issue. This is an
integrity lock for bundled application bytes, not a third-party signature or
proof that arbitrary Python code is sandboxed.

New production RunConfig snapshots retain the existing Executor/upstream
version descriptor and add a second immutable `VersionLock` for
`forge.executor.codex` (manifest version + bundle content hash). The existing
RunConfig schema and frozen v1–24 SQLite migrations remain unchanged; old
snapshots are still readable with their original hash and are never rewritten.
Before scheduling, `HostDevelopmentService` verifies the live Registry lock
against that frozen descriptor and acquires a Run lease. Rework requires the
same package version and content hash. The lease is released only after the
owned scheduler and Handoff path ends; startup failures release it while
preserving workspace cleanup. Directly injected test-only adapters have no
bundled Registry owner and remain outside production lock enforcement.

An active Run lease prevents plugin deactivation or replacement. A stop/update
request places the plugin in `draining`: its existing Adapter instance stays
registered for the current Run, but new Run acquisition is rejected. The final
lease release performs disposal. Host shutdown already stops active Runs
before disposing plugins. No hot update, remote installation, market or
automatic rollback was added.

## Evidence and limits

Tests reject a changed entry before import, a missing/duplicate lock, and an
attempt to acquire a new Run while an existing lease drains. The same Adapter
identity remains visible until release, then disappears. A real macOS arm64
Electron → Python Host → Codex development Run persisted the exact bundled
plugin ID/version/contentHash alongside the Executor/upstream lock in SQLite;
the P3 Verify/Review/human acceptance/explicit merge regression completed and
the source Git tree stayed clean. T038 is exercised for current trusted bundled
Registry semantics; an actual on-disk update of an executing packaged plugin
and Windows/Intel installer behavior remain unverified. T040's crash isolation
belongs to P4-09. No SQLite reset, credential, package install or new direct
dependency was required.
