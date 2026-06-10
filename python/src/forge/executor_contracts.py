"""Provider-neutral Executor contracts; no Codex types cross this boundary."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, field_validator


class ExecutorProtocolError(Exception):
    def __init__(self, code: str = "EXECUTOR_PROTOCOL_ERROR") -> None:
        super().__init__(code)
        self.code = code


class ExecutorStartError(Exception):
    """Only explicit no-side-effect evidence permits a finite launch retry."""

    def __init__(self, code: str, *, http_status: int | None = None,
                 side_effect: Literal["none", "possible", "confirmed"] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.http_status = http_status
        self.side_effect = side_effect


class ExecutorCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    executorId: str = Field(min_length=1, max_length=128)
    adapterVersion: str = Field(min_length=1)
    upstreamVersion: str = Field(min_length=1)
    platform: str = Field(min_length=1)
    available: bool
    streaming: bool
    resume: bool
    interrupt: bool
    approval: bool
    structuredEvents: bool
    structuredOutput: bool
    workspaceControl: bool
    toolEvents: bool
    sessionPersistence: bool
    modelSelection: bool
    usageReporting: bool
    readOnlyEnforced: bool
    networkPolicyEnforced: bool
    enforcement: Literal["native-sandbox", "trusted-local", "unavailable"]
    modelIds: list[str]
    authModes: list[str]
    warnings: list[str]


class AttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    attemptId: str = Field(min_length=1, max_length=128)
    leaseEpoch: int = Field(ge=1)
    contractRevision: int = Field(ge=1)
    workspaceLeaseId: str = Field(min_length=1)
    contextBundleId: str = Field(min_length=1)
    profileRevision: int = Field(ge=1)
    outputSchemaId: str = Field(min_length=1)
    credentialRef: str | None = None
    nativeSessionRef: str | None = None


class ScheduledExecutorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: str = Field(min_length=1, max_length=128)
    taskId: str = Field(min_length=1, max_length=128)
    workspace: str = Field(min_length=1)
    goal: str = Field(min_length=1)
    context: list[str]
    permission: Literal["read-only", "workspace-write"]
    approval: Literal["on-request", "never"]
    model: str | None = None
    outputSchema: dict[str, Any] | None = None
    maxDurationMs: int = Field(ge=1, le=3_600_000)
    attempt: AttemptRequest


class EventBase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: str = Field(min_length=1, max_length=128)
    sequence: int = Field(ge=1)
    timestamp: str

    @field_validator("timestamp")
    @classmethod
    def timestamp_is_zoned(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Executor timestamp requires a timezone")
        return value


class RunStarted(EventBase):
    type: Literal["run.started"]
    providerSessionId: str = Field(min_length=1)


class RunStatus(EventBase):
    type: Literal["run.status"]
    status: Literal["starting", "running", "waiting_approval", "interrupted"]


class AssistantMessage(EventBase):
    type: Literal["assistant.message"]
    text: str


class ToolStarted(EventBase):
    type: Literal["tool.started"]
    toolId: str
    name: str


class ToolCompleted(EventBase):
    type: Literal["tool.completed"]
    toolId: str
    name: str
    ok: bool


class FileChanged(EventBase):
    type: Literal["file.changed"]
    path: str
    kind: Literal["add", "update", "delete"]


class CommandStarted(EventBase):
    type: Literal["command.started"]
    commandId: str
    command: str


class CommandCompleted(EventBase):
    type: Literal["command.completed"]
    commandId: str
    exitCode: int | None


class ApprovalRequested(EventBase):
    type: Literal["approval.requested"]
    approvalId: str
    summary: str
    capability: Literal["command", "file_change"]
    expiresAt: str | None


class ApprovalResolved(EventBase):
    type: Literal["approval.resolved"]
    approvalId: str
    decision: Literal["approve", "reject"]


class UsageUpdated(EventBase):
    type: Literal["usage.updated"]
    inputTokens: int = Field(ge=0)
    outputTokens: int = Field(ge=0)
    cachedInputTokens: int | None = Field(ge=0)
    cost: float | None = Field(ge=0)
    currency: str | None


class RunCompleted(EventBase):
    type: Literal["run.completed"]
    providerSessionId: str = Field(min_length=1)
    structuredOutput: object | None


class RunFailed(EventBase):
    type: Literal["run.failed"]
    code: str
    message: str


class RunCancelled(EventBase):
    type: Literal["run.cancelled"]


type ExecutorEvent = Annotated[
    RunStarted | RunStatus | AssistantMessage | ToolStarted | ToolCompleted
    | FileChanged | CommandStarted | CommandCompleted | ApprovalRequested
    | ApprovalResolved | UsageUpdated | RunCompleted | RunFailed | RunCancelled,
    Field(discriminator="type"),
]
_EVENT_ADAPTER: TypeAdapter[ExecutorEvent] = TypeAdapter(ExecutorEvent)


class ExecutorEventGate:
    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self.sequence = 0
        self.terminal = False

    def accept(self, value: object) -> ExecutorEvent:
        try:
            event = _EVENT_ADAPTER.validate_python(value)
        except Exception as error:
            raise ExecutorProtocolError() from error
        if (
            event.runId != self.run_id or self.terminal
            or event.sequence != self.sequence + 1
            or self.sequence == 0 and event.type != "run.started"
        ):
            raise ExecutorProtocolError()
        self.sequence = event.sequence
        if event.type in ("run.completed", "run.failed", "run.cancelled"):
            self.terminal = True
        return event


class ExecutorRunHandle(Protocol):
    run_id: str
    provider_session_id: str

    async def wait(self) -> Literal["completed", "cancelled"]: ...

    async def cancel(self) -> None: ...

    async def dispose(self) -> None: ...


class ExecutorAdapter(Protocol):
    id: str

    async def probe(self) -> ExecutorCapabilities: ...

    async def start(
        self, request: ScheduledExecutorRequest,
        on_event: Callable[[ExecutorEvent], None],
    ) -> ExecutorRunHandle: ...

    async def dispose(self) -> None: ...
