import type Database from 'better-sqlite3';
import { runDiffPreviewSchema, runInspectionSchema, runObservationSchema,
  type RunDiffPreview, type RunInspection, type RunObservation, type RunView } from '@forge/contracts';
import { RunDataStore, RunStorageError } from './run-data.js';

const maxObservations = 2000;
export interface ObservationInput {
  runId: string; attemptId: string; sourceSequenceFrom: number; sourceSequenceTo: number;
  type: string; text: string; timestamp: string;
}

interface ObservationRow {
  cursor: number; run_id: string; attempt_id: string; source_seq_from: number;
  source_seq_to: number; type: string; text: string; created_at: string;
}

export class RunInspectionDataStore {
  private readonly runs: RunDataStore;
  constructor(private readonly db: Database.Database) { this.runs = new RunDataStore(db); }

  append(projectId: string, input: ObservationInput): void {
    const { runId, attemptId, sourceSequenceFrom, sourceSequenceTo, type, text, timestamp } = input;
    const run = this.runs.get(projectId, runId);
    if (!run || run.attempt.attemptId !== attemptId ||
      sourceSequenceFrom < 1 || sourceSequenceFrom > sourceSequenceTo || text.length > 2048 ||
      type.length > 48 || !Number.isInteger(sourceSequenceFrom) || !Number.isInteger(sourceSequenceTo)) {
      throw new RunStorageError('RUN_CONFLICT');
    }
    const latest = this.db.prepare(`SELECT source_seq_to FROM run_observations WHERE run_id=?
      ORDER BY cursor DESC LIMIT 1`).get(runId) as { source_seq_to:number } | undefined;
    if (latest ? sourceSequenceFrom <= latest.source_seq_to : sourceSequenceFrom !== 1) {
      throw new RunStorageError('RUN_CONFLICT');
    }
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM run_observations WHERE run_id=?')
      .get(runId) as { count: number };
    if (count.count >= maxObservations && !['run.completed','run.failed','run.cancelled'].includes(type)) {
      if (count.count === maxObservations) this.db.prepare(`INSERT INTO run_observations(run_id,attempt_id,
        source_seq_from,source_seq_to,type,text,created_at) VALUES (?,?,?,?,?,?,?)`).run(runId,
        attemptId, sourceSequenceFrom, sourceSequenceTo, 'stream.truncated',
        'Run activity limit reached; later intermediate events are not retained', timestamp);
      return;
    }
    this.db.prepare(`INSERT INTO run_observations(run_id,attempt_id,source_seq_from,source_seq_to,
      type,text,created_at) VALUES (?,?,?,?,?,?,?)`).run(runId, attemptId, sourceSequenceFrom,
      sourceSequenceTo, type, text, timestamp);
  }

  saveUsage(projectId: string, runId: string, sourceSequence: number, value: unknown): void {
    if (!this.runs.get(projectId, runId)) throw new RunStorageError('RUN_NOT_FOUND');
    if (!Number.isInteger(sourceSequence) || sourceSequence < 1) throw new RunStorageError('RUN_CONFLICT');
    const usage = runInspectionSchema.shape.usage.unwrap().parse(value);
    this.db.prepare(`INSERT INTO run_usage_snapshots(run_id,usage_json,source_sequence) VALUES (?,?,?)
      ON CONFLICT(run_id) DO UPDATE SET usage_json=excluded.usage_json,
      source_sequence=excluded.source_sequence WHERE excluded.source_sequence>source_sequence`)
      .run(runId, JSON.stringify(usage), sourceSequence);
  }

  saveDiff(projectId: string, runId: string, preview: RunDiffPreview): void {
    if (!this.runs.get(projectId, runId)) throw new RunStorageError('RUN_NOT_FOUND');
    const value = runDiffPreviewSchema.parse(preview);
    this.db.prepare(`INSERT INTO run_diff_previews(run_id,preview_json,captured_at) VALUES (?,?,?)
      ON CONFLICT(run_id) DO UPDATE SET preview_json=excluded.preview_json,captured_at=excluded.captured_at`)
      .run(runId, JSON.stringify(value), value.capturedAt);
  }

  list(projectId: string, taskId: string): RunView[] {
    const rows = this.db.prepare('SELECT run_id FROM runs WHERE project_id=? AND task_id=? ORDER BY created_at DESC LIMIT 50')
      .all(projectId, taskId) as { run_id: string }[];
    return rows.map((row) => this.runs.get(projectId, row.run_id)).filter((value): value is RunView => value !== null);
  }

  inspect(projectId: string, runId: string, afterCursor: number, limit: number): RunInspection {
    const run = this.runs.get(projectId, runId);
    if (!run) throw new RunStorageError('RUN_NOT_FOUND');
    const rows = this.db.prepare(`SELECT * FROM run_observations WHERE run_id=? AND cursor>?
      ORDER BY cursor LIMIT ?`).all(runId, afterCursor, limit + 1) as ObservationRow[];
    const observations: RunObservation[] = rows.slice(0, limit).map((row) => runObservationSchema.parse({
      cursor: row.cursor, runId: row.run_id, attemptId: row.attempt_id,
      sourceSequenceFrom: row.source_seq_from, sourceSequenceTo: row.source_seq_to,
      type: row.type, text: row.text, timestamp: row.created_at,
    }));
    const diffRow = this.db.prepare('SELECT preview_json FROM run_diff_previews WHERE run_id=?')
      .get(runId) as { preview_json: string } | undefined;
    const sources = this.db.prepare('SELECT bundle_json FROM context_bundles WHERE run_id=? ORDER BY created_at LIMIT 1')
      .get(runId) as { bundle_json: string } | undefined;
    const bundle = sources ? JSON.parse(sources.bundle_json) as { items?: { sourceRef: string; authority: string; kind: string }[] } : null;
    const usage = this.db.prepare('SELECT usage_json FROM run_usage_snapshots WHERE run_id=?')
      .get(runId) as { usage_json: string } | undefined;
    return runInspectionSchema.parse({ run, observations, nextCursor: observations.at(-1)?.cursor ?? afterCursor,
      hasMore: rows.length > limit, diff: diffRow ? runDiffPreviewSchema.parse(JSON.parse(diffRow.preview_json)) : null,
      contextSources: (bundle?.items ?? []).slice(0, 128).map((item) => ({ sourceRef: item.sourceRef,
        sourceKind: `${item.authority}/${item.kind}` })), usage: usage ? JSON.parse(usage.usage_json) : null });
  }
}
