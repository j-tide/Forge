import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { runConfigSelectionSchema, taskContractSchema,
  type RunConfigSelection, type RunConfigSnapshot } from '@forge/contracts';
import { canonicalJson, contractDigest } from '@forge/core/approvals';
import { freezeRunConfig, verifyRunConfig } from '@forge/core/run-config';
import { ProjectDataStore } from './project-data.js';

export class RunConfigStorageError extends Error {
  constructor(readonly code: 'RUN_CONFIG_NOT_FOUND' | 'RUN_CONFIG_STALE' |
    'RUN_CONFIG_CONFLICT' | 'RUN_CONFIG_INVALID') { super(code); }
}

interface RunConfigRow {
  run_id: string; project_id: string; task_id: string; request_hash: string;
  snapshot_hash: string; snapshot_json: string;
}

export class RunConfigDataStore {
  private readonly projects: ProjectDataStore;
  constructor(private readonly db: Database.Database) { this.projects = new ProjectDataStore(db); }

  create(raw: RunConfigSelection): RunConfigSnapshot {
    const selection = runConfigSelectionSchema.parse(raw);
    const requestHash = createHash('sha256').update(canonicalJson(selection)).digest('hex');
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM run_config_snapshots WHERE run_id=?')
        .get(selection.runId) as RunConfigRow | undefined;
      if (existing) {
        if (existing.project_id !== selection.projectId || existing.request_hash !== requestHash) {
          throw new RunConfigStorageError('RUN_CONFIG_CONFLICT');
        }
        return this.read(existing);
      }
      const project = this.db.prepare('SELECT 1 FROM projects WHERE project_id=? AND archived_at IS NULL')
        .get(selection.projectId);
      if (!project) throw new RunConfigStorageError('RUN_CONFIG_NOT_FOUND');
      const task = this.db.prepare(`SELECT t.state,t.current_revision,r.contract_json,r.content_hash
        FROM tasks t JOIN task_revisions r ON r.task_id=t.task_id AND r.revision=t.current_revision
        WHERE t.project_id=? AND t.task_id=?`).get(selection.projectId, selection.taskId) as {
        state: string; current_revision: number; contract_json: string; content_hash: string;
      } | undefined;
      if (!task || task.state !== 'todo') throw new RunConfigStorageError('RUN_CONFIG_NOT_FOUND');
      if (task.current_revision !== selection.expectedTaskRevision) throw new RunConfigStorageError('RUN_CONFIG_STALE');
      const contract = taskContractSchema.parse(JSON.parse(task.contract_json));
      if (contractDigest(contract) !== task.content_hash) throw new RunConfigStorageError('RUN_CONFIG_INVALID');
      const environment = this.projects.getEnvironment(selection.projectId, selection.environmentId);
      if (!environment || environment.archivedAt) throw new RunConfigStorageError('RUN_CONFIG_NOT_FOUND');
      if (environment.revision !== selection.expectedEnvironmentRevision) {
        throw new RunConfigStorageError('RUN_CONFIG_STALE');
      }
      const snapshot = freezeRunConfig(selection, contract, environment);
      this.db.prepare(`INSERT INTO run_config_snapshots(run_id,project_id,task_id,request_hash,
        snapshot_hash,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?)`)
        .run(selection.runId, selection.projectId, selection.taskId, requestHash,
          snapshot.snapshotHash, JSON.stringify(snapshot), snapshot.createdAt);
      return snapshot;
    })();
  }

  get(projectId: string, runId: string): RunConfigSnapshot | null {
    const row = this.db.prepare('SELECT * FROM run_config_snapshots WHERE project_id=? AND run_id=?')
      .get(projectId, runId) as RunConfigRow | undefined;
    return row ? this.read(row) : null;
  }

  private read(row: RunConfigRow): RunConfigSnapshot {
    try {
      const snapshot = verifyRunConfig(JSON.parse(row.snapshot_json));
      if (snapshot.runId !== row.run_id || snapshot.projectId !== row.project_id ||
        snapshot.taskId !== row.task_id || snapshot.snapshotHash !== row.snapshot_hash) {
        throw new RunConfigStorageError('RUN_CONFIG_INVALID');
      }
      return snapshot;
    } catch { throw new RunConfigStorageError('RUN_CONFIG_INVALID'); }
  }
}
