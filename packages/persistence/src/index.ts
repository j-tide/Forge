import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { storageHealthSchema, type StorageHealth } from '@forge/contracts';
import { PersistenceError, mapDatabaseError } from './errors.js';
import { latestSchemaVersion, migrate as runMigrations, schemaVersion as readSchemaVersion } from './migrations.js';

export { PersistenceError, mapDatabaseError } from './errors.js';
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
