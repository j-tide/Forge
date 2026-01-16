"""Immutable CodeSnapshot, development artifact and honest Review/Verify handoff."""

from __future__ import annotations

import hashlib
import json
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from forge.context import ContextBundle, ContextService, WorkingCheckpoint
from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.processes import ProcessController
from forge.run_config import RunConfigService, RunConfigSnapshot
from forge.runs import RunService, RunView
from forge.snapshots import SnapshotError, SnapshotFile, SnapshotMaterial, _safe_path
from forge.workspaces import WorkspaceManager


class HandoffError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class CodeSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    snapshotId: UUID
    projectId: UUID
    runId: UUID
    attemptId: UUID
    workspaceId: UUID
    baseRevision: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    baseTree: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    filteredBaseTree: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    commitSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    treeSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    files: list[SnapshotFile] = Field(max_length=10_000)
    excludedPaths: list[str] = Field(max_length=10_000)
    noChange: bool
    createdAt: str

    @field_validator("excludedPaths")
    @classmethod
    def safe_excluded_paths(cls, values: list[str]) -> list[str]:
        for value in values:
            _safe_path(value)
        return values


class HandoffBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    taskId: UUID
    contractRevision: int = Field(ge=1)
    workflowRevision: int = Field(ge=1)
    snapshotId: UUID | None
    runConfigHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    contractRef: str = Field(min_length=1)
    contextBundleId: UUID
    artifactIds: list[UUID]
    humanDecisionIds: list[UUID]
    openIssueIds: list[UUID]
    nativeSessionRef: str | None
    redactionVersion: str = Field(min_length=1)


class AcceptanceResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    criterionId: str = Field(min_length=1)
    status: Literal["pass", "fail", "unverified", "not_applicable"]
    evidenceIds: list[UUID]
    reason: str = Field(min_length=1)


class DevelopmentStepResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    runId: UUID
    attemptId: UUID
    nodeId: str = Field(min_length=1)
    contractRevision: int = Field(ge=1)
    snapshotId: UUID | None
    outcome: Literal[
        "ready", "approved", "needs_changes", "passed", "failed", "inconclusive", "blocked"
    ]
    artifactIds: list[UUID]
    unresolved: list[str]
    acceptanceResults: list[AcceptanceResult]
    summary: str = Field(min_length=1)


class DevelopmentArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    artifactId: UUID
    snapshotId: UUID
    kind: Literal["development-step-result"]
    mime: Literal["application/json"]
    byteSize: int = Field(ge=0)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    redactionVersion: str = Field(min_length=1)
    createdAt: str


class DevelopmentHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    snapshot: CodeSnapshot
    bundle: HandoffBundle
    stepResult: DevelopmentStepResult
    artifact: DevelopmentArtifact


def _json(value: BaseModel) -> str:
    return json.dumps(value.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"))


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _snapshot_digest(snapshot: CodeSnapshot) -> str:
    body = {
        "workspaceId": str(snapshot.workspaceId), "baseRevision": snapshot.baseRevision,
        "treeSha": snapshot.treeSha,
        "files": [item.model_dump(mode="json") for item in snapshot.files],
        "excludedPaths": snapshot.excludedPaths,
    }
    return _digest(json.dumps(body, ensure_ascii=False, separators=(",", ":")))


def build_development_handoff(
    material: SnapshotMaterial, project_id: UUID, attempt_id: UUID,
    run: RunView, config: RunConfigSnapshot, context: ContextBundle,
    checkpoint: WorkingCheckpoint | None, workflow_revision: int,
    no_change_explanation: str | None = None,
) -> DevelopmentHandoff:
    snapshot = CodeSnapshot.model_validate_json(json.dumps({
        **material.model_dump(mode="json"), "schemaVersion": "1.0",
        "projectId": str(project_id), "attemptId": str(attempt_id),
    }))
    if (
        run.state != "succeeded" or run.attempt.state != "succeeded"
        or snapshot.projectId != run.projectId or snapshot.runId != run.runId
        or snapshot.attemptId != run.attempt.attemptId
        or config.projectId != run.projectId or config.runId != run.runId
        or config.taskId != run.taskId or config.snapshotHash != run.configHash
        or context.projectId != run.projectId or context.runId != run.runId
        or context.taskId != run.taskId or context.configHash != config.snapshotHash
        or context.taskRevision != config.taskRevision
        or checkpoint is not None and (
            checkpoint.projectId != run.projectId or checkpoint.runId != run.runId
            or checkpoint.attemptId != run.attempt.attemptId
        )
        or workflow_revision < 1
    ):
        raise HandoffError("HANDOFF_STALE")
    if snapshot.noChange and not (no_change_explanation or "").strip():
        raise HandoffError("HANDOFF_EXPLANATION_REQUIRED")
    summary = (
        f"No permitted code changes were captured. {no_change_explanation}"
        if snapshot.noChange else
        f"Captured {len(snapshot.files)} changed file(s) in an immutable CodeSnapshot. "
        "Review and Verify have not run."
    )
    unresolved = list(dict.fromkeys(
        [item.text for item in checkpoint.openIssues] if checkpoint else []
    ))
    unresolved.append("Review and Verify have not run")
    step_result = DevelopmentStepResult(
        schemaVersion="1.0", runId=run.runId, attemptId=run.attempt.attemptId,
        nodeId=run.attempt.nodeId, contractRevision=config.taskRevision,
        snapshotId=snapshot.snapshotId,
        outcome="inconclusive" if snapshot.noChange else "ready",
        artifactIds=[], unresolved=unresolved,
        acceptanceResults=[AcceptanceResult(
            criterionId=item.id, status="unverified", evidenceIds=[],
            reason="Review and Verify have not run"
        ) for item in config.taskContract.acceptance],
        summary=summary,
    )
    result_bytes = _json(step_result).encode()
    artifact = DevelopmentArtifact(
        artifactId=uuid4(), snapshotId=snapshot.snapshotId,
        kind="development-step-result", mime="application/json",
        byteSize=len(result_bytes), contentHash=hashlib.sha256(result_bytes).hexdigest(),
        redactionVersion="forge-artifact-redaction/v1", createdAt=timestamp(),
    )
    bundle = HandoffBundle(
        schemaVersion="1.0", taskId=run.taskId,
        contractRevision=config.taskRevision, workflowRevision=workflow_revision,
        snapshotId=snapshot.snapshotId, runConfigHash=config.snapshotHash,
        contractRef=f"task:{run.taskId}@{config.taskRevision}",
        contextBundleId=context.bundleId, artifactIds=[artifact.artifactId],
        humanDecisionIds=[], openIssueIds=[], nativeSessionRef=run.attempt.nativeSessionRef,
        redactionVersion=artifact.redactionVersion,
    )
    return DevelopmentHandoff(
        snapshot=snapshot, bundle=bundle, stepResult=step_result, artifact=artifact
    )


class HandoffService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def get(self, project_id: UUID, run_id: UUID) -> DevelopmentHandoff | None:
        row = self.storage.session().execute(
            "SELECT s.snapshot_json,s.content_hash AS snapshot_hash,s.commit_sha,s.tree_sha,"
            "h.bundle_json,a.artifact_id,a.snapshot_id,a.kind,a.mime,a.byte_size,"
            "a.content_hash AS artifact_hash,a.redaction_version,a.content_json,a.created_at "
            "FROM run_handoffs h JOIN code_snapshots s ON s.snapshot_id=h.snapshot_id "
            "JOIN snapshot_artifacts a ON a.artifact_id=h.artifact_id "
            "WHERE s.project_id=? AND h.run_id=?",
            (str(project_id), str(run_id)),
        ).fetchone()
        if row is None:
            return None
        try:
            raw_snapshot = json.loads(row["snapshot_json"])
            value = DevelopmentHandoff.model_validate_json(json.dumps({
                "snapshot": raw_snapshot, "bundle": json.loads(row["bundle_json"]),
                "stepResult": json.loads(row["content_json"]),
                "artifact": {
                    "artifactId": row["artifact_id"], "snapshotId": row["snapshot_id"],
                    "kind": row["kind"], "mime": row["mime"],
                    "byteSize": row["byte_size"], "contentHash": row["artifact_hash"],
                    "redactionVersion": row["redaction_version"],
                    "createdAt": row["created_at"],
                },
            }))
            snapshot = value.snapshot
            for name in snapshot.excludedPaths:
                _safe_path(name)
            if (
                snapshot.projectId != project_id or snapshot.runId != run_id
                or snapshot.contentHash != row["snapshot_hash"]
                or snapshot.commitSha != row["commit_sha"]
                or snapshot.treeSha != row["tree_sha"]
                or _digest(row["content_json"]) != row["artifact_hash"]
                or _snapshot_digest(snapshot) != snapshot.contentHash
                or value.artifact.byteSize != len(row["content_json"].encode())
            ):
                raise HandoffError("HANDOFF_CORRUPT")
            return value
        except (ValueError, ValidationError, HandoffError, SnapshotError) as error:
            raise HandoffError("HANDOFF_CORRUPT") from error

    def save(self, project_id: UUID, value: DevelopmentHandoff) -> DevelopmentHandoff:
        snapshot, bundle, artifact, step_result = (
            value.snapshot, value.bundle, value.artifact, value.stepResult
        )
        result_json = _json(step_result)
        if (
            snapshot.projectId != project_id or snapshot.runId != step_result.runId
            or snapshot.attemptId != step_result.attemptId
            or snapshot.snapshotId != bundle.snapshotId
            or snapshot.snapshotId != artifact.snapshotId
            or step_result.snapshotId != snapshot.snapshotId
            or bundle.artifactIds != [artifact.artifactId]
            or bundle.contractRevision != step_result.contractRevision
            or artifact.byteSize != len(result_json.encode())
            or artifact.contentHash != _digest(result_json)
            or _snapshot_digest(snapshot) != snapshot.contentHash
        ):
            raise HandoffError("HANDOFF_CORRUPT")
        with self.storage.transaction() as db:
            prior = self.get(project_id, snapshot.runId)
            if prior is not None:
                if prior == value:
                    return prior
                raise HandoffError("HANDOFF_CONFLICT")
            run = db.execute(
                "SELECT r.task_id,r.config_hash,r.state,a.attempt_id,"
                "a.state AS attempt_state FROM runs r JOIN run_attempts a ON a.run_id=r.run_id "
                "WHERE r.project_id=? AND r.run_id=?",
                (str(project_id), str(snapshot.runId)),
            ).fetchone()
            if (
                run is None or run["state"] != "succeeded"
                or run["attempt_state"] != "succeeded"
                or run["attempt_id"] != str(snapshot.attemptId)
                or run["task_id"] != str(bundle.taskId)
                or run["config_hash"] != bundle.runConfigHash
                or bundle.contractRef != f"task:{run['task_id']}@{bundle.contractRevision}"
                or step_result.outcome != (
                    "inconclusive" if snapshot.noChange else "ready"
                )
            ):
                raise HandoffError("HANDOFF_STALE")
            db.execute(
                "INSERT INTO code_snapshots(snapshot_id,project_id,run_id,attempt_id,"
                "workspace_id,commit_sha,tree_sha,base_sha,content_hash,snapshot_json,"
                "created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (str(snapshot.snapshotId), str(project_id), str(snapshot.runId),
                 str(snapshot.attemptId), str(snapshot.workspaceId), snapshot.commitSha,
                 snapshot.treeSha, snapshot.baseRevision, snapshot.contentHash,
                 _json(snapshot), snapshot.createdAt),
            )
            db.execute(
                "INSERT INTO snapshot_artifacts(artifact_id,snapshot_id,kind,mime,byte_size,"
                "content_hash,redaction_version,content_json,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (str(artifact.artifactId), str(snapshot.snapshotId), artifact.kind,
                 artifact.mime, artifact.byteSize, artifact.contentHash,
                 artifact.redactionVersion, result_json, artifact.createdAt),
            )
            db.execute(
                "INSERT INTO run_handoffs(run_id,snapshot_id,artifact_id,bundle_json,"
                "created_at) VALUES(?,?,?,?,?)",
                (str(snapshot.runId), str(snapshot.snapshotId), str(artifact.artifactId),
                 _json(bundle), artifact.createdAt),
            )
            return value


class HostSnapshotService:
    def __init__(
        self, storage: ForgePersistence, workspaces: WorkspaceManager,
        processes: ProcessController, runs: RunService, configs: RunConfigService,
        contexts: ContextService,
    ) -> None:
        self.storage = storage
        self.workspaces = workspaces
        self.processes = processes
        self.runs = runs
        self.configs = configs
        self.contexts = contexts
        self.handoffs = HandoffService(storage)

    async def freeze(
        self, project_id: UUID, run_id: UUID, workspace_id: UUID,
        context_bundle_id: UUID, workflow_revision: int,
        no_change_explanation: str | None = None,
    ) -> DevelopmentHandoff:
        prior = self.handoffs.get(project_id, run_id)
        if prior is not None:
            if (
                prior.snapshot.workspaceId != workspace_id
                or prior.bundle.contextBundleId != context_bundle_id
                or prior.bundle.workflowRevision != workflow_revision
            ):
                raise HandoffError("HANDOFF_CONFLICT")
            await self.workspaces.verify_snapshot_ref(
                workspace_id, prior.snapshot.snapshotId,
                prior.snapshot.commitSha, prior.snapshot.treeSha,
            )
            return prior
        run = self.runs.get(project_id, run_id)
        config = self.configs.get(project_id, run_id)
        context = self.contexts.get_bundle(project_id, context_bundle_id)
        if (
            run is None or run.state != "succeeded" or config is None or context is None
            or self.processes.has_active(str(run_id))
        ):
            raise HandoffError("HANDOFF_STALE")
        workspace = self.workspaces.inspect(workspace_id)
        if (
            workspace.ownerRunId != str(run_id) or workspace.status != "ready"
            or workspace.activeLeaseId is not None
        ):
            raise HandoffError("HANDOFF_STALE")
        material = await self.workspaces.freeze_snapshot(
            workspace_id, str(run_id), no_change_explanation
        )
        handoff = build_development_handoff(
            material, project_id, run.attempt.attemptId, run, config, context,
            self.contexts.latest_checkpoint(project_id, run_id), workflow_revision,
            no_change_explanation,
        )
        return self.handoffs.save(project_id, handoff)
