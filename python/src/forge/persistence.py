"""Host-owned SQLite boundary compatible with the frozen Node schema history."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.resources import files
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, cast
from uuid import uuid4

if TYPE_CHECKING:
    from forge.projects import Project, ProjectProbe


class PersistenceError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class QueryResult:
    """Cursor surface retained inside persistence; domain services see rows only."""

    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self._cursor = cursor

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    def fetchone(self) -> sqlite3.Row | None:
        return cast(sqlite3.Row | None, self._cursor.fetchone())

    def fetchall(self) -> list[sqlite3.Row]:
        return self._cursor.fetchall()

    def __iter__(self) -> Iterator[sqlite3.Row]:
        return iter(self._cursor)


class PersistenceSession:
    """Host-owned SQL session. No sqlite3 connection crosses this boundary."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> QueryResult:
        return QueryResult(self._connection.execute(sql, parameters))


@dataclass(frozen=True)
class Migration:
    version: int
    sql: str
    checksum: str


def _legacy_migrations() -> tuple[Migration, ...]:
    source = files("forge").joinpath("legacy_migrations.json").read_text()
    entries: list[dict[str, Any]] = json.loads(source)["migrations"]
    migrations = tuple(Migration(**entry) for entry in entries)
    if [item.version for item in migrations] != list(range(1, 16)):
        raise PersistenceError("DATABASE_MIGRATION_FAILED")
    for item in migrations:
        if hashlib.sha256(item.sql.encode()).hexdigest() != item.checksum:
            raise PersistenceError("DATABASE_MIGRATION_FAILED")
    return migrations


_PYTHON_MIGRATION_SQL = """CREATE TABLE python_host_metadata(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);"""
_REVIEW_MIGRATION_SQL = """CREATE TABLE review_reports(
  review_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  review_copy_id TEXT NOT NULL,
  review_attempt_id TEXT NOT NULL UNIQUE,
  contract_revision INTEGER NOT NULL CHECK(contract_revision>=1),
  profile_revision INTEGER NOT NULL CHECK(profile_revision>=1),
  outcome TEXT NOT NULL CHECK(outcome IN ('approved','changes_requested','inconclusive')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_review_reports_task ON review_reports(project_id,task_id,created_at);
CREATE TABLE review_jobs(
  review_run_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  review_copy_id TEXT NOT NULL,
  review_attempt_id TEXT NOT NULL UNIQUE,
  model_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed','interrupted')),
  report_id TEXT REFERENCES review_reports(review_id),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_review_jobs_task ON review_jobs(project_id,task_id,created_at);
CREATE TABLE review_issue_threads(
  issue_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
  severity TEXT NOT NULL CHECK(severity IN ('blocking','advisory')),
  status TEXT NOT NULL CHECK(status IN ('open','stale','resolved','waived')),
  revision INTEGER NOT NULL CHECK(revision>=1),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(task_id,fingerprint)
);
CREATE TABLE review_issue_occurrences(
  occurrence_id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES review_issue_threads(issue_id),
  review_id TEXT NOT NULL REFERENCES review_reports(review_id),
  review_attempt_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  finding_json TEXT NOT NULL CHECK(json_valid(finding_json)),
  created_at TEXT NOT NULL,
  UNIQUE(issue_id,review_id)
);
CREATE INDEX ix_review_occurrences_issue ON review_issue_occurrences(issue_id,created_at);
CREATE TABLE review_rework_handoffs(
  handoff_id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES review_reports(review_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  bundle_json TEXT NOT NULL CHECK(json_valid(bundle_json)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER review_report_no_update BEFORE UPDATE ON review_reports
  BEGIN SELECT RAISE(ABORT,'review report is immutable'); END;
CREATE TRIGGER review_report_no_delete BEFORE DELETE ON review_reports
  BEGIN SELECT RAISE(ABORT,'review report is immutable'); END;
CREATE TRIGGER review_occurrence_no_update BEFORE UPDATE ON review_issue_occurrences
  BEGIN SELECT RAISE(ABORT,'review occurrence is immutable'); END;
CREATE TRIGGER review_occurrence_no_delete BEFORE DELETE ON review_issue_occurrences
  BEGIN SELECT RAISE(ABORT,'review occurrence is immutable'); END;
CREATE TRIGGER review_rework_no_update BEFORE UPDATE ON review_rework_handoffs
  BEGIN SELECT RAISE(ABORT,'review handoff is immutable'); END;
CREATE TRIGGER review_rework_no_delete BEFORE DELETE ON review_rework_handoffs
  BEGIN SELECT RAISE(ABORT,'review handoff is immutable'); END;"""
_VERIFIER_MIGRATION_SQL = """CREATE TABLE verifier_jobs(
  verification_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  development_run_id TEXT NOT NULL REFERENCES runs(run_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  kind TEXT NOT NULL CHECK(kind IN ('test','typecheck','build','lint')),
  preset_id TEXT REFERENCES command_presets(preset_id),
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed','interrupted')),
  report_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_verifier_jobs_task ON verifier_jobs(project_id,task_id,created_at);
CREATE TABLE verifier_reports(
  report_id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL UNIQUE REFERENCES verifier_jobs(verification_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  status TEXT NOT NULL CHECK(status IN ('passed','failed','not_configured','timeout','error')),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL
);
CREATE TABLE verifier_artifacts(
  artifact_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES verifier_reports(report_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  kind TEXT NOT NULL CHECK(kind IN ('stdout','stderr')),
  mime TEXT NOT NULL CHECK(mime='text/plain'),
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size>=0),
  truncated INTEGER NOT NULL CHECK(truncated IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER verifier_report_no_update BEFORE UPDATE ON verifier_reports
  BEGIN SELECT RAISE(ABORT,'verifier report is immutable'); END;
CREATE TRIGGER verifier_report_no_delete BEFORE DELETE ON verifier_reports
  BEGIN SELECT RAISE(ABORT,'verifier report is immutable'); END;
CREATE TRIGGER verifier_artifact_no_update BEFORE UPDATE ON verifier_artifacts
  BEGIN SELECT RAISE(ABORT,'verifier artifact is immutable'); END;
CREATE TRIGGER verifier_artifact_no_delete BEFORE DELETE ON verifier_artifacts
  BEGIN SELECT RAISE(ABORT,'verifier artifact is immutable'); END;"""
_ACCEPTANCE_MIGRATION_SQL = """CREATE TABLE acceptance_decisions(
  decision_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  contract_revision INTEGER NOT NULL CHECK(contract_revision>=1),
  criterion_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','failed','risk_accepted','not_applicable')),
  report_id TEXT REFERENCES verifier_reports(report_id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_acceptance_decisions_task ON acceptance_decisions(project_id,task_id,created_at);
CREATE TRIGGER acceptance_decision_no_update BEFORE UPDATE ON acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'acceptance decision is immutable'); END;
CREATE TRIGGER acceptance_decision_no_delete BEFORE DELETE ON acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'acceptance decision is immutable'); END;"""
_REWORK_MIGRATION_SQL = """CREATE TABLE rework_cycles(
  cycle_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  source_run_id TEXT NOT NULL REFERENCES runs(run_id),
  source_snapshot_id TEXT NOT NULL UNIQUE REFERENCES code_snapshots(snapshot_id),
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('review','verify')),
  trigger_report_id TEXT NOT NULL,
  next_run_id TEXT UNIQUE,
  cycle_no INTEGER NOT NULL CHECK(cycle_no>=1),
  total_attempts INTEGER NOT NULL CHECK(total_attempts>=1),
  state TEXT NOT NULL CHECK(state IN ('pending','launching','running','blocked','interrupted')),
  reason_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_rework_cycles_task ON rework_cycles(project_id,task_id,cycle_no);"""
_FINAL_ACCEPTANCE_MIGRATION_SQL = """CREATE TABLE final_acceptance_decisions(
  decision_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  contract_revision INTEGER NOT NULL CHECK(contract_revision>=1),
  basis_hash TEXT NOT NULL CHECK(length(basis_hash)=64),
  decision TEXT NOT NULL CHECK(decision IN ('accept','return')),
  next_run_id TEXT UNIQUE,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_final_acceptance_task ON final_acceptance_decisions(project_id,task_id,created_at);
CREATE TRIGGER final_acceptance_no_update BEFORE UPDATE ON final_acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'final acceptance is immutable'); END;
CREATE TRIGGER final_acceptance_no_delete BEFORE DELETE ON final_acceptance_decisions
  BEGIN SELECT RAISE(ABORT,'final acceptance is immutable'); END;
CREATE TABLE review_advisory_waivers(
  waiver_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  issue_id TEXT NOT NULL REFERENCES review_issue_threads(issue_id),
  review_id TEXT NOT NULL REFERENCES review_reports(review_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  issue_revision INTEGER NOT NULL CHECK(issue_revision>=1),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(issue_id,review_id,snapshot_id)
);
CREATE TRIGGER review_advisory_waiver_no_update BEFORE UPDATE ON review_advisory_waivers
  BEGIN SELECT RAISE(ABORT,'advisory waiver is immutable'); END;
CREATE TRIGGER review_advisory_waiver_no_delete BEFORE DELETE ON review_advisory_waivers
  BEGIN SELECT RAISE(ABORT,'advisory waiver is immutable'); END;"""
_DELIVERY_MIGRATION_SQL = """CREATE TABLE delivery_records(
  delivery_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  acceptance_decision_id TEXT NOT NULL UNIQUE REFERENCES final_acceptance_decisions(decision_id),
  snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER delivery_record_no_update BEFORE UPDATE ON delivery_records
  BEGIN SELECT RAISE(ABORT,'delivery record is immutable'); END;
CREATE TRIGGER delivery_record_no_delete BEFORE DELETE ON delivery_records
  BEGIN SELECT RAISE(ABORT,'delivery record is immutable'); END;
CREATE TABLE merge_operations(
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  delivery_id TEXT NOT NULL REFERENCES delivery_records(delivery_id),
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  target_branch TEXT NOT NULL,
  expected_target_head TEXT NOT NULL,
  snapshot_commit TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('intent','merged','conflict','unknown')),
  result_commit TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(delivery_id,target_branch)
);
CREATE INDEX ix_merge_operation_task ON merge_operations(project_id,task_id,created_at);"""
_TASK_CHANGE_MIGRATION_SQL = """CREATE TABLE task_change_requests(
  change_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  base_revision INTEGER NOT NULL CHECK(base_revision>=1),
  proposed_revision INTEGER NOT NULL CHECK(proposed_revision=base_revision+1),
  contract_json TEXT NOT NULL CHECK(json_valid(contract_json)),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  scope_hash TEXT NOT NULL CHECK(length(scope_hash)=64),
  decision_id TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'proposed','awaiting_safe_point','applied','rejected','stale')),
  approval_reason TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  applied_at TEXT
);
CREATE UNIQUE INDEX ux_task_change_open ON task_change_requests(task_id)
  WHERE state IN ('proposed','awaiting_safe_point');
CREATE INDEX ix_task_change_task ON task_change_requests(project_id,task_id,created_at);"""
_STORAGE_BOUNDARY_MIGRATION_SQL = """CREATE TABLE imported_artifacts(
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  verification_id TEXT NOT NULL REFERENCES verifier_jobs(verification_id),
  kind TEXT NOT NULL,
  mime TEXT NOT NULL CHECK(mime IN ('text/plain','application/json')),
  content_blob BLOB NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size>=0 AND byte_size<=1048576),
  content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
  created_at TEXT NOT NULL
);
CREATE INDEX ix_imported_artifacts_project ON imported_artifacts(project_id,created_at);
CREATE TRIGGER imported_artifact_no_update BEFORE UPDATE ON imported_artifacts
  BEGIN SELECT RAISE(ABORT,'imported artifact is immutable'); END;
CREATE TRIGGER imported_artifact_no_delete BEFORE DELETE ON imported_artifacts
  BEGIN SELECT RAISE(ABORT,'imported artifact is immutable'); END;
CREATE TABLE plugin_storage_entries(
  plugin_id TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(plugin_id,storage_key)
);"""
MIGRATIONS = (
    *_legacy_migrations(),
    Migration(
        16, _PYTHON_MIGRATION_SQL, hashlib.sha256(_PYTHON_MIGRATION_SQL.encode()).hexdigest()
    ),
    Migration(
        17, _REVIEW_MIGRATION_SQL, hashlib.sha256(_REVIEW_MIGRATION_SQL.encode()).hexdigest()
    ),
    Migration(
        18, _VERIFIER_MIGRATION_SQL,
        hashlib.sha256(_VERIFIER_MIGRATION_SQL.encode()).hexdigest()
    ),
    Migration(19, _ACCEPTANCE_MIGRATION_SQL,
              hashlib.sha256(_ACCEPTANCE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(20, _REWORK_MIGRATION_SQL,
              hashlib.sha256(_REWORK_MIGRATION_SQL.encode()).hexdigest()),
    Migration(21, _FINAL_ACCEPTANCE_MIGRATION_SQL,
              hashlib.sha256(_FINAL_ACCEPTANCE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(22, _DELIVERY_MIGRATION_SQL,
              hashlib.sha256(_DELIVERY_MIGRATION_SQL.encode()).hexdigest()),
    Migration(23, _TASK_CHANGE_MIGRATION_SQL,
              hashlib.sha256(_TASK_CHANGE_MIGRATION_SQL.encode()).hexdigest()),
    Migration(24, _STORAGE_BOUNDARY_MIGRATION_SQL,
              hashlib.sha256(_STORAGE_BOUNDARY_MIGRATION_SQL.encode()).hexdigest()),
)
CURRENT_COMPATIBLE_SCHEMA = 15
LATEST_SCHEMA = MIGRATIONS[-1].version


def resolve_data_dir(
    *, environment: Literal["development", "test", "production"], override: str | None = None
) -> Path:
    if override is not None:
        path = Path(override)
        if not path.is_absolute():
            raise ValueError("Forge data directory override must be absolute")
        return path.resolve()
    home = Path.home()
    if sys.platform == "darwin":
        base = home / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", str(home / "AppData" / "Roaming")))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", str(home / ".local" / "share")))
    return base / "Forge" / environment


def _statements(sql: str) -> Iterator[str]:
    statement = ""
    for line in sql.splitlines(keepends=True):
        statement += line
        if sqlite3.complete_statement(statement):
            yield statement.strip()
            statement = ""
    if statement.strip():
        raise PersistenceError("DATABASE_MIGRATION_FAILED")


def _map_error(error: Exception, fallback: str) -> PersistenceError:
    if isinstance(error, PersistenceError):
        return error
    if isinstance(error, sqlite3.DatabaseError):
        extended = getattr(error, "sqlite_errorcode", None)
        code = extended & 0xFF if isinstance(extended, int) else None
        if code in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
            return PersistenceError("DATABASE_BUSY")
        if code in (sqlite3.SQLITE_NOTADB, sqlite3.SQLITE_CORRUPT):
            return PersistenceError("DATABASE_CORRUPT")
        if code == sqlite3.SQLITE_FULL:
            return PersistenceError("DATABASE_DISK_FULL")
        if code in (sqlite3.SQLITE_READONLY, sqlite3.SQLITE_IOERR):
            return PersistenceError("DATABASE_IO_ERROR")
    return PersistenceError(fallback)


class ForgePersistence:
    def __init__(self, data_dir: Path, *, read_only: bool = False) -> None:
        if not data_dir.is_absolute():
            raise ValueError("Forge data directory must be absolute")
        self.data_dir = data_dir.resolve()
        self.db_path = self.data_dir / "forge.sqlite"
        self.read_only = read_only
        self._connection: sqlite3.Connection | None = None
        self._write_fault: str | None = None
        self.last_backup: Path | None = None

    @property
    def is_open(self) -> bool:
        return self._connection is not None

    def session(self) -> PersistenceSession:
        return PersistenceSession(self._db())

    def open(self) -> None:
        if self._connection is not None:
            return
        try:
            if self.read_only:
                if not self.db_path.is_file():
                    raise PersistenceError("DATABASE_OPEN_FAILED")
                connection = sqlite3.connect(
                    self.db_path.as_uri() + "?mode=ro", uri=True, timeout=5
                )
            else:
                self.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
                connection = sqlite3.connect(self.db_path, timeout=5, isolation_level=None)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA busy_timeout = 5000")
            if not self.read_only:
                connection.execute("PRAGMA journal_mode = WAL")
            if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise PersistenceError("DATABASE_CORRUPT")
            self._connection = connection
            self._write_fault = None
        except (OSError, sqlite3.DatabaseError, PersistenceError) as error:
            if "connection" in locals():
                connection.close()
            raise _map_error(error, "DATABASE_OPEN_FAILED") from error

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
        self._connection = None
        self._write_fault = None

    def _writable(self) -> None:
        if self.read_only:
            raise PersistenceError("DATABASE_IO_ERROR")
        if self._write_fault is not None:
            raise PersistenceError(self._write_fault)

    def _latch(self, error: Exception, fallback: str) -> PersistenceError:
        mapped = _map_error(error, fallback)
        if mapped.code in ("DATABASE_DISK_FULL", "DATABASE_IO_ERROR",
                           "DATABASE_CORRUPT", "DATABASE_MIGRATION_FAILED",
                           "DATABASE_BACKUP_FAILED"):
            self._write_fault = mapped.code
        return mapped

    def backup(self) -> Path:
        """Copy committed WAL state through SQLite's online backup API, never file-copy DB."""
        source = self._db()
        version = self.schema_version()
        backup_dir = self.data_dir / "backups"
        temporary: Path | None = None
        try:
            if backup_dir.is_symlink():
                raise PersistenceError("DATABASE_BACKUP_FAILED")
            backup_dir.mkdir(mode=0o700, exist_ok=True)
            if os.name != "nt":
                os.chmod(backup_dir, 0o700)
            if backup_dir.parent.resolve() != self.data_dir:
                raise PersistenceError("DATABASE_BACKUP_FAILED")
            label = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
            target = backup_dir / f"forge-v{version}-{label}-{uuid4()}.sqlite"
            temporary = backup_dir / f".{target.name}.partial"
            copy = sqlite3.connect(temporary)
            try:
                if os.name != "nt":
                    os.chmod(temporary, 0o600)
                source.backup(copy)
                if copy.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise PersistenceError("DATABASE_BACKUP_FAILED")
                if copy.execute("PRAGMA foreign_key_check").fetchone() is not None:
                    raise PersistenceError("DATABASE_BACKUP_FAILED")
            finally:
                copy.close()
            with temporary.open("rb") as handle:
                os.fsync(handle.fileno())
            os.replace(temporary, target)
            self.last_backup = target
            return target
        except (OSError, sqlite3.DatabaseError, PersistenceError) as error:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            raise self._latch(error, "DATABASE_BACKUP_FAILED") from error

    def _preflight_upgrade(self, current: int, target: int) -> None:
        if current == 0 or target <= current:
            return
        try:
            size = self.db_path.stat().st_size
            wal = self.db_path.with_name(self.db_path.name + "-wal")
            if wal.exists():
                size += wal.stat().st_size
            if shutil.disk_usage(self.data_dir).free < max(16 * 1024 * 1024, size * 2):
                raise PersistenceError("DATABASE_DISK_FULL")
            self.backup()
        except (OSError, PersistenceError) as error:
            raise self._latch(error, "DATABASE_BACKUP_FAILED") from error

    def _db(self) -> sqlite3.Connection:
        if self._connection is None:
            raise PersistenceError("DATABASE_OPEN_FAILED")
        return self._connection

    def schema_version(self) -> int:
        try:
            db = self._db()
            user_version = int(db.execute("PRAGMA user_version").fetchone()[0])
            if user_version > LATEST_SCHEMA:
                raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
            exists = db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
            ).fetchone()
            if not exists:
                if user_version != 0:
                    raise PersistenceError("DATABASE_MIGRATION_FAILED")
                return 0
            rows = db.execute("SELECT version, checksum FROM schema_migrations ORDER BY version")
            versions = list(rows)
            for index, row in enumerate(versions):
                if row["version"] > LATEST_SCHEMA:
                    raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
                expected = MIGRATIONS[index] if index < len(MIGRATIONS) else None
                if (
                    expected is None
                    or row["version"] != index + 1
                    or row["checksum"] != expected.checksum
                ):
                    raise PersistenceError("DATABASE_MIGRATION_FAILED")
            if user_version != (versions[-1]["version"] if versions else 0):
                raise PersistenceError("DATABASE_MIGRATION_FAILED")
            return user_version
        except (sqlite3.DatabaseError, PersistenceError) as error:
            raise _map_error(error, "DATABASE_MIGRATION_FAILED") from error

    def migrate(self, target_version: int = CURRENT_COMPATIBLE_SCHEMA) -> int:
        self._writable()
        if target_version < 0 or target_version > LATEST_SCHEMA:
            raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
        db = self._db()
        current = self.schema_version()
        if current > target_version:
            raise PersistenceError("DATABASE_VERSION_UNSUPPORTED")
        self._preflight_upgrade(current, target_version)
        for migration in MIGRATIONS[current:target_version]:
            try:
                db.execute("BEGIN IMMEDIATE")
                for statement in _statements(migration.sql):
                    db.execute(statement)
                db.execute(
                    "INSERT INTO schema_migrations(version,applied_at,checksum) "
                    "VALUES (?,strftime('%Y-%m-%dT%H:%M:%fZ','now'),?)",
                    (migration.version, migration.checksum),
                )
                db.execute(f"PRAGMA user_version = {migration.version}")
                db.execute("COMMIT")
            except (sqlite3.DatabaseError, PersistenceError) as error:
                if db.in_transaction:
                    db.execute("ROLLBACK")
                raise self._latch(error, "DATABASE_MIGRATION_FAILED") from error
        return self.schema_version()

    @contextmanager
    def transaction(self) -> Iterator[PersistenceSession]:
        self._writable()
        db = self._db()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield PersistenceSession(db)
            db.execute("COMMIT")
        except Exception as error:
            if db.in_transaction:
                db.execute("ROLLBACK")
            if isinstance(error, sqlite3.DatabaseError):
                extended = getattr(error, "sqlite_errorcode", None)
                code = extended & 0xFF if isinstance(extended, int) else None
                if code in (sqlite3.SQLITE_FULL, sqlite3.SQLITE_IOERR,
                            sqlite3.SQLITE_READONLY, sqlite3.SQLITE_CORRUPT,
                            sqlite3.SQLITE_NOTADB):
                    raise self._latch(error, "DATABASE_IO_ERROR") from error
                if code in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
                    raise _map_error(error, "DATABASE_BUSY") from error
            raise

    def get_metadata(self, key: str) -> str | None:
        if not key or len(key) > 128:
            raise ValueError("Invalid metadata key")
        row = (
            self._db().execute("SELECT value FROM runtime_metadata WHERE key=?", (key,)).fetchone()
        )
        return str(row["value"]) if row else None

    def set_metadata(self, key: str, value: str) -> None:
        if not key or len(key) > 128:
            raise ValueError("Invalid metadata key")
        with self.transaction() as db:
            db.execute(
                "INSERT INTO runtime_metadata(key,value,updated_at) "
                "VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
                "ON CONFLICT(key) DO UPDATE SET "
                "value=excluded.value,updated_at=excluded.updated_at",
                (key, value),
            )

    def health(self) -> dict[str, Any]:
        try:
            if self._write_fault is not None:
                raise PersistenceError(self._write_fault)
            db = self._db()
            version = self.schema_version()
            if version < CURRENT_COMPATIBLE_SCHEMA:
                raise PersistenceError("DATABASE_MIGRATION_FAILED")
            journal = str(db.execute("PRAGMA journal_mode").fetchone()[0])
            return {
                "status": "ready",
                "schemaVersion": version,
                "sqliteVersion": str(db.execute("SELECT sqlite_version()").fetchone()[0]),
                "journalMode": "wal" if journal == "wal" else "unknown",
                "error": None,
            }
        except (sqlite3.DatabaseError, PersistenceError) as error:
            mapped = _map_error(error, "DATABASE_OPEN_FAILED")
            return {
                "status": "unavailable",
                "schemaVersion": None,
                "sqliteVersion": None,
                "journalMode": "unknown",
                "error": {
                    "code": mapped.code,
                    "message": "Forge storage unavailable",
                    "retryable": mapped.code == "DATABASE_BUSY",
                    "correlationId": "python-storage",
                },
            }

    def row(self, table: Literal["projects", "tasks", "runs"], key: str) -> dict[str, Any] | None:
        columns = {"projects": "project_id", "tasks": "task_id", "runs": "run_id"}
        if table not in columns:
            raise ValueError("Unknown persistence table")
        record = (
            self._db().execute(f"SELECT * FROM {table} WHERE {columns[table]}=?", (key,)).fetchone()
        )
        return dict(record) if record else None

    @staticmethod
    def _project(row: sqlite3.Row) -> Project:
        from forge.projects import Project

        return Project.model_validate_json(
            json.dumps(
                {
                    "projectId": row["project_id"],
                    "environmentId": row["environment_id"],
                    "name": row["name"],
                    "rootPath": row["canonical_path"],
                    "repositoryType": row["repository_type"],
                    "gitRoot": row["git_root"],
                    "defaultBranch": row["default_branch"],
                    "trusted": True,
                    "trustVersion": row["trust_version"],
                    "trustApprovedAt": row["trust_approved_at"],
                    "environmentSummaryHash": row["environment_summary_hash"],
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                    "lastOpenedAt": row["last_opened_at"],
                    "revision": row["revision"],
                    "archivedAt": row["archived_at"],
                    "probe": json.loads(row["probe_json"]),
                }
            )
        )

    def get_project(self, project_id: str, *, include_archived: bool = False) -> Project | None:
        sql = "SELECT * FROM projects WHERE project_id=?"
        if not include_archived:
            sql += " AND archived_at IS NULL"
        row = self._db().execute(sql, (project_id,)).fetchone()
        return self._project(row) if row else None

    def get_project_by_path(self, canonical_path: str) -> Project | None:
        row = (
            self._db()
            .execute("SELECT * FROM projects WHERE canonical_path=?", (canonical_path,))
            .fetchone()
        )
        return self._project(row) if row else None

    def list_projects(self) -> list[Project]:
        rows = self._db().execute(
            "SELECT * FROM projects WHERE archived_at IS NULL "
            "ORDER BY last_opened_at DESC, created_at DESC"
        )
        return [self._project(row) for row in rows]

    @staticmethod
    def _set_metadata(db: PersistenceSession, key: str, value: str) -> None:
        db.execute(
            "INSERT INTO runtime_metadata(key,value,updated_at) "
            "VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) "
            "ON CONFLICT(key) DO UPDATE SET "
            "value=excluded.value,updated_at=excluded.updated_at",
            (key, value),
        )

    def create_project(self, project: Project) -> Project:
        value = project.model_dump(mode="json")
        with self.transaction() as db:
            db.execute(
                "INSERT INTO projects(project_id,environment_id,name,canonical_path,"
                "repository_type,git_root,default_branch,trust_version,trust_approved_at,"
                "environment_summary_hash,probe_json,created_at,updated_at,last_opened_at,"
                "revision,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    value["projectId"],
                    value["environmentId"],
                    value["name"],
                    value["rootPath"],
                    value["repositoryType"],
                    value["gitRoot"],
                    value["defaultBranch"],
                    value["trustVersion"],
                    value["trustApprovedAt"],
                    value["environmentSummaryHash"],
                    json.dumps(value["probe"], ensure_ascii=False),
                    value["createdAt"],
                    value["updatedAt"],
                    value["lastOpenedAt"],
                    1,
                    None,
                ),
            )
            db.execute(
                "INSERT INTO project_trust_decisions(project_id,trust_version,approved_at,"
                "environment_summary_hash,actor) VALUES(?,?,?,?,'local-user')",
                (
                    value["projectId"],
                    value["trustVersion"],
                    value["trustApprovedAt"],
                    value["environmentSummaryHash"],
                ),
            )
            db.execute(
                "INSERT INTO environments(environment_id,project_id,name,config_json,revision,"
                "created_at,updated_at) VALUES(?,?,?, ?,1,?,?)",
                (
                    value["environmentId"],
                    value["projectId"],
                    "Default",
                    '{"commandPresetIds":[],"envRefs":[],"networkMode":"trusted-local"}',
                    value["createdAt"],
                    value["updatedAt"],
                ),
            )
            db.execute(
                "INSERT INTO board_state(project_id,revision) VALUES (?,0)", (value["projectId"],)
            )
            self._set_metadata(db, "project.active_id", value["projectId"])
        return project

    def active_project(self) -> Project | None:
        project_id = self.get_metadata("project.active_id")
        return self.get_project(project_id) if project_id else None

    def set_active_project(
        self, project_id: str, expected_revision: int, now: str
    ) -> Project | None:
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET last_opened_at=?, updated_at=?, "
                "revision=revision+1 WHERE project_id=? AND revision=? AND archived_at IS NULL",
                (now, now, project_id, expected_revision),
            ).rowcount
            if not changed:
                if self.get_project(project_id) is None:
                    return None
                raise PersistenceError("REVISION_CONFLICT")
            self._set_metadata(db, "project.active_id", project_id)
        return self.get_project(project_id)

    def update_project(
        self,
        project_id: str,
        expected_revision: int,
        name: str | None,
        default_branch: str | None,
        now: str,
    ) -> Project | None:
        before = self.get_project(project_id)
        if before is None:
            return None
        if before.revision != expected_revision:
            raise PersistenceError("REVISION_CONFLICT")
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET name=?,default_branch=?,updated_at=?,"
                "revision=revision+1 WHERE project_id=? AND revision=? AND archived_at IS NULL",
                (
                    name if name is not None else before.name,
                    default_branch,
                    now,
                    project_id,
                    expected_revision,
                ),
            ).rowcount
            if not changed:
                raise PersistenceError("REVISION_CONFLICT")
        return self.get_project(project_id)

    def remove_project(self, project_id: str, expected_revision: int, now: str) -> bool:
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET archived_at=?,updated_at=?,revision=revision+1 "
                "WHERE project_id=? AND revision=? AND archived_at IS NULL",
                (now, now, project_id, expected_revision),
            ).rowcount
            if not changed:
                if self.get_project(project_id) is None:
                    return False
                raise PersistenceError("REVISION_CONFLICT")
            db.execute(
                "DELETE FROM runtime_metadata WHERE key='project.active_id' AND value=?",
                (project_id,),
            )
        return True

    def restore_project(
        self, project_id: str, expected_revision: int, probe: ProjectProbe
    ) -> Project:
        from forge.projects import timestamp

        now = timestamp()
        with self.transaction() as db:
            changed = db.execute(
                "UPDATE projects SET archived_at=NULL,revision=revision+1,"
                "trust_approved_at=?,environment_summary_hash=?,probe_json=?,"
                "updated_at=?,last_opened_at=? "
                "WHERE project_id=? AND revision=? AND archived_at IS NOT NULL",
                (
                    now,
                    probe.fingerprint,
                    probe.model_dump_json(),
                    now,
                    now,
                    project_id,
                    expected_revision,
                ),
            ).rowcount
            if not changed:
                raise PersistenceError("REVISION_CONFLICT")
            db.execute(
                "UPDATE project_trust_decisions SET approved_at=?,environment_summary_hash=? "
                "WHERE project_id=?",
                (now, probe.fingerprint, project_id),
            )
            self._set_metadata(db, "project.active_id", project_id)
        saved = self.get_project(project_id)
        if saved is None:
            raise PersistenceError("PROJECT_NOT_FOUND")
        return saved
