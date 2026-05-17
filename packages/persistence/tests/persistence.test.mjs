import assert from 'node:assert/strict';
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

test('empty DB upgrades v1 to v2, retains rows, and restart does not rerun migrations', async (t) => {
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
  assert.equal(reopened.migrate(), 2);
  assert.equal(reopened.getMetadata('test.commit'), 'visible');
  const observer = new Database(dbPath);
  assert.equal(observer.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 2);
  assert.equal(observer.pragma('foreign_keys', { simple: true }), 1);
  observer.close();
  reopened.close();
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
