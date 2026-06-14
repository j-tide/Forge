"""P3-01 real Git review copy ownership, snapshot pinning and permission gate."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

from forge.executor_contracts import (
    AttemptRequest,
    ExecutorCapabilities,
    ScheduledExecutorRequest,
)
from forge.handoffs import CodeSnapshot
from forge.review_copies import ReviewCopyError, ReviewCopyManager
from forge.workspaces import WorkspaceManager


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], check=True, capture_output=True,
        text=True, timeout=20,
    ).stdout.strip()


def capabilities(*, read_only: bool = True) -> ExecutorCapabilities:
    return ExecutorCapabilities(
        executorId="executor.codex", adapterVersion="test", upstreamVersion="test",
        platform="darwin-arm64", available=True, streaming=True, resume=True,
        interrupt=True, approval=True, structuredEvents=True, structuredOutput=True,
        workspaceControl=True, toolEvents=False, sessionPersistence=True,
        modelSelection=True, usageReporting=True, readOnlyEnforced=read_only,
        networkPolicyEnforced=False,
        enforcement="native-sandbox" if read_only else "unavailable",
        modelIds=["fixture-model"], authModes=["fixture"], warnings=[],
    )


def request(record: object, *, permission: str = "read-only") -> ScheduledExecutorRequest:
    assert hasattr(record, "ownerReviewRunId") and hasattr(record, "rootPath")
    return ScheduledExecutorRequest.model_validate({
        "runId": str(record.ownerReviewRunId), "taskId": str(uuid4()),
        "workspace": record.rootPath, "goal": "Review the snapshot",
        "context": [], "permission": permission, "approval": "never",
        "model": "fixture-model", "maxDurationMs": 30_000,
        "attempt": AttemptRequest(
            attemptId=str(uuid4()), leaseEpoch=1, contractRevision=1,
            workspaceLeaseId=str(uuid4()), contextBundleId=str(uuid4()),
            profileRevision=1, outputSchemaId="plain-text-v1",
        ).model_dump(),
    })


@pytest.mark.asyncio
async def test_review_copy_is_pinned_to_snapshot_and_blocks_mutation(
    tmp_path: Path,
) -> None:
    source = tmp_path / "Forge 审查 项目 with spaces"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "hello.txt").write_text("base\n")
    git(source, "add", ".")
    git(source, "commit", "-m", "base")
    source_head = git(source, "rev-parse", "HEAD")
    runtime_id = uuid4()
    developer = WorkspaceManager(tmp_path / "development", runtime_id,
                                 lambda _run: False)
    await developer.open()
    development_run_id = uuid4()
    work = await developer.create(source, str(development_run_id))
    (Path(work.rootPath) / "hello.txt").write_text("changed for review\n")
    (Path(work.rootPath) / "新增.txt").write_text("new evidence\n")
    material = await developer.freeze_snapshot(work.workspaceId,
                                               str(development_run_id))
    snapshot = CodeSnapshot.model_validate_json(json.dumps({
        **material.model_dump(mode="json"), "schemaVersion": "1.0",
        "projectId": str(uuid4()), "attemptId": str(uuid4()),
    }))
    (source / "branch-forward.txt").write_text("later main change\n")
    git(source, "add", ".")
    git(source, "commit", "-m", "advance main independently")
    assert git(source, "rev-parse", "HEAD") != source_head
    source_head = git(source, "rev-parse", "HEAD")
    active: set[str] = set()
    manager = ReviewCopyManager(tmp_path / "Forge review copies", runtime_id,
                                active.__contains__)
    assert await manager.open() == []

    with pytest.raises(ReviewCopyError, match="REVIEW_READ_ONLY_UNAVAILABLE"):
        await manager.create(source, snapshot, capabilities(read_only=False))
    with pytest.raises(ReviewCopyError, match="REVIEW_READ_ONLY_UNAVAILABLE"):
        await manager.create(source, snapshot, capabilities().model_copy(update={
            "enforcement": "trusted-local",
        }))
    with pytest.raises(ReviewCopyError, match="REVIEW_SNAPSHOT_INVALID"):
        await manager.create(source, snapshot.model_copy(update={"commitSha": "0" * 40}),
                             capabilities())

    copy = await manager.create(source, snapshot, capabilities())
    root = Path(copy.rootPath)
    assert root != Path(work.rootPath) and root != source
    assert git(root, "rev-parse", "HEAD") == snapshot.commitSha
    assert git(root, "branch", "--show-current") == ""
    assert git(root, "status", "--porcelain") == ""
    assert (root / "hello.txt").read_text() == "changed for review\n"
    assert (root / "新增.txt").read_text() == "new evidence\n"
    assert not (root / "branch-forward.txt").exists()
    assert (source / "hello.txt").read_text() == "base\n"
    assert git(source, "rev-parse", "HEAD") == source_head
    assert git(source, "status", "--porcelain") == ""

    await manager.assert_request(copy.reviewCopyId, request(copy))
    with pytest.raises(ReviewCopyError, match="REVIEW_PERMISSION_INVALID"):
        await manager.assert_request(copy.reviewCopyId,
                                     request(copy, permission="workspace-write"))
    with pytest.raises(ReviewCopyError, match="REVIEW_PERMISSION_INVALID"):
        await manager.assert_request(copy.reviewCopyId,
                                     request(copy).model_copy(update={"workspace": str(source)}))
    active.add(str(copy.ownerReviewRunId))
    with pytest.raises(ReviewCopyError, match="REVIEW_COPY_BUSY"):
        await manager.release(copy.reviewCopyId)
    active.clear()

    (root / "hello.txt").write_text("unauthorized edit\n")
    with pytest.raises(ReviewCopyError, match="REVIEW_COPY_MODIFIED"):
        await manager.verify(copy.reviewCopyId)
    with pytest.raises(ReviewCopyError, match="REVIEW_COPY_MODIFIED"):
        await manager.release(copy.reviewCopyId)
    (root / "hello.txt").write_text("changed for review\n")
    second_runtime = ReviewCopyManager(tmp_path / "Forge review copies", uuid4(),
                                       lambda _run: False)
    assert [item.reviewCopyId for item in await second_runtime.open()] == [
        copy.reviewCopyId,
    ]
    with pytest.raises(ReviewCopyError, match="REVIEW_COPY_NOT_OWNED"):
        await second_runtime.release(copy.reviewCopyId)

    moved = root.with_name("held-review-copy")
    os.rename(root, moved)
    root.symlink_to(source, target_is_directory=True)
    try:
        with pytest.raises(ReviewCopyError, match="WORKSPACE_PATH_ESCAPE"):
            await manager.verify(copy.reviewCopyId)
        assert (source / "hello.txt").read_text() == "base\n"
    finally:
        root.unlink()
        os.rename(moved, root)
    assert (await manager.release(copy.reviewCopyId)).status == "released"
    assert (await manager.release(copy.reviewCopyId)).status == "released"
    assert not root.exists()
    assert git(source, "status", "--porcelain") == ""
