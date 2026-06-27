"""Public, provider-neutral text model boundary for the Python Host.

Model generation cannot mutate a Task, approve a decision, or grant a tool.
Coding Executors implement a different contract.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field


class ModelProviderError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ModelCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    providerId: str
    available: bool
    modelIds: list[str]
    structuredOutput: bool
    textStreaming: bool
    usageReporting: bool
    tokenLimitEnforced: bool
    authentication: str
    reason: str | None


class ModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    modelId: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=32_000)
    outputSchema: dict[str, Any] | None = None
    # A real byte limit. Codex app-server does not document a turn token cap.
    maxOutputBytes: int = Field(ge=1, le=1_048_576)
    maxOutputTokens: int | None = Field(default=None, ge=1, le=100_000)


class ModelUsage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    inputTokens: int = Field(ge=0)
    outputTokens: int = Field(ge=0)


class ModelGeneration(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    modelId: str
    content: str | None
    structured: Any | None
    usage: ModelUsage | None


class ModelTextDelta(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sequence: int = Field(ge=1)
    text: str = Field(min_length=1)


class ModelSession(Protocol):
    async def __aenter__(self) -> ModelSession: ...

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None: ...

    async def models(self) -> list[str]: ...

    async def generate(self, request: ModelRequest) -> ModelGeneration: ...

    def stream_text(self, request: ModelRequest) -> AsyncIterator[ModelTextDelta]: ...


class ModelProvider(Protocol):
    id: str

    async def probe(self) -> ModelCapabilities: ...

    def session(self) -> ModelSession: ...
