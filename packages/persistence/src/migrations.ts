import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { PersistenceError, mapDatabaseError } from './errors.js';

export interface Migration { version: number; sql: string; checksum: string }

function migration(version: number, sql: string): Migration {
  return { version, sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

export const migrations: readonly Migration[] = Object.freeze([
  migration(1, `CREATE TABLE schema_migrations(
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL,
    checksum TEXT NOT NULL
  );
  CREATE TABLE runtime_metadata(
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`),
  migration(2, `ALTER TABLE runtime_metadata ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
  CREATE INDEX idx_runtime_metadata_updated_at ON runtime_metadata(updated_at);`),
  migration(3, `CREATE TABLE projects(
    project_id TEXT PRIMARY KEY,
    environment_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    canonical_path TEXT NOT NULL UNIQUE,
    repository_type TEXT NOT NULL CHECK(repository_type IN ('git','none')),
    git_root TEXT,
    default_branch TEXT,
    trust_version TEXT NOT NULL,
    trust_approved_at TEXT NOT NULL,
    environment_summary_hash TEXT NOT NULL,
    probe_json TEXT NOT NULL CHECK(json_valid(probe_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL
  );
  CREATE TABLE project_trust_decisions(
    project_id TEXT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    trust_version TEXT NOT NULL,
    approved_at TEXT NOT NULL,
    environment_summary_hash TEXT NOT NULL,
    actor TEXT NOT NULL CHECK(actor='local-user')
  );`),
  migration(4, `ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1);
  ALTER TABLE projects ADD COLUMN archived_at TEXT;
  CREATE TABLE environments(
    environment_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    name TEXT NOT NULL,
    config_json TEXT NOT NULL CHECK(json_valid(config_json)),
    revision INTEGER NOT NULL CHECK(revision >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    UNIQUE(environment_id, project_id)
  );
  CREATE UNIQUE INDEX ux_environments_live_name ON environments(project_id, name) WHERE archived_at IS NULL;
  CREATE TABLE command_presets(
    preset_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    environment_id TEXT NOT NULL,
    name TEXT NOT NULL,
    executable TEXT NOT NULL,
    argv_json TEXT NOT NULL CHECK(json_valid(argv_json)),
    cwd_relative TEXT NOT NULL,
    env_refs_json TEXT NOT NULL CHECK(json_valid(env_refs_json)),
    timeout_seconds INTEGER NOT NULL CHECK(timeout_seconds BETWEEN 1 AND 7200),
    scripts_hash TEXT NOT NULL,
    approval_hash TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL CHECK(revision >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    FOREIGN KEY(environment_id, project_id) REFERENCES environments(environment_id, project_id)
  );
  CREATE UNIQUE INDEX ux_command_presets_live_name ON command_presets(project_id, environment_id, name) WHERE archived_at IS NULL;
  INSERT INTO environments(environment_id,project_id,name,config_json,revision,created_at,updated_at)
    SELECT environment_id,project_id,'Default','{"commandPresetIds":[],"envRefs":[],"networkMode":"trusted-local"}',1,created_at,updated_at FROM projects;`),
  migration(5, `CREATE TABLE conversations(
    conversation_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    title TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    UNIQUE(conversation_id, project_id)
  );
  CREATE INDEX ix_conversations_project ON conversations(project_id, updated_at DESC);
  CREATE TABLE messages(
    message_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
    sequence INTEGER NOT NULL CHECK(sequence >= 1),
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
    content_json TEXT NOT NULL CHECK(json_valid(content_json)),
    status TEXT NOT NULL CHECK(status IN ('pending','streaming','completed','failed','cancelled')),
    provider_metadata_json TEXT CHECK(provider_metadata_json IS NULL OR json_valid(provider_metadata_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(conversation_id, sequence)
  );
  CREATE TABLE conversation_requests(
    request_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
    idempotency_key TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    user_message_id TEXT NOT NULL REFERENCES messages(message_id),
    assistant_message_id TEXT REFERENCES messages(message_id),
    status TEXT NOT NULL CHECK(status IN ('pending','streaming','completed','failed','cancelled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(conversation_id, idempotency_key)
  );`),
  migration(6, `CREATE TABLE task_drafts(
    draft_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
    source_message_id TEXT NOT NULL REFERENCES messages(message_id),
    idempotency_key TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    intent TEXT NOT NULL CHECK(intent IN ('new_task','revision','query','control')),
    status TEXT NOT NULL CHECK(status IN ('generating','proposed','needs_clarification','invalid_output','manual')),
    contract_json TEXT CHECK(contract_json IS NULL OR json_valid(contract_json)),
    editable_text TEXT NOT NULL,
    error_code TEXT CHECK(error_code IS NULL OR error_code IN ('REFINER_UNAVAILABLE','REFINER_INVALID_OUTPUT','REFINER_FAILED')),
    model_provider TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(conversation_id,idempotency_key),
    UNIQUE(conversation_id,source_message_id)
  );
  CREATE INDEX ix_task_drafts_project ON task_drafts(project_id,updated_at DESC);`),
  migration(7, `CREATE TABLE task_draft_revisions(
    draft_id TEXT NOT NULL REFERENCES task_drafts(draft_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    contract_json TEXT CHECK(contract_json IS NULL OR json_valid(contract_json)),
    editable_text TEXT NOT NULL,
    changed_fields_json TEXT NOT NULL CHECK(json_valid(changed_fields_json)),
    decision_id TEXT,
    decision_summary TEXT,
    resolved_questions_json TEXT NOT NULL CHECK(json_valid(resolved_questions_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY(draft_id, revision),
    UNIQUE(draft_id, decision_id)
  );
  INSERT INTO task_draft_revisions(draft_id,revision,contract_json,editable_text,
    changed_fields_json,decision_id,decision_summary,resolved_questions_json,created_at)
    SELECT draft_id,revision,contract_json,editable_text,'[]',NULL,NULL,'[]',updated_at FROM task_drafts;`),
  migration(8, `CREATE TABLE tasks(
    task_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    source_draft_id TEXT NOT NULL UNIQUE REFERENCES task_drafts(draft_id),
    current_revision INTEGER NOT NULL CHECK(current_revision >= 1),
    state TEXT NOT NULL CHECK(state='todo'),
    contract_json TEXT NOT NULL CHECK(json_valid(contract_json)),
    approved_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE task_revisions(
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    revision INTEGER NOT NULL CHECK(revision >= 1),
    contract_json TEXT NOT NULL CHECK(json_valid(contract_json)),
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(task_id,revision)
  );
  CREATE TABLE task_approvals(
    approval_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    draft_id TEXT NOT NULL REFERENCES task_drafts(draft_id),
    expected_revision INTEGER NOT NULL CHECK(expected_revision >= 1),
    scope_hash TEXT NOT NULL,
    action_digest TEXT NOT NULL,
    request_json TEXT NOT NULL CHECK(json_valid(request_json)),
    status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','expired','superseded')),
    decision_json TEXT CHECK(decision_json IS NULL OR json_valid(decision_json)),
    task_id TEXT REFERENCES tasks(task_id),
    created_at TEXT NOT NULL,
    decided_at TEXT
  );
  CREATE INDEX ix_task_approvals_draft ON task_approvals(project_id,draft_id,created_at DESC);
  CREATE UNIQUE INDEX ux_task_approval_pending ON task_approvals(draft_id) WHERE status='pending';
  CREATE TABLE task_events(
    event_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    type TEXT NOT NULL CHECK(type='task.approved_to_todo'),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at TEXT NOT NULL,
    UNIQUE(task_id,type)
  );`),
  migration(9, `ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0);
  ALTER TABLE tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1);
  ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
  UPDATE tasks SET updated_at=approved_at;
  UPDATE tasks SET position=(SELECT COUNT(*) FROM tasks AS earlier
    WHERE earlier.project_id=tasks.project_id AND earlier.state=tasks.state
      AND (earlier.created_at<tasks.created_at OR
        (earlier.created_at=tasks.created_at AND earlier.task_id<tasks.task_id)));
  CREATE INDEX ix_board_tasks_project_state_position ON tasks(project_id,state,position,created_at);
  CREATE TABLE board_state(
    project_id TEXT PRIMARY KEY REFERENCES projects(project_id),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
  );
  INSERT INTO board_state(project_id,revision)
    SELECT project_id,CASE WHEN EXISTS(SELECT 1 FROM tasks WHERE tasks.project_id=projects.project_id)
      THEN 1 ELSE 0 END FROM projects;
  CREATE TABLE board_events(
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    type TEXT NOT NULL CHECK(type IN ('task.approved_to_todo','tasks.reordered')),
    payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
    created_at TEXT NOT NULL
  );
  INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,created_at)
    SELECT e.event_id,t.project_id,e.task_id,e.type,e.payload_json,e.created_at
    FROM task_events e JOIN tasks t ON t.task_id=e.task_id ORDER BY e.rowid;
  CREATE INDEX ix_board_events_project_seq ON board_events(project_id,seq);
  CREATE TABLE board_reorder_receipts(
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK(json_valid(result_json)),
    created_at TEXT NOT NULL,
    PRIMARY KEY(project_id,idempotency_key)
  );`),
  migration(10, `CREATE TABLE run_config_snapshots(
    run_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
    snapshot_hash TEXT NOT NULL CHECK(length(snapshot_hash)=64),
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_run_config_project_task ON run_config_snapshots(project_id,task_id,created_at);
  CREATE TRIGGER run_config_no_update BEFORE UPDATE ON run_config_snapshots
    BEGIN SELECT RAISE(ABORT,'run config is immutable'); END;
  CREATE TRIGGER run_config_no_delete BEFORE DELETE ON run_config_snapshots
    BEGIN SELECT RAISE(ABORT,'run config is immutable'); END;`),
  migration(11, `CREATE TABLE runs(
    run_id TEXT PRIMARY KEY REFERENCES run_config_snapshots(run_id),
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    task_id TEXT NOT NULL REFERENCES tasks(task_id),
    config_hash TEXT NOT NULL CHECK(length(config_hash)=64),
    state TEXT NOT NULL CHECK(state IN ('queued','running','waiting_input','pausing','paused','canceling','succeeded','failed','cancelled','interrupted')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    created_at TEXT NOT NULL,
    deadline_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE UNIQUE INDEX ux_runs_project_active ON runs(project_id)
    WHERE state IN ('queued','running','waiting_input','pausing','paused','canceling','interrupted');
  CREATE TABLE run_attempts(
    attempt_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    node_id TEXT NOT NULL,
    attempt_no INTEGER NOT NULL CHECK(attempt_no>=1),
    workspace_id TEXT NOT NULL,
    workspace_lease_id TEXT NOT NULL,
    lease_epoch INTEGER NOT NULL CHECK(lease_epoch>=1),
    base_revision TEXT NOT NULL,
    executor_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending','running','waiting_approval','succeeded','failed','cancelled','interrupted')),
    intent_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    native_session_ref TEXT,
    last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_event_sequence>=0),
    result_hash TEXT,
    result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
    UNIQUE(run_id,node_id,attempt_no),
    UNIQUE(run_id,lease_epoch)
  );
  CREATE TABLE run_workspace_leases(
    lease_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    attempt_id TEXT NOT NULL REFERENCES run_attempts(attempt_id),
    workspace_id TEXT NOT NULL,
    epoch INTEGER NOT NULL CHECK(epoch>=1),
    state TEXT NOT NULL CHECK(state IN ('active','released','quarantined')),
    acquired_at TEXT NOT NULL,
    released_at TEXT
  );
  CREATE UNIQUE INDEX ux_run_workspace_active_writer ON run_workspace_leases(workspace_id)
    WHERE state IN ('active','quarantined');
  CREATE TABLE run_events(
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    attempt_id TEXT REFERENCES run_attempts(attempt_id),
    type TEXT NOT NULL CHECK(type IN ('run.queued','attempt.intent','attempt.started','attempt.result','result.stale','run.failed','run.blocked')),
    detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_run_events_run_seq ON run_events(run_id,seq);`),
  migration(12, `CREATE TABLE context_bundles(
    bundle_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    run_id TEXT NOT NULL REFERENCES run_config_snapshots(run_id),
    content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
    bundle_json TEXT NOT NULL CHECK(json_valid(bundle_json)),
    created_at TEXT NOT NULL
  );
  CREATE INDEX ix_context_bundles_run ON context_bundles(run_id,created_at);
  CREATE TABLE working_checkpoints(
    checkpoint_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    attempt_id TEXT NOT NULL REFERENCES run_attempts(attempt_id),
    sequence INTEGER NOT NULL CHECK(sequence>=1),
    state_json TEXT NOT NULL CHECK(json_valid(state_json)),
    created_at TEXT NOT NULL,
    UNIQUE(run_id,sequence)
  );
  CREATE INDEX ix_working_checkpoints_run_seq ON working_checkpoints(run_id,sequence DESC);
  CREATE TRIGGER context_bundle_no_update BEFORE UPDATE ON context_bundles
    BEGIN SELECT RAISE(ABORT,'context bundle is immutable'); END;
  CREATE TRIGGER context_bundle_no_delete BEFORE DELETE ON context_bundles
    BEGIN SELECT RAISE(ABORT,'context bundle is immutable'); END;
  CREATE TRIGGER working_checkpoint_no_update BEFORE UPDATE ON working_checkpoints
    BEGIN SELECT RAISE(ABORT,'working checkpoint is immutable'); END;
  CREATE TRIGGER working_checkpoint_no_delete BEFORE DELETE ON working_checkpoints
    BEGIN SELECT RAISE(ABORT,'working checkpoint is immutable'); END;`),
  migration(13, `CREATE TABLE run_observations(
    cursor INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    attempt_id TEXT NOT NULL REFERENCES run_attempts(attempt_id),
    source_seq_from INTEGER NOT NULL CHECK(source_seq_from>=1),
    source_seq_to INTEGER NOT NULL CHECK(source_seq_to>=source_seq_from),
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(run_id,source_seq_from)
  );
  CREATE INDEX ix_run_observations_cursor ON run_observations(run_id,cursor);
  CREATE TABLE run_diff_previews(
    run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
    preview_json TEXT NOT NULL CHECK(json_valid(preview_json)),
    captured_at TEXT NOT NULL
  );
  CREATE TABLE run_usage_snapshots(
    run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
    usage_json TEXT NOT NULL CHECK(json_valid(usage_json)),
    source_sequence INTEGER NOT NULL CHECK(source_sequence>=1)
  );`),
  migration(14, `CREATE TABLE run_cancel_intents(
    run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
    attempt_id TEXT NOT NULL REFERENCES run_attempts(attempt_id),
    reason TEXT NOT NULL CHECK(reason IN ('user','timeout','shutdown')),
    requested_at TEXT NOT NULL
  );`),
  migration(15, `CREATE TABLE code_snapshots(
    snapshot_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id),
    run_id TEXT NOT NULL UNIQUE REFERENCES runs(run_id),
    attempt_id TEXT NOT NULL REFERENCES run_attempts(attempt_id),
    workspace_id TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    tree_sha TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
    snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
    created_at TEXT NOT NULL
  );
  CREATE TABLE snapshot_artifacts(
    artifact_id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL REFERENCES code_snapshots(snapshot_id),
    kind TEXT NOT NULL CHECK(kind='development-step-result'),
    mime TEXT NOT NULL CHECK(mime='application/json'),
    byte_size INTEGER NOT NULL CHECK(byte_size>=0),
    content_hash TEXT NOT NULL CHECK(length(content_hash)=64),
    redaction_version TEXT NOT NULL,
    content_json TEXT NOT NULL CHECK(json_valid(content_json)),
    created_at TEXT NOT NULL
  );
  CREATE TABLE run_handoffs(
    run_id TEXT PRIMARY KEY REFERENCES runs(run_id),
    snapshot_id TEXT NOT NULL UNIQUE REFERENCES code_snapshots(snapshot_id),
    artifact_id TEXT NOT NULL UNIQUE REFERENCES snapshot_artifacts(artifact_id),
    bundle_json TEXT NOT NULL CHECK(json_valid(bundle_json)),
    created_at TEXT NOT NULL
  );
  CREATE TRIGGER code_snapshot_no_update BEFORE UPDATE ON code_snapshots
    BEGIN SELECT RAISE(ABORT,'code snapshot is immutable'); END;
  CREATE TRIGGER code_snapshot_no_delete BEFORE DELETE ON code_snapshots
    BEGIN SELECT RAISE(ABORT,'code snapshot is immutable'); END;
  CREATE TRIGGER snapshot_artifact_no_update BEFORE UPDATE ON snapshot_artifacts
    BEGIN SELECT RAISE(ABORT,'snapshot artifact is immutable'); END;
  CREATE TRIGGER snapshot_artifact_no_delete BEFORE DELETE ON snapshot_artifacts
    BEGIN SELECT RAISE(ABORT,'snapshot artifact is immutable'); END;
  CREATE TRIGGER run_handoff_no_update BEFORE UPDATE ON run_handoffs
    BEGIN SELECT RAISE(ABORT,'run handoff is immutable'); END;
  CREATE TRIGGER run_handoff_no_delete BEFORE DELETE ON run_handoffs
    BEGIN SELECT RAISE(ABORT,'run handoff is immutable'); END;`),
]);

export const latestSchemaVersion = migrations.at(-1)?.version ?? 0;

function migrationTableExists(db: Database.Database): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get());
}

export function schemaVersion(db: Database.Database): number {
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion > latestSchemaVersion) throw new PersistenceError('DATABASE_VERSION_UNSUPPORTED');
  if (!migrationTableExists(db)) {
    if (userVersion !== 0) throw new PersistenceError('DATABASE_MIGRATION_FAILED');
    return 0;
  }
  const applied = db.prepare('SELECT version, checksum FROM schema_migrations ORDER BY version').all() as { version: number; checksum: string }[];
  for (let index = 0; index < applied.length; index += 1) {
    const record = applied[index];
    if (!record) throw new PersistenceError('DATABASE_MIGRATION_FAILED');
    if (record.version > latestSchemaVersion) throw new PersistenceError('DATABASE_VERSION_UNSUPPORTED');
    if (record.version !== index + 1 || migrations[index]?.checksum !== record.checksum) {
      throw new PersistenceError('DATABASE_MIGRATION_FAILED');
    }
  }
  if (userVersion !== (applied.at(-1)?.version ?? 0)) throw new PersistenceError('DATABASE_MIGRATION_FAILED');
  return applied.at(-1)?.version ?? 0;
}

export function migrate(db: Database.Database, targetVersion = latestSchemaVersion): number {
  if (!Number.isInteger(targetVersion) || targetVersion < 0 || targetVersion > latestSchemaVersion) {
    throw new PersistenceError('DATABASE_VERSION_UNSUPPORTED');
  }
  let current = schemaVersion(db);
  if (current > targetVersion) throw new PersistenceError('DATABASE_VERSION_UNSUPPORTED');
  for (const item of migrations) {
    if (item.version <= current || item.version > targetVersion) continue;
    try {
      db.transaction(() => {
        db.exec(item.sql);
        db.prepare('INSERT INTO schema_migrations(version, applied_at, checksum) VALUES (?, ?, ?)')
          .run(item.version, new Date().toISOString(), item.checksum);
        db.pragma(`user_version = ${item.version}`);
      })();
      current = schemaVersion(db);
    } catch (error) {
      throw mapDatabaseError(error, 'DATABASE_MIGRATION_FAILED');
    }
  }
  return current;
}
