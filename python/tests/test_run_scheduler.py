"""Real process fixture exercises Python Host scheduler without claiming Codex parity."""

import asyncio
import hashlib
import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from forge.agent_profiles import AgentProfile, AgentProfileService, ProfileSave
from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
    canonical_json,
)
from forge.board import BoardService
from forge.context import ContextService, build_context_bundle, executor_context
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.development import DevelopmentError, HostDevelopmentService, RunLaunchInput
from forge.device_pairing import PairingDecisionInput
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.executor_contracts import (
    CommandStarted,
    ExecutorCapabilities,
    ExecutorStartError,
    RunCancelled,
    RunCompleted,
    RunFailed,
    RunStarted,
    ScheduledExecutorRequest,
    UsageUpdated,
)
from forge.handoffs import HostSnapshotService
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.processes import ProcessController
from forge.projects import TRUST_VERSION, ProjectService
from forge.protocol import encode_frame
from forge.remote_commands import RemoteCommandError, read_remote_diff_page
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
)
from forge.run_inspection import RunInspectionService, redact, safe_diff_path
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


def test_explicit_observed_run_token_choice_is_bounded() -> None:
    payload = {"projectId": uuid4(), "taskId": uuid4(),
               "expectedTaskRevision": 2, "modelId": "fixture-model",
               "idempotencyKey": uuid4()}
    assert RunLaunchInput(**payload).maxTokens is None
    assert RunLaunchInput(**payload, maxTokens=200_000).maxTokens == 200_000
    with pytest.raises(ValidationError):
        RunLaunchInput(**payload, maxTokens=250_000)


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


class BudgetFixtureHandle(FixtureHandle):
    def __init__(self, request, callback, session, processes, kind: str) -> None:
        super().__init__(request, callback, session, processes, "long")
        self.kind = kind
        self.budget_emitted = False

    async def wait(self):
        if not self.budget_emitted:
            self.budget_emitted = True
            await asyncio.sleep(.05)
            if self.kind == "tool":
                self.callback(CommandStarted(
                    runId=self.run_id, sequence=2, timestamp=timestamp(),
                    type="command.started", commandId="fixture-command-1", command="hidden",
                ))
                self.callback(CommandStarted(
                    runId=self.run_id, sequence=3, timestamp=timestamp(),
                    type="command.started", commandId="fixture-command-2", command="hidden",
                ))
            else:
                self.callback(UsageUpdated(
                    runId=self.run_id, sequence=2, timestamp=timestamp(),
                    type="usage.updated", inputTokens=4000, outputTokens=1500,
                    cachedInputTokens=None, cost=None, currency=None,
                ))
        code = await self.session.wait()
        if not self.emitted:
            self.emitted = True
            self.callback(RunCancelled(
                runId=self.run_id, sequence=4 if self.kind == "tool" else 3,
                timestamp=timestamp(), type="run.cancelled",
            ))
        return "cancelled" if code != 0 else "completed"


class BudgetFixtureAdapter(FixtureAdapter):
    def __init__(self, processes: ProcessController, script: Path, kind: str) -> None:
        super().__init__(processes, script, "long")
        self.kind = kind

    async def start(self, request, on_event):
        session = await self.processes.spawn(
            request.runId, sys.executable,
            [str(self.script), request.workspace, "long"], Path(request.workspace),
        )
        return BudgetFixtureHandle(request, on_event, session, self.processes, self.kind)


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
async def test_scheduler_real_process_success_then_durable_cancel(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
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

    async def schedule(mode: str, *, max_tokens: int = 5000,
                       max_tool_calls: int = 10, profile: AgentProfile | None = None):
        run_id = uuid4()
        lock = "a" * 64
        profile_lock = ProfileLock(
            id=profile.id if profile else "developer",
            version=str(profile.revision) if profile else "1",
            contentHash=hashlib.sha256(canonical_json(
                profile.model_dump(mode="json")
            ).encode()).hexdigest() if profile else lock,
            executorPluginId="fixture.executor",
        )
        selection = RunConfigSelection(
            runId=run_id, projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2,
            workflow=VersionLock(id="standard", version="1", contentHash=lock),
            profile=profile_lock,
            plugins=[VersionLock(id="fixture.executor", version="1", contentHash=lock)],
            budget=RunBudget(
                maxDurationMs=30_000, maxTurns=3,
                maxTokens=max_tokens, maxToolCalls=max_tool_calls,
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
            goal=f"{profile.promptTemplate}\n\n{context.goal}" if profile else context.goal,
            context=executor_context(context),
            permission="workspace-write", approval="never",
            model=profile.modelId if profile else None,
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
            BudgetFixtureAdapter(processes, script, mode.removeprefix("budget-"))
            if mode.startswith("budget-") else FixtureAdapter(processes, script, mode),
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
    first_remote_diff = read_remote_diff_page(
        storage, str(intent.projectId), intent.taskId, None, 12,
    )
    assert first_remote_diff["available"] is True
    assert first_remote_diff["files"] == [{"path": "result.txt", "status": "added"}]
    assert first_remote_diff["nextCursor"] is not None
    chunks = [first_remote_diff["textChunk"]]
    cursor = first_remote_diff["nextCursor"]
    while cursor is not None:
        part = read_remote_diff_page(storage, str(intent.projectId), intent.taskId,
                                     cursor, 12)
        chunks.append(part["textChunk"])
        cursor = part["nextCursor"]
    assert "real process wrote this" in "".join(chunks)
    with pytest.raises(RemoteCommandError, match="REMOTE_CURSOR_STALE"):
        read_remote_diff_page(storage, str(intent.projectId), intent.taskId,
                              "d:0000000000000000:12", 12)
    assert not safe_diff_path(".env")
    assert not safe_diff_path(".github/private/credentials.json")
    assert not safe_diff_path("config/secrets.yaml")
    assert not safe_diff_path("../parent.txt")
    assert not safe_diff_path("C:\\private\\key.pem")
    # The same persisted real-process Diff is read through a separately
    # initialized Python Host with a current paired-device Project grant.
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    remote_host = HostRuntime()
    try:
        assert remote_host.storage_health()["status"] == "ready"
        issued = remote_host.device_pairing.issue()
        claim = remote_host.device_pairing.claim_from_nonce(
            issued["nonce"], device_name="Fixture phone", address_summary="loopback",
            fingerprint_summary="fixture-phone",
        )
        remote_host.device_pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True,
            projectIds=[project.projectId], scopes=[],
        ))
        session = remote_host.remote_sessions.pairing_status(claim["claimSecret"])
        remote_page = await remote_host.dispatch_remote("query", {
            "sessionToken": session["sessionToken"], "method": "task.diff",
            "payload": {"taskId": str(intent.taskId), "limit": 4096, "cursor": None},
        })
        assert remote_page["available"] is True
        assert remote_page["files"] == [{"path": "result.txt", "status": "added"}]
        assert "real process wrote this" in remote_page["textChunk"]
        remote_activity = await remote_host.dispatch_remote("query", {
            "sessionToken": session["sessionToken"], "method": "task.activity",
            "payload": {"taskId": str(intent.taskId), "limit": 1, "cursor": None},
        })
        assert len(remote_activity["items"]) == 1
        assert remote_activity["page"]["hasMore"] is True
        older_activity = await remote_host.dispatch_remote("query", {
            "sessionToken": session["sessionToken"], "method": "task.activity",
            "payload": {"taskId": str(intent.taskId), "limit": 1,
                        "cursor": remote_activity["page"]["cursor"]},
        })
        assert len(older_activity["items"]) == 1
        assert older_activity["items"][0]["cursor"] < remote_activity["items"][0]["cursor"]
    finally:
        await remote_host.shutdown()
    checkpoint = contexts.latest_checkpoint(project.projectId, intent.runId)
    assert checkpoint is not None and checkpoint.sequence == 1
    assert checkpoint.objective.text == "Write result file"
    assert checkpoint.budget.toolCallsUsed == 0
    assert redact("Authorization: Bearer secret-value") == "[REDACTED]"
    assert "fixture-secret" not in redact(
        "+-----BEGIN OPENSSH PRIVATE KEY-----\n+fixture-secret\n"
        "+-----END OPENSSH PRIVATE KEY-----"
    )
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
        public_config = await host_call("run.config", {
            "projectId": str(project.projectId), "runId": str(intent.runId),
        })
        assert public_config["result"]["data"]["maxDurationMs"] == 30_000
        assert public_config["result"]["data"]["maxTokens"] == 5000
        assert public_config["result"]["data"]["maxToolCalls"] == 10
        assert public_config["result"]["data"]["maxOutputTokens"] is None
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

    limited_profile = AgentProfile(
        schemaVersion="1.0", id="profile.fixture.budget", revision=1,
        name="Budgeted Developer", role="developer", executorId="fixture.executor",
        modelId="fixture-model", promptTemplate="Work inside the isolated fixture.",
        contextProviders=["task-contract"], policyProfile="workspace-write",
        limits={"maxTurns": 10, "maxSeconds": 420, "maxOutputTokens": 1000},
    )
    AgentProfileService(storage).save(ProfileSave(
        profile=limited_profile, expectedRevision=0,
    ))
    for mode, options, expected_code in (
        ("budget-usage", {"max_tokens": 5000}, "RUN_TOKEN_BUDGET_EXCEEDED"),
        ("budget-tool", {"max_tool_calls": 1}, "RUN_TOOL_BUDGET_EXCEEDED"),
        ("budget-usage", {"max_tokens": 6000, "profile": limited_profile},
         "RUN_OUTPUT_BUDGET_EXCEEDED"),
    ):
        budgeted, budget_intent, budget_workspace, budget_request = await schedule(
            mode, **options,
        )
        ended = await asyncio.wait_for(
            budgeted.execute(budget_intent, budget_workspace, budget_request), 8,
        )
        assert ended.state == "failed" and not processes.has_active(str(budget_intent.runId))
        assert workspaces.inspect(budget_workspace.workspaceId).status == "ready"
        result = RunInspectionService(storage, runs).inspect(project.projectId,
                                                              budget_intent.runId)
        assert result.budgetFailure == expected_code
        assert storage.session().execute(
            "SELECT reason FROM run_cancel_intents WHERE run_id=?",
            (str(budget_intent.runId),),
        ).fetchone() is None
        if mode == "budget-usage":
            assert result.usage is not None and result.usage["outputTokens"] == 1500
        assert git(source, "status", "--porcelain") == ""

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
        storage.migrate(LATEST_SCHEMA)
        profiles = AgentProfileService(storage)
        selected_profile = AgentProfile(
            schemaVersion="1.0", id="profile.fixture.developer", revision=1,
            name="Fixture Developer", role="developer", executorId="fixture.executor",
            modelId="fixture-model", promptTemplate="Work inside the isolated fixture.",
            contextProviders=["task-contract"], policyProfile="workspace-write",
            limits={"maxTurns": 10, "maxSeconds": 420, "maxOutputTokens": 12000},
        )
        profiles.save(ProfileSave(profile=selected_profile, expectedRevision=0))
        development = HostDevelopmentService(
            storage, projects, BoardService(storage),
            environments, configs, contexts, runs, workspaces, developed_scheduler,
            HostSnapshotService(storage, workspaces, processes, runs, configs, contexts),
            developed_scheduler.adapter, profiles=profiles,
        )
        with pytest.raises(DevelopmentError, match="PROFILE_UNAVAILABLE"):
            await development.start(RunLaunchInput(
                projectId=project.projectId, taskId=draft.draftId,
                expectedTaskRevision=2, modelId="unsupported-model",
                idempotencyKey=uuid4(), profileId=selected_profile.id,
                profileRevision=selected_profile.revision,
            ))
        rejected_context_run = uuid4()
        with pytest.raises(DevelopmentError, match="PROFILE_CONTEXT_UNSUPPORTED"):
            await development.start(RunLaunchInput(
                projectId=project.projectId, taskId=draft.draftId,
                expectedTaskRevision=2, modelId="fixture-model",
                idempotencyKey=rejected_context_run,
                profileId=selected_profile.id,
                profileRevision=selected_profile.revision,
                contextQuery="fixture knowledge",
            ))
        assert configs.get(project.projectId, rejected_context_run) is None
        assert runs.get(project.projectId, rejected_context_run) is None
        run_key = uuid4()
        launched = await development.start(RunLaunchInput(
            projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2, modelId="fixture-model",
            idempotencyKey=run_key, maxTokens=200_000,
            profileId=selected_profile.id, profileRevision=selected_profile.revision,
        ))
        assert launched.runId == run_key and launched.state in ("queued", "running", "succeeded")
        frozen = configs.get(project.projectId, run_key)
        assert frozen is not None
        assert frozen.budget.maxDurationMs == 420_000
        assert frozen.budget.maxTokens == 200_000
        assert frozen.profile.version == str(selected_profile.revision)
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
            maxTokens=200_000,
            profileId=selected_profile.id, profileRevision=selected_profile.revision,
        ))).runId == run_key
        revised_profile = selected_profile.model_copy(update={
            "revision": 2,
            "limits": selected_profile.limits.model_copy(update={"maxSeconds": 60}),
        })
        profiles.save(ProfileSave(profile=revised_profile, expectedRevision=1))
        next_message = conv.send(ConversationSend(
            projectId=project.projectId, conversationId=conversation.conversationId,
            idempotencyKey="scheduler-fixture-message-02", text="Update another source",
            attachmentIds=[],
        ))["message"]
        next_draft = drafts.manual(DraftRequest(
            projectId=project.projectId, conversationId=conversation.conversationId,
            sourceMessageId=next_message.messageId,
            idempotencyKey="scheduler-fixture-draft-02",
        ))
        next_decision = uuid4()
        next_contract = contract.model_copy(update={
            "taskId": str(next_draft.draftId),
            "sourceRefs": [f"message:{next_message.messageId}",
                           f"decision:{next_decision}"],
            "acceptance": [contract.acceptance[0].model_copy(update={
                "sourceRefs": [f"decision:{next_decision}"],
            })],
        })
        drafts.revise(DraftReviseInput(
            projectId=project.projectId, draftId=next_draft.draftId,
            expectedRevision=1, contract=next_contract, decisionId=next_decision,
            decisionSummary="Second fixture scope", resolvedQuestions=[],
            removedAcceptanceIds=[], confirmScopeChange=True,
        ))
        next_pending = approvals.request(ApprovalRequestInput(
            projectId=project.projectId, draftId=next_draft.draftId, expectedRevision=2,
        ))
        approvals.decide(ApprovalDecideInput(
            projectId=project.projectId, decision=ApprovalDecision(
                schemaVersion="1.0", approvalId=next_pending.request.approvalId,
                decision="approve", expectedRevision=2,
                scopeHash=next_pending.request.scopeHash, reason="Second fixture approved",
            ),
        ))
        next_key = uuid4()
        await development.start(RunLaunchInput(
            projectId=project.projectId, taskId=next_draft.draftId,
            expectedTaskRevision=2, modelId="fixture-model", idempotencyKey=next_key,
            profileId=revised_profile.id, profileRevision=revised_profile.revision,
        ))
        for _ in range(100):
            if not development.running:
                break
            await asyncio.sleep(.05)
        old_config = configs.get(project.projectId, run_key)
        next_config = configs.get(project.projectId, next_key)
        assert old_config is not None and old_config.budget.maxDurationMs == 420_000
        assert next_config is not None and next_config.budget.maxDurationMs == 60_000
        assert old_config.budget.maxTokens == 200_000
        assert next_config.budget.maxTokens == 50_000
        assert old_config.profile.version == "1" and next_config.profile.version == "2"
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
