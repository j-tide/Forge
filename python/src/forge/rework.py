"""Durable, bounded Review/Verify rework lineage for Python Host."""

from __future__ import annotations

import asyncio
import sqlite3
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.context import ContextItem
from forge.conversations import timestamp
from forge.handoffs import HandoffService
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.review_issues import ReviewIssueService, ReviewReport
from forge.run_config import RunConfigService, RunConfigSnapshot
from forge.run_inspection import RunInspectionService
from forge.runs import RunService
from forge.verifier_project import ProjectCommandVerifier, VerifyReport
from forge.workflow_drafts import WorkflowDraftError, WorkflowDraftService

MAX_REWORK_CYCLES = 3
MAX_TOTAL_ATTEMPTS = 20


def frozen_attempt_limit(storage: ForgePersistence, config: RunConfigSnapshot) -> int:
    if not config.workflow.id.startswith("workflow."):
        return MAX_TOTAL_ATTEMPTS
    try:
        publication = WorkflowDraftService(storage).published(
            config.workflow.id, int(config.workflow.version),
        )
    except (WorkflowDraftError, ValueError) as error:
        raise ReworkError("WORKFLOW_RUNTIME_UNAVAILABLE") from error
    if publication.contentHash != config.workflow.contentHash:
        raise ReworkError("WORKFLOW_RUNTIME_UNAVAILABLE")
    return min(MAX_TOTAL_ATTEMPTS, publication.definition.maxTotalAttempts)


class ReworkError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReworkCycle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    cycleId: UUID
    projectId: UUID
    taskId: UUID
    sourceRunId: UUID
    sourceSnapshotId: UUID
    triggerKind: Literal["review", "verify"]
    triggerReportId: UUID
    nextRunId: UUID | None
    cycleNo: int = Field(ge=1)
    totalAttempts: int = Field(ge=1)
    state: Literal["pending", "launching", "running", "blocked", "interrupted",
                   "succeeded", "failed", "cancelled"]
    reasonCode: str | None
    createdAt: str
    updatedAt: str


class ReworkService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService,
                 configs: RunConfigService, handoffs: HandoffService,
                 runs: RunService, reviews: ReviewIssueService,
                 verifier: ProjectCommandVerifier,
                 inspections: RunInspectionService) -> None:
        self.storage = storage
        self.projects = projects
        self.configs = configs
        self.handoffs = handoffs
        self.runs = runs
        self.reviews = reviews
        self.verifier = verifier
        self.inspections = inspections
        self.lock = asyncio.Lock()

    def _attempt_limit(self, config: RunConfigSnapshot) -> int:
        return frozen_attempt_limit(self.storage, config)

    def _view(self, row: sqlite3.Row) -> ReworkCycle:
        next_run = UUID(row["next_run_id"]) if row["next_run_id"] else None
        state = row["state"]
        if next_run is not None and state not in ("blocked", "interrupted"):
            run = self.runs.get(UUID(row["project_id"]), next_run)
            if run is not None:
                state = run.state if run.state in ("succeeded", "failed", "cancelled") else (
                    "interrupted" if run.state == "interrupted" else "running"
                )
        return ReworkCycle(
            cycleId=UUID(row["cycle_id"]), projectId=UUID(row["project_id"]),
            taskId=UUID(row["task_id"]), sourceRunId=UUID(row["source_run_id"]),
            sourceSnapshotId=UUID(row["source_snapshot_id"]),
            triggerKind=row["trigger_kind"], triggerReportId=UUID(row["trigger_report_id"]),
            nextRunId=next_run, cycleNo=row["cycle_no"],
            totalAttempts=row["total_attempts"], state=state,
            reasonCode=row["reason_code"], createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )

    def list_for_task(self, project_id: UUID, task_id: UUID) -> list[ReworkCycle]:
        rows = self.storage.session().execute(
            "SELECT * FROM rework_cycles WHERE project_id=? AND task_id=? "
            "ORDER BY cycle_no DESC LIMIT 20", (str(project_id), str(task_id)),
        ).fetchall()
        return [self._view(row) for row in rows]

    def for_next_run(self, project_id: UUID, run_id: UUID) -> ReworkCycle | None:
        row = self.storage.session().execute(
            "SELECT * FROM rework_cycles WHERE project_id=? AND next_run_id=?",
            (str(project_id), str(run_id)),
        ).fetchone()
        return self._view(row) if row else None

    def recover_interrupted(self) -> int:
        with self.storage.transaction() as db:
            return db.execute(
                "UPDATE rework_cycles SET state='interrupted',reason_code='HOST_RESTARTED',"
                "updated_at=? WHERE state IN ('pending','launching')",
                (timestamp(),),
            ).rowcount

    def _attempt_count(self, project_id: UUID, task_id: UUID) -> int:
        db = self.storage.session()
        parameters = (str(project_id), str(task_id))
        development = db.execute(
            "SELECT count(*) n FROM run_attempts a JOIN runs r ON r.run_id=a.run_id "
            "WHERE r.project_id=? AND r.task_id=?", parameters,
        ).fetchone()
        reviews = db.execute(
            "SELECT count(*) n FROM review_jobs WHERE project_id=? AND task_id=?",
            parameters,
        ).fetchone()
        checks = db.execute(
            "SELECT count(*) n FROM verifier_jobs WHERE project_id=? AND task_id=?",
            parameters,
        ).fetchone()
        assert development and reviews and checks
        return int(development["n"] + reviews["n"] + checks["n"])

    async def reserve_review(self, report: ReviewReport) -> ReworkCycle:
        if report.status != "changes_requested" or report.reworkHandoff is None:
            raise ReworkError("REWORK_TRIGGER_INVALID")
        persisted = self.reviews.get(report.reviewId)
        if (persisted.status != report.status or persisted.projectId != report.projectId
                or persisted.snapshotId != report.snapshotId
                or persisted.reworkHandoff is None):
            raise ReworkError("REWORK_TRIGGER_INVALID")
        return await self._reserve(report.projectId, report.taskId, report.developmentRunId,
                                   report.snapshotId, "review", report.reviewId)

    async def reserve_verify(self, report: VerifyReport) -> ReworkCycle:
        if report.status != "failed":
            raise ReworkError("REWORK_TRIGGER_INVALID")
        persisted = self.verifier.report(report.projectId, report.verificationId)
        if persisted is None or persisted != report:
            raise ReworkError("REWORK_TRIGGER_INVALID")
        return await self._reserve(report.projectId, report.taskId, report.developmentRunId,
                                   report.snapshotId, "verify", report.reportId)

    def feedback(self, cycle: ReworkCycle) -> list[ContextItem]:
        config = self.configs.get(cycle.projectId, cycle.sourceRunId)
        if config is None:
            raise ReworkError("REWORK_SOURCE_STALE")
        attempt_limit = self._attempt_limit(config)
        authority: Literal["review_evidence", "verify_evidence"] = (
            "review_evidence" if cycle.triggerKind == "review" else "verify_evidence"
        )
        if cycle.triggerKind == "review":
            report = self.reviews.get(cycle.triggerReportId)
            if (report.snapshotId != cycle.sourceSnapshotId or
                    report.projectId != cycle.projectId or
                    report.status != "changes_requested" or
                    report.reworkHandoff is None):
                raise ReworkError("REWORK_TRIGGER_INVALID")
            handoff = report.reworkHandoff
            parts = [f"Rework cycle {cycle.cycleNo}/{MAX_REWORK_CYCLES}; "
                     f"total attempts {cycle.totalAttempts}/{attempt_limit}.",
                     handoff.summary]
            parts.extend(
                f"{issue.anchor.path}: {issue.reason}" for issue in handoff.issues[:3]
            )
            report_ref = f"review:{report.reviewId}"
        else:
            row = self.storage.session().execute(
                "SELECT verification_id FROM verifier_reports WHERE report_id=?",
                (str(cycle.triggerReportId),),
            ).fetchone()
            if row is None:
                raise ReworkError("REWORK_TRIGGER_INVALID")
            verify_report = self.verifier.report(cycle.projectId, UUID(row["verification_id"]))
            if (verify_report is None or verify_report.snapshotId != cycle.sourceSnapshotId
                    or verify_report.status != "failed"):
                raise ReworkError("REWORK_TRIGGER_INVALID")
            parts = [f"Rework cycle {cycle.cycleNo}/{MAX_REWORK_CYCLES}; "
                     f"total attempts {cycle.totalAttempts}/{attempt_limit}.",
                     f"{verify_report.kind} check failed with exit code "
                     f"{verify_report.exitCode}."]
            for artifact_id in (verify_report.stderrArtifactId, verify_report.stdoutArtifactId):
                if artifact_id is not None:
                    artifact = self.verifier.artifact(cycle.projectId, artifact_id)
                    parts.append(artifact.content[:900])
            report_ref = f"verify:{verify_report.reportId}"
        feedback = [ContextItem(
            kind="rework_feedback", authority=authority,
            sourceRef=report_ref, text="\n".join(parts)[:2000],
        )]
        diff = self.inspections.inspect(cycle.projectId, cycle.sourceRunId, 0, 1).diff
        if diff and diff.text.strip():
            feedback.append(ContextItem(
                kind="rework_feedback", authority=authority,
                sourceRef=f"snapshot:{cycle.sourceSnapshotId}",
                text=f"Current snapshot diff:\n{diff.text[:1800]}",
            ))
        return feedback

    async def _reserve(
        self, project_id: UUID, task_id: UUID, run_id: UUID, snapshot_id: UUID,
        kind: Literal["review", "verify"], report_id: UUID,
    ) -> ReworkCycle:
        async with self.lock:
            project = self.projects.get(str(project_id))
            active = self.projects.active()
            if (project is None or project.archivedAt or not project.trusted
                    or project.trustVersion != TRUST_VERSION or active is None
                    or active.projectId != project_id):
                raise ReworkError("PROJECT_TRUST_REQUIRED")
            existing = self.storage.session().execute(
                "SELECT * FROM rework_cycles WHERE source_snapshot_id=?",
                (str(snapshot_id),),
            ).fetchone()
            if existing:
                cycle = self._view(existing)
                if (cycle.projectId != project_id or cycle.taskId != task_id
                        or cycle.sourceRunId != run_id or cycle.triggerKind != kind
                        or cycle.triggerReportId != report_id):
                    raise ReworkError("REWORK_CONFLICT")
                return cycle
            source = self.runs.get(project_id, run_id)
            handoff = self.handoffs.get(project_id, run_id)
            config = self.configs.get(project_id, run_id)
            newest = self.storage.session().execute(
                "SELECT s.snapshot_id FROM code_snapshots s JOIN runs r ON r.run_id=s.run_id "
                "WHERE r.project_id=? AND r.task_id=? ORDER BY s.rowid DESC LIMIT 1",
                (str(project_id), str(task_id)),
            ).fetchone()
            if (source is None or source.state != "succeeded" or source.taskId != task_id
                    or handoff is None or handoff.snapshot.snapshotId != snapshot_id
                    or config is None or config.taskId != task_id
                    or newest is None or newest["snapshot_id"] != str(snapshot_id)):
                raise ReworkError("REWORK_SOURCE_STALE")
            prior = self.storage.session().execute(
                "SELECT count(*) n FROM rework_cycles WHERE project_id=? AND task_id=?",
                (str(project_id), str(task_id)),
            ).fetchone()
            assert prior is not None
            cycle_no = prior["n"] + 1
            total = self._attempt_count(project_id, task_id)
            blocked = cycle_no > MAX_REWORK_CYCLES or total >= self._attempt_limit(config)
            now = timestamp()
            cycle_id = uuid4()
            with self.storage.transaction() as db:
                db.execute(
                    "INSERT INTO rework_cycles(cycle_id,project_id,task_id,source_run_id,"
                    "source_snapshot_id,trigger_kind,trigger_report_id,next_run_id,cycle_no,"
                    "total_attempts,state,reason_code,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (str(cycle_id), str(project_id), str(task_id), str(run_id),
                     str(snapshot_id), kind, str(report_id),
                     None if blocked else str(uuid4()), cycle_no, total,
                     "blocked" if blocked else "pending",
                     "REWORK_LIMIT_REACHED" if blocked else None, now, now),
                )
            row = self.storage.session().execute(
                "SELECT * FROM rework_cycles WHERE cycle_id=?", (str(cycle_id),),
            ).fetchone()
            assert row is not None
            return self._view(row)

    def mark_launching(self, cycle: ReworkCycle) -> None:
        with self.storage.transaction() as db:
            changed = db.execute(
                "UPDATE rework_cycles SET state='launching',updated_at=? "
                "WHERE cycle_id=? AND state='pending'",
                (timestamp(), str(cycle.cycleId)),
            ).rowcount
            if changed != 1:
                raise ReworkError("REWORK_CONFLICT")

    def mark_running(self, cycle: ReworkCycle) -> None:
        with self.storage.transaction() as db:
            db.execute(
                "UPDATE rework_cycles SET state='running',updated_at=? "
                "WHERE cycle_id=? AND state='launching'",
                (timestamp(), str(cycle.cycleId)),
            )

    def mark_interrupted(self, cycle: ReworkCycle, code: str) -> None:
        with self.storage.transaction() as db:
            db.execute(
                "UPDATE rework_cycles SET state='interrupted',reason_code=?,updated_at=? "
                "WHERE cycle_id=? AND state IN ('pending','launching')",
                (code, timestamp(), str(cycle.cycleId)),
            )

    def mark_gate_blocked(self, cycle: ReworkCycle, code: str) -> None:
        with self.storage.transaction() as db:
            db.execute(
                "UPDATE rework_cycles SET state='blocked',reason_code=?,updated_at=? "
                "WHERE cycle_id=? AND state='running'",
                (code, timestamp(), str(cycle.cycleId)),
            )
