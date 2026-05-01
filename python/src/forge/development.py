"""Development entry for the standard path and admitted linear Workflow nodes."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.agent_profiles import AgentProfile, AgentProfileService, availability
from forge.approvals import canonical_json
from forge.board import BoardError, BoardService
from forge.context import (
    ContextError,
    ContextItem,
    ContextService,
    build_context_bundle,
    executor_context,
)
from forge.context_builder import StageContextBuilder, StageContextInput
from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.executor_contracts import AttemptRequest, ExecutorAdapter, ScheduledExecutorRequest
from forge.handoffs import DevelopmentHandoff, HostSnapshotService
from forge.knowledge_ingestion import KnowledgeError
from forge.persistence import ForgePersistence
from forge.planner import (
    PlanArtifact,
    PlanArtifactService,
    PlanGateView,
    PlannerError,
    PlanResult,
    plan_request_goal,
)
from forge.plugin_api import PluginError
from forge.plugin_lock import PluginPackageLock
from forge.plugins import PluginRegistry
from forge.project_memory import MemoryError
from forge.projects import TRUST_VERSION, ProjectService
from forge.rework import ReworkCycle
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigSelection,
    RunConfigService,
    RunConfigSnapshot,
    VersionLock,
)
from forge.run_scheduler import HostRunScheduler
from forge.runs import RunService, RunStartIntent, RunView
from forge.workflow_compiler import WorkflowCatalog
from forge.workflow_drafts import WorkflowDraftError, WorkflowDraftService
from forge.workflow_runtime import (
    PlannedWorkflow,
    WorkflowRuntimeError,
    admit_linear_workflow,
    admit_planned_workflow,
)
from forge.workspaces import WorkspaceManager

LOGGER = logging.getLogger("forge.development")

_WORKFLOW_REFS = frozenset(("standard", "standard@1"))
_WORKFLOW_VERSION = "p2-development/v1"
_PROFILE_ID = "profile.developer"
_BUDGET = RunBudget(
    maxDurationMs=180_000, maxTurns=10, maxTokens=50_000, maxToolCalls=100
)


class DevelopmentError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class RunLaunchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    expectedTaskRevision: int = Field(ge=1)
    modelId: str = Field(min_length=1, max_length=128)
    idempotencyKey: UUID
    maxTokens: Literal[50_000, 100_000, 200_000] | None = None
    profileId: str | None = None
    profileRevision: int | None = Field(default=None, ge=1)
    contextQuery: str | None = Field(default=None, min_length=1, max_length=160)


class PlanActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    runId: UUID
    expectedArtifactHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    expectedTaskRevision: int = Field(ge=1)
    action: Literal["approve", "reject", "continue"]
    reason: str | None = Field(default=None, max_length=2000)
    confirmed: Literal[True]


class PlanReadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    runId: UUID


class WorkflowLaunchBinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str = Field(min_length=1, max_length=128)
    workflowRevision: int = Field(ge=1)
    profileId: str = Field(min_length=1, max_length=128)
    profileRevision: int = Field(ge=1)
    modelId: str = Field(min_length=1, max_length=128)
    entryNode: Literal["plan", "develop"]


class RunLaunchCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    available: bool
    executorId: str
    adapterVersion: str
    upstreamVersion: str
    modelIds: list[str]
    workspaceControl: bool
    streaming: bool
    interrupt: bool
    warnings: list[str]
    workflowBinding: WorkflowLaunchBinding | None = None


class HumanReworkOrigin(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    state: Literal["pending"]
    projectId: UUID
    taskId: UUID
    sourceRunId: UUID
    sourceSnapshotId: UUID
    nextRunId: UUID


def _hash(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def _node(executor_id: str, workflow_ref: str) -> dict[str, object]:
    return {
        "workflowId": workflow_ref, "workflowRevision": 1,
        "implementedNode": "develop", "profileId": _PROFILE_ID,
        "executorId": executor_id, "permission": "workspace-write",
        "approval": "never", "budget": _BUDGET.model_dump(mode="json"),
    }


class HostDevelopmentService:
    def __init__(
        self, storage: ForgePersistence, projects: ProjectService,
        board: BoardService, environments: EnvironmentService,
        configs: RunConfigService, contexts: ContextService,
        runs: RunService, workspaces: WorkspaceManager,
        scheduler: HostRunScheduler, snapshots: HostSnapshotService,
        adapter: ExecutorAdapter, plugins: PluginRegistry | None = None,
        profiles: AgentProfileService | None = None,
        stage_contexts: StageContextBuilder | None = None,
    ) -> None:
        self.storage = storage
        self.projects = projects
        self.board = board
        self.environments = environments
        self.configs = configs
        self.contexts = contexts
        self.runs = runs
        self.workspaces = workspaces
        self.scheduler = scheduler
        self.snapshots = snapshots
        self.adapter = adapter
        self.plugins = plugins
        self.profiles = profiles
        self.stage_contexts = stage_contexts
        self.workflow_drafts = WorkflowDraftService(storage)
        self.plan_artifacts = PlanArtifactService(storage)
        self.workflow_catalog: Callable[[], Awaitable[WorkflowCatalog]] | None = None
        self.starting: dict[UUID, tuple[str, asyncio.Task[RunView]]] = {}
        self.running: dict[UUID, asyncio.Task[None]] = {}
        self.delivering: set[UUID] = set()
        self.lock = asyncio.Lock()
        self.on_handoff: Callable[[DevelopmentHandoff], Awaitable[None]] | None = None

    def _project(self, project_id: UUID) -> Path:
        project = self.projects.get(str(project_id))
        active = self.projects.active()
        if (
            project is None or not project.trusted
            or project.trustVersion != TRUST_VERSION or project.archivedAt
            or active is None or active.projectId != project_id
        ):
            raise DevelopmentError("PROJECT_TRUST_REQUIRED")
        fresh = self.projects.probe(project.rootPath)
        if (
            fresh.rootPath != project.rootPath or fresh.gitRoot != project.gitRoot
            or fresh.repositoryType != "git"
        ):
            raise DevelopmentError("PROJECT_TRUST_REQUIRED")
        return Path(project.rootPath)

    def _task(self, project_id: UUID, task_id: UUID,
              revision: int | None = None, *, require_todo: bool = True) -> str:
        try:
            detail = self.board.detail(str(project_id), str(task_id)).detail
        except BoardError as error:
            raise DevelopmentError("TASK_NOT_FOUND") from error
        if require_todo and detail.task.state != "todo":
            raise DevelopmentError("RUN_CONFLICT")
        if require_todo and self.storage.schema_version() >= 21 and self.storage.session().execute(
            "SELECT 1 FROM final_acceptance_decisions WHERE project_id=? AND task_id=? "
            "AND contract_revision=? AND decision='accept' LIMIT 1",
            (str(project_id), str(task_id), detail.contract.revision),
        ).fetchone():
            # Done is a projection of signed evidence. An altered basis can
            # withdraw that projection but cannot reopen the accepted revision.
            raise DevelopmentError("RUN_CONFLICT")
        if revision is not None and detail.contract.revision != revision:
            raise DevelopmentError("REVISION_CONFLICT")
        if self.storage.schema_version() >= 23 and self.storage.session().execute(
            "SELECT 1 FROM task_change_requests WHERE task_id=? "
            "AND state='awaiting_safe_point' LIMIT 1", (str(task_id),),
        ).fetchone():
            raise DevelopmentError("RUN_CONFLICT")
        if (detail.contract.workflowRef not in _WORKFLOW_REFS and
                not detail.contract.workflowRef.startswith("workflow.")):
            raise DevelopmentError("RUN_START_FAILED")
        return detail.contract.workflowRef

    def _has_unreconciled_run(self, project_id: UUID) -> bool:
        """An uncertain attempt or quarantined lease fences new project writers."""
        resolved = (
            "AND r.recovery_resolved_at IS NULL "
            if self.storage.schema_version() >= 36 else ""
        )
        return self.storage.session().execute(
            "SELECT 1 FROM runs r WHERE r.project_id=? AND r.state='interrupted' "
            + resolved +
            "UNION ALL SELECT 1 FROM run_workspace_leases AS lease "
            "JOIN runs AS run ON run.run_id=lease.run_id "
            "WHERE run.project_id=? AND lease.state='quarantined' LIMIT 1",
            (str(project_id), str(project_id)),
        ).fetchone() is not None

    async def capabilities(self, project_id: UUID, task_id: UUID) -> RunLaunchCapabilities:
        self._project(project_id)
        workflow_ref = self._task(project_id, task_id, require_todo=False)
        recovery_required = self._has_unreconciled_run(project_id)
        probed = await self.adapter.probe()
        workflow_ready = True
        workflow_binding: WorkflowLaunchBinding | None = None
        if workflow_ref.startswith("workflow."):
            try:
                if self.workflow_catalog is None or self.profiles is None:
                    raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNAVAILABLE")
                published = self.workflow_drafts.published(workflow_ref)
                catalog = await self.workflow_catalog()
                try:
                    binding_id = admit_linear_workflow(published, catalog)
                    entry_node: Literal["plan", "develop"] = "develop"
                except WorkflowRuntimeError as error:
                    if error.code != "WORKFLOW_RUNTIME_UNSUPPORTED":
                        raise
                    binding_id = admit_planned_workflow(
                        published, catalog,
                    ).developer_binding
                    entry_node = "plan"
                profile = self.profiles.get(binding_id)
                if profile is None or profile.role != "developer" or profile.modelId is None:
                    raise WorkflowRuntimeError("WORKFLOW_PROFILE_UNAVAILABLE")
                workflow_binding = WorkflowLaunchBinding(
                    workflowId=published.workflowId,
                    workflowRevision=published.revision,
                    profileId=profile.id,
                    profileRevision=profile.revision,
                    modelId=profile.modelId,
                    entryNode=entry_node,
                )
            except (WorkflowDraftError, WorkflowRuntimeError):
                workflow_ready = False
        plugin_ready = True
        if self.plugins is not None:
            try:
                self.plugins.lock_for_executor(self.adapter.id)
            except PluginError:
                plugin_ready = False
        return RunLaunchCapabilities(
            available=bool(
                not recovery_required and workflow_ready and plugin_ready and probed.available
                and probed.workspaceControl and probed.streaming
                and probed.interrupt and probed.modelIds
                and (workflow_binding is None or workflow_binding.modelId in probed.modelIds)
            ),
            executorId=self.adapter.id, adapterVersion=probed.adapterVersion,
            upstreamVersion=probed.upstreamVersion, modelIds=probed.modelIds,
            workspaceControl=probed.workspaceControl, streaming=probed.streaming,
            interrupt=probed.interrupt,
            workflowBinding=workflow_binding,
            warnings=[*probed.warnings,
                      *(["RUN_RECOVERY_REQUIRED"] if recovery_required else []),
                      *([] if plugin_ready else ["RUN_PLUGIN_UNAVAILABLE"]),
                      *([] if workflow_ready else ["WORKFLOW_RUNTIME_UNAVAILABLE"])],
        )

    async def start(self, input_value: RunLaunchInput) -> RunView:
        fingerprint = _hash(input_value.model_dump(mode="json"))
        async with self.lock:
            prior = self.starting.get(input_value.idempotencyKey)
            if prior:
                if prior[0] != fingerprint:
                    raise DevelopmentError("RUN_CONFLICT")
                action = prior[1]
            else:
                existing = self.runs.get(
                    input_value.projectId, input_value.idempotencyKey,
                )
                if existing is not None:
                    planned = existing.attempt.nodeId == "plan"
                else:
                    workflow_ref = self._task(
                        input_value.projectId, input_value.taskId,
                        input_value.expectedTaskRevision,
                    )
                    planned = False
                    if workflow_ref.startswith("workflow."):
                        publication = self.workflow_drafts.published(workflow_ref)
                        planned = publication.definition.start == "plan"
                action = asyncio.create_task(
                    self._start_plan_owned(input_value) if planned
                    else self._start_owned(input_value)
                )
                self.starting[input_value.idempotencyKey] = (fingerprint, action)
        try:
            return await asyncio.shield(action)
        finally:
            if action.done():
                async with self.lock:
                    if self.starting.get(input_value.idempotencyKey) == (fingerprint, action):
                        self.starting.pop(input_value.idempotencyKey, None)

    async def start_human_return(self, project_id: UUID, task_id: UUID,
                                 decision_id: UUID) -> RunView:
        row = self.storage.session().execute(
            "SELECT snapshot_id,next_run_id,reason FROM final_acceptance_decisions "
            "WHERE decision_id=? AND project_id=? AND task_id=? AND decision='return'",
            (str(decision_id), str(project_id), str(task_id)),
        ).fetchone()
        if row is None or row["next_run_id"] is None:
            raise DevelopmentError("REWORK_SOURCE_STALE")
        source = self.storage.session().execute(
            "SELECT run_id FROM code_snapshots WHERE snapshot_id=? AND project_id=?",
            (row["snapshot_id"], str(project_id)),
        ).fetchone()
        if source is None:
            raise DevelopmentError("REWORK_SOURCE_STALE")
        origin = HumanReworkOrigin(
            state="pending", projectId=project_id, taskId=task_id,
            sourceRunId=UUID(source["run_id"]),
            sourceSnapshotId=UUID(row["snapshot_id"]),
            nextRunId=UUID(row["next_run_id"]),
        )
        feedback = [ContextItem(
            kind="rework_feedback", authority="human_decision",
            sourceRef=f"final-decision:{decision_id}",
            text=f"Owner returned this snapshot for a new attempt: {row['reason'][:1800]}",
        )]
        return await self.start_rework(origin, feedback)

    async def start_rework(self, cycle: ReworkCycle | HumanReworkOrigin,
                           feedback: list[ContextItem]) -> RunView:
        if cycle.state != "pending" or cycle.nextRunId is None:
            raise DevelopmentError("REWORK_CONFLICT")
        source_config = self.configs.get(cycle.projectId, cycle.sourceRunId)
        source_run = self.runs.get(cycle.projectId, cycle.sourceRunId)
        if source_config is None or source_run is None:
            raise DevelopmentError("REWORK_SOURCE_STALE")
        available = await self.capabilities(cycle.projectId, cycle.taskId)
        selected = self.profiles.get(
            source_config.profile.id, int(source_config.profile.version)
        ) if self.profiles is not None and source_config.profile.version.isdecimal() else None
        model_id = selected.modelId if selected is not None and (
            _hash(selected.model_dump(mode="json")) == source_config.profile.contentHash
        ) else next((model for model in available.modelIds if
            _hash({**_node(self.adapter.id, source_config.workflow.id),
                   "modelId": model}) == source_config.profile.contentHash), None)
        if model_id is None:
            raise DevelopmentError("MODEL_UNAVAILABLE")
        value = RunLaunchInput(
            projectId=cycle.projectId, taskId=cycle.taskId,
            expectedTaskRevision=source_config.taskRevision,
            modelId=model_id, idempotencyKey=cycle.nextRunId,
            profileId=selected.id if selected is not None else None,
            profileRevision=selected.revision if selected is not None else None,
        )
        return await self._start_owned(value, cycle, feedback)

    async def _start_plan_owned(self, value: RunLaunchInput) -> RunView:
        source = self._project(value.projectId)
        workflow_ref = self._task(
            value.projectId, value.taskId, value.expectedTaskRevision,
        )
        if not workflow_ref.startswith("workflow.") or self.workflow_catalog is None or (
            self.profiles is None
        ):
            raise DevelopmentError("WORKFLOW_RUNTIME_UNAVAILABLE")
        previous = self.runs.get(value.projectId, value.idempotencyKey)
        if previous is not None:
            config = self.configs.get(value.projectId, value.idempotencyKey)
            if (config is None or previous.taskId != value.taskId
                    or config.taskRevision != value.expectedTaskRevision
                    or previous.attempt.nodeId != "plan"
                    or config.workflow.id != workflow_ref):
                raise DevelopmentError("RUN_CONFLICT")
            return previous
        if self.storage.session().execute(
            "SELECT 1 FROM plan_artifacts a JOIN runs r ON r.run_id=a.run_id "
            "LEFT JOIN plan_continuations c ON c.plan_run_id=a.run_id "
            "WHERE a.project_id=? AND a.task_id=? AND r.state='succeeded' "
            "AND json_extract(a.artifact_json,'$.taskRevision')=? "
            "AND (c.state IS NULL OR c.state!='rejected') LIMIT 1",
            (str(value.projectId), str(value.taskId), value.expectedTaskRevision),
        ).fetchone():
            raise DevelopmentError("PLAN_ALREADY_EXISTS")
        if self._has_unreconciled_run(value.projectId):
            raise DevelopmentError("RUN_RECOVERY_REQUIRED")
        try:
            publication = self.workflow_drafts.published(workflow_ref)
            admission = admit_planned_workflow(
                publication, await self.workflow_catalog(),
            )
        except (WorkflowDraftError, WorkflowRuntimeError) as error:
            raise DevelopmentError(
                getattr(error, "code", "WORKFLOW_RUNTIME_UNAVAILABLE")
            ) from error
        planner = self.profiles.get(admission.planner_binding)
        developer = self.profiles.get(admission.developer_binding)
        reviewer = self.profiles.get(admission.reviewer_binding)
        if (planner is None or developer is None or reviewer is None
                or planner.role != "planner" or developer.role != "developer"
                or reviewer.role != "reviewer" or planner.modelId is None
                or developer.modelId != value.modelId or
                (value.profileId is not None and value.profileId != developer.id) or
                (value.profileRevision is not None and
                 value.profileRevision != developer.revision)):
            raise DevelopmentError("WORKFLOW_PROFILE_UNAVAILABLE")
        if value.contextQuery is not None and (
            "project-context" not in planner.contextProviders or
            "project-context" not in developer.contextProviders
        ):
            raise DevelopmentError("PROFILE_CONTEXT_UNSUPPORTED")
        caps = await self.adapter.probe()
        for profile in (planner, developer, reviewer):
            decision = availability(profile, caps)
            if not decision.runnable:
                raise DevelopmentError(decision.reason or "WORKFLOW_PROFILE_UNAVAILABLE")
        project = self.projects.get(str(value.projectId))
        if project is None:
            raise DevelopmentError("PROJECT_TRUST_REQUIRED")
        environment = self.environments.get(
            str(value.projectId), str(project.environmentId)
        )
        if environment is None or environment.archivedAt:
            raise DevelopmentError("RUN_START_FAILED")
        package_lock: PluginPackageLock | None = None
        if self.plugins is not None:
            try:
                package_lock = self.plugins.lock_for_executor(self.adapter.id)
            except PluginError as error:
                raise DevelopmentError("RUN_PLUGIN_UNAVAILABLE") from error
        locks = [ProfileLock(
            id=profile.id, version=str(profile.revision),
            contentHash=_hash(profile.model_dump(mode="json")),
            executorPluginId=profile.executorId,
        ) for profile in (planner, developer, reviewer)]
        plugin_locks = [VersionLock(
            id=self.adapter.id, version=caps.upstreamVersion,
            contentHash=_hash({"adapterVersion": caps.adapterVersion,
                               "upstreamVersion": caps.upstreamVersion,
                               "executorId": self.adapter.id}),
        )]
        if package_lock is not None:
            plugin_locks.append(VersionLock(
                id=package_lock.id, version=package_lock.version,
                contentHash=package_lock.contentHash,
            ))
        plan_node = next(node for node in publication.definition.nodes if node.id == "plan")
        budget = RunBudget(
            maxDurationMs=min(planner.limits.maxSeconds, plan_node.timeoutSeconds) * 1000,
            maxTurns=planner.limits.maxTurns,
            maxTokens=value.maxTokens or _BUDGET.maxTokens,
            maxToolCalls=_BUDGET.maxToolCalls,
        )
        config = self.configs.create(RunConfigSelection(
            runId=value.idempotencyKey, projectId=value.projectId, taskId=value.taskId,
            expectedTaskRevision=value.expectedTaskRevision,
            workflow=VersionLock(
                id=publication.workflowId, version=str(publication.revision),
                contentHash=publication.contentHash,
            ), profile=locks[0], stageProfiles=locks[1:], plugins=plugin_locks,
            budget=budget, environmentId=environment.environmentId,
            expectedEnvironmentRevision=environment.revision,
        ))
        retrieval = self._retrieval_for_query(config, value.contextQuery)
        bundle = build_context_bundle(config, retrieval_items=retrieval)
        if retrieval and sum(item.kind in ("validated_memory", "retrieved_knowledge")
                             for item in bundle.items) != len(retrieval):
            raise DevelopmentError("CONTEXT_BUDGET_EXCEEDED")
        bundle = self.contexts.save_bundle(bundle, retrieval_items=retrieval)
        workspace_id: UUID | None = None
        lease_id: UUID | None = None
        plugin_acquired = False
        try:
            created = await self.workspaces.create(
                source, str(value.idempotencyKey), mode="detached-worktree",
            )
            workspace_id = created.workspaceId
            workspace = await self.workspaces.acquire(workspace_id, str(value.idempotencyKey))
            if workspace.activeLeaseId is None:
                raise DevelopmentError("RUN_START_FAILED")
            lease_id = workspace.activeLeaseId
            attempt_id = uuid4()
            intent = RunStartIntent(
                runId=value.idempotencyKey, projectId=value.projectId,
                taskId=value.taskId, attemptId=attempt_id,
                workspaceId=workspace_id, workspaceLeaseId=lease_id,
                leaseEpoch=workspace.leaseEpoch, baseRevision=workspace.baseRevision,
                nodeId="plan", executorId=self.adapter.id,
                configHash=config.snapshotHash, createdAt=timestamp(),
            )
            request = ScheduledExecutorRequest(
                runId=str(value.idempotencyKey), taskId=str(value.taskId),
                workspace=workspace.rootPath,
                goal=plan_request_goal(planner.promptTemplate, config, attempt_id),
                context=executor_context(bundle), permission="read-only", approval="never",
                model=planner.modelId, outputSchema=PlanResult.model_json_schema(),
                maxDurationMs=budget.maxDurationMs,
                attempt=AttemptRequest(
                    attemptId=str(attempt_id), leaseEpoch=workspace.leaseEpoch,
                    workspaceLeaseId=str(lease_id), contractRevision=config.taskRevision,
                    contextBundleId=str(bundle.bundleId), profileRevision=planner.revision,
                    outputSchemaId="plan-result/v1",
                ),
            )
            queued: asyncio.Future[RunView] = asyncio.get_running_loop().create_future()

            def on_queued(run: RunView) -> None:
                if not queued.done():
                    queued.set_result(run)

            if self.plugins is not None and package_lock is not None:
                self.plugins.acquire_run(
                    self.adapter.id, str(value.idempotencyKey), package_lock,
                )
                plugin_acquired = True
            executing = asyncio.create_task(
                self.scheduler.execute(intent, workspace, request, on_queued)
            )
            self.running[value.idempotencyKey] = asyncio.create_task(
                self._deliver_plan(
                    value, admission, workspace_id, executing,
                )
            )
            await asyncio.wait([queued, executing], return_when=asyncio.FIRST_COMPLETED)
            if queued.done():
                return queued.result()
            return await executing
        except Exception:
            if plugin_acquired and self.plugins is not None:
                await self.plugins.release_run(self.adapter.id, str(value.idempotencyKey))
            if workspace_id is not None and self.runs.get(
                value.projectId, value.idempotencyKey
            ) is None:
                try:
                    if lease_id is not None:
                        await self.workspaces.release_lease(
                            workspace_id, lease_id, str(value.idempotencyKey),
                        )
                    await self.workspaces.dispose(workspace_id)
                except Exception:
                    LOGGER.error(json.dumps({"event": "plan_workspace_release_failed"}))
            raise

    async def _deliver_plan(
        self, value: RunLaunchInput, admission: PlannedWorkflow,
        workspace_id: UUID, executing: asyncio.Task[RunView],
    ) -> None:
        try:
            run = await executing
            if run.state != "succeeded":
                return
            artifact = self.plan_artifacts.get(value.projectId, value.idempotencyKey)
            if artifact is None:
                raise DevelopmentError("PLAN_ARTIFACT_MISSING")
            if not admission.requires_plan_approval:
                await self._start_after_plan(value, artifact)
        except Exception as error:
            LOGGER.error(json.dumps({
                "event": "plan_delivery_failed",
                "code": getattr(error, "code", "PLAN_DELIVERY_FAILED"),
            }))
        finally:
            try:
                await self.workspaces.dispose(workspace_id)
            except Exception:
                LOGGER.error(json.dumps({"event": "plan_workspace_dispose_failed"}))
            self.running.pop(value.idempotencyKey, None)
            if self.plugins is not None:
                try:
                    await self.plugins.release_run(self.adapter.id, str(value.idempotencyKey))
                except PluginError:
                    LOGGER.error(json.dumps({"event": "plugin_run_release_failed"}))

    async def _start_after_plan(self, value: RunLaunchInput,
                                artifact: PlanArtifact) -> RunView | None:
        if self.profiles is None or self.workflow_catalog is None:
            raise DevelopmentError("WORKFLOW_RUNTIME_UNAVAILABLE")
        plan_config = self.configs.get(artifact.projectId, artifact.runId)
        if (plan_config is None or plan_config.taskId != artifact.taskId
                or plan_config.taskRevision != artifact.taskRevision
                or plan_config.taskContractHash != artifact.taskContractHash
                or plan_config.profile.id != artifact.profileId
                or plan_config.profile.version != str(artifact.profileRevision)
                or plan_config.profile.contentHash != artifact.profileHash
                or value.projectId != artifact.projectId or value.taskId != artifact.taskId
                or value.expectedTaskRevision != artifact.taskRevision):
            raise DevelopmentError("PLAN_BASIS_STALE")
        publication = self.workflow_drafts.published(
            plan_config.workflow.id, int(plan_config.workflow.version),
        )
        frozen: dict[str, AgentProfile] = {}
        for lock in [plan_config.profile, *plan_config.stageProfiles]:
            profile = self.profiles.get_locked(
                lock.id, lock.version, lock.contentHash, lock.executorPluginId,
            )
            if profile is None:
                raise DevelopmentError("PLAN_PROFILE_STALE")
            frozen[lock.id] = profile
        current = await self.workflow_catalog()
        admission = admit_planned_workflow(publication, WorkflowCatalog(
            profiles=frozen, executors=current.executors,
            verifiers=current.verifiers, output_schemas=current.output_schemas,
        ))
        developer = frozen[admission.developer_binding]
        if developer.modelId is None or developer.modelId != value.modelId:
            raise DevelopmentError("PLAN_PROFILE_STALE")
        if plan_config.budget.maxTokens not in (50_000, 100_000, 200_000):
            raise DevelopmentError("PLAN_BASIS_STALE")
        next_id = self.plan_artifacts.continuation(
            artifact, require_human=admission.requires_plan_approval,
        )
        if next_id is None:
            return None
        return await self._start_owned(RunLaunchInput(
            projectId=artifact.projectId, taskId=artifact.taskId,
            expectedTaskRevision=artifact.taskRevision,
            modelId=developer.modelId, idempotencyKey=next_id,
            maxTokens=cast(Literal[50_000, 100_000, 200_000],
                           plan_config.budget.maxTokens),
            profileId=developer.id, profileRevision=developer.revision,
        ), source_plan=artifact)

    def _retrieval_for_query(self, config: RunConfigSnapshot,
                             query: str | None) -> list[ContextItem]:
        if query is None:
            return []
        if self.stage_contexts is None:
            raise DevelopmentError("CONTEXT_UNAVAILABLE")
        try:
            preview = self.stage_contexts.preview(StageContextInput(
                projectId=config.projectId, runId=config.runId, query=query,
            ))
        except (ContextError, KnowledgeError, MemoryError) as error:
            raise DevelopmentError("CONTEXT_UNAVAILABLE") from error
        if preview.conflicts:
            raise DevelopmentError("CONTEXT_REQUIRES_HUMAN")
        if preview.status != "ready":
            raise DevelopmentError("CONTEXT_NO_SOURCE")
        retrieval = [ContextItem(
            kind="validated_memory" if item.kind == "validated_memory"
                 else "retrieved_knowledge",
            authority="validated_memory" if item.kind == "validated_memory"
                      else "untrusted_project",
            text=item.text[:2000], sourceRef=item.sourceRef,
        ) for item in preview.items if item.kind in (
            "validated_memory", "retrieved_knowledge",
        )]
        if not retrieval:
            raise DevelopmentError("CONTEXT_NO_SOURCE")
        return retrieval

    def _frozen_retrieval(self, project_id: UUID, run_id: UUID,
                          stale_code: str, *, allow_missing: bool = False) -> list[ContextItem]:
        try:
            bundle = self.contexts.run_bundle(project_id, run_id)
            if bundle is None:
                if allow_missing:
                    # Older direct-Developer Runs may predate ContextBundle.
                    # A published Plan Run always has one and must fail closed.
                    return []
                raise ContextError("CONTEXT_RUN_NOT_FOUND")
            retrieval = [item for item in bundle.items if item.kind in (
                "validated_memory", "retrieved_knowledge",
            )]
            current = self.contexts.run_sources(project_id, run_id)
            if len(current) != len(retrieval) or any(
                status.sourceRef != item.sourceRef or status.status != "current"
                for item, status in zip(retrieval, current, strict=True)
            ):
                raise ContextError("CONTEXT_SOURCE_STALE")
            return retrieval
        except ContextError as error:
            raise DevelopmentError(stale_code) from error

    def plan_gate(self, project_id: UUID, task_id: UUID,
                  run_id: UUID) -> PlanGateView | None:
        return self.plan_artifacts.gate(
            project_id, task_id, run_id, self.configs, self.workflow_drafts,
        )

    def _frozen_plan_catalog(self, plan_config: RunConfigSnapshot,
                             current: WorkflowCatalog) -> WorkflowCatalog:
        if self.profiles is None:
            raise WorkflowRuntimeError("PLAN_PROFILE_STALE")
        frozen: dict[str, AgentProfile] = {}
        for lock in [plan_config.profile, *plan_config.stageProfiles]:
            profile = self.profiles.get_locked(
                lock.id, lock.version, lock.contentHash, lock.executorPluginId,
            )
            if profile is None:
                raise WorkflowRuntimeError("PLAN_PROFILE_STALE")
            frozen[lock.id] = profile
        return WorkflowCatalog(
            profiles=frozen, executors=current.executors,
            verifiers=current.verifiers, output_schemas=current.output_schemas,
        )

    def _origin_plan_config(self, source: RunConfigSnapshot) -> RunConfigSnapshot:
        """Resolve the original Plan lock for a later Developer rework attempt."""
        rows = self.storage.session().execute(
            "SELECT a.run_id FROM plan_artifacts a JOIN plan_continuations c "
            "ON c.plan_run_id=a.run_id WHERE a.project_id=? AND a.task_id=? "
            "AND c.state IN ('automatic','approved')",
            (str(source.projectId), str(source.taskId)),
        ).fetchall()
        matches: list[RunConfigSnapshot] = []
        for row in rows:
            plan_id = UUID(row["run_id"])
            artifact = self.plan_artifacts.get(source.projectId, plan_id)
            plan_config = self.configs.get(source.projectId, plan_id)
            if artifact is None or plan_config is None:
                raise WorkflowRuntimeError("PLAN_BASIS_STALE")
            if (artifact.taskRevision != source.taskRevision
                    or artifact.taskContractHash != source.taskContractHash
                    or plan_config.workflow != source.workflow):
                continue
            if (plan_config.environment != source.environment
                    or plan_config.plugins != source.plugins
                    or len(plan_config.stageProfiles) != 2
                    or plan_config.stageProfiles[0] != source.profile
                    or plan_config.stageProfiles[1:] != source.stageProfiles):
                raise WorkflowRuntimeError("PLAN_BASIS_STALE")
            matches.append(plan_config)
        if len(matches) != 1:
            raise WorkflowRuntimeError("PLAN_BASIS_STALE")
        return matches[0]

    async def plan_action(self, value: PlanActionInput) -> PlanGateView:
        self._project(value.projectId)
        current_ref = self._task(value.projectId, value.taskId,
                                 value.expectedTaskRevision, require_todo=False)
        gate = self.plan_gate(value.projectId, value.taskId, value.runId)
        plan_config = self.configs.get(value.projectId, value.runId)
        if (gate is None or gate.artifact.contentHash != value.expectedArtifactHash
                or gate.artifact.taskRevision != value.expectedTaskRevision
                or plan_config is None or current_ref != plan_config.workflow.id):
            raise PlannerError("PLAN_BASIS_STALE")
        if value.action in ("approve", "reject"):
            if not gate.requiresApproval:
                raise PlannerError("PLAN_APPROVAL_UNAVAILABLE")
            self.plan_artifacts.decide(
                gate.artifact,
                "approved" if value.action == "approve" else "rejected",
                reason=value.reason,
            )
        elif not gate.requiresApproval and gate.decision == "pending":
            # A completed standard Plan may survive a Host exit before its
            # automatic continuation is recorded. Resume only on an explicit
            # local action against the same frozen artifact and Task revision.
            self.plan_artifacts.decide(gate.artifact, "automatic")
        elif gate.decision not in ("approved", "automatic"):
            raise PlannerError("PLAN_APPROVAL_REQUIRED")
        updated = self.plan_gate(value.projectId, value.taskId, value.runId)
        assert updated is not None
        if updated.decision in ("approved", "automatic"):
            config = self.configs.get(value.projectId, value.runId)
            assert config is not None and self.profiles is not None
            developer = next((self.profiles.get_locked(
                lock.id, lock.version, lock.contentHash, lock.executorPluginId,
            ) for lock in config.stageProfiles if lock.id != gate.artifact.profileId), None)
            if developer is None or developer.role != "developer" or not developer.modelId:
                raise PlannerError("PLAN_PROFILE_STALE")
            await self._start_after_plan(RunLaunchInput(
                projectId=value.projectId, taskId=value.taskId,
                expectedTaskRevision=value.expectedTaskRevision,
                modelId=developer.modelId, idempotencyKey=value.runId,
            ), gate.artifact)
        return updated

    async def _start_owned(self, value: RunLaunchInput,
                           cycle: ReworkCycle | HumanReworkOrigin | None = None,
                           feedback: list[ContextItem] | None = None,
                           source_plan: PlanArtifact | None = None) -> RunView:
        source = self._project(value.projectId)
        selected: AgentProfile | None = None
        if value.profileId is not None or value.profileRevision is not None:
            if not value.profileId or value.profileRevision is None or self.profiles is None:
                raise DevelopmentError("PROFILE_INVALID")
            selected = self.profiles.get(value.profileId, value.profileRevision)
            if (selected is None or selected.role != "developer"
                    or selected.modelId != value.modelId):
                raise DevelopmentError("PROFILE_UNAVAILABLE")
        previous = self.runs.get(value.projectId, value.idempotencyKey)
        if previous:
            config = self.configs.get(value.projectId, previous.runId)
            expected_profile_hash = _hash(selected.model_dump(mode="json")) if selected else None
            if (
                previous.taskId != value.taskId or config is None
                or config.taskRevision != value.expectedTaskRevision
                or config.profile.contentHash != (expected_profile_hash or _hash({
                    **_node(self.adapter.id, config.workflow.id), "modelId": value.modelId,
                }))
            ):
                raise DevelopmentError("RUN_CONFLICT")
            return previous
        if self._has_unreconciled_run(value.projectId):
            raise DevelopmentError("RUN_RECOVERY_REQUIRED")
        if selected is not None:
            decision = availability(selected, await self.adapter.probe())
            if not decision.runnable:
                raise DevelopmentError(decision.reason or "PROFILE_UNAVAILABLE")
        workflow_ref = self._task(
            value.projectId, value.taskId, value.expectedTaskRevision,
            require_todo=cycle is None and source_plan is None,
        )
        workflow_lock: VersionLock | None = None
        workflow_develop_timeout_ms: int | None = None
        stage_locks: list[ProfileLock] = []
        use_frozen_capabilities = source_plan is not None
        plan_config = self.configs.get(
            source_plan.projectId, source_plan.runId,
        ) if source_plan else None
        if source_plan and plan_config is None:
            raise DevelopmentError("PLAN_BASIS_STALE")
        if plan_config is not None:
            assert source_plan is not None
        if workflow_ref.startswith("workflow."):
            if self.workflow_catalog is None or self.profiles is None:
                raise DevelopmentError("WORKFLOW_RUNTIME_UNAVAILABLE")
            try:
                cycle_config = (self.configs.get(value.projectId, cycle.sourceRunId)
                                if cycle else None)
                workflow_version = int(
                    cycle_config.workflow.version if cycle_config else
                    plan_config.workflow.version if plan_config else "0"
                ) if cycle_config or plan_config else None
                publication = self.workflow_drafts.published(workflow_ref, workflow_version)
                catalog = await self.workflow_catalog()
                if source_plan:
                    assert plan_config is not None and self.profiles is not None
                    catalog = self._frozen_plan_catalog(plan_config, catalog)
                    binding = admit_planned_workflow(
                        publication, catalog,
                    ).developer_binding
                elif cycle_config and publication.definition.start == "plan":
                    catalog = self._frozen_plan_catalog(
                        self._origin_plan_config(cycle_config), catalog,
                    )
                    binding = admit_planned_workflow(
                        publication, catalog,
                    ).developer_binding
                    use_frozen_capabilities = True
                else:
                    binding = admit_linear_workflow(publication, catalog)
            except (WorkflowDraftError, WorkflowRuntimeError, ValueError) as error:
                code = getattr(error, "code", "WORKFLOW_RUNTIME_UNAVAILABLE")
                raise DevelopmentError(code) from error
            if selected is not None and selected.id != binding:
                raise DevelopmentError("WORKFLOW_PROFILE_MISMATCH")
            bound_profile = self.profiles.get(
                binding,
                int(cycle_config.profile.version) if cycle_config else
                selected.revision if source_plan and selected else None,
            )
            if (bound_profile is None or bound_profile.modelId != value.modelId or
                    selected is not None and selected.revision != bound_profile.revision):
                raise DevelopmentError("WORKFLOW_PROFILE_UNAVAILABLE")
            selected = bound_profile
            reviewer_binding = next(node.binding for node in publication.definition.nodes
                                    if node.id == "review")
            reviewer_source = plan_config or cycle_config
            frozen_reviewer_lock = next((lock for lock in reviewer_source.stageProfiles
                if lock.id == reviewer_binding), None) if reviewer_source else None
            reviewer = self.profiles.get(
                reviewer_binding,
                int(frozen_reviewer_lock.version) if frozen_reviewer_lock else None,
            )
            if reviewer is None or reviewer.role != "reviewer":
                raise DevelopmentError("WORKFLOW_PROFILE_UNAVAILABLE")
            if frozen_reviewer_lock is not None and self.profiles.get_locked(
                frozen_reviewer_lock.id, frozen_reviewer_lock.version,
                frozen_reviewer_lock.contentHash,
                frozen_reviewer_lock.executorPluginId,
            ) is None:
                raise DevelopmentError("PLAN_PROFILE_STALE")
            stage_locks = [ProfileLock(
                id=reviewer.id, version=str(reviewer.revision),
                contentHash=_hash(reviewer.model_dump(mode="json")),
                executorPluginId=reviewer.executorId,
            )]
            workflow_lock = VersionLock(
                id=publication.workflowId, version=str(publication.revision),
                contentHash=publication.contentHash,
            )
            workflow_develop_timeout_ms = next(
                node.timeoutSeconds * 1000 for node in publication.definition.nodes
                if node.id == "develop"
            )
        expected_profile_hash = _hash(selected.model_dump(mode="json")) if selected else None
        if (selected is not None and value.contextQuery is not None and
                "project-context" not in selected.contextProviders):
            raise DevelopmentError("PROFILE_CONTEXT_UNSUPPORTED")
        if use_frozen_capabilities:
            caps = await self.adapter.probe()
            available = RunLaunchCapabilities(
                available=caps.available and caps.workspaceControl and caps.streaming
                and caps.interrupt and bool(caps.modelIds), executorId=caps.executorId,
                adapterVersion=caps.adapterVersion,
                upstreamVersion=caps.upstreamVersion, modelIds=caps.modelIds,
                workspaceControl=caps.workspaceControl, streaming=caps.streaming,
                interrupt=caps.interrupt, warnings=caps.warnings,
            )
        else:
            available = await self.capabilities(value.projectId, value.taskId)
        if "RUN_PLUGIN_UNAVAILABLE" in available.warnings:
            raise DevelopmentError("RUN_PLUGIN_UNAVAILABLE")
        if not available.available or value.modelId not in available.modelIds:
            raise DevelopmentError("MODEL_UNAVAILABLE")
        project = self.projects.get(str(value.projectId))
        if project is None:
            raise DevelopmentError("PROJECT_TRUST_REQUIRED")
        environment = self.environments.get(
            str(value.projectId), str(project.environmentId)
        )
        if environment is None or environment.archivedAt:
            raise DevelopmentError("RUN_START_FAILED")
        if plan_config is not None and source_plan is not None and (
            environment.environmentId != plan_config.environment.environmentId
            or environment.revision != plan_config.environment.revision
            or plan_config.taskContractHash != source_plan.taskContractHash
            or workflow_ref != plan_config.workflow.id
        ):
            raise DevelopmentError("PLAN_BASIS_STALE")
        node = _node(self.adapter.id, workflow_ref)
        source_config = (self.configs.get(value.projectId, cycle.sourceRunId)
                         if cycle else None)
        source_run = (self.runs.get(value.projectId, cycle.sourceRunId)
                      if cycle else None)
        package_lock: PluginPackageLock | None = None
        if self.plugins is not None:
            try:
                package_lock = self.plugins.lock_for_executor(self.adapter.id)
            except PluginError as error:
                raise DevelopmentError("RUN_PLUGIN_UNAVAILABLE") from error
        if cycle and (source_config is None or
                      source_run is None or source_run.state != "succeeded" or
                      source_config.taskId != value.taskId or
                      source_config.taskRevision != value.expectedTaskRevision or
                      source_config.environment.environmentId != environment.environmentId or
                      source_config.environment.revision != environment.revision or
                      not any(plugin.id == self.adapter.id and
                              plugin.version == available.upstreamVersion
                              for plugin in source_config.plugins)):
            raise DevelopmentError("REWORK_SOURCE_STALE")
        if cycle and package_lock is not None and source_config is not None and not any(
            plugin.id == package_lock.id and plugin.version == package_lock.version
            and plugin.contentHash == package_lock.contentHash
            for plugin in source_config.plugins
        ):
            raise DevelopmentError("REWORK_SOURCE_STALE")
        if cycle and source_config is not None:
            current_presets = [self.environments.get_preset(
                str(value.projectId), str(preset_id)
            ) for preset_id in environment.config.commandPresetIds]
            if (len(current_presets) != len(source_config.commandPresets) or
                    any(preset is None or preset.presetId != frozen.presetId or
                        preset.revision != frozen.revision or
                        preset.approvalHash != frozen.approvalHash
                        for preset, frozen in zip(current_presets,
                                                  source_config.commandPresets, strict=True))):
                raise DevelopmentError("REWORK_SOURCE_STALE")
        provider_lock = VersionLock(
            id=self.adapter.id, version=available.upstreamVersion,
            contentHash=_hash({
                "adapterVersion": available.adapterVersion,
                "upstreamVersion": available.upstreamVersion,
                "executorId": self.adapter.id,
            }),
        )
        frozen_plugins = source_config.plugins if source_config else [
            provider_lock,
            *([VersionLock(
                id=package_lock.id, version=package_lock.version,
                contentHash=package_lock.contentHash,
            )] if package_lock is not None else []),
        ]
        if plan_config:
            if {lock.id: lock.model_dump(mode="json") for lock in frozen_plugins} != {
                lock.id: lock.model_dump(mode="json") for lock in plan_config.plugins
            }:
                raise DevelopmentError("PLAN_PLUGIN_STALE")
            frozen_plugins = plan_config.plugins
        duration_ms = selected.limits.maxSeconds * 1000 if selected else _BUDGET.maxDurationMs
        if workflow_develop_timeout_ms is not None:
            duration_ms = min(duration_ms, workflow_develop_timeout_ms)
        budget = source_config.budget if source_config else RunBudget(
            maxDurationMs=duration_ms, maxTurns=_BUDGET.maxTurns,
            maxTokens=value.maxTokens if value.maxTokens is not None else _BUDGET.maxTokens,
            maxToolCalls=_BUDGET.maxToolCalls,
        )
        config = self.configs.create(RunConfigSelection(
            runId=value.idempotencyKey, projectId=value.projectId, taskId=value.taskId,
            expectedTaskRevision=value.expectedTaskRevision,
            workflow=source_config.workflow if source_config else
            plan_config.workflow if plan_config else workflow_lock or VersionLock(
                id=workflow_ref, version=_WORKFLOW_VERSION, contentHash=_hash(node)
            ),
            profile=source_config.profile if source_config else ProfileLock(
                id=selected.id if selected else _PROFILE_ID,
                version=str(selected.revision) if selected else _WORKFLOW_VERSION,
                contentHash=expected_profile_hash or _hash({**node, "modelId": value.modelId}),
                executorPluginId=self.adapter.id,
            ),
            plugins=frozen_plugins,
            stageProfiles=source_config.stageProfiles if source_config else stage_locks,
            budget=budget,
            environmentId=environment.environmentId,
            expectedEnvironmentRevision=environment.revision,
        ))
        retrieval = self._retrieval_for_query(config, value.contextQuery)
        if source_plan is not None:
            retrieval = self._frozen_retrieval(
                source_plan.projectId, source_plan.runId, "PLAN_CONTEXT_STALE",
            )
        elif cycle is not None and source_config is not None:
            retrieval = self._frozen_retrieval(
                source_config.projectId, source_config.runId, "REWORK_SOURCE_STALE",
                allow_missing=not use_frozen_capabilities,
            )
        if retrieval and (selected is None or
                          "project-context" not in selected.contextProviders):
            raise DevelopmentError("PROFILE_CONTEXT_UNSUPPORTED")
        plan_items: list[ContextItem] = []
        if source_plan is not None:
            plan_items = [ContextItem(
                kind="plan", authority="run_observation",
                text=source_plan.result.summary,
                sourceRef=f"plan:{source_plan.artifactId}",
            )]
            for step in source_plan.result.plan:
                text = json.dumps(step.model_dump(mode="json"), ensure_ascii=False)
                if len(text) > 2000:
                    raise DevelopmentError("PLAN_CONTEXT_TOO_LARGE")
                plan_items.append(ContextItem(
                    kind="plan", authority="run_observation", text=text,
                    sourceRef=f"plan:{source_plan.artifactId}",
                ))
        prepared = build_context_bundle(
            config, rework_feedback=feedback, retrieval_items=retrieval,
            plan_items=plan_items,
        )
        if retrieval and sum(item.kind in ("validated_memory", "retrieved_knowledge")
                             for item in prepared.items) != len(retrieval):
            raise DevelopmentError("CONTEXT_BUDGET_EXCEEDED")
        bundle = self.contexts.save_bundle(prepared, feedback, retrieval, plan_items)
        workspace_id: UUID | None = None
        lease_id: UUID | None = None
        plugin_acquired = False
        try:
            source_handoff = (self.snapshots.handoffs.get(
                value.projectId, cycle.sourceRunId) if cycle else None)
            if cycle and (source_handoff is None or
                          source_handoff.snapshot.snapshotId != cycle.sourceSnapshotId):
                raise DevelopmentError("REWORK_SOURCE_STALE")
            created = await self.workspaces.create(
                source, str(value.idempotencyKey),
                source_handoff.snapshot.commitSha if source_handoff else
                source_plan.baseRevision if source_plan else None,
            )
            workspace_id = created.workspaceId
            if source_handoff:
                await self.workspaces.verify_snapshot_ref(
                    workspace_id, source_handoff.snapshot.snapshotId,
                    source_handoff.snapshot.commitSha, source_handoff.snapshot.treeSha,
                )
            workspace = await self.workspaces.acquire(workspace_id, str(value.idempotencyKey))
            if workspace.activeLeaseId is None:
                raise DevelopmentError("RUN_START_FAILED")
            lease_id = workspace.activeLeaseId
            attempt_id = uuid4()
            intent = RunStartIntent(
                runId=value.idempotencyKey, projectId=value.projectId,
                taskId=value.taskId, attemptId=attempt_id,
                attemptNo=source_run.attempt.attemptNo + 1 if source_run else 1,
                workspaceId=workspace_id, workspaceLeaseId=workspace.activeLeaseId,
                leaseEpoch=workspace.leaseEpoch, baseRevision=workspace.baseRevision,
                nodeId="develop", executorId=self.adapter.id,
                configHash=config.snapshotHash, createdAt=timestamp(),
            )
            request = ScheduledExecutorRequest(
                runId=str(value.idempotencyKey), taskId=str(value.taskId),
                workspace=workspace.rootPath,
                goal=f"{selected.promptTemplate}\n\n{bundle.goal}" if selected else bundle.goal,
                context=executor_context(bundle), permission="workspace-write",
                approval=("on-request" if selected and
                          selected.policyProfile == "approval-required" else "never"),
                model=value.modelId,
                maxDurationMs=config.budget.maxDurationMs,
                attempt=AttemptRequest(
                    attemptId=str(attempt_id), leaseEpoch=workspace.leaseEpoch,
                    workspaceLeaseId=str(workspace.activeLeaseId),
                    contractRevision=config.taskRevision,
                    contextBundleId=str(bundle.bundleId),
                    profileRevision=selected.revision if selected else 1,
                    outputSchemaId="plain-text-v1",
                ),
            )
            queued: asyncio.Future[RunView] = asyncio.get_running_loop().create_future()

            def on_queued(run: RunView) -> None:
                if not queued.done():
                    queued.set_result(run)

            if self.plugins is not None and package_lock is not None:
                try:
                    self.plugins.acquire_run(
                        self.adapter.id, str(value.idempotencyKey), package_lock
                    )
                except PluginError as error:
                    raise DevelopmentError("RUN_PLUGIN_UNAVAILABLE") from error
                plugin_acquired = True
            executing = asyncio.create_task(
                self.scheduler.execute(intent, workspace, request, on_queued)
            )
            self.running[value.idempotencyKey] = asyncio.create_task(
                self._deliver(value.projectId, value.idempotencyKey, workspace_id,
                              bundle.bundleId, executing)
            )
            await asyncio.wait([queued, executing], return_when=asyncio.FIRST_COMPLETED)
            if queued.done():
                return queued.result()
            return await executing
        except Exception:
            if plugin_acquired and self.plugins is not None:
                await self.plugins.release_run(self.adapter.id, str(value.idempotencyKey))
            if workspace_id is not None and self.runs.get(
                value.projectId, value.idempotencyKey
            ) is None:
                try:
                    if lease_id is not None:
                        await self.workspaces.release_lease(
                            workspace_id, lease_id, str(value.idempotencyKey)
                        )
                    await self.workspaces.dispose(workspace_id)
                except Exception:
                    LOGGER.error(json.dumps({"event": "workspace_release_failed"}))
            raise

    async def _deliver(
        self, project_id: UUID, run_id: UUID, workspace_id: UUID,
        bundle_id: UUID, executing: asyncio.Task[RunView],
    ) -> None:
        try:
            try:
                run = await executing
            except Exception:
                if self.plugins is not None:
                    owner = self.plugins.executor_owner.get(self.adapter.id)
                    if owner is not None:
                        self.plugins.record_fault(owner, "runtime", "PLUGIN_RUNTIME_FAILED",
                                                  str(run_id))
                raise
            if run.state in ("failed", "interrupted") and self.plugins is not None:
                owner = self.plugins.executor_owner.get(self.adapter.id)
                if owner is not None:
                    self.plugins.record_fault(owner, "runtime",
                                              "EXECUTOR_RUN_FAILED" if run.state == "failed"
                                              else "EXECUTOR_RUN_INTERRUPTED", str(run_id))
            if run.state == "succeeded":
                self.delivering.add(run_id)
                handoff = await self.snapshots.freeze(
                    project_id, run_id, workspace_id, bundle_id, 1
                )
                if self.on_handoff is not None:
                    await self.on_handoff(handoff)
        except Exception:
            LOGGER.error(json.dumps({"event": "development_delivery_failed",
                                     "code": "RUN_DELIVERY_FAILED"}))
        finally:
            self.delivering.discard(run_id)
            self.running.pop(run_id, None)
            if self.plugins is not None:
                try:
                    await self.plugins.release_run(self.adapter.id, str(run_id))
                except PluginError:
                    LOGGER.error(json.dumps({"event": "plugin_run_release_failed"}))

    async def cancel(self, project_id: UUID, run_id: UUID) -> RunView:
        if self.runs.get(project_id, run_id) is None:
            raise DevelopmentError("RUN_NOT_FOUND")
        try:
            return await self.scheduler.cancel(project_id, run_id)
        except Exception as error:
            raise DevelopmentError("RUN_CANCEL_FAILED") from error

    def handoff(self, project_id: UUID, run_id: UUID) -> object | None:
        run = self.runs.get(project_id, run_id)
        if run is None:
            raise DevelopmentError("RUN_NOT_FOUND")
        value = self.snapshots.handoffs.get(project_id, run_id)
        if run.state == "succeeded" and value is None and run_id not in self.delivering:
            raise DevelopmentError("RUN_DELIVERY_FAILED")
        return value

    async def shutdown(self) -> None:
        await self.scheduler.shutdown()
        if self.running:
            await asyncio.gather(*list(self.running.values()), return_exceptions=True)
