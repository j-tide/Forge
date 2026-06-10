"""Immutable Git CodeSnapshot materialization from a stopped, owned worktree."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from forge.conversations import timestamp
from forge.workspaces import WorkspaceDescriptor

SHA = re.compile(r"^[0-9a-f]{40,64}$")
MAX_FILES = 10_000
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 128 * 1024 * 1024
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", re.I),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|"
               r"xox[baprs]-[A-Za-z0-9-]{20,})\b"),
    re.compile(r"\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)"
               r"\s*[:=]\s*[\"']?[A-Za-z0-9_/+.-]{16,}", re.I),
)


class SnapshotError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class SnapshotFile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    path: str = Field(min_length=1, max_length=4096)
    kind: Literal["added", "modified", "deleted"]
    blobSha: Annotated[str, Field(pattern=r"^[0-9a-f]{40,64}$")] | None
    byteSize: int = Field(ge=0)

    @field_validator("path")
    @classmethod
    def safe_file_path(cls, value: str) -> str:
        _safe_path(value)
        return value


class SnapshotMaterial(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    snapshotId: UUID
    workspaceId: UUID
    runId: str
    baseRevision: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    baseTree: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    filteredBaseTree: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    commitSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    treeSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    contentHash: str = Field(pattern=r"^[0-9a-f]{64}$")
    files: list[SnapshotFile] = Field(max_length=MAX_FILES)
    excludedPaths: list[str] = Field(max_length=MAX_FILES)
    noChange: bool
    createdAt: str

    @field_validator("excludedPaths")
    @classmethod
    def safe_excluded_paths(cls, values: list[str]) -> list[str]:
        for value in values:
            _safe_path(value)
        return values


def _safe_path(name: str) -> None:
    if (
        not name or "\0" in name or "\\" in name or name.startswith("/")
        or re.match(r"^[A-Za-z]:", name)
        or any(part in ("", ".", "..") or part.lower() == ".git" for part in name.split("/"))
    ):
        raise SnapshotError("SNAPSHOT_PATH_UNSAFE")


def _excluded(name: str) -> Literal["generated", "sensitive"] | None:
    parts = name.split("/")
    if any(part.lower() in ("node_modules", ".git") for part in parts):
        return "generated"
    last = parts[-1].lower()
    if (
        last == ".env" or last.startswith(".env.")
        or re.search(r"\.(?:pem|p12|pfx|key)$", last)
        or re.match(r"^(?:id_rsa|id_ed25519|credentials(?:\.json)?|"
                    r"secrets?(?:\.json|\.ya?ml)?)$", last)
    ):
        return "sensitive"
    return None


async def _git(
    cwd: Path, hooks: Path, index: Path, args: list[str],
    *, payload: bytes | None = None, use_index: bool = True,
) -> bytes:
    environment = dict(os.environ)
    if use_index:
        environment.update({
            "GIT_INDEX_FILE": str(index), "GIT_AUTHOR_NAME": "Forge",
            "GIT_AUTHOR_EMAIL": "forge@local.invalid", "GIT_COMMITTER_NAME": "Forge",
            "GIT_COMMITTER_EMAIL": "forge@local.invalid",
        })
    try:
        child = await asyncio.create_subprocess_exec(
            "git", "-c", f"core.hooksPath={hooks}", "-c", "core.fsmonitor=false",
            "-C", str(cwd), *args,
            env=environment, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(child.communicate(payload), timeout=20)
        if child.returncode != 0 or len(stdout) > 4 * 1024 * 1024:
            raise SnapshotError("SNAPSHOT_GIT_FAILED")
        return stdout
    except (OSError, TimeoutError) as error:
        if "child" in locals() and child.returncode is None:
            child.kill()
            await child.wait()
        raise SnapshotError("SNAPSHOT_GIT_FAILED") from error


def _read_contained(root: Path, name: str) -> tuple[bytes, str]:
    _safe_path(name)
    current = root
    for part in name.split("/"):
        current = current / part
        if current.is_symlink():
            raise SnapshotError("SNAPSHOT_PATH_UNSAFE")
    try:
        if current.resolve(strict=True) != current or not current.is_file():
            raise SnapshotError("SNAPSHOT_PATH_UNSAFE")
        size = current.stat().st_size
        if size > MAX_FILE_BYTES:
            raise SnapshotError("SNAPSHOT_TOO_LARGE")
        fd = os.open(current, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            detail = os.fstat(fd)
            if detail.st_size != size:
                raise SnapshotError("SNAPSHOT_PATH_UNSAFE")
            data = os.read(fd, size + 1)
            if len(data) != size or b"\0" in data:
                raise SnapshotError("SNAPSHOT_PATH_UNSAFE")
            mode = "100755" if detail.st_mode & 0o111 else "100644"
            return data, mode
        finally:
            os.close(fd)
    except OSError as error:
        raise SnapshotError("SNAPSHOT_PATH_UNSAFE") from error


async def materialize_snapshot(
    workspace: WorkspaceDescriptor, index: Path, hooks: Path,
    no_change_explanation: str | None = None,
) -> SnapshotMaterial:
    root = Path(workspace.rootPath)
    snapshot_id = uuid4()
    try:
        await _git(root, hooks, index, [
            "status", "--porcelain=v1", "-z", "--untracked-files=all"
        ], use_index=False)
        await _git(root, hooks, index, ["read-tree", workspace.baseTree])
        tracked_raw = await _git(root, hooks, index, ["ls-files", "--cached", "-z"])
        observed_raw = await _git(
            root, hooks, index,
            ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        )
        try:
            tracked = [item for item in tracked_raw.decode("utf-8").split("\0") if item]
            observed = [item for item in observed_raw.decode("utf-8").split("\0") if item]
        except UnicodeError as error:
            raise SnapshotError("SNAPSHOT_PATH_UNSAFE") from error
        if len(observed) > MAX_FILES:
            raise SnapshotError("SNAPSHOT_TOO_LARGE")
        excluded_paths: list[str] = []
        for name in tracked:
            _safe_path(name)
            if _excluded(name):
                excluded_paths.append(name)
                await _git(root, hooks, index, ["update-index", "--force-remove", "--", name])
        filtered_base_tree = (await _git(root, hooks, index, ["write-tree"])).decode().strip()
        entries: dict[str, str] = {}
        tree_raw = await _git(root, hooks, index, [
            "ls-tree", "-r", "-z", filtered_base_tree
        ])
        try:
            for line in tree_raw.decode("utf-8").split("\0"):
                if not line:
                    continue
                found = re.fullmatch(r"\d+ blob ([0-9a-f]{40,64})\t(.+)", line, re.S)
                if found is None:
                    raise SnapshotError("SNAPSHOT_PATH_UNSAFE")
                entries[found.group(2)] = found.group(1)
        except UnicodeError as error:
            raise SnapshotError("SNAPSHOT_PATH_UNSAFE") from error
        seen: set[str] = set()
        files: list[SnapshotFile] = []
        scanned = 0
        for name in observed:
            _safe_path(name)
            if name in seen:
                continue
            seen.add(name)
            classification = _excluded(name)
            if classification == "generated":
                excluded_paths.append(name)
                continue
            target = root / name
            if not target.exists() and not target.is_symlink():
                if name in entries:
                    await _git(root, hooks, index, [
                        "update-index", "--force-remove", "--", name
                    ])
                    files.append(SnapshotFile(
                        path=name, kind="deleted", blobSha=None, byteSize=0
                    ))
                continue
            if classification == "sensitive":
                raise SnapshotError("SNAPSHOT_SECRET_BLOCKED")
            data, mode = _read_contained(root, name)
            scanned += len(data)
            if scanned > MAX_TOTAL_BYTES:
                raise SnapshotError("SNAPSHOT_TOO_LARGE")
            try:
                content = data.decode("utf-8", errors="strict")
            except UnicodeError as error:
                raise SnapshotError("SNAPSHOT_PATH_UNSAFE") from error
            if any(pattern.search(content) for pattern in SECRET_PATTERNS):
                raise SnapshotError("SNAPSHOT_SECRET_BLOCKED")
            blob_sha = (await _git(
                root, hooks, index, ["hash-object", "-w", "--stdin"], payload=data
            )).decode().strip()
            if not SHA.fullmatch(blob_sha):
                raise SnapshotError("SNAPSHOT_GIT_FAILED")
            await _git(root, hooks, index, [
                "update-index", "--add", "--cacheinfo", mode, blob_sha, name
            ])
            if entries.get(name) != blob_sha:
                files.append(SnapshotFile(
                    path=name, kind="modified" if name in entries else "added",
                    blobSha=blob_sha, byteSize=len(data),
                ))
        tree_sha = (await _git(root, hooks, index, ["write-tree"])).decode().strip()
        if not SHA.fullmatch(tree_sha) or not SHA.fullmatch(filtered_base_tree):
            raise SnapshotError("SNAPSHOT_GIT_FAILED")
        files.sort(key=lambda item: item.path)
        excluded_paths = sorted(set(excluded_paths))
        no_change = tree_sha == filtered_base_tree
        if no_change and not (no_change_explanation or "").strip():
            raise SnapshotError("SNAPSHOT_NO_CHANGE_EXPLANATION_REQUIRED")
        commit_sha = (await _git(root, hooks, index, [
            "commit-tree", tree_sha, "-p", workspace.baseRevision,
            "-m", f"Forge CodeSnapshot {snapshot_id}",
        ])).decode().strip()
        if not SHA.fullmatch(commit_sha):
            raise SnapshotError("SNAPSHOT_GIT_FAILED")
        await _git(root, hooks, index, [
            "update-ref", f"refs/forge/snapshots/{snapshot_id}", commit_sha,
            "0" * len(commit_sha),
        ])
        body = {
            "workspaceId": str(workspace.workspaceId),
            "baseRevision": workspace.baseRevision, "treeSha": tree_sha,
            "files": [item.model_dump(mode="json") for item in files],
            "excludedPaths": excluded_paths,
        }
        content_hash = hashlib.sha256(json.dumps(
            body, ensure_ascii=False, separators=(",", ":")
        ).encode()).hexdigest()
        return SnapshotMaterial(
            snapshotId=snapshot_id, workspaceId=workspace.workspaceId,
            runId=workspace.ownerRunId, baseRevision=workspace.baseRevision,
            baseTree=workspace.baseTree, filteredBaseTree=filtered_base_tree,
            commitSha=commit_sha, treeSha=tree_sha, contentHash=content_hash,
            files=files, excludedPaths=excluded_paths, noChange=no_change,
            createdAt=timestamp(),
        )
    finally:
        for path in (index, index.with_name(index.name + ".lock")):
            try:
                path.unlink()
            except FileNotFoundError:
                pass
