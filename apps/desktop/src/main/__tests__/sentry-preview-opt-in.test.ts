import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentryInit = vi.hoisted(() => vi.fn());
const sentryClose = vi.hoisted(() => vi.fn(async () => true));

vi.mock('@sentry/electron/main', () => ({
  init: sentryInit,
  close: sentryClose,
  addBreadcrumb: vi.fn(),
  captureException: vi.fn()
}));

vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '0.0.0-preview' },
  ipcMain: { on: vi.fn(), handle: vi.fn() }
}));

vi.mock('../settings-utils', () => ({ readSettingsFile: () => ({}) }));

import { getSentryEnvForSubprocess, initSentryMain, setSentryEnabled } from '../sentry';

describe('Forge Glass Preview error reporting', () => {
  beforeEach(() => {
    sentryInit.mockClear();
    sentryClose.mockClear();
    vi.stubEnv('SENTRY_DSN', 'https://upstream.example/1');
    vi.stubEnv('FORGE_GLASS_PREVIEW_SENTRY_DSN', '');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('ignores a generic upstream DSN and keeps reporting off', () => {
    initSentryMain();

    expect(sentryInit).not.toHaveBeenCalled();
    expect(getSentryEnvForSubprocess()).toEqual({});
  });

  it('requires a preview-specific DSN and user opt-in before forwarding events', () => {
    vi.stubEnv('FORGE_GLASS_PREVIEW_SENTRY_DSN', 'https://preview.example/2');
    initSentryMain();

    expect(sentryInit).not.toHaveBeenCalled();
    expect(getSentryEnvForSubprocess()).toEqual({});

    setSentryEnabled(true);
    const options = sentryInit.mock.lastCall?.[0];
    expect(options.dsn).toBe('https://preview.example/2');
    expect(options.release).toBe('forge-glass-preview@0.0.0-preview');
    expect(options.beforeSend({ message: 'test' })).toEqual({ message: 'test' });
    expect(getSentryEnvForSubprocess()).toMatchObject({
      SENTRY_DSN: 'https://preview.example/2'
    });

    setSentryEnabled(false);
    expect(options.beforeSend({ message: 'test' })).toBeNull();
    expect(options.beforeSendTransaction({ message: 'test' })).toBeNull();
    expect(getSentryEnvForSubprocess()).toEqual({});
    expect(sentryClose).toHaveBeenCalledWith(0);
  });
});
