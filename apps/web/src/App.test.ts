import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import { forgeError, hostProtocolVersion, type ForgeDesktopBridge } from '@forge/contracts';
import App from './App.vue';
import { appearanceStorageKey } from './appearance-preferences';

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
  window.localStorage.removeItem(appearanceStorageKey);
  container = undefined;
  mountedApp = undefined;
});

describe('shared Forge shell', () => {
  it('keeps appearance choices after remount without changing Host state', async () => {
    const first = mountApp();
    first.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.click();
    await nextTick();
    first.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="减少透明度"]')?.click();
    first.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="减少动效"]')?.click();
    const theme = first.querySelector<HTMLSelectElement>('.settings-card .forge-select')!;
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    mountedApp?.unmount();
    container?.remove();
    const reopened = mountApp();
    expect(reopened.querySelector('.app-shell')?.getAttribute('data-theme')).toBe('dark');
    expect(reopened.querySelector('.app-shell')?.getAttribute('data-reduce-transparency')).toBe('true');
    expect(reopened.querySelector('.app-shell')?.getAttribute('data-reduce-motion')).toBe('true');
    expect(reopened.textContent).toContain('Local Host unavailable');
  });

  it('opens keyboard navigation with Ctrl/Cmd+K, traps focus, and restores the trigger', async () => {
    const root = mountApp();
    const trigger = root.querySelector<HTMLButtonElement>('button[aria-label="快速导航"]')!;
    trigger.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const search = document.querySelector<HTMLInputElement>('[role="dialog"] input.forge-text-input');
    expect(document.activeElement).toBe(search);
    const last = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')].at(-1)!;
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭对话框');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', ctrlKey: true, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  });

  it('mounts in an ordinary Web environment without Electron APIs', async () => {
    delete window.forge;
    const root = mountApp();
    expect(root.querySelector('h1')?.textContent).toBe('What do you want to build?');
    expect(root.textContent).toContain('Web');
    expect(root.textContent).toContain('Local Host unavailable');
    expect(root.textContent).toContain('先选择项目');
    expect(root.textContent).toContain('普通 Web 尚未连接远程 Host');
    const input = root.querySelector<HTMLTextAreaElement>('textarea');
    expect(input).not.toBeNull();
    input!.value = '给订单列表添加日期筛选';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(input!.value).toBe('给订单列表添加日期筛选');
    expect(root.textContent).toContain('本地项目选择只在 Forge Desktop 中提供');
    root.querySelector<HTMLButtonElement>('button[aria-label="项目"]')?.click();
    await nextTick();
    expect(root.textContent).toContain('本地项目需要 Forge Desktop');
    expect(root.textContent).not.toContain('Choose folder');
    root.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.click();
    await nextTick();
    expect(root.querySelector('#settings-title')?.textContent).toBe('设置');
    const diagnostics = root.querySelector('.diagnostics-preview')?.parentElement ??
      [...root.querySelectorAll('.diagnostics-settings')].find((item) =>
        item.textContent?.includes('诊断与数据保留'));
    const backup = root.querySelector('[data-testid="database-backup"]');
    const remote = root.querySelector('.remote-devices');
    expect(diagnostics && backup && remote).toBeTruthy();
    expect(Boolean(diagnostics!.compareDocumentPosition(backup!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(backup!.compareDocumentPosition(remote!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(root.querySelector('[data-testid="desktop-dependencies"]')?.textContent)
      .toContain('本机依赖检测需要 Forge Desktop');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="database-backup"] button')?.disabled)
      .toBe(true);
    expect([...root.querySelectorAll<HTMLButtonElement>('[data-testid="database-backup"] button')]
      .find((button) => button.textContent?.includes('选择备份并恢复'))?.disabled).toBe(true);
  });

  it('keeps an explicit mobile route in the Companion shell at landscape width', async () => {
    const previousHash = window.location.hash;
    const originalFetch = globalThis.fetch;
    window.location.hash = '#/m/messages';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'REMOTE_AUTH_UNAVAILABLE' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )));
    try {
      const root = mountApp();
      await vi.waitFor(() => expect(root.querySelector('.mobile-app')).not.toBeNull());
      expect(root.querySelector('.app-shell')).toBeNull();
      window.location.hash = '#/home';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await vi.waitFor(() => expect(root.querySelector('.mobile-app')).toBeNull());
    } finally {
      window.location.hash = previousHash;
      vi.stubGlobal('fetch', originalFetch);
    }
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
    const dependencies = {
      format: 'forge-desktop-dependencies/v1' as const,
      checkedAt: '2026-09-23T00:00:05.000Z',
      python: { status: 'ready' as const, version: '3.12.13' },
      git: { status: 'available' as const, version: 'git version 2.39.5 (Apple Git-154)' },
      codex: { status: 'authenticated' as const, version: 'codex-cli 0.155.1' },
      proxy: { status: 'not_configured' as const },
    };
    window.forge = Object.freeze({
      platform: 'darwin',
      hostStatus: async () => status,
      hostHealth: async () => ({ commandId: 'health-1', ok: true as const, data: health, durationMs: 1, hostTimestamp: health.timestamp }),
      invokeSystem: async (command) => ({ commandId: command.commandId, ok: true as const,
        data: command.type === 'system.dependencies' ? dependencies : health,
        durationMs: 1, hostTimestamp: health.timestamp }),
      exportDatabaseBackup: async () => ({ saved: true, schemaVersion: 35,
        createdAt: '2026-09-26T00:00:00.000Z', sizeBytes: 8192,
        sha256: 'a'.repeat(64) }),
      databaseProfileStatus: async () => ({ profileId: null, available: true }),
      restoreDatabaseBackup: async () => ({ switched: true,
        profileId: 'd6a11f99-513b-45cc-9fd0-3bca4c05c950', schemaVersion: 35 }),
      returnToOriginalData: async () => ({ switched: true, profileId: null, schemaVersion: null }),
      inspectBundledPlugin: async () => ({ pluginId: 'forge.executor.codex', version: '0.0.3', forgeApiRange: '^1.0.0', compatible: true, active: true, enabled: true, restartRequired: false, configRevision: 0, configValues: {}, configApplied: true, issues: [], faults: [], manifest: null, activeRunRefs: [], draining: false, configSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } }),
      setBundledPluginEnabled: async () => { throw new Error('FIXTURE_READ_ONLY'); },
      saveBundledPluginConfig: async () => { throw new Error('FIXTURE_READ_ONLY'); },
      agentProfileCatalog: async () => ({ profiles: [], availability: [], executors: [], modelProviders: [] }),
      saveAgentProfile: async (value) => value.profile,
      invokeWorkflow: async () => [],
      invokeKnowledge: async () => [],
      invokeMemory: async () => [],
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
    expect(root.querySelector('h1')?.textContent).toBe('设置');
    await vi.waitFor(() => expect(root.querySelector('[data-testid="desktop-dependencies"]')?.textContent)
      .toContain('codex-cli 0.155.1'));
    expect(root.querySelector('[data-testid="desktop-dependencies"]')?.textContent)
      .toContain('Git');
    expect(root.querySelector('[data-testid="desktop-dependencies"]')?.textContent)
      .not.toContain('private/secret');
    root.querySelector<HTMLButtonElement>('[data-testid="database-backup"] button')?.click();
    await vi.waitFor(() => expect(root.querySelector('[data-testid="database-backup"]')?.textContent)
      .toContain('数据库备份已导出 · Schema 35'));
    const recovery = [...root.querySelectorAll<HTMLButtonElement>('[data-testid="database-backup"] button')]
      .find((button) => button.textContent?.includes('选择备份并恢复'))!;
    expect(recovery.disabled).toBe(false);
    recovery.click();
    await vi.waitFor(() => expect(root.querySelector('[data-testid="database-backup"]')?.textContent)
      .toContain('已切换到独立恢复数据集'));
    [...root.querySelectorAll<HTMLButtonElement>('[data-testid="database-backup"] button')]
      .find((button) => button.textContent?.includes('返回原数据集'))?.click();
    await vi.waitFor(() => expect(root.querySelector('[data-testid="database-backup"]')?.textContent)
      .toContain('已回到原数据集'));
    root.querySelector<HTMLButtonElement>('button[role="switch"]')?.click();
    await nextTick();
    expect(root.querySelector('.app-shell')?.getAttribute('data-reduce-transparency')).toBe('true');
    const theme = root.querySelector<HTMLSelectElement>('.settings-card .forge-select');
    expect(theme).not.toBeNull();
    theme!.value = 'dark';
    theme!.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(root.querySelector('.app-shell')?.getAttribute('data-theme')).toBe('dark');
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
      setBundledPluginEnabled: async () => { throw new Error('HOST_UNAVAILABLE'); },
      saveBundledPluginConfig: async () => { throw new Error('HOST_UNAVAILABLE'); },
      agentProfileCatalog: async () => { throw new Error('HOST_UNAVAILABLE'); },
      saveAgentProfile: async (value) => value.profile,
      invokeWorkflow: async () => [],
      invokeKnowledge: async () => [],
      invokeMemory: async () => [],
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
    const pairingCommands: unknown[] = [];
    const loopbackActions: string[] = [];
    let loopbackRunning = false;
    const pairingId = '89ba0131-4c0e-486b-88c1-7f2718eb9a01';
    const pairingExpiry = new Date(Date.now() + 60_000).toISOString();
    let pairingDecided = false;
    window.forge = Object.freeze({
      platform: 'darwin',
      hostStatus: async () => ({ revision: 1, state: 'connected' as const, info, health, lastHealthCheck: now, error: null }),
      hostHealth: async () => ({ commandId: 'health', ok: true as const, data: health, durationMs: 1, hostTimestamp: now }),
      invokeSystem: async (command) => ({ commandId: command.commandId, ok: true as const, data: health, durationMs: 1, hostTimestamp: now }),
      inspectBundledPlugin: async () => ({ pluginId: 'forge.executor.codex', version: '0.0.3', forgeApiRange: '^1.0.0', compatible: true, active: true, enabled: true, restartRequired: false, configRevision: 0, configValues: {}, configApplied: true, issues: [], faults: [], manifest: null, activeRunRefs: [], draining: false, configSchema: { type: 'object', additionalProperties: false, properties: {}, required: [] } }),
      setBundledPluginEnabled: async () => { throw new Error('FIXTURE_READ_ONLY'); },
      saveBundledPluginConfig: async () => { throw new Error('FIXTURE_READ_ONLY'); },
      agentProfileCatalog: async () => ({ profiles: [], availability: [], executors: [], modelProviders: [] }),
      saveAgentProfile: async (value) => value.profile,
      invokeWorkflow: async () => [],
      invokeKnowledge: async () => [],
      invokeMemory: async () => [],
      invokeDevicePairing: async (command) => {
        pairingCommands.push(command);
        if (command.type === 'issue') return { pairingId, nonce: 'A'.repeat(43),
          expiresAt: pairingExpiry };
        if (command.type === 'inspect') return { pairingId,
          status: pairingDecided ? 'approved' : 'claimed',
          deviceName: 'Test phone', addressSummary: 'loopback',
          fingerprintSummary: 'fixture-key', createdAt: now, expiresAt: pairingExpiry,
          claimedAt: now, decidedAt: pairingDecided ? now : null,
          projectIds: pairingDecided ? [saved.projectId] : [],
          scopes: pairingDecided ? ['task:approve'] : [] };
        if (command.type === 'decide') { pairingDecided = true; return { pairingId, status: 'approved',
          deviceId: '95cc8976-2c61-47e6-9f52-76067ad642da',
          projectIds: command.payload.projectIds, scopes: command.payload.scopes ?? [] }; }
        if (command.type === 'list') return [];
        return [];
      },
      remoteLoopback: async (action) => {
        loopbackActions.push(action);
        if (action === 'start') loopbackRunning = true;
        if (action === 'stop') loopbackRunning = false;
        return { running: loopbackRunning,
          origin: loopbackRunning ? 'http://127.0.0.1:58231' : null,
          hostId: info.hostId };
      },
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
    root.querySelector<HTMLButtonElement>('button[aria-label="设置"]')?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('创建一次性配对'));
    expect(loopbackActions.every((action) => action === 'inspect')).toBe(true);
    [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('开启本机浏览器预览'))?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('http://127.0.0.1:58231'));
    expect(loopbackActions).toContain('start');
    [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('创建一次性配对'))?.click();
    await vi.waitFor(() => expect(root.textContent).toContain(pairingId));
    [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('检查状态'))?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Test phone'));
    const scopes = root.querySelectorAll<HTMLInputElement>('.pairing-scope-choices input');
    expect(scopes).toHaveLength(2);
    expect([...scopes].every((item) => !item.checked)).toBe(true);
    scopes[1]!.click();
    await nextTick();
    [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('批准访问 fixture'))?.click();
    await vi.waitFor(() => expect(pairingCommands.some((entry) =>
      (entry as { type: string }).type === 'decide')).toBe(true));
    const decision = pairingCommands.find((entry) =>
      (entry as { type: string }).type === 'decide') as {
        payload: { projectIds: string[]; scopes: string[] };
      };
    expect(decision.payload).toEqual({ pairingId, approve: true,
      projectIds: [saved.projectId], scopes: ['task:approve'] });
    await vi.waitFor(() => expect(root.textContent).toContain('手机 HTTPS 仍未启用'));
    [...root.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('关闭本机浏览器预览'))?.click();
    await vi.waitFor(() => expect(loopbackActions).toContain('stop'));
  });
});
