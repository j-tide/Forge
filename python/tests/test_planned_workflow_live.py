"""Opt-in Codex Plan acceptance in a disposable Git repository.

Run only with FORGE_PLAN_LIVE=1 and an already authorized Codex login. The
strict preset stops before Developer, so this test uses one read-only turn.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

from forge.agent_profiles import AgentProfile, AgentProfileService, ProfileSave
from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.board import BoardService
from forge.codex_executor import CodexExecutorAdapter
from forge.context import ContextService
from forge.conversations import ConversationSend, ConversationService
from forge.development import HostDevelopmentService, RunLaunchInput
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.handoffs import HostSnapshotService
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.processes import ProcessController
from forge.projects import TRUST_VERSION, ProjectService
from forge.run_config import RunConfigService
from forge.run_scheduler import HostRunScheduler
from forge.runs import RunService
from forge.workflow_compiler import WorkflowCatalog
from forge.workflow_drafts import WorkflowDraftService, WorkflowPublishInput, WorkflowSaveInput
from forge.workflow_templates import load_template
from forge.workspaces import WorkspaceManager


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True,
                          capture_output=True, text=True, timeout=15).stdout.strip()


def approved_plan_task(storage: ForgePersistence, source: Path, workflow_id: str):
    project_service = ProjectService(storage)
    probe = project_service.probe(str(source))
    project = project_service.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project.projectId), "Planner acceptance", 0)
    message = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="plan-source-message-v1", text="Plan input validation for add(a, b).",
        attachmentIds=[],
    ))["message"]
    drafts = DraftService(storage)
    draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey="plan-task-draft-v1",
    ))
    decision_id = uuid4()
    refs = [f"message:{message.messageId}", f"decision:{decision_id}"]
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project.projectId),
        revision=2, title="Plan add input validation", type="feature",
        goal="Plan how to make add(a,b) reject non-numeric inputs without changing valid results.",
        acceptance=[AcceptanceCriterion(
            id="ac1",
            statement="Invalid inputs are rejected; valid sums remain unchanged",
            method="automated", required=True, sourceRefs=refs,
        )], constraints=[], scope=["add.js"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=refs,
        workflowRef=workflow_id, priority="normal",
    )
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id,
        decisionSummary="Approved isolated Planner fixture scope",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    approvals = ApprovalService(storage, drafts)
    pending = approvals.request(ApprovalRequestInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=2,
    ))
    approvals.decide(ApprovalDecideInput(
        projectId=project.projectId, decision=ApprovalDecision(
            schemaVersion="1.0", approvalId=pending.request.approvalId,
            decision="approve", expectedRevision=2,
            scopeHash=pending.request.scopeHash, reason="Human fixture approval",
        ),
    ))
    return project, draft


@pytest.mark.skipif(os.getenv("FORGE_PLAN_LIVE") != "1", reason="online opt-in")
@pytest.mark.asyncio
async def test_codex_strict_read_only_planner_produces_real_artifact(tmp_path: Path) -> None:
    source = tmp_path / "plan fixture 项目"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "add.js").write_text("export function add(a, b) { return a + b; }\n")
    (source / "README.md").write_text("Add input validation without changing the API.\n")
    git(source, "add", ".")
    git(source, "commit", "-m", "baseline")
    baseline = git(source, "rev-parse", "HEAD")

    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    processes = ProcessController(uuid4(), tmp_path / "process-journal")
    adapter = CodexExecutorAdapter(processes)
    caps = await adapter.probe()
    assert caps.available and caps.readOnlyEnforced and caps.structuredOutput
    model = "gpt-6-luna" if "gpt-6-luna" in caps.modelIds else caps.modelIds[0]
    profiles = AgentProfileService(storage)
    bindings: dict[str, str] = {}
    for role, policy, context in (
        ("planner", "read-only", ["task-contract"]),
        ("developer", "workspace-write", ["task-contract"]),
        ("reviewer", "read-only", ["task-contract", "snapshot-diff"]),
    ):
        profile = AgentProfile.model_validate({
            "schemaVersion": "1.0", "id": f"profile.fixture.{role}",
            "revision": 1, "name": role, "role": role,
            "executorId": adapter.id, "modelId": model,
            "promptTemplate": (
                "You are the read-only Planner. Inspect README.md and add.js only, "
                "then return the requested plan-result JSON. Do not edit files."
            ) if role == "planner" else "Follow the requested role.",
            "contextProviders": context, "policyProfile": policy,
            "limits": {"maxTurns": 4, "maxSeconds": 180, "maxOutputTokens": 8000},
        })
        profiles.save(ProfileSave(profile=profile, expectedRevision=0))
        bindings[role] = profile.id
    template = load_template("strict").model_copy(update={
        "id": "workflow.fixture.strict-live",
        "nodes": [node.model_copy(update={
            "binding": bindings[{"plan": "planner", "develop": "developer",
                                 "review": "reviewer"}[node.id]],
        }) if node.id in ("plan", "develop", "review") else node
                  for node in load_template("strict").nodes],
    })
    workflows = WorkflowDraftService(storage)
    workflows.save(WorkflowSaveInput(template=template, expectedRevision=0))
    catalog = WorkflowCatalog(
        profiles={profile.id: profile for profile in profiles.list()},
        executors={adapter.id: caps},
        verifiers=frozenset(("verifier.project-checks",)),
    )
    workflows.publish(WorkflowPublishInput(
        workflowId=template.id, expectedDraftRevision=1,
    ), catalog)
    project, draft = approved_plan_task(storage, source, template.id)
    envs = EnvironmentService(storage)
    configs = RunConfigService(storage, envs)
    contexts = ContextService(storage, configs)
    runs = RunService(storage, configs)
    workspaces = WorkspaceManager(tmp_path / "workspaces", processes.runtime_id,
                                  processes.has_active)
    await workspaces.open()
    scheduler = HostRunScheduler(runs, configs, contexts, workspaces, processes, adapter)
    development = HostDevelopmentService(
        storage, ProjectService(storage), BoardService(storage), envs, configs,
        contexts, runs, workspaces, scheduler,
        HostSnapshotService(storage, workspaces, processes, runs, configs, contexts),
        adapter, profiles=profiles,
    )

    async def available_catalog() -> WorkflowCatalog:
        return catalog

    development.workflow_catalog = available_catalog
    run_id = uuid4()
    try:
        started = await development.start(RunLaunchInput(
            projectId=project.projectId, taskId=draft.draftId,
            expectedTaskRevision=2, modelId=model, idempotencyKey=run_id,
            maxTokens=200_000,
        ))
        assert started.attempt.nodeId == "plan"
        for _ in range(120):
            current = runs.get(project.projectId, run_id)
            if current and current.state in ("succeeded", "failed", "cancelled", "interrupted"):
                break
            await asyncio.sleep(2)
        current = runs.get(project.projectId, run_id)
        assert current is not None and current.state == "succeeded", (
            current.state if current else "missing",
            scheduler.inspections.inspect(project.projectId, run_id).model_dump(mode="json"),
        )
        gate = development.plan_gate(project.projectId, draft.draftId, run_id)
        assert gate is not None and gate.decision == "pending"
        assert gate.requiresApproval and gate.developmentRunId is None
        assert gate.artifact.result.plan and gate.artifact.baseRevision == baseline
        assert git(source, "status", "--porcelain") == ""
        assert git(source, "rev-parse", "HEAD") == baseline
    finally:
        await development.shutdown()
        await adapter.dispose()
        storage.close()
