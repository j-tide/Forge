"""Project trust and read-only environment probing against real temporary repos."""

import subprocess
from pathlib import Path

import pytest

from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectError, ProjectService, probe_project, timestamp


def git(root: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=root, capture_output=True, check=True)


def test_git_probe_trust_duplicate_restart_and_metadata_only_remove(tmp_path: Path) -> None:
    source = tmp_path / "Forge 测试项目 01"
    source.mkdir()
    git(source, "init", "-q")
    git(source, "config", "user.name", "Forge Test")
    git(source, "config", "user.email", "forge@example.invalid")
    (source / "package.json").write_text('{"name":"fixture","scripts":{"test":"node --test"}}')
    (source / "pnpm-lock.yaml").write_text("lockfileVersion: 9\n")
    git(source, "add", ".")
    git(source, "commit", "-qm", "fixture")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    service = ProjectService(storage)
    probe = service.probe(str(source))
    assert probe.repositoryType == "git"
    assert probe.workingTree == "clean"
    assert probe.packageManager == "pnpm"
    assert probe.scripts.test == "node --test"
    assert probe.capabilities.gitWorktree
    with pytest.raises(ProjectError, match="Explicit project trust"):
        service.create(str(source), probe.fingerprint, TRUST_VERSION, False, 0)
    assert storage.list_projects() == []
    (source / "dirty.txt").write_text("user data")
    with pytest.raises(ProjectError, match="Project changed"):
        service.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    fresh = service.probe(str(source))
    assert fresh.workingTree == "dirty"
    saved = service.create(str(source), fresh.fingerprint, TRUST_VERSION, True, 0)
    assert saved.trustVersion == TRUST_VERSION
    assert storage.active_project() and storage.active_project().projectId == saved.projectId
    alias = tmp_path / "alias"
    alias.symlink_to(source, target_is_directory=True)
    duplicate = service.probe(str(alias))
    assert duplicate.existingProject and duplicate.existingProject.projectId == saved.projectId
    assert (
        service.create(
            str(alias), duplicate.fingerprint, TRUST_VERSION, True, saved.revision
        ).projectId
        == saved.projectId
    )
    storage.close()

    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    assert reopened.schema_version() == 15
    assert reopened.active_project() and reopened.active_project().projectId == saved.projectId
    assert reopened.remove_project(str(saved.projectId), saved.revision, timestamp())
    assert reopened.list_projects() == []
    reopened.close()
    assert (source / "dirty.txt").read_text() == "user data"
    assert (source / ".git").is_dir()


def test_probe_never_executes_scripts_or_follows_symlinked_manifest(tmp_path: Path) -> None:
    outside = tmp_path / "outside.json"
    outside.write_text('{"scripts":{"build":"private-secret"}}')
    source = tmp_path / "untrusted"
    source.mkdir()
    (source / "package.json").symlink_to(outside)
    before = list(source.iterdir())
    probe = probe_project(str(source))
    assert probe.projectType == "unknown"
    assert probe.scripts.build is None
    assert list(source.iterdir()) == before
    assert "private-secret" not in probe.model_dump_json()
    with pytest.raises(ProjectError, match="absolute"):
        probe_project("../untrusted")
    with pytest.raises(ProjectError, match="directory"):
        probe_project(str(outside))
