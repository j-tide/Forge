import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { getProfilesFilePath, getLegacyProfilesFilePath, readProfilesFile } from './profile-paths';
import { atomicModifyProfiles, loadProfilesFile } from './profile-manager';
import { loadProfilesFile as loadLegacyApiProfiles, saveProfilesFile as saveLegacyApiProfiles } from '../../utils/profile-manager';

const data = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => data.directory } }));

const fixture = {
  profiles: [{ id: 'saved-profile', name: 'Existing profile', baseUrl: 'https://example.invalid', apiKey: 'fixture-only', createdAt: 1, updatedAt: 2 }],
  activeProfileId: 'saved-profile',
  version: 1,
};

describe('Forge API profile file compatibility', () => {
  beforeEach(async () => {
    data.directory = await mkdtemp(path.join(tmpdir(), 'forge-profile-paths-'));
  });

  afterEach(async () => {
    await rm(data.directory, { recursive: true, force: true });
  });

  async function store(file: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  }

  it('reads saved profiles from the old internal name when no Forge file exists', async () => {
    await store(getLegacyProfilesFilePath(), fixture);
    expect(await loadProfilesFile()).toEqual(fixture);
    expect(getProfilesFilePath()).toBe(path.join(data.directory, 'forge', 'profiles.json'));
  });

  it('preserves profiles during the first atomic write and leaves the old file untouched', async () => {
    await store(getLegacyProfilesFilePath(), fixture);
    const original = await readFile(getLegacyProfilesFilePath(), 'utf-8');
    const updated = await atomicModifyProfiles(file => ({ ...file, activeProfileId: null }));
    expect(updated.profiles).toEqual(fixture.profiles);
    expect(JSON.parse(await readFile(getProfilesFilePath(), 'utf-8'))).toEqual(updated);
    expect(await readFile(getLegacyProfilesFilePath(), 'utf-8')).toBe(original);
    expect((await stat(getProfilesFilePath())).mode & 0o777).toBe(0o600);
  });

  it('prefers the current Forge file over legacy values', async () => {
    await store(getLegacyProfilesFilePath(), fixture);
    const current = { ...fixture, activeProfileId: null };
    await store(getProfilesFilePath(), current);
    expect(await loadProfilesFile()).toEqual(current);
  });

  it('preserves profiles and private file permissions through the compatibility API', async () => {
    await store(getLegacyProfilesFilePath(), fixture);
    const original = await readFile(getLegacyProfilesFilePath(), 'utf-8');
    const saved = await loadLegacyApiProfiles();
    await saveLegacyApiProfiles(saved);
    expect(JSON.parse(await readFile(getProfilesFilePath(), 'utf-8'))).toEqual(fixture);
    expect(await readFile(getLegacyProfilesFilePath(), 'utf-8')).toBe(original);
    expect((await stat(getProfilesFilePath())).mode & 0o777).toBe(0o600);
  });

  it('does not resurrect legacy profiles when a new file is invalid', async () => {
    await store(getLegacyProfilesFilePath(), fixture);
    await mkdir(path.dirname(getProfilesFilePath()), { recursive: true });
    await writeFile(getProfilesFilePath(), 'not json');
    expect(await loadProfilesFile()).toEqual({ profiles: [], activeProfileId: null, version: 1 });
  });

  it('does not use the legacy fallback for a new path that exists but is unreadable', async () => {
    await store(getLegacyProfilesFilePath(), fixture);
    await mkdir(getProfilesFilePath(), { recursive: true });
    await expect(readProfilesFile()).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
