"""P7-05: real loopback HTTP and Host-owned Project-scoped command checks."""

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

from forge.conversations import ConversationMessage, ConversationSend, timestamp
from forge.device_pairing import PairingDecisionInput
from forge.host import HostRuntime
from forge.persistence import LATEST_SCHEMA
from forge.projects import TRUST_VERSION
from forge.protocol import RpcRequest
from forge.remote_commands import (
    _PLANNED_REMOTE_WRITES,
    RemoteCommandError,
    _CommandEnvelope,
    map_public_write,
)
from forge.remote_gateway import create_auth_loopback_gateway
from forge.remote_policy import DevicePolicyNarrow


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


def _first_sse(url: str, headers: dict[str, str]) -> tuple[int, list[str]]:
    request = Request(url, headers=headers)
    with urlopen(request, timeout=5) as response:
        lines: list[str] = []
        for _ in range(16):
            line = response.readline().decode().strip()
            if not line and lines:
                break
            lines.append(line)
        return response.status, lines


def test_remote_write_allowlist_matches_authoritative_planning() -> None:
    source = (
        Path(__file__).resolve().parents[2]
        / "packages/contract-validator/fixtures/planning/commands.json"
    )
    entries = json.loads(source.read_text())
    assert _PLANNED_REMOTE_WRITES == frozenset(
        item["method"] for item in entries if item["remoteAllowed"]
    )


def test_public_command_mapping_is_lossless_and_never_fabricates_missing_fields() -> None:
    project_id, conversation_id = str(uuid4()), str(uuid4())
    command = _CommandEnvelope.model_validate({
        "schemaVersion": "1.0", "commandId": str(uuid4()),
        "method": "conversations.send", "projectId": project_id,
        "resourceId": conversation_id, "expectedRevision": 4,
        "idempotencyKey": str(uuid4()),
        "payload": {"conversationId": conversation_id, "text": "Real message",
                    "attachmentIds": []},
    })
    mapped = map_public_write(command)
    assert mapped.method == "conversation.send"
    assert mapped.projectId == UUID(project_id)
    assert mapped.expectedRevision == 4
    assert mapped.params == {
        "projectId": project_id, "conversationId": conversation_id,
        "idempotencyKey": command.idempotencyKey,
        "text": "Real message", "attachmentIds": [],
    }
    for changed, code in (
        ({"projectId": None}, "REMOTE_INVALID_REQUEST"),
        ({"resourceId": str(uuid4())}, "REMOTE_RESOURCE_MISMATCH"),
        ({"payload": {"conversationId": conversation_id, "text": "Real message",
                      "attachmentIds": [], "actor": "owner"}}, "REMOTE_INVALID_REQUEST"),
        ({"method": "tasks.approve", "payload": {"approvalId": str(uuid4()),
                                                   "scopeHash": "0" * 64}},
         "REMOTE_COMMAND_MAPPING_UNAVAILABLE"),
    ):
        with pytest.raises(RemoteCommandError) as error:
            map_public_write(command.model_copy(update=changed))
        assert error.value.code == code


@pytest.mark.asyncio
async def test_remote_contract_draft_uses_real_message_and_atomic_receipt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    root = tmp_path / "fixture"
    other_root = tmp_path / "other"
    root.mkdir()
    other_root.mkdir()
    host = HostRuntime()
    assert host.storage_health()["status"] == "ready"
    project = host.projects.create(
        str(root), host.projects.probe(str(root)).fingerprint, TRUST_VERSION, True, 0,
    )
    other = host.projects.create(
        str(other_root), host.projects.probe(str(other_root)).fingerprint,
        TRUST_VERSION, True, 0,
    )
    conversation = host.conversations.create(str(project.projectId), "Manual", 0)
    source = host.conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="remote-manual-source-01", text="Please check validation",
        attachmentIds=[],
    ))["message"]
    assert isinstance(source, ConversationMessage)
    other_conversation = host.conversations.create(str(other.projectId), "Foreign", 0)
    foreign = host.conversations.send(ConversationSend(
        projectId=other.projectId, conversationId=other_conversation.conversationId,
        idempotencyKey="remote-foreign-source-01", text="Foreign text", attachmentIds=[],
    ))["message"]
    assert isinstance(foreign, ConversationMessage)
    issued = host.device_pairing.issue()
    claim = host.device_pairing.claim_from_nonce(
        issued["nonce"], device_name="Draft phone", address_summary="loopback",
        fingerprint_summary="fixture-draft",
    )
    host.device_pairing.decide(PairingDecisionInput(
        pairingId=UUID(issued["pairingId"]), approve=True,
        projectIds=[project.projectId], scopes=["task:draft"],
    ))
    paired = host.remote_sessions.pairing_status(claim["claimSecret"])
    task_id = str(uuid4())
    command_id = str(uuid4())
    source_ref = f"message:{source.messageId}"
    decision_ref = f"decision:{command_id}"
    contract: dict[str, Any] = {"schemaVersion": "1.0", "taskId": task_id,
                "projectId": str(project.projectId), "revision": 1,
                "title": "Validate add", "type": "feature",
                "goal": "Reject invalid input", "acceptance": [{
                    "id": "ac1", "statement": "Invalid input is rejected",
                    "method": "manual", "required": True,
                    "sourceRefs": [source_ref, decision_ref],
                }], "constraints": [], "scope": [], "outOfScope": [],
                "dependencies": [], "openQuestions": [], "assumptions": [],
                "sourceRefs": [source_ref, decision_ref],
                "workflowRef": "standard@1",
                "priority": "normal"}
    command = {"schemaVersion": "1.0", "commandId": command_id,
               "method": "tasks.createDraft", "projectId": str(project.projectId),
               "resourceId": task_id, "expectedRevision": 0,
               "idempotencyKey": str(uuid4()), "payload": {"contract": contract}}
    request = {"sessionToken": paired["sessionToken"],
               "csrfToken": paired["csrfToken"], "request": command}
    try:
        for bad in (
            {"contract": {**contract, "sourceRefs": []}},
            {"contract": {**contract,
                           "sourceRefs": [f"message:{foreign.messageId}", decision_ref],
                           "acceptance": [{**contract["acceptance"][0],
                                           "sourceRefs": [f"message:{foreign.messageId}",
                                                          decision_ref]}]}},
            {"contract": {**contract, "revision": 2}},
        ):
            with pytest.raises(RemoteCommandError):
                await host.dispatch_remote("command", {**request, "request": {
                    **command, "payload": bad,
                }})
        assert host.drafts.get(str(project.projectId), task_id) is None
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
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            status, receipt, _ = await asyncio.to_thread(
                _http, origin + "/v1/commands", command,
                {"Origin": origin, "Sec-Fetch-Site": "same-origin",
                 "Cookie": f"__Host-forge_session={paired['sessionToken']}",
                 "X-CSRF-Token": paired["csrfToken"], "X-Forge-Session": "1"},
                "POST",
            )
            assert status == 200, receipt
            revision_id = str(uuid4())
            revised_contract = {**contract, "revision": 2,
                                "title": "Validate add with boundaries",
                                "sourceRefs": [*contract["sourceRefs"],
                                               f"decision:{revision_id}"]}
            revision_command = {**command, "commandId": revision_id,
                                "method": "tasks.revise", "expectedRevision": 1,
                                "idempotencyKey": str(uuid4()),
                                "payload": {"contract": revised_contract,
                                            "reason": "Clarify expected boundaries"}}
            revision_request = {**request, "request": revision_command}
            status, revised_receipt, _ = await asyncio.to_thread(
                _http, origin + "/v1/commands", revision_command,
                {"Origin": origin, "Sec-Fetch-Site": "same-origin",
                 "Cookie": f"__Host-forge_session={paired['sessionToken']}",
                 "X-CSRF-Token": paired["csrfToken"], "X-Forge-Session": "1"},
                "POST",
            )
            assert status == 200, revised_receipt
            status, draft_page, _ = await asyncio.to_thread(
                _http,
                origin + f"/v1/projects/{project.projectId}/conversations/"
                f"{conversation.conversationId}/drafts?limit=20",
                None,
                {"Origin": origin, "Sec-Fetch-Site": "same-origin",
                 "Cookie": f"__Host-forge_session={paired['sessionToken']}",
                 "X-Forge-Session": "1"}, "GET",
            )
            assert status == 200, draft_page
            assert len(draft_page["items"]) == 1
            assert draft_page["items"][0]["revision"] == 2
            assert draft_page["items"][0]["canRevise"] is True
            assert draft_page["items"][0]["contract"]["title"] == revised_contract["title"]
            assert "editableText" not in draft_page["items"][0]
            later = host.conversations.send(ConversationSend(
                projectId=project.projectId, conversationId=conversation.conversationId,
                idempotencyKey="remote-visible-message-02", text="x" * 4500,
                attachmentIds=[],
            ))["message"]
            assert isinstance(later, ConversationMessage)
            with host.storage.transaction() as db:
                now = timestamp()
                db.execute(
                    "INSERT INTO messages(message_id,conversation_id,sequence,role,"
                    "content_json,status,created_at,updated_at) "
                    "VALUES(?,?,3,'tool',?,'completed',?,?)",
                    (str(uuid4()), str(conversation.conversationId),
                     json.dumps({"text": "PRIVATE_TOOL_OUTPUT"}), now, now),
                )
            read_headers = {"Origin": origin, "Sec-Fetch-Site": "same-origin",
                            "Cookie": f"__Host-forge_session={paired['sessionToken']}",
                            "X-Forge-Session": "1"}
            messages_url = (origin + f"/v1/projects/{project.projectId}/conversations/"
                            f"{conversation.conversationId}/messages")
            status, newest, _ = await asyncio.to_thread(
                _http, messages_url + "?limit=1", None, read_headers, "GET",
            )
            assert status == 200, newest
            assert newest["items"] == [{
                "messageId": str(later.messageId),
                "conversationId": str(conversation.conversationId),
                "sequence": later.sequence, "role": "user", "content": "x" * 4000,
                "truncated": True, "status": "completed", "createdAt": later.createdAt,
            }]
            assert newest["page"] == {"cursor": f"m:{later.sequence}", "hasMore": True}
            status, older, _ = await asyncio.to_thread(
                _http, messages_url + f"?limit=1&cursor=m:{later.sequence}",
                None, read_headers, "GET",
            )
            assert status == 200 and older["items"][0]["content"] == source.content
            assert older["page"] == {"cursor": None, "hasMore": False}
            assert "PRIVATE_TOOL_OUTPUT" not in json.dumps(newest) + json.dumps(older)
            for url, expected in (
                (messages_url + "?cursor=m:bad", 400),
                (origin + f"/v1/projects/{project.projectId}/conversations/"
                 f"{other_conversation.conversationId}/messages", 404),
                (origin + f"/v1/projects/{other.projectId}/conversations/"
                 f"{other_conversation.conversationId}/messages", 403),
            ):
                code, _, _ = await asyncio.to_thread(_http, url, None, read_headers, "GET")
                assert code == expected
            approve_only = host.device_pairing.issue()
            approve_claim = host.device_pairing.claim_from_nonce(
                approve_only["nonce"], device_name="Approve-only fixture",
                address_summary="loopback", fingerprint_summary="fixture-approve-only",
            )
            host.device_pairing.decide(PairingDecisionInput(
                pairingId=UUID(approve_only["pairingId"]), approve=True,
                projectIds=[project.projectId], scopes=["task:approve"],
            ))
            approve_session = host.remote_sessions.pairing_status(
                approve_claim["claimSecret"]
            )
            status, _, _ = await asyncio.to_thread(
                _http, messages_url, None,
                {**read_headers,
                 "Cookie": f"__Host-forge_session={approve_session['sessionToken']}"},
                "GET",
            )
            assert status == 403
        finally:
            await asyncio.to_thread(server.shutdown)
            await asyncio.to_thread(server.server_close)
            await asyncio.to_thread(thread.join, 2)
        assert receipt["result"] == {"draftId": task_id, "status": "proposed",
                                      "revision": 1}
        assert revised_receipt["result"] == {"draftId": task_id, "status": "proposed",
                                              "revision": 2}
        draft = host.drafts.get(str(project.projectId), task_id)
        assert draft is not None and draft.sourceMessageId == source.messageId
        assert draft.conversationId == conversation.conversationId
        assert draft.contract is not None and draft.contract.goal == "Reject invalid input"
        assert draft.contract.title == "Validate add with boundaries"
        history = host.drafts.history(str(project.projectId), task_id)
        assert [item.revision for item in history] == [2, 1]
        assert history[0].decisionId == UUID(revision_id)
        assert history[0].decisionSummary == "Clarify expected boundaries"
        assert history[1].decisionId == UUID(command_id)
        assert await host.dispatch_remote("command", request) == receipt
        assert await host.dispatch_remote("command", revision_request) == revised_receipt
        with pytest.raises(RemoteCommandError, match="REMOTE_PROJECT_FORBIDDEN"):
            await host.dispatch_remote("query", {
                "sessionToken": paired["sessionToken"], "method": "draft.page",
                "payload": {"projectId": str(other.projectId),
                            "conversationId": str(other_conversation.conversationId),
                            "limit": 20, "cursor": None},
            })
        with pytest.raises(RemoteCommandError, match="REMOTE_INVALID_REQUEST"):
            await host.dispatch_remote("query", {
                "sessionToken": paired["sessionToken"], "method": "draft.page",
                "payload": {"projectId": str(project.projectId),
                            "conversationId": str(conversation.conversationId),
                            "limit": 20, "cursor": "d:bad"},
            })
        with pytest.raises(RemoteCommandError, match="DRAFT_INVALID_REVISION"):
            stale_id = str(uuid4())
            await host.dispatch_remote("command", {**revision_request, "request": {
                **revision_command, "commandId": stale_id,
                "idempotencyKey": str(uuid4()), "payload": {
                    "contract": {**revised_contract,
                                 "sourceRefs": [*revised_contract["sourceRefs"],
                                                f"decision:{stale_id}"]},
                    "reason": "Stale change"},
            }})
        scope_id = str(uuid4())
        with pytest.raises(RemoteCommandError, match="REMOTE_REVISION_CONFIRMATION_REQUIRED"):
            await host.dispatch_remote("command", {**revision_request, "request": {
                **revision_command, "commandId": scope_id,
                "expectedRevision": 2, "idempotencyKey": str(uuid4()),
                "payload": {"contract": {**revised_contract, "revision": 3,
                    "scope": ["new scope"],
                    "sourceRefs": [*revised_contract["sourceRefs"],
                                   f"decision:{scope_id}"]},
                    "reason": "Scope change"},
            }})
        removed_id = str(uuid4())
        with pytest.raises(RemoteCommandError, match="REMOTE_INVALID_REQUEST"):
            await host.dispatch_remote("command", {**revision_request, "request": {
                **revision_command, "commandId": removed_id,
                "expectedRevision": 2, "idempotencyKey": str(uuid4()),
                "payload": {"contract": {**revised_contract, "revision": 3,
                    "acceptance": [],
                    "sourceRefs": [*revised_contract["sourceRefs"],
                                   f"decision:{removed_id}"]},
                    "reason": "Remove criterion"},
            }})
        with pytest.raises(RemoteCommandError, match="REMOTE_INVALID_REQUEST"):
            await host.dispatch_remote("command", {**revision_request, "request": {
                **revision_command, "commandId": str(uuid4()),
                "idempotencyKey": str(uuid4()),
                "payload": {"contract": revised_contract, "reason": ""},
            }})
        with pytest.raises(RemoteCommandError, match="REMOTE_IDEMPOTENCY_CONFLICT"):
            await host.dispatch_remote("command", {**request, "request": {
                **command, "payload": {"contract": {**contract, "goal": "Changed"}},
            }})
        duplicate_id = str(uuid4())
        duplicate_ref = f"decision:{duplicate_id}"
        with pytest.raises(RemoteCommandError, match="DRAFT_ALREADY_EXISTS"):
            await host.dispatch_remote("command", {**request, "request": {
                **command, "commandId": duplicate_id, "idempotencyKey": str(uuid4()),
                "payload": {"contract": {**contract,
                    "sourceRefs": [source_ref, duplicate_ref],
                    "acceptance": [{**contract["acceptance"][0],
                                    "sourceRefs": [source_ref, duplicate_ref]}]}},
            }})
        assert len(host.drafts.list_drafts(str(project.projectId),
                                           str(conversation.conversationId))) == 1
        # T093: two public HTTP writes race on the same real Draft revision.
        # The Host event loop owns the SQLite writer; the second request must
        # observe the committed revision and must not leave a receipt or row.
        web = tmp_path / "race-web"
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
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            headers = {"Origin": origin, "Sec-Fetch-Site": "same-origin",
                       "Cookie": f"__Host-forge_session={paired['sessionToken']}",
                       "X-CSRF-Token": paired["csrfToken"],
                       "X-Forge-Session": "1"}
            competing = []
            for title in ("First concurrent title", "Second concurrent title"):
                decision_id = str(uuid4())
                candidate = {**revised_contract, "revision": 3, "title": title,
                             "sourceRefs": [*revised_contract["sourceRefs"],
                                            f"decision:{decision_id}"]}
                competing.append({**revision_command, "commandId": decision_id,
                                  "expectedRevision": 2, "idempotencyKey": str(uuid4()),
                                  "payload": {"contract": candidate,
                                              "reason": "Concurrent owner revision"}})
            responses = await asyncio.gather(*(asyncio.to_thread(
                _http, origin + "/v1/commands", candidate, headers, "POST",
            ) for candidate in competing))
            assert sorted(response[0] for response in responses) == [200, 409]
            winner = next(candidate for candidate, response in zip(
                competing, responses, strict=True)
                          if response[0] == 200)
            loser = next(candidate for candidate, response in zip(
                competing, responses, strict=True)
                         if response[0] == 409)
            assert next(response[1] for response in responses if response[0] == 409)[
                "code"] == "DRAFT_INVALID_REVISION"
            assert host.drafts.get(str(project.projectId), task_id).contract.title == (
                winner["payload"]["contract"]["title"])
            assert [item.revision for item in host.drafts.history(
                str(project.projectId), task_id)] == [3, 2, 1]
            assert host.storage.session().execute(
                "SELECT COUNT(*) AS count FROM remote_command_receipts "
                "WHERE command_id IN (?,?)",
                (winner["commandId"], loser["commandId"]),
            ).fetchone()["count"] == 1
        finally:
            await asyncio.to_thread(server.shutdown)
            await asyncio.to_thread(server.server_close)
            await asyncio.to_thread(thread.join, 2)
    finally:
        await host.shutdown()
    reopened = HostRuntime()
    try:
        assert reopened.storage_health()["status"] == "ready"
        assert await reopened.dispatch_remote("command", request) == receipt
        assert await reopened.dispatch_remote("command", revision_request) == revised_receipt
        assert reopened.drafts.get(str(project.projectId), task_id) is not None
    finally:
        await reopened.shutdown()


@pytest.mark.asyncio
async def test_remote_conversation_cursor_is_bounded_and_rejects_stale_or_foreign_project(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    repo = tmp_path / "project"
    repo.mkdir()
    host = HostRuntime()
    try:
        assert host.storage_health()["status"] == "ready"
        project = host.projects.create(
            str(repo), host.projects.probe(str(repo)).fingerprint, TRUST_VERSION, True, 0,
        )
        first = host.conversations.create(str(project.projectId), "First", 0)
        host.conversations.create(str(project.projectId), "Second", 0)
        issued = host.device_pairing.issue()
        claim = host.device_pairing.claim_from_nonce(
            issued["nonce"], device_name="Read only phone", address_summary="loopback",
            fingerprint_summary="fixture-device",
        )
        host.device_pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True,
            projectIds=[project.projectId], scopes=[],
        ))
        session = host.remote_sessions.pairing_status(claim["claimSecret"])

        async def page(project_id: str, cursor: str | None = None) -> dict[str, Any]:
            return await host.dispatch_remote("query", {
                "sessionToken": session["sessionToken"],
                "method": "conversation.page",
                "payload": {"projectId": project_id, "limit": 1, "cursor": cursor},
            })

        one = await page(str(project.projectId))
        assert len(one["items"]) == 1 and one["page"]["hasMore"]
        with pytest.raises(RemoteCommandError, match="REMOTE_OPERATION_FORBIDDEN"):
            await host.dispatch_remote("query", {
                "sessionToken": session["sessionToken"], "method": "draft.page",
                "payload": {"projectId": str(project.projectId),
                            "conversationId": str(first.conversationId),
                            "limit": 20, "cursor": None},
            })
        two = await page(str(project.projectId), one["page"]["cursor"])
        assert [item["conversationId"] for item in one["items"] + two["items"]] == [
            str(item.conversationId) for item in host.conversations.list_conversations(
                str(project.projectId)
            )
        ]
        with pytest.raises(RemoteCommandError, match="REMOTE_PROJECT_FORBIDDEN"):
            await page(str(uuid4()))
        with pytest.raises(RemoteCommandError, match="REMOTE_INVALID_REQUEST"):
            await page(str(project.projectId), "../../private")
        host.conversations.create(str(project.projectId), "Third", 0)
        with pytest.raises(RemoteCommandError, match="REMOTE_CURSOR_STALE"):
            await page(str(project.projectId), one["page"]["cursor"])
        assert host.conversations.get(str(project.projectId), str(first.conversationId))
    finally:
        await host.shutdown()


@pytest.mark.asyncio
async def test_remote_receipt_and_message_survive_host_restart_but_not_scope_revocation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    repo = tmp_path / "fixture repo"
    repo.mkdir()
    host = HostRuntime()
    assert host.storage_health()["status"] == "ready"
    project = host.projects.create(
        str(repo), host.projects.probe(str(repo)).fingerprint, TRUST_VERSION, True, 0,
    )
    conversation = host.conversations.create(str(project.projectId), "Remote", 0)
    issued = host.device_pairing.issue()
    claim = host.device_pairing.claim_from_nonce(
        issued["nonce"], device_name="Fixture phone", address_summary="loopback",
        fingerprint_summary="fixture-phone",
    )
    host.device_pairing.decide(PairingDecisionInput(
        pairingId=UUID(issued["pairingId"]), approve=True,
        projectIds=[project.projectId], scopes=["task:draft"],
    ))
    delivered = host.remote_sessions.pairing_status(claim["claimSecret"])
    envelope = {
        "schemaVersion": "1.0", "commandId": str(uuid4()),
        "method": "conversations.send", "projectId": str(project.projectId),
        "resourceId": str(conversation.conversationId), "expectedRevision": 1,
        "idempotencyKey": str(uuid4()),
        "payload": {"conversationId": str(conversation.conversationId),
                    "text": "Durable remote message", "attachmentIds": []},
    }
    request = {"sessionToken": delivered["sessionToken"],
               "csrfToken": delivered["csrfToken"], "request": envelope}
    receipt = await host.dispatch_remote("command", request)
    assert receipt["resourceRevision"] == 2
    await host.shutdown()

    reopened = HostRuntime()
    try:
        assert reopened.storage_health()["status"] == "ready"
        assert reopened.storage.schema_version() == LATEST_SCHEMA
        assert await reopened.dispatch_remote("command", request) == receipt
        assert await reopened.dispatch_remote("receipt", {
            "sessionToken": delivered["sessionToken"],
            "commandId": envelope["commandId"],
        }) == receipt
        messages = reopened.conversations.messages(
            str(project.projectId), str(conversation.conversationId),
        )
        assert len(messages) == 1 and messages[0].content == "Durable remote message"
        reopened.remote_policy.narrow(DevicePolicyNarrow(
            deviceId=UUID(delivered["deviceId"]), expectedRevision=1,
            projectIds=[project.projectId], scopes=[],
        ))
        with pytest.raises(RemoteCommandError, match="REMOTE_OPERATION_FORBIDDEN"):
            await reopened.dispatch_remote("command", request)
        with pytest.raises(RemoteCommandError, match="REMOTE_OPERATION_FORBIDDEN"):
            await reopened.dispatch_remote("receipt", {
                "sessionToken": delivered["sessionToken"],
                "commandId": envelope["commandId"],
            })
        assert len(reopened.conversations.messages(
            str(project.projectId), str(conversation.conversationId),
        )) == 1
    finally:
        await reopened.shutdown()


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
            projectIds=[selected.projectId], scopes=["task:approve"],
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
        pending_approvals = await call("/v1/approvals?limit=1", None, read_headers, "GET")
        assert pending_approvals[0] == 200
        assert pending_approvals[1]["items"] == [{
            "approvalId": approval["request"]["approvalId"],
            "projectId": project_id, "taskId": draft["draftId"],
            "expectedRevision": 2, "scopeHash": approval["request"]["scopeHash"],
            "expiresAt": approval["request"]["expiresAt"],
            "summary": approval["request"]["summary"],
            "risk": "medium", "requiredScope": "task:create:todo",
        }]
        assert pending_approvals[1]["page"] == {"cursor": None, "hasMore": False}
        approval_detail = await call(
            f"/v1/approvals/{approval['request']['approvalId']}",
            None, read_headers, "GET",
        )
        assert approval_detail[0] == 200, approval_detail
        assert approval_detail[1]["approvalId"] == approval["request"]["approvalId"]
        assert approval_detail[1]["projectId"] == project_id
        assert approval_detail[1]["taskId"] == draft["draftId"]
        assert approval_detail[1]["expectedRevision"] == 2
        assert approval_detail[1]["scopeHash"] == approval["request"]["scopeHash"]
        assert approval_detail[1]["actionDigest"] == approval["request"]["actionDigest"]
        assert approval_detail[1]["snapshotId"] is None
        assert approval_detail[1]["deviceOperationScope"] == "task:approve"
        assert approval_detail[1]["requiredScope"] == "task:create:todo"
        assert approval_detail[1]["contract"] == contract
        assert str(selected_root) not in json.dumps(approval_detail[1])
        assert str(other_root) not in json.dumps(approval_detail[1])
        assert (await call("/v1/approvals/not-a-uuid", None,
                           read_headers, "GET"))[0] == 400
        assert (await call(f"/v1/approvals/{uuid4()}", None,
                           read_headers, "GET"))[0] == 404
        assert (await call(f"/v1/approvals/{approval['request']['approvalId']}?unsafe=1",
                           None, read_headers, "GET"))[0] == 404
        approval_command = command("tasks.approve", {
            "approvalId": approval["request"]["approvalId"],
            "scopeHash": approval["request"]["scopeHash"],
        })
        approval_command["resourceId"] = approval["request"]["approvalId"]
        approval_command["expectedRevision"] = 2
        approved_remote = await call("/v1/commands", approval_command, trusted)
        assert approved_remote[0] == 200 and approved_remote[1]["status"] == "completed"
        assert approved_remote[1]["result"]["state"] == "todo"
        assert approved_remote[1]["result"]["taskId"] == draft["draftId"]
        assert (await call("/v1/approvals?limit=1", None, read_headers,
                           "GET"))[1]["items"] == []
        assert (await call(f"/v1/approvals/{approval['request']['approvalId']}",
                           None, read_headers, "GET"))[0] == 409
        assert (await call("/v1/commands", approval_command, trusted))[1] == approved_remote[1]
        receipt_read = await call(
            f"/v1/commands/{approval_command['commandId']}", None,
            read_headers, "GET",
        )
        assert receipt_read[0] == 200 and receipt_read[1] == approved_remote[1]
        competing = {**approval_command, "commandId": str(uuid4()),
                     "idempotencyKey": str(uuid4())}
        assert (await call("/v1/commands", competing, trusted))[0] == 409
        task_id = draft["draftId"]
        board_event = host.storage.session().execute(
            "SELECT seq FROM remote_event_log WHERE project_id=? "
            "AND kind='board.changed' ORDER BY seq DESC LIMIT 1",
            (project_id,),
        ).fetchone()
        assert board_event is not None
        before_board = f"p:{board_event['seq'] - 1}"
        detail = await call(f"/v1/tasks/{task_id}", None, read_headers, "GET")
        assert detail[0] == 200, detail
        assert detail[1]["task"]["id"] == task_id
        assert detail[1]["task"]["allowedCommands"] == []
        assert detail[1]["contract"]["title"] == "Read actual task"
        assert detail[1]["evidence"] == []
        assert "sources" not in detail[1]
        assert str(selected_root) not in json.dumps(detail[1])
        assert str(other_root) not in json.dumps(detail[1])
        page = await call(f"/v1/projects/{project_id}/tasks?limit=1", None,
                          read_headers, "GET")
        assert page[0] == 200 and [item["id"] for item in page[1]["tasks"]] == [task_id]
        assert page[1]["page"] == {"cursor": None, "hasMore": False}
        assert page[1]["tasks"][0]["allowedCommands"] == []
        notices = await call(f"/v1/projects/{project_id}/notifications?limit=20",
                             None, read_headers, "GET")
        assert notices[0] == 200 and notices[1]["projectId"] == project_id
        assert notices[1]["items"] and len(notices[1]["items"]) <= 20
        assert notices[1]["items"][0]["id"] == notices[1]["lastEventCursor"]
        assert all(item["projectId"] == project_id for item in notices[1]["items"])
        assert str(selected_root) not in json.dumps(notices[1])
        assert (await call(f"/v1/projects/{other.projectId}/notifications",
                           None, read_headers, "GET"))[0] == 403
        assert (await call(f"/v1/projects/{project_id}/notifications?limit=21",
                           None, read_headers, "GET"))[0] == 400
        assert (await call(f"/v1/projects/{project_id}/notifications",
                           None, {"Cookie": read_headers["Cookie"]}, "GET"))[0] == 403
        assert (await call(f"/v1/projects/{project_id}/tasks?limit=1&cursor=b:999:1",
                           None, read_headers, "GET"))[0] == 409
        assert (await call(f"/v1/projects/{project_id}/tasks?cursor=../private",
                           None, read_headers, "GET"))[0] == 400
        activity = await call(f"/v1/tasks/{task_id}/activity?limit=20", None,
                              read_headers, "GET")
        assert activity[0] == 200 and activity[1] == {
            "taskId": task_id, "items": [],
            "page": {"cursor": None, "hasMore": False},
        }
        no_diff = await call(f"/v1/tasks/{task_id}/diff?limit=4096", None,
                             read_headers, "GET")
        assert no_diff[0] == 200 and no_diff[1]["available"] is False
        assert no_diff[1]["textChunk"] == ""
        assert (await call(f"/v1/tasks/{task_id}/diff?limit=8193", None,
                           read_headers, "GET"))[0] == 400
        assert (await call(f"/v1/tasks/{task_id}/activity?cursor=o:../private", None,
                           read_headers, "GET"))[0] == 400
        assert (await call(f"/v1/tasks/{uuid4()}/diff", None,
                           read_headers, "GET"))[0] == 404
        event_url = origin + f"/v1/events?projectId={project_id}"
        sse_status, initial = await asyncio.to_thread(_first_sse, event_url, read_headers)
        assert sse_status == 200 and "event: resync_required" in initial
        assert not any(line.startswith("id:") for line in initial)
        sse_status, changes = await asyncio.to_thread(_first_sse, event_url, {
            **read_headers, "Last-Event-ID": before_board,
        })
        assert sse_status == 200 and "event: board.changed" in changes
        first_id = next(line[4:] for line in changes if line.startswith("id: "))
        event_data = json.loads(next(line[6:] for line in changes
                                     if line.startswith("data: ")))
        assert event_data["projectId"] == project_id
        assert event_data["taskId"] == task_id
        assert event_data["type"] == "board.changed"
        assert first_id == event_data["id"]
        _, duplicate = await asyncio.to_thread(_first_sse, event_url, {
            **read_headers, "Last-Event-ID": first_id,
        })
        assert not any(line.startswith("event: board.changed") for line in duplicate)
        assert (await call(f"/v1/events?projectId={other.projectId}", None,
                           read_headers, "GET"))[0] == 403
        with host.storage.transaction() as session:
            for _ in range(257):
                session.execute(
                    "INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,"
                    "created_at) VALUES(?,?,?,'tasks.reordered','{}',?)",
                    (str(uuid4()), project_id, task_id, "2026-09-25T00:00:00Z"),
                )
        _, expired = await asyncio.to_thread(_first_sse, event_url, {
            **read_headers, "Last-Event-ID": first_id,
        })
        assert "event: resync_required" in expired
        assert not any(line.startswith("id:") for line in expired)
        refreshed = await call(f"/v1/projects/{project_id}/board", None,
                               read_headers, "GET")
        assert refreshed[0] == 200
        resync_cursor = refreshed[1]["eventCursor"]
        _, recovered = await asyncio.to_thread(_first_sse, event_url, {
            **read_headers, "Last-Event-ID": resync_cursor,
        })
        assert not any(line.startswith("event: board.changed") for line in recovered)
        with host.storage.transaction() as session:
            session.execute(
                "INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,"
                "created_at) VALUES(?,?,?,'tasks.reordered','{}',?)",
                (str(uuid4()), project_id, task_id, "2026-09-25T00:00:01Z"),
            )
        _, subsequent = await asyncio.to_thread(_first_sse, event_url, {
            **read_headers, "Last-Event-ID": resync_cursor,
        })
        assert sum(line == "event: board.changed" for line in subsequent) == 1
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
        send_body = {"conversationId": conversation["conversationId"],
                     "text": "Remote adapter preflight", "attachmentIds": []}
        pending_scope = await call("/v1/commands", command("conversations.send", send_body),
                                   trusted)
        assert pending_scope[0] == 403
        assert pending_scope[1]["code"] == "REMOTE_OPERATION_FORBIDDEN"
        malformed = await call("/v1/commands", command("conversations.send", {}), trusted)
        assert malformed[0] == 400 and malformed[1]["code"] == "REMOTE_INVALID_REQUEST"
        unknown_command = command("tasks.approve", {
            "approvalId": str(uuid4()), "scopeHash": "0" * 64,
        })
        unknown_command["expectedRevision"] = 2
        unknown_approval = await call("/v1/commands", unknown_command, trusted)
        assert unknown_approval[0] == 404
        assert unknown_approval[1]["code"] == "REMOTE_APPROVAL_NOT_FOUND"
        assert len(host.conversations.messages(project_id, conversation["conversationId"])) == 1
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
        latest_cursor = host.remote_events.read_page({
            "sessionToken": cookie.split("=", 1)[1],
            "projectId": project_id, "cursor": None,
        })["cursor"]
        # Earlier short-lived clients closed their sockets; the live gateway
        # must release those worker slots promptly before a new subscription.
        released = False
        for _ in range(60):
            permits = 0
            while server.auth_stream_slots.acquire(blocking=False):
                permits += 1
            for _ in range(permits):
                server.auth_stream_slots.release()
            if permits == 8:
                released = True
                break
            await asyncio.sleep(0.05)
        assert released
        stream = await asyncio.to_thread(urlopen, Request(event_url, headers={
            **read_headers, "Last-Event-ID": latest_cursor,
        }), None, 5)
        assert await asyncio.to_thread(stream.readline) == b": heartbeat\n"
        assert await asyncio.to_thread(stream.readline) == b"\n"
        peers = []
        try:
            for _ in range(7):
                peers.append(await asyncio.to_thread(urlopen, Request(
                    event_url, headers={**read_headers, "Last-Event-ID": latest_cursor,
                }), None, 5))
            limited = await call(f"/v1/events?projectId={project_id}", None, {
                **read_headers, "Last-Event-ID": latest_cursor,
            }, "GET")
            assert limited[0] == 429 and limited[1]["code"] == "REMOTE_STREAM_LIMITED"
        finally:
            for peer in peers:
                peer.close()
        narrowed_policy = host.dispatch(RpcRequest(
            jsonrpc="2.0", id=str(uuid4()), method="devices.pair.narrow",
            params={"deviceId": approved["deviceId"], "expectedRevision": 1,
                    "projectIds": [], "scopes": []},
            transportVersion="forge-local-jsonrpc/v1",
        ))
        assert narrowed_policy["data"]["revision"] == 2
        assert await asyncio.to_thread(stream.readline) == b""
        narrowed = await call("/v1/projects", None, read_headers, "GET")
        assert narrowed[0] == 200 and narrowed[1]["items"] == []
        assert (await call(f"/v1/approvals/{approval['request']['approvalId']}",
                           None, read_headers, "GET"))[0] == 404
        assert (await call(f"/v1/projects/{project_id}/board", None,
                           read_headers, "GET"))[0] == 403
        old_project_write = await call("/v1/commands", command(
            "conversations.send", send_body), trusted)
        assert old_project_write[0] == 403
        assert old_project_write[1]["code"] == "REMOTE_PROJECT_FORBIDDEN"
        host.remote_sessions.revoke(cookie.split("=", 1)[1], approved["csrfToken"])
        stream.close()
        assert (await call("/v1/projects", None, read_headers, "GET"))[0] == 403
        assert (await call(f"/v1/tasks/{task_id}", None, read_headers, "GET"))[0] == 403
        assert (await call("/v1/commands", command("conversations.send", {}),
                           trusted))[0] == 403
        # A separate approved device is revoked through the local-only Host
        # command. Its live SSE closes and its old cookie cannot write.
        second_pairing = host.device_pairing.issue()
        second_claim = await call("/v1/pair/claim", {
            "nonce": second_pairing["nonce"], "deviceLabel": "Second phone",
        }, headers)
        assert second_claim[0] == 202
        host.device_pairing.decide(PairingDecisionInput(
            pairingId=UUID(second_pairing["pairingId"]), approve=True,
            projectIds=[selected.projectId], scopes=["task:draft"],
        ))
        second_session = await call("/v1/pair/status", {
            "claimSecret": second_claim[1]["claimSecret"],
        }, headers)
        assert second_session[0] == 200
        second_cookie = second_session[2]["Set-Cookie"].split(";", 1)[0]
        second_read = {**headers, "Cookie": second_cookie, "X-Forge-Session": "1"}
        second_write = {**headers, "Cookie": second_cookie,
                        "X-CSRF-Token": second_session[1]["csrfToken"]}
        conversations_page = await call(
            f"/v1/projects/{project_id}/conversations?limit=1", None,
            second_read, "GET",
        )
        assert conversations_page[0] == 200
        assert conversations_page[1]["projectId"] == project_id
        assert conversations_page[1]["items"][0]["conversationId"] == conversation[
            "conversationId"
        ]
        assert conversations_page[1]["items"][0]["revision"] == 2
        assert "rootPath" not in conversations_page[1]["items"][0]
        assert (await call(
            f"/v1/projects/{other.projectId}/conversations", None,
            second_read, "GET",
        ))[0] == 403
        assert (await call(
            f"/v1/projects/{project_id}/conversations?limit=101", None,
            second_read, "GET",
        ))[0] == 400
        remote_send = command("conversations.send", {
            "conversationId": conversation["conversationId"],
            "text": "Actual scoped remote message", "attachmentIds": [],
        })
        remote_send["resourceId"] = conversation["conversationId"]
        remote_send["expectedRevision"] = 2
        written = await call("/v1/commands", remote_send, second_write)
        assert written[0] == 200, written
        receipt = written[1]
        assert receipt["commandId"] == remote_send["commandId"]
        assert receipt["status"] == "completed"
        assert receipt["resourceRevision"] == 3
        assert receipt["result"]["message"]["content"] == "Actual scoped remote message"
        assert receipt["result"]["replyStatus"] == "unavailable"
        refreshed_conversations = await call(
            f"/v1/projects/{project_id}/conversations", None,
            second_read, "GET",
        )
        assert refreshed_conversations[0] == 200
        assert refreshed_conversations[1]["items"][0]["revision"] == 3
        fetched_receipt = await call(
            f"/v1/commands/{remote_send['commandId']}", None, second_read, "GET",
        )
        assert fetched_receipt[0] == 200 and fetched_receipt[1] == receipt
        assert len(host.conversations.messages(project_id, conversation["conversationId"])) == 2
        assert (await call("/v1/commands", remote_send, second_write))[1] == receipt
        same_key_new_id = {**remote_send, "commandId": str(uuid4())}
        assert (await call("/v1/commands", same_key_new_id, second_write))[1] == receipt
        conflicting = {**remote_send, "commandId": str(uuid4()),
                       "payload": {**remote_send["payload"], "text": "Changed"}}
        conflict = await call("/v1/commands", conflicting, second_write)
        assert conflict[0] == 409 and conflict[1]["code"] == "REMOTE_IDEMPOTENCY_CONFLICT"
        duplicate_id_new_key = {**remote_send, "idempotencyKey": str(uuid4())}
        assert (await call("/v1/commands", duplicate_id_new_key, second_write))[0] == 409
        stale = {**remote_send, "commandId": str(uuid4()),
                 "idempotencyKey": str(uuid4())}
        rejected_stale = await call("/v1/commands", stale, second_write)
        assert rejected_stale[0] == 409 and rejected_stale[1]["code"] == "REVISION_CONFLICT"
        attachment = {**remote_send, "commandId": str(uuid4()),
                      "idempotencyKey": str(uuid4()),
                      "expectedRevision": 3,
                      "payload": {**remote_send["payload"],
                                  "attachmentIds": [str(uuid4())]}}
        rejected_attachment = await call("/v1/commands", attachment, second_write)
        assert rejected_attachment[0] == 422
        assert rejected_attachment[1]["code"] == "REMOTE_ATTACHMENT_UNAVAILABLE"
        assert len(host.conversations.messages(project_id, conversation["conversationId"])) == 2
        stored_receipt = host.storage.session().execute(
            "SELECT receipt_json FROM remote_command_receipts WHERE command_id=?",
            (remote_send["commandId"],),
        ).fetchone()
        assert stored_receipt is not None and json.loads(stored_receipt["receipt_json"]) == receipt
        third_pairing = host.device_pairing.issue()
        third_claim = await call("/v1/pair/claim", {
            "nonce": third_pairing["nonce"], "deviceLabel": "Independent device",
        }, headers)
        assert third_claim[0] == 202
        host.device_pairing.decide(PairingDecisionInput(
            pairingId=UUID(third_pairing["pairingId"]), approve=True,
            projectIds=[selected.projectId], scopes=["task:draft"],
        ))
        third_session = await call("/v1/pair/status", {
            "claimSecret": third_claim[1]["claimSecret"],
        }, headers)
        assert third_session[0] == 200
        third_read = {**headers,
                      "Cookie": third_session[2]["Set-Cookie"].split(";", 1)[0],
                      "X-Forge-Session": "1"}
        assert (await call(f"/v1/commands/{remote_send['commandId']}", None,
                           third_read, "GET"))[0] == 404
        third_command = {**remote_send, "commandId": str(uuid4()),
                         "expectedRevision": 3}
        third_write = await call("/v1/commands", third_command, {
            **headers, "Cookie": third_session[2]["Set-Cookie"].split(";", 1)[0],
            "X-CSRF-Token": third_session[1]["csrfToken"],
        })
        assert third_write[0] == 200 and third_write[1]["resourceRevision"] == 4
        assert len(host.conversations.messages(project_id, conversation["conversationId"])) == 3
        latest_cursor = host.remote_events.snapshot_cursor(project_id)
        second_stream = await asyncio.to_thread(urlopen, Request(event_url, headers={
            **second_read, "Last-Event-ID": latest_cursor,
        }), None, 5)
        assert await asyncio.to_thread(second_stream.readline) == b": heartbeat\n"
        assert await asyncio.to_thread(second_stream.readline) == b"\n"
        narrowed_operation = host.dispatch(RpcRequest(
            jsonrpc="2.0", id=str(uuid4()), method="devices.pair.narrow",
            params={"deviceId": second_session[1]["deviceId"],
                    "expectedRevision": 1, "projectIds": [project_id], "scopes": []},
            transportVersion="forge-local-jsonrpc/v1",
        ))
        assert narrowed_operation["data"]["revision"] == 2
        denied_receipt = await call(
            f"/v1/commands/{remote_send['commandId']}", None, second_read, "GET",
        )
        assert denied_receipt[0] == 403
        assert denied_receipt[1]["code"] == "REMOTE_OPERATION_FORBIDDEN"
        revoked_device = host.dispatch(RpcRequest(
            jsonrpc="2.0", id=str(uuid4()), method="devices.pair.revoke",
            params={"deviceId": second_session[1]["deviceId"],
                    "expectedRevision": 2},
            transportVersion="forge-local-jsonrpc/v1",
        ))
        assert revoked_device["data"]["status"] == "revoked"
        assert await asyncio.to_thread(second_stream.readline) == b""
        second_stream.close()
        assert (await call(f"/v1/commands/{remote_send['commandId']}", None,
                           second_read, "GET"))[0] == 403
        assert (await call("/v1/commands", command("conversations.send", send_body), {
            **headers, "Cookie": second_cookie,
            "X-CSRF-Token": second_session[1]["csrfToken"],
        }))[0] == 403
        # A second real approved Task proves cursor pagination against the
        # Host board rather than a fixture response or an in-memory UI list.
        second_message = await local("conversation.send", {
            "projectId": project_id, "conversationId": conversation["conversationId"],
            "idempotencyKey": "remote-read-second-message-01",
            "text": "Second actual task", "attachmentIds": [],
        })
        second_draft = await local("draft.manual", {
            "projectId": project_id, "conversationId": conversation["conversationId"],
            "sourceMessageId": second_message["message"]["messageId"],
            "idempotencyKey": "remote-read-second-draft-01",
        })
        second_decision = str(uuid4())
        second_contract = {
            **contract, "taskId": second_draft["draftId"],
            "title": "Second real task", "revision": 2,
            "sourceRefs": [f"message:{second_message['message']['messageId']}",
                           f"decision:{second_decision}"],
            "acceptance": [{"id": "AC-01", "statement": "Second task is visible",
                            "method": "inspection", "required": True,
                            "sourceRefs": [f"decision:{second_decision}"]}],
        }
        await local("draft.revise", {
            "projectId": project_id, "draftId": second_draft["draftId"],
            "expectedRevision": 1, "contract": second_contract,
            "decisionId": second_decision, "decisionSummary": "Reviewed second scope",
            "resolvedQuestions": [], "removedAcceptanceIds": [],
            "confirmScopeChange": True,
        })
        second_approval = await local("approval.request", {
            "projectId": project_id, "draftId": second_draft["draftId"],
            "expectedRevision": 2,
        })
        await local("approval.decide", {"projectId": project_id, "decision": {
            "schemaVersion": "1.0", "approvalId": second_approval["request"]["approvalId"],
            "decision": "approve", "expectedRevision": 2,
            "scopeHash": second_approval["request"]["scopeHash"],
            "reason": "Reviewed second scope",
        }})
        first_page = await call(f"/v1/projects/{project_id}/tasks?limit=1", None,
                                third_read, "GET")
        assert first_page[0] == 200 and first_page[1]["page"]["hasMore"] is True
        cursor = first_page[1]["page"]["cursor"]
        assert cursor == f"b:{first_page[1]['boardRevision']}:1"
        next_page = await call(
            f"/v1/projects/{project_id}/tasks?limit=1&cursor={cursor}", None,
            third_read, "GET",
        )
        assert next_page[0] == 200 and next_page[1]["page"]["hasMore"] is False
        assert {first_page[1]["tasks"][0]["id"], next_page[1]["tasks"][0]["id"]} == {
            task_id, second_draft["draftId"],
        }
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
        await host.shutdown()


@pytest.mark.asyncio
async def test_two_paired_devices_race_one_real_approval_without_duplicate_todo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """P7-09 local HTTP contention evidence; no remote reject or phone claim."""
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    repo = tmp_path / "independent project"
    repo.mkdir()
    host = HostRuntime()
    try:
        assert host.storage_health()["status"] == "ready"
        project = host.projects.create(
            str(repo), host.projects.probe(str(repo)).fingerprint, TRUST_VERSION, True, 0,
        )
        project_id = str(project.projectId)

        async def local(method: str, params: dict[str, Any]) -> dict[str, Any]:
            response = await host.dispatch_async(RpcRequest(
                jsonrpc="2.0", id=str(uuid4()), method=method, params=params,
                transportVersion="forge-local-jsonrpc/v1",
            ))
            assert "data" in response, response
            return response["data"]

        conversation = await local("conversation.create", {
            "projectId": project_id, "title": "Two-device approval", "expectedRevision": 0,
        })
        sent = await local("conversation.send", {
            "projectId": project_id, "conversationId": conversation["conversationId"],
            "idempotencyKey": "two-device-approval-message", "text": "Add validated input",
            "attachmentIds": [],
        })
        draft = await local("draft.manual", {
            "projectId": project_id, "conversationId": conversation["conversationId"],
            "sourceMessageId": sent["message"]["messageId"],
            "idempotencyKey": "two-device-approval-draft",
        })
        decision_id = str(uuid4())
        decision_ref = f"decision:{decision_id}"
        contract = {
            "schemaVersion": "1.0", "taskId": draft["draftId"],
            "projectId": project_id, "revision": 2,
            "title": "Validate input", "type": "feature",
            "goal": "Reject invalid input before adding",
            "acceptance": [{"id": "AC-01", "statement": "Invalid input is rejected",
                            "method": "inspection", "required": True,
                            "sourceRefs": [decision_ref]}],
            "constraints": [], "scope": [], "outOfScope": [],
            "dependencies": [], "openQuestions": [], "assumptions": [],
            "sourceRefs": [f"message:{sent['message']['messageId']}", decision_ref],
            "workflowRef": "standard@1", "priority": "normal",
        }
        await local("draft.revise", {
            "projectId": project_id, "draftId": draft["draftId"],
            "expectedRevision": 1, "contract": contract,
            "decisionId": decision_id, "decisionSummary": "Reviewed scope",
            "resolvedQuestions": [], "removedAcceptanceIds": [],
            "confirmScopeChange": True,
        })
        approval = await local("approval.request", {
            "projectId": project_id, "draftId": draft["draftId"],
            "expectedRevision": 2,
        })
        sessions = []
        for label in ("Device A", "Device B"):
            issued = host.device_pairing.issue()
            claim = host.device_pairing.claim_from_nonce(
                issued["nonce"], device_name=label, address_summary="loopback",
                fingerprint_summary=f"fixture-{label}",
            )
            host.device_pairing.decide(PairingDecisionInput(
                pairingId=UUID(issued["pairingId"]), approve=True,
                projectIds=[project.projectId], scopes=["task:approve"],
            ))
            sessions.append(host.remote_sessions.pairing_status(claim["claimSecret"]))

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
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            commands = [{
                "schemaVersion": "1.0", "commandId": str(uuid4()),
                "method": "tasks.approve", "projectId": project_id,
                "resourceId": approval["request"]["approvalId"],
                "expectedRevision": 2, "idempotencyKey": str(uuid4()),
                "payload": {"approvalId": approval["request"]["approvalId"],
                            "scopeHash": approval["request"]["scopeHash"]},
            } for _ in sessions]
            headers = [{
                "Origin": origin, "Sec-Fetch-Site": "same-origin",
                "Cookie": f"__Host-forge_session={item['sessionToken']}",
                "X-CSRF-Token": item["csrfToken"],
            } for item in sessions]
            results = await asyncio.gather(*(asyncio.to_thread(
                _http, origin + "/v1/commands", item, identity, "POST",
            ) for item, identity in zip(commands, headers, strict=True)))
            assert sorted(result[0] for result in results) == [200, 409], results
            winner = next(index for index, result in enumerate(results)
                          if result[0] == 200)
            loser = 1 - winner
            assert results[winner][1]["result"]["taskId"] == draft["draftId"]
            assert results[winner][1]["result"]["state"] == "todo"
            assert results[loser][1]["code"] == "REMOTE_APPROVAL_STALE"
            assert (await asyncio.to_thread(
                _http, origin + "/v1/commands", commands[winner], headers[winner], "POST",
            ))[1] == results[winner][1]
            for device, command_id, status in (
                (winner, commands[winner]["commandId"], 200),
                (loser, commands[winner]["commandId"], 404),
                (loser, commands[loser]["commandId"], 404),
            ):
                read_headers = {key: value for key, value in headers[device].items()
                                if key != "X-CSRF-Token"}
                read_headers["X-Forge-Session"] = "1"
                response = await asyncio.to_thread(
                    _http, origin + f"/v1/commands/{command_id}", None,
                    read_headers, "GET",
                )
                assert response[0] == status
        finally:
            await asyncio.to_thread(server.shutdown)
            await asyncio.to_thread(server.server_close)
            await asyncio.to_thread(thread.join, 2)
        db = host.storage.session()
        assert db.execute("SELECT COUNT(*) AS n FROM tasks WHERE task_id=?",
                          (draft["draftId"],)).fetchone()["n"] == 1
        assert db.execute("SELECT COUNT(*) AS n FROM remote_command_receipts "
                          "WHERE command_id IN (?,?)",
                          (commands[0]["commandId"], commands[1]["commandId"])
                          ).fetchone()["n"] == 1
        assert db.execute("SELECT COUNT(*) AS n FROM runs WHERE task_id=?",
                          (draft["draftId"],)).fetchone()["n"] == 0
    finally:
        await host.shutdown()
