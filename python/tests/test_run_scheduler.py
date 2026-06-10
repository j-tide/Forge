"""Real process fixture exercises Python Host scheduler without claiming Codex parity."""

import asyncio
import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.board import BoardService
from forge.context import ContextService, build_context_bundle, executor_context
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.development import HostDevelopmentService, RunLaunchInput
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.executor_contracts import (
    ExecutorCapabilities,
    ExecutorStartError,
    RunCancelled,
    RunCompleted,
    RunFailed,
    RunStarted,
    ScheduledExecutorRequest,
)
from forge.handoffs import HostSnapshotService
from forge.persistence import ForgePersistence
from forge.processes import ProcessController
from forge.projects import TRUST_VERSION, ProjectService
from forge.protocol import encode_frame
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
)
from forge.run_inspection import RunInspectionService, redact
from forge.run_scheduler import HostRunScheduler, SchedulerError, retry_429_delay
from forge.runs import RunService, RunStartIntent
from forge.workspaces import WorkspaceManager

SCRIPT = """
import sys, time
from pathlib import Path
root, mode = Path(sys.argv[1]), sys.argv[2]
(root / 'result.txt').write_text('real process wrote this')
if mode == 'fail':
    sys.exit(7)
if mode == 'long':
    while True:
        (root / 'heartbeat').write_text(str(time.monotonic()))
        time.sleep(.05)
"""


def test_rate_limit_retry_requires_explicit_no_side_effect_evidence() -> None:
    safe = ExecutorStartError(
        "EXECUTOR_RATE_LIMITED", http_status=429, side_effect="none"
    )
    possible = ExecutorStartError(
        "EXECUTOR_RATE_LIMITED", http_status=429, side_effect="possible"
    )
    assert retry_429_delay(safe, 0, 2, 5) == 1
    assert retry_429_delay(safe, 1, 2, 5) == 2
    assert retry_429_delay(safe, 2, 2, 5) is None
    assert retry_429_delay(safe, 0, 2, .5) is None
    assert retry_429_delay(possible, 0, 2, 5) is None


class FixtureHandle:
    def __init__(self, request, callback, session, processes, mode) -> None:
        self.run_id = request.runId
        self.provider_session_id = f"fixture:{session.descriptor.processId}"
        self.session = session
        self.callback = callback
        self.processes = processes
        self.emitted = False
        self.mode = mode
        callback(RunStarted(
            runId=self.run_id, sequence=1, timestamp=timestamp(),
            type="run.started", providerSessionId=self.provider_session_id,
        ))

    async def wait(self):
        if self.mode == "bad":
            self.callback(RunCancelled(
                runId=self.run_id, sequence=4, timestamp=timestamp(),
                type="run.cancelled",
            ))
        code = await self.session.wait()
        if not self.emitted:
            self.emitted = True
            event_type = (
                "run.completed" if code == 0 else
                "run.failed" if code == 7 else "run.cancelled"
            )
            if event_type == "run.completed":
                self.callback(RunCompleted(
                    runId=self.run_id, sequence=2, timestamp=timestamp(),
                    type="run.completed", providerSessionId=self.provider_session_id,
                    structuredOutput=None,
                ))
            elif event_type == "run.failed":
                self.callback(RunFailed(
                    runId=self.run_id, sequence=2, timestamp=timestamp(),
                    type="run.failed", code="EXECUTOR_RUNTIME_ERROR",
                    message="Disposable fixture exited with code 7",
                ))
            else:
                self.callback(RunCancelled(
                    runId=self.run_id, sequence=2, timestamp=timestamp(),
                    type="run.cancelled",
                ))
        return "completed" if code == 0 else "cancelled"

    async def cancel(self) -> None:
        await self.processes.cancel(self.run_id)

    async def dispose(self) -> None:
        if self.processes.has_active(self.run_id):
            await self.processes.cancel(self.run_id)


class FixtureAdapter:
    id = "fixture.executor"

    def __init__(self, processes: ProcessController, script: Path, mode: str) -> None:
        self.processes = processes
        self.script = script
        self.mode = mode

    async def probe(self) -> ExecutorCapabilities:
        return ExecutorCapabilities(
            executorId=self.id, adapterVersion="fixture/1", upstreamVersion="python-fixture/1",
            platform=sys.platform, available=True, streaming=True, resume=False,
            interrupt=True, approval=False, structuredEvents=True, structuredOutput=False,
            workspaceControl=True, toolEvents=False, sessionPersistence=False,
            modelSelection=True, usageReporting=False, readOnlyEnforced=False,
            networkPolicyEnforced=False, enforcement="trusted-local",
            modelIds=["fixture-model"],
            authModes=[], warnings=["Test fixture only; no Codex capability claim"],
        )

    async def start(self, request, on_event):
        session = await self.processes.spawn(
            request.runId, sys.executable,
            [str(self.script), request.workspace, self.mode], Path(request.workspace),
        )
        return FixtureHandle(request, on_event, session, self.processes, self.mode)

    async def dispose(self) -> None:
        return None


def git(source: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(source), *args], check=True, capture_output=True,
        text=True, timeout=15,
    ).stdout.strip()


async def wait_for(path: Path) -> None:
    for _ in range(150):
        if path.exists():
            return
        await asyncio.sleep(.04)
    raise AssertionError(f"Fixture marker {path.name} did not appear")


@pytest.mark.asyncio
async def test_scheduler_real_process_success_then_durable_cancel(tmp_path: Path) -> None:
    source = tmp_path / "source repo 空格"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "source.txt").write_text("untouched")
    git(source, "add", "source.txt")
    git(source, "commit", "-m", "base")
    script = tmp_path / "fixture_process.py"
    script.write_text(SCRIPT)
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    conv = ConversationService(storage)
    conversation = conv.create(str(project.projectId), "Fixture", 0)
    message = conv.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="scheduler-fixture-message", text="Update source", attachmentIds=[],
    ))["message"]
    drafts = DraftService(storage)
    draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey="scheduler-fixture-draft-01",
    ))
    decision_id = uuid4()
    decision_ref = f"decision:{decision_id}"
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project.projectId),
        revision=2, title="Fixture change", type="feature", goal="Write result file",
        acceptance=[AcceptanceCriterion(
            id="ac1", statement="Result file exists", method="inspection",
            required=True, sourceRefs=[decision_ref],
        )], constraints=[], scope=["result.txt"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[],
        sourceRefs=[f"message:{message.messageId}", decision_ref],
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
    configs = RunConfigService(storage, environments)
    contexts = ContextService(storage, configs)
    runs = RunService(storage, configs)
    processes = ProcessController(uuid4(), tmp_path / "process-journal")
    workspaces = WorkspaceManager(
        tmp_path / "workspaces", processes.runtime_id, processes.has_active
    )
    await workspaces.open()

    async def schedule(mode: str):
        run_id = uuid4()
        lock = "a" * 64
        selection = RunConfigSelection(
            runId=run_id, projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2,
            workflow=VersionLock(id="standard", version="1", contentHash=lock),
            profile=ProfileLock(
                id="developer", version="1", contentHash=lock,
                executorPluginId="fixture.executor",
            ),
            plugins=[VersionLock(id="fixture.executor", version="1", contentHash=lock)],
            budget=RunBudget(
                maxDurationMs=30_000, maxTurns=3, maxTokens=5000, maxToolCalls=10
            ),
            environmentId=environment.environmentId, expectedEnvironmentRevision=1,
        )
        config = configs.create(selection)
        context = contexts.save_bundle(build_context_bundle(config))
        workspace = await workspaces.create(source, str(run_id), git(source, "rev-parse", "HEAD"))
        leased = await workspaces.acquire(workspace.workspaceId, str(run_id))
        assert leased.activeLeaseId is not None
        attempt_id = uuid4()
        intent = RunStartIntent(
            runId=run_id, projectId=project.projectId, taskId=draft.draftId,
            attemptId=attempt_id, workspaceId=leased.workspaceId,
            workspaceLeaseId=leased.activeLeaseId, leaseEpoch=leased.leaseEpoch,
            baseRevision=leased.baseRevision, nodeId="develop",
            executorId="fixture.executor", configHash=config.snapshotHash,
            createdAt=timestamp(),
        )
        request = ScheduledExecutorRequest(
            runId=str(run_id), taskId=str(draft.draftId), workspace=leased.rootPath,
            goal=context.goal, context=executor_context(context),
            permission="workspace-write", approval="never", model=None,
            maxDurationMs=30_000,
            attempt={
                "attemptId": str(attempt_id), "leaseEpoch": leased.leaseEpoch,
                "contractRevision": 2, "workspaceLeaseId": str(leased.activeLeaseId),
                "contextBundleId": str(context.bundleId), "profileRevision": 1,
                "outputSchemaId": "fixture-output",
            },
        )
        scheduler = HostRunScheduler(
            runs, configs, contexts, workspaces, processes,
            FixtureAdapter(processes, script, mode),
        )
        return scheduler, intent, leased, request

    success, intent, workspace, request = await schedule("short")
    assert (await success.execute(intent, workspace, request)).state == "succeeded"
    assert Path(workspace.rootPath, "result.txt").read_text() == "real process wrote this"
    assert not processes.has_active(str(intent.runId))
    assert git(source, "status", "--porcelain") == ""
    inspection = RunInspectionService(storage, runs).inspect(project.projectId, intent.runId)
    assert [item.type for item in inspection.observations] == ["run.started", "run.completed"]
    assert inspection.diff is not None
    assert any(item.path == "result.txt" for item in inspection.diff.files)
    assert "real process wrote this" in inspection.diff.text
    checkpoint = contexts.latest_checkpoint(project.projectId, intent.runId)
    assert checkpoint is not None and checkpoint.sequence == 1
    assert checkpoint.objective.text == "Write result file"
    assert checkpoint.budget.toolCallsUsed == 0
    assert redact("Authorization: Bearer secret-value") == "[REDACTED]"
    host = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data"),
             "FORGE_HOST_OWNERSHIP_TOKEN": "scheduler-test-owner"},
    )
    assert host.stdin and host.stdout

    async def host_call(method: str, params: dict[str, object]) -> dict[str, object]:
        host.stdin.write(encode_frame({
            "jsonrpc": "2.0", "id": method, "method": method, "params": params,
            "transportVersion": "forge-local-jsonrpc/v1",
        }))
        await host.stdin.drain()
        return json.loads(await asyncio.wait_for(host.stdout.readline(), 3))

    try:
        hello = await host_call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": "forge-host-protocol/v5",
            "ownershipToken": "scheduler-test-owner",
        })
        assert "result" in hello
        listed = await host_call("run.list", {
            "projectId": str(project.projectId), "taskId": str(draft.draftId),
        })
        assert listed["result"]["data"][0]["runId"] == str(intent.runId)
        inspected = await host_call("run.inspect", {
            "projectId": str(project.projectId), "runId": str(intent.runId),
            "afterCursor": 0, "limit": 100,
        })
        assert inspected["result"]["data"]["run"]["state"] == "succeeded"
        assert inspected["result"]["data"]["diff"]["files"][0]["path"] == "result.txt"
        assert (await host_call("run.handoff", {
            "projectId": str(project.projectId), "runId": str(intent.runId),
        }))["result"]["data"] is None
        assert (await host_call("run.start", {}))["error"]["code"] == "INVALID_REQUEST"
        # The built-in Codex adapter is activated only on the platform with
        # version-matched evidence. Other platforms fail closed before Run admission.
        expected = (
            "RUN_CONFLICT"
            if sys.platform == "darwin" and platform.machine() == "arm64"
            else "MODEL_UNAVAILABLE"
        )
        assert (await host_call("run.start", {
            "projectId": str(project.projectId), "taskId": str(draft.draftId),
            "expectedTaskRevision": 2, "modelId": "fixture-model",
            "idempotencyKey": str(uuid4()),
        }))["error"]["code"] == expected
        await host_call("system.shutdown", {})
        assert await asyncio.wait_for(host.wait(), 3) == 0
    finally:
        if host.returncode is None:
            host.kill()
            await host.wait()

    failed, failed_intent, failed_workspace, failed_request = await schedule("fail")
    assert (await failed.execute(failed_intent, failed_workspace, failed_request)).state == "failed"
    assert workspaces.inspect(failed_workspace.workspaceId).status == "ready"

    running, long_intent, long_workspace, long_request = await schedule("long")
    work = asyncio.create_task(running.execute(long_intent, long_workspace, long_request))
    try:
        await wait_for(Path(long_workspace.rootPath, "heartbeat"))
        cancelled = await running.cancel(project.projectId, long_intent.runId)
        assert cancelled.state == "cancelled"
        assert (await work) == cancelled
        assert not processes.has_active(str(long_intent.runId))
        before = Path(long_workspace.rootPath, "heartbeat").read_text()
        await asyncio.sleep(.2)
        assert Path(long_workspace.rootPath, "heartbeat").read_text() == before
        assert workspaces.inspect(long_workspace.workspaceId).status == "ready"
        assert storage._db().execute(
            "SELECT reason FROM run_cancel_intents WHERE run_id=?",
            (str(long_intent.runId),),
        ).fetchone()[0] == "user"
        with pytest.raises(SchedulerError, match="RUN_NOT_ACTIVE"):
            await running.cancel(project.projectId, long_intent.runId)

        shutdown, shutdown_intent, shutdown_workspace, shutdown_request = await schedule("long")
        shutdown_task = asyncio.create_task(
            shutdown.execute(shutdown_intent, shutdown_workspace, shutdown_request)
        )
        await wait_for(Path(shutdown_workspace.rootPath, "heartbeat"))
        [stopped] = await shutdown.shutdown()
        assert stopped.state == "cancelled"
        assert (await shutdown_task).state == "cancelled"
        assert not processes.has_active(str(shutdown_intent.runId))

        developed_scheduler = HostRunScheduler(
            runs, configs, contexts, workspaces, processes,
            FixtureAdapter(processes, script, "short"),
        )
        development = HostDevelopmentService(
            storage, projects, BoardService(storage),
            environments, configs, contexts, runs, workspaces, developed_scheduler,
            HostSnapshotService(storage, workspaces, processes, runs, configs, contexts),
            developed_scheduler.adapter,
        )
        run_key = uuid4()
        launched = await development.start(RunLaunchInput(
            projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2, modelId="fixture-model",
            idempotencyKey=run_key,
        ))
        assert launched.runId == run_key and launched.state in ("queued", "running", "succeeded")
        for _ in range(100):
            if not development.running:
                break
            await asyncio.sleep(.05)
        handoff = development.handoff(project.projectId, run_key)
        assert handoff is not None and handoff.stepResult.outcome == "ready"
        assert all(item.status == "unverified" for item in handoff.stepResult.acceptanceResults)
        assert git(source, "status", "--porcelain") == ""
        assert (await development.start(RunLaunchInput(
            projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2, modelId="fixture-model", idempotencyKey=run_key,
        ))).runId == run_key
        await development.shutdown()

        bad, bad_intent, bad_workspace, bad_request = await schedule("bad")
        with pytest.raises(SchedulerError, match="EXECUTOR_PROTOCOL_ERROR"):
            await bad.execute(bad_intent, bad_workspace, bad_request)
        assert runs.get(project.projectId, bad_intent.runId).state == "interrupted"
        assert workspaces.inspect(bad_workspace.workspaceId).status == "failed"
        assert not processes.has_active(str(bad_intent.runId))
    finally:
        if not work.done():
            work.cancel()
        await processes.dispose()
        storage.close()
