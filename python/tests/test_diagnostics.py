"""Real SQLite retention, allowlisted preview and Host command security."""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from test_delivery import accepted_fixture

from forge.artifacts import ArtifactError, ArtifactStore
from forge.diagnostics import DiagnosticsError, DiagnosticsService
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.protocol import TRANSPORT_VERSION, ProtocolError, RpcRequest


@pytest.mark.asyncio
async def test_allowlisted_preview_and_confirmed_retention_preserve_source(
    tmp_path: Path,
) -> None:
    source, _, storage, project_id, task_id, _ = await accepted_fixture(tmp_path)
    assert storage.schema_version() == LATEST_SCHEMA
    verification = storage.session().execute(
        "SELECT verification_id FROM verifier_jobs WHERE task_id=?", (str(task_id),)
    ).fetchone()
    assert verification is not None
    verification_id = verification["verification_id"]
    old_id, fresh_id = str(uuid4()), str(uuid4())
    old_content = b"secret fixture token and /private/project/source path"
    fresh_content = b"fresh content"
    with storage.transaction() as db:
        for artifact_id, content, created in (
            (old_id, old_content, "2020-01-01T00:00:00.000Z"),
            (fresh_id, fresh_content, "2099-01-01T00:00:00.000Z"),
        ):
            db.execute(
                "INSERT INTO imported_artifacts(artifact_id,project_id,verification_id,kind,mime,"
                "content_blob,byte_size,content_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (artifact_id, str(project_id), verification_id, "fixture", "text/plain", content,
                 len(content), hashlib.sha256(content).hexdigest(), created),
            )
    diagnostics = DiagnosticsService(storage, ArtifactStore(storage))
    preview = diagnostics.prepare()
    shown = json.dumps(preview)
    assert preview["retention"] == {"artifactDays": 30, "expiredImportedArtifacts": 1,
                                    "moreCandidates": False, "automaticPurge": False}
    assert preview["usage"]["status"] == "unavailable"
    assert "secret fixture token" not in shown
    assert str(source) not in shown and "private/project" not in shown
    assert diagnostics.cleanup(preview["previewId"]) == {"purgedImportedArtifacts": 1}
    with pytest.raises(DiagnosticsError, match="DIAGNOSTICS_PREVIEW_STALE"):
        diagnostics.cleanup(preview["previewId"])
    with pytest.raises(ArtifactError, match="ARTIFACT_PURGED"):
        ArtifactStore(storage).read(project_id, UUID(old_id))
    assert ArtifactStore(storage).read(project_id, UUID(fresh_id)) == fresh_content
    assert storage.session().execute(
        "SELECT length(content_blob) FROM imported_artifacts WHERE artifact_id=?", (old_id,)
    ).fetchone()[0] == 0
    assert storage.session().execute(
        "SELECT reason FROM imported_artifact_tombstones WHERE artifact_id=?", (old_id,)
    ).fetchone()[0] == "expired-user-confirmed"
    assert source.exists() and source.joinpath(".git").is_dir()
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    reopened.migrate(LATEST_SCHEMA)
    with pytest.raises(ArtifactError, match="ARTIFACT_PURGED"):
        ArtifactStore(reopened).read(project_id, UUID(old_id))
    assert ArtifactStore(reopened).read(project_id, UUID(fresh_id)) == fresh_content
    reopened.close()


def test_cleanup_requires_host_preview_and_exact_confirmation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "isolated-data"))
    host = HostRuntime()
    host.storage_health()
    def request(method: str, params: dict[str, object]) -> RpcRequest:
        return RpcRequest(jsonrpc="2.0", id=str(uuid4()), method=method, params=params,
                          transportVersion=TRANSPORT_VERSION)
    try:
        with pytest.raises(ProtocolError) as unknown:
            host.dispatch(request("diagnostics.exportArbitraryPath", {}))
        assert unknown.value.code == "UNKNOWN_COMMAND"
        with pytest.raises(ProtocolError) as invalid:
            host.dispatch(request("diagnostics.cleanup", {"previewId": str(uuid4()),
                                                          "confirmed": False}))
        assert invalid.value.code == "INVALID_REQUEST"
        preview = host.dispatch(request("diagnostics.prepare", {}))["data"]
        assert preview["storage"]["schemaVersion"] == LATEST_SCHEMA
        result = host.dispatch(request("diagnostics.cleanup", {
            "previewId": preview["previewId"], "confirmed": True,
        }))
        assert result["data"] == {"purgedImportedArtifacts": 0}
    finally:
        host.storage.close()


@pytest.mark.asyncio
async def test_system_activity_is_real_host_memory_and_rejects_extra_params(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "isolated-data"))
    host = HostRuntime()
    host.storage_health()
    request = RpcRequest(jsonrpc="2.0", id=str(uuid4()), method="system.activity",
                         params={}, transportVersion=TRANSPORT_VERSION)
    try:
        idle = host.dispatch(request)
        assert idle["activityCount"] == 0
        task = asyncio.create_task(asyncio.sleep(30))
        host.refiner_jobs[str(uuid4())] = task
        active = host.dispatch(request)
        assert active["counts"]["refinerJobs"] == 1
        assert active["activityCount"] >= 1
        with pytest.raises(ProtocolError) as invalid:
            host.dispatch(request.model_copy(update={"params": {"shell": "anything"}}))
        assert invalid.value.code == "INVALID_REQUEST"
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        host.refiner_jobs.clear()
        assert host.dispatch(request)["activityCount"] == 0
    finally:
        host.storage.close()
