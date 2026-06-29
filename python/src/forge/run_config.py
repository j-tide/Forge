"""Immutable, hash-verified Run configuration; freezing does not start execution."""

from __future__ import annotations

import hashlib
import json
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.approvals import canonical_json, contract_digest
from forge.conversations import timestamp
from forge.drafts import TaskContract
from forge.environments import EnvironmentService, ProjectEnvironment
from forge.persistence import ForgePersistence
from forge.workflow_compiler import compile_workflow
from forge.workflow_templates import WorkflowTemplate


class RunConfigError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class VersionLock(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str = Field(min_length=1, max_length=128)
    version: str = Field(min_length=1, max_length=80)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class ProfileLock(VersionLock):
    executorPluginId: str = Field(min_length=1, max_length=128)


class RunBudget(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    maxDurationMs: int = Field(ge=1000, le=86_400_000)
    maxTurns: int = Field(ge=1, le=1000)
    maxTokens: int = Field(ge=1, le=100_000_000)
    maxToolCalls: int = Field(ge=1, le=100_000)


class RunConfigSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: UUID
    projectId: UUID
    taskId: UUID
    expectedTaskRevision: int = Field(ge=1)
    workflow: VersionLock
    profile: ProfileLock
    stageProfiles: list[ProfileLock] = Field(default_factory=list, max_length=8)
    plugins: list[VersionLock] = Field(max_length=32)
    budget: RunBudget
    environmentId: UUID
    expectedEnvironmentRevision: int = Field(ge=1)


class RunConfigSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    runId: UUID
    projectId: UUID
    taskId: UUID
    taskRevision: int = Field(ge=1)
    taskContractHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    taskContract: TaskContract
    workflow: VersionLock
    profile: ProfileLock
    stageProfiles: list[ProfileLock] = Field(default_factory=list, max_length=8)
    plugins: list[VersionLock] = Field(max_length=32)
    budget: RunBudget
    environment: ProjectEnvironment
    createdAt: str
    snapshotHash: str = Field(pattern=r"^[a-f0-9]{64}$")


def _digest(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def verify_snapshot(value: object) -> RunConfigSnapshot:
    try:
        snapshot = (
            value if isinstance(value, RunConfigSnapshot)
            else RunConfigSnapshot.model_validate_json(json.dumps(value))
        )
        excluded = {"snapshotHash"}
        if "stageProfiles" not in snapshot.model_fields_set:
            excluded.add("stageProfiles")
        body = snapshot.model_dump(mode="json", exclude=excluded)
        if (
            _digest(body) != snapshot.snapshotHash
            or contract_digest(snapshot.taskContract) != snapshot.taskContractHash
            or snapshot.taskContract.projectId != str(snapshot.projectId)
            or snapshot.taskContract.taskId != str(snapshot.taskId)
            or snapshot.taskContract.revision != snapshot.taskRevision
        ):
            raise RunConfigError("RUN_CONFIG_INVALID")
        return snapshot
    except ValidationError as error:
        raise RunConfigError("RUN_CONFIG_INVALID") from error


class RunConfigService:
    def __init__(self, storage: ForgePersistence, environments: EnvironmentService) -> None:
        self.storage = storage
        self.environments = environments

    def get(self, project_id: UUID, run_id: UUID) -> RunConfigSnapshot | None:
        row = self.storage.session().execute(
            "SELECT * FROM run_config_snapshots WHERE project_id=? AND run_id=?",
            (str(project_id), str(run_id)),
        ).fetchone()
        if row is None:
            return None
        try:
            snapshot = verify_snapshot(json.loads(row["snapshot_json"]))
            if (
                str(snapshot.runId) != row["run_id"]
                or str(snapshot.projectId) != row["project_id"]
                or str(snapshot.taskId) != row["task_id"]
                or snapshot.snapshotHash != row["snapshot_hash"]
            ):
                raise RunConfigError("RUN_CONFIG_INVALID")
            return snapshot
        except (ValueError, TypeError) as error:
            raise RunConfigError("RUN_CONFIG_INVALID") from error

    def create(self, selection: RunConfigSelection) -> RunConfigSnapshot:
        selection_body = selection.model_dump(mode="json")
        if "stageProfiles" not in selection.model_fields_set:
            selection_body.pop("stageProfiles")
        request_hash = _digest(selection_body)
        with self.storage.transaction() as db:
            existing = db.execute(
                "SELECT project_id,request_hash FROM run_config_snapshots WHERE run_id=?",
                (str(selection.runId),),
            ).fetchone()
            if existing is not None:
                if (
                    existing["project_id"] != str(selection.projectId)
                    or existing["request_hash"] != request_hash
                ):
                    raise RunConfigError("RUN_CONFIG_CONFLICT")
                replay = self.get(selection.projectId, selection.runId)
                if replay is None:
                    raise RunConfigError("RUN_CONFIG_INVALID")
                return replay
            row = db.execute(
                "SELECT t.state,t.current_revision,r.contract_json,r.content_hash "
                "FROM tasks t JOIN task_revisions r "
                "ON r.task_id=t.task_id AND r.revision=t.current_revision "
                "JOIN projects p ON p.project_id=t.project_id "
                "WHERE t.project_id=? AND t.task_id=? AND p.archived_at IS NULL",
                (str(selection.projectId), str(selection.taskId)),
            ).fetchone()
            if row is None or row["state"] != "todo":
                raise RunConfigError("RUN_CONFIG_NOT_FOUND")
            if self.storage.schema_version() >= 23 and db.execute(
                "SELECT 1 FROM task_change_requests WHERE task_id=? "
                "AND state='awaiting_safe_point'", (str(selection.taskId),),
            ).fetchone():
                raise RunConfigError("RUN_CONFIG_STALE")
            if row["current_revision"] != selection.expectedTaskRevision:
                raise RunConfigError("RUN_CONFIG_STALE")
            try:
                contract = TaskContract.model_validate_json(row["contract_json"])
            except ValidationError as error:
                raise RunConfigError("RUN_CONFIG_INVALID") from error
            if contract_digest(contract) != row["content_hash"]:
                raise RunConfigError("RUN_CONFIG_INVALID")
            environment = self.environments.get(
                str(selection.projectId), str(selection.environmentId)
            )
            if environment is None or environment.archivedAt is not None:
                raise RunConfigError("RUN_CONFIG_NOT_FOUND")
            if environment.revision != selection.expectedEnvironmentRevision:
                raise RunConfigError("RUN_CONFIG_STALE")
            if (
                contract.projectId != str(selection.projectId)
                or contract.taskId != str(selection.taskId)
                or selection.workflow.id != contract.workflowRef
                or len({plugin.id for plugin in selection.plugins}) != len(selection.plugins)
                or not any(
                    plugin.id == selection.profile.executorPluginId
                    for plugin in selection.plugins
                )
            ):
                raise RunConfigError("RUN_CONFIG_INVALID")
            if selection.workflow.id.startswith("workflow."):
                if self.storage.schema_version() < 26:
                    raise RunConfigError("RUN_CONFIG_WORKFLOW_STALE")
                try:
                    workflow_revision = int(selection.workflow.version)
                except ValueError as error:
                    raise RunConfigError("RUN_CONFIG_WORKFLOW_STALE") from error
                publication = db.execute(
                    "SELECT definition_json,content_hash,state FROM workflow_revisions "
                    "WHERE id=? AND revision=?",
                    (selection.workflow.id, workflow_revision),
                ).fetchone()
                if (publication is None or publication["state"] != "published" or
                        publication["content_hash"] != selection.workflow.contentHash):
                    raise RunConfigError("RUN_CONFIG_WORKFLOW_STALE")
                try:
                    definition = WorkflowTemplate.model_validate_json(
                        publication["definition_json"]
                    )
                    if (definition.id != selection.workflow.id or
                            definition.revision != workflow_revision or
                            compile_workflow(definition).contentHash !=
                            selection.workflow.contentHash):
                        raise RunConfigError("RUN_CONFIG_WORKFLOW_STALE")
                except ValidationError as error:
                    raise RunConfigError("RUN_CONFIG_WORKFLOW_STALE") from error
            body = {
                "schemaVersion": "1.0", "runId": str(selection.runId),
                "projectId": str(selection.projectId), "taskId": str(selection.taskId),
                "taskRevision": contract.revision,
                "taskContractHash": contract_digest(contract),
                "taskContract": contract.model_dump(mode="json"),
                "workflow": selection.workflow.model_dump(mode="json"),
                "profile": selection.profile.model_dump(mode="json"),
                "plugins": [item.model_dump(mode="json") for item in sorted(
                    selection.plugins, key=lambda item: item.id
                )],
                "budget": selection.budget.model_dump(mode="json"),
                "environment": environment.model_dump(mode="json"),
                "createdAt": timestamp(),
            }
            if "stageProfiles" in selection.model_fields_set:
                body["stageProfiles"] = [item.model_dump(mode="json")
                                         for item in selection.stageProfiles]
            snapshot = RunConfigSnapshot.model_validate_json(json.dumps({
                **body, "snapshotHash": _digest(body)
            }, ensure_ascii=False))
            serialized = snapshot.model_dump(mode="json")
            if "stageProfiles" not in snapshot.model_fields_set:
                serialized.pop("stageProfiles")
            db.execute(
                "INSERT INTO run_config_snapshots(run_id,project_id,task_id,request_hash,"
                "snapshot_hash,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (str(selection.runId), str(selection.projectId), str(selection.taskId),
                 request_hash, snapshot.snapshotHash,
                 json.dumps(serialized, ensure_ascii=False),
                 snapshot.createdAt),
            )
            return snapshot
