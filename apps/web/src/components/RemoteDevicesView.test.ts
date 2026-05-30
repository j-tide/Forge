import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import RemoteDevicesView from './RemoteDevicesView.vue';

const deviceId = '5f89d912-9f5d-41f5-9c39-d0cdb7d7a6e3';
const projectId = 'b1e198fd-0ba4-4626-a782-bba4326a36d2';
const now = '2026-09-25T00:00:00.000Z';
let root: HTMLDivElement | undefined;
let app: VueApp | undefined;
function mount(props: Record<string, unknown>): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(RemoteDevicesView, props); app.mount(root);
  return root;
}
function action(element: HTMLElement, text: string): HTMLButtonElement {
  const button = [...element.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.includes(text));
  expect(button, `Missing ${text} action`).toBeDefined();
  return button!;
}
afterEach(() => { app?.unmount(); root?.remove(); app = undefined; root = undefined; });

describe('local remote-device management', () => {
  it('explains Web unavailability without reading a local device list', () => {
    const devicePairing = vi.fn();
    const element = mount({ client: { devicePairing }, desktop: false,
      connected: false, projectId: null });
    expect(element.textContent).toContain('需要 Forge Desktop');
    expect(element.textContent).toContain('本机浏览器预览未开启');
    expect(devicePairing).not.toHaveBeenCalled();
  });

  it('loads real Host values, narrows a grant, shows audit and revokes', async () => {
    let device = { deviceId, name: 'Fixture phone', addressSummary: 'private-network',
      fingerprintSummary: 'device-report', projectIds: [projectId],
      scopes: ['task:draft'] as string[], revision: 1, status: 'approved',
      approvedAt: now, revokedAt: null as string | null, validSessionCount: 1 };
    const devicePairing = vi.fn(async (command: { type: string; payload: Record<string, unknown> }) => {
      if (command.type === 'list') return [device];
      if (command.type === 'audit') return [{ eventId: 'f69160b6-6c85-40da-b627-b647e93d39cb',
        kind: 'narrow', oldRevision: 1, newRevision: 2,
        oldProjectIds: [projectId], newProjectIds: [projectId],
        oldScopes: ['task:draft'], newScopes: [], decidedAt: now }];
      if (command.type === 'narrow') {
        device = { ...device, scopes: [], revision: 2 };
        return { deviceId, revision: 2, projectIds: [projectId], scopes: [], status: 'approved' };
      }
      if (command.type === 'revoke') {
        device = { ...device, scopes: [], projectIds: [], revision: 3,
          status: 'revoked', revokedAt: now, validSessionCount: 0 };
        return { deviceId, revision: 3, projectIds: [], scopes: [], status: 'revoked' };
      }
      throw Error('Unexpected operation');
    });
    const element = mount({ client: { devicePairing }, desktop: true,
      connected: true, projectId,
      loopback: { running: true, origin: 'http://127.0.0.1:58231',
        hostId: 'a638f963-2c6e-4758-9033-b48be41072cf' } });
    await vi.waitFor(() => expect(element.textContent).toContain('Fixture phone'));
    expect(element.textContent).toContain('127.0.0.1 已开启');
    expect(element.textContent).toContain('手机尚不能连接');
    expect(element.textContent).toContain('这不是设备在线状态');
    action(element, '收窄为只读').click();
    await vi.waitFor(() => expect(element.textContent).toContain('设备已收窄为只读'));
    expect(devicePairing).toHaveBeenCalledWith({ type: 'narrow', payload: {
      deviceId, expectedRevision: 1, projectIds: [projectId], scopes: [],
    } });
    action(element, '查看审计').click();
    await vi.waitFor(() => expect(element.textContent).toContain('操作 1 → 0'));
    action(element, '撤销设备').click();
    await vi.waitFor(() => expect(element.textContent).toContain('设备及其会话已撤销'));
    expect(devicePairing).toHaveBeenCalledWith({ type: 'revoke', payload: {
      deviceId, expectedRevision: 2,
    } });
    expect(element.textContent).toContain('已撤销');
    expect([...element.querySelectorAll('button')].some(
      (button) => button.textContent?.includes('撤销设备'))).toBe(false);
  });
});
