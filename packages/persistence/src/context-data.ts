import type Database from 'better-sqlite3';
import { workingCheckpointSchema,
  type ContextBundle, type WorkingCheckpoint } from '@forge/contracts';
import { buildContextBundle, verifyContextBundle, ContextError } from '@forge/core/context';
import { RunConfigDataStore } from './run-config-data.js';

export class ContextStorageError extends Error {
  constructor(readonly code: 'CONTEXT_NOT_FOUND' | 'CONTEXT_CONFLICT') { super(code); }
}

export class ContextDataStore {
  private readonly configs: RunConfigDataStore;
  constructor(private readonly db: Database.Database) { this.configs = new RunConfigDataStore(db); }

  saveBundle(raw: ContextBundle): ContextBundle {
    const bundle = verifyContextBundle(raw);
    return this.db.transaction(() => {
      const config = this.configs.get(bundle.projectId, bundle.runId);
      if (!config || config.taskId !== bundle.taskId || config.taskRevision !== bundle.taskRevision ||
        config.snapshotHash !== bundle.configHash) throw new ContextStorageError('CONTEXT_CONFLICT');
      const checkpoint=bundle.checkpointId ? this.checkpointById(bundle.projectId,bundle.runId,
        bundle.checkpointId) : null;
      if (bundle.checkpointId && !checkpoint) throw new ContextStorageError('CONTEXT_CONFLICT');
      if (checkpoint && Date.parse(bundle.createdAt)<Date.parse(checkpoint.createdAt)) {
        throw new ContextStorageError('CONTEXT_CONFLICT');
      }
      const derived = buildContextBundle(config,checkpoint,bundle.maxChars,
        new Date(bundle.createdAt),bundle.bundleId);
      if (derived.contentHash !== bundle.contentHash) throw new ContextStorageError('CONTEXT_CONFLICT');
      const current = this.getBundle(bundle.projectId, bundle.bundleId);
      if (current) {
        if (current.contentHash === bundle.contentHash) return current;
        throw new ContextStorageError('CONTEXT_CONFLICT');
      }
      this.db.prepare(`INSERT INTO context_bundles(bundle_id,project_id,run_id,content_hash,bundle_json,created_at)
        VALUES (?,?,?,?,?,?)`).run(bundle.bundleId,bundle.projectId,bundle.runId,
        bundle.contentHash,JSON.stringify(bundle),bundle.createdAt);
      return bundle;
    })();
  }

  getBundle(projectId: string, bundleId: string): ContextBundle | null {
    const row = this.db.prepare('SELECT bundle_json FROM context_bundles WHERE project_id=? AND bundle_id=?')
      .get(projectId,bundleId) as {bundle_json:string}|undefined;
    return row ? verifyContextBundle(JSON.parse(row.bundle_json)) : null;
  }

  appendCheckpoint(raw: WorkingCheckpoint): WorkingCheckpoint {
    const state = workingCheckpointSchema.parse(raw);
    return this.db.transaction(() => {
      const row = this.db.prepare(`SELECT r.project_id,r.state AS run_state,a.attempt_id
        FROM runs r JOIN run_attempts a ON a.run_id=r.run_id
        WHERE r.run_id=? AND a.attempt_id=?`).get(state.runId,state.attemptId) as
        {project_id:string;run_state:string;attempt_id:string}|undefined;
      if (!row || row.project_id !== state.projectId ||
        !['queued','running','waiting_input','paused','canceling','interrupted'].includes(row.run_state)) {
        throw new ContextStorageError('CONTEXT_CONFLICT');
      }
      const latest = this.latestCheckpoint(state.projectId,state.runId);
      if (state.sequence !== (latest?.sequence ?? 0)+1) throw new ContextStorageError('CONTEXT_CONFLICT');
      const config = this.configs.get(state.projectId,state.runId);
      if (!config || state.objective.text !== config.taskContract.goal) {
        throw new ContextStorageError('CONTEXT_CONFLICT');
      }
      this.db.prepare(`INSERT INTO working_checkpoints(checkpoint_id,project_id,run_id,attempt_id,
        sequence,state_json,created_at) VALUES (?,?,?,?,?,?,?)`).run(state.checkpointId,
        state.projectId,state.runId,state.attemptId,state.sequence,JSON.stringify(state),state.createdAt);
      return state;
    })();
  }

  latestCheckpoint(projectId:string,runId:string): WorkingCheckpoint|null {
    const row=this.db.prepare(`SELECT state_json FROM working_checkpoints WHERE project_id=? AND run_id=?
      ORDER BY sequence DESC LIMIT 1`).get(projectId,runId) as {state_json:string}|undefined;
    return row ? workingCheckpointSchema.parse(JSON.parse(row.state_json)) : null;
  }

  private checkpointById(projectId:string,runId:string,checkpointId:string): WorkingCheckpoint|null {
    const row=this.db.prepare(`SELECT state_json FROM working_checkpoints WHERE project_id=?
      AND run_id=? AND checkpoint_id=?`).get(projectId,runId,checkpointId) as {state_json:string}|undefined;
    return row ? workingCheckpointSchema.parse(JSON.parse(row.state_json)) : null;
  }
}

export { ContextError };
