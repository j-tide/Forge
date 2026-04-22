"""Bundled settings cross the real Host boundary and control app-server startup."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from forge.codex_app_server import CodexConnection, CodexProtocolError
from forge.codex_executor import CodexExecutorAdapter
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.plugin_configuration import BundledPluginConfiguration
from forge.plugins import PluginRegistry
from forge.processes import ProcessController
from forge.protocol import encode_frame

_PERMISSIONS = frozenset(("workspace.read", "workspace.write", "process.spawn"))


async def _session(data_dir: Path) -> tuple[asyncio.subprocess.Process, Any]:
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(data_dir),
             "FORGE_HOST_OWNERSHIP_TOKEN": "plugin-config-test"},
    )
    assert process.stdin and process.stdout

    async def call(method: str, params: dict[str, object] | None = None) -> dict[str, Any]:
        process.stdin.write(encode_frame({
            "jsonrpc": "2.0", "id": str(uuid4()), "method": method,
            "params": params or {}, "transportVersion": "forge-local-jsonrpc/v1",
        }))
        await process.stdin.drain()
        raw = await asyncio.wait_for(process.stdout.readline(), timeout=8)
        assert raw
        return dict(json.loads(raw))

    hello = await call("system.handshake", {
        "productVersion": "0.0.1", "hostVersion": "0.0.1",
        "protocolVersion": "forge-host-protocol/v5",
        "ownershipToken": "plugin-config-test",
    })
    assert "result" in hello, hello
    return process, call


async def _close(process: asyncio.subprocess.Process, call: Any) -> None:
    await call("system.shutdown")
    assert process.stdin
    process.stdin.close()
    await asyncio.wait_for(process.wait(), timeout=8)
    assert process.returncode == 0


@pytest.mark.asyncio
async def test_host_persists_validated_config_and_applies_only_after_restart(
    tmp_path: Path,
) -> None:
    first, call = await _session(tmp_path)
    try:
        current = (await call("plugin.inspectBundled"))["result"]["data"]
        assert current["configRevision"] == 0 and current["configApplied"]
        field = current["configSchema"]["properties"]["appServerInitializationTimeoutSeconds"]
        assert field["minimum"] == 1 and field["maximum"] == 60
        for invalid in ({"appServerInitializationTimeoutSeconds": 0},
                        {"appServerInitializationTimeoutSeconds": 61},
                        {"appServerInitializationTimeoutSeconds": 2.5},
                        {"appServerInitializationTimeoutSeconds": True},
                        {"unknown": 20}, {"credentialRef": "credential:one"}):
            result = await call("plugin.setBundledConfig", {
                "expectedRevision": 0, "config": invalid,
            })
            assert result["error"]["code"] == "PLUGIN_CONFIG_INVALID"
        extra = await call("plugin.setBundledConfig", {
            "expectedRevision": 0, "config": {}, "arbitraryMethod": "system.shutdown",
        })
        assert extra["error"]["code"] == "INVALID_REQUEST"
        saved = (await call("plugin.setBundledConfig", {
            "expectedRevision": 0,
            "config": {"appServerInitializationTimeoutSeconds": 2},
        }))["result"]["data"]
        assert saved["configRevision"] == 1
        assert saved["configValues"] == {"appServerInitializationTimeoutSeconds": 2}
        assert not saved["configApplied"] and saved["restartRequired"]
        conflict = await call("plugin.setBundledConfig", {
            "expectedRevision": 0,
            "config": {"appServerInitializationTimeoutSeconds": 3},
        })
        assert conflict["error"]["code"] == "PLUGIN_CONFIG_REVISION_CONFLICT"
        blocked = await call("run.capabilities", {
            "projectId": str(uuid4()), "taskId": str(uuid4()),
        })
        assert blocked["error"]["code"] == "RUN_PLUGIN_CONFIG_RESTART_REQUIRED"
    finally:
        await _close(first, call)

    reopened, call_again = await _session(tmp_path)
    try:
        applied = (await call_again("plugin.inspectBundled"))["result"]["data"]
        assert applied["configRevision"] == 1 and applied["configApplied"]
        assert not applied["restartRequired"] and applied["active"]
        assert applied["configValues"] == {"appServerInitializationTimeoutSeconds": 2}
    finally:
        await _close(reopened, call_again)

    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(LATEST_SCHEMA)
    registry = PluginRegistry(granted_permissions=_PERMISSIONS)
    registry.register_service("process.v1", ProcessController(uuid4(), tmp_path / "processes"))
    configuration = BundledPluginConfiguration(db, registry).read()
    assert configuration.values == {"appServerInitializationTimeoutSeconds": 2}
    registry.discover_builtin("forge.executor.codex")
    await registry.activate("forge.executor.codex", configuration.values)
    adapter = registry.resolve_executor("executor.codex")
    assert isinstance(adapter, CodexExecutorAdapter)
    assert adapter.initialization_timeout_seconds == 2
    await registry.dispose()
    db.close()


@pytest.mark.asyncio
async def test_stale_locked_config_fails_closed_until_explicit_resave(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(LATEST_SCHEMA)
    db.set_metadata("plugin.forge.executor.codex.configuration.v1", json.dumps({
        "schemaVersion": "1.0", "revision": 4, "pluginVersion": "0.0.2",
        "contentHash": "a" * 64,
        "values": {"appServerInitializationTimeoutSeconds": 20},
    }))
    db.close()
    process, call = await _session(tmp_path)
    try:
        inspection = (await call("plugin.inspectBundled"))["result"]["data"]
        assert not inspection["active"] and not inspection["compatible"]
        assert inspection["configRevision"] == 4
        assert inspection["issues"][-1]["code"] == "PLUGIN_CONFIG_STALE"
        saved = (await call("plugin.setBundledConfig", {
            "expectedRevision": 4,
            "config": {"appServerInitializationTimeoutSeconds": 18},
        }))["result"]["data"]
        assert saved["configRevision"] == 5 and saved["restartRequired"]
    finally:
        await _close(process, call)


@pytest.mark.asyncio
async def test_real_owned_app_server_initialize_respects_saved_timeout(tmp_path: Path) -> None:
    executable = tmp_path / "slow app server"
    executable.write_text(
        f"#!{sys.executable}\n"
        "import json,sys,time\n"
        "for raw in sys.stdin:\n"
        "  frame=json.loads(raw)\n"
        "  if frame.get('method')=='initialize':\n"
        "    time.sleep(1.6)\n"
        "    print(json.dumps({'id':frame['id'],'result':{}}),flush=True)\n",
    )
    executable.chmod(0o700)
    controller = ProcessController(uuid4(), tmp_path / "owned process records")
    too_short = CodexConnection(
        controller, "plugin-timeout-short", str(executable), tmp_path,
        initialization_timeout_seconds=1,
    )
    with pytest.raises(CodexProtocolError, match="EXECUTOR_TIMEOUT"):
        await too_short.connect()
    assert not controller.has_active("plugin-timeout-short")
    enough = CodexConnection(
        controller, "plugin-timeout-long", str(executable), tmp_path,
        initialization_timeout_seconds=6,
    )
    await enough.connect()
    assert controller.has_active("plugin-timeout-long")
    await enough.dispose()
    assert not controller.has_active("plugin-timeout-long")
