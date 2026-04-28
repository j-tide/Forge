"""Durable project-scoped SSE invalidations from real Host services."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

from test_workflow_versioning import approved_task, selection

from forge.approvals import ApprovalRequestInput, ApprovalService
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.device_pairing import DevicePairingService, PairingDecisionInput
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.remote_events import RemoteEventFeed
from forge.remote_sessions import RemoteSessionService
from forge.run_config import RunConfigService, VersionLock
from forge.runs import RunService, RunStartIntent


def test_schema32_upgrade_streams_real_conversation_approval_and_run(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source repo"
    source.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    assert storage.migrate(32) == 32
    project, task, environment = approved_task(storage, source, "standard")
    storage.close()

    upgraded = ForgePersistence(tmp_path / "data")
    upgraded.open()
    assert upgraded.migrate(33) == 33
    assert upgraded.last_backup is not None and upgraded.last_backup.is_file()
    assert upgraded.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    project_id = str(project.projectId)
    # Existing records predate the outbox: a fresh remote subscriber must
    # resync its snapshot rather than receiving a fabricated historical replay.
    sessions = RemoteSessionService(upgraded)
    feed = RemoteEventFeed(upgraded, sessions, "fixture-host")
    assert feed.snapshot_cursor(project_id) == "p:0"
    pairing = DevicePairingService(upgraded)
    issued = pairing.issue()
    claimed = pairing.claim_from_nonce(
        issued["nonce"], device_name="Fixture phone", address_summary="loopback",
        fingerprint_summary="fixture-device",
    )
    pairing.decide(PairingDecisionInput(
        pairingId=UUID(issued["pairingId"]), approve=True,
        projectIds=[project.projectId],
    ))
    session = sessions.pairing_status(claimed["claimSecret"])
    token = session["sessionToken"]
    assert feed.read_page({"sessionToken": token, "projectId": project_id,
                           "cursor": None})["resyncRequired"]

    conversations = ConversationService(upgraded)
    other_source = tmp_path / "other repo"
    other_source.mkdir()
    projects = ProjectService(upgraded)
    other_probe = projects.probe(str(other_source))
    other = projects.create(str(other_source), other_probe.fingerprint,
                            TRUST_VERSION, True, 0)
    conversations.create(str(other.projectId), "Not granted", 0)
    assert feed.read_page({"sessionToken": token, "projectId": project_id,
                           "cursor": "p:0"})["events"] == []
    conversation = conversations.create(project_id, "Remote event fixture", 0)
    sent = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="remote-event-message-01", text="Request a second draft",
        attachmentIds=[],
    ))["message"]
    drafts = DraftService(upgraded)
    pending_draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=sent.messageId, idempotencyKey="remote-event-draft-01",
    ))
    decision_id = uuid4()
    refs = [f"message:{sent.messageId}", f"decision:{decision_id}"]
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=pending_draft.draftId,
        expectedRevision=1,
        contract=TaskContract(
            schemaVersion="1.0", taskId=str(pending_draft.draftId),
            projectId=project_id, revision=2, title="Pending approval",
            type="feature", goal="Observe actual pending approval",
            acceptance=[AcceptanceCriterion(
                id="ac1", statement="Owner reviews proposal", method="inspection",
                required=True, sourceRefs=refs,
            )],
            constraints=[], scope=[], outOfScope=[], dependencies=[],
            openQuestions=[], assumptions=[], sourceRefs=refs,
            workflowRef="standard", priority="normal",
        ),
        decisionId=decision_id, decisionSummary="Owner reviewed draft",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    ApprovalService(upgraded, drafts).request(ApprovalRequestInput(
        projectId=project.projectId, draftId=pending_draft.draftId,
        expectedRevision=2,
    ))

    configs = RunConfigService(upgraded, EnvironmentService(upgraded))
    # The other project is deliberately created for feed isolation above;
    # restore the intended local workspace before starting its Run.
    current_project = projects.get(project_id)
    assert current_project is not None
    projects.set_active(project_id, current_project.revision)
    config = configs.create(selection(project, task, environment, VersionLock(
        id="standard", version="1", contentHash="a" * 64,
    )))
    run = RunService(upgraded, configs).begin(RunStartIntent(
        runId=config.runId, projectId=project.projectId, taskId=task.draftId,
        attemptId=uuid4(), workspaceId=uuid4(), workspaceLeaseId=uuid4(),
        leaseEpoch=1, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=config.snapshotHash,
        createdAt=timestamp(),
    ))
    assert run.state == "queued"
    first = feed.read_page({"sessionToken": token, "projectId": project_id,
                            "cursor": "p:0"})
    kinds = {item["type"] for item in first["events"]}
    assert {"conversation.changed", "draft.changed", "approval.changed",
            "run.changed"} <= kinds
    assert all(item["projectId"] == project_id for item in first["events"])
    assert any(item["taskId"] == str(task.draftId)
               for item in first["events"] if item["type"] == "run.changed")
    last = first["cursor"]
    assert feed.read_page({"sessionToken": token, "projectId": project_id,
                           "cursor": last})["events"] == []
    upgraded.close()

    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    persisted = RemoteEventFeed(reopened, RemoteSessionService(reopened), "next-host")
    assert persisted.snapshot_cursor(project_id) == last
    assert persisted.read_page({"sessionToken": token, "projectId": project_id,
                                "cursor": last})["events"] == []
    reopened.close()
