"""Snapshot-bound acceptance coverage; this service never advances Task state."""

from __future__ import annotations

import sqlite3
from typing import Literal, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.drafts import AcceptanceCriterion, TaskContract
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.run_config import RunConfigService
from forge.run_inspection import redact
from forge.verifier_project import ProjectCommandVerifier, VerifyReport


class AcceptanceMatrixError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AcceptanceDecisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    expectedSnapshotId: UUID
    expectedContractRevision: int = Field(ge=1)
    criterionId: str = Field(min_length=1, max_length=128)
    status: Literal["verified", "failed", "risk_accepted", "not_applicable"]
    reportId: UUID | None
    reason: str = Field(min_length=12, max_length=2000)
    idempotencyKey: UUID


CriterionStatus = Literal["verified", "failed", "manual", "unverified",
                          "risk_accepted", "not_applicable"]


class CriterionState(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    criterion: AcceptanceCriterion
    status: CriterionStatus
    reason: str
    reportId: UUID | None
    decisionId: UUID | None


class AcceptanceMatrix(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    contractRevision: int
    snapshotId: UUID | None
    developmentRunId: UUID | None
    reviewStatus: Literal["approved", "changes_requested", "inconclusive"] | None
    checkReports: list[VerifyReport]
    criteria: list[CriterionState]
    evaluation: Literal["inconclusive", "failed", "covered"]
    requiredCovered: bool
    missingRequiredIds: list[str]
    finalAcceptanceRequired: Literal[True]


class AcceptanceMatrixService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService,
                 configs: RunConfigService,
                 verifier: ProjectCommandVerifier) -> None:
        self.storage = storage
        self.projects = projects
        self.configs = configs
        self.verifier = verifier

    def _source(
        self, project_id: UUID, task_id: UUID
    ) -> tuple[TaskContract, UUID | None, UUID | None]:
        db = self.storage.session()
        row = db.execute(
            "SELECT r.contract_json FROM tasks t JOIN task_revisions r ON "
            "r.task_id=t.task_id AND r.revision=t.current_revision "
            "WHERE t.project_id=? AND t.task_id=?",
            (str(project_id), str(task_id)),
        ).fetchone()
        if row is None:
            raise AcceptanceMatrixError("TASK_NOT_FOUND")
        contract = TaskContract.model_validate_json(row["contract_json"])
        if contract.projectId != str(project_id) or contract.taskId != str(task_id):
            raise AcceptanceMatrixError("TASK_REVISION_INVALID")
        newest = db.execute(
            "SELECT s.snapshot_id,s.run_id FROM code_snapshots s JOIN runs r "
            "ON r.run_id=s.run_id WHERE r.project_id=? AND r.task_id=? "
            "ORDER BY s.rowid DESC LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        if newest is None:
            return contract, None, None
        run_id = UUID(newest["run_id"])
        config = self.configs.get(project_id, run_id)
        if config is None or config.taskId != task_id or config.taskRevision != contract.revision:
            return contract, None, None
        return contract, UUID(newest["snapshot_id"]), run_id

    def get(self, project_id: UUID, task_id: UUID) -> AcceptanceMatrix:
        contract, snapshot_id, run_id = self._source(project_id, task_id)
        reports: list[VerifyReport] = []
        decisions: dict[str, sqlite3.Row] = {}
        review_status = None
        if snapshot_id is not None:
            for job in self.verifier.list_for_task(project_id, task_id):
                if job.snapshotId == snapshot_id and job.reportId is not None:
                    report = self.verifier.report(project_id, job.verificationId)
                    if report is not None:
                        reports.append(report)
            rows = self.storage.session().execute(
                "SELECT * FROM acceptance_decisions WHERE project_id=? AND task_id=? "
                "AND snapshot_id=? AND contract_revision=? ORDER BY rowid DESC",
                (str(project_id), str(task_id), str(snapshot_id), contract.revision),
            ).fetchall()
            for row in rows:
                decisions.setdefault(row["criterion_id"], row)
            review = self.storage.session().execute(
                "SELECT outcome FROM review_reports WHERE project_id=? AND task_id=? "
                "AND snapshot_id=? ORDER BY rowid DESC LIMIT 1",
                (str(project_id), str(task_id), str(snapshot_id)),
            ).fetchone()
            review_status = review["outcome"] if review else None
        states = []
        missing = []
        for criterion in contract.acceptance:
            decision = decisions.get(criterion.id)
            status = cast(CriterionStatus, decision["status"] if decision else (
                "unverified" if criterion.method == "automated" else "manual"
            ))
            reason = decision["reason"] if decision else (
                "No current snapshot or criterion-bound verification evidence."
                if criterion.method == "automated" else
                "Human inspection is required for this criterion."
            )
            states.append(CriterionState(
                criterion=criterion, status=status, reason=reason,
                reportId=(UUID(decision["report_id"])
                          if decision and decision["report_id"] else None),
                decisionId=UUID(decision["decision_id"]) if decision else None,
            ))
            if criterion.required and status not in ("verified", "risk_accepted", "not_applicable"):
                missing.append(criterion.id)
        return AcceptanceMatrix(
            projectId=project_id, taskId=task_id, contractRevision=contract.revision,
            snapshotId=snapshot_id, developmentRunId=run_id,
            reviewStatus=review_status, checkReports=reports[:50], criteria=states,
            evaluation=("inconclusive" if snapshot_id is None else
                        "failed" if any(item.criterion.required and item.status == "failed"
                                        for item in states) else
                        "inconclusive" if missing else "covered"),
            requiredCovered=snapshot_id is not None and not missing,
            missingRequiredIds=missing, finalAcceptanceRequired=True,
        )

    def decide(self, value: AcceptanceDecisionInput) -> AcceptanceMatrix:
        db = self.storage.session()
        project = self.projects.get(str(value.projectId))
        active = self.projects.active()
        if (project is None or project.archivedAt or not project.trusted
                or project.trustVersion != TRUST_VERSION or active is None
                or active.projectId != value.projectId):
            raise AcceptanceMatrixError("PROJECT_TRUST_REQUIRED")
        prior = db.execute("SELECT * FROM acceptance_decisions WHERE idempotency_key=?",
                           (str(value.idempotencyKey),)).fetchone()
        if prior is not None:
            if any((prior[column] != expected for column, expected in (
                ("project_id", str(value.projectId)), ("task_id", str(value.taskId)),
                ("snapshot_id", str(value.expectedSnapshotId)),
                ("contract_revision", value.expectedContractRevision),
                ("criterion_id", value.criterionId), ("status", value.status),
                ("report_id", str(value.reportId) if value.reportId else None),
                ("reason", value.reason),
            ))):
                raise AcceptanceMatrixError("ACCEPTANCE_CONFLICT")
            current = self.get(value.projectId, value.taskId)
            if (current.snapshotId != value.expectedSnapshotId
                    or current.contractRevision != value.expectedContractRevision):
                raise AcceptanceMatrixError("ACCEPTANCE_SOURCE_STALE")
            return current
        matrix = self.get(value.projectId, value.taskId)
        if (matrix.snapshotId != value.expectedSnapshotId
                or matrix.contractRevision != value.expectedContractRevision):
            raise AcceptanceMatrixError("ACCEPTANCE_SOURCE_STALE")
        criterion = next((item.criterion for item in matrix.criteria
                          if item.criterion.id == value.criterionId), None)
        if criterion is None:
            raise AcceptanceMatrixError("ACCEPTANCE_CRITERION_UNKNOWN")
        if len(value.reason.strip()) < 12:
            raise AcceptanceMatrixError("ACCEPTANCE_REASON_REQUIRED")
        if redact(value.reason) != value.reason:
            raise AcceptanceMatrixError("ACCEPTANCE_REASON_SENSITIVE")
        report = next((item for item in matrix.checkReports
                       if item.reportId == value.reportId), None)
        if value.reportId is not None and report is None:
            raise AcceptanceMatrixError("ACCEPTANCE_REPORT_INVALID")
        if value.status == "verified":
            if criterion.method == "automated":
                if report is None or report.status != "passed" or report.exitCode != 0:
                    raise AcceptanceMatrixError("ACCEPTANCE_EVIDENCE_REQUIRED")
            elif value.reportId is not None:
                raise AcceptanceMatrixError("ACCEPTANCE_REPORT_INVALID")
        if value.status == "failed" and criterion.method == "automated":
            if report is None or report.status == "passed":
                raise AcceptanceMatrixError("ACCEPTANCE_EVIDENCE_REQUIRED")
        with self.storage.transaction() as transaction:
            transaction.execute(
                "INSERT INTO acceptance_decisions(decision_id,idempotency_key,project_id,"
                "task_id,snapshot_id,contract_revision,criterion_id,status,report_id,reason,"
                "created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (str(uuid4()), str(value.idempotencyKey), str(value.projectId),
                 str(value.taskId), str(value.expectedSnapshotId),
                 value.expectedContractRevision, value.criterionId, value.status,
                 str(value.reportId) if value.reportId else None, value.reason, timestamp()),
            )
        return self.get(value.projectId, value.taskId)
