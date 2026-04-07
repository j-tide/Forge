"""Desktop prerequisite probes are bounded and never disclose local credentials."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

import forge.dependencies as dependencies
import forge.host as host_module
from forge.host import HostRuntime
from forge.protocol import TRANSPORT_VERSION, ProtocolError, RpcRequest


def test_fixed_read_only_probes_and_no_path_or_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[list[str]] = []
    monkeypatch.setattr(dependencies.shutil, "which", lambda name: f"/private/secret/{name}")
    monkeypatch.setattr(dependencies, "codex_environment", lambda: {
        "PATH": "/private/secret", "HTTPS_PROXY": "http://proxy.invalid:8080",
        "API_KEY": "must-never-leak",
    })

    def fake_run(argv: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        called.append(argv)
        assert kwargs["timeout"] == dependencies.PROBE_TIMEOUT_SECONDS
        assert "shell" not in kwargs
        content = {("git", "--version"): "git version 2.39.5 (Apple Git-154)",
                   ("codex", "--version"): dependencies.CODEX_VERSION,
                   ("codex", "login", "status"): "Logged in with ChatGPT"}
        return subprocess.CompletedProcess(argv, 0, content[(Path(argv[0]).name, *argv[1:])], "")

    monkeypatch.setattr(dependencies.subprocess, "run", fake_run)
    snapshot = dependencies._inspect()
    assert snapshot["git"] == {"status": "available",
                               "version": "git version 2.39.5 (Apple Git-154)"}
    assert snapshot["codex"] == {"status": "authenticated",
                                 "version": dependencies.CODEX_VERSION}
    assert snapshot["proxy"] == {"status": "configured"}
    shown = json.dumps(snapshot)
    assert "private/secret" not in shown and "must-never-leak" not in shown
    assert [item[1:] for item in called] == [
        ["--version"], ["--version"], ["login", "status"],
    ]


def test_missing_and_mismatched_codex_never_claim_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dependencies.shutil, "which", lambda name: None)
    monkeypatch.setattr(dependencies, "codex_environment", lambda: {"PATH": "/usr/bin"})
    assert dependencies._inspect()["codex"]["status"] == "missing"
    monkeypatch.setattr(dependencies.shutil, "which", lambda name: f"/usr/bin/{name}")
    monkeypatch.setattr(dependencies, "_run", lambda executable, args: (
        0, "codex-cli 99.0.0" if Path(executable).name == "codex" else "git version 2.39.5"
    ))
    assert dependencies._inspect()["codex"] == {
        "status": "version_mismatch", "version": "codex-cli 99.0.0",
    }
    monkeypatch.setattr(dependencies, "_run", lambda executable, args: (
        0, "secret=must-not-return" if Path(executable).name == "codex" else "git version 2.39.5"
    ))
    assert dependencies._inspect()["codex"] == {"status": "unavailable", "version": None}


@pytest.mark.asyncio
async def test_host_dependencies_is_allowlisted_and_read_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    host.storage_health()
    async def fixture_probe() -> dict[str, object]:
        return {"format": "forge-desktop-dependencies/v1"}
    monkeypatch.setattr(host_module, "inspect_dependencies", fixture_probe)
    def request(params: dict[str, object]) -> RpcRequest:
        return RpcRequest(jsonrpc="2.0", id=str(uuid4()),
                          method="system.dependencies", params=params,
                          transportVersion=TRANSPORT_VERSION)
    try:
        assert await host.dispatch_async(request({})) == {
            "format": "forge-desktop-dependencies/v1",
        }
        with pytest.raises(ProtocolError) as invalid:
            await host.dispatch_async(request({"executable": "/bin/sh"}))
        assert invalid.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError) as unknown:
            await host.dispatch_async(request({}).model_copy(update={
                "method": "system.runArbitrary",
            }))
        assert unknown.value.code == "UNKNOWN_COMMAND"
        assert host.processes.records == {}
    finally:
        await host.shutdown()
