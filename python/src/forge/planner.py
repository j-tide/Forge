"""Validated, Host-owned results of a read-only Planner stage."""

from __future__ import annotations

import hashlib
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.approvals import canonical_json
from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.run_config import RunConfigService, RunConfigSnapshot
from forge.workflow_drafts import WorkflowDraftError, WorkflowDraftService


class PlannerError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    description: str = Field(min_length=1, max_length=1000)
    paths: list[str] = Field(max_length=16)
    dependsOn: list[str] = Field(max_length=10)
    checks: list[str] = Field(max_length=12)


class PlanAcceptanceResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    criterionId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    status: str = Field(pattern=r"^(pass|fail|unverified|not_applicable)$")
    evidenceIds: list[str]
    reason: str = Field(min_length=1)


class PlanResult(BaseModel):
    """Exact public plan-result.schema.json shape, with additional Host semantics below."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: str = Field(pattern=r"^1\.0$")
    runId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    attemptId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    nodeId: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    contractRevision: int = Field(ge=1)
    snapshotId: str | None
    outcome: str = Field(pattern=r"^(ready|blocked|inconclusive)$")
    artifactIds: list[str]
    unresolved: list[str]
    acceptanceResults: list[PlanAcceptanceResult]
    summary: str = Field(min_length=1, max_length=2000)
    plan: list[PlanStep] = Field(min_length=1, max_length=10)


class PlanArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    artifactId: UUID
    projectId: UUID
    taskId: UUID
    runId: UUID
    attemptId: UUID
    taskRevision: int = Field(ge=1)
    taskContractHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    profileId: str
    profileRevision: int = Field(ge=1)
    profileHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    baseRevision: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    result: PlanResult
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    createdAt: str


class PlanGateView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    artifact: PlanArtifact
    requiresApproval: bool
    decision: Literal["pending", "automatic", "approved", "rejected"]
    developmentRunId: UUID | None
    decidedAt: str | None
    reason: str | None


def plan_request_goal(prompt_template: str, config: RunConfigSnapshot,
                      attempt_id: UUID) -> str:
    """Give the model Host-owned output identity without weakening validation."""
    identity = {
        "runId": str(config.runId), "attemptId": str(attempt_id),
        "nodeId": "plan", "contractRevision": config.taskRevision,
        "acceptanceCriterionIds": [item.id for item in config.taskContract.acceptance],
    }
    return (
        f"{prompt_template}\n\n"
        "Return a plan-result/v1 JSON object. Copy these Host-owned identity fields "
        "exactly; never use placeholders. Do not claim completed acceptance, a code "
        "snapshot, or an artifact. Leave artifactIds and evidenceIds empty, and use "
        "unverified or not_applicable for acceptanceResults. If you can give a "
        "concrete implementation plan, set outcome to ready even though acceptance "
        "is not yet verified; otherwise report blocked or inconclusive and the Run "
        "will fail closed.\n"
        f"Host identity: {canonical_json(identity)}\n\n"
        f"Approved Task goal: {config.taskContract.goal}"
    )


def validate_plan_result(value: object, *, config: RunConfigSnapshot,
                         attempt_id: UUID) -> PlanResult:
    """A plan cannot rewrite the approved Contract or claim execution evidence."""
    try:
        result = PlanResult.model_validate(value)
    except ValidationError as error:
        raise PlannerError("PLAN_RESULT_INVALID") from error
    ids = [step.id for step in result.plan]
    criteria = {item.id for item in config.taskContract.acceptance}
    if (result.runId != str(config.runId) or result.attemptId != str(attempt_id)
            or result.nodeId != "plan" or result.contractRevision != config.taskRevision
            or result.snapshotId is not None or result.artifactIds
            or result.outcome != "ready" or result.unresolved
            or len(ids) != len(set(ids))
            or len({item.criterionId for item in result.acceptanceResults}) !=
            len(result.acceptanceResults)
            or any(item.criterionId not in criteria or item.status not in (
                "unverified", "not_applicable"
            ) or item.evidenceIds for item in result.acceptanceResults)):
        raise PlannerError("PLAN_RESULT_INVALID")
    visited: set[str] = set()
    for step in result.plan:
        if (len(step.dependsOn) != len(set(step.dependsOn))
                or any(parent not in visited for parent in step.dependsOn)
                or any(not path or path.startswith(("/", "\\")) or "\\" in path
                       or any(part in ("", ".", "..") for part in path.split("/"))
                       for path in step.paths)):
            raise PlannerError("PLAN_RESULT_INVALID")
        visited.add(step.id)
    return result


class PlanArtifactService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def get(self, project_id: UUID, run_id: UUID) -> PlanArtifact | None:
        row = self.storage.session().execute(
            "SELECT p.artifact_json,p.content_hash,r.state FROM plan_artifacts p "
            "JOIN runs r ON r.run_id=p.run_id WHERE p.project_id=? AND p.run_id=?",
            (str(project_id), str(run_id)),
        ).fetchone()
        if row is None:
            return None
        if row["state"] != "succeeded":
            raise PlannerError("PLAN_NOT_READY")
        raw = row["artifact_json"]
        if hashlib.sha256(raw.encode()).hexdigest() != row["content_hash"]:
            raise PlannerError("PLAN_ARTIFACT_CORRUPT")
        try:
            artifact = PlanArtifact.model_validate_json(raw)
        except ValidationError as error:
            raise PlannerError("PLAN_ARTIFACT_CORRUPT") from error
        body = artifact.model_dump(mode="json", exclude={"contentHash"})
        if (artifact.projectId != project_id or artifact.runId != run_id
                or hashlib.sha256(canonical_json(body).encode()).hexdigest() !=
                artifact.contentHash):
            raise PlannerError("PLAN_ARTIFACT_CORRUPT")
        return artifact

    def gate(self, project_id: UUID, task_id: UUID, run_id: UUID,
             configs: RunConfigService, workflows: WorkflowDraftService,
             ) -> PlanGateView | None:
        artifact = self.get(project_id, run_id)
        if artifact is None:
            return None
        if artifact.taskId != task_id:
            raise PlannerError("PLAN_BASIS_STALE")
        config = configs.get(project_id, run_id)
        if config is None or config.taskId != task_id or (
            config.taskContractHash != artifact.taskContractHash
            or config.workflow.id != config.taskContract.workflowRef
        ):
            raise PlannerError("PLAN_BASIS_STALE")
        try:
            publication = workflows.published(
                config.workflow.id, int(config.workflow.version),
            )
        except (WorkflowDraftError, ValueError) as error:
            raise PlannerError("PLAN_BASIS_STALE") from error
        if publication.contentHash != config.workflow.contentHash:
            raise PlannerError("PLAN_BASIS_STALE")
        return self.view(artifact, require_human=any(
            node.id == "approve_plan" for node in publication.definition.nodes
        ))

    def save(self, *, config: RunConfigSnapshot, attempt_id: UUID,
             profile_id: str, profile_revision: int, profile_hash: str,
             base_revision: str, value: object) -> PlanArtifact:
        result = validate_plan_result(value, config=config, attempt_id=attempt_id)
        body = {
            "artifactId": str(uuid4()), "projectId": str(config.projectId),
            "taskId": str(config.taskId), "runId": str(config.runId),
            "attemptId": str(attempt_id), "taskRevision": config.taskRevision,
            "taskContractHash": config.taskContractHash,
            "profileId": profile_id, "profileRevision": profile_revision,
            "profileHash": profile_hash, "baseRevision": base_revision,
            "result": result.model_dump(mode="json"), "createdAt": timestamp(),
        }
        body["contentHash"] = hashlib.sha256(canonical_json(body).encode()).hexdigest()
        artifact = PlanArtifact.model_validate_json(canonical_json(body))
        raw = artifact.model_dump_json()
        with self.storage.transaction() as db:
            if db.execute("SELECT 1 FROM plan_artifacts WHERE run_id=?",
                          (str(config.runId),)).fetchone():
                raise PlannerError("PLAN_ARTIFACT_CONFLICT")
            db.execute(
                "INSERT INTO plan_artifacts(artifact_id,project_id,task_id,run_id,"
                "attempt_id,content_hash,artifact_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
                (str(artifact.artifactId), str(config.projectId), str(config.taskId),
                 str(config.runId), str(attempt_id),
                 hashlib.sha256(raw.encode()).hexdigest(), raw, artifact.createdAt),
            )
        return artifact

    def continuation(self, artifact: PlanArtifact,
                     *, require_human: bool) -> UUID | None:
        row = self.storage.session().execute(
            "SELECT state,artifact_hash,development_run_id FROM plan_continuations "
            "WHERE plan_run_id=?", (str(artifact.runId),),
        ).fetchone()
        if row is None:
            if require_human:
                return None
            return self.decide(artifact, "automatic")
        if row["artifact_hash"] != artifact.contentHash:
            raise PlannerError("PLAN_ARTIFACT_STALE")
        if row["state"] == "rejected":
            raise PlannerError("PLAN_REJECTED")
        if require_human and row["state"] != "approved":
            raise PlannerError("PLAN_APPROVAL_REQUIRED")
        if not require_human and row["state"] != "automatic":
            raise PlannerError("PLAN_DECISION_CONFLICT")
        return UUID(row["development_run_id"])

    def view(self, artifact: PlanArtifact, *, require_human: bool) -> PlanGateView:
        row = self.storage.session().execute(
            "SELECT state,artifact_hash,development_run_id,decided_at,reason "
            "FROM plan_continuations WHERE plan_run_id=?",
            (str(artifact.runId),),
        ).fetchone()
        if row is not None and row["artifact_hash"] != artifact.contentHash:
            raise PlannerError("PLAN_ARTIFACT_STALE")
        return PlanGateView(
            artifact=artifact, requiresApproval=require_human,
            decision=row["state"] if row else "pending",
            developmentRunId=UUID(row["development_run_id"])
            if row and row["development_run_id"] else None,
            decidedAt=row["decided_at"] if row else None,
            reason=row["reason"] if row else None,
        )

    def decide(self, artifact: PlanArtifact,
               decision: str, *, reason: str | None = None) -> UUID | None:
        if decision not in ("automatic", "approved", "rejected"):
            raise PlannerError("PLAN_DECISION_INVALID")
        if decision == "rejected" and (reason is None or len(reason.strip()) < 12):
            raise PlannerError("PLAN_DECISION_INVALID")
        if decision == "automatic" and reason is not None:
            raise PlannerError("PLAN_DECISION_INVALID")
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT state,artifact_hash,development_run_id,reason FROM plan_continuations "
                "WHERE plan_run_id=?", (str(artifact.runId),),
            ).fetchone()
            if row is not None:
                if (row["artifact_hash"] != artifact.contentHash or row["state"] != decision
                        or row["reason"] != reason):
                    raise PlannerError("PLAN_DECISION_CONFLICT")
                return UUID(row["development_run_id"]) if row["development_run_id"] else None
            development_id = uuid4() if decision != "rejected" else None
            db.execute(
                "INSERT INTO plan_continuations(plan_run_id,development_run_id,state,"
                "artifact_hash,decided_at,decided_by,reason) VALUES(?,?,?,?,?,?,?)",
                (str(artifact.runId), str(development_id) if development_id else None,
                 decision, artifact.contentHash, timestamp(),
                 "host" if decision == "automatic" else "local-user", reason),
            )
        return development_id
