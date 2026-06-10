"""One-node development entry; provider-neutral Host orchestration, no workflow engine."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.approvals import canonical_json
from forge.board import BoardError, BoardService
from forge.context import ContextItem, ContextService, build_context_bundle, executor_context
from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.executor_contracts import AttemptRequest, ExecutorAdapter, ScheduledExecutorRequest
from forge.handoffs import DevelopmentHandoff, HostSnapshotService
from forge.persistence import ForgePersistence
from forge.plugin_api import PluginError
from forge.plugin_lock import PluginPackageLock
from forge.plugins import PluginRegistry
from forge.projects import TRUST_VERSION, ProjectService
from forge.rework import ReworkCycle
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
)
from forge.run_scheduler import HostRunScheduler
from forge.runs import RunService, RunStartIntent, RunView
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
        if revision is not None and detail.contract.revision != revision:
            raise DevelopmentError("REVISION_CONFLICT")
        if self.storage.schema_version() >= 23 and self.storage.session().execute(
            "SELECT 1 FROM task_change_requests WHERE task_id=? "
            "AND state='awaiting_safe_point' LIMIT 1", (str(task_id),),
        ).fetchone():
            raise DevelopmentError("RUN_CONFLICT")
        if detail.contract.workflowRef not in _WORKFLOW_REFS:
            raise DevelopmentError("RUN_START_FAILED")
        return detail.contract.workflowRef

    async def capabilities(self, project_id: UUID, task_id: UUID) -> RunLaunchCapabilities:
        self._project(project_id)
        self._task(project_id, task_id, require_todo=False)
        probed = await self.adapter.probe()
        plugin_ready = True
        if self.plugins is not None:
            try:
                self.plugins.lock_for_executor(self.adapter.id)
            except PluginError:
                plugin_ready = False
        return RunLaunchCapabilities(
            available=bool(
                plugin_ready and probed.available and probed.workspaceControl and probed.streaming
                and probed.interrupt and probed.modelIds
            ),
            executorId=self.adapter.id, adapterVersion=probed.adapterVersion,
            upstreamVersion=probed.upstreamVersion, modelIds=probed.modelIds,
            workspaceControl=probed.workspaceControl, streaming=probed.streaming,
            interrupt=probed.interrupt, warnings=probed.warnings,
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
                action = asyncio.create_task(self._start_owned(input_value))
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
        model_id = next((model for model in available.modelIds if
            _hash({**_node(self.adapter.id, source_config.workflow.id),
                   "modelId": model}) == source_config.profile.contentHash), None)
        if model_id is None:
            raise DevelopmentError("MODEL_UNAVAILABLE")
        value = RunLaunchInput(
            projectId=cycle.projectId, taskId=cycle.taskId,
            expectedTaskRevision=source_config.taskRevision,
            modelId=model_id, idempotencyKey=cycle.nextRunId,
        )
        return await self._start_owned(value, cycle, feedback)

    async def _start_owned(self, value: RunLaunchInput,
                           cycle: ReworkCycle | HumanReworkOrigin | None = None,
                           feedback: list[ContextItem] | None = None) -> RunView:
        source = self._project(value.projectId)
        previous = self.runs.get(value.projectId, value.idempotencyKey)
        if previous:
            config = self.configs.get(value.projectId, previous.runId)
            if (
                previous.taskId != value.taskId or config is None
                or config.taskRevision != value.expectedTaskRevision
                or config.profile.contentHash != _hash({
                    **_node(self.adapter.id, config.workflow.id), "modelId": value.modelId,
                })
            ):
                raise DevelopmentError("RUN_CONFLICT")
            return previous
        workflow_ref = self._task(
            value.projectId, value.taskId, value.expectedTaskRevision,
            require_todo=cycle is None,
        )
        available = await self.capabilities(value.projectId, value.taskId)
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
        config = self.configs.create(RunConfigSelection(
            runId=value.idempotencyKey, projectId=value.projectId, taskId=value.taskId,
            expectedTaskRevision=value.expectedTaskRevision,
            workflow=source_config.workflow if source_config else VersionLock(
                id=workflow_ref, version=_WORKFLOW_VERSION, contentHash=_hash(node)
            ),
            profile=source_config.profile if source_config else ProfileLock(
                id=_PROFILE_ID, version=_WORKFLOW_VERSION,
                contentHash=_hash({**node, "modelId": value.modelId}),
                executorPluginId=self.adapter.id,
            ),
            plugins=frozen_plugins,
            budget=source_config.budget if source_config else _BUDGET,
            environmentId=environment.environmentId,
            expectedEnvironmentRevision=environment.revision,
        ))
        bundle = self.contexts.save_bundle(
            build_context_bundle(config, rework_feedback=feedback), feedback,
        )
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
                source_handoff.snapshot.commitSha if source_handoff else None,
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
                workspace=workspace.rootPath, goal=bundle.goal,
                context=executor_context(bundle), permission="workspace-write",
                approval="never", model=value.modelId,
                maxDurationMs=config.budget.maxDurationMs,
                attempt=AttemptRequest(
                    attemptId=str(attempt_id), leaseEpoch=workspace.leaseEpoch,
                    workspaceLeaseId=str(workspace.activeLeaseId),
                    contractRevision=config.taskRevision,
                    contextBundleId=str(bundle.bundleId),
                    profileRevision=1, outputSchemaId="plain-text-v1",
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
            run = await executing
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
