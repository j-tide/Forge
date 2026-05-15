import { afterEach, expect, it } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import { hostProtocolVersion, type HostConnectionSnapshot } from '@forge/contracts';
import AppShell from './AppShell.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

it('identifies the installed historical Host as read-only in the shell and diagnostics', async () => {
  const now = '2026-09-27T00:00:00.000Z';
  const info = { status: 'ready' as const,
    hostId: 'c126ef2a-71d6-4bac-94e5-fef74833fb29', pid: 1234,
    version: '0.0.1', productVersion: '0.0.1', startedAt: now,
    protocolVersion: hostProtocolVersion,
    runtime: { version: '3.12.13', python: '3.12.13', implementation: 'CPython',
      platform: 'darwin', arch: 'arm64' } };
  const snapshot: HostConnectionSnapshot = {
    revision: 1, state: 'connected', info, lastHealthCheck: now, error: null,
    health: { ...info, timestamp: now, uptimeMs: 1000,
      storage: { status: 'ready', readOnly: true, schemaVersion: 35,
        sqliteVersion: '3.50.4', journalMode: 'wal', error: null } },
  };
  root = document.createElement('div'); document.body.append(root);
  app = createApp(AppShell, {
    view: 'home', runtimeLabel: 'Desktop · macOS', webRuntime: false,
    hostStatus: snapshot, canRestartHost: false, hostRestartBusy: false,
    hostRestartError: '', projectName: 'Historical fixture',
    reduceTransparency: false, reduceMotion: false, theme: 'light',
  });
  app.mount(root);
  expect(root.querySelector('.historical-read-only-banner')?.textContent)
    .toContain('历史数据只读');
  expect(root.querySelector('.shell-content--historical')).not.toBeNull();
  root.querySelector<HTMLButtonElement>('.host-badge')?.click();
  await nextTick();
  expect(root.querySelector('#host-diagnostics')?.textContent).toContain('StorageRead-only');
});
