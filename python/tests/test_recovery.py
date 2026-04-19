"""Crash recovery against real SQLite, Git and an independently killed Host process."""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from test_delivery import accepted_fixture, delivery_service
from test_verifier_project import git
from test_workflow_versioning import approved_task, selection

from forge.conversations import timestamp
from forge.development import DevelopmentError, HostDevelopmentService, RunLaunchInput
from forge.environments import EnvironmentService
from forge.evaluation_outcomes import read_run_outcomes
from forge.host import HostRuntime
from forge.persistence import ForgePersistence, PersistenceError
from forge.processes import ProcessController
from forge.protocol import TRANSPORT_VERSION, ProtocolError, RpcRequest
from forge.recovery import RecoveryService, boot_identity
from forge.run_config import RunConfigService, VersionLock
from forge.runs import RunAttemptResult, RunService, RunStartIntent

_CRASH_ACTIVE_RUN = """
import asyncio, os, sys
from pathlib import Path
from uuid import UUID, uuid4
from forge.conversations import timestamp
from forge.host import HostRuntime
from forge.runs import RunStartIntent

async def main():
    runtime = HostRuntime()
    assert runtime.storage_health()['status'] == 'ready'
    await runtime.workspaces.open()
    source = Path(sys.argv[1])
    run_id, project_id, task_id = (UUID(value) for value in sys.argv[2:5])
    config = runtime.configs.get(project_id, run_id)
    assert config is not None
    workspace = await runtime.workspaces.create(source, str(run_id), sys.argv[5])
    lease = await runtime.workspaces.acquire(workspace.workspaceId, str(run_id))
    assert lease.activeLeaseId is not None
    intent = RunStartIntent(
        runId=run_id, projectId=project_id, taskId=task_id,
        attemptId=uuid4(), workspaceId=lease.workspaceId,
        workspaceLeaseId=lease.activeLeaseId, leaseEpoch=lease.leaseEpoch,
        baseRevision=lease.baseRevision, nodeId='develop',
        executorId='forge.executor.codex', configHash=config.snapshotHash,
        createdAt=timestamp(),
    )
    assert runtime.runs.begin(intent).state == 'queued'
    (Path(lease.rootPath) / 'source.txt').write_text('interrupted worktree change\\n')
    child = await runtime.processes.spawn(
        str(run_id), sys.executable, ['-c', 'import time; time.sleep(3)'],
        Path(lease.rootPath),
    )
    assert runtime.runs.mark_launched(
        project_id, run_id, intent.attemptId,
        f'fixture:{child.descriptor.processId}',
    ).state == 'running'
    os._exit(71)

asyncio.run(main())
"""


def test_kernel_boot_identity_is_stable_within_current_session() -> None:
    first = boot_identity()
    if sys.platform in ("darwin", "linux"):
        assert first is not None
        assert UUID(first) == UUID(boot_identity() or "")
    else:
        assert first is None


@pytest.mark.asyncio
async def test_killed_host_active_run_is_interrupted_not_passed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An actual Host/process crash is accounted for without adopting old ownership."""
    source = tmp_path / "Forge crash fixture with spaces"
    source.mkdir()
    git(source, "init", "-b", "main")
    git(source, "config", "user.name", "Forge fixture")
    git(source, "config", "user.email", "forge-fixture@example.invalid")
    (source / "source.txt").write_text("untouched\n")
    git(source, "add", "source.txt")
    git(source, "commit", "-m", "base")
    head = git(source, "rev-parse", "HEAD")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    project, draft, environment = approved_task(storage, source, "standard")
    config = RunConfigService(storage, EnvironmentService(storage)).create(
        selection(project, draft, environment, VersionLock(
            id="standard", version="1", contentHash="a" * 64,
        ))
    )
    storage.close()
    child = subprocess.run(
        [sys.executable, "-c", _CRASH_ACTIVE_RUN, str(source),
         str(config.runId), str(project.projectId), str(draft.draftId), head],
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "data")},
        capture_output=True, text=True, timeout=25, check=False,
    )
    assert child.returncode == 71, child.stderr
    runtime = _runtime(tmp_path, monkeypatch)
    try:
        run = runtime.runs.get(project.projectId, config.runId)
        assert run is not None
        assert run.state == "interrupted" and run.attempt.state == "interrupted"
        safety = runtime.dispatch(RpcRequest(
            jsonrpc="2.0", id=str(uuid4()), method="system.profileSwitchSafety",
            params={}, transportVersion=TRANSPORT_VERSION,
        ))
        assert safety["safe"] is False
        assert safety["fences"]["unresolvedRuns"] == 1
        assert safety["fences"]["quarantinedLeases"] == 1
        assert safety["fences"]["orphanProcessRecords"] >= 1
        lease = runtime.storage.session().execute(
            "SELECT state FROM run_workspace_leases WHERE run_id=?",
            (str(config.runId),),
        ).fetchone()
        assert lease is not None and lease["state"] == "quarantined"
        report = read_run_outcomes(runtime.storage.session())
        assert report.totalRuns == 1
        assert report.interruptedRuns == 1 and report.acceptedDeliveryRuns == 0
        assert report.outcomes[0].outcome == "interrupted"
        request = RpcRequest(
            jsonrpc="2.0", id=str(uuid4()), method="run.recoveryPreview",
            params={"projectId": str(project.projectId), "runId": str(config.runId)},
            transportVersion=TRANSPORT_VERSION,
        )
        preview = (await runtime.dispatch_async(request))["data"]
        assert preview["basis"] == "live-worktree-unverified"
        assert preview["runId"] == str(config.runId)
        assert preview["diff"]["files"] == [
            {"path": "source.txt", "status": "modified"},
        ]
        assert "+interrupted worktree change" in preview["diff"]["text"]
        assert str(source) not in json.dumps(preview)
        assert runtime.storage.session().execute(
            "SELECT state FROM run_workspace_leases WHERE run_id=?",
            (str(config.runId),),
        ).fetchone()["state"] == "quarantined"
        status_request = request.model_copy(update={"method": "run.recoveryStatus"})
        recovery_status = (await runtime.dispatch_async(status_request))["data"]
        assert recovery_status["state"] in ("awaiting_reboot", "unavailable")
        assert recovery_status["runId"] == str(config.runId)
        assert "bootId" not in recovery_status
        resolution_request = request.model_copy(update={
            "method": "run.recoveryResolve",
            "params": {"projectId": str(project.projectId), "runId": str(config.runId),
                       "expectedRunRevision": run.revision,
                       "expectedWorkspaceId": preview["workspaceId"], "confirmed": True},
        })
        with pytest.raises(ProtocolError) as same_boot:
            await runtime.dispatch_async(resolution_request)
        assert same_boot.value.code == "RUN_RECOVERY_PROOF_REQUIRED"
        with pytest.raises(ProtocolError) as no_confirmation:
            await runtime.dispatch_async(resolution_request.model_copy(update={"params": {
                **resolution_request.params, "confirmed": False,
            }}))
        assert no_confirmation.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError, match="Invalid recovery preview request"):
            await runtime.dispatch_async(request.model_copy(update={"params": {
                **request.params, "rootPath": str(source),
            }}))
        record = next((tmp_path / "data" / "workspaces" / "records").glob("*.json"))
        original = record.with_suffix(".saved")
        record.rename(original)
        record.symlink_to(original)
        with pytest.raises(ProtocolError) as invalid:
            await runtime.dispatch_async(request)
        assert invalid.value.code == "RUN_RECOVERY_EVIDENCE_INVALID"
        record.unlink()
        original.rename(record)
        development = object.__new__(HostDevelopmentService)
        development.storage = runtime.storage
        development.runs = runtime.runs
        development.plugins = None
        development.profiles = None
        development._project = lambda _project_id: source  # type: ignore[method-assign]
        development._task = lambda *_args, **_kwargs: "standard"  # type: ignore[method-assign]

        class ProbeAdapter:
            id = "executor.codex"

            async def probe(self) -> SimpleNamespace:
                return SimpleNamespace(available=True, adapterVersion="fixture/1",
                                       upstreamVersion="fixture/1", modelIds=["fixture-model"],
                                       workspaceControl=True, streaming=True, interrupt=True,
                                       warnings=[])

        development.adapter = ProbeAdapter()  # type: ignore[assignment]
        capabilities = await development.capabilities(project.projectId, draft.draftId)
        assert not capabilities.available
        assert "RUN_RECOVERY_REQUIRED" in capabilities.warnings
        with pytest.raises(DevelopmentError, match="RUN_RECOVERY_REQUIRED"):
            await development._start_owned(RunLaunchInput(
                projectId=project.projectId, taskId=draft.draftId,
                expectedTaskRevision=2, modelId="fixture-model",
                idempotencyKey=uuid4(),
            ))
        assert runtime.recovery.reconcile().interrupted_runs == 0
        assert git(source, "rev-parse", "HEAD") == head
        assert git(source, "status", "--porcelain") == ""
        assert any(record["runId"] == str(config.runId)
                   for record in runtime.processes.inspect_orphans())
        # The *real* orphan fixture exits before the unit-simulated boot change.
        # No production boot source can be overridden from Renderer or env.
        await asyncio.sleep(3.2)
        observed = runtime.storage.session().execute(
            "SELECT observed_boot_id FROM run_recovery_observations WHERE run_id=?",
            (str(config.runId),),
        ).fetchone()
        assert observed is not None
        with pytest.raises(sqlite3.IntegrityError, match="recovery evidence required"):
            with runtime.storage.transaction() as db:
                db.execute(
                    "UPDATE runs SET recovery_resolved_at=? WHERE run_id=?",
                    (timestamp(), str(config.runId)),
                )
        runtime.recovery = RecoveryService(
            runtime.storage, runtime.processes, boot_reader=lambda: None,
        )
        assert (await runtime.dispatch_async(status_request))["data"]["state"] == "unavailable"
        with pytest.raises(ProtocolError) as unknown_boot:
            await runtime.dispatch_async(resolution_request)
        assert unknown_boot.value.code == "RUN_RECOVERY_PROOF_REQUIRED"
        other_boot = str(uuid4())
        assert other_boot != observed["observed_boot_id"]
        runtime.recovery = RecoveryService(
            runtime.storage, runtime.processes, boot_reader=lambda: other_boot,
        )
        assert (await runtime.dispatch_async(status_request))["data"]["state"] == "eligible"
        original = record.with_suffix(".saved")
        record.rename(original)
        record.symlink_to(original)
        with pytest.raises(ProtocolError) as missing_identity:
            await runtime.dispatch_async(resolution_request)
        assert missing_identity.value.code == "RUN_RECOVERY_EVIDENCE_INVALID"
        record.unlink()
        original.rename(record)
        with pytest.raises(ProtocolError) as stale_revision:
            await runtime.dispatch_async(resolution_request.model_copy(update={"params": {
                **resolution_request.params, "expectedRunRevision": run.revision + 1,
            }}))
        assert stale_revision.value.code == "RUN_STALE"
        resolved = (await runtime.dispatch_async(resolution_request))["data"]
        assert resolved["state"] == "resolved"
        assert resolved["runRevision"] == run.revision + 1
        assert (await runtime.dispatch_async(resolution_request))["data"] == resolved
        assert runtime.runs.get(project.projectId, config.runId).state == "interrupted"
        assert runtime.storage.session().execute(
            "SELECT state FROM run_workspace_leases WHERE run_id=?",
            (str(config.runId),),
        ).fetchone()["state"] == "released"
        retained_preview = (await runtime.dispatch_async(request))["data"]
        assert retained_preview["diff"]["files"] == preview["diff"]["files"]
        assert runtime.dispatch(RpcRequest(
            jsonrpc="2.0", id=str(uuid4()), method="system.profileSwitchSafety",
            params={}, transportVersion=TRANSPORT_VERSION,
        ))["safe"] is True
        assert not development._has_unreconciled_run(project.projectId)
        board = runtime.board.snapshot(str(project.projectId))
        assert board.tasks[0].state == "todo"
        assert git(source, "status", "--porcelain") == ""
        assert "+interrupted worktree change" in preview["diff"]["text"]
        new_config = runtime.configs.create(selection(
            project, draft, environment, VersionLock(
                id="standard", version="1", contentHash="a" * 64,
            ),
        ))
        fresh = await runtime.workspaces.create(source, str(new_config.runId), head)
        acquired = await runtime.workspaces.acquire(fresh.workspaceId, str(new_config.runId))
        assert acquired.activeLeaseId is not None
        admitted = runtime.runs.begin(RunStartIntent(
            runId=new_config.runId, projectId=project.projectId, taskId=draft.draftId,
            attemptId=uuid4(), workspaceId=acquired.workspaceId,
            workspaceLeaseId=acquired.activeLeaseId, leaseEpoch=acquired.leaseEpoch,
            baseRevision=acquired.baseRevision, nodeId="develop",
            executorId="forge.executor.codex", configHash=new_config.snapshotHash,
            createdAt=timestamp(),
        ))
        assert admitted.state == "queued"
        assert read_run_outcomes(runtime.storage.session()).interruptedRuns == 1
    finally:
        runtime.storage.close()
        # The orphan fixture exits on its own; a fresh Host must never kill a
        # historical PID whose kernel start identity it cannot prove.
        await asyncio.sleep(3.2)


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
    active_project = storage.get_project(str(project_id))
    assert active_project is not None
    with pytest.raises(PersistenceError, match="PROJECT_BUSY"):
        storage.remove_project(str(project_id), active_project.revision, timestamp())
    assert storage.active_project() is not None
    assert storage.get_project(str(project_id)).archivedAt is None
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
    recovered_project = runtime.storage.get_project(str(project_id))
    assert recovered_project is not None
    with pytest.raises(PersistenceError, match="RUN_RECOVERY_REQUIRED"):
        runtime.storage.remove_project(
            str(project_id), recovered_project.revision, timestamp()
        )
    assert runtime.storage.active_project() is not None
    assert runtime.storage.get_project(str(project_id)).archivedAt is None
    outcome_report = read_run_outcomes(runtime.storage.session())
    assert outcome_report.interruptedRuns == 1
    assert outcome_report.acceptedDeliveryRuns == 0
    assert outcome_report.outcomes[0].outcome == "interrupted"
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
async def test_project_removal_waits_for_verifier_and_keeps_source(tmp_path: Path) -> None:
    source, _, storage, project_id, _, _ = await accepted_fixture(tmp_path)
    project = storage.get_project(str(project_id))
    assert project is not None
    job = storage.session().execute(
        "SELECT verification_id FROM verifier_jobs WHERE project_id=? LIMIT 1",
        (str(project_id),),
    ).fetchone()
    assert job is not None
    with storage.transaction() as db:
        db.execute(
            "UPDATE verifier_jobs SET state='running' WHERE verification_id=?",
            (job["verification_id"],),
        )
    with pytest.raises(PersistenceError, match="PROJECT_BUSY"):
        storage.remove_project(str(project_id), project.revision, timestamp())
    assert storage.active_project() is not None
    assert storage.get_project(str(project_id)).archivedAt is None
    with storage.transaction() as db:
        db.execute(
            "UPDATE verifier_jobs SET state='completed' WHERE verification_id=?",
            (job["verification_id"],),
        )
    assert storage.remove_project(str(project_id), project.revision, timestamp())
    assert storage.active_project() is None
    assert source.is_dir() and (source / ".git").exists()
    storage.close()


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
