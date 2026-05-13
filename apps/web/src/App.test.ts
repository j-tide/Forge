import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import { forgeError, hostProtocolVersion, type ForgeDesktopBridge } from '@forge/contracts';
import App from './App.vue';

let container: HTMLDivElement | undefined;
let mountedApp: VueApp | undefined;

function mountApp(): HTMLDivElement {
  container = document.createElement('div');
  document.body.append(container);
  mountedApp = createApp(App);
  mountedApp.mount(container);
  return container;
}

afterEach(() => {
  delete window.forge;
  mountedApp?.unmount();
  container?.remove();
  container = undefined;
  mountedApp = undefined;
});

describe('shared Forge shell', () => {
  it('mounts in an ordinary Web environment without Electron APIs', async () => {
    delete window.forge;
    const root = mountApp();
    expect(root.querySelector('h1')?.textContent).toBe('What do you want to build?');
    expect(root.textContent).toContain('Web');
    expect(root.textContent).toContain('Local Host unavailable');
    expect(root.textContent).toContain('还没有任务');
    expect(root.querySelector<HTMLButtonElement>('button[disabled]')?.textContent).toContain('Agent runtime 尚未启用');
    const input = root.querySelector<HTMLTextAreaElement>('textarea');
    expect(input).not.toBeNull();
    input!.value = '给订单列表添加日期筛选';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input!.value).toBe('给订单列表添加日期筛选');
    expect(root.textContent).toContain('不会创建任务');
  });

  it('shows real Host diagnostics through the fixed Desktop bridge', async () => {
    const info = {
      status: 'ready' as const, hostId: 'fd54e128-cd81-4c94-8b48-b3ccf1e42ec5', pid: 4321,
      version: '0.0.1', productVersion: '0.0.1', protocolVersion: hostProtocolVersion,
      startedAt: '2026-09-23T00:00:00.000Z',
      runtime: { version: 'v24.21.0', node: '24.21.0', modules: '149', electron: '44.4.3', platform: 'darwin', arch: 'arm64' },
    };
    const health = { ...info, uptimeMs: 5000, timestamp: '2026-09-23T00:00:05.000Z',
      storage: { status: 'ready' as const, schemaVersion: 2, sqliteVersion: '3.53.4', journalMode: 'wal' as const, error: null } };
    const status = { revision: 1, state: 'connected' as const, info, health, lastHealthCheck: health.timestamp, error: null };
    window.forge = Object.freeze({
      platform: 'darwin',
      hostStatus: async () => status,
      hostHealth: async () => ({ commandId: 'health-1', ok: true as const, data: health, durationMs: 1, hostTimestamp: health.timestamp }),
      invokeSystem: async (command) => ({ commandId: command.commandId, ok: true as const, data: health, durationMs: 1, hostTimestamp: health.timestamp }),
      onHostStatus: () => () => {},
    } satisfies ForgeDesktopBridge);
    const root = mountApp();
    expect(root.textContent).toContain('Desktop · macOS');
    await vi.waitFor(() => expect(root.textContent).toContain('Host connected'));
    root.querySelector<HTMLButtonElement>('.host-badge')?.click();
    await nextTick();
    expect(root.textContent).toContain('fd54e128-cd81-4c94-8b48-b3ccf1e42ec5');
    expect(root.textContent).toContain('4321');
    expect(root.querySelector('#host-diagnostics')?.textContent).toContain('Schema2');
    root.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.click();
    await nextTick();
    expect(root.querySelector('h1')?.textContent).toBe('外观');
    root.querySelector<HTMLButtonElement>('button[role="switch"]')?.click();
    await nextTick();
    expect(root.querySelector('.app-shell')?.getAttribute('data-reduce-transparency')).toBe('true');
  });

  it('keeps the board an explicit empty state', async () => {
    const root = mountApp();
    root.querySelector<HTMLButtonElement>('button[aria-label="研发看板"]')?.click();
    await nextTick();
    expect(root.querySelector('#board-title')?.textContent).toBe('研发看板');
    expect(root.textContent).toContain('看板尚不可用');
    expect(root.textContent).toContain('不显示演示任务');
  });

  it('shows protocol mismatch without stale Host details', async () => {
    const error = forgeError('PROTOCOL_MISMATCH', 'Host protocol is incompatible', 'mismatch-1');
    window.forge = Object.freeze({
      platform: 'darwin',
      hostStatus: async () => ({ revision: 1, state: 'incompatible' as const, info: null, health: null, lastHealthCheck: null, error }),
      hostHealth: async () => ({ commandId: 'health-mismatch', ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeSystem: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      onHostStatus: () => () => {},
    } satisfies ForgeDesktopBridge);
    const root = mountApp();
    await vi.waitFor(() => expect(root.textContent).toContain('Host incompatible'));
    root.querySelector<HTMLButtonElement>('.host-badge')?.click();
    await nextTick();
    expect(root.querySelector('#host-diagnostics')?.textContent).toContain('PROTOCOL_MISMATCH');
    expect(root.querySelector('#host-diagnostics')?.textContent).not.toContain('4321');
  });
});
