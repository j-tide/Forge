"""Host-owned Review report, issue history and compact rework handoff."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.executor_contracts import RunCompleted
from forge.handoffs import HandoffService
from forge.persistence import ForgePersistence
from forge.review import (
    ReviewContext,
    ReviewFinding,
    ReviewResult,
    build_review_context,
    evaluate_review_result,
    load_reviewer_profile,
)
from forge.review_copies import ReviewCopyManager
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService, redact


class ReviewIssueError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReviewIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    issueId: UUID
    projectId: UUID
    taskId: UUID
    severity: Literal["blocking", "advisory"]
    status: Literal["open", "stale", "resolved", "waived"]
    revision: int = Field(ge=1)
    firstSeenAt: str
    lastSeenAt: str


class IssueOccurrence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    occurrenceId: UUID
    issueId: UUID
    reviewId: UUID
    reviewAttemptId: UUID
    snapshotId: UUID
    finding: ReviewFinding
    createdAt: str


class ReworkHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    handoffId: UUID
    reviewId: UUID
    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    sourceSnapshotId: UUID
    contractRevision: int = Field(ge=1)
    issueIds: list[UUID] = Field(min_length=1, max_length=100)
    issues: list[ReviewFinding] = Field(min_length=1, max_length=100)
    summary: str = Field(min_length=1, max_length=4000)
    createdAt: str


class ReviewReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reviewId: UUID
    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    snapshotId: UUID
    reviewCopyId: UUID
    reviewAttemptId: UUID
    status: Literal["approved", "changes_requested", "inconclusive"]
    result: ReviewResult | None
    issues: list[ReviewIssue]
    reworkHandoff: ReworkHandoff | None
    createdAt: str


def _fingerprint(task_id: UUID, finding: ReviewFinding) -> str:
    # Exclude line numbers: an edit can move the same problem in the next snapshot.
    # Keep reason and basis so unrelated problems in one file do not collapse.
    body = [str(task_id), finding.anchor.path.casefold(), finding.basis.kind,
            finding.basis.sourceRef.casefold(),
            re.sub(r"\s+", " ", finding.reason).strip().casefold()]
    return hashlib.sha256(json.dumps(body, ensure_ascii=False).encode()).hexdigest()


def _safe_result(result: ReviewResult) -> ReviewResult:
    raw = result.model_dump(mode="json")

    def check(value: object) -> None:
        if isinstance(value, str) and redact(value) != value:
            raise ReviewIssueError("REVIEW_RESULT_SENSITIVE")
        if isinstance(value, dict):
            for item in value.values():
                check(item)
        if isinstance(value, list):
            for item in value:
                check(item)

    check(raw)
    return result


class ReviewIssueService:
    """Accepts only a completed owned Reviewer run; no Renderer write command."""

    def __init__(
        self, storage: ForgePersistence, handoffs: HandoffService,
        configs: RunConfigService, inspections: RunInspectionService,
        copies: ReviewCopyManager,
    ) -> None:
        self.storage = storage
        self.handoffs = handoffs
        self.configs = configs
        self.inspections = inspections
        self.copies = copies

    def _context(self, project_id: UUID, run_id: UUID) -> ReviewContext:
        handoff = self.handoffs.get(project_id, run_id)
        config = self.configs.get(project_id, run_id)
        if handoff is None or config is None:
            raise ReviewIssueError("REVIEW_SOURCE_MISSING")
        inspection = self.inspections.inspect(project_id, run_id)
        return build_review_context(handoff, config, inspection.diff)

    async def record(
        self, project_id: UUID, development_run_id: UUID,
        review_copy_id: UUID, review_attempt_id: UUID, completed: RunCompleted,
    ) -> ReviewReport:
        copy = await self.copies.verify(review_copy_id)
        if (copy.projectId != project_id or copy.developmentRunId != development_run_id
                or completed.runId != str(copy.ownerReviewRunId)):
            raise ReviewIssueError("REVIEW_SOURCE_STALE")
        context = self._context(project_id, development_run_id)
        if copy.snapshotId != context.snapshotId:
            raise ReviewIssueError("REVIEW_SOURCE_STALE")
        profile, _ = load_reviewer_profile()
        evaluation = evaluate_review_result(completed.structuredOutput, context, profile)
        if evaluation.status == "stale":
            raise ReviewIssueError("REVIEW_RESULT_STALE")
        result = _safe_result(evaluation.result) if evaluation.result else None
        now = timestamp()
        review_id = uuid4()
        with self.storage.transaction() as db:
            latest = db.execute(
                "SELECT s.snapshot_id FROM code_snapshots s JOIN runs r ON r.run_id=s.run_id "
                "WHERE r.project_id=? AND r.task_id=? ORDER BY s.rowid DESC LIMIT 1",
                (str(project_id), str(context.taskId)),
            ).fetchone()
            if latest is None or latest["snapshot_id"] != str(context.snapshotId):
                raise ReviewIssueError("REVIEW_RESULT_STALE")
            prior = db.execute(
                "SELECT review_id,content_hash,project_id,development_run_id,"
                "snapshot_id,review_copy_id FROM review_reports WHERE review_attempt_id=?",
                (str(review_attempt_id),),
            ).fetchone()
            result_json = result.model_dump_json() if result else "null"
            digest = hashlib.sha256(result_json.encode()).hexdigest()
            if prior is not None:
                if (prior["content_hash"] != digest or prior["project_id"] != str(project_id)
                        or prior["development_run_id"] != str(development_run_id)
                        or prior["snapshot_id"] != str(context.snapshotId)
                        or prior["review_copy_id"] != str(review_copy_id)):
                    raise ReviewIssueError("REVIEW_ATTEMPT_CONFLICT")
                return self.get(UUID(prior["review_id"]))
            db.execute(
                "INSERT INTO review_reports(review_id,project_id,task_id,development_run_id,"
                "snapshot_id,review_copy_id,review_attempt_id,contract_revision,"
                "profile_revision,outcome,result_json,content_hash,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (str(review_id), str(project_id), str(context.taskId),
                 str(development_run_id), str(context.snapshotId), str(review_copy_id),
                 str(review_attempt_id), context.contractRevision, profile.revision,
                 evaluation.status, result_json, digest, now),
            )
            issue_ids: list[UUID] = []
            blockers: list[ReviewFinding] = []
            seen_fingerprints: set[str] = set()
            if result is not None:
                findings = [*(('blocking', item) for item in result.blockingIssues),
                            *(('advisory', item) for item in result.suggestions)]
                for severity, finding in findings:
                    fingerprint = _fingerprint(context.taskId, finding)
                    if fingerprint in seen_fingerprints:
                        continue
                    seen_fingerprints.add(fingerprint)
                    existing = db.execute(
                        "SELECT issue_id,revision FROM review_issue_threads "
                        "WHERE task_id=? AND fingerprint=?",
                        (str(context.taskId), fingerprint),
                    ).fetchone()
                    if existing is None:
                        issue_id = uuid4()
                        db.execute(
                            "INSERT INTO review_issue_threads(issue_id,project_id,task_id,"
                            "fingerprint,severity,status,revision,first_seen_at,last_seen_at) "
                            "VALUES(?,?,?,?,?,'open',1,?,?)",
                            (str(issue_id), str(project_id), str(context.taskId),
                             fingerprint, severity, now, now),
                        )
                    else:
                        issue_id = UUID(existing["issue_id"])
                        db.execute(
                            "UPDATE review_issue_threads SET revision=revision+1,"
                            "severity=?,status='open',last_seen_at=? WHERE issue_id=?",
                            (severity, now, str(issue_id)),
                        )
                    occurrence = db.execute(
                        "SELECT 1 FROM review_issue_occurrences WHERE issue_id=? AND review_id=?",
                        (str(issue_id), str(review_id)),
                    ).fetchone()
                    if occurrence is None:
                        db.execute(
                            "INSERT INTO review_issue_occurrences(occurrence_id,issue_id,"
                            "review_id,review_attempt_id,snapshot_id,finding_json,created_at) "
                            "VALUES(?,?,?,?,?,?,?)",
                            (str(uuid4()), str(issue_id), str(review_id),
                             str(review_attempt_id), str(context.snapshotId),
                             finding.model_dump_json(), now),
                        )
                    if severity == "blocking" and issue_id not in issue_ids:
                        issue_ids.append(issue_id)
                        blockers.append(finding)
            if evaluation.status in ("approved", "changes_requested"):
                db.execute(
                    "UPDATE review_issue_threads SET status='stale',revision=revision+1 "
                    "WHERE task_id=? AND status='open' AND issue_id NOT IN "
                    "(SELECT issue_id FROM review_issue_occurrences WHERE review_id=?)",
                    (str(context.taskId), str(review_id)),
                )
            if evaluation.status == "changes_requested":
                handoff = ReworkHandoff(
                    schemaVersion="1.0", handoffId=uuid4(), reviewId=review_id,
                    projectId=project_id, taskId=context.taskId,
                    developmentRunId=development_run_id,
                    sourceSnapshotId=context.snapshotId,
                    contractRevision=context.contractRevision,
                    issueIds=issue_ids, issues=blockers,
                    summary=result.summary if result else "Review requested changes",
                    createdAt=now,
                )
                db.execute(
                    "INSERT INTO review_rework_handoffs(handoff_id,review_id,"
                    "development_run_id,snapshot_id,bundle_json,created_at) "
                    "VALUES(?,?,?,?,?,?)",
                    (str(handoff.handoffId), str(review_id), str(development_run_id),
                     str(context.snapshotId), handoff.model_dump_json(), now),
                )
        return self.get(review_id)

    def get(self, review_id: UUID) -> ReviewReport:
        row = self.storage.session().execute(
            "SELECT * FROM review_reports WHERE review_id=?", (str(review_id),),
        ).fetchone()
        if row is None:
            raise ReviewIssueError("REVIEW_NOT_FOUND")
        issue_rows = self.storage.session().execute(
            "SELECT DISTINCT t.* FROM review_issue_threads t "
            "JOIN review_issue_occurrences o ON o.issue_id=t.issue_id "
            "WHERE o.review_id=? ORDER BY t.first_seen_at,t.issue_id",
            (str(review_id),),
        ).fetchall()
        rework = self.storage.session().execute(
            "SELECT bundle_json FROM review_rework_handoffs WHERE review_id=?",
            (str(review_id),),
        ).fetchone()
        return ReviewReport(
            reviewId=UUID(row["review_id"]), projectId=UUID(row["project_id"]),
            taskId=UUID(row["task_id"]), developmentRunId=UUID(row["development_run_id"]),
            snapshotId=UUID(row["snapshot_id"]), reviewCopyId=UUID(row["review_copy_id"]),
            reviewAttemptId=UUID(row["review_attempt_id"]), status=row["outcome"],
            result=(ReviewResult.model_validate_json(row["result_json"])
                    if row["result_json"] != "null" else None),
            issues=[ReviewIssue(
                issueId=UUID(item["issue_id"]), projectId=UUID(item["project_id"]),
                taskId=UUID(item["task_id"]), severity=item["severity"],
                status=item["status"], revision=item["revision"],
                firstSeenAt=item["first_seen_at"], lastSeenAt=item["last_seen_at"],
            ) for item in issue_rows],
            reworkHandoff=(ReworkHandoff.model_validate_json(rework["bundle_json"])
                           if rework else None),
            createdAt=row["created_at"],
        )

    def list_for_task(self, project_id: UUID, task_id: UUID) -> list[ReviewReport]:
        rows = self.storage.session().execute(
            "SELECT review_id FROM review_reports WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 50", (str(project_id), str(task_id)),
        ).fetchall()
        return [self.get(UUID(row["review_id"])) for row in rows]

    def issue_history(self, project_id: UUID, task_id: UUID) -> list[IssueOccurrence]:
        rows = self.storage.session().execute(
            "SELECT o.* FROM review_issue_occurrences o "
            "JOIN review_issue_threads t ON t.issue_id=o.issue_id "
            "WHERE t.project_id=? AND t.task_id=? ORDER BY o.rowid DESC LIMIT 1000",
            (str(project_id), str(task_id)),
        ).fetchall()
        return [IssueOccurrence(
            occurrenceId=UUID(row["occurrence_id"]), issueId=UUID(row["issue_id"]),
            reviewId=UUID(row["review_id"]), reviewAttemptId=UUID(row["review_attempt_id"]),
            snapshotId=UUID(row["snapshot_id"]),
            finding=ReviewFinding.model_validate_json(row["finding_json"]),
            createdAt=row["created_at"],
        ) for row in rows]
