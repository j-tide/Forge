"""A manual Task Draft remains source-bound and revision controlled."""

from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalError,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.board import BoardError, BoardReorderInput, BoardService
from forge.conversations import ConversationMessage, ConversationSend, ConversationService
from forge.drafts import (
    AcceptanceCriterion,
    DraftError,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService


def test_task_contract_rejects_untrusted_text_and_invalid_dependency() -> None:
    valid = {
        "schemaVersion": "1.0", "taskId": "task-1", "projectId": "project-1",
        "revision": 1, "title": "  Valid title  ", "type": "feature",
        "goal": "A concrete result", "acceptance": [{"id": "AC-1", "statement": "A check",
        "method": "manual", "required": True, "sourceRefs": []}],
        "constraints": [], "scope": [], "outOfScope": [], "dependencies": [],
        "openQuestions": [], "assumptions": [], "sourceRefs": [],
        "workflowRef": "standard@1", "priority": "normal",
    }
    assert TaskContract.model_validate(valid).title == "Valid title"
    with pytest.raises(ValidationError):
        TaskContract.model_validate({**valid, "goal": "   "})
    with pytest.raises(ValidationError):
        TaskContract.model_validate({**valid, "dependencies": ["../other"]})


def test_manual_draft_revision_history_and_source_protection(tmp_path: Path) -> None:
    source = tmp_path / "repo"
    source.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project.projectId), "Need validation", 0)
    sent = conversations.send(
        ConversationSend(
            projectId=project.projectId,
            conversationId=conversation.conversationId,
            idempotencyKey="manual-draft-message-key",
            text="Add validation to add(a,b)",
            attachmentIds=[],
        )
    )
    source_message = sent["message"]
    assert isinstance(source_message, ConversationMessage)
    request = DraftRequest(
        projectId=project.projectId,
        conversationId=conversation.conversationId,
        sourceMessageId=source_message.messageId,
        idempotencyKey="manual-draft-request-key",
    )
    drafts = DraftService(storage)
    draft = drafts.manual(request)
    assert draft.status == "manual" and draft.contract is None
    assert drafts.manual(request).draftId == draft.draftId
    with pytest.raises(DraftError, match="IDEMPOTENCY_CONFLICT"):
        drafts.manual(request.model_copy(update={"idempotencyKey": "other-request-key-01"}))
    changed = drafts.update_text(str(project.projectId), str(draft.draftId), 1, "Validate numbers")
    assert changed.revision == 2
    with pytest.raises(DraftError, match="REVISION_CONFLICT"):
        drafts.update_text(str(project.projectId), str(draft.draftId), 1, "stale")
    decision_id = uuid4()
    decision_ref = f"decision:{decision_id}"
    contract = TaskContract(
        schemaVersion="1.0",
        taskId=str(draft.draftId),
        projectId=str(project.projectId),
        revision=3,
        title="Validate add",
        type="feature",
        goal="Reject invalid inputs",
        acceptance=[
            AcceptanceCriterion(
                id="AC-01", statement="Reject nonnumeric values",
                method="automated", required=True, sourceRefs=[decision_ref]
            )
        ],
        constraints=[],
        scope=["src/add.js"],
        outOfScope=[],
        dependencies=[],
        openQuestions=[],
        assumptions=[],
        sourceRefs=[f"message:{source_message.messageId}", decision_ref],
        workflowRef="standard@1",
        priority="normal",
    )
    revised = drafts.revise(
        DraftReviseInput(
            projectId=project.projectId,
            draftId=draft.draftId,
            expectedRevision=2,
            contract=contract,
            decisionId=decision_id,
            decisionSummary="Human edited scope and acceptance",
            resolvedQuestions=[],
            removedAcceptanceIds=[],
            confirmScopeChange=True,
        )
    )
    assert revised.status == "proposed" and revised.contract == contract
    history = drafts.history(str(project.projectId), str(draft.draftId))
    assert [item.revision for item in history] == [3, 2, 1]
    assert history[0].decisionId == decision_id
    approvals = ApprovalService(storage, drafts)
    pending = approvals.request(
        ApprovalRequestInput(
            projectId=project.projectId, draftId=draft.draftId, expectedRevision=3
        )
    )
    assert pending.status == "pending"
    assert approvals.request(
        ApprovalRequestInput(
            projectId=project.projectId, draftId=draft.draftId, expectedRevision=3
        )
    ).request.approvalId == pending.request.approvalId
    assert storage._db().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
    decision = ApprovalDecision(
        schemaVersion="1.0", approvalId=pending.request.approvalId,
        decision="approve", expectedRevision=3,
        scopeHash=pending.request.scopeHash, reason="Reviewed manually",
    )
    with pytest.raises(ApprovalError, match="APPROVAL_STALE"):
        approvals.decide(ApprovalDecideInput(
            projectId=project.projectId,
            decision=decision.model_copy(update={"scopeHash": "0" * 64}),
        ))
    assert storage._db().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
    approved = approvals.decide(
        ApprovalDecideInput(projectId=project.projectId, decision=decision)
    )
    assert approved.status == "approved" and approved.taskState == "todo"
    assert approvals.decide(
        ApprovalDecideInput(projectId=project.projectId, decision=decision)
    ) == approved
    assert storage._db().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 1
    assert storage._db().execute("SELECT COUNT(*) FROM board_events").fetchone()[0] == 1
    assert storage._db().execute("SELECT state FROM tasks").fetchone()[0] == "todo"
    board = BoardService(storage).snapshot(str(project.projectId))
    assert len(board.tasks) == 1
    assert board.tasks[0].title == "Validate add"
    assert board.tasks[0].state == "todo"
    assert board.eventCursor == "1" and board.boardRevision == 1
    detail = BoardService(storage).detail(str(project.projectId), str(draft.draftId))
    assert detail.detail.contract == contract
    assert {item.kind for item in detail.sources} == {"message", "decision"}
    assert all(item.status == "available" for item in detail.sources)
    next_sent = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="manual-message-key-02", text="Add another check", attachmentIds=[],
    ))
    next_message = next_sent["message"]
    assert isinstance(next_message, ConversationMessage)
    next_draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=next_message.messageId, idempotencyKey="manual-draft-key-02",
    ))
    next_decision = uuid4()
    next_ref = f"decision:{next_decision}"
    next_contract = contract.model_copy(update={
        "taskId": str(next_draft.draftId), "revision": 2, "title": "Another check",
        "sourceRefs": [f"message:{next_message.messageId}", next_ref],
        "acceptance": [AcceptanceCriterion(
            id="AC-02", statement="Second check", method="manual",
            required=True, sourceRefs=[next_ref],
        )],
    })
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=next_draft.draftId,
        expectedRevision=1, contract=next_contract, decisionId=next_decision,
        decisionSummary="Second task", resolvedQuestions=[],
        removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    next_pending = approvals.request(ApprovalRequestInput(
        projectId=project.projectId, draftId=next_draft.draftId, expectedRevision=2,
    ))
    approvals.decide(ApprovalDecideInput(
        projectId=project.projectId,
        decision=ApprovalDecision(
            schemaVersion="1.0", approvalId=next_pending.request.approvalId,
            decision="approve", expectedRevision=2,
            scopeHash=next_pending.request.scopeHash, reason="Reviewed",
        ),
    ))
    before_move = BoardService(storage).snapshot(str(project.projectId))
    assert [task.id for task in before_move.tasks] == [draft.draftId, next_draft.draftId]
    move = BoardReorderInput(
        projectId=project.projectId, taskId=draft.draftId,
        expectedBoardRevision=before_move.boardRevision, idempotencyKey=uuid4(),
        beforeTaskId=next_draft.draftId, afterTaskId=None,
    )
    after_move = BoardService(storage).reorder(move)
    assert [task.id for task in after_move.tasks] == [next_draft.draftId, draft.draftId]
    assert BoardService(storage).reorder(move) == after_move
    with pytest.raises(BoardError, match="REVISION_CONFLICT"):
        BoardService(storage).reorder(move.model_copy(update={"idempotencyKey": uuid4()}))
    reject_sent = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="manual-message-key-03", text="Reject this proposal", attachmentIds=[],
    ))
    reject_message = reject_sent["message"]
    assert isinstance(reject_message, ConversationMessage)
    reject_draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=reject_message.messageId, idempotencyKey="manual-draft-key-03",
    ))
    reject_decision_id = uuid4()
    reject_ref = f"decision:{reject_decision_id}"
    reject_contract = contract.model_copy(update={
        "taskId": str(reject_draft.draftId), "revision": 2, "title": "Reject candidate",
        "sourceRefs": [f"message:{reject_message.messageId}", reject_ref],
        "acceptance": [AcceptanceCriterion(
            id="AC-03", statement="Reject candidate", method="manual",
            required=True, sourceRefs=[reject_ref],
        )],
    })
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=reject_draft.draftId,
        expectedRevision=1, contract=reject_contract,
        decisionId=reject_decision_id, decisionSummary="Human proposal",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    reject_request = approvals.request(ApprovalRequestInput(
        projectId=project.projectId, draftId=reject_draft.draftId, expectedRevision=2,
    ))
    rejected = approvals.decide(ApprovalDecideInput(
        projectId=project.projectId,
        decision=ApprovalDecision(
            schemaVersion="1.0", approvalId=reject_request.request.approvalId,
            decision="reject", expectedRevision=2,
            scopeHash=reject_request.request.scopeHash, reason="Not in scope",
        ),
    ))
    assert rejected.status == "rejected" and rejected.taskState is None
    assert len(BoardService(storage).snapshot(str(project.projectId)).tasks) == 2
    with pytest.raises(DraftError, match="DRAFT_APPROVED"):
        drafts.update_text(str(project.projectId), str(draft.draftId), 3, "not allowed")
    storage.close()

    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert DraftService(reopened).get(str(project.projectId), str(draft.draftId)) == revised
    assert reopened._db().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 2
    reopened.close()
