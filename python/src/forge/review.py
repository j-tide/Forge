"""P3-02 Reviewer profile, independent context and fail-closed result validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from forge.handoffs import DevelopmentHandoff
from forge.run_config import RunConfigSnapshot
from forge.run_inspection import RunDiffPreview, redact
from forge.snapshots import SnapshotError, _safe_path


class ReviewError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ReviewerLimits(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    maxTurns: int = Field(ge=1, le=1000)
    maxSeconds: int = Field(ge=1, le=3600)
    maxOutputTokens: int = Field(ge=1, le=100_000)


class ReviewerProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    id: Literal["profile.reviewer"]
    revision: int = Field(ge=1)
    name: str = Field(min_length=1)
    role: Literal["reviewer"]
    executorId: Literal["executor.codex"]
    modelId: str | None
    promptTemplate: Literal["prompts/reviewer.md"]
    contextProviders: list[Literal["task-contract", "snapshot-diff"]]
    policyProfile: Literal["read-only"]
    limits: ReviewerLimits


def load_reviewer_profile() -> tuple[ReviewerProfile, str]:
    package_dir = Path(__file__).parent
    try:
        profile = ReviewerProfile.model_validate_json(
            (package_dir / "presets/reviewer.profile.json").read_text()
        )
        prompt = (package_dir / profile.promptTemplate).read_text().strip()
        if not prompt or set(profile.contextProviders) != {"task-contract", "snapshot-diff"}:
            raise ReviewError("REVIEW_PROFILE_INVALID")
        return profile, prompt
    except (OSError, ValidationError) as error:
        raise ReviewError("REVIEW_PROFILE_INVALID") from error


class ReviewContext(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    developmentRunId: UUID
    snapshotId: UUID
    commitSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    treeSha: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    contractRevision: int = Field(ge=1)
    goal: str = Field(min_length=1, max_length=20_000)
    acceptance: list[dict[str, str]] = Field(min_length=1, max_length=100)
    changedFiles: list[str] = Field(max_length=10_000)
    diffText: str = Field(max_length=65_536)
    diffTruncated: bool
    unavailable: list[Literal["plan", "self-check", "project-rules"]]


def build_review_context(
    handoff: DevelopmentHandoff, config: RunConfigSnapshot,
    diff: RunDiffPreview | None,
) -> ReviewContext:
    snapshot = handoff.snapshot
    if (
        snapshot.projectId != config.projectId or snapshot.runId != config.runId
        or handoff.bundle.taskId != config.taskId
        or handoff.bundle.contractRevision != config.taskRevision
        or handoff.bundle.runConfigHash != config.snapshotHash
        or handoff.bundle.snapshotId != snapshot.snapshotId
        or config.taskContract.projectId != str(config.projectId)
        or config.taskContract.taskId != str(config.taskId)
    ):
        raise ReviewError("REVIEW_CONTEXT_STALE")
    snapshot_paths = {item.path for item in snapshot.files}
    if diff is not None and any(file.path not in snapshot_paths for file in diff.files):
        raise ReviewError("REVIEW_CONTEXT_STALE")
    goal = config.taskContract.goal
    if len(goal) > 20_000:
        raise ReviewError("REVIEW_CONTEXT_TOO_LARGE")
    return ReviewContext(
        projectId=config.projectId, taskId=config.taskId,
        developmentRunId=config.runId, snapshotId=snapshot.snapshotId,
        commitSha=snapshot.commitSha, treeSha=snapshot.treeSha,
        contractRevision=config.taskRevision, goal=goal,
        acceptance=[{"id": item.id, "statement": item.statement}
                    for item in config.taskContract.acceptance],
        changedFiles=[item.path for item in snapshot.files],
        diffText=redact(diff.text) if diff else "",
        diffTruncated=diff is None or diff.truncated,
        unavailable=["plan", "self-check", "project-rules"],
    )


class FileAnchor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    path: str = Field(min_length=1, max_length=4096)
    lineStart: int = Field(ge=1)
    lineEnd: int = Field(ge=1)

    @field_validator("path")
    @classmethod
    def safe_path(cls, value: str) -> str:
        try:
            _safe_path(value)
        except SnapshotError as error:
            raise ValueError("Unsafe review anchor") from error
        return value


class ReviewBasis(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["acceptance", "engineering"]
    sourceRef: str = Field(min_length=1, max_length=256)


class ReviewFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    anchor: FileAnchor
    basis: ReviewBasis
    reason: str = Field(min_length=1, max_length=4000)
    impact: str = Field(min_length=1, max_length=4000)


class ReviewUnknown(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    question: str = Field(min_length=1, max_length=4000)
    impact: str = Field(min_length=1, max_length=4000)


class ReviewResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    snapshotId: UUID
    taskId: UUID
    contractRevision: int = Field(ge=1)
    profileRevision: int = Field(ge=1)
    outcome: Literal["approved", "changes_requested", "inconclusive"]
    blockingIssues: list[ReviewFinding] = Field(max_length=100)
    suggestions: list[ReviewFinding] = Field(max_length=100)
    unknowns: list[ReviewUnknown] = Field(max_length=100)
    summary: str = Field(min_length=1, max_length=4000)


class ReviewEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["approved", "changes_requested", "inconclusive", "stale"]
    result: ReviewResult | None
    code: str | None


def evaluate_review_result(
    raw: Any, context: ReviewContext, profile: ReviewerProfile,
) -> ReviewEvaluation:
    if raw is None:
        return ReviewEvaluation(status="inconclusive", result=None,
                                code="REVIEW_RESULT_MISSING")
    try:
        result = ReviewResult.model_validate_json(json.dumps(raw))
    except (TypeError, ValueError, ValidationError):
        return ReviewEvaluation(status="inconclusive", result=None,
                                code="REVIEW_RESULT_INVALID")
    if (
        result.snapshotId != context.snapshotId or result.taskId != context.taskId
        or result.contractRevision != context.contractRevision
        or result.profileRevision != profile.revision
    ):
        return ReviewEvaluation(status="stale", result=None, code="REVIEW_RESULT_STALE")
    acceptance_ids = {item["id"] for item in context.acceptance}
    for item in [*result.blockingIssues, *result.suggestions]:
        if (
            item.anchor.lineEnd < item.anchor.lineStart
            or item.basis.kind == "acceptance" and item.basis.sourceRef not in acceptance_ids
        ):
            return ReviewEvaluation(status="inconclusive", result=None,
                                    code="REVIEW_RESULT_INVALID")
    if result.outcome == "approved" and (result.blockingIssues or result.unknowns):
        return ReviewEvaluation(status="inconclusive", result=None,
                                code="REVIEW_RESULT_INVALID")
    if result.outcome == "changes_requested" and not result.blockingIssues:
        return ReviewEvaluation(status="inconclusive", result=None,
                                code="REVIEW_RESULT_INVALID")
    return ReviewEvaluation(status=result.outcome, result=result, code=None)
