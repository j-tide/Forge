"""Bounded, read-only probes for the actual Desktop Host environment."""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from typing import Any

from forge.codex_app_server import codex_environment
from forge.codex_executor import CODEX_VERSION

GIT_VERSION = re.compile(r"git version [0-9]+(?:\.[0-9]+){1,3}(?: \(Apple Git-[0-9]+\))?")
CODEX_CLI_VERSION = re.compile(r"codex-cli [0-9]+(?:\.[0-9]+){1,3}")
PROBE_TIMEOUT_SECONDS = 2.0


def _run(executable: str, args: list[str]) -> tuple[int, str] | None:
    """Run fixed, non-project commands without a shell; never surface raw CLI output."""
    try:
        result = subprocess.run(
            [executable, *args], capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=PROBE_TIMEOUT_SECONDS, check=False,
            env=codex_environment(),
        )
        return result.returncode, (result.stdout + result.stderr)[:4096]
    except (OSError, subprocess.TimeoutExpired):
        return None


def _version(executable: str | None, args: list[str], pattern: re.Pattern[str]) -> str | None:
    if executable is None:
        return None
    outcome = _run(executable, args)
    if outcome is None or outcome[0] != 0:
        return None
    for line in outcome[1].splitlines():
        value = line.strip()
        if pattern.fullmatch(value):
            return value
    return None


def _inspect() -> dict[str, Any]:
    git = shutil.which("git")
    codex = shutil.which("codex")
    git_version = _version(git, ["--version"], GIT_VERSION)
    codex_version = _version(codex, ["--version"], CODEX_CLI_VERSION)
    if codex is None:
        codex_status = "missing"
    elif codex_version is None:
        codex_status = "unavailable"
    elif codex_version != CODEX_VERSION:
        codex_status = "version_mismatch"
    else:
        login = _run(codex, ["login", "status"])
        if login is None:
            codex_status = "unavailable"
        elif login[0] == 0 and "Logged in" in login[1]:
            codex_status = "authenticated"
        else:
            codex_status = "not_authenticated"
    environment = codex_environment()
    return {
        "format": "forge-desktop-dependencies/v1",
        "checkedAt": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "python": {"status": "ready", "version": sys.version.split()[0]},
        "git": {"status": "available" if git_version else "missing" if git is None
                else "unavailable", "version": git_version},
        "codex": {"status": codex_status, "version": codex_version},
        "proxy": {"status": "configured" if any(key in environment for key in (
            "HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"
        )) else "not_configured"},
    }


async def inspect_dependencies() -> dict[str, Any]:
    """Keep bounded CLI checks off the JSON-RPC event loop."""
    return await asyncio.to_thread(_inspect)
