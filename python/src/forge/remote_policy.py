"""Host-owned device operation grants and version-bound approval preflight."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.approvals import ApprovalRequest, contract_digest, scope_hash
from forge.drafts import DraftService
from forge.persistence import ForgePersistence

RemoteScope = Literal[
    "task:draft", "task:approve", "run:start", "run:pause",
    "run:cancel", "acceptance:decide",
]
REMOTE_COMMAND_SCOPES: dict[str, RemoteScope] = {
    "conversations.send": "task:draft",
    "tasks.createDraft": "task:draft",
    "tasks.revise": "task:draft",
    "tasks.approve": "task:approve",
    "runs.start": "run:start",
    "runs.pause": "run:pause",
    "runs.resume": "run:start",
    "runs.cancel": "run:cancel",
    "acceptance.decide": "acceptance:decide",
}


class RemotePolicyError(Exception):
    def __init__(self, code: str, status: int) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


class DevicePolicyNarrow(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    deviceId: UUID
    expectedRevision: int = Field(ge=1)
    projectIds: list[UUID] = Field(max_length=32)
    scopes: list[RemoteScope] = Field(max_length=6)


class DevicePolicyRevoke(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    deviceId: UUID
    expectedRevision: int = Field(ge=1)


def _stamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class RemotePolicyService:
    def __init__(self, storage: ForgePersistence, drafts: DraftService) -> None:
        self.storage = storage
        self.drafts = drafts

    def audit(self, device_id: UUID) -> list[dict[str, Any]]:
        exists = self.storage.session().execute(
            "SELECT 1 FROM paired_devices WHERE device_id=?", (str(device_id),)
        ).fetchone()
        if exists is None:
            raise RemotePolicyError("REMOTE_DEVICE_NOT_FOUND", 404)
        rows = self.storage.session().execute(
            "SELECT event_id,old_revision,new_revision,old_project_ids_json,"
            "new_project_ids_json,old_scopes_json,new_scopes_json,kind,decided_at "
            "FROM device_policy_events WHERE device_id=? "
            "ORDER BY new_revision DESC LIMIT 100", (str(device_id),),
        ).fetchall()
        return [{"eventId": row["event_id"], "kind": row["kind"],
                 "oldRevision": row["old_revision"],
                 "newRevision": row["new_revision"],
                 "oldProjectIds": json.loads(row["old_project_ids_json"]),
                 "newProjectIds": json.loads(row["new_project_ids_json"]),
                 "oldScopes": json.loads(row["old_scopes_json"]),
                 "newScopes": json.loads(row["new_scopes_json"]),
                 "decidedAt": row["decided_at"]} for row in rows]

    def require_operation(self, identity: dict[str, Any], project_id: str,
                          method: str) -> RemoteScope:
        required = REMOTE_COMMAND_SCOPES.get(method)
        if required is None:
            raise RemotePolicyError("REMOTE_COMMAND_NOT_ALLOWED", 403)
        # Identity comes only from a freshly authenticated, Host-owned session.
        # Still re-read the device row on every operation: a cached scope never
        # grants a right after narrowing or revocation.
        row = self.storage.session().execute(
            "SELECT project_ids_json,operation_scopes_json,status "
            "FROM paired_devices WHERE device_id=?",
            (identity["deviceId"],),
        ).fetchone()
        if row is None or row["status"] != "approved":
            raise RemotePolicyError("REMOTE_AUTH_REJECTED", 401)
        if project_id not in json.loads(row["project_ids_json"]):
            raise RemotePolicyError("REMOTE_PROJECT_FORBIDDEN", 403)
        if required not in json.loads(row["operation_scopes_json"]):
            raise RemotePolicyError("REMOTE_OPERATION_FORBIDDEN", 403)
        return required

    def approval_fresh(self, identity: dict[str, Any], project_id: str,
                       approval_id: str, expected_revision: int,
                       expected_scope_hash: str) -> None:
        self.require_operation(identity, project_id, "tasks.approve")
        try:
            approval_uuid = UUID(approval_id)
        except ValueError as error:
            raise RemotePolicyError("REMOTE_INVALID_REQUEST", 400) from error
        row = self.storage.session().execute(
            "SELECT draft_id,expected_revision,scope_hash,action_digest,"
            "request_json,status FROM task_approvals "
            "WHERE project_id=? AND approval_id=?",
            (project_id, str(approval_uuid)),
        ).fetchone()
        if row is None:
            raise RemotePolicyError("REMOTE_APPROVAL_NOT_FOUND", 404)
        try:
            request = ApprovalRequest.model_validate_json(row["request_json"])
        except ValidationError as error:
            raise RemotePolicyError("REMOTE_APPROVAL_INVALID", 409) from error
        draft = self.drafts.get(project_id, row["draft_id"])
        if (
            row["status"] != "pending"
            or str(request.approvalId) != str(approval_uuid)
            or str(request.projectId) != project_id
            or str(request.taskId) != row["draft_id"]
            or request.expectedRevision != row["expected_revision"]
            or request.actionDigest != row["action_digest"]
            or row["expected_revision"] != expected_revision
            or row["scope_hash"] != expected_scope_hash
            or request.scopeHash != expected_scope_hash
            or request.expiresAt <= _stamp()
            or draft is None or draft.contract is None
            or draft.revision != expected_revision
            or contract_digest(draft.contract) != row["action_digest"]
            or scope_hash(draft.contract) != expected_scope_hash
        ):
            raise RemotePolicyError("REMOTE_APPROVAL_STALE", 409)

    def narrow(self, request: DevicePolicyNarrow) -> dict[str, Any]:
        target_projects = [str(item) for item in request.projectIds]
        target_scopes = list(request.scopes)
        if (len(set(target_projects)) != len(target_projects)
                or len(set(target_scopes)) != len(target_scopes)):
            raise RemotePolicyError("REMOTE_INVALID_REQUEST", 400)
        with self.storage.transaction() as session:
            row = session.execute(
                "SELECT project_ids_json,operation_scopes_json,policy_revision,status "
                "FROM paired_devices WHERE device_id=?",
                (str(request.deviceId),),
            ).fetchone()
            if row is None or row["status"] != "approved":
                raise RemotePolicyError("REMOTE_DEVICE_NOT_FOUND", 404)
            if row["policy_revision"] != request.expectedRevision:
                raise RemotePolicyError("REMOTE_POLICY_STALE", 409)
            if (not set(target_projects) <= set(json.loads(row["project_ids_json"]))
                    or not set(target_scopes) <= set(json.loads(
                        row["operation_scopes_json"]))):
                raise RemotePolicyError("REMOTE_SCOPE_EXPANSION_FORBIDDEN", 403)
            changed = session.execute(
                "UPDATE paired_devices SET project_ids_json=?,operation_scopes_json=?,"
                "policy_revision=policy_revision+1 WHERE device_id=? AND status='approved'"
                " AND policy_revision=?",
                (json.dumps(target_projects), json.dumps(target_scopes),
                 str(request.deviceId), request.expectedRevision),
            )
            if changed.rowcount != 1:
                raise RemotePolicyError("REMOTE_POLICY_STALE", 409)
            session.execute(
                "INSERT INTO device_policy_events(event_id,device_id,old_revision,"
                "new_revision,old_project_ids_json,new_project_ids_json,"
                "old_scopes_json,new_scopes_json,kind,decided_at) "
                "VALUES(?,?,?,?,?,?,?,?,'narrow',?)",
                (str(uuid4()), str(request.deviceId), request.expectedRevision,
                 request.expectedRevision + 1, row["project_ids_json"],
                 json.dumps(target_projects), row["operation_scopes_json"],
                 json.dumps(target_scopes), _stamp()),
            )
        return {"deviceId": str(request.deviceId),
                "revision": request.expectedRevision + 1,
                "projectIds": target_projects, "scopes": target_scopes,
                "status": "approved"}

    def revoke(self, request: DevicePolicyRevoke) -> dict[str, Any]:
        with self.storage.transaction() as session:
            row = session.execute(
                "SELECT project_ids_json,operation_scopes_json,policy_revision,status "
                "FROM paired_devices WHERE device_id=?",
                (str(request.deviceId),),
            ).fetchone()
            if row is None or row["status"] != "approved":
                raise RemotePolicyError("REMOTE_DEVICE_NOT_FOUND", 404)
            if row["policy_revision"] != request.expectedRevision:
                raise RemotePolicyError("REMOTE_POLICY_STALE", 409)
            now = _stamp()
            session.execute(
                "UPDATE paired_devices SET status='revoked',revoked_at=?,"
                "policy_revision=policy_revision+1 WHERE device_id=?",
                (now, str(request.deviceId)),
            )
            session.execute(
                "UPDATE device_sessions SET revoked_at=? WHERE device_id=? "
                "AND revoked_at IS NULL", (now, str(request.deviceId)),
            )
            session.execute(
                "INSERT INTO device_policy_events(event_id,device_id,old_revision,"
                "new_revision,old_project_ids_json,new_project_ids_json,"
                "old_scopes_json,new_scopes_json,kind,decided_at) "
                "VALUES(?,?,?,?,?,?,?,?, 'revoke',?)",
                (str(uuid4()), str(request.deviceId), request.expectedRevision,
                 request.expectedRevision + 1, row["project_ids_json"], "[]",
                 row["operation_scopes_json"], "[]", now),
            )
        return {"deviceId": str(request.deviceId), "revision": request.expectedRevision + 1,
                "projectIds": [], "scopes": [], "status": "revoked"}
