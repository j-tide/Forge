"""A Planner result is evidence for the approved task, never a new task contract."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest

from forge.drafts import AcceptanceCriterion, TaskContract
from forge.persistence import ForgePersistence
from forge.planner import PlannerError, plan_request_goal, validate_plan_result
from forge.run_config import RunConfigSnapshot


def plan_fixture() -> tuple[RunConfigSnapshot, UUID, dict[str, object]]:
    run_id, task_id, project_id, attempt_id = uuid4(), uuid4(), uuid4(), uuid4()
    contract = TaskContract(
        schemaVersion="1.0", taskId=str(task_id), projectId=str(project_id),
        revision=2, title="Validate inputs", type="feature",
        goal="Implement input validation",
        acceptance=[AcceptanceCriterion(
            id="ac1", statement="Reject invalid input", method="automated",
            required=True, sourceRefs=["message:fixture"],
        )], constraints=[], scope=["src/add.py"], outOfScope=[], dependencies=[],
        openQuestions=[], assumptions=[], sourceRefs=["message:fixture"],
        workflowRef="workflow.standard-fixture", priority="normal",
    )
    config = cast(RunConfigSnapshot, SimpleNamespace(
        runId=run_id, taskRevision=2, taskContract=contract,
    ))
    result: dict[str, object] = {
        "schemaVersion": "1.0", "runId": str(run_id),
        "attemptId": str(attempt_id), "nodeId": "plan", "contractRevision": 2,
        "snapshotId": None, "outcome": "ready", "artifactIds": [],
        "unresolved": [], "acceptanceResults": [{
            "criterionId": "ac1", "status": "unverified", "evidenceIds": [],
            "reason": "To be tested after implementation",
        }], "summary": "Add guards, then test them.",
        "plan": [{"id": "step1", "description": "Validate inputs",
                  "paths": ["src/add.py"], "dependsOn": [],
                  "checks": ["Run the project tests"]}],
    }
    return config, attempt_id, result


def test_plan_result_requires_exact_approved_identity_and_no_fake_evidence() -> None:
    config, attempt_id, result = plan_fixture()
    assert validate_plan_result(result, config=config, attempt_id=attempt_id).nodeId == "plan"
    changes = (
        {"runId": str(uuid4())}, {"nodeId": "develop"},
        {"contractRevision": 3}, {"outcome": "blocked"},
        {"snapshotId": "invented"}, {"artifactIds": ["invented"]},
        {"acceptanceResults": [{"criterionId": "ac1", "status": "pass",
                                "evidenceIds": ["fake"], "reason": "claimed"}]},
        {"acceptanceResults": [{"criterionId": "new-ac", "status": "unverified",
                                "evidenceIds": [], "reason": "invented"}]},
    )
    for changed in changes:
        with pytest.raises(PlannerError, match="PLAN_RESULT_INVALID"):
            validate_plan_result({**result, **changed}, config=config,
                                 attempt_id=attempt_id)


def test_plan_prompt_exposes_host_identity_without_loosening_result_validation() -> None:
    config, attempt_id, result = plan_fixture()
    goal = plan_request_goal("Read only", config, attempt_id)
    assert str(config.runId) in goal and str(attempt_id) in goal
    assert "ac1" in goal and "contractRevision" in goal
    assert config.taskContract.goal in goal
    with pytest.raises(PlannerError, match="PLAN_RESULT_INVALID"):
        validate_plan_result({**result, "runId": "unknown"}, config=config,
                             attempt_id=attempt_id)


def test_plan_steps_require_bounded_relative_paths_and_ordered_dependencies() -> None:
    config, attempt_id, result = plan_fixture()
    for path in ("/etc/passwd", "../outside", "src/../../outside", "C:\\outside"):
        step = {**result["plan"][0], "paths": [path]}  # type: ignore[index]
        with pytest.raises(PlannerError, match="PLAN_RESULT_INVALID"):
            validate_plan_result({**result, "plan": [step]}, config=config,
                                 attempt_id=attempt_id)
    step = {**result["plan"][0], "dependsOn": ["later"]}  # type: ignore[index]
    with pytest.raises(PlannerError, match="PLAN_RESULT_INVALID"):
        validate_plan_result({**result, "plan": [step]}, config=config,
                             attempt_id=attempt_id)


def test_plan_artifact_migration_is_additive(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path)
    storage.open()
    assert storage.migrate(36) == 36
    storage.set_metadata("preserved", "yes")
    assert storage.migrate(37) == 37
    assert storage.migrate(37) == 37
    assert storage.get_metadata("preserved") == "yes"
    assert storage.session().execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='plan_artifacts'"
    ).fetchone() is not None
    storage.close()
