import { forgeError, type ForgeError } from '@forge/contracts';

export type DatabaseErrorCode = Extract<ForgeError['code'],
  'DATABASE_OPEN_FAILED' | 'DATABASE_MIGRATION_FAILED' | 'DATABASE_VERSION_UNSUPPORTED' |
  'DATABASE_BUSY' | 'DATABASE_CORRUPT' | 'DATABASE_IO_ERROR'>;

const safeMessages: Record<DatabaseErrorCode, string> = {
  DATABASE_OPEN_FAILED: 'Forge storage could not open',
  DATABASE_MIGRATION_FAILED: 'Forge storage migration failed',
  DATABASE_VERSION_UNSUPPORTED: 'Forge storage schema is newer than this Host',
  DATABASE_BUSY: 'Forge storage is busy',
  DATABASE_CORRUPT: 'Forge storage is invalid or corrupt',
  DATABASE_IO_ERROR: 'Forge storage I/O failed',
};

export class PersistenceError extends Error {
  constructor(readonly code: DatabaseErrorCode, cause?: unknown) {
    super(safeMessages[code], { cause });
    this.name = 'PersistenceError';
  }

  toForgeError(correlationId: string): ForgeError {
    return forgeError(this.code, this.message, correlationId, this.code === 'DATABASE_BUSY');
  }
}

export function mapDatabaseError(error: unknown, fallback: DatabaseErrorCode): PersistenceError {
  if (error instanceof PersistenceError) return error;
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return new PersistenceError('DATABASE_BUSY', error);
  if (code.startsWith('SQLITE_NOTADB') || code.startsWith('SQLITE_CORRUPT')) return new PersistenceError('DATABASE_CORRUPT', error);
  if (code.startsWith('SQLITE_IOERR') || code.startsWith('SQLITE_FULL') || code.startsWith('SQLITE_READONLY')) {
    return new PersistenceError('DATABASE_IO_ERROR', error);
  }
  return new PersistenceError(fallback, error);
}
