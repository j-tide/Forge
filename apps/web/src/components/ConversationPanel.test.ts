import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import ConversationPanel from './ConversationPanel.vue';

const projectId = 'b7623124-2164-4557-ad77-c82dd2b3efb8';
const conversationId = '8c92e8c4-c05c-45f3-a2df-3d6678086b90';
const now = new Date().toISOString();
let root: HTMLDivElement | undefined;
let app: VueApp | undefined;

function mount(client: ForgeClient): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ConversationPanel, { client, projectId }); app.mount(root);
  return root;
}
afterEach(() => { app?.unmount(); root?.remove(); app = undefined; root = undefined; });

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
  [...view.querySelectorAll('button')].find((button) => button.textContent?.includes('保存输入'))?.click();
  await vi.waitFor(() => expect(view.textContent).toContain('Host unavailable'));
  expect(input!.value).toBe('Please keep this exact text');
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
  [...view.querySelectorAll('button')].find((button) => button.textContent?.includes('识别控制提议'))!.click();
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
  await vi.waitFor(() => expect(view.textContent).toContain('Initial draft'));
  [...view.querySelectorAll('button')].find((button) => button.textContent?.includes('识别控制提议'))!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('选择一个未批准草稿'));
  [...document.body.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('编辑 手工草稿'))!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('Task Draft · 编辑与澄清'));
  expect(client.draft).toHaveBeenCalledWith({ type: 'draft.list', payload: {
    projectId, conversationId,
  } });
});
