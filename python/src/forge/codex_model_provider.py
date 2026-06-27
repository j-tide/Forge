"""Codex app-server as a read-only ModelProvider, separate from Coding Executor."""

from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

from forge.codex_refiner import CODEX_VERSION, _CodexConnection, _environment
from forge.model_provider import (
    ModelCapabilities,
    ModelGeneration,
    ModelProviderError,
    ModelRequest,
    ModelSession,
    ModelTextDelta,
)


class _CodexModelSession(ModelSession):
    def __init__(self, executable: str) -> None:
        self.executable = executable
        self.directory: tempfile.TemporaryDirectory[str] | None = None
        self.connection: _CodexConnection | None = None

    async def __aenter__(self) -> _CodexModelSession:
        self.directory = tempfile.TemporaryDirectory(prefix="forge-model-")
        self.connection = _CodexConnection(self.executable, Path(self.directory.name))
        try:
            await self.connection.open()
        except BaseException:
            await self.__aexit__(None, None, None)
            raise
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        if self.connection is not None:
            await self.connection.close()
            self.connection = None
        if self.directory is not None:
            self.directory.cleanup()
            self.directory = None

    async def models(self) -> list[str]:
        if self.connection is None:
            raise ModelProviderError("MODEL_SESSION_CLOSED")
        result = await self.connection.call("model/list", {"limit": 100})
        models = result.get("data") if isinstance(result, dict) else None
        if not isinstance(models, list):
            raise ModelProviderError("MODEL_PROTOCOL_ERROR")
        return [item["id"] for item in models if isinstance(item, dict)
                and isinstance(item.get("id"), str) and not item.get("hidden")]

    async def generate(self, request: ModelRequest) -> ModelGeneration:
        if self.connection is None:
            raise ModelProviderError("MODEL_SESSION_CLOSED")
        if request.outputSchema is None:
            raise ModelProviderError("MODEL_CAPABILITY_UNSUPPORTED")
        if request.maxOutputTokens is not None:
            raise ModelProviderError("MODEL_CAPABILITY_UNSUPPORTED")
        if request.modelId not in await self.models():
            raise ModelProviderError("MODEL_UNAVAILABLE")
        try:
            async with asyncio.timeout(120):
                result, usage = await self.connection.request_structured(
                    request.prompt, request.outputSchema, request.modelId,
                )
        except TimeoutError as error:
            raise ModelProviderError("MODEL_TIMEOUT") from error
        if len(json.dumps(result, ensure_ascii=False).encode()) > request.maxOutputBytes:
            raise ModelProviderError("MODEL_OUTPUT_TOO_LARGE")
        # Codex app-server's token accounting is not yet verified for this
        # read-only path; never fabricate usage from text length.
        return ModelGeneration(modelId=request.modelId, content=None,
                               structured=result, usage=usage)

    async def stream_text(self, request: ModelRequest) -> AsyncIterator[ModelTextDelta]:
        if self.connection is None:
            raise ModelProviderError("MODEL_SESSION_CLOSED")
        if request.outputSchema is not None:
            raise ModelProviderError("MODEL_CAPABILITY_UNSUPPORTED")
        if request.maxOutputTokens is not None:
            raise ModelProviderError("MODEL_CAPABILITY_UNSUPPORTED")
        if request.modelId not in await self.models():
            raise ModelProviderError("MODEL_UNAVAILABLE")
        total = 0
        sequence = 0
        try:
            async with asyncio.timeout(120):
                async for delta in self.connection.stream_text(request.prompt, request.modelId):
                    total += len(delta.encode())
                    if total > request.maxOutputBytes:
                        raise ModelProviderError("MODEL_OUTPUT_TOO_LARGE")
                    sequence += 1
                    yield ModelTextDelta(sequence=sequence, text=delta)
        except TimeoutError as error:
            raise ModelProviderError("MODEL_TIMEOUT") from error


class CodexModelProvider:
    id = "model.codex"

    async def _available(self) -> str:
        executable = shutil.which("codex")
        if executable is None:
            raise ModelProviderError("MODEL_UNAVAILABLE")
        for argv, expected in ((["--version"], CODEX_VERSION),
                               (["login", "status"], "Logged in")):
            process: asyncio.subprocess.Process | None = None
            try:
                process = await asyncio.create_subprocess_exec(
                    executable, *argv, env=_environment(), stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10)
            except (OSError, TimeoutError) as error:
                if process is not None and process.returncode is None:
                    process.kill()
                    await asyncio.wait_for(process.wait(), timeout=3)
                raise ModelProviderError("MODEL_UNAVAILABLE") from error
            status = (stdout + stderr).decode(errors="replace")
            if process.returncode != 0 or expected not in status:
                raise ModelProviderError("MODEL_AUTH_UNAVAILABLE")
        return executable

    async def probe(self) -> ModelCapabilities:
        try:
            executable = await self._available()
            async with _CodexModelSession(executable) as session:
                models = await session.models()
            return ModelCapabilities(
                providerId=self.id, available=bool(models), modelIds=models,
                structuredOutput=True, textStreaming=True, usageReporting=True,
                tokenLimitEnforced=False,
                authentication="codex-login", reason=None if models else "MODEL_UNAVAILABLE",
            )
        except (ModelProviderError, OSError) as error:
            return ModelCapabilities(
                providerId=self.id, available=False, modelIds=[],
                structuredOutput=False, textStreaming=False, usageReporting=False,
                tokenLimitEnforced=False,
                authentication="codex-login",
                reason=error.code if isinstance(error, ModelProviderError)
                else "MODEL_UNAVAILABLE",
            )

    def session(self) -> ModelSession:
        executable = shutil.which("codex")
        if executable is None:
            raise ModelProviderError("MODEL_UNAVAILABLE")
        return _CodexModelSession(executable)
