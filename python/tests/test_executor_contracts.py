"""Provider-neutral events fail closed before reaching a Run scheduler."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from forge.executor_contracts import (
    ExecutorCapabilities,
    ExecutorEventGate,
    ExecutorProtocolError,
    RunCompleted,
    RunStarted,
    ScheduledExecutorRequest,
)


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def test_event_gate_requires_first_start_sequence_and_terminal_integrity() -> None:
    gate = ExecutorEventGate("run-1")
    with pytest.raises(ExecutorProtocolError):
        gate.accept({"runId": "run-1", "sequence": 1, "timestamp": now(),
                     "type": "assistant.message", "text": "too early"})
    start = RunStarted(
        runId="run-1", sequence=1, timestamp=now(), type="run.started",
        providerSessionId="thread-1",
    )
    assert gate.accept(start) == start
    with pytest.raises(ExecutorProtocolError):
        gate.accept(start)
    with pytest.raises(ExecutorProtocolError):
        gate.accept({"runId": "run-1", "sequence": 2, "timestamp": now(),
                     "type": "tool.started", "toolId": "one", "name": "shell",
                     "unsafeRawProviderEvent": {"ignored": True}})
    done = RunCompleted(
        runId="run-1", sequence=2, timestamp=now(), type="run.completed",
        providerSessionId="thread-1", structuredOutput=None,
    )
    assert gate.accept(done) == done and gate.terminal
    with pytest.raises(ExecutorProtocolError):
        gate.accept({"runId": "run-1", "sequence": 3, "timestamp": now(),
                     "type": "assistant.message", "text": "late"})


def test_capability_and_request_schema_reject_unknown_fields() -> None:
    capability = {
        "executorId": "executor.codex", "adapterVersion": "1", "upstreamVersion": "1",
        "platform": "darwin", "available": False, "streaming": False,
        "resume": False, "interrupt": False, "approval": False,
        "structuredEvents": False, "structuredOutput": False,
        "workspaceControl": False, "toolEvents": False,
        "sessionPersistence": False, "modelSelection": False,
        "usageReporting": False, "readOnlyEnforced": False,
        "networkPolicyEnforced": False, "enforcement": "unavailable",
        "modelIds": [], "authModes": [], "warnings": ["Not probed"],
    }
    assert ExecutorCapabilities.model_validate(capability).available is False
    with pytest.raises(ValidationError):
        ExecutorCapabilities.model_validate({**capability, "fakeReady": True})
    with pytest.raises(ValidationError):
        ScheduledExecutorRequest.model_validate({"runId": "r", "shell": "rm -rf /"})
