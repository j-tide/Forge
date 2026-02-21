import { afterEach, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import AgentsView from './AgentsView.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

function mount(client: object, desktop: boolean, connected: boolean): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(AgentsView, { client, desktop, connected }); app.mount(root);
  return root;
}

it('Web does not call the local Host and Claude remains unselectable', async () => {
  const catalog = vi.fn();
  const web = mount({ agentProfileCatalog: catalog }, false, false);
  expect(web.textContent).toContain('需要 Forge Desktop');
  expect(catalog).not.toHaveBeenCalled();
  app?.unmount(); root?.remove();
  const desktop = mount({ agentProfileCatalog: vi.fn().mockResolvedValue({
    profiles: [], availability: [], modelProviders: [], executors: [
      { executorId: 'executor.codex', available: true, modelIds: ['verified-model'],
        readOnlyEnforced: true, networkPolicyEnforced: false, approval: true, reason: null },
      { executorId: 'executor.claude', available: false, modelIds: [],
        readOnlyEnforced: false, networkPolicyEnforced: false, approval: false,
        reason: 'CLAUDE_NOT_VERIFIED' },
    ],
  }), saveAgentProfile: vi.fn() }, true, true);
  await vi.waitFor(() => expect(desktop.textContent).toContain('CLAUDE_NOT_VERIFIED'));
  const options = [...desktop.querySelectorAll<HTMLOptionElement>('option')];
  expect(options.find((item) => item.value === 'executor.claude')?.disabled).toBe(true);
  expect(desktop.textContent).not.toContain('Claude 已连接');
});
