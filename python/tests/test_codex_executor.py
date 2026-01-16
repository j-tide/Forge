"""Provider wire normalization unit cases; live app-server evidence is in spikes."""

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest

from forge.codex_app_server import codex_environment
from forge.codex_executor import CodexRun, _mapped_error
from forge.executor_contracts import AttemptRequest, ScheduledExecutorRequest


class WireFixture:
    def __init__(self) -> None:
        self.listener = None
        self.responses: list[tuple[int, dict[str, str]]] = []

    def add_listener(self, callback):
        self.listener = callback

    def remove_listener(self, callback):
        if self.listener == callback:
            self.listener = None

    async def respond(self, identifier, result):
        self.responses.append((identifier, result))

    async def dispose(self):
        self.listener = None


def run_request(tmp_path: Path) -> ScheduledExecutorRequest:
    return ScheduledExecutorRequest(
        runId=str(uuid4()), taskId=str(uuid4()), workspace=str(tmp_path),
        goal="Read fixture", context=[], permission="read-only", approval="on-request",
        model=None, maxDurationMs=10000,
        attempt=AttemptRequest(
            attemptId=str(uuid4()), leaseEpoch=1, contractRevision=1,
            workspaceLeaseId=str(uuid4()), contextBundleId=str(uuid4()),
            profileRevision=1, outputSchemaId="plain-text-v1",
        ),
    )


def test_codex_environment_filters_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "do-not-forward")
    monkeypatch.setenv("HTTPS_PROXY", "https://user:secret@proxy.example")
    monkeypatch.setenv("HTTP_PROXY", "http://proxy.example:8080")
    environment = codex_environment()
    assert "OPENAI_API_KEY" not in environment
    assert "HTTPS_PROXY" not in environment
    assert environment["HTTP_PROXY"] == "http://proxy.example:8080"
    assert _mapped_error({"message": "401 Unauthorized"}) == "EXECUTOR_AUTH_FAILED"
    assert _mapped_error({"message": "deadline exceeded"}) == "EXECUTOR_TIMEOUT"
    assert _mapped_error({"message": "not expected"}) == "EXECUTOR_RUNTIME_ERROR"


@pytest.mark.asyncio
async def test_codex_event_sequence_approval_and_terminal(tmp_path: Path) -> None:
    wire = WireFixture()
    request = run_request(tmp_path)
    events = []
    run = CodexRun(wire, request, "thread-1", "turn-1", events.append)  # type: ignore[arg-type]
    assert [event.sequence for event in events] == [1, 2]
    assert events[0].type == "run.started"
    assert wire.listener is not None
    wire.listener({"method": "item/commandExecution/requestApproval", "id": 17,
                   "params": {"threadId": "thread-1", "turnId": "turn-1",
                              "itemId": "command-1", "command": "read fixture"}})
    approval = next(event for event in events if event.type == "approval.requested")
    await run.respond_to_approval(approval.approvalId, "reject")
    assert wire.responses == [(17, {"decision": "decline"})]
    wire.listener({"method": "item/started", "params": {
        "threadId": "thread-1", "turnId": "turn-1", "item": {
            "id": "command-1", "type": "commandExecution", "command": "read fixture",
        }}})
    wire.listener({"method": "turn/completed", "params": {
        "threadId": "thread-1", "turn": {"id": "turn-1", "status": "completed"},
    }})
    assert await asyncio.wait_for(run.wait(), 2) == "completed"
    assert [event.sequence for event in events] == list(range(1, len(events) + 1))
    assert events[-1].type == "run.completed"
    assert events[-1].providerSessionId == "thread-1"


@pytest.mark.asyncio
async def test_codex_unknown_interaction_fails_closed(tmp_path: Path) -> None:
    wire = WireFixture()
    events = []
    run = CodexRun(wire, run_request(tmp_path), "thread-1", "turn-1",
                   events.append)  # type: ignore[arg-type]
    assert wire.listener is not None
    wire.listener({"method": "unsafe/unknownApproval", "id": 19,
                   "params": {"threadId": "thread-1", "turnId": "turn-1"}})
    assert await asyncio.wait_for(run.wait(), 2) == "completed"
    assert wire.responses == [(19, {"decision": "decline"})]
    assert events[-1].type == "run.failed"
    assert events[-1].code == "EXECUTOR_UNSUPPORTED_CAPABILITY"


@pytest.mark.asyncio
async def test_codex_success_text_without_required_schema_is_not_success(tmp_path: Path) -> None:
    wire = WireFixture()
    events = []
    request = run_request(tmp_path).model_copy(update={
        "outputSchema": {"type": "object", "properties": {"ok": {"type": "boolean"}},
                         "required": ["ok"], "additionalProperties": False},
    })
    run = CodexRun(wire, request, "thread-1", "turn-1",
                   events.append)  # type: ignore[arg-type]
    assert wire.listener is not None
    wire.listener({"method": "item/agentMessage/delta", "params": {
        "threadId": "thread-1", "turnId": "turn-1", "delta": "All work completed",
    }})
    wire.listener({"method": "turn/completed", "params": {
        "threadId": "thread-1", "turn": {"id": "turn-1", "status": "completed"},
    }})
    assert await asyncio.wait_for(run.wait(), 2) == "completed"
    assert events[-1].type == "run.failed"
    assert events[-1].code == "EXECUTOR_PROTOCOL_ERROR"
