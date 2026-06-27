"""The fixed local control changes real Host plugin state without model calls."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from forge.protocol import encode_frame


@pytest.mark.asyncio
async def test_bundled_plugin_disable_survives_restart_and_blocks_new_runs(
    tmp_path: Path,
) -> None:
    async def session() -> tuple[asyncio.subprocess.Process, object]:
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path),
                 "FORGE_HOST_OWNERSHIP_TOKEN": "plugin-test-owned"},
        )
        assert process.stdin and process.stdout

        async def call(method: str, params: dict[str, object] | None = None) -> dict[str, object]:
            process.stdin.write(encode_frame({
                "jsonrpc": "2.0", "id": str(uuid4()), "method": method,
                "params": params or {}, "transportVersion": "forge-local-jsonrpc/v1",
            }))
            await process.stdin.drain()
            raw = await asyncio.wait_for(process.stdout.readline(), timeout=8)
            assert raw
            result: dict[str, object] = json.loads(raw)
            return result

        hello = await call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": "forge-host-protocol/v5",
            "ownershipToken": "plugin-test-owned",
        })
        assert "result" in hello, hello
        return process, call

    async def close(process: asyncio.subprocess.Process, call: object) -> None:
        await call("system.shutdown")  # type: ignore[operator]
        assert process.stdin
        process.stdin.close()
        await asyncio.wait_for(process.wait(), timeout=8)
        assert process.returncode == 0

    first, first_call = await session()
    try:
        live_response = await first_call("plugin.inspectBundled")  # type: ignore[operator]
        assert "result" in live_response, live_response
        live = live_response["result"]["data"]  # type: ignore[index]
        assert live["enabled"] and live["active"]  # type: ignore[index]
        invalid = await first_call("plugin.setBundledEnabled", {"enabled": 1})  # type: ignore[operator]
        assert invalid["error"]["code"] == "INVALID_REQUEST"  # type: ignore[index]
        disable_response = await first_call(  # type: ignore[operator]
            "plugin.setBundledEnabled", {"enabled": False}
        )
        disabled = disable_response["result"]["data"]  # type: ignore[index]
        assert not disabled["enabled"] and not disabled["active"]  # type: ignore[index]
        catalog = (await first_call("agent.profileCatalog"))["result"]["data"]  # type: ignore[operator,index]
        assert not catalog["executors"][0]["available"]  # type: ignore[index]
    finally:
        await close(first, first_call)

    second, second_call = await session()
    try:
        disabled = (await second_call("plugin.inspectBundled"))["result"]["data"]  # type: ignore[operator,index]
        assert not disabled["enabled"] and not disabled["active"]  # type: ignore[index]
        enable_response = await second_call(  # type: ignore[operator]
            "plugin.setBundledEnabled", {"enabled": True}
        )
        selected = enable_response["result"]["data"]  # type: ignore[index]
        assert selected["enabled"] and selected["restartRequired"]  # type: ignore[index]
        assert not selected["active"]  # type: ignore[index]
    finally:
        await close(second, second_call)

    third, third_call = await session()
    try:
        active = (await third_call("plugin.inspectBundled"))["result"]["data"]  # type: ignore[operator,index]
        assert active["enabled"] and active["active"]  # type: ignore[index]
        assert not active["restartRequired"]  # type: ignore[index]
    finally:
        await close(third, third_call)
