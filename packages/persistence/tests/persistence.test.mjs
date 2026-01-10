import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { ForgePersistence, latestSchemaVersion, mapDatabaseError, resolveForgeDataDir } from '../dist/index.js';

async function isolated(t) {
  const directory = await mkdtemp(join(tmpdir(), 'forge-persistence-test-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('Forge data path is platform-aware and isolates environments', () => {
  assert.equal(resolveForgeDataDir({ environment: 'development', platform: 'darwin', home: '/example' }),
    join('/example', 'Library', 'Application Support', 'Forge', 'development'));
  assert.equal(resolveForgeDataDir({ environment: 'production', platform: 'win32', home: '/example' }),
    join('/example', 'AppData', 'Roaming', 'Forge', 'production'));
  assert.notEqual(resolveForgeDataDir({ environment: 'test', home: '/example' }),
    resolveForgeDataDir({ environment: 'production', home: '/example' }));
  assert.throws(() => resolveForgeDataDir({ environment: 'test', override: 'relative/db' }), /absolute/);
});

test('empty DB upgrades through latest schema, retains rows, and restart does not rerun migrations', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open();
  assert.equal(storage.schemaVersion(), 0);
  assert.equal(storage.migrate(1), 1);
  assert.equal(storage.schemaVersion(), 1);
  assert.equal(storage.health().status, 'unavailable');
  const dbPath = join(directory, 'forge.sqlite');
  const fixture = new Database(dbPath);
  fixture.prepare('INSERT INTO runtime_metadata(key, value) VALUES (?, ?)').run('test.v1', 'retained');
  fixture.close();
  assert.equal(storage.migrate(), latestSchemaVersion);
  assert.equal(storage.getMetadata('test.v1'), 'retained');
  storage.setMetadata('test.commit', 'visible');
  assert.equal(storage.health().journalMode, 'wal');
  storage.close();

  const reopened = new ForgePersistence(directory);
  await reopened.open();
  assert.equal(reopened.migrate(), latestSchemaVersion);
  assert.equal(reopened.getMetadata('test.commit'), 'visible');
  const observer = new Database(dbPath);
  assert.equal(observer.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, latestSchemaVersion);
  assert.equal(observer.pragma('foreign_keys', { simple: true }), 1);
  observer.close();
  reopened.close();
});

test('v6 task drafts acquire one current revision snapshot in v7 without inventing past edits', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory); await storage.open(); storage.migrate(6);
  const now = new Date().toISOString();
  const projectId = randomUUID(); const environmentId = randomUUID();
  const conversationId = randomUUID(); const messageId = randomUUID(); const draftId = randomUUID();
  const db = new Database(join(directory, 'forge.sqlite'));
  db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO projects(project_id,environment_id,name,canonical_path,repository_type,
    trust_version,trust_approved_at,environment_summary_hash,probe_json,created_at,updated_at,last_opened_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(projectId, environmentId, 'Existing',
    join(directory, 'repo'), 'none', 'project-trust/v1', now, 'a'.repeat(64), '{}', now, now, now);
  db.prepare(`INSERT INTO conversations(conversation_id,project_id,title,revision,created_at,updated_at)
    VALUES (?,?,?,1,?,?)`).run(conversationId, projectId, 'Old', now, now);
  db.prepare(`INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,status,created_at,updated_at)
    VALUES (?,?,1,'user',?,'completed',?,?)`).run(messageId, conversationId,
    JSON.stringify({ text: 'Old source' }), now, now);
  db.prepare(`INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,
    idempotency_key,revision,intent,status,editable_text,created_at,updated_at)
    VALUES (?,?,?,?,?,2,'new_task','manual','Old edited text',?,?)`)
    .run(draftId, projectId, conversationId, messageId, randomUUID(), now, now);
  db.close();
  assert.equal(storage.migrate(), latestSchemaVersion);
  const history = storage.listTaskDraftRevisions(projectId, draftId);
  assert.equal(history.length, 1); assert.equal(history[0].revision, 2);
  assert.equal(history[0].editableText, 'Old edited text');
  storage.close();
});

test('v8 approved TODO rows gain stable positions and board cursors in v9', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory); await storage.open(); storage.migrate(8);
  const projectId = randomUUID(); const environmentId = randomUUID();
  const conversationId = randomUUID(); const now = new Date().toISOString();
  const db = new Database(join(directory, 'forge.sqlite'));
  db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO projects(project_id,environment_id,name,canonical_path,repository_type,
    trust_version,trust_approved_at,environment_summary_hash,probe_json,created_at,updated_at,last_opened_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(projectId, environmentId, 'Existing board',
    join(directory, 'repo'), 'none', 'project-trust/v1', now, 'a'.repeat(64), '{}', now, now, now);
  db.prepare(`INSERT INTO conversations(conversation_id,project_id,title,revision,created_at,updated_at)
    VALUES (?,?,?,1,?,?)`).run(conversationId, projectId, 'Existing', now, now);
  const ids = [randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries()) {
    const messageId = randomUUID(); const createdAt = new Date(Date.parse(now) + index * 1000).toISOString();
    const source = `message:${messageId}`;
    const contract = { schemaVersion: '1.0', taskId: id, projectId, revision: 1,
      title: `Existing task ${index}`, type: 'feature', goal: 'Preserve order',
      acceptance: [{ id: 'ac1', statement: 'Works', method: 'manual', required: true,
        sourceRefs: [source] }], constraints: [], scope: [], outOfScope: [], dependencies: [],
      openQuestions: [], assumptions: [], sourceRefs: [source], workflowRef: 'standard',
      priority: 'normal' };
    db.prepare(`INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,status,created_at,updated_at)
      VALUES (?,?,?,'user',?,'completed',?,?)`).run(messageId, conversationId, index + 1,
      JSON.stringify({ text: 'existing' }), createdAt, createdAt);
    db.prepare(`INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,
      idempotency_key,revision,intent,status,contract_json,editable_text,created_at,updated_at)
      VALUES (?,?,?,?,?,1,'new_task','proposed',?,?,?,?)`).run(id, projectId, conversationId,
      messageId, randomUUID(), JSON.stringify(contract), 'existing', createdAt, createdAt);
    db.prepare(`INSERT INTO tasks(task_id,project_id,source_draft_id,current_revision,state,
      contract_json,approved_at,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(id, projectId,
      id, 1, 'todo', JSON.stringify(contract), createdAt, createdAt);
    db.prepare(`INSERT INTO task_events(event_id,task_id,type,payload_json,created_at)
      VALUES (?,?,'task.approved_to_todo','{}',?)`).run(randomUUID(), id, createdAt);
  }
  db.close();
  assert.equal(storage.migrate(), latestSchemaVersion);
  const board = storage.boardSnapshot(projectId);
  assert.deepEqual(board.tasks.map((task) => task.id), ids);
  assert.deepEqual(board.tasks.map((task) => task.position), [0, 1]);
  assert.equal(board.eventCursor, '2');
  assert.equal(board.boardRevision, 1);
  const observer = new Database(join(directory, 'forge.sqlite'));
  assert.deepEqual(observer.pragma('foreign_key_check'), []);
  observer.close(); storage.close();
});

test('v3 project rows gain a version and default environment in v4 without losing trust history', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate(3);
  const projectId = randomUUID(); const environmentId = randomUUID();
  const now = new Date().toISOString();
  const db = new Database(join(directory, 'forge.sqlite'));
  db.prepare(`INSERT INTO projects(project_id,environment_id,name,canonical_path,repository_type,git_root,
    default_branch,trust_version,trust_approved_at,environment_summary_hash,probe_json,created_at,updated_at,last_opened_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(projectId, environmentId, 'Existing', '/fixture/existing',
    'none', null, null, 'project-trust/v1', now, 'a'.repeat(64), '{}', now, now, now);
  db.prepare(`INSERT INTO project_trust_decisions(project_id,trust_version,approved_at,environment_summary_hash,actor)
    VALUES (?,?,?,?,?)`).run(projectId, 'project-trust/v1', now, 'a'.repeat(64), 'local-user');
  db.close();
  assert.equal(storage.migrate(), latestSchemaVersion);
  const migrated = new Database(join(directory, 'forge.sqlite'));
  assert.deepEqual(migrated.prepare('SELECT revision, archived_at FROM projects WHERE project_id = ?')
    .get(projectId), { revision: 1, archived_at: null });
  assert.equal(migrated.prepare('SELECT name FROM environments WHERE environment_id = ? AND project_id = ?')
    .get(environmentId, projectId).name, 'Default');
  assert.equal(migrated.prepare('SELECT actor FROM project_trust_decisions WHERE project_id = ?')
    .get(projectId).actor, 'local-user');
  assert.equal(migrated.pragma('foreign_key_check').length, 0);
  migrated.close(); storage.close();
  await storage.open(); assert.equal(storage.migrate(), latestSchemaVersion);
  const reopened = new Database(join(directory, 'forge.sqlite'));
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM environments WHERE project_id = ?')
    .get(projectId).count, 1);
  reopened.close(); storage.close();
});

test('conversation messages survive restart, isolate projects and deduplicate one send key', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate();
  const db = new Database(join(directory, 'forge.sqlite'));
  const now = new Date().toISOString();
  const first = randomUUID(); const second = randomUUID();
  const insert = db.prepare(`INSERT INTO projects(project_id,environment_id,name,canonical_path,repository_type,
    trust_version,trust_approved_at,environment_summary_hash,probe_json,created_at,updated_at,last_opened_at)
    VALUES (?,?,?,?,'none','project-trust/v1',?,'', '{}',?,?,?)`);
  insert.run(first, randomUUID(), 'First', '/fixture/one', now, now, now, now);
  insert.run(second, randomUUID(), 'Second', '/fixture/two', now, now, now, now);
  db.close();
  const thread = storage.createConversation(first, 'First request', 0);
  assert.equal(thread.revision, 1);
  assert.equal(storage.getConversation(second, thread.conversationId), null);
  assert.deepEqual(storage.listConversations(second), []);
  const input = { projectId: first, conversationId: thread.conversationId,
    idempotencyKey: randomUUID(), text: 'Build a parser', attachmentIds: [] };
  const one = storage.recordUserMessage(input);
  const replay = storage.recordUserMessage(input);
  assert.equal(one.replay, false);
  assert.equal(replay.replay, true);
  assert.equal(one.message.messageId, replay.message.messageId);
  assert.deepEqual(storage.listConversationMessages(first, thread.conversationId).map((item) => item.content),
    ['Build a parser']);
  assert.throws(() => storage.recordUserMessage({ ...input, text: 'Delete everything' }),
    { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => storage.recordUserMessage({ ...input, projectId: second }),
    { code: 'CONVERSATION_NOT_FOUND' });
  storage.failConversationRequest(first, thread.conversationId, input.idempotencyKey);
  storage.close();
  await storage.open(); storage.migrate();
  assert.equal(storage.listConversationMessages(first, thread.conversationId)[0].content, 'Build a parser');
  assert.equal(storage.recordUserMessage(input).replay, true);
  assert.throws(() => storage.archiveConversation(first, thread.conversationId, 1),
    { code: 'REVISION_CONFLICT' });
  const archived = storage.archiveConversation(first, thread.conversationId, 2);
  assert.equal(archived.archivedAt !== null, true);
  assert.deepEqual(storage.listConversations(first), []);
  assert.throws(() => storage.recordUserMessage({ ...input, idempotencyKey: randomUUID() }),
    { code: 'CONVERSATION_NOT_FOUND' });
  const observer = new Database(join(directory, 'forge.sqlite'));
  assert.equal(observer.prepare('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?')
    .get(thread.conversationId).count, 1);
  assert.equal(observer.pragma('foreign_key_check').length, 0);
  observer.close(); storage.close();
});

test('Host restart marks an abandoned assistant stream failed and permits same-message retry', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate();
  const projectId = randomUUID(); const now = new Date().toISOString();
  const db = new Database(join(directory, 'forge.sqlite'));
  db.prepare(`INSERT INTO projects(project_id,environment_id,name,canonical_path,repository_type,
    trust_version,trust_approved_at,environment_summary_hash,probe_json,created_at,updated_at,last_opened_at)
    VALUES (?,?,?,?,'none','project-trust/v1',?,'','{}',?,?,?)`)
    .run(projectId, randomUUID(), 'Recover', '/fixture/recover', now, now, now, now);
  db.close();
  const conversation = storage.createConversation(projectId, 'Recover', 0);
  const input = { projectId, conversationId: conversation.conversationId,
    idempotencyKey: randomUUID(), text: 'Do not lose this', attachmentIds: [] };
  const user = storage.recordUserMessage(input).message;
  const partial = storage.beginAssistantMessage(projectId, conversation.conversationId, input.idempotencyKey);
  storage.appendAssistantChunk(projectId, conversation.conversationId, partial.messageId, 'Partial');
  storage.close();
  await storage.open(); storage.migrate();
  assert.equal(storage.recoverInterruptedConversations(), 1);
  assert.equal(storage.recoverInterruptedConversations(), 0);
  assert.equal(storage.listConversationMessages(projectId, conversation.conversationId)[1].status, 'failed');
  assert.equal(storage.recordUserMessage(input).message.messageId, user.messageId);
  const retry = storage.beginAssistantMessage(projectId, conversation.conversationId, input.idempotencyKey);
  storage.appendAssistantChunk(projectId, conversation.conversationId, retry.messageId, 'Recovered');
  storage.finishAssistantMessage(projectId, conversation.conversationId, retry.messageId, 'completed');
  assert.deepEqual(storage.listConversationMessages(projectId, conversation.conversationId)
    .map((item) => [item.role, item.status]),
  [['user', 'completed'], ['assistant', 'failed'], ['assistant', 'completed']]);
  storage.close();
});

test('migration failure rolls back its version record and preserves old data', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open();
  storage.migrate(1);
  const fixture = new Database(join(directory, 'forge.sqlite'));
  fixture.prepare('INSERT INTO runtime_metadata(key, value) VALUES (?, ?)').run('test.old', 'safe');
  fixture.exec("ALTER TABLE runtime_metadata ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  fixture.close();
  assert.throws(() => storage.migrate(), { code: 'DATABASE_MIGRATION_FAILED' });
  assert.equal(storage.schemaVersion(), 1);
  assert.equal(storage.health().status, 'unavailable');
  assert.throws(() => storage.setMetadata('test.forbidden', 'no'), { code: 'DATABASE_MIGRATION_FAILED' });
  const observer = new Database(join(directory, 'forge.sqlite'));
  assert.equal(observer.prepare("SELECT value FROM runtime_metadata WHERE key='test.old'").get().value, 'safe');
  assert.equal(observer.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
  observer.close();
  storage.close();
});

test('future schema is rejected and health cannot claim ready', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate(); storage.close();
  const db = new Database(join(directory, 'forge.sqlite'));
  db.pragma('user_version = 99'); db.close();
  await storage.open();
  assert.throws(() => storage.migrate(), { code: 'DATABASE_VERSION_UNSUPPORTED' });
  assert.equal(storage.health().status, 'unavailable');
  assert.equal(storage.health().error.code, 'DATABASE_VERSION_UNSUPPORTED');
  storage.close();
});

test('commit, rollback, unique and foreign-key constraints are real SQLite operations', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate();
  storage.transaction((tx) => tx.set('test.committed', 'yes'));
  assert.equal(storage.getMetadata('test.committed'), 'yes');
  assert.throws(() => storage.transaction((tx) => {
    tx.set('test.rollback', 'no');
    throw new Error('injected failure');
  }), { code: 'DATABASE_IO_ERROR' });
  assert.equal(storage.getMetadata('test.rollback'), null);
  let escaped;
  assert.throws(() => storage.transaction((tx) => {
    escaped = tx;
    tx.set('test.async', 'no');
    return { then() {} };
  }), { code: 'DATABASE_IO_ERROR' });
  assert.equal(storage.getMetadata('test.async'), null);
  assert.throws(() => escaped.set('test.late', 'no'), { code: 'DATABASE_IO_ERROR' });
  const fixture = new Database(join(directory, 'forge.sqlite'));
  fixture.pragma('foreign_keys = ON');
  fixture.exec('CREATE TABLE test_parent(id INTEGER PRIMARY KEY); CREATE TABLE test_child(id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES test_parent(id))');
  fixture.prepare('INSERT INTO test_parent(id) VALUES (?)').run(1);
  assert.throws(() => fixture.prepare('INSERT INTO test_parent(id) VALUES (?)').run(1), /UNIQUE/);
  assert.throws(() => fixture.prepare('INSERT INTO test_child(id, parent_id) VALUES (?, ?)').run(1, 99), /FOREIGN KEY/);
  fixture.close(); storage.close();
});

test('invalid and impossible database locations map to safe errors', async (t) => {
  const directory = await isolated(t);
  const badDir = join(directory, 'bad');
  await mkdir(badDir);
  await writeFile(join(badDir, 'forge.sqlite'), 'not a SQLite database');
  const invalid = new ForgePersistence(badDir);
  await assert.rejects(invalid.open(), { code: 'DATABASE_CORRUPT' });
  const obstacle = join(directory, 'file-not-directory');
  await writeFile(obstacle, 'x');
  const unwritable = new ForgePersistence(obstacle);
  await assert.rejects(unwritable.open(), { code: 'DATABASE_OPEN_FAILED' });
  assert.doesNotMatch(invalid.health().error.message, new RegExp(directory));
});

test('SQLite busy and I/O errors map to safe Forge codes', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate();
  const lock = new Database(join(directory, 'forge.sqlite'));
  lock.exec('BEGIN IMMEDIATE');
  assert.throws(() => storage.setMetadata('test.busy', 'blocked'), { code: 'DATABASE_BUSY' });
  lock.exec('ROLLBACK'); lock.close();
  assert.equal(storage.getMetadata('test.busy'), null);
  assert.equal(mapDatabaseError({ code: 'SQLITE_FULL', message: '/private/path/secret' }, 'DATABASE_IO_ERROR').code, 'DATABASE_IO_ERROR');
  assert.doesNotMatch(mapDatabaseError({ code: 'SQLITE_FULL', message: '/private/path/secret' }, 'DATABASE_IO_ERROR').message, /private/);
  storage.close();
});

test('WAL backup captures committed data without copying only the main DB file', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(join(directory, 'active'));
  await storage.open(); storage.migrate();
  storage.setMetadata('test.backup', 'persisted-in-wal');
  assert.ok((await stat(join(directory, 'active', 'forge.sqlite-wal'))).size > 0);
  const destination = join(directory, 'backup.sqlite');
  await storage.backup(destination);
  const backup = new Database(destination);
  assert.equal(backup.prepare("SELECT value FROM runtime_metadata WHERE key='test.backup'").get().value, 'persisted-in-wal');
  assert.equal(backup.pragma('foreign_key_check').length, 0);
  backup.close(); storage.close();
});

test('uncommitted SQLite transaction disappears after the writer process exits', async (t) => {
  const directory = await isolated(t);
  const storage = new ForgePersistence(directory);
  await storage.open(); storage.migrate(); storage.close();
  const child = fork(fileURLToPath(new URL('./crash-child.mjs', import.meta.url)), [directory], { stdio: 'ignore' });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 17);
  await storage.open(); storage.migrate();
  assert.equal(storage.getMetadata('test.uncommitted'), null);
  storage.setMetadata('test.after-crash', 'healthy');
  assert.equal(storage.health().status, 'ready');
  storage.close();
  assert.ok((await readFile(join(directory, 'forge.sqlite'))).length > 0);
});
