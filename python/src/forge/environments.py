"""Project environment and command preset metadata; commands are never run here."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PureWindowsPath
from typing import Annotated, Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.projects import probe_project


class EnvironmentError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


EnvRef = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9._:-]{0,127}$")]
Arg = Annotated[str, Field(max_length=1024)]


class EnvironmentConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    commandPresetIds: list[UUID] = Field(max_length=64)
    envRefs: list[EnvRef] = Field(max_length=64)
    networkMode: str = Field(pattern=r"^trusted-local$")


class ProjectEnvironment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    environmentId: UUID
    projectId: UUID
    name: str = Field(min_length=1, max_length=120)
    config: EnvironmentConfig
    revision: int = Field(ge=1)
    createdAt: str
    updatedAt: str
    archivedAt: str | None


class CommandPreset(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    presetId: UUID
    projectId: UUID
    environmentId: UUID
    name: str = Field(min_length=1, max_length=120)
    executable: str = Field(min_length=1, max_length=512)
    argv: list[Arg] = Field(max_length=64)
    cwdRelative: str = Field(min_length=1, max_length=1024)
    envRefs: list[EnvRef] = Field(max_length=64)
    timeoutSeconds: int = Field(ge=1, le=7200)
    scriptsHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    approvalHash: str | None
    revision: int = Field(ge=1)
    createdAt: str
    updatedAt: str
    archivedAt: str | None


def command_preset_approval_hash(preset: CommandPreset, approved_revision: int) -> str:
    """Digest the exact fields presented at explicit preset approval."""
    body = {
        "projectId": str(preset.projectId), "presetId": str(preset.presetId),
        "revision": approved_revision, "executable": preset.executable,
        "argv": preset.argv, "cwdRelative": preset.cwdRelative,
        "envRefs": preset.envRefs, "timeoutSeconds": preset.timeoutSeconds,
        "scriptsHash": preset.scriptsHash,
    }
    return hashlib.sha256(
        json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


class EnvironmentSaveInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    environmentId: UUID | None = None
    expectedRevision: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=120)
    config: EnvironmentConfig


class PresetSaveInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    presetId: UUID | None = None
    expectedRevision: int = Field(ge=0)
    environmentId: UUID
    name: str = Field(min_length=1, max_length=120)
    executable: str = Field(min_length=1, max_length=512)
    argv: list[Arg] = Field(max_length=64)
    cwdRelative: str = Field(min_length=1, max_length=1024)
    envRefs: list[EnvRef] = Field(max_length=64)
    timeoutSeconds: int = Field(ge=1, le=7200)
    scriptsHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class EnvironmentService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def _project(self, project_id: str) -> Any:
        row = self.storage.session().execute(
            "SELECT canonical_path,archived_at FROM projects WHERE project_id=?",
            (project_id,),
        ).fetchone()
        if row is None:
            raise EnvironmentError("PROJECT_NOT_FOUND")
        if row["archived_at"]:
            raise EnvironmentError("PROJECT_ARCHIVED")
        return row

    @staticmethod
    def _environment(row: Any) -> ProjectEnvironment:
        return ProjectEnvironment.model_validate_json(json.dumps({
            "environmentId": row["environment_id"], "projectId": row["project_id"],
            "name": row["name"], "config": json.loads(row["config_json"]),
            "revision": row["revision"], "createdAt": row["created_at"],
            "updatedAt": row["updated_at"], "archivedAt": row["archived_at"],
        }))

    @staticmethod
    def _preset(row: Any) -> CommandPreset:
        return CommandPreset.model_validate_json(json.dumps({
            "presetId": row["preset_id"], "projectId": row["project_id"],
            "environmentId": row["environment_id"], "name": row["name"],
            "executable": row["executable"], "argv": json.loads(row["argv_json"]),
            "cwdRelative": row["cwd_relative"], "envRefs": json.loads(row["env_refs_json"]),
            "timeoutSeconds": row["timeout_seconds"], "scriptsHash": row["scripts_hash"],
            "approvalHash": row["approval_hash"] or None, "revision": row["revision"],
            "createdAt": row["created_at"], "updatedAt": row["updated_at"],
            "archivedAt": row["archived_at"],
        }))

    def get(self, project_id: str, environment_id: str) -> ProjectEnvironment | None:
        self._project(project_id)
        row = self.storage.session().execute(
            "SELECT * FROM environments WHERE environment_id=? AND project_id=? "
            "AND archived_at IS NULL",
            (environment_id, project_id),
        ).fetchone()
        return self._environment(row) if row else None

    def list_environments(self, project_id: str) -> list[ProjectEnvironment]:
        self._project(project_id)
        rows = self.storage.session().execute(
            "SELECT * FROM environments WHERE project_id=? AND archived_at IS NULL "
            "ORDER BY created_at,environment_id", (project_id,),
        ).fetchall()
        return [self._environment(row) for row in rows]

    def _preset_refs(self, project_id: str, environment_id: str, ids: list[UUID]) -> None:
        if len(set(ids)) != len(ids):
            raise EnvironmentError("ENVIRONMENT_IN_USE")
        for preset_id in ids:
            found = self.storage.session().execute(
                "SELECT 1 FROM command_presets WHERE preset_id=? AND project_id=? "
                "AND environment_id=? AND archived_at IS NULL",
                (str(preset_id), project_id, environment_id),
            ).fetchone()
            if not found:
                raise EnvironmentError("COMMAND_PRESET_NOT_FOUND")

    def save(self, value: EnvironmentSaveInput) -> ProjectEnvironment:
        project_id = str(value.projectId)
        environment_id = str(value.environmentId or uuid4())
        with self.storage.transaction() as db:
            self._project(project_id)
            self._preset_refs(project_id, environment_id, value.config.commandPresetIds)
            now = timestamp()
            if value.environmentId is None:
                if value.expectedRevision != 0:
                    raise EnvironmentError("REVISION_CONFLICT")
                if db.execute(
                    "SELECT 1 FROM environments WHERE project_id=? AND name=? "
                    "AND archived_at IS NULL", (project_id, value.name),
                ).fetchone():
                    raise EnvironmentError("REVISION_CONFLICT")
                db.execute(
                    "INSERT INTO environments(environment_id,project_id,name,config_json,"
                    "revision,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
                    (environment_id, project_id, value.name, value.config.model_dump_json(),
                     now, now),
                )
            else:
                if self.get(project_id, environment_id) is None:
                    raise EnvironmentError("ENVIRONMENT_NOT_FOUND")
                changed = db.execute(
                    "UPDATE environments SET name=?,config_json=?,revision=revision+1,"
                    "updated_at=? WHERE environment_id=? AND project_id=? AND revision=? "
                    "AND archived_at IS NULL",
                    (value.name, value.config.model_dump_json(), now, environment_id,
                     project_id, value.expectedRevision),
                ).rowcount
                if changed != 1:
                    raise EnvironmentError("REVISION_CONFLICT")
            saved = self.get(project_id, environment_id)
            assert saved is not None
            return saved

    def archive(self, project_id: str, environment_id: str, revision: int) -> ProjectEnvironment:
        with self.storage.transaction() as db:
            before = self.get(project_id, environment_id)
            if before is None:
                raise EnvironmentError("ENVIRONMENT_NOT_FOUND")
            selected = db.execute(
                "SELECT 1 FROM projects WHERE project_id=? AND environment_id=? "
                "AND archived_at IS NULL", (project_id, environment_id),
            ).fetchone()
            active = db.execute(
                "SELECT 1 FROM command_presets WHERE project_id=? AND environment_id=? "
                "AND archived_at IS NULL LIMIT 1", (project_id, environment_id),
            ).fetchone()
            if selected or active:
                raise EnvironmentError("ENVIRONMENT_IN_USE")
            now = timestamp()
            changed = db.execute(
                "UPDATE environments SET archived_at=?,updated_at=?,revision=revision+1 "
                "WHERE environment_id=? AND project_id=? AND revision=? AND archived_at IS NULL",
                (now, now, environment_id, project_id, revision),
            ).rowcount
            if changed != 1:
                raise EnvironmentError("REVISION_CONFLICT")
            return before.model_copy(update={
                "archivedAt": now, "updatedAt": now, "revision": revision + 1
            })

    def get_preset(self, project_id: str, preset_id: str) -> CommandPreset | None:
        self._project(project_id)
        row = self.storage.session().execute(
            "SELECT * FROM command_presets WHERE preset_id=? AND project_id=? "
            "AND archived_at IS NULL", (preset_id, project_id),
        ).fetchone()
        return self._preset(row) if row else None

    def list_presets(self, project_id: str, environment_id: str) -> list[CommandPreset]:
        if self.get(project_id, environment_id) is None:
            raise EnvironmentError("ENVIRONMENT_NOT_FOUND")
        rows = self.storage.session().execute(
            "SELECT * FROM command_presets WHERE project_id=? AND environment_id=? "
            "AND archived_at IS NULL ORDER BY created_at,preset_id",
            (project_id, environment_id),
        ).fetchall()
        return [self._preset(row) for row in rows]

    def _validate_cwd(self, project_id: str, cwd: str) -> None:
        root = Path(self._project(project_id)["canonical_path"]).resolve()
        if (
            "\0" in cwd or Path(cwd).is_absolute() or PureWindowsPath(cwd).is_absolute()
            or ".." in cwd.replace("\\", "/").split("/")
        ):
            raise EnvironmentError("PROJECT_INVALID_PATH")
        target = (root / cwd).resolve()
        if not target.is_dir() or not target.is_relative_to(root):
            raise EnvironmentError("PROJECT_INVALID_PATH")

    def _fresh_scripts(self, project_id: str, expected_hash: str) -> None:
        root = self._project(project_id)["canonical_path"]
        if probe_project(root).scriptsHash != expected_hash:
            raise EnvironmentError("PROJECT_PROBE_STALE")

    def save_preset(self, value: PresetSaveInput) -> CommandPreset:
        project_id, environment_id = str(value.projectId), str(value.environmentId)
        self._fresh_scripts(project_id, value.scriptsHash)
        self._validate_cwd(project_id, value.cwdRelative)
        with self.storage.transaction() as db:
            if self.get(project_id, environment_id) is None:
                raise EnvironmentError("ENVIRONMENT_NOT_FOUND")
            preset_id = str(value.presetId or uuid4())
            now = timestamp()
            if value.presetId is None:
                if value.expectedRevision != 0:
                    raise EnvironmentError("REVISION_CONFLICT")
                if db.execute(
                    "SELECT 1 FROM command_presets WHERE project_id=? AND environment_id=? "
                    "AND name=? AND archived_at IS NULL",
                    (project_id, environment_id, value.name),
                ).fetchone():
                    raise EnvironmentError("REVISION_CONFLICT")
                db.execute(
                    "INSERT INTO command_presets(preset_id,project_id,environment_id,name,"
                    "executable,argv_json,cwd_relative,env_refs_json,timeout_seconds,"
                    "scripts_hash,approval_hash,revision,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?,'',1,?,?)",
                    (preset_id, project_id, environment_id, value.name,
                     value.executable, json.dumps(value.argv), value.cwdRelative,
                     json.dumps(value.envRefs), value.timeoutSeconds, value.scriptsHash,
                     now, now),
                )
            else:
                before = self.get_preset(project_id, preset_id)
                if before is None or str(before.environmentId) != environment_id:
                    raise EnvironmentError("COMMAND_PRESET_NOT_FOUND")
                changed = db.execute(
                    "UPDATE command_presets SET name=?,executable=?,argv_json=?,cwd_relative=?,"
                    "env_refs_json=?,timeout_seconds=?,scripts_hash=?,approval_hash='',"
                    "updated_at=?,revision=revision+1 WHERE preset_id=? AND project_id=? "
                    "AND revision=? AND archived_at IS NULL",
                    (value.name, value.executable, json.dumps(value.argv), value.cwdRelative,
                     json.dumps(value.envRefs), value.timeoutSeconds, value.scriptsHash,
                     now, preset_id, project_id, value.expectedRevision),
                ).rowcount
                if changed != 1:
                    raise EnvironmentError("REVISION_CONFLICT")
            saved = self.get_preset(project_id, preset_id)
            assert saved is not None
            return saved

    def approve_preset(
        self, project_id: str, preset_id: str, revision: int, scripts_hash: str
    ) -> CommandPreset:
        preset = self.get_preset(project_id, preset_id)
        if preset is None:
            raise EnvironmentError("COMMAND_PRESET_NOT_FOUND")
        self._fresh_scripts(project_id, scripts_hash)
        self._validate_cwd(project_id, preset.cwdRelative)
        if preset.scriptsHash != scripts_hash:
            raise EnvironmentError("PROJECT_PROBE_STALE")
        approval_hash = command_preset_approval_hash(preset, revision)
        with self.storage.transaction() as db:
            changed = db.execute(
                "UPDATE command_presets SET approval_hash=?,revision=revision+1,updated_at=? "
                "WHERE preset_id=? AND project_id=? AND revision=? AND archived_at IS NULL",
                (approval_hash, timestamp(), preset_id, project_id, revision),
            ).rowcount
            if changed != 1:
                raise EnvironmentError("REVISION_CONFLICT")
            approved = self.get_preset(project_id, preset_id)
            assert approved is not None
            return approved

    def archive_preset(self, project_id: str, preset_id: str, revision: int) -> CommandPreset:
        with self.storage.transaction() as db:
            before = self.get_preset(project_id, preset_id)
            if before is None:
                raise EnvironmentError("COMMAND_PRESET_NOT_FOUND")
            configs = db.execute(
                "SELECT config_json FROM environments WHERE project_id=? AND archived_at IS NULL",
                (project_id,),
            ).fetchall()
            if any(
                preset_id in json.loads(row["config_json"])["commandPresetIds"]
                for row in configs
            ):
                raise EnvironmentError("COMMAND_PRESET_REFERENCED")
            now = timestamp()
            changed = db.execute(
                "UPDATE command_presets SET archived_at=?,updated_at=?,revision=revision+1 "
                "WHERE preset_id=? AND project_id=? AND revision=? AND archived_at IS NULL",
                (now, now, preset_id, project_id, revision),
            ).rowcount
            if changed != 1:
                raise EnvironmentError("REVISION_CONFLICT")
            return before.model_copy(update={
                "archivedAt": now, "updatedAt": now, "revision": revision + 1
            })
