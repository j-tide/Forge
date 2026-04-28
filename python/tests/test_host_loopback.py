"""The installed-style stdio Host owns the optional local browser gateway."""

from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from forge.protocol import encode_frame


def http(url: str, body: dict[str, str] | None = None) -> tuple[int, dict[str, Any]]:
    data = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=data, headers={
        "Origin": url.split("/v1/")[0],
        "Sec-Fetch-Site": "same-origin",
        "X-Forge-Session": "1",
        **({"Content-Type": "application/json"} if data else {}),
    })
    try:
        with urlopen(request, timeout=3) as result:
            return result.status, json.loads(result.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


@pytest.mark.asyncio
async def test_owned_stdio_host_starts_and_stops_same_instance_gateway(tmp_path: Path) -> None:
    web = tmp_path / "built web"
    web.mkdir()
    (web / "index.html").write_text("<h1>Forge</h1>")
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data"),
             "FORGE_REMOTE_LOOPBACK_WEB_ROOT": str(web),
             "FORGE_HOST_OWNERSHIP_TOKEN": "local-gateway-test"},
    )
    assert process.stdin and process.stdout

    async def rpc(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        process.stdin.write(encode_frame({"jsonrpc": "2.0", "id": method,
            "method": method, "params": params or {},
            "transportVersion": "forge-local-jsonrpc/v1"}))
        await process.stdin.drain()
        return json.loads(await asyncio.wait_for(process.stdout.readline(), timeout=8))

    try:
        hello = await rpc("system.handshake", {"productVersion": "0.0.1",
            "hostVersion": "0.0.1", "protocolVersion": "forge-host-protocol/v5",
            "ownershipToken": "local-gateway-test"})
        host_id = hello["result"]["hostId"]
        before = await rpc("remote.loopbackInspect")
        assert before["result"]["data"] == {"running": False, "origin": None,
                                              "hostId": host_id}
        started = await rpc("remote.loopbackStart")
        state = started["result"]["data"]
        assert state["running"] is True and state["hostId"] == host_id
        assert state["origin"].startswith("http://127.0.0.1:")
        assert (await rpc("remote.loopbackStart"))["result"]["data"] == state
        assert (await asyncio.to_thread(http, state["origin"] + "/v1/session/current"))[
            0] == 401
        issue = await rpc("devices.pair.issue")
        nonce = issue["result"]["data"]["nonce"]
        claimed_status, claimed = await asyncio.to_thread(
            http, state["origin"] + "/v1/pair/claim",
            {"nonce": nonce, "deviceLabel": "Same Host test browser"},
        )
        assert claimed_status == 202 and claimed["status"] == "pending"
        inspected = await rpc("devices.pair.inspect", {
            "pairingId": issue["result"]["data"]["pairingId"]})
        assert inspected["result"]["data"]["status"] == "claimed"
        stopped = await rpc("remote.loopbackStop")
        assert stopped["result"]["data"] == {"running": False, "origin": None,
                                               "hostId": host_id}
        assert (await rpc("remote.loopbackStop"))["result"]["data"] == stopped[
            "result"]["data"]
        with pytest.raises(OSError):
            await asyncio.to_thread(socket.create_connection,
                ("127.0.0.1", int(state["origin"].rsplit(":", 1)[1])), 0.3)
        restarted = (await rpc("remote.loopbackStart"))["result"]["data"]
        assert restarted["running"] is True
        assert (await rpc("system.shutdown"))["result"]["status"] == "stopping"
        assert await asyncio.wait_for(process.wait(), timeout=8) == 0
        with pytest.raises(OSError):
            await asyncio.to_thread(socket.create_connection,
                ("127.0.0.1", int(restarted["origin"].rsplit(":", 1)[1])), 0.3)
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
