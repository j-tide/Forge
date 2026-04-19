"""Conservative startup reconciliation of durable Run and process evidence."""

from __future__ import annotations

import json
import logging
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from sqlite3 import Row
from uuid import UUID

from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.processes import ProcessController
from forge.workspaces import WorkspaceError, WorkspaceManager

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class RecoveryReport:
    interrupted_runs: int
    orphan_processes: int
    retained_leases: int


class RecoveryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def boot_identity() -> str | None:
    """Return a kernel boot-session identity, never a wall-clock or process PID.

    Unsupported or unreadable platforms fail closed. No environment override is
    accepted in production; tests inject a reader into RecoveryService.
    """
    try:
        if sys.platform == "darwin":
            value = subprocess.run(
                ["/usr/sbin/sysctl", "-n", "kern.bootsessionuuid"],
                capture_output=True, text=True, check=False, timeout=2,
            )
            if value.returncode != 0:
                return None
            return str(UUID(value.stdout.strip()))
        if sys.platform == "linux":
            return str(UUID(Path("/proc/sys/kernel/random/boot_id").read_text().strip()))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None
    return None


class RecoveryService:
    def __init__(
        self, storage: ForgePersistence, processes: ProcessController,
        boot_reader: Callable[[], str | None] = boot_identity,
    ) -> None:
        self.storage = storage
        self.processes = processes
        self.boot_reader = boot_reader

    def _boot(self) -> str | None:
        try:
            value = self.boot_reader()
            return str(UUID(value)) if value is not None else None
        except (ValueError, TypeError, OSError):
            return None

    def _row(self, project_id: UUID, run_id: UUID) -> Row:
        resolved = ("r.recovery_resolved_at," if self.storage.schema_version() >= 36
                    else "NULL AS recovery_resolved_at,")
        row = self.storage.session().execute(
            "SELECT r.state,r.revision," + resolved + "a.attempt_id,a.workspace_id,"
            "a.workspace_lease_id,"
            "a.lease_epoch,l.state AS lease_state,p.canonical_path "
            "FROM runs r JOIN run_attempts a ON a.run_id=r.run_id "
            "JOIN run_workspace_leases l ON l.lease_id=a.workspace_lease_id "
            "JOIN projects p ON p.project_id=r.project_id "
            "WHERE r.project_id=? AND r.run_id=? "
            "AND a.attempt_no=(SELECT MAX(x.attempt_no) FROM run_attempts x "
            "WHERE x.run_id=r.run_id)", (str(project_id), str(run_id)),
        ).fetchone()
        if row is None:
            raise RecoveryError("RUN_NOT_FOUND")
        return row

    def status(self, project_id: UUID, run_id: UUID) -> dict[str, object]:
        """Report only evidence state; never expose kernel identity or local paths."""
        row = self._row(project_id, run_id)
        if row["state"] != "interrupted":
            raise RecoveryError("RUN_CONFLICT")
        if self.storage.schema_version() < 36:
            return {
                "runId": str(run_id), "state": "unavailable", "runRevision": row["revision"],
                "workspaceId": row["workspace_id"], "observedAt": None,
                "resolvedAt": None,
            }
        evidence = self.storage.session().execute(
            "SELECT * FROM run_recovery_observations WHERE run_id=?",
            (str(run_id),),
        ).fetchone()
        matches = evidence is not None and (
            evidence["attempt_id"] == row["attempt_id"]
            and evidence["lease_id"] == row["workspace_lease_id"]
            and evidence["workspace_id"] == row["workspace_id"]
        )
        current = self._boot()
        if not matches or evidence is None:
            state = "unavailable"
        elif (evidence["resolved_at"] is not None
                and evidence["resolved_at"] == row["recovery_resolved_at"]
                and row["lease_state"] == "released"):
            state = "resolved"
        elif current is None:
            state = "unavailable"
        elif self.processes.has_active(str(run_id)) or self.processes.uncertain_journal_entries():
            state = "unavailable"
        else:
            state = "eligible" if current != evidence["observed_boot_id"] else "awaiting_reboot"
        return {
            "runId": str(run_id), "state": state, "runRevision": row["revision"],
            "workspaceId": row["workspace_id"],
            "observedAt": evidence["observed_at"] if evidence is not None else None,
            "resolvedAt": evidence["resolved_at"] if evidence is not None else None,
        }

    async def resolve(
        self, project_id: UUID, run_id: UUID, expected_revision: int,
        workspace_id: UUID, workspaces: WorkspaceManager,
    ) -> dict[str, object]:
        """After a *different boot*, park the old worktree and free only its lease.

        Reboot kills the prior boot's descendants even when Codex commands escaped
        the app-server process group. The old tree is retained, never adopted,
        deleted or used as a new Run's input. The old Run remains interrupted.
        """
        state = self.status(project_id, run_id)
        if state["state"] == "resolved":
            return state
        if state["state"] != "eligible":
            raise RecoveryError("RUN_RECOVERY_PROOF_REQUIRED")
        row = self._row(project_id, run_id)
        if (row["revision"] != expected_revision or row["workspace_id"] != str(workspace_id)
                or row["lease_state"] != "quarantined"):
            raise RecoveryError("RUN_STALE")
        if self.processes.has_active(str(run_id)) or self.processes.uncertain_journal_entries():
            raise RecoveryError("RUN_RECOVERY_EVIDENCE_INVALID")
        before = self._boot()
        try:
            await workspaces.verify_historical_readonly(
                workspace_id, str(run_id), UUID(row["workspace_lease_id"]),
                row["lease_epoch"], row["canonical_path"],
            )
        except (WorkspaceError, ValueError, OSError) as error:
            raise RecoveryError("RUN_RECOVERY_EVIDENCE_INVALID") from error
        if before is None or self._boot() != before:
            raise RecoveryError("RUN_RECOVERY_PROOF_REQUIRED")
        with self.storage.transaction() as db:
            current = self.status(project_id, run_id)
            if (current["state"] != "eligible" or current["runRevision"] != expected_revision
                    or current["workspaceId"] != str(workspace_id)):
                raise RecoveryError("RUN_STALE")
            changed = db.execute(
                "UPDATE run_workspace_leases SET state='released',released_at=? "
                "WHERE lease_id=? AND run_id=? AND state='quarantined'",
                (timestamp(), row["workspace_lease_id"], str(run_id)),
            ).rowcount
            if changed != 1:
                raise RecoveryError("RUN_STALE")
            decided_at = timestamp()
            updated = db.execute(
                "UPDATE run_recovery_observations SET resolved_boot_id=?,resolved_at=? "
                "WHERE run_id=? AND attempt_id=? AND lease_id=? AND resolved_at IS NULL",
                (before, decided_at, str(run_id), row["attempt_id"],
                 row["workspace_lease_id"]),
            ).rowcount
            if updated != 1:
                raise RecoveryError("RUN_STALE")
            updated = db.execute(
                "UPDATE runs SET revision=revision+1,recovery_resolved_at=? "
                "WHERE run_id=? AND revision=? AND recovery_resolved_at IS NULL",
                (decided_at, str(run_id), expected_revision),
            ).rowcount
            if updated != 1:
                raise RecoveryError("RUN_STALE")
        return self.status(project_id, run_id)

    def reconcile(self) -> RecoveryReport:
        """Fence prior Host attempts; never adopt a PID or replay an executor action.

        The process journal has a spawn timestamp, not a kernel start identity. A
        matching PID therefore cannot prove ownership after a Host crash.
        """
        orphans = self.processes.inspect_orphans()
        observed_boot = self._boot()
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
            if observed_boot is not None:
                interrupted = db.execute(
                    "SELECT r.run_id,a.attempt_id,a.workspace_id,a.workspace_lease_id "
                    "FROM runs r JOIN run_attempts a ON a.run_id=r.run_id "
                    "JOIN run_workspace_leases l ON l.lease_id=a.workspace_lease_id "
                    "WHERE r.state='interrupted' AND l.state='quarantined' "
                    "AND a.attempt_no=(SELECT MAX(x.attempt_no) FROM run_attempts x "
                    "WHERE x.run_id=r.run_id) AND NOT EXISTS ("
                    "SELECT 1 FROM run_recovery_observations o WHERE o.run_id=r.run_id)"
                ).fetchall()
                for item in interrupted:
                    db.execute(
                        "INSERT INTO run_recovery_observations(run_id,attempt_id,lease_id,"
                        "workspace_id,observed_boot_id,observed_at) VALUES(?,?,?,?,?,?)",
                        (item["run_id"], item["attempt_id"], item["workspace_lease_id"],
                         item["workspace_id"], observed_boot, now),
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
