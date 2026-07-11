"""Closed HTTP-to-Host read adapter; remote writes await P7-07 authorization."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.protocol import ProtocolError, RpcRequest
from forge.remote_sessions import RemoteSessionService


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


class _ProjectPageQuery(_Closed):
    limit: int = Field(default=50, ge=1, le=100)
    cursor: UUID | None = None


class _CommandEnvelope(_Closed):
    schemaVersion: str = Field(pattern=r"^1\.0$")
    commandId: str = Field(min_length=1, max_length=128)
    method: str = Field(min_length=1, max_length=80)
    projectId: str | None
    resourceId: str | None
    expectedRevision: int = Field(ge=0)
    idempotencyKey: str = Field(min_length=16, max_length=128)
    payload: dict[str, Any]


# Any command not listed here is refused before it can reach Host dispatch.
_READS: dict[str, type[_Closed]] = {
    "project.list": _ProjectPageQuery,
    "board.snapshot": _Project,
    "task.detail": _Task,
}
_PLANNED_REMOTE_WRITES = frozenset((
    "conversations.send", "tasks.createDraft", "tasks.revise", "tasks.approve",
    "runs.start", "runs.pause", "runs.resume", "runs.cancel", "acceptance.decide",
))


class RemoteCommandDispatcher:
    def __init__(
        self, sessions: RemoteSessionService,
        invoke_host: Callable[[RpcRequest], Awaitable[dict[str, Any]]],
    ) -> None:
        self.sessions = sessions
        self.invoke_host = invoke_host

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
            if task.get("state") == "blocked":
                raise RemoteCommandError("REMOTE_SCHEMA_UNSUPPORTED", 409)
            fields = ("id", "projectId", "title", "state", "boardColumn", "revision",
                      "contractRevision", "approvedRevision", "activeRunId",
                      "blockReason")
            try:
                summary = {key: task[key] for key in fields}
                answer = {"task": {**summary, "allowedCommands": []},
                          "contract": detail["contract"],
                          "runIds": detail["runIds"],
                          "artifactIds": detail["artifactIds"],
                          "pendingApprovalIds": detail["pendingApprovalIds"]}
            except KeyError as error:
                raise RemoteCommandError("REMOTE_INVALID_HOST_RESPONSE", 503) from error
            if len(json.dumps(answer, ensure_ascii=False).encode()) > 512 * 1024:
                raise RemoteCommandError("REMOTE_RESPONSE_TOO_LARGE", 413)
            return answer
        raise RemoteCommandError("REMOTE_TASK_NOT_FOUND", 404)

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
        if method == "task.detail":
            assert isinstance(payload, _Task)
            return await self._task_detail(payload.taskId, identity["projectIds"])
        try:
            result = await self.invoke_host(RpcRequest(
                jsonrpc="2.0", id=str(uuid4()), method=method,
                params={} if method == "project.list" else payload.model_dump(mode="json"),
                transportVersion="forge-local-jsonrpc/v1",
            ))
        except ProtocolError as error:
            status = 404 if error.code.endswith("NOT_FOUND") else 409 if (
                "CONFLICT" in error.code or "STALE" in error.code
            ) else 400
            raise RemoteCommandError(error.code, status) from error
        data = result.get("data")
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
        else:
            assert isinstance(data, dict)
            if any(item["state"] == "blocked" for item in data["tasks"]):
                # The read-only reference OpenAPI TaskSummary lacks `blocked`.
                raise RemoteCommandError("REMOTE_SCHEMA_UNSUPPORTED", 409)
            fields = ("id", "projectId", "title", "state", "boardColumn", "revision",
                      "contractRevision", "approvedRevision", "activeRunId",
                      "blockReason")
            answer = {"projectId": data["projectId"], "eventCursor": data["eventCursor"],
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
        # P7-07 must grant operation scope and inject actor before a write is routed.
        raise RemoteCommandError("REMOTE_WRITE_SCOPE_UNAVAILABLE", 403)
