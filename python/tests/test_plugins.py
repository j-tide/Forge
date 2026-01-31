"""Built-in plugin discovery, declarations, permission gates and rollback."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from forge.persistence import ForgePersistence
from forge.plugin_api import PluginError, PluginManifest
from forge.plugin_storage import PluginStorage, PluginStorageBroker
from forge.plugins import PluginRegistry, _ActivationContext, _platform_id
from forge.processes import ProcessController

GRANTS = frozenset(("workspace.read", "workspace.write", "process.spawn"))


def test_manifest_scoped_storage_never_exposes_sql_or_other_plugin_data(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path)
    storage.open()
    storage.migrate(24)
    registry = PluginRegistry(granted_permissions=GRANTS)
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_UNAVAILABLE"):
        registry.register_service("storage.v1", storage)
    registry.register_service("storage.v1", PluginStorageBroker(storage))
    manifest = PluginManifest.model_validate(manifest_data())
    alpha = manifest.model_copy(update={"requires": [*manifest.requires, "storage.v1"]})
    beta = alpha.model_copy(update={"id": "forge.other.plugin"})
    first = _ActivationContext(registry, alpha).require_service("storage.v1")
    second = _ActivationContext(registry, beta).require_service("storage.v1")
    assert isinstance(first, PluginStorage) and isinstance(second, PluginStorage)
    first.put("state", {"one": True})
    assert first.get("state") == {"one": True}
    assert second.get("state") is None
    assert not hasattr(first, "execute") and not hasattr(first, "session")
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_UNAVAILABLE"):
        _ActivationContext(registry, manifest).require_service("storage.v1")
    storage.close()


def manifest_data() -> dict:
    path = Path(__file__).parents[1] / "src/forge/builtin_plugins/codex.manifest.json"
    return json.loads(path.read_text())


def test_manifest_matches_reference_shape_and_rejects_unknown_or_unsafe() -> None:
    raw = manifest_data()
    assert PluginManifest.model_validate(raw).contributes.executors == ["executor.codex"]
    with pytest.raises(ValidationError):
        PluginManifest.model_validate({**raw, "entry": "../outside.py"})
    with pytest.raises(ValidationError):
        PluginManifest.model_validate({**raw, "extra": "execute me"})
    with pytest.raises(ValidationError):
        PluginManifest.model_validate({**raw, "contributes": {
            **raw["contributes"], "executors": ["executor.codex", "executor.codex"],
        }})
    with pytest.raises(ValidationError):
        PluginManifest.model_validate({**raw, "contributes": {
            key: value for key, value in raw["contributes"].items() if key != "executors"
        }})


@pytest.mark.asyncio
async def test_registry_requires_service_permission_and_exact_api() -> None:
    registry = PluginRegistry(granted_permissions=frozenset())
    registry.discover_builtin("forge.executor.codex")
    with pytest.raises(PluginError, match="PLUGIN_PERMISSION_DENIED"):
        await registry.activate("forge.executor.codex")
    assert registry.resolve_executor("executor.codex") is None

    registry = PluginRegistry(granted_permissions=GRANTS)
    manifest = registry.discover_builtin("forge.executor.codex")
    if _platform_id() != "darwin-arm64":
        with pytest.raises(PluginError, match="PLUGIN_PLATFORM_UNSUPPORTED"):
            await registry.activate("forge.executor.codex")
        return
    with pytest.raises(PluginError, match="PLUGIN_SERVICE_UNAVAILABLE"):
        await registry.activate("forge.executor.codex")
    registry.register_service("process.v1", ProcessController(uuid4()))
    registry.manifests[manifest.id] = manifest.model_copy(update={"forgeApiRange": "^2.0.0"})
    with pytest.raises(PluginError, match="PLUGIN_API_UNSUPPORTED"):
        await registry.activate("forge.executor.codex")
    registry.manifests[manifest.id] = manifest.model_copy(update={
        "requestedPermissions": ["shell.any"],
    })
    with pytest.raises(PluginError, match="PLUGIN_PERMISSION_UNKNOWN"):
        await registry.activate("forge.executor.codex")


@pytest.mark.asyncio
async def test_builtin_activation_resolution_and_dispose() -> None:
    registry = PluginRegistry(granted_permissions=GRANTS)
    manifest = registry.discover_builtin("forge.executor.codex")
    assert registry.resolve_executor("executor.codex") is None
    with pytest.raises(PluginError, match="PLUGIN_DUPLICATE"):
        registry.discover_builtin(manifest.id)
    registry.register_service("process.v1", ProcessController(uuid4()))
    if _platform_id() != "darwin-arm64":
        with pytest.raises(PluginError, match="PLUGIN_PLATFORM_UNSUPPORTED"):
            await registry.activate(manifest.id)
        return
    await registry.activate(manifest.id)
    adapter = registry.resolve_executor("executor.codex")
    assert adapter is not None and adapter.id == "executor.codex"
    with pytest.raises(PluginError, match="PLUGIN_ALREADY_ACTIVE"):
        await registry.activate(manifest.id)
    await registry.dispose()
    assert registry.resolve_executor("executor.codex") is None
    await registry.dispose()


@pytest.mark.asyncio
async def test_failed_activation_registers_nothing() -> None:
    registry = PluginRegistry(granted_permissions=GRANTS)
    manifest = registry.discover_builtin("forge.executor.codex")
    registry.register_service("process.v1", ProcessController(uuid4()))
    if _platform_id() != "darwin-arm64":
        return
    registry.manifests[manifest.id] = manifest.model_copy(update={
        "contributes": manifest.contributes.model_copy(update={"executors": ["other.executor"]}),
    })
    with pytest.raises(PluginError, match="PLUGIN_CONTRIBUTION_INVALID"):
        await registry.activate(manifest.id)
    assert not registry.activated and not registry.executors


@pytest.mark.asyncio
async def test_active_run_pins_exact_plugin_and_drains_before_dispose() -> None:
    registry = PluginRegistry(granted_permissions=GRANTS)
    manifest = registry.discover_builtin("forge.executor.codex")
    registry.register_service("process.v1", ProcessController(uuid4()))
    if _platform_id() != "darwin-arm64":
        with pytest.raises(PluginError, match="PLUGIN_PLATFORM_UNSUPPORTED"):
            await registry.activate(manifest.id)
        return
    await registry.activate(manifest.id)
    adapter = registry.resolve_executor("executor.codex")
    frozen = registry.lock_for_executor("executor.codex")
    assert frozen.id == manifest.id and frozen.version == manifest.version
    assert len(frozen.contentHash) == 64
    registry.acquire_run("executor.codex", "run-one", frozen)
    assert await registry.deactivate(manifest.id) == "draining"
    assert registry.resolve_executor("executor.codex") is adapter
    with pytest.raises(PluginError, match="PLUGIN_EXECUTOR_UNAVAILABLE"):
        registry.lock_for_executor("executor.codex")
    with pytest.raises(PluginError, match="PLUGIN_VERSION_MISMATCH"):
        registry.acquire_run("executor.codex", "run-two", frozen)
    with pytest.raises(PluginError, match="PLUGIN_ALREADY_ACTIVE"):
        await registry.activate(manifest.id)
    await registry.release_run("executor.codex", "run-one")
    assert registry.resolve_executor("executor.codex") is None
    assert registry.activated == {} and registry.run_leases == {}
    await registry.release_run("executor.codex", "run-one")
