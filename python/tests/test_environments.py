"""Environment CAS and command preset approval never execute project scripts."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from forge.environments import (
    EnvironmentConfig,
    EnvironmentError,
    EnvironmentSaveInput,
    EnvironmentService,
    PresetSaveInput,
)
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService


def test_environment_preset_cas_script_hash_and_path_guard(tmp_path: Path) -> None:
    source = tmp_path / "project 空格"
    source.mkdir()
    (source / "package.json").write_text(
        '{"scripts":{"test":"touch must-not-exist"}}'
    )
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    service = EnvironmentService(storage)
    environments = service.list_environments(str(project.projectId))
    assert len(environments) == 1
    default = environments[0]
    assert default.config.networkMode == "trusted-local"
    preset = service.save_preset(PresetSaveInput(
        projectId=project.projectId, expectedRevision=0,
        environmentId=default.environmentId, name="Test", executable="pnpm",
        argv=["test"], cwdRelative=".", envRefs=[], timeoutSeconds=30,
        scriptsHash=probe.scriptsHash,
    ))
    assert preset.approvalHash is None
    approved = service.approve_preset(
        str(project.projectId), str(preset.presetId), 1, probe.scriptsHash
    )
    assert approved.approvalHash and approved.revision == 2
    assert not (source / "must-not-exist").exists()
    saved = service.save(EnvironmentSaveInput(
        projectId=project.projectId, environmentId=default.environmentId,
        expectedRevision=1, name="Default",
        config=EnvironmentConfig(
            commandPresetIds=[preset.presetId], envRefs=[], networkMode="trusted-local"
        ),
    ))
    assert saved.revision == 2
    with pytest.raises(EnvironmentError, match="COMMAND_PRESET_REFERENCED"):
        service.archive_preset(str(project.projectId), str(preset.presetId), 2)
    with pytest.raises(EnvironmentError, match="PROJECT_INVALID_PATH"):
        service.save_preset(PresetSaveInput(
            projectId=project.projectId, expectedRevision=0,
            environmentId=default.environmentId, name="Escape", executable="node",
            argv=[], cwdRelative="../", envRefs=[], timeoutSeconds=1,
            scriptsHash=probe.scriptsHash,
        ))
    with pytest.raises(ValidationError):
        EnvironmentConfig(commandPresetIds=[], envRefs=["BAD NAME"], networkMode="trusted-local")
    storage.close()
    assert (source / "package.json").is_file()
