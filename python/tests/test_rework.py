"""Real SQLite, Git worktree, child process and Verify-triggered rework evidence."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from test_review_issues import capabilities as review_capabilities
from test_run_scheduler import SCRIPT, FixtureAdapter
from test_verifier_project import fixture, git, request

from forge.context import ContextService
from forge.conversations import timestamp
from forge.development import DevelopmentError, RunLaunchInput
from forge.executor_contracts import RunCompleted
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA
from forge.review_runtime import ReviewJob, ReviewRuntimeError, ReviewStartInput
from forge.rework import MAX_REWORK_CYCLES, MAX_TOTAL_ATTEMPTS
from forge.verifier_project import VerifierError, VerifyJob, VerifyStartInput


async def _wait_for_handoff(host: HostRuntime, project_id, run_id) -> None:
    for _ in range(150):
        if host.handoffs.get(project_id, run_id) is not None:
            return
        await asyncio.sleep(.04)
    raise AssertionError("Rework did not produce a durable handoff")


@pytest.mark.asyncio
async def test_failed_check_auto_reworks_from_snapshot_then_passes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, source_head, storage, project_id, task_id, original_run, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path, mode="repair", rework_ready=True)
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    script = tmp_path / "fixture_process.py"
    script.write_text(SCRIPT)
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    assert host.storage_health()["schemaVersion"] == LATEST_SCHEMA
    assert await host.verifier.open() == 0
    host.verifier_ready = True
    await host.attach_executor(FixtureAdapter(host.processes, script, "short"))
    try:
        initial = await host.verifier.start(
            request(project_id, task_id, original_run, snapshot_id, preset.presetId)
        )
        await asyncio.wait_for(asyncio.gather(*host.verifier.running.values()), 15)
        failed = host.verifier.report(project_id, initial.verificationId)
        assert failed is not None and failed.status == "failed" and failed.exitCode == 7
        cycles = host.rework.list_for_task(project_id, task_id)
        assert len(cycles) == 1 and cycles[0].nextRunId is not None
        assert (await host.rework.reserve_verify(failed)).cycleId == cycles[0].cycleId
        await _wait_for_handoff(host, project_id, cycles[0].nextRunId)
        cycle = host.rework.list_for_task(project_id, task_id)[0]
        assert cycle.state == "succeeded" and cycle.cycleNo == 1
        rerun = host.runs.get(project_id, cycle.nextRunId)
        assert rerun is not None and rerun.attempt.attemptNo == 2
        assert host.handoffs.get(project_id, cycle.nextRunId).snapshot.baseRevision == (
            host.handoffs.get(project_id, original_run).snapshot.commitSha
        )
        context = ContextService(host.storage, host.configs)
        bundle_row = host.storage.session().execute(
            "SELECT bundle_id FROM context_bundles WHERE run_id=?",
            (str(cycle.nextRunId),),
        ).fetchone()
        assert bundle_row is not None
        bundle = context.get_bundle(project_id, UUID(bundle_row["bundle_id"]))
        assert bundle is not None and any(item.kind == "rework_feedback" and
                                          item.authority == "verify_evidence"
                                          for item in bundle.items)
        repaired = host.handoffs.get(project_id, cycle.nextRunId)
        assert repaired is not None
        matrix = host.acceptance_matrix.get(project_id, task_id)
        assert matrix.snapshotId == repaired.snapshot.snapshotId
        assert failed.reportId not in [item.reportId for item in matrix.checkReports]
        assert not matrix.requiredCovered
        passed = None
        for _ in range(150):
            later = [job for job in host.verifier.list_for_task(project_id, task_id)
                     if job.developmentRunId == cycle.nextRunId and job.reportId]
            if later:
                passed = host.verifier.report(project_id, later[0].verificationId)
                break
            await asyncio.sleep(.04)
        assert passed is not None and passed.status == "passed" and passed.exitCode == 0
        assert len(host.rework.list_for_task(project_id, task_id)) == 1
        assert git(source, "rev-parse", "HEAD") == source_head
        assert git(source, "status", "--porcelain") == ""
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_failed_rework_gate_can_recover_only_with_real_matching_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, head, storage, project_id, task_id, original_run, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path, mode="repair", rework_ready=True)
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    script = tmp_path / "repair_process.py"
    script.write_text(SCRIPT)
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    await host.verifier.open()
    host.verifier_ready = True
    await host.attach_executor(FixtureAdapter(host.processes, script, "short"))
    start = host.verifier.start
    starts = 0

    async def fail_second_start(value: VerifyStartInput) -> VerifyJob:
        nonlocal starts
        starts += 1
        if starts == 2:
            raise VerifierError("VERIFY_WORKSPACE_UNAVAILABLE")
        return await start(value)

    monkeypatch.setattr(host.verifier, "start", fail_second_start)
    try:
        first = await host.verifier.start(request(
            project_id, task_id, original_run, snapshot_id, preset.presetId,
        ))
        await asyncio.wait_for(asyncio.gather(*host.verifier.running.values()), 15)
        failed = host.verifier.report(project_id, first.verificationId)
        assert failed is not None and failed.status == "failed"
        cycles = host.rework.list_for_task(project_id, task_id)
        assert len(cycles) == 1 and cycles[0].nextRunId is not None
        await _wait_for_handoff(host, project_id, cycles[0].nextRunId)
        blocked = host.rework.list_for_task(project_id, task_id)[0]
        assert blocked.state == "blocked"
        assert blocked.reasonCode == "VERIFY_WORKSPACE_UNAVAILABLE"
        assert host.board.snapshot(str(project_id)).tasks[0].state == "blocked"
        assert "REWORK_UNRESOLVED" in host.final_acceptance.get(
            project_id, task_id,
        ).blockers
        handoff = host.handoffs.get(project_id, blocked.nextRunId)
        assert handoff is not None
        monkeypatch.setattr(host.verifier, "start", start)
        manual = await host.verifier.start(request(
            project_id, task_id, blocked.nextRunId,
            handoff.snapshot.snapshotId, preset.presetId,
        ))
        await asyncio.wait_for(asyncio.gather(*host.verifier.running.values()), 15)
        passed = host.verifier.report(project_id, manual.verificationId)
        assert passed is not None and passed.status == "passed"
        recovered = host.rework.list_for_task(project_id, task_id)[0]
        assert recovered.state == "succeeded"
        assert recovered.reasonCode == "VERIFY_WORKSPACE_UNAVAILABLE"
        assert host.board.snapshot(str(project_id)).tasks[0].state != "blocked"
        after = host.final_acceptance.get(project_id, task_id)
        assert "REWORK_UNRESOLVED" not in after.blockers
        assert "REVIEW_NOT_APPROVED" in after.blockers
        assert git(source, "rev-parse", "HEAD") == head
        assert git(source, "status", "--porcelain") == ""
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_review_blocker_uses_persisted_handoff_for_new_attempt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, _, storage, project_id, task_id, run_id, _, preset, verifier, processes = (
        await fixture(tmp_path, mode="fail", rework_ready=True)
    )
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    script = tmp_path / "review_rework_process.py"
    script.write_text(
        "from pathlib import Path\nimport sys\n"
        "path=Path(sys.argv[1])/'result.txt'\n"
        "path.write_text(path.read_text()+'\\nreview-fix')\n"
    )
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    await host.verifier.open()
    host.verifier_ready = True
    await host.attach_executor(FixtureAdapter(host.processes, script, "short"))
    try:
        handoff = host.handoffs.get(project_id, run_id)
        assert handoff is not None
        copy = await host.review_copies.create(source, handoff.snapshot,
                                               review_capabilities())
        report = await host.review_issues.record(
            project_id, run_id, copy.reviewCopyId, uuid4(), RunCompleted(
                runId=str(copy.ownerReviewRunId), sequence=1, timestamp=timestamp(),
                type="run.completed", providerSessionId="fixture-review",
                structuredOutput={
                    "schemaVersion": "1.0", "snapshotId": str(handoff.snapshot.snapshotId),
                    "taskId": str(task_id), "contractRevision": 2, "profileRevision": 1,
                    "outcome": "changes_requested",
                    "blockingIssues": [{
                        "anchor": {"path": "result.txt", "lineStart": 1, "lineEnd": 1},
                        "basis": {"kind": "acceptance", "sourceRef": "AC-01"},
                        "reason": "The result file does not match the required output",
                        "impact": "AC-01 remains unverified",
                    }], "suggestions": [], "unknowns": [],
                    "summary": "Revise the result file to meet AC-01",
                },
            ),
        )
        assert report.status == "changes_requested" and report.reworkHandoff is not None
        await host._review_rework(report)
        cycles = host.rework.list_for_task(project_id, task_id)
        assert len(cycles) == 1 and cycles[0].triggerKind == "review"
        assert cycles[0].nextRunId is not None
        await _wait_for_handoff(host, project_id, cycles[0].nextRunId)
        assert host.runs.get(project_id, cycles[0].nextRunId).attempt.attemptNo == 2
        row = host.storage.session().execute(
            "SELECT bundle_json FROM context_bundles WHERE run_id=?",
            (str(cycles[0].nextRunId),),
        ).fetchone()
        assert row is not None and "review_evidence" in row["bundle_json"]
        assert "The result file does not match" in row["bundle_json"]
        # This unit fixture supplies no persisted ReviewJob and no real read-only
        # Reviewer adapter. The next gate must fail closed instead of forging approval.
        after = host.rework.list_for_task(project_id, task_id)[0]
        assert after.state == "blocked" and after.reasonCode == "REWORK_GATE_UNAVAILABLE"
        board_task = host.board.snapshot(str(project_id)).tasks[0]
        assert board_task.state == "blocked"
        assert board_task.blockReason is not None
        assert "无法启动" in board_task.blockReason
        assert "达到上限" not in board_task.blockReason
        next_handoff = host.handoffs.get(project_id, cycles[0].nextRunId)
        assert next_handoff is not None
        # Seed only the persisted source-job metadata to test forwarding of its
        # frozen reviewer identity; this fixture has no read-only provider.
        with host.storage.transaction() as db:
            db.execute(
                "INSERT INTO review_jobs(review_run_id,idempotency_key,project_id,task_id,"
                "development_run_id,snapshot_id,review_copy_id,review_attempt_id,"
                "model_id,state,report_id,created_at,updated_at,profile_id,"
                "profile_revision,profile_hash) VALUES(?,?,?,?,?,?,?,?,?,'completed',?,?,?,?,?,?)",
                (str(copy.ownerReviewRunId), str(uuid4()), str(project_id), str(task_id),
                 str(run_id), str(handoff.snapshot.snapshotId), str(copy.reviewCopyId),
                 str(report.reviewAttemptId), "fixture-model", str(report.reviewId),
                 timestamp(), timestamp(), "profile.fixture.reviewer", 2, "a" * 64),
            )
        assert host.review_runtime is not None
        received: list[ReviewStartInput] = []

        async def unavailable_review(value: ReviewStartInput) -> ReviewJob:
            received.append(value)
            raise ReviewRuntimeError("REVIEW_READ_ONLY_UNAVAILABLE")

        monkeypatch.setattr(host.review_runtime, "start", unavailable_review)
        await host._advance_rework(next_handoff)
        assert len(received) == 1
        assert received[0].modelId == "fixture-model"
        assert received[0].profileId == "profile.fixture.reviewer"
        assert received[0].profileRevision == 2
        assert received[0].expectedSnapshotId == next_handoff.snapshot.snapshotId
        await host.verifier.start(request(
            project_id, task_id, cycles[0].nextRunId,
            next_handoff.snapshot.snapshotId, preset.presetId,
        ))
        for _ in range(100):
            mixed = host.rework.list_for_task(project_id, task_id)
            if any(item.cycleNo == 2 for item in mixed):
                break
            await asyncio.sleep(.04)
        second = next(item for item in mixed if item.cycleNo == 2)
        assert second.triggerKind == "verify" and second.totalAttempts > cycles[0].totalAttempts
        assert next(item for item in mixed if item.cycleNo == 1).state == "blocked"
        assert git(source, "status", "--porcelain") == ""
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_cancel_mid_rework_stops_owned_process_before_terminal_state(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, _, storage, project_id, task_id, run_id, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path, mode="fail", rework_ready=True)
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    script = tmp_path / "long_process.py"
    script.write_text(SCRIPT)
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    assert await host.verifier.open() == 0
    host.verifier_ready = True
    await host.attach_executor(FixtureAdapter(host.processes, script, "long"))
    try:
        job = await host.verifier.start(request(
            project_id, task_id, run_id, snapshot_id, preset.presetId,
        ))
        await asyncio.wait_for(asyncio.gather(*host.verifier.running.values()), 15)
        assert host.verifier.report(project_id, job.verificationId).status == "failed"
        cycle = host.rework.list_for_task(project_id, task_id)[0]
        assert cycle.nextRunId is not None
        for _ in range(100):
            if host.processes.has_active(str(cycle.nextRunId)):
                break
            await asyncio.sleep(.03)
        assert host.processes.has_active(str(cycle.nextRunId))
        cancelled = await host.development.cancel(project_id, cycle.nextRunId)
        assert cancelled.state == "cancelled"
        assert not host.processes.has_active(str(cycle.nextRunId))
        assert host.rework.list_for_task(project_id, task_id)[0].state == "cancelled"
        assert git(source, "status", "--porcelain") == ""
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_shared_rework_limit_projects_blocked_without_new_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source, _, storage, project_id, task_id, run_id, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path, mode="fail", rework_ready=True)
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    script = tmp_path / "append_process.py"
    script.write_text(
        "from pathlib import Path\nimport sys\n"
        "path=Path(sys.argv[1])/'result.txt'\n"
        "path.write_text(path.read_text()+'\\nrework')\n"
    )
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    assert await host.verifier.open() == 0
    host.verifier_ready = True
    await host.attach_executor(FixtureAdapter(host.processes, script, "short"))
    try:
        await host.verifier.start(request(
            project_id, task_id, run_id, snapshot_id, preset.presetId,
        ))
        cycles = []
        for _ in range(300):
            cycles = host.rework.list_for_task(project_id, task_id)
            if len(cycles) == MAX_REWORK_CYCLES + 1 and cycles[0].state == "blocked":
                break
            await asyncio.sleep(.04)
        assert [item.cycleNo for item in cycles] == [4, 3, 2, 1]
        assert cycles[0].reasonCode == "REWORK_LIMIT_REACHED"
        assert cycles[0].nextRunId is None
        assert all(item.nextRunId is not None for item in cycles[1:])
        for cycle in cycles[1:]:
            assert host.handoffs.get(project_id, cycle.nextRunId) is not None
        board_task = host.board.snapshot(str(project_id)).tasks[0]
        assert board_task.state == "blocked" and board_task.activeRunId is None
        assert board_task.blockReason is not None
        with pytest.raises(DevelopmentError, match="RUN_CONFLICT"):
            await host.development.start(RunLaunchInput(
                projectId=project_id, taskId=task_id,
                expectedTaskRevision=2, modelId="fixture-model",
                idempotencyKey=uuid4(),
            ))
        assert git(source, "status", "--porcelain") == ""
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_total_attempt_budget_blocks_before_first_rework(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, _, storage, project_id, task_id, run_id, snapshot_id, preset, \
        verifier, processes = await fixture(tmp_path, mode="fail", rework_ready=True)
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    assert await host.verifier.open() == 0
    host.verifier_ready = True
    try:
        last = None
        for _ in range(MAX_TOTAL_ATTEMPTS - 1):
            job = await host.verifier.start(request(
                project_id, task_id, run_id, snapshot_id, preset.presetId,
            ))
            await asyncio.wait_for(asyncio.gather(*host.verifier.running.values()), 10)
            last = host.verifier.report(project_id, job.verificationId)
            assert last is not None and last.status == "failed"
        assert last is not None
        cycle = await host.rework.reserve_verify(last)
        assert cycle.totalAttempts == MAX_TOTAL_ATTEMPTS
        assert cycle.state == "blocked" and cycle.nextRunId is None
        assert cycle.reasonCode == "REWORK_LIMIT_REACHED"
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_published_workflow_global_budget_blocks_rework_at_frozen_limit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, _, storage, project_id, task_id, run_id, snapshot_id, preset, \
        verifier, processes = await fixture(
            tmp_path, mode="fail", rework_ready=True, custom_workflow=True,
        )
    assert preset is not None
    await verifier.shutdown()
    await processes.dispose()
    storage.close()
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    assert await host.verifier.open() == 0
    host.verifier_ready = True
    try:
        config = host.configs.get(project_id, run_id)
        assert config is not None and host.rework._attempt_limit(config) == 16
        last = None
        for _ in range(15):
            job = await host.verifier.start(request(
                project_id, task_id, run_id, snapshot_id, preset.presetId,
            ))
            await asyncio.wait_for(asyncio.gather(*host.verifier.running.values()), 10)
            last = host.verifier.report(project_id, job.verificationId)
            assert last is not None and last.status == "failed"
        assert last is not None
        cycle = await host.rework.reserve_verify(last)
        assert cycle.totalAttempts == 16
        assert cycle.state == "blocked" and cycle.nextRunId is None
        assert cycle.reasonCode == "REWORK_LIMIT_REACHED"
    finally:
        await host.shutdown()
