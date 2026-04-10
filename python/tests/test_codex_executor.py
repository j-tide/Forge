"""Provider wire normalization unit cases; live app-server evidence is in spikes."""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from forge.codex_app_server import codex_environment
from forge.codex_executor import (
    CODEX_VERSION,
    CodexExecutorAdapter,
    CodexExecutorError,
    CodexRun,
    _mapped_error,
)
from forge.executor_contracts import AttemptRequest, ScheduledExecutorRequest
from forge.processes import ProcessController


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
async def test_codex_probe_reports_specific_local_prerequisite_without_running_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = CodexExecutorAdapter(ProcessController(uuid4()), executable="/fixture/codex")
    missing = AsyncMock(side_effect=CodexExecutorError("EXECUTOR_START_FAILED"))
    monkeypatch.setattr(adapter, "_cli", missing)
    assert "CODEX_CLI_UNAVAILABLE" in (await adapter.probe()).warnings

    mismatch = AsyncMock(return_value="codex-cli 9.9.9")
    monkeypatch.setattr(adapter, "_cli", mismatch)
    assert "CODEX_VERSION_MISMATCH" in (await adapter.probe()).warnings
    mismatch.assert_awaited_once_with(["--version"])

    not_logged_in = AsyncMock(side_effect=[CODEX_VERSION, "Not logged in"])
    monkeypatch.setattr(adapter, "_cli", not_logged_in)
    assert "CODEX_NOT_AUTHENTICATED" in (await adapter.probe()).warnings

    # The real CLI exits 1 for an isolated CODEX_HOME with no login.
    login_exit_one = AsyncMock(side_effect=[
        CODEX_VERSION, CodexExecutorError("EXECUTOR_AUTH_FAILED"),
    ])
    monkeypatch.setattr(adapter, "_cli", login_exit_one)
    assert "CODEX_NOT_AUTHENTICATED" in (await adapter.probe()).warnings

    probe_failed = AsyncMock(side_effect=[CODEX_VERSION, CodexExecutorError("EXECUTOR_TIMEOUT")])
    monkeypatch.setattr(adapter, "_cli", probe_failed)
    assert "CODEX_PROBE_FAILED" in (await adapter.probe()).warnings


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
async def test_codex_usage_is_scoped_to_run_when_resuming_a_thread(tmp_path: Path) -> None:
    wire = WireFixture()
    events = []
    request = run_request(tmp_path)
    request.attempt.nativeSessionRef = "thread-1"
    run = CodexRun(wire, request, "thread-1", "turn-2", events.append)  # type: ignore[arg-type]
    assert wire.listener is not None

    def usage(total_input: int, total_output: int, recent_input: int,
              recent_output: int) -> None:
        assert wire.listener is not None
        wire.listener({"method": "thread/tokenUsage/updated", "params": {
            "threadId": "thread-1", "turnId": "turn-2", "tokenUsage": {
                "total": {"inputTokens": total_input, "outputTokens": total_output,
                          "cachedInputTokens": 0},
                "last": {"inputTokens": recent_input, "outputTokens": recent_output,
                         "cachedInputTokens": 0},
            },
        }})

    # 100,000 tokens belong to earlier turns in the same resumed thread.
    usage(100_020, 5_002, 20, 2)
    usage(100_050, 5_005, 30, 3)
    usage(100_050, 5_005, 30, 3)  # A replay must not double count usage.
    observed = [event for event in events if event.type == "usage.updated"]
    assert [(event.inputTokens, event.outputTokens) for event in observed] == [
        (20, 2), (50, 5), (50, 5),
    ]
    usage(90_000, 4_000, 1, 1)  # A reset makes the prior baseline invalid.
    assert await asyncio.wait_for(run.wait(), 2) == "completed"
    assert events[-1].type == "run.failed"
    assert events[-1].code == "EXECUTOR_PROTOCOL_ERROR"


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
