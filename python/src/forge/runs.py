"""Durable one-attempt Run state and epoch-fenced result application."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from forge.approvals import canonical_json
from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.run_config import RunConfigService


class RunError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


RunState = Literal[
    "queued", "running", "waiting_input", "pausing", "paused", "canceling",
    "succeeded", "failed", "cancelled", "interrupted",
]
AttemptState = Literal[
    "pending", "running", "waiting_approval", "succeeded", "failed", "cancelled",
    "interrupted",
]


class RunStartIntent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: UUID
    projectId: UUID
    taskId: UUID
    attemptId: UUID
    attemptNo: int = Field(default=1, ge=1, le=20)
    workspaceId: UUID
    workspaceLeaseId: UUID
    leaseEpoch: int = Field(ge=1)
    baseRevision: str = Field(pattern=r"^[0-9a-f]{40,64}$")
    nodeId: str = Field(min_length=1, max_length=128)
    executorId: str = Field(min_length=1, max_length=128)
    configHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    createdAt: str


class RunAttemptResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: UUID
    attemptId: UUID
    workspaceLeaseId: UUID
    leaseEpoch: int = Field(ge=1)
    contractRevision: int = Field(ge=1)
    configHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    outcome: Literal["completed", "failed", "cancelled"]
    providerSessionRef: str | None
    lastEventSequence: int = Field(ge=0)
    timestamp: str


class AttemptView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    attemptId: UUID
    runId: UUID
    nodeId: str
    attemptNo: int = Field(ge=1)
    leaseEpoch: int = Field(ge=1)
    workspaceLeaseId: UUID
    state: AttemptState
    nativeSessionRef: str | None
    lastEventSequence: int = Field(ge=0)
    startedAt: str | None
    endedAt: str | None


class RunView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    runId: UUID
    projectId: UUID
    taskId: UUID
    configHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    state: RunState
    revision: int = Field(ge=1)
    createdAt: str
    finishedAt: str | None
    attempt: AttemptView


def _when(value: str) -> datetime:
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            raise ValueError("Timezone is required")
        return result
    except ValueError as error:
        raise RunError("RUN_INVALID_TIME") from error


def _digest(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


class RunService:
    def __init__(self, storage: ForgePersistence, configs: RunConfigService) -> None:
        self.storage = storage
        self.configs = configs

    def get(self, project_id: UUID, run_id: UUID) -> RunView | None:
        db = self.storage.session()
        row = db.execute(
            "SELECT * FROM runs WHERE project_id=? AND run_id=?",
            (str(project_id), str(run_id)),
        ).fetchone()
        if row is None:
            return None
        attempt = db.execute(
            "SELECT * FROM run_attempts WHERE run_id=? ORDER BY attempt_no DESC LIMIT 1",
            (str(run_id),),
        ).fetchone()
        if attempt is None:
            raise RunError("RUN_NOT_FOUND")
        return RunView.model_validate_json(json.dumps({
            "runId": row["run_id"], "projectId": row["project_id"],
            "taskId": row["task_id"], "configHash": row["config_hash"],
            "state": row["state"], "revision": row["revision"],
            "createdAt": row["created_at"], "finishedAt": row["finished_at"],
            "attempt": {
                "attemptId": attempt["attempt_id"], "runId": attempt["run_id"],
                "nodeId": attempt["node_id"], "attemptNo": attempt["attempt_no"],
                "leaseEpoch": attempt["lease_epoch"],
                "workspaceLeaseId": attempt["workspace_lease_id"],
                "state": attempt["state"], "nativeSessionRef": attempt["native_session_ref"],
                "lastEventSequence": attempt["last_event_sequence"],
                "startedAt": attempt["started_at"], "endedAt": attempt["ended_at"],
            },
        }))

    def _required(self, project_id: UUID, run_id: UUID) -> RunView:
        result = self.get(project_id, run_id)
        if result is None:
            raise RunError("RUN_NOT_FOUND")
        return result

    def _event(
        self, db: Any, run_id: UUID, attempt_id: UUID, event_type: str,
        detail: object, at: str,
    ) -> None:
        db.execute(
            "INSERT INTO run_events(run_id,attempt_id,type,detail_json,created_at) "
            "VALUES(?,?,?,?,?)",
            (str(run_id), str(attempt_id), event_type,
             json.dumps(detail, ensure_ascii=False, default=str), at),
        )

    def begin(self, intent: RunStartIntent) -> RunView:
        with self.storage.transaction() as db:
            prior = self.get(intent.projectId, intent.runId)
            if prior is not None:
                event = db.execute(
                    "SELECT detail_json FROM run_events WHERE run_id=? AND type='attempt.intent' "
                    "ORDER BY seq LIMIT 1", (str(intent.runId),),
                ).fetchone()
                if event and canonical_json(json.loads(event["detail_json"])) == canonical_json(
                    intent.model_dump(mode="json")
                ):
                    return prior
                raise RunError("RUN_CONFLICT")
            config = self.configs.get(intent.projectId, intent.runId)
            if config is None:
                raise RunError("RUN_NOT_FOUND")
            if (
                config.projectId != intent.projectId or config.taskId != intent.taskId
                or config.snapshotHash != intent.configHash
                or not any(plugin.id == intent.executorId for plugin in config.plugins)
            ):
                raise RunError("RUN_CONFIG_MISMATCH")
            task = db.execute(
                "SELECT state FROM tasks WHERE project_id=? AND task_id=?",
                (str(intent.projectId), str(intent.taskId)),
            ).fetchone()
            if task is None or task["state"] != "todo":
                raise RunError("RUN_CONFLICT")
            if db.execute(
                "SELECT 1 FROM runs WHERE project_id=? AND state IN "
                "('queued','running','waiting_input','pausing','paused','canceling','interrupted')",
                (str(intent.projectId),),
            ).fetchone() or db.execute(
                "SELECT 1 FROM run_workspace_leases WHERE workspace_id=? "
                "AND state IN ('active','quarantined')", (str(intent.workspaceId),),
            ).fetchone():
                raise RunError("RUN_CONFLICT")
            deadline = _when(intent.createdAt) + timedelta(
                milliseconds=config.budget.maxDurationMs
            )
            if deadline <= datetime.now(UTC):
                raise RunError("RUN_EXPIRED")
            deadline_at = deadline.isoformat(timespec="milliseconds").replace("+00:00", "Z")
            db.execute(
                "INSERT INTO runs(run_id,project_id,task_id,config_hash,state,created_at,"
                "deadline_at) VALUES(?,?,?,?,'queued',?,?)",
                (str(intent.runId), str(intent.projectId), str(intent.taskId),
                 intent.configHash, intent.createdAt, deadline_at),
            )
            db.execute(
                "INSERT INTO run_attempts(attempt_id,run_id,node_id,attempt_no,workspace_id,"
                "workspace_lease_id,lease_epoch,base_revision,executor_id,state,intent_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,'pending',?)",
                (str(intent.attemptId), str(intent.runId), intent.nodeId, intent.attemptNo,
                 str(intent.workspaceId), str(intent.workspaceLeaseId), intent.leaseEpoch,
                 intent.baseRevision, intent.executorId, intent.createdAt),
            )
            db.execute(
                "INSERT INTO run_workspace_leases(lease_id,run_id,attempt_id,workspace_id,"
                "epoch,state,acquired_at) VALUES(?,?,?,?,?,'active',?)",
                (str(intent.workspaceLeaseId), str(intent.runId), str(intent.attemptId),
                 str(intent.workspaceId), intent.leaseEpoch, intent.createdAt),
            )
            self._event(db, intent.runId, intent.attemptId, "run.queued", {}, intent.createdAt)
            self._event(
                db, intent.runId, intent.attemptId, "attempt.intent",
                intent.model_dump(mode="json"), intent.createdAt,
            )
            return self._required(intent.projectId, intent.runId)

    def mark_launched(
        self, project_id: UUID, run_id: UUID, attempt_id: UUID,
        native_session_ref: str,
    ) -> RunView:
        if not native_session_ref:
            raise RunError("RUN_CONFLICT")
        with self.storage.transaction() as db:
            run = self._required(project_id, run_id)
            if (
                run.attempt.attemptId != attempt_id
                or run.state not in ("queued", "canceling")
                or run.attempt.state != "pending"
            ):
                raise RunError("RUN_STALE")
            deadline = db.execute(
                "SELECT deadline_at FROM runs WHERE run_id=?", (str(run_id),)
            ).fetchone()
            if deadline is None or _when(deadline["deadline_at"]) <= datetime.now(UTC):
                raise RunError("RUN_EXPIRED")
            now = timestamp()
            db.execute(
                "UPDATE runs SET state=CASE WHEN state='queued' THEN 'running' ELSE state END,"
                "revision=revision+1 WHERE run_id=?", (str(run_id),),
            )
            db.execute(
                "UPDATE run_attempts SET state='running',started_at=?,native_session_ref=? "
                "WHERE attempt_id=?", (now, native_session_ref, str(attempt_id)),
            )
            self._event(
                db, run_id, attempt_id, "attempt.started", {"nativeSessionRef": native_session_ref},
                now,
            )
            return self._required(project_id, run_id)

    def request_cancel(
        self, project_id: UUID, run_id: UUID, attempt_id: UUID,
        reason: Literal["user", "timeout", "shutdown"],
    ) -> RunView:
        with self.storage.transaction() as db:
            run = self._required(project_id, run_id)
            if run.attempt.attemptId != attempt_id:
                raise RunError("RUN_STALE")
            if run.state == "canceling":
                return run
            if run.state not in ("queued", "running"):
                raise RunError("RUN_CONFLICT")
            db.execute(
                "INSERT INTO run_cancel_intents(run_id,attempt_id,reason,requested_at) "
                "VALUES(?,?,?,?)", (str(run_id), str(attempt_id), reason, timestamp()),
            )
            db.execute(
                "UPDATE runs SET state='canceling',revision=revision+1 WHERE run_id=?",
                (str(run_id),),
            )
            return self._required(project_id, run_id)

    def complete(
        self, project_id: UUID, run_id: UUID, result: RunAttemptResult,
        *, verified_stopped: bool,
    ) -> tuple[Literal["APPLIED", "DUPLICATE_RESULT", "STALE_RESULT"], RunView]:
        with self.storage.transaction() as db:
            run = self._required(project_id, run_id)
            config = self.configs.get(project_id, run_id)
            if config is None:
                raise RunError("RUN_NOT_FOUND")
            expected = (
                result.runId == run_id
                and result.attemptId == run.attempt.attemptId
                and result.workspaceLeaseId == run.attempt.workspaceLeaseId
                and result.leaseEpoch == run.attempt.leaseEpoch
                and result.contractRevision == config.taskRevision
                and result.configHash == run.configHash
            )
            result_body = result.model_dump(mode="json")
            result_hash = _digest(result_body)
            attempt = db.execute(
                "SELECT result_hash FROM run_attempts WHERE attempt_id=?",
                (str(run.attempt.attemptId),),
            ).fetchone()
            if not expected:
                self._event(db, run_id, run.attempt.attemptId, "result.stale", {
                    "sourceRunId": str(result.runId),
                    "sourceAttemptId": str(result.attemptId), "reason": "identity",
                }, result.timestamp)
                return "STALE_RESULT", run
            if attempt and attempt["result_hash"] == result_hash:
                return "DUPLICATE_RESULT", run
            cancellable = (
                run.state == "canceling" and result.outcome == "cancelled"
                and run.attempt.state in ("pending", "running")
            )
            if (
                not cancellable and (run.state != "running" or run.attempt.state != "running")
                or (attempt is not None and attempt["result_hash"] is not None)
                or run.state == "canceling" and result.outcome != "cancelled"
            ):
                self._event(db, run_id, run.attempt.attemptId, "result.stale", {
                    "sourceRunId": str(result.runId),
                    "sourceAttemptId": str(result.attemptId), "reason": "terminal",
                }, result.timestamp)
                return "STALE_RESULT", run
            if not verified_stopped:
                raise RunError("RUN_PROCESS_UNCONFIRMED")
            state: Literal["succeeded", "failed", "cancelled"] = (
                "succeeded" if result.outcome == "completed"
                else "failed" if result.outcome == "failed" else "cancelled"
            )
            db.execute(
                "UPDATE runs SET state=?,revision=revision+1,finished_at=? WHERE run_id=?",
                (state, result.timestamp, str(run_id)),
            )
            db.execute(
                "UPDATE run_attempts SET state=?,ended_at=?,last_event_sequence=?,"
                "result_hash=?,result_json=? WHERE attempt_id=?",
                (state, result.timestamp, result.lastEventSequence, result_hash,
                 json.dumps(result_body), str(result.attemptId)),
            )
            db.execute(
                "UPDATE run_workspace_leases SET state='released',released_at=? WHERE lease_id=?",
                (result.timestamp, str(result.workspaceLeaseId)),
            )
            self._event(db, run_id, result.attemptId, "attempt.result", {
                "outcome": result.outcome, "resultHash": result_hash,
            }, result.timestamp)
            return "APPLIED", self._required(project_id, run_id)

    def interrupt_uncertain(
        self, project_id: UUID, run_id: UUID, attempt_id: UUID,
        reason: Literal["launch_unknown", "process_unconfirmed", "cancel_unconfirmed"],
    ) -> RunView:
        with self.storage.transaction() as db:
            run = self._required(project_id, run_id)
            if run.attempt.attemptId != attempt_id or run.state not in (
                "queued", "running", "canceling"
            ):
                raise RunError("RUN_STALE")
            now = timestamp()
            db.execute(
                "UPDATE runs SET state='interrupted',revision=revision+1,finished_at=? "
                "WHERE run_id=?", (now, str(run_id)),
            )
            db.execute(
                "UPDATE run_attempts SET state='interrupted',ended_at=? WHERE attempt_id=?",
                (now, str(attempt_id)),
            )
            db.execute(
                "UPDATE run_workspace_leases SET state='quarantined' WHERE lease_id=?",
                (str(run.attempt.workspaceLeaseId),),
            )
            self._event(db, run_id, attempt_id, "run.failed", {"reason": reason}, now)
            return self._required(project_id, run_id)

    def block_no_side_effect(
        self, project_id: UUID, run_id: UUID, attempt_id: UUID,
        reason: Literal["rate_limit_exhausted"],
    ) -> RunView:
        with self.storage.transaction() as db:
            run = self._required(project_id, run_id)
            if (
                run.state != "queued" or run.attempt.state != "pending"
                or run.attempt.attemptId != attempt_id
            ):
                raise RunError("RUN_STALE")
            now = timestamp()
            db.execute(
                "UPDATE runs SET state='waiting_input',revision=revision+1 WHERE run_id=?",
                (str(run_id),),
            )
            db.execute(
                "UPDATE run_attempts SET state='failed',ended_at=? WHERE attempt_id=?",
                (now, str(attempt_id)),
            )
            db.execute(
                "UPDATE run_workspace_leases SET state='released',released_at=? WHERE lease_id=?",
                (now, str(run.attempt.workspaceLeaseId)),
            )
            self._event(db, run_id, attempt_id, "run.blocked", {"reason": reason}, now)
            return self._required(project_id, run_id)
