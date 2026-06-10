"""Frozen RunConfig, durable Run and real Git handoff remain restart safe."""

import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.context import (
    CheckpointBudget,
    ContextEntry,
    ContextError,
    ContextService,
    WorkingCheckpoint,
    build_context_bundle,
    executor_context,
    verify_context_bundle,
)
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.handoffs import HandoffService, HostSnapshotService
from forge.persistence import ForgePersistence
from forge.processes import ProcessController
from forge.projects import TRUST_VERSION, ProjectService
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigError,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
    verify_snapshot,
)
from forge.runs import RunAttemptResult, RunError, RunService, RunStartIntent
from forge.workspaces import WorkspaceManager


@pytest.mark.asyncio
async def test_run_config_freeze_replay_and_restart(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    def git(*args: str) -> str:
        return subprocess.run(
            ["git", "-C", str(source), *args], check=True, capture_output=True,
            text=True, timeout=15,
        ).stdout.strip()
    git("init", "-b", "main")
    git("config", "user.name", "Forge fixture")
    git("config", "user.email", "forge-fixture@example.invalid")
    (source / "hello.txt").write_text("original")
    git("add", "hello.txt")
    git("commit", "-m", "base")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    environments = EnvironmentService(storage)
    environment = environments.list_environments(str(project.projectId))[0]
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project.projectId), "Run config", 0)
    message = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="run-config-fixture-message", text="Implement validation",
        attachmentIds=[],
    ))["message"]
    drafts = DraftService(storage)
    draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey="run-config-fixture-draft-01",
    ))
    decision_id = uuid4()
    source_ref = f"message:{message.messageId}"
    decision_ref = f"decision:{decision_id}"
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project.projectId),
        revision=2, title="Validate inputs", type="feature", goal="Reject invalid values",
        acceptance=[AcceptanceCriterion(
            id="ac1", statement="Invalid values are rejected", method="automated",
            required=True, sourceRefs=[source_ref, decision_ref],
        )], constraints=[], scope=["src/add.py"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=[source_ref, decision_ref],
        workflowRef="standard", priority="normal",
    )
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id, decisionSummary="Human defined scope",
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
            decision="approve", expectedRevision=2,
            scopeHash=pending.request.scopeHash, reason="Human approval",
        ),
    ))
    config_service = RunConfigService(storage, environments)
    digest = "a" * 64
    selection = RunConfigSelection(
        runId=uuid4(), projectId=project.projectId, taskId=draft.draftId,
        expectedTaskRevision=2,
        workflow=VersionLock(id="standard", version="1", contentHash=digest),
        profile=ProfileLock(
            id="developer", version="1", contentHash=digest,
            executorPluginId="forge.executor.codex",
        ),
        plugins=[VersionLock(
            id="forge.executor.codex", version="0.155.1", contentHash=digest
        )],
        budget=RunBudget(
            maxDurationMs=30_000, maxTurns=4, maxTokens=10_000, maxToolCalls=20
        ),
        environmentId=environment.environmentId, expectedEnvironmentRevision=1,
    )
    snapshot = config_service.create(selection)
    assert snapshot.taskContractHash and snapshot.snapshotHash
    assert config_service.create(selection) == snapshot
    assert verify_snapshot(snapshot) == snapshot
    with pytest.raises(RunConfigError, match="RUN_CONFIG_CONFLICT"):
        config_service.create(selection.model_copy(update={"expectedEnvironmentRevision": 2}))
    with pytest.raises(RunConfigError, match="RUN_CONFIG_INVALID"):
        verify_snapshot(snapshot.model_copy(update={"snapshotHash": "b" * 64}))
    with pytest.raises(RunConfigError, match="RUN_CONFIG_STALE"):
        config_service.create(selection.model_copy(update={
            "runId": uuid4(), "expectedEnvironmentRevision": 2,
        }))
    assert storage._db().execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
    run_service = RunService(storage, config_service)
    context_service = ContextService(storage, config_service)
    bundle = context_service.save_bundle(build_context_bundle(snapshot))
    assert context_service.save_bundle(bundle) == bundle
    assert executor_context(bundle)
    with pytest.raises(ContextError, match="CONTEXT_INVALID"):
        verify_context_bundle(bundle.model_copy(update={"contentHash": "b" * 64}))
    attempt_id, workspace_id, lease_id = uuid4(), uuid4(), uuid4()
    intent = RunStartIntent(
        runId=selection.runId, projectId=selection.projectId, taskId=selection.taskId,
        attemptId=attempt_id, workspaceId=workspace_id, workspaceLeaseId=lease_id,
        leaseEpoch=1, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=snapshot.snapshotHash,
        createdAt=timestamp(),
    )
    queued = run_service.begin(intent)
    assert queued.state == "queued" and queued.attempt.state == "pending"
    checkpoint = WorkingCheckpoint(
        checkpointId=uuid4(), projectId=project.projectId, runId=selection.runId,
        attemptId=attempt_id, sequence=1,
        objective=ContextEntry(text=contract.goal, sourceRef=f"task:{draft.draftId}@2"),
        completedActions=[ContextEntry(
            text="Validation inspected", sourceRef="executor-event:1"
        )], openIssues=[],
        budget=CheckpointBudget(
            elapsedMs=100, turnsUsed=None, tokensUsed=None, toolCallsUsed=None
        ), createdAt=timestamp(),
    )
    context_service.append_checkpoint(checkpoint)
    with pytest.raises(ContextError, match="CONTEXT_CONFLICT"):
        context_service.append_checkpoint(checkpoint)
    later_bundle = context_service.save_bundle(build_context_bundle(snapshot, checkpoint))
    assert later_bundle.checkpointId == checkpoint.checkpointId
    assert any(item.kind == "checkpoint_action" for item in later_bundle.items)
    assert run_service.begin(intent) == queued
    with pytest.raises(RunError, match="RUN_CONFLICT"):
        run_service.begin(intent.model_copy(update={"attemptId": uuid4()}))
    launched = run_service.mark_launched(project.projectId, selection.runId, attempt_id, "thread-1")
    assert launched.state == "running" and launched.attempt.nativeSessionRef == "thread-1"
    cancelling = run_service.request_cancel(project.projectId, selection.runId, attempt_id, "user")
    assert cancelling.state == "canceling"
    assert run_service.request_cancel(
        project.projectId, selection.runId, attempt_id, "user"
    ) == cancelling
    result = RunAttemptResult(
        runId=selection.runId, attemptId=attempt_id, workspaceLeaseId=lease_id,
        leaseEpoch=1, contractRevision=2, configHash=snapshot.snapshotHash,
        outcome="cancelled", providerSessionRef="thread-1", lastEventSequence=7,
        timestamp=timestamp(),
    )
    with pytest.raises(RunError, match="RUN_PROCESS_UNCONFIRMED"):
        run_service.complete(project.projectId, selection.runId, result, verified_stopped=False)
    stale = result.model_copy(update={"workspaceLeaseId": uuid4()})
    assert run_service.complete(project.projectId, selection.runId, stale,
                                verified_stopped=True)[0] == "STALE_RESULT"
    applied, terminal = run_service.complete(
        project.projectId, selection.runId, result, verified_stopped=True
    )
    assert applied == "APPLIED" and terminal.state == "cancelled"
    assert run_service.complete(project.projectId, selection.runId, result,
                                verified_stopped=True)[0] == "DUPLICATE_RESULT"
    assert storage._db().execute(
        "SELECT state FROM run_workspace_leases WHERE lease_id=?", (str(lease_id),)
    ).fetchone()[0] == "released"

    # A second, explicitly approved Run produces a real immutable Git snapshot.
    next_selection = selection.model_copy(update={"runId": uuid4()})
    next_config = config_service.create(next_selection)
    next_context = context_service.save_bundle(build_context_bundle(next_config))
    runtime_id = uuid4()
    processes = ProcessController(runtime_id, tmp_path / "process-journal")
    workspaces = WorkspaceManager(
        tmp_path / "workspace-data", runtime_id,
        lambda run_id: processes.has_active(run_id),
    )
    await workspaces.open()
    workspace = await workspaces.create(source, str(next_selection.runId), git("rev-parse", "HEAD"))
    leased = await workspaces.acquire(workspace.workspaceId, str(next_selection.runId))
    assert leased.activeLeaseId is not None
    next_attempt = uuid4()
    next_intent = RunStartIntent(
        runId=next_selection.runId, projectId=project.projectId,
        taskId=draft.draftId, attemptId=next_attempt, workspaceId=workspace.workspaceId,
        workspaceLeaseId=leased.activeLeaseId, leaseEpoch=leased.leaseEpoch,
        baseRevision=workspace.baseRevision, nodeId="develop",
        executorId="forge.executor.codex", configHash=next_config.snapshotHash,
        createdAt=timestamp(),
    )
    assert run_service.begin(next_intent).state == "queued"
    assert run_service.mark_launched(
        project.projectId, next_selection.runId, next_attempt, "fixture-session"
    ).state == "running"
    (Path(workspace.rootPath) / "hello.txt").write_text("changed by disposable fixture")
    (Path(workspace.rootPath) / "added.txt").write_text("new test")
    next_result = RunAttemptResult(
        runId=next_selection.runId, attemptId=next_attempt,
        workspaceLeaseId=leased.activeLeaseId, leaseEpoch=leased.leaseEpoch,
        contractRevision=2, configHash=next_config.snapshotHash,
        outcome="completed", providerSessionRef="fixture-session",
        lastEventSequence=2, timestamp=timestamp(),
    )
    assert run_service.complete(
        project.projectId, next_selection.runId, next_result,
        verified_stopped=True,
    )[1].state == "succeeded"
    await workspaces.release_lease(
        workspace.workspaceId, leased.activeLeaseId, str(next_selection.runId)
    )
    snapshots = HostSnapshotService(
        storage, workspaces, processes, run_service, config_service, context_service
    )
    handoff = await snapshots.freeze(
        project.projectId, next_selection.runId, workspace.workspaceId,
        next_context.bundleId, 1,
    )
    assert handoff.stepResult.outcome == "ready"
    assert all(item.status == "unverified" for item in handoff.stepResult.acceptanceResults)
    assert len(handoff.snapshot.files) == 2
    assert git("show", f"{handoff.snapshot.commitSha}:added.txt") == "new test"
    assert git("status", "--porcelain") == ""
    assert await snapshots.freeze(
        project.projectId, next_selection.runId, workspace.workspaceId,
        next_context.bundleId, 1,
    ) == handoff
    rate_selection = selection.model_copy(update={"runId": uuid4()})
    rate_config = config_service.create(rate_selection)
    rate_intent = RunStartIntent(
        runId=rate_selection.runId, projectId=project.projectId,
        taskId=draft.draftId, attemptId=uuid4(), workspaceId=uuid4(),
        workspaceLeaseId=uuid4(), leaseEpoch=1, baseRevision=git("rev-parse", "HEAD"),
        nodeId="develop", executorId="forge.executor.codex",
        configHash=rate_config.snapshotHash, createdAt=timestamp(),
    )
    assert run_service.begin(rate_intent).state == "queued"
    blocked = run_service.block_no_side_effect(
        project.projectId, rate_intent.runId, rate_intent.attemptId,
        "rate_limit_exhausted",
    )
    assert blocked.state == "waiting_input" and blocked.attempt.state == "failed"
    assert blocked.attempt.nativeSessionRef is None
    assert storage._db().execute(
        "SELECT state FROM run_workspace_leases WHERE lease_id=?",
        (str(rate_intent.workspaceLeaseId),),
    ).fetchone()[0] == "released"
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert RunConfigService(reopened, EnvironmentService(reopened)).get(
        project.projectId, selection.runId
    ) == snapshot
    assert RunService(reopened, RunConfigService(reopened, EnvironmentService(reopened))).get(
        project.projectId, selection.runId
    ) == terminal
    recovered_context = ContextService(
        reopened, RunConfigService(reopened, EnvironmentService(reopened))
    )
    assert recovered_context.get_bundle(project.projectId, later_bundle.bundleId) == later_bundle
    assert recovered_context.latest_checkpoint(project.projectId, selection.runId) == checkpoint
    assert HandoffService(reopened).get(project.projectId, next_selection.runId) == handoff
    reopened.close()
