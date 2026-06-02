import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { RemoteApprovalDetail, RemoteApprovalPage } from '@forge/contracts';
import MobileApproval from './MobileApproval.vue';
import type { MobileSession } from './pairing';

const projectId = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const taskId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
const approvalId = '31ef81d5-3884-4a72-8bf4-0b28ce98130a';
const expiresAt = new Date(Date.now() + 60_000).toISOString();
const scopeHash = 'a'.repeat(64);
const actionDigest = 'b'.repeat(64);
const summary: RemoteApprovalPage['items'][number] = {
  approvalId, projectId, taskId, expectedRevision: 2, scopeHash,
  expiresAt, summary: 'Approve the real draft', risk: 'medium',
  requiredScope: 'task:create:todo',
};
const detail: RemoteApprovalDetail = {
  ...summary, snapshotId: null, actionDigest, deviceOperationScope: 'task:approve',
  contract: {
    schemaVersion: '1.0', taskId, projectId, revision: 2,
    title: 'Implement a small change', type: 'feature', goal: 'Update the fixture',
    acceptance: [{ id: 'AC-01', statement: 'The new check passes',
      method: 'inspection', required: true, sourceRefs: [] }],
    constraints: [], scope: ['src/math.ts'], outOfScope: ['docs/'],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [],
    workflowRef: 'standard@1', priority: 'normal',
  },
};
const session: MobileSession = {
  sessionId: projectId, deviceId: taskId, projectIds: [projectId], policyRevision: 1,
  expiresAt, csrfToken: 'A'.repeat(43),
};
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
let app: VueApp | undefined;
let root: HTMLDivElement | undefined;
const approved = vi.fn();
const stale = vi.fn();
const connectionLost = vi.fn();
const sessionRefreshRequired = vi.fn();

function mount(): HTMLDivElement {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(MobileApproval, {
    summary, session, connected: true, onApproved: approved,
    onStale: stale, onConnectionLost: connectionLost,
    onSessionRefreshRequired: sessionRefreshRequired,
  });
  app.mount(root);
  return root;
}
function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(label));
  if (!result) throw new Error(`Missing button: ${label}`);
  return result as HTMLButtonElement;
}

afterEach(() => {
  app?.unmount(); root?.remove();
  app = undefined; root = undefined;
  document.querySelectorAll('.forge-overlay').forEach((item) => item.remove());
  approved.mockReset(); stale.mockReset(); connectionLost.mockReset();
  sessionRefreshRequired.mockReset();
  vi.unstubAllGlobals();
});

describe('mobile Task approval', () => {
  it('requires fresh scope twice and an explicit final confirmation before TODO', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const sent = JSON.parse(String(options.body)) as {
          commandId: string; expectedRevision: number;
        };
        return reply(200, { commandId: sent.commandId, status: 'completed',
          operationId: null, resourceRevision: 2,
          result: { approvalId, taskId, state: 'todo', revision: 2 }, error: null });
      });
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    button('查看当前范围').click();
    await vi.waitFor(() => expect(element.textContent).toContain('The new check passes'));
    expect(element.textContent).toContain('尚无快照（当前为任务草稿）');
    expect(element.textContent).toContain('src/math.ts');
    expect(element.textContent).toContain('约束');
    expect(element.textContent).toContain('未解决问题');
    expect(element.textContent).toContain('流程 standard@1');
    expect(element.textContent).toContain('task:approve');
    button('批准并进入 TODO').click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(2);
    button('最终确认批准').click();
    button('最终确认批准').click();
    await vi.waitFor(() => expect(approved).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `/v1/approvals/${approvalId}`, `/v1/approvals/${approvalId}`,
      `/v1/approvals/${approvalId}`, '/v1/commands',
    ]);
    const [, options] = fetch.mock.calls[3] as [string, RequestInit];
    const command = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(command).toMatchObject({ method: 'tasks.approve', projectId,
      resourceId: approvalId, expectedRevision: 2,
      payload: { approvalId, scopeHash } });
    expect(Object.keys(command).sort()).toEqual([
      'commandId', 'expectedRevision', 'idempotencyKey', 'method', 'payload',
      'projectId', 'resourceId', 'schemaVersion',
    ]);
    expect(options.headers).toMatchObject({ 'X-CSRF-Token': session.csrfToken });
    expect(approved.mock.calls[0]?.[0].result.state).toBe('todo');
  });

  it('stops when Host changes the version or approval scope before confirmation', async () => {
    const changed = { ...detail, scopeHash: 'c'.repeat(64),
      actionDigest: 'd'.repeat(64) };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, changed));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    button('查看当前范围').click();
    await vi.waitFor(() => expect(element.textContent).toContain('The new check passes'));
    button('批准并进入 TODO').click();
    await vi.waitFor(() => expect(element.textContent).toContain('已变化'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(approved).not.toHaveBeenCalled();
    await nextTick();
  });

  it('refreshes a rotated CSRF token without replaying an approval', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(403, { code: 'REMOTE_CSRF_REJECTED' }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    button('查看当前范围').click();
    await vi.waitFor(() => expect(element.textContent).toContain('The new check passes'));
    button('批准并进入 TODO').click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    button('最终确认批准').click();
    await vi.waitFor(() => expect(sessionRefreshRequired).toHaveBeenCalledTimes(1));
    expect(element.textContent).toContain('本次审批未提交');
    expect(approved).not.toHaveBeenCalled();
    expect(connectionLost).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(element.textContent).not.toContain('检查原命令回执');
  });

  it('does not fetch or submit while offline', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const element = mount();
    button('查看当前范围').click();
    await nextTick();
    expect(element.textContent).toContain('审批不会排队');
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('rejects a wrong-task receipt even when the command ID matches', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const sent = JSON.parse(String(options.body)) as { commandId: string };
        return reply(200, { commandId: sent.commandId, status: 'completed',
          operationId: null, resourceRevision: 2,
          result: { approvalId, taskId: projectId, state: 'todo', revision: 2 },
          error: null });
      });
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    button('查看当前范围').click();
    await vi.waitFor(() => expect(element.textContent).toContain('The new check passes'));
    button('批准并进入 TODO').click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    button('最终确认批准').click();
    await vi.waitFor(() => expect(element.textContent).toContain('无法完成本次审批'));
    expect(approved).not.toHaveBeenCalled();
  });

  it('does not replay an uncertain write and checks the same command receipt only on request', async () => {
    let originalCommandId = '';
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockResolvedValueOnce(reply(200, detail))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        originalCommandId = (JSON.parse(String(options.body)) as {commandId: string}).commandId;
        throw new TypeError('Connection lost after Host commit');
      }).mockImplementationOnce(async () => reply(200, {
        commandId: originalCommandId, status: 'completed', operationId: null,
        resourceRevision: 2,
        result: { approvalId, taskId, state: 'todo', revision: 2 }, error: null,
      }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    button('查看当前范围').click();
    await vi.waitFor(() => expect(element.textContent).toContain('The new check passes'));
    button('批准并进入 TODO').click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    button('最终确认批准').click();
    await vi.waitFor(() => expect(element.textContent).toContain('结果尚未确认'));
    expect(approved).not.toHaveBeenCalled();
    expect(connectionLost).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    button('检查原命令回执').click();
    await vi.waitFor(() => expect(approved).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[4]?.[0]).toBe(`/v1/commands/${originalCommandId}`);
    expect(fetch.mock.calls.filter((call) => call[0] === '/v1/commands')).toHaveLength(1);
  });
});
