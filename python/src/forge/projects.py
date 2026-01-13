"""Read-only local project probe and explicit trust boundary."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.persistence import ForgePersistence

TRUST_VERSION: Literal["project-trust/v1"] = "project-trust/v1"
SCRIPT_NAMES = ("dev", "build", "test", "lint", "typecheck")
MANIFEST_LIMIT = 1_048_576


def timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ProjectError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Scripts(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    dev: str | None
    build: str | None
    test: str | None
    lint: str | None
    typecheck: str | None


class Capabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    gitWorktree: bool
    declaredScripts: bool


class ExistingProject(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    revision: int = Field(ge=1)
    archived: bool


class ProjectProbe(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    rootPath: str = Field(min_length=1, max_length=4096)
    name: str = Field(min_length=1, max_length=240)
    repositoryType: Literal["git", "none"]
    gitRoot: str | None
    currentBranch: str | None
    defaultBranch: str | None
    workingTree: Literal["clean", "dirty", "unknown"]
    remoteConfigured: bool
    packageManagerEvidence: list[str] = Field(max_length=3)
    packageManager: Literal["pnpm", "npm", "yarn", "conflict", "unknown"]
    projectType: Literal["vue", "react", "electron", "node", "python", "java", "rust", "unknown"]
    detectedRuntime: list[str] = Field(max_length=8)
    scripts: Scripts
    scriptsHash: str
    capabilities: Capabilities
    fingerprint: str
    probedAt: str
    existingProject: ExistingProject | None = None


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    environmentId: UUID
    name: str = Field(min_length=1, max_length=240)
    rootPath: str
    repositoryType: Literal["git", "none"]
    gitRoot: str | None
    defaultBranch: str | None
    trusted: Literal[True]
    trustVersion: Literal["project-trust/v1"]
    trustApprovedAt: str
    environmentSummaryHash: str
    createdAt: str
    updatedAt: str
    lastOpenedAt: str
    revision: int = Field(ge=1)
    archivedAt: str | None
    probe: ProjectProbe


def digest(value: Any) -> str:
    body = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(body.encode()).hexdigest()


def _git(root: Path, args: list[str]) -> str | None:
    env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
    try:
        output = subprocess.run(
            ["git", "-c", "core.fsmonitor=false", *args],
            cwd=root,
            env=env,
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except FileNotFoundError as error:
        raise ProjectError("PROJECT_PROBE_FAILED", "Git is unavailable") from error
    except subprocess.TimeoutExpired:
        return None
    if output.returncode != 0 or len(output.stdout) > 131_072:
        return None
    return output.stdout.strip()


def _manifest(root: Path, name: str) -> str | None:
    path = root / name
    try:
        details = path.lstat()
        if not stat.S_ISREG(details.st_mode) or details.st_size > MANIFEST_LIMIT:
            return None
        return path.read_text()
    except (OSError, UnicodeError):
        return None


def _type(files: set[str], pkg: dict[str, Any] | None) -> str:
    deps = {}
    if pkg:
        for name in ("dependencies", "devDependencies"):
            value = pkg.get(name)
            if isinstance(value, dict):
                deps.update(value)
    for name in ("electron", "vue", "react"):
        if name in deps:
            return name
    if "pyproject.toml" in files or "requirements.txt" in files:
        return "python"
    if "Cargo.toml" in files:
        return "rust"
    if files.intersection({"pom.xml", "build.gradle", "build.gradle.kts"}):
        return "java"
    return "node" if pkg else "unknown"


def probe_project(selected_path: str) -> ProjectProbe:
    selected = Path(selected_path)
    if not selected.is_absolute():
        raise ProjectError("PROJECT_INVALID_PATH", "Choose an absolute project directory")
    try:
        selected = selected.resolve(strict=True)
        if not selected.is_dir():
            raise OSError("not-directory")
    except OSError as error:
        raise ProjectError(
            "PROJECT_INVALID_PATH", "Project directory is missing or unreadable"
        ) from error
    git_root_raw = _git(selected, ["rev-parse", "--show-toplevel"])
    try:
        git_root = Path(git_root_raw).resolve(strict=True) if git_root_raw else None
    except OSError:
        git_root = None
    root = git_root or selected
    try:
        files = set(os.listdir(root))
    except OSError as error:
        raise ProjectError("PROJECT_INVALID_PATH", "Project directory is unreadable") from error
    branch = _git(root, ["branch", "--show-current"]) if git_root else None
    remote_head = (
        _git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"])
        if git_root
        else None
    )
    default_branch = remote_head.removeprefix("origin/") if remote_head else None
    if git_root and not default_branch:
        for candidate in ("main", "master"):
            if (
                _git(root, ["show-ref", "--verify", "--quiet", f"refs/heads/{candidate}"])
                is not None
            ):
                default_branch = candidate
                break
    git_status = (
        _git(root, ["status", "--porcelain=v1", "--untracked-files=normal"]) if git_root else None
    )
    remotes = _git(root, ["remote"]) if git_root else None
    pkg: dict[str, Any] | None = None
    package_text = _manifest(root, "package.json") if "package.json" in files else None
    if package_text:
        try:
            parsed = json.loads(package_text)
            if isinstance(parsed, dict):
                pkg = parsed
        except ValueError:
            pass
    declared = pkg.get("scripts") if pkg else None
    if not isinstance(declared, dict):
        declared = {}
    scripts = {
        name: value[:400] if isinstance(value := declared.get(name), str) else None
        for name in SCRIPT_NAMES
    }
    evidence = [
        name for name in ("pnpm-lock.yaml", "package-lock.json", "yarn.lock") if name in files
    ]
    manager = (
        "conflict"
        if len(evidence) > 1
        else (
            {"pnpm-lock.yaml": "pnpm", "package-lock.json": "npm", "yarn.lock": "yarn"}.get(
                evidence[0], "unknown"
            )
            if evidence
            else "unknown"
        )
    )
    runtime = [
        value
        for condition, value in (
            (pkg is not None, "Node.js (manifest)"),
            ("pyproject.toml" in files, "Python (manifest)"),
            ("Cargo.toml" in files, "Rust (manifest)"),
            (bool(files.intersection({"pom.xml", "build.gradle"})), "Java (manifest)"),
        )
        if condition
    ]
    body = {
        "rootPath": str(root),
        "name": root.name,
        "repositoryType": "git" if git_root else "none",
        "gitRoot": str(git_root) if git_root else None,
        "currentBranch": branch or None,
        "defaultBranch": default_branch,
        "workingTree": "unknown"
        if git_root is None or git_status is None
        else "dirty"
        if git_status
        else "clean",
        "remoteConfigured": bool(remotes),
        "packageManagerEvidence": evidence,
        "packageManager": manager,
        "projectType": _type(files, pkg),
        "detectedRuntime": runtime,
        "scripts": scripts,
        "scriptsHash": digest(scripts),
        "capabilities": {
            "gitWorktree": bool(git_root),
            "declaredScripts": any(bool(value) for value in scripts.values()),
        },
    }
    return ProjectProbe.model_validate(
        {**body, "fingerprint": digest(body), "probedAt": timestamp()}
    )


class ProjectService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def probe(self, path: str) -> ProjectProbe:
        found = probe_project(path)
        previous = self.storage.get_project_by_path(found.rootPath)
        existing = (
            None
            if not previous
            else ExistingProject(
                projectId=previous.projectId,
                revision=previous.revision,
                archived=previous.archivedAt is not None,
            )
        )
        return found.model_copy(update={"existingProject": existing})

    def list(self) -> list[Project]:
        return self.storage.list_projects()

    def get(self, project_id: str) -> Project | None:
        return self.storage.get_project(project_id)

    def active(self) -> Project | None:
        return self.storage.active_project()

    def set_active(self, project_id: str, expected_revision: int) -> Project:
        project = self.storage.set_active_project(project_id, expected_revision, timestamp())
        if project is None:
            raise ProjectError("PROJECT_NOT_FOUND", "Project is not saved in Forge")
        return project

    def update(
        self,
        project_id: str,
        expected_revision: int,
        name: str | None,
        default_branch: str | None,
        *,
        default_branch_provided: bool = False,
    ) -> Project:
        if name is None and not default_branch_provided:
            raise ProjectError("VALIDATION_ERROR", "No project fields were supplied for update")
        before = self.storage.get_project(project_id)
        if before is None:
            raise ProjectError("PROJECT_NOT_FOUND", "Project is not saved in Forge")
        project = self.storage.update_project(
            project_id,
            expected_revision,
            name,
            default_branch if default_branch_provided else before.defaultBranch,
            timestamp(),
        )
        if project is None:
            raise ProjectError("PROJECT_NOT_FOUND", "Project is not saved in Forge")
        return project

    def remove(self, project_id: str, expected_revision: int) -> dict[str, str]:
        if not self.storage.remove_project(project_id, expected_revision, timestamp()):
            raise ProjectError("PROJECT_NOT_FOUND", "Project is not saved in Forge")
        return {"removedId": project_id}

    def create(
        self,
        path: str,
        fingerprint: str,
        trust_version: str,
        approved: bool,
        expected_revision: int,
    ) -> Project:
        if not approved or trust_version != TRUST_VERSION:
            raise ProjectError("PROJECT_TRUST_REQUIRED", "Explicit project trust is required")
        fresh = probe_project(path)
        if fresh.fingerprint != fingerprint:
            raise ProjectError(
                "PROJECT_PROBE_STALE", "Project changed; review its environment again"
            )
        previous = self.storage.get_project_by_path(fresh.rootPath)
        if previous:
            if previous.revision != expected_revision:
                raise ProjectError(
                    "PROJECT_PROBE_STALE", "Project version changed; inspect it again"
                )
            if previous.archivedAt:
                return self.storage.restore_project(
                    str(previous.projectId), expected_revision, fresh
                )
            return previous
        if expected_revision != 0:
            raise ProjectError("PROJECT_PROBE_STALE", "Project selection changed; inspect it again")
        now = timestamp()
        project = Project(
            projectId=uuid4(),
            environmentId=uuid4(),
            name=fresh.name,
            rootPath=fresh.rootPath,
            repositoryType=fresh.repositoryType,
            gitRoot=fresh.gitRoot,
            defaultBranch=fresh.defaultBranch,
            trusted=True,
            trustVersion=TRUST_VERSION,
            trustApprovedAt=now,
            environmentSummaryHash=fresh.fingerprint,
            createdAt=now,
            updatedAt=now,
            lastOpenedAt=now,
            revision=1,
            archivedAt=None,
            probe=fresh,
        )
        return self.storage.create_project(project)
