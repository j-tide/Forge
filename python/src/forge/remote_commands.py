"""Closed HTTP-to-Host adapter; writes await explicit operation grants."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pydantic_core import to_jsonable_python

from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalError,
    ApprovalRequest,
    ApprovalService,
)
from forge.conversations import ConversationError, ConversationSend, ConversationService
from forge.drafts import DraftError, DraftReviseInput, DraftService, TaskContract
from forge.persistence import ForgePersistence
from forge.protocol import ProtocolError, RpcRequest
from forge.remote_policy import RemotePolicyError, RemotePolicyService
from forge.remote_sessions import RemoteSessionService
from forge.run_inspection import RunDiffPreview, redact, safe_diff_path


class RemoteCommandError(Exception):
    def __init__(self, code: str, status: int) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class _Project(_Closed):
    projectId: UUID


class _Task(_Closed):
    taskId: UUID


class _ApprovalDetailQuery(_Closed):
    approvalId: UUID


class _TaskPageQuery(_Closed):
    projectId: UUID
    limit: int = Field(default=50, ge=1, le=100)
    cursor: str | None = None


class _TaskActivityQuery(_Closed):
    taskId: UUID
    limit: int = Field(default=20, ge=1, le=50)
    cursor: str | None = None


class _TaskDiffQuery(_Closed):
    taskId: UUID
    limit: int = Field(default=4096, ge=1, le=8192)
    cursor: str | None = None


class _ProjectPageQuery(_Closed):
    limit: int = Field(default=50, ge=1, le=100)
    cursor: UUID | None = None


class _ConversationPageQuery(_Closed):
    projectId: UUID
    limit: int = Field(default=50, ge=1, le=50)
    cursor: str | None = None


class _MessagePageQuery(_Closed):
    projectId: UUID
    conversationId: UUID
    limit: int = Field(default=20, ge=1, le=20)
    cursor: str | None = None


class _DraftPageQuery(_Closed):
    projectId: UUID
    conversationId: UUID
    limit: int = Field(default=20, ge=1, le=50)
    cursor: str | None = None


class _CommandEnvelope(_Closed):
    schemaVersion: str = Field(pattern=r"^1\.0$")
    commandId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    method: str = Field(min_length=1, max_length=80)
    projectId: str | None
    resourceId: str | None
    expectedRevision: int = Field(ge=0)
    idempotencyKey: str = Field(min_length=16, max_length=128)
    payload: dict[str, Any]


class _ConversationSendPayload(_Closed):
    conversationId: UUID
    text: str = Field(min_length=1, max_length=100_000)
    attachmentIds: list[UUID] = Field(max_length=16)


class _ApprovalPayload(_Closed):
    approvalId: UUID
    scopeHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class _TaskCreatePayload(_Closed):
    contract: TaskContract


class _TaskRevisePayload(_Closed):
    contract: TaskContract
    reason: str = Field(min_length=1, max_length=1000)


class _CommandReceipt(_Closed):
    commandId: str
    status: str = Field(pattern=r"^completed$")
    operationId: None
    resourceRevision: int = Field(ge=1)
    result: dict[str, Any]
    error: None


class HostCommandMapping(BaseModel):
    """Validated translation only; constructing it never authorizes execution."""

    model_config = ConfigDict(extra="forbid", strict=True)
    method: str
    params: dict[str, Any]
    projectId: UUID
    expectedRevision: int
    idempotencyKey: str


def map_public_write(command: _CommandEnvelope) -> HostCommandMapping:
    """Map only lossless public payloads; never invent provider or approval data."""
    if command.method != "conversations.send":
        raise RemoteCommandError("REMOTE_COMMAND_MAPPING_UNAVAILABLE", 403)
    try:
        project_id = UUID(command.projectId or "")
        body = _ConversationSendPayload.model_validate_json(json.dumps(command.payload))
        if command.resourceId is not None and UUID(command.resourceId) != body.conversationId:
            raise RemoteCommandError("REMOTE_RESOURCE_MISMATCH", 409)
    except (ValueError, ValidationError) as error:
        raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
    return HostCommandMapping(
        method="conversation.send", projectId=project_id,
        expectedRevision=command.expectedRevision,
        idempotencyKey=command.idempotencyKey,
        params={"projectId": str(project_id),
                "conversationId": str(body.conversationId),
                "idempotencyKey": command.idempotencyKey,
                "text": body.text,
                "attachmentIds": [str(item) for item in body.attachmentIds]},
    )


def read_remote_diff_page(
    storage: ForgePersistence, project_id: str, task_id: UUID,
    cursor: str | None, limit: int,
) -> dict[str, Any]:
    """Project-scoped projection of a persisted, already redacted Run preview."""
    row = storage.session().execute(
        "SELECT r.run_id,d.preview_json FROM runs r "
        "LEFT JOIN run_diff_previews d ON d.run_id=r.run_id "
        "WHERE r.project_id=? AND r.task_id=? ORDER BY r.rowid DESC LIMIT 1",
        (project_id, str(task_id)),
    ).fetchone()
    if row is None or row["preview_json"] is None:
        return {"taskId": str(task_id), "available": False,
                "runId": row["run_id"] if row else None,
                "files": [], "textChunk": "", "nextCursor": None,
                "truncated": False, "capturedAt": None}
    try:
        preview = RunDiffPreview.model_validate_json(row["preview_json"])
    except ValidationError as error:
        raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
    if any(not safe_diff_path(item.path) for item in preview.files):
        raise RemoteCommandError("REMOTE_ARTIFACT_UNAVAILABLE", 403)
    if not preview.files:
        if cursor is not None:
            raise RemoteCommandError("REMOTE_CURSOR_STALE", 409)
        return {"taskId": str(task_id), "available": False,
                "runId": row["run_id"], "files": [], "textChunk": "",
                "nextCursor": None, "truncated": preview.truncated,
                "capturedAt": preview.capturedAt}
    digest = hashlib.sha256(row["preview_json"].encode()).hexdigest()[:16]
    offset = 0
    if cursor is not None:
        match = re.fullmatch(r"d:([a-f0-9]{16}):(0|[1-9][0-9]{0,15})", cursor)
        if match is None:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        if match[1] != digest:
            raise RemoteCommandError("REMOTE_CURSOR_STALE", 409)
        offset = int(match[2])
    content = redact(preview.text)
    if offset > len(content):
        raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
    end = min(len(content), offset + limit)
    return {"taskId": str(task_id), "available": True,
            "runId": row["run_id"],
            "files": [item.model_dump(mode="json") for item in preview.files],
            "textChunk": content[offset:end],
            "nextCursor": f"d:{digest}:{end}" if end < len(content) else None,
            "truncated": preview.truncated, "capturedAt": preview.capturedAt}


def read_remote_task_evidence(
    storage: ForgePersistence, project_id: str, task_id: UUID,
) -> list[dict[str, Any]]:
    """Bounded metadata only; never export reports, command output or local paths."""
    db = storage.session()
    evidence: list[dict[str, Any]] = []
    sources = (
        ("review", "SELECT review_id AS id,outcome AS status,snapshot_id,created_at "
         "FROM review_reports WHERE project_id=? AND task_id=? "
         "ORDER BY rowid DESC LIMIT 5"),
        ("verify", "SELECT r.report_id AS id,r.status,r.snapshot_id,r.created_at "
         "FROM verifier_reports r JOIN verifier_jobs j "
         "ON j.verification_id=r.verification_id "
         "WHERE j.project_id=? AND j.task_id=? ORDER BY r.rowid DESC LIMIT 5"),
        ("owner", "SELECT decision_id AS id,decision AS status,snapshot_id,created_at "
         "FROM final_acceptance_decisions WHERE project_id=? AND task_id=? "
         "ORDER BY rowid DESC LIMIT 5"),
        ("delivery", "SELECT delivery_id AS id,'accepted' AS status,"
         "snapshot_id,created_at FROM delivery_records "
         "WHERE project_id=? AND task_id=? ORDER BY rowid DESC LIMIT 5"),
    )
    for kind, sql in sources:
        for row in db.execute(sql, (project_id, str(task_id))):
            evidence.append({"kind": kind, "id": row["id"],
                             "status": row["status"],
                             "snapshotId": row["snapshot_id"],
                             "createdAt": row["created_at"]})
    return sorted(evidence, key=lambda item: item["createdAt"], reverse=True)


# Any command not listed here is refused before it can reach Host dispatch.
_READS: dict[str, type[_Closed]] = {
    "project.list": _ProjectPageQuery,
    "conversation.page": _ConversationPageQuery,
    "message.page": _MessagePageQuery,
    "draft.page": _DraftPageQuery,
    "board.snapshot": _Project,
    "task.page": _TaskPageQuery,
    "task.detail": _Task,
    "task.activity": _TaskActivityQuery,
    "task.diff": _TaskDiffQuery,
    "approval.detail": _ApprovalDetailQuery,
}
_PLANNED_REMOTE_WRITES = frozenset((
    "conversations.send", "tasks.createDraft", "tasks.revise", "tasks.approve",
    "runs.start", "runs.pause", "runs.resume", "runs.cancel", "acceptance.decide",
))


class RemoteCommandDispatcher:
    def __init__(
        self, sessions: RemoteSessionService,
        invoke_host: Callable[[RpcRequest], Awaitable[dict[str, Any]]],
        snapshot_cursor: Callable[[str], str],
        policy: RemotePolicyService,
        storage: ForgePersistence,
        conversations: ConversationService,
        approvals: ApprovalService,
        drafts: DraftService,
    ) -> None:
        self.sessions = sessions
        self.invoke_host = invoke_host
        self.snapshot_cursor = snapshot_cursor
        self.policy = policy
        self.storage = storage
        self.conversations = conversations
        self.approvals = approvals
        self.drafts = drafts

    def _revise_draft(
        self, command: _CommandEnvelope, payload: _TaskRevisePayload,
        token: str, csrf: str,
    ) -> dict[str, Any]:
        project_id = command.projectId
        assert project_id is not None
        try:
            draft_id = UUID(payload.contract.taskId)
            decision_id = UUID(command.commandId)
            project_uuid = UUID(project_id)
            if (payload.contract.projectId != project_id
                    or command.resourceId not in (None, str(draft_id))
                    or command.expectedRevision < 1
                    or payload.contract.revision != command.expectedRevision + 1
                    or not payload.reason.strip()):
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        except ValueError as error:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        canonical = json.dumps({
            "method": command.method, "projectId": project_id,
            "resourceId": command.resourceId,
            "expectedRevision": command.expectedRevision,
            "payload": command.payload,
        }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        request_hash = hashlib.sha256(canonical.encode()).hexdigest()
        with self.storage.transaction() as db:
            identity = self.sessions.require_csrf(token, csrf)
            if project_id not in identity["projectIds"]:
                raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
            self.policy.require_operation(identity, project_id, command.method)
            prior = db.execute(
                "SELECT command_id,device_id,project_id,method,idempotency_key,"
                "request_hash,receipt_json FROM remote_command_receipts "
                "WHERE command_id=? OR (device_id=? AND idempotency_key=?)",
                (command.commandId, identity["deviceId"], command.idempotencyKey),
            ).fetchall()
            if prior:
                if len(prior) != 1 or any(
                    row["device_id"] != identity["deviceId"]
                    or row["project_id"] != project_id
                    or row["method"] != command.method
                    or row["idempotency_key"] != command.idempotencyKey
                    or row["request_hash"] != request_hash for row in prior
                ):
                    raise RemoteCommandError("REMOTE_IDEMPOTENCY_CONFLICT", 409)
                return _CommandReceipt.model_validate_json(prior[0]["receipt_json"]).model_dump()
            before = self.drafts.get(project_id, str(draft_id))
            if before is None or before.contract is None:
                raise RemoteCommandError("DRAFT_NOT_FOUND", 404)
            previous = before.contract
            candidate = payload.contract
            # The public body has no question answers, acceptance removal
            # confirmation or scope-change confirmation. Preserve those
            # fields until a genuinely explicit, versioned contract exists.
            if (candidate.openQuestions != previous.openQuestions
                    or candidate.scope != previous.scope
                    or candidate.outOfScope != previous.outOfScope
                    or not {item.id for item in previous.acceptance}.issubset(
                        {item.id for item in candidate.acceptance}
                    )):
                raise RemoteCommandError("REMOTE_REVISION_CONFIRMATION_REQUIRED", 409)
            request = DraftReviseInput(
                projectId=project_uuid, draftId=draft_id,
                expectedRevision=command.expectedRevision,
                contract=candidate, decisionId=decision_id,
                decisionSummary=payload.reason.strip(), resolvedQuestions=[],
                removedAcceptanceIds=[], confirmScopeChange=False,
            )
            try:
                updated = self.drafts.revise_in_transaction(db, request)
            except DraftError as error:
                status = 404 if error.code == "DRAFT_NOT_FOUND" else 409
                raise RemoteCommandError(error.code, status) from error
            receipt = _CommandReceipt(
                commandId=command.commandId, status="completed", operationId=None,
                resourceRevision=updated.revision,
                result={"draftId": str(updated.draftId), "status": updated.status,
                        "revision": updated.revision}, error=None,
            ).model_dump()
            db.execute(
                "INSERT INTO remote_command_receipts(command_id,device_id,project_id,"
                "method,idempotency_key,request_hash,receipt_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (command.commandId, identity["deviceId"], project_id, command.method,
                 command.idempotencyKey, request_hash,
                 json.dumps(receipt, separators=(",", ":"), ensure_ascii=False),
                 datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")),
            )
            return receipt

    def _create_draft(
        self, command: _CommandEnvelope, payload: _TaskCreatePayload,
        token: str, csrf: str,
    ) -> dict[str, Any]:
        contract = payload.contract
        project_id = command.projectId
        assert project_id is not None
        try:
            draft_id = UUID(contract.taskId)
            source_refs = contract.sourceRefs
            source_id = UUID(source_refs[0][8:]) if len(source_refs) == 2 and \
                source_refs[0].startswith("message:") else None
            decision_id = UUID(command.commandId)
            if (source_id is None or source_refs[1] != f"decision:{decision_id}"
                    or contract.projectId != project_id
                    or command.expectedRevision != 0
                    or command.resourceId not in (None, str(draft_id))):
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
            project_uuid = UUID(project_id)
        except ValueError as error:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        canonical = json.dumps({
            "method": command.method, "projectId": project_id,
            "resourceId": command.resourceId,
            "expectedRevision": command.expectedRevision,
            "payload": command.payload,
        }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        request_hash = hashlib.sha256(canonical.encode()).hexdigest()
        with self.storage.transaction() as db:
            identity = self.sessions.require_csrf(token, csrf)
            if project_id not in identity["projectIds"]:
                raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
            self.policy.require_operation(identity, project_id, command.method)
            prior = db.execute(
                "SELECT command_id,device_id,project_id,method,idempotency_key,"
                "request_hash,receipt_json FROM remote_command_receipts "
                "WHERE command_id=? OR (device_id=? AND idempotency_key=?)",
                (command.commandId, identity["deviceId"], command.idempotencyKey),
            ).fetchall()
            if prior:
                if len(prior) != 1 or any(
                    row["device_id"] != identity["deviceId"]
                    or row["project_id"] != project_id
                    or row["method"] != command.method
                    or row["idempotency_key"] != command.idempotencyKey
                    or row["request_hash"] != request_hash for row in prior
                ):
                    raise RemoteCommandError("REMOTE_IDEMPOTENCY_CONFLICT", 409)
                return _CommandReceipt.model_validate_json(prior[0]["receipt_json"]).model_dump()
            scoped_key = "remote:" + hashlib.sha256(
                f"{identity['deviceId']}:{command.idempotencyKey}".encode()
            ).hexdigest()
            try:
                draft = self.drafts.create_contract_in_transaction(
                    db, project_uuid, contract, source_id, decision_id, scoped_key,
                )
            except DraftError as error:
                status = 404 if error.code == "DRAFT_SOURCE_NOT_FOUND" else 409
                raise RemoteCommandError(error.code, status) from error
            receipt = _CommandReceipt(
                commandId=command.commandId, status="completed", operationId=None,
                resourceRevision=draft.revision,
                result={"draftId": str(draft.draftId), "status": draft.status,
                        "revision": draft.revision}, error=None,
            ).model_dump()
            db.execute(
                "INSERT INTO remote_command_receipts(command_id,device_id,project_id,"
                "method,idempotency_key,request_hash,receipt_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (command.commandId, identity["deviceId"], project_id, command.method,
                 command.idempotencyKey, request_hash,
                 json.dumps(receipt, separators=(",", ":"), ensure_ascii=False),
                 datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")),
            )
            return receipt

    def _send_conversation(
        self, command: _CommandEnvelope, token: str, csrf: str,
    ) -> dict[str, Any]:
        mapped = map_public_write(command)
        if mapped.expectedRevision < 1:
            raise RemoteCommandError("REMOTE_REVISION_CONFLICT", 409)
        if mapped.params["attachmentIds"]:
            # The current Host message writer has no attachment storage. Do
            # not acknowledge attachments that it cannot actually preserve.
            raise RemoteCommandError("REMOTE_ATTACHMENT_UNAVAILABLE", 422)
        canonical = json.dumps({
            "method": command.method, "projectId": command.projectId,
            "resourceId": command.resourceId,
            "expectedRevision": command.expectedRevision,
            "payload": command.payload,
        }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        request_hash = hashlib.sha256(canonical.encode()).hexdigest()
        with self.storage.transaction() as db:
            # Recheck the current Host-owned identity and operation grant under
            # the same write lock as CAS, message and receipt insertion.
            identity = self.sessions.require_csrf(token, csrf)
            project_id = str(mapped.projectId)
            if project_id not in identity["projectIds"]:
                raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
            self.policy.require_operation(identity, project_id, command.method)
            prior = db.execute(
                "SELECT command_id,device_id,project_id,method,idempotency_key,"
                "request_hash,receipt_json FROM remote_command_receipts "
                "WHERE command_id=? OR (device_id=? AND idempotency_key=?)",
                (command.commandId, identity["deviceId"], command.idempotencyKey),
            ).fetchall()
            if prior:
                if len(prior) != 1 or any(
                    row["device_id"] != identity["deviceId"]
                    or row["project_id"] != project_id
                    or row["method"] != command.method
                    or row["idempotency_key"] != command.idempotencyKey
                    or row["request_hash"] != request_hash for row in prior
                ):
                    raise RemoteCommandError("REMOTE_IDEMPOTENCY_CONFLICT", 409)
                return _CommandReceipt.model_validate_json(prior[0]["receipt_json"]).model_dump()
            try:
                # Partition the existing ConversationService's unique key by
                # authenticated device. A second device cannot turn its own
                # first send into a replay of another device's message.
                scoped_key = "remote:" + hashlib.sha256(
                    f"{identity['deviceId']}:{command.idempotencyKey}".encode()
                ).hexdigest()
                sent = self.conversations.send_in_transaction(
                    db, ConversationSend.model_validate_json(json.dumps({
                        **mapped.params, "idempotencyKey": scoped_key,
                    })),
                    expected_revision=mapped.expectedRevision,
                )
            except ConversationError as error:
                status = 404 if error.code in ("CONVERSATION_NOT_FOUND", "PROJECT_NOT_FOUND") \
                    else 409
                raise RemoteCommandError(error.code, status) from error
            if sent["replay"]:
                raise RemoteCommandError("REMOTE_IDEMPOTENCY_CONFLICT", 409)
            current = self.conversations.get(project_id, mapped.params["conversationId"])
            assert current is not None
            receipt = _CommandReceipt(
                commandId=command.commandId, status="completed", operationId=None,
                resourceRevision=current.revision,
                result=to_jsonable_python(sent), error=None,
            ).model_dump()
            db.execute(
                "INSERT INTO remote_command_receipts(command_id,device_id,project_id,"
                "method,idempotency_key,request_hash,receipt_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (command.commandId, identity["deviceId"], project_id, command.method,
                 command.idempotencyKey, request_hash,
                 json.dumps(receipt, separators=(",", ":"), ensure_ascii=False),
                 datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")),
            )
            return receipt

    def _approve_task(
        self, command: _CommandEnvelope, approval: _ApprovalPayload,
        token: str, csrf: str,
    ) -> dict[str, Any]:
        # The public method is approve-only. Its envelope revision and payload
        # scope hash are the exact fields of the local approval decision; the
        # local approve path already records an empty reason (unlike reject).
        if command.expectedRevision < 1:
            raise RemoteCommandError("REMOTE_APPROVAL_STALE", 409)
        project_id = command.projectId
        assert project_id is not None
        canonical = json.dumps({
            "method": command.method, "projectId": project_id,
            "resourceId": command.resourceId,
            "expectedRevision": command.expectedRevision,
            "payload": command.payload,
        }, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        request_hash = hashlib.sha256(canonical.encode()).hexdigest()
        with self.storage.transaction() as db:
            identity = self.sessions.require_csrf(token, csrf)
            if project_id not in identity["projectIds"]:
                raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
            self.policy.require_operation(identity, project_id, command.method)
            prior = db.execute(
                "SELECT command_id,device_id,project_id,method,idempotency_key,"
                "request_hash,receipt_json FROM remote_command_receipts "
                "WHERE command_id=? OR (device_id=? AND idempotency_key=?)",
                (command.commandId, identity["deviceId"], command.idempotencyKey),
            ).fetchall()
            if prior:
                if len(prior) != 1 or any(
                    row["device_id"] != identity["deviceId"]
                    or row["project_id"] != project_id
                    or row["method"] != command.method
                    or row["idempotency_key"] != command.idempotencyKey
                    or row["request_hash"] != request_hash for row in prior
                ):
                    raise RemoteCommandError("REMOTE_IDEMPOTENCY_CONFLICT", 409)
                return _CommandReceipt.model_validate_json(prior[0]["receipt_json"]).model_dump()
            self.policy.approval_fresh(
                identity, project_id, str(approval.approvalId),
                command.expectedRevision, approval.scopeHash,
            )
            decision = ApprovalDecision(
                schemaVersion="1.0", approvalId=approval.approvalId,
                decision="approve", expectedRevision=command.expectedRevision,
                scopeHash=approval.scopeHash, reason="",
            )
            try:
                result = self.approvals.decide(ApprovalDecideInput(
                    projectId=UUID(project_id), decision=decision,
                ), session=db)
            except ApprovalError as error:
                status = 404 if error.code == "APPROVAL_NOT_FOUND" else 409
                raise RemoteCommandError(error.code, status) from error
            if result.status != "approved" or result.taskState != "todo":
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503)
            receipt = _CommandReceipt(
                commandId=command.commandId, status="completed", operationId=None,
                resourceRevision=result.request.expectedRevision,
                result={"approvalId": str(result.request.approvalId),
                        "taskId": str(result.request.taskId), "state": "todo",
                        "revision": result.request.expectedRevision},
                error=None,
            ).model_dump()
            db.execute(
                "INSERT INTO remote_command_receipts(command_id,device_id,project_id,"
                "method,idempotency_key,request_hash,receipt_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (command.commandId, identity["deviceId"], project_id, command.method,
                 command.idempotencyKey, request_hash,
                 json.dumps(receipt, separators=(",", ":"), ensure_ascii=False),
                 datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")),
            )
            return receipt

    def handle_receipt(self, value: dict[str, Any]) -> dict[str, Any]:
        if set(value) != {"sessionToken", "commandId"} or not all(
            isinstance(item, str) for item in value.values()
        ):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        command_id = value["commandId"]
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", command_id) is None:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        identity = self.sessions.authenticate(value["sessionToken"])
        row = self.storage.session().execute(
            "SELECT project_id,method,receipt_json FROM remote_command_receipts "
            "WHERE command_id=? AND device_id=?",
            (command_id, identity["deviceId"]),
        ).fetchone()
        if row is None:
            raise RemoteCommandError("REMOTE_COMMAND_NOT_FOUND", 404)
        if row["project_id"] not in identity["projectIds"]:
            raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
        try:
            self.policy.require_operation(identity, row["project_id"], row["method"])
        except RemotePolicyError as error:
            raise RemoteCommandError(error.code, error.status) from error
        try:
            return _CommandReceipt.model_validate_json(row["receipt_json"]).model_dump()
        except ValidationError as error:
            raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error

    def handle_approvals(self, value: dict[str, Any]) -> dict[str, Any]:
        """Read current, decidable Task approvals for the authenticated device."""
        if (set(value) != {"sessionToken", "cursor", "limit"}
                or not isinstance(value["sessionToken"], str)
                or (value["cursor"] is not None and not isinstance(value["cursor"], str))
                or type(value["limit"]) is not int or not 1 <= value["limit"] <= 50):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        cursor = value["cursor"]
        if cursor is not None and re.fullmatch(r"a:[1-9][0-9]{0,15}", cursor) is None:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        identity = self.sessions.authenticate(value["sessionToken"])
        project_ids: list[str] = []
        for project_id in identity["projectIds"]:
            try:
                self.policy.require_operation(identity, project_id, "tasks.approve")
                project_ids.append(project_id)
            except RemotePolicyError as error:
                if error.code not in ("REMOTE_OPERATION_FORBIDDEN",
                                      "REMOTE_PROJECT_FORBIDDEN"):
                    raise RemoteCommandError(error.code, error.status) from error
        if not project_ids:
            return {"items": [], "page": {"cursor": None, "hasMore": False}}
        placeholders = ",".join("?" for _ in project_ids)
        params: list[Any] = [*project_ids]
        boundary = ""
        if cursor is not None:
            boundary = " AND rowid<?"
            params.append(int(cursor[2:]))
        rows = self.storage.session().execute(
            "SELECT rowid,approval_id,project_id,draft_id,expected_revision,"
            "scope_hash,request_json FROM task_approvals "
            f"WHERE status='pending' AND project_id IN ({placeholders}){boundary} "
            "ORDER BY rowid DESC LIMIT ?", (*params, value["limit"] + 1),
        ).fetchall()
        visible: list[dict[str, Any]] = []
        for row in rows[:value["limit"]]:
            try:
                self.policy.approval_fresh(
                    identity, row["project_id"], row["approval_id"],
                    row["expected_revision"], row["scope_hash"],
                )
            except RemotePolicyError as error:
                if error.code == "REMOTE_APPROVAL_STALE":
                    continue
                raise RemoteCommandError(error.code, error.status) from error
            try:
                request = json.loads(row["request_json"])
                visible.append({key: request[key] for key in (
                    "approvalId", "projectId", "taskId", "expectedRevision",
                    "scopeHash", "expiresAt", "summary", "risk", "requiredScope",
                )})
            except (ValueError, KeyError, TypeError) as error:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
        answer = {"items": visible, "page": {
            "cursor": f"a:{rows[value['limit'] - 1]['rowid']}"
            if len(rows) > value["limit"] else None,
            "hasMore": len(rows) > value["limit"],
        }}
        if len(json.dumps(answer, ensure_ascii=False).encode()) > 512 * 1024:
            raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
        return answer

    def _approval_detail(
        self, approval_id: UUID, identity: dict[str, Any],
    ) -> dict[str, Any]:
        # Approval URLs have no Project field. Search only current device grants.
        row = self.storage.session().execute(
            "SELECT project_id,draft_id,expected_revision,scope_hash,request_json "
            "FROM task_approvals WHERE approval_id=?", (str(approval_id),),
        ).fetchone()
        if row is None or row["project_id"] not in identity["projectIds"]:
            raise RemoteCommandError("REMOTE_APPROVAL_NOT_FOUND", 404)
        try:
            self.policy.approval_fresh(
                identity, row["project_id"], str(approval_id),
                row["expected_revision"], row["scope_hash"],
            )
        except RemotePolicyError as error:
            if error.code in ("REMOTE_OPERATION_FORBIDDEN", "REMOTE_PROJECT_FORBIDDEN"):
                raise RemoteCommandError("REMOTE_APPROVAL_NOT_FOUND", 404) from error
            raise RemoteCommandError(error.code, error.status) from error
        try:
            request = ApprovalRequest.model_validate_json(row["request_json"])
        except ValidationError as error:
            raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
        draft = self.approvals.drafts.get(row["project_id"], row["draft_id"])
        if draft is None or draft.contract is None:
            raise RemoteCommandError("REMOTE_APPROVAL_STALE", 409)
        answer = {"approvalId": str(request.approvalId),
                  "projectId": str(request.projectId),
                  "taskId": str(request.taskId),
                  "expectedRevision": request.expectedRevision,
                  "scopeHash": request.scopeHash,
                  "snapshotId": request.snapshotId,
                  "actionDigest": request.actionDigest,
                  "expiresAt": request.expiresAt,
                  "summary": request.summary,
                  "risk": request.risk,
                  "requiredScope": request.requiredScope,
                  "deviceOperationScope": "task:approve",
                  "contract": draft.contract.model_dump(mode="json")}
        if len(json.dumps(answer, ensure_ascii=False).encode()) > 512 * 1024:
            raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
        return answer

    async def _task_detail(self, task_id: UUID, project_ids: list[str]) -> dict[str, Any]:
        # The public URL contains no project ID. Search only projects granted to
        # this session and make an out-of-scope task indistinguishable from absent.
        for project_id in project_ids:
            try:
                result = await self.invoke_host(RpcRequest(
                    jsonrpc="2.0", id=str(uuid4()), method="task.detail",
                    params={"projectId": project_id, "taskId": str(task_id)},
                    transportVersion="forge-local-jsonrpc/v1",
                ))
            except ProtocolError as error:
                if error.code in ("TASK_NOT_FOUND", "PROJECT_NOT_FOUND"):
                    continue
                raise RemoteCommandError(error.code, 409) from error
            data = result.get("data")
            if not isinstance(data, dict) or not isinstance(data.get("detail"), dict):
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503)
            detail = data["detail"]
            task = detail.get("task")
            if not isinstance(task, dict) or task.get("projectId") != project_id:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503)
            fields = ("id", "projectId", "title", "state", "boardColumn", "revision",
                      "contractRevision", "approvedRevision", "activeRunId",
                      "blockReason")
            try:
                summary = {key: task[key] for key in fields}
                answer = {"task": {**summary, "allowedCommands": []},
                          "contract": detail["contract"],
                          "runIds": detail["runIds"],
                          "artifactIds": detail["artifactIds"],
                          "pendingApprovalIds": detail["pendingApprovalIds"],
                          "evidence": read_remote_task_evidence(
                              self.storage, project_id, task_id,
                          )}
            except KeyError as error:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
            if len(json.dumps(answer, ensure_ascii=False).encode()) > 512 * 1024:
                raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
            return answer
        raise RemoteCommandError("REMOTE_TASK_NOT_FOUND", 404)

    async def _task_activity(
        self, query: _TaskActivityQuery, project_ids: list[str],
    ) -> dict[str, Any]:
        detail = await self._task_detail(query.taskId, project_ids)
        project_id = detail["task"]["projectId"]
        boundary = None
        if query.cursor is not None:
            match = re.fullmatch(r"o:([1-9][0-9]{0,15})", query.cursor)
            if match is None:
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
            boundary = int(match[1])
        rows = self.storage.session().execute(
            "SELECT o.cursor,o.run_id,o.type,o.text,o.created_at "
            "FROM run_observations o JOIN runs r ON r.run_id=o.run_id "
            "WHERE r.project_id=? AND r.task_id=? AND (? IS NULL OR o.cursor<?) "
            "ORDER BY o.cursor DESC LIMIT ?",
            (project_id, str(query.taskId), boundary, boundary, query.limit + 1),
        ).fetchall()
        page = rows[:query.limit]
        answer = {"taskId": str(query.taskId), "items": [{
            "cursor": row["cursor"], "runId": row["run_id"],
            "type": row["type"], "text": redact(row["text"])[:2048],
            "timestamp": row["created_at"],
        } for row in page], "page": {
            "cursor": f"o:{page[-1]['cursor']}" if len(rows) > query.limit else None,
            "hasMore": len(rows) > query.limit,
        }}
        if len(json.dumps(answer, ensure_ascii=False).encode()) > 512 * 1024:
            raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
        return answer

    async def _task_diff(
        self, query: _TaskDiffQuery, project_ids: list[str],
    ) -> dict[str, Any]:
        detail = await self._task_detail(query.taskId, project_ids)
        return read_remote_diff_page(self.storage, detail["task"]["projectId"],
                                     query.taskId, query.cursor, query.limit)

    async def handle_query(self, value: dict[str, Any]) -> dict[str, Any]:
        token = value.get("sessionToken")
        method = value.get("method")
        request = value.get("payload")
        if (set(value) != {"sessionToken", "method", "payload"}
                or not isinstance(token, str) or not isinstance(method, str)
                or not isinstance(request, dict)):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        identity = self.sessions.authenticate(token)
        schema = _READS.get(method)
        if schema is None:
            raise RemoteCommandError("REMOTE_COMMAND_NOT_ALLOWED", 403)
        try:
            payload = schema.model_validate_json(json.dumps(request))
        except ValidationError as error:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        project_id = getattr(payload, "projectId", None)
        if project_id is not None and str(project_id) not in identity["projectIds"]:
            raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
        if method == "conversation.page":
            assert isinstance(payload, _ConversationPageQuery)
            try:
                conversations = self.conversations.list_conversations(str(payload.projectId))
            except ConversationError as error:
                status = 404 if error.code == "PROJECT_NOT_FOUND" else 409
                raise RemoteCommandError(error.code, status) from error
            snapshot = hashlib.sha256("|".join(
                f"{item.conversationId}:{item.revision}" for item in conversations
            ).encode()).hexdigest()[:16]
            offset = 0
            if payload.cursor is not None:
                match = re.fullmatch(r"c:([a-f0-9]{16}):(0|[1-9][0-9]{0,15})",
                                     payload.cursor)
                if match is None:
                    raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
                if match[1] != snapshot:
                    raise RemoteCommandError("REMOTE_CURSOR_STALE", 409)
                offset = int(match[2])
                if offset > len(conversations):
                    raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
            conversation_page = conversations[offset:offset + payload.limit]
            conversation_next_offset = offset + len(conversation_page)
            conversation_answer = {"projectId": str(payload.projectId), "items": [
                {"conversationId": str(item.conversationId),
                 "projectId": str(item.projectId), "title": item.title,
                 "revision": item.revision, "updatedAt": item.updatedAt}
                for item in conversation_page
            ], "page": {"cursor": f"c:{snapshot}:{conversation_next_offset}"
                        if conversation_next_offset < len(conversations) else None,
                        "hasMore": conversation_next_offset < len(conversations)}}
            if len(json.dumps(conversation_answer, ensure_ascii=False).encode()) > 128 * 1024:
                raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
            return conversation_answer
        if method == "draft.page":
            assert isinstance(payload, _DraftPageQuery)
            try:
                self.policy.require_operation(identity, str(payload.projectId),
                                              "tasks.revise")
            except RemotePolicyError as error:
                raise RemoteCommandError(error.code, error.status) from error
            before = None
            if payload.cursor is not None:
                match = re.fullmatch(r"d:([1-9][0-9]{0,15})", payload.cursor)
                if match is None:
                    raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
                before = int(match[1])
            draft_rows = self.drafts.page_drafts(str(payload.projectId),
                                                 str(payload.conversationId),
                                                 before, payload.limit)
            draft_page = draft_rows[:payload.limit]
            draft_answer = {"projectId": str(payload.projectId),
                      "conversationId": str(payload.conversationId),
                      "items": [{"draftId": str(item.draftId),
                                 "projectId": str(item.projectId),
                                 "conversationId": str(item.conversationId),
                                 "sourceMessageId": str(item.sourceMessageId),
                                 "revision": item.revision, "status": item.status,
                                 "canRevise": self.drafts.can_revise(item),
                                 "contract": item.contract.model_dump(mode="json")
                                 if item.contract else None,
                                 "updatedAt": item.updatedAt}
                                for _, item in draft_page],
                      "page": {"cursor": f"d:{draft_page[-1][0]}"
                               if len(draft_rows) > payload.limit and draft_page else None,
                               "hasMore": len(draft_rows) > payload.limit}}
            if len(json.dumps(draft_answer, ensure_ascii=False).encode()) > 128 * 1024:
                raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
            return draft_answer
        if method == "message.page":
            assert isinstance(payload, _MessagePageQuery)
            try:
                self.policy.require_operation(identity, str(payload.projectId),
                                              "conversations.send")
            except RemotePolicyError as error:
                raise RemoteCommandError(error.code, error.status) from error
            before = None
            if payload.cursor is not None:
                match = re.fullmatch(r"m:([1-9][0-9]{0,15})", payload.cursor)
                if match is None:
                    raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
                before = int(match[1])
            try:
                rows = self.conversations.page_visible_messages(
                    str(payload.projectId), str(payload.conversationId),
                    before, payload.limit,
                )
            except ConversationError as error:
                raise RemoteCommandError(error.code, 404) from error
            message_page = rows[:payload.limit]
            oldest = message_page[-1].sequence if message_page else None
            message_answer = {"projectId": str(payload.projectId),
                      "conversationId": str(payload.conversationId),
                      "items": [{"messageId": str(item.messageId),
                                 "conversationId": str(item.conversationId),
                                 "sequence": item.sequence, "role": item.role,
                                 "content": item.content[:4000],
                                 "truncated": len(item.content) > 4000,
                                 "status": item.status,
                                 "createdAt": item.createdAt}
                                for item in reversed(message_page)],
                      "page": {"cursor": f"m:{oldest}"
                               if len(rows) > payload.limit and oldest is not None else None,
                               "hasMore": len(rows) > payload.limit}}
            if len(json.dumps(message_answer, ensure_ascii=False).encode()) > 128 * 1024:
                raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
            return message_answer
        if method == "task.detail":
            assert isinstance(payload, _Task)
            return await self._task_detail(payload.taskId, identity["projectIds"])
        if method == "task.activity":
            assert isinstance(payload, _TaskActivityQuery)
            return await self._task_activity(payload, identity["projectIds"])
        if method == "task.diff":
            assert isinstance(payload, _TaskDiffQuery)
            return await self._task_diff(payload, identity["projectIds"])
        if method == "approval.detail":
            assert isinstance(payload, _ApprovalDetailQuery)
            return self._approval_detail(payload.approvalId, identity)
        try:
            result = await self.invoke_host(RpcRequest(
                jsonrpc="2.0", id=str(uuid4()),
                method="board.snapshot" if method == "task.page" else method,
                params={} if method == "project.list" else (
                    {"projectId": str(payload.projectId)}
                    if method == "task.page" and isinstance(payload, _TaskPageQuery)
                    else payload.model_dump(mode="json")
                ),
                transportVersion="forge-local-jsonrpc/v1",
            ))
        except ProtocolError as error:
            status = 404 if error.code.endswith("NOT_FOUND") else 409 if (
                "CONFLICT" in error.code or "STALE" in error.code
            ) else 400
            raise RemoteCommandError(error.code, status) from error
        data = result.get("data")
        answer: dict[str, Any]
        if method == "project.list":
            assert isinstance(data, list)
            assert isinstance(payload, _ProjectPageQuery)
            allowed = sorted((item for item in data
                              if item["projectId"] in identity["projectIds"]
                              and (payload.cursor is None
                                   or item["projectId"] > str(payload.cursor))),
                             key=lambda item: item["projectId"])
            page = allowed[:payload.limit]
            items = [{"id": item["projectId"], "name": item["name"],
                      "revision": item["revision"],
                      "defaultBranch": item["defaultBranch"] or "unknown",
                      "online": True}
                     for item in page]
            more = len(allowed) > payload.limit
            answer = {"items": items, "page": {
                "cursor": page[-1]["projectId"] if more and page else None,
                "hasMore": more,
            }}
        elif method == "task.page":
            assert isinstance(payload, _TaskPageQuery)
            if not isinstance(data, dict) or data.get("projectId") != str(payload.projectId):
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503)
            revision = data.get("boardRevision")
            if type(revision) is not int or revision < 0:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503)
            offset = 0
            if payload.cursor is not None:
                match = re.fullmatch(
                    r"b:(0|[1-9][0-9]{0,15}):(0|[1-9][0-9]{0,15})",
                    payload.cursor,
                )
                if match is None:
                    raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
                if int(match[1]) != revision:
                    raise RemoteCommandError("REMOTE_CURSOR_STALE", 409)
                offset = int(match[2])
            tasks = data.get("tasks")
            if not isinstance(tasks, list) or offset > len(tasks):
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
            # Keep Host board order within each priority. A blocked or awaiting
            # item is never hidden behind pages of ordinary TODOs.
            try:
                prioritized = sorted(tasks, key=lambda item: 0 if item["state"] in (
                    "blocked", "awaiting_acceptance"
                ) else 1)
            except (KeyError, TypeError) as error:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
            selected = prioritized[offset:offset + payload.limit]
            fields = ("id", "projectId", "title", "state", "boardColumn", "revision",
                      "contractRevision", "approvedRevision", "activeRunId",
                      "blockReason")
            try:
                items = [{**{key: item[key] for key in fields}, "allowedCommands": []}
                         for item in selected]
            except (KeyError, TypeError) as error:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
            next_offset = offset + len(selected)
            answer = {"projectId": data["projectId"], "tasks": items,
                      "boardRevision": revision,
                      "eventCursor": self.snapshot_cursor(data["projectId"]),
                      "serverTime": data["serverTime"],
                      "page": {"cursor": f"b:{revision}:{next_offset}"
                               if next_offset < len(tasks) else None,
                               "hasMore": next_offset < len(tasks)}}
        else:
            assert isinstance(data, dict)
            # The reference OpenAPI omitted the existing Host `blocked` state.
            # The production remote read model preserves it verbatim; a mobile
            # inbox must never hide or mislabel a blocked Task.
            fields = ("id", "projectId", "title", "state", "boardColumn", "revision",
                      "contractRevision", "approvedRevision", "activeRunId",
                      "blockReason")
            answer = {"projectId": data["projectId"],
                      "eventCursor": self.snapshot_cursor(data["projectId"]),
                      "serverTime": data["serverTime"],
                      "tasks": [{**{key: item[key] for key in fields}, "allowedCommands": []}
                                for item in data["tasks"]]}
        if len(json.dumps(answer, ensure_ascii=False).encode()) > 512 * 1024:
            raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
        return answer

    def handle_command(self, value: dict[str, Any]) -> dict[str, Any]:
        if (set(value) != {"sessionToken", "csrfToken", "request"}
                or not isinstance(value["sessionToken"], str)
                or not isinstance(value["csrfToken"], str)
                or not isinstance(value["request"], dict)):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        identity = self.sessions.require_csrf(value["sessionToken"], value["csrfToken"])
        try:
            command = _CommandEnvelope.model_validate_json(json.dumps(value["request"]))
        except ValidationError as error:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        if set(command.payload).intersection(("actor", "scopes", "scope")):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        if (command.projectId is not None
                and command.projectId not in identity["projectIds"]):
            raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
        if command.method not in _PLANNED_REMOTE_WRITES:
            raise RemoteCommandError("REMOTE_COMMAND_NOT_ALLOWED", 403)
        if command.projectId is None:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        if command.method == "tasks.approve":
            try:
                approval = _ApprovalPayload.model_validate_json(json.dumps(command.payload))
                if (command.resourceId is not None
                        and UUID(command.resourceId) != approval.approvalId):
                    raise RemoteCommandError("REMOTE_RESOURCE_MISMATCH", 409)
            except (ValueError, ValidationError) as error:
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        elif command.method == "conversations.send":
            # Parse the public body without inventing missing Host fields.
            map_public_write(command)
        elif command.method == "tasks.createDraft":
            try:
                create_payload = _TaskCreatePayload.model_validate_json(json.dumps(command.payload))
            except ValidationError as error:
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        elif command.method == "tasks.revise":
            try:
                revise_payload = _TaskRevisePayload.model_validate_json(json.dumps(command.payload))
            except ValidationError as error:
                raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        try:
            self.policy.require_operation(identity, command.projectId, command.method)
        except RemotePolicyError as error:
            raise RemoteCommandError(error.code, error.status) from error
        if command.method == "conversations.send":
            try:
                return self._send_conversation(
                    command, value["sessionToken"], value["csrfToken"]
                )
            except RemotePolicyError as error:
                raise RemoteCommandError(error.code, error.status) from error
        if command.method == "tasks.approve":
            try:
                return self._approve_task(
                    command, approval, value["sessionToken"], value["csrfToken"]
                )
            except RemotePolicyError as error:
                raise RemoteCommandError(error.code, error.status) from error
        if command.method == "tasks.createDraft":
            try:
                return self._create_draft(
                    command, create_payload, value["sessionToken"], value["csrfToken"]
                )
            except RemotePolicyError as error:
                raise RemoteCommandError(error.code, error.status) from error
        if command.method == "tasks.revise":
            try:
                return self._revise_draft(
                    command, revise_payload, value["sessionToken"], value["csrfToken"]
                )
            except RemotePolicyError as error:
                raise RemoteCommandError(error.code, error.status) from error
        # An operation grant and fresh approval are necessary, never sufficient.
        # Other public writes await exact CAS/idempotency mapping.
        raise RemoteCommandError("REMOTE_COMMAND_MAPPING_UNAVAILABLE", 403)
