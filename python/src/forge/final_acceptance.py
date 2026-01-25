"""Fresh, snapshot-bound final human decision owned by the Python Host."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.acceptance_matrix import AcceptanceMatrixService
from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.review import ReviewFinding
from forge.rework import MAX_TOTAL_ATTEMPTS
from forge.run_inspection import redact


class FinalAcceptanceError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class FinalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    decisionId: UUID
    projectId: UUID
    taskId: UUID
    snapshotId: UUID
    contractRevision: int = Field(ge=1)
    basisHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    decision: Literal["accept", "return"]
    nextRunId: UUID | None
    reason: str
    actor: Literal["local-owner"]
    createdAt: str


class AdvisoryIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    issueId: UUID
    reviewId: UUID
    snapshotId: UUID
    revision: int = Field(ge=1)
    severity: Literal["advisory", "blocking"]
    status: Literal["open", "stale", "resolved", "waived"]
    reason: str = Field(min_length=1, max_length=4000)


class FinalAcceptanceView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    snapshotId: UUID | None
    contractRevision: int = Field(ge=1)
    basisHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    readAt: str
    reviewReportId: UUID | None
    advisoryIssues: list[AdvisoryIssue]
    verifyReportIds: list[UUID]
    criterionDecisionIds: list[UUID]
    blockers: list[str]
    status: Literal["unavailable", "ready", "accepted", "returned"]
    decision: FinalDecision | None


class FinalAcceptanceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    expectedSnapshotId: UUID
    expectedContractRevision: int = Field(ge=1)
    expectedBasisHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    decision: Literal["accept", "return"]
    reason: str = Field(min_length=12, max_length=2000)
    idempotencyKey: UUID


class AdvisoryWaiverInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    issueId: UUID
    expectedSnapshotId: UUID
    expectedReviewId: UUID
    expectedIssueRevision: int = Field(ge=1)
    nonSecurityConfirmed: Literal[True]
    reason: str = Field(min_length=12, max_length=2000)
    idempotencyKey: UUID


def _decision(row: sqlite3.Row) -> FinalDecision:
    return FinalDecision(
        decisionId=UUID(row["decision_id"]), projectId=UUID(row["project_id"]),
        taskId=UUID(row["task_id"]), snapshotId=UUID(row["snapshot_id"]),
        contractRevision=row["contract_revision"], basisHash=row["basis_hash"],
        decision=row["decision"], reason=row["reason"], actor=row["actor"],
        nextRunId=UUID(row["next_run_id"]) if row["next_run_id"] else None,
        createdAt=row["created_at"],
    )


class FinalAcceptanceService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService,
                 matrix: AcceptanceMatrixService) -> None:
        self.storage = storage
        self.projects = projects
        self.matrix = matrix

    def _trusted(self, project_id: UUID) -> None:
        project = self.projects.get(str(project_id))
        active = self.projects.active()
        if (project is None or project.archivedAt or not project.trusted
                or project.trustVersion != TRUST_VERSION or active is None
                or active.projectId != project_id):
            raise FinalAcceptanceError("PROJECT_TRUST_REQUIRED")

    def get(self, project_id: UUID, task_id: UUID) -> FinalAcceptanceView:
        self._trusted(project_id)
        matrix = self.matrix.get(project_id, task_id)
        db = self.storage.session()
        task = db.execute(
            "SELECT r.content_hash FROM tasks t JOIN task_revisions r ON "
            "r.task_id=t.task_id AND r.revision=t.current_revision "
            "WHERE t.project_id=? AND t.task_id=?",
            (str(project_id), str(task_id)),
        ).fetchone()
        assert task is not None
        snapshot = db.execute(
            "SELECT content_hash FROM code_snapshots WHERE snapshot_id=?",
            (str(matrix.snapshotId),),
        ).fetchone() if matrix.snapshotId else None
        review = db.execute(
            "SELECT review_id,content_hash,outcome FROM review_reports "
            "WHERE project_id=? AND task_id=? AND snapshot_id=? ORDER BY rowid DESC LIMIT 1",
            (str(project_id), str(task_id), str(matrix.snapshotId)),
        ).fetchone() if matrix.snapshotId else None
        issues: list[AdvisoryIssue] = []
        if review is not None and matrix.snapshotId is not None:
            rows = db.execute(
                "SELECT t.issue_id,t.severity,t.status,t.revision,o.finding_json "
                "FROM review_issue_occurrences o JOIN review_issue_threads t "
                "ON t.issue_id=o.issue_id WHERE o.review_id=? ORDER BY o.rowid",
                (review["review_id"],),
            ).fetchall()
            for row in rows:
                finding = ReviewFinding.model_validate_json(row["finding_json"])
                issues.append(AdvisoryIssue(
                    issueId=UUID(row["issue_id"]), reviewId=UUID(review["review_id"]),
                    snapshotId=matrix.snapshotId, revision=row["revision"],
                    severity=row["severity"], status=row["status"],
                    reason=finding.reason,
                ))
        checks = db.execute(
            "SELECT r.report_id,r.content_hash,r.status FROM verifier_reports r "
            "JOIN verifier_jobs j ON j.verification_id=r.verification_id "
            "WHERE j.project_id=? AND j.task_id=? AND j.snapshot_id=? ORDER BY r.rowid",
            (str(project_id), str(task_id), str(matrix.snapshotId)),
        ).fetchall() if matrix.snapshotId else []
        latest_run = db.execute(
            "SELECT run_id,state FROM runs WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        pending_review = db.execute(
            "SELECT 1 FROM review_jobs WHERE project_id=? AND task_id=? "
            "AND snapshot_id=? AND state='running' LIMIT 1",
            (str(project_id), str(task_id), str(matrix.snapshotId)),
        ).fetchone() if matrix.snapshotId else None
        pending_verify = db.execute(
            "SELECT 1 FROM verifier_jobs WHERE project_id=? AND task_id=? "
            "AND snapshot_id=? AND state='running' LIMIT 1",
            (str(project_id), str(task_id), str(matrix.snapshotId)),
        ).fetchone() if matrix.snapshotId else None
        latest_cycle = db.execute(
            "SELECT state,next_run_id FROM rework_cycles WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        prior = db.execute(
            "SELECT * FROM final_acceptance_decisions WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        current_decision = (_decision(prior) if prior and matrix.snapshotId
                            and prior["snapshot_id"] == str(matrix.snapshotId)
                            and prior["contract_revision"] == matrix.contractRevision
                            else None)
        basis = {
            "projectId": str(project_id), "taskId": str(task_id),
            "contractRevision": matrix.contractRevision,
            "contractHash": task["content_hash"], "snapshotId": str(matrix.snapshotId),
            "snapshotHash": snapshot["content_hash"] if snapshot else None,
            "latestRun": dict(latest_run) if latest_run else None,
            "review": dict(review) if review else None,
            "issues": [item.model_dump(mode="json") for item in issues],
            "checks": [dict(item) for item in checks],
            "criteria": [{"id": item.criterion.id, "status": item.status,
                          "decisionId": str(item.decisionId)} for item in matrix.criteria],
        }
        basis_hash = hashlib.sha256(json.dumps(
            basis, sort_keys=True, separators=(",", ":")
        ).encode()).hexdigest()
        # A later report, issue decision or AC decision invalidates the old
        # human signature even when the CodeSnapshot itself is unchanged.
        if (current_decision is not None and current_decision.decision == "accept"
                and current_decision.basisHash != basis_hash):
            current_decision = None
        blockers: list[str] = []
        if matrix.snapshotId is None or snapshot is None:
            blockers.append("CODE_SNAPSHOT_MISSING")
        if (latest_run is None or latest_run["state"] != "succeeded"
                or latest_run["run_id"] != str(matrix.developmentRunId)):
            blockers.append("DEVELOPMENT_NOT_CURRENT")
        if review is None or review["outcome"] != "approved":
            blockers.append("REVIEW_NOT_APPROVED")
        if any(item.status == "open" for item in issues):
            blockers.append("REVIEW_ISSUES_UNRESOLVED")
        if matrix.evaluation != "covered":
            blockers.append("ACCEPTANCE_NOT_COVERED")
        if any(item["status"] in ("failed", "timeout", "error") for item in checks):
            blockers.append("VERIFICATION_FAILED")
        if pending_review or pending_verify:
            blockers.append("REPORT_STILL_RUNNING")
        if latest_cycle:
            rework_unresolved = latest_cycle["state"] in (
                "pending", "launching", "blocked", "interrupted",
            )
            if latest_cycle["state"] == "running":
                rework_run = db.execute(
                    "SELECT state FROM runs WHERE run_id=?",
                    (latest_cycle["next_run_id"],),
                ).fetchone()
                rework_unresolved = rework_run is None or rework_run["state"] != "succeeded"
            if rework_unresolved:
                blockers.append("REWORK_UNRESOLVED")
        if current_decision and current_decision.decision == "return":
            next_run = db.execute(
                "SELECT state FROM runs WHERE run_id=? AND project_id=? AND task_id=?",
                (str(current_decision.nextRunId), str(project_id), str(task_id)),
            ).fetchone() if current_decision.nextRunId else None
            if next_run is None:
                blockers.append("RETURN_ATTEMPT_NOT_STARTED")
            elif next_run["state"] in ("failed", "cancelled", "interrupted"):
                blockers.append("RETURN_ATTEMPT_NOT_DELIVERED")
        status: Literal["unavailable", "ready", "accepted", "returned"] = (
            "accepted" if current_decision and current_decision.decision == "accept" else
            "returned" if current_decision else
            "unavailable" if blockers else "ready"
        )
        return FinalAcceptanceView(
            projectId=project_id, taskId=task_id, snapshotId=matrix.snapshotId,
            contractRevision=matrix.contractRevision, basisHash=basis_hash,
            readAt=timestamp(), reviewReportId=UUID(review["review_id"]) if review else None,
            advisoryIssues=issues,
            verifyReportIds=[UUID(item["report_id"]) for item in checks],
            criterionDecisionIds=[item.decisionId for item in matrix.criteria
                                  if item.decisionId],
            blockers=blockers, status=status, decision=current_decision,
        )

    def decide(self, value: FinalAcceptanceInput) -> FinalAcceptanceView:
        if len(value.reason.strip()) < 12:
            raise FinalAcceptanceError("ACCEPTANCE_REASON_REQUIRED")
        if redact(value.reason) != value.reason:
            raise FinalAcceptanceError("ACCEPTANCE_REASON_SENSITIVE")
        with self.storage.transaction() as db:
            view = self.get(value.projectId, value.taskId)
            if (view.snapshotId != value.expectedSnapshotId
                    or view.contractRevision != value.expectedContractRevision
                    or view.basisHash != value.expectedBasisHash):
                raise FinalAcceptanceError("ACCEPTANCE_SOURCE_STALE")
            prior = db.execute(
                "SELECT * FROM final_acceptance_decisions WHERE idempotency_key=?",
                (str(value.idempotencyKey),),
            ).fetchone()
            if prior is not None:
                if (prior["project_id"] != str(value.projectId)
                        or prior["task_id"] != str(value.taskId)
                        or prior["snapshot_id"] != str(value.expectedSnapshotId)
                        or prior["contract_revision"] != value.expectedContractRevision
                        or prior["basis_hash"] != value.expectedBasisHash
                        or prior["decision"] != value.decision
                        or prior["reason"] != value.reason):
                    raise FinalAcceptanceError("ACCEPTANCE_CONFLICT")
                return view
            if view.decision is not None:
                raise FinalAcceptanceError("ACCEPTANCE_CONFLICT")
            if value.decision == "accept" and view.status != "ready":
                raise FinalAcceptanceError("ACCEPTANCE_GATE_BLOCKED")
            if value.decision == "return" and view.snapshotId is None:
                raise FinalAcceptanceError("CODE_SNAPSHOT_MISSING")
            if value.decision == "return":
                if any(item in view.blockers for item in (
                    "CODE_SNAPSHOT_MISSING", "DEVELOPMENT_NOT_CURRENT",
                    "REPORT_STILL_RUNNING", "REWORK_UNRESOLVED",
                )):
                    raise FinalAcceptanceError("ACCEPTANCE_GATE_BLOCKED")
                parameters = (str(value.projectId), str(value.taskId))
                development = db.execute(
                    "SELECT count(*) n FROM run_attempts a JOIN runs r "
                    "ON r.run_id=a.run_id WHERE r.project_id=? AND r.task_id=?",
                    parameters,
                ).fetchone()
                reviews = db.execute(
                    "SELECT count(*) n FROM review_jobs WHERE project_id=? AND task_id=?",
                    parameters,
                ).fetchone()
                checks = db.execute(
                    "SELECT count(*) n FROM verifier_jobs WHERE project_id=? AND task_id=?",
                    parameters,
                ).fetchone()
                assert development is not None and reviews is not None and checks is not None
                if sum((development["n"], reviews["n"], checks["n"])) >= MAX_TOTAL_ATTEMPTS:
                    raise FinalAcceptanceError("REWORK_LIMIT_REACHED")
            db.execute(
                "INSERT INTO final_acceptance_decisions(decision_id,idempotency_key,"
                "project_id,task_id,snapshot_id,contract_revision,basis_hash,decision,"
                "next_run_id,reason,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (str(uuid4()), str(value.idempotencyKey), str(value.projectId),
                 str(value.taskId), str(value.expectedSnapshotId),
                 value.expectedContractRevision, value.expectedBasisHash,
                 value.decision, str(uuid4()) if value.decision == "return" else None,
                 value.reason, "local-owner", timestamp()),
            )
        return self.get(value.projectId, value.taskId)

    def waive_advisory(self, value: AdvisoryWaiverInput) -> FinalAcceptanceView:
        if len(value.reason.strip()) < 12:
            raise FinalAcceptanceError("ACCEPTANCE_REASON_REQUIRED")
        if redact(value.reason) != value.reason:
            raise FinalAcceptanceError("ACCEPTANCE_REASON_SENSITIVE")
        with self.storage.transaction() as db:
            view = self.get(value.projectId, value.taskId)
            if (view.snapshotId != value.expectedSnapshotId
                    or view.reviewReportId != value.expectedReviewId):
                raise FinalAcceptanceError("ACCEPTANCE_SOURCE_STALE")
            prior = db.execute(
                "SELECT * FROM review_advisory_waivers WHERE idempotency_key=?",
                (str(value.idempotencyKey),),
            ).fetchone()
            if prior is not None:
                if (prior["project_id"] != str(value.projectId)
                        or prior["task_id"] != str(value.taskId)
                        or prior["issue_id"] != str(value.issueId)
                        or prior["review_id"] != str(value.expectedReviewId)
                        or prior["snapshot_id"] != str(value.expectedSnapshotId)
                        or prior["issue_revision"] != value.expectedIssueRevision
                        or prior["reason"] != value.reason):
                    raise FinalAcceptanceError("ACCEPTANCE_CONFLICT")
                return view
            issue = next((item for item in view.advisoryIssues
                          if item.issueId == value.issueId), None)
            if (issue is None or issue.severity != "advisory" or issue.status != "open"
                    or issue.revision != value.expectedIssueRevision
                    or "REVIEW_NOT_APPROVED" in view.blockers):
                raise FinalAcceptanceError("ACCEPTANCE_ISSUE_NOT_WAIVABLE")
            changed = db.execute(
                "UPDATE review_issue_threads SET status='waived',revision=revision+1 "
                "WHERE issue_id=? AND task_id=? AND revision=? AND status='open' "
                "AND severity='advisory'",
                (str(value.issueId), str(value.taskId), value.expectedIssueRevision),
            ).rowcount
            if changed != 1:
                raise FinalAcceptanceError("ACCEPTANCE_SOURCE_STALE")
            db.execute(
                "INSERT INTO review_advisory_waivers(waiver_id,idempotency_key,project_id,"
                "task_id,issue_id,review_id,snapshot_id,issue_revision,reason,actor,"
                "created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (str(uuid4()), str(value.idempotencyKey), str(value.projectId),
                 str(value.taskId), str(value.issueId), str(value.expectedReviewId),
                 str(value.expectedSnapshotId), value.expectedIssueRevision,
                 value.reason, "local-owner", timestamp()),
            )
        return self.get(value.projectId, value.taskId)
