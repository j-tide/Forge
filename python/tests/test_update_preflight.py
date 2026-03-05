"""Real local release verification and non-destructive SQLite upgrade rehearsal."""

import base64
import hashlib
import json
import sqlite3
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

import forge.persistence as persistence_module
from forge.persistence import ForgePersistence, Migration
from forge.update_preflight import UpdateError, rehearse_migration, verify_release


def signed_fixture(tmp_path: Path, *, schema_from: int = 29, schema_to: int = 30):
    private = Ed25519PrivateKey.generate()
    public = private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    artifact = tmp_path / "Forge-0.0.2-INTERNAL.zip"
    artifact.write_bytes(b"disposable signed package fixture")
    manifest = {
        "schemaVersion": "forge-release/v1", "product": "Forge", "version": "0.0.2",
        "platform": "darwin", "arch": "arm64", "artifactName": artifact.name,
        "artifactSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "artifactBytes": artifact.stat().st_size, "schemaFrom": schema_from,
        "schemaTo": schema_to,
    }
    raw = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    signature = base64.b64encode(private.sign(raw)).decode()
    return raw, signature, public, artifact


def verify_fixture(tmp_path: Path):
    raw, signature, public, artifact = signed_fixture(tmp_path)
    return verify_release(raw, signature, public, artifact,
                          current_version="0.0.1", platform="darwin", arch="arm64")


def test_signed_release_integrity_and_platform_are_required(tmp_path: Path) -> None:
    raw, signature, public, artifact = signed_fixture(tmp_path)
    result = verify_release(raw, signature, public, artifact,
                            current_version="0.0.1", platform="darwin", arch="arm64")
    assert result.manifest.version == "0.0.2"
    assert result.manifest_sha256 == hashlib.sha256(raw).hexdigest()

    for changed_raw, changed_signature, changed_key, changed_platform, expected in (
        (raw + b" ", signature, public, "darwin", "UPDATE_SIGNATURE_INVALID"),
        (raw, signature[:-2] + "xx", public, "darwin", "UPDATE_SIGNATURE_INVALID"),
        (raw, signature, b"0" * 32, "darwin", "UPDATE_SIGNATURE_INVALID"),
        (raw, signature, public, "win32", "UPDATE_PLATFORM_MISMATCH"),
    ):
        with pytest.raises(UpdateError) as error:
            verify_release(changed_raw, changed_signature, changed_key, artifact,
                           current_version="0.0.1", platform=changed_platform, arch="arm64")
        assert error.value.code == expected
    with pytest.raises(UpdateError, match="UPDATE_VERSION_UNSUPPORTED"):
        verify_release(raw, signature, public, artifact,
                       current_version="0.0.2", platform="darwin", arch="arm64")
    with pytest.raises(UpdateError, match="UPDATE_VERSION_UNSUPPORTED"):
        verify_release(raw, signature, public, artifact,
                       current_version="unknown", platform="darwin", arch="arm64")
    artifact.write_bytes(b"tampered package")
    with pytest.raises(UpdateError, match="UPDATE_ARTIFACT_INVALID"):
        verify_release(raw, signature, public, artifact,
                       current_version="0.0.1", platform="darwin", arch="arm64")


def test_signed_manifest_cannot_omit_protocol_or_product(tmp_path: Path) -> None:
    raw, _, _, artifact = signed_fixture(tmp_path)
    manifest = json.loads(raw)
    for omitted in ("schemaVersion", "product"):
        altered = {key: value for key, value in manifest.items() if key != omitted}
        encoded = json.dumps(altered, sort_keys=True, separators=(",", ":")).encode()
        private = Ed25519PrivateKey.generate()
        key = private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        signature = base64.b64encode(private.sign(encoded)).decode()
        with pytest.raises(UpdateError, match="UPDATE_MANIFEST_INVALID"):
            verify_release(encoded, signature, key, artifact,
                           current_version="0.0.1", platform="darwin", arch="arm64")


def test_staged_migration_retains_live_schema_and_wal_data(tmp_path: Path) -> None:
    data = tmp_path / "forge-data"
    storage = ForgePersistence(data)
    storage.open()
    assert storage.migrate(29) == 29
    storage.set_metadata("update.fixture", "committed in WAL")
    release = verify_fixture(tmp_path)
    with pytest.raises(UpdateError, match="UPDATE_RUNS_ACTIVE"):
        rehearse_migration(storage, release, active_operations=1)
    plan = rehearse_migration(storage, release, active_operations=0)
    assert plan.source_schema == 29 and plan.target_schema == 30
    assert plan.backup.exists() and plan.staged_database.exists()
    assert storage.schema_version() == 29
    assert storage.get_metadata("update.fixture") == "committed in WAL"
    with sqlite3.connect(plan.backup) as backup:
        assert backup.execute("PRAGMA user_version").fetchone()[0] == 29
    staged = ForgePersistence(plan.staged_database.parent)
    staged.open()
    assert staged.schema_version() == 30
    assert staged.get_metadata("update.fixture") == "committed in WAL"
    assert staged.session().execute("PRAGMA foreign_key_check").fetchone() is None
    staged.close()
    storage.close()
    reopened = ForgePersistence(data)
    reopened.open()
    assert reopened.schema_version() == 29
    assert reopened.get_metadata("update.fixture") == "committed in WAL"
    reopened.close()


def test_failed_rehearsal_never_partially_migrates_source(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = ForgePersistence(tmp_path / "forge-data")
    storage.open()
    assert storage.migrate(29) == 29
    storage.set_metadata("update.fixture", "original")
    release = verify_fixture(tmp_path)
    broken = Migration(30, "CREATE TABLE update_partial(id TEXT); INVALID SQL;", "broken")
    monkeypatch.setattr(
        persistence_module, "MIGRATIONS",
        (*persistence_module.MIGRATIONS[:29], broken,
         *persistence_module.MIGRATIONS[30:]))
    with pytest.raises(UpdateError, match="UPDATE_MIGRATION_FAILED"):
        rehearse_migration(storage, release, active_operations=0)
    assert storage.schema_version() == 29
    assert storage.get_metadata("update.fixture") == "original"
    storage.close()


def test_future_schema_or_unsafe_stage_is_rejected(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "forge-data")
    storage.open()
    storage.migrate(29)
    raw, signature, public, artifact = signed_fixture(tmp_path, schema_to=33)
    future = verify_release(raw, signature, public, artifact,
                            current_version="0.0.1", platform="darwin", arch="arm64")
    with pytest.raises(UpdateError, match="UPDATE_SCHEMA_UNSUPPORTED"):
        rehearse_migration(storage, future, active_operations=0)
    (storage.data_dir / "update-rehearsals").symlink_to(tmp_path)
    with pytest.raises(UpdateError, match="UPDATE_STAGE_UNSAFE"):
        rehearse_migration(storage, verify_fixture(tmp_path), active_operations=0)
    storage.close()
