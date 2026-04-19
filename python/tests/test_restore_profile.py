"""Restore staging uses actual SQLite files but never replaces an active profile."""

import json
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path
from uuid import uuid4

import pytest

from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectError, ProjectService
from forge.restore_profile import RestoreError, inspect_backup, stage_backup


def backup_fixture(tmp_path: Path, *, schema: int = LATEST_SCHEMA) -> tuple[Path, Path]:
    active = tmp_path / "original data"
    storage = ForgePersistence(active)
    storage.open()
    storage.migrate(schema)
    storage.set_metadata("restore.fixture", "original value")
    backup = storage.backup()
    storage.set_metadata("restore.fixture", "later active value")
    storage.close()
    return active, backup


def test_stages_real_backup_as_separate_migrated_profile(tmp_path: Path) -> None:
    active, source = backup_fixture(tmp_path, schema=LATEST_SCHEMA - 1)
    preview = inspect_backup(source)
    assert preview.schemaVersion == LATEST_SCHEMA - 1
    assert preview.sizeBytes > 100
    profile_id = str(uuid4())
    result = stage_backup(source, tmp_path / "restored data", profile_id)
    assert result.profileId == profile_id
    assert result.schemaVersion == LATEST_SCHEMA
    restored = ForgePersistence(tmp_path / "restored data" / profile_id)
    restored.open()
    assert restored.schema_version() == LATEST_SCHEMA
    assert restored.get_metadata("restore.fixture") == "original value"
    restored.close()
    original = ForgePersistence(active)
    original.open()
    assert original.get_metadata("restore.fixture") == "later active value"
    original.close()
    with pytest.raises(RestoreError, match="RESTORE_TARGET_EXISTS"):
        stage_backup(source, tmp_path / "restored data", profile_id)


def test_preview_counts_saved_tasks_from_real_schema(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "count source")
    storage.open()
    storage.migrate()
    now = "2026-09-26T00:00:00+00:00"
    project_id, conversation_id, message_id, draft_id, task_id = (str(uuid4()) for _ in range(5))
    with storage.transaction() as db:
        db.execute(
            "INSERT INTO projects(project_id,environment_id,name,canonical_path,"
            "repository_type,trust_version,trust_approved_at,environment_summary_hash,"
            "probe_json,created_at,updated_at,last_opened_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (project_id, "fixture", "Restore fixture", str(tmp_path / "repo"),
             "none", "project-trust/v1", now, "fixture", "{}", now, now, now),
        )
        db.execute(
            "INSERT INTO conversations(conversation_id,project_id,title,revision,"
            "created_at,updated_at) VALUES(?,?,?,1,?,?)",
            (conversation_id, project_id, "Fixture", now, now),
        )
        db.execute(
            "INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,"
            "status,created_at,updated_at) VALUES(?,?,1,'user','{}','completed',?,?)",
            (message_id, conversation_id, now, now),
        )
        db.execute(
            "INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,"
            "idempotency_key,revision,intent,status,editable_text,created_at,updated_at) "
            "VALUES(?,?,?,?,?,1,'new_task','proposed','Fixture',?,?)",
            (draft_id, project_id, conversation_id, message_id, "fixture", now, now),
        )
        db.execute(
            "INSERT INTO tasks(task_id,project_id,source_draft_id,current_revision,state,"
            "contract_json,approved_at,created_at,updated_at) "
            "VALUES(?,?,?,1,'todo','{}',?,?,?)",
            (task_id, project_id, draft_id, now, now, now),
        )
    backup = storage.backup()
    storage.close()
    preview = inspect_backup(backup)
    assert (preview.projectCount, preview.taskCount, preview.runCount) == (1, 1, 0)


def test_restored_project_requires_fresh_picker_probe_and_explicit_trust(tmp_path: Path) -> None:
    source = tmp_path / "Project with spaces"
    source.mkdir()
    (source / "package.json").write_text('{"name":"restore-fixture"}')
    active = ForgePersistence(tmp_path / "active")
    active.open()
    active.migrate(LATEST_SCHEMA)
    projects = ProjectService(active)
    found = projects.probe(str(source))
    saved = projects.create(str(source), found.fingerprint, TRUST_VERSION, True, 0)
    backup = active.backup()
    active.close()
    restored_id = str(uuid4())
    stage_backup(backup, tmp_path / "restored", restored_id)
    imported = ForgePersistence(tmp_path / "restored" / restored_id)
    imported.open()
    service = ProjectService(imported)
    pending = service.get(str(saved.projectId))
    assert pending is not None and not pending.trusted
    assert pending.trustVersion == "project-trust/restored-pending"
    assert pending.revision == saved.revision + 1
    with pytest.raises(ProjectError, match="trust must be renewed"):
        service.reprobe(str(saved.projectId))
    assert imported.active_project() and not imported.active_project().trusted
    fresh = service.probe(str(source))
    assert fresh.existingProject and fresh.existingProject.revision == pending.revision
    with pytest.raises(ProjectError, match="Explicit project trust"):
        service.create(str(source), fresh.fingerprint, TRUST_VERSION, False, pending.revision)
    confirmed = service.create(str(source), fresh.fingerprint, TRUST_VERSION, True,
                               pending.revision)
    assert confirmed.projectId == saved.projectId and confirmed.trusted
    assert confirmed.trustVersion == TRUST_VERSION
    imported.close()
    original = ForgePersistence(tmp_path / "active")
    original.open()
    assert original.get_project(str(saved.projectId)) and original.get_project(
        str(saved.projectId)
    ).trusted
    original.close()


def test_restored_profile_revokes_imported_device_sessions(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "active")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    pairing, device, session = (str(uuid4()) for _ in range(3))
    now = "2026-09-26T00:00:00+00:00"
    with storage.transaction() as db:
        db.execute(
            "INSERT INTO pairing_requests(pairing_id,nonce_hash,status,created_at,expires_at) "
            "VALUES(? ,?,'approved',?,?)",
            (pairing, "a" * 64, now, now),
        )
        db.execute(
            "INSERT INTO paired_devices(device_id,pairing_id,name,address_summary,"
            "fingerprint_summary,project_ids_json,status,approved_at) "
            "VALUES(?,?,?,?,?,'[]','approved',?)",
            (device, pairing, "Old phone", "old network", "old key", now),
        )
        db.execute(
            "INSERT INTO device_sessions(session_id,device_id,token_hash,csrf_hash,"
            "issued_at,expires_at,refresh_expires_at) VALUES(?,?,?,?,?,?,?)",
            (session, device, "b" * 64, "c" * 64, now, now, now),
        )
    backup = storage.backup()
    storage.close()
    restored_id = str(uuid4())
    stage_backup(backup, tmp_path / "restored", restored_id)
    imported = ForgePersistence(tmp_path / "restored" / restored_id)
    imported.open()
    db = imported.session()
    assert db.execute("SELECT status FROM paired_devices WHERE device_id=?",
                      (device,)).fetchone()[0] == "revoked"
    assert db.execute("SELECT revoked_at FROM device_sessions WHERE session_id=?",
                      (session,)).fetchone()[0] is not None
    imported.close()


def test_rejects_untrusted_or_ambiguous_source(tmp_path: Path) -> None:
    _, source = backup_fixture(tmp_path)
    linked = tmp_path / "backup link.sqlite"
    linked.symlink_to(source)
    with pytest.raises(RestoreError, match="RESTORE_SOURCE_INVALID"):
        inspect_backup(linked)
    invalid = tmp_path / "invalid.sqlite"
    invalid.write_bytes(b"not a database")
    with pytest.raises(RestoreError, match="RESTORE_SOURCE_INVALID"):
        inspect_backup(invalid)
    wal = source.with_name(source.name + "-wal")
    wal.write_bytes(b"pending")
    with pytest.raises(RestoreError, match="RESTORE_SOURCE_BUSY"):
        inspect_backup(source)
    wal.unlink()
    with closing(sqlite3.connect(source)) as db:
        db.execute(f"PRAGMA user_version={LATEST_SCHEMA + 1}")
    with pytest.raises(RestoreError, match="RESTORE_SCHEMA_UNSUPPORTED"):
        inspect_backup(source)


def test_target_identity_and_migration_failure_leave_source_intact(tmp_path: Path) -> None:
    active, source = backup_fixture(tmp_path)
    root = tmp_path / "profiles"
    with pytest.raises(RestoreError, match="RESTORE_TARGET_INVALID"):
        stage_backup(source, root, "../../outside")
    assert not root.exists()
    with closing(sqlite3.connect(source)) as db:
        with db:
            db.execute("UPDATE schema_migrations SET checksum='bad' WHERE version=1")
    with pytest.raises(RestoreError, match="RESTORE_STAGE_FAILED"):
        stage_backup(source, root, str(uuid4()))
    assert list(root.iterdir()) == []
    original = ForgePersistence(active)
    original.open()
    assert original.get_metadata("restore.fixture") == "later active value"
    original.close()


def test_restore_cli_reports_bounded_preview_without_path(tmp_path: Path) -> None:
    _, source = backup_fixture(tmp_path)
    result = subprocess.run([sys.executable, "-m", "forge.restore_profile", "inspect",
                             str(source)], capture_output=True, text=True, check=True)
    preview = json.loads(result.stdout)
    assert preview["schemaVersion"] == LATEST_SCHEMA
    assert str(source) not in result.stdout
    assert result.stderr == ""
