"""Real loopback failure paths; these do not claim physical-phone acceptance."""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from queue import Empty, Queue
from threading import Thread
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID

import pytest

from forge.device_pairing import DevicePairingService, PairingDecisionInput
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.remote_gateway import create_auth_loopback_gateway
from forge.remote_sessions import RemoteSessionService


def _get(url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    try:
        with urlopen(Request(url, headers=headers), timeout=5) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        return error.code, json.loads(error.read())


def _open_stream(url: str, headers: dict[str, str]) -> Any:
    return urlopen(Request(url, headers=headers), timeout=5)


@pytest.mark.asyncio
async def test_expiry_closes_stream_and_host_stop_never_reports_cached_online(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    repo = tmp_path / "real fixture"
    repo.mkdir()
    host = HostRuntime()
    assert host.storage_health()["status"] == "ready"
    project = host.projects.create(
        str(repo), host.projects.probe(str(repo)).fingerprint, TRUST_VERSION, True, 0,
    )
    project_id = str(project.projectId)
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<h1>Forge</h1>")
    loop = asyncio.get_running_loop()

    def dispatch(method: str, payload: dict[str, Any]) -> dict[str, Any]:
        return asyncio.run_coroutine_threadsafe(
            host.dispatch_remote(method, payload), loop,
        ).result(timeout=3)

    server = create_auth_loopback_gateway(web, dispatch)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"

    def authorize(label: str) -> dict[str, str]:
        issued = host.device_pairing.issue()
        claimed = host.device_pairing.claim_from_nonce(
            issued["nonce"], device_name=label, address_summary="loopback",
            fingerprint_summary="fixture-browser",
        )
        host.device_pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True,
            projectIds=[project.projectId],
        ))
        delivered = host.remote_sessions.pairing_status(claimed["claimSecret"])
        return {"Cookie": "__Host-forge_session=" + delivered["sessionToken"],
                "X-Forge-Session": "1"}

    stopped = False
    try:
        first = authorize("Expiring phone")
        board_url = base + f"/v1/projects/{project_id}/board"
        board_status, board = await asyncio.to_thread(_get, board_url, first)
        assert board_status == 200 and board["tasks"] == []
        event_url = base + f"/v1/events?projectId={project_id}"
        stream = await asyncio.to_thread(_open_stream, event_url, {
            **first, "Last-Event-ID": board["eventCursor"],
        })
        try:
            assert await asyncio.to_thread(stream.readline) == b": heartbeat\n"
            assert await asyncio.to_thread(stream.readline) == b"\n"
            with host.storage.transaction() as db:
                db.execute(
                    "UPDATE device_sessions SET expires_at=? WHERE token_hash IS NOT NULL",
                    ("2000-01-01T00:00:00.000Z",),
                )
            assert await asyncio.to_thread(stream.readline) == b""
        finally:
            stream.close()
        status, error = await asyncio.to_thread(_get, board_url, first)
        assert status == 401 and error["code"] == "REMOTE_AUTH_EXPIRED"

        second = authorize("Host-stop phone")
        before_status, before = await asyncio.to_thread(_get, board_url, second)
        assert before_status == 200 and before["tasks"] == []
        stream = await asyncio.to_thread(_open_stream, event_url, {
            **second, "Last-Event-ID": before["eventCursor"],
        })
        try:
            assert await asyncio.to_thread(stream.readline) == b": heartbeat\n"
            assert await asyncio.to_thread(stream.readline) == b"\n"
            await host.shutdown()
            stopped = True
            assert await asyncio.to_thread(stream.readline) == b""
        finally:
            stream.close()
        status, error = await asyncio.to_thread(_get, board_url, second)
        assert status == 503 and error["code"] == "REMOTE_HOST_UNAVAILABLE"

        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
        with pytest.raises((OSError, TimeoutError)):
            await asyncio.to_thread(socket.create_connection,
                                    ("127.0.0.1", server.server_port), 0.2)

        host = HostRuntime()
        assert host.storage_health()["status"] == "ready"
        assert host.projects.get(project_id) is not None
        # The authorized session and authoritative empty board persisted, but
        # the old socket is gone. The client must establish a new connection.
        assert host.remote_sessions.authenticate(second["Cookie"].split("=", 1)[1])[
            "projectIds"
        ] == [project_id]
        assert host.board.snapshot(project_id).tasks == []
    finally:
        if thread.is_alive():
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()
        if not stopped or host.storage.is_open:
            await host.shutdown()


def test_abrupt_owned_host_process_exit_closes_stream_and_restart_resyncs(
    tmp_path: Path,
) -> None:
    data = tmp_path / "data"
    repo = tmp_path / "project"
    repo.mkdir()
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<h1>Forge</h1>")
    db = ForgePersistence(data)
    db.open()
    db.migrate(LATEST_SCHEMA)
    project = ProjectService(db).create(
        str(repo), ProjectService(db).probe(str(repo)).fingerprint,
        TRUST_VERSION, True, 0,
    )
    pairing = DevicePairingService(db)
    issued = pairing.issue()
    claimed = pairing.claim_from_nonce(
        issued["nonce"], device_name="Crash fixture phone",
        address_summary="loopback", fingerprint_summary="fixture-browser",
    )
    pairing.decide(PairingDecisionInput(
        pairingId=UUID(issued["pairingId"]), approve=True,
        projectIds=[project.projectId],
    ))
    delivered = RemoteSessionService(db).pairing_status(claimed["claimSecret"])
    db.close()
    read_headers = {
        "Cookie": "__Host-forge_session=" + delivered["sessionToken"],
        "X-Forge-Session": "1",
    }
    fixture = Path(__file__).parent / "fixtures" / "remote_host_process.py"
    processes: list[subprocess.Popen[str]] = []

    def launch() -> tuple[subprocess.Popen[str], str]:
        process = subprocess.Popen(
            [sys.executable, str(fixture), str(web)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            env={**os.environ, "FORGE_HOST_DATA_DIR": str(data)},
        )
        processes.append(process)
        assert process.stdout is not None
        lines: Queue[str] = Queue()
        Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
        try:
            line = lines.get(timeout=8)
        except Empty as error:
            raise AssertionError("fixture Host did not start") from error
        assert line, "fixture Host exited before readiness"
        return process, f"http://127.0.0.1:{json.loads(line)['port']}"

    try:
        process, origin = launch()
        board_url = origin + f"/v1/projects/{project.projectId}/board"
        status, board = _get(board_url, read_headers)
        assert status == 200 and board["tasks"] == []
        stream = _open_stream(origin + f"/v1/events?projectId={project.projectId}", {
            **read_headers, "Last-Event-ID": board["eventCursor"],
        })
        try:
            assert stream.readline() == b": heartbeat\n"
            assert stream.readline() == b"\n"
            process.kill()  # Only the specific child spawned by this test.
            assert process.wait(timeout=5) != 0
            assert stream.readline() == b""
        finally:
            stream.close()
        with pytest.raises((OSError, TimeoutError)):
            socket.create_connection(("127.0.0.1", int(origin.rsplit(":", 1)[1])), 0.2)
        _, restored_origin = launch()
        restored_status, restored_board = _get(
            restored_origin + f"/v1/projects/{project.projectId}/board", read_headers,
        )
        assert restored_status == 200
        assert restored_board["tasks"] == []
        assert restored_board["eventCursor"] == board["eventCursor"]
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if process.stdout is not None:
                process.stdout.close()
            if process.stderr is not None:
                process.stderr.close()
