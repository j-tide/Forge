"""P4-10 applicable local replacement check; not a two-provider acceptance."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from forge.plugins import PluginRegistry


@pytest.mark.asyncio
async def test_locked_context_disposes_then_replaces_adapter_fixture(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    released: list[str] = []
    generation = 0

    class Registration:
        def __init__(self, label: str) -> None:
            self.label = label

        def dispose(self) -> None:
            released.append(self.label)

    class ModelFixture:
        id = "model.codex"

    class PluginFixture:
        def __init__(self, label: str) -> None:
            self.label = label

        async def activate(self, context: object) -> None:
            context.register_executor(SimpleNamespace(id="executor.codex", generation=self.label))
            context.register_model_provider(ModelFixture())
            context.track_disposable(Registration(self.label))

        async def dispose(self) -> None:
            released.append(f"plugin:{self.label}")

    def create_plugin() -> PluginFixture:
        nonlocal generation
        generation += 1
        return PluginFixture(str(generation))

    monkeypatch.setattr("forge.plugins.importlib.import_module", lambda _name: SimpleNamespace(
        create_plugin=create_plugin,
    ))
    registry = PluginRegistry(granted_permissions=frozenset((
        "workspace.read", "workspace.write", "process.spawn",
    )))
    registry.register_service("process.v1", object())
    registry.discover_builtin("forge.executor.codex")
    await registry.activate("forge.executor.codex")
    assert registry.resolve_executor("executor.codex").generation == "1"
    assert await registry.deactivate("forge.executor.codex") == "inactive"
    assert released == ["plugin:1", "1"] and registry.resolve_executor("executor.codex") is None
    await registry.activate("forge.executor.codex")
    assert registry.resolve_executor("executor.codex").generation == "2"
    await registry.dispose()
    assert released == ["plugin:1", "1", "plugin:2", "2"]
    assert registry.resolve_executor("executor.codex") is None
