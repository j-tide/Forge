import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { storageHealthSchema, type StorageHealth } from '@forge/contracts';
import { forgeProjectSchema, projectProbeSchema, type ForgeProject,
  type ProjectEnvironment, type CommandPreset, type Conversation,
  type ConversationMessage, type ConversationSend, type DraftGenerationRequest,
  type TaskDraft, type TaskContract, type DraftRevision, type DraftReviseInput,
  type ApprovalRequestInput, type ApprovalDecideInput, type TaskApproval } from '@forge/contracts';
import type { RunConfigSelection, RunConfigSnapshot,
  RunStartIntent, RunAttemptResult, RunView } from '@forge/contracts';
import type { BoardReorderInput, BoardSnapshot, TaskDetailView } from '@forge/contracts';
import { PersistenceError, mapDatabaseError } from './errors.js';
import { ProjectDataStore, ProjectStorageError, type EnvironmentInput, type PresetInput } from './project-data.js';
import { ConversationDataStore, ConversationStorageError } from './conversation-data.js';
import { DraftDataStore, DraftStorageError } from './draft-data.js';
import { TaskApprovalDataStore, TaskApprovalStorageError } from './task-approval-data.js';
import { BoardDataStore, BoardStorageError } from './board-data.js';
import { RunConfigDataStore, RunConfigStorageError } from './run-config-data.js';
import { RunDataStore, RunStorageError, type ResultDisposition } from './run-data.js';
import { ContextDataStore, ContextStorageError, ContextError } from './context-data.js';
import type { ContextBundle, WorkingCheckpoint } from '@forge/contracts';
import type { RunDiffPreview, RunInspection } from '@forge/contracts';
import type { DevelopmentHandoff } from '@forge/contracts';
import { RunInspectionDataStore, type ObservationInput } from './run-inspection-data.js';
import { HandoffDataStore, HandoffStorageError } from './handoff-data.js';
import { RunConfigError } from '@forge/core/run-config';
import { RunTransitionError } from '@forge/core/run';
import { latestSchemaVersion, migrate as runMigrations, schemaVersion as readSchemaVersion } from './migrations.js';

export { PersistenceError, mapDatabaseError } from './errors.js';
export { ProjectStorageError } from './project-data.js';
export { ConversationStorageError } from './conversation-data.js';
export { DraftStorageError } from './draft-data.js';
export { TaskApprovalStorageError } from './task-approval-data.js';
export { BoardStorageError } from './board-data.js';
export { RunConfigStorageError } from './run-config-data.js';
export { RunStorageError, type ResultDisposition } from './run-data.js';
export { ContextStorageError } from './context-data.js';
export { HandoffStorageError } from './handoff-data.js';
export { resolveForgeDataDir, type ForgeEnvironment } from './path.js';
export { latestSchemaVersion, migrations } from './migrations.js';

const metadata = sqliteTable('runtime_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export interface MetadataTransaction {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

interface ProjectRow {
  project_id: string; environment_id: string; name: string; canonical_path: string;
  repository_type: string; git_root: string | null; default_branch: string | null;
  trust_version: string; trust_approved_at: string; environment_summary_hash: string;
  probe_json: string; created_at: string; updated_at: string; last_opened_at: string;
  revision: number; archived_at: string | null;
}

function readProject(row: ProjectRow): ForgeProject {
  return forgeProjectSchema.parse({
    projectId: row.project_id, environmentId: row.environment_id, name: row.name,
    rootPath: row.canonical_path, repositoryType: row.repository_type,
    gitRoot: row.git_root, defaultBranch: row.default_branch, trusted: true,
    trustVersion: row.trust_version, trustApprovedAt: row.trust_approved_at,
    environmentSummaryHash: row.environment_summary_hash,
    createdAt: row.created_at, updatedAt: row.updated_at, lastOpenedAt: row.last_opened_at,
    revision: row.revision, archivedAt: row.archived_at,
    probe: projectProbeSchema.parse(JSON.parse(row.probe_json)),
  });
}

export class ForgePersistence {
  private native: Database.Database | null = null;
  private orm: ReturnType<typeof drizzle> | null = null;
  private migrated = false;

  constructor(private readonly dataDir: string) {}

  async open(): Promise<void> {
    if (this.native) return;
    try {
      await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const db = new Database(join(this.dataDir, 'forge.sqlite'));
      this.native = db;
      db.pragma('foreign_keys = ON');
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      const integrity = db.pragma('quick_check', { simple: true });
      if (integrity !== 'ok') throw new PersistenceError('DATABASE_CORRUPT');
      this.orm = drizzle(db);
    } catch (error) {
      this.native?.close();
      this.native = null;
      this.orm = null;
      this.migrated = false;
      throw mapDatabaseError(error, 'DATABASE_OPEN_FAILED');
    }
  }

  close(): void {
    const db = this.native;
    this.native = null;
    this.orm = null;
    this.migrated = false;
    db?.close();
  }

  migrate(targetVersion = latestSchemaVersion): number {
    this.migrated = false;
    try {
      const version = runMigrations(this.database(), targetVersion);
      this.migrated = version === latestSchemaVersion;
      return version;
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_MIGRATION_FAILED'); }
  }

  schemaVersion(): number {
    try { return readSchemaVersion(this.database()); }
    catch (error) { throw mapDatabaseError(error, 'DATABASE_MIGRATION_FAILED'); }
  }

  health(): StorageHealth {
    try {
      const db = this.database();
      const version = this.schemaVersion();
      if (!this.migrated) throw new PersistenceError('DATABASE_MIGRATION_FAILED');
      const sqliteVersion = (db.prepare('SELECT sqlite_version() AS version').get() as { version: string }).version;
      const journalMode = String(db.pragma('journal_mode', { simple: true }));
      return storageHealthSchema.parse({
        status: 'ready', schemaVersion: version, sqliteVersion,
        journalMode: journalMode === 'wal' ? 'wal' : 'unknown', error: null,
      });
    } catch (error) {
      const mapped = mapDatabaseError(error, 'DATABASE_OPEN_FAILED');
      return storageHealthSchema.parse({ status: 'unavailable', schemaVersion: null,
        sqliteVersion: null, journalMode: 'unknown', error: mapped.toForgeError('storage-health') });
    }
  }

  getMetadata(key: string): string | null {
    this.ensureMigrated();
    this.validateKey(key);
    try { return this.repository().select().from(metadata).where(eq(metadata.key, key)).get()?.value ?? null; }
    catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  setMetadata(key: string, value: string): void {
    this.ensureMigrated();
    this.validateKey(key);
    try {
      this.repository().insert(metadata).values({ key, value, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: metadata.key, set: { value, updatedAt: new Date().toISOString() } }).run();
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  transaction<T>(callback: (transaction: MetadataTransaction) => T): T {
    this.ensureMigrated();
    let active = true;
    const transaction: MetadataTransaction = {
      get: (key) => { if (!active) throw new PersistenceError('DATABASE_IO_ERROR'); return this.getMetadata(key); },
      set: (key, value) => { if (!active) throw new PersistenceError('DATABASE_IO_ERROR'); this.setMetadata(key, value); },
    };
    try {
      return this.database().transaction(() => {
        const result = callback(transaction);
        if (result !== null && (typeof result === 'object' || typeof result === 'function')
          && 'then' in result && typeof result.then === 'function') {
          throw new PersistenceError('DATABASE_IO_ERROR');
        }
        return result;
      })();
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
    finally { active = false; }
  }

  recordHostStart(hostId: string): number {
    return this.transaction((tx) => {
      const count = Number(tx.get('host.startup_count') ?? '0') + 1;
      tx.set('host.startup_count', String(count));
      tx.set('host.last_id', hostId);
      return count;
    });
  }

  getProject(projectId: string, includeArchived = false): ForgeProject | null {
    this.ensureMigrated();
    try {
      const row = this.database().prepare(`SELECT * FROM projects WHERE project_id = ? ${includeArchived ? '' : 'AND archived_at IS NULL'}`).get(projectId) as ProjectRow | undefined;
      return row ? readProject(row) : null;
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  getProjectByPath(canonicalPath: string): ForgeProject | null {
    this.ensureMigrated();
    try {
      const row = this.database().prepare('SELECT * FROM projects WHERE canonical_path = ?').get(canonicalPath) as ProjectRow | undefined;
      return row ? readProject(row) : null;
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  listProjects(): ForgeProject[] {
    this.ensureMigrated();
    try {
      return (this.database().prepare('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY last_opened_at DESC, created_at DESC').all() as ProjectRow[]).map(readProject);
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  createProject(project: ForgeProject): ForgeProject {
    this.ensureMigrated();
    const value = forgeProjectSchema.parse(project);
    try {
      this.database().transaction(() => {
        this.database().prepare(`INSERT INTO projects(project_id,environment_id,name,canonical_path,repository_type,git_root,
          default_branch,trust_version,trust_approved_at,environment_summary_hash,probe_json,created_at,updated_at,last_opened_at,revision,archived_at)
          VALUES (@projectId,@environmentId,@name,@rootPath,@repositoryType,@gitRoot,@defaultBranch,
          @trustVersion,@trustApprovedAt,@environmentSummaryHash,@probeJson,@createdAt,@updatedAt,@lastOpenedAt,@revision,@archivedAt)`)
          .run({ ...value, probeJson: JSON.stringify(value.probe) });
        this.database().prepare(`INSERT INTO project_trust_decisions(project_id,trust_version,approved_at,environment_summary_hash,actor)
          VALUES (?,?,?,?,?)`).run(value.projectId, value.trustVersion, value.trustApprovedAt,
          value.environmentSummaryHash, 'local-user');
        this.database().prepare(`INSERT INTO environments(environment_id,project_id,name,config_json,revision,created_at,updated_at)
          VALUES (?,?,?,?,1,?,?)`).run(value.environmentId, value.projectId, 'Default',
          '{"commandPresetIds":[],"envRefs":[],"networkMode":"trusted-local"}', value.createdAt, value.updatedAt);
        this.database().prepare('INSERT INTO board_state(project_id,revision) VALUES (?,0)').run(value.projectId);
        this.setMetadata('project.active_id', value.projectId);
      })();
      return value;
    } catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  setActiveProject(projectId: string, expectedRevision: number): ForgeProject | null {
    this.ensureMigrated();
    try {
      return this.database().transaction(() => {
        const project = this.getProject(projectId);
        if (!project) return null;
        if (project.revision !== expectedRevision) throw new ProjectStorageError('REVISION_CONFLICT');
        const now = new Date().toISOString();
        const changed = this.database().prepare(`UPDATE projects SET last_opened_at = ?, updated_at = ?, revision = revision + 1
          WHERE project_id = ? AND revision = ? AND archived_at IS NULL`).run(now, now, projectId, expectedRevision).changes;
        if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
        this.setMetadata('project.active_id', projectId);
        return this.getProject(projectId);
      })();
    } catch (error) { if (error instanceof ProjectStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  activeProject(): ForgeProject | null {
    const id = this.getMetadata('project.active_id');
    return id ? this.getProject(id) : null;
  }

  updateProject(projectId: string, expectedRevision: number, values: { name?: string | undefined; defaultBranch?: string | null | undefined }): ForgeProject | null {
    this.ensureMigrated();
    try {
      const previous = this.getProject(projectId);
      if (!previous) return null;
      if (previous.revision !== expectedRevision) throw new ProjectStorageError('REVISION_CONFLICT');
      const updated = this.database().prepare(`UPDATE projects SET name = ?, default_branch = ?, updated_at = ?, revision = revision + 1
        WHERE project_id = ? AND revision = ? AND archived_at IS NULL`)
        .run(values.name ?? previous.name, values.defaultBranch === undefined ? previous.defaultBranch : values.defaultBranch,
          new Date().toISOString(), projectId, expectedRevision).changes > 0;
      if (!updated) throw new ProjectStorageError('REVISION_CONFLICT');
      return this.getProject(projectId);
    } catch (error) { if (error instanceof ProjectStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  removeProject(projectId: string, expectedRevision: number): boolean {
    this.ensureMigrated();
    try {
      return this.database().transaction(() => {
        const previous = this.getProject(projectId);
        if (!previous) return false;
        if (previous.revision !== expectedRevision) throw new ProjectStorageError('REVISION_CONFLICT');
        const archived = this.database().prepare(`UPDATE projects SET archived_at = ?, updated_at = ?, revision = revision + 1
          WHERE project_id = ? AND revision = ? AND archived_at IS NULL`)
          .run(new Date().toISOString(), new Date().toISOString(), projectId, expectedRevision).changes > 0;
        if (!archived) throw new ProjectStorageError('REVISION_CONFLICT');
        if (this.getMetadata('project.active_id') === projectId) {
          this.database().prepare('DELETE FROM runtime_metadata WHERE key = ?').run('project.active_id');
        }
        return true;
      })();
    } catch (error) { if (error instanceof ProjectStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  restoreProject(projectId: string, expectedRevision: number, probe: ForgeProject['probe'], approvedAt: string): ForgeProject {
    this.ensureMigrated();
    try {
      return this.database().transaction(() => {
        const previous = this.getProject(projectId, true);
        if (!previous || !previous.archivedAt) throw new ProjectStorageError('PROJECT_NOT_FOUND');
        if (previous.revision !== expectedRevision) throw new ProjectStorageError('REVISION_CONFLICT');
        const changed = this.database().prepare(`UPDATE projects SET archived_at = NULL, revision = revision + 1,
          trust_approved_at = ?, environment_summary_hash = ?, probe_json = ?, updated_at = ?, last_opened_at = ?
          WHERE project_id = ? AND revision = ? AND archived_at IS NOT NULL`)
          .run(approvedAt, probe.fingerprint, JSON.stringify(probe), approvedAt, approvedAt, projectId, expectedRevision).changes;
        if (!changed) throw new ProjectStorageError('REVISION_CONFLICT');
        this.database().prepare(`UPDATE project_trust_decisions SET approved_at = ?, environment_summary_hash = ? WHERE project_id = ?`)
          .run(approvedAt, probe.fingerprint, projectId);
        this.setMetadata('project.active_id', projectId);
        const restored = this.getProject(projectId);
        if (!restored) throw new ProjectStorageError('PROJECT_NOT_FOUND');
        return restored;
      })();
    } catch (error) { if (error instanceof ProjectStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  getEnvironment(projectId: string, environmentId: string): ProjectEnvironment | null {
    return this.projectData((store) => store.getEnvironment(projectId, environmentId));
  }
  listEnvironments(projectId: string): ProjectEnvironment[] {
    return this.projectData((store) => store.listEnvironments(projectId));
  }
  saveEnvironment(input: EnvironmentInput): ProjectEnvironment {
    return this.projectData((store) => store.saveEnvironment(input));
  }
  archiveEnvironment(projectId: string, environmentId: string, expectedRevision: number): ProjectEnvironment {
    return this.projectData((store) => store.archiveEnvironment(projectId, environmentId, expectedRevision));
  }
  getCommandPreset(projectId: string, presetId: string): CommandPreset | null {
    return this.projectData((store) => store.getPreset(projectId, presetId));
  }
  listCommandPresets(projectId: string, environmentId: string): CommandPreset[] {
    return this.projectData((store) => store.listPresets(projectId, environmentId));
  }
  saveCommandPreset(input: PresetInput): CommandPreset {
    return this.projectData((store) => store.savePreset(input));
  }
  approveCommandPreset(projectId: string, presetId: string, expectedRevision: number,
    scriptsHash: string, approvalHash: string): CommandPreset {
    return this.projectData((store) => store.approvePreset(projectId, presetId, expectedRevision, scriptsHash, approvalHash));
  }
  archiveCommandPreset(projectId: string, presetId: string, expectedRevision: number): CommandPreset {
    return this.projectData((store) => store.archivePreset(projectId, presetId, expectedRevision));
  }

  private projectData<T>(action: (store: ProjectDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new ProjectDataStore(this.database())); }
    catch (error) { if (error instanceof ProjectStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  createConversation(projectId: string, title: string, expectedRevision: number): Conversation {
    return this.conversationData((store) => store.create(projectId, title, expectedRevision));
  }
  getConversation(projectId: string, conversationId: string): Conversation | null {
    return this.conversationData((store) => store.get(projectId, conversationId));
  }
  listConversations(projectId: string): Conversation[] {
    return this.conversationData((store) => store.list(projectId));
  }
  archiveConversation(projectId: string, conversationId: string, expectedRevision: number): Conversation {
    return this.conversationData((store) => store.archive(projectId, conversationId, expectedRevision));
  }
  listConversationMessages(projectId: string, conversationId: string): ConversationMessage[] {
    return this.conversationData((store) => store.messages(projectId, conversationId));
  }
  recordUserMessage(input: ConversationSend): { message: ConversationMessage; replay: boolean } {
    return this.conversationData((store) => store.recordUserMessage(input));
  }
  failConversationRequest(projectId: string, conversationId: string, idempotencyKey: string): void {
    this.conversationData((store) => store.failRequest(projectId, conversationId, idempotencyKey));
  }
  beginAssistantMessage(projectId: string, conversationId: string, idempotencyKey: string): ConversationMessage {
    return this.conversationData((store) => store.beginAssistantMessage(projectId, conversationId, idempotencyKey));
  }
  conversationRequestStatus(projectId: string, conversationId: string, idempotencyKey: string):
    'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled' | null {
    return this.conversationData((store) => store.requestStatus(projectId, conversationId, idempotencyKey));
  }
  recoverInterruptedConversations(): number {
    return this.conversationData((store) => store.recoverInterrupted());
  }

  listTaskDrafts(projectId: string, conversationId: string): TaskDraft[] {
    return this.draftData((store) => store.list(projectId, conversationId));
  }
  getTaskDraft(projectId: string, draftId: string): TaskDraft | null {
    return this.draftData((store) => store.get(projectId, draftId));
  }
  beginTaskDraft(input: DraftGenerationRequest, mode: 'generating' | 'manual', provider: string | null): TaskDraft {
    return this.draftData((store) => store.begin(input, mode, provider));
  }
  finishTaskDraft(projectId: string, draftId: string, result: { intent: TaskDraft['intent'];
    contract: TaskContract | null; errorCode: TaskDraft['errorCode'] }): TaskDraft {
    return this.draftData((store) => store.finish(projectId, draftId, result));
  }
  recoverInterruptedTaskDrafts(): number { return this.draftData((store) => store.recoverInterrupted()); }
  updateTaskDraftText(projectId: string, draftId: string, expectedRevision: number, editableText: string): TaskDraft {
    return this.draftData((store) => store.updateText(projectId, draftId, expectedRevision, editableText));
  }
  listTaskDraftRevisions(projectId: string, draftId: string): DraftRevision[] {
    return this.draftData((store) => store.history(projectId, draftId));
  }
  reviseTaskDraft(input: DraftReviseInput, changedFields: string[]): TaskDraft {
    return this.draftData((store) => store.revise(input, changedFields));
  }

  private draftData<T>(action: (store: DraftDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new DraftDataStore(this.database())); }
    catch (error) { if (error instanceof DraftStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  requestTaskApproval(input: ApprovalRequestInput): TaskApproval {
    return this.approvalData((store) => store.request(input));
  }
  decideTaskApproval(input: ApprovalDecideInput): TaskApproval {
    return this.approvalData((store) => store.decide(input));
  }
  taskApprovalForDraft(projectId: string, draftId: string): TaskApproval | null {
    return this.approvalData((store) => store.forDraft(projectId, draftId));
  }
  private approvalData<T>(action: (store: TaskApprovalDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new TaskApprovalDataStore(this.database())); }
    catch (error) { if (error instanceof TaskApprovalStorageError) throw error;
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }
  boardSnapshot(projectId: string): BoardSnapshot {
    return this.boardData((store) => store.snapshot(projectId));
  }
  taskDetail(projectId: string, taskId: string): TaskDetailView {
    return this.boardData((store) => store.detail(projectId, taskId));
  }
  createRunConfig(selection: RunConfigSelection): RunConfigSnapshot {
    return this.runConfigData((store) => store.create(selection));
  }
  getRunConfig(projectId: string, runId: string): RunConfigSnapshot | null {
    return this.runConfigData((store) => store.get(projectId, runId));
  }
  private runConfigData<T>(action: (store: RunConfigDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new RunConfigDataStore(this.database())); }
    catch (error) { if (error instanceof RunConfigStorageError) throw error;
      if (error instanceof RunConfigError) throw new RunConfigStorageError(error.code);
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }
  beginRun(intent: RunStartIntent): RunView { return this.runData((store) => store.begin(intent)); }
  markRunLaunched(projectId: string, runId: string, attemptId: string,
    nativeSessionRef: string, now?: Date): RunView {
    return this.runData((store) => store.launched(projectId, runId, attemptId, nativeSessionRef, now));
  }
  requestRunCancellation(projectId: string, runId: string, attemptId: string,
    reason: 'user' | 'timeout' | 'shutdown', now?: Date): RunView {
    return this.runData((store) => store.requestCancel(projectId, runId, attemptId, reason, now));
  }
  completeRun(projectId: string, currentRunId: string, result: RunAttemptResult,
    verifiedStopped: boolean): { disposition: ResultDisposition; run: RunView } {
    return this.runData((store) => store.complete(projectId, currentRunId, result, verifiedStopped));
  }
  interruptRunUncertain(projectId: string, runId: string, attemptId: string,
    reason: 'launch_unknown' | 'process_unconfirmed' | 'cancel_unconfirmed', now?: Date): RunView {
    return this.runData((store) => store.interruptUncertain(projectId, runId, attemptId, reason, now));
  }
  blockRunWithoutSideEffect(projectId: string, runId: string, attemptId: string,
    reason: 'rate_limit_exhausted', now?: Date): RunView {
    return this.runData((store) => store.blockNoSideEffect(projectId, runId, attemptId, reason, now));
  }
  getRun(projectId: string, runId: string): RunView | null {
    return this.runData((store) => store.get(projectId, runId));
  }
  saveDevelopmentHandoff(projectId: string, value: DevelopmentHandoff): DevelopmentHandoff {
    return this.handoffData((store) => store.save(projectId, value));
  }
  getDevelopmentHandoff(projectId: string, runId: string): DevelopmentHandoff | null {
    return this.handoffData((store) => store.get(projectId, runId));
  }
  private handoffData<T>(action: (store: HandoffDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new HandoffDataStore(this.database())); }
    catch (error) { if (error instanceof HandoffStorageError) throw error;
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }
  appendRunObservation(projectId: string, input: ObservationInput): void {
    this.runInspectionData((store) => store.append(projectId, input));
  }
  saveRunUsage(projectId: string, runId: string, sequence: number, usage: unknown): void {
    this.runInspectionData((store) => store.saveUsage(projectId, runId, sequence, usage));
  }
  saveRunDiff(projectId: string, runId: string, diff: RunDiffPreview): void {
    this.runInspectionData((store) => store.saveDiff(projectId, runId, diff));
  }
  listTaskRuns(projectId: string, taskId: string): RunView[] {
    return this.runInspectionData((store) => store.list(projectId, taskId));
  }
  inspectRun(projectId: string, runId: string, afterCursor: number, limit: number): RunInspection {
    return this.runInspectionData((store) => store.inspect(projectId, runId, afterCursor, limit));
  }
  private runInspectionData<T>(action: (store: RunInspectionDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new RunInspectionDataStore(this.database())); }
    catch (error) {
      if (error instanceof RunStorageError) throw error;
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR');
    }
  }
  saveContextBundle(bundle: ContextBundle): ContextBundle {
    return this.contextData((store) => store.saveBundle(bundle));
  }
  getContextBundle(projectId: string, bundleId: string): ContextBundle | null {
    return this.contextData((store) => store.getBundle(projectId, bundleId));
  }
  appendWorkingCheckpoint(checkpoint: WorkingCheckpoint): WorkingCheckpoint {
    return this.contextData((store) => store.appendCheckpoint(checkpoint));
  }
  latestWorkingCheckpoint(projectId: string, runId: string): WorkingCheckpoint | null {
    return this.contextData((store) => store.latestCheckpoint(projectId, runId));
  }
  private contextData<T>(action: (store: ContextDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new ContextDataStore(this.database())); }
    catch (error) {
      if (error instanceof ContextStorageError || error instanceof ContextError) throw error;
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR');
    }
  }
  private runData<T>(action: (store: RunDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new RunDataStore(this.database())); }
    catch (error) {
      if (error instanceof RunStorageError) throw error;
      if (error instanceof RunTransitionError) throw new RunStorageError('RUN_CONFLICT');
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR');
    }
  }
  reorderBoard(input: BoardReorderInput): BoardSnapshot {
    return this.boardData((store) => store.reorder(input));
  }
  private boardData<T>(action: (store: BoardDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new BoardDataStore(this.database())); }
    catch (error) { if (error instanceof BoardStorageError) throw error;
      throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }
  appendAssistantChunk(projectId: string, conversationId: string, messageId: string, chunk: string): ConversationMessage {
    return this.conversationData((store) => store.appendAssistantChunk(projectId, conversationId, messageId, chunk));
  }
  finishAssistantMessage(projectId: string, conversationId: string, messageId: string,
    status: 'completed' | 'failed' | 'cancelled'): ConversationMessage {
    return this.conversationData((store) => store.finishAssistantMessage(projectId, conversationId, messageId, status));
  }

  private conversationData<T>(action: (store: ConversationDataStore) => T): T {
    this.ensureMigrated();
    try { return action(new ConversationDataStore(this.database())); }
    catch (error) { if (error instanceof ConversationStorageError) throw error; throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  async backup(destination: string): Promise<void> {
    try { await this.database().backup(destination); }
    catch (error) { throw mapDatabaseError(error, 'DATABASE_IO_ERROR'); }
  }

  private database(): Database.Database {
    if (!this.native) throw new PersistenceError('DATABASE_OPEN_FAILED');
    return this.native;
  }

  private ensureMigrated(): void {
    if (!this.migrated) throw new PersistenceError('DATABASE_MIGRATION_FAILED');
  }

  private repository(): NonNullable<typeof this.orm> {
    if (!this.orm) throw new PersistenceError('DATABASE_OPEN_FAILED');
    return this.orm;
  }

  private validateKey(key: string): void {
    if (!/^[a-z][a-z0-9._-]{0,127}$/.test(key)) throw new PersistenceError('DATABASE_IO_ERROR');
  }
}
