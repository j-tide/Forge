"""Offline Claude Agent SDK supply-chain probe; never authenticates or runs an agent."""

from __future__ import annotations

import asyncio
import importlib.metadata
import json
import os
import platform
import sys
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, ConfigDict

from forge.processes import ProcessController, minimal_environment

SDK_VERSION = "0.2.159"


class ClaudePreflight(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sdkVersion: str
    bundledCliVersion: str
    platform: str
    apiKeyConfigured: bool
    liveVerified: bool


async def probe_claude_sdk(controller: ProcessController) -> ClaudePreflight:
    """Check the installed official wheel and bundled CLI without using credentials."""
    distribution = importlib.metadata.distribution("claude-agent-sdk")
    if distribution.version != SDK_VERSION:
        raise RuntimeError("CLAUDE_SDK_VERSION_MISMATCH")
    binary = Path(str(distribution.locate_file("claude_agent_sdk/_bundled/claude")))
    if not binary.is_file() or binary.is_symlink():
        raise RuntimeError("CLAUDE_BUNDLED_CLI_MISSING")
    run_id = f"claude-preflight-{uuid4()}"
    session = await controller.spawn(
        run_id, str(binary), ["--version"], Path.cwd(),
        environment=minimal_environment(dict(os.environ)),
    )
    try:
        if session.stdout is None or session.stderr is None:
            raise RuntimeError("CLAUDE_PREFLIGHT_STREAM_MISSING")
        stdout, stderr, exit_code = await asyncio.wait_for(
            asyncio.gather(session.stdout.read(4096), session.stderr.read(4096), session.wait()),
            timeout=10,
        )
        if exit_code != 0:
            raise RuntimeError("CLAUDE_BUNDLED_CLI_FAILED")
        version = stdout.decode("utf-8", errors="replace").strip()
        if not version or len(version) > 100:
            raise RuntimeError("CLAUDE_BUNDLED_CLI_INVALID_VERSION")
        # stderr may contain local diagnostics; never relay it or any env value.
        del stderr
        return ClaudePreflight(
            sdkVersion=distribution.version,
            bundledCliVersion=version,
            platform=f"{sys.platform}/{platform.machine().lower()}",
            apiKeyConfigured=bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
            liveVerified=False,
        )
    finally:
        report = await controller.cancel(run_id)
        if not report.confirmed:
            raise RuntimeError("CLAUDE_PREFLIGHT_PROCESS_UNCONFIRMED")


async def _main() -> None:
    controller = ProcessController(uuid4())
    try:
        report = await probe_claude_sdk(controller)
        print(json.dumps(report.model_dump(), separators=(",", ":")))
    finally:
        await controller.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
