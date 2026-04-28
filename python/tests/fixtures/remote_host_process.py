"""Disposable loopback-only Host process for abrupt-termination integration tests."""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from forge.host import HostRuntime
from forge.remote_gateway import create_auth_loopback_gateway


async def main() -> None:
    host = HostRuntime()
    if host.storage_health()["status"] != "ready":
        raise RuntimeError("fixture Host storage unavailable")
    loop = asyncio.get_running_loop()

    def dispatch(method: str, payload: dict[str, Any]) -> dict[str, Any]:
        return asyncio.run_coroutine_threadsafe(
            host.dispatch_remote(method, payload), loop,
        ).result(timeout=3)

    server = create_auth_loopback_gateway(Path(sys.argv[1]), dispatch)
    print(json.dumps({"port": server.server_port}), flush=True)
    try:
        await asyncio.to_thread(server.serve_forever, poll_interval=0.1)
    finally:
        server.shutdown()
        server.server_close()
        await host.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
