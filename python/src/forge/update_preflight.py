"""Offline release verification and reversible SQLite migration rehearsal.

This module deliberately never replaces the live application or database. A future signed
installer must stop the Host and perform an independently verified cutover.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import BaseModel, ConfigDict, Field, field_validator

from forge.persistence import LATEST_SCHEMA, ForgePersistence, PersistenceError


class UpdateError(Exception):
    """Stable, path-free failure code for offline update diagnostics."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReleaseManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: str
    product: str
    version: str
    platform: str
    arch: str
    artifactName: str
    artifactSha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    artifactBytes: int = Field(gt=0, le=4 * 1024 * 1024 * 1024)
    schemaFrom: int = Field(ge=0)
    schemaTo: int = Field(ge=0)

    @field_validator("schemaVersion")
    @classmethod
    def protocol(cls, value: str) -> str:
        if value != "forge-release/v1":
            raise ValueError("unsupported release manifest version")
        return value

    @field_validator("product")
    @classmethod
    def product_name(cls, value: str) -> str:
        if value != "Forge":
            raise ValueError("wrong product")
        return value

    @field_validator("version")
    @classmethod
    def semantic_version(cls, value: str) -> str:
        if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value):
            raise ValueError("invalid release version")
        return value

    @field_validator("platform")
    @classmethod
    def target_platform(cls, value: str) -> str:
        if value not in ("darwin", "win32"):
            raise ValueError("unsupported target platform")
        return value

    @field_validator("arch")
    @classmethod
    def target_arch(cls, value: str) -> str:
        if value not in ("arm64", "x64"):
            raise ValueError("unsupported target architecture")
        return value

    @field_validator("artifactName")
    @classmethod
    def safe_artifact_name(cls, value: str) -> str:
        if value in ("", ".", "..") or Path(value).name != value or "\\" in value:
            raise ValueError("unsafe artifact name")
        return value


@dataclass(frozen=True)
class VerifiedRelease:
    manifest: ReleaseManifest
    manifest_sha256: str
    artifact: Path


@dataclass(frozen=True)
class MigrationRehearsal:
    source_schema: int
    target_schema: int
    backup: Path
    staged_database: Path
    source_database: Path


def verify_release(
    manifest_bytes: bytes, signature_b64: str, trusted_public_key: bytes,
    artifact: Path, *, current_version: str, platform: str, arch: str,
) -> VerifiedRelease:
    """Verify a pinned Ed25519 trust root before reading the artifact's contents."""
    if len(manifest_bytes) > 16_384 or len(trusted_public_key) != 32:
        raise UpdateError("UPDATE_MANIFEST_INVALID")
    try:
        signature = base64.b64decode(signature_b64, validate=True)
        if len(signature) != 64:
            raise ValueError("signature length")
        Ed25519PublicKey.from_public_bytes(trusted_public_key).verify(signature, manifest_bytes)
    except (ValueError, InvalidSignature) as error:
        raise UpdateError("UPDATE_SIGNATURE_INVALID") from error
    try:
        manifest = ReleaseManifest.model_validate_json(manifest_bytes)
    except ValueError as error:
        raise UpdateError("UPDATE_MANIFEST_INVALID") from error
    if (manifest.platform, manifest.arch) != (platform, arch):
        raise UpdateError("UPDATE_PLATFORM_MISMATCH")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", current_version):
        raise UpdateError("UPDATE_VERSION_UNSUPPORTED")
    if tuple(map(int, manifest.version.split("."))) <= tuple(map(int, current_version.split("."))):
        raise UpdateError("UPDATE_VERSION_UNSUPPORTED")
    if not artifact.is_file() or artifact.is_symlink() or artifact.name != manifest.artifactName:
        raise UpdateError("UPDATE_ARTIFACT_INVALID")
    digest = hashlib.sha256()
    size = 0
    try:
        with artifact.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                size += len(chunk)
                if size > manifest.artifactBytes:
                    raise UpdateError("UPDATE_ARTIFACT_INVALID")
                digest.update(chunk)
    except OSError as error:
        raise UpdateError("UPDATE_ARTIFACT_INVALID") from error
    if size != manifest.artifactBytes or digest.hexdigest() != manifest.artifactSha256:
        raise UpdateError("UPDATE_ARTIFACT_INVALID")
    return VerifiedRelease(manifest, hashlib.sha256(manifest_bytes).hexdigest(), artifact)


def rehearse_migration(
    storage: ForgePersistence, release: VerifiedRelease, *, active_operations: int,
) -> MigrationRehearsal:
    """Drain gate + SQLite online backup + migration of an isolated copy only."""
    if active_operations != 0:
        raise UpdateError("UPDATE_RUNS_ACTIVE")
    if not storage.is_open or storage.read_only:
        raise UpdateError("UPDATE_STORAGE_UNAVAILABLE")
    current = storage.schema_version()
    target = release.manifest.schemaTo
    if (current < release.manifest.schemaFrom or current > target or target > LATEST_SCHEMA):
        raise UpdateError("UPDATE_SCHEMA_UNSUPPORTED")
    try:
        backup = storage.backup()
    except PersistenceError as error:
        raise UpdateError("UPDATE_BACKUP_FAILED") from error
    stage_root = storage.data_dir / "update-rehearsals"
    if stage_root.is_symlink():
        raise UpdateError("UPDATE_STAGE_UNSAFE")
    try:
        stage_root.mkdir(mode=0o700, exist_ok=True)
        stage = stage_root / str(uuid4())
        stage.mkdir(mode=0o700)
        staged_database = stage / "forge.sqlite"
        with sqlite3.connect(backup) as source, sqlite3.connect(staged_database) as destination:
            source.backup(destination)
        candidate = ForgePersistence(stage)
        candidate.open()
        try:
            candidate.migrate(target)
            if candidate.schema_version() != target:
                raise UpdateError("UPDATE_MIGRATION_FAILED")
            quick_check = candidate.session().execute("PRAGMA quick_check").fetchone()
            if quick_check is None or quick_check[0] != "ok":
                raise UpdateError("UPDATE_MIGRATION_FAILED")
            if candidate.session().execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise UpdateError("UPDATE_MIGRATION_FAILED")
        finally:
            candidate.close()
    except (OSError, sqlite3.DatabaseError, PersistenceError) as error:
        raise UpdateError("UPDATE_MIGRATION_FAILED") from error
    return MigrationRehearsal(current, target, backup, staged_database, storage.db_path)


def read_manifest(path: Path) -> bytes:
    """Bounded, read-only manifest loader for a future trusted installer adapter."""
    try:
        if path.is_symlink() or path.stat().st_size > 16_384:
            raise UpdateError("UPDATE_MANIFEST_INVALID")
        data = path.read_bytes()
        json.loads(data)
        return data
    except (OSError, ValueError) as error:
        raise UpdateError("UPDATE_MANIFEST_INVALID") from error
