"""Explicit loopback-only gateway staging; normal Desktop never starts a listener.

P7-02 does not open a listener from the Host or Desktop. Later tasks must add
authentication, device scope and the command adapter before any remote action.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import time
from collections import deque
from collections.abc import Callable
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from typing import Any, ClassVar, cast
from urllib.parse import parse_qs, unquote, urlsplit

from forge.device_pairing import PairingError
from forge.remote_commands import RemoteCommandError
from forge.remote_sessions import RemoteSessionError


class GatewayError(Exception):
    """Configuration or source safety failure without disclosing local paths."""


class _LoopbackServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True


class StaticGatewayHandler(BaseHTTPRequestHandler):
    web_root: ClassVar[Path]
    server_version = "ForgeLoopback/0.1"
    sys_version = ""

    def log_message(self, format: str, *args: object) -> None:
        # Never log requested URL, query, headers, cookies, or local filesystem paths.
        pass

    def _reply(
        self, code: int, body: bytes, content_type: str,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; object-src 'none'; frame-ancestors 'none'")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _trusted_host(self) -> bool:
        host = self.headers.get("Host", "")
        port = cast(ThreadingHTTPServer, self.server).server_port
        return host in (f"127.0.0.1:{port}", f"localhost:{port}")

    def _file(self, url_path: str) -> Path | None:
        decoded = unquote(url_path)
        if "\\" in decoded or "//" in decoded:
            return None
        name = decoded.lstrip("/") or "index.html"
        if name not in ("index.html", "favicon.svg") and not (
            name.startswith("assets/") and len(name.split("/")) == 2
        ):
            return None
        if any(part in (".", "..", "") for part in name.split("/")):
            return None
        target = self.web_root / name
        if target.is_symlink() or target.parent.is_symlink() or not target.is_file():
            return None
        if not target.resolve().is_relative_to(self.web_root):
            return None
        return target

    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        if not self._trusted_host():
            self._reply(403, b"Forbidden", "text/plain; charset=utf-8")
            return
        path = urlsplit(self.path).path
        if path.startswith("/v1/"):
            self._reply(401, b'{"code":"REMOTE_AUTH_UNAVAILABLE"}', "application/json")
            return
        target = self._file(path)
        if target is None:
            self._reply(404, b"Not found", "text/plain; charset=utf-8")
            return
        if target.stat().st_size > 16 * 1024 * 1024:
            self._reply(413, b"Asset too large", "text/plain; charset=utf-8")
            return
        content = target.read_bytes()
        media = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if media in ("text/html", "text/css", "application/javascript", "image/svg+xml"):
            media += "; charset=utf-8"
        self._reply(200, content, media)

    def do_POST(self) -> None:
        self._reply(403, b'{"code":"REMOTE_COMMANDS_DISABLED"}', "application/json")

    def do_OPTIONS(self) -> None:
        self._reply(403, b'{"code":"REMOTE_ORIGIN_REJECTED"}', "application/json")


class _BoundedRate:
    def __init__(self, limit: int = 30, window_seconds: int = 600) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._hits: deque[float] = deque()
        self._lock = Lock()

    def allow(self) -> bool:
        now = time.monotonic()
        with self._lock:
            while self._hits and self._hits[0] <= now - self.window_seconds:
                self._hits.popleft()
            if len(self._hits) >= self.limit:
                return False
            self._hits.append(now)
            return True


class _AuthServer(_LoopbackServer):
    def __init__(
        self, address: tuple[str, int], handler: type[BaseHTTPRequestHandler],
        dispatch: Callable[[str, dict[str, Any]], dict[str, Any]],
    ) -> None:
        self.auth_dispatch = dispatch
        self.auth_rate = _BoundedRate()
        super().__init__(address, handler)


class AuthGatewayHandler(StaticGatewayHandler):
    """Optional Host-loop-backed auth; never configured by the static CLI."""

    def _origin_allowed(self, *, require_origin: bool) -> bool:
        if len(self.headers.get_all("Host", [])) != 1 or not self._trusted_host():
            return False
        if self.headers.get("Sec-Fetch-Site", "same-origin") != "same-origin":
            return False
        origin = self.headers.get("Origin")
        if len(self.headers.get_all("Origin", [])) > 1:
            return False
        expected = "http://" + self.headers.get("Host", "")
        return origin == expected if require_origin else origin in (None, expected)

    def _json(self, code: int, value: dict[str, Any],
              extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
        self._reply(code, body, "application/json; charset=utf-8", extra_headers)

    def _body_json(self, *, max_bytes: int = 4096) -> dict[str, Any] | None:
        if self.headers.get("Content-Type") != "application/json":
            return None
        if self.headers.get("Transfer-Encoding") or len(self.headers.get_all(
            "Content-Length", [])) != 1:
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if not 1 <= length <= max_bytes:
            return None
        try:
            self.connection.settimeout(3)
            value: Any = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeDecodeError, TimeoutError, OSError):
            return None
        if not isinstance(value, dict):
            return None
        return cast(dict[str, Any], value)

    def _body(self, fields: frozenset[str]) -> dict[str, str] | None:
        value = self._body_json()
        if value is None or set(value) != fields:
            return None
        if not all(isinstance(item, str) and 0 < len(item) <= 256
                   for item in value.values()):
            return None
        return cast(dict[str, str], value)

    def _token(self) -> str:
        raw = self.headers.get("Cookie", "")
        if len(raw) > 4096:
            return ""
        cookie = SimpleCookie()
        try:
            cookie.load(raw)
        except Exception:
            return ""
        item = cookie.get("__Host-forge_session")
        return item.value if item else ""

    def _dispatch(self, method: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        try:
            return cast(_AuthServer, self.server).auth_dispatch(method, payload)
        except (PairingError, RemoteSessionError) as error:
            self._json(401 if error.code.startswith("REMOTE_AUTH") else 403,
                       {"code": error.code})
        except RemoteCommandError as error:
            self._json(error.status, {"code": error.code})
        except TimeoutError:
            self._json(503, {"code": "REMOTE_HOST_TIMEOUT"})
        except Exception:
            self._json(503, {"code": "REMOTE_HOST_UNAVAILABLE"})
        return None

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        path = parsed.path
        if path == "/v1/projects" or (
            path.startswith("/v1/projects/") and path.endswith("/board")
        ) or path.startswith("/v1/tasks/"):
            if not self._origin_allowed(require_origin=False) or (
                self.headers.get("X-Forge-Session") != "1"
            ):
                self._json(403, {"code": "REMOTE_ORIGIN_REJECTED"})
                return
            if not cast(_AuthServer, self.server).auth_rate.allow():
                self._json(429, {"code": "REMOTE_RATE_LIMITED"})
                return
            if path == "/v1/projects":
                query = parse_qs(parsed.query, keep_blank_values=True)
                if set(query) - {"limit", "cursor"} or any(
                    len(value) != 1 for value in query.values()
                ):
                    self._json(400, {"code": "REMOTE_INVALID_REQUEST"})
                    return
                try:
                    limit = int(query.get("limit", ["50"])[0])
                except ValueError:
                    self._json(400, {"code": "REMOTE_INVALID_REQUEST"})
                    return
                payload: dict[str, Any] = {
                    "limit": limit, "cursor": query.get("cursor", [None])[0],
                }
                method = "project.list"
            elif path.startswith("/v1/projects/"):
                parts = path.split("/")
                if len(parts) != 5 or parts[4] != "board" or parsed.query:
                    self._json(404, {"code": "REMOTE_QUERY_NOT_FOUND"})
                    return
                payload = {"projectId": parts[3]}
                method = "board.snapshot"
            else:
                parts = path.split("/")
                if len(parts) != 4 or not parts[3] or parsed.query:
                    self._json(404, {"code": "REMOTE_QUERY_NOT_FOUND"})
                    return
                payload = {"taskId": parts[3]}
                method = "task.detail"
            data = self._dispatch("query", {
                "sessionToken": self._token(), "method": method, "payload": payload,
            })
            if data is not None:
                self._json(200, data)
            return
        if path != "/v1/session/current":
            super().do_GET()
            return
        if not self._origin_allowed(require_origin=False) or (
            self.headers.get("X-Forge-Session") != "1"
        ):
            self._json(403, {"code": "REMOTE_ORIGIN_REJECTED"})
            return
        data = self._dispatch("current", {"sessionToken": self._token()})
        if data is not None:
            self._json(200, data)

    def do_HEAD(self) -> None:
        if urlsplit(self.path).path.startswith("/v1/"):
            self._json(403, {"code": "REMOTE_METHOD_DISABLED"})
        else:
            super().do_HEAD()

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        methods = {
            "/v1/pair/claim": ("claim", frozenset(("nonce", "deviceLabel"))),
            "/v1/pair/status": ("status", frozenset(("claimSecret",))),
            "/v1/session/refresh": ("refresh", frozenset()),
            "/v1/session/revoke": ("revoke", frozenset()),
        }
        if path not in methods and path != "/v1/commands":
            super().do_POST()
            return
        if not self._origin_allowed(require_origin=True):
            self._json(403, {"code": "REMOTE_ORIGIN_REJECTED"})
            return
        if not cast(_AuthServer, self.server).auth_rate.allow():
            self._json(429, {"code": "REMOTE_RATE_LIMITED"})
            return
        if path == "/v1/commands":
            # Task drafts can be larger than pairing metadata, but writes still
            # have a fixed ingress bound before schema and authorization checks.
            request = self._body_json(max_bytes=64 * 1024)
            if request is None:
                self._json(400, {"code": "REMOTE_INVALID_REQUEST"})
                return
            result = self._dispatch("command", {
                "sessionToken": self._token(),
                "csrfToken": self.headers.get("X-CSRF-Token", ""),
                "request": request,
            })
            if result is not None:
                self._json(200, result)
            return
        method, fields = methods[path]
        body = self._body(fields) if fields else (
            {} if self.headers.get("Content-Length", "0") == "0"
            and not self.headers.get("Transfer-Encoding") else None)
        if body is None:
            self._json(400, {"code": "REMOTE_INVALID_REQUEST"})
            return
        if method in ("refresh", "revoke"):
            body.update({"sessionToken": self._token(),
                         "csrfToken": self.headers.get("X-CSRF-Token", "")})
        if method == "claim":
            body.update({"addressSummary": "loopback", "userAgent":
                         self.headers.get("User-Agent", "")[:256]})
        data = self._dispatch(method, body)
        if data is None:
            return
        headers: dict[str, str] = {}
        if method in ("status", "refresh"):
            token = data.pop("sessionToken", None)
            if token:
                headers["Set-Cookie"] = (
                    f"__Host-forge_session={token}; Path=/; Secure; HttpOnly; SameSite=Strict; "
                    "Max-Age=900")
        elif method == "revoke":
            headers["Set-Cookie"] = (
                "__Host-forge_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0")
        self._json(202 if method == "claim" else 200, data, headers)


def _validated_root(web_root: Path, port: int) -> Path:
    if not 0 <= port <= 65535:
        raise GatewayError("REMOTE_PORT_INVALID")
    try:
        root = web_root.resolve(strict=True)
    except OSError as error:
        raise GatewayError("REMOTE_WEB_ROOT_INVALID") from error
    if not root.is_dir() or web_root.is_symlink() or not (root / "index.html").is_file():
        raise GatewayError("REMOTE_WEB_ROOT_INVALID")
    return root


def create_loopback_gateway(web_root: Path, port: int = 0) -> ThreadingHTTPServer:
    """Caller must explicitly invoke this; never called by Desktop/Host startup."""
    root = _validated_root(web_root, port)

    class Handler(StaticGatewayHandler):
        web_root = root

    return _LoopbackServer(("127.0.0.1", port), Handler)


def create_auth_loopback_gateway(
    web_root: Path, dispatch: Callable[[str, dict[str, Any]], dict[str, Any]],
    port: int = 0,
) -> ThreadingHTTPServer:
    """Explicit development adapter. Dispatch must marshal onto the Host DB loop."""
    root = _validated_root(web_root, port)

    class Handler(AuthGatewayHandler):
        web_root = root

    return _AuthServer(("127.0.0.1", port), Handler, dispatch)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Forge static loopback staging; no remote commands")
    parser.add_argument("--enable-loopback", action="store_true")
    parser.add_argument("--web-root", type=Path, required=True)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    if not args.enable_loopback:
        print("REMOTE_DISABLED: explicitly pass --enable-loopback", file=sys.stderr)
        return 2
    with create_loopback_gateway(args.web_root, args.port) as server:
        print(f"Forge static gateway at http://127.0.0.1:{server.server_port}/; commands disabled",
              flush=True)
        try:
            server.serve_forever(poll_interval=0.1)
        except KeyboardInterrupt:
            pass
        finally:
            server.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
