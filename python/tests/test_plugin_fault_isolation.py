"""P4-09: a failed bundled plugin cannot take down Core read operations."""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from forge.host import HostRuntime
from forge.plugin_api import PluginError
from forge.protocol import RpcRequest


def request(method: str, params: dict[str, object] | None = None) -> RpcRequest:
    return RpcRequest(jsonrpc="2.0", id="fault", method=method, params=params or {},
                      transportVersion="forge-local-jsonrpc/v1")


@pytest.mark.asyncio
async def test_t040_activation_failure_is_diagnostic_and_projects_remain_readable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path))
    source = tmp_path / "readable project"
    source.mkdir()
    host = HostRuntime()

    class FailingPlugin:
        async def activate(self, _context: object) -> None:
            raise PluginError("PLUGIN_ACTIVATION_FAILED")

        async def dispose(self) -> None:
            return None

    monkeypatch.setattr("forge.plugins.importlib.import_module", lambda _name: SimpleNamespace(
        create_plugin=FailingPlugin,
    ))
    try:
        assert host.storage_health()["status"] == "ready"
        host.plugins.discover_builtin("forge.executor.codex")
        with pytest.raises(PluginError, match="PLUGIN_ACTIVATION_FAILED"):
            await host.plugins.activate("forge.executor.codex")
        fault = host.dispatch(request("plugin.inspectBundled"))["data"]["faults"][-1]
        assert fault["pluginId"] == "forge.executor.codex"
        assert fault["phase"] == "activation" and fault["code"] == "PLUGIN_ACTIVATION_FAILED"
        assert fault["runId"] is None
        probe = host.dispatch(request("project.probe", {"rootPath": str(source)}))["data"]
        project = host.dispatch(request("project.create", {
            "rootPath": str(source), "fingerprint": probe["fingerprint"],
            "trustVersion": "project-trust/v1", "approved": True,
            "expectedRevision": 0,
        }))["data"]
        assert host.dispatch(request("project.list"))["data"] is not None
        board = host.dispatch(request("board.snapshot", {"projectId": project["projectId"]}))
        assert board["data"]["projectId"] == project["projectId"]
        assert host.dispatch(request("system.health"))["storage"]["status"] == "ready"
        assert host.plugins.resolve_executor("executor.codex") is None
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_disposal_error_releases_registration_and_reports_safe_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from forge.plugins import PluginRegistry

    class FailingDispose:
        async def activate(self, context: object) -> None:
            context.register_executor(SimpleNamespace(id="executor.codex"))
            context.register_model_provider(SimpleNamespace(id="model.codex"))

        async def dispose(self) -> None:
            raise RuntimeError("secret path /private/should-not-leak")

    monkeypatch.setattr("forge.plugins.importlib.import_module", lambda _name: SimpleNamespace(
        create_plugin=FailingDispose,
    ))
    registry = PluginRegistry(granted_permissions=frozenset((
        "workspace.read", "workspace.write", "process.spawn",
    )))
    registry.register_service("process.v1", object())
    registry.discover_builtin("forge.executor.codex")
    await registry.activate("forge.executor.codex")
    with pytest.raises(RuntimeError, match="secret path"):
        await registry.deactivate("forge.executor.codex")
    assert registry.resolve_executor("executor.codex") is None
    assert registry.resolve_model_provider("model.codex") is None
    faults = registry.inspect_builtin_config()["faults"]
    assert any(fault["code"] == "PLUGIN_DISPOSE_FAILED" for fault in faults)
    assert "secret path" not in str(faults)


def test_runtime_fault_has_exact_run_impact_and_bounded_secret_free_history() -> None:
    from forge.plugins import PluginRegistry

    registry = PluginRegistry(granted_permissions=frozenset())
    for index in range(55):
        registry.record_fault("forge.executor.codex", "runtime",
                              "secret value!", f"run-{index}")
    assert len(registry.faults) == 50
    assert registry.faults[0]["runId"] == "run-5"
    assert registry.faults[-1]["code"] == "PLUGIN_FAILURE"
    assert "secret value" not in str(registry.faults)


@pytest.mark.asyncio
async def test_run_delivery_exception_records_only_owning_plugin_and_run() -> None:
    from forge.development import HostDevelopmentService
    from forge.plugins import PluginRegistry

    registry = PluginRegistry(granted_permissions=frozenset())
    registry.executor_owner["fixture.executor"] = "fixture.plugin"
    run_id = uuid4()

    async def crash() -> object:
        raise RuntimeError("secret executor diagnostic")

    executing = asyncio.create_task(crash())
    owner = SimpleNamespace(plugins=registry, adapter=SimpleNamespace(id="fixture.executor"),
                            delivering=set(), running={run_id: executing})
    await HostDevelopmentService._deliver(owner, uuid4(), run_id, uuid4(), uuid4(), executing)
    assert owner.running == {}
    assert registry.faults[-1]["pluginId"] == "fixture.plugin"
    assert registry.faults[-1]["runId"] == str(run_id)
    assert registry.faults[-1]["code"] == "PLUGIN_RUNTIME_FAILED"
    assert "secret executor" not in str(registry.faults)


@pytest.mark.asyncio
async def test_failed_run_records_impact_without_disabling_other_host_services() -> None:
    from forge.development import HostDevelopmentService
    from forge.plugins import PluginRegistry

    registry = PluginRegistry(granted_permissions=frozenset())
    registry.executor_owner["fixture.executor"] = "fixture.plugin"
    run_id = uuid4()

    async def failed() -> object:
        return SimpleNamespace(state="failed")

    executing = asyncio.create_task(failed())
    owner = SimpleNamespace(plugins=registry, adapter=SimpleNamespace(id="fixture.executor"),
                            delivering=set(), running={run_id: executing})
    await HostDevelopmentService._deliver(owner, uuid4(), run_id, uuid4(), uuid4(), executing)
    assert registry.faults[-1]["code"] == "EXECUTOR_RUN_FAILED"
    assert registry.faults[-1]["runId"] == str(run_id)
    assert owner.running == {}


@pytest.mark.asyncio
async def test_core_snapshot_failure_is_not_misreported_as_plugin_fault() -> None:
    from forge.development import HostDevelopmentService
    from forge.plugins import PluginRegistry

    registry = PluginRegistry(granted_permissions=frozenset())
    registry.executor_owner["fixture.executor"] = "fixture.plugin"
    run_id = uuid4()

    async def succeeded() -> object:
        return SimpleNamespace(state="succeeded")

    async def failing_freeze(*_args: object) -> object:
        raise RuntimeError("Core snapshot store failed")

    executing = asyncio.create_task(succeeded())
    owner = SimpleNamespace(plugins=registry, adapter=SimpleNamespace(id="fixture.executor"),
                            snapshots=SimpleNamespace(freeze=failing_freeze),
                            delivering=set(), running={run_id: executing}, on_handoff=None)
    await HostDevelopmentService._deliver(owner, uuid4(), run_id, uuid4(), uuid4(), executing)
    assert registry.faults == []
    assert owner.running == {}
