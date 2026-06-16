"""Independent Forge Host entry point. stdout is reserved for JSON-RPC frames."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import platform
import sys
import time
from datetime import UTC, datetime
from functools import partial
from typing import Any, Literal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic_core import to_jsonable_python

from forge import __version__
from forge.acceptance_matrix import (
    AcceptanceDecisionInput,
    AcceptanceMatrixError,
    AcceptanceMatrixService,
)
from forge.approvals import (
    ApprovalDecideInput,
    ApprovalError,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.artifacts import ArtifactStore
from forge.board import BoardError, BoardReorderInput, BoardService
from forge.codex_refiner import CodexReadOnlyRefiner
from forge.context import ContextService
from forge.conversations import ConversationError, ConversationSend, ConversationService
from forge.delivery import DeliveryError, DeliveryService, MergeRequest
from forge.development import DevelopmentError, HostDevelopmentService, RunLaunchInput
from forge.drafts import DraftError, DraftRequest, DraftReviseInput, DraftService
from forge.environments import (
    EnvironmentError,
    EnvironmentSaveInput,
    EnvironmentService,
    PresetSaveInput,
)
from forge.executor_contracts import ExecutorAdapter
from forge.final_acceptance import (
    AdvisoryWaiverInput,
    FinalAcceptanceError,
    FinalAcceptanceInput,
    FinalAcceptanceService,
)
from forge.handoffs import DevelopmentHandoff, HandoffError, HandoffService, HostSnapshotService
from forge.persistence import LATEST_SCHEMA, ForgePersistence, PersistenceError, resolve_data_dir
from forge.plugin_api import PluginError
from forge.plugin_storage import PluginStorageBroker
from forge.plugins import PluginRegistry
from forge.processes import ProcessController
from forge.projects import ProjectError, ProjectService
from forge.protocol import (
    HOST_PROTOCOL_VERSION,
    MAX_FRAME_BYTES,
    TRANSPORT_VERSION,
    ProtocolError,
    RpcRequest,
    encode_frame,
    parse_frame,
)
from forge.recovery import RecoveryService
from forge.review_copies import ReviewCopyError, ReviewCopyManager
from forge.review_issues import ReviewIssueService, ReviewReport
from forge.review_runtime import HostReviewService, ReviewRuntimeError, ReviewStartInput
from forge.rework import ReworkCycle, ReworkError, ReworkService
from forge.run_config import RunConfigService
from forge.run_inspection import InspectionError, RunInspectionService
from forge.run_scheduler import HostRunScheduler
from forge.runs import RunError, RunService
from forge.task_changes import (
    TaskChangeApply,
    TaskChangeDecision,
    TaskChangeError,
    TaskChangePropose,
    TaskChangeService,
)
from forge.verifier_project import (
    ProjectCommandVerifier,
    VerifierError,
    VerifyReport,
    VerifyStartInput,
)
from forge.workspaces import WorkspaceManager

LOGGER = logging.getLogger("forge.host")


def timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Handshake(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    productVersion: str = Field(min_length=1, max_length=64)
    hostVersion: str = Field(min_length=1, max_length=64)
    protocolVersion: str = Field(min_length=1, max_length=80)
    ownershipToken: str = Field(min_length=1, max_length=128)


class ProjectPathInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    rootPath: str = Field(min_length=1, max_length=4096)


class ProjectCreateInput(ProjectPathInput):
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    trustVersion: Literal["project-trust/v1"]
    approved: bool
    expectedRevision: int = Field(ge=0)


class ProjectIdInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID


class ProjectRevisionInput(ProjectIdInput):
    expectedRevision: int = Field(ge=1)


class ProjectUpdateInput(ProjectRevisionInput):
    name: str | None = Field(default=None, min_length=1, max_length=240)
    defaultBranch: str | None = Field(default=None, max_length=240)


class ConversationCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    title: str = Field(min_length=1, max_length=160)
    expectedRevision: Literal[0]


class ConversationProjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID


class ConversationIdInput(ConversationProjectInput):
    conversationId: UUID


class ConversationArchiveInput(ConversationIdInput):
    expectedRevision: int = Field(ge=1)


class IntentProposalInput(ConversationIdInput):
    messageId: UUID


class DraftIdInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    draftId: UUID


class DraftListInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    conversationId: UUID


class DraftUpdateTextInput(DraftIdInput):
    expectedRevision: int = Field(ge=1)
    editableText: str = Field(min_length=1, max_length=100_000)


class TaskIdInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID


class EnvironmentIdInput(ConversationProjectInput):
    environmentId: UUID


class EnvironmentArchiveInput(EnvironmentIdInput):
    expectedRevision: int = Field(ge=1)


class PresetIdInput(ConversationProjectInput):
    presetId: UUID


class PresetArchiveInput(PresetIdInput):
    expectedRevision: int = Field(ge=1)


class PresetApproveInput(PresetArchiveInput):
    scriptsHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class RunListInput(TaskIdInput):
    pass


class RunIdInput(ConversationProjectInput):
    runId: UUID


class RunInspectInput(RunIdInput):
    afterCursor: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)


class ReviewJobInput(ConversationProjectInput):
    reviewRunId: UUID


class VerifyJobInput(ConversationProjectInput):
    verificationId: UUID


class VerifyArtifactInput(ConversationProjectInput):
    artifactId: UUID


class HostRuntime:
    def __init__(self) -> None:
        self.host_id = str(uuid4())
        self.pid = os.getpid()
        self.started_at = timestamp()
        self.started_monotonic = time.monotonic()
        self.status = "starting"
        self.ownership_token = os.environ.get("FORGE_HOST_OWNERSHIP_TOKEN", "")
        self.product_version = __version__
        self.running = True
        data_dir = resolve_data_dir(
            environment="development", override=os.environ.get("FORGE_HOST_DATA_DIR")
        )
        self.storage = ForgePersistence(
            data_dir, read_only=os.environ.get("FORGE_PYTHON_DB_READ_ONLY") == "1"
        )
        self.artifacts = ArtifactStore(self.storage)
        self.storage_error: str | None = None
        self.projects = ProjectService(self.storage)
        self.conversations = ConversationService(self.storage)
        self.drafts = DraftService(self.storage)
        self.approvals = ApprovalService(self.storage, self.drafts)
        self.board = BoardService(self.storage)
        self.environments = EnvironmentService(self.storage)
        self.configs = RunConfigService(self.storage, self.environments)
        self.contexts = ContextService(self.storage, self.configs)
        self.runs = RunService(self.storage, self.configs)
        self.inspections = RunInspectionService(self.storage, self.runs)
        self.handoffs = HandoffService(self.storage)
        self.processes = ProcessController(uuid4(), data_dir / "process-records")
        self.plugins = PluginRegistry(granted_permissions=frozenset((
            "workspace.read", "workspace.write", "process.spawn"
        )))
        self.plugins.register_service("process.v1", self.processes)
        self.plugins.register_service("storage.v1", PluginStorageBroker(self.storage))
        self.workspaces = WorkspaceManager(
            data_dir / "workspaces", self.processes.runtime_id, self.processes.has_active
        )
        self.review_copies = ReviewCopyManager(
            data_dir / "review-copies", self.processes.runtime_id,
            self.processes.has_active,
        )
        self.review_issues = ReviewIssueService(
            self.storage, self.handoffs, self.configs,
            self.inspections, self.review_copies,
        )
        self.review_runtime: HostReviewService | None = None
        self.verifier = ProjectCommandVerifier(
            self.storage, self.projects, self.environments, self.configs,
            self.handoffs, self.processes, data_dir / "verifier-workspaces",
        )
        self.acceptance_matrix = AcceptanceMatrixService(
            self.storage, self.projects, self.configs, self.verifier,
        )
        self.final_acceptance = FinalAcceptanceService(
            self.storage, self.projects, self.acceptance_matrix,
        )
        self.board.final_acceptance = self.final_acceptance
        self.deliveries = DeliveryService(self.storage, self.projects, self.final_acceptance)
        self.task_changes = TaskChangeService(self.storage, self.projects)
        self.recovery = RecoveryService(self.storage, self.processes)
        self.rework = ReworkService(
            self.storage, self.projects, self.configs, self.handoffs,
            self.runs, self.review_issues, self.verifier, self.inspections,
        )
        self.verifier_ready = False
        self.development: HostDevelopmentService | None = None
        self.refiner_jobs: dict[str, asyncio.Task[None]] = {}
        self.recovered_storage = False

    def storage_health(self) -> dict[str, Any]:
        try:
            if not self.storage.is_open:
                self.storage.open()
                if not self.storage.read_only:
                    self.storage.migrate(LATEST_SCHEMA)
                    if not self.recovered_storage:
                        self.conversations.recover_interrupted()
                        self.drafts.recover_interrupted()
                        self.recovery.reconcile()
                        merge_recovery = self.deliveries.recover_pending()
                        if any(merge_recovery.values()):
                            LOGGER.warning(json.dumps({
                                "event": "merge_intents_reconciled", **merge_recovery,
                            }))
                        self.recovered_storage = True
            health = self.storage.health()
            self.storage_error = None if health["status"] == "ready" else health["error"]["code"]
        except PersistenceError as error:
            self.storage_error = error.code
            health = {
                "status": "unavailable",
                "schemaVersion": None,
                "sqliteVersion": None,
                "journalMode": "unknown",
                "error": {
                    "code": error.code,
                    "message": "Forge storage unavailable",
                    "retryable": error.code == "DATABASE_BUSY",
                    "correlationId": self.host_id,
                },
            }
        self.status = "ready" if health["status"] == "ready" else "degraded"
        return health

    def info(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "hostId": self.host_id,
            "pid": self.pid,
            "version": __version__,
            "productVersion": self.product_version,
            "startedAt": self.started_at,
            "protocolVersion": HOST_PROTOCOL_VERSION,
            "transportVersion": TRANSPORT_VERSION,
            "runtime": {
                "version": platform.python_version(),
                "python": platform.python_version(),
                "implementation": platform.python_implementation(),
                "platform": sys.platform,
                "arch": platform.machine(),
            },
        }

    def health(self) -> dict[str, Any]:
        storage = self.storage_health()
        return {
            **self.info(),
            "uptimeMs": max(0, int((time.monotonic() - self.started_monotonic) * 1000)),
            "timestamp": timestamp(),
            "storage": storage,
        }

    def dispatch(self, request: RpcRequest) -> dict[str, Any]:
        if request.method == "system.handshake":
            try:
                hello = Handshake.model_validate(request.params)
            except ValidationError as exc:
                raise ProtocolError("INVALID_REQUEST", "Invalid handshake") from exc
            if hello.protocolVersion != HOST_PROTOCOL_VERSION:
                raise ProtocolError("PROTOCOL_MISMATCH", "Host protocol version is incompatible")
            if hello.hostVersion != __version__ or hello.productVersion != __version__:
                raise ProtocolError("VERSION_MISMATCH", "Host product version is incompatible")
            if self.ownership_token and hello.ownershipToken != self.ownership_token:
                raise ProtocolError("FORBIDDEN", "Host ownership identity is invalid")
            self.storage_health()
            return self.info()
        if self.status == "starting":
            raise ProtocolError("HOST_UNAVAILABLE", "Complete handshake first")
        if request.method == "plugin.inspectBundled":
            if request.params:
                raise ProtocolError("INVALID_REQUEST", "Plugin inspection takes no parameters")
            return {"data": self.plugins.inspect_builtin_config()}
        if request.method.startswith("project."):
            return self.project_command(request)
        if request.method.startswith(("environment.", "commandPreset.")):
            return self.environment_command(request)
        if request.method.startswith("conversation."):
            return self.conversation_command(request)
        if request.method == "intent.propose":
            return self.conversation_command(request)
        if request.method.startswith("draft."):
            return self.draft_command(request)
        if request.method.startswith("approval."):
            return self.approval_command(request)
        if request.method in ("board.snapshot", "task.detail", "tasks.reorder"):
            return self.board_command(request)
        if request.method.startswith(("run.", "deliveries.", "task.change.")):
            return self.run_command(request)
        if request.method not in (
            "system.ping", "system.info", "system.health", "system.shutdown"
        ):
            raise ProtocolError("UNKNOWN_COMMAND", "Method is not registered")
        if request.params:
            raise ProtocolError("INVALID_REQUEST", "System methods do not accept parameters")
        if request.method == "system.ping":
            return {"reply": "pong", "hostId": self.host_id, "timestamp": timestamp()}
        if request.method == "system.info":
            return self.info()
        if request.method == "system.health":
            return self.health()
        if request.method == "system.shutdown":
            self.status = "stopping"
            self.running = False
            return {"hostId": self.host_id, "status": self.status}
        raise ProtocolError("UNKNOWN_COMMAND", "System method is not registered")

    async def attach_executor(self, adapter: ExecutorAdapter) -> None:
        """MIG-PY-07 registers a real adapter here; no fallback executor is implied."""
        if self.development is not None or self.storage.read_only:
            raise ProtocolError("HOST_UNAVAILABLE", "Executor cannot be attached")
        orphans = await self.workspaces.open()
        if orphans:
            LOGGER.warning(json.dumps({
                "event": "workspace_orphans_detected", "count": len(orphans)
            }))
        review_orphans = await self.review_copies.open()
        if review_orphans:
            LOGGER.warning(json.dumps({
                "event": "review_copy_orphans_detected", "count": len(review_orphans)
            }))
        scheduler = HostRunScheduler(
            self.runs, self.configs, self.contexts, self.workspaces,
            self.processes, adapter,
        )
        self.development = HostDevelopmentService(
            self.storage, self.projects, self.board, self.environments,
            self.configs, self.contexts, self.runs, self.workspaces,
            scheduler, HostSnapshotService(
                self.storage, self.workspaces, self.processes, self.runs,
                self.configs, self.contexts,
            ), adapter,
            self.plugins if self.plugins.resolve_executor(adapter.id) is adapter else None,
        )
        self.development.on_handoff = self._advance_rework
        self.review_runtime = HostReviewService(
            self.storage, self.projects, self.handoffs, self.configs,
            self.inspections, self.review_copies, self.review_issues, adapter,
        )
        self.review_runtime.on_rework = self._review_rework
        self.verifier.on_rework = self._verify_rework
        rework_recovered = self.rework.recover_interrupted()
        if rework_recovered:
            LOGGER.warning(json.dumps({"event": "rework_launches_interrupted",
                                       "count": rework_recovered}))
        recovered = self.review_runtime.recover_interrupted()
        if recovered:
            LOGGER.warning(json.dumps({"event": "review_jobs_interrupted",
                                       "count": recovered}))

    async def _launch_rework(self, cycle: ReworkCycle) -> None:
        if cycle.state == "blocked":
            LOGGER.warning(json.dumps({"event": "rework_limit_reached",
                                       "taskId": str(cycle.taskId),
                                       "cycleNo": cycle.cycleNo}))
            return
        if cycle.state != "pending" or self.development is None:
            return
        self.rework.mark_launching(cycle)
        try:
            feedback = self.rework.feedback(cycle)
            await self.development.start_rework(cycle, feedback)
            self.rework.mark_running(cycle)
        except Exception as error:
            self.rework.mark_interrupted(cycle, getattr(error, "code", "REWORK_LAUNCH_FAILED"))
            raise

    async def _review_rework(self, report: ReviewReport) -> None:
        await self._launch_rework(await self.rework.reserve_review(report))

    async def _verify_rework(self, report: VerifyReport) -> None:
        await self._launch_rework(await self.rework.reserve_verify(report))

    async def _advance_rework(self, handoff: DevelopmentHandoff) -> None:
        cycle = self.rework.for_next_run(handoff.snapshot.projectId,
                                         handoff.snapshot.runId)
        if cycle is None:
            return
        key = uuid5(NAMESPACE_URL, f"forge-rework-gate:{cycle.cycleId}")
        try:
            if cycle.triggerKind == "review":
                job = self.storage.session().execute(
                    "SELECT model_id FROM review_jobs WHERE report_id=?",
                    (str(cycle.triggerReportId),),
                ).fetchone()
                if job is None or self.review_runtime is None:
                    raise ReworkError("REWORK_GATE_UNAVAILABLE")
                await self.review_runtime.start(ReviewStartInput(
                    projectId=cycle.projectId, taskId=cycle.taskId,
                    developmentRunId=handoff.snapshot.runId,
                    expectedSnapshotId=handoff.snapshot.snapshotId,
                    modelId=job["model_id"], idempotencyKey=key,
                ))
            else:
                row = self.storage.session().execute(
                    "SELECT verification_id FROM verifier_reports WHERE report_id=?",
                    (str(cycle.triggerReportId),),
                ).fetchone()
                if row is None:
                    raise ReworkError("REWORK_GATE_UNAVAILABLE")
                source_report = self.verifier.report(cycle.projectId,
                                                     UUID(row["verification_id"]))
                if source_report is None:
                    raise ReworkError("REWORK_GATE_UNAVAILABLE")
                await self.verifier.start(VerifyStartInput(
                    projectId=cycle.projectId, taskId=cycle.taskId,
                    developmentRunId=handoff.snapshot.runId,
                    expectedSnapshotId=handoff.snapshot.snapshotId,
                    kind=source_report.kind, presetId=source_report.presetId,
                    idempotencyKey=key,
                ))
        except Exception as error:
            code = getattr(error, "code", "REWORK_GATE_UNAVAILABLE")
            self.rework.mark_gate_blocked(cycle, code)
            LOGGER.warning(json.dumps({"event": "rework_gate_blocked", "code": code,
                                       "cycleId": str(cycle.cycleId)}))

    async def dispatch_async(self, request: RpcRequest) -> dict[str, Any]:
        if request.method not in (
            "run.start", "run.cancel", "run.capabilities", "run.reviewStart",
            "run.verifyStart", "run.finalDecide", "deliveries.merge",
        ):
            return self.dispatch(request)
        if self.status == "starting":
            raise ProtocolError("HOST_UNAVAILABLE", "Complete handshake first")
        try:
            params = json.dumps(request.params)
            if request.method == "run.start":
                start = RunLaunchInput.model_validate_json(params)
            elif request.method == "run.cancel":
                cancel = RunIdInput.model_validate_json(params)
            elif request.method == "run.reviewStart":
                review_start = ReviewStartInput.model_validate_json(params)
            elif request.method == "run.verifyStart":
                verify_start = VerifyStartInput.model_validate_json(params)
            elif request.method == "run.finalDecide":
                final_decision = FinalAcceptanceInput.model_validate_json(params)
            elif request.method == "deliveries.merge":
                merge_request = MergeRequest.model_validate_json(params)
            else:
                capability = RunListInput.model_validate_json(params)
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid Run command payload") from error
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        if request.method == "run.verifyStart" and not self.verifier_ready:
            raise ProtocolError("HOST_UNAVAILABLE", "Verifier is not available")
        if self.development is None and request.method not in (
            "run.verifyStart", "run.finalDecide", "deliveries.merge",
        ):
            raise ProtocolError("MODEL_UNAVAILABLE", "Executor is not available")
        try:
            if request.method == "run.start":
                assert self.development is not None
                result: Any = await self.development.start(start)
            elif request.method == "run.cancel":
                assert self.development is not None
                result = await self.development.cancel(cancel.projectId, cancel.runId)
            elif request.method == "run.reviewStart":
                if self.review_runtime is None:
                    raise ProtocolError("MODEL_UNAVAILABLE", "Reviewer is not available")
                result = await self.review_runtime.start(review_start)
            elif request.method == "run.verifyStart":
                result = await self.verifier.start(verify_start)
            elif request.method == "run.finalDecide":
                if final_decision.decision == "return" and self.development is None:
                    raise ProtocolError("MODEL_UNAVAILABLE", "Executor is not available")
                result = self.final_acceptance.decide(final_decision)
                if final_decision.decision == "return" and result.decision is not None:
                    assert self.development is not None
                    try:
                        await self.development.start_human_return(
                            final_decision.projectId, final_decision.taskId,
                            result.decision.decisionId,
                        )
                    except Exception as error:
                        LOGGER.warning(json.dumps({
                            "event": "human_return_attempt_not_started",
                            "code": getattr(error, "code", "REWORK_LAUNCH_FAILED"),
                            "decisionId": str(result.decision.decisionId),
                        }))
                    result = self.final_acceptance.get(
                        final_decision.projectId, final_decision.taskId,
                    )
            elif request.method == "deliveries.merge":
                result = self.deliveries.merge(merge_request)
            else:
                assert self.development is not None
                result = await self.development.capabilities(
                    capability.projectId, capability.taskId
                )
            return {"data": to_jsonable_python(result)}
        except (DevelopmentError, ReviewRuntimeError, ReviewCopyError,
                VerifierError, FinalAcceptanceError, DeliveryError) as error:
            raise ProtocolError(error.code, error.code) from error

    def project_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            method = request.method
            params_json = json.dumps(request.params)
            if method == "project.probe":
                probe_input = ProjectPathInput.model_validate_json(params_json)
                value: Any = self.projects.probe(probe_input.rootPath)
            elif method == "project.create":
                create_input = ProjectCreateInput.model_validate_json(params_json)
                value = self.projects.create(
                    create_input.rootPath,
                    create_input.fingerprint,
                    create_input.trustVersion,
                    create_input.approved,
                    create_input.expectedRevision,
                )
            elif method == "project.list":
                if request.params:
                    raise ProtocolError("INVALID_REQUEST", "Project list takes no parameters")
                value = self.projects.list()
            elif method == "project.get":
                get_input = ProjectIdInput.model_validate_json(params_json)
                value = self.projects.get(str(get_input.projectId))
            elif method == "project.active":
                if request.params:
                    raise ProtocolError("INVALID_REQUEST", "Project active takes no parameters")
                value = self.projects.active()
            elif method == "project.setActive":
                active_input = ProjectRevisionInput.model_validate_json(params_json)
                value = self.projects.set_active(
                    str(active_input.projectId), active_input.expectedRevision
                )
            elif method == "project.update":
                update_input = ProjectUpdateInput.model_validate_json(params_json)
                value = self.projects.update(
                    str(update_input.projectId),
                    update_input.expectedRevision,
                    update_input.name,
                    update_input.defaultBranch,
                    default_branch_provided="defaultBranch" in update_input.model_fields_set,
                )
            elif method == "project.remove":
                remove_input = ProjectRevisionInput.model_validate_json(params_json)
                value = self.projects.remove(
                    str(remove_input.projectId), remove_input.expectedRevision
                )
            else:
                raise ProtocolError("UNKNOWN_COMMAND", "Project method is not registered")
            if isinstance(value, list):
                return {"data": [item.model_dump(mode="json") for item in value]}
            if hasattr(value, "model_dump"):
                return {"data": value.model_dump(mode="json")}
            return {"data": value}
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid project command payload") from error
        except ProjectError as error:
            raise ProtocolError(error.code, str(error)) from error
        except PersistenceError as error:
            raise ProtocolError(error.code, error.code) from error

    def environment_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            params = json.dumps(request.params)
            method = request.method
            if method == "environment.save":
                save_input = EnvironmentSaveInput.model_validate_json(params)
                result: Any = self.environments.save(save_input)
            elif method == "environment.list":
                list_input = ConversationProjectInput.model_validate_json(params)
                result = self.environments.list_environments(str(list_input.projectId))
            elif method == "environment.get":
                get_input = EnvironmentIdInput.model_validate_json(params)
                result = self.environments.get(
                    str(get_input.projectId), str(get_input.environmentId)
                )
            elif method == "environment.archive":
                archive_input = EnvironmentArchiveInput.model_validate_json(params)
                result = self.environments.archive(
                    str(archive_input.projectId), str(archive_input.environmentId),
                    archive_input.expectedRevision,
                )
            elif method == "commandPreset.save":
                preset_input = PresetSaveInput.model_validate_json(params)
                result = self.environments.save_preset(preset_input)
            elif method == "commandPreset.list":
                list_input = EnvironmentIdInput.model_validate_json(params)
                result = self.environments.list_presets(
                    str(list_input.projectId), str(list_input.environmentId)
                )
            elif method == "commandPreset.get":
                preset_get_input = PresetIdInput.model_validate_json(params)
                result = self.environments.get_preset(
                    str(preset_get_input.projectId), str(preset_get_input.presetId)
                )
            elif method == "commandPreset.approve":
                approve_input = PresetApproveInput.model_validate_json(params)
                result = self.environments.approve_preset(
                    str(approve_input.projectId), str(approve_input.presetId),
                    approve_input.expectedRevision, approve_input.scriptsHash,
                )
            elif method == "commandPreset.archive":
                preset_archive_input = PresetArchiveInput.model_validate_json(params)
                result = self.environments.archive_preset(
                    str(preset_archive_input.projectId), str(preset_archive_input.presetId),
                    preset_archive_input.expectedRevision,
                )
            else:
                raise ProtocolError("UNKNOWN_COMMAND", "Environment method is not registered")
            return {"data": to_jsonable_python(result)}
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid environment command payload") from error
        except EnvironmentError as error:
            raise ProtocolError(error.code, error.code) from error
        except PersistenceError as error:
            raise ProtocolError(error.code, error.code) from error

    def conversation_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            params = json.dumps(request.params)
            method = request.method
            if method == "conversation.create":
                create_input = ConversationCreateInput.model_validate_json(params)
                result: Any = self.conversations.create(
                    str(create_input.projectId), create_input.title, create_input.expectedRevision
                )
            elif method == "conversation.list":
                list_input = ConversationProjectInput.model_validate_json(params)
                result = self.conversations.list_conversations(str(list_input.projectId))
            elif method in ("conversation.get", "conversation.messages"):
                id_input = ConversationIdInput.model_validate_json(params)
                if method == "conversation.get":
                    result = self.conversations.get(
                        str(id_input.projectId), str(id_input.conversationId)
                    )
                else:
                    result = self.conversations.messages(
                        str(id_input.projectId), str(id_input.conversationId)
                    )
            elif method == "conversation.send":
                send_input = ConversationSend.model_validate_json(params)
                result = self.conversations.send(send_input)
            elif method == "conversation.archive":
                archive_input = ConversationArchiveInput.model_validate_json(params)
                result = self.conversations.archive(
                    str(archive_input.projectId),
                    str(archive_input.conversationId),
                    archive_input.expectedRevision,
                )
            elif method == "conversation.cancel":
                ConversationIdInput.model_validate_json(params)
                result = {"cancelled": False}
            elif method == "intent.propose":
                intent_input = IntentProposalInput.model_validate_json(params)
                result = self.conversations.propose(
                    str(intent_input.projectId), str(intent_input.conversationId),
                    str(intent_input.messageId),
                )
            else:
                raise ProtocolError("UNKNOWN_COMMAND", "Conversation method is not registered")
            return {"data": to_jsonable_python(result)}
        except ValidationError as error:
            raise ProtocolError(
                "INVALID_REQUEST", "Invalid conversation command payload"
            ) from error
        except ConversationError as error:
            raise ProtocolError(error.code, error.code) from error
        except PersistenceError as error:
            raise ProtocolError(error.code, error.code) from error

    def draft_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            params = json.dumps(request.params)
            method = request.method
            if method == "draft.manual":
                manual_input = DraftRequest.model_validate_json(params)
                result: Any = self.drafts.manual(manual_input)
            elif method == "draft.generate":
                generate_input = DraftRequest.model_validate_json(params)
                result = self.drafts.begin(
                    generate_input, "generating", CodexReadOnlyRefiner.provider_id
                )
                draft_id = str(result.draftId)
                if result.status == "generating" and draft_id not in self.refiner_jobs:
                    job = asyncio.create_task(self._run_refiner(draft_id))
                    self.refiner_jobs[draft_id] = job
                    job.add_done_callback(partial(self._finish_refiner, draft_id))
            elif method == "draft.list":
                list_input = DraftListInput.model_validate_json(params)
                result = self.drafts.list_drafts(
                    str(list_input.projectId), str(list_input.conversationId)
                )
            elif method in ("draft.get", "draft.history"):
                id_input = DraftIdInput.model_validate_json(params)
                if method == "draft.get":
                    result = self.drafts.get(str(id_input.projectId), str(id_input.draftId))
                else:
                    result = self.drafts.history(str(id_input.projectId), str(id_input.draftId))
            elif method == "draft.updateText":
                text_input = DraftUpdateTextInput.model_validate_json(params)
                result = self.drafts.update_text(
                    str(text_input.projectId), str(text_input.draftId),
                    text_input.expectedRevision, text_input.editableText,
                )
            elif method == "draft.revise":
                revise_input = DraftReviseInput.model_validate_json(params)
                result = self.drafts.revise(revise_input)
            else:
                raise ProtocolError("UNKNOWN_COMMAND", "Draft method is not registered")
            return {"data": to_jsonable_python(result)}
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid draft command payload") from error
        except DraftError as error:
            raise ProtocolError(error.code, error.code) from error
        except PersistenceError as error:
            raise ProtocolError(error.code, error.code) from error

    def _finish_refiner(self, draft_id: str, job: asyncio.Task[None]) -> None:
        self.refiner_jobs.pop(draft_id, None)
        if not job.cancelled() and job.exception() is not None:
            LOGGER.error(json.dumps({"event": "refiner_failed", "code": "REFINER_FAILED"}))

    async def _run_refiner(self, draft_id: str) -> None:
        row = self.storage.session().execute(
            "SELECT project_id,conversation_id,source_message_id FROM task_drafts "
            "WHERE draft_id=?", (draft_id,)
        ).fetchone()
        if row is None:
            return
        project_id = row["project_id"]
        try:
            project = self.projects.get(project_id)
            messages = self.conversations.messages(project_id, row["conversation_id"])
            message = next(
                (item for item in messages if str(item.messageId) == row["source_message_id"]
                 and item.role == "user"), None,
            )
            if project is None or message is None:
                raise DraftError("DRAFT_SOURCE_NOT_FOUND")
            summary = json.dumps({
                "name": project.name, "projectType": project.probe.projectType,
                "packageManager": project.probe.packageManager,
                "branch": project.probe.currentBranch,
                "workingTree": project.probe.workingTree,
                "declaredScripts": [
                    name for name, value in project.probe.scripts.model_dump().items() if value
                ],
            })
            intent, contract, error = await CodexReadOnlyRefiner().refine(
                project_id, draft_id, row["source_message_id"], message.content, summary
            )
            self.drafts.finish(project_id, draft_id, intent, contract, error)
        except asyncio.CancelledError:
            raise
        except Exception:
            self.drafts.finish(project_id, draft_id, "new_task", None, "REFINER_FAILED")

    async def shutdown(self) -> None:
        self.review_copies.workspaces.stop_accepting()
        await self.verifier.shutdown()
        if self.review_runtime is not None:
            await self.review_runtime.shutdown()
        if self.development is not None:
            await self.development.shutdown()
        try:
            await self.plugins.dispose()
        except Exception:
            LOGGER.error(json.dumps({"event": "plugin_shutdown_incomplete"}))
        reports = await self.processes.dispose()
        if any(not report.confirmed for report in reports):
            LOGGER.error(json.dumps({
                "event": "run_process_shutdown_incomplete",
                "unconfirmedRuns": sum(not report.confirmed for report in reports),
            }))
        jobs = list(self.refiner_jobs.values())
        for job in jobs:
            job.cancel()
        if jobs:
            try:
                await asyncio.wait_for(asyncio.gather(*jobs, return_exceptions=True), timeout=8)
            except TimeoutError:
                LOGGER.error(json.dumps({
                    "event": "refiner_shutdown_incomplete", "activeJobs": len(jobs)
                }))
        if self.storage.is_open and not self.storage.read_only:
            self.drafts.recover_interrupted()
        self.storage.close()

    def run_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            params = json.dumps(request.params)
            if request.method == "run.list":
                list_input = RunListInput.model_validate_json(params)
                result: Any = self.inspections.list(list_input.projectId, list_input.taskId)
            elif request.method == "run.inspect":
                inspect_input = RunInspectInput.model_validate_json(params)
                result = self.inspections.inspect(
                    inspect_input.projectId, inspect_input.runId,
                    inspect_input.afterCursor, inspect_input.limit
                )
            elif request.method == "run.handoff":
                handoff_input = RunIdInput.model_validate_json(params)
                result = self.handoffs.get(handoff_input.projectId, handoff_input.runId)
            elif request.method == "run.reviewReports":
                list_input = RunListInput.model_validate_json(params)
                result = self.review_issues.list_for_task(
                    list_input.projectId, list_input.taskId,
                )
            elif request.method == "run.issueHistory":
                list_input = RunListInput.model_validate_json(params)
                result = self.review_issues.issue_history(
                    list_input.projectId, list_input.taskId,
                )
            elif request.method == "run.reviewJobs":
                list_input = RunListInput.model_validate_json(params)
                result = self.review_runtime.list_for_task(
                    list_input.projectId, list_input.taskId,
                ) if self.review_runtime else []
            elif request.method == "run.reviewJob":
                get_input = ReviewJobInput.model_validate_json(params)
                if self.review_runtime is None:
                    raise ProtocolError("MODEL_UNAVAILABLE", "Reviewer is not available")
                result = self.review_runtime.get(
                    get_input.projectId, get_input.reviewRunId,
                )
            elif request.method == "run.verifyJobs":
                list_input = RunListInput.model_validate_json(params)
                result = self.verifier.list_for_task(list_input.projectId, list_input.taskId)
            elif request.method == "run.verifyJob":
                verify_job_input = VerifyJobInput.model_validate_json(params)
                result = self.verifier.get(verify_job_input.projectId,
                                           verify_job_input.verificationId)
            elif request.method == "run.verifyReport":
                verify_report_input = VerifyJobInput.model_validate_json(params)
                result = self.verifier.report(verify_report_input.projectId,
                                              verify_report_input.verificationId)
            elif request.method == "run.verifyArtifact":
                verify_artifact_input = VerifyArtifactInput.model_validate_json(params)
                result = self.verifier.artifact(verify_artifact_input.projectId,
                                                verify_artifact_input.artifactId)
            elif request.method == "run.acceptanceMatrix":
                matrix_input = RunListInput.model_validate_json(params)
                result = self.acceptance_matrix.get(matrix_input.projectId,
                                                    matrix_input.taskId)
            elif request.method == "run.acceptanceDecide":
                decision_input = AcceptanceDecisionInput.model_validate_json(params)
                result = self.acceptance_matrix.decide(decision_input)
            elif request.method == "run.finalAcceptance":
                final_input = RunListInput.model_validate_json(params)
                result = self.final_acceptance.get(final_input.projectId,
                                                   final_input.taskId)
            elif request.method == "deliveries.get":
                delivery_input = RunListInput.model_validate_json(params)
                result = self.deliveries.get(delivery_input.projectId,
                                             delivery_input.taskId)
            elif request.method == "deliveries.preview":
                preview_input = RunListInput.model_validate_json(params)
                result = self.deliveries.preview(preview_input.projectId,
                                                 preview_input.taskId)
            elif request.method == "run.issueWaive":
                waiver = AdvisoryWaiverInput.model_validate_json(params)
                result = self.final_acceptance.waive_advisory(waiver)
            elif request.method == "run.reworkCycles":
                cycles_input = RunListInput.model_validate_json(params)
                result = self.rework.list_for_task(cycles_input.projectId,
                                                   cycles_input.taskId)
            elif request.method == "task.change.get":
                change_input = RunListInput.model_validate_json(params)
                result = self.task_changes.latest(change_input.projectId, change_input.taskId)
            elif request.method == "task.change.propose":
                propose_input = TaskChangePropose.model_validate_json(params)
                result = self.task_changes.propose(propose_input)
            elif request.method == "task.change.decide":
                decide_input = TaskChangeDecision.model_validate_json(params)
                result = self.task_changes.decide(decide_input)
            elif request.method == "task.change.apply":
                apply_input = TaskChangeApply.model_validate_json(params)
                result = self.task_changes.apply(apply_input)
            else:
                raise ProtocolError("UNKNOWN_COMMAND", "Run method is not registered")
            return {"data": to_jsonable_python(result)}
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid Run command payload") from error
        except (RunError, InspectionError, HandoffError, PersistenceError,
                ReviewRuntimeError, VerifierError, AcceptanceMatrixError,
                ReworkError, FinalAcceptanceError, DeliveryError, TaskChangeError) as error:
            raise ProtocolError(error.code, error.code) from error

    def approval_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            params = json.dumps(request.params)
            method = request.method
            if method == "approval.request":
                request_input = ApprovalRequestInput.model_validate_json(params)
                result: Any = self.approvals.request(request_input)
            elif method == "approval.decide":
                decide_input = ApprovalDecideInput.model_validate_json(params)
                result = self.approvals.decide(decide_input)
            elif method == "approval.forDraft":
                draft_input = DraftIdInput.model_validate_json(params)
                result = self.approvals.for_draft(
                    str(draft_input.projectId), str(draft_input.draftId)
                )
            else:
                raise ProtocolError("UNKNOWN_COMMAND", "Approval method is not registered")
            return {"data": to_jsonable_python(result)}
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid approval command payload") from error
        except ApprovalError as error:
            raise ProtocolError(error.code, error.code) from error
        except PersistenceError as error:
            raise ProtocolError(error.code, error.code) from error

    def board_command(self, request: RpcRequest) -> dict[str, Any]:
        if self.storage.health()["status"] != "ready":
            raise ProtocolError("HOST_UNAVAILABLE", "Forge storage is unavailable")
        try:
            params = json.dumps(request.params)
            if request.method == "board.snapshot":
                snapshot_input = ConversationProjectInput.model_validate_json(params)
                result: Any = self.board.snapshot(str(snapshot_input.projectId))
            elif request.method == "task.detail":
                detail_input = TaskIdInput.model_validate_json(params)
                result = self.board.detail(
                    str(detail_input.projectId), str(detail_input.taskId)
                )
            else:
                reorder_input = BoardReorderInput.model_validate_json(params)
                result = self.board.reorder(reorder_input)
            return {"data": to_jsonable_python(result)}
        except ValidationError as error:
            raise ProtocolError("INVALID_REQUEST", "Invalid board command payload") from error
        except BoardError as error:
            raise ProtocolError(error.code, error.code) from error
        except PersistenceError as error:
            raise ProtocolError(error.code, error.code) from error


async def serve() -> int:
    runtime = HostRuntime()
    LOGGER.info(json.dumps({"event": "starting", "hostId": runtime.host_id, "pid": runtime.pid}))
    while runtime.running:
        raw = await asyncio.to_thread(sys.stdin.buffer.readline, MAX_FRAME_BYTES + 1)
        if not raw:
            break
        request_id: str | None = None
        try:
            request = parse_frame(raw)
            request_id = request.id
            result = await runtime.dispatch_async(request)
            if (
                request.method == "system.handshake" and runtime.status == "ready"
                and not runtime.storage.read_only and not runtime.verifier_ready
            ):
                interrupted = await runtime.verifier.open()
                runtime.verifier_ready = True
                if interrupted:
                    LOGGER.warning(json.dumps({"event": "verifier_jobs_interrupted",
                                               "count": interrupted}))
            if (
                request.method == "system.handshake" and runtime.status == "ready"
                and not runtime.storage.read_only and runtime.development is None
            ):
                try:
                    if "forge.executor.codex" not in runtime.plugins.manifests:
                        runtime.plugins.discover_builtin("forge.executor.codex")
                    if "forge.executor.codex" not in runtime.plugins.activated:
                        await runtime.plugins.activate("forge.executor.codex")
                    adapter = runtime.plugins.resolve_executor("executor.codex")
                    if adapter is None:
                        raise PluginError("PLUGIN_EXECUTOR_UNAVAILABLE")
                    await runtime.attach_executor(adapter)
                except PluginError as error:
                    LOGGER.warning(json.dumps({"event": "executor_unavailable",
                                               "code": error.code}))
                except Exception:
                    # Project and P1 operations remain available; run.start fails closed.
                    LOGGER.exception("Executor attachment failed")
                    await runtime.plugins.deactivate("forge.executor.codex")
            response: dict[str, Any] = {"jsonrpc": "2.0", "id": request.id, "result": result}
        except ProtocolError as exc:
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": exc.code, "message": str(exc)},
            }
            if exc.code == "INVALID_FRAME":
                runtime.running = False
        except Exception:
            LOGGER.exception("Unhandled Host request failure")
            response = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": "INTERNAL_ERROR", "message": "Host request failed"},
            }
        try:
            sys.stdout.buffer.write(encode_frame(response))
            sys.stdout.buffer.flush()
        except BrokenPipeError:
            break
    await runtime.shutdown()
    LOGGER.info(json.dumps({"event": "stopped", "hostId": runtime.host_id}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Forge Python Host JSON-RPC stdio entry")
    parser.parse_args()
    logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="%(message)s")
    return asyncio.run(serve())


if __name__ == "__main__":
    raise SystemExit(main())
