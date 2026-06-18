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
    expect(root.textContent).toContain('先选择项目');
    expect(root.querySelector<HTMLButtonElement>('button[disabled]')?.textContent).toContain('Agent runtime 尚未启用');
    const input = root.querySelector<HTMLTextAreaElement>('textarea');
    expect(input).not.toBeNull();
    input!.value = '给订单列表添加日期筛选';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input!.value).toBe('给订单列表添加日期筛选');
    expect(root.textContent).toContain('不会创建任务');
    root.querySelector<HTMLButtonElement>('button[aria-label="项目"]')?.click();
    await nextTick();
    expect(root.textContent).toContain('本地项目需要 Forge Desktop');
    expect(root.textContent).not.toContain('Choose folder');
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
      inspectBundledPlugin: async () => ({ pluginId: 'forge.executor.codex', version: '0.0.1', forgeApiRange: '^1.0.0', compatible: true, active: true, issues: [], configSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } }),
      chooseProjectFolder: async () => null,
      invokeProject: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: health.timestamp }),
      invokeConversation: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: health.timestamp }),
      invokeDraft: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: health.timestamp }),
      invokeApproval: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: health.timestamp }),
      invokeBoard: async (command) => ({ commandId: command.commandId, ok: false as const, error: forgeError('PROJECT_NOT_FOUND', 'Project not found', command.commandId), durationMs: 1, hostTimestamp: health.timestamp }),
      invokeRun: async (command) => ({ commandId: command.commandId, ok: false as const, error: forgeError('RUN_NOT_FOUND', 'Run not found', command.commandId), durationMs: 1, hostTimestamp: health.timestamp }),
      onConversationEvent: () => () => {},
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

  it('shows the real board entry without inventing tasks when no project is selected', async () => {
    const root = mountApp();
    root.querySelector<HTMLButtonElement>('button[aria-label="研发看板"]')?.click();
    await nextTick();
    expect(root.querySelector('#board-title')?.textContent).toBe('研发看板');
    expect(root.textContent).toContain('先选择项目');
    expect(root.querySelectorAll('.board-task')).toHaveLength(0);
  });

  it('shows protocol mismatch without stale Host details', async () => {
    const error = forgeError('PROTOCOL_MISMATCH', 'Host protocol is incompatible', 'mismatch-1');
    window.forge = Object.freeze({
      platform: 'darwin',
      hostStatus: async () => ({ revision: 1, state: 'incompatible' as const, info: null, health: null, lastHealthCheck: null, error }),
      hostHealth: async () => ({ commandId: 'health-mismatch', ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeSystem: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      inspectBundledPlugin: async () => { throw new Error('HOST_UNAVAILABLE'); },
      chooseProjectFolder: async () => null,
      invokeProject: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeConversation: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeDraft: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeApproval: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeBoard: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      invokeRun: async (command) => ({ commandId: command.commandId, ok: false as const, error, durationMs: 0, hostTimestamp: new Date().toISOString() }),
      onConversationEvent: () => () => {},
      onHostStatus: () => () => {},
    } satisfies ForgeDesktopBridge);
    const root = mountApp();
    await vi.waitFor(() => expect(root.textContent).toContain('Host incompatible'));
    root.querySelector<HTMLButtonElement>('.host-badge')?.click();
    await nextTick();
    expect(root.querySelector('#host-diagnostics')?.textContent).toContain('PROTOCOL_MISMATCH');
    expect(root.querySelector('#host-diagnostics')?.textContent).not.toContain('4321');
  });

  it('does not save a selected project until the explicit trust action', async () => {
    const now = new Date().toISOString();
    const probe = {
      rootPath: '/tmp/fixture', name: 'fixture', repositoryType: 'git' as const,
      gitRoot: '/tmp/fixture', currentBranch: 'main', defaultBranch: 'main', workingTree: 'dirty' as const,
      remoteConfigured: false, packageManager: 'pnpm' as const, packageManagerEvidence: ['pnpm-lock.yaml'],
      projectType: 'vue' as const, detectedRuntime: ['Node.js (manifest)'],
      scripts: { dev: null, build: 'vite build', test: null, lint: null, typecheck: null },
      capabilities: { gitWorktree: true, declaredScripts: true }, fingerprint: 'a'.repeat(64), probedAt: now,
    };
    const saved = { projectId: 'd3fd43b8-1c43-472d-8a73-80686420da49', environmentId: 'f3d183c0-0ba2-4c77-9b07-069b40d83c87',
      name: 'fixture', rootPath: probe.rootPath, repositoryType: 'git' as const, gitRoot: probe.gitRoot,
      defaultBranch: 'main', trusted: true as const, trustVersion: 'project-trust/v1' as const,
      trustApprovedAt: now, environmentSummaryHash: probe.fingerprint, createdAt: now,
      updatedAt: now, lastOpenedAt: now, revision: 1, archivedAt: null, probe };
    const info = { status: 'ready' as const, hostId: 'fd54e128-cd81-4c94-8b48-b3ccf1e42ec5', pid: 4321,
      version: '0.0.1', productVersion: '0.0.1', protocolVersion: hostProtocolVersion, startedAt: now,
      runtime: { version: 'v24.21.0', node: '24.21.0', modules: '149', electron: '44.4.3', platform: 'darwin', arch: 'arm64' } };
    const health = { ...info, uptimeMs: 10, timestamp: now, storage: { status: 'ready' as const,
      schemaVersion: 5, sqliteVersion: '3.53.4', journalMode: 'wal' as const, error: null } };
    let createCalls = 0;
    window.forge = Object.freeze({
      platform: 'darwin',
      hostStatus: async () => ({ revision: 1, state: 'connected' as const, info, health, lastHealthCheck: now, error: null }),
      hostHealth: async () => ({ commandId: 'health', ok: true as const, data: health, durationMs: 1, hostTimestamp: now }),
      invokeSystem: async (command) => ({ commandId: command.commandId, ok: true as const, data: health, durationMs: 1, hostTimestamp: now }),
      inspectBundledPlugin: async () => ({ pluginId: 'forge.executor.codex', version: '0.0.1', forgeApiRange: '^1.0.0', compatible: true, active: true, issues: [], configSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } }),
      chooseProjectFolder: async () => probe.rootPath,
      invokeProject: async (command) => {
        if (command.type === 'project.create') createCalls += 1;
        return { commandId: command.commandId, ok: true as const,
          data: command.type === 'project.probe' ? probe : command.type === 'project.create' || command.type === 'project.setActive' ? saved
            : command.type === 'project.list' ? [] : null, durationMs: 1, hostTimestamp: now };
      },
      invokeConversation: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: now }),
      invokeDraft: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: now }),
      invokeApproval: async (command) => ({ commandId: command.commandId, ok: true as const, data: null, durationMs: 1, hostTimestamp: now }),
      invokeBoard: async (command) => ({ commandId: command.commandId, ok: true as const,
        data: { projectId: saved.projectId, tasks: [], eventCursor: '0', boardRevision: 0, serverTime: now },
        durationMs: 1, hostTimestamp: now }),
      invokeRun: async (command) => ({ commandId: command.commandId, ok: true as const,
        data: [], durationMs: 1, hostTimestamp: now }),
      onConversationEvent: () => () => {},
      onHostStatus: () => () => {},
    } satisfies ForgeDesktopBridge);
    const root = mountApp();
    await vi.waitFor(() => expect(root.textContent).toContain('Host connected'));
    root.querySelector<HTMLButtonElement>('button[aria-label="项目"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Choose folder'));
    [...root.querySelectorAll('button')].find((button) => button.textContent?.includes('Choose folder'))?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Working tree has uncommitted changes'));
    expect(createCalls).toBe(0);
    [...root.querySelectorAll('button')].find((button) => button.textContent?.includes('继续查看信任范围'))?.click();
    await nextTick();
    expect(createCalls).toBe(0);
    [...root.querySelectorAll('button')].find((button) => button.textContent?.includes('Trust this project'))?.click();
    await vi.waitFor(() => expect(createCalls).toBe(1));
    await vi.waitFor(() => expect(root.textContent).toContain('PROJECT CONNECTED'));
  });
});
