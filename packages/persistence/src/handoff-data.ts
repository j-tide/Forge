import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { developmentHandoffSchema, type DevelopmentHandoff } from '@forge/contracts';

export class HandoffStorageError extends Error {
  constructor(readonly code: 'HANDOFF_CONFLICT' | 'HANDOFF_STALE' | 'HANDOFF_CORRUPT') {
    super(code);
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class HandoffDataStore {
  constructor(private readonly db: Database.Database) {}

  save(projectId: string, raw: DevelopmentHandoff): DevelopmentHandoff {
    const value = developmentHandoffSchema.parse(raw);
    const { snapshot, bundle, artifact, stepResult } = value;
    if (snapshot.projectId !== projectId || snapshot.runId !== stepResult.runId ||
      snapshot.attemptId !== stepResult.attemptId ||
      snapshot.snapshotId !== bundle.snapshotId || snapshot.snapshotId !== artifact.snapshotId ||
      stepResult.snapshotId !== snapshot.snapshotId || bundle.artifactIds.length !== 1 ||
      bundle.artifactIds[0] !== artifact.artifactId ||
      bundle.contractRevision !== stepResult.contractRevision ||
      artifact.byteSize !== Buffer.byteLength(JSON.stringify(stepResult)) ||
      artifact.contentHash !== digest(JSON.stringify(stepResult)) ||
      snapshot.contentHash !== digest(JSON.stringify({ workspaceId: snapshot.workspaceId,
        baseRevision: snapshot.baseRevision, treeSha: snapshot.treeSha,
        files: snapshot.files, excludedPaths: snapshot.excludedPaths }))) {
      throw new HandoffStorageError('HANDOFF_CORRUPT');
    }
    return this.db.transaction(() => {
      const existing = this.get(projectId, snapshot.runId);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(value)) return existing;
        throw new HandoffStorageError('HANDOFF_CONFLICT');
      }
      const run = this.db.prepare(`SELECT r.task_id,r.config_hash,r.state,a.attempt_id,a.state AS attempt_state
        FROM runs r JOIN run_attempts a ON a.run_id=r.run_id
        WHERE r.project_id=? AND r.run_id=?`).get(projectId, snapshot.runId) as
        {task_id:string;config_hash:string;state:string;attempt_id:string;attempt_state:string}|undefined;
      if (!run || run.state !== 'succeeded' || run.attempt_state !== 'succeeded' ||
        run.attempt_id !== snapshot.attemptId || run.task_id !== bundle.taskId ||
        run.config_hash !== bundle.runConfigHash ||
        bundle.contractRef !== `task:${run.task_id}@${bundle.contractRevision}` ||
        stepResult.outcome !== (snapshot.noChange ? 'inconclusive' : 'ready')) {
        throw new HandoffStorageError('HANDOFF_STALE');
      }
      this.db.prepare(`INSERT INTO code_snapshots(snapshot_id,project_id,run_id,attempt_id,
        workspace_id,commit_sha,tree_sha,base_sha,content_hash,snapshot_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(snapshot.snapshotId, projectId, snapshot.runId,
        snapshot.attemptId, snapshot.workspaceId, snapshot.commitSha, snapshot.treeSha,
        snapshot.baseRevision, snapshot.contentHash, JSON.stringify(snapshot), snapshot.createdAt);
      this.db.prepare(`INSERT INTO snapshot_artifacts(artifact_id,snapshot_id,kind,mime,
        byte_size,content_hash,redaction_version,content_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(artifact.artifactId, snapshot.snapshotId, artifact.kind,
        artifact.mime, artifact.byteSize, artifact.contentHash, artifact.redactionVersion,
        JSON.stringify(stepResult), artifact.createdAt);
      this.db.prepare(`INSERT INTO run_handoffs(run_id,snapshot_id,artifact_id,bundle_json,created_at)
        VALUES (?,?,?,?,?)`).run(snapshot.runId, snapshot.snapshotId, artifact.artifactId,
        JSON.stringify(bundle), artifact.createdAt);
      return value;
    })();
  }

  get(projectId: string, runId: string): DevelopmentHandoff | null {
    const row = this.db.prepare(`SELECT s.snapshot_json,s.content_hash AS snapshot_hash,
      s.commit_sha,s.tree_sha,h.bundle_json,a.artifact_id,a.snapshot_id,
      a.kind,a.mime,a.byte_size,a.content_hash AS artifact_hash,a.redaction_version,
      a.content_json,a.created_at
      FROM run_handoffs h JOIN code_snapshots s ON s.snapshot_id=h.snapshot_id
      JOIN snapshot_artifacts a ON a.artifact_id=h.artifact_id
      WHERE s.project_id=? AND h.run_id=?`).get(projectId, runId) as {
      snapshot_json:string;snapshot_hash:string;commit_sha:string;tree_sha:string;
      bundle_json:string;artifact_id:string;snapshot_id:string;kind:string;mime:string;
      byte_size:number;artifact_hash:string;redaction_version:string;
      content_json:string;created_at:string;
    }|undefined;
    if (!row) return null;
    try {
      const snapshot = JSON.parse(row.snapshot_json) as DevelopmentHandoff['snapshot'];
      const result = developmentHandoffSchema.parse({ snapshot,
        bundle: JSON.parse(row.bundle_json), stepResult: JSON.parse(row.content_json),
        artifact: { artifactId:row.artifact_id,snapshotId:row.snapshot_id,kind:row.kind,
          mime:row.mime,byteSize:row.byte_size,contentHash:row.artifact_hash,
          redactionVersion:row.redaction_version,createdAt:row.created_at } });
      if (snapshot.projectId !== projectId || snapshot.runId !== runId ||
        snapshot.contentHash !== row.snapshot_hash || snapshot.commitSha !== row.commit_sha ||
        snapshot.treeSha !== row.tree_sha ||
        digest(row.content_json) !== row.artifact_hash ||
        digest(JSON.stringify({ workspaceId:snapshot.workspaceId,
          baseRevision:snapshot.baseRevision, treeSha:snapshot.treeSha,
          files:snapshot.files, excludedPaths:snapshot.excludedPaths })) !== snapshot.contentHash) {
        throw new HandoffStorageError('HANDOFF_CORRUPT');
      }
      return result;
    } catch { throw new HandoffStorageError('HANDOFF_CORRUPT'); }
  }
}
