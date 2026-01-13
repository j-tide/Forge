"""Human Task approval; a decision atomically creates one TODO and no Run."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.drafts import DraftService, TaskContract, TaskDraft
from forge.persistence import ForgePersistence


class ApprovalError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def contract_digest(contract: TaskContract) -> str:
    return hashlib.sha256(canonical_json(contract.model_dump(mode="json")).encode()).hexdigest()


def scope_hash(contract: TaskContract) -> str:
    body = contract.model_dump(mode="json")
    selected = {
        key: body[key] for key in (
            "scope", "outOfScope", "constraints", "acceptance", "openQuestions"
        )
    }
    return hashlib.sha256(canonical_json(selected).encode()).hexdigest()


class ApprovalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    approvalId: UUID
    projectId: UUID
    taskId: UUID
    kind: Literal["task"]
    expectedRevision: int = Field(ge=1)
    scopeHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    snapshotId: None
    actionDigest: str = Field(pattern=r"^[a-f0-9]{64}$")
    requestedBy: Literal["local-user"]
    expiresAt: str
    summary: str = Field(min_length=1)
    risk: Literal["medium"]
    requiredScope: Literal["task:create:todo"]


class ApprovalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    approvalId: UUID
    decision: Literal["approve", "reject"]
    expectedRevision: int = Field(ge=1)
    scopeHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    reason: str


class TaskApproval(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    request: ApprovalRequest
    draftId: UUID
    status: Literal["pending", "approved", "rejected", "expired", "superseded"]
    decision: ApprovalDecision | None
    taskState: Literal["todo"] | None
    createdAt: str
    decidedAt: str | None


class ApprovalRequestInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    draftId: UUID
    expectedRevision: int = Field(ge=1)


class ApprovalDecideInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    decision: ApprovalDecision


def _ready(draft: TaskDraft) -> bool:
    return bool(
        draft.contract
        and not draft.contract.openQuestions
        and draft.status not in ("generating", "invalid_output")
    )


class ApprovalService:
    def __init__(self, storage: ForgePersistence, drafts: DraftService) -> None:
        self.storage = storage
        self.drafts = drafts

    @staticmethod
    def _read(row: Any) -> TaskApproval:
        return TaskApproval.model_validate_json(
            json.dumps(
                {
                    "request": json.loads(row["request_json"]),
                    "draftId": row["draft_id"],
                    "status": row["status"],
                    "decision": json.loads(row["decision_json"])
                    if row["decision_json"] else None,
                    "taskState": "todo" if row["task_id"] else None,
                    "createdAt": row["created_at"],
                    "decidedAt": row["decided_at"],
                }
            )
        )

    def for_draft(self, project_id: str, draft_id: str) -> TaskApproval | None:
        if self.drafts.get(project_id, draft_id) is None:
            return None
        row = self.storage.session().execute(
            "SELECT * FROM task_approvals WHERE project_id=? AND draft_id=? "
            "ORDER BY created_at DESC,rowid DESC LIMIT 1",
            (project_id, draft_id),
        ).fetchone()
        return self._read(row) if row else None

    def request(self, value: ApprovalRequestInput) -> TaskApproval:
        project_id, draft_id = str(value.projectId), str(value.draftId)
        with self.storage.transaction() as db:
            draft = self.drafts.get(project_id, draft_id)
            if draft is None:
                raise ApprovalError("APPROVAL_NOT_FOUND")
            if draft.revision != value.expectedRevision:
                raise ApprovalError("APPROVAL_STALE")
            if not _ready(draft) or draft.contract is None:
                raise ApprovalError("APPROVAL_NOT_READY")
            if db.execute(
                "SELECT 1 FROM tasks WHERE source_draft_id=?", (draft_id,)
            ).fetchone():
                raise ApprovalError("APPROVAL_ALREADY_DECIDED")
            current = db.execute(
                "SELECT * FROM task_approvals WHERE draft_id=? AND status='pending'",
                (draft_id,),
            ).fetchone()
            now = timestamp()
            if current:
                existing = self._read(current)
                if (
                    current["expected_revision"] == draft.revision
                    and current["action_digest"] == contract_digest(draft.contract)
                    and existing.request.expiresAt > now
                ):
                    return existing
                db.execute(
                    "UPDATE task_approvals SET status=?,decided_at=? WHERE approval_id=?",
                    (
                        "expired" if existing.request.expiresAt <= now else "superseded",
                        now, current["approval_id"],
                    ),
                )
            approval_id = uuid4()
            expiry = (datetime.now(UTC) + timedelta(hours=24)).isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z")
            request = ApprovalRequest(
                schemaVersion="1.0", approvalId=approval_id, projectId=draft.projectId,
                taskId=UUID(draft.contract.taskId), kind="task",
                expectedRevision=draft.revision, scopeHash=scope_hash(draft.contract),
                snapshotId=None, actionDigest=contract_digest(draft.contract),
                requestedBy="local-user", expiresAt=expiry,
                summary=f"{draft.contract.title}: {draft.contract.goal}",
                risk="medium", requiredScope="task:create:todo",
            )
            db.execute(
                "INSERT INTO task_approvals(approval_id,project_id,draft_id,expected_revision,"
                "scope_hash,action_digest,request_json,status,created_at) "
                "VALUES(?,?,?,?,?,?,?,'pending',?)",
                (
                    str(approval_id), project_id, draft_id, draft.revision,
                    request.scopeHash, request.actionDigest, request.model_dump_json(), now,
                ),
            )
            result = self.for_draft(project_id, draft_id)
            assert result is not None
            return result

    def decide(self, value: ApprovalDecideInput) -> TaskApproval:
        project_id, decision = str(value.projectId), value.decision
        error: str | None = None
        outcome: TaskApproval | None = None
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT * FROM task_approvals WHERE project_id=? AND approval_id=?",
                (project_id, str(decision.approvalId)),
            ).fetchone()
            if row is None:
                raise ApprovalError("APPROVAL_NOT_FOUND")
            if (
                row["expected_revision"] != decision.expectedRevision
                or row["scope_hash"] != decision.scopeHash
            ):
                raise ApprovalError("APPROVAL_STALE")
            if row["status"] != "pending":
                prior = json.loads(row["decision_json"]) if row["decision_json"] else None
                if prior == decision.model_dump(mode="json"):
                    return self._read(row)
                raise ApprovalError(
                    "APPROVAL_EXPIRED" if row["status"] == "expired"
                    else "APPROVAL_STALE" if row["status"] == "superseded"
                    else "APPROVAL_ALREADY_DECIDED"
                )
            draft = self.drafts.get(project_id, row["draft_id"])
            now = timestamp()
            request = self._read(row).request
            if request.expiresAt <= now:
                db.execute(
                    "UPDATE task_approvals SET status='expired',decided_at=? WHERE approval_id=?",
                    (now, row["approval_id"]),
                )
                error = "APPROVAL_EXPIRED"
            elif (
                draft is None or draft.revision != row["expected_revision"]
                or not _ready(draft) or draft.contract is None
                or contract_digest(draft.contract) != row["action_digest"]
                or scope_hash(draft.contract) != row["scope_hash"]
            ):
                db.execute(
                    "UPDATE task_approvals SET status='superseded',decided_at=? "
                    "WHERE approval_id=?",
                    (now, row["approval_id"]),
                )
                error = "APPROVAL_STALE"
            elif decision.decision == "reject":
                db.execute(
                    "UPDATE task_approvals SET status='rejected',decision_json=?,decided_at=? "
                    "WHERE approval_id=? AND status='pending'",
                    (decision.model_dump_json(), now, row["approval_id"]),
                )
            else:
                position_row = db.execute(
                    "SELECT COALESCE(MAX(position),-1)+1 FROM tasks "
                    "WHERE project_id=? AND state='todo'",
                    (project_id,),
                ).fetchone()
                assert position_row is not None
                position = position_row[0]
                contract = draft.contract
                task_id = contract.taskId
                db.execute(
                    "INSERT INTO tasks(task_id,project_id,source_draft_id,current_revision,"
                    "state,contract_json,approved_at,created_at,position,revision,updated_at) "
                    "VALUES(?,?,?,?,'todo',?,?,?,?,1,?)",
                    (
                        task_id, project_id, row["draft_id"], draft.revision,
                        contract.model_dump_json(), now, now, position, now,
                    ),
                )
                db.execute(
                    "INSERT INTO task_revisions(task_id,revision,contract_json,content_hash,"
                    "created_at) VALUES(?,?,?,?,?)",
                    (task_id, draft.revision, contract.model_dump_json(),
                     row["action_digest"], now),
                )
                event_id = str(uuid4())
                payload = json.dumps(
                    {"approvalId": row["approval_id"], "revision": draft.revision,
                     "scopeHash": row["scope_hash"]}
                )
                db.execute(
                    "INSERT INTO task_events(event_id,task_id,type,payload_json,created_at) "
                    "VALUES(?,?,'task.approved_to_todo',?,?)",
                    (event_id, task_id, payload, now),
                )
                db.execute(
                    "INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,"
                    "created_at) VALUES(?,?,?,'task.approved_to_todo',?,?)",
                    (event_id, project_id, task_id, payload, now),
                )
                db.execute(
                    "UPDATE board_state SET revision=revision+1 WHERE project_id=?",
                    (project_id,),
                )
                db.execute(
                    "UPDATE task_approvals SET status='approved',decision_json=?,task_id=?,"
                    "decided_at=? WHERE approval_id=? AND status='pending'",
                    (decision.model_dump_json(), task_id, now, row["approval_id"]),
                )
            updated = db.execute(
                "SELECT * FROM task_approvals WHERE approval_id=?", (row["approval_id"],)
            ).fetchone()
            assert updated is not None
            outcome = self._read(updated)
        if error:
            raise ApprovalError(error)
        assert outcome is not None
        return outcome
