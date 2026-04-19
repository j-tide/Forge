"""Inspect an exported Forge SQLite backup and stage an independent data profile.

This module never replaces the active database. Electron owns the native picker and
Host lifecycle; this bounded Python process owns SQLite validation and copying.
"""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
from contextlib import closing
from dataclasses import asdict, dataclass
from pathlib import Path
from uuid import UUID

from forge.persistence import LATEST_SCHEMA, ForgePersistence, PersistenceError

_MAX_BYTES = 4 * 1024 * 1024 * 1024
_TABLES = ("projects", "tasks", "runs")


class RestoreError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class RestorePreview:
    schemaVersion: int
    projectCount: int
    taskCount: int
    runCount: int
    sizeBytes: int


@dataclass(frozen=True)
class RestoredProfile:
    profileId: str
    schemaVersion: int
    sizeBytes: int


def _candidate(path: Path) -> tuple[Path, int]:
    if not path.is_absolute() or path.is_symlink():
        raise RestoreError("RESTORE_SOURCE_INVALID")
    try:
        info = path.stat()
        if not path.is_file() or not 100 <= info.st_size <= _MAX_BYTES:
            raise RestoreError("RESTORE_SOURCE_INVALID")
        # An exported backup is self-contained. Refuse a source whose WAL may be
        # changing under another process instead of importing an ambiguous state.
        if any(path.with_name(path.name + suffix).exists() for suffix in ("-wal", "-shm")):
            raise RestoreError("RESTORE_SOURCE_BUSY")
        with path.open("rb") as stream:
            if stream.read(16) != b"SQLite format 3\x00":
                raise RestoreError("RESTORE_SOURCE_INVALID")
        return path.resolve(strict=True), info.st_size
    except OSError as error:
        raise RestoreError("RESTORE_SOURCE_INVALID") from error


def inspect_backup(path: Path) -> RestorePreview:
    source, size = _candidate(path)
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro&immutable=1", uri=True,
                                     timeout=5)) as db:
            if db.execute("PRAGMA quick_check").fetchone() != ("ok",):
                raise RestoreError("RESTORE_SOURCE_CORRUPT")
            if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise RestoreError("RESTORE_SOURCE_CORRUPT")
            version = int(db.execute("PRAGMA user_version").fetchone()[0])
            if version < 1 or version > LATEST_SCHEMA:
                raise RestoreError("RESTORE_SCHEMA_UNSUPPORTED")
            tables = {str(row[0]) for row in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )}
            if "schema_migrations" not in tables:
                raise RestoreError("RESTORE_SOURCE_INVALID")
            counts = {name: int(db.execute(f"SELECT count(*) FROM {name}").fetchone()[0])
                      if name in tables else 0 for name in _TABLES}
            return RestorePreview(version, counts["projects"], counts["tasks"],
                                  counts["runs"], size)
    except sqlite3.DatabaseError as error:
        raise RestoreError("RESTORE_SOURCE_CORRUPT") from error


def stage_backup(source: Path, profiles_root: Path, profile_id: str) -> RestoredProfile:
    """Copy through SQLite's backup API, migrate a new profile, preserve source."""
    preview = inspect_backup(source)
    try:
        parsed_id = UUID(profile_id)
        if str(parsed_id) != profile_id or not profiles_root.is_absolute():
            raise ValueError("unsafe profile id or root")
    except ValueError as error:
        raise RestoreError("RESTORE_TARGET_INVALID") from error
    if profiles_root.is_symlink():
        raise RestoreError("RESTORE_TARGET_INVALID")
    try:
        profiles_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if profiles_root.is_symlink():
            raise RestoreError("RESTORE_TARGET_INVALID")
        root = profiles_root.resolve(strict=True)
        stage = root / f".{profile_id}.staging"
        final = root / profile_id
        if stage.exists() or stage.is_symlink() or final.exists() or final.is_symlink():
            raise RestoreError("RESTORE_TARGET_EXISTS")
        stage.mkdir(mode=0o700)
        try:
            target = stage / "forge.sqlite"
            canonical_source, _ = _candidate(source)
            before = canonical_source.stat()
            with closing(sqlite3.connect(canonical_source.as_uri() + "?mode=ro&immutable=1",
                                         uri=True, timeout=5)) as incoming:
                with closing(sqlite3.connect(target)) as copied:
                    incoming.backup(copied)
            after = canonical_source.stat()
            if (before.st_ino, before.st_size, before.st_mtime_ns) != (
                after.st_ino, after.st_size, after.st_mtime_ns
            ):
                raise RestoreError("RESTORE_SOURCE_CHANGED")
            if os.name != "nt":
                target.chmod(0o600)
            restored = ForgePersistence(stage)
            restored.open()
            try:
                if restored.schema_version() != preview.schemaVersion:
                    raise RestoreError("RESTORE_SOURCE_CHANGED")
                restored.migrate(LATEST_SCHEMA)
                # A backup is data, not a transferable local trust or device grant.
                # Keep project/task history visible, but require a fresh native
                # folder selection, probe, and trust approval before code can run.
                with restored.transaction() as db:
                    db.execute(
                        "UPDATE projects SET trust_version='project-trust/restored-pending',"
                        "revision=revision+1"
                    )
                    db.execute(
                        "UPDATE paired_devices SET status='revoked',"
                        "revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                        "WHERE status='approved'"
                    )
                    db.execute(
                        "UPDATE device_sessions SET revoked_at="
                        "strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL"
                    )
                    db.execute(
                        "UPDATE pairing_requests SET status='expired' "
                        "WHERE status IN ('pending','claimed')"
                    )
                quick = restored.session().execute("PRAGMA quick_check").fetchone()
                if (restored.schema_version() != LATEST_SCHEMA or quick is None
                        or quick[0] != "ok" or restored.session().execute(
                            "PRAGMA foreign_key_check"
                        ).fetchone() is not None):
                    raise RestoreError("RESTORE_SOURCE_CORRUPT")
            finally:
                restored.close()
            with target.open("rb") as stream:
                os.fsync(stream.fileno())
            stage.replace(final)
            if os.name != "nt":
                fd = os.open(root, os.O_RDONLY)
                try:
                    os.fsync(fd)
                finally:
                    os.close(fd)
            return RestoredProfile(profile_id, LATEST_SCHEMA,
                                   (final / "forge.sqlite").stat().st_size)
        except (OSError, sqlite3.DatabaseError, PersistenceError) as error:
            raise RestoreError("RESTORE_STAGE_FAILED") from error
        finally:
            if stage.is_dir() and not stage.is_symlink() and stage.parent == root:
                shutil.rmtree(stage)
    except RestoreError:
        raise
    except OSError as error:
        raise RestoreError("RESTORE_STAGE_FAILED") from error


def main(argv: list[str]) -> int:
    try:
        result: RestorePreview | RestoredProfile
        if len(argv) == 3 and argv[1] == "inspect":
            result = inspect_backup(Path(argv[2]))
        elif len(argv) == 5 and argv[1] == "stage":
            result = stage_backup(Path(argv[2]), Path(argv[3]), argv[4])
        else:
            raise RestoreError("RESTORE_REQUEST_INVALID")
        print(json.dumps(asdict(result), separators=(",", ":")))
        return 0
    except RestoreError as error:
        print(error.code, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
