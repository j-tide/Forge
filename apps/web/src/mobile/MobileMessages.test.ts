import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App as VueApp } from 'vue';
import MobileMessages from './MobileMessages.vue';
import type { MobileSession } from './pairing';

const projectId = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const conversationId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
const messageId = '31ef81d5-3884-4a72-8bf4-0b28ce98130a';
const time = '2026-09-25T00:00:00Z';
const session: MobileSession = {
  sessionId: projectId, deviceId: messageId, projectIds: [projectId], policyRevision: 1,
  expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'A'.repeat(43),
};
const page = (revision: number) => ({ projectId, items: [{
  conversationId, projectId, title: 'Desktop conversation', revision, updatedAt: time,
}], page: { cursor: null, hasMore: false } });
const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
let app: VueApp | undefined;
let root: HTMLDivElement | undefined;
const sessionRefreshRequired = vi.fn();
function mount(connected = true): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(MobileMessages, { projectId, session, connected,
    onSessionRefreshRequired: sessionRefreshRequired });
  app.mount(root); return root;
}
function button(label: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(label));
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}
function input(value: string): void {
  const area = document.querySelector('textarea') as HTMLTextAreaElement;
  area.value = value; area.dispatchEvent(new Event('input', { bubbles: true }));
}
afterEach(() => {
  app?.unmount(); root?.remove(); app = undefined; root = undefined;
  vi.unstubAllGlobals(); sessionStorage.clear();
  sessionRefreshRequired.mockReset();
});

describe('mobile scoped message save', () => {
  it('shows authorized Host user/assistant text as escaped history without inventing replies', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(2)))
      .mockResolvedValueOnce(reply(200, {
        projectId, conversationId, items: [{ messageId, conversationId,
          sequence: 1, role: 'user', content: '<img src=x onerror=alert(1)>',
          truncated: false, status: 'completed', createdAt: time }],
        page: { cursor: null, hasMore: false },
      }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    button('读取 Host 消息').click();
    await vi.waitFor(() => expect(element.textContent).toContain('<img src=x onerror=alert(1)>'));
    expect(element.querySelector('.mobile-message-history img')).toBeNull();
    expect(element.textContent).not.toContain('助手 · completed');
    expect(fetch.mock.calls[1]?.[0]).toBe(
      `/v1/projects/${projectId}/conversations/${conversationId}/messages?limit=20`);
  });
  it('clears Host conversation text on disconnect while keeping unsent local input', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(2)))
      .mockResolvedValueOnce(reply(200, {
        projectId, conversationId, items: [{ messageId, conversationId,
          sequence: 1, role: 'user', content: 'Host 私有正文',
          truncated: false, status: 'completed', createdAt: time }],
        page: { cursor: null, hasMore: false },
      }));
    vi.stubGlobal('fetch', fetch);
    const connected = ref(true);
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(MobileMessages, {
      projectId, session, connected: connected.value,
    }) });
    app.mount(root);
    const element = root;
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    button('读取 Host 消息').click();
    await vi.waitFor(() => expect(element.textContent).toContain('Host 私有正文'));
    input('未发送的本机文字');
    connected.value = false;
    await nextTick();
    expect(element.textContent).not.toContain('Host 私有正文');
    expect(element.textContent).not.toContain('Desktop conversation');
    expect((element.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('未发送的本机文字');
    expect(button('保存到 Host').disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('fences a lost session and its late Host response without discarding unsent text', async () => {
    let releaseMessage!: (response: Response) => void;
    const pendingMessage = new Promise<Response>((resolve) => { releaseMessage = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(2)))
      .mockReturnValueOnce(pendingMessage)
      .mockResolvedValueOnce(reply(200, page(3)));
    vi.stubGlobal('fetch', fetch);
    const activeSession = ref<MobileSession | null>(session);
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(MobileMessages, {
      projectId, session: activeSession.value, connected: true,
    }) });
    app.mount(root);
    const element = root;
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('离线保留的文字');
    button('读取 Host 消息').click();
    activeSession.value = null;
    await nextTick();
    expect(element.textContent).not.toContain('Desktop conversation');
    expect((element.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('离线保留的文字');
    releaseMessage(reply(200, { projectId, conversationId, items: [{
      messageId, conversationId, sequence: 1, role: 'user',
      content: '旧会话的私有正文', truncated: false, status: 'completed', createdAt: time,
    }], page: { cursor: null, hasMore: false } }));
    await Promise.resolve(); await nextTick();
    expect(element.textContent).not.toContain('旧会话的私有正文');
    expect(button('保存到 Host').disabled).toBe(true);

    activeSession.value = { ...session, sessionId: crypto.randomUUID() };
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(element.textContent).not.toContain('旧会话的私有正文');
  });
  it('clears Host text when the same device loses an operation grant', async () => {
    let releasePolicyRead!: (response: Response) => void;
    const pendingPolicyRead = new Promise<Response>((resolve) => { releasePolicyRead = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(2)))
      .mockResolvedValueOnce(reply(200, { projectId, conversationId, items: [{
        messageId, conversationId, sequence: 1, role: 'user',
        content: '授权前的 Host 正文', truncated: false,
        status: 'completed', createdAt: time,
      }], page: { cursor: null, hasMore: false } }))
      .mockReturnValueOnce(pendingPolicyRead);
    vi.stubGlobal('fetch', fetch);
    const activeSession = ref<MobileSession>({ ...session });
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(MobileMessages, {
      projectId, session: activeSession.value, connected: true,
    }) });
    app.mount(root);
    await vi.waitFor(() => expect(root?.textContent).toContain('Desktop conversation'));
    button('读取 Host 消息').click();
    await vi.waitFor(() => expect(root?.textContent).toContain('授权前的 Host 正文'));
    input('未提交的本机文字');
    activeSession.value = { ...session, policyRevision: 2 };
    await nextTick();
    expect(root?.textContent).not.toContain('授权前的 Host 正文');
    expect(root?.textContent).not.toContain('Desktop conversation');
    expect((root?.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('未提交的本机文字');
    expect(button('保存到 Host').disabled).toBe(true);
    releasePolicyRead(reply(403, { code: 'REMOTE_OPERATION_FORBIDDEN' }));
    await vi.waitFor(() => expect(root?.textContent).toContain('无法读取当前项目的会话'));
    expect(root?.textContent).not.toContain('授权前的 Host 正文');
  });
  it('requires a deliberate conversation choice before sending retained text after its old conversation vanishes', async () => {
    const otherConversationId = crypto.randomUUID();
    const changedPage = { ...page(1), items: [{ ...page(1).items[0],
      conversationId: otherConversationId }] };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(2)))
      .mockResolvedValueOnce(reply(200, changedPage));
    vi.stubGlobal('fetch', fetch);
    const activeSession = ref<MobileSession | null>(session);
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(MobileMessages, {
      projectId, session: activeSession.value, connected: true,
    }) });
    app.mount(root);
    await vi.waitFor(() => expect(root?.textContent).toContain('Desktop conversation'));
    input('请保留这条长需求');
    activeSession.value = null;
    await nextTick();
    activeSession.value = { ...session, sessionId: crypto.randomUUID() };
    await vi.waitFor(() => expect(root?.textContent).toContain('原会话不可用'));
    const select = root?.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(button('保存到 Host').disabled).toBe(true);
    expect((root?.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('请保留这条长需求');
    select.value = otherConversationId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(button('保存到 Host').disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('sends only to an existing Host conversation with CAS and keeps an honest receipt', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(2)))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body)) as {
          commandId: string; expectedRevision: number; payload: { text: string };
        };
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 3, result: {
            message: { messageId, conversationId, sequence: 2, role: 'user',
              content: command.payload.text, status: 'completed',
              createdAt: time, updatedAt: time }, replay: false,
            replyStatus: 'unavailable' }, error: null });
      }).mockResolvedValueOnce(reply(200, page(3)));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('真实需求补充');
    await nextTick();
    button('保存到 Host').click();
    await vi.waitFor(() => expect(element.textContent).toContain('Host 已保存用户消息'));
    expect(element.textContent).toContain('模型回复不可用');
    const [, options] = fetch.mock.calls[1] as [string, RequestInit];
    const command = JSON.parse(String(options.body));
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      `/v1/projects/${projectId}/conversations?limit=50`, '/v1/commands',
      `/v1/projects/${projectId}/conversations?limit=50`,
    ]);
    expect(command).toMatchObject({ method: 'conversations.send', projectId,
      resourceId: conversationId, expectedRevision: 2,
      payload: { conversationId, text: '真实需求补充', attachmentIds: [] } });
    expect(options.headers).toMatchObject({ 'X-CSRF-Token': session.csrfToken });
    expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('does not queue or retry an uncertain write and preserves the input', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(1)))
      .mockRejectedValueOnce(new TypeError('connection lost'))
      .mockResolvedValueOnce(reply(404, { code: 'REMOTE_RECEIPT_NOT_FOUND' }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('保留这条草稿');
    await nextTick();
    button('保存到 Host').click();
    await vi.waitFor(() => expect(element.textContent).toContain('提交结果不确定'));
    expect((element.querySelector('textarea') as HTMLTextAreaElement).value).toBe('保留这条草稿');
    button('查询原命令回执').click();
    await vi.waitFor(() => expect(element.textContent).toContain('没有该命令回执'));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(fetch.mock.calls[2]?.[0])).toMatch(/^\/v1\/commands\/[0-9a-f-]+$/);
    expect(button('保存到 Host').disabled).toBe(true);
  });

  it('keeps message text and requires fresh review after a definite CSRF rejection', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(1)))
      .mockResolvedValueOnce(reply(403, { code: 'REMOTE_CSRF_REJECTED' }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('尚未发送的内容'); await nextTick();
    button('保存到 Host').click();
    await vi.waitFor(() => expect(sessionRefreshRequired).toHaveBeenCalledTimes(1));
    expect(element.textContent).toContain('本次消息未保存');
    expect((element.querySelector('textarea') as HTMLTextAreaElement).value)
      .toBe('尚未发送的内容');
    expect(element.textContent).not.toContain('查询原命令回执');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the manual Contract after a definite CSRF refusal without retrying', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(1)))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body));
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 2, result: {
            message: { messageId, conversationId, sequence: 1, role: 'user',
              content: command.payload.text, status: 'completed',
              createdAt: time, updatedAt: time }, replay: false,
            replyStatus: 'unavailable' }, error: null });
      }).mockResolvedValueOnce(reply(200, page(2)))
      .mockResolvedValueOnce(reply(403, { code: 'REMOTE_CSRF_REJECTED' }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('请增加输入校验'); await nextTick();
    button('保存到 Host').click();
    await vi.waitFor(() => expect(element.textContent).toContain('从这条消息建立人工草稿'));
    const title = element.querySelector('input') as HTMLInputElement;
    title.value = '保留合同标题'; title.dispatchEvent(new Event('input', { bubbles: true }));
    const areas = element.querySelectorAll('textarea');
    areas[1]!.value = '校验输入';
    areas[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    areas[2]!.value = '显示错误';
    areas[2]!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存人工任务草稿').click();
    await vi.waitFor(() => expect(sessionRefreshRequired).toHaveBeenCalledTimes(1));
    expect(element.textContent).toContain('本次草稿未保存');
    expect(title.value).toBe('保留合同标题');
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(element.textContent).not.toContain('查询草稿命令回执');
  });

  it('never offers a write when Host is disconnected', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const element = mount(false);
    input('留在输入框');
    expect(button('保存到 Host').disabled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(element.textContent).toContain('离线和失败不会自动重放');
  });

  it('explicitly saves a tab draft across unmount while offline without a Host POST', async () => {
    const fetch = vi.fn().mockResolvedValue(reply(200, page(1)));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('离线后继续写'); await nextTick();
    button('保存本机草稿').click();
    await nextTick();
    expect(element.textContent).toContain('只保存在此浏览器标签页');
    expect(fetch).toHaveBeenCalledTimes(1);
    app?.unmount(); root?.remove();
    const offline = mount(false);
    expect((offline.querySelector('textarea') as HTMLTextAreaElement).value).toBe('离线后继续写');
    expect(button('保存到 Host').disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    button('清除本机草稿').click();
    expect(sessionStorage.length).toBe(0);
  });

  it('saves an explicit manual Task Contract from the Host message without starting a Run', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(1)))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body));
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 2, result: {
            message: { messageId, conversationId, sequence: 1, role: 'user',
              content: command.payload.text, status: 'completed',
              createdAt: time, updatedAt: time }, replay: false,
            replyStatus: 'unavailable' }, error: null });
      }).mockResolvedValueOnce(reply(200, page(2)))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body));
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 1, result: {
            draftId: command.resourceId, status: 'proposed', revision: 1,
          }, error: null });
      }).mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body));
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 2, result: {
            draftId: command.resourceId, status: 'proposed', revision: 2,
          }, error: null });
      });
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    input('请增加输入校验'); await nextTick();
    button('保存到 Host').click();
    await vi.waitFor(() => expect(element.textContent).toContain('从这条消息建立人工草稿'));
    const title = element.querySelector('input') as HTMLInputElement;
    title.value = '输入校验'; title.dispatchEvent(new Event('input', { bubbles: true }));
    const areas = element.querySelectorAll('textarea');
    areas[1]!.value = '拒绝无效输入';
    areas[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    areas[2]!.value = '错误清晰展示';
    areas[2]!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存人工任务草稿').click();
    await vi.waitFor(() => expect(element.textContent).toContain('Host 已保存人工草稿'));
    const [, options] = fetch.mock.calls[3] as [string, RequestInit];
    const command = JSON.parse(String(options.body));
    expect(command).toMatchObject({ method: 'tasks.createDraft', projectId,
      expectedRevision: 0, payload: { contract: {
        title: '输入校验', goal: '拒绝无效输入', revision: 1,
        sourceRefs: [`message:${messageId}`, `decision:${command.commandId}`],
        acceptance: [{ statement: '错误清晰展示',
          sourceRefs: [`message:${messageId}`, `decision:${command.commandId}`] }],
      } } });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(element.textContent).toContain('不会自动进入 TODO');
    expect(button('保存草稿修订').disabled).toBe(true);
    title.value = '输入校验和边界';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const reason = [...element.querySelectorAll('input')].at(-1)!;
    reason.value = '补充边界说明';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存草稿修订').click();
    await vi.waitFor(() => expect(element.textContent).toContain('人工草稿版本 2'));
    const revision = JSON.parse(String((fetch.mock.calls[4] as [string, RequestInit])[1].body));
    expect(revision).toMatchObject({ method: 'tasks.revise', projectId,
      resourceId: command.resourceId, expectedRevision: 1,
      payload: { reason: '补充边界说明', contract: {
        title: '输入校验和边界', revision: 2,
        sourceRefs: [`message:${messageId}`, `decision:${command.commandId}`,
          `decision:${revision.commandId}`],
      } } });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('reopens a real Host draft after page remount and revises its current version', async () => {
    const draftId = crypto.randomUUID();
    const previousDecision = crypto.randomUUID();
    const sourceRefs = [`message:${messageId}`, `decision:${previousDecision}`];
    const contract = {
      schemaVersion: '1.0', taskId: draftId, projectId, revision: 1,
      title: '原始标题', type: 'feature', goal: '检查输入',
      acceptance: [{ id: 'ac1', statement: '显示错误', method: 'manual',
        required: true, sourceRefs }], constraints: [], scope: [], outOfScope: [],
      dependencies: [], openQuestions: [], assumptions: [], sourceRefs,
      workflowRef: 'standard@1', priority: 'normal',
    };
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(1)))
      .mockResolvedValueOnce(reply(200, {
        projectId, conversationId, items: [{ draftId, projectId, conversationId,
          sourceMessageId: messageId, revision: 1, status: 'proposed',
          canRevise: true, contract, updatedAt: time }],
        page: { cursor: null, hasMore: false },
      }))
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body));
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 2, result: {
            draftId, status: 'proposed', revision: 2,
          }, error: null });
      }).mockResolvedValueOnce(reply(200, {
        projectId, conversationId, items: [{ draftId, projectId, conversationId,
          sourceMessageId: messageId, revision: 2, status: 'proposed',
          canRevise: true, contract: { ...contract, revision: 2,
            title: '更新后的标题' }, updatedAt: time }],
        page: { cursor: null, hasMore: false },
      }));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    button('读取 Host 草稿').click();
    await vi.waitFor(() => expect(element.textContent).toContain('原始标题'));
    expect(fetch.mock.calls[1]?.[0]).toBe(
      `/v1/projects/${projectId}/conversations/${conversationId}/drafts?limit=20`);
    button('审阅并修订').click();
    await nextTick();
    expect(element.textContent).toContain('正在审阅 Host 草稿版本 1');
    const title = [...element.querySelectorAll('input')].find((item) =>
      item.value === '原始标题')!;
    title.value = '更新后的标题';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const reason = [...element.querySelectorAll('input')].at(-1)!;
    reason.value = '补充边界'; reason.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存草稿修订').click();
    await vi.waitFor(() => expect(element.textContent).toContain('人工草稿版本 2'));
    const submitted = JSON.parse(String((fetch.mock.calls[2] as [string, RequestInit])[1].body));
    expect(submitted).toMatchObject({ method: 'tasks.revise', expectedRevision: 1,
      projectId, resourceId: draftId, payload: { reason: '补充边界',
        contract: { title: '更新后的标题', revision: 2,
          sourceRefs: [...sourceRefs, `decision:${submitted.commandId}`],
        } } });
    await vi.waitFor(() => expect(element.textContent).toContain('版本 2 · proposed'));
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('ignores an older in-flight draft list after saving a newer revision', async () => {
    const draftId = crypto.randomUUID();
    const sourceRefs = [`message:${messageId}`, `decision:${crypto.randomUUID()}`];
    const contract = {
      schemaVersion: '1.0', taskId: draftId, projectId, revision: 1,
      title: '原版', type: 'feature', goal: '检查输入',
      acceptance: [{ id: 'ac1', statement: '显示错误', method: 'manual',
        required: true, sourceRefs }], constraints: [], scope: [], outOfScope: [],
      dependencies: [], openQuestions: [], assumptions: [], sourceRefs,
      workflowRef: 'standard@1', priority: 'normal',
    };
    const draftPage = (version: number, title: string) => ({
      projectId, conversationId, items: [{ draftId, projectId, conversationId,
        sourceMessageId: messageId, revision: version, status: 'proposed',
        canRevise: true, contract: { ...contract, revision: version, title },
        updatedAt: time }], page: { cursor: null, hasMore: false },
    });
    let finishOldRead: ((response: Response) => void) | undefined;
    const oldRead = new Promise<Response>((resolve) => { finishOldRead = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, page(1)))
      .mockResolvedValueOnce(reply(200, draftPage(1, '原版')))
      .mockImplementationOnce(() => oldRead)
      .mockImplementationOnce(async (_path: string, options: RequestInit) => {
        const command = JSON.parse(String(options.body));
        return reply(200, { commandId: command.commandId, status: 'completed',
          operationId: null, resourceRevision: 2, result: {
            draftId, status: 'proposed', revision: 2,
          }, error: null });
      }).mockResolvedValueOnce(reply(200, draftPage(2, '新版')));
    vi.stubGlobal('fetch', fetch);
    const element = mount();
    await vi.waitFor(() => expect(element.textContent).toContain('Desktop conversation'));
    button('读取 Host 草稿').click();
    await vi.waitFor(() => expect(element.textContent).toContain('原版'));
    button('审阅并修订').click();
    button('读取 Host 草稿').click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const title = [...element.querySelectorAll('input')].find((item) => item.value === '原版')!;
    title.value = '新版'; title.dispatchEvent(new Event('input', { bubbles: true }));
    const reason = [...element.querySelectorAll('input')].at(-1)!;
    reason.value = '补充边界'; reason.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('保存草稿修订').click();
    await vi.waitFor(() => expect(element.textContent).toContain('版本 2 · proposed'));
    finishOldRead?.(reply(200, draftPage(1, '原版')));
    await nextTick();
    expect(element.textContent).toContain('新版');
    expect(element.textContent).not.toContain('草稿版本或批准状态已变化');
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
