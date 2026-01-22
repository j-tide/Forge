"""P3-02 fail-closed Reviewer profile, context and structured result tests."""

from __future__ import annotations

from uuid import uuid4

import pytest

from forge.drafts import AcceptanceCriterion, TaskContract
from forge.handoffs import CodeSnapshot, DevelopmentHandoff, HandoffBundle
from forge.review import (
    ReviewError,
    build_review_context,
    evaluate_review_result,
    load_reviewer_profile,
)
from forge.run_config import RunConfigSnapshot
from forge.run_inspection import RunDiffPreview, RunFileChange
from forge.snapshots import SnapshotFile


def fixture() -> tuple[DevelopmentHandoff, RunConfigSnapshot, RunDiffPreview]:
    project_id, task_id, run_id, snapshot_id = (uuid4() for _ in range(4))
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(task_id), projectId=str(project_id),
        revision=2, title="Review add", type="feature", goal="Reject invalid inputs",
        acceptance=[AcceptanceCriterion(
            id="AC-01", statement="Invalid inputs raise TypeError", method="automated",
            required=True, sourceRefs=["decision:human-01"],
        )], constraints=[], scope=["math.js"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=["decision:human-01"],
        workflowRef="standard@1", priority="normal",
    )
    config = RunConfigSnapshot.model_construct(
        projectId=project_id, taskId=task_id, runId=run_id, taskRevision=2,
        snapshotHash="a" * 64, taskContract=contract,
    )
    snapshot = CodeSnapshot.model_construct(
        projectId=project_id, runId=run_id, snapshotId=snapshot_id,
        commitSha="b" * 40, treeSha="c" * 40,
        files=[SnapshotFile(path="math.js", kind="modified",
                            blobSha="d" * 40, byteSize=50)],
    )
    bundle = HandoffBundle.model_construct(
        taskId=task_id, contractRevision=2, runConfigHash="a" * 64,
        snapshotId=snapshot_id,
    )
    handoff = DevelopmentHandoff.model_construct(snapshot=snapshot, bundle=bundle)
    diff = RunDiffPreview(
        files=[{"path": "math.js", "status": "modified"}],
        text="diff --git a/math.js b/math.js\nAuthorization: Bearer secretvalue\n",
        truncated=False, capturedAt="2026-09-24T00:00:00Z",
    )
    return handoff, config, diff


def result(context: object) -> dict[str, object]:
    assert hasattr(context, "snapshotId") and hasattr(context, "taskId")
    return {
        "schemaVersion": "1.0", "snapshotId": str(context.snapshotId),
        "taskId": str(context.taskId), "contractRevision": 2,
        "profileRevision": 1, "outcome": "approved",
        "blockingIssues": [], "suggestions": [], "unknowns": [],
        "summary": "No actionable issues in the supplied snapshot",
    }


def test_profile_and_independent_context_are_bounded() -> None:
    profile, prompt = load_reviewer_profile()
    assert profile.role == "reviewer" and profile.policyProfile == "read-only"
    assert profile.executorId == "executor.codex" and profile.modelId is None
    assert "Do not write product code" in prompt
    handoff, config, diff = fixture()
    context = build_review_context(handoff, config, diff)
    assert context.snapshotId == handoff.snapshot.snapshotId
    assert context.goal == "Reject invalid inputs"
    assert context.changedFiles == ["math.js"]
    assert "secretvalue" not in context.diffText and "[REDACTED]" in context.diffText
    assert context.unavailable == ["plan", "self-check", "project-rules"]
    assert evaluate_review_result(result(context), context, profile).status == "approved"
    with pytest.raises(ReviewError, match="REVIEW_CONTEXT_STALE"):
        build_review_context(handoff, config.model_copy(update={"taskRevision": 3}), diff)
    with pytest.raises(ReviewError, match="REVIEW_CONTEXT_STALE"):
        build_review_context(handoff, config, diff.model_copy(update={
            "files": [RunFileChange(path="elsewhere.js", status="modified")],
        }))


def test_review_result_cannot_approve_when_missing_invalid_or_stale() -> None:
    profile, _ = load_reviewer_profile()
    handoff, config, diff = fixture()
    context = build_review_context(handoff, config, diff)
    valid = result(context)
    assert evaluate_review_result(None, context, profile).code == "REVIEW_RESULT_MISSING"
    assert evaluate_review_result({"outcome": "approved"}, context, profile).status == (
        "inconclusive"
    )
    stale = evaluate_review_result({**valid, "snapshotId": str(uuid4())}, context, profile)
    assert stale.status == "stale" and stale.result is None
    assert evaluate_review_result({**valid, "profileRevision": 2},
                                  context, profile).status == "stale"

    finding = {
        "anchor": {"path": "math.js", "lineStart": 2, "lineEnd": 2},
        "basis": {"kind": "acceptance", "sourceRef": "AC-01"},
        "reason": "Invalid input still reaches addition", "impact": "AC-01 fails",
    }
    assert evaluate_review_result({**valid, "blockingIssues": [finding]},
                                  context, profile).code == "REVIEW_RESULT_INVALID"
    assert evaluate_review_result({**valid, "outcome": "changes_requested",
                                   "blockingIssues": [finding]},
                                  context, profile).status == "changes_requested"
    assert evaluate_review_result({**valid, "outcome": "changes_requested"},
                                  context, profile).status == "inconclusive"
    assert evaluate_review_result({**valid, "unknowns": [
        {"question": "Is the API public?", "impact": "Unclear compatibility"},
    ]}, context, profile).status == "inconclusive"
    for broken in (
        {**finding, "anchor": None},
        {**finding, "anchor": {"path": "../escape", "lineStart": 1, "lineEnd": 1}},
        {**finding, "anchor": {"path": "math.js", "lineStart": 3, "lineEnd": 2}},
        {**finding, "basis": {"kind": "acceptance", "sourceRef": "AC-404"}},
        {**finding, "basis": None},
    ):
        invalid = evaluate_review_result({**valid, "outcome": "changes_requested",
                                          "blockingIssues": [broken]}, context, profile)
        assert invalid.status == "inconclusive" and invalid.result is None
