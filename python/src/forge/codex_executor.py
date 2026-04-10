"""Codex 0.155.1 app-server adapter for the provider-neutral Forge Executor API."""

from __future__ import annotations

import asyncio
import json
import platform
import re
import shutil
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from uuid import uuid4

from pydantic import TypeAdapter

from forge.codex_app_server import CodexConnection, CodexProtocolError, codex_environment
from forge.executor_contracts import (
    ExecutorCapabilities,
    ExecutorEvent,
    ScheduledExecutorRequest,
)
from forge.processes import ProcessController

CODEX_VERSION = "codex-cli 0.155.1"
EVENT_ADAPTER: TypeAdapter[ExecutorEvent] = TypeAdapter(ExecutorEvent)
EVIDENCE_PATH = Path(__file__).with_name("codex_evidence.json")


class CodexExecutorError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _object(value: object) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _text(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _mapped_error(value: object) -> str:
    item = _object(value) or {}
    info = _object(item.get("codexErrorInfo")) or {}
    message = str(item.get("message", ""))
    label = f"{info.get('type', '')} {message}"
    if re.search(r"unauthorized|authentication|login|\b401\b|\b403\b", label, re.I):
        return "EXECUTOR_AUTH_FAILED"
    if re.search(r"timed? out|deadline", label, re.I):
        return "EXECUTOR_TIMEOUT"
    if re.search(r"workspace|directory|cwd", label, re.I):
        return "EXECUTOR_WORKSPACE_ERROR"
    return "EXECUTOR_RUNTIME_ERROR"


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class CodexRun:
    def __init__(
        self, connection: CodexConnection, request: ScheduledExecutorRequest,
        thread_id: str, turn_id: str, on_event: Callable[[ExecutorEvent], None],
    ) -> None:
        self.connection = connection
        self.request = request
        self.run_id = request.runId
        self.provider_session_id = thread_id
        self.turn_id = turn_id
        self.on_event = on_event
        self.sequence = 0
        self.finished = False
        self.structured_output: Any = None
        self.has_structured_output = False
        self.usage_baseline: tuple[int, int, int] | None = None
        self.last_run_usage: tuple[int, int, int] | None = None
        self.pending_approvals: dict[str, tuple[int, asyncio.Task[None]]] = {}
        self.completion: asyncio.Future[Literal["completed", "cancelled"]] = (
            asyncio.get_running_loop().create_future()
        )
        self.cleanup_task: asyncio.Task[None] | None = None
        self._emit({"type": "run.started", "providerSessionId": thread_id})
        self._emit({"type": "run.status", "status": "running"})
        connection.add_listener(self._handle)

    def _emit(self, payload: dict[str, Any]) -> None:
        event = EVENT_ADAPTER.validate_python({
            **payload, "runId": self.run_id, "sequence": self.sequence + 1,
            "timestamp": _timestamp(),
        })
        self.sequence += 1
        self.on_event(event)

    def _invalid(self) -> None:
        self._finish("failed", "EXECUTOR_PROTOCOL_ERROR")

    def _handle(self, frame: dict[str, Any]) -> None:
        if self.finished:
            return
        method = frame.get("method")
        if method == "forge/connectionFailed":
            failure_params = _object(frame.get("params")) or {}
            code = failure_params.get("code")
            self._finish("failed", code if code in (
                "EXECUTOR_PROTOCOL_ERROR", "EXECUTOR_RUNTIME_ERROR"
            ) else "EXECUTOR_RUNTIME_ERROR")
            return
        params = _object(frame.get("params"))
        if params is None:
            self._invalid()
            return
        if params.get("threadId") not in (None, self.provider_session_id):
            return
        if params.get("turnId") not in (None, self.turn_id):
            return
        if method == "turn/completed":
            turn = _object(params.get("turn"))
            if turn is None or turn.get("id") != self.turn_id:
                self._invalid()
                return
            status = turn.get("status")
            if status == "completed":
                if self.request.outputSchema is not None and not self.has_structured_output:
                    self._invalid()
                else:
                    self._finish("completed", None)
            elif status == "interrupted":
                self._finish("cancelled", None)
            elif status == "failed":
                self._finish("failed", _mapped_error(turn.get("error")))
            else:
                self._invalid()
            return
        if method == "item/agentMessage/delta":
            delta = _text(params.get("delta"))
            if delta is None:
                self._invalid()
            else:
                self._emit({"type": "assistant.message", "text": delta})
            return
        if method == "thread/tokenUsage/updated":
            if params.get("turnId") != self.turn_id:
                self._invalid()
                return
            usage = _object(params.get("tokenUsage"))
            total = _object(usage.get("total")) if usage else None
            last = _object(usage.get("last")) if usage else None
            keys = ("inputTokens", "outputTokens", "cachedInputTokens")
            if total is None or last is None or any(
                type(record.get(key)) is not int or record[key] < 0
                for record in (total, last) for key in keys
            ):
                self._invalid()
                return
            totals = tuple(total[key] for key in keys)
            previous = tuple(last[key] for key in keys)
            if any(current < recent for current, recent in zip(totals, previous, strict=True)):
                self._invalid()
                return
            if self.usage_baseline is None:
                # The thread may contain earlier Forge Runs. The first update for
                # this turn includes one response's usage, so remove that from
                # the thread total to establish this Run's baseline.
                self.usage_baseline = tuple(
                    current - recent for current, recent in zip(totals, previous, strict=True)
                )
            run_usage = tuple(
                current - baseline for current, baseline in zip(
                    totals, self.usage_baseline, strict=True
                )
            )
            if any(value < 0 for value in run_usage) or (
                self.last_run_usage is not None and any(
                    value < prior for value, prior in zip(
                        run_usage, self.last_run_usage, strict=True
                    )
                )
            ):
                self._invalid()
                return
            self.last_run_usage = run_usage
            self._emit({
                "type": "usage.updated", "inputTokens": run_usage[0],
                "outputTokens": run_usage[1], "cachedInputTokens": run_usage[2],
                "cost": None, "currency": None,
            })
            return
        if method in ("item/started", "item/completed"):
            item = _object(params.get("item"))
            if item is None or not isinstance(item.get("id"), str) or not isinstance(
                item.get("type"), str
            ):
                self._invalid()
                return
            started = method == "item/started"
            item_type = item["type"]
            if item_type == "agentMessage" and not started and self.request.outputSchema:
                try:
                    self.structured_output = json.loads(item.get("text", ""))
                    self.has_structured_output = True
                except (TypeError, ValueError):
                    pass  # Commentary can precede the final structured answer.
            elif item_type == "commandExecution":
                if started:
                    self._emit({"type": "command.started", "commandId": item["id"],
                                "command": _text(item.get("command")) or ""})
                else:
                    exit_code = item.get("exitCode")
                    if exit_code is not None and type(exit_code) is not int:
                        self._invalid()
                        return
                    self._emit({"type": "command.completed", "commandId": item["id"],
                                "exitCode": exit_code})
            elif item_type == "fileChange" and not started and item.get("status") == "completed":
                changes = item.get("changes", [])
                if not isinstance(changes, list):
                    self._invalid()
                    return
                for change in changes:
                    record = _object(change)
                    kind = _object(record.get("kind")) if record else None
                    if (record is None or kind is None
                            or not isinstance(record.get("path"), str)
                            or kind.get("type") not in ("add", "update", "delete")):
                        self._invalid()
                        return
                    self._emit({"type": "file.changed", "path": record["path"],
                                "kind": kind["type"]})
            elif item_type == "mcpToolCall":
                name = f"{item.get('server') or 'mcp'}.{item.get('tool') or 'tool'}"
                if started:
                    self._emit({"type": "tool.started", "toolId": item["id"], "name": name})
                else:
                    self._emit({"type": "tool.completed", "toolId": item["id"], "name": name,
                                "ok": item.get("status") == "completed"})
            return
        if method in (
            "item/commandExecution/requestApproval", "item/fileChange/requestApproval",
        ):
            identifier = frame.get("id")
            if type(identifier) is not int or identifier < 0 or not isinstance(
                params.get("itemId"), str
            ):
                self._invalid()
                return
            approval_id = f"{self.run_id}:{identifier}"
            if approval_id in self.pending_approvals:
                self._invalid()
                return
            expiry = datetime.now(UTC) + timedelta(seconds=120)
            timer = asyncio.create_task(self._expire_approval(approval_id))
            self.pending_approvals[approval_id] = (identifier, timer)
            self._emit({"type": "run.status", "status": "waiting_approval"})
            self._emit({"type": "approval.requested", "approvalId": approval_id,
                        "summary": _text(params.get("reason")) or _text(params.get("command"))
                        or "Codex file change requires approval",
                        "capability": "command" if "commandExecution" in method else "file_change",
                        "expiresAt": expiry.isoformat(
                            timespec="milliseconds"
                        ).replace("+00:00", "Z")})
            return
        if "id" in frame:
            identifier = frame.get("id")
            if type(identifier) is int:
                asyncio.create_task(self.connection.respond(identifier, {"decision": "decline"}))
            self._finish("failed", "EXECUTOR_UNSUPPORTED_CAPABILITY")

    async def _expire_approval(self, approval_id: str) -> None:
        await asyncio.sleep(120)
        if approval_id in self.pending_approvals:
            try:
                await self.respond_to_approval(approval_id, "reject")
            except CodexExecutorError:
                pass

    async def respond_to_approval(
        self, approval_id: str, decision: Literal["approve", "reject"],
    ) -> None:
        record = self.pending_approvals.pop(approval_id, None)
        if record is None or self.finished:
            raise CodexExecutorError("EXECUTOR_PROTOCOL_ERROR")
        identifier, timer = record
        if timer is not asyncio.current_task():
            timer.cancel()
        await self.connection.respond(identifier, {
            "decision": "accept" if decision == "approve" else "decline"
        })
        self._emit({"type": "approval.resolved", "approvalId": approval_id,
                    "decision": decision})
        self._emit({"type": "run.status", "status": "running"})

    def _finish(
        self, outcome: Literal["completed", "cancelled", "failed"], code: str | None,
    ) -> None:
        if self.finished:
            return
        self.finished = True
        self.cleanup_task = asyncio.create_task(self._settle(outcome, code))

    async def _settle(
        self, outcome: Literal["completed", "cancelled", "failed"], code: str | None,
    ) -> None:
        for _, timer in self.pending_approvals.values():
            timer.cancel()
        self.pending_approvals.clear()
        self.connection.remove_listener(self._handle)
        try:
            await self.connection.dispose()
        except Exception:
            outcome = "failed"
            code = "EXECUTOR_RUNTIME_ERROR"
        if outcome == "completed":
            self._emit({"type": "run.completed", "providerSessionId": self.provider_session_id,
                        "structuredOutput": self.structured_output})
            self.completion.set_result("completed")
        elif outcome == "cancelled":
            self._emit({"type": "run.cancelled"})
            self.completion.set_result("cancelled")
        else:
            self._emit({"type": "run.failed", "code": code or "EXECUTOR_RUNTIME_ERROR",
                        "message": "Codex runtime failed"})
            self.completion.set_result("completed")

    async def wait(self) -> Literal["completed", "cancelled"]:
        return await self.completion

    async def cancel(self) -> None:
        if self.finished:
            return
        try:
            await self.connection.request("turn/interrupt", {
                "threadId": self.provider_session_id, "turnId": self.turn_id,
            }, 10)
        except CodexProtocolError as error:
            if not self.finished:
                raise CodexExecutorError(error.code) from error

    async def dispose(self) -> None:
        if not self.finished:
            try:
                await self.cancel()
                await asyncio.wait_for(self.wait(), 3)
            except (CodexExecutorError, TimeoutError):
                self._finish("failed", "EXECUTOR_RUNTIME_ERROR")
        if self.cleanup_task is not None:
            await self.cleanup_task


class CodexExecutorAdapter:
    id = "executor.codex"

    def __init__(self, controller: ProcessController, executable: str | None = None,
                 *, initialization_timeout_seconds: int = 15) -> None:
        if not 1 <= initialization_timeout_seconds <= 60:
            raise ValueError("Invalid app-server initialization timeout")
        self.controller = controller
        self.executable = executable or shutil.which("codex")
        self.initialization_timeout_seconds = initialization_timeout_seconds
        self.active: set[CodexRun] = set()

    async def _cli(self, args: list[str]) -> str:
        if self.executable is None:
            raise CodexExecutorError("EXECUTOR_START_FAILED")
        probe_id = f"codex-probe-{uuid4()}"
        session = await self.controller.spawn(
            probe_id, self.executable, args, Path.cwd(), environment=codex_environment()
        )
        try:
            if session.stdout is None or session.stderr is None:
                raise CodexExecutorError("EXECUTOR_START_FAILED")
            stdout, stderr = await asyncio.wait_for(
                asyncio.gather(session.stdout.read(65536), session.stderr.read(65536)), 10
            )
            result = await asyncio.wait_for(session.wait(), 10)
            if result != 0:
                raise CodexExecutorError("EXECUTOR_AUTH_FAILED")
            return (stdout + stderr).decode(errors="replace")
        except TimeoutError as error:
            raise CodexExecutorError("EXECUTOR_TIMEOUT") from error
        finally:
            report = await self.controller.cancel(probe_id)
            if not report.confirmed:
                raise CodexExecutorError("EXECUTOR_RUNTIME_ERROR")

    async def _models(self, cwd: Path) -> list[str]:
        if self.executable is None:
            raise CodexExecutorError("EXECUTOR_START_FAILED")
        connection = CodexConnection(
            self.controller, f"codex-models-{uuid4()}", self.executable, cwd,
            initialization_timeout_seconds=self.initialization_timeout_seconds,
        )
        try:
            await connection.connect()
            response = _object(await connection.request("model/list", {"limit": 100}))
            rows = response.get("data") if response else None
            if not isinstance(rows, list):
                raise CodexExecutorError("EXECUTOR_PROTOCOL_ERROR")
            return [item["id"] for value in rows if (item := _object(value)) is not None
                    and isinstance(item.get("id"), str) and item.get("hidden") is not True]
        finally:
            await connection.dispose()

    async def probe(self) -> ExecutorCapabilities:
        version = "unavailable"
        auth = False
        models: list[str] = []
        diagnostic = "CODEX_CLI_UNAVAILABLE"
        try:
            version = (await self._cli(["--version"])).strip()
            if version != CODEX_VERSION:
                diagnostic = "CODEX_VERSION_MISMATCH"
                raise CodexExecutorError("EXECUTOR_UNSUPPORTED_CAPABILITY")
            diagnostic = "CODEX_NOT_AUTHENTICATED"
            auth = "Logged in" in await self._cli(["login", "status"])
            if auth:
                diagnostic = "CODEX_PROBE_FAILED"
                models = await self._models(Path.cwd())
                diagnostic = "CODEX_MODELS_UNAVAILABLE" if not models else ""
        except (CodexExecutorError, CodexProtocolError, OSError) as error:
            if (diagnostic == "CODEX_NOT_AUTHENTICATED" and not (
                isinstance(error, CodexExecutorError)
                and error.code == "EXECUTOR_AUTH_FAILED"
            )):
                diagnostic = "CODEX_PROBE_FAILED"
        platform_id = f"{platform.system().lower()}/{platform.machine().lower()}"
        checks: dict[str, bool] = {}
        try:
            evidence = _object(json.loads(EVIDENCE_PATH.read_text())) or {}
            if (evidence.get("upstreamVersion") == version
                    and evidence.get("platform") == platform_id and auth and models):
                raw = _object(evidence.get("checks")) or {}
                checks = {key: value for key, value in raw.items() if type(value) is bool}
        except (OSError, ValueError):
            pass
        return ExecutorCapabilities(
            executorId=self.id, adapterVersion="0.0.1", upstreamVersion=version,
            platform=platform_id, available=auth and bool(models),
            streaming=checks.get("streaming", False), resume=checks.get("resume", False),
            interrupt=checks.get("interrupt", False), approval=checks.get("approval", False),
            structuredEvents=checks.get("structuredEvents", False),
            structuredOutput=checks.get("structuredOutput", False),
            workspaceControl=checks.get("workspaceControl", False),
            toolEvents=checks.get("toolEvents", False),
            sessionPersistence=checks.get("sessionPersistence", False),
            modelSelection=checks.get("modelSelection", False),
            usageReporting=checks.get("usageReporting", False),
            readOnlyEnforced=checks.get("readOnlyEnforced", False),
            networkPolicyEnforced=checks.get("networkPolicyEnforced", False),
            enforcement="native-sandbox" if checks.get("readOnlyEnforced") else "unavailable",
            modelIds=models if auth else [], authModes=["chatgpt-session"] if auth else [],
            warnings=([diagnostic] if diagnostic else []) + ([] if checks else [
                "CODEX_CAPABILITY_EVIDENCE_MISSING"
            ]),
        )

    async def start(
        self, request: ScheduledExecutorRequest,
        on_event: Callable[[ExecutorEvent], None],
    ) -> CodexRun:
        if self.executable is None:
            raise CodexExecutorError("EXECUTOR_START_FAILED")
        try:
            cwd = Path(request.workspace).resolve(strict=True)
        except OSError as error:
            raise CodexExecutorError("EXECUTOR_WORKSPACE_ERROR") from error
        if not cwd.is_dir():
            raise CodexExecutorError("EXECUTOR_WORKSPACE_ERROR")
        if "Logged in" not in await self._cli(["login", "status"]):
            raise CodexExecutorError("EXECUTOR_AUTH_FAILED")
        connection = CodexConnection(
            self.controller, request.runId, self.executable, cwd,
            initialization_timeout_seconds=self.initialization_timeout_seconds,
        )
        try:
            await connection.connect()
            if request.model:
                models = await self._models(cwd)
                if request.model not in models:
                    raise CodexExecutorError("EXECUTOR_UNSUPPORTED_CAPABILITY")
            if request.attempt.nativeSessionRef:
                thread_response = _object(await connection.request("thread/resume", {
                    "threadId": request.attempt.nativeSessionRef,
                }, 20))
            else:
                thread_response = _object(await connection.request("thread/start", {
                    "cwd": str(cwd), "approvalPolicy": request.approval,
                    "sandbox": request.permission, "serviceName": "forge_python_executor",
                    **({"model": request.model} if request.model else {}),
                }, 20))
            thread = _object(thread_response.get("thread")) if thread_response else None
            thread_id = _text(thread.get("id")) if thread else None
            if not thread_id:
                raise CodexExecutorError("EXECUTOR_PROTOCOL_ERROR")
            turn_response = _object(await connection.request("turn/start", {
                "threadId": thread_id, "cwd": str(cwd),
                "input": [{"type": "text", "text": "\n\n".join([request.goal, *request.context])}],
                "approvalPolicy": request.approval,
                "sandboxPolicy": {"type": "readOnly" if request.permission == "read-only"
                                  else "workspaceWrite"},
                **({"model": request.model} if request.model else {}),
                **({"outputSchema": request.outputSchema} if request.outputSchema else {}),
            }, 20))
            turn = _object(turn_response.get("turn")) if turn_response else None
            turn_id = _text(turn.get("id")) if turn else None
            if not turn_id:
                raise CodexExecutorError("EXECUTOR_PROTOCOL_ERROR")
            handle = CodexRun(connection, request, thread_id, turn_id, on_event)
            self.active.add(handle)
            handle.completion.add_done_callback(lambda _: self.active.discard(handle))
            return handle
        except BaseException:
            await connection.dispose()
            raise

    async def dispose(self) -> None:
        await asyncio.gather(*(handle.dispose() for handle in tuple(self.active)))
        self.active.clear()
