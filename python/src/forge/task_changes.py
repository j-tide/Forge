"""Explicit approved Task revisions, delayed until a safe execution boundary."""

from __future__ import annotations

import sqlite3
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.approvals import contract_digest, scope_hash
from forge.conversations import timestamp
from forge.drafts import TaskContract
from forge.persistence import ForgePersistence, PersistenceSession
from forge.projects import TRUST_VERSION, ProjectService


class TaskChangeError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class TaskChangePropose(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    expectedRevision: int = Field(ge=1)
    contract: TaskContract
    decisionId: UUID
    reason: str = Field(min_length=12, max_length=2000)
    confirmScopeChange: bool
    idempotencyKey: UUID


class TaskChangeDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    changeId: UUID
    expectedRevision: int = Field(ge=1)
    expectedContentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    decision: Literal["approve", "reject"]
    reason: str = Field(min_length=12, max_length=2000)


class TaskChangeApply(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    changeId: UUID
    expectedRevision: int = Field(ge=1)
    confirmed: Literal[True]


class TaskChangeView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    changeId: UUID
    projectId: UUID
    taskId: UUID
    baseRevision: int
    proposedRevision: int
    contract: TaskContract
    contentHash: str
    scopeHash: str
    decisionId: UUID
    reason: str
    state: Literal["proposed", "awaiting_safe_point", "applied", "rejected", "stale"]
    approvalReason: str | None
    createdAt: str
    decidedAt: str | None
    appliedAt: str | None


class TaskChangeService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService) -> None:
        self.storage = storage
        self.projects = projects

    def _trusted(self, project_id: UUID) -> None:
        project = self.projects.get(str(project_id))
        active = self.projects.active()
        if (project is None or project.archivedAt or not project.trusted
                or project.trustVersion != TRUST_VERSION or active is None
                or active.projectId != project_id):
            raise TaskChangeError("PROJECT_TRUST_REQUIRED")

    def _task(self, project_id: UUID, task_id: UUID) -> sqlite3.Row:
        row = self.storage.session().execute(
            "SELECT current_revision,contract_json FROM tasks "
            "WHERE project_id=? AND task_id=? AND state='todo'",
            (str(project_id), str(task_id)),
        ).fetchone()
        if row is None:
            raise TaskChangeError("TASK_NOT_FOUND")
        return row

    def _read(self, item: sqlite3.Row) -> TaskChangeView:
        return TaskChangeView(
            changeId=UUID(item["change_id"]), projectId=UUID(item["project_id"]),
            taskId=UUID(item["task_id"]), baseRevision=item["base_revision"],
            proposedRevision=item["proposed_revision"],
            contract=TaskContract.model_validate_json(item["contract_json"]),
            contentHash=item["content_hash"], scopeHash=item["scope_hash"],
            decisionId=UUID(item["decision_id"]), reason=item["reason"],
            state=item["state"], approvalReason=item["approval_reason"],
            createdAt=item["created_at"], decidedAt=item["decided_at"],
            appliedAt=item["applied_at"],
        )

    def latest(self, project_id: UUID, task_id: UUID) -> TaskChangeView | None:
        self._trusted(project_id)
        self._task(project_id, task_id)
        row = self.storage.session().execute(
            "SELECT * FROM task_change_requests WHERE project_id=? AND task_id=? "
            "ORDER BY rowid DESC LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        return self._read(row) if row else None

    def _safe(self, project_id: UUID, task_id: UUID) -> bool:
        db = self.storage.session()
        active_run = db.execute(
            "SELECT 1 FROM runs WHERE project_id=? AND task_id=? "
            "AND state IN ('queued','running','waiting_input','pausing','paused',"
            "'canceling','interrupted') LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        active_review = db.execute(
            "SELECT 1 FROM review_jobs WHERE project_id=? AND task_id=? "
            "AND state='running' LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        active_verify = db.execute(
            "SELECT 1 FROM verifier_jobs WHERE project_id=? AND task_id=? "
            "AND state='running' LIMIT 1", (str(project_id), str(task_id)),
        ).fetchone()
        active_rework = db.execute(
            "SELECT 1 FROM rework_cycles WHERE project_id=? AND task_id=? "
            "AND state IN ('pending','launching','running') LIMIT 1",
            (str(project_id), str(task_id)),
        ).fetchone()
        return not any((active_run, active_review, active_verify, active_rework))

    def propose(self, value: TaskChangePropose) -> TaskChangeView:
        self._trusted(value.projectId)
        with self.storage.transaction() as db:
            existing = db.execute(
                "SELECT * FROM task_change_requests WHERE idempotency_key=?",
                (str(value.idempotencyKey),),
            ).fetchone()
            if existing:
                prior = self._read(existing)
                if (prior.projectId == value.projectId and prior.taskId == value.taskId
                        and prior.baseRevision == value.expectedRevision
                        and prior.contentHash == contract_digest(value.contract)
                        and prior.reason == value.reason):
                    return prior
                raise TaskChangeError("IDEMPOTENCY_CONFLICT")
            task = self._task(value.projectId, value.taskId)
            if task["current_revision"] != value.expectedRevision:
                raise TaskChangeError("TASK_CHANGE_STALE")
            previous = TaskContract.model_validate_json(task["contract_json"])
            candidate = value.contract
            decision_ref = f"decision:{value.decisionId}"
            if (candidate.projectId != str(value.projectId)
                    or candidate.taskId != str(value.taskId)
                    or candidate.revision != value.expectedRevision + 1
                    or candidate.openQuestions
                    or decision_ref not in candidate.sourceRefs
                    or not set(previous.sourceRefs).issubset(candidate.sourceRefs)
                    or (scope_hash(previous) != scope_hash(candidate)
                        and not value.confirmScopeChange)):
                raise TaskChangeError("TASK_CHANGE_INVALID")
            old_criteria = {item.id: item for item in previous.acceptance}
            if len({item.id for item in candidate.acceptance}) != len(candidate.acceptance):
                raise TaskChangeError("TASK_CHANGE_INVALID")
            for criterion in candidate.acceptance:
                old = old_criteria.get(criterion.id)
                if (old is None or old.statement != criterion.statement
                        or old.method != criterion.method or old.required != criterion.required):
                    if decision_ref not in criterion.sourceRefs:
                        raise TaskChangeError("TASK_CHANGE_INVALID")
                if old and not set(old.sourceRefs).issubset(criterion.sourceRefs):
                    raise TaskChangeError("TASK_CHANGE_INVALID")
                if not set(criterion.sourceRefs).issubset(candidate.sourceRefs):
                    raise TaskChangeError("TASK_CHANGE_INVALID")
            def semantic(contract: TaskContract) -> dict[str, object]:
                body = contract.model_dump(mode="json", exclude={"revision", "sourceRefs"})
                for item in body["acceptance"]:
                    item.pop("sourceRefs", None)
                return body

            if semantic(candidate) == semantic(previous):
                raise TaskChangeError("TASK_CHANGE_INVALID")
            if db.execute(
                "SELECT 1 FROM task_change_requests WHERE task_id=? "
                "AND state IN ('proposed','awaiting_safe_point')", (str(value.taskId),),
            ).fetchone():
                raise TaskChangeError("TASK_CHANGE_CONFLICT")
            change_id = uuid4()
            now = timestamp()
            db.execute(
                "INSERT INTO task_change_requests(change_id,idempotency_key,project_id,"
                "task_id,base_revision,proposed_revision,contract_json,content_hash,"
                "scope_hash,decision_id,reason,state,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,'proposed',?)",
                (str(change_id), str(value.idempotencyKey), str(value.projectId),
                 str(value.taskId), value.expectedRevision, candidate.revision,
                 candidate.model_dump_json(), contract_digest(candidate),
                 scope_hash(candidate), str(value.decisionId), value.reason, now),
            )
            row = db.execute("SELECT * FROM task_change_requests WHERE change_id=?",
                             (str(change_id),)).fetchone()
            assert row is not None
            return self._read(row)

    def decide(self, value: TaskChangeDecision) -> TaskChangeView:
        self._trusted(value.projectId)
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT * FROM task_change_requests WHERE change_id=? AND project_id=? "
                "AND task_id=?", (str(value.changeId), str(value.projectId), str(value.taskId)),
            ).fetchone()
            if row is None:
                raise TaskChangeError("TASK_CHANGE_NOT_FOUND")
            current = self._read(row)
            if (current.baseRevision != value.expectedRevision
                    or current.contentHash != value.expectedContentHash):
                raise TaskChangeError("TASK_CHANGE_STALE")
            if current.state != "proposed":
                raise TaskChangeError("TASK_CHANGE_CONFLICT")
            task = self._task(value.projectId, value.taskId)
            if task["current_revision"] != current.baseRevision:
                raise TaskChangeError("TASK_CHANGE_STALE")
            if value.decision == "reject":
                db.execute("UPDATE task_change_requests SET state='rejected',"
                           "approval_reason=?,decided_at=? WHERE change_id=?",
                           (value.reason, timestamp(), str(value.changeId)))
            else:
                db.execute("UPDATE task_change_requests SET state='awaiting_safe_point',"
                           "approval_reason=?,decided_at=? WHERE change_id=?",
                           (value.reason, timestamp(), str(value.changeId)))
                if self._safe(value.projectId, value.taskId):
                    self._apply(db, current)
            updated = db.execute("SELECT * FROM task_change_requests WHERE change_id=?",
                                 (str(value.changeId),)).fetchone()
            assert updated is not None
            return self._read(updated)

    def apply(self, value: TaskChangeApply) -> TaskChangeView:
        self._trusted(value.projectId)
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT * FROM task_change_requests WHERE change_id=? AND project_id=? "
                "AND task_id=?", (str(value.changeId), str(value.projectId), str(value.taskId)),
            ).fetchone()
            if row is None:
                raise TaskChangeError("TASK_CHANGE_NOT_FOUND")
            current = self._read(row)
            if current.baseRevision != value.expectedRevision:
                raise TaskChangeError("TASK_CHANGE_STALE")
            if current.state == "applied":
                return current
            if current.state != "awaiting_safe_point":
                raise TaskChangeError("TASK_CHANGE_CONFLICT")
            if not self._safe(value.projectId, value.taskId):
                raise TaskChangeError("TASK_CHANGE_WAITING_SAFE_POINT")
            self._apply(db, current)
            updated = db.execute("SELECT * FROM task_change_requests WHERE change_id=?",
                                 (str(value.changeId),)).fetchone()
            assert updated is not None
            return self._read(updated)

    def _apply(self, db: PersistenceSession, change: TaskChangeView) -> None:
        now = timestamp()
        updated = db.execute(
            "UPDATE tasks SET current_revision=?,contract_json=?,revision=revision+1,"
            "updated_at=? WHERE project_id=? AND task_id=? AND current_revision=?",
            (change.proposedRevision, change.contract.model_dump_json(), now,
             str(change.projectId), str(change.taskId), change.baseRevision),
        ).rowcount
        if updated != 1:
            raise TaskChangeError("TASK_CHANGE_STALE")
        db.execute(
            "INSERT INTO task_revisions(task_id,revision,contract_json,content_hash,created_at) "
            "VALUES(?,?,?,?,?)",
            (str(change.taskId), change.proposedRevision,
             change.contract.model_dump_json(), change.contentHash, now),
        )
        db.execute(
            "UPDATE review_issue_threads SET status='stale',revision=revision+1 "
            "WHERE project_id=? AND task_id=? AND status IN ('open','resolved')",
            (str(change.projectId), str(change.taskId)),
        )
        db.execute("UPDATE board_state SET revision=revision+1 WHERE project_id=?",
                   (str(change.projectId),))
        db.execute("UPDATE task_change_requests SET state='applied',applied_at=? "
                   "WHERE change_id=? AND state='awaiting_safe_point'",
                   (now, str(change.changeId)),
        )
