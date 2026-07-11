"""Actual loopback HTTP transport, no Host/command authority at P7-02."""

from __future__ import annotations

import socket
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

from forge.remote_gateway import GatewayError, create_loopback_gateway


def request(url: str, *, method: str = "GET", host: str | None = None) -> tuple[int, bytes]:
    headers = {"Host": host} if host else {}
    try:
        with urlopen(Request(url, method=method, headers=headers), timeout=2) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()


def test_explicit_loopback_static_origin_never_accepts_commands(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<h1>Forge real Web build fixture</h1>")
    (tmp_path / "favicon.svg").write_text("<svg></svg>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("export const forge = true;")
    server = create_loopback_gateway(tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        assert server.server_address[0] == "127.0.0.1"
        origin = f"http://127.0.0.1:{server.server_port}"
        assert request(origin + "/") == (200, b"<h1>Forge real Web build fixture</h1>")
        assert request(origin + "/assets/app.js")[0] == 200
        assert request(origin + "/v1/health") == (
            401, b'{"code":"REMOTE_AUTH_UNAVAILABLE"}')
        assert request(origin + "/v1/commands", method="POST") == (
            403, b'{"code":"REMOTE_COMMANDS_DISABLED"}')
        assert request(origin + "/index.html", host=f"example.com:{server.server_port}")[0] == 403
        assert request(origin + "/%2e%2e/secret.txt")[0] == 404
        assert request(origin + "/project/README.md")[0] == 404
        outside = tmp_path.parent / "outside-secret.txt"
        outside.write_text("do not serve")
        (tmp_path / "assets" / "escape.js").symlink_to(outside)
        assert request(origin + "/assets/escape.js")[0] == 404
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
    with pytest.raises((ConnectionError, OSError, TimeoutError)):
        with socket.create_connection(("127.0.0.1", server.server_port), timeout=0.2):
            pass


def test_loopback_gateway_rejects_missing_or_symlink_web_root(tmp_path: Path) -> None:
    with pytest.raises(GatewayError, match="REMOTE_WEB_ROOT_INVALID"):
        create_loopback_gateway(tmp_path / "missing")
    (tmp_path / "index.html").write_text("Forge")
    link = tmp_path.parent / "gateway-web-link"
    link.symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(GatewayError, match="REMOTE_WEB_ROOT_INVALID"):
        create_loopback_gateway(link)
    with pytest.raises(GatewayError, match="REMOTE_PORT_INVALID"):
        create_loopback_gateway(tmp_path, port=-1)
