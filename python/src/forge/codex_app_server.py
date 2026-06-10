"""Owned, bounded Codex app-server JSON-RPC connection over local stdio."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from forge.processes import ProcessController, ProcessError, ProcessSession, minimal_environment

MAX_FRAME = 1024 * 1024


class CodexProtocolError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def codex_environment() -> dict[str, str]:
    """Allow only runtime necessities; credential-bearing proxy URLs are excluded."""
    source = dict(os.environ)
    result = minimal_environment(source)
    for key in ("SHELL", "CODEX_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
                "NO_PROXY", "no_proxy"):
        if key in source:
            result[key] = source[key]
    for key in ("HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"):
        value = source.get(key)
        if not value:
            continue
        parsed = urlsplit(value)
        if parsed.scheme in ("http", "https") and not parsed.username and not parsed.password:
            result[key] = value
    return result


class CodexConnection:
    def __init__(
        self, controller: ProcessController, run_id: str, executable: str, cwd: Path,
    ) -> None:
        self.controller = controller
        self.run_id = run_id
        self.executable = executable
        self.cwd = cwd
        self.session: ProcessSession | None = None
        self.reader: asyncio.Task[None] | None = None
        self.stderr_reader: asyncio.Task[None] | None = None
        self.pending: dict[int, asyncio.Future[Any]] = {}
        self.listeners: set[Callable[[dict[str, Any]], None]] = set()
        self.backlog: list[dict[str, Any]] = []
        self.next_id = 1
        self.closed = False
        self.close_lock = asyncio.Lock()

    async def connect(self) -> None:
        if self.session is not None:
            raise CodexProtocolError("EXECUTOR_PROTOCOL_ERROR")
        try:
            self.session = await self.controller.spawn(
                self.run_id, self.executable, ["app-server", "--stdio"], self.cwd,
                environment=codex_environment(),
            )
        except ProcessError as error:
            raise CodexProtocolError("EXECUTOR_START_FAILED") from error
        self.reader = asyncio.create_task(self._read())
        self.stderr_reader = asyncio.create_task(self._discard_stderr())
        try:
            await self.request("initialize", {"clientInfo": {
                "name": "forge_python_executor", "title": "Forge Executor", "version": "0.0.1",
            }}, 15)
            await self.notify("initialized", {})
        except BaseException:
            await self.dispose()
            raise

    async def _discard_stderr(self) -> None:
        if self.session is None or self.session.stderr is None:
            return
        while await self.session.stderr.read(65536):
            pass  # Provider diagnostics may contain credentials or private paths.

    def add_listener(self, listener: Callable[[dict[str, Any]], None]) -> None:
        self.listeners.add(listener)
        for message in self.backlog:
            listener(message)
        self.backlog.clear()

    def remove_listener(self, listener: Callable[[dict[str, Any]], None]) -> None:
        self.listeners.discard(listener)

    def _emit(self, message: dict[str, Any]) -> None:
        if not self.listeners:
            if len(self.backlog) >= 256:
                self._fail("EXECUTOR_PROTOCOL_ERROR")
                return
            self.backlog.append(message)
            return
        for listener in tuple(self.listeners):
            try:
                listener(message)
            except Exception:
                self._fail("EXECUTOR_PROTOCOL_ERROR")

    def _fail(self, code: str) -> None:
        error = CodexProtocolError(code)
        for future in self.pending.values():
            if not future.done():
                future.set_exception(error)
        self.pending.clear()
        if self.listeners:
            for listener in tuple(self.listeners):
                try:
                    listener({"method": "forge/connectionFailed", "params": {"code": code}})
                except Exception:
                    pass

    async def _read(self) -> None:
        if self.session is None or self.session.stdout is None:
            return
        try:
            while True:
                raw = await self.session.stdout.readline()
                if not raw:
                    self._fail("EXECUTOR_RUNTIME_ERROR")
                    return
                if len(raw) > MAX_FRAME:
                    self._fail("EXECUTOR_PROTOCOL_ERROR")
                    return
                try:
                    value = json.loads(raw)
                except ValueError:
                    self._fail("EXECUTOR_PROTOCOL_ERROR")
                    return
                if not isinstance(value, dict):
                    self._fail("EXECUTOR_PROTOCOL_ERROR")
                    return
                if "method" in value:
                    if (
                        not isinstance(value["method"], str)
                        or not value["method"]
                        or "id" in value and (type(value["id"]) is not int or value["id"] < 0)
                    ):
                        self._fail("EXECUTOR_PROTOCOL_ERROR")
                        return
                    self._emit(value)
                else:
                    identifier = value.get("id")
                    if type(identifier) is not int or identifier < 0 or (
                        ("result" in value) == ("error" in value)
                    ):
                        self._fail("EXECUTOR_PROTOCOL_ERROR")
                        return
                    future = self.pending.pop(identifier, None)
                    if future is None or future.done():
                        continue
                    if "error" in value:
                        future.set_exception(CodexProtocolError("EXECUTOR_PROTOCOL_ERROR"))
                    else:
                        future.set_result(value["result"])
        except (ValueError, OSError):
            self._fail("EXECUTOR_PROTOCOL_ERROR")

    async def send(self, frame: dict[str, Any]) -> None:
        if self.closed or self.session is None or self.session.stdin is None:
            raise CodexProtocolError("EXECUTOR_RUNTIME_ERROR")
        raw = json.dumps(frame, ensure_ascii=False, separators=(",", ":")).encode() + b"\n"
        if len(raw) > MAX_FRAME:
            raise CodexProtocolError("EXECUTOR_PROTOCOL_ERROR")
        self.session.stdin.write(raw)
        try:
            await self.session.stdin.drain()
        except (ConnectionError, OSError) as error:
            raise CodexProtocolError("EXECUTOR_RUNTIME_ERROR") from error

    async def notify(self, method: str, params: dict[str, Any]) -> None:
        await self.send({"method": method, "params": params})

    async def respond(self, identifier: int, result: dict[str, Any]) -> None:
        await self.send({"id": identifier, "result": result})

    async def request(
        self, method: str, params: dict[str, Any], timeout: float = 30,
    ) -> Any:
        identifier = self.next_id
        self.next_id += 1
        future: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self.pending[identifier] = future
        try:
            await self.send({"method": method, "params": params, "id": identifier})
            return await asyncio.wait_for(future, timeout)
        except TimeoutError as error:
            raise CodexProtocolError("EXECUTOR_TIMEOUT") from error
        finally:
            self.pending.pop(identifier, None)

    async def dispose(self) -> None:
        async with self.close_lock:
            if self.closed:
                return
            self.closed = True
            self._fail("EXECUTOR_RUNTIME_ERROR")
            if self.session is not None:
                report = await self.controller.cancel(self.run_id)
                if not report.confirmed:
                    raise CodexProtocolError("EXECUTOR_RUNTIME_ERROR")
                if self.session.stdin is not None:
                    self.session.stdin.close()
                await self.session.wait()
            for task in (self.reader, self.stderr_reader):
                if task is not None:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
            self.listeners.clear()
            self.backlog.clear()

    @property
    def process_id(self) -> UUID | None:
        return self.session.descriptor.processId if self.session is not None else None
