"""Host-owned Git worktrees with durable ownership and a single writer lease."""

from __future__ import annotations

import asyncio
import os
import re
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from forge.snapshots import SnapshotMaterial

SHA = re.compile(r"^[0-9a-f]{40,64}$")
RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SNAPSHOT_EXCLUSIONS = (".git", "node_modules", ".env", ".env.*")


class WorkspaceError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class WorkspaceDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workspaceId: UUID
    rootPath: str = Field(min_length=1)
    sourceRepo: str = Field(min_length=1)
    sourceRepoIdentity: str = Field(min_length=1)
    baseRevision: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    baseTree: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    branch: str | None
    leaseEpoch: int = Field(ge=0)
    activeLeaseId: UUID | None
    snapshotExclusions: list[str]
    mode: Literal["detached-worktree", "task-branch"]
    createdAt: str
    ownerRunId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    runtimeId: UUID
    ownershipId: UUID
    status: Literal["creating", "ready", "busy", "releasing", "released", "failed"]


def _timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def _git(cwd: Path, hooks: Path, *args: str) -> str:
    try:
        child = await asyncio.create_subprocess_exec(
            "git", "-c", f"core.hooksPath={hooks}", "-C", str(cwd), *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(child.communicate(), timeout=20)
        if child.returncode != 0 or len(stdout) > 1024 * 1024:
            raise WorkspaceError("WORKSPACE_GIT_FAILED")
        return stdout.decode("utf-8", errors="strict").strip()
    except (OSError, UnicodeError, TimeoutError) as error:
        if "child" in locals() and child.returncode is None:
            child.kill()
            await child.wait()
        raise WorkspaceError("WORKSPACE_GIT_FAILED") from error


class WorkspaceManager:
    def __init__(
        self, managed_root: Path, runtime_id: UUID,
        is_run_active: Callable[[str], bool],
    ) -> None:
        if not managed_root.is_absolute():
            raise WorkspaceError("WORKSPACE_ROOT_INVALID")
        self.managed_root = managed_root
        self.runtime_id = runtime_id
        self.is_run_active = is_run_active
        self.root: Path | None = None
        self.trees: Path | None = None
        self.records_dir: Path | None = None
        self.hooks: Path | None = None
        self.records: dict[UUID, WorkspaceDescriptor] = {}
        self.lock = asyncio.Lock()
        self.accepting = True

    async def open(self) -> list[WorkspaceDescriptor]:
        self.managed_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.managed_root.is_symlink() or not self.managed_root.is_dir():
            raise WorkspaceError("WORKSPACE_ROOT_INVALID")
        root = self.managed_root.resolve(strict=True)
        directories = [root / name for name in ("trees", "records", "empty-hooks")]
        for path in directories:
            path.mkdir(mode=0o700, exist_ok=True)
            if path.is_symlink() or not path.is_dir() or path.resolve(strict=True) != path:
                raise WorkspaceError("WORKSPACE_ROOT_INVALID")
        self.root, self.trees, self.records_dir, self.hooks = root, *directories
        # Historical records are evidence, never automatically assumed to be owned
        # by the new runtime or removed on startup.
        orphans: list[WorkspaceDescriptor] = []
        for path in self.records_dir.glob("*.json"):
            try:
                if path.is_symlink():
                    continue
                record = WorkspaceDescriptor.model_validate_json(path.read_text())
                if path.name != f"{record.workspaceId}.json":
                    continue
                if record.runtimeId != self.runtime_id and record.status != "released":
                    orphans.append(record)
            except (OSError, ValueError):
                continue
        return orphans

    def _paths(self) -> tuple[Path, Path, Path]:
        if self.trees is None or self.records_dir is None or self.hooks is None:
            raise WorkspaceError("WORKSPACE_NOT_OPEN")
        return self.trees, self.records_dir, self.hooks

    def _owned(self, workspace_id: UUID) -> WorkspaceDescriptor:
        trees, _, _ = self._paths()
        record = self.records.get(workspace_id)
        if (
            record is None or record.runtimeId != self.runtime_id
            or record.rootPath != str(trees / str(workspace_id))
        ):
            raise WorkspaceError("WORKSPACE_NOT_OWNED")
        return record

    def _save(self, record: WorkspaceDescriptor) -> None:
        _, records_dir, _ = self._paths()
        target = records_dir / f"{record.workspaceId}.json"
        temporary = records_dir / f"{record.workspaceId}.{uuid4()}.tmp"
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            stream.write(record.model_dump_json())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)

    async def _assert_tree(self, record: WorkspaceDescriptor) -> None:
        trees, _, hooks = self._paths()
        path = Path(record.rootPath)
        if path.parent != trees or path.name != str(record.workspaceId):
            raise WorkspaceError("WORKSPACE_PATH_ESCAPE")
        if path.is_symlink() or not path.is_dir() or path.resolve(strict=True) != path:
            raise WorkspaceError("WORKSPACE_PATH_ESCAPE")
        top = Path(await _git(path, hooks, "rev-parse", "--show-toplevel")).resolve(strict=True)
        common = (path / await _git(path, hooks, "rev-parse", "--git-common-dir")).resolve(
            strict=True
        )
        if top != path or str(common) != record.sourceRepoIdentity:
            raise WorkspaceError("WORKSPACE_IDENTITY_MISMATCH")
        if record.branch and await _git(path, hooks, "branch", "--show-current") != record.branch:
            raise WorkspaceError("WORKSPACE_IDENTITY_MISMATCH")
        listed = await _git(Path(record.sourceRepo), hooks, "worktree", "list", "--porcelain", "-z")
        if f"worktree {path}" not in listed.split("\0"):
            raise WorkspaceError("WORKSPACE_IDENTITY_MISMATCH")

    async def create(
        self, source_repo: Path, run_id: str, base_revision: str | None = None,
        mode: Literal["detached-worktree", "task-branch"] = "task-branch",
    ) -> WorkspaceDescriptor:
        trees, _, hooks = self._paths()
        if not self.accepting or not RUN_ID.fullmatch(run_id):
            raise WorkspaceError("WORKSPACE_INVALID_RUN")
        if base_revision is not None and not SHA.fullmatch(base_revision):
            raise WorkspaceError("WORKSPACE_INVALID_BASE")
        try:
            source = source_repo.resolve(strict=True)
            top = Path(await _git(source, hooks, "rev-parse", "--show-toplevel")).resolve(
                strict=True
            )
            if source != top:
                raise WorkspaceError("WORKSPACE_SOURCE_INVALID")
            common = (source / await _git(source, hooks, "rev-parse", "--git-common-dir")).resolve(
                strict=True
            )
            revision = await _git(
                source, hooks, "rev-parse", "--verify", f"{base_revision or 'HEAD'}^{{commit}}"
            )
            tree = await _git(source, hooks, "rev-parse", "--verify", f"{revision}^{{tree}}")
        except (OSError, ValueError) as error:
            raise WorkspaceError("WORKSPACE_SOURCE_INVALID") from error
        if not SHA.fullmatch(revision) or not SHA.fullmatch(tree):
            raise WorkspaceError("WORKSPACE_INVALID_BASE")
        workspace_id = uuid4()
        target = trees / str(workspace_id)
        if target.exists() or target.is_symlink():
            raise WorkspaceError("WORKSPACE_ALREADY_EXISTS")
        branch = f"forge/run/{workspace_id}" if mode == "task-branch" else None
        record = WorkspaceDescriptor(
            workspaceId=workspace_id, rootPath=str(target), sourceRepo=str(source),
            sourceRepoIdentity=str(common), baseRevision=revision, baseTree=tree,
            branch=branch, leaseEpoch=0, activeLeaseId=None,
            snapshotExclusions=list(SNAPSHOT_EXCLUSIONS), mode=mode,
            createdAt=_timestamp(), ownerRunId=run_id, runtimeId=self.runtime_id,
            ownershipId=uuid4(), status="creating",
        )
        self.records[workspace_id] = record
        self._save(record)
        try:
            await _git(
                source, hooks, "worktree", "add",
                *(("-b", branch) if branch else ("--detach",)), str(target), revision,
            )
            await self._assert_tree(record)
            record = record.model_copy(update={"status": "ready"})
            self.records[workspace_id] = record
            self._save(record)
            return record
        except Exception as error:
            failed = record.model_copy(update={"status": "failed"})
            self.records[workspace_id] = failed
            self._save(failed)
            raise WorkspaceError("WORKSPACE_CREATE_FAILED") from error

    def inspect(self, workspace_id: UUID) -> WorkspaceDescriptor:
        return self._owned(workspace_id).model_copy(deep=True)

    async def verify_identity(self, workspace_id: UUID) -> WorkspaceDescriptor:
        record = self._owned(workspace_id)
        await self._assert_tree(record)
        return record.model_copy(deep=True)

    async def acquire(self, workspace_id: UUID, run_id: str) -> WorkspaceDescriptor:
        async with self.lock:
            record = self._owned(workspace_id)
            if (
                not self.accepting or record.ownerRunId != run_id or record.status != "ready"
                or self.is_run_active(run_id)
            ):
                raise WorkspaceError("WORKSPACE_LEASE_UNAVAILABLE")
            await self._assert_tree(record)
            acquired = record.model_copy(update={
                "status": "busy", "leaseEpoch": record.leaseEpoch + 1,
                "activeLeaseId": uuid4(),
            })
            self.records[workspace_id] = acquired
            self._save(acquired)
            return acquired.model_copy(deep=True)

    async def release_lease(
        self, workspace_id: UUID, lease_id: UUID, run_id: str
    ) -> WorkspaceDescriptor:
        async with self.lock:
            record = self._owned(workspace_id)
            if (
                record.status != "busy" or record.activeLeaseId != lease_id
                or record.ownerRunId != run_id or self.is_run_active(run_id)
            ):
                raise WorkspaceError("WORKSPACE_LEASE_STALE")
            await self._assert_tree(record)
            ready = record.model_copy(update={"status": "ready", "activeLeaseId": None})
            self.records[workspace_id] = ready
            self._save(ready)
            return ready.model_copy(deep=True)

    async def quarantine(self, workspace_id: UUID) -> WorkspaceDescriptor:
        async with self.lock:
            record = self._owned(workspace_id)
            if record.status == "released":
                raise WorkspaceError("WORKSPACE_RELEASED")
            failed = record.model_copy(update={"status": "failed"})
            self.records[workspace_id] = failed
            self._save(failed)
            return failed.model_copy(deep=True)

    async def freeze_snapshot(
        self, workspace_id: UUID, run_id: str,
        no_change_explanation: str | None = None,
    ) -> SnapshotMaterial:
        from forge.snapshots import materialize_snapshot

        async with self.lock:
            record = self._owned(workspace_id)
            if (
                not self.accepting or record.ownerRunId != run_id
                or record.status != "ready" or record.activeLeaseId
                or self.is_run_active(run_id)
            ):
                raise WorkspaceError("WORKSPACE_SNAPSHOT_UNAVAILABLE")
            await self._assert_tree(record)
            _, records_dir, hooks = self._paths()
            return await materialize_snapshot(
                record, records_dir / f"{uuid4()}.index", hooks,
                no_change_explanation,
            )

    async def verify_snapshot_ref(
        self, workspace_id: UUID, snapshot_id: UUID,
        commit_sha: str, tree_sha: str,
    ) -> None:
        record = self._owned(workspace_id)
        if not SHA.fullmatch(commit_sha) or not SHA.fullmatch(tree_sha):
            raise WorkspaceError("WORKSPACE_SNAPSHOT_INVALID")
        _, _, hooks = self._paths()
        ref = f"refs/forge/snapshots/{snapshot_id}"
        commit = await _git(
            Path(record.sourceRepo), hooks, "rev-parse", "--verify", f"{ref}^{{commit}}"
        )
        tree = await _git(
            Path(record.sourceRepo), hooks, "rev-parse", "--verify", f"{commit_sha}^{{tree}}"
        )
        if commit != commit_sha or tree != tree_sha:
            raise WorkspaceError("WORKSPACE_SNAPSHOT_INVALID")

    async def dispose(self, workspace_id: UUID) -> WorkspaceDescriptor:
        async with self.lock:
            record = self._owned(workspace_id)
            if record.status == "released":
                return record.model_copy(deep=True)
            if record.status != "ready" or record.activeLeaseId or self.is_run_active(
                record.ownerRunId
            ):
                raise WorkspaceError("WORKSPACE_STILL_ACTIVE")
            await self._assert_tree(record)
            _, _, hooks = self._paths()
            # Preserve all changed files; a separate explicit retention decision is
            # required before deleting a dirty Forge worktree.
            if await _git(
                Path(record.rootPath), hooks, "status", "--porcelain", "--untracked-files=all"
            ):
                raise WorkspaceError("WORKSPACE_DIRTY")
            releasing = record.model_copy(update={"status": "releasing"})
            self.records[workspace_id] = releasing
            self._save(releasing)
            try:
                await _git(Path(record.sourceRepo), hooks, "worktree", "remove", record.rootPath)
            except WorkspaceError:
                failed = record.model_copy(update={"status": "failed"})
                self.records[workspace_id] = failed
                self._save(failed)
                raise
            released = record.model_copy(update={"status": "released"})
            self.records[workspace_id] = released
            self._save(released)
            return released.model_copy(deep=True)

    async def dispose_disposable(
        self, workspace_id: UUID, owner_run_id: str,
    ) -> WorkspaceDescriptor:
        """Remove only this runtime's detached verification copy, including build output."""
        async with self.lock:
            record = self._owned(workspace_id)
            if record.status == "released":
                return record.model_copy(deep=True)
            if (
                record.mode != "detached-worktree" or record.ownerRunId != owner_run_id
                or record.status != "ready" or record.activeLeaseId
                or self.is_run_active(owner_run_id)
            ):
                raise WorkspaceError("WORKSPACE_STILL_ACTIVE")
            await self._assert_tree(record)
            _, _, hooks = self._paths()
            releasing = record.model_copy(update={"status": "releasing"})
            self.records[workspace_id] = releasing
            self._save(releasing)
            try:
                await _git(Path(record.sourceRepo), hooks, "worktree", "remove", "--force",
                           record.rootPath)
            except WorkspaceError:
                failed = record.model_copy(update={"status": "failed"})
                self.records[workspace_id] = failed
                self._save(failed)
                raise
            released = record.model_copy(update={"status": "released"})
            self.records[workspace_id] = released
            self._save(released)
            return released.model_copy(deep=True)

    def stop_accepting(self) -> None:
        self.accepting = False
