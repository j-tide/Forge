"""Published Workflow revisions are immutable RunConfig inputs, not live settings."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from test_workflow_compiler import catalog

from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.board import BoardService
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigError,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
)
from forge.runs import RunAttemptResult, RunService, RunStartIntent
from forge.task_changes import (
    TaskChangeApply,
    TaskChangeDecision,
    TaskChangePropose,
    TaskChangeService,
)
from forge.workflow_drafts import WorkflowDraftService, WorkflowPublishInput, WorkflowSaveInput
from forge.workflow_templates import load_template


def approved_task(storage: ForgePersistence, source: Path, workflow_id: str):
    project_service = ProjectService(storage)
    probe = project_service.probe(str(source))
    project = project_service.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    environment = EnvironmentService(storage).list_environments(str(project.projectId))[0]
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project.projectId), "Workflow revision", 0)
    message = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="workflow-revision-message", text="Validate workflow revisions",
        attachmentIds=[],
    ))["message"]
    drafts = DraftService(storage)
    draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey="workflow-revision-draft",
    ))
    decision_id = uuid4()
    refs = [f"message:{message.messageId}", f"decision:{decision_id}"]
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project.projectId),
        revision=2, title="Version freeze", type="feature", goal="Keep older runs frozen",
        acceptance=[AcceptanceCriterion(
            id="ac1", statement="Old run keeps revision one", method="automated",
            required=True, sourceRefs=refs,
        )], constraints=[], scope=["src/add.py"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=refs,
        workflowRef=workflow_id, priority="normal",
    )
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id, decisionSummary="Human scoped fixture",
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
            scopeHash=pending.request.scopeHash, reason="Human approval",
        ),
    ))
    return project, draft, environment


def selection(project, draft, environment, workflow: VersionLock) -> RunConfigSelection:
    digest = "a" * 64
    return RunConfigSelection(
        runId=uuid4(), projectId=project.projectId, taskId=draft.draftId,
        expectedTaskRevision=2, workflow=workflow,
        profile=ProfileLock(id="developer", version="1", contentHash=digest,
                            executorPluginId="forge.executor.codex"),
        plugins=[VersionLock(id="forge.executor.codex", version="0.155.1",
                             contentHash=digest)],
        budget=RunBudget(maxDurationMs=30_000, maxTurns=4, maxTokens=10_000,
                         maxToolCalls=20),
        environmentId=environment.environmentId, expectedEnvironmentRevision=1,
    )


def test_published_revisions_freeze_old_and_new_run_configs(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(26)
    workflows = WorkflowDraftService(storage)
    base = load_template("quick").model_copy(update={"id": "workflow.versioned"})
    workflows.save(WorkflowSaveInput(template=base, expectedRevision=0))
    assert workflows.publish(WorkflowPublishInput(
        workflowId=base.id, expectedDraftRevision=1,
    ), catalog())[0].publishedRevision == 1
    lock_one = workflows.published_lock(base.id)
    project, draft, environment = approved_task(storage, source, base.id)
    configs = RunConfigService(storage, EnvironmentService(storage))
    old = configs.create(selection(project, draft, environment, lock_one))
    assert old.workflow == lock_one
    runs = RunService(storage, configs)
    old_intent = RunStartIntent(
        runId=old.runId, projectId=project.projectId, taskId=draft.draftId,
        attemptId=uuid4(), workspaceId=uuid4(), workspaceLeaseId=uuid4(),
        leaseEpoch=1, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=old.snapshotHash,
        createdAt=timestamp(),
    )
    assert runs.begin(old_intent).state == "queued"
    assert runs.mark_launched(project.projectId, old.runId,
                              old_intent.attemptId, "fixture-session").state == "running"
    draft_two = base.model_copy(update={"revision": 2, "name": "Revised workflow"})
    workflows.save(WorkflowSaveInput(template=draft_two, expectedRevision=1))
    before_publish = workflows.impact(base.id)
    assert before_publish.draftChangedSincePublish
    assert before_publish.frozenRunCounts == {"1": 1}
    with pytest.raises(RunConfigError, match="RUN_CONFIG_WORKFLOW_STALE"):
        configs.create(selection(project, draft, environment, VersionLock(
            id=base.id, version="2", contentHash="b" * 64,
        )))
    workflows.publish(WorkflowPublishInput(
        workflowId=base.id, expectedDraftRevision=2,
    ), catalog())
    lock_two = workflows.published_lock(base.id)
    assert lock_one.contentHash != lock_two.contentHash
    assert runs.get(project.projectId, old.runId).state == "running"
    assert configs.get(project.projectId, old.runId).workflow == lock_one
    runs.request_cancel(project.projectId, old.runId, old_intent.attemptId, "user")
    applied, terminal = runs.complete(project.projectId, old.runId,
        RunAttemptResult(
            runId=old.runId, attemptId=old_intent.attemptId,
            workspaceLeaseId=old_intent.workspaceLeaseId, leaseEpoch=1,
            contractRevision=2, configHash=old.snapshotHash,
            outcome="cancelled", providerSessionRef="fixture-session",
            lastEventSequence=0, timestamp=timestamp(),
        ), verified_stopped=True)
    assert applied == "APPLIED" and terminal.state == "cancelled"
    new = configs.create(selection(project, draft, environment, lock_two))
    assert new.workflow == lock_two and old.workflow == lock_one
    new_intent = RunStartIntent(
        runId=new.runId, projectId=project.projectId, taskId=draft.draftId,
        attemptId=uuid4(), workspaceId=uuid4(), workspaceLeaseId=uuid4(),
        leaseEpoch=2, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=new.snapshotHash,
        createdAt=timestamp(),
    )
    assert runs.begin(new_intent).state == "queued"
    assert workflows.published(base.id, 1).definition.name == base.name
    assert workflows.impact(base.id).frozenRunCounts == {"1": 1, "2": 1}
    with pytest.raises(RunConfigError, match="RUN_CONFIG_WORKFLOW_STALE"):
        configs.create(selection(project, draft, environment, VersionLock(
            id=base.id, version="1", contentHash=lock_two.contentHash,
        )))
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    reopened.migrate(26)
    assert WorkflowDraftService(reopened).published_lock(base.id, 1) == lock_one
    assert WorkflowDraftService(reopened).published_lock(base.id, 2) == lock_two
    restored = RunConfigService(reopened, EnvironmentService(reopened))
    assert restored.get(project.projectId, old.runId).workflow == lock_one
    assert restored.get(project.projectId, new.runId).workflow == lock_two
    reopened.close()


def test_stage_profile_lock_round_trips_without_changing_legacy_snapshot_hash(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    source.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(29)
    workflows = WorkflowDraftService(storage)
    template = load_template("quick").model_copy(update={"id": "workflow.profile-lock"})
    workflows.save(WorkflowSaveInput(template=template, expectedRevision=0))
    workflows.publish(WorkflowPublishInput(
        workflowId=template.id, expectedDraftRevision=1), catalog())
    project, draft, env = approved_task(storage, source, template.id)
    configs = RunConfigService(storage, EnvironmentService(storage))
    selected = selection(project, draft, env, workflows.published_lock(template.id))
    selected.stageProfiles = [ProfileLock(
        id="profile.reviewer", version="1", contentHash="b" * 64,
        executorPluginId="forge.executor.codex",
    )]
    snapshot = configs.create(selected)
    assert snapshot.stageProfiles[0].id == "profile.reviewer"
    assert configs.get(project.projectId, snapshot.runId) == snapshot
    storage.close()


def test_same_task_switches_published_workflow_and_agent_only_after_human_change(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source"
    source.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(29)
    workflows = WorkflowDraftService(storage)
    for workflow_id in ("workflow.first", "workflow.second"):
        template = load_template("quick").model_copy(update={"id": workflow_id})
        workflows.save(WorkflowSaveInput(template=template, expectedRevision=0))
        workflows.publish(WorkflowPublishInput(
            workflowId=workflow_id, expectedDraftRevision=1), catalog())
    project, draft, env = approved_task(storage, source, "workflow.first")
    configs = RunConfigService(storage, EnvironmentService(storage))
    original = selection(project, draft, env, workflows.published_lock("workflow.first"))
    original.profile = ProfileLock(id="profile.developer.a", version="1",
        contentHash="a" * 64, executorPluginId="forge.executor.codex")
    first = configs.create(original)
    prior_contract = BoardService(storage).detail(
        str(project.projectId), str(draft.draftId)).detail.contract
    decision_id = uuid4()
    change_input = TaskChangePropose(
        projectId=project.projectId, taskId=draft.draftId, expectedRevision=2,
        contract=prior_contract.model_copy(update={
            "revision": 3, "workflowRef": "workflow.second",
            "sourceRefs": [*prior_contract.sourceRefs, f"decision:{decision_id}"],
        }),
        decisionId=decision_id, reason="Owner changes the workflow for the next Run.",
        confirmScopeChange=False, idempotencyKey=uuid4(),
    )
    changes = TaskChangeService(storage, ProjectService(storage))
    proposal = changes.propose(change_input)
    waiting = changes.decide(TaskChangeDecision(
        projectId=project.projectId, taskId=draft.draftId,
        changeId=proposal.changeId, expectedRevision=2,
        expectedContentHash=proposal.contentHash, decision="approve",
        reason="Owner approves switching the next workflow.",
    ))
    changes.apply(TaskChangeApply(projectId=project.projectId, taskId=draft.draftId,
        changeId=waiting.changeId, expectedRevision=2, confirmed=True))
    second_input = selection(project, draft, env, workflows.published_lock("workflow.second"))
    second_input.expectedTaskRevision = 3
    second_input.profile = ProfileLock(id="profile.developer.b", version="2",
        contentHash="b" * 64, executorPluginId="forge.executor.codex")
    second = configs.create(second_input)
    assert first.taskId == second.taskId == draft.draftId
    assert first.workflow.id == "workflow.first" and first.profile.id == "profile.developer.a"
    assert second.workflow.id == "workflow.second" and second.profile.id == "profile.developer.b"
    assert configs.get(project.projectId, first.runId) == first
    assert configs.get(project.projectId, second.runId) == second
    storage.close()
