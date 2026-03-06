"""P7-05: real loopback HTTP is a closed, project-scoped Host read adapter."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from threading import Thread
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

import pytest

from forge.device_pairing import PairingDecisionInput
from forge.host import HostRuntime
from forge.projects import TRUST_VERSION
from forge.protocol import RpcRequest
from forge.remote_commands import _PLANNED_REMOTE_WRITES
from forge.remote_gateway import create_auth_loopback_gateway


def _http(
    url: str, body: dict[str, Any] | None, headers: dict[str, str],
    method: str,
) -> tuple[int, dict[str, Any], dict[str, str]]:
    raw = json.dumps(body).encode() if body is not None else None
    request = Request(url, data=raw, method=method, headers={
        **({"Content-Type": "application/json"} if raw is not None else {}),
        **headers,
    })
    try:
        with urlopen(request, timeout=5) as result:
            return result.status, json.loads(result.read()), dict(result.headers)
    except HTTPError as error:
        return error.code, json.loads(error.read()), dict(error.headers)


def test_remote_write_allowlist_matches_authoritative_planning() -> None:
    source = Path(__file__).resolve().parents[2] / "forge_spec_v1.0" / "planning" / "commands.json"
    entries = json.loads(source.read_text())
    assert _PLANNED_REMOTE_WRITES == frozenset(
        item["method"] for item in entries if item["remoteAllowed"]
    )


@pytest.mark.asyncio
async def test_p7_05_authenticated_http_maps_only_scoped_host_reads(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    assert host.storage_health()["status"] == "ready"
    selected_root = tmp_path / "selected"
    other_root = tmp_path / "other"
    selected_root.mkdir()
    other_root.mkdir()
    selected_probe = host.projects.probe(str(selected_root))
    other_probe = host.projects.probe(str(other_root))
    selected = host.projects.create(
        str(selected_root), selected_probe.fingerprint, TRUST_VERSION, True, 0,
    )
    other = host.projects.create(
        str(other_root), other_probe.fingerprint, TRUST_VERSION, True, 0,
    )
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
    origin = f"http://127.0.0.1:{server.server_port}"

    async def call(
        path: str, body: dict[str, Any] | None,
        headers: dict[str, str], method: str = "POST",
    ) -> tuple[int, dict[str, Any], dict[str, str]]:
        return await asyncio.to_thread(_http, origin + path, body, headers, method)

    headers = {"Origin": origin, "Sec-Fetch-Site": "same-origin"}
    try:
        issued = host.device_pairing.issue()
        status, claim, _ = await call("/v1/pair/claim", {
            "nonce": issued["nonce"], "deviceLabel": "Fixture phone",
        }, headers)
        assert status == 202
        host.device_pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True,
            projectIds=[selected.projectId],
        ))
        status, approved, response_headers = await call("/v1/pair/status", {
            "claimSecret": claim["claimSecret"],
        }, headers)
        assert status == 200 and approved["status"] == "approved"
        cookie = response_headers["Set-Cookie"].split(";", 1)[0]
        trusted = {**headers, "Cookie": cookie, "X-CSRF-Token": approved["csrfToken"]}
        read_headers = {**headers, "Cookie": cookie, "X-Forge-Session": "1"}

        def command(type_name: str, payload: dict[str, Any]) -> dict[str, Any]:
            return {"schemaVersion": "1.0", "commandId": str(uuid4()),
                    "method": type_name, "projectId": str(selected.projectId),
                    "resourceId": None, "expectedRevision": 0,
                    "idempotencyKey": str(uuid4()), "payload": payload}

        listed = await call("/v1/projects", None, read_headers, "GET")
        assert listed[0] == 200, listed
        assert listed[1]["items"] == [{"id": str(selected.projectId),
                                       "name": selected.name, "revision": selected.revision,
                                       "defaultBranch": "unknown", "online": True}]
        assert str(selected_root) not in json.dumps(listed[1])
        assert str(other.projectId) not in json.dumps(listed[1])
        board = await call(f"/v1/projects/{selected.projectId}/board", None,
                           read_headers, "GET")
        assert board[0] == 200 and board[1]["tasks"] == []
        assert board[1]["projectId"] == str(selected.projectId)

        async def local(method: str, params: dict[str, Any]) -> dict[str, Any]:
            response = await host.dispatch_async(RpcRequest(
                jsonrpc="2.0", id=str(uuid4()), method=method, params=params,
                transportVersion="forge-local-jsonrpc/v1",
            ))
            return response["data"]

        project_id = str(selected.projectId)
        conversation = await local("conversation.create", {
            "projectId": project_id, "title": "Remote read fixture", "expectedRevision": 0,
        })
        sent = await local("conversation.send", {
            "projectId": project_id, "conversationId": conversation["conversationId"],
            "idempotencyKey": "remote-read-message-01", "text": "Validate local task read",
            "attachmentIds": [],
        })
        draft = await local("draft.manual", {
            "projectId": project_id, "conversationId": conversation["conversationId"],
            "sourceMessageId": sent["message"]["messageId"],
            "idempotencyKey": "remote-read-draft-01",
        })
        decision_id = str(uuid4())
        decision_ref = f"decision:{decision_id}"
        contract = {
            "schemaVersion": "1.0", "taskId": draft["draftId"], "projectId": project_id,
            "revision": 2, "title": "Read actual task", "type": "feature",
            "goal": "Read a real approved task through the remote adapter",
            "acceptance": [{"id": "AC-01", "statement": "Task is visible",
                            "method": "inspection", "required": True,
                            "sourceRefs": [decision_ref]}],
            "constraints": [], "scope": [], "outOfScope": [], "dependencies": [],
            "openQuestions": [], "assumptions": [],
            "sourceRefs": [f"message:{sent['message']['messageId']}", decision_ref],
            "workflowRef": "standard@1", "priority": "normal",
        }
        await local("draft.revise", {
            "projectId": project_id, "draftId": draft["draftId"],
            "expectedRevision": 1, "contract": contract, "decisionId": decision_id,
            "decisionSummary": "Reviewed scope", "resolvedQuestions": [],
            "removedAcceptanceIds": [], "confirmScopeChange": True,
        })
        approval = await local("approval.request", {
            "projectId": project_id, "draftId": draft["draftId"], "expectedRevision": 2,
        })
        await local("approval.decide", {"projectId": project_id, "decision": {
            "schemaVersion": "1.0", "approvalId": approval["request"]["approvalId"],
            "decision": "approve", "expectedRevision": 2,
            "scopeHash": approval["request"]["scopeHash"], "reason": "Reviewed",
        }})
        task_id = draft["draftId"]
        detail = await call(f"/v1/tasks/{task_id}", None, read_headers, "GET")
        assert detail[0] == 200, detail
        assert detail[1]["task"]["id"] == task_id
        assert detail[1]["task"]["allowedCommands"] == []
        assert detail[1]["contract"]["title"] == "Read actual task"
        assert "sources" not in detail[1]
        assert str(selected_root) not in json.dumps(detail[1])
        assert str(other_root) not in json.dumps(detail[1])
        assert (await call(f"/v1/tasks/{uuid4()}", None,
                           read_headers, "GET"))[0] == 404
        assert (await call("/v1/tasks/../private", None,
                           read_headers, "GET"))[0] == 404
        assert (await call("/v1/projects?limit=0", None, read_headers, "GET"))[0] == 400
        assert (await call("/v1/projects?limit=1&limit=2", None,
                           read_headers, "GET"))[0] == 400
        assert (await call("/v1/projects?cursor=../private", None,
                           read_headers, "GET"))[0] == 400
        forbidden = await call(f"/v1/projects/{other.projectId}/board", None,
                               read_headers, "GET")
        assert forbidden[0] == 403 and forbidden[1]["code"] == "REMOTE_PROJECT_FORBIDDEN"

        for bad in ("executeShell", "plugin.install", "credential.write", "run.start"):
            refused = await call("/v1/commands", command(bad, {}), trusted)
            assert refused[0] == 403 and refused[1]["code"] == "REMOTE_COMMAND_NOT_ALLOWED"
        pending_scope = await call("/v1/commands", command("conversations.send", {}),
                                   trusted)
        assert pending_scope[0] == 403
        assert pending_scope[1]["code"] == "REMOTE_WRITE_SCOPE_UNAVAILABLE"
        forged_actor = await call("/v1/commands", {
            **command("conversations.send", {}),
            "actor": "owner", "scopes": ["*"]}, trusted)
        assert forged_actor[0] == 400
        inner_forgery = await call("/v1/commands", command("conversations.send", {
            "actor": "owner",
        }), trusted)
        assert inner_forgery[0] == 400
        no_csrf = await call("/v1/commands", command("conversations.send", {}), {
            **headers, "Cookie": cookie,
        })
        assert no_csrf[0] == 403
        cross_origin = await call("/v1/commands", command("conversations.send", {}), {
            **trusted, "Origin": "https://evil.invalid",
        })
        assert cross_origin[0] == 403
        assert (await call("/v1/projects", None, {}, "GET"))[0] == 403
        host.remote_sessions.revoke(cookie.split("=", 1)[1], approved["csrfToken"])
        assert (await call("/v1/projects", None, read_headers, "GET"))[0] == 401
        assert (await call(f"/v1/tasks/{task_id}", None, read_headers, "GET"))[0] == 401
        assert (await call("/v1/commands", command("conversations.send", {}),
                           trusted))[0] == 401
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
        await host.shutdown()
