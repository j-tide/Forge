"""Host-owned tool admission boundary. Registration never grants execution."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError
from jsonschema.exceptions import ValidationError as JsonValidationError
from pydantic import BaseModel, ConfigDict, Field

from forge.plugin_scope import Registration

ToolPermission = Literal["workspace.read", "workspace.write", "network", "process.spawn"]
_MAX_JSON_BYTES = 128 * 1024


class ToolError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ToolDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    description: str = Field(min_length=1, max_length=500)
    inputSchema: dict[str, Any]
    outputSchema: dict[str, Any]
    requiredGrant: ToolPermission
    timeoutMs: int = Field(ge=1, le=30_000)


class ToolPolicyDecision(BaseModel):
    """Internal Core/Policy decision; never accepted from Renderer/model/tool output."""

    model_config = ConfigDict(extra="forbid", strict=True)

    decisionId: UUID
    toolId: str
    projectId: UUID
    runId: UUID
    attemptId: UUID
    permission: ToolPermission
    allowed: bool
    expiresAt: datetime


class ToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    toolId: str
    projectId: UUID
    runId: UUID
    attemptId: UUID
    grantId: UUID
    input: Any


class ToolResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    toolId: str
    output: Any
    trust: Literal["untrusted"] = "untrusted"


@dataclass(frozen=True)
class _Grant:
    policy: ToolPolicyDecision
    grant_id: UUID


@dataclass(frozen=True)
class _Entry:
    definition: ToolDefinition
    owner_plugin_id: str
    handler: Callable[[Any], Awaitable[Any]]
    input_validator: Draft202012Validator
    output_validator: Draft202012Validator


def _closed_schema(schema: dict[str, Any]) -> Draft202012Validator:
    """No remote references or open object bags in v1 tool payloads."""
    def walk(value: Any) -> None:
        if isinstance(value, dict):
            if "$ref" in value or "$dynamicRef" in value:
                raise ToolError("TOOL_SCHEMA_INVALID")
            if value.get("type") == "object" and value.get("additionalProperties") is not False:
                raise ToolError("TOOL_SCHEMA_INVALID")
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    if schema.get("type") != "object":
        raise ToolError("TOOL_SCHEMA_INVALID")
    try:
        if len(json.dumps(schema, allow_nan=False).encode()) > _MAX_JSON_BYTES:
            raise ToolError("TOOL_SCHEMA_INVALID")
        walk(schema)
        Draft202012Validator.check_schema(schema)
    except (TypeError, ValueError, SchemaError, RecursionError) as error:
        raise ToolError("TOOL_SCHEMA_INVALID") from error
    return Draft202012Validator(schema)


def _bounded_json(value: Any) -> None:
    try:
        if len(json.dumps(value, allow_nan=False).encode()) > _MAX_JSON_BYTES:
            raise ToolError("TOOL_PAYLOAD_TOO_LARGE")
    except (TypeError, ValueError, RecursionError) as error:
        raise ToolError("TOOL_PAYLOAD_INVALID") from error


class ToolRegistry:
    def __init__(self) -> None:
        self._entries: dict[str, _Entry] = {}
        self._grants: dict[UUID, _Grant] = {}
        self.audit: list[dict[str, str]] = []

    def has_tool(self, tool_id: str) -> bool:
        return tool_id in self._entries

    def register(
        self, definition: ToolDefinition, owner_plugin_id: str,
        handler: Callable[[Any], Awaitable[Any]],
    ) -> Registration:
        if definition.id in self._entries:
            raise ToolError("TOOL_DUPLICATE")
        input_validator = _closed_schema(definition.inputSchema)
        output_validator = _closed_schema(definition.outputSchema)
        entry = _Entry(definition, owner_plugin_id, handler,
                       input_validator, output_validator)
        self._entries[definition.id] = entry

        def release() -> None:
            if self._entries.get(definition.id) is entry:
                del self._entries[definition.id]
            for grant_id, grant in tuple(self._grants.items()):
                if grant.policy.toolId == definition.id:
                    del self._grants[grant_id]

        return Registration(release)

    def issue_grant(self, decision: ToolPolicyDecision) -> UUID:
        """Core calls this after an independent Policy/Approval decision."""
        entry = self._entries.get(decision.toolId)
        if (entry is None or not decision.allowed
                or decision.permission != entry.definition.requiredGrant
                or decision.expiresAt.tzinfo is None
                or decision.expiresAt <= datetime.now(UTC)):
            raise ToolError("TOOL_GRANT_DENIED")
        grant_id = uuid4()
        self._grants[grant_id] = _Grant(decision, grant_id)
        return grant_id

    async def invoke(self, call: ToolCall) -> ToolResult:
        entry = self._entries.get(call.toolId)
        grant = self._grants.get(call.grantId)
        if entry is None:
            raise ToolError("TOOL_NOT_REGISTERED")
        if (grant is None or not grant.policy.allowed
                or grant.policy.toolId != call.toolId
                or grant.policy.projectId != call.projectId
                or grant.policy.runId != call.runId
                or grant.policy.attemptId != call.attemptId
                or grant.policy.permission != entry.definition.requiredGrant
                or grant.policy.expiresAt <= datetime.now(UTC)):
            self.audit.append({"toolId": call.toolId, "pluginId": entry.owner_plugin_id,
                               "projectId": str(call.projectId), "runId": str(call.runId),
                               "attemptId": str(call.attemptId),
                               "permission": entry.definition.requiredGrant,
                               "code": "TOOL_GRANT_DENIED"})
            raise ToolError("TOOL_GRANT_DENIED")
        # One issued grant admits one attempt. A timeout or invalid result
        # cannot be replayed into an implicit retry.
        del self._grants[call.grantId]
        _bounded_json(call.input)
        try:
            entry.input_validator.validate(call.input)
        except JsonValidationError as error:
            raise ToolError("TOOL_INPUT_INVALID") from error
        # One attempt only. A timeout never starts an unbounded retry loop.
        try:
            output = await asyncio.wait_for(entry.handler(call.input),
                                            entry.definition.timeoutMs / 1000)
        except TimeoutError as error:
            raise ToolError("TOOL_TIMEOUT") from error
        except ToolError:
            raise
        except Exception as error:
            raise ToolError("TOOL_EXECUTION_FAILED") from error
        _bounded_json(output)
        try:
            entry.output_validator.validate(output)
        except JsonValidationError as error:
            raise ToolError("TOOL_OUTPUT_INVALID") from error
        return ToolResult(toolId=call.toolId, output=output)
