import { describe, expect, it, vi } from 'vitest';

const sentryInit = vi.hoisted(() => vi.fn());
const settingsState = vi.hoisted(() => ({ settings: { sentryEnabled: false } }));

vi.mock('@sentry/electron/renderer', () => ({
  init: sentryInit,
  captureException: vi.fn(),
  withScope: vi.fn()
}));

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: { getState: () => settingsState }
}));

import {
  initSentryRenderer,
  isSentryInitialized,
  markSettingsLoaded,
  notifySentryStateChanged
} from './sentry';

describe('preview renderer error reporting', () => {
  it('does not initialize the SDK before opt-in and filters events after opt-out', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        getSentryConfig: async () => ({
          dsn: 'https://preview.example/2',
          tracesSampleRate: 0.1,
          profilesSampleRate: 0.1
        }),
        notifySentryStateChanged: vi.fn()
      }
    });

    await initSentryRenderer();
    markSettingsLoaded();
    expect(sentryInit).not.toHaveBeenCalled();
    expect(isSentryInitialized()).toBe(false);

    settingsState.settings.sentryEnabled = true;
    notifySentryStateChanged(true);
    expect(sentryInit).toHaveBeenCalledTimes(1);
    const options = sentryInit.mock.lastCall?.[0];
    expect(options.beforeSend({ message: 'test' })).toEqual({ message: 'test' });

    settingsState.settings.sentryEnabled = false;
    notifySentryStateChanged(false);
    expect(options.beforeSend({ message: 'test' })).toBeNull();
    expect(options.beforeSendTransaction({ message: 'test' })).toBeNull();
    vi.unstubAllGlobals();
  });
});
