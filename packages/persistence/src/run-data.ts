import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { runAttemptResultSchema, runStartIntentSchema, runViewSchema,
  type RunAttemptResult, type RunStartIntent, type RunView } from '@forge/contracts';
import { canonicalJson } from '@forge/core/approvals';
import { resultBelongsToAttempt, verifyRunStart } from '@forge/core/run';
import { RunConfigDataStore } from './run-config-data.js';

export class RunStorageError extends Error {
  constructor(readonly code: 'RUN_NOT_FOUND' | 'RUN_CONFLICT' | 'RUN_STALE' |
    'RUN_EXPIRED' | 'RUN_PROCESS_UNCONFIRMED') { super(code); }
}

interface RunRow {
  run_id: string; project_id: string; task_id: string; config_hash: string;
  state: string; revision: number; created_at: string; deadline_at: string; finished_at: string | null;
}
interface AttemptRow {
  attempt_id: string; run_id: string; node_id: string; attempt_no: number;
  workspace_id: string; workspace_lease_id: string; lease_epoch: number; base_revision: string;
  executor_id: string; state: string; intent_at: string; started_at: string | null;
  ended_at: string | null; native_session_ref: string | null; last_event_sequence: number;
  result_hash: string | null;
}
export type ResultDisposition = 'APPLIED' | 'DUPLICATE_RESULT' | 'STALE_RESULT';

export class RunDataStore {
  private readonly configs: RunConfigDataStore;
  constructor(private readonly db: Database.Database) { this.configs = new RunConfigDataStore(db); }

  begin(raw: RunStartIntent): RunView {
    const intent = runStartIntentSchema.parse(raw);
    return this.db.transaction(() => {
      const existing = this.get(intent.projectId, intent.runId);
      if (existing) {
        const prior = this.db.prepare(`SELECT detail_json FROM run_events WHERE run_id=? AND type='attempt.intent'
          ORDER BY seq LIMIT 1`).get(intent.runId) as { detail_json: string } | undefined;
        if (prior && canonicalJson(JSON.parse(prior.detail_json)) === canonicalJson(intent)) return existing;
        throw new RunStorageError('RUN_CONFLICT');
      }
      const config = this.configs.get(intent.projectId, intent.runId);
      if (!config) throw new RunStorageError('RUN_NOT_FOUND');
      verifyRunStart(intent, config);
      const task = this.db.prepare('SELECT state FROM tasks WHERE project_id=? AND task_id=?')
        .get(intent.projectId, intent.taskId) as { state: string } | undefined;
      if (task?.state !== 'todo') throw new RunStorageError('RUN_CONFLICT');
      if (this.db.prepare(`SELECT 1 FROM runs WHERE project_id=? AND
        state IN ('queued','running','waiting_input','pausing','paused','canceling','interrupted')`).get(intent.projectId) ||
        this.db.prepare(`SELECT 1 FROM run_workspace_leases WHERE workspace_id=? AND
        state IN ('active','quarantined')`).get(intent.workspaceId)) throw new RunStorageError('RUN_CONFLICT');
      const deadline = new Date(Date.parse(intent.createdAt) + config.budget.maxDurationMs);
      if (Number.isNaN(deadline.valueOf()) || deadline.valueOf() <= Date.now()) throw new RunStorageError('RUN_EXPIRED');
      this.db.prepare(`INSERT INTO runs(run_id,project_id,task_id,config_hash,state,created_at,deadline_at)
        VALUES (?,?,?,?,'queued',?,?)`).run(intent.runId, intent.projectId, intent.taskId,
        intent.configHash, intent.createdAt, deadline.toISOString());
      this.db.prepare(`INSERT INTO run_attempts(attempt_id,run_id,node_id,attempt_no,workspace_id,
        workspace_lease_id,lease_epoch,base_revision,executor_id,state,intent_at)
        VALUES (?,?,?,?,?,?,?,?,?,'pending',?)`).run(intent.attemptId, intent.runId, intent.nodeId, 1,
        intent.workspaceId, intent.workspaceLeaseId, intent.leaseEpoch, intent.baseRevision,
        intent.executorId, intent.createdAt);
      this.db.prepare(`INSERT INTO run_workspace_leases(lease_id,run_id,attempt_id,workspace_id,
        epoch,state,acquired_at) VALUES (?,?,?,?,?,'active',?)`).run(intent.workspaceLeaseId,
        intent.runId, intent.attemptId, intent.workspaceId, intent.leaseEpoch, intent.createdAt);
      this.event(intent.runId, intent.attemptId, 'run.queued', {}, intent.createdAt);
      this.event(intent.runId, intent.attemptId, 'attempt.intent', intent, intent.createdAt);
      return this.required(intent.projectId, intent.runId);
    })();
  }

  launched(projectId: string, runId: string, attemptId: string, nativeSessionRef: string,
    now = new Date()): RunView {
    if (!nativeSessionRef) throw new RunStorageError('RUN_CONFLICT');
    return this.db.transaction(() => {
      const run = this.required(projectId, runId);
      if (run.attempt.attemptId !== attemptId || !['queued', 'canceling'].includes(run.state) ||
        run.attempt.state !== 'pending') {
        throw new RunStorageError('RUN_STALE');
      }
      const deadline = this.db.prepare('SELECT deadline_at FROM runs WHERE run_id=?')
        .get(runId) as { deadline_at: string };
      if (now.valueOf() >= Date.parse(deadline.deadline_at)) throw new RunStorageError('RUN_EXPIRED');
      this.db.prepare(`UPDATE runs SET state=CASE WHEN state='queued' THEN 'running' ELSE state END,
        revision=revision+1 WHERE run_id=?`).run(runId);
      this.db.prepare(`UPDATE run_attempts SET state='running',started_at=?,native_session_ref=?
        WHERE attempt_id=?`).run(now.toISOString(), nativeSessionRef, attemptId);
      this.event(runId, attemptId, 'attempt.started', { nativeSessionRef }, now.toISOString());
      return this.required(projectId, runId);
    })();
  }

  requestCancel(projectId: string, runId: string, attemptId: string,
    reason: 'user' | 'timeout' | 'shutdown', now = new Date()): RunView {
    return this.db.transaction(() => {
      const run = this.required(projectId, runId);
      if (run.attempt.attemptId !== attemptId) throw new RunStorageError('RUN_STALE');
      if (run.state === 'canceling') return run;
      if (!['queued', 'running'].includes(run.state)) throw new RunStorageError('RUN_CONFLICT');
      this.db.prepare(`INSERT INTO run_cancel_intents(run_id,attempt_id,reason,requested_at)
        VALUES (?,?,?,?)`).run(runId, attemptId, reason, now.toISOString());
      this.db.prepare(`UPDATE runs SET state='canceling',revision=revision+1 WHERE run_id=?`)
        .run(runId);
      return this.required(projectId, runId);
    })();
  }

  complete(projectId: string, currentRunId: string, raw: RunAttemptResult,
    verifiedStopped: boolean): { disposition: ResultDisposition; run: RunView } {
    const result = runAttemptResultSchema.parse(raw);
    return this.db.transaction((): { disposition: ResultDisposition; run: RunView } => {
      const run = this.required(projectId, currentRunId);
      const attempt = this.attempt(currentRunId);
      const config = this.configs.get(projectId, currentRunId);
      if (!config) throw new RunStorageError('RUN_NOT_FOUND');
      const expected = { runId: currentRunId, attemptId: attempt.attempt_id,
        workspaceLeaseId: attempt.workspace_lease_id, leaseEpoch: attempt.lease_epoch,
        contractRevision: config.taskRevision, configHash: run.configHash };
      const hash = createHash('sha256').update(canonicalJson(result)).digest('hex');
      if (!resultBelongsToAttempt(result, expected)) {
        this.event(currentRunId, attempt.attempt_id, 'result.stale',
          { sourceRunId: result.runId, sourceAttemptId: result.attemptId, reason: 'identity' }, result.timestamp);
        return { disposition: 'STALE_RESULT', run };
      }
      if (attempt.result_hash === hash) return { disposition: 'DUPLICATE_RESULT', run };
      const cancellable = run.state === 'canceling' && result.outcome === 'cancelled' &&
        ['pending', 'running'].includes(attempt.state);
      if ((!cancellable && (run.state !== 'running' || attempt.state !== 'running')) ||
        attempt.result_hash || (run.state === 'canceling' && result.outcome !== 'cancelled')) {
        this.event(currentRunId, attempt.attempt_id, 'result.stale',
          { sourceRunId: result.runId, sourceAttemptId: result.attemptId, reason: 'terminal' }, result.timestamp);
        return { disposition: 'STALE_RESULT', run };
      }
      if (!verifiedStopped) throw new RunStorageError('RUN_PROCESS_UNCONFIRMED');
      const state = result.outcome === 'completed' ? 'succeeded' : result.outcome === 'failed' ? 'failed' : 'cancelled';
      this.db.prepare('UPDATE runs SET state=?,revision=revision+1,finished_at=? WHERE run_id=?')
        .run(state, result.timestamp, currentRunId);
      this.db.prepare(`UPDATE run_attempts SET state=?,ended_at=?,last_event_sequence=?,result_hash=?,
        result_json=? WHERE attempt_id=?`).run(state, result.timestamp, result.lastEventSequence,
        hash, JSON.stringify(result), attempt.attempt_id);
      this.db.prepare(`UPDATE run_workspace_leases SET state='released',released_at=? WHERE lease_id=?`)
        .run(result.timestamp, attempt.workspace_lease_id);
      this.event(currentRunId, attempt.attempt_id, 'attempt.result',
        { outcome: result.outcome, resultHash: hash }, result.timestamp);
      return { disposition: 'APPLIED', run: this.required(projectId, currentRunId) };
    })();
  }

  interruptUncertain(projectId: string, runId: string, attemptId: string,
    reason: 'launch_unknown' | 'process_unconfirmed' | 'cancel_unconfirmed', now = new Date()): RunView {
    return this.db.transaction(() => {
      const run = this.required(projectId, runId);
      if (run.attempt.attemptId !== attemptId || !['queued', 'running', 'canceling'].includes(run.state)) {
        throw new RunStorageError('RUN_STALE');
      }
      this.db.prepare(`UPDATE runs SET state='interrupted',revision=revision+1,finished_at=?
        WHERE run_id=?`).run(now.toISOString(), runId);
      this.db.prepare(`UPDATE run_attempts SET state='interrupted',ended_at=? WHERE attempt_id=?`)
        .run(now.toISOString(), attemptId);
      this.db.prepare(`UPDATE run_workspace_leases SET state='quarantined' WHERE lease_id=?`)
        .run(run.attempt.workspaceLeaseId);
      this.event(runId, attemptId, 'run.failed', { reason }, now.toISOString());
      return this.required(projectId, runId);
    })();
  }

  blockNoSideEffect(projectId: string, runId: string, attemptId: string,
    reason: 'rate_limit_exhausted', now = new Date()): RunView {
    return this.db.transaction(() => {
      const run = this.required(projectId, runId);
      if (run.state !== 'queued' || run.attempt.state !== 'pending' ||
        run.attempt.attemptId !== attemptId) throw new RunStorageError('RUN_STALE');
      this.db.prepare(`UPDATE runs SET state='waiting_input',revision=revision+1 WHERE run_id=?`).run(runId);
      this.db.prepare(`UPDATE run_attempts SET state='failed',ended_at=? WHERE attempt_id=?`)
        .run(now.toISOString(), attemptId);
      this.db.prepare(`UPDATE run_workspace_leases SET state='released',released_at=? WHERE lease_id=?`)
        .run(now.toISOString(), run.attempt.workspaceLeaseId);
      this.event(runId, attemptId, 'run.blocked', { reason }, now.toISOString());
      return this.required(projectId, runId);
    })();
  }

  get(projectId: string, runId: string): RunView | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE project_id=? AND run_id=?')
      .get(projectId, runId) as RunRow | undefined;
    if (!row) return null;
    const attempt = this.attempt(runId);
    return runViewSchema.parse({ runId: row.run_id, projectId: row.project_id, taskId: row.task_id,
      configHash: row.config_hash, state: row.state, revision: row.revision,
      createdAt: row.created_at, finishedAt: row.finished_at,
      attempt: { attemptId: attempt.attempt_id, runId: attempt.run_id,
        nodeId: attempt.node_id, attemptNo: attempt.attempt_no, leaseEpoch: attempt.lease_epoch,
        workspaceLeaseId: attempt.workspace_lease_id, state: attempt.state,
        nativeSessionRef: attempt.native_session_ref, lastEventSequence: attempt.last_event_sequence,
        startedAt: attempt.started_at, endedAt: attempt.ended_at } });
  }

  private required(projectId: string, runId: string): RunView {
    const view = this.get(projectId, runId);
    if (!view) throw new RunStorageError('RUN_NOT_FOUND');
    return view;
  }
  private attempt(runId: string): AttemptRow {
    const row = this.db.prepare('SELECT * FROM run_attempts WHERE run_id=? ORDER BY attempt_no DESC LIMIT 1')
      .get(runId) as AttemptRow | undefined;
    if (!row) throw new RunStorageError('RUN_NOT_FOUND');
    return row;
  }
  private event(runId: string, attemptId: string, type: string, detail: unknown, at: string): void {
    this.db.prepare(`INSERT INTO run_events(run_id,attempt_id,type,detail_json,created_at) VALUES (?,?,?,?,?)`)
      .run(runId, attemptId, type, JSON.stringify(detail), at);
  }
}
