"""Explicit one-Reviewer execution against a fixed read-only snapshot copy."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.executor_contracts import (
    AttemptRequest,
    ExecutorAdapter,
    ExecutorEvent,
    ExecutorRunHandle,
    RunCompleted,
    ScheduledExecutorRequest,
)
from forge.handoffs import HandoffService
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectError, ProjectService
from forge.review import (
    ReviewContext,
    ReviewError,
    ReviewResult,
    build_review_context,
    load_reviewer_profile,
)
from forge.review_copies import ReviewCopyError, ReviewCopyManager
from forge.review_issues import ReviewIssueService, ReviewReport
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService

LOGGER = logging.getLogger("forge.review")


class ReviewRuntimeError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReviewStartInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    expectedSnapshotId: UUID
    modelId: str = Field(min_length=1, max_length=128)
    idempotencyKey: UUID


class ReviewJob(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reviewRunId: UUID
    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    snapshotId: UUID
    reviewCopyId: UUID
    reviewAttemptId: UUID
    modelId: str
    state: Literal["running", "completed", "failed", "interrupted"]
    reportId: UUID | None
    errorCode: str | None
    createdAt: str
    updatedAt: str


class HostReviewService:
    def __init__(
        self, storage: ForgePersistence, projects: ProjectService,
        handoffs: HandoffService, configs: RunConfigService,
        inspections: RunInspectionService, copies: ReviewCopyManager,
        issues: ReviewIssueService, adapter: ExecutorAdapter,
    ) -> None:
        self.storage = storage
        self.projects = projects
        self.handoffs = handoffs
        self.configs = configs
        self.inspections = inspections
        self.copies = copies
        self.issues = issues
        self.adapter = adapter
        self.on_rework: Callable[[ReviewReport], Awaitable[None]] | None = None
        self.running: dict[UUID, asyncio.Task[None]] = {}
        self.handles: dict[UUID, ExecutorRunHandle] = {}
        self.lock = asyncio.Lock()

    def recover_interrupted(self) -> int:
        with self.storage.transaction() as db:
            changed = db.execute(
                "UPDATE review_jobs SET state='interrupted',error_code='HOST_RESTARTED',"
                "updated_at=? WHERE state='running'", (timestamp(),),
            ).rowcount
        return changed

    def _get(self, review_run_id: UUID) -> ReviewJob | None:
        row = self.storage.session().execute(
            "SELECT * FROM review_jobs WHERE review_run_id=?", (str(review_run_id),),
        ).fetchone()
        if row is None:
            return None
        return ReviewJob(
            reviewRunId=UUID(row["review_run_id"]), projectId=UUID(row["project_id"]),
            taskId=UUID(row["task_id"]), developmentRunId=UUID(row["development_run_id"]),
            snapshotId=UUID(row["snapshot_id"]), reviewCopyId=UUID(row["review_copy_id"]),
            reviewAttemptId=UUID(row["review_attempt_id"]), modelId=row["model_id"],
            state=row["state"], reportId=UUID(row["report_id"]) if row["report_id"] else None,
            errorCode=row["error_code"], createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )

    def get(self, project_id: UUID, review_run_id: UUID) -> ReviewJob:
        job = self._get(review_run_id)
        if job is None or job.projectId != project_id:
            raise ReviewRuntimeError("REVIEW_NOT_FOUND")
        return job

    def list_for_task(self, project_id: UUID, task_id: UUID) -> list[ReviewJob]:
        rows = self.storage.session().execute(
            "SELECT review_run_id FROM review_jobs WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 50", (str(project_id), str(task_id)),
        ).fetchall()
        return [self.get(project_id, UUID(row["review_run_id"])) for row in rows]

    async def start(self, value: ReviewStartInput) -> ReviewJob:
        async with self.lock:
            prior = self.storage.session().execute(
                "SELECT review_run_id FROM review_jobs WHERE idempotency_key=?",
                (str(value.idempotencyKey),),
            ).fetchone()
            if prior is not None:
                job = self.get(value.projectId, UUID(prior["review_run_id"]))
                if (job.taskId != value.taskId or job.developmentRunId != value.developmentRunId
                        or job.snapshotId != value.expectedSnapshotId
                        or job.modelId != value.modelId):
                    raise ReviewRuntimeError("REVIEW_CONFLICT")
                return job
            project = self.projects.get(str(value.projectId))
            active = self.projects.active()
            if (project is None or not project.trusted or project.archivedAt
                    or project.trustVersion != TRUST_VERSION
                    or active is None or active.projectId != value.projectId):
                raise ReviewRuntimeError("PROJECT_TRUST_REQUIRED")
            try:
                fresh = self.projects.probe(project.rootPath)
            except ProjectError as error:
                raise ReviewRuntimeError("PROJECT_TRUST_REQUIRED") from error
            if fresh.rootPath != project.rootPath or fresh.gitRoot != project.gitRoot:
                raise ReviewRuntimeError("PROJECT_TRUST_REQUIRED")
            handoff = self.handoffs.get(value.projectId, value.developmentRunId)
            config = self.configs.get(value.projectId, value.developmentRunId)
            if handoff is None or config is None or config.taskId != value.taskId:
                raise ReviewRuntimeError("REVIEW_SOURCE_MISSING")
            current_revision = self.storage.session().execute(
                "SELECT current_revision FROM tasks WHERE project_id=? AND task_id=?",
                (str(value.projectId), str(value.taskId)),
            ).fetchone()
            if (current_revision is None
                    or current_revision["current_revision"] != config.taskRevision):
                raise ReviewRuntimeError("REVIEW_RESULT_STALE")
            if self.storage.schema_version() >= 23 and self.storage.session().execute(
                "SELECT 1 FROM task_change_requests WHERE task_id=? "
                "AND state='awaiting_safe_point' LIMIT 1", (str(value.taskId),),
            ).fetchone():
                raise ReviewRuntimeError("REVIEW_RESULT_STALE")
            inspection = self.inspections.inspect(value.projectId, value.developmentRunId)
            try:
                context = build_review_context(handoff, config, inspection.diff)
            except ReviewError as error:
                raise ReviewRuntimeError(error.code) from error
            if context.snapshotId != value.expectedSnapshotId:
                raise ReviewRuntimeError("REVIEW_RESULT_STALE")
            current = self.storage.session().execute(
                "SELECT s.snapshot_id FROM code_snapshots s JOIN runs r ON r.run_id=s.run_id "
                "WHERE r.project_id=? AND r.task_id=? ORDER BY s.rowid DESC LIMIT 1",
                (str(value.projectId), str(value.taskId)),
            ).fetchone()
            if current is None or current["snapshot_id"] != str(context.snapshotId):
                raise ReviewRuntimeError("REVIEW_RESULT_STALE")
            caps = await self.adapter.probe()
            if (not caps.available or not caps.readOnlyEnforced
                    or caps.enforcement != "native-sandbox"
                    or not caps.structuredOutput or value.modelId not in caps.modelIds):
                raise ReviewRuntimeError("REVIEW_READ_ONLY_UNAVAILABLE")
            profile, prompt = load_reviewer_profile()
            copy = await self.copies.create(Path(project.rootPath), handoff.snapshot, caps)
            attempt_id = uuid4()
            request = ScheduledExecutorRequest(
                runId=str(copy.ownerReviewRunId), taskId=str(value.taskId),
                workspace=copy.rootPath,
                goal=(f"{prompt}\nReviewContext JSON:\n{context.model_dump_json()}\n"
                      "Inspect the fixed review copy. Return a ReviewResult JSON object. "
                      "If evidence is insufficient, return inconclusive. Do not modify files."),
                context=[], permission="read-only", approval="never", model=value.modelId,
                outputSchema=ReviewResult.model_json_schema(),
                maxDurationMs=min(profile.limits.maxSeconds * 1000, 3_600_000),
                attempt=AttemptRequest(
                    attemptId=str(attempt_id), leaseEpoch=1,
                    contractRevision=context.contractRevision,
                    workspaceLeaseId=str(copy.ownershipId),
                    contextBundleId=str(handoff.bundle.contextBundleId),
                    profileRevision=profile.revision, outputSchemaId="review-result/v1",
                ),
            )
            try:
                await self.copies.assert_request(copy.reviewCopyId, request)
                now = timestamp()
                with self.storage.transaction() as db:
                    db.execute(
                        "INSERT INTO review_jobs(review_run_id,idempotency_key,project_id,"
                        "task_id,development_run_id,snapshot_id,review_copy_id,"
                        "review_attempt_id,model_id,state,created_at,updated_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,'running',?,?)",
                        (str(copy.ownerReviewRunId), str(value.idempotencyKey),
                         str(value.projectId), str(value.taskId),
                         str(value.developmentRunId), str(context.snapshotId),
                         str(copy.reviewCopyId), str(attempt_id), value.modelId, now, now),
                    )
            except Exception:
                await self.copies.release(copy.reviewCopyId)
                raise
            task = asyncio.create_task(self._execute(copy.ownerReviewRunId, request, context))
            self.running[copy.ownerReviewRunId] = task
            task.add_done_callback(lambda _task: self.running.pop(copy.ownerReviewRunId, None))
            created_job = self._get(copy.ownerReviewRunId)
            assert created_job is not None
            return created_job

    async def _execute(
        self, review_run_id: UUID, request: ScheduledExecutorRequest,
        context: ReviewContext,
    ) -> None:
        job = self._get(review_run_id)
        assert job is not None
        completed: RunCompleted | None = None
        error_code: str | None = None
        handle: ExecutorRunHandle | None = None
        try:
            def observe(event: ExecutorEvent) -> None:
                nonlocal completed
                if event.type == "run.completed" and event.runId == str(review_run_id):
                    completed = event

            handle = await self.adapter.start(request, observe)
            self.handles[review_run_id] = handle
            outcome = await asyncio.wait_for(handle.wait(), request.maxDurationMs / 1000)
            if outcome != "completed" or completed is None:
                raise ReviewRuntimeError("REVIEW_RESULT_MISSING")
            await self.copies.verify(job.reviewCopyId)
            report = await self.issues.record(
                job.projectId, job.developmentRunId, job.reviewCopyId,
                job.reviewAttemptId, completed,
            )
            await self.copies.release(job.reviewCopyId)
            with self.storage.transaction() as db:
                db.execute(
                    "UPDATE review_jobs SET state='completed',report_id=?,updated_at=? "
                    "WHERE review_run_id=? AND state='running'",
                    (str(report.reviewId), timestamp(), str(review_run_id)),
                )
            if report.status == "changes_requested" and self.on_rework is not None:
                try:
                    await self.on_rework(report)
                except Exception:
                    LOGGER.exception("Review rework launch failed; review report remains durable")
        except (Exception, asyncio.CancelledError) as error:
            error_code = getattr(error, "code", "REVIEW_RUNTIME_ERROR")
            if handle is not None and self.copies.is_run_active(str(review_run_id)):
                try:
                    await asyncio.wait_for(handle.cancel(), 8)
                    await asyncio.wait_for(handle.wait(), 8)
                except (Exception, TimeoutError):
                    error_code = "REVIEW_PROCESS_UNCONFIRMED"
            state = "interrupted" if self.copies.is_run_active(str(review_run_id)) else "failed"
            LOGGER.warning(json.dumps({"event": "review_failed", "code": error_code,
                                       "reviewRunId": str(review_run_id)}))
            if self.storage.is_open:
                with self.storage.transaction() as db:
                    db.execute(
                        "UPDATE review_jobs SET state=?,error_code=?,updated_at=? "
                        "WHERE review_run_id=? AND state='running'",
                        (state, error_code, timestamp(), str(review_run_id)),
                    )
        finally:
            self.handles.pop(review_run_id, None)
            try:
                await self.copies.release(job.reviewCopyId)
            except ReviewCopyError as error:
                LOGGER.warning(json.dumps({"event": "review_copy_retained",
                                           "code": error.code,
                                           "reviewRunId": str(review_run_id)}))

    async def shutdown(self) -> None:
        for review_run_id, handle in list(self.handles.items()):
            try:
                await asyncio.wait_for(handle.cancel(), 8)
            except (Exception, TimeoutError):
                LOGGER.error(json.dumps({"event": "review_cancel_unconfirmed",
                                         "reviewRunId": str(review_run_id)}))
        jobs = list(self.running.values())
        if jobs:
            try:
                await asyncio.wait_for(asyncio.gather(*jobs, return_exceptions=True), 12)
            except TimeoutError:
                LOGGER.error(json.dumps({"event": "review_shutdown_incomplete",
                                         "activeJobs": len(jobs)}))
