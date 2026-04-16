"""Read-only, exhaustive outcome accounting for an isolated Forge evaluation DB."""

from __future__ import annotations

import sqlite3
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.runs import RunState

Outcome = Literal[
    "accepted_delivery", "succeeded_unaccepted", "failed", "cancelled",
    "interrupted", "in_progress",
]
_TERMINAL: set[str] = {"succeeded", "failed", "cancelled", "interrupted"}
_MAX_RUNS = 10_000


class EvaluationError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class EvaluationRun(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: UUID
    taskId: UUID
    state: RunState
    acceptedDelivery: bool


class EvaluationRunOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: UUID
    taskId: UUID
    state: RunState
    outcome: Outcome


class EvaluationOutcomeReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["forge-evaluation-outcomes/v1"] = "forge-evaluation-outcomes/v1"
    totalRuns: int = Field(ge=0)
    acceptedDeliveryRuns: int = Field(ge=0)
    succeededUnacceptedRuns: int = Field(ge=0)
    failedRuns: int = Field(ge=0)
    cancelledRuns: int = Field(ge=0)
    interruptedRuns: int = Field(ge=0)
    inProgressRuns: int = Field(ge=0)
    allRunsTerminal: bool
    outcomes: list[EvaluationRunOutcome]


def summarize_outcomes(runs: list[EvaluationRun]) -> EvaluationOutcomeReport:
    """Include every Run; a successful executor is not an accepted Task delivery."""
    if not runs:
        raise EvaluationError("EVALUATION_EMPTY")
    if len(runs) > _MAX_RUNS or len({item.runId for item in runs}) != len(runs):
        raise EvaluationError("EVALUATION_INPUT_INVALID")
    outcomes: list[EvaluationRunOutcome] = []
    counts: dict[Outcome, int] = {
        "accepted_delivery": 0, "succeeded_unaccepted": 0, "failed": 0,
        "cancelled": 0, "interrupted": 0, "in_progress": 0,
    }
    for run in runs:
        if run.acceptedDelivery and run.state != "succeeded":
            raise EvaluationError("EVALUATION_DELIVERY_INCONSISTENT")
        outcome: Outcome = (
            "accepted_delivery" if run.acceptedDelivery else
            "succeeded_unaccepted" if run.state == "succeeded" else
            "failed" if run.state == "failed" else
            "cancelled" if run.state == "cancelled" else
            "interrupted" if run.state == "interrupted" else "in_progress"
        )
        counts[outcome] += 1
        outcomes.append(EvaluationRunOutcome(
            runId=run.runId, taskId=run.taskId, state=run.state, outcome=outcome
        ))
    return EvaluationOutcomeReport(
        totalRuns=len(runs), acceptedDeliveryRuns=counts["accepted_delivery"],
        succeededUnacceptedRuns=counts["succeeded_unaccepted"],
        failedRuns=counts["failed"], cancelledRuns=counts["cancelled"],
        interruptedRuns=counts["interrupted"],
        inProgressRuns=counts["in_progress"],
        allRunsTerminal=all(item.state in _TERMINAL for item in runs), outcomes=outcomes,
    )


def read_run_outcomes(db: sqlite3.Connection) -> EvaluationOutcomeReport:
    """Tie delivery to the exact frozen snapshot and include all database Runs."""
    rows = db.execute(
        "SELECT r.run_id,r.task_id,r.state,EXISTS("
        "SELECT 1 FROM code_snapshots s JOIN delivery_records d "
        "ON d.snapshot_id=s.snapshot_id AND d.project_id=s.project_id "
        "JOIN final_acceptance_decisions a ON a.decision_id=d.acceptance_decision_id "
        "AND a.snapshot_id=s.snapshot_id AND a.project_id=d.project_id "
        "AND a.task_id=d.task_id AND a.decision='accept' WHERE s.run_id=r.run_id "
        "AND s.project_id=r.project_id AND d.task_id=r.task_id) AS accepted "
        "FROM runs r ORDER BY r.created_at,r.run_id LIMIT ?",
        (_MAX_RUNS + 1,),
    ).fetchall()
    if len(rows) > _MAX_RUNS:
        raise EvaluationError("EVALUATION_TOO_MANY_RUNS")
    try:
        runs = [EvaluationRun(
            runId=UUID(row["run_id"]), taskId=UUID(row["task_id"]),
            state=row["state"], acceptedDelivery=bool(row["accepted"]),
        ) for row in rows]
    except (ValueError, TypeError, ValidationError) as error:
        raise EvaluationError("EVALUATION_INPUT_INVALID") from error
    return summarize_outcomes(runs)
