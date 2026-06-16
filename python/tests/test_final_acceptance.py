"""Final Owner acceptance uses a real Git snapshot, reports and SQLite CAS."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest
from test_review_issues import capabilities
from test_run_scheduler import SCRIPT, FixtureAdapter
from test_verifier_project import fixture, git, request

from forge.acceptance_matrix import AcceptanceDecisionInput, AcceptanceMatrixService
from forge.board import BoardService
from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.executor_contracts import RunCompleted
from forge.final_acceptance import (
    AdvisoryWaiverInput,
    FinalAcceptanceError,
    FinalAcceptanceInput,
    FinalAcceptanceService,
)
from forge.handoffs import HandoffService
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import ProjectService
from forge.protocol import TRANSPORT_VERSION, RpcRequest
from forge.review_copies import ReviewCopyManager
from forge.review_issues import ReviewIssueService
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService
from forge.runs import RunService


@pytest.mark.asyncio
async def test_final_acceptance_rechecks_reports_and_never_merges_source(
    tmp_path: Path,
) -> None:
    source, head, storage, project_id, task_id, run_id, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path)
    assert preset is not None
    projects = ProjectService(storage)
    configs = RunConfigService(storage, EnvironmentService(storage))
    matrix = AcceptanceMatrixService(storage, projects, configs, verifier)
    service = FinalAcceptanceService(storage, projects, matrix)
    initial = service.get(project_id, task_id)
    assert initial.status == "unavailable"
    assert "REVIEW_NOT_APPROVED" in initial.blockers
    assert "ACCEPTANCE_NOT_COVERED" in initial.blockers
    with pytest.raises(FinalAcceptanceError, match="ACCEPTANCE_GATE_BLOCKED"):
        service.decide(FinalAcceptanceInput(
            projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
            expectedContractRevision=2, expectedBasisHash=initial.basisHash,
            decision="accept", reason="I examined the current snapshot and reports.",
            idempotencyKey=uuid4(),
        ))
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
                "outcome": "approved", "blockingIssues": [], "suggestions": [{
                    "anchor": {"path": "result.txt", "lineStart": 1, "lineEnd": 1},
                    "basis": {"kind": "engineering", "sourceRef": "test readability"},
                    "reason": "The fixture output wording could be clearer",
                    "impact": "Readability only, no security or correctness effect",
                }],
                "unknowns": [], "summary": "Current code has no Review blocker",
            },
        ),
    )
    assert review.status == "approved"
    advisory = service.get(project_id, task_id).advisoryIssues
    assert len(advisory) == 1 and advisory[0].severity == "advisory"
    job = await verifier.start(request(project_id, task_id, run_id, snapshot_id,
                                       preset.presetId))
    await asyncio.wait_for(asyncio.gather(*verifier.running.values()), 8)
    report = verifier.report(project_id, job.verificationId)
    assert report is not None and report.status == "passed"
    for criterion_id, report_id in (("AC-01", report.reportId), ("AC-02", None)):
        matrix.decide(AcceptanceDecisionInput(
            projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
            expectedContractRevision=2, criterionId=criterion_id, status="verified",
            reportId=report_id, reason="I checked this criterion on the current snapshot.",
            idempotencyKey=uuid4(),
        ))
    uncovered = service.get(project_id, task_id)
    assert uncovered.status == "unavailable"
    assert "REVIEW_ISSUES_UNRESOLVED" in uncovered.blockers
    waiver = AdvisoryWaiverInput(
        projectId=project_id, taskId=task_id, issueId=advisory[0].issueId,
        expectedSnapshotId=snapshot_id, expectedReviewId=review.reviewId,
        expectedIssueRevision=advisory[0].revision, nonSecurityConfirmed=True,
        reason="I accept this wording suggestion; it has no security impact.",
        idempotencyKey=uuid4(),
    )
    waived = service.waive_advisory(waiver)
    assert waived.advisoryIssues[0].status == "waived"
    assert waived.advisoryIssues[0].revision == advisory[0].revision + 1
    assert service.waive_advisory(waiver).advisoryIssues[0].status == "waived"
    receipt = storage.session().execute(
        "SELECT actor,issue_revision,reason FROM review_advisory_waivers WHERE issue_id=?",
        (str(advisory[0].issueId),),
    ).fetchone()
    assert receipt is not None and receipt["actor"] == "local-owner"
    assert receipt["issue_revision"] == advisory[0].revision
    ready = service.get(project_id, task_id)
    assert ready.status == "ready" and ready.blockers == []
    assert ready.reviewReportId == review.reviewId
    assert ready.verifyReportIds == [report.reportId]
    stale = FinalAcceptanceInput(
        projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
        expectedContractRevision=2, expectedBasisHash=ready.basisHash,
        decision="accept", reason="I examined this exact version and its reports.",
        idempotencyKey=uuid4(),
    )
    # A report added after the Owner's read invalidates the old basis.
    another = await verifier.start(request(project_id, task_id, run_id, snapshot_id,
                                           preset.presetId))
    await asyncio.wait_for(asyncio.gather(*verifier.running.values()), 8)
    assert verifier.report(project_id, another.verificationId) is not None
    with pytest.raises(FinalAcceptanceError, match="ACCEPTANCE_SOURCE_STALE"):
        service.decide(stale)
    fresh = service.get(project_id, task_id)
    accepted = service.decide(stale.model_copy(update={
        "expectedBasisHash": fresh.basisHash,
    }))
    assert accepted.status == "accepted"
    assert accepted.decision is not None and accepted.decision.actor == "local-owner"
    assert service.decide(stale.model_copy(update={
        "expectedBasisHash": fresh.basisHash,
    })).decision == accepted.decision
    task = BoardService(storage).detail(str(project_id), str(task_id)).detail.task
    assert task.state == "done" and task.boardColumn == "done"
    assert git(source, "rev-parse", "HEAD") == head
    assert git(source, "status", "--porcelain") == ""
    await verifier.shutdown()
    await processes.dispose()
    await copies.release(copy.reviewCopyId)
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    assert BoardService(reopened).detail(str(project_id), str(task_id)).detail.task.state == "done"
    reopened.close()


@pytest.mark.asyncio
async def test_human_return_creates_new_owned_attempt_and_stales_old_snapshot(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, source_head, storage, project_id, task_id, source_run, source_snapshot, \
        _, verifier, processes = await fixture(tmp_path, rework_ready=True)
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    script = tmp_path / "owner_return_process.py"
    script.write_text(SCRIPT)
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    await host.verifier.open()
    host.verifier_ready = True
    await host.attach_executor(FixtureAdapter(host.processes, script, "short"))
    try:
        preview = host.final_acceptance.get(project_id, task_id)
        assert preview.snapshotId == source_snapshot
        decision = FinalAcceptanceInput(
            projectId=project_id, taskId=task_id,
            expectedSnapshotId=source_snapshot, expectedContractRevision=2,
            expectedBasisHash=preview.basisHash, decision="return",
            reason="The output needs a new attempt with the expected behavior.",
            idempotencyKey=uuid4(),
        )
        response = await host.dispatch_async(RpcRequest(
            jsonrpc="2.0", id="return-fixture", method="run.finalDecide",
            params=decision.model_dump(mode="json"), transportVersion=TRANSPORT_VERSION,
        ))
        assert response["data"]["status"] == "returned"
        result = host.final_acceptance.get(project_id, task_id)
        assert result.decision is not None and result.decision.nextRunId is not None
        next_run_id = result.decision.nextRunId
        for _ in range(150):
            if host.handoffs.get(project_id, next_run_id) is not None:
                break
            await asyncio.sleep(.04)
        next_handoff = host.handoffs.get(project_id, next_run_id)
        assert next_handoff is not None
        assert next_handoff.snapshot.baseRevision == (
            host.handoffs.get(project_id, source_run).snapshot.commitSha
        )
        new_run = host.runs.get(project_id, next_run_id)
        assert new_run is not None and new_run.attempt.attemptNo == 2
        next_view = host.final_acceptance.get(project_id, task_id)
        assert next_view.snapshotId == next_handoff.snapshot.snapshotId
        assert next_view.decision is None and next_view.status == "unavailable"
        with pytest.raises(FinalAcceptanceError, match="ACCEPTANCE_SOURCE_STALE"):
            host.final_acceptance.decide(decision.model_copy(update={
                "decision": "accept", "idempotencyKey": uuid4(),
            }))
        assert git(source, "rev-parse", "HEAD") == source_head
        assert git(source, "status", "--porcelain") == ""
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_blocking_review_issue_cannot_be_waived_as_advisory(tmp_path: Path) -> None:
    source, _, storage, project_id, task_id, run_id, snapshot_id, _, \
        verifier, processes = await fixture(tmp_path)
    projects = ProjectService(storage)
    configs = RunConfigService(storage, EnvironmentService(storage))
    service = FinalAcceptanceService(
        storage, projects, AcceptanceMatrixService(storage, projects, configs, verifier),
    )
    handoff = HandoffService(storage).get(project_id, run_id)
    assert handoff is not None
    copies = ReviewCopyManager(tmp_path / "blocking-review", uuid4(), lambda _run: False)
    await copies.open()
    copy = await copies.create(source, handoff.snapshot, capabilities())
    reviews = ReviewIssueService(
        storage, HandoffService(storage), configs,
        RunInspectionService(storage, RunService(storage, configs)), copies,
    )
    report = await reviews.record(
        project_id, run_id, copy.reviewCopyId, uuid4(), RunCompleted(
            runId=str(copy.ownerReviewRunId), sequence=1, timestamp=timestamp(),
            type="run.completed", providerSessionId="fixture-blocking-review",
            structuredOutput={
                "schemaVersion": "1.0", "snapshotId": str(snapshot_id),
                "taskId": str(task_id), "contractRevision": 2, "profileRevision": 1,
                "outcome": "changes_requested", "blockingIssues": [{
                    "anchor": {"path": "result.txt", "lineStart": 1, "lineEnd": 1},
                    "basis": {"kind": "acceptance", "sourceRef": "AC-01"},
                    "reason": "The required output is still wrong",
                    "impact": "AC-01 does not pass",
                }], "suggestions": [], "unknowns": [],
                "summary": "Fix the required output before acceptance",
            },
        ),
    )
    issue = service.get(project_id, task_id).advisoryIssues[0]
    assert issue.severity == "blocking"
    with pytest.raises(FinalAcceptanceError, match="ACCEPTANCE_ISSUE_NOT_WAIVABLE"):
        service.waive_advisory(AdvisoryWaiverInput(
            projectId=project_id, taskId=task_id, issueId=issue.issueId,
            expectedSnapshotId=snapshot_id, expectedReviewId=report.reviewId,
            expectedIssueRevision=issue.revision, nonSecurityConfirmed=True,
            reason="I would like to ignore this required failure.",
            idempotencyKey=uuid4(),
        ))
    assert storage.session().execute(
        "SELECT count(*) n FROM review_advisory_waivers",
    ).fetchone()["n"] == 0
    await verifier.shutdown()
    await processes.dispose()
    await copies.release(copy.reviewCopyId)
    storage.close()
