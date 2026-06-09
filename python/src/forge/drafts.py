"""Human-editable task drafts and immutable revision history in Python Host."""

from __future__ import annotations

import json
from typing import Annotated, Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from forge.conversations import timestamp
from forge.persistence import ForgePersistence


class DraftError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


Identifier = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")]
NonemptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class AcceptanceCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: Identifier
    statement: NonemptyText
    method: Literal["automated", "manual", "inspection"]
    required: bool
    sourceRefs: list[NonemptyText]


class TaskContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    taskId: Identifier
    projectId: Identifier
    revision: int = Field(ge=1)
    title: NonemptyText = Field(max_length=120)
    type: Literal["feature", "bug", "refactor", "chore"]
    goal: NonemptyText
    acceptance: list[AcceptanceCriterion] = Field(min_length=1)
    constraints: list[NonemptyText]
    scope: list[NonemptyText]
    outOfScope: list[NonemptyText]
    dependencies: list[Identifier]
    openQuestions: list[NonemptyText]
    assumptions: list[NonemptyText]
    sourceRefs: list[NonemptyText]
    workflowRef: NonemptyText
    priority: Literal["low", "normal", "high", "urgent"]


class TaskDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    draftId: UUID
    projectId: UUID
    conversationId: UUID
    sourceMessageId: UUID
    revision: int = Field(ge=1)
    createdAt: str
    updatedAt: str
    intent: Literal["new_task", "revision", "query", "control"]
    status: Literal["generating", "proposed", "needs_clarification", "invalid_output", "manual"]
    contract: TaskContract | None
    editableText: str = Field(max_length=100_000)
    errorCode: Literal["REFINER_UNAVAILABLE", "REFINER_INVALID_OUTPUT", "REFINER_FAILED"] | None
    modelProvider: str | None


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    conversationId: UUID
    sourceMessageId: UUID
    idempotencyKey: str = Field(min_length=16, max_length=128)


class ResolvedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    question: str = Field(min_length=1)
    answer: str = Field(min_length=1, max_length=4000)


class DraftReviseInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    draftId: UUID
    expectedRevision: int = Field(ge=1)
    contract: TaskContract
    decisionId: UUID
    decisionSummary: str = Field(min_length=1, max_length=1000)
    resolvedQuestions: list[ResolvedQuestion]
    removedAcceptanceIds: list[str]
    confirmScopeChange: bool


class DraftRevision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    draftId: UUID
    revision: int
    contract: TaskContract | None
    editableText: str
    changedFields: list[str]
    decisionId: UUID | None
    decisionSummary: str | None
    resolvedQuestions: list[ResolvedQuestion]
    createdAt: str


CONTRACT_FIELDS = (
    "title", "type", "goal", "acceptance", "constraints", "scope", "outOfScope",
    "dependencies", "openQuestions", "assumptions", "sourceRefs", "workflowRef", "priority",
)


def changed_fields(before: TaskContract | None, after: TaskContract) -> list[str]:
    old = before.model_dump(mode="json") if before else {}
    new = after.model_dump(mode="json")
    return [name for name in CONTRACT_FIELDS if old.get(name) != new[name]]


def prepare_revision(before: TaskDraft, request: DraftReviseInput) -> list[str]:
    candidate = request.contract
    if (
        before.projectId != request.projectId
        or before.draftId != request.draftId
        or before.revision != request.expectedRevision
        or candidate.taskId != str(before.draftId)
        or candidate.projectId != str(before.projectId)
        or candidate.revision != before.revision + 1
        or before.status == "generating"
    ):
        raise DraftError("DRAFT_INVALID_REVISION")
    previous = before.contract
    old_questions = previous.openQuestions if previous else []
    removed = [item for item in old_questions if item not in candidate.openQuestions]
    answers = {item.question: item.answer for item in request.resolvedQuestions}
    if (
        len(answers) != len(request.resolvedQuestions)
        or any(item not in answers for item in removed)
        or any(item.question not in removed for item in request.resolvedQuestions)
    ):
        raise DraftError("DRAFT_UNRESOLVED_QUESTIONS")
    old_acceptance = previous.acceptance if previous else []
    old_by_id = {item.id: item for item in old_acceptance}
    candidate_ids = [item.id for item in candidate.acceptance]
    if len(candidate_ids) != len(set(candidate_ids)):
        raise DraftError("DRAFT_INVALID_REVISION")
    removed_ids = {item.id for item in old_acceptance if item.id not in candidate_ids}
    if removed_ids != set(request.removedAcceptanceIds):
        raise DraftError("DRAFT_ACCEPTANCE_CONFIRMATION_REQUIRED")
    decision_ref = f"decision:{request.decisionId}"
    allowed_refs = {f"message:{before.sourceMessageId}", decision_ref}
    if previous:
        allowed_refs.update(previous.sourceRefs)
    if decision_ref not in candidate.sourceRefs or any(
        ref not in allowed_refs for ref in candidate.sourceRefs
    ):
        raise DraftError("DRAFT_INVALID_REVISION")
    if previous and any(ref not in candidate.sourceRefs for ref in previous.sourceRefs):
        raise DraftError("DRAFT_INVALID_REVISION")
    for item in candidate.acceptance:
        old = old_by_id.get(item.id)
        materially_changed = old is None or any(
            getattr(old, field) != getattr(item, field)
            for field in ("statement", "method", "required")
        )
        if materially_changed and decision_ref not in item.sourceRefs:
            raise DraftError("DRAFT_INVALID_REVISION")
        if old and any(ref not in item.sourceRefs for ref in old.sourceRefs):
            raise DraftError("DRAFT_INVALID_REVISION")
        if any(ref not in allowed_refs for ref in item.sourceRefs):
            raise DraftError("DRAFT_INVALID_REVISION")
    if (
        previous
        and (previous.scope != candidate.scope or previous.outOfScope != candidate.outOfScope)
        and not request.confirmScopeChange
    ):
        raise DraftError("DRAFT_SCOPE_CONFIRMATION_REQUIRED")
    changed = changed_fields(previous, candidate)
    if not changed:
        raise DraftError("DRAFT_INVALID_REVISION")
    return changed


class DraftService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    @staticmethod
    def _draft(row: Any) -> TaskDraft:
        return TaskDraft.model_validate_json(
            json.dumps(
                {
                    "draftId": row["draft_id"], "projectId": row["project_id"],
                    "conversationId": row["conversation_id"],
                    "sourceMessageId": row["source_message_id"], "revision": row["revision"],
                    "intent": row["intent"], "status": row["status"],
                    "contract": json.loads(row["contract_json"]) if row["contract_json"] else None,
                    "editableText": row["editable_text"], "errorCode": row["error_code"],
                    "modelProvider": row["model_provider"],
                    "createdAt": row["created_at"], "updatedAt": row["updated_at"],
                }
            )
        )

    def get(self, project_id: str, draft_id: str) -> TaskDraft | None:
        row = self.storage.session().execute(
            "SELECT d.* FROM task_drafts d JOIN conversations c "
            "ON c.conversation_id=d.conversation_id JOIN projects p ON p.project_id=d.project_id "
            "WHERE d.project_id=? AND d.draft_id=? AND c.project_id=? "
            "AND c.archived_at IS NULL AND p.archived_at IS NULL",
            (project_id, draft_id, project_id),
        ).fetchone()
        return self._draft(row) if row else None

    def list_drafts(self, project_id: str, conversation_id: str) -> list[TaskDraft]:
        rows = self.storage.session().execute(
            "SELECT d.* FROM task_drafts d JOIN conversations c "
            "ON c.conversation_id=d.conversation_id JOIN projects p ON p.project_id=d.project_id "
            "WHERE d.project_id=? AND d.conversation_id=? AND c.project_id=? "
            "AND c.archived_at IS NULL AND p.archived_at IS NULL ORDER BY d.created_at DESC",
            (project_id, conversation_id, project_id),
        ).fetchall()
        return [self._draft(row) for row in rows]

    def history(self, project_id: str, draft_id: str) -> list[DraftRevision]:
        if self.get(project_id, draft_id) is None:
            raise DraftError("DRAFT_NOT_FOUND")
        rows = self.storage.session().execute(
            "SELECT * FROM task_draft_revisions WHERE draft_id=? ORDER BY revision DESC",
            (draft_id,),
        ).fetchall()
        return [
            DraftRevision.model_validate_json(
                json.dumps(
                    {
                        "draftId": row["draft_id"], "revision": row["revision"],
                        "contract": json.loads(row["contract_json"])
                        if row["contract_json"] else None,
                        "editableText": row["editable_text"],
                        "changedFields": json.loads(row["changed_fields_json"]),
                        "decisionId": row["decision_id"],
                        "decisionSummary": row["decision_summary"],
                        "resolvedQuestions": json.loads(row["resolved_questions_json"]),
                        "createdAt": row["created_at"],
                    }
                )
            )
            for row in rows
        ]

    def _snapshot(
        self, draft: TaskDraft, changed: list[str], decision_id: str | None = None,
        decision_summary: str | None = None, resolved: list[ResolvedQuestion] | None = None,
    ) -> None:
        self.storage.session().execute(
            "INSERT INTO task_draft_revisions(draft_id,revision,contract_json,editable_text,"
            "changed_fields_json,decision_id,decision_summary,resolved_questions_json,created_at) "
            "VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(draft_id,revision) DO UPDATE SET "
            "contract_json=excluded.contract_json,editable_text=excluded.editable_text,"
            "changed_fields_json=excluded.changed_fields_json,created_at=excluded.created_at",
            (
                str(draft.draftId), draft.revision,
                draft.contract.model_dump_json() if draft.contract else None,
                draft.editableText, json.dumps(changed), decision_id, decision_summary,
                json.dumps([item.model_dump(mode="json") for item in resolved or []]),
                draft.updatedAt,
            ),
        )

    def begin(
        self, request: DraftRequest, mode: Literal["generating", "manual"], provider: str | None
    ) -> TaskDraft:
        project_id = str(request.projectId)
        conversation_id = str(request.conversationId)
        source_id = str(request.sourceMessageId)
        with self.storage.transaction() as db:
            source = db.execute(
                "SELECT m.content_json FROM messages m JOIN conversations c "
                "ON c.conversation_id=m.conversation_id JOIN projects p "
                "ON p.project_id=c.project_id WHERE p.project_id=? AND p.archived_at IS NULL "
                "AND c.conversation_id=? AND c.archived_at IS NULL "
                "AND m.message_id=? AND m.role='user'",
                (project_id, conversation_id, source_id),
            ).fetchone()
            if source is None:
                raise DraftError("DRAFT_SOURCE_NOT_FOUND")
            existing = db.execute(
                "SELECT * FROM task_drafts WHERE conversation_id=? "
                "AND (idempotency_key=? OR source_message_id=?)",
                (conversation_id, request.idempotencyKey, source_id),
            ).fetchone()
            if existing:
                if (
                    existing["idempotency_key"] != request.idempotencyKey
                    or existing["source_message_id"] != source_id
                ):
                    raise DraftError("IDEMPOTENCY_CONFLICT")
                return self._draft(existing)
            text = json.loads(source["content_json"])["text"]
            now = timestamp()
            draft_id = str(uuid4())
            db.execute(
                "INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,"
                "idempotency_key,revision,intent,status,contract_json,editable_text,error_code,"
                "model_provider,created_at,updated_at) "
                "VALUES(?,?,?,?,?,1,'new_task',?,NULL,?,?,?, ?,?)",
                (draft_id, project_id, conversation_id, source_id, request.idempotencyKey,
                 mode, text, "REFINER_UNAVAILABLE" if mode == "manual" else None,
                 provider, now, now),
            )
            draft = self.get(project_id, draft_id)
            if draft is None:
                raise DraftError("DRAFT_NOT_FOUND")
            self._snapshot(draft, [])
            return draft

    def manual(self, request: DraftRequest) -> TaskDraft:
        return self.begin(request, "manual", None)

    def finish(
        self,
        project_id: str,
        draft_id: str,
        intent: Literal["new_task", "revision", "query", "control"],
        contract: TaskContract | None,
        error_code: Literal[
            "REFINER_UNAVAILABLE", "REFINER_INVALID_OUTPUT", "REFINER_FAILED"
        ] | None,
    ) -> TaskDraft:
        with self.storage.transaction() as db:
            before = self.get(project_id, draft_id)
            if before is None:
                raise DraftError("DRAFT_NOT_FOUND")
            if before.status != "generating":
                return before
            status = (
                "invalid_output" if error_code else
                "proposed" if contract and not contract.openQuestions else "needs_clarification"
            )
            db.execute(
                "UPDATE task_drafts SET intent=?,status=?,contract_json=?,error_code=?,"
                "updated_at=? WHERE draft_id=? AND project_id=? AND status='generating'",
                (intent, status, contract.model_dump_json() if contract else None,
                 error_code, timestamp(), draft_id, project_id),
            )
            updated = self.get(project_id, draft_id)
            assert updated is not None
            self._snapshot(updated, ["contract"] if contract else [])
            return updated

    def recover_interrupted(self) -> int:
        with self.storage.transaction() as db:
            return db.execute(
                "UPDATE task_drafts SET status='invalid_output',"
                "error_code='REFINER_FAILED',updated_at=? WHERE status='generating'",
                (timestamp(),),
            ).rowcount

    def _approved(self, draft_id: str) -> bool:
        return self.storage.session().execute(
            "SELECT 1 FROM task_approvals WHERE draft_id=? AND status='approved'", (draft_id,)
        ).fetchone() is not None

    def update_text(
        self, project_id: str, draft_id: str, expected_revision: int, text: str
    ) -> TaskDraft:
        with self.storage.transaction() as db:
            before = self.get(project_id, draft_id)
            if before is None:
                raise DraftError("DRAFT_NOT_FOUND")
            if self._approved(draft_id):
                raise DraftError("DRAFT_APPROVED")
            if before.revision != expected_revision or before.status not in (
                "manual", "invalid_output"
            ):
                raise DraftError("REVISION_CONFLICT")
            now = timestamp()
            db.execute(
                "UPDATE task_drafts SET editable_text=?,revision=revision+1,status='manual',"
                "error_code=NULL,updated_at=? WHERE draft_id=? AND project_id=? AND revision=?",
                (text, now, draft_id, project_id, expected_revision),
            )
            updated = self.get(project_id, draft_id)
            assert updated is not None
            self._snapshot(updated, ["editableText"])
            return updated

    def revise(self, request: DraftReviseInput) -> TaskDraft:
        project_id, draft_id = str(request.projectId), str(request.draftId)
        with self.storage.transaction() as db:
            before = self.get(project_id, draft_id)
            if before is None:
                raise DraftError("DRAFT_NOT_FOUND")
            if self._approved(draft_id):
                raise DraftError("DRAFT_APPROVED")
            changed = prepare_revision(before, request)
            now = timestamp()
            status = "needs_clarification" if request.contract.openQuestions else "proposed"
            db.execute(
                "UPDATE task_drafts SET contract_json=?,revision=revision+1,status=?,"
                "error_code=NULL,updated_at=? WHERE draft_id=? AND project_id=? AND revision=?",
                (request.contract.model_dump_json(), status, now, draft_id,
                 project_id, request.expectedRevision),
            )
            updated = self.get(project_id, draft_id)
            assert updated is not None
            self._snapshot(
                updated, changed, str(request.decisionId), request.decisionSummary,
                request.resolvedQuestions,
            )
            return updated
