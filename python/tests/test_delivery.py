"""Explicit local merge is guarded by durable intent and a target HEAD CAS."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from test_review_issues import capabilities
from test_verifier_project import fixture, git, request

from forge.acceptance_matrix import AcceptanceDecisionInput, AcceptanceMatrixService
from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.board import BoardReorderInput, BoardService
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.delivery import DeliveryError, DeliveryService, MergeRequest
from forge.drafts import DraftRequest, DraftReviseInput, DraftService
from forge.environments import EnvironmentService
from forge.executor_contracts import RunCompleted
from forge.final_acceptance import FinalAcceptanceInput, FinalAcceptanceService
from forge.handoffs import HandoffService
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.processes import ProcessController
from forge.projects import ProjectService
from forge.protocol import TRANSPORT_VERSION, RpcRequest
from forge.review_copies import ReviewCopyManager
from forge.review_issues import ReviewIssueService
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService
from forge.runs import RunService
from forge.verifier_project import ProjectCommandVerifier


def delivery_service(storage: ForgePersistence, tmp_path: Path) -> DeliveryService:
    projects = ProjectService(storage)
    environments = EnvironmentService(storage)
    configs = RunConfigService(storage, environments)
    verifier = ProjectCommandVerifier(
        storage, projects, environments, configs, HandoffService(storage),
        ProcessController(uuid4(), tmp_path / "delivery-processes"),
        tmp_path / "delivery-verifier-workspaces",
    )
    matrix = AcceptanceMatrixService(storage, projects, configs, verifier)
    return DeliveryService(storage, projects, FinalAcceptanceService(storage, projects, matrix))


async def accepted_fixture(tmp_path: Path):
    source, head, storage, project_id, task_id, run_id, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path)
    assert preset is not None
    projects = ProjectService(storage)
    configs = RunConfigService(storage, EnvironmentService(storage))
    matrix = AcceptanceMatrixService(storage, projects, configs, verifier)
    final = FinalAcceptanceService(storage, projects, matrix)
    handoff = HandoffService(storage).get(project_id, run_id)
    assert handoff is not None
    copies = ReviewCopyManager(tmp_path / "review-copies", uuid4(), lambda _run: False)
    await copies.open()
    copy = await copies.create(source, handoff.snapshot, capabilities())
    review_service = ReviewIssueService(
        storage, HandoffService(storage), configs,
        RunInspectionService(storage, RunService(storage, configs)), copies,
    )
    review = await review_service.record(
        project_id, run_id, copy.reviewCopyId, uuid4(), RunCompleted(
            runId=str(copy.ownerReviewRunId), sequence=1, timestamp=timestamp(),
            type="run.completed", providerSessionId="fixture-review",
            structuredOutput={
                "schemaVersion": "1.0", "snapshotId": str(snapshot_id),
                "taskId": str(task_id), "contractRevision": 2, "profileRevision": 1,
                "outcome": "approved", "blockingIssues": [], "suggestions": [],
                "unknowns": [], "summary": "Fixed snapshot has no Review blocker",
            },
        ),
    )
    assert review.status == "approved"
    job = await verifier.start(request(project_id, task_id, run_id, snapshot_id,
                                       preset.presetId))
    await asyncio.wait_for(asyncio.gather(*verifier.running.values()), 8)
    report = verifier.report(project_id, job.verificationId)
    assert report is not None and report.status == "passed"
    for criterion_id, report_id in (("AC-01", report.reportId), ("AC-02", None)):
        matrix.decide(AcceptanceDecisionInput(
            projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
            expectedContractRevision=2, criterionId=criterion_id, status="verified",
            reportId=report_id, reason="Owner checked current criterion and report.",
            idempotencyKey=uuid4(),
        ))
    preview = final.get(project_id, task_id)
    assert preview.status == "ready"
    accepted = final.decide(FinalAcceptanceInput(
        projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
        expectedContractRevision=2, expectedBasisHash=preview.basisHash,
        decision="accept", reason="Owner checked the current report and snapshot.",
        idempotencyKey=uuid4(),
    ))
    assert accepted.status == "accepted"
    await verifier.shutdown()
    await processes.dispose()
    await copies.release(copy.reviewCopyId)
    return source, head, storage, project_id, task_id, snapshot_id


@pytest.mark.asyncio
async def test_delivery_merge_is_explicit_once_and_restart_reconciles(tmp_path: Path) -> None:
    source, base, storage, project_id, task_id, snapshot_id = await accepted_fixture(tmp_path)
    service = delivery_service(storage, tmp_path)
    # The read model obtains its evidence from the persisted accepted decision.
    summary = service.get(project_id, task_id)
    assert summary.snapshotId == snapshot_id
    assert summary.planStatus == "not_configured"
    assert summary.attemptRunIds and summary.reviewReportIds and summary.verifyReportIds
    assert service.get(project_id, task_id).contentHash == summary.contentHash
    preview = service.preview(project_id, task_id)
    assert preview.canMerge and preview.targetHead == base
    operation = MergeRequest(
        projectId=project_id, taskId=task_id, deliveryId=summary.deliveryId,
        targetBranch="main", expectedTargetHead=base, expectedSnapshotId=snapshot_id,
        confirmed=True, idempotencyKey=uuid4(),
    )
    first = service.merge(operation)
    assert first.state == "merged" and first.resultCommit == git(source, "rev-parse", "HEAD")
    parents = git(source, "rev-list", "--parents", "-n", "1", first.resultCommit).split()
    assert parents == [first.resultCommit, base, summary.snapshotCommit]
    assert git(source, "status", "--porcelain") == ""
    assert service.merge(operation) == first
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    with reopened.transaction() as db:
        db.execute("UPDATE merge_operations SET state='intent',result_commit=NULL "
                   "WHERE operation_id=?", (str(first.operationId),))
    # Crash recovery requires the Forge-owned candidate worktree as evidence;
    # reconstruct that fixture after this completed merge's normal cleanup.
    candidate = tmp_path / "data" / "merge-workspaces" / str(first.operationId)
    git(source, "worktree", "add", "--detach", str(candidate), first.resultCommit)
    again = delivery_service(reopened, tmp_path).merge(operation)
    assert again.state == "merged" and again.resultCommit == first.resultCommit
    assert git(source, "rev-parse", "HEAD") == first.resultCommit
    reopened.close()


async def mixed_status_board_fixture(
    tmp_path: Path,
) -> tuple[ForgePersistence, UUID, UUID, list[UUID]]:
    _, _, storage, project_id, done_id, _ = await accepted_fixture(tmp_path)
    board = BoardService(storage)
    board.final_acceptance = delivery_service(storage, tmp_path).final
    assert board.detail(str(project_id), str(done_id)).detail.task.boardColumn == "done"
    contract = board.detail(str(project_id), str(done_id)).detail.contract
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project_id), "Board ordering", 0)
    drafts = DraftService(storage)
    approvals = ApprovalService(storage, drafts)
    todo_ids: list[UUID] = []
    for number in (1, 2):
        sent = conversations.send(ConversationSend(
            projectId=project_id, conversationId=conversation.conversationId,
            idempotencyKey=f"board-message-fixture-{number}", text=f"Board TODO {number}",
            attachmentIds=[],
        ))
        message = sent["message"]
        draft = drafts.manual(DraftRequest(
            projectId=project_id, conversationId=conversation.conversationId,
            sourceMessageId=message.messageId, idempotencyKey=f"board-draft-fixture-{number}",
        ))
        decision_id = uuid4()
        decision_ref = f"decision:{decision_id}"
        updated = contract.model_copy(update={
            "taskId": str(draft.draftId), "revision": 2,
            "title": f"Board TODO {number}", "goal": f"Keep TODO {number} unstarted.",
            "sourceRefs": [f"message:{message.messageId}", decision_ref],
            "acceptance": [contract.acceptance[0].model_copy(update={
                "sourceRefs": [decision_ref],
            })],
        })
        drafts.revise(DraftReviseInput(
            projectId=project_id, draftId=draft.draftId, expectedRevision=1,
            contract=updated, decisionId=decision_id,
            decisionSummary="Board fixture approved", resolvedQuestions=[],
            removedAcceptanceIds=[], confirmScopeChange=True,
        ))
        pending = approvals.request(ApprovalRequestInput(
            projectId=project_id, draftId=draft.draftId, expectedRevision=2,
        ))
        approvals.decide(ApprovalDecideInput(
            projectId=project_id, decision=ApprovalDecision(
                schemaVersion="1.0", approvalId=pending.request.approvalId,
                decision="approve", expectedRevision=2,
                scopeHash=pending.request.scopeHash, reason="Fixture reviewed",
            ),
        ))
        todo_ids.append(draft.draftId)
    return storage, project_id, done_id, todo_ids


@pytest.mark.asyncio
async def test_todo_reorder_ignores_completed_delivery_card(tmp_path: Path) -> None:
    storage, project_id, done_id, todo_ids = await mixed_status_board_fixture(tmp_path)
    board = BoardService(storage)
    board.final_acceptance = delivery_service(storage, tmp_path).final
    before = board.snapshot(str(project_id))
    assert len(before.tasks) == 3
    assert [item.id for item in before.tasks if item.boardColumn == "todo"] == todo_ids
    moved = board.reorder(BoardReorderInput(
        projectId=project_id, taskId=todo_ids[0], expectedBoardRevision=before.boardRevision,
        idempotencyKey=uuid4(), beforeTaskId=todo_ids[1], afterTaskId=None,
    ))
    assert [item.id for item in moved.tasks if item.boardColumn == "todo"] == todo_ids[::-1]
    assert next(item for item in moved.tasks if item.id == done_id).boardColumn == "done"
    storage.close()


@pytest.mark.asyncio
async def test_merge_refuses_target_drift_without_mutating_source(tmp_path: Path) -> None:
    source, base, storage, project_id, task_id, snapshot_id = await accepted_fixture(tmp_path)
    service = delivery_service(storage, tmp_path)
    summary = service.get(project_id, task_id)
    (source / "other.txt").write_text("another user change\n")
    git(source, "add", "other.txt")
    git(source, "commit", "-m", "target moved")
    changed = git(source, "rev-parse", "HEAD")
    assert changed != base
    preview = service.preview(project_id, task_id)
    assert "MERGE_REVALIDATION_REQUIRED" in preview.blockers
    with pytest.raises(DeliveryError, match="MERGE_REVALIDATION_REQUIRED"):
        service.merge(MergeRequest(
            projectId=project_id, taskId=task_id, deliveryId=summary.deliveryId,
            targetBranch="main", expectedTargetHead=base, expectedSnapshotId=snapshot_id,
            confirmed=True, idempotencyKey=uuid4(),
        ))
    assert git(source, "rev-parse", "HEAD") == changed
    assert git(source, "status", "--porcelain") == ""
    storage.close()


@pytest.mark.asyncio
async def test_delivery_refuses_evidence_changed_after_owner_acceptance(tmp_path: Path) -> None:
    source, base, storage, project_id, task_id, snapshot_id = await accepted_fixture(tmp_path)
    service = delivery_service(storage, tmp_path)
    report = storage.session().execute(
        "SELECT r.report_id FROM verifier_reports r JOIN verifier_jobs j "
        "ON j.verification_id=r.verification_id WHERE j.task_id=? LIMIT 1",
        (str(task_id),),
    ).fetchone()
    assert report is not None
    service.final.matrix.decide(AcceptanceDecisionInput(
        projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
        expectedContractRevision=2, criterionId="AC-01", status="verified",
        reportId=UUID(report["report_id"]), reason="Owner reconsidered this exact criterion.",
        idempotencyKey=uuid4(),
    ))
    assert service.final.get(project_id, task_id).status == "ready"
    board = BoardService(storage)
    board.final_acceptance = service.final
    assert board.detail(str(project_id), str(task_id)).detail.task.state != "done"
    with pytest.raises(DeliveryError, match="DELIVERY_NOT_ACCEPTED"):
        service.get(project_id, task_id)
    assert git(source, "rev-parse", "HEAD") == base
    assert git(source, "status", "--porcelain") == ""
    storage.close()


@pytest.mark.asyncio
async def test_host_jsonrpc_merge_without_executor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, base, storage, project_id, task_id, snapshot_id = await accepted_fixture(tmp_path)
    storage.close()
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    try:
        query = RpcRequest(jsonrpc="2.0", id="delivery", method="deliveries.get",
                           params={"projectId": str(project_id), "taskId": str(task_id)},
                           transportVersion=TRANSPORT_VERSION)
        record = host.dispatch(query)["data"]
        merge = MergeRequest(
            projectId=project_id, taskId=task_id, deliveryId=UUID(record["deliveryId"]),
            targetBranch="main", expectedTargetHead=base, expectedSnapshotId=snapshot_id,
            confirmed=True, idempotencyKey=uuid4(),
        )
        response = await host.dispatch_async(RpcRequest(
            jsonrpc="2.0", id="merge", method="deliveries.merge",
            params=merge.model_dump(mode="json"), transportVersion=TRANSPORT_VERSION,
        ))
        assert response["data"]["state"] == "merged"
        assert response["data"]["resultCommit"] == git(source, "rev-parse", "HEAD")
        task = host.board.detail(str(project_id), str(task_id)).detail.task
        assert task.blockReason is not None and "显式本地合并" in task.blockReason
    finally:
        await host.shutdown()
