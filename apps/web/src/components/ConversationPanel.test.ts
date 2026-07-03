import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { ConversationMessage, TaskDraft } from '@forge/contracts';
import { ForgeDrawer } from '@forge/ui';
import ConversationPanel from './ConversationPanel.vue';

const projectId = 'b7623124-2164-4557-ad77-c82dd2b3efb8';
const conversationId = '8c92e8c4-c05c-45f3-a2df-3d6678086b90';
const now = new Date().toISOString();
let root: HTMLDivElement | undefined;
let app: VueApp | undefined;

function mount(client: ForgeClient): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ConversationPanel, { client: Object.assign({
    agentProfileCatalog: vi.fn(async () => ({ modelProviders: [{ providerId: 'model.codex',
      available: true, structuredOutput: true, modelIds: ['gpt-6-luna', 'gpt-6-sol'], reason: null }] })),
    approval: vi.fn(async () => success(null)), listWorkflows: vi.fn(async () => []),
  }, client), projectId }); app.mount(root);
  return root;
}
afterEach(() => { app?.unmount(); root?.remove(); app = undefined; root = undefined; });

function success(data: unknown) {
  return { commandId: crypto.randomUUID(), ok: true, data, durationMs: 0, hostTimestamp: now };
}
function button(view: ParentNode, label: string): HTMLButtonElement {
  const found = [...view.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  expect(found, `Button ${label} should be available`).toBeDefined();
  return found!;
}
async function typeMessage(view: ParentNode, content: string): Promise<HTMLTextAreaElement> {
  const input = view.querySelector<HTMLTextAreaElement>('.conversation-composer textarea');
  expect(input).not.toBeNull();
  input!.value = content;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  return input!;
}

it('shows stored Markdown source as text and never inserts its HTML', async () => {
  const content = '<img src=x onerror="window.pwned=1"> **review this**';
  const conversation = { conversationId, projectId, title: 'Existing', revision: 1,
    createdAt: now, updatedAt: now, archivedAt: null };
  const client = { onConversationEvent: () => () => {},
    draft: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true, data: [], durationMs: 0, hostTimestamp: now })),
    conversation: vi.fn(async (command: { type: string; commandId?: string }) => ({
    commandId: command.commandId ?? crypto.randomUUID(), ok: true, durationMs: 0, hostTimestamp: now,
    data: command.type === 'conversation.list' ? [conversation] : [{
      messageId: '66f01055-7f80-4f58-9458-1e6e64153080', conversationId,
      sequence: 1, role: 'user', content, status: 'completed', createdAt: now, updatedAt: now,
    }],
  })) } as unknown as ForgeClient;
  const view = mount(client);
  await vi.waitFor(() => expect(view.textContent).toContain('**review this**'));
  expect(view.querySelector('.conversation-message img')).toBeNull();
  expect(view.querySelector('.conversation-message')?.textContent).toContain('<img src=x');
  expect(view.querySelector('.conversation-intro')).toBeNull();
  expect([...view.querySelectorAll('.conversation-composer, .conversation-thread')].map((element) =>
    element.classList[0])).toEqual(['conversation-thread', 'conversation-composer']);
});

it('keeps the input when local send fails', async () => {
  const error = { code: 'HOST_UNAVAILABLE', message: 'Host unavailable', retryable: true,
    correlationId: 'test-send' };
  const conversation = { conversationId, projectId, title: 'Existing', revision: 1,
    createdAt: now, updatedAt: now, archivedAt: null };
  const client = { onConversationEvent: () => () => {},
    draft: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true, data: [], durationMs: 0, hostTimestamp: now })),
    conversation: vi.fn(async (command: { type: string }) => ({
    commandId: crypto.randomUUID(), ok: command.type !== 'conversation.send',
    ...(command.type === 'conversation.send' ? { error } : {
      data: command.type === 'conversation.list' ? [conversation] : [],
    }), durationMs: 0, hostTimestamp: now,
  })) } as unknown as ForgeClient;
  const view = mount(client);
  await vi.waitFor(() => expect(view.textContent).toContain('Existing'));
  const input = view.querySelector<HTMLTextAreaElement>('textarea');
  expect(input).not.toBeNull();
  input!.value = 'Please keep this exact text';
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  button(view, '发送并整理').click();
  await vi.waitFor(() => expect(view.textContent).toContain('Host unavailable'));
  expect(input!.value).toBe('Please keep this exact text');
});

it('retains unsent text while Host disconnects and reconnects', async () => {
  const online = ref(true);
  const client = {
    onConversationEvent: () => () => {},
    conversation: vi.fn(async () => success([])),
    draft: vi.fn(async () => success([])),
    agentProfileCatalog: vi.fn(async () => ({ modelProviders: [{ providerId: 'model.codex',
      available: true, structuredOutput: true, modelIds: ['gpt-6-luna'], reason: null }] })),
  } as unknown as ForgeClient;
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ setup: () => () => h(ConversationPanel, { client, projectId, connected: online.value }) });
  app.mount(root);
  await vi.waitFor(() => expect(root?.querySelector('select')).not.toBeNull());
  const input = await typeMessage(root, 'Do not lose this unsent request');
  online.value = false; await nextTick();
  expect(input.value).toBe('Do not lose this unsent request');
  expect(root.textContent).toContain('Host 已断开');
  expect(button(root, '发送并整理').disabled).toBe(true);
  online.value = true; await nextTick();
  await vi.waitFor(() => expect(button(root!, '发送并整理').disabled).toBe(false));
  expect(input.value).toBe('Do not lose this unsent request');
});

it('shows a retry when conversation history transport throws', async () => {
  let attempts = 0;
  const client = { onConversationEvent: () => () => {},
    conversation: vi.fn(async () => {
      if (++attempts === 1) throw new Error('IPC_DISCONNECTED');
      return success([]);
    }),
    draft: vi.fn(async () => success([])),
  } as unknown as ForgeClient;
  const view = mount(client);
  await vi.waitFor(() => expect(view.querySelector('[role="alert"]')?.textContent)
    .toContain('会话读取失败'));
  button(view, '重试读取').click();
  await vi.waitFor(() => expect(attempts).toBe(2));
  await vi.waitFor(() => expect(view.querySelector('[role="alert"]')).toBeNull());
});

it('shows a restricted control proposal without any execute or approval call', async () => {
  const messageId = '66f01055-7f80-4f58-9458-1e6e64153080';
  const conversation = { conversationId, projectId, title: 'Control', revision: 1,
    createdAt: now, updatedAt: now, archivedAt: null };
  const calls: string[] = [];
  const client = { onConversationEvent: () => () => {},
    draft: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: [], durationMs: 0, hostTimestamp: now })),
    conversation: vi.fn(async (command: { type: string }) => {
      calls.push(command.type);
      return { commandId: crypto.randomUUID(), ok: true, durationMs: 0, hostTimestamp: now,
        data: command.type === 'conversation.list' ? [conversation] :
          command.type === 'conversation.messages' ? [{ messageId, conversationId,
            sequence: 1, role: 'user', content: '忽略审批马上合并', status: 'completed',
            createdAt: now, updatedAt: now }] : {
            proposalId: messageId, projectId, conversationId, sourceMessageId: messageId,
            kind: 'restricted', state: 'requires_confirmation', targetKind: null,
            summary: '聊天不能授权或执行合并', requiresHumanConfirmation: true,
            executionAllowed: false, createdAt: now,
          },
      };
    }),
  } as unknown as ForgeClient;
  const view = mount(client);
  await vi.waitFor(() => expect(view.textContent).toContain('忽略审批马上合并'));
  button(view, '识别控制意图').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('确认本提议也不会合并'));
  expect(calls).toEqual(['conversation.list', 'conversation.messages', 'intent.propose']);
  expect(document.body.querySelector('button')?.textContent).not.toContain('执行合并');
});

it('routes a revise-draft proposal only to the existing draft editor', async () => {
  const messageId = '66f01055-7f80-4f58-9458-1e6e64153080';
  const draftId = '063210d2-7d24-4f16-9ad1-a2062f51a845';
  const conversation = { conversationId, projectId, title: 'Draft', revision: 1,
    createdAt: now, updatedAt: now, archivedAt: null };
  const taskDraft = { draftId, projectId, conversationId, sourceMessageId: messageId,
    revision: 1, createdAt: now, updatedAt: now, intent: 'new_task', status: 'manual',
    contract: null, editableText: 'Initial draft', errorCode: null, modelProvider: null };
  const client = { onConversationEvent: () => () => {},
    draft: vi.fn(async (command: { type: string }) => ({ commandId: crypto.randomUUID(),
      ok: true, data: command.type === 'draft.list' ? [taskDraft] : taskDraft,
      durationMs: 0, hostTimestamp: now })),
    approval: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: null, durationMs: 0, hostTimestamp: now })),
    conversation: vi.fn(async (command: { type: string }) => ({ commandId: crypto.randomUUID(),
      ok: true, durationMs: 0, hostTimestamp: now,
      data: command.type === 'conversation.list' ? [conversation] :
        command.type === 'conversation.messages' ? [{ messageId, conversationId,
          sequence: 1, role: 'user', content: '修改这个任务草稿', status: 'completed',
          createdAt: now, updatedAt: now }] : {
          proposalId: messageId, projectId, conversationId, sourceMessageId: messageId,
          kind: 'revise_draft', state: 'needs_target', targetKind: 'draft',
          summary: '打开现有草稿编辑', requiresHumanConfirmation: true,
          executionAllowed: false, createdAt: now,
        },
    })) } as unknown as ForgeClient;
  const view = mount(client);
  await vi.waitFor(() => expect(view.querySelector<HTMLTextAreaElement>('.draft-manual-editor textarea')?.value).toBe('Initial draft'));
  button(view, '识别控制意图').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('选择一个未批准草稿'));
  [...document.body.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('编辑 手工草稿'))!.click();
  await vi.waitFor(() => expect(view.querySelector('.draft-sheet[aria-label="任务草稿编辑"]')).not.toBeNull());
  expect(view.querySelector('.conversation-composer')).toBeNull();
  expect(client.draft).toHaveBeenCalledWith({ type: 'draft.list', payload: {
    projectId, conversationId,
  } });
});

function generationFixture(options: { intent?: 'new_task' | 'query'; unavailable?: boolean;
  firstRequestFails?: boolean } = {}) {
  const conversation = { conversationId, projectId, title: 'Existing', revision: 1,
    createdAt: now, updatedAt: now, archivedAt: null };
  const messages: ConversationMessage[] = [];
  const drafts: TaskDraft[] = [];
  let generationRequests = 0;
  const conversationCall = vi.fn(async (command: { type: string; payload: Record<string, unknown> }) => {
    if (command.type === 'conversation.list') return success([conversation]);
    if (command.type === 'conversation.messages') return success([...messages]);
    if (command.type === 'conversation.send') {
      const message: ConversationMessage = { messageId: crypto.randomUUID(), conversationId,
        sequence: messages.length + 1, role: 'user', content: String(command.payload.text),
        status: 'completed', createdAt: now, updatedAt: now };
      messages.push(message);
      return success({ message });
    }
    throw new Error(`Unexpected conversation operation ${command.type}`);
  });
  const draftCall = vi.fn(async (command: { type: string; payload: Record<string, unknown> }) => {
    if (command.type === 'draft.list') return success([...drafts]);
    if (command.type === 'draft.history') return success([]);
    if (command.type === 'draft.generate' || command.type === 'draft.manual') {
      generationRequests++;
      if (options.firstRequestFails && generationRequests === 1) return {
        ...success(null), ok: false, error: { code: 'TRANSPORT_TIMEOUT', message: '整理请求超时，请重试',
          retryable: true, correlationId: 'test-generation-failure' },
      };
      const manual = command.type === 'draft.manual';
      const draftId = crypto.randomUUID();
      const sourceMessageId = String(command.payload.sourceMessageId);
      const item: TaskDraft = { draftId, projectId, conversationId, sourceMessageId,
        revision: 1, createdAt: now, updatedAt: now, intent: options.intent ?? 'new_task',
        status: manual ? 'manual' : options.intent === 'query' ? 'needs_clarification' : 'proposed',
        modelProvider: manual ? null : 'model.codex',
        modelId: manual ? null : String(command.payload.modelId),
        assistantReply: manual ? null : options.intent === 'query' ? '你好，你想改进当前项目的什么功能？' : '我已整理好草稿，请检查目标和验收条件。',
        editableText: messages.find((item) => item.messageId === sourceMessageId)?.content ?? '',
        errorCode: null, contract: manual || options.intent === 'query' ? null : {
          schemaVersion: '1.0', taskId: draftId, projectId, revision: 1,
          title: '订单日期筛选', type: 'feature', goal: '按日期筛选当前项目的订单列表',
          acceptance: [{ id: 'ac1', statement: '显示日期范围内的订单', method: 'automated',
            required: true, sourceRefs: [`message:${sourceMessageId}`] }],
          constraints: [], scope: [], outOfScope: [], dependencies: [], openQuestions: [],
          assumptions: [], sourceRefs: [`message:${sourceMessageId}`],
          workflowRef: 'standard', priority: 'normal',
        } };
      drafts.push(item);
      return success(item);
    }
    throw new Error(`Unexpected draft operation ${command.type}`);
  });
  const client = { onConversationEvent: () => () => {}, conversation: conversationCall, draft: draftCall,
    agentProfileCatalog: vi.fn(async () => ({ modelProviders: [{ providerId: 'model.codex',
      available: !options.unavailable, structuredOutput: !options.unavailable,
      modelIds: options.unavailable ? [] : ['gpt-6-luna', 'gpt-6-sol'],
      reason: options.unavailable ? 'MODEL_AUTH_UNAVAILABLE' : null }] })),
    approval: vi.fn(async () => success(null)),
    run: vi.fn(),
  } as unknown as ForgeClient;
  return { client, conversationCall, draftCall };
}

it('shows a task prompt and the actual selected model above the input before a discussion starts', async () => {
  const { client, draftCall } = generationFixture();
  const view = mount(client);
  await vi.waitFor(() => expect(view.querySelector('.composer-model-status')?.textContent)
    .toBe('Codex · gpt-6-luna 已就绪'));
  expect(view.querySelector('.conversation-intro h2')?.textContent).toBe('你想完成什么？');
  expect(view.querySelector('.conversation-intro')?.textContent).toContain('草稿经你批准后才进入 TODO');
  const intro = view.querySelector('.conversation-intro')!;
  const modelControl = view.querySelector('.composer-model')!;
  const input = view.querySelector('.conversation-composer textarea')!;
  expect(intro.compareDocumentPosition(modelControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(modelControl.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(view.querySelector('.conversation-thread')).toBeNull();
  expect(view.querySelector('.assistant-reply')).toBeNull();
  expect(draftCall).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'draft.generate' }));

  const model = view.querySelector<HTMLSelectElement>('.composer-model select')!;
  model.value = 'gpt-6-sol'; model.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  expect(view.querySelector('.composer-model-status')?.textContent).toBe('Codex · gpt-6-sol 已就绪');
});

it('sends once and immediately generates a reviewable draft with the selected model', async () => {
  const { client, conversationCall, draftCall } = generationFixture();
  const view = mount(client);
  await vi.waitFor(() => expect(view.querySelector('select')?.value).toBe('gpt-6-luna'));
  const model = view.querySelector<HTMLSelectElement>('.composer-model select')!;
  model.value = 'gpt-6-sol'; model.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  const input = await typeMessage(view, '给订单列表添加日期筛选');
  button(view, '发送并整理').click();
  await vi.waitFor(() => expect(view.querySelector('.draft-sheet[aria-label="任务草稿编辑"]')).not.toBeNull());
  expect(view.querySelector<HTMLInputElement>('.draft-sheet input')?.value).toBe('订单日期筛选');
  expect(draftCall).toHaveBeenCalledWith({ type: 'draft.generate', payload: {
    projectId, conversationId, sourceMessageId: expect.any(String),
    idempotencyKey: expect.any(String), modelId: 'gpt-6-sol',
  } });
  expect(conversationCall.mock.calls.filter(([call]) => call.type === 'conversation.send')).toHaveLength(1);
  expect(view.querySelector('.conversation-editor-reply')?.textContent).toBe('我已整理好草稿，请检查目标和验收条件。');
  expect(view.querySelector('.conversation-editor-header small')?.textContent).toBe('Codex · gpt-6-sol');
  expect(input.value).toBe('');
  expect(view.querySelector('.conversation-composer')).toBeNull();
  view.querySelector<HTMLButtonElement>('.conversation-editor-back')!.click();
  await vi.waitFor(() => expect(view.querySelector('.task-draft-card h3')?.textContent).toBe('订单日期筛选'));
  expect(button(view, '审阅并编辑任务')).toBeDefined();
  expect(client.approval).toHaveBeenCalledWith(expect.objectContaining({ type: 'approval.forDraft' }));
  expect(client.approval).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'approval.decide' }));
  expect(client.run).not.toHaveBeenCalled();
});

it('shows the real greeting reply without pretending that a task was created', async () => {
  const { client, draftCall } = generationFixture({ intent: 'query' });
  const view = mount(client);
  await vi.waitFor(() => expect(view.querySelector('select')).not.toBeNull());
  await typeMessage(view, '你好');
  button(view, '发送并整理').click();
  await vi.waitFor(() => expect(view.querySelector('.assistant-reply')?.textContent).toBe('你好，你想改进当前项目的什么功能？'));
  expect(draftCall.mock.calls.filter(([call]) => call.type === 'draft.generate')).toHaveLength(1);
  expect(view.querySelector('.task-draft-card h3')).toBeNull();
  expect(view.textContent).not.toContain('审阅并编辑任务');
  expect(view.textContent).not.toContain('已进入 TODO');
  expect(client.run).not.toHaveBeenCalled();
});

it('keeps AI unavailable when unauthenticated and provides an explicit manual path', async () => {
  const { client, draftCall } = generationFixture({ unavailable: true });
  const view = mount(client);
  await vi.waitFor(() => expect(view.textContent).toContain('Codex 尚未登录'));
  expect(view.querySelector('.composer-model-status')).toBeNull();
  await typeMessage(view, '我先手工写验收条件');
  expect(button(view, '发送并整理').disabled).toBe(true);
  button(view, '发送并整理').click();
  expect(draftCall.mock.calls.filter(([call]) => call.type === 'draft.generate')).toHaveLength(0);
  button(view, '手工填写').click();
  await vi.waitFor(() => expect(view.querySelector('.draft-sheet[aria-label="任务草稿编辑"]')).not.toBeNull());
  expect(view.querySelector('.conversation-editor-header small')?.textContent).toBe('手工草稿');
  expect(draftCall).toHaveBeenCalledWith({ type: 'draft.manual', payload: {
    projectId, conversationId, sourceMessageId: expect.any(String), idempotencyKey: expect.any(String),
  } });
  expect(draftCall.mock.calls.filter(([call]) => call.type === 'draft.generate')).toHaveLength(0);
  expect(view.querySelector('.assistant-reply')).toBeNull();
});

it('retains the saved message after generation failure and retries without sending it twice', async () => {
  const { client, conversationCall, draftCall } = generationFixture({ firstRequestFails: true });
  const view = mount(client);
  await vi.waitFor(() => expect(view.querySelector('select')).not.toBeNull());
  await typeMessage(view, '给订单列表添加日期筛选');
  button(view, '发送并整理').click();
  await vi.waitFor(() => expect(view.querySelector('[role="alert"]')?.textContent).toContain('整理请求超时'));
  expect(view.querySelector('.conversation-message > p')?.textContent).toBe('给订单列表添加日期筛选');
  button(view, '用 AI 整理这条需求').click();
  await vi.waitFor(() => expect(view.querySelector<HTMLInputElement>('.draft-sheet input')?.value).toBe('订单日期筛选'));
  expect(conversationCall.mock.calls.filter(([call]) => call.type === 'conversation.send')).toHaveLength(1);
  const attempts = draftCall.mock.calls.filter(([call]) => call.type === 'draft.generate');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]![0].payload.sourceMessageId).toBe(attempts[0]![0].payload.sourceMessageId);
  expect(attempts[1]![0].payload.idempotencyKey).toBe(attempts[0]![0].payload.idempotencyKey);
});

it('uses the parent New Task drawer for review and returns focus to its draft card', async () => {
  const { client } = generationFixture();
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ setup: () => () => h(ForgeDrawer, { open: true, title: '新建任务' }, {
    default: () => h(ConversationPanel, { client, projectId }),
  }) });
  app.mount(root);
  await vi.waitFor(() => expect(document.body.querySelector('.conversation-composer textarea')).not.toBeNull());
  await typeMessage(document.body, '给订单列表添加日期筛选');
  button(document.body, '发送并整理').click();
  await vi.waitFor(() => expect(document.body.querySelector('.draft-sheet')).not.toBeNull());
  expect(document.body.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.body.querySelector('[role="dialog"] .draft-sheet[aria-label="任务草稿编辑"]')).not.toBeNull();
  expect(document.activeElement).toBe(document.body.querySelector('.conversation-editor-back'));
  document.body.querySelector<HTMLButtonElement>('.conversation-editor-back')!.click();
  await vi.waitFor(() => expect(document.body.querySelector('.conversation-composer')).not.toBeNull());
  expect(document.activeElement).toBe(button(document.body, '审阅并编辑任务'));
});
