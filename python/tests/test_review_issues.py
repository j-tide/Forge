"""Real SQLite and Git fixture for stable Review issues and compact rework handoff."""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest

from forge.approvals import (
    ApprovalDecideInput,
    ApprovalDecision,
    ApprovalRequestInput,
    ApprovalService,
)
from forge.conversations import ConversationSend, ConversationService, timestamp
from forge.drafts import (
    AcceptanceCriterion,
    DraftRequest,
    DraftReviseInput,
    DraftService,
    TaskContract,
)
from forge.environments import EnvironmentService
from forge.executor_contracts import ExecutorCapabilities, RunCompleted
from forge.handoffs import CodeSnapshot, HandoffService
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.protocol import encode_frame
from forge.review import ReviewContext
from forge.review_copies import ReviewCopyManager
from forge.review_issues import ReviewIssueError, ReviewIssueService
from forge.run_config import (
    ProfileLock,
    RunBudget,
    RunConfigSelection,
    RunConfigService,
    VersionLock,
)
from forge.run_inspection import RunInspectionService
from forge.runs import RunService
from forge.workspaces import WorkspaceManager


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], check=True, capture_output=True,
        text=True, timeout=20,
    ).stdout.strip()


def capabilities() -> ExecutorCapabilities:
    return ExecutorCapabilities(
        executorId="executor.codex", adapterVersion="fixture/1", upstreamVersion="fixture/1",
        platform="darwin-arm64", available=True, streaming=True, resume=True,
        interrupt=True, approval=True, structuredEvents=True, structuredOutput=True,
        workspaceControl=True, toolEvents=False, sessionPersistence=True,
        modelSelection=True, usageReporting=True, readOnlyEnforced=True,
        networkPolicyEnforced=False, enforcement="native-sandbox",
        modelIds=["fixture-model"], authModes=["fixture"], warnings=[],
    )


@pytest.mark.asyncio
async def test_issue_history_dedup_rework_and_restart(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "Project 空格"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "math.js").write_text("export const add = (a,b) => a + b;\n")
    git(source, "add", ".")
    git(source, "commit", "-m", "base")
    source_head = git(source, "rev-parse", "HEAD")

    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    assert storage.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    conversation_service = ConversationService(storage)
    conversation = conversation_service.create(str(project.projectId), "Review fixture", 0)
    message = conversation_service.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey="review-fixture-message", text="Validate input", attachmentIds=[],
    ))["message"]
    drafts = DraftService(storage)
    draft = drafts.manual(DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey="review-fixture-draft",
    ))
    decision_id = uuid4()
    decision_ref = f"decision:{decision_id}"
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(draft.draftId), projectId=str(project.projectId),
        revision=2, title="Validate add", type="feature", goal="Reject invalid input",
        acceptance=[AcceptanceCriterion(
            id="AC-01", statement="Invalid input raises TypeError", method="inspection",
            required=True, sourceRefs=[decision_ref],
        )], constraints=[], scope=["math.js"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=[f"message:{message.messageId}", decision_ref],
        workflowRef="standard", priority="normal",
    )
    drafts.revise(DraftReviseInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=1,
        contract=contract, decisionId=decision_id, decisionSummary="Fixture scope",
        resolvedQuestions=[], removedAcceptanceIds=[], confirmScopeChange=True,
    ))
    approvals = ApprovalService(storage, drafts)
    pending = approvals.request(ApprovalRequestInput(
        projectId=project.projectId, draftId=draft.draftId, expectedRevision=2,
    ))
    approvals.decide(ApprovalDecideInput(
        projectId=project.projectId,
        decision=ApprovalDecision(
            schemaVersion="1.0", approvalId=pending.request.approvalId,
            decision="approve", expectedRevision=2, scopeHash=pending.request.scopeHash,
            reason="Fixture approved",
        ),
    ))
    environment = EnvironmentService(storage).list_environments(str(project.projectId))[0]
    configs = RunConfigService(storage, EnvironmentService(storage))
    run_id = uuid4()
    lock = "a" * 64
    config = configs.create(RunConfigSelection(
        runId=run_id, projectId=project.projectId, taskId=draft.draftId,
        expectedTaskRevision=2, workflow=VersionLock(id="standard", version="1", contentHash=lock),
        profile=ProfileLock(id="developer", version="1", contentHash=lock,
                            executorPluginId="fixture.executor"),
        plugins=[VersionLock(id="fixture.executor", version="1", contentHash=lock)],
        budget=RunBudget(maxDurationMs=30_000, maxTurns=3, maxTokens=5000, maxToolCalls=10),
        environmentId=environment.environmentId, expectedEnvironmentRevision=1,
    ))
    runtime_id = uuid4()
    developer = WorkspaceManager(tmp_path / "development", runtime_id, lambda _run: False)
    await developer.open()
    work = await developer.create(source, str(run_id))
    (Path(work.rootPath) / "math.js").write_text("export const add = (a,b) => String(a) + b;\n")
    material = await developer.freeze_snapshot(work.workspaceId, str(run_id))
    attempt_id = uuid4()
    snapshot = CodeSnapshot.model_validate_json(json.dumps({
        **material.model_dump(mode="json"), "schemaVersion": "1.0",
        "projectId": str(project.projectId), "attemptId": str(attempt_id),
    }))
    now = timestamp()
    with storage.transaction() as db:
        db.execute(
            "INSERT INTO runs(run_id,project_id,task_id,config_hash,state,revision,"
            "created_at,deadline_at,finished_at) VALUES(?,?,?,?,?,1,?,?,?)",
            (str(run_id), str(project.projectId), str(draft.draftId), config.snapshotHash,
             "succeeded", now, now, now),
        )
        db.execute(
            "INSERT INTO run_attempts(attempt_id,run_id,node_id,attempt_no,workspace_id,"
            "workspace_lease_id,lease_epoch,base_revision,executor_id,state,intent_at) "
            "VALUES(?,?,'develop',1,?,?,1,?,'fixture.executor','succeeded',?)",
            (str(attempt_id), str(run_id), str(work.workspaceId), str(uuid4()),
             work.baseRevision, now),
        )
        db.execute(
            "INSERT INTO code_snapshots(snapshot_id,project_id,run_id,attempt_id,"
            "workspace_id,commit_sha,tree_sha,base_sha,content_hash,snapshot_json,"
            "created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (str(snapshot.snapshotId), str(project.projectId), str(run_id),
             str(attempt_id), str(work.workspaceId), snapshot.commitSha, snapshot.treeSha,
             snapshot.baseRevision, snapshot.contentHash, snapshot.model_dump_json(), now),
        )

    copies = ReviewCopyManager(tmp_path / "reviews", runtime_id, lambda _run: False)
    await copies.open()
    copy = await copies.create(source, snapshot, capabilities())
    context = ReviewContext(
        projectId=project.projectId, taskId=draft.draftId, developmentRunId=run_id,
        snapshotId=snapshot.snapshotId, commitSha=snapshot.commitSha, treeSha=snapshot.treeSha,
        contractRevision=2, goal="Reject invalid input",
        acceptance=[{"id": "AC-01", "statement": "Invalid input raises TypeError"}],
        changedFiles=["math.js"], diffText="", diffTruncated=True,
        unavailable=["plan", "self-check", "project-rules"],
    )
    service = ReviewIssueService(
        storage, HandoffService(storage), configs,
        RunInspectionService(storage, RunService(storage, configs)), copies,
    )
    monkeypatch.setattr(service, "_context", lambda _project, _run: context)
    finding = {
        "anchor": {"path": "math.js", "lineStart": 1, "lineEnd": 1},
        "basis": {"kind": "acceptance", "sourceRef": "AC-01"},
        "reason": "Invalid input is not rejected", "impact": "AC-01 fails",
    }
    raw = {
        "schemaVersion": "1.0", "snapshotId": str(snapshot.snapshotId),
        "taskId": str(draft.draftId), "contractRevision": 2, "profileRevision": 1,
        "outcome": "changes_requested", "blockingIssues": [finding],
        "suggestions": [], "unknowns": [], "summary": "Input validation needs a fix",
    }
    def completion(payload: object, sequence: int = 1) -> RunCompleted:
        return RunCompleted(
            runId=str(copy.ownerReviewRunId), sequence=sequence,
            timestamp=timestamp(), type="run.completed", providerSessionId="fixture-review",
            structuredOutput=payload,
        )

    first_attempt = uuid4()
    first = await service.record(project.projectId, run_id, copy.reviewCopyId,
                                 first_attempt, completion(raw))
    assert first.status == "changes_requested" and len(first.issues) == 1
    assert first.reworkHandoff is not None
    assert first.reworkHandoff.issueIds == [first.issues[0].issueId]
    assert "chat" not in first.reworkHandoff.model_dump_json().lower()
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        storage.session().execute(
            "UPDATE review_reports SET outcome='approved' WHERE review_id=?",
            (str(first.reviewId),),
        )
    assert (await service.record(project.projectId, run_id, copy.reviewCopyId,
                                 first_attempt, completion(raw))).reviewId == first.reviewId
    second = await service.record(project.projectId, run_id, copy.reviewCopyId,
                                  uuid4(), completion(raw, 2))
    assert second.issues[0].issueId == first.issues[0].issueId
    history = service.issue_history(project.projectId, draft.draftId)
    assert len(history) == 2 and history[0].snapshotId == snapshot.snapshotId
    assert history[0].reviewAttemptId != history[1].reviewAttemptId
    assert len(service.list_for_task(project.projectId, draft.draftId)) == 2
    next_run_id, next_attempt_id = uuid4(), uuid4()
    next_work = await developer.create(source, str(next_run_id))
    (Path(next_work.rootPath) / "math.js").write_text(
        "export const add = (a,b) => Number(a) + b;\n"
    )
    next_material = await developer.freeze_snapshot(next_work.workspaceId, str(next_run_id))
    next_snapshot = CodeSnapshot.model_validate_json(json.dumps({
        **next_material.model_dump(mode="json"), "schemaVersion": "1.0",
        "projectId": str(project.projectId), "attemptId": str(next_attempt_id),
    }))
    with storage.transaction() as db:
        db.execute(
            "INSERT INTO run_config_snapshots(run_id,project_id,task_id,request_hash,"
            "snapshot_hash,snapshot_json,created_at) VALUES(?,?,?,?,?,'{}',?)",
            (str(next_run_id), str(project.projectId), str(draft.draftId),
             "c" * 64, "d" * 64, now),
        )
        db.execute(
            "INSERT INTO runs(run_id,project_id,task_id,config_hash,state,revision,"
            "created_at,deadline_at,finished_at) VALUES(?,?,?,?,?,1,?,?,?)",
            (str(next_run_id), str(project.projectId), str(draft.draftId),
             "d" * 64, "succeeded", now, now, now),
        )
        db.execute(
            "INSERT INTO run_attempts(attempt_id,run_id,node_id,attempt_no,workspace_id,"
            "workspace_lease_id,lease_epoch,base_revision,executor_id,state,intent_at) "
            "VALUES(?,?,'develop',1,?,?,1,?,'fixture.executor','succeeded',?)",
            (str(next_attempt_id), str(next_run_id), str(next_work.workspaceId),
             str(uuid4()), next_work.baseRevision, now),
        )
        db.execute(
            "INSERT INTO code_snapshots(snapshot_id,project_id,run_id,attempt_id,"
            "workspace_id,commit_sha,tree_sha,base_sha,content_hash,snapshot_json,"
            "created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (str(next_snapshot.snapshotId), str(project.projectId), str(next_run_id),
             str(next_attempt_id), str(next_work.workspaceId), next_snapshot.commitSha,
             next_snapshot.treeSha, next_snapshot.baseRevision, next_snapshot.contentHash,
             next_snapshot.model_dump_json(), now),
        )
    next_copy = await copies.create(source, next_snapshot, capabilities())
    next_context = context.model_copy(update={
        "developmentRunId": next_run_id, "snapshotId": next_snapshot.snapshotId,
        "commitSha": next_snapshot.commitSha, "treeSha": next_snapshot.treeSha,
    })
    monkeypatch.setattr(service, "_context", lambda _project, run: (
        next_context if run == next_run_id else context
    ))
    next_raw = {**raw, "snapshotId": str(next_snapshot.snapshotId)}
    third = await service.record(
        project.projectId, next_run_id, next_copy.reviewCopyId, uuid4(),
        RunCompleted(runId=str(next_copy.ownerReviewRunId), sequence=1,
                     timestamp=timestamp(), type="run.completed",
                     providerSessionId="fixture-review-2", structuredOutput=next_raw),
    )
    assert third.issues[0].issueId == first.issues[0].issueId
    assert len(service.issue_history(project.projectId, draft.draftId)) == 3
    approved_review = await service.record(
        project.projectId, next_run_id, next_copy.reviewCopyId, uuid4(),
        RunCompleted(runId=str(next_copy.ownerReviewRunId), sequence=2,
                     timestamp=timestamp(), type="run.completed",
                     providerSessionId="fixture-review-2",
                     structuredOutput={**next_raw, "outcome": "approved",
                                       "blockingIssues": [], "summary": "No blocker found"}),
    )
    assert approved_review.status == "approved" and approved_review.issues == []
    assert service.get(third.reviewId).issues[0].status == "stale"
    assert len(service.issue_history(project.projectId, draft.draftId)) == 3
    with pytest.raises(ReviewIssueError, match="REVIEW_RESULT_STALE"):
        await service.record(project.projectId, run_id, copy.reviewCopyId,
                             uuid4(), completion(raw))
    with pytest.raises(ReviewIssueError, match="REVIEW_RESULT_STALE"):
        await service.record(project.projectId, run_id, copy.reviewCopyId,
                             uuid4(), completion({**raw, "snapshotId": str(uuid4())}))
    with pytest.raises(ReviewIssueError, match="REVIEW_SOURCE_STALE"):
        await service.record(project.projectId, run_id, copy.reviewCopyId,
                             uuid4(), completion(raw).model_copy(update={"runId": str(uuid4())}))
    storage.close()
    host = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data"),
             "FORGE_HOST_OWNERSHIP_TOKEN": "review-fixture-owner"},
    )
    assert host.stdin and host.stdout

    async def call(method: str, params: dict[str, object]) -> dict[str, object]:
        host.stdin.write(encode_frame({
            "jsonrpc": "2.0", "id": method, "method": method, "params": params,
            "transportVersion": "forge-local-jsonrpc/v1",
        }))
        await host.stdin.drain()
        return json.loads(await asyncio.wait_for(host.stdout.readline(), 5))

    try:
        hello = await call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": "forge-host-protocol/v5",
            "ownershipToken": "review-fixture-owner",
        })
        assert "result" in hello
        query = {"projectId": str(project.projectId), "taskId": str(draft.draftId)}
        reports = await call("run.reviewReports", query)
        assert len(reports["result"]["data"]) == 4
        assert reports["result"]["data"][0]["status"] == "approved"
        assert reports["result"]["data"][1]["issues"][0]["issueId"] == str(
            first.issues[0].issueId)
        history_result = await call("run.issueHistory", query)
        assert len(history_result["result"]["data"]) == 3
        assert (await call("run.reviewReports", {"projectId": str(project.projectId),
                                                  "taskId": "invalid"}))["error"]["code"] == (
            "INVALID_REQUEST"
        )
        await call("system.shutdown", {})
        assert await asyncio.wait_for(host.wait(), 5) == 0
    finally:
        if host.returncode is None:
            host.kill()
            await host.wait()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    restarted = ReviewIssueService(
        reopened, HandoffService(reopened), configs,
        RunInspectionService(reopened, RunService(reopened, configs)), copies,
    )
    assert restarted.get(first.reviewId).issues[0].issueId == second.issues[0].issueId
    assert git(source, "rev-parse", "HEAD") == source_head
    assert git(source, "status", "--porcelain") == ""
    await copies.release(copy.reviewCopyId)
    await copies.release(next_copy.reviewCopyId)
    reopened.close()
