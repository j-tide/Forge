import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, realpath, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { DatabaseBackupExportResult, DatabaseBackupSource } from '@forge/contracts';

const BACKUP_NAME = /^forge-v[0-9]+-[0-9]{8}T[0-9]{6}Z-[a-f0-9-]{36}\.sqlite$/;

/** Main copies one Host-created SQLite snapshot; no Renderer path or arbitrary source API. */
export async function exportDatabaseBackup(
  source: DatabaseBackupSource, dataDir: string, destination: string,
): Promise<DatabaseBackupExportResult> {
  if (!isAbsolute(destination) || !isAbsolute(source.internalPath) ||
    !BACKUP_NAME.test(basename(source.internalPath))) throw new Error('DATABASE_BACKUP_FAILED');
  const ownedRoot = await realpath(dataDir);
  const backupDir = join(ownedRoot, 'backups');
  const canonicalSource = await realpath(source.internalPath);
  if ((await lstat(backupDir)).isSymbolicLink() ||
    await realpath(backupDir) !== backupDir ||
    dirname(canonicalSource) !== backupDir ||
    (await lstat(source.internalPath)).isSymbolicLink()) {
    throw new Error('DATABASE_BACKUP_FAILED');
  }
  const before = await stat(source.internalPath);
  if (!before.isFile() || before.size !== source.sizeBytes || before.size < 100) {
    throw new Error('DATABASE_BACKUP_FAILED');
  }
  let copied = false;
  try {
    await copyFile(canonicalSource, destination, constants.COPYFILE_EXCL);
    copied = true;
    if (process.platform !== 'win32') await chmod(destination, 0o600);
    const digest = createHash('sha256');
    let total = 0;
    let header = Buffer.alloc(0);
    for await (const chunk of createReadStream(destination)) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (header.length < 16) header = Buffer.concat([header, bytes.subarray(0, 16 - header.length)]);
      total += bytes.length;
      digest.update(bytes);
    }
    if (total !== source.sizeBytes || header.toString('ascii') !== 'SQLite format 3\0') {
      throw new Error('DATABASE_BACKUP_FAILED');
    }
    return { saved:true, createdAt:source.createdAt, schemaVersion:source.schemaVersion,
      sizeBytes:total, sha256:digest.digest('hex') };
  } catch (error) {
    if (copied) await unlink(destination).catch(() => {});
    throw error;
  }
}
