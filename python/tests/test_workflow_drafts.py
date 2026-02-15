"""P5-03 draft durability, publish gates and immutable published revisions."""

from __future__ import annotations

import json
from pathlib import Path
from sqlite3 import IntegrityError

import pytest
from test_workflow_compiler import catalog

from forge.host import HostRuntime
from forge.persistence import ForgePersistence
from forge.protocol import ProtocolError, RpcRequest
from forge.workflow_compiler import WorkflowCatalog
from forge.workflow_drafts import (
    WorkflowDraftError,
    WorkflowDraftService,
    WorkflowPublishInput,
    WorkflowSaveInput,
)
from forge.workflow_templates import load_template


def custom_quick():
    return load_template("quick").model_copy(update={
        "id": "workflow.fixture", "name": "Fixture quick",
    })


def test_draft_is_durable_and_invalid_draft_cannot_publish(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    assert db.migrate(26) == 26
    service = WorkflowDraftService(db)
    base = custom_quick()
    saved = service.save(WorkflowSaveInput(template=base, expectedRevision=0))
    assert saved.draftHash and saved.publishedRevision is None
    with pytest.raises(WorkflowDraftError, match="WORKFLOW_DRAFT_STALE"):
        service.save(WorkflowSaveInput(template=base, expectedRevision=0))
    bad = base.model_copy(update={
        "revision": 2,
        "edges": [*base.edges, base.edges[0].model_copy(update={
            "source": "accept", "event": "approved", "target": "develop",
        })],
    })
    service.save(WorkflowSaveInput(template=bad, expectedRevision=1))
    result, compiled = service.publish(
        WorkflowPublishInput(workflowId=base.id, expectedDraftRevision=2), catalog(),
    )
    assert not compiled.launchable and result.publishedRevision is None
    assert any(issue.code == "WORKFLOW_NORMAL_CYCLE" for issue in compiled.issues)
    count = db.session().execute(
        "SELECT COUNT(*) AS n FROM workflow_revisions"
    ).fetchone()
    assert count is not None and count["n"] == 0
    db.close()
    reopened = ForgePersistence(tmp_path)
    reopened.open()
    assert reopened.migrate(26) == 26
    assert WorkflowDraftService(reopened).get(base.id).draftRevision == 2
    reopened.close()


def test_publish_requires_actual_catalog_and_keeps_prior_publication(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(26)
    service = WorkflowDraftService(db)
    base = custom_quick()
    service.save(WorkflowSaveInput(template=base, expectedRevision=0))
    missing = WorkflowCatalog(profiles={}, executors={}, verifiers=frozenset())
    record, refused = service.publish(
        WorkflowPublishInput(workflowId=base.id, expectedDraftRevision=1), missing,
    )
    assert not refused.launchable and record.publishedRevision is None
    first, accepted = service.publish(
        WorkflowPublishInput(workflowId=base.id, expectedDraftRevision=1), catalog(),
    )
    assert accepted.launchable and first.publishedRevision == 1
    assert service.publish(
        WorkflowPublishInput(workflowId=base.id, expectedDraftRevision=1), catalog(),
    )[0].publishedRevision == 1
    second_draft = base.model_copy(update={"revision": 2, "name": "Changed"})
    service.save(WorkflowSaveInput(template=second_draft, expectedRevision=1))
    assert service.get(base.id).publishedRevision == 1
    second, _ = service.publish(
        WorkflowPublishInput(workflowId=base.id, expectedDraftRevision=2), catalog(),
    )
    assert second.publishedRevision == 2
    old = service.published(base.id, 1)
    new = service.published(base.id, 2)
    assert old.definition.name == "Fixture quick"
    assert new.definition.name == "Changed"
    assert old.contentHash != new.contentHash
    rows = db.session().execute(
        "SELECT revision,definition_json FROM workflow_revisions "
        "WHERE id=? ORDER BY revision", (base.id,),
    ).fetchall()
    assert [row["revision"] for row in rows] == [1, 2]
    assert "Fixture quick" in rows[0]["definition_json"]
    with pytest.raises(IntegrityError):
        with db.transaction() as tx:
            tx.execute("UPDATE workflow_revisions SET content_hash=? "
                       "WHERE id=? AND revision=1", ("0" * 64, base.id))
    db.close()


def test_stored_future_dsl_is_diagnosed_without_mutating_existing_rows(
    tmp_path: Path,
) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(26)
    service = WorkflowDraftService(db)
    base = custom_quick()
    service.save(WorkflowSaveInput(template=base, expectedRevision=0))
    original = db.session().execute(
        "SELECT draft_json FROM workflow_drafts WHERE workflow_id=?", (base.id,),
    ).fetchone()["draft_json"]
    future = {**json.loads(original), "schemaVersion": "2.0"}
    with db.transaction() as tx:
        tx.execute("UPDATE workflow_drafts SET draft_json=? WHERE workflow_id=?",
                   (json.dumps(future), base.id))
    with pytest.raises(WorkflowDraftError, match="WORKFLOW_DSL_VERSION_UNSUPPORTED"):
        service.get(base.id)
    assert db.session().execute(
        "SELECT draft_json FROM workflow_drafts WHERE workflow_id=?", (base.id,),
    ).fetchone()["draft_json"] == json.dumps(future)
    db.close()


@pytest.mark.asyncio
async def test_real_host_workflow_commands_restart_and_fail_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path))
    host = HostRuntime()
    base = custom_quick()

    def request(method: str, params: dict[str, object]) -> RpcRequest:
        return RpcRequest(
            jsonrpc="2.0", id="workflow-test", method=method, params=params,
            transportVersion="forge-local-jsonrpc/v1",
        )

    try:
        assert host.storage_health()["status"] == "ready"
        with pytest.raises(ProtocolError) as bad_save:
            await host.dispatch_async(request("workflow.saveDraft", {
                "template": {**base.model_dump(mode="json", by_alias=True),
                             "schemaVersion": "2.0"}, "expectedRevision": 0,
            }))
        assert bad_save.value.code == "WORKFLOW_DSL_VERSION_UNSUPPORTED"
        with pytest.raises(ProtocolError) as bad_compile:
            await host.dispatch_async(request("workflow.compileDraft", {
                "template": {**base.model_dump(mode="json", by_alias=True),
                             "schemaVersion": "2.0"}, "expectedRevision": 0,
            }))
        assert bad_compile.value.code == "WORKFLOW_DSL_VERSION_UNSUPPORTED"
        preset = await host.dispatch_async(request("workflow.presets", {}))
        assert [item["id"] for item in preset["data"]] == ["standard", "quick", "strict"]
        saved = await host.dispatch_async(request("workflow.saveDraft", {
            "template": base.model_dump(mode="json", by_alias=True), "expectedRevision": 0,
        }))
        assert saved["data"]["record"]["draftRevision"] == 1
        impact = await host.dispatch_async(request("workflow.impact", {
            "workflowId": base.id,
        }))
        assert impact["data"]["publishedRevisions"] == []
        assert impact["data"]["frozenRunCounts"] == {}
        with pytest.raises(ProtocolError) as invalid:
            await host.dispatch_async(request("workflow.impact", {
                "workflowId": base.id, "command": "shell.execute",
            }))
        assert invalid.value.code == "INVALID_REQUEST"
        assert not saved["data"]["compiled"]["launchable"]
        assert len((await host.dispatch_async(request("workflow.list", {})))["data"]) == 1
        refused = await host.dispatch_async(request("workflow.publish", {
            "workflowId": base.id, "expectedDraftRevision": 1,
        }))
        assert not refused["data"]["compiled"]["launchable"]
        assert refused["data"]["record"]["publishedRevision"] is None
        host.workflow_drafts.publish(
            WorkflowPublishInput(workflowId=base.id, expectedDraftRevision=1), catalog())
        publication = await host.dispatch_async(request("workflow.getPublished", {
            "workflowId": base.id, "revision": 1,
        }))
        assert publication["data"]["definition"]["name"] == "Fixture quick"
        with pytest.raises(ProtocolError) as invalid_publication:
            await host.dispatch_async(request("workflow.getPublished", {
                "workflowId": base.id, "revision": 1, "execute": True,
            }))
        assert invalid_publication.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError, match="Invalid Workflow payload"):
            await host.dispatch_async(request("workflow.saveDraft", {
                "template": base.model_dump(mode="json", by_alias=True),
                "expectedRevision": 0, "autoApprove": True,
            }))
        with pytest.raises(ProtocolError, match="not registered"):
            await host.dispatch_async(request("workflow.run", {}))
    finally:
        await host.shutdown()
    restarted = HostRuntime()
    try:
        assert restarted.storage_health()["status"] == "ready"
        found = await restarted.dispatch_async(request("workflow.get", {
            "workflowId": base.id,
        }))
        assert found["data"]["draftRevision"] == 1
        assert found["data"]["publishedRevision"] == 1
    finally:
        await restarted.shutdown()
