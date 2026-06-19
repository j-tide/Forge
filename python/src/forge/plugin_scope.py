"""Activation-owned resource scope; reverse cleanup is bounded and idempotent."""

from __future__ import annotations

import inspect
from asyncio import CancelledError
from collections.abc import Callable

from forge.plugin_api import Disposable, PluginError


class Registration:
    def __init__(self, release: Callable[[], None]) -> None:
        self._release = release
        self._disposed = False

    def dispose(self) -> None:
        if self._disposed:
            return
        self._disposed = True
        self._release()


class DisposableScope:
    def __init__(self) -> None:
        self._resources: list[Disposable] = []
        self._closed = False

    def track(self, resource: Disposable) -> Disposable:
        if self._closed:
            raise PluginError("PLUGIN_SCOPE_CLOSED")
        if not callable(getattr(resource, "dispose", None)):
            raise PluginError("PLUGIN_DISPOSABLE_INVALID")
        self._resources.append(resource)
        return resource

    @property
    def count(self) -> int:
        return len(self._resources)

    async def dispose(self) -> None:
        if self._closed:
            return
        self._closed = True
        failures: list[BaseException] = []
        while self._resources:
            resource = self._resources.pop()
            try:
                result = resource.dispose()
                if inspect.isawaitable(result):
                    await result
            except BaseException as error:
                failures.append(error)
        if failures:
            for failure in failures:
                if isinstance(failure, CancelledError):
                    raise failure
            raise PluginError("PLUGIN_DISPOSE_FAILED")
