"""Offline real Git/Host services exercise the Planner-to-Developer handoff.

The Executor here is a local fixture. It is not Codex online acceptance.
"""

from __future__ import annotations

import asyncio
import subprocess
from collections.abc import Callable
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from pydantic import TypeAdapter
from test_workflow_versioning import approved_task

from forge.agent_profiles import AgentProfile, AgentProfileService, ProfileSave
from forge.board import BoardService
from forge.context import ContextItem, ContextService
from forge.context_builder import StageContextBuilder
from forge.conversations import timestamp
from forge.development import (
    DevelopmentError,
    HostDevelopmentService,
    PlanActionInput,
    RunLaunchInput,
)
from forge.environments import EnvironmentService
from forge.executor_contracts import ExecutorCapabilities, ExecutorEvent, ScheduledExecutorRequest
from forge.handoffs import HostSnapshotService
from forge.knowledge_ingestion import (
    KnowledgeImportInput,
    KnowledgeIngestionService,
    KnowledgeSourceInput,
)
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.planner import PlanArtifactService
from forge.processes import ProcessController
from forge.project_memory import ProjectMemoryService
from forge.projects import ProjectService
from forge.rework import ReworkCycle, frozen_rework_limit
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService
from forge.run_scheduler import HostRunScheduler
from forge.runs import RunService
from forge.workflow_compiler import WorkflowCatalog
from forge.workflow_drafts import WorkflowDraftService, WorkflowPublishInput, WorkflowSaveInput
from forge.workflow_templates import load_template
from forge.workspaces import WorkspaceManager


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True,
                          capture_output=True, text=True, timeout=15).stdout.strip()


class _Handle:
    def __init__(self, request: ScheduledExecutorRequest,
                 event: Callable[[ExecutorEvent], None], plan_mode: str) -> None:
        self.request = request
        self.event = event
        self.plan_mode = plan_mode
        self.run_id = request.runId
        self.provider_session_id = f"fixture-{request.runId}"
        self.sequence = 0
        self.cancelled = False
        self._emit("run.started", providerSessionId=self.provider_session_id)
        self._emit("run.status", status="running")

    def _emit(self, kind: str, **values: object) -> None:
        from forge.conversations import timestamp

        self.sequence += 1
        checked = TypeAdapter(ExecutorEvent).validate_python({
            "type": kind, "runId": self.run_id, "sequence": self.sequence,
            "timestamp": timestamp(), **values,
        })
        self.event(checked)

    async def wait(self) -> str:
        await asyncio.sleep(.03)
        if self.cancelled:
            self._emit("run.cancelled")
            return "cancelled"
        if self.request.permission == "read-only":
            assert self.request.outputSchema is not None
            if self.plan_mode == "workspace-write":
                Path(self.request.workspace, "unauthorized.txt").write_text("changed")
            result: object = {
                "schemaVersion": "1.0", "runId": self.run_id,
                "attemptId": self.request.attempt.attemptId,
                "nodeId": "plan",
                "contractRevision": self.request.attempt.contractRevision,
                "snapshotId": None, "outcome": "ready", "artifactIds": [],
                "unresolved": [], "acceptanceResults": [],
                "summary": "Add the requested input validation.",
                "plan": [{"id": "guard", "description": "Guard invalid values",
                          "paths": ["src/add.py"], "dependsOn": [],
                          "checks": ["Run the tests"]}],
            }
            if self.plan_mode == "invalid-output":
                result = {**result, "runId": "unknown"}
        else:
            Path(self.request.workspace, "result.txt").write_text("developed")
            result = None
        self._emit("run.completed", providerSessionId=self.provider_session_id,
                   structuredOutput=result)
        return "completed"

    async def cancel(self) -> None:
        self.cancelled = True

    async def dispose(self) -> None:
        return None


class _Executor:
    id = "fixture.executor"

    def __init__(self, plan_mode: str = "valid") -> None:
        self.requests: list[ScheduledExecutorRequest] = []
        self.plan_mode = plan_mode
        self.caps = ExecutorCapabilities(
            executorId=self.id, adapterVersion="1", upstreamVersion="fixture-1",
            platform="test", available=True, streaming=True, resume=False,
            interrupt=True, approval=True, structuredEvents=True,
            structuredOutput=True, workspaceControl=True, toolEvents=True,
            sessionPersistence=False, modelSelection=True, usageReporting=False,
            readOnlyEnforced=True, networkPolicyEnforced=False,
            enforcement="native-sandbox", modelIds=["fixture-model"],
            authModes=[], warnings=[],
        )

    async def probe(self) -> ExecutorCapabilities:
        return self.caps

    async def start(self, request: ScheduledExecutorRequest,
                    on_event: Callable[[ExecutorEvent], None]) -> _Handle:
        self.requests.append(request)
        return _Handle(request, on_event, self.plan_mode)

    async def dispose(self) -> None:
        return None


@pytest.mark.parametrize("preset,action", [
    ("standard", "automatic"), ("strict", "approve"), ("strict", "reject"),
    ("standard", "recover"), ("strict", "strict-recover"),
    ("standard", "rework"), ("strict", "rework"),
    ("standard", "invalid-output"), ("standard", "workspace-write"),
    ("standard", "context"), ("strict", "context-revoked"),
    ("standard", "context-rework"), ("standard", "context-rework-revoked"),
])
@pytest.mark.asyncio
async def test_published_standard_runs_read_only_plan_then_uses_its_artifact(
    tmp_path: Path,
    preset: str,
    action: str,
) -> None:
    source = tmp_path / "source repo 空格"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "README.md").write_text("fixture")
    if action.startswith("context"):
        (source / "docs").mkdir()
        (source / "docs" / "guide.md").write_text(
            "# Date API\nUse start_date for filtering dates.\n", encoding="utf-8",
        )
    git(source, "add", ".")
    git(source, "commit", "-m", "baseline")
    baseline = git(source, "rev-parse", "HEAD")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    adapter = _Executor(action if action in ("invalid-output", "workspace-write") else "valid")
    profiles = AgentProfileService(storage)
    bindings: dict[str, str] = {}
    for role, policy, context in (
        ("planner", "read-only", ["task-contract", "project-context"]
         if action.startswith("context") else ["task-contract"]),
        ("developer", "workspace-write", ["task-contract", "project-context"]
         if action.startswith("context") else ["task-contract"]),
        ("reviewer", "read-only", ["task-contract", "snapshot-diff"]),
    ):
        profile = AgentProfile.model_validate({
            "schemaVersion": "1.0", "id": f"profile.fixture.{role}",
            "revision": 1, "name": role, "role": role,
            "executorId": adapter.id, "modelId": "fixture-model",
            "promptTemplate": f"{role} only", "contextProviders": context,
            "policyProfile": policy,
            "limits": {"maxTurns": 10, "maxSeconds": 300,
                       "maxOutputTokens": 12000},
        })
        profiles.save(ProfileSave(profile=profile, expectedRevision=0))
        bindings[role] = profile.id
    template = load_template(preset).model_copy(update={
        "id": "workflow.fixture.planned",
        "nodes": [node.model_copy(update={
            "binding": bindings[{"plan": "planner", "develop": "developer",
                                 "review": "reviewer"}[node.id]],
        }) if node.id in ("plan", "develop", "review") else node
                  for node in load_template(preset).nodes],
    })
    workflows = WorkflowDraftService(storage)
    workflows.save(WorkflowSaveInput(template=template, expectedRevision=0))
    available = WorkflowCatalog(
        profiles={profile.id: profile for profile in profiles.list()},
        executors={adapter.id: adapter.caps},
        verifiers=frozenset(("verifier.project-checks",)),
    )
    workflows.publish(WorkflowPublishInput(
        workflowId=template.id, expectedDraftRevision=1,
    ), available)
    project, draft, _ = approved_task(storage, source, template.id)
    knowledge = KnowledgeIngestionService(storage, ProjectService(storage))
    imported = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/guide.md",
    )) if action.startswith("context") else None
    envs = EnvironmentService(storage)
    configs = RunConfigService(storage, envs)
    contexts = ContextService(storage, configs)
    stage_contexts = StageContextBuilder(
        storage, configs, knowledge,
        ProjectMemoryService(storage, ProjectService(storage)),
    )
    runs = RunService(storage, configs)
    processes = ProcessController(uuid4(), tmp_path / "process-journal")
    workspaces = WorkspaceManager(tmp_path / "workspaces", processes.runtime_id,
                                  processes.has_active)
    await workspaces.open()
    scheduler = HostRunScheduler(runs, configs, contexts, workspaces, processes, adapter)
    scheduler_errors: list[str] = []
    execute = scheduler.execute

    async def traced_execute(*args: object, **kwargs: object):
        try:
            return await execute(*args, **kwargs)  # type: ignore[arg-type]
        except Exception as error:
            scheduler_errors.append(repr(error))
            raise

    scheduler.execute = traced_execute  # type: ignore[method-assign]
    development = HostDevelopmentService(
        storage, ProjectService(storage), BoardService(storage), envs, configs,
        contexts, runs, workspaces, scheduler,
        HostSnapshotService(storage, workspaces, processes, runs, configs, contexts),
        adapter, profiles=profiles, stage_contexts=stage_contexts,
    )

    async def catalog() -> WorkflowCatalog:
        return WorkflowCatalog(
            profiles={profile.id: profile for profile in profiles.list()},
            executors=available.executors, verifiers=available.verifiers,
        )

    development.workflow_catalog = catalog
    try:
        if action in ("recover", "strict-recover"):
            original_handoff = development._start_after_plan
            handoff_attempts = 0

            async def fail_first_handoff(*args, **kwargs):
                nonlocal handoff_attempts
                handoff_attempts += 1
                if handoff_attempts == 1:
                    raise DevelopmentError("RUN_START_FAILED")
                return await original_handoff(*args, **kwargs)

            development._start_after_plan = fail_first_handoff  # type: ignore[method-assign]
        capabilities = await development.capabilities(project.projectId, draft.draftId)
        assert capabilities.available
        assert capabilities.workflowBinding is not None
        assert capabilities.workflowBinding.entryNode == "plan"
        plan_run_id = uuid4()
        launched = await development.start(RunLaunchInput(
            projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2, modelId="fixture-model",
            idempotencyKey=plan_run_id,
            contextQuery="start_date" if action.startswith("context") else None,
        ))
        assert launched.attempt.nodeId == "plan"
        if action in ("invalid-output", "workspace-write"):
            for _ in range(200):
                if runs.get(project.projectId, plan_run_id).state == "failed" and (
                    not development.running
                ):
                    break
                await asyncio.sleep(.03)
            assert runs.get(project.projectId, plan_run_id).state == "failed"
            assert RunInspectionService(storage, runs).inspect(
                project.projectId, plan_run_id
            ).planFailure == (
                "PLAN_RESULT_INVALID" if action == "invalid-output"
                else "PLAN_WORKSPACE_CHANGED"
            )
            assert development.plan_gate(project.projectId, draft.draftId, plan_run_id) is None
            assert len(adapter.requests) == 1, scheduler_errors
            assert git(source, "status", "--porcelain") == ""
            assert git(source, "rev-parse", "HEAD") == baseline
            return
        if preset == "strict":
            for _ in range(200):
                if runs.get(project.projectId, plan_run_id).state == "succeeded" and (
                    not development.running
                ):
                    break
                await asyncio.sleep(.03)
            assert len(adapter.requests) == 1, scheduler_errors
            gate = development.plan_gate(project.projectId, draft.draftId, plan_run_id)
            assert gate is not None and gate.requiresApproval and gate.decision == "pending"
            assert gate.developmentRunId is None
            if action == "context-revoked":
                assert imported is not None
                plan_context = contexts.run_sources(project.projectId, plan_run_id)
                assert len(plan_context) == 1 and plan_context[0].status == "current"
                knowledge.revoke(KnowledgeSourceInput(
                    projectId=project.projectId, sourceId=imported.sourceId,
                ))
            storage.close()
            storage.open()
            storage.migrate(LATEST_SCHEMA)
            restored = development.plan_gate(project.projectId, draft.draftId, plan_run_id)
            assert restored == gate
            if action != "reject":
                for role in ("developer", "reviewer"):
                    current = profiles.get(bindings[role])
                    assert current is not None
                    profiles.save(ProfileSave(profile=current.model_copy(update={
                        "revision": 2, "modelId": "unavailable-future-model",
                        "promptTemplate": f"New {role} instructions for future runs",
                    }), expectedRevision=1))
            approval = PlanActionInput(
                projectId=project.projectId, taskId=draft.draftId,
                runId=plan_run_id, expectedArtifactHash=gate.artifact.contentHash,
                expectedTaskRevision=2,
                action="approve" if action in (
                    "rework", "strict-recover", "context-revoked"
                ) else action,
                reason="The plan needs a different approach" if action == "reject" else None,
                confirmed=True,
            )
            if action == "strict-recover":
                with pytest.raises(DevelopmentError, match="RUN_START_FAILED"):
                    await development.plan_action(approval)
                pending = development.plan_gate(project.projectId, draft.draftId,
                                                plan_run_id)
                assert pending is not None and pending.decision == "approved"
                assert pending.developmentRunId is not None
                storage.close()
                storage.open()
                storage.migrate(LATEST_SCHEMA)
                approval = approval.model_copy(update={"action": "continue"})
            if action == "context-revoked":
                with pytest.raises(DevelopmentError, match="PLAN_CONTEXT_STALE"):
                    await development.plan_action(approval)
                assert len(adapter.requests) == 1
                assert git(source, "status", "--porcelain") == ""
                return
            decided = await development.plan_action(approval)
            if action == "reject":
                assert decided.decision == "rejected"
                assert decided.developmentRunId is None
                assert len(adapter.requests) == 1
                assert git(source, "status", "--porcelain") == ""
                return
            assert decided.decision == "approved"
        elif action == "recover":
            for _ in range(200):
                if runs.get(project.projectId, plan_run_id).state == "succeeded" and (
                    not development.running
                ):
                    break
                await asyncio.sleep(.03)
            gate = development.plan_gate(project.projectId, draft.draftId, plan_run_id)
            assert gate is not None and not gate.requiresApproval
            assert gate.decision == "pending" and gate.developmentRunId is None
            storage.close()
            storage.open()
            storage.migrate(LATEST_SCHEMA)
            decided = await development.plan_action(PlanActionInput(
                projectId=project.projectId, taskId=draft.draftId,
                runId=plan_run_id, expectedArtifactHash=gate.artifact.contentHash,
                expectedTaskRevision=2, action="continue", confirmed=True,
            ))
            assert decided.decision == "automatic"
        for _ in range(200):
            if len(adapter.requests) == 2 and not development.running:
                break
            await asyncio.sleep(.03)
        assert len(adapter.requests) == 2, scheduler_errors
        assert adapter.requests[0].permission == "read-only"
        assert adapter.requests[0].approval == "never"
        assert adapter.requests[1].permission == "workspace-write"
        artifact = PlanArtifactService(storage).get(project.projectId, plan_run_id)
        assert artifact is not None and artifact.baseRevision == baseline
        assert runs.get(project.projectId, plan_run_id).state == "succeeded"
        continuation = storage.session().execute(
            "SELECT development_run_id,state FROM plan_continuations WHERE plan_run_id=?",
            (str(plan_run_id),),
        ).fetchone()
        assert continuation is not None and continuation["state"] == (
            "approved" if preset == "strict" else "automatic"
        )
        dev_run_id = continuation["development_run_id"]
        frozen = configs.get(project.projectId, dev_run_id)
        assert frozen is not None and frozen.workflow.contentHash == (
            configs.get(project.projectId, plan_run_id).workflow.contentHash
        )
        assert frozen_rework_limit(storage, frozen, "review") == (
            2 if preset == "strict" else 3
        )
        assert frozen_rework_limit(storage, frozen, "verify") == (
            2 if preset == "strict" else 3
        )
        dev_context = contexts.run_sources(project.projectId, dev_run_id)
        assert isinstance(dev_context, list)
        assert any(f"plan:{artifact.artifactId}" in item for item in
                   adapter.requests[1].context)
        if action.startswith("context"):
            assert any("knowledge:" in item and "start_date" in item
                       for item in adapter.requests[0].context)
            assert any("knowledge:" in item and "start_date" in item
                       for item in adapter.requests[1].context)
            assert len(contexts.run_sources(project.projectId, plan_run_id)) == 1
            assert len(contexts.run_sources(project.projectId, UUID(dev_run_id))) == 1
        developer_handoff = development.handoff(project.projectId, UUID(dev_run_id))
        assert developer_handoff is not None
        assert BoardService(storage).detail(
            str(project.projectId), str(draft.draftId)
        ).detail.task.state != "done"
        if action in ("rework", "context-rework", "context-rework-revoked"):
            current_reviewer = profiles.get(bindings["reviewer"])
            assert current_reviewer is not None
            if current_reviewer.revision == 1:
                profiles.save(ProfileSave(profile=current_reviewer.model_copy(update={
                    "revision": 2, "modelId": "unavailable-future-model",
                    "promptTemplate": "New Reviewer instructions for future runs",
                }), expectedRevision=1))
            cycle = ReworkCycle(
                cycleId=uuid4(), projectId=project.projectId, taskId=draft.draftId,
                sourceRunId=UUID(dev_run_id),
                sourceSnapshotId=developer_handoff.snapshot.snapshotId,
                triggerKind="review", triggerReportId=uuid4(), nextRunId=uuid4(),
                cycleNo=1, totalAttempts=3, state="pending", reasonCode=None,
                createdAt=timestamp(), updatedAt=timestamp(),
            )
            if action == "context-rework-revoked":
                assert imported is not None
                knowledge.revoke(KnowledgeSourceInput(
                    projectId=project.projectId, sourceId=imported.sourceId,
                ))
                with pytest.raises(DevelopmentError, match="REWORK_SOURCE_STALE"):
                    await development.start_rework(cycle, [ContextItem(
                        kind="rework_feedback", authority="review_evidence",
                        sourceRef="review:fixture", text="Change the implementation.",
                    )])
                assert len(adapter.requests) == 2
                assert git(source, "status", "--porcelain") == ""
                return
            next_run = await development.start_rework(cycle, [ContextItem(
                kind="rework_feedback", authority="review_evidence",
                sourceRef="review:fixture", text="Change the implementation as reviewed.",
            )])
            assert next_run.attempt.nodeId == "develop"
            assert next_run.attempt.attemptNo == 2
            next_config = configs.get(project.projectId, cycle.nextRunId)
            assert next_config is not None
            assert next_config.profile == frozen.profile
            assert next_config.stageProfiles == frozen.stageProfiles
            if action == "context-rework":
                assert any("knowledge:" in item and "start_date" in item
                           for item in adapter.requests[-1].context)
                assert len(contexts.run_sources(
                    project.projectId, cycle.nextRunId,
                )) == 1
        assert git(source, "status", "--porcelain") == ""
        assert git(source, "rev-parse", "HEAD") == baseline
    finally:
        await development.shutdown()
        storage.close()
