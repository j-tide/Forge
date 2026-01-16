"""Real Python Host P1 approval -> Codex Run -> immutable Handoff, disposable DB/repo."""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from forge.protocol import encode_frame


def git(root: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(root), *args], check=True,
                          capture_output=True, text=True, timeout=20).stdout.strip()


async def main() -> None:
    with tempfile.TemporaryDirectory(prefix="forge-python-host-codex-") as raw:
        root = Path(raw)
        source = root / "Forge fixture 空格"
        source.mkdir()
        git(source, "init", "-b", "main")
        git(source, "config", "user.name", "Forge fixture")
        git(source, "config", "user.email", "forge-fixture@example.invalid")
        (source / "math.js").write_text("export const add = (a, b) => a + b;\n")
        (source / "test.js").write_text(
            "import { add } from './math.js';\n"
            "import assert from 'node:assert/strict';\n"
            "assert.equal(add(1, 2), 3);\n"
        )
        (source / "package.json").write_text(
            '{"type":"module","scripts":{"test":"node test.js"}}\n'
        )
        git(source, "add", ".")
        git(source, "commit", "-m", "fixture")
        baseline = git(source, "status", "--porcelain")
        host = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            env={**os.environ, "FORGE_HOST_DATA_DIR": str(root / "data"),
                 "FORGE_HOST_OWNERSHIP_TOKEN": "host-codex-live"},
        )
        assert host.stdin and host.stdout

        async def call(method: str, params: dict[str, object] | None = None) -> object:
            identifier = str(uuid4())
            host.stdin.write(encode_frame({
                "jsonrpc": "2.0", "id": identifier, "method": method,
                "params": params or {}, "transportVersion": "forge-local-jsonrpc/v1",
            }))
            await host.stdin.drain()
            raw_frame = await asyncio.wait_for(host.stdout.readline(), 15)
            response = json.loads(raw_frame)
            assert response["id"] == identifier, response
            assert "result" in response, response
            return response["result"]["data"] if "data" in response["result"] else response["result"]

        try:
            await call("system.handshake", {
                "productVersion": "0.0.1", "hostVersion": "0.0.1",
                "protocolVersion": "forge-host-protocol/v5",
                "ownershipToken": "host-codex-live",
            })
            probe = await call("project.probe", {"rootPath": str(source)})
            project = await call("project.create", {
                "rootPath": str(source), "fingerprint": probe["fingerprint"],
                "trustVersion": "project-trust/v1", "approved": True,
                "expectedRevision": 0,
            })
            conversation = await call("conversation.create", {
                "projectId": project["projectId"], "title": "Live host fixture",
                "expectedRevision": 0,
            })
            sent = await call("conversation.send", {
                "projectId": project["projectId"],
                "conversationId": conversation["conversationId"],
                "idempotencyKey": "python-host-codex-msg-01",
                "text": "Validate add inputs and add tests.", "attachmentIds": [],
            })
            draft = await call("draft.manual", {
                "projectId": project["projectId"],
                "conversationId": conversation["conversationId"],
                "sourceMessageId": sent["message"]["messageId"],
                "idempotencyKey": "python-host-codex-draft-01",
            })
            decision_id = str(uuid4())
            decision_ref = f"decision:{decision_id}"
            contract = {
                "schemaVersion": "1.0", "taskId": draft["draftId"],
                "projectId": project["projectId"], "revision": 2,
                "title": "Validate add", "type": "feature",
                "goal": "In this tiny fixture, update math.js so add(a,b) rejects non-number "
                        "inputs with TypeError. Add assertions in test.js for invalid inputs. "
                        "Run npm test. Do not change package.json. Finish when tests pass.",
                "acceptance": [{"id": "AC-01", "statement": "Invalid inputs rejected",
                                "method": "automated", "required": True,
                                "sourceRefs": [decision_ref]}],
                "constraints": [], "scope": ["math.js", "test.js"], "outOfScope": [],
                "dependencies": [], "openQuestions": [], "assumptions": [],
                "sourceRefs": [f"message:{sent['message']['messageId']}", decision_ref],
                "workflowRef": "standard@1", "priority": "normal",
            }
            revised = await call("draft.revise", {
                "projectId": project["projectId"], "draftId": draft["draftId"],
                "expectedRevision": 1, "contract": contract,
                "decisionId": decision_id, "decisionSummary": "Fixture scope approved",
                "resolvedQuestions": [], "removedAcceptanceIds": [],
                "confirmScopeChange": True,
            })
            assert revised["status"] == "proposed"
            pending = await call("approval.request", {
                "projectId": project["projectId"], "draftId": draft["draftId"],
                "expectedRevision": 2,
            })
            approved = await call("approval.decide", {
                "projectId": project["projectId"], "decision": {
                    "schemaVersion": "1.0", "approvalId": pending["request"]["approvalId"],
                    "decision": "approve", "expectedRevision": 2,
                    "scopeHash": pending["request"]["scopeHash"],
                    "reason": "Fixture contract reviewed",
                },
            })
            assert approved["taskState"] == "todo"
            capabilities = await call("run.capabilities", {
                "projectId": project["projectId"], "taskId": draft["draftId"],
            })
            assert capabilities["available"] and "gpt-6-luna" in capabilities["modelIds"]
            run_id = str(uuid4())
            queued = await call("run.start", {
                "projectId": project["projectId"], "taskId": draft["draftId"],
                "expectedTaskRevision": 2, "modelId": "gpt-6-luna",
                "idempotencyKey": run_id,
            })
            assert queued["runId"] == run_id
            inspection = None
            for _ in range(240):
                await asyncio.sleep(1)
                inspection = await call("run.inspect", {
                    "projectId": project["projectId"], "runId": run_id,
                    "afterCursor": 0, "limit": 100,
                })
                if inspection["run"]["state"] in (
                    "succeeded", "failed", "cancelled", "interrupted"
                ):
                    break
            assert inspection is not None and inspection["run"]["state"] == "succeeded", inspection
            handoff = None
            for _ in range(20):
                handoff = await call("run.handoff", {
                    "projectId": project["projectId"], "runId": run_id,
                })
                if handoff:
                    break
                await asyncio.sleep(.5)
            assert handoff is not None
            assert not handoff["snapshot"]["noChange"]
            assert handoff["stepResult"]["acceptanceResults"][0]["status"] == "unverified"
            files = {item["path"] for item in handoff["snapshot"]["files"]}
            assert {"math.js", "test.js"}.issubset(files)
            workspace = root / "data" / "workspaces" / "trees" / handoff["snapshot"]["workspaceId"]
            assert subprocess.run(["node", "test.js"], cwd=workspace, check=False,
                                  capture_output=True, timeout=20).returncode == 0
            assert git(source, "status", "--porcelain") == baseline
            assert (source / "math.js").read_text() == "export const add = (a, b) => a + b;\n"
            print("host_live_result passed", "run", inspection["run"]["state"],
                  "files", sorted(files), "observations", len(inspection["observations"]))
            await call("system.shutdown")
            assert await asyncio.wait_for(host.wait(), 15) == 0
        finally:
            if host.returncode is None:
                host.kill()
                await host.wait()


if __name__ == "__main__":
    asyncio.run(main())
