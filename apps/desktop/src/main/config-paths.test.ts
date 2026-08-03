import { afterEach, describe, expect, it } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { getAppCacheDir, getAppConfigDir, getAppDataDir, getMemoriesDir } from './config-paths';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Forge Glass Preview global paths', () => {
  it('uses a separate XDG namespace for app config, data, and cache', () => {
    process.env.XDG_CONFIG_HOME = '/tmp/preview-config-test';
    process.env.XDG_DATA_HOME = '/tmp/preview-data-test';
    process.env.XDG_CACHE_HOME = '/tmp/preview-cache-test';

    expect(getAppConfigDir()).toBe(join(process.env.XDG_CONFIG_HOME, 'forge-glass-preview'));
    expect(getAppDataDir()).toBe(join(process.env.XDG_DATA_HOME, 'forge-glass-preview'));
    expect(getAppCacheDir()).toBe(join(process.env.XDG_CACHE_HOME, 'forge-glass-preview'));
  });

  it('does not use Aperant memories when no XDG sandbox is active', () => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.APPIMAGE;
    delete process.env.SNAP;
    delete process.env.FLATPAK_ID;

    expect(getMemoriesDir()).toBe(join(homedir(), '.forge-glass-preview', 'memories'));
  });
});
