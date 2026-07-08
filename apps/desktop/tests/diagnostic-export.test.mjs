import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { writeDiagnosticBundle } from '../dist/main/diagnostic-export.js';

test('diagnostic export writes exact approved bytes and never follows a symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-diagnostics-export-'));
  try {
    const safe = join(root, 'safe.json');
    await writeDiagnosticBundle(safe, '{"format":"forge-diagnostics/v1"}');
    assert.equal(await readFile(safe, 'utf8'), '{"format":"forge-diagnostics/v1"}');
    const link = join(root, 'link.json');
    await symlink(safe, link);
    await assert.rejects(writeDiagnosticBundle(link, 'malicious'), /DIAGNOSTICS_PATH_INVALID/);
    assert.equal(await readFile(safe, 'utf8'), '{"format":"forge-diagnostics/v1"}');
    await assert.rejects(writeDiagnosticBundle(join(root, 'large.json'), 'x'.repeat(16_385)),
      /DIAGNOSTICS_TOO_LARGE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
