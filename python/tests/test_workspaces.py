"""Real Git worktree isolation, identity and lease checks on disposable repositories."""

import asyncio
import os
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

from forge.snapshots import SnapshotError
from forge.workspaces import WorkspaceError, WorkspaceManager


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(cwd), *args], capture_output=True, text=True,
        check=True, timeout=15,
    )
    return result.stdout.strip()


def repository(root: Path) -> Path:
    source = root / "Forge 测试项目 01 with spaces"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "hello.txt").write_text("source", encoding="utf-8")
    git(source, "add", "hello.txt")
    git(source, "commit", "-m", "base")
    return source


@pytest.mark.asyncio
async def test_git_workspace_isolated_lease_and_safe_release(tmp_path: Path) -> None:
    source = repository(tmp_path)
    head = git(source, "rev-parse", "HEAD")
    original_status = git(source, "status", "--porcelain")
    active: set[str] = set()
    runtime_id = uuid4()
    manager = WorkspaceManager(tmp_path / "Forge data", runtime_id, active.__contains__)
    assert await manager.open() == []
    workspace = await manager.create(source, "run-01", head)
    tree = Path(workspace.rootPath)
    assert workspace.mode == "task-branch"
    assert workspace.baseRevision == head
    assert workspace.branch == f"forge/run/{workspace.workspaceId}"
    assert git(tree, "rev-parse", "HEAD") == head
    assert git(source, "rev-parse", "HEAD") == head
    assert git(source, "status", "--porcelain") == original_status

    first, second = await asyncio.gather(
        manager.acquire(workspace.workspaceId, "run-01"),
        manager.acquire(workspace.workspaceId, "run-01"),
        return_exceptions=True,
    )
    results = [first, second]
    lease = next(value for value in results if not isinstance(value, BaseException))
    assert any(isinstance(value, WorkspaceError) for value in results)
    assert lease.activeLeaseId is not None and lease.leaseEpoch == 1
    active.add("run-01")
    with pytest.raises(WorkspaceError, match="WORKSPACE_LEASE_STALE"):
        await manager.release_lease(workspace.workspaceId, lease.activeLeaseId, "run-01")
    active.clear()
    ready = await manager.release_lease(workspace.workspaceId, lease.activeLeaseId, "run-01")
    assert ready.status == "ready" and ready.activeLeaseId is None
    with pytest.raises(WorkspaceError, match="WORKSPACE_LEASE_STALE"):
        await manager.release_lease(workspace.workspaceId, lease.activeLeaseId, "run-01")

    (tree / "changed.txt").write_text("agent output", encoding="utf-8")
    assert not (source / "changed.txt").exists()
    with pytest.raises(WorkspaceError, match="WORKSPACE_DIRTY"):
        await manager.dispose(workspace.workspaceId)
    (tree / "changed.txt").unlink()
    released = await manager.dispose(workspace.workspaceId)
    assert released.status == "released"
    assert (await manager.dispose(workspace.workspaceId)).status == "released"
    assert not tree.exists()
    assert git(source, "status", "--porcelain") == original_status
    assert str(tree) not in git(source, "worktree", "list", "--porcelain")


@pytest.mark.asyncio
async def test_orphan_is_reported_and_symlink_escape_is_rejected(tmp_path: Path) -> None:
    source = repository(tmp_path)
    manager = WorkspaceManager(tmp_path / "managed", uuid4(), lambda _run: False)
    await manager.open()
    record = await manager.create(source, "run-02")
    second = WorkspaceManager(tmp_path / "managed", uuid4(), lambda _run: False)
    orphans = await second.open()
    assert [item.workspaceId for item in orphans] == [record.workspaceId]
    assert Path(record.rootPath).is_dir()  # a restart never auto-deletes a prior workspace
    with pytest.raises(WorkspaceError, match="WORKSPACE_NOT_OWNED"):
        second.inspect(record.workspaceId)

    target = Path(record.rootPath)
    held = target.with_name("held-owned-worktree")
    os.rename(target, held)
    target.symlink_to(source, target_is_directory=True)
    try:
        with pytest.raises(WorkspaceError, match="WORKSPACE_PATH_ESCAPE"):
            await manager.dispose(record.workspaceId)
        assert source.is_dir() and (source / "hello.txt").read_text() == "source"
    finally:
        target.unlink()
        os.rename(held, target)
    assert (await manager.dispose(record.workspaceId)).status == "released"


@pytest.mark.asyncio
async def test_stopped_workspace_freezes_real_git_snapshot_and_blocks_secrets(
    tmp_path: Path,
) -> None:
    source = repository(tmp_path)
    baseline = git(source, "status", "--porcelain")
    manager = WorkspaceManager(tmp_path / "snapshots", uuid4(), lambda _run: False)
    await manager.open()
    record = await manager.create(source, "run-snapshot")
    tree = Path(record.rootPath)
    with pytest.raises(SnapshotError, match="SNAPSHOT_NO_CHANGE_EXPLANATION_REQUIRED"):
        await manager.freeze_snapshot(record.workspaceId, "run-snapshot")
    (tree / ".env").write_text("PRIVATE=abc")
    with pytest.raises(SnapshotError, match="SNAPSHOT_SECRET_BLOCKED"):
        await manager.freeze_snapshot(record.workspaceId, "run-snapshot")
    (tree / ".env").unlink()
    (tree / "hello.txt").write_text("changed in isolated worktree", encoding="utf-8")
    (tree / "新增 test.txt").write_text("new test", encoding="utf-8")
    material = await manager.freeze_snapshot(record.workspaceId, "run-snapshot")
    assert {item.kind for item in material.files} == {"added", "modified"}
    assert git(source, "show", f"{material.commitSha}:hello.txt") == "changed in isolated worktree"
    assert git(source, "show", f"{material.commitSha}:新增 test.txt") == "new test"
    assert git(source, "rev-parse", f"{material.commitSha}^{{tree}}") == material.treeSha
    await manager.verify_snapshot_ref(
        record.workspaceId, material.snapshotId, material.commitSha, material.treeSha
    )
    assert git(source, "status", "--porcelain") == baseline
    assert (source / "hello.txt").read_text() == "source"
    with pytest.raises(WorkspaceError, match="WORKSPACE_DIRTY"):
        await manager.dispose(record.workspaceId)
