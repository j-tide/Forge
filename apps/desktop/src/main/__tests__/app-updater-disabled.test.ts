import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-preview' }
}));

import {
  APP_UPDATES_DISABLED_MESSAGE,
  checkForUpdates,
  checkForStableDowngrade,
  downloadStableVersion,
  downloadUpdate,
  getCurrentVersion,
  getDownloadedUpdateInfo,
  initializeAppUpdater,
  quitAndInstall,
  setUpdateChannelWithDowngradeCheck,
  stopPeriodicUpdates
} from '../app-updater';

describe('Forge Glass Preview app update boundary', () => {
  afterEach(() => vi.useRealTimers());

  it('does not schedule update checks or expose an installable update', async () => {
    vi.useFakeTimers();
    initializeAppUpdater({} as Parameters<typeof initializeAppUpdater>[0], true);

    expect(vi.getTimerCount()).toBe(0);
    expect(getDownloadedUpdateInfo()).toBeNull();
    expect(getCurrentVersion()).toBe('0.0.0-preview');
    expect(quitAndInstall()).toBe(false);
    stopPeriodicUpdates();
  });

  it('rejects every manual check or download path', async () => {
    await expect(checkForUpdates()).rejects.toThrow(APP_UPDATES_DISABLED_MESSAGE);
    await expect(downloadUpdate()).rejects.toThrow(APP_UPDATES_DISABLED_MESSAGE);
    await expect(downloadStableVersion()).rejects.toThrow(APP_UPDATES_DISABLED_MESSAGE);
    await expect(checkForStableDowngrade()).resolves.toBeNull();
    await expect(setUpdateChannelWithDowngradeCheck('latest', true)).resolves.toBeNull();
  });
});
