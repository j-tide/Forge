"""Explicit live Codex spike. Uses disposable Git repo; never runs in Forge source."""

from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

from forge.codex_executor import CodexExecutorAdapter, CodexRun
from forge.executor_contracts import AttemptRequest, ExecutorEvent, ScheduledExecutorRequest
from forge.processes import ProcessController
from forge.workspaces import WorkspaceManager


def git(directory: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(directory), *args], check=True, capture_output=True, text=True,
        timeout=20,
    )
    return result.stdout.strip()


def request(run_id: str, workspace: Path, goal: str, model: str, *,
            session: str | None = None, permission: str = "workspace-write",
            output_schema: dict[str, object] | None = None,
            approval: str = "on-request") -> ScheduledExecutorRequest:
    return ScheduledExecutorRequest.model_validate({
        "runId": run_id, "taskId": str(uuid4()), "workspace": str(workspace),
        "goal": goal, "context": [], "permission": permission,
        "approval": approval, "model": model, "maxDurationMs": 240000,
        "outputSchema": output_schema,
        "attempt": AttemptRequest(
            attemptId=str(uuid4()), leaseEpoch=1, contractRevision=1,
            workspaceLeaseId=str(uuid4()), contextBundleId=str(uuid4()),
            profileRevision=1, outputSchemaId="json-v1" if output_schema else "plain-text-v1",
            nativeSessionRef=session,
        ).model_dump(),
    })


async def resume_child(workspace: Path, session_id: str, model: str) -> None:
    controller = ProcessController(uuid4())
    adapter = CodexExecutorAdapter(controller)
    run_id = str(uuid4())
    events: list[ExecutorEvent] = []
    run = await adapter.start(request(
        run_id, workspace, "Continue the prior thread. State which source file you read. "
        "Do not modify files.", model, session=session_id, permission="read-only",
    ), events.append)
    assert await asyncio.wait_for(run.wait(), 120) == "completed"
    assert run.provider_session_id == session_id
    assert events[-1].type == "run.completed"
    await adapter.dispose()
    assert not controller.has_active(run_id)
    print("resume_child_result passed", flush=True)


async def main(mode: str) -> None:
    with tempfile.TemporaryDirectory(prefix="forge-python-codex-") as raw:
        root = Path(raw)
        source = root / "Forge 测试项目 01 with spaces"
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
        controller = ProcessController(uuid4())
        workspaces = WorkspaceManager(root / "managed workspaces", controller.runtime_id,
                                      controller.has_active)
        await workspaces.open()
        run_id = str(uuid4())
        workspace = await workspaces.create(source, run_id)
        await workspaces.acquire(workspace.workspaceId, run_id)
        worktree = Path(workspace.rootPath)
        adapter = CodexExecutorAdapter(controller)
        capabilities = await adapter.probe()
        if not capabilities.available:
            raise RuntimeError("Codex CLI or authentication unavailable")
        model = "gpt-6-luna" if "gpt-6-luna" in capabilities.modelIds else capabilities.modelIds[0]
        events: list[ExecutorEvent] = []
        command_started = asyncio.Event()
        approval_queue: asyncio.Queue[str] = asyncio.Queue()
        def observe(event: ExecutorEvent) -> None:
            events.append(event)
            if event.type == "command.started" and "sleep" in event.command:
                command_started.set()
            if event.type == "approval.requested":
                approval_queue.put_nowait(event.approvalId)
            if event.type in ("run.started", "run.completed", "run.failed", "run.cancelled",
                              "approval.requested", "approval.resolved"):
                print("event", event.type, flush=True)

        if mode == "coding":
            goal = ("In this tiny fixture only: update math.js so add(a,b) rejects non-number "
                    "inputs with TypeError. Add assertions in test.js for invalid inputs. "
                    "Run npm test. Do not change package.json. Finish when tests pass.")
            handle = await adapter.start(request(run_id, worktree, goal, model), observe)
            outcome = await asyncio.wait_for(handle.wait(), 240)
            result = subprocess.run(["node", "test.js"], cwd=worktree, check=False,
                                    capture_output=True, text=True, timeout=20)
            assert outcome == "completed" and events[-1].type == "run.completed"
            assert result.returncode == 0 and "TypeError" in (worktree / "test.js").read_text()
            assert git(source, "status", "--porcelain") == baseline
            assert (source / "math.js").read_text() == "export const add = (a, b) => a + b;\n"
            print("coding_result", "passed", "events", len(events),
                  "types", sorted({item.type for item in events}))
        elif mode == "structured":
            schema: dict[str, object] = {"type": "object", "properties": {
                "name": {"type": "string"}}, "required": ["name"], "additionalProperties": False}
            handle = await adapter.start(request(
                run_id, worktree, "Return a JSON object with name equal to Forge."
                " Do not modify files or run commands.", model, permission="read-only",
                output_schema=schema,
            ), observe)
            assert await asyncio.wait_for(handle.wait(), 120) == "completed"
            assert events[-1].type == "run.completed"
            assert events[-1].structuredOutput == {"name": "Forge"}
            assert git(worktree, "status", "--porcelain") == ""
            print("structured_result", "passed", "events", len(events))
        elif mode == "cancel":
            handle = await adapter.start(request(
                run_id, worktree, "Run the exact shell command `sleep 45` here. "
                "Wait for it to finish, then write finished.txt. Do not skip the wait.",
                model, approval="never",
            ), observe)
            await asyncio.wait_for(command_started.wait(), 90)
            await handle.cancel()
            assert await asyncio.wait_for(handle.wait(), 30) == "cancelled"
            assert events[-1].type == "run.cancelled"
            await asyncio.sleep(1)
            assert not (worktree / "finished.txt").exists()
            assert not controller.has_active(run_id)
            print("cancel_result", "passed", "command_started", command_started.is_set())
        elif mode in ("approve", "reject"):
            handle = await adapter.start(request(
                run_id, worktree,
                "Execute the exact shell command `printf approved > approval.txt` in this "
                "project. The workspace is read-only. Request approval to run the write "
                "command. If declined, do not retry or find another way to write. Report what happened.",
                model, permission="read-only",
            ), observe)
            approval_id = await asyncio.wait_for(approval_queue.get(), 90)
            await handle.respond_to_approval(approval_id, mode)
            assert await asyncio.wait_for(handle.wait(), 120) == "completed"
            assert any(item.type == "approval.resolved" for item in events)
            assert (worktree / "approval.txt").exists() is (mode == "approve")
            assert git(source, "status", "--porcelain") == baseline
            print("approval_result", mode, "passed", "events", len(events))
        elif mode == "continuation":
            first = await adapter.start(request(
                run_id, worktree, "Read math.js and state what add returns. "
                "Do not modify files or run project commands.", model, permission="read-only",
            ), observe)
            assert await asyncio.wait_for(first.wait(), 120) == "completed"
            second_id = str(uuid4())
            second = await adapter.start(request(
                second_id, worktree, "Continue this thread. State the filename you read "
                "in the prior turn. Do not modify files.", model,
                session=first.provider_session_id, permission="read-only",
            ), observe)
            assert await asyncio.wait_for(second.wait(), 120) == "completed"
            assert first.provider_session_id == second.provider_session_id
            assert git(worktree, "status", "--porcelain") == ""
            print("continuation_result", "passed", "same_thread", True)
        elif mode == "restart-continuation":
            first = await adapter.start(request(
                run_id, worktree, "Read math.js and state what add returns. "
                "Do not modify files or run project commands.", model, permission="read-only",
            ), observe)
            assert await asyncio.wait_for(first.wait(), 120) == "completed"
            child = subprocess.run([
                sys.executable, __file__, "resume-child", str(worktree),
                first.provider_session_id, model,
            ], capture_output=True, text=True, timeout=180, check=False)
            assert child.returncode == 0, child.stderr[-1000:]
            assert "resume_child_result passed" in child.stdout
            assert git(worktree, "status", "--porcelain") == ""
            print("restart_continuation_result passed")
        elif mode == "invalid-model":
            try:
                await adapter.start(request(run_id, worktree, "Read math.js", "not-a-codex-model",
                                            permission="read-only"), observe)
            except Exception as error:
                assert getattr(error, "code", None) == "EXECUTOR_UNSUPPORTED_CAPABILITY"
            else:
                raise AssertionError("invalid model accepted")
            print("invalid_model_result", "passed")
        elif mode == "missing-auth":
            original = os.environ.get("CODEX_HOME")
            os.environ["CODEX_HOME"] = str(root / "empty-codex-home")
            try:
                assert not (await adapter.probe()).available
                try:
                    await adapter.start(request(run_id, worktree, "Read math.js", model,
                                                permission="read-only"), observe)
                except Exception as error:
                    assert getattr(error, "code", None) == "EXECUTOR_AUTH_FAILED"
                else:
                    raise AssertionError("missing authentication accepted")
            finally:
                if original is None:
                    os.environ.pop("CODEX_HOME", None)
                else:
                    os.environ["CODEX_HOME"] = original
            print("missing_auth_result", "passed")
        else:
            raise ValueError(mode)
        await adapter.dispose()
        assert not controller.has_active(run_id)
        assert (await controller.dispose())


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["coding", "structured", "cancel", "approve",
                                         "reject", "continuation", "invalid-model",
                                         "missing-auth", "restart-continuation",
                                         "resume-child"])
    parser.add_argument("workspace", nargs="?")
    parser.add_argument("session", nargs="?")
    parser.add_argument("model", nargs="?")
    arguments = parser.parse_args()
    if arguments.mode == "resume-child":
        if not all((arguments.workspace, arguments.session, arguments.model)):
            parser.error("resume-child requires workspace, session and model")
        asyncio.run(resume_child(Path(arguments.workspace), arguments.session, arguments.model))
    else:
        asyncio.run(main(arguments.mode))
