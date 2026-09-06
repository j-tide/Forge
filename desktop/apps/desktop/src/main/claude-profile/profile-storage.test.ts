import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const testHome = vi.hoisted(() => ({
  value: `${process.env.TMPDIR || process.env.TEMP || '/tmp'}/forge-preview-profile-storage-${process.pid}-${Math.random().toString(36).slice(2)}`
}));

vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  homedir: () => testHome.value
}));

import { loadProfileStore, loadProfileStoreAsync, STORE_VERSION } from './profile-storage';

beforeAll(() => {
  mkdirSync(testHome.value, { recursive: true });
});

afterAll(() => {
  rmSync(testHome.value, { recursive: true, force: true });
});

describe('preview profile storage', () => {
  it('loads a legacy path without moving it or touching credentials', async () => {
    const officialDir = join(testHome.value, '.claude');
    const credentialFile = join(officialDir, 'credentials.json');
    const storePath = join(testHome.value, 'profiles.json');
    mkdirSync(officialDir);
    writeFileSync(credentialFile, '{"sentinel":"keep"}');
    writeFileSync(storePath, JSON.stringify({
      version: STORE_VERSION,
      profiles: [{ id: 'old', name: 'Old', configDir: officialDir, isDefault: true, createdAt: new Date().toISOString() }],
      activeProfileId: 'old'
    }));

    for (const loaded of [loadProfileStore(storePath), await loadProfileStoreAsync(storePath)]) {
      expect(loaded?.profiles[0].configDir).toBe(officialDir);
      expect(loaded?.migratedProfileIds).toBeUndefined();
    }
    expect(readFileSync(credentialFile, 'utf-8')).toBe('{"sentinel":"keep"}');
    expect(existsSync(join(testHome.value, '.claude-profiles'))).toBe(false);
    expect(existsSync(join(testHome.value, '.forge-glass-preview'))).toBe(false);
  });
});
