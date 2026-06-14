"""Snapshot-pinned review copies with an enforced read-only executor gate.

This is a Host-internal boundary. P3-02 may schedule a Reviewer through it;
there is deliberately no Renderer command or general filesystem endpoint.
"""

from __future__ import annotations

import asyncio
import os
import re
from collections.abc import Callable
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.executor_contracts import ExecutorCapabilities, ScheduledExecutorRequest
from forge.handoffs import CodeSnapshot
from forge.workspaces import WorkspaceError, WorkspaceManager

_SHA = re.compile(r"^[0-9a-f]{40,64}$")


class ReviewCopyError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReviewCopy(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reviewCopyId: UUID
    workspaceId: UUID
    projectId: UUID
    developmentRunId: UUID
    ownerReviewRunId: UUID
    snapshotId: UUID
    commitSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    treeSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    rootPath: str
    runtimeId: UUID
    ownershipId: UUID
    status: Literal["ready", "released", "failed"]


async def _git(source: Path, *args: str) -> str:
    try:
        child = await asyncio.create_subprocess_exec(
            "git", "-c", "core.fsmonitor=false", "-C", str(source), *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        output, _ = await asyncio.wait_for(child.communicate(), timeout=20)
        if child.returncode != 0 or len(output) > 1_048_576:
            raise ReviewCopyError("REVIEW_SNAPSHOT_INVALID")
        return output.decode("utf-8", errors="strict").strip()
    except (OSError, UnicodeError, TimeoutError) as error:
        if "child" in locals() and child.returncode is None:
            child.kill()
            await child.wait()
        raise ReviewCopyError("REVIEW_SNAPSHOT_INVALID") from error


class ReviewCopyManager:
    def __init__(
        self, managed_root: Path, runtime_id: UUID,
        is_run_active: Callable[[str], bool],
    ) -> None:
        self.workspaces = WorkspaceManager(managed_root / "workspaces", runtime_id,
                                           is_run_active)
        self.runtime_id = runtime_id
        self.is_run_active = is_run_active
        self.records_dir = managed_root / "review-records"
        self.records: dict[UUID, ReviewCopy] = {}

    async def open(self) -> list[ReviewCopy]:
        await self.workspaces.open()
        self.records_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        if self.records_dir.is_symlink() or not self.records_dir.is_dir():
            raise ReviewCopyError("REVIEW_ROOT_INVALID")
        self.records_dir = self.records_dir.resolve(strict=True)
        orphans: list[ReviewCopy] = []
        for path in self.records_dir.glob("*.json"):
            try:
                if path.is_symlink():
                    continue
                record = ReviewCopy.model_validate_json(path.read_text())
                if (path.name == f"{record.reviewCopyId}.json"
                        and record.runtimeId != self.runtime_id
                        and record.status != "released"):
                    orphans.append(record)
            except (OSError, ValueError):
                continue
        return orphans

    def _save(self, record: ReviewCopy) -> None:
        target = self.records_dir / f"{record.reviewCopyId}.json"
        temporary = self.records_dir / f"{record.reviewCopyId}.{uuid4()}.tmp"
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            stream.write(record.model_dump_json())
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)

    def _owned(self, copy_id: UUID) -> ReviewCopy:
        record = self.records.get(copy_id)
        if record is None or record.runtimeId != self.runtime_id:
            raise ReviewCopyError("REVIEW_COPY_NOT_OWNED")
        workspace = self.workspaces.inspect(record.workspaceId)
        if (workspace.rootPath != record.rootPath
                or workspace.ownerRunId != str(record.ownerReviewRunId)
                or workspace.mode != "detached-worktree"):
            raise ReviewCopyError("REVIEW_COPY_NOT_OWNED")
        return record

    async def create(
        self, source_repo: Path, snapshot: CodeSnapshot,
        capabilities: ExecutorCapabilities,
    ) -> ReviewCopy:
        if (not capabilities.available or not capabilities.readOnlyEnforced
                or capabilities.enforcement != "native-sandbox"):
            raise ReviewCopyError("REVIEW_READ_ONLY_UNAVAILABLE")
        if not _SHA.fullmatch(snapshot.commitSha) or not _SHA.fullmatch(snapshot.treeSha):
            raise ReviewCopyError("REVIEW_SNAPSHOT_INVALID")
        try:
            source = source_repo.resolve(strict=True)
            if not source.is_dir():
                raise ReviewCopyError("REVIEW_SOURCE_INVALID")
            ref = f"refs/forge/snapshots/{snapshot.snapshotId}^{{commit}}"
            commit = await _git(source, "rev-parse", "--verify", ref)
            tree = await _git(source, "rev-parse", "--verify",
                              f"{commit}^{{tree}}")
            if commit != snapshot.commitSha or tree != snapshot.treeSha:
                raise ReviewCopyError("REVIEW_SNAPSHOT_INVALID")
        except OSError as error:
            raise ReviewCopyError("REVIEW_SOURCE_INVALID") from error
        review_run_id = uuid4()
        try:
            workspace = await self.workspaces.create(
                source, str(review_run_id), snapshot.commitSha,
                mode="detached-worktree",
            )
        except WorkspaceError as error:
            raise ReviewCopyError(error.code) from error
        record = ReviewCopy(
            reviewCopyId=uuid4(), workspaceId=workspace.workspaceId,
            projectId=snapshot.projectId, developmentRunId=snapshot.runId,
            ownerReviewRunId=review_run_id, snapshotId=snapshot.snapshotId,
            commitSha=snapshot.commitSha, treeSha=snapshot.treeSha,
            rootPath=workspace.rootPath, runtimeId=self.runtime_id,
            ownershipId=workspace.ownershipId, status="ready",
        )
        self.records[record.reviewCopyId] = record
        self._save(record)
        await self.verify(record.reviewCopyId)
        return record.model_copy(deep=True)

    async def verify(self, copy_id: UUID) -> ReviewCopy:
        record = self._owned(copy_id)
        if record.status != "ready" or self.is_run_active(str(record.ownerReviewRunId)):
            raise ReviewCopyError("REVIEW_COPY_BUSY")
        root = Path(record.rootPath)
        try:
            await self.workspaces.verify_identity(record.workspaceId)
            head = await _git(root, "rev-parse", "--verify", "HEAD")
            tree = await _git(root, "rev-parse", "--verify", "HEAD^{tree}")
            dirty = await _git(root, "status", "--porcelain", "--untracked-files=all")
        except WorkspaceError as error:
            raise ReviewCopyError(error.code) from error
        if head != record.commitSha or tree != record.treeSha or dirty:
            raise ReviewCopyError("REVIEW_COPY_MODIFIED")
        return record.model_copy(deep=True)

    async def assert_request(
        self, copy_id: UUID, request: ScheduledExecutorRequest,
    ) -> None:
        record = await self.verify(copy_id)
        if (request.runId != str(record.ownerReviewRunId)
                or request.workspace != record.rootPath
                or request.permission != "read-only" or request.approval != "never"):
            raise ReviewCopyError("REVIEW_PERMISSION_INVALID")

    async def release(self, copy_id: UUID) -> ReviewCopy:
        record = self._owned(copy_id)
        if record.status == "released":
            return record.model_copy(deep=True)
        await self.verify(copy_id)
        try:
            await self.workspaces.dispose(record.workspaceId)
        except WorkspaceError as error:
            raise ReviewCopyError(error.code) from error
        released = record.model_copy(update={"status": "released"})
        self.records[copy_id] = released
        self._save(released)
        return released.model_copy(deep=True)
