"""Real SQLite migration, durability, rollback and safety checks in isolated dirs."""

import sqlite3
from pathlib import Path

import pytest

import forge.persistence as persistence_module
from forge.persistence import (
    CURRENT_COMPATIBLE_SCHEMA,
    LATEST_SCHEMA,
    ForgePersistence,
    Migration,
    PersistenceError,
    resolve_data_dir,
)


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
    assert restored.migrate(LATEST_SCHEMA) == 24
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
    assert upgraded.migrate(LATEST_SCHEMA) == 24
    assert upgraded.migrate(LATEST_SCHEMA) == 24
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
    assert upgraded.migrate(LATEST_SCHEMA) == 24
    assert upgraded.migrate(LATEST_SCHEMA) == 24
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
