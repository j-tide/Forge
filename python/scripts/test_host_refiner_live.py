"""Real Host stdio and authenticated Codex P1 draft generation in an isolated repo."""

import asyncio
import json
import os
import sqlite3
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from forge.protocol import encode_frame


async def main() -> None:
    with tempfile.TemporaryDirectory(prefix="forge-python-p1-live-") as directory:
        root = Path(directory)
        source = root / "fixture 空格"
        source.mkdir()
        (source / "package.json").write_text(
            '{"name":"fixture","scripts":{"test":"touch should-not-run"}}'
        )
        process = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "forge.host",
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env={**os.environ, "FORGE_HOST_DATA_DIR": str(root / "data"),
                 "FORGE_HOST_OWNERSHIP_TOKEN": "live-probe-owner"},
        )
        assert process.stdin and process.stdout

        async def call(
            method: str, params: dict[str, object] | None = None,
            expected_error: str | None = None,
        ) -> dict[str, object]:
            request_id = str(uuid4())
            process.stdin.write(encode_frame({
                "jsonrpc": "2.0", "id": request_id, "method": method,
                "params": params or {}, "transportVersion": "forge-local-jsonrpc/v1",
            }))
            await process.stdin.drain()
            raw = await asyncio.wait_for(process.stdout.readline(), timeout=10)
            answer: dict[str, object] = json.loads(raw)
            assert answer["id"] == request_id, answer
            if expected_error is not None:
                error = answer.get("error")
                assert isinstance(error, dict) and error.get("code") == expected_error, answer
                return error
            assert "result" in answer, answer
            return answer["result"]  # type: ignore[return-value]

        try:
            await call("system.handshake", {
                "productVersion": "0.0.1", "hostVersion": "0.0.1",
                "protocolVersion": "forge-host-protocol/v5",
                "ownershipToken": "live-probe-owner",
            })
            probe = (await call("project.probe", {"rootPath": str(source)}))["data"]
            project = (await call("project.create", {
                "rootPath": str(source), "fingerprint": probe["fingerprint"],
                "trustVersion": "project-trust/v1", "approved": True, "expectedRevision": 0,
            }))["data"]
            conversation = (await call("conversation.create", {
                "projectId": project["projectId"], "title": "Online refinement",
                "expectedRevision": 0,
            }))["data"]
            message = (await call("conversation.send", {
                "projectId": project["projectId"],
                "conversationId": conversation["conversationId"],
                "idempotencyKey": "python-live-refiner-msg-01",
                "text": "Add a feature: validate numeric inputs in add(a,b) and add tests.",
                "attachmentIds": [],
            }))["data"]["message"]
            draft = (await call("draft.generate", {
                "projectId": project["projectId"],
                "conversationId": conversation["conversationId"],
                "sourceMessageId": message["messageId"],
                "idempotencyKey": "python-live-refiner-draft-01",
            }))["data"]
            assert draft["status"] == "generating"
            for _ in range(260):
                await asyncio.sleep(1)
                health = await call("system.health")
                assert health["status"] == "ready"
                draft = (await call("draft.get", {
                    "projectId": project["projectId"], "draftId": draft["draftId"],
                }))["data"]
                if draft["status"] != "generating":
                    break
            assert draft["status"] in ("proposed", "needs_clarification"), draft
            assert draft["contract"]["taskId"] == draft["draftId"]
            assert draft["contract"]["acceptance"]
            assert isinstance(draft["modelId"], str) and draft["modelId"]
            assert isinstance(draft["assistantReply"], str) and draft["assistantReply"].strip()
            assert not (source / "should-not-run").exists()
            questions = list(draft["contract"]["openQuestions"])
            if questions:
                assert draft["status"] == "needs_clarification"
                # Model questions require a real user decision applied to the Task Contract.
                # This automated probe cannot truthfully supply that decision.
                await call("approval.request", {
                    "projectId": project["projectId"], "draftId": draft["draftId"],
                    "expectedRevision": draft["revision"],
                }, expected_error="APPROVAL_NOT_READY")
            else:
                assert draft["status"] == "proposed"
                approval = (await call("approval.request", {
                    "projectId": project["projectId"], "draftId": draft["draftId"],
                    "expectedRevision": draft["revision"],
                }))["data"]
                assert approval["status"] == "pending" and approval["taskState"] is None
            board = (await call("board.snapshot", {"projectId": project["projectId"]}))["data"]
            assert board["tasks"] == [], board
            await call("system.shutdown")
            assert await asyncio.wait_for(process.wait(), timeout=12) == 0
            reopened = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "forge.host",
                stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env={**os.environ, "FORGE_HOST_DATA_DIR": str(root / "data"),
                     "FORGE_HOST_OWNERSHIP_TOKEN": "live-probe-owner"},
            )
            assert reopened.stdin and reopened.stdout
            try:
                async def reopened_call(
                    method: str, params: dict[str, object]
                ) -> dict[str, object]:
                    reopened.stdin.write(encode_frame({
                        "jsonrpc": "2.0", "id": method, "method": method,
                        "params": params, "transportVersion": "forge-local-jsonrpc/v1",
                    }))
                    await reopened.stdin.drain()
                    answer = json.loads(await asyncio.wait_for(reopened.stdout.readline(), 10))
                    assert "result" in answer, answer
                    return answer["result"]

                await reopened_call("system.handshake", {
                    "productVersion": "0.0.1", "hostVersion": "0.0.1",
                    "protocolVersion": "forge-host-protocol/v5",
                    "ownershipToken": "live-probe-owner",
                })
                restored = await reopened_call("board.snapshot", {
                    "projectId": project["projectId"]
                })
                assert restored["data"]["tasks"] == board["tasks"]
                assert restored["data"]["boardRevision"] == board["boardRevision"]
                restored_draft = await reopened_call("draft.get", {
                    "projectId": project["projectId"], "draftId": draft["draftId"],
                })
                assert restored_draft["data"] == draft
                await reopened_call("system.shutdown", {})
                assert await asyncio.wait_for(reopened.wait(), 12) == 0
                database = root / "data" / "forge.sqlite"
                with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as db:
                    task_count = db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
                    run_count = db.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
                assert task_count == run_count == 0
                print(json.dumps({
                    "hostPid": process.pid, "draftStatus": draft["status"],
                    "modelId": draft["modelId"],
                    "assistantReplyLength": len(draft["assistantReply"]),
                    "acceptanceCount": len(draft["contract"]["acceptance"]),
                    "questionCount": len(questions), "questions": questions,
                    "approvalState": "blocked" if questions else "pending",
                    "taskCount": task_count, "runCount": run_count,
                    "boardRevision": board["boardRevision"],
                }))
            finally:
                if reopened.returncode is None:
                    reopened.kill()
                    await reopened.wait()
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()


if __name__ == "__main__":
    asyncio.run(main())
