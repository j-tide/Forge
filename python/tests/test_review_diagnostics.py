"""A completed Reviewer job must preserve a bounded failure reason across restart."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from test_delivery import accepted_fixture
from test_review_issues import capabilities

from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.executor_contracts import RunCompleted
from forge.handoffs import HandoffService
from forge.persistence import ForgePersistence
from forge.projects import ProjectService
from forge.review_copies import ReviewCopyManager
from forge.review_issues import ReviewIssueService
from forge.review_runtime import HostReviewService, ReviewStartInput
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService
from forge.runs import RunService


@pytest.mark.asyncio
async def test_missing_structured_review_reason_survives_host_restart(tmp_path: Path) -> None:
    _, _, storage, project_id, task_id, snapshot_id = await accepted_fixture(
        tmp_path, accept=False,
    )
    row = storage.session().execute(
        "SELECT run_id FROM runs WHERE task_id=?", (str(task_id),),
    ).fetchone()
    assert row is not None
    run_id = UUID(row["run_id"])
    projects = ProjectService(storage)
    configs = RunConfigService(storage, EnvironmentService(storage))
    handoffs = HandoffService(storage)
    inspections = RunInspectionService(storage, RunService(storage, configs))
    copies = ReviewCopyManager(tmp_path / "review-diagnostics", uuid4(), lambda _run: False)
    await copies.open()
    issues = ReviewIssueService(storage, handoffs, configs, inspections, copies)
    adapter = AsyncMock()
    adapter.probe.return_value = capabilities()

    async def start(request, observe):
        observe(RunCompleted(
            runId=request.runId, sequence=1, timestamp=timestamp(), type="run.completed",
            providerSessionId="fixture-review", structuredOutput=None,
        ))
        handle = AsyncMock()
        handle.wait.return_value = "completed"
        return handle

    adapter.start.side_effect = start
    reviewer = HostReviewService(storage, projects, handoffs, configs,
                                 inspections, copies, issues, adapter=adapter)
    job = await reviewer.start(ReviewStartInput(
        projectId=project_id, taskId=task_id, developmentRunId=run_id,
        expectedSnapshotId=snapshot_id, modelId="fixture-model", idempotencyKey=uuid4(),
    ))
    for _ in range(100):
        job = reviewer.get(project_id, job.reviewRunId)
        if job.state != "running":
            break
        await asyncio.sleep(0.01)
    assert job.state == "completed" and job.errorCode == "REVIEW_RESULT_MISSING"
    reports = issues.list_for_task(project_id, task_id)
    assert len(reports) == 2  # The fixture already contains an older approved Review.
    assert reports[0].status == "inconclusive" and reports[0].result is None
    assert reports[0].diagnosticCode == "REVIEW_RESULT_MISSING"
    assert not issues.issue_history(project_id, task_id)
    assert storage.session().execute(
        "SELECT state FROM tasks WHERE task_id=?", (str(task_id),),
    ).fetchone()["state"] != "done"
    await reviewer.shutdown()
    storage.close()

    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    config_after = RunConfigService(reopened, EnvironmentService(reopened))
    issue_after = ReviewIssueService(
        reopened, HandoffService(reopened), config_after,
        RunInspectionService(reopened, RunService(reopened, config_after)), copies,
    )
    assert issue_after.get(reports[0].reviewId).diagnosticCode == "REVIEW_RESULT_MISSING"
    assert reopened.session().execute("PRAGMA quick_check").fetchone()[0] == "ok"
    reopened.close()
