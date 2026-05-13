import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { internalQaAppData } from '../dist/main/internal-qa-profile.js';

test('internal QA profile is isolated by signed-bundle marker identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'forge internal qa '));
  const marker = join(root, 'FORGE_INTERNAL_TEST_BUILD');
  const appData = join(root, 'safe', 'appdata');
  const override = join(root, 'separate', 'fixture');
  try {
    assert.equal(internalQaAppData(root, appData), null);
    assert.equal(internalQaAppData(root, appData, override), null);
    writeFileSync(marker, JSON.stringify({ kind:'internal-qa', qaId:'0123456789abcdef' }));
    assert.equal(internalQaAppData(root, appData),
      join(appData, 'Forge Internal QA', '0123456789abcdef'));
    assert.equal(internalQaAppData(root, appData, override), override);
    assert.throws(() => internalQaAppData(root, appData, 'relative'),
      /must be absolute/);
    writeFileSync(marker, JSON.stringify({ kind:'internal-qa', qaId:'../../outside' }));
    assert.throws(() => internalQaAppData(root, appData), /marker is invalid/);
    writeFileSync(marker, 'legacy marker');
    assert.throws(() => internalQaAppData(root, appData), /marker is invalid/);
    if (process.platform !== 'win32') {
      rmSync(marker);
      symlinkSync(join(root, 'missing'), marker);
      assert.throws(() => internalQaAppData(root, appData), /marker is invalid/);
    }
  } finally { rmSync(root, { recursive:true, force:true }); }
});
