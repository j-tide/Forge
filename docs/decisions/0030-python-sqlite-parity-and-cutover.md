# ADR 0030 · Python SQLite parity and deferred schema cutover

Date: 2026-09-24  
Status: Accepted as the minimum reversible implementation of ADR 0029

## Decision

Python owns a `sqlite3` persistence boundary. The 15 immutable Node migration SQL bodies and SHA-256 checksums are frozen in `python/src/forge/legacy_migrations.json`; a cross-language test compares this snapshot to the Node migration registry. Python validates `schema_migrations` plus SQLite `user_version`, foreign keys, `quick_check`, WAL and busy timeout before reporting ready. It executes migration statements within `BEGIN IMMEDIATE`/`COMMIT`, records checksums only after success, and rolls back failures. A new additive version 16 creates only `python_host_metadata` and has been applied **only to isolated test databases**.

During MIG-PY-04～08, Electron starts Python with `FORGE_PYTHON_DB_READ_ONLY=1` against the same Forge data directory, while Node retains the temporary business writer role. Python may observe schema 15 and report true health but does not upgrade or mutate a user database. Once Node production ownership is removed in MIG-PY-09, Python can become the sole writer and apply a separately verified additive migration. The two processes must not simultaneously claim schema ownership.

`ForgePersistence` exposes the database connection only inside the Python persistence package. Domain operations added in MIG-PY-05/06 must use typed service APIs, maintain revisions/hashes/idempotency, and never expose SQL or paths to Main/Renderer. The MIG-PY-04 storage parity fixture checks existing Project/Task/Run rows and limited transactional writes; this is not P1/P2 business parity. Those acceptance scenarios remain for MIG-PY-05/06/09.

## Evidence and limits

macOS arm64: Python 3.12.13 bundles SQLite 3.50.4; Node `better-sqlite3@13.0.3` reported SQLite 3.53.4. The two engines read the same schema 15 file; Node-created Project/Task/Run fixture rows survived Python read/update and Node readback. Python v1→15, v15→16 in an isolated DB, restart durability, transaction rollback, invalid file, checksum mismatch and future version rejection passed. Real Electron Python health moved from degraded to ready after Node's fresh test DB migration; invalid DB stayed degraded. The current real development DB file was absent, so no existing user database could be tested or altered.

Windows x64, macOS Intel, packaged Python runtime, cross-process write contention under sustained load, user data upgrade to v16 and recovery from crash during a real production cutover remain **UNVERIFIED**. No claim of Python Project/Task/Run business behavior is made by this ADR.
