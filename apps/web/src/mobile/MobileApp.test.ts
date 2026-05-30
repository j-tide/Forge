import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import MobileApp from './MobileApp.vue';

// Streaming framing is tested in @forge/client; these view fixtures keep their
// finite HTTP response order under test instead of consuming an SSE request.
const streamListeners = vi.hoisted(() => [] as Array<{
  onInvalidation: (event: { id: string }) => Promise<void>;
}>);
vi.mock('@forge/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@forge/client')>(),
  RemoteStreamTransport: class {
    constructor(_projectId: string, _cursor: string, listener: {
      onInvalidation: (event: { id: string }) => Promise<void>;
    }) { streamListeners.push(listener); }
    start(): void {}
    stop(): void {}
  },
}));

let app: VueApp | undefined;
let root: HTMLDivElement | undefined;
function mount(): HTMLDivElement {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(MobileApp, { theme: 'light', reduceTransparency: false, reduceMotion: false });
  app.mount(root);
  return root;
}
beforeEach(() => {
  streamListeners.length = 0;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ code: 'REMOTE_AUTH_REJECTED' }), { status: 401,
      headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => {
  app?.unmount();
  root?.remove();
  app = undefined;
  root = undefined;
  location.hash = '';
  vi.unstubAllGlobals();
});

describe('mobile layout without a remote Host', () => {
  it('fences an old Project read when the same device policy revision changes', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    const oldTask = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
    const newTask = '31ef81d5-3884-4a72-8bf4-0b28ce98130a';
    const reply = (data: unknown) => new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    let projectReads = 0;
    let boardReads = 0;
    let releaseOldRead!: (response: Response) => void;
    const oldRead = new Promise<Response>((resolve) => { releaseOldRead = resolve; });
    const projectPage = reply({ items: [{ id, name: '授权项目', revision: 1,
      defaultBranch: 'main', online: true }], page: { cursor: null, hasMore: false } });
    const fetch = vi.fn(async (path: string) => {
      if (path === '/v1/session/current') return reply({
        sessionId: id, deviceId: id, projectIds: [id],
        policyRevision: projectReads < 2 ? 1 : 2,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        csrfToken: 'A'.repeat(43),
      });
      if (path === '/v1/projects?limit=50') {
        projectReads += 1;
        return projectReads === 2 ? oldRead : projectPage.clone();
      }
      if (path === `/v1/projects/${id}/tasks?limit=50`) {
        boardReads += 1;
        const fresh = boardReads > 1;
        return reply({ projectId: id, tasks: [{ id: fresh ? newTask : oldTask,
          projectId: id, title: fresh ? '新授权版本任务' : '旧授权版本任务',
          state: 'todo', boardColumn: 'todo', revision: 1,
          contractRevision: 1, approvedRevision: 1, activeRunId: null,
          blockReason: null, allowedCommands: [] }],
        boardRevision: boardReads, eventCursor: `p:${boardReads}`,
        serverTime: new Date().toISOString(), page: { cursor: null, hasMore: false } });
      }
      if (path === '/v1/approvals?limit=50') return reply({
        items: [], page: { cursor: null, hasMore: false },
      });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    location.hash = '#/m/tasks';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('旧授权版本任务'));
    [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.trim() === '刷新')?.click();
    await vi.waitFor(() => expect(projectReads).toBe(2));
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(element.textContent).toContain('新授权版本任务'));
    releaseOldRead(projectPage.clone());
    await nextTick();
    expect(element.textContent).not.toContain('旧授权版本任务');
    expect(element.textContent).toContain('会话已验证');
    expect(boardReads).toBe(2);
  });
  it('refreshes authoritative tasks even if the optional notification read fails', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    const taskId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    let taskReads = 0;
    let notificationReads = 0;
    const fetch = vi.fn(async (path: string) => {
      if (path === '/v1/session/current') return reply({
        sessionId: id, deviceId: id, projectIds: [id], policyRevision: 1,
        expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'A'.repeat(43),
      });
      if (path === '/v1/projects?limit=50') return reply({
        items: [{ id, name: '真实项目', revision: 1, defaultBranch: 'main', online: true }],
        page: { cursor: null, hasMore: false },
      });
      if (path === `/v1/projects/${id}/tasks?limit=50`) {
        taskReads += 1;
        return reply({ projectId: id, tasks: [{ id: taskId, projectId: id,
          title: taskReads === 1 ? '旧状态' : 'Host 新状态', state: 'blocked',
          boardColumn: 'development', revision: taskReads,
          contractRevision: 1, approvedRevision: 1, activeRunId: null,
          blockReason: null, allowedCommands: [] }],
        boardRevision: taskReads, eventCursor: `p:${taskReads}`,
        serverTime: new Date().toISOString(), page: { cursor: null, hasMore: false } });
      }
      if (path === '/v1/approvals?limit=50') return reply({
        items: [], page: { cursor: null, hasMore: false },
      });
      if (path === `/v1/projects/${id}/notifications?limit=20`) {
        notificationReads += 1;
        return notificationReads === 1
          ? reply({ projectId: id, items: [], lastEventCursor: 'p:1' })
          : reply({ code: 'REMOTE_READ_FAILED' }, 500);
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetch);
    location.hash = '#/m/inbox';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('旧状态'));
    [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('查看通知'))?.click();
    await vi.waitFor(() => expect(notificationReads).toBe(1));
    expect(streamListeners).toHaveLength(1);
    await streamListeners[0]!.onInvalidation({ id: 'p:2' });
    await vi.waitFor(() => expect(element.textContent).toContain('Host 新状态'));
    await vi.waitFor(() => expect(element.textContent).toContain('无法读取当前通知'));
    expect(element.textContent).not.toContain('实时更新暂未确认');
    expect(taskReads).toBe(2);
  });

  it('opens Inbox first and navigates with fixed tabs without suggesting live data', async () => {
    location.hash = '';
    const element = mount();
    expect(element.querySelector('h1')?.textContent).toBe('待处理');
    expect(element.textContent).toContain('Host 未连接');
    expect(element.textContent).toContain('上次确认时间：暂无');
    expect(element.querySelectorAll('.mobile-nav button')).toHaveLength(4);
    (element.querySelector('button[aria-label="任务"]') as HTMLButtonElement).click();
    await nextTick();
    expect(location.hash).toBe('#/m/tasks');
    expect(element.querySelector('h1')?.textContent).toBe('任务');
    expect(element.textContent).toContain('任务列表需要已配对的 Forge Host');
    expect(element.querySelector('[aria-current="page"]')?.getAttribute('aria-label')).toBe('任务');
  });

  it('uses a full-page detail state and never fabricates task content', async () => {
    location.hash = '#/m/tasks/40aeb789-5011-40d1-a61c-748f661bcc5a';
    const element = mount();
    expect(element.querySelector('h1')?.textContent).toBe('任务详情');
    expect(element.textContent).toContain('无法读取权威任务详情');
    const back = [...element.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('返回任务'));
    back?.click();
    await nextTick();
    expect(location.hash).toBe('#/m/tasks');
    expect(element.querySelector('h1')?.textContent).toBe('任务');
  });

  it('does not present an expired Host session as connected', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionId: id, deviceId: id, projectIds: [id], policyRevision: 1,
      expiresAt: '2020-01-01T00:00:00Z', csrfToken: 'A'.repeat(43),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    location.hash = '#/m/account';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('一次性配对代码'));
    expect(element.textContent).toContain('Host 未连接');
    expect(element.textContent).toContain('原生推送未接入');
    expect(element.textContent).toContain('原生安全存储未接入');
    expect(element.textContent).toContain('扫码未接入');
  });

  it('pairs only after a same-origin Host claim and explicit Desktop approval', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    const secret = 'A'.repeat(43);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json' },
    });
    const fetch = vi.fn().mockResolvedValueOnce(reply(401, { code: 'REMOTE_AUTH_REJECTED' }))
      .mockResolvedValueOnce(reply(202, { status: 'pending', pairingId: id,
        claimSecret: secret, expiresAt }))
      .mockResolvedValueOnce(reply(200, { status: 'approved', deviceId: id,
        csrfToken: secret, expiresAt }))
      .mockResolvedValueOnce(reply(200, { sessionId: id, deviceId: id,
        projectIds: [id], policyRevision: 1, expiresAt, csrfToken: secret }))
      .mockResolvedValueOnce(reply(200, { items: [], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply(200, { items: [], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply(200, { revoked: true }));
    vi.stubGlobal('fetch', fetch);
    location.hash = '#/m/account';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('一次性配对代码'));
    const inputs = element.querySelectorAll('input');
    (inputs[0] as HTMLInputElement).value = 'Fixture phone';
    inputs[0]?.dispatchEvent(new Event('input', { bubbles: true }));
    (inputs[1] as HTMLInputElement).value = secret;
    inputs[1]?.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    const button = (label: string) => [...element.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.includes(label));
    button('提交配对请求')?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('等待 Desktop 确认'));
    expect(element.textContent).toContain('Host 未连接');
    button('检查确认结果')?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('会话已验证'));
    expect(element.textContent).toContain('已授权项目：1');
    button('断开本机会话')?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('本机远程会话已撤销'));
    expect(element.textContent).toContain('Host 未连接');
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      '/v1/session/current', '/v1/pair/claim', '/v1/pair/status',
      '/v1/session/current', '/v1/projects?limit=50', '/v1/approvals?limit=50',
      '/v1/session/revoke',
    ]);
    expect(localStorage.length).toBe(0);
  });

  it('renders real authorized Host tasks, then labels a network failure as stale', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    const taskId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
    const reply = (data: unknown) => new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    const task = { id: taskId, projectId: id, title: '检查真实代码变更',
      state: 'awaiting_acceptance', boardColumn: 'verify', revision: 3,
      contractRevision: 2, approvedRevision: 2, activeRunId: null,
      blockReason: null, allowedCommands: [] };
    const fetch = vi.fn().mockResolvedValueOnce(reply({
      sessionId: id, deviceId: id, projectIds: [id], policyRevision: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'A'.repeat(43),
    })).mockResolvedValueOnce(reply({ items: [{ id, name: '测试项目', revision: 1,
      defaultBranch: 'main', online: true }], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ projectId: id, tasks: [task], boardRevision: 4,
        eventCursor: 'p:4', serverTime: new Date().toISOString(),
        page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ items: [{ approvalId: taskId, projectId: id,
        taskId, expectedRevision: 2, scopeHash: '0'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        summary: '真实待批准草稿', risk: 'medium', requiredScope: 'task:create:todo',
      }], page: { cursor: null, hasMore: false } }))
      .mockRejectedValueOnce(new TypeError('Network unavailable'));
    vi.stubGlobal('fetch', fetch);
    location.hash = '#/m/inbox';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('检查真实代码变更'));
    expect(element.textContent).toContain('待人工验收');
    expect(element.textContent).toContain('真实待批准草稿');
    expect(element.textContent).toContain('查看当前范围');
    expect(element.textContent).toContain('上次从 Host 确认');
    const refresh = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('刷新'));
    refresh?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('只读快照'));
    expect(element.textContent).toContain('检查真实代码变更');
    expect(element.textContent).toContain('Host 未连接');
  });

  it('extends the current Host task page without inventing a newer board revision', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    const firstId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
    const secondId = '31ef81d5-3884-4a72-8bf4-0b28ce98130a';
    const reply = (data: unknown) => new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    const task = (taskId: string, title: string) => ({ id: taskId, projectId: id,
      title, state: 'todo', boardColumn: 'todo', revision: 1,
      contractRevision: 1, approvedRevision: 1, activeRunId: null,
      blockReason: null, allowedCommands: [] });
    const meta = { projectId: id, boardRevision: 8, eventCursor: 'p:8',
      serverTime: new Date().toISOString() };
    const fetch = vi.fn().mockResolvedValueOnce(reply({
      sessionId: id, deviceId: id, projectIds: [id], policyRevision: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'A'.repeat(43),
    })).mockResolvedValueOnce(reply({ items: [{ id, name: '真实项目', revision: 1,
      defaultBranch: 'main', online: true }], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ ...meta, tasks: [task(firstId, '第一页任务')],
        page: { cursor: 'b:8:1', hasMore: true } }))
      .mockResolvedValueOnce(reply({ items: [], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ ...meta, tasks: [task(secondId, '第二页任务')],
        page: { cursor: null, hasMore: false } }));
    vi.stubGlobal('fetch', fetch);
    location.hash = '#/m/tasks';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('第一页任务'));
    const more = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('更多任务'));
    more?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('第二页任务'));
    expect(element.textContent).toContain('第一页任务');
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(
      `/v1/projects/${id}/tasks?limit=50&cursor=b%3A8%3A1`);
  });

  it('opens the authorized Task contract, activity and folded redacted Diff as read-only', async () => {
    const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
    const taskId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
    const now = new Date().toISOString();
    const reply = (data: unknown) => new Response(JSON.stringify(data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    const task = { id: taskId, projectId: id, title: '可查看的任务', state: 'active',
      boardColumn: 'development', revision: 2, contractRevision: 2,
      approvedRevision: 2, activeRunId: null, blockReason: null,
      allowedCommands: [] };
    const contract = { schemaVersion: '1.0', taskId, projectId: id, revision: 2,
      title: task.title, type: 'feature', goal: '检查真实变更',
      acceptance: [{ id: 'AC-01', statement: '代码可审查', method: 'inspection',
        required: true, sourceRefs: [] }], constraints: [], scope: [], outOfScope: [],
      dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [],
      workflowRef: 'standard@1', priority: 'normal' };
    const fetch = vi.fn().mockResolvedValueOnce(reply({
      sessionId: id, deviceId: id, projectIds: [id], policyRevision: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'A'.repeat(43),
    })).mockResolvedValueOnce(reply({ items: [{ id, name: '项目', revision: 1,
      defaultBranch: 'main', online: true }], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ projectId: id, tasks: [task], boardRevision: 3,
        eventCursor: 'p:3', serverTime: now,
        page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ items: [], page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ task, contract, runIds: [taskId],
        artifactIds: [], pendingApprovalIds: [], evidence: [{
          kind: 'review', id: taskId, status: 'approved', snapshotId: taskId,
          createdAt: now,
        }] }))
      .mockResolvedValueOnce(reply({ taskId, items: [{ cursor: 3, runId: taskId,
        type: 'file.changed', text: 'modified math.ts', timestamp: now }],
      page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ taskId, available: true, runId: taskId,
        files: [{ path: 'src/math.ts', status: 'modified' }],
        textChunk: 'diff --git a/src/math.ts b/src/math.ts\n+safe line',
        nextCursor: 'd:aaaaaaaaaaaaaaaa:50', truncated: false, capturedAt: now }))
      .mockResolvedValueOnce(reply({ taskId, available: true, runId: taskId,
        files: [{ path: 'src/math.ts', status: 'modified' }],
        textChunk: '\n+second page', nextCursor: null,
        truncated: false, capturedAt: now }));
    vi.stubGlobal('fetch', fetch);
    location.hash = '#/m/tasks';
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('可查看的任务'));
    const open = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('查看详情'));
    open?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('代码可审查'));
    expect(element.textContent).toContain('modified math.ts');
    expect(element.textContent).toContain('审查');
    expect(element.textContent).toContain('历史记录');
    expect(element.textContent).toContain('展开纯文本差异');
    expect(element.querySelector('pre')?.textContent).toContain('+safe line');
    [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('加载更多差异'))?.click();
    await vi.waitFor(() => expect(element.querySelector('pre')?.textContent)
      .toContain('+second page'));
    expect(element.querySelector('[href^="file:"]')).toBeNull();
    expect(fetch.mock.calls.map((call) => call[0]).slice(-4)).toEqual([
      `/v1/tasks/${taskId}`, `/v1/tasks/${taskId}/activity?limit=20`,
      `/v1/tasks/${taskId}/diff?limit=4096`,
      `/v1/tasks/${taskId}/diff?limit=4096&cursor=d%3Aaaaaaaaaaaaaaaaa%3A50`,
    ]);
    fetch.mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(reply({ taskId, items: [],
        page: { cursor: null, hasMore: false } }))
      .mockResolvedValueOnce(reply({ taskId, available: false, runId: null,
        files: [], textChunk: '', nextCursor: null, truncated: false, capturedAt: null }));
    const back = [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('返回任务'));
    back?.click();
    await nextTick();
    [...element.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('查看详情'))?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('连接中断。任务详情与差异已隐藏'));
    expect(element.textContent).toContain('Host 未连接');
    expect(element.textContent).not.toContain('+safe line');
  });
});
