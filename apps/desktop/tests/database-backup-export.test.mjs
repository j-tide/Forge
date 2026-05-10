import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { exportDatabaseBackup } from '../dist/main/database-backup-export.js';

test('Main exports only Host-owned backup and never overwrites the chosen file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-backup-export-'));
  const data = join(root, 'data');
  const backups = join(data, 'backups');
  await mkdir(backups, { recursive:true, mode:0o700 });
  const name = 'forge-v35-20260926T000000Z-9f630699-b29a-4058-b608-51eabdb18eee.sqlite';
  const source = join(backups, name);
  const payload = Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(112)]);
  await writeFile(source, payload, { mode:0o600 });
  const details = { internalPath:source, schemaVersion:35,
    createdAt:'2026-09-26T00:00:00.000Z', sizeBytes:payload.length };
  try {
    const destination = join(root, 'portable.sqlite');
    const result = await exportDatabaseBackup(details, data, destination);
    assert.deepEqual(result, { saved:true, schemaVersion:35,
      createdAt:details.createdAt, sizeBytes:payload.length,
      sha256:createHash('sha256').update(payload).digest('hex') });
    assert.deepEqual(await readFile(destination), payload);
    await assert.rejects(exportDatabaseBackup(details, data, destination), { code:'EEXIST' });
    assert.deepEqual(await readFile(destination), payload);
    const outside = join(root, name);
    await writeFile(outside, payload);
    await assert.rejects(exportDatabaseBackup({ ...details, internalPath:outside },
      data, join(root, 'escaped.sqlite')), /DATABASE_BACKUP_FAILED/);
    const linked = join(backups, 'forge-v35-20260926T000001Z-9f630699-b29a-4058-b608-51eabdb18eee.sqlite');
    await symlink(outside, linked);
    await assert.rejects(exportDatabaseBackup({ ...details, internalPath:linked },
      data, join(root, 'symlink.sqlite')), /DATABASE_BACKUP_FAILED/);
  } finally { await rm(root, { recursive:true, force:true }); }
});
