"""Summarize all Run outcomes in an isolated Forge output/qa database, read-only."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from uuid import UUID, uuid4

from forge.acceptance_matrix import AcceptanceMatrixError, AcceptanceMatrixService
from forge.environments import EnvironmentService
from forge.evaluation_outcomes import EvaluationError, read_run_outcomes
from forge.final_acceptance import FinalAcceptanceError, FinalAcceptanceService
from forge.handoffs import HandoffService
from forge.persistence import ForgePersistence, PersistenceError
from forge.processes import ProcessController
from forge.projects import ProjectService
from forge.run_config import RunConfigError, RunConfigService
from forge.verifier_project import ProjectCommandVerifier, VerifierError

SUPPORTED_EVALUATION_SCHEMAS = frozenset((35, 36))


def _verify_current_deliveries(
    path: Path, db: sqlite3.Connection, accepted_run_ids: list[UUID]
) -> None:
    """Apply the same current-basis gate as the Host before counting delivery."""
    if not accepted_run_ids:
        return
    storage = ForgePersistence(path.parent, read_only=True)
    storage.open()
    try:
        projects = ProjectService(storage)
        environments = EnvironmentService(storage)
        configs = RunConfigService(storage, environments)
        processes = ProcessController(uuid4())
        verifier = ProjectCommandVerifier(
            storage, projects, environments, configs, HandoffService(storage),
            processes, path.parent / "workspaces",
        )
        matrix = AcceptanceMatrixService(storage, projects, configs, verifier)
        final = FinalAcceptanceService(storage, projects, matrix)
        for run_id in accepted_run_ids:
            rows = db.execute(
                "SELECT r.project_id,r.task_id,s.snapshot_id,d.acceptance_decision_id "
                "FROM runs r JOIN code_snapshots s ON s.run_id=r.run_id "
                "AND s.project_id=r.project_id JOIN delivery_records d "
                "ON d.snapshot_id=s.snapshot_id AND d.project_id=r.project_id "
                "AND d.task_id=r.task_id WHERE r.run_id=?",
                (str(run_id),),
            ).fetchall()
            if len(rows) != 1:
                raise EvaluationError("EVALUATION_DELIVERY_UNVERIFIABLE")
            row = rows[0]
            try:
                view = final.get(UUID(row["project_id"]), UUID(row["task_id"]))
            except (ValueError, FinalAcceptanceError, AcceptanceMatrixError,
                    RunConfigError, VerifierError) as error:
                raise EvaluationError("EVALUATION_DELIVERY_UNVERIFIABLE") from error
            if (view.status != "accepted" or view.decision is None
                    or view.snapshotId != UUID(row["snapshot_id"])
                    or view.decision.decisionId != UUID(row["acceptance_decision_id"])):
                raise EvaluationError("EVALUATION_DELIVERY_STALE")
    finally:
        storage.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    repository_root = Path(__file__).resolve().parents[2]
    qa_root = repository_root / "output" / "qa"
    try:
        # uv --directory python changes cwd before invoking this script. Resolve
        # documented output/qa paths from the repository root, independent of
        # the caller's current directory; absolute QA paths still work.
        candidate = (repository_root / args.database) if not args.database.is_absolute() \
            else args.database
        path = candidate.resolve(strict=True)
        if not path.is_relative_to(qa_root.resolve(strict=True)) or path.name != "forge.sqlite":
            raise EvaluationError("EVALUATION_QA_PATH_REQUIRED")
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
            db.row_factory = sqlite3.Row
            db.execute("PRAGMA query_only=ON")
            if db.execute("PRAGMA user_version").fetchone()[0] not in SUPPORTED_EVALUATION_SCHEMAS:
                raise EvaluationError("EVALUATION_SCHEMA_UNSUPPORTED")
            if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise EvaluationError("EVALUATION_DATABASE_INVALID")
            report = read_run_outcomes(db)
            _verify_current_deliveries(path, db, [
                item.runId for item in report.outcomes
                if item.outcome == "accepted_delivery"
            ])
    except (OSError, sqlite3.DatabaseError, PersistenceError, EvaluationError) as error:
        code = error.code if isinstance(error, EvaluationError) else "EVALUATION_DATABASE_INVALID"
        print(json.dumps({"error": code}), file=sys.stderr)
        return 1
    print(report.model_dump_json(indent=2))
    return 0 if report.allRunsTerminal else 1


if __name__ == "__main__":
    raise SystemExit(main())
