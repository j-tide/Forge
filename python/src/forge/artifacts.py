"""Bounded Host-owned artifact import; content is in SQLite for consistent backup."""

from __future__ import annotations

import hashlib
import json
import os
import stat
from datetime import UTC, datetime, timedelta
from pathlib import Path, PureWindowsPath
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.run_inspection import redact

MAX_ARTIFACT_BYTES = 1_048_576
IMPORTED_ARTIFACT_RETENTION_DAYS = 30
MAX_CLEANUP_BATCH = 500


class ArtifactError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ImportedArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    artifactId: UUID
    projectId: UUID
    verificationId: UUID
    kind: str = Field(min_length=1, max_length=80)
    mime: Literal["text/plain", "application/json"]
    byteSize: int = Field(ge=0, le=MAX_ARTIFACT_BYTES)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    createdAt: str


class ArtifactStore:
    """Only the Host may import from its own verifier workspace root."""

    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage
        self.root = storage.data_dir / "verifier-workspaces"

    def _source(self, verification_id: UUID, relative_path: str, mime: str) -> bytes:
        if (not relative_path or "\0" in relative_path or "\\" in relative_path
                or Path(relative_path).is_absolute()
                or PureWindowsPath(relative_path).is_absolute()
                or any(part in ("", ".", "..") for part in relative_path.split("/"))):
            raise ArtifactError("ARTIFACT_PATH_INVALID")
        suffix = Path(relative_path).suffix.lower()
        if (mime == "text/plain" and suffix not in (".txt", ".log")) or (
            mime == "application/json" and suffix != ".json"
        ) or mime not in ("text/plain", "application/json"):
            raise ArtifactError("ARTIFACT_MIME_INVALID")
        if self.root.is_symlink() or not self.root.is_dir():
            raise ArtifactError("ARTIFACT_PATH_INVALID")
        owned = self.root / str(verification_id)
        if owned.is_symlink() or not owned.is_dir():
            raise ArtifactError("ARTIFACT_PATH_INVALID")
        root = owned.resolve(strict=True)
        source = owned / relative_path
        current = owned
        for segment in relative_path.split("/"):
            current = current / segment
            if current.is_symlink():
                raise ArtifactError("ARTIFACT_PATH_INVALID")
        try:
            if not source.resolve(strict=True).is_relative_to(root):
                raise ArtifactError("ARTIFACT_PATH_INVALID")
            flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
            fd = os.open(source, flags)
            try:
                details = os.fstat(fd)
                if not stat.S_ISREG(details.st_mode) or details.st_size > MAX_ARTIFACT_BYTES:
                    raise ArtifactError("ARTIFACT_PATH_INVALID")
                with os.fdopen(fd, "rb", closefd=False) as handle:
                    content = handle.read(MAX_ARTIFACT_BYTES + 1)
            finally:
                os.close(fd)
        except (OSError, ValueError) as error:
            raise ArtifactError("ARTIFACT_PATH_INVALID") from error
        if len(content) > MAX_ARTIFACT_BYTES:
            raise ArtifactError("ARTIFACT_TOO_LARGE")
        try:
            text = content.decode("utf-8")
            if redact(text) != text:
                raise ArtifactError("ARTIFACT_SENSITIVE")
            if mime == "application/json":
                json.loads(text)
        except (UnicodeError, json.JSONDecodeError) as error:
            raise ArtifactError("ARTIFACT_MIME_INVALID") from error
        return content

    def import_file(self, project_id: UUID, verification_id: UUID,
                    relative_path: str, *, kind: str,
                    mime: Literal["text/plain", "application/json"]) -> ImportedArtifact:
        if not kind or len(kind) > 80:
            raise ArtifactError("ARTIFACT_KIND_INVALID")
        if self.storage.session().execute(
            "SELECT 1 FROM verifier_jobs WHERE project_id=? AND verification_id=?",
            (str(project_id), str(verification_id)),
        ).fetchone() is None:
            raise ArtifactError("ARTIFACT_OWNER_INVALID")
        content = self._source(verification_id, relative_path, mime)
        record = ImportedArtifact(
            artifactId=uuid4(), projectId=project_id, verificationId=verification_id,
            kind=kind, mime=mime,
            byteSize=len(content), contentHash=hashlib.sha256(content).hexdigest(),
            createdAt=timestamp(),
        )
        with self.storage.transaction() as db:
            if db.execute("SELECT 1 FROM projects WHERE project_id=? AND archived_at IS NULL",
                          (str(project_id),)).fetchone() is None:
                raise ArtifactError("PROJECT_NOT_FOUND")
            db.execute(
                "INSERT INTO imported_artifacts(artifact_id,project_id,verification_id,"
                "kind,mime,content_blob,byte_size,content_hash,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (str(record.artifactId), str(project_id), str(verification_id),
                 kind, mime, content,
                 record.byteSize, record.contentHash, record.createdAt),
            )
        return record

    def read(self, project_id: UUID, artifact_id: UUID) -> bytes:
        row = self.storage.session().execute(
            "SELECT content_blob,content_hash, "
            "EXISTS(SELECT 1 FROM imported_artifact_tombstones t "
            "WHERE t.artifact_id=a.artifact_id) AS purged FROM imported_artifacts a "
            "WHERE project_id=? AND artifact_id=?", (str(project_id), str(artifact_id)),
        ).fetchone()
        if row is None:
            raise ArtifactError("ARTIFACT_NOT_FOUND")
        if row["purged"]:
            raise ArtifactError("ARTIFACT_PURGED")
        content = bytes(row["content_blob"])
        if hashlib.sha256(content).hexdigest() != row["content_hash"]:
            raise ArtifactError("ARTIFACT_CORRUPT")
        return content

    def expired_candidates(self, *, now: datetime | None = None) -> tuple[list[str], bool]:
        instant = now or datetime.now(UTC)
        cutoff = (instant - timedelta(days=IMPORTED_ARTIFACT_RETENTION_DAYS)).isoformat(
            timespec="milliseconds"
        ).replace("+00:00", "Z")
        rows = self.storage.session().execute(
            "SELECT artifact_id FROM imported_artifacts a WHERE a.created_at < ? "
            "AND NOT EXISTS(SELECT 1 FROM imported_artifact_tombstones t "
            "WHERE t.artifact_id=a.artifact_id) "
            "ORDER BY a.created_at,a.artifact_id LIMIT ?",
            (cutoff, MAX_CLEANUP_BATCH + 1),
        ).fetchall()
        return ([str(row["artifact_id"]) for row in rows[:MAX_CLEANUP_BATCH]],
                len(rows) > MAX_CLEANUP_BATCH)

    def purge_expired(self, artifact_ids: list[str], *, now: datetime | None = None) -> int:
        """Clear only previewed, expired Host-imported bytes; preserve immutable metadata."""
        if len(artifact_ids) > MAX_CLEANUP_BATCH or len(set(artifact_ids)) != len(artifact_ids):
            raise ArtifactError("ARTIFACT_CLEANUP_INVALID")
        instant = now or datetime.now(UTC)
        cutoff = (instant - timedelta(days=IMPORTED_ARTIFACT_RETENTION_DAYS)).isoformat(
            timespec="milliseconds"
        ).replace("+00:00", "Z")
        purged_at = instant.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        with self.storage.transaction() as db:
            for artifact_id in artifact_ids:
                row = db.execute(
                    "SELECT 1 FROM imported_artifacts a WHERE a.artifact_id=? "
                    "AND a.created_at < ? AND NOT EXISTS("
                    "SELECT 1 FROM imported_artifact_tombstones t "
                    "WHERE t.artifact_id=a.artifact_id)",
                    (artifact_id, cutoff),
                ).fetchone()
                if row is None:
                    raise ArtifactError("ARTIFACT_CLEANUP_STALE")
                db.execute(
                    "INSERT INTO imported_artifact_tombstones(artifact_id,purged_at,reason) "
                    "VALUES(?,?,'expired-user-confirmed')", (artifact_id, purged_at),
                )
                db.execute("UPDATE imported_artifacts SET content_blob=X'' WHERE artifact_id=?",
                           (artifact_id,))
        return len(artifact_ids)
