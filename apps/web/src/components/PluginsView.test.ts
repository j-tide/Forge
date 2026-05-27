import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import { buildPluginConfig, ForgeSchemaForm } from '@forge/ui';
import type { SchemaFormDefinition } from '@forge/ui';
import PluginsView from './PluginsView.vue';

const schema: SchemaFormDefinition = { type: 'object', additionalProperties: false, required: ['credentialRef'], properties: {
  credentialRef: { type: 'string', title: '凭据引用', format: 'forge-credential-ref' },
  threshold: { type: 'integer', title: '上限' },
} };
const declaration = { source: 'bundled-trusted', contentHash: 'a'.repeat(64),
  contributes: { executors: ['executor.codex'], modelProviders: ['model.codex'],
    contextProviders: [], tools: [], verifiers: [], viewTypes: [] },
  requires: ['process.v1'], requestedPermissions: ['workspace.read', 'process.spawn'],
  grantedPermissions: ['workspace.read', 'process.spawn'], supportedPlatforms: ['darwin-arm64'] };
let root: HTMLDivElement | undefined;
let app: VueApp | undefined;
function mount(component: object, props: Record<string, unknown>): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(component, props); app.mount(root);
  return root;
}
afterEach(() => { app?.unmount(); root?.remove(); app = undefined; root = undefined; });

describe('plugin config form', () => {
  it('submits only declared keys, rejects raw secrets and wrong numeric types', () => {
    expect(buildPluginConfig(schema, { credentialRef: 'credential:saved-one', threshold: 3,
      arbitrary: 'must-not-cross' })).toEqual({ credentialRef: 'credential:saved-one', threshold: 3 });
    expect(() => buildPluginConfig(schema, { credentialRef: 'sk-live-secret' })).toThrow('Invalid credential reference');
    expect(() => buildPluginConfig(schema, { credentialRef: 'credential:saved-one', threshold: 1.5 })).toThrow('Invalid field');
    expect(() => buildPluginConfig({ ...schema, properties: { timeout: {
      type: 'integer', minimum: 1, maximum: 60,
    } } }, { timeout: 61 })).toThrow('Invalid field');
  });

  it('masks credential input and only emits validated reference', async () => {
    const element = mount(ForgeSchemaForm, { schema });
    const input = element.querySelector<HTMLInputElement>('#forge-plugin-credentialRef')!;
    expect(input.type).toBe('password');
    input.value = 'sk-should-not-echo'; input.dispatchEvent(new Event('input', { bubbles: true }));
    element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(element.textContent).not.toContain('sk-should-not-echo');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Invalid credential reference');
    input.value = 'credential:saved-one'; input.dispatchEvent(new Event('input', { bubbles: true }));
    element.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await nextTick();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports Web unavailability and renders the locked Host configuration field', async () => {
    const unavailable = mount(PluginsView, { client: { inspectBundledPlugin: vi.fn() }, desktop: false, connected: false });
    expect(unavailable.textContent).toContain('本地插件需要 Forge Desktop');
    app?.unmount(); root?.remove();
    const inspect = vi.fn().mockResolvedValue({ pluginId: 'forge.executor.codex', version: '0.0.3',
      forgeApiRange: '^1.0.0', compatible: true, active: true, enabled: true, restartRequired: false,
      configRevision: 0, configValues: {}, configApplied: true, issues: [], faults: [],
      manifest: declaration, activeRunRefs: [], draining: false,
      configSchema: { type: 'object', additionalProperties: false, required: [], properties: {
        appServerInitializationTimeoutSeconds: { type: 'integer', minimum: 1, maximum: 60,
          title: 'Codex 启动握手等待（秒）' },
      } } });
    const desktop = mount(PluginsView, { client: { inspectBundledPlugin: inspect }, desktop: true, connected: true });
    await vi.waitFor(() => expect(desktop.textContent).toContain('Codex 启动握手等待'));
    expect(inspect).toHaveBeenCalledOnce();
    expect(desktop.textContent).toContain('已装配');
    expect(desktop.textContent).toContain('executor.codex');
    expect(desktop.textContent).toContain('model.codex');
    expect(desktop.textContent).toContain('未声明');
    expect(desktop.textContent).toContain('workspace.read');
    expect(desktop.textContent).toContain('process.v1');
    expect(desktop.querySelector<HTMLInputElement>('#forge-plugin-appServerInitializationTimeoutSeconds')?.max).toBe('60');
  });

  it('keeps the plugin view readable and shows sanitized fault with Run impact', async () => {
    const inspect = vi.fn().mockResolvedValue({ pluginId: 'forge.executor.codex', version: '0.0.3',
      forgeApiRange: '^1.0.0', compatible: true, active: false, enabled: true, restartRequired: true,
      configRevision: 0, configValues: {}, configApplied: false, issues: [], configSchema: null,
      manifest: declaration, activeRunRefs: ['run-42'], draining: true,
      faults: [{ pluginId: 'forge.executor.codex', phase: 'runtime', code: 'PLUGIN_RUNTIME_FAILED',
        runId: 'run-42', recordedAt: '2026-09-24T00:00:00+00:00' }] });
    const desktop = mount(PluginsView, { client: { inspectBundledPlugin: inspect }, desktop: true, connected: true });
    await vi.waitFor(() => expect(desktop.textContent).toContain('PLUGIN_RUNTIME_FAILED'));
    expect(desktop.textContent).toContain('run-42');
    expect(desktop.textContent).toContain('正在等待运行释放');
    expect(desktop.textContent).toContain('不可用');
  });

  it('separates a loaded plugin from the real executor capability probe', async () => {
    const inspection = { pluginId: 'forge.executor.codex', version: '0.0.3',
      forgeApiRange: '^1.0.0', compatible: true, active: true, enabled: true,
      configRevision: 0, configValues: {}, configApplied: true,
      manifest: declaration, activeRunRefs: [], draining: false,
      restartRequired: false, issues: [], faults: [], configSchema: { type: 'object',
        additionalProperties: false, required: [], properties: {} } };
    const probe = vi.fn().mockResolvedValueOnce({ executors: [{ executorId: 'executor.codex',
      available: false }] }).mockResolvedValueOnce({ executors: [{ executorId: 'executor.codex',
      available: true }] });
    const desktop = mount(PluginsView, { client: {
      inspectBundledPlugin: vi.fn().mockResolvedValue(inspection), agentProfileCatalog: probe,
    }, desktop: true, connected: true });
    await vi.waitFor(() => expect(desktop.querySelector('[aria-label="Codex 执行能力"]')?.textContent)
      .toContain('当前执行器不可启动'));
    expect(desktop.textContent).toContain('已装配');
    expect(desktop.querySelector('[aria-label="Codex 执行能力"]')?.textContent)
      .toContain('设置 → 本机依赖');
    const refresh = [...desktop.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('刷新诊断'))!;
    refresh.click();
    await vi.waitFor(() => expect(desktop.querySelector('[aria-label="Codex 执行能力"]')?.textContent)
      .toContain('均已通过'));
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('uses the fixed Desktop capability and displays persisted disabled and restart states', async () => {
    const base = { pluginId: 'forge.executor.codex', version: '0.0.3', forgeApiRange: '^1.0.0',
      compatible: true, active: true, enabled: true, restartRequired: false,
      configRevision: 0, configValues: {}, configApplied: true,
      manifest: declaration, activeRunRefs: [], draining: false,
      issues: [], faults: [], configSchema: { type: 'object', additionalProperties: false,
        required: [], properties: {} } };
    const setEnabled = vi.fn().mockResolvedValueOnce({ ...base, active: false, enabled: false })
      .mockResolvedValueOnce({ ...base, active: false, restartRequired: true });
    const desktop = mount(PluginsView, { client: {
      inspectBundledPlugin: vi.fn().mockResolvedValue(base), setBundledPluginEnabled: setEnabled,
    }, desktop: true, connected: true });
    await vi.waitFor(() => expect(desktop.textContent).toContain('已装配'));
    const disable = [...desktop.querySelectorAll('button')].find((button) => button.textContent?.includes('停用 Codex'))!;
    disable.click();
    await vi.waitFor(() => expect(desktop.textContent).toContain('已停用'));
    expect(desktop.querySelector('[aria-label="Codex 执行能力"]')?.textContent)
      .toContain('不可启动');
    expect(setEnabled).toHaveBeenCalledWith(false);
    const enable = [...desktop.querySelectorAll('button')].find((button) => button.textContent?.includes('启用并在重启后生效'))!;
    enable.click();
    await vi.waitFor(() => expect(desktop.textContent).toContain('插件设置已保存'));
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('saves a bounded configuration through the fixed client and shows pending restart', async () => {
    const configSchema = { type: 'object', additionalProperties: false, required: [], properties: {
      appServerInitializationTimeoutSeconds: { type: 'integer', minimum: 1, maximum: 60 },
    } };
    const base = { pluginId: 'forge.executor.codex', version: '0.0.3', forgeApiRange: '^1.0.0',
      compatible: true, active: true, enabled: true, restartRequired: false,
      configRevision: 0, configValues: {}, configApplied: true,
      manifest: declaration, activeRunRefs: [], draining: false,
      issues: [], faults: [], configSchema };
    const save = vi.fn().mockResolvedValue({ ...base, configRevision: 1,
      configValues: { appServerInitializationTimeoutSeconds: 25 },
      configApplied: false, restartRequired: true });
    const desktop = mount(PluginsView, { client: {
      inspectBundledPlugin: vi.fn().mockResolvedValue(base), saveBundledPluginConfig: save,
      agentProfileCatalog: vi.fn().mockResolvedValue({ executors: [{ executorId: 'executor.codex', available: true }] }),
    }, desktop: true, connected: true });
    const input = await vi.waitFor(() => {
      const field = desktop.querySelector<HTMLInputElement>('#forge-plugin-appServerInitializationTimeoutSeconds');
      expect(field).not.toBeNull();
      return field!;
    });
    input.value = '25'; input.dispatchEvent(new Event('input', { bubbles: true }));
    desktop.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ expectedRevision: 0,
      config: { appServerInitializationTimeoutSeconds: 25 } }));
    await vi.waitFor(() => expect(desktop.textContent).toContain('配置已保存到 Host'));
    expect(desktop.textContent).toContain('请重启 Forge');
    expect(desktop.textContent).toContain('配置待重启');
  });
});
