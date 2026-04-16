"""A cancelled or interrupted Run never contributes to accepted delivery."""

from __future__ import annotations

import sqlite3
from uuid import UUID

import pytest

from forge.evaluation_outcomes import (
    EvaluationError,
    EvaluationRun,
    read_run_outcomes,
    summarize_outcomes,
)


def _run(number: int, state: str, accepted: bool = False) -> EvaluationRun:
    return EvaluationRun.model_validate({
        "runId": UUID(int=number), "taskId": UUID(int=number + 100),
        "state": state, "acceptedDelivery": accepted,
    })


def test_outcomes_keep_cancelled_interrupted_and_unaccepted_separate() -> None:
    report = summarize_outcomes([
        _run(1, "succeeded", True), _run(2, "succeeded"),
        _run(3, "cancelled"), _run(4, "interrupted"), _run(5, "failed"),
    ])
    assert report.allRunsTerminal and report.totalRuns == 5
    assert (report.acceptedDeliveryRuns, report.succeededUnacceptedRuns,
            report.cancelledRuns, report.interruptedRuns, report.failedRuns) == (1, 1, 1, 1, 1)
    assert [item.outcome for item in report.outcomes] == [
        "accepted_delivery", "succeeded_unaccepted", "cancelled", "interrupted", "failed"
    ]
    assert len({item.runId for item in report.outcomes}) == report.totalRuns


def test_active_run_keeps_evaluation_incomplete_and_bad_delivery_fails_closed() -> None:
    report = summarize_outcomes([_run(1, "running"), _run(2, "canceling")])
    assert not report.allRunsTerminal and report.inProgressRuns == 2
    with pytest.raises(EvaluationError, match="EVALUATION_EMPTY"):
        summarize_outcomes([])
    with pytest.raises(EvaluationError, match="EVALUATION_DELIVERY_INCONSISTENT"):
        summarize_outcomes([_run(3, "cancelled", True)])
    with pytest.raises(EvaluationError, match="EVALUATION_INPUT_INVALID"):
        summarize_outcomes([_run(4, "succeeded"), _run(4, "succeeded")])


def test_sql_reader_matches_delivery_to_exact_snapshot_not_other_run() -> None:
    with sqlite3.connect(":memory:") as db:
        db.row_factory = sqlite3.Row
        db.executescript("""
            CREATE TABLE runs(
                run_id TEXT,project_id TEXT,task_id TEXT,state TEXT,created_at TEXT
            );
            CREATE TABLE code_snapshots(
                snapshot_id TEXT,project_id TEXT,run_id TEXT
            );
            CREATE TABLE delivery_records(
                delivery_id TEXT,snapshot_id TEXT,project_id TEXT,task_id TEXT,
                acceptance_decision_id TEXT
            );
            CREATE TABLE final_acceptance_decisions(
                decision_id TEXT,snapshot_id TEXT,project_id TEXT,task_id TEXT,decision TEXT
            );
        """)
        first, second, third = [str(UUID(int=number)) for number in (1, 2, 3)]
        task = str(UUID(int=101))
        project = str(UUID(int=201))
        db.executemany("INSERT INTO runs VALUES(?,?,?,?,?)", [
            (first, project, task, "succeeded", "1"),
            (second, project, task, "succeeded", "2"),
            (third, project, task, "cancelled", "3"),
        ])
        db.execute(
            "INSERT INTO code_snapshots VALUES(?,?,?)", ("snapshot-1", project, second)
        )
        db.execute(
            "INSERT INTO delivery_records VALUES(?,?,?,?,?)",
            ("delivery-1", "snapshot-1", project, task, "decision-1"),
        )
        db.execute(
            "INSERT INTO final_acceptance_decisions VALUES(?,?,?,?,?)",
            ("decision-1", "snapshot-1", project, task, "accept"),
        )
        report = read_run_outcomes(db)
    assert [item.outcome for item in report.outcomes] == [
        "succeeded_unaccepted", "accepted_delivery", "cancelled"
    ]
