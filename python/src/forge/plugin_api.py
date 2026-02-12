"""Public Python plugin boundary; manifests mirror the read-only reference schema."""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from pathlib import PurePosixPath, PureWindowsPath
from typing import TYPE_CHECKING, Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forge.executor_contracts import ExecutorAdapter
from forge.model_provider import ModelProvider

if TYPE_CHECKING:
    from forge.tool_registry import ToolDefinition

PLUGIN_API_RANGE = "^1.0.0"
PLUGIN_API_VERSION = "1.0.0"
Permission = Literal["workspace.read", "workspace.write", "process.spawn"]
Platform = Literal["darwin-arm64", "darwin-x64", "win32-x64", "linux-x64"]
IDENTIFIER = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"


class PluginError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class Contributions(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    executors: list[str]
    modelProviders: list[str]
    contextProviders: list[str]
    tools: list[str]
    verifiers: list[str]
    viewTypes: list[str]

    @field_validator("executors", "modelProviders", "contextProviders", "tools",
                     "verifiers", "viewTypes")
    @classmethod
    def unique_identifiers(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values) or any(
            re.fullmatch(IDENTIFIER, value) is None for value in values
        ):
            raise ValueError("Duplicate or invalid contribution ID")
        return values


class PluginManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    id: str = Field(pattern=IDENTIFIER)
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")
    forgeApiRange: str = Field(min_length=1)
    entry: str = Field(min_length=1)
    execution: Literal["bundled-trusted", "external-process"]
    contributes: Contributions
    requires: list[str]
    requestedPermissions: list[str]
    configSchema: str = Field(min_length=1)
    supportedPlatforms: list[Platform] = Field(min_length=1)

    @field_validator("entry", "configSchema")
    @classmethod
    def package_relative_path(cls, value: str) -> str:
        path = PurePosixPath(value)
        if (
            path.is_absolute() or PureWindowsPath(value).is_absolute()
            or "\\" in value or ".." in path.parts or value.startswith("./")
        ):
            raise ValueError("Plugin file must be inside its package")
        return value

    @field_validator("requires", "requestedPermissions")
    @classmethod
    def unique_nonempty(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values) or any(not value for value in values):
            raise ValueError("Duplicate or empty declaration")
        return values


class PluginContext(Protocol):
    def require_service(self, service_id: str) -> object: ...

    def register_executor(self, adapter: ExecutorAdapter) -> Disposable: ...

    def register_model_provider(self, provider: ModelProvider) -> Disposable: ...

    def register_tool(
        self, definition: ToolDefinition, handler: Callable[[Any], Awaitable[Any]],
    ) -> Disposable: ...

    def track_disposable(self, disposable: Disposable) -> Disposable: ...


class Disposable(Protocol):
    def dispose(self) -> object: ...


class ForgePlugin(Protocol):
    async def activate(self, context: PluginContext) -> Disposable | None: ...

    async def dispose(self) -> None: ...
