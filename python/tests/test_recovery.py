"""Crash recovery against real SQLite, Git and an independently killed Host process."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from test_delivery import accepted_fixture, delivery_service
from test_verifier_project import git

from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.host import HostRuntime
from forge.persistence import ForgePersistence
from forge.processes import ProcessController
from forge.recovery import RecoveryService
from forge.run_config import RunConfigService
from forge.runs import RunAttemptResult, RunService


def _runtime(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> HostRuntime:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    runtime = HostRuntime()
    assert runtime.storage_health()["status"] == "ready"
    return runtime


@pytest.mark.asyncio
async def test_restart_fences_uncertain_attempt_and_retains_lease(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, _, storage, project_id, _, _ = await accepted_fixture(tmp_path)
    row = storage.session().execute(
        "SELECT r.run_id,a.attempt_id,a.workspace_lease_id,a.workspace_id "
        "FROM runs r JOIN run_attempts a ON a.run_id=r.run_id "
        "WHERE r.project_id=? LIMIT 1", (str(project_id),),
    ).fetchone()
    assert row is not None
    with storage.transaction() as db:
        db.execute("UPDATE runs SET state='running',finished_at=NULL WHERE run_id=?",
                   (row["run_id"],))
        db.execute("UPDATE run_attempts SET state='running',native_session_ref='old-session' "
                   "WHERE attempt_id=?", (row["attempt_id"],))
        db.execute("INSERT INTO run_workspace_leases(lease_id,run_id,attempt_id,"
                   "workspace_id,epoch,state,acquired_at) "
                   "VALUES(?,?,?,?,1,'active',?)",
                   (row["workspace_lease_id"], row["run_id"], row["attempt_id"],
                    row["workspace_id"], "2026-09-24T00:00:00Z"))
    storage.close()
    journal = tmp_path / "data" / "process-records"
    journal.mkdir(exist_ok=True)
    record_id = uuid4()
    journal.joinpath(f"{record_id}.json").write_text(json.dumps({
        "processId": str(record_id), "runId": row["run_id"],
        "runtimeId": str(uuid4()), "pid": os.getpid(), "startedAt": "old-time",
        "status": "running",
    }))
    runtime = _runtime(tmp_path, monkeypatch)
    state = runtime.storage.session().execute(
        "SELECT r.state,l.state AS lease_state FROM runs r "
        "JOIN run_workspace_leases l ON l.run_id=r.run_id WHERE r.run_id=?",
        (row["run_id"],),
    ).fetchone()
    assert state is not None and tuple(state) == ("interrupted", "quarantined")
    event = runtime.storage.session().execute(
        "SELECT detail_json FROM run_events WHERE run_id=? AND type='run.failed' "
        "ORDER BY seq DESC LIMIT 1", (row["run_id"],),
    ).fetchone()
    assert event is not None
    assert json.loads(event["detail_json"])["resume"] == "not_proven"
    assert runtime.processes.inspect_orphans()[0]["pid"] == os.getpid()
    # A historical PID matching this live test process is evidence, never ownership.
    assert os.getpid() > 0
    assert RecoveryService(runtime.storage, ProcessController(
        uuid4(), journal,
    )).reconcile().interrupted_runs == 0
    runtime.storage.close()


@pytest.mark.asyncio
async def test_terminal_replay_and_stale_epoch_only_audit(tmp_path: Path) -> None:
    _, _, storage, project_id, _, _ = await accepted_fixture(tmp_path)
    row = storage.session().execute(
        "SELECT r.run_id,r.config_hash,a.attempt_id,a.workspace_id,"
        "a.workspace_lease_id,a.lease_epoch FROM runs r "
        "JOIN run_attempts a ON a.run_id=r.run_id WHERE r.project_id=?",
        (str(project_id),),
    ).fetchone()
    assert row is not None
    with storage.transaction() as db:
        db.execute("UPDATE runs SET state='running',finished_at=NULL WHERE run_id=?",
                   (row["run_id"],))
        db.execute("UPDATE run_attempts SET state='running' WHERE attempt_id=?",
                   (row["attempt_id"],))
        db.execute("INSERT INTO run_workspace_leases(lease_id,run_id,attempt_id,"
                   "workspace_id,epoch,state,acquired_at) VALUES(?,?,?,?,?,'active',?)",
                   (row["workspace_lease_id"], row["run_id"], row["attempt_id"],
                    row["workspace_id"], row["lease_epoch"], timestamp()))
    configs = RunConfigService(storage, EnvironmentService(storage))
    runs = RunService(storage, configs)
    run_id = row["run_id"]
    config = configs.get(project_id, UUID(run_id))
    assert config is not None
    result = RunAttemptResult(
        runId=UUID(run_id), attemptId=UUID(row["attempt_id"]),
        workspaceLeaseId=UUID(row["workspace_lease_id"]),
        leaseEpoch=row["lease_epoch"], contractRevision=config.taskRevision,
        configHash=row["config_hash"], outcome="completed",
        providerSessionRef="fixture-session", lastEventSequence=2,
        timestamp=timestamp(),
    )
    first, terminal = runs.complete(project_id, UUID(run_id), result,
                                    verified_stopped=True)
    assert first == "APPLIED" and terminal.state == "succeeded"
    before = storage.session().execute(
        "SELECT count(*) AS total FROM run_events WHERE run_id=?", (run_id,),
    ).fetchone()
    assert before is not None
    duplicate, same = runs.complete(project_id, UUID(run_id), result,
                                    verified_stopped=True)
    assert duplicate == "DUPLICATE_RESULT" and same.revision == terminal.revision
    after = storage.session().execute(
        "SELECT count(*) AS total FROM run_events WHERE run_id=?", (run_id,),
    ).fetchone()
    assert after is not None and after["total"] == before["total"]
    stale = result.model_copy(update={"leaseEpoch": result.leaseEpoch + 1})
    outcome, unchanged = runs.complete(project_id, UUID(run_id), stale,
                                       verified_stopped=True)
    assert outcome == "STALE_RESULT" and unchanged.revision == terminal.revision
    assert storage.session().execute(
        "SELECT type FROM run_events WHERE run_id=? ORDER BY seq DESC LIMIT 1",
        (run_id,),
    ).fetchone()["type"] == "result.stale"
    storage.close()


_CRASH_MERGE = """
import json, os, sys
from forge.host import HostRuntime
from forge.delivery import MergeRequest
from uuid import UUID

runtime = HostRuntime()
assert runtime.storage_health()['status'] == 'ready'
service = runtime.deliveries
mode = sys.argv[1]
if mode == 'before':
    service._accepted_current = lambda *_: os._exit(71)
elif mode == 'candidate':
    original = service._accepted_current
    calls = 0
    def crash_before_target(*args):
        global calls
        calls += 1
        if calls == 2:
            os._exit(73)
        return original(*args)
    service._accepted_current = crash_before_target
else:
    service._set_state = lambda *_: os._exit(72)
service.merge(MergeRequest.model_validate_json(sys.argv[2]))
"""


@pytest.mark.asyncio
@pytest.mark.parametrize("moment", ["before", "candidate", "after", "after_missing"])
async def test_killed_host_never_replays_merge(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, moment: str,
) -> None:
    source, base, storage, project_id, task_id, snapshot_id = await accepted_fixture(tmp_path)
    service = delivery_service(storage, tmp_path)
    summary = service.get(project_id, task_id)
    value = {
        "projectId": str(project_id), "taskId": str(task_id),
        "deliveryId": str(summary.deliveryId), "targetBranch": "main",
        "expectedTargetHead": base, "expectedSnapshotId": str(snapshot_id),
        "confirmed": True, "idempotencyKey": str(uuid4()),
    }
    storage.close()
    child = subprocess.run(
        [sys.executable, "-c", _CRASH_MERGE,
         "after" if moment == "after_missing" else moment, json.dumps(value)],
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data")},
        capture_output=True, text=True, timeout=25, check=False,
    )
    assert child.returncode == {
        "before": 71, "candidate": 73, "after": 72, "after_missing": 72,
    }[moment], child.stderr
    head_after_crash = git(source, "rev-parse", "HEAD")
    if moment in ("before", "candidate"):
        assert head_after_crash == base
    else:
        assert head_after_crash != base
        parents = git(source, "rev-list", "--parents", "-n", "1", head_after_crash).split()
        assert parents == [head_after_crash, base, summary.snapshotCommit]

    if moment == "after_missing":
        storage = ForgePersistence(tmp_path / "data")
        storage.open()
        operation = storage.session().execute(
            "SELECT operation_id FROM merge_operations WHERE idempotency_key=?",
            (value["idempotencyKey"],),
        ).fetchone()
        assert operation is not None
        candidate = tmp_path / "data" / "merge-workspaces" / operation["operation_id"]
        git(source, "worktree", "remove", str(candidate))
        storage.close()

    runtime = _runtime(tmp_path, monkeypatch)
    row = runtime.storage.session().execute(
        "SELECT state,error_code,result_commit FROM merge_operations "
        "WHERE idempotency_key=?", (value["idempotencyKey"],),
    ).fetchone()
    assert row is not None
    if moment in ("before", "candidate"):
        assert row["state"] == "intent"
        assert row["error_code"] == "MERGE_RETRY_REQUIRES_CONFIRMATION"
        if moment == "candidate":
            operation_id = runtime.storage.session().execute(
                "SELECT operation_id FROM merge_operations WHERE idempotency_key=?",
                (value["idempotencyKey"],),
            ).fetchone()["operation_id"]
            candidate = tmp_path / "data" / "merge-workspaces" / operation_id
            candidate_head = git(candidate, "rev-parse", "HEAD")
            parents = git(candidate, "rev-list", "--parents", "-n", "1", candidate_head)
            assert parents.split() == [candidate_head, base, summary.snapshotCommit]
    elif moment == "after_missing":
        assert row["state"] == "unknown" and row["result_commit"] is None
    else:
        assert row["state"] == "merged" and row["result_commit"] == head_after_crash
    # Startup never creates another merge commit or moves a user's target again.
    assert git(source, "rev-parse", "HEAD") == head_after_crash
    assert git(source, "status", "--porcelain") == ""
    runtime.storage.close()
