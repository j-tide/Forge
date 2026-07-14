"""Real SQLite migration, durability, rollback and safety checks in isolated dirs."""

import sqlite3
from pathlib import Path
from uuid import uuid4

import pytest
from test_agent_profiles import profile
from test_workflow_versioning import approved_task, selection

import forge.persistence as persistence_module
from forge.agent_profiles import AgentProfileService, ProfileSave
from forge.board import BoardService
from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.persistence import (
    CURRENT_COMPATIBLE_SCHEMA,
    LATEST_SCHEMA,
    ForgePersistence,
    Migration,
    PersistenceError,
    resolve_data_dir,
)
from forge.run_config import RunConfigService, VersionLock
from forge.runs import RunService, RunStartIntent


def test_path_requires_absolute_override(tmp_path: Path) -> None:
    assert resolve_data_dir(environment="test", override=str(tmp_path)) == tmp_path
    with pytest.raises(ValueError, match="absolute"):
        resolve_data_dir(environment="test", override="../project")


def test_legacy_migrations_restart_and_safe_python_upgrade(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    assert db.schema_version() == 0
    assert db.migrate(1) == 1
    assert db.migrate(2) == 2
    db.set_metadata("migration.test", "value-preserved")
    assert db.migrate(CURRENT_COMPATIBLE_SCHEMA) == 15
    assert db.health()["status"] == "ready"
    db.close()

    restored = ForgePersistence(tmp_path)
    restored.open()
    assert restored.get_metadata("migration.test") == "value-preserved"
    assert restored.migrate(CURRENT_COMPATIBLE_SCHEMA) == 15
    assert restored.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert restored.get_metadata("migration.test") == "value-preserved"
    migration_count = restored._db().execute(
        "SELECT count(*) FROM schema_migrations"
    ).fetchone()[0]
    assert migration_count == LATEST_SCHEMA
    restored.close()


def test_acceptance_schema_upgrades_additively_to_rework(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    assert db.migrate(19) == 19
    db.set_metadata("schema19.preserved", "yes")
    db.close()
    upgraded = ForgePersistence(tmp_path)
    upgraded.open()
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert upgraded.get_metadata("schema19.preserved") == "yes"
    assert upgraded.session().execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='acceptance_decisions'"
    ).fetchone() is not None
    assert upgraded.session().execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rework_cycles'"
    ).fetchone() is not None
    upgraded.close()


def test_delivery_schema_upgrades_from_final_acceptance_without_data_reset(
    tmp_path: Path,
) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    assert db.migrate(21) == 21
    db.set_metadata("schema21.preserved", "still-here")
    db.close()
    upgraded = ForgePersistence(tmp_path)
    upgraded.open()
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert upgraded.get_metadata("schema21.preserved") == "still-here"
    assert upgraded.session().execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='delivery_records'"
    ).fetchone() is not None
    assert upgraded.session().execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='merge_operations'"
    ).fetchone() is not None
    assert upgraded.session().execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='task_change_requests'"
    ).fetchone() is not None
    upgraded.close()


def test_populated_p3_p4_database_upgrades_without_losing_task_run_or_profile(
    tmp_path: Path,
) -> None:
    source = tmp_path / "old project"
    source.mkdir()
    data = tmp_path / "existing-data"
    old = ForgePersistence(data)
    old.open()
    assert old.migrate(25) == 25
    project, task, environment = approved_task(old, source, "standard")
    saved_profile = profile()
    AgentProfileService(old).save(ProfileSave(profile=saved_profile, expectedRevision=0))
    configs = RunConfigService(old, EnvironmentService(old))
    config = configs.create(selection(project, task, environment, VersionLock(
        id="standard", version="1", contentHash="a" * 64,
    )))
    attempt = uuid4()
    RunService(old, configs).begin(RunStartIntent(
        runId=config.runId, projectId=project.projectId, taskId=task.draftId,
        attemptId=attempt, workspaceId=uuid4(), workspaceLeaseId=uuid4(),
        leaseEpoch=1, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=config.snapshotHash,
        createdAt=timestamp(),
    ))
    old.close()

    upgraded = ForgePersistence(data)
    upgraded.open()
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    detail = BoardService(upgraded).detail(str(project.projectId), str(task.draftId))
    assert detail.detail.contract.title == "Version freeze"
    assert AgentProfileService(upgraded).get(saved_profile.id, 1) == saved_profile
    assert RunConfigService(upgraded, EnvironmentService(upgraded)).get(
        project.projectId, config.runId) == config
    restored_run = RunService(upgraded, RunConfigService(
        upgraded, EnvironmentService(upgraded))).get(project.projectId, config.runId)
    assert restored_run is not None and restored_run.attempt.attemptId == attempt
    assert upgraded.session().execute("PRAGMA foreign_key_check").fetchone() is None
    backup = upgraded.backup()
    assert backup.exists()
    upgraded.close()


def test_transaction_rolls_back_and_read_only_never_writes(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate()
    with pytest.raises(RuntimeError, match="abort"):
        with db.transaction() as connection:
            connection.execute(
                "INSERT INTO runtime_metadata(key,value,updated_at) VALUES('half','1','now')"
            )
            raise RuntimeError("abort")
    assert db.get_metadata("half") is None
    db.set_metadata("durable", "yes")
    db.close()

    reader = ForgePersistence(tmp_path, read_only=True)
    reader.open()
    assert reader.get_metadata("durable") == "yes"
    assert reader.schema_version() == 15
    with pytest.raises(PersistenceError, match="DATABASE_IO_ERROR"):
        reader.set_metadata("no-write", "value")
    reader.close()


def test_future_version_and_checksum_mismatch_rejected(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate()
    db.close()
    native = sqlite3.connect(tmp_path / "forge.sqlite")
    native.execute("UPDATE schema_migrations SET checksum='wrong' WHERE version=1")
    native.commit()
    native.close()
    db.open()
    with pytest.raises(PersistenceError, match="DATABASE_MIGRATION_FAILED"):
        db.schema_version()
    db.close()

    native = sqlite3.connect(tmp_path / "forge.sqlite")
    native.execute("PRAGMA user_version = 999")
    native.commit()
    native.close()
    db.open()
    with pytest.raises(PersistenceError, match="DATABASE_VERSION_UNSUPPORTED"):
        db.schema_version()
    db.close()


def test_invalid_database_reports_corrupt_without_path(tmp_path: Path) -> None:
    (tmp_path / "forge.sqlite").write_bytes(b"not sqlite")
    db = ForgePersistence(tmp_path)
    with pytest.raises(PersistenceError, match="DATABASE_CORRUPT") as caught:
        db.open()
    assert str(tmp_path) not in str(caught.value)


def test_failed_migration_is_rolled_back(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate()
    corrupted = (
        *persistence_module.MIGRATIONS[:15],
        Migration(16, "CREATE TABLE half_done(id TEXT);\nINVALID SQL;", "test-checksum"),
    )
    monkeypatch.setattr(persistence_module, "MIGRATIONS", corrupted)
    with pytest.raises(PersistenceError, match="DATABASE_MIGRATION_FAILED"):
        db.migrate(16)
    assert db.schema_version() == 15
    assert db._db().execute("SELECT 1 FROM sqlite_master WHERE name='half_done'").fetchone() is None
    db.close()


def test_final_acceptance_migration_adds_only_new_table(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    assert db.migrate(20) == 20
    db.set_metadata("migration.final-acceptance", "old-data-preserved")
    assert db.migrate(21) == 21
    assert db.migrate(21) == 21
    assert db.get_metadata("migration.final-acceptance") == "old-data-preserved"
    table = db.session().execute(
        "SELECT sql FROM sqlite_master WHERE type='table' "
        "AND name='final_acceptance_decisions'",
    ).fetchone()
    assert table is not None and "next_run_id" in table["sql"]
    db.close()
