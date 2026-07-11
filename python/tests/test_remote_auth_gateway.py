"""Real loopback HTTP requests marshalled onto the sole Host SQLite owner."""

from __future__ import annotations

import asyncio
import json
import socket
from pathlib import Path
from threading import Thread
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID

import pytest

from forge.device_pairing import DevicePairingService, PairingDecisionInput
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.remote_auth import RemoteAuthDispatcher
from forge.remote_gateway import create_auth_loopback_gateway
from forge.remote_sessions import RemoteSessionService


def http(
    url: str, *, method: str = "POST", body: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, Any], dict[str, str]]:
    encoded = json.dumps(body).encode() if body is not None else None
    request = Request(url, method=method, data=encoded, headers={
        **({"Content-Type": "application/json"} if encoded is not None else {}),
        **(headers or {}),
    })
    try:
        with urlopen(request, timeout=5) as result:
            return result.status, json.loads(result.read()), dict(result.headers)
    except HTTPError as error:
        return error.code, json.loads(error.read()), dict(error.headers)


@pytest.mark.asyncio
async def test_real_http_claim_cookie_origin_csrf_rotation_and_revoke(tmp_path: Path) -> None:
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<h1>Forge</h1>")
    db = ForgePersistence(tmp_path / "data")
    db.open()
    assert db.migrate(LATEST_SCHEMA) == 32
    project_root = tmp_path / "project"
    project_root.mkdir()
    projects = ProjectService(db)
    probe = projects.probe(str(project_root))
    project = projects.create(str(project_root), probe.fingerprint, TRUST_VERSION, True, 0)
    pairing = DevicePairingService(db)
    sessions = RemoteSessionService(db)
    owned_dispatch = RemoteAuthDispatcher(pairing, sessions)
    loop = asyncio.get_running_loop()

    async def on_host_loop(method: str, payload: dict[str, str]) -> dict[str, Any]:
        return owned_dispatch.handle(method, payload)

    def dispatch(method: str, payload: dict[str, str]) -> dict[str, Any]:
        return asyncio.run_coroutine_threadsafe(
            on_host_loop(method, payload), loop).result(timeout=3)

    server = create_auth_loopback_gateway(web, dispatch)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{server.server_port}"

    async def call(path: str, **kwargs: Any) -> tuple[int, dict[str, Any], dict[str, str]]:
        return await asyncio.to_thread(http, origin + path, **kwargs)

    try:
        issued = pairing.issue()
        claim = {"nonce": issued["nonce"], "deviceLabel": "Fixture phone"}
        assert (await call("/v1/pair/claim", body=claim))[0] == 403
        bad_origin = await call("/v1/pair/claim", body=claim,
                                headers={"Origin": "https://evil.invalid"})
        assert bad_origin[1]["code"] == "REMOTE_ORIGIN_REJECTED"
        headers = {"Origin": origin, "Sec-Fetch-Site": "same-origin"}
        status, claimed, _ = await call("/v1/pair/claim", body=claim, headers=headers)
        assert status == 202 and claimed["status"] == "pending"
        assert claimed["pairingId"] == issued["pairingId"]
        assert len(claimed["claimSecret"]) >= 40
        replay = await call("/v1/pair/claim", body=claim, headers=headers)
        assert replay[0] == 403 and replay[1]["code"] == "PAIRING_REJECTED"
        pending = await call("/v1/pair/status", body={
            "claimSecret": claimed["claimSecret"]}, headers=headers)
        assert pending[0] == 200 and pending[1]["status"] == "pending"
        assert "sessionToken" not in pending[1] and "Set-Cookie" not in pending[2]
        pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True,
            projectIds=[project.projectId]))
        approved = await call("/v1/pair/status", body={
            "claimSecret": claimed["claimSecret"]}, headers=headers)
        assert approved[0] == 200 and approved[1]["status"] == "approved"
        assert "sessionToken" not in approved[1]
        cookie = approved[2]["Set-Cookie"]
        for flag in ("Secure", "HttpOnly", "SameSite=Strict", "Path=/"):
            assert flag in cookie
        cookie_pair = cookie.split(";", 1)[0]
        again = await call("/v1/pair/status", body={
            "claimSecret": claimed["claimSecret"]}, headers=headers)
        assert again[0] == 401
        assert (await call("/v1/session/current", method="GET", headers={
            "Cookie": cookie_pair}))[0] == 403
        current = await call("/v1/session/current", method="GET", headers={
            "Cookie": cookie_pair, "X-Forge-Session": "1"})
        assert current[0] == 200 and current[1]["projectIds"] == [str(project.projectId)]
        assert current[1]["csrfToken"] != approved[1]["csrfToken"]
        denied = await call("/v1/session/refresh", headers={
            **headers, "Cookie": cookie_pair, "X-CSRF-Token": "A" * 43})
        assert denied[0] == 403 and denied[1]["code"] == "REMOTE_CSRF_REJECTED"
        cross_site = await call("/v1/session/refresh", headers={
            "Origin": "https://evil.invalid", "Cookie": cookie_pair,
            "X-CSRF-Token": current[1]["csrfToken"]})
        assert cross_site[0] == 403
        refreshed = await call("/v1/session/refresh", headers={
            **headers, "Cookie": cookie_pair, "X-CSRF-Token": current[1]["csrfToken"]})
        assert refreshed[0] == 200 and refreshed[2]["Set-Cookie"] != cookie
        new_cookie = refreshed[2]["Set-Cookie"].split(";", 1)[0]
        assert (await call("/v1/session/current", method="GET", headers={
            "Cookie": cookie_pair, "X-Forge-Session": "1"}))[0] == 401
        assert (await call("/v1/commands/anything", body={}, headers={
            **headers, "Cookie": new_cookie}))[0] == 403
        revoked = await call("/v1/session/revoke", headers={
            **headers, "Cookie": new_cookie,
            "X-CSRF-Token": refreshed[1]["csrfToken"]})
        assert revoked[0] == 200 and "Max-Age=0" in revoked[2]["Set-Cookie"]
        assert (await call("/v1/session/current", method="GET", headers={
            "Cookie": new_cookie, "X-Forge-Session": "1"}))[0] == 401
        invalid = await call("/v1/pair/claim", body={**claim, "actor": "owner"},
                             headers=headers)
        assert invalid[0] == 400
        for _ in range(21):
            await call("/v1/pair/status", body={"claimSecret": "A" * 43}, headers=headers)
        limited = await call("/v1/pair/status", body={"claimSecret": "A" * 43},
                             headers=headers)
        assert limited[0] == 429 and limited[1]["code"] == "REMOTE_RATE_LIMITED"
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
        db.close()
    with pytest.raises((ConnectionError, OSError, TimeoutError)):
        with socket.create_connection(("127.0.0.1", server.server_port), timeout=0.2):
            pass
