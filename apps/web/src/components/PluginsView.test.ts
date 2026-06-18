import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import { buildPluginConfig, ForgeSchemaForm } from '@forge/ui';
import type { SchemaFormDefinition } from '@forge/ui';
import PluginsView from './PluginsView.vue';

const schema: SchemaFormDefinition = { type: 'object', additionalProperties: false, required: ['credentialRef'], properties: {
  credentialRef: { type: 'string', title: '凭据引用', format: 'forge-credential-ref' },
  threshold: { type: 'integer', title: '上限' },
} };
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

  it('reports actual Web unavailability and Host inspection without synthetic config', async () => {
    const unavailable = mount(PluginsView, { client: { inspectBundledPlugin: vi.fn() }, desktop: false, connected: false });
    expect(unavailable.textContent).toContain('本地插件需要 Forge Desktop');
    app?.unmount(); root?.remove();
    const inspect = vi.fn().mockResolvedValue({ pluginId: 'forge.executor.codex', version: '0.0.1',
      forgeApiRange: '^1.0.0', compatible: true, active: true, issues: [],
      configSchema: { type: 'object', additionalProperties: false, required: [], properties: {} } });
    const desktop = mount(PluginsView, { client: { inspectBundledPlugin: inspect }, desktop: true, connected: true });
    await vi.waitFor(() => expect(desktop.textContent).toContain('当前插件没有可编辑配置项'));
    expect(inspect).toHaveBeenCalledOnce();
    expect(desktop.textContent).toContain('已装配');
    expect(desktop.querySelector('form')).toBeNull();
  });
});
