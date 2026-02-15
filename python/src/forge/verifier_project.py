"""Host-owned deterministic checks against disposable copies of fixed snapshots."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from collections.abc import Awaitable, Callable
from pathlib import Path, PureWindowsPath
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.environments import (
    CommandPreset,
    EnvironmentService,
    command_preset_approval_hash,
)
from forge.handoffs import HandoffService
from forge.persistence import ForgePersistence
from forge.processes import ProcessController, ProcessError, minimal_environment
from forge.projects import TRUST_VERSION, ProjectError, ProjectService, probe_project
from forge.run_config import RunConfigService
from forge.run_inspection import redact
from forge.workflow_drafts import WorkflowDraftError, WorkflowDraftService
from forge.workspaces import WorkspaceDescriptor, WorkspaceError, WorkspaceManager

LOGGER = logging.getLogger("forge.verifier")
OUTPUT_LIMIT = 131_072
CheckKind = Literal["test", "typecheck", "build", "lint"]
CheckStatus = Literal["passed", "failed", "not_configured", "timeout", "error"]


class VerifierError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class VerifyStartInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    expectedSnapshotId: UUID
    kind: CheckKind
    presetId: UUID | None
    idempotencyKey: UUID


class VerifyJob(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    verificationId: UUID
    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    snapshotId: UUID
    kind: CheckKind
    presetId: UUID | None
    state: Literal["running", "completed", "failed", "interrupted"]
    reportId: UUID | None
    errorCode: str | None
    createdAt: str
    updatedAt: str


class VerifyReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    reportId: UUID
    verificationId: UUID
    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    snapshotId: UUID
    kind: CheckKind
    presetId: UUID | None
    presetRevision: int | None
    approvalHash: str | None
    status: CheckStatus
    exitCode: int | None
    durationMs: int = Field(ge=0)
    stdoutArtifactId: UUID | None
    stderrArtifactId: UUID | None
    needsHuman: bool
    outputTruncated: bool
    createdAt: str


class VerifyArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    artifactId: UUID
    reportId: UUID
    kind: Literal["stdout", "stderr"]
    mime: Literal["text/plain"]
    content: str = Field(max_length=OUTPUT_LIMIT + 64)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    byteSize: int = Field(ge=0)
    truncated: bool
    createdAt: str


async def _capture(stream: asyncio.StreamReader | None) -> tuple[str, bool]:
    if stream is None:
        return "", False
    data = bytearray()
    truncated = False
    while chunk := await stream.read(8192):
        remaining = OUTPUT_LIMIT - len(data)
        if remaining > 0:
            data.extend(chunk[:remaining])
        if len(chunk) > remaining:
            truncated = True
    return redact(data.decode("utf-8", errors="replace")), truncated


def _relative_cwd(root: Path, relative: str) -> Path:
    if (not relative or "\0" in relative or Path(relative).is_absolute()
            or PureWindowsPath(relative).is_absolute()
            or ".." in relative.replace("\\", "/").split("/")):
        raise VerifierError("VERIFY_CWD_INVALID")
    target = (root / relative).resolve(strict=True)
    if not target.is_dir() or not target.is_relative_to(root):
        raise VerifierError("VERIFY_CWD_INVALID")
    return target


class ProjectCommandVerifier:
    """Runs only explicitly approved CommandPresets; no arbitrary command RPC."""

    def __init__(
        self, storage: ForgePersistence, projects: ProjectService,
        environments: EnvironmentService, configs: RunConfigService,
        handoffs: HandoffService, processes: ProcessController,
        workspace_root: Path,
    ) -> None:
        self.storage = storage
        self.projects = projects
        self.environments = environments
        self.configs = configs
        self.handoffs = handoffs
        self.processes = processes
        self.workspaces = WorkspaceManager(workspace_root, processes.runtime_id,
                                           processes.has_active)
        self.running: dict[UUID, asyncio.Task[None]] = {}
        self.on_rework: Callable[[VerifyReport], Awaitable[None]] | None = None
        self.lock = asyncio.Lock()

    async def open(self) -> int:
        orphans = await self.workspaces.open()
        with self.storage.transaction() as db:
            interrupted = db.execute(
                "UPDATE verifier_jobs SET state='interrupted',error_code='HOST_RESTARTED',"
                "updated_at=? WHERE state='running'", (timestamp(),),
            ).rowcount
        if orphans:
            LOGGER.warning(json.dumps({"event": "verifier_workspace_orphans_detected",
                                       "count": len(orphans)}))
        return interrupted

    def get(self, project_id: UUID, verification_id: UUID) -> VerifyJob:
        row = self.storage.session().execute(
            "SELECT * FROM verifier_jobs WHERE project_id=? AND verification_id=?",
            (str(project_id), str(verification_id)),
        ).fetchone()
        if row is None:
            raise VerifierError("VERIFY_NOT_FOUND")
        return VerifyJob(
            verificationId=UUID(row["verification_id"]),
            projectId=UUID(row["project_id"]), taskId=UUID(row["task_id"]),
            developmentRunId=UUID(row["development_run_id"]),
            snapshotId=UUID(row["snapshot_id"]), kind=row["kind"],
            presetId=UUID(row["preset_id"]) if row["preset_id"] else None,
            state=row["state"], reportId=UUID(row["report_id"]) if row["report_id"] else None,
            errorCode=row["error_code"], createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )

    def list_for_task(self, project_id: UUID, task_id: UUID) -> list[VerifyJob]:
        rows = self.storage.session().execute(
            "SELECT verification_id FROM verifier_jobs WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 50", (str(project_id), str(task_id)),
        ).fetchall()
        return [self.get(project_id, UUID(row["verification_id"])) for row in rows]

    def report(self, project_id: UUID, verification_id: UUID) -> VerifyReport | None:
        job = self.get(project_id, verification_id)
        if job.reportId is None:
            return None
        row = self.storage.session().execute(
            "SELECT result_json,content_hash FROM verifier_reports "
            "WHERE report_id=? AND project_id=?",
            (str(job.reportId), str(project_id)),
        ).fetchone()
        if (row is None or hashlib.sha256(row["result_json"].encode()).hexdigest()
                != row["content_hash"]):
            raise VerifierError("VERIFY_REPORT_INVALID")
        return VerifyReport.model_validate_json(row["result_json"])

    def artifact(self, project_id: UUID, artifact_id: UUID) -> VerifyArtifact:
        row = self.storage.session().execute(
            "SELECT a.* FROM verifier_artifacts a JOIN verifier_reports r "
            "ON r.report_id=a.report_id WHERE a.artifact_id=? AND a.project_id=?",
            (str(artifact_id), str(project_id)),
        ).fetchone()
        if (row is None or hashlib.sha256(row["content_text"].encode()).hexdigest()
                != row["content_hash"]):
            raise VerifierError("VERIFY_ARTIFACT_NOT_FOUND")
        return VerifyArtifact(
            artifactId=UUID(row["artifact_id"]), reportId=UUID(row["report_id"]),
            kind=row["kind"], mime=row["mime"], content=row["content_text"],
            contentHash=row["content_hash"], byteSize=row["byte_size"],
            truncated=bool(row["truncated"]), createdAt=row["created_at"],
        )

    def _save_report(
        self, job: VerifyJob, status: CheckStatus,
        exit_code: int | None, duration_ms: int,
        stdout: tuple[str, bool] = ("", False),
        stderr: tuple[str, bool] = ("", False),
        preset_revision: int | None = None, approval_hash: str | None = None,
    ) -> VerifyReport:
        now = timestamp()
        report_id = uuid4()
        stdout_id = uuid4() if stdout[0] else None
        stderr_id = uuid4() if stderr[0] else None
        report = VerifyReport(
            schemaVersion="1.0", reportId=report_id,
            verificationId=job.verificationId, projectId=job.projectId,
            taskId=job.taskId, developmentRunId=job.developmentRunId,
            snapshotId=job.snapshotId, kind=job.kind, presetId=job.presetId,
            presetRevision=preset_revision, approvalHash=approval_hash,
            status=status, exitCode=exit_code, durationMs=duration_ms,
            stdoutArtifactId=stdout_id, stderrArtifactId=stderr_id,
            needsHuman=status != "passed", outputTruncated=stdout[1] or stderr[1],
            createdAt=now,
        )
        body = report.model_dump_json()
        with self.storage.transaction() as db:
            db.execute(
                "INSERT INTO verifier_reports(report_id,verification_id,project_id,"
                "snapshot_id,status,result_json,content_hash,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (str(report_id), str(job.verificationId), str(job.projectId),
                 str(job.snapshotId), status, body, hashlib.sha256(body.encode()).hexdigest(), now),
            )
            for kind, item, artifact_id in (
                ("stdout", stdout, stdout_id), ("stderr", stderr, stderr_id)
            ):
                if artifact_id is None:
                    continue
                db.execute(
                    "INSERT INTO verifier_artifacts(artifact_id,report_id,project_id,kind,"
                    "mime,content_text,content_hash,byte_size,truncated,created_at) "
                    "VALUES(?,?,?,?,'text/plain',?,?,?,?,?)",
                    (str(artifact_id), str(report_id), str(job.projectId), kind,
                     item[0], hashlib.sha256(item[0].encode()).hexdigest(),
                     len(item[0].encode()), int(item[1]), now),
                )
            db.execute(
                "UPDATE verifier_jobs SET state='completed',report_id=?,updated_at=? "
                "WHERE verification_id=? AND state='running'",
                (str(report_id), now, str(job.verificationId)),
            )
        return report

    async def start(self, value: VerifyStartInput) -> VerifyJob:
        async with self.lock:
            prior = self.storage.session().execute(
                "SELECT verification_id FROM verifier_jobs WHERE idempotency_key=?",
                (str(value.idempotencyKey),),
            ).fetchone()
            if prior is not None:
                job = self.get(value.projectId, UUID(prior["verification_id"]))
                if (job.taskId != value.taskId
                        or job.developmentRunId != value.developmentRunId
                        or job.snapshotId != value.expectedSnapshotId
                        or job.kind != value.kind or job.presetId != value.presetId):
                    raise VerifierError("VERIFY_CONFLICT")
                return job
            project = self.projects.get(str(value.projectId))
            active = self.projects.active()
            if (project is None or not project.trusted or project.archivedAt
                    or project.trustVersion != TRUST_VERSION
                    or active is None or active.projectId != value.projectId
                    or project.repositoryType != "git" or project.gitRoot != project.rootPath):
                raise VerifierError("PROJECT_TRUST_REQUIRED")
            try:
                fresh = self.projects.probe(project.rootPath)
            except ProjectError as error:
                raise VerifierError("PROJECT_TRUST_REQUIRED") from error
            if fresh.rootPath != project.rootPath or fresh.gitRoot != project.gitRoot:
                raise VerifierError("PROJECT_TRUST_REQUIRED")
            handoff = self.handoffs.get(value.projectId, value.developmentRunId)
            config = self.configs.get(value.projectId, value.developmentRunId)
            if (handoff is None or config is None or config.taskId != value.taskId
                    or handoff.snapshot.snapshotId != value.expectedSnapshotId
                    or handoff.bundle.runConfigHash != config.snapshotHash):
                raise VerifierError("VERIFY_SOURCE_STALE")
            current_revision = self.storage.session().execute(
                "SELECT current_revision FROM tasks WHERE project_id=? AND task_id=?",
                (str(value.projectId), str(value.taskId)),
            ).fetchone()
            if (current_revision is None
                    or current_revision["current_revision"] != config.taskRevision):
                raise VerifierError("VERIFY_SOURCE_STALE")
            if self.storage.schema_version() >= 23 and self.storage.session().execute(
                "SELECT 1 FROM task_change_requests WHERE task_id=? "
                "AND state='awaiting_safe_point' LIMIT 1", (str(value.taskId),),
            ).fetchone():
                raise VerifierError("VERIFY_SOURCE_STALE")
            newest = self.storage.session().execute(
                "SELECT s.snapshot_id FROM code_snapshots s JOIN runs r ON r.run_id=s.run_id "
                "WHERE r.project_id=? AND r.task_id=? ORDER BY s.rowid DESC LIMIT 1",
                (str(value.projectId), str(value.taskId)),
            ).fetchone()
            if newest is None or newest["snapshot_id"] != str(value.expectedSnapshotId):
                raise VerifierError("VERIFY_SOURCE_STALE")
            preset = None
            if value.presetId is None:
                if value.kind != "test" or fresh.scripts.test is not None:
                    raise VerifierError("VERIFY_PRESET_REQUIRED")
            else:
                preset = self.environments.get_preset(str(value.projectId), str(value.presetId))
                if (preset is None or preset.environmentId != config.environment.environmentId
                        or value.presetId not in config.environment.config.commandPresetIds
                        or preset.name != value.kind or not preset.approvalHash
                        or preset.revision < 2 or preset.scriptsHash != fresh.scriptsHash
                        or preset.approvalHash != command_preset_approval_hash(
                            preset, preset.revision - 1
                        )):
                    raise VerifierError("VERIFY_PRESET_UNAPPROVED")
                if preset.envRefs or config.environment.config.envRefs:
                    raise VerifierError("VERIFY_ENV_UNAVAILABLE")
            if config.workflow.id.startswith("workflow."):
                try:
                    publication = WorkflowDraftService(self.storage).published(
                        config.workflow.id, int(config.workflow.version),
                    )
                except (WorkflowDraftError, ValueError) as error:
                    raise VerifierError("WORKFLOW_RUNTIME_UNAVAILABLE") from error
                if publication.contentHash != config.workflow.contentHash:
                    raise VerifierError("WORKFLOW_RUNTIME_UNAVAILABLE")
                limit = next((node.timeoutSeconds for node in publication.definition.nodes
                              if node.id == "verify"), 0)
                if limit <= 0:
                    raise VerifierError("WORKFLOW_RUNTIME_UNAVAILABLE")
                if preset is not None and preset.timeoutSeconds > limit:
                    raise VerifierError("WORKFLOW_BUDGET_UNSUPPORTED")
            verification_id = uuid4()
            workspace: WorkspaceDescriptor | None = None
            if preset is not None:
                try:
                    workspace = await self.workspaces.create(
                        Path(project.rootPath), str(verification_id),
                        handoff.snapshot.commitSha, mode="detached-worktree",
                    )
                    if (workspace.baseTree != handoff.snapshot.treeSha
                            or probe_project(workspace.rootPath).scriptsHash != preset.scriptsHash):
                        raise VerifierError("VERIFY_SOURCE_STALE")
                    _relative_cwd(Path(workspace.rootPath), preset.cwdRelative)
                except (WorkspaceError, ProjectError, OSError, ValueError,
                        VerifierError) as error:
                    if workspace is not None:
                        try:
                            await self.workspaces.dispose_disposable(
                                workspace.workspaceId, str(verification_id)
                            )
                        except WorkspaceError:
                            LOGGER.error(json.dumps({
                                "event": "verifier_workspace_quarantined",
                                "workspaceId": str(workspace.workspaceId),
                            }))
                    raise VerifierError("VERIFY_WORKSPACE_UNAVAILABLE") from error
            now = timestamp()
            try:
                with self.storage.transaction() as db:
                    db.execute(
                        "INSERT INTO verifier_jobs(verification_id,idempotency_key,project_id,"
                        "task_id,development_run_id,snapshot_id,kind,preset_id,state,"
                        "created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'running',?,?)",
                        (str(verification_id), str(value.idempotencyKey), str(value.projectId),
                         str(value.taskId), str(value.developmentRunId),
                         str(value.expectedSnapshotId), value.kind,
                         str(value.presetId) if value.presetId else None, now, now),
                    )
            except Exception:
                if workspace is not None:
                    await self.workspaces.dispose_disposable(
                        workspace.workspaceId, str(verification_id)
                    )
                raise
            job = self.get(value.projectId, verification_id)
            if preset is None:
                self._save_report(job, "not_configured", None, 0)
            else:
                assert workspace is not None
                task = asyncio.create_task(self._execute(job, workspace, preset))
                self.running[verification_id] = task
                task.add_done_callback(lambda _done: self.running.pop(verification_id, None))
            return self.get(value.projectId, verification_id)

    async def _execute(self, job: VerifyJob, workspace: WorkspaceDescriptor,
                       preset: CommandPreset) -> None:
        started = time.monotonic()
        stdout = ("", False)
        stderr = ("", False)
        status: CheckStatus = "error"
        exit_code: int | None = None
        error_code: str | None = None
        try:
            await self.workspaces.verify_identity(workspace.workspaceId)
            cwd = _relative_cwd(Path(workspace.rootPath), preset.cwdRelative)
            session = await self.processes.spawn(
                str(job.verificationId), preset.executable, preset.argv, cwd,
                environment=minimal_environment(dict(os.environ)),
            )
            out_task = asyncio.create_task(_capture(session.stdout))
            err_task = asyncio.create_task(_capture(session.stderr))
            try:
                exit_code = await asyncio.wait_for(session.wait(), preset.timeoutSeconds)
                status = "passed" if exit_code == 0 else "failed"
            except TimeoutError:
                status = "timeout"
            finally:
                cancelled = await self.processes.cancel(str(job.verificationId))
                stdout, stderr = await asyncio.gather(out_task, err_task)
                if not cancelled.confirmed:
                    raise VerifierError("VERIFY_PROCESS_UNCONFIRMED")
                if status == "passed" and cancelled.forced:
                    status = "error"
            await self.workspaces.dispose_disposable(
                workspace.workspaceId, str(job.verificationId)
            )
            report = self._save_report(
                job, status, exit_code, int((time.monotonic() - started) * 1000),
                stdout, stderr, preset.revision, preset.approvalHash,
            )
            if report.status == "failed" and self.on_rework is not None:
                try:
                    await self.on_rework(report)
                except Exception:
                    LOGGER.exception("Verify rework launch failed; verify report remains durable")
        except (Exception, asyncio.CancelledError) as error:
            error_code = getattr(error, "code", "VERIFY_RUNTIME_ERROR")
            if self.processes.has_active(str(job.verificationId)):
                try:
                    result = await asyncio.wait_for(
                        self.processes.cancel(str(job.verificationId)), 8
                    )
                    if not result.confirmed:
                        error_code = "VERIFY_PROCESS_UNCONFIRMED"
                except (TimeoutError, ProcessError):
                    error_code = "VERIFY_PROCESS_UNCONFIRMED"
            if not self.processes.has_active(str(job.verificationId)):
                try:
                    await self.workspaces.dispose_disposable(
                        workspace.workspaceId, str(job.verificationId)
                    )
                except WorkspaceError:
                    error_code = "VERIFY_WORKSPACE_UNAVAILABLE"
            with self.storage.transaction() as db:
                db.execute(
                    "UPDATE verifier_jobs SET state=?,error_code=?,updated_at=? "
                    "WHERE verification_id=? AND state='running'",
                    ("interrupted" if isinstance(error, asyncio.CancelledError) else "failed",
                     error_code, timestamp(), str(job.verificationId)),
                )
            LOGGER.warning(json.dumps({
                "event": "verifier_job_failed", "code": error_code,
                "verificationId": str(job.verificationId),
            }))

    async def shutdown(self) -> None:
        jobs = list(self.running.values())
        for job in jobs:
            job.cancel()
        if jobs:
            await asyncio.wait_for(asyncio.gather(*jobs, return_exceptions=True), 12)
        self.workspaces.stop_accepting()
