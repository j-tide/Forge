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
