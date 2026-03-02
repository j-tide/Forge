"""Allowlisted local diagnostics and explicitly confirmed Host-owned artifact retention."""

from __future__ import annotations

import platform
import sys
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from forge.artifacts import IMPORTED_ARTIFACT_RETENTION_DAYS, ArtifactStore
from forge.persistence import ForgePersistence
from forge.protocol import HOST_PROTOCOL_VERSION

PREVIEW_TTL_SECONDS = 600


class DiagnosticsError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class DiagnosticsService:
    """No raw logs, project paths, environment, file contents or credentials enter a bundle."""

    def __init__(self, storage: ForgePersistence, artifacts: ArtifactStore) -> None:
        self.storage = storage
        self.artifacts = artifacts
        self._pending: tuple[str, float, list[str]] | None = None

    def prepare(self) -> dict[str, Any]:
        health = self.storage.health()
        if health["status"] != "ready":
            raise DiagnosticsError("HOST_UNAVAILABLE")
        db = self.storage.session()
        def count(table: str) -> int:
            # Only fixed internal table names supplied below reach this query.
            row = db.execute(f"SELECT count(*) FROM {table}").fetchone()
            assert row is not None
            return int(row[0])

        counts = {
            "projects": count("projects"), "tasks": count("tasks"),
            "runs": count("runs"), "importedArtifacts": count("imported_artifacts"),
        }
        candidates, has_more = self.artifacts.expired_candidates()
        preview_id = str(uuid4())
        self._pending = (preview_id, time.monotonic() + PREVIEW_TTL_SECONDS, candidates)
        return {
            "format": "forge-diagnostics/v1",
            "previewId": preview_id,
            "generatedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace(
                "+00:00", "Z"),
            "runtime": {
                "python": platform.python_version(), "platform": sys.platform,
                "arch": platform.machine(), "hostProtocol": HOST_PROTOCOL_VERSION,
            },
            "storage": {
                "status": health["status"], "schemaVersion": health["schemaVersion"],
                "journalMode": health["journalMode"],
            },
            "counts": counts,
            "usage": {"status": "unavailable", "reason": "No complete measured total"},
            "retention": {
                "artifactDays": IMPORTED_ARTIFACT_RETENTION_DAYS,
                "expiredImportedArtifacts": len(candidates), "moreCandidates": has_more,
                "automaticPurge": False,
            },
        }

    def cleanup(self, preview_id: str) -> dict[str, int]:
        pending = self._pending
        self._pending = None
        if pending is None or preview_id != pending[0] or time.monotonic() > pending[1]:
            raise DiagnosticsError("DIAGNOSTICS_PREVIEW_STALE")
        return {"purgedImportedArtifacts": self.artifacts.purge_expired(pending[2])}
