"""P4-02 resource cleanup and dependency order on the production Registry path."""

from __future__ import annotations

import asyncio
import sys
from types import SimpleNamespace

import pytest

from forge.plugin_api import PluginError
from forge.plugin_scope import DisposableScope, Registration
from forge.plugins import PluginRegistry

_ID = "forge.executor.codex"
_GRANTS = frozenset(("workspace.read", "workspace.write", "process.spawn"))


class Resource:
    def __init__(self, label: str, events: list[str], live: set[str]) -> None:
        self.label = label
        self.events = events
        self.live = live
        live.add(label)

    async def dispose(self) -> None:
        self.events.append(self.label)
        self.live.remove(self.label)


class Executor:
    id = "executor.codex"


class FixturePlugin:
    def __init__(self, events: list[str], live: set[str], fail: bool) -> None:
        self.events = events
        self.live = live
        self.fail = fail

    async def activate(self, context: object) -> None:
        context.track_disposable(Resource("first", self.events, self.live))
        context.register_executor(Executor())
        context.track_disposable(Resource("second", self.events, self.live))
        if self.fail:
            raise PluginError("TEST_PARTIAL_ACTIVATION")

    async def dispose(self) -> None:
        self.events.append("plugin")


def registry_with_fixture(monkeypatch: pytest.MonkeyPatch, *, fail: bool = False):
    events: list[str] = []
    live: set[str] = set()

    def create_plugin() -> FixturePlugin:
        return FixturePlugin(events, live, fail)

    monkeypatch.setattr(
        "forge.plugins.importlib.import_module",
        lambda _name: SimpleNamespace(create_plugin=create_plugin),
    )
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object())
    registry.discover_builtin(_ID)
    return registry, events, live


class OwnedProcess:
    def __init__(self, process: asyncio.subprocess.Process) -> None:
        self.process = process

    async def dispose(self) -> None:
        if self.process.returncode is not None:
            return
        self.process.terminate()
        try:
            await asyncio.wait_for(self.process.wait(), timeout=2)
        except TimeoutError:
            self.process.kill()
            await self.process.wait()


@pytest.mark.asyncio
async def test_t036_real_owned_process_returns_to_baseline_ten_times(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    children: list[asyncio.subprocess.Process] = []

    class ProcessPlugin:
        async def activate(self, context: object) -> None:
            process = await asyncio.create_subprocess_exec(
                sys.executable, "-c", "import time; time.sleep(60)",
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
            )
            children.append(process)
            context.track_disposable(OwnedProcess(process))
            context.register_executor(Executor())

        async def dispose(self) -> None:
            pass

    monkeypatch.setattr(
        "forge.plugins.importlib.import_module",
        lambda _name: SimpleNamespace(create_plugin=ProcessPlugin),
    )
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object())
    registry.discover_builtin(_ID)
    try:
        for _ in range(10):
            await registry.activate(_ID)
            assert children[-1].returncode is None
            await registry.deactivate(_ID)
            assert children[-1].returncode is not None
        assert registry.activated == {} and registry.executors == {}
    finally:
        for process in children:
            if process.returncode is None:
                process.kill()
                await process.wait()


@pytest.mark.asyncio
async def test_t036_ten_activations_dispose_every_owned_resource(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry, events, live = registry_with_fixture(monkeypatch)
    for _ in range(10):
        await registry.activate(_ID)
        assert registry.resolve_executor("executor.codex") is not None
        assert live == {"first", "second"}
        await registry.deactivate(_ID)
        assert live == set() and registry.executors == {} and registry.scopes == {}
        assert events[-3:] == ["plugin", "second", "first"]
    await registry.dispose()
    assert len(events) == 30


@pytest.mark.asyncio
async def test_t037_partial_activation_rolls_back_reverse_and_keeps_host_usable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry, events, live = registry_with_fixture(monkeypatch, fail=True)
    with pytest.raises(PluginError, match="TEST_PARTIAL_ACTIVATION"):
        await registry.activate(_ID)
    assert events == ["plugin", "second", "first"]
    assert live == set() and not registry.activated and not registry.executors
    assert registry.services["process.v1"] is not None
    assert registry.resolve_service_order(("process.v1",)) == ("process.v1",)


def test_service_registration_order_duplicates_missing_and_cycle() -> None:
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("gamma", object())
    registry.register_service("beta", object(), requires=("gamma",))
    registry.register_service("alpha", object(), requires=("beta",))
    assert registry.resolve_service_order(("alpha", "gamma")) == ("gamma", "beta", "alpha")
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_DUPLICATE"):
        registry.register_service("alpha", object())
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_UNAVAILABLE"):
        registry.resolve_service_order(("missing",))
    registry.register_service("loop-one", object(), requires=("loop-two",))
    registry.register_service("loop-two", object(), requires=("loop-one",))
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_CYCLE"):
        registry.resolve_service_order(("loop-one",))


@pytest.mark.asyncio
async def test_service_cycle_refuses_plugin_before_entry_import(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object(), requires=("loop",))
    registry.register_service("loop", object(), requires=("process.v1",))
    registry.discover_builtin(_ID)
    imported: list[str] = []
    monkeypatch.setattr(
        "forge.plugins.importlib.import_module", lambda name: imported.append(name)
    )
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_CYCLE"):
        await registry.activate(_ID)
    assert imported == [] and registry.activated == {}


@pytest.mark.asyncio
async def test_registration_and_scope_disposal_are_idempotent() -> None:
    events: list[str] = []
    scope = DisposableScope()
    registration = Registration(lambda: events.append("released"))
    scope.track(registration)
    registration.dispose()
    await scope.dispose()
    await scope.dispose()
    assert events == ["released"]
    with pytest.raises(PluginError, match="PLUGIN_SCOPE_CLOSED"):
        scope.track(registration)


@pytest.mark.asyncio
async def test_failing_disposable_does_not_skip_earlier_cleanup() -> None:
    events: list[str] = []

    class Broken:
        def dispose(self) -> None:
            events.append("broken")
            raise RuntimeError("failure")

    scope = DisposableScope()
    scope.track(Registration(lambda: events.append("first")))
    scope.track(Broken())
    scope.track(Registration(lambda: events.append("last")))
    with pytest.raises(PluginError, match="PLUGIN_DISPOSE_FAILED"):
        await scope.dispose()
    assert events == ["last", "broken", "first"]
    await scope.dispose()
    with pytest.raises(PluginError, match="PLUGIN_DISPOSABLE_INVALID"):
        DisposableScope().track(None)
