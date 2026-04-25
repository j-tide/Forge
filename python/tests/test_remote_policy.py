"""Real SQLite device grants and stale approval preflight, without model calls."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest

from forge.approvals import ApprovalRequestInput, ApprovalService
from forge.conversations import ConversationMessage, ConversationSend, ConversationService
from forge.device_pairing import DevicePairingService, PairingDecisionInput
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.remote_commands import RemoteCommandDispatcher, RemoteCommandError
from forge.remote_events import RemoteEventFeed
from forge.remote_policy import (
    REMOTE_COMMAND_SCOPES,
    DevicePolicyNarrow,
    DevicePolicyRevoke,
    RemotePolicyError,
    RemotePolicyService,
    RemoteScope,
)
from forge.remote_sessions import RemoteSessionError, RemoteSessionService


def _project(storage: ForgePersistence, root: Path) -> UUID:
    root.mkdir()
    service = ProjectService(storage)
    probe = service.probe(str(root))
    return service.create(str(root), probe.fingerprint, TRUST_VERSION, True, 0).projectId


def _pair(storage: ForgePersistence, projects: list[UUID],
          scopes: list[RemoteScope]) -> tuple[dict[str, Any], dict[str, Any]]:
    pairing = DevicePairingService(storage)
    issued = pairing.issue()
    claimed = pairing.claim_from_nonce(
        issued["nonce"], device_name="Test phone", address_summary="loopback",
        fingerprint_summary="fixture-key",
    )
    approved = pairing.decide(PairingDecisionInput(
        pairingId=UUID(issued["pairingId"]), approve=True,
        projectIds=projects, scopes=scopes,
    ))
    delivered = RemoteSessionService(storage).pairing_status(claimed["claimSecret"])
    return approved, delivered


def test_schema33_grants_default_read_only_and_upgrade_is_durable(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    assert storage.migrate(33) == 33
    project_id = _project(storage, tmp_path / "repo")
    approval, delivered = _pair(storage, [project_id], [])
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert reopened.last_backup is not None and reopened.last_backup.is_file()
    row = reopened.session().execute(
        "SELECT operation_scopes_json,policy_revision FROM paired_devices "
        "WHERE device_id=?", (approval["deviceId"],),
    ).fetchone()
    assert row is not None and json.loads(row["operation_scopes_json"]) == []
    assert row["policy_revision"] == 1
    identity = RemoteSessionService(reopened).authenticate(delivered["sessionToken"])
    policy = RemotePolicyService(reopened, DraftService(reopened))
    with pytest.raises(RemotePolicyError, match="REMOTE_OPERATION_FORBIDDEN"):
        policy.require_operation(identity, str(project_id), "conversations.send")
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    reopened.close()


def test_narrow_revoke_and_cached_identity_cannot_regrant(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    first = _project(storage, tmp_path / "first")
    second = _project(storage, tmp_path / "second")
    approval, delivered = _pair(
        storage, [first, second], ["task:draft", "task:approve"],
    )
    sessions = RemoteSessionService(storage)
    cached_identity = sessions.authenticate(delivered["sessionToken"])
    assert cached_identity["policyRevision"] == 1
    policy = RemotePolicyService(storage, DraftService(storage))
    feed = RemoteEventFeed(storage, sessions, "fixture-host")
    event_request = {"sessionToken": delivered["sessionToken"],
                     "projectId": str(second), "cursor": "p:0",
                     "policyRevision": 1}
    assert feed.read_page(event_request)["resyncRequired"] is False
    listed = DevicePairingService(storage).list_local()
    assert len(listed) == 1 and listed[0]["deviceId"] == approval["deviceId"]
    assert listed[0]["validSessionCount"] == 1
    assert "online" not in listed[0]
    assert delivered["sessionToken"] not in json.dumps(listed)
    assert policy.require_operation(cached_identity, str(first),
                                    "tasks.approve") == "task:approve"
    narrowed = policy.narrow(DevicePolicyNarrow(
        deviceId=UUID(approval["deviceId"]), expectedRevision=1,
        projectIds=[second], scopes=["task:draft"],
    ))
    assert narrowed["revision"] == 2
    refreshed = sessions.bootstrap_csrf(delivered["sessionToken"])
    assert refreshed["policyRevision"] == 2
    assert refreshed["projectIds"] == [str(second)]
    with pytest.raises(RemoteCommandError) as stale_stream:
        feed.read_page(event_request)
    assert stale_stream.value.code == "REMOTE_POLICY_CHANGED"
    assert stale_stream.value.status == 403
    assert feed.read_page({**event_request, "policyRevision": 2})[
        "resyncRequired"] is False
    with pytest.raises(RemotePolicyError, match="REMOTE_PROJECT_FORBIDDEN"):
        policy.require_operation(cached_identity, str(first), "tasks.approve")
    with pytest.raises(RemotePolicyError, match="REMOTE_OPERATION_FORBIDDEN"):
        policy.require_operation(cached_identity, str(second), "tasks.approve")
    assert policy.require_operation(cached_identity, str(second),
                                    "conversations.send") == "task:draft"
    with pytest.raises(RemotePolicyError, match="REMOTE_POLICY_STALE"):
        policy.narrow(DevicePolicyNarrow(
            deviceId=UUID(approval["deviceId"]), expectedRevision=1,
            projectIds=[second], scopes=[],
        ))
    with pytest.raises(RemotePolicyError, match="REMOTE_SCOPE_EXPANSION_FORBIDDEN"):
        policy.narrow(DevicePolicyNarrow(
            deviceId=UUID(approval["deviceId"]), expectedRevision=2,
            projectIds=[first, second], scopes=["task:draft"],
        ))
    revoked = policy.revoke(DevicePolicyRevoke(
        deviceId=UUID(approval["deviceId"]), expectedRevision=2,
    ))
    assert revoked["status"] == "revoked" and revoked["revision"] == 3
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REVOKED"):
        sessions.authenticate(delivered["sessionToken"])
    assert [row["kind"] for row in storage.session().execute(
        "SELECT kind FROM device_policy_events ORDER BY new_revision"
    )] == ["narrow", "revoke"]
    assert [event["kind"] for event in policy.audit(UUID(approval["deviceId"]))] == [
        "revoke", "narrow",
    ]
    after = DevicePairingService(storage).list_local()
    assert after[0]["status"] == "revoked" and after[0]["validSessionCount"] == 0
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    reopened.migrate(LATEST_SCHEMA)
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REVOKED"):
        RemoteSessionService(reopened).authenticate(delivered["sessionToken"])
    reopened.close()


def test_public_remote_scope_map_matches_authoritative_commands() -> None:
    source = Path(__file__).resolve().parents[2] / "forge_spec_v1.0/planning/commands.json"
    entries = json.loads(source.read_text())
    assert set(REMOTE_COMMAND_SCOPES) == {
        item["method"] for item in entries if item["remoteAllowed"]
    }


def test_approval_rechecks_version_and_hash_then_commits_once(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    project_id = _project(storage, tmp_path / "repo")
    approval, delivered = _pair(storage, [project_id], ["task:approve"])
    second_approval, second_delivered = _pair(storage, [project_id], ["task:approve"])
    sessions = RemoteSessionService(storage)
    drafts = DraftService(storage)
    policy = RemotePolicyService(storage, drafts)
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project_id), "Approval fixture", 0)
    sent = conversations.send(ConversationSend(
        projectId=project_id, conversationId=conversation.conversationId,
        idempotencyKey="remote-approval-message-fixture", text="Build a feature",
        attachmentIds=[],
    ))["message"]
    assert isinstance(sent, ConversationMessage)
    draft = drafts.manual(DraftRequest(
        projectId=project_id, conversationId=conversation.conversationId,
        sourceMessageId=sent.messageId,
        idempotencyKey="remote-approval-draft-fixture",
    ))
    decision_id = uuid4()
    refs = [f"message:{sent.messageId}", f"decision:{decision_id}"]
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project_id),
        revision=2, title="Approval fixture", type="feature",
        goal="Test exact approval freshness", acceptance=[AcceptanceCriterion(
            id="ac1", statement="The user can inspect", method="inspection",
            required=True, sourceRefs=refs,
        )], constraints=[], scope=[], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=refs,
        workflowRef="standard", priority="normal",
    )
    drafts.revise(DraftReviseInput(
        projectId=project_id, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id, decisionSummary="Clarified",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    request = ApprovalService(storage, drafts).request(ApprovalRequestInput(
        projectId=project_id, draftId=draft.draftId, expectedRevision=2,
    )).request
    identity = sessions.require_csrf(delivered["sessionToken"], delivered["csrfToken"])
    policy.approval_fresh(identity, str(project_id), str(request.approvalId),
                          2, request.scopeHash)

    async def no_unmapped_host_call(_request: Any) -> dict[str, Any]:
        raise AssertionError("Remote approval must use the exact Host service")

    dispatcher = RemoteCommandDispatcher(
        sessions, no_unmapped_host_call, lambda _: "p:0", policy, storage, conversations,
        ApprovalService(storage, drafts), drafts,
    )

    def public_approve(revision: int, scope: str,
                       approval_id: UUID = request.approvalId,
                       caller: dict[str, Any] = delivered) -> dict[str, Any]:
        return {"sessionToken": caller["sessionToken"],
                "csrfToken": caller["csrfToken"],
                "request": {"schemaVersion": "1.0", "commandId": str(uuid4()),
                            "method": "tasks.approve", "projectId": str(project_id),
                            "resourceId": str(approval_id),
                            "expectedRevision": revision,
                            "idempotencyKey": str(uuid4()),
                            "payload": {"approvalId": str(approval_id),
                                        "scopeHash": scope}}}

    with pytest.raises(RemoteCommandError, match="REMOTE_APPROVAL_STALE") as wrong_hash:
        dispatcher.handle_command(public_approve(2, "0" * 64))
    assert wrong_hash.value.status == 409

    next_decision = uuid4()
    newer = contract.model_copy(update={
        "revision": 3, "goal": "Changed after approval",
        "sourceRefs": [*refs, f"decision:{next_decision}"],
    })
    drafts.revise(DraftReviseInput(
        projectId=project_id, draftId=draft.draftId, expectedRevision=2,
        contract=newer, decisionId=next_decision, decisionSummary="Changed scope",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    with pytest.raises(RemoteCommandError, match="REMOTE_APPROVAL_STALE") as stale:
        dispatcher.handle_command(public_approve(2, request.scopeHash))
    assert stale.value.status == 409
    row = storage.session().execute(
        "SELECT status FROM task_approvals WHERE approval_id=?",
        (str(request.approvalId),),
    ).fetchone()
    assert row is not None and row["status"] in ("pending", "superseded")
    current = ApprovalService(storage, drafts).request(ApprovalRequestInput(
        projectId=project_id, draftId=draft.draftId, expectedRevision=3,
    )).request
    command = public_approve(3, current.scopeHash, current.approvalId)
    receipt = dispatcher.handle_command(command)
    assert receipt["status"] == "completed"
    assert receipt["result"] == {"approvalId": str(current.approvalId),
                                  "taskId": str(draft.draftId), "state": "todo",
                                  "revision": 3}
    assert dispatcher.handle_command(command) == receipt
    assert storage.session().execute(
        "SELECT count(*) FROM tasks WHERE project_id=? AND state='todo'",
        (str(project_id),),
    ).fetchone()[0] == 1
    with pytest.raises(RemoteCommandError, match="REMOTE_APPROVAL_STALE") as competing:
        dispatcher.handle_command(public_approve(
            3, current.scopeHash, current.approvalId, second_delivered,
        ))
    assert competing.value.status == 409
    with pytest.raises(RemoteCommandError, match="REMOTE_APPROVAL_STALE"):
        dispatcher.handle_command(public_approve(3, current.scopeHash,
                                                 current.approvalId))
    assert storage.session().execute(
        "SELECT count(*) FROM remote_command_receipts WHERE method='tasks.approve'",
    ).fetchone()[0] == 1
    policy.narrow(DevicePolicyNarrow(
        deviceId=UUID(second_approval["deviceId"]), expectedRevision=1,
        projectIds=[project_id], scopes=[],
    ))
    with pytest.raises(RemoteCommandError, match="REMOTE_OPERATION_FORBIDDEN"):
        dispatcher.handle_command(public_approve(
            3, current.scopeHash, current.approvalId, second_delivered,
        ))
    policy.revoke(DevicePolicyRevoke(
        deviceId=UUID(approval["deviceId"]), expectedRevision=1,
    ))
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REVOKED"):
        dispatcher.handle_command(command)
    pending_ids: list[str] = []
    for number in range(2):
        extra_message = conversations.send(ConversationSend(
            projectId=project_id, conversationId=conversation.conversationId,
            idempotencyKey=f"extra-approval-message-{number}",
            text=f"Another task {number}", attachmentIds=[],
        ))["message"]
        assert isinstance(extra_message, ConversationMessage)
        extra_draft = drafts.manual(DraftRequest(
            projectId=project_id, conversationId=conversation.conversationId,
            sourceMessageId=extra_message.messageId,
            idempotencyKey=f"extra-approval-draft-{number}",
        ))
        extra_decision = uuid4()
        extra_refs = [f"message:{extra_message.messageId}",
                      f"decision:{extra_decision}"]
        extra_contract = contract.model_copy(update={
            "taskId": str(extra_draft.draftId), "title": f"Pending {number}",
            "sourceRefs": extra_refs, "acceptance": [AcceptanceCriterion(
                id="ac1", statement="Inspect the result", method="inspection",
                required=True, sourceRefs=extra_refs,
            )],
        })
        drafts.revise(DraftReviseInput(
            projectId=project_id, draftId=extra_draft.draftId, expectedRevision=1,
            contract=extra_contract, decisionId=extra_decision,
            decisionSummary="Fixture decision", resolvedQuestions=[],
            removedAcceptanceIds=[], confirmScopeChange=True,
        ))
        pending_ids.append(str(ApprovalService(storage, drafts).request(
            ApprovalRequestInput(projectId=project_id, draftId=extra_draft.draftId,
                                 expectedRevision=2)
        ).request.approvalId))
    _, reader = _pair(storage, [project_id], ["task:approve"])
    first_page = dispatcher.handle_approvals({
        "sessionToken": reader["sessionToken"], "cursor": None, "limit": 1,
    })
    assert [item["approvalId"] for item in first_page["items"]] == [pending_ids[1]]
    assert first_page["page"]["hasMore"] is True
    second_page = dispatcher.handle_approvals({
        "sessionToken": reader["sessionToken"],
        "cursor": first_page["page"]["cursor"], "limit": 1,
    })
    assert [item["approvalId"] for item in second_page["items"]] == [pending_ids[0]]
    assert second_page["page"] == {"cursor": None, "hasMore": False}
    assert dispatcher.handle_approvals({
        "sessionToken": second_delivered["sessionToken"],
        "cursor": None, "limit": 1,
    })["items"] == []
    with pytest.raises(RemoteCommandError, match="REMOTE_INVALID_REQUEST"):
        dispatcher.handle_approvals({
            "sessionToken": reader["sessionToken"], "cursor": "a:0/../", "limit": 1,
        })
    expiring = storage.session().execute(
        "SELECT request_json,expected_revision,scope_hash FROM task_approvals "
        "WHERE approval_id=?", (pending_ids[0],),
    ).fetchone()
    assert expiring is not None
    old_request = json.loads(expiring["request_json"])
    old_request["expiresAt"] = "2020-01-01T00:00:00Z"
    with storage.transaction() as session:
        session.execute(
            "UPDATE task_approvals SET request_json=? WHERE approval_id=?",
            (json.dumps(old_request), pending_ids[0]),
        )
    with pytest.raises(RemotePolicyError, match="REMOTE_APPROVAL_STALE"):
        policy.approval_fresh(
            sessions.authenticate(reader["sessionToken"]), str(project_id),
            pending_ids[0], expiring["expected_revision"], expiring["scope_hash"],
        )
    assert pending_ids[0] not in [item["approvalId"] for item in
                                  dispatcher.handle_approvals({
                                      "sessionToken": reader["sessionToken"],
                                      "cursor": None, "limit": 50,
                                  })["items"]]
    storage.close()
