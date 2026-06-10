"""Run-scoped subprocess ownership and bounded POSIX process-group cancellation."""

from __future__ import annotations

import asyncio
import json
import os
import re
import signal
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SAFE_ENV = (
    "PATH", "HOME", "USER", "TMPDIR", "LANG", "LC_ALL", "APPDATA",
    "LOCALAPPDATA", "USERPROFILE", "TEMP", "TMP", "SystemRoot", "ComSpec",
)


class ProcessError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ProcessDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    processId: UUID
    runId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    runtimeId: UUID
    pid: int = Field(gt=0)
    parentProcessId: UUID | None
    executable: str = Field(min_length=1)
    argv: list[str]
    cwd: str = Field(min_length=1)
    startedAt: str
    status: Literal["running", "cancelling", "exited", "cancelled", "quarantined"]


class CancellationReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: str
    confirmed: bool
    processIds: list[UUID]
    forced: bool


class ProcessSession:
    """Host-internal stream handle; consumers never receive the raw process as a contract."""

    def __init__(self, descriptor: ProcessDescriptor, process: asyncio.subprocess.Process) -> None:
        self.descriptor = descriptor
        self._process = process
        self.stdin = process.stdin
        self.stdout = process.stdout
        self.stderr = process.stderr

    async def wait(self) -> int:
        return await self._process.wait()


class _Owned:
    def __init__(self, session: ProcessSession) -> None:
        self.session = session
        self.observed_gone = False


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def minimal_environment(source: dict[str, str]) -> dict[str, str]:
    return {key: source[key] for key in SAFE_ENV if key in source}


class ProcessController:
    def __init__(
        self, runtime_id: UUID, journal_dir: Path | None = None,
        grace_seconds: float = 0.8, force_seconds: float = 2.0,
    ) -> None:
        self.runtime_id = runtime_id
        self.journal_dir = journal_dir
        self.grace_seconds = grace_seconds
        self.force_seconds = force_seconds
        self.records: dict[UUID, _Owned] = {}
        self.cancelling: dict[str, asyncio.Task[CancellationReport]] = {}
        self.completed: dict[str, CancellationReport] = {}
        self.accepting = True
        self.lock = asyncio.Lock()

    def _journal(self, descriptor: ProcessDescriptor) -> None:
        if self.journal_dir is None:
            return
        self.journal_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
        if self.journal_dir.is_symlink():
            raise ProcessError("PROCESS_JOURNAL_UNSAFE")
        safe: dict[str, Any] = {
            key: getattr(descriptor, key) for key in (
                "processId", "runId", "runtimeId", "pid", "parentProcessId",
                "startedAt", "status",
            )
        }
        target = self.journal_dir / f"{descriptor.processId}.json"
        temporary = self.journal_dir / f"{descriptor.processId}.{uuid4()}.tmp"
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            stream.write(json.dumps(safe, default=str, separators=(",", ":")))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)

    def _group_alive(self, owned: _Owned) -> bool:
        if owned.observed_gone:
            return False
        try:
            os.killpg(owned.session.descriptor.pid, 0)
            return True
        except ProcessLookupError:
            owned.observed_gone = True
            return False
        except PermissionError:
            return True

    def _signal(self, owned: _Owned, target: signal.Signals) -> None:
        if owned.session.descriptor.runtimeId != self.runtime_id or not self._group_alive(owned):
            return
        try:
            os.killpg(owned.session.descriptor.pid, target)
        except ProcessLookupError:
            owned.observed_gone = True

    async def _wait_gone(self, owned: _Owned, seconds: float) -> bool:
        deadline = asyncio.get_running_loop().time() + seconds
        while asyncio.get_running_loop().time() < deadline:
            if not self._group_alive(owned):
                return True
            await asyncio.sleep(0.04)
        return not self._group_alive(owned)

    async def spawn(
        self, run_id: str, executable: str, argv: list[str], cwd: Path,
        *, environment: dict[str, str] | None = None,
        parent_process_id: UUID | None = None,
    ) -> ProcessSession:
        if sys.platform not in ("darwin", "linux"):
            raise ProcessError("PROCESS_PLATFORM_UNVERIFIED")
        if not self.accepting or not RUN_ID.fullmatch(run_id):
            raise ProcessError("PROCESS_INVALID_RUN")
        if not executable or any(not isinstance(arg, str) for arg in argv):
            raise ProcessError("PROCESS_INVALID_COMMAND")
        try:
            directory = cwd.resolve(strict=True)
        except OSError as error:
            raise ProcessError("PROCESS_INVALID_CWD") from error
        if not directory.is_dir():
            raise ProcessError("PROCESS_INVALID_CWD")
        async with self.lock:
            if run_id in self.cancelling or self.has_active(run_id):
                raise ProcessError("PROCESS_RUN_BUSY")
            self.completed.pop(run_id, None)
            try:
                child = await asyncio.create_subprocess_exec(
                    executable, *argv, cwd=directory,
                    env=environment if environment is not None else minimal_environment(
                        dict(os.environ)
                    ),
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE, start_new_session=True,
                    limit=1024 * 1024 + 1,
                )
            except OSError as error:
                raise ProcessError("PROCESS_START_FAILED") from error
            descriptor = ProcessDescriptor(
                processId=uuid4(), runId=run_id, runtimeId=self.runtime_id,
                pid=child.pid, parentProcessId=parent_process_id,
                executable=executable, argv=argv[:], cwd=str(directory),
                startedAt=_timestamp(), status="running",
            )
            session = ProcessSession(descriptor, child)
            owned = _Owned(session)
            self.records[descriptor.processId] = owned
            try:
                self._journal(descriptor)
            except Exception as error:
                self._signal(owned, signal.SIGKILL)
                await self._wait_gone(owned, self.force_seconds)
                await child.wait()
                self.records.pop(descriptor.processId, None)
                raise ProcessError("PROCESS_OWNERSHIP_RECORD_FAILED") from error
            return session

    def inspect(self, process_id: UUID) -> ProcessDescriptor | None:
        owned = self.records.get(process_id)
        if owned is None:
            return None
        if owned.session.descriptor.status == "running" and not self._group_alive(owned):
            owned.session.descriptor.status = "exited"
            self._journal(owned.session.descriptor)
        return owned.session.descriptor.model_copy(deep=True)

    def inspect_run(self, run_id: str) -> list[ProcessDescriptor]:
        if not RUN_ID.fullmatch(run_id):
            raise ProcessError("PROCESS_INVALID_RUN")
        return [
            descriptor for owned in self.records.values()
            if owned.session.descriptor.runId == run_id
            and (descriptor := self.inspect(owned.session.descriptor.processId)) is not None
        ]

    def has_active(self, run_id: str) -> bool:
        return any(
            owned.session.descriptor.runId == run_id and self._group_alive(owned)
            for owned in self.records.values()
        )

    async def cancel(self, run_id: str) -> CancellationReport:
        if not RUN_ID.fullmatch(run_id):
            raise ProcessError("PROCESS_INVALID_RUN")
        prior = self.completed.get(run_id)
        if prior is not None:
            return prior.model_copy(deep=True)
        operation = self.cancelling.get(run_id)
        if operation is None:
            operation = asyncio.create_task(self._cancel_owned(run_id))
            self.cancelling[run_id] = operation
        try:
            report = await asyncio.shield(operation)
            self.completed[run_id] = report
            return report.model_copy(deep=True)
        finally:
            if operation.done():
                self.cancelling.pop(run_id, None)

    async def _cancel_owned(self, run_id: str) -> CancellationReport:
        targets = [
            item for item in self.records.values() if item.session.descriptor.runId == run_id
        ]
        forced = False
        for owned in targets:
            if not self._group_alive(owned):
                continue
            owned.session.descriptor.status = "cancelling"
            self._journal(owned.session.descriptor)
            self._signal(owned, signal.SIGTERM)
        for owned in targets:
            if await self._wait_gone(owned, self.grace_seconds):
                continue
            forced = True
            self._signal(owned, signal.SIGKILL)
        confirmed = all(
            await asyncio.gather(*[self._wait_gone(item, self.force_seconds) for item in targets])
        )
        for owned in targets:
            owned.session.descriptor.status = "cancelled" if confirmed else "quarantined"
            self._journal(owned.session.descriptor)
        return CancellationReport(
            runId=run_id, confirmed=confirmed,
            processIds=[item.session.descriptor.processId for item in targets], forced=forced,
        )

    def inspect_orphans(self) -> list[dict[str, Any]]:
        if self.journal_dir is None or not self.journal_dir.exists():
            return []
        result: list[dict[str, Any]] = []
        for path in self.journal_dir.glob("*.json"):
            try:
                if path.is_symlink():
                    continue
                record = json.loads(path.read_text())
                if (
                    isinstance(record, dict) and record.get("runtimeId") != str(self.runtime_id)
                    and record.get("status") in ("running", "cancelling", "quarantined")
                    and path.name == f"{record.get('processId')}.json"
                ):
                    result.append(record)
            except (OSError, ValueError):
                continue
        return result

    async def dispose(self) -> list[CancellationReport]:
        self.accepting = False
        run_ids = {item.session.descriptor.runId for item in self.records.values()}
        return await asyncio.gather(*[self.cancel(run_id) for run_id in run_ids])
