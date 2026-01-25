"""Approved Task changes preserve old Run evidence and wait for a safe point."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from test_delivery import accepted_fixture
from test_verifier_project import git

from forge.acceptance_matrix import AcceptanceMatrixService
from forge.board import BoardService
from forge.environments import EnvironmentService
from forge.final_acceptance import FinalAcceptanceService
from forge.handoffs import HandoffService
from forge.processes import ProcessController
from forge.projects import ProjectService
from forge.protocol import HOST_PROTOCOL_VERSION, TRANSPORT_VERSION
from forge.review_copies import ReviewCopyManager
from forge.review_issues import ReviewIssueService
from forge.review_runtime import HostReviewService, ReviewRuntimeError, ReviewStartInput
from forge.run_config import RunConfigService
from forge.run_inspection import RunInspectionService
from forge.runs import RunService
from forge.task_changes import (
    TaskChangeApply,
    TaskChangeDecision,
    TaskChangeError,
    TaskChangePropose,
    TaskChangeService,
)
from forge.verifier_project import ProjectCommandVerifier, VerifierError, VerifyStartInput


def services(storage, tmp_path: Path):
    projects = ProjectService(storage)
    configs = RunConfigService(storage, EnvironmentService(storage))
    verifier = ProjectCommandVerifier(
        storage, projects, EnvironmentService(storage), configs,
        HandoffService(storage), ProcessController(uuid4(), tmp_path / "change-process"),
        tmp_path / "change-verifier",
    )
    matrix = AcceptanceMatrixService(storage, projects, configs, verifier)
    return TaskChangeService(storage, projects), configs, matrix, FinalAcceptanceService(
        storage, projects, matrix,
    )


def request(storage, project_id: UUID, task_id: UUID,
            *, goal: str = "A new approved goal for the next Run") -> TaskChangePropose:
    row = storage.session().execute(
        "SELECT contract_json,current_revision FROM tasks WHERE task_id=?",
        (str(task_id),),
    ).fetchone()
    assert row is not None
    from forge.drafts import TaskContract
    previous = TaskContract.model_validate_json(row["contract_json"])
    decision_id = uuid4()
    candidate = previous.model_copy(update={
        "revision": previous.revision + 1, "goal": goal,
        "sourceRefs": [*previous.sourceRefs, f"decision:{decision_id}"],
    })
    return TaskChangePropose(
        projectId=project_id, taskId=task_id, expectedRevision=previous.revision,
        contract=candidate, decisionId=decision_id,
        reason="Owner requested a new goal for the following development run.",
        confirmScopeChange=False, idempotencyKey=uuid4(),
    )


@pytest.mark.asyncio
async def test_revision_keeps_old_run_and_stales_current_evidence(tmp_path: Path) -> None:
    source, head, storage, project_id, task_id, snapshot_id = await accepted_fixture(tmp_path)
    changes, configs, matrix, final = services(storage, tmp_path)
    prior = storage.session().execute(
        "SELECT run_id FROM runs WHERE task_id=?", (str(task_id),),
    ).fetchone()
    assert prior is not None
    old_config = configs.get(project_id, UUID(prior["run_id"]))
    assert old_config is not None
    assert matrix.get(project_id, task_id).snapshotId == snapshot_id
    assert final.get(project_id, task_id).status == "accepted"
    proposed = changes.propose(request(storage, project_id, task_id))
    assert proposed.state == "proposed"
    assert BoardService(storage).detail(str(project_id), str(task_id)).detail.contract.revision == 2
    applied = changes.decide(TaskChangeDecision(
        projectId=project_id, taskId=task_id, changeId=proposed.changeId,
        expectedRevision=2, expectedContentHash=proposed.contentHash,
        decision="approve", reason="Owner approves the exact changed goal and source.",
    ))
    assert applied.state == "applied" and applied.proposedRevision == 3
    board = BoardService(storage)
    board.final_acceptance = final
    detail = board.detail(str(project_id), str(task_id))
    assert detail.detail.contract.revision == 3
    assert detail.detail.task.state != "done"
    assert any(item.ref == f"decision:{proposed.decisionId}"
               and item.status == "available" for item in detail.sources)
    assert matrix.get(project_id, task_id).snapshotId is None
    assert final.get(project_id, task_id).status != "accepted"
    assert configs.get(project_id, UUID(prior["run_id"])) == old_config
    projects = ProjectService(storage)
    handoffs = HandoffService(storage)
    inspections = RunInspectionService(storage, RunService(storage, configs))
    copies = ReviewCopyManager(tmp_path / "changed-review", uuid4(), lambda _run: False)
    issues = ReviewIssueService(storage, handoffs, configs, inspections, copies)
    reviewer = HostReviewService(storage, projects, handoffs, configs,
                                 inspections, copies, issues, adapter=None)  # type: ignore[arg-type]
    with pytest.raises(ReviewRuntimeError, match="REVIEW_RESULT_STALE"):
        await reviewer.start(ReviewStartInput(
            projectId=project_id, taskId=task_id,
            developmentRunId=UUID(prior["run_id"]), expectedSnapshotId=snapshot_id,
            modelId="fixture-model", idempotencyKey=uuid4(),
        ))
    with pytest.raises(VerifierError, match="VERIFY_SOURCE_STALE"):
        await services(storage, tmp_path)[2].verifier.start(VerifyStartInput(
            projectId=project_id, taskId=task_id,
            developmentRunId=UUID(prior["run_id"]), expectedSnapshotId=snapshot_id,
            kind="test", presetId=None, idempotencyKey=uuid4(),
        ))
    assert git(source, "rev-parse", "HEAD") == head
    assert git(source, "status", "--porcelain") == ""
    storage.close()


@pytest.mark.asyncio
async def test_pending_change_waits_for_safe_point_and_rejects_stale(
    tmp_path: Path,
) -> None:
    _, _, storage, project_id, task_id, _ = await accepted_fixture(tmp_path)
    changes, configs, _, _ = services(storage, tmp_path)
    previous = storage.session().execute(
        "SELECT run_id FROM runs WHERE task_id=?", (str(task_id),),
    ).fetchone()
    assert previous is not None
    old_config = configs.get(project_id, UUID(previous["run_id"]))
    assert old_config is not None
    with storage.transaction() as db:
        db.execute("UPDATE runs SET state='running',finished_at=NULL WHERE run_id=?",
                   (previous["run_id"],))
    value = request(storage, project_id, task_id)
    proposed = changes.propose(value)
    assert changes.propose(value) == proposed
    with pytest.raises(TaskChangeError, match="TASK_CHANGE_STALE"):
        changes.decide(TaskChangeDecision(
            projectId=project_id, taskId=task_id, changeId=proposed.changeId,
            expectedRevision=2, expectedContentHash="0" * 64,
            decision="approve", reason="This old hash must be rejected by Host.",
        ))
    waiting = changes.decide(TaskChangeDecision(
        projectId=project_id, taskId=task_id, changeId=proposed.changeId,
        expectedRevision=2, expectedContentHash=proposed.contentHash,
        decision="approve", reason="Owner approved while the old Run remains active.",
    ))
    assert waiting.state == "awaiting_safe_point"
    assert BoardService(storage).detail(str(project_id), str(task_id)).detail.contract.revision == 2
    assert configs.get(project_id, UUID(previous["run_id"])) == old_config
    action = TaskChangeApply(projectId=project_id, taskId=task_id,
                             changeId=waiting.changeId, expectedRevision=2, confirmed=True)
    with pytest.raises(TaskChangeError, match="TASK_CHANGE_WAITING_SAFE_POINT"):
        changes.apply(action)
    with storage.transaction() as db:
        db.execute("UPDATE runs SET state='succeeded' WHERE run_id=?", (previous["run_id"],))
    applied = changes.apply(action)
    assert applied.state == "applied" and changes.apply(action) == applied
    assert configs.get(project_id, UUID(previous["run_id"])) == old_config
    storage.close()


@pytest.mark.asyncio
async def test_rejection_and_scope_change_need_exact_user_decision(tmp_path: Path) -> None:
    _, _, storage, project_id, task_id, _ = await accepted_fixture(tmp_path)
    changes, _, _, _ = services(storage, tmp_path)
    original = request(storage, project_id, task_id)
    changed = original.contract.model_copy(update={
        "acceptance": [*original.contract.acceptance],
    })
    first = changed.acceptance[0]
    changed.acceptance[0] = first.model_copy(update={
        "statement": "New acceptance for the next version",
        "sourceRefs": [*first.sourceRefs, f"decision:{original.decisionId}"],
    })
    with pytest.raises(TaskChangeError, match="TASK_CHANGE_INVALID"):
        changes.propose(original.model_copy(update={
            "contract": changed, "confirmScopeChange": False,
        }))
    value = original.model_copy(update={"contract": changed, "confirmScopeChange": True})
    proposed = changes.propose(value)
    rejected = changes.decide(TaskChangeDecision(
        projectId=project_id, taskId=task_id, changeId=proposed.changeId,
        expectedRevision=2, expectedContentHash=proposed.contentHash,
        decision="reject", reason="Owner does not accept this scope expansion.",
    ))
    assert rejected.state == "rejected"
    assert BoardService(storage).detail(str(project_id), str(task_id)).detail.contract.revision == 2
    with pytest.raises(TaskChangeError, match="TASK_CHANGE_CONFLICT"):
        changes.decide(TaskChangeDecision(
            projectId=project_id, taskId=task_id, changeId=proposed.changeId,
            expectedRevision=2, expectedContentHash=proposed.contentHash,
            decision="approve", reason="A second client cannot approve rejection.",
        ))
    storage.close()


@pytest.mark.asyncio
async def test_independent_host_persists_change_and_rejects_old_revision(
    tmp_path: Path,
) -> None:
    source, original_head, storage, project_id, task_id, _ = await accepted_fixture(tmp_path)
    candidate = request(storage, project_id, task_id)
    storage.close()
    env = {**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data"),
           "FORGE_HOST_OWNERSHIP_TOKEN": "task-change-fixture"}

    async def session(commands: list[tuple[str, dict[str, object]]]) -> list[dict]:
        host = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "forge.host", env=env,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        assert host.stdin is not None and host.stdout is not None

        async def call(method: str, params: dict[str, object]) -> dict:
            call_id = str(uuid4())
            host.stdin.write(json.dumps({"jsonrpc": "2.0", "id": call_id,
                "method": method, "params": params,
                "transportVersion": TRANSPORT_VERSION}).encode() + b"\n")
            await host.stdin.drain()
            reply = json.loads(await asyncio.wait_for(host.stdout.readline(), 15))
            assert reply["id"] == call_id
            return reply

        try:
            hello = await call("system.handshake", {
                "productVersion": "0.0.1", "hostVersion": "0.0.1",
                "protocolVersion": HOST_PROTOCOL_VERSION,
                "ownershipToken": "task-change-fixture",
            })
            assert hello["result"]["status"] == "ready"
            results = [await call(method, payload) for method, payload in commands]
            assert (await call("system.shutdown", {}))["result"]["status"] == "stopping"
            assert await asyncio.wait_for(host.wait(), 5) == 0
            return results
        finally:
            if host.returncode is None:
                host.kill()
                await host.wait()

    (proposed_reply,) = await session([
        ("task.change.propose", candidate.model_dump(mode="json")),
    ])
    proposed = proposed_reply["result"]["data"]
    assert proposed["state"] == "proposed"
    decision = TaskChangeDecision(
        projectId=project_id, taskId=task_id, changeId=UUID(proposed["changeId"]),
        expectedRevision=2, expectedContentHash=proposed["contentHash"],
        decision="approve", reason="Owner approved this exact changed goal.",
    )
    get_reply, decided_reply, bad_payload = await session([
        ("task.change.get", {"projectId": str(project_id), "taskId": str(task_id)}),
        ("task.change.decide", decision.model_dump(mode="json")),
        ("task.change.apply", {"projectId": str(project_id), "taskId": str(task_id),
                               "changeId": proposed["changeId"],
                               "expectedRevision": 2, "confirmed": True, "shell": "echo bad"}),
    ])
    assert get_reply["result"]["data"]["state"] == "proposed"
    assert decided_reply["result"]["data"]["state"] == "applied"
    assert bad_payload["error"]["code"] == "INVALID_REQUEST"
    latest_reply, detail_reply = await session([
        ("task.change.get", {"projectId": str(project_id), "taskId": str(task_id)}),
        ("task.detail", {"projectId": str(project_id), "taskId": str(task_id)}),
    ])
    assert latest_reply["result"]["data"]["state"] == "applied"
    assert detail_reply["result"]["data"]["detail"]["contract"]["revision"] == 3
    assert git(source, "rev-parse", "HEAD") == original_head
    assert git(source, "status", "--porcelain") == ""
