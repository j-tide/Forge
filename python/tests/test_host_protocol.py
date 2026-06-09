"""Exercise a real independent Python Host over its stdio wire."""

import asyncio
import os
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from forge.protocol import MAX_FRAME_BYTES, ProtocolError, encode_frame, parse_frame


def rpc(request_id: str, method: str, params: dict[str, object] | None = None) -> bytes:
    return encode_frame(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
            "transportVersion": "forge-local-jsonrpc/v1",
        }
    )


def test_rejects_unknown_fields_and_oversized_frames() -> None:
    with pytest.raises(ProtocolError, match="Invalid JSON-RPC request"):
        parse_frame(
            b'{"jsonrpc":"2.0","id":"1","method":"system.ping","params":{},'
            b'"transportVersion":"forge-local-jsonrpc/v1","unexpected":true}\n'
        )
    with pytest.raises(ProtocolError, match="oversized"):
        parse_frame(b"x" * (MAX_FRAME_BYTES + 1))


@pytest.mark.asyncio
async def test_real_host_handshake_health_errors_and_shutdown(tmp_path: Path) -> None:
    env = {
        **os.environ,
        "FORGE_HOST_OWNERSHIP_TOKEN": "test-owned-token",
        "FORGE_HOST_DATA_DIR": str(tmp_path),
    }
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "forge.host",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )
    assert proc.stdin and proc.stdout

    async def call(
        request_id: str, method: str, params: dict[str, object] | None = None
    ) -> dict[str, object]:
        proc.stdin.write(rpc(request_id, method, params))
        await proc.stdin.drain()
        raw = await asyncio.wait_for(proc.stdout.readline(), timeout=3)
        assert raw and len(raw) <= MAX_FRAME_BYTES
        import json

        result: dict[str, object] = json.loads(raw)
        assert result["id"] == request_id
        return result

    try:
        before = await call("before", "system.health")
        assert before["error"]["code"] == "HOST_UNAVAILABLE"  # type: ignore[index]
        mismatch = await call(
            "mismatch",
            "system.handshake",
            {
                "productVersion": "0.0.1",
                "hostVersion": "0.0.1",
                "protocolVersion": "wrong",
                "ownershipToken": "test-owned-token",
            },
        )
        assert mismatch["error"]["code"] == "PROTOCOL_MISMATCH"  # type: ignore[index]
        hello = await call(
            "hello",
            "system.handshake",
            {
                "productVersion": "0.0.1",
                "hostVersion": "0.0.1",
                "protocolVersion": "forge-host-protocol/v5",
                "ownershipToken": "test-owned-token",
            },
        )
        info = hello["result"]
        assert isinstance(info, dict)
        assert info["pid"] == proc.pid
        assert info["runtime"]["python"] == "3.12.13"  # type: ignore[index]
        health = await call("health", "system.health")
        assert health["result"]["hostId"] == info["hostId"]  # type: ignore[index]
        assert health["result"]["storage"]["status"] == "ready"  # type: ignore[index]
        plugin = await call("plugin", "plugin.inspectBundled")
        inspection = plugin["result"]["data"]  # type: ignore[index]
        assert inspection["pluginId"] == "forge.executor.codex"
        assert inspection["configSchema"]["additionalProperties"] is False
        assert inspection["configSchema"]["properties"] == {}
        rejected_plugin = await call("plugin-params", "plugin.inspectBundled", {"path": "/"})
        assert rejected_plugin["error"]["code"] == "INVALID_REQUEST"  # type: ignore[index]
        invalid = await call("invalid", "shell.exec")
        assert invalid["error"]["code"] == "UNKNOWN_COMMAND"  # type: ignore[index]
        rejected = await call("payload", "system.ping", {"command": "whoami"})
        assert rejected["error"]["code"] == "INVALID_REQUEST"  # type: ignore[index]
        stopped = await call("stop", "system.shutdown")
        assert stopped["result"]["status"] == "stopping"  # type: ignore[index]
        assert await asyncio.wait_for(proc.wait(), timeout=3) == 0
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


@pytest.mark.asyncio
async def test_real_host_project_probe_trust_and_restart(tmp_path: Path) -> None:
    source = tmp_path / "project with 空格"
    source.mkdir()
    (source / "package.json").write_text('{"scripts":{"build":"touch should-not-exist"}}')
    data_dir = tmp_path / "data"
    env = {
        **os.environ,
        "FORGE_HOST_OWNERSHIP_TOKEN": "owner",
        "FORGE_HOST_DATA_DIR": str(data_dir),
    }

    async def session() -> tuple[asyncio.subprocess.Process, object]:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "forge.host",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        assert proc.stdin and proc.stdout

        async def call(method: str, params: dict[str, object] | None = None) -> dict[str, object]:
            import json

            proc.stdin.write(rpc(method, method, params))
            await proc.stdin.drain()
            value: dict[str, object] = json.loads(await asyncio.wait_for(proc.stdout.readline(), 3))
            return value

        hello = await call(
            "system.handshake",
            {
                "productVersion": "0.0.1",
                "hostVersion": "0.0.1",
                "protocolVersion": "forge-host-protocol/v5",
                "ownershipToken": "owner",
            },
        )
        assert "result" in hello
        return proc, call

    proc, call = await session()
    try:
        probe_response = await call("project.probe", {"rootPath": str(source)})
        probe = probe_response["result"]["data"]  # type: ignore[index]
        assert probe["scripts"]["build"] == "touch should-not-exist"
        assert not (source / "should-not-exist").exists()
        untrusted = await call(
            "project.create",
            {
                "rootPath": str(source),
                "fingerprint": probe["fingerprint"],
                "trustVersion": "project-trust/v1",
                "approved": False,
                "expectedRevision": 0,
            },
        )
        assert untrusted["error"]["code"] == "PROJECT_TRUST_REQUIRED"  # type: ignore[index]
        created = await call(
            "project.create",
            {
                "rootPath": str(source),
                "fingerprint": probe["fingerprint"],
                "trustVersion": "project-trust/v1",
                "approved": True,
                "expectedRevision": 0,
            },
        )
        project = created["result"]["data"]  # type: ignore[index]
        assert project["trusted"] is True
        assert project["rootPath"] == str(source)
        conversation = (await call(
            "conversation.create",
            {"projectId": project["projectId"], "title": "需求", "expectedRevision": 0},
        ))["result"]["data"]  # type: ignore[index]
        sent = (await call(
            "conversation.send",
            {"projectId": project["projectId"], "conversationId": conversation["conversationId"],
             "idempotencyKey": "python-host-message-01", "text": "Validate add inputs",
             "attachmentIds": []},
        ))["result"]["data"]  # type: ignore[index]
        assert sent["replyStatus"] == "unavailable"
        manual = (await call(
            "draft.manual",
            {"projectId": project["projectId"], "conversationId": conversation["conversationId"],
             "sourceMessageId": sent["message"]["messageId"],
             "idempotencyKey": "python-host-draft-01"},
        ))["result"]["data"]  # type: ignore[index]
        assert manual["contract"] is None and manual["revision"] == 1
        decision_id = str(uuid4())
        decision_ref = f"decision:{decision_id}"
        contract = {
            "schemaVersion": "1.0", "taskId": manual["draftId"],
            "projectId": project["projectId"], "revision": 2,
            "title": "Validate add", "type": "feature", "goal": "Reject invalid inputs",
            "acceptance": [{"id": "AC-01", "statement": "Reject invalid input",
                            "method": "automated", "required": True,
                            "sourceRefs": [decision_ref]}],
            "constraints": [], "scope": ["src/add.js"], "outOfScope": [],
            "dependencies": [], "openQuestions": [], "assumptions": [],
            "sourceRefs": [f"message:{sent['message']['messageId']}", decision_ref],
            "workflowRef": "standard@1", "priority": "normal",
        }
        revised = (await call(
            "draft.revise",
            {"projectId": project["projectId"], "draftId": manual["draftId"],
             "expectedRevision": 1, "contract": contract, "decisionId": decision_id,
             "decisionSummary": "Approved scope", "resolvedQuestions": [],
             "removedAcceptanceIds": [], "confirmScopeChange": True},
        ))["result"]["data"]  # type: ignore[index]
        assert revised["status"] == "proposed"
        request = (await call(
            "approval.request",
            {"projectId": project["projectId"], "draftId": manual["draftId"],
             "expectedRevision": 2},
        ))["result"]["data"]  # type: ignore[index]
        assert request["status"] == "pending"
        approved = (await call(
            "approval.decide",
            {"projectId": project["projectId"], "decision": {
                "schemaVersion": "1.0", "approvalId": request["request"]["approvalId"],
                "decision": "approve", "expectedRevision": 2,
                "scopeHash": request["request"]["scopeHash"], "reason": "Reviewed"}},
        ))["result"]["data"]  # type: ignore[index]
        assert approved["status"] == "approved" and approved["taskState"] == "todo"
        board = (await call(
            "board.snapshot", {"projectId": project["projectId"]}
        ))["result"]["data"]  # type: ignore[index]
        assert len(board["tasks"]) == 1 and board["tasks"][0]["state"] == "todo"
        assert board["boardRevision"] == 1
        invalid = await call("agent.run", {"projectId": project["projectId"]})
        assert invalid["error"]["code"] == "UNKNOWN_COMMAND"  # type: ignore[index]
        await call("system.shutdown")
        assert await asyncio.wait_for(proc.wait(), 3) == 0
    finally:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()

    restarted, call_again = await session()
    try:
        active = await call_again("project.active")
        assert active["result"]["data"]["projectId"] == project["projectId"]  # type: ignore[index]
        restored = await call_again("board.snapshot", {"projectId": project["projectId"]})
        assert restored["result"]["data"]["tasks"][0]["id"] == manual["draftId"]  # type: ignore[index]
        message_list = await call_again(
            "conversation.messages",
            {"projectId": project["projectId"], "conversationId": conversation["conversationId"]},
        )
        assert len(message_list["result"]["data"]) == 1  # type: ignore[index]
        removed = await call_again(
            "project.remove",
            {"projectId": project["projectId"], "expectedRevision": project["revision"]},
        )
        assert removed["result"]["data"]["removedId"] == project["projectId"]  # type: ignore[index]
        assert source.is_dir() and (source / "package.json").is_file()
        await call_again("system.shutdown")
        assert await asyncio.wait_for(restarted.wait(), 3) == 0
    finally:
        if restarted.returncode is None:
            restarted.kill()
            await restarted.wait()
