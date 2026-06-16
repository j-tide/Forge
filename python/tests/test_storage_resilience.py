"""Real WAL backup, crash rollback, artifact containment and scoped storage."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
import test_verifier_project as fixture_module
from test_delivery import accepted_fixture
from test_verifier_project import git

import forge.persistence as persistence_module
from forge.artifacts import ArtifactError, ArtifactStore
from forge.persistence import ForgePersistence, Migration, PersistenceError
from forge.plugin_storage import PluginStorage, PluginStorageError
from forge.protocol import HOST_PROTOCOL_VERSION, TRANSPORT_VERSION


@pytest.mark.asyncio
async def test_wal_backup_restores_approved_task_and_imported_artifact(tmp_path: Path) -> None:
    source, head, storage, project_id, task_id, _ = await accepted_fixture(tmp_path)
    job = storage.session().execute(
        "SELECT verification_id FROM verifier_jobs WHERE task_id=?", (str(task_id),)
    ).fetchone()
    assert job is not None
    verification_id = UUID(job["verification_id"])
    artifact_root = tmp_path / "data" / "verifier-workspaces" / str(verification_id)
    artifact_root.mkdir(parents=True, exist_ok=True)
    artifact_root.joinpath("report.json").write_text('{"result":"passed"}')
    store = ArtifactStore(storage)
    item = store.import_file(project_id, verification_id, "report.json", kind="test-report",
                             mime="application/json")
    storage.set_metadata("wal.committed", "latest")
    assert storage.session().execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    backup = storage.backup()
    assert backup.is_file() and backup.parent == tmp_path / "data" / "backups"
    restore_dir = tmp_path / "restored"
    restore_dir.mkdir()
    shutil.copy2(backup, restore_dir / "forge.sqlite")
    restored = ForgePersistence(restore_dir)
    restored.open()
    assert restored.schema_version() == 24
    assert restored.get_metadata("wal.committed") == "latest"
    assert restored.session().execute(
        "SELECT current_revision FROM tasks WHERE task_id=?", (str(task_id),)
    ).fetchone()[0] == 2
    assert ArtifactStore(restored).read(project_id, item.artifactId) == b'{"result":"passed"}'
    assert restored.session().execute("PRAGMA foreign_key_check").fetchone() is None
    restored.close()
    assert git(source, "rev-parse", "HEAD") == head
    assert git(source, "status", "--porcelain") == ""
    storage.close()


@pytest.mark.asyncio
async def test_crash_mid_approval_task_event_transaction_has_no_half_commit(
    tmp_path: Path,
) -> None:
    _, _, storage, _, task_id, _ = await accepted_fixture(tmp_path)
    approval = storage.session().execute(
        "SELECT approval_id,status FROM task_approvals WHERE task_id=?", (str(task_id),)
    ).fetchone()
    run = storage.session().execute(
        "SELECT run_id FROM runs WHERE task_id=?", (str(task_id),)
    ).fetchone()
    assert approval is not None and approval["status"] == "approved" and run is not None
    original_revision = storage.session().execute(
        "SELECT current_revision FROM tasks WHERE task_id=?", (str(task_id),)
    ).fetchone()[0]
    original_events = storage.session().execute(
        "SELECT count(*) FROM run_events WHERE run_id=?", (run["run_id"],)
    ).fetchone()[0]
    storage.close()
    script = """import os, sqlite3, sys
db=sqlite3.connect(sys.argv[1],isolation_level=None)
db.execute('PRAGMA foreign_keys=ON')
db.execute('BEGIN IMMEDIATE')
db.execute("UPDATE task_approvals SET status='rejected' WHERE approval_id=?",(sys.argv[2],))
db.execute('UPDATE tasks SET current_revision=999 WHERE task_id=?',(sys.argv[3],))
db.execute("INSERT INTO run_events(run_id,type,detail_json,created_at) "
           "VALUES(?,'run.failed','{}','now')",(sys.argv[4],))
os._exit(71)
"""
    crashed = subprocess.run(
        [sys.executable, "-c", script, str(tmp_path / "data" / "forge.sqlite"),
         approval["approval_id"], str(task_id), run["run_id"]],
        check=False, capture_output=True, timeout=10,
    )
    assert crashed.returncode == 71
    restored = ForgePersistence(tmp_path / "data")
    restored.open()
    assert restored.schema_version() == 24
    assert restored.session().execute(
        "SELECT status FROM task_approvals WHERE approval_id=?",
        (approval["approval_id"],),
    ).fetchone()[0] == "approved"
    assert restored.session().execute(
        "SELECT current_revision FROM tasks WHERE task_id=?", (str(task_id),)
    ).fetchone()[0] == original_revision
    assert restored.session().execute(
        "SELECT count(*) FROM run_events WHERE run_id=?", (run["run_id"],)
    ).fetchone()[0] == original_events
    restored.close()


def test_failed_upgrade_keeps_backup_and_degrades_to_read_only_diagnostics(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    assert db.migrate(24) == 24
    db.set_metadata("before.failed.upgrade", "preserved")
    bad = Migration(25, "CREATE TABLE half_upgrade(id TEXT);\nINVALID SQL;", "fixture")
    monkeypatch.setattr(persistence_module, "MIGRATIONS", (*persistence_module.MIGRATIONS, bad))
    monkeypatch.setattr(persistence_module, "LATEST_SCHEMA", 25)
    with pytest.raises(PersistenceError, match="DATABASE_MIGRATION_FAILED"):
        db.migrate(25)
    assert db.health()["status"] == "unavailable"
    assert db.health()["error"]["code"] == "DATABASE_MIGRATION_FAILED"
    assert db.schema_version() == 24
    assert db.get_metadata("before.failed.upgrade") == "preserved"
    assert db.session().execute(
        "SELECT name FROM sqlite_master WHERE name='half_upgrade'"
    ).fetchone() is None
    with pytest.raises(PersistenceError, match="DATABASE_MIGRATION_FAILED"):
        db.set_metadata("must.not.write", "blocked")
    assert db.last_backup is not None and db.last_backup.is_file()
    original = db.last_backup
    db.close()
    monkeypatch.undo()
    restored_dir = tmp_path / "backup-recovery"
    restored_dir.mkdir()
    shutil.copy2(original, restored_dir / "forge.sqlite")
    recovered = ForgePersistence(restored_dir)
    recovered.open()
    assert recovered.schema_version() == 24
    assert recovered.get_metadata("before.failed.upgrade") == "preserved"
    recovered.close()


def test_real_upgrade_preserves_pre_migration_snapshot_and_low_space_blocks(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    data = tmp_path / "upgrade"
    db = ForgePersistence(data)
    db.open()
    db.migrate(23)
    db.set_metadata("older.schema", "must-survive")
    assert db.migrate(24) == 24
    assert db.last_backup is not None
    saved = ForgePersistence(tmp_path / "saved")
    saved.data_dir.mkdir()
    shutil.copy2(db.last_backup, saved.db_path)
    saved.open()
    assert saved.schema_version() == 23
    assert saved.get_metadata("older.schema") == "must-survive"
    saved.close()
    db.close()

    limited = ForgePersistence(tmp_path / "limited")
    limited.open()
    limited.migrate(23)
    limited.set_metadata("before.low.space", "retained")
    monkeypatch.setattr(persistence_module.shutil, "disk_usage",
                        lambda _path: SimpleNamespace(free=0))
    with pytest.raises(PersistenceError, match="DATABASE_DISK_FULL"):
        limited.migrate(24)
    assert limited.schema_version() == 23
    assert limited.get_metadata("before.low.space") == "retained"
    assert limited.health()["error"]["code"] == "DATABASE_DISK_FULL"
    limited.close()


@pytest.mark.asyncio
async def test_real_host_upgrades_approved_task_with_pre_migration_backup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(fixture_module, "LATEST_SCHEMA", 23)
    _, _, db, project_id, task_id, _ = await accepted_fixture(tmp_path)
    assert db.schema_version() == 23
    db.close()
    host = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data"),
             "FORGE_HOST_OWNERSHIP_TOKEN": "backup-upgrade-fixture"},
    )
    assert host.stdin is not None and host.stdout is not None

    async def call(method: str, params: dict[str, object]) -> dict:
        request_id = str(uuid4())
        host.stdin.write(json.dumps({"jsonrpc": "2.0", "id": request_id,
            "method": method, "params": params,
            "transportVersion": TRANSPORT_VERSION}).encode() + b"\n")
        await host.stdin.drain()
        reply = json.loads(await asyncio.wait_for(host.stdout.readline(), 10))
        assert reply["id"] == request_id
        return reply

    try:
        handshake = await call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": HOST_PROTOCOL_VERSION,
            "ownershipToken": "backup-upgrade-fixture",
        })
        assert handshake["result"]["status"] == "ready"
        health = await call("system.health", {})
        assert health["result"]["storage"]["schemaVersion"] == 24
        detail = await call("task.detail", {
            "projectId": str(project_id), "taskId": str(task_id),
        })
        assert detail["result"]["data"]["detail"]["contract"]["revision"] == 2
        assert (await call("system.shutdown", {}))["result"]["status"] == "stopping"
        assert await asyncio.wait_for(host.wait(), 5) == 0
    finally:
        if host.returncode is None:
            host.kill()
            await host.wait()
    backups = list((tmp_path / "data" / "backups").glob("forge-v23-*.sqlite"))
    assert len(backups) == 1
    older_dir = tmp_path / "restored-before-host-upgrade"
    older_dir.mkdir()
    shutil.copy2(backups[0], older_dir / "forge.sqlite")
    older = ForgePersistence(older_dir)
    older.open()
    assert older.schema_version() == 23
    assert older.session().execute(
        "SELECT current_revision FROM tasks WHERE task_id=?", (str(task_id),)
    ).fetchone()[0] == 2
    older.close()


def test_sqlite_full_rollback_blocks_success_and_reports_diagnostic(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(24)
    before = db._db().execute("PRAGMA page_count").fetchone()[0]
    db._db().execute(f"PRAGMA max_page_count={before + 1}")
    with pytest.raises(PersistenceError, match="DATABASE_DISK_FULL"):
        db.set_metadata("large", "x" * 2_000_000)
    assert db.get_metadata("large") is None
    assert db.health()["status"] == "unavailable"
    assert db.health()["error"]["code"] == "DATABASE_DISK_FULL"
    with pytest.raises(PersistenceError, match="DATABASE_DISK_FULL"):
        db.set_metadata("small", "also-blocked")
    db.close()


@pytest.mark.asyncio
async def test_artifact_import_confined_to_owned_root_and_mime(tmp_path: Path) -> None:
    _, _, db, project_id, task_id, _ = await accepted_fixture(tmp_path)
    job = db.session().execute(
        "SELECT verification_id FROM verifier_jobs WHERE task_id=?", (str(task_id),)
    ).fetchone()
    assert job is not None
    verification_id = UUID(job["verification_id"])
    root = tmp_path / "data" / "verifier-workspaces"
    owned = root / str(verification_id)
    owned.mkdir(parents=True, exist_ok=True)
    owned.joinpath("report.txt").write_text("real report\n")
    owned.joinpath("bad.js").write_text("alert(1)\n")
    outside = tmp_path / "private.txt"
    outside.write_text("private")
    (owned / "escape.txt").symlink_to(outside)
    store = ArtifactStore(db)
    item = store.import_file(project_id, verification_id, "report.txt",
                             kind="log", mime="text/plain")
    assert store.read(project_id, item.artifactId) == b"real report\n"
    for path in ("../private.txt", str(outside), "escape.txt", "../../private.txt"):
        with pytest.raises(ArtifactError, match="ARTIFACT_PATH_INVALID"):
            store.import_file(project_id, verification_id, path,
                              kind="log", mime="text/plain")
    with pytest.raises(ArtifactError, match="ARTIFACT_MIME_INVALID"):
        store.import_file(project_id, verification_id, "bad.js",
                          kind="report", mime="text/plain")
    with pytest.raises(ArtifactError, match="ARTIFACT_OWNER_INVALID"):
        store.import_file(project_id, uuid4(), "report.txt", kind="log", mime="text/plain")
    with pytest.raises(ArtifactError, match="ARTIFACT_NOT_FOUND"):
        store.read(uuid4(), item.artifactId)
    db.close()


def test_plugin_storage_is_namespaced_and_has_no_sql_surface(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(24)
    alpha = PluginStorage(db, "forge.alpha")
    beta = PluginStorage(db, "forge.beta")
    alpha.put("state", {"enabled": True})
    beta.put("state", {"enabled": False})
    assert alpha.get("state") == {"enabled": True}
    assert beta.get("state") == {"enabled": False}
    assert alpha.get("projects") is None
    assert not hasattr(alpha, "execute")
    with pytest.raises(PluginStorageError, match="PLUGIN_STORAGE_KEY_INVALID"):
        alpha.get("../projects")
    with pytest.raises(PluginStorageError, match="PLUGIN_STORAGE_VALUE_INVALID"):
        alpha.put("invalid", float("nan"))
    db.close()
