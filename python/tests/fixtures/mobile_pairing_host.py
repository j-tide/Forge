"""Disposable loopback Host for a real browser pairing UI check.

The test controller must send 'approve' on stdin; this is not a product path
and never approves a request merely because a browser claimed it.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from forge.approvals import ApprovalDecideInput, ApprovalDecision, ApprovalRequestInput
from forge.conversations import ConversationSend
from forge.device_pairing import PairingDecisionInput
from forge.drafts import AcceptanceCriterion, DraftRequest, DraftReviseInput, TaskContract
from forge.host import HostRuntime
from forge.projects import TRUST_VERSION
from forge.remote_gateway import create_auth_loopback_gateway
from forge.remote_policy import DevicePolicyRevoke


def seed_task(host: HostRuntime, project_id: UUID, title: str,
              *, approve: bool) -> tuple[str, str]:
    """Real Host services create disposable Task/Approval test records."""
    conversation = host.conversations.create(str(project_id), title, 0)
    message = host.conversations.send(ConversationSend(
        projectId=project_id, conversationId=conversation.conversationId,
        idempotencyKey=str(uuid4()), text=title, attachmentIds=[],
    ))["message"]
    draft = host.drafts.manual(DraftRequest(
        projectId=project_id, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey=str(uuid4()),
    ))
    decision_id = uuid4()
    refs = [f"message:{message.messageId}", f"decision:{decision_id}"]
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project_id),
        revision=2, title=title, type="feature", goal=title,
        acceptance=[AcceptanceCriterion(
            id="AC-01", statement="Owner inspects the fixture", method="inspection",
            required=True, sourceRefs=refs,
        )], constraints=[], scope=[], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=refs,
        workflowRef="standard@1", priority="normal",
    )
    host.drafts.revise(DraftReviseInput(
        projectId=project_id, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id, decisionSummary="Fixture scope",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    request = host.approvals.request(ApprovalRequestInput(
        projectId=project_id, draftId=draft.draftId, expectedRevision=2,
    )).request
    if approve:
        host.approvals.decide(ApprovalDecideInput(
            projectId=project_id, decision=ApprovalDecision(
                schemaVersion="1.0", approvalId=request.approvalId,
                decision="approve", expectedRevision=2,
                scopeHash=request.scopeHash, reason="",
            ),
        ))
    return str(draft.draftId), str(request.approvalId)


async def main() -> None:
    web_root, project_root = Path(sys.argv[1]), Path(sys.argv[2])
    with_task_data = "--with-task-data" in sys.argv[3:]
    with_message_data = "--with-message-data" in sys.argv[3:]
    host = HostRuntime()
    if host.storage_health()["status"] != "ready":
        raise RuntimeError("fixture Host storage unavailable")
    probe = host.projects.probe(str(project_root))
    project = host.projects.create(str(project_root), probe.fingerprint, TRUST_VERSION, True, 0)
    if with_task_data:
        seed_task(host, project.projectId, "检查隔离工作区的变更", approve=False)
        seed_task(host, project.projectId, "已经批准的真实待办", approve=True)
    message_conversation = (host.conversations.create(
        str(project.projectId), "手机补充信息演示", 0
    ) if with_message_data else None)
    issued = host.device_pairing.issue()
    loop = asyncio.get_running_loop()

    def dispatch(method: str, payload: dict[str, Any]) -> dict[str, Any]:
        return asyncio.run_coroutine_threadsafe(
            host.dispatch_remote(method, payload), loop,
        ).result(timeout=3)

    server = create_auth_loopback_gateway(web_root, dispatch)
    serving = asyncio.create_task(asyncio.to_thread(server.serve_forever, poll_interval=0.1))
    print(json.dumps({"port": server.server_port, "nonce": issued["nonce"],
                      "pairingId": issued["pairingId"],
                      "projectId": str(project.projectId),
                      "conversationId": str(message_conversation.conversationId)
                      if message_conversation else None}), flush=True)
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line or line.strip() == "stop":
                break
            if line.strip() == "approve":
                result = host.device_pairing.decide(PairingDecisionInput(
                    pairingId=UUID(issued["pairingId"]), approve=True,
                    projectIds=[project.projectId],
                    scopes=["task:approve"] if with_task_data else ["task:draft"],
                ))
                print(json.dumps({"status": result["status"]}), flush=True)
            if line.strip() == "revoke":
                devices = host.device_pairing.list_local()
                if len(devices) != 1:
                    raise RuntimeError("fixture requires exactly one paired device")
                result = host.remote_policy.revoke(DevicePolicyRevoke(
                    deviceId=UUID(devices[0]["deviceId"]),
                    expectedRevision=devices[0]["revision"],
                ))
                print(json.dumps({"status": result["status"]}), flush=True)
            if line.strip() == "seed":
                task_id, approval_id = seed_task(
                    host, project.projectId, "重开后新增的真实任务", approve=True,
                )
                print(json.dumps({"taskId": task_id, "approvalId": approval_id}),
                      flush=True)
    finally:
        server.shutdown()
        await serving
        server.server_close()
        await host.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
