"""Conservative startup reconciliation of durable Run and process evidence."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.processes import ProcessController

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class RecoveryReport:
    interrupted_runs: int
    orphan_processes: int
    retained_leases: int


class RecoveryService:
    def __init__(self, storage: ForgePersistence, processes: ProcessController) -> None:
        self.storage = storage
        self.processes = processes

    def reconcile(self) -> RecoveryReport:
        """Fence prior Host attempts; never adopt a PID or replay an executor action.

        The process journal has a spawn timestamp, not a kernel start identity. A
        matching PID therefore cannot prove ownership after a Host crash.
        """
        orphans = self.processes.inspect_orphans()
        with self.storage.transaction() as db:
            rows = db.execute(
                "SELECT r.run_id,r.state,a.attempt_id,a.state AS attempt_state,"
                "a.native_session_ref,a.lease_epoch,l.lease_id,l.state AS lease_state "
                "FROM runs r JOIN run_attempts a ON a.run_id=r.run_id "
                "JOIN run_workspace_leases l ON l.attempt_id=a.attempt_id "
                "WHERE r.state IN ('queued','running','pausing','canceling') "
                "AND a.attempt_no=(SELECT MAX(x.attempt_no) FROM run_attempts x "
                "WHERE x.run_id=r.run_id)"
            ).fetchall()
            now = timestamp()
            for row in rows:
                # Native session identity alone does not prove that the provider and
                # workspace still belong to this fresh Host runtime. No auto-resume.
                db.execute(
                    "UPDATE runs SET state='interrupted',revision=revision+1,finished_at=? "
                    "WHERE run_id=?", (now, row["run_id"]),
                )
                if row["attempt_state"] in ("pending", "running", "waiting_approval"):
                    db.execute(
                        "UPDATE run_attempts SET state='interrupted',ended_at=? "
                        "WHERE attempt_id=?", (now, row["attempt_id"]),
                    )
                if row["lease_state"] == "active":
                    db.execute(
                        "UPDATE run_workspace_leases SET state='quarantined' "
                        "WHERE lease_id=?", (row["lease_id"],),
                    )
                db.execute(
                    "INSERT INTO run_events(run_id,attempt_id,type,detail_json,created_at) "
                    "VALUES(?,?,'run.failed',?,?)",
                    (row["run_id"], row["attempt_id"], json.dumps({
                        "reason": "host_restart_outcome_unknown",
                        "leaseEpoch": row["lease_epoch"],
                        "nativeSessionKnown": row["native_session_ref"] is not None,
                        "resume": "not_proven",
                    }), now),
                )
            retained_row = db.execute(
                "SELECT count(*) AS total FROM run_workspace_leases "
                "WHERE state='quarantined'"
            ).fetchone()
            assert retained_row is not None
            retained = int(retained_row["total"])
        report = RecoveryReport(len(rows), len(orphans), retained)
        if rows or orphans:
            LOGGER.warning(json.dumps({
                "event": "startup_recovery_requires_review",
                "interruptedRuns": report.interrupted_runs,
                "orphanProcesses": report.orphan_processes,
                "quarantinedLeases": report.retained_leases,
            }))
        return report
