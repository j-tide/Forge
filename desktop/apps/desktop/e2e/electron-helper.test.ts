import type { ElectronApplication, Page } from '@playwright/test';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock('@playwright/test', () => ({ _electron: { launch } }));

import { closeElectronApp, launchElectronApp } from './electron-helper';

function createApp() {
  const page = { waitForLoadState: vi.fn().mockResolvedValue(undefined) };
  const app = {
    firstWindow: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined)
  };
  return { app, page, electronApp: app as unknown as ElectronApplication };
}

function launchedProfile(index = 0): string {
  return launch.mock.calls[index][0].env.FORGE_GLASS_PREVIEW_USER_DATA_DIR;
}

describe('Electron E2E profile isolation', () => {
  beforeEach(() => {
    launch.mockReset();
  });

  afterEach(async () => {
    // The launch stub never starts Electron; remove only the profiles it received.
    await Promise.all(launch.mock.calls.map(([options]) =>
      rm(options.env.FORGE_GLASS_PREVIEW_USER_DATA_DIR, { recursive: true, force: true })
    ));
    vi.unstubAllEnvs();
  });

  it('uses a distinct absolute profile for every launch and removes it after close', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FORGE_GLASS_PREVIEW_USER_DATA_DIR', '/existing-profile');
    const first = createApp();
    const second = createApp();
    launch.mockResolvedValueOnce(first.electronApp).mockResolvedValueOnce(second.electronApp);

    const firstContext = await launchElectronApp();
    const secondContext = await launchElectronApp();
    const firstProfile = launchedProfile();
    const secondProfile = launchedProfile(1);

    expect(firstContext).toEqual({ app: first.electronApp, page: first.page as unknown as Page });
    expect(path.isAbsolute(firstProfile)).toBe(true);
    expect(path.isAbsolute(secondProfile)).toBe(true);
    expect(firstProfile).not.toBe(secondProfile);
    expect(firstProfile).not.toBe('/existing-profile');
    for (const [options] of launch.mock.calls) {
      expect(options.env.NODE_ENV).toBe('test');
      expect(options.args).toEqual([path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')]);
    }
    expect(first.page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded');
    await expect(access(firstProfile)).resolves.toBeUndefined();
    await expect(access(secondProfile)).resolves.toBeUndefined();

    await closeElectronApp(firstContext.app);
    expect(first.app.close).toHaveBeenCalledOnce();
    await expect(access(firstProfile)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(secondProfile)).resolves.toBeUndefined();
    await closeElectronApp(secondContext.app);
    await expect(access(secondProfile)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('removes an unused profile when Electron launch fails', async () => {
    launch.mockRejectedValue(new Error('launch failed'));

    await expect(launchElectronApp()).rejects.toThrow('launch failed');
    await expect(access(launchedProfile())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['window', 'readiness'])('closes the process and removes its profile after a %s failure', async (failure) => {
    const { app, page, electronApp } = createApp();
    if (failure === 'window') {
      app.firstWindow.mockRejectedValue(new Error('startup failed'));
    } else {
      page.waitForLoadState.mockRejectedValue(new Error('startup failed'));
    }
    launch.mockResolvedValue(electronApp);

    await expect(launchElectronApp()).rejects.toThrow('startup failed');
    expect(app.close).toHaveBeenCalledOnce();
    await expect(access(launchedProfile())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps an active app profile when close fails so cleanup can be retried', async () => {
    const { app, electronApp } = createApp();
    launch.mockResolvedValue(electronApp);
    const context = await launchElectronApp();
    app.close.mockRejectedValueOnce(new Error('close failed'));

    await expect(closeElectronApp(context.app)).rejects.toThrow('close failed');
    await expect(access(launchedProfile())).resolves.toBeUndefined();

    await closeElectronApp(context.app);
    await expect(access(launchedProfile())).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports both startup and close failures and preserves the active profile', async () => {
    const { app, electronApp } = createApp();
    app.firstWindow.mockRejectedValue(new Error('startup failed'));
    app.close.mockRejectedValueOnce(new Error('close failed'));
    launch.mockResolvedValue(electronApp);

    await expect(launchElectronApp()).rejects.toMatchObject({
      message: 'Electron startup and cleanup failed',
      errors: [expect.objectContaining({ message: 'startup failed' }), expect.objectContaining({ message: 'close failed' })]
    });
    await expect(access(launchedProfile())).resolves.toBeUndefined();
    await closeElectronApp(electronApp);
    await expect(access(launchedProfile())).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
