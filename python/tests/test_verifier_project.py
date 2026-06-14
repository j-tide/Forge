"""Real Git, SQLite and process evidence for the project command verifier."""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from forge.acceptance_matrix import (
    AcceptanceDecisionInput,
    AcceptanceMatrixError,
    AcceptanceMatrixService,
)
from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.board import BoardService
from forge.context import build_context_bundle
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.development import _BUDGET, _PROFILE_ID, _WORKFLOW_VERSION, _hash, _node
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import (
    EnvironmentConfig,
    EnvironmentSaveInput,
    EnvironmentService,
    PresetSaveInput,
)
from forge.handoffs import HandoffService, build_development_handoff
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.processes import ProcessController
from forge.projects import TRUST_VERSION, ProjectService
from forge.protocol import HOST_PROTOCOL_VERSION, TRANSPORT_VERSION
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
)
from forge.runs import RunService
from forge.verifier_project import (
    ProjectCommandVerifier,
    VerifierError,
    VerifyStartInput,
    _relative_cwd,
)
from forge.workspaces import WorkspaceManager


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], check=True, capture_output=True,
        text=True, timeout=20,
    ).stdout.strip()


async def fixture(tmp_path: Path, *, mode: str = "pass", configured: bool = True,
                  rework_ready: bool = False):
    source = tmp_path / "Forge 验证 fixture with spaces"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "result.txt").write_text("base\n")
    action = "time.sleep(5)" if mode == "timeout" else (
        "sys.exit(7)" if mode == "fail" else (
            "sys.exit(0 if Path('result.txt').read_text() == "
            "'real process wrote this' else 7)" if mode == "repair" else "sys.exit(0)"
        )
    )
    script = (
        "from pathlib import Path\nimport sys, time\n"
        "Path('dist').mkdir(exist_ok=True)\n"
        "Path('dist/check.txt').write_text('ran in copy')\n"
        "print('PASS Authorization: Bearer secretvalue', flush=True)\n"
        f"{action}\n"
    )
    (source / "check.py").write_text(script)
    (source / "package.json").write_text(json.dumps({
        "name": "forge-verifier-fixture",
        "scripts": {"test": "python check.py"} if configured else {},
    }))
    git(source, "add", ".")
    git(source, "commit", "-m", "base")
    source_head = git(source, "rev-parse", "HEAD")

    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    assert storage.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project.projectId), "Verifier fixture", 0)
    message = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="verifier-fixture-message", text="Verify the change", attachmentIds=[],
    ))["message"]
    drafts = DraftService(storage)
    draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey="verifier-fixture-draft",
    ))
    decision_id = uuid4()
    decision_ref = f"decision:{decision_id}"
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project.projectId),
        revision=2, title="Verify change", type="feature", goal="Change result file",
        acceptance=[AcceptanceCriterion(
            id="AC-01", statement="Changed file passes check", method="automated",
            required=True, sourceRefs=[decision_ref],
        ), AcceptanceCriterion(
            id="AC-02", statement="Human reviews output", method="manual",
            required=True, sourceRefs=[decision_ref],
        )], constraints=[], scope=["result.txt"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=[f"message:{message.messageId}", decision_ref],
        workflowRef="standard", priority="normal",
    )
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id, decisionSummary="Fixture scope",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    approvals = ApprovalService(storage, drafts)
    pending = approvals.request(ApprovalRequestInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=2,
    ))
    approvals.decide(ApprovalDecideInput(
        projectId=project.projectId,
        decision=ApprovalDecision(
            schemaVersion="1.0", approvalId=pending.request.approvalId,
            decision="approve", expectedRevision=2, scopeHash=pending.request.scopeHash,
            reason="Fixture approved",
        ),
    ))

    environments = EnvironmentService(storage)
    environment = environments.list_environments(str(project.projectId))[0]
    preset = None
    if configured:
        saved = environments.save_preset(PresetSaveInput(
            projectId=project.projectId, expectedRevision=0,
            environmentId=environment.environmentId, name="test",
            executable=sys.executable, argv=["check.py"], cwdRelative=".",
            envRefs=[], timeoutSeconds=1 if mode == "timeout" else 10,
            scriptsHash=probe.scriptsHash,
        ))
        preset = environments.approve_preset(
            str(project.projectId), str(saved.presetId), saved.revision, probe.scriptsHash
        )
        environment = environments.save(EnvironmentSaveInput(
            projectId=project.projectId, environmentId=environment.environmentId,
            expectedRevision=environment.revision, name=environment.name,
            config=EnvironmentConfig(commandPresetIds=[preset.presetId], envRefs=[],
                                     networkMode="trusted-local"),
        ))
    configs = RunConfigService(storage, environments)
    run_id = uuid4()
    lock = "a" * 64
    node = _node("fixture.executor", "standard")
    config = configs.create(RunConfigSelection(
        runId=run_id, projectId=project.projectId, taskId=draft.draftId,
        expectedTaskRevision=2,
        workflow=VersionLock(id="standard", version=_WORKFLOW_VERSION if rework_ready else "1",
                             contentHash=_hash(node) if rework_ready else lock),
        profile=ProfileLock(id=_PROFILE_ID if rework_ready else "developer",
                            version=_WORKFLOW_VERSION if rework_ready else "1",
                            contentHash=_hash({**node, "modelId": "fixture-model"}) if
                            rework_ready else lock,
                            executorPluginId="fixture.executor"),
        plugins=[VersionLock(id="fixture.executor", version="python-fixture/1" if
                             rework_ready else "1", contentHash=lock)],
        budget=_BUDGET if rework_ready else RunBudget(
            maxDurationMs=30_000, maxTurns=3, maxTokens=5000, maxToolCalls=10),
        environmentId=environment.environmentId,
        expectedEnvironmentRevision=environment.revision,
    ))
    runtime_id = uuid4()
    developer = WorkspaceManager(tmp_path / "development", runtime_id, lambda _run: False)
    await developer.open()
    work = await developer.create(source, str(run_id))
    (Path(work.rootPath) / "result.txt").write_text("changed\n")
    material = await developer.freeze_snapshot(work.workspaceId, str(run_id))
    attempt_id = uuid4()
    now = timestamp()
    with storage.transaction() as db:
        db.execute(
            "INSERT INTO runs(run_id,project_id,task_id,config_hash,state,revision,"
            "created_at,deadline_at,finished_at) VALUES(?,?,?,?,?,1,?,?,?)",
            (str(run_id), str(project.projectId), str(draft.draftId), config.snapshotHash,
             "succeeded", now, now, now),
        )
        db.execute(
            "INSERT INTO run_attempts(attempt_id,run_id,node_id,attempt_no,workspace_id,"
            "workspace_lease_id,lease_epoch,base_revision,executor_id,state,intent_at) "
            "VALUES(?,?,'develop',1,?,?,1,?,'fixture.executor','succeeded',?)",
            (str(attempt_id), str(run_id), str(work.workspaceId), str(uuid4()),
             work.baseRevision, now),
        )
    run = RunService(storage, configs).get(project.projectId, run_id)
    assert run is not None
    context = build_context_bundle(config)
    handoff = build_development_handoff(
        material, project.projectId, attempt_id, run, config, context, None, 1
    )
    HandoffService(storage).save(project.projectId, handoff)

    processes = ProcessController(runtime_id, tmp_path / "processes")
    verifier = ProjectCommandVerifier(
        storage, projects, environments, configs, HandoffService(storage),
        processes, tmp_path / "verifier-workspaces",
    )
    assert await verifier.open() == 0
    return (source, source_head, storage, project.projectId, draft.draftId,
            run_id, handoff.snapshot.snapshotId, preset, verifier, processes)


def request(project_id: UUID, task_id: UUID, run_id: UUID, snapshot_id: UUID,
            preset_id: UUID | None, key: UUID | None = None) -> VerifyStartInput:
    return VerifyStartInput(
        projectId=project_id, taskId=task_id, developmentRunId=run_id,
        expectedSnapshotId=snapshot_id, kind="test", presetId=preset_id,
        idempotencyKey=key or uuid4(),
    )


@pytest.mark.asyncio
async def test_acceptance_matrix_requires_per_criterion_evidence_and_keeps_decisions(
    tmp_path: Path,
) -> None:
    source, head, storage, project_id, task_id, run_id, snapshot_id, preset, verifier, _ = (
        await fixture(tmp_path)
    )
    assert preset is not None
    service = AcceptanceMatrixService(
        storage, ProjectService(storage),
        RunConfigService(storage, EnvironmentService(storage)), verifier,
    )
    initial = service.get(project_id, task_id)
    assert initial.snapshotId == snapshot_id
    handoff = HandoffService(storage).get(project_id, run_id)
    assert handoff is not None
    assert handoff.stepResult.acceptanceResults[0].status == "unverified"
    assert BoardService(storage).detail(str(project_id), str(task_id)).detail.task.state != "done"
    assert [item.status for item in initial.criteria] == ["unverified", "manual"]
    assert initial.evaluation == "inconclusive"
    assert initial.missingRequiredIds == ["AC-01", "AC-02"]
    assert not initial.requiredCovered and initial.finalAcceptanceRequired
    started = await verifier.start(request(project_id, task_id, run_id, snapshot_id,
                                           preset.presetId))
    await asyncio.wait_for(asyncio.gather(*verifier.running.values()), 8)
    report = verifier.report(project_id, started.verificationId)
    assert report is not None and report.status == "passed"
    after_check = service.get(project_id, task_id)
    assert after_check.criteria[0].status == "unverified"
    assert after_check.checkReports[0].reportId == report.reportId
    decision = AcceptanceDecisionInput(
        projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
        expectedContractRevision=2, criterionId="AC-01", status="verified",
        reportId=report.reportId, reason="This test exercises the stated file change.",
        idempotencyKey=uuid4(),
    )
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_EVIDENCE_REQUIRED"):
        service.decide(decision.model_copy(update={"reportId": None}))
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_REPORT_INVALID"):
        service.decide(decision.model_copy(update={"reportId": uuid4()}))
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_REASON_REQUIRED"):
        service.decide(decision.model_copy(update={"reason": "            "}))
    first = service.decide(decision)
    assert first.criteria[0].status == "verified" and not first.requiredCovered
    assert service.decide(decision).criteria[0].decisionId == first.criteria[0].decisionId
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_CONFLICT"):
        service.decide(decision.model_copy(update={"reason": "A different reason for same key."}))
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_SOURCE_STALE"):
        service.decide(decision.model_copy(update={
            "expectedSnapshotId": uuid4(), "idempotencyKey": uuid4(),
        }))
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_CRITERION_UNKNOWN"):
        service.decide(decision.model_copy(update={
            "criterionId": "AC-unknown", "idempotencyKey": uuid4(),
        }))
    manual = AcceptanceDecisionInput(
        projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
        expectedContractRevision=2, criterionId="AC-02", status="risk_accepted",
        reportId=None, reason="Human accepts the remaining manual inspection risk.",
        idempotencyKey=uuid4(),
    )
    complete = service.decide(manual)
    assert complete.requiredCovered and complete.finalAcceptanceRequired
    assert complete.evaluation == "covered"
    assert complete.criteria[1].status == "risk_accepted"
    assert git(source, "rev-parse", "HEAD") == head
    assert git(source, "status", "--porcelain") == ""
    await verifier.shutdown()
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    reloaded = AcceptanceMatrixService(
        reopened, ProjectService(reopened),
        RunConfigService(reopened, EnvironmentService(reopened)),
        ProjectCommandVerifier(
            reopened, ProjectService(reopened), EnvironmentService(reopened),
            RunConfigService(reopened, EnvironmentService(reopened)),
            HandoffService(reopened), ProcessController(uuid4()), tmp_path / "other-workspaces",
        ),
    ).get(project_id, task_id)
    assert reloaded.requiredCovered and reloaded.criteria[0].reportId == report.reportId
    with pytest.raises(sqlite3.IntegrityError):
        with reopened.transaction() as db:
            db.execute("DELETE FROM acceptance_decisions WHERE task_id=?", (str(task_id),))
    reopened.close()


@pytest.mark.asyncio
async def test_failed_command_does_not_verify_acceptance(tmp_path: Path) -> None:
    _, _, storage, project_id, task_id, run_id, snapshot_id, preset, verifier, _ = (
        await fixture(tmp_path, mode="fail")
    )
    assert preset is not None
    started = await verifier.start(request(project_id, task_id, run_id, snapshot_id,
                                           preset.presetId))
    await asyncio.wait_for(asyncio.gather(*verifier.running.values()), 8)
    report = verifier.report(project_id, started.verificationId)
    assert report is not None and report.status == "failed" and report.exitCode == 7
    service = AcceptanceMatrixService(
        storage, ProjectService(storage),
        RunConfigService(storage, EnvironmentService(storage)), verifier,
    )
    decision = AcceptanceDecisionInput(
        projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
        expectedContractRevision=2, criterionId="AC-01", status="verified",
        reportId=report.reportId, reason="Attempting to call failed report verified.",
        idempotencyKey=uuid4(),
    )
    with pytest.raises(AcceptanceMatrixError, match="ACCEPTANCE_EVIDENCE_REQUIRED"):
        service.decide(decision)
    assert not service.get(project_id, task_id).requiredCovered
    assert service.get(project_id, task_id).evaluation == "inconclusive"
    rejected = service.decide(decision.model_copy(update={
        "status": "failed", "idempotencyKey": uuid4(),
    }))
    assert rejected.evaluation == "failed" and rejected.criteria[0].status == "failed"
    await verifier.shutdown()
    storage.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,expected", [("pass", "passed"), ("fail", "failed"),
                                           ("timeout", "timeout")])
async def test_real_check_exit_evidence_and_isolation(
    tmp_path: Path, mode: str, expected: str,
) -> None:
    source, head, storage, project_id, task_id, run_id, snapshot_id, preset, verifier, processes = (
        await fixture(tmp_path, mode=mode)
    )
    assert preset is not None and preset.approvalHash
    value = request(project_id, task_id, run_id, snapshot_id, preset.presetId)
    started = await verifier.start(value)
    assert started.state == "running"
    assert (await verifier.start(value)).verificationId == started.verificationId
    await asyncio.wait_for(asyncio.gather(*verifier.running.values()), 8)
    done = verifier.get(project_id, started.verificationId)
    report = verifier.report(project_id, started.verificationId)
    assert done.state == "completed" and report is not None
    assert report.status == expected and report.needsHuman == (expected != "passed")
    assert report.exitCode == (7 if mode == "fail" else 0 if mode == "pass" else None)
    assert report.snapshotId == snapshot_id and report.approvalHash == preset.approvalHash
    assert report.stdoutArtifactId is not None
    artifact = verifier.artifact(project_id, report.stdoutArtifactId)
    assert "PASS" in artifact.content and "secretvalue" not in artifact.content
    assert "[REDACTED]" in artifact.content
    with pytest.raises(VerifierError, match="VERIFY_ARTIFACT_NOT_FOUND"):
        verifier.artifact(uuid4(), artifact.artifactId)
    assert git(source, "rev-parse", "HEAD") == head
    assert git(source, "status", "--porcelain") == ""
    assert not (source / "dist").exists()
    assert not processes.has_active(str(started.verificationId))
    assert all(item.status == "released" for item in verifier.workspaces.records.values())
    await verifier.shutdown()
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    persisted = ProjectCommandVerifier(
        reopened, ProjectService(reopened), EnvironmentService(reopened),
        RunConfigService(reopened, EnvironmentService(reopened)), HandoffService(reopened),
        ProcessController(uuid4()), tmp_path / "new-verifier-workspaces",
    )
    assert persisted.report(project_id, started.verificationId) == report
    with pytest.raises(sqlite3.IntegrityError):
        with reopened.transaction() as db:
            db.execute("UPDATE verifier_reports SET status='passed' WHERE report_id=?",
                       (str(report.reportId),))
    reopened.close()


@pytest.mark.asyncio
async def test_missing_test_is_not_configured_and_unapproved_preset_rejected(
    tmp_path: Path,
) -> None:
    source, _, storage, project_id, task_id, run_id, snapshot_id, preset, verifier, _ = (
        await fixture(tmp_path, configured=False)
    )
    assert preset is None
    value = request(project_id, task_id, run_id, snapshot_id, None)
    job = await verifier.start(value)
    report = verifier.report(project_id, job.verificationId)
    assert job.state == "completed" and report is not None
    assert report.status == "not_configured" and report.needsHuman
    assert report.exitCode is None and report.stdoutArtifactId is None
    assert git(source, "status", "--porcelain") == ""
    with pytest.raises(VerifierError, match="VERIFY_PRESET_UNAPPROVED"):
        await verifier.start(request(project_id, task_id, run_id, snapshot_id, uuid4()))
    with pytest.raises(VerifierError, match="VERIFY_SOURCE_STALE"):
        await verifier.start(request(project_id, task_id, run_id, uuid4(), None))
    with pytest.raises(ValidationError):
        VerifyStartInput.model_validate({**value.model_dump(), "path": "/etc/passwd"})
    with pytest.raises(VerifierError, match="VERIFY_CWD_INVALID"):
        _relative_cwd(source, "../outside")
    outside = tmp_path / "outside"
    outside.mkdir()
    (source / "jump").symlink_to(outside, target_is_directory=True)
    with pytest.raises(VerifierError, match="VERIFY_CWD_INVALID"):
        _relative_cwd(source, "jump")
    (source / "jump").unlink()
    await verifier.shutdown()
    storage.close()


@pytest.mark.asyncio
async def test_independent_python_host_runs_approved_check_over_versioned_stdio(
    tmp_path: Path,
) -> None:
    source, head, storage, project_id, task_id, run_id, snapshot_id, preset, verifier, _ = (
        await fixture(tmp_path)
    )
    assert preset is not None
    await verifier.shutdown()
    storage.close()
    env = {**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data"),
           "FORGE_HOST_OWNERSHIP_TOKEN": "fixture-owner"}
    host = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", env=env,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert host.stdin is not None and host.stdout is not None

    async def call(method: str, params: dict[str, object]) -> dict[str, object]:
        command_id = str(uuid4())
        frame = json.dumps({
            "jsonrpc": "2.0", "id": command_id, "method": method,
            "params": params, "transportVersion": TRANSPORT_VERSION,
        }).encode() + b"\n"
        host.stdin.write(frame)
        await host.stdin.drain()
        reply = json.loads(await asyncio.wait_for(host.stdout.readline(), 15))
        assert reply["id"] == command_id and reply["jsonrpc"] == "2.0"
        return reply

    try:
        hello = await call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": HOST_PROTOCOL_VERSION, "ownershipToken": "fixture-owner",
        })
        assert "result" in hello and hello["result"]["status"] == "ready"
        value = request(project_id, task_id, run_id, snapshot_id, preset.presetId)
        started = await call("run.verifyStart", value.model_dump(mode="json"))
        assert "result" in started
        verification_id = started["result"]["data"]["verificationId"]
        for _ in range(100):
            current = await call("run.verifyJob", {
                "projectId": str(project_id), "verificationId": verification_id,
            })
            assert "result" in current
            if current["result"]["data"]["state"] != "running":
                break
            await asyncio.sleep(.05)
        assert current["result"]["data"]["state"] == "completed"
        report = await call("run.verifyReport", {
            "projectId": str(project_id), "verificationId": verification_id,
        })
        assert report["result"]["data"]["status"] == "passed"
        artifact_id = report["result"]["data"]["stdoutArtifactId"]
        artifact = await call("run.verifyArtifact", {
            "projectId": str(project_id), "artifactId": artifact_id,
        })
        assert "PASS" in artifact["result"]["data"]["content"]
        assert "secretvalue" not in artifact["result"]["data"]["content"]
        matrix = await call("run.acceptanceMatrix", {
            "projectId": str(project_id), "taskId": str(task_id),
        })
        assert matrix["result"]["data"]["criteria"][0]["status"] == "unverified"
        assert not matrix["result"]["data"]["requiredCovered"]
        decision = AcceptanceDecisionInput(
            projectId=project_id, taskId=task_id, expectedSnapshotId=snapshot_id,
            expectedContractRevision=2, criterionId="AC-01", status="verified",
            reportId=UUID(report["result"]["data"]["reportId"]),
            reason="This report exercises the fixture acceptance criterion.",
            idempotencyKey=uuid4(),
        )
        decided = await call("run.acceptanceDecide", decision.model_dump(mode="json"))
        assert decided["result"]["data"]["criteria"][0]["status"] == "verified"
        assert not decided["result"]["data"]["requiredCovered"]
        unsafe = await call("run.acceptanceDecide", {
            **decision.model_dump(mode="json"), "idempotencyKey": str(uuid4()),
            "executable": "/bin/sh",
        })
        assert unsafe["error"]["code"] == "INVALID_REQUEST"
        denied = await call("run.verifyArtifact", {
            "projectId": str(project_id), "artifactId": "/etc/passwd",
        })
        assert denied["error"]["code"] == "INVALID_REQUEST"
        assert git(source, "rev-parse", "HEAD") == head
        assert git(source, "status", "--porcelain") == ""
        await call("system.shutdown", {})
        assert await asyncio.wait_for(host.wait(), 12) == 0
    finally:
        if host.returncode is None:
            host.terminate()
            await asyncio.wait_for(host.wait(), 12)
