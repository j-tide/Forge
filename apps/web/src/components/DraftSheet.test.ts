import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import DraftSheet from './DraftSheet.vue';

const projectId = 'b7623124-2164-4557-ad77-c82dd2b3efb8';
const draftId = '063210d2-7d24-4f16-9ad1-a2062f51a845';
const messageId = '66f01055-7f80-4f58-9458-1e6e64153080';
const question = 'Should whitespace-only email also be rejected?';
const now = new Date().toISOString();
const item = {
  draftId, projectId, conversationId: '8c92e8c4-c05c-45f3-a2df-3d6678086b90',
  sourceMessageId: messageId, revision: 1, createdAt: now, updatedAt: now,
  intent: 'new_task' as const, status: 'needs_clarification' as const,
  editableText: 'Reject empty email', errorCode: null, modelProvider: 'codex',
  contract: {
    schemaVersion: '1.0' as const, taskId: draftId, projectId, revision: 1,
    title: 'Validate email', type: 'bug' as const, goal: 'Reject empty email',
    acceptance: [{ id: 'AC-1', statement: 'Empty email fails',
      method: 'automated' as const, required: true, sourceRefs: [`message:${messageId}`] }],
    constraints: [], scope: [], outOfScope: [], dependencies: [],
    openQuestions: [question], assumptions: [], sourceRefs: [`message:${messageId}`],
    workflowRef: 'standard', priority: 'normal' as const,
  },
};
let app: VueApp | undefined;
let root: HTMLDivElement | undefined;
afterEach(() => { app?.unmount(); root?.remove(); app = undefined; root = undefined; });

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  const name = [...document.body.querySelectorAll('label')].find((node) =>
    node.textContent?.trim() === label);
  const input = name?.htmlFor ? document.getElementById(name.htmlFor) : null;
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing field ${label}`);
  }
  return input;
}
function fill(label: string, value: string): void {
  const input = field(label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function click(name: string): void {
  const button = [...document.body.querySelectorAll('button')].find((entry) =>
    entry.textContent?.includes(name));
  if (!button) throw new Error(`Missing button ${name}`);
  button.click();
}

it('requires a clarification answer to change the Task Contract before revision save', async () => {
  const revise = vi.fn(async (command: { payload: { contract: typeof item.contract } }) => ({
    commandId: crypto.randomUUID(), ok: true, durationMs: 0, hostTimestamp: now,
    data: { ...item, revision: 2, status: 'proposed', contract: command.payload.contract },
  }));
  const client = {
    draft: vi.fn(async (command: { type: string }) => command.type === 'draft.history' ?
      { ok: true, data: [] } : revise(command as never)),
    approval: vi.fn(async () => ({ ok: true, data: null })),
  } as unknown as ForgeClient;
  root = document.createElement('div'); document.body.append(root);
  app = createApp(DraftSheet, { open: true, item, client, projectId, messages: [] });
  app.mount(root);
  await nextTick();
  fill('你的回答（留空则仍阻塞批准）', 'Yes, whitespace-only email is invalid.');
  fill('本次用户决定 / 修改原因', 'Clarified whitespace-only email');
  await nextTick();
  click('保存新 revision');
  await vi.waitFor(() => expect(document.body.textContent).toContain(
    '请把澄清答案写入目标、验收条件或其他正式合同字段'));
  expect(revise).not.toHaveBeenCalled();

  fill('目标', 'Reject empty and whitespace-only email');
  await nextTick();
  click('保存新 revision');
  await vi.waitFor(() => expect(revise).toHaveBeenCalledOnce());
  const sent = revise.mock.calls[0]![0];
  expect(sent.payload.contract.goal).toBe('Reject empty and whitespace-only email');
  expect(sent.payload.contract.openQuestions).toEqual([]);
  expect(root?.querySelector('.draft-sheet[aria-label="任务草稿编辑"]')).not.toBeNull();
});

it('saves an explicitly selected published workflow reference in the Task revision', async () => {
  const revise = vi.fn(async (command: { payload: { contract: typeof item.contract } }) => ({
    commandId: crypto.randomUUID(), ok: true, durationMs: 0, hostTimestamp: now,
    data: { ...item, revision: 2, status: 'proposed', contract: command.payload.contract },
  }));
  const client = {
    listWorkflows: vi.fn(async () => [{
      workflowId: 'workflow.planned', publishedRevision: 1,
      draft: { name: '标准研发流程' },
    }]),
    draft: vi.fn(async (command: { type: string }) => command.type === 'draft.history' ?
      { ok: true, data: [] } : revise(command as never)),
    approval: vi.fn(async () => ({ ok: true, data: null })),
  } as unknown as ForgeClient;
  root = document.createElement('div'); document.body.append(root);
  app = createApp(DraftSheet, { open: true, item, client, projectId, messages: [] });
  app.mount(root);
  await vi.waitFor(() => expect(client.listWorkflows).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(document.body.textContent).toContain('已发布 v1'));
  expect(document.body.querySelector('.workflow-choice-summary')?.textContent)
    .toContain('不运行 Planner');
  const label = [...document.body.querySelectorAll('label')].find((node) =>
    node.textContent?.includes('研发流程'));
  const select = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
  if (!(select instanceof HTMLSelectElement)) throw new Error('Missing workflow selector');
  select.value = 'workflow.planned';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  expect(document.body.querySelector('.workflow-choice-summary')?.textContent)
    .toContain('已发布流程');
  fill('目标', 'Reject empty and whitespace-only email');
  fill('本次用户决定 / 修改原因', 'Selected published planning workflow');
  await nextTick();
  click('保存新 revision');
  await vi.waitFor(() => expect(revise).toHaveBeenCalledOnce());
  expect(revise.mock.calls[0]![0].payload.contract.workflowRef).toBe('workflow.planned');
});

it('keeps scope confirmation visible after collapsing secondary fields', async () => {
  const revise = vi.fn(async () => ({ ok: true, data: item }));
  const client = {
    listWorkflows: vi.fn(async () => []),
    draft: vi.fn(async (command: { type: string }) => command.type === 'draft.history' ?
      { ok: true, data: [] } : revise()),
    approval: vi.fn(async () => ({ ok: true, data: null })),
  } as unknown as ForgeClient;
  root = document.createElement('div'); document.body.append(root);
  app = createApp(DraftSheet, { open: true, item, client, projectId, messages: [] });
  app.mount(root);
  await nextTick();
  const fields = root.querySelector<HTMLDetailsElement>('.draft-sheet-secondary');
  expect(fields?.querySelector('summary')?.textContent).toContain('范围与约束');
  fields!.open = true;
  fill('提议范围（每行一项，变更需确认）', 'Email form');
  fields!.open = false;
  await nextTick();
  expect(root.textContent).toContain('我确认范围变化');
  expect(root.querySelector('.draft-sheet-confirmations')).not.toBeNull();
  fill('本次用户决定 / 修改原因', 'Clarified scope');
  click('保存新 revision');
  await vi.waitFor(() => expect(root?.textContent).toContain('范围变化需要明确确认'));
  expect(revise).not.toHaveBeenCalled();
});

it('only requests and decides approval after explicit actions, without starting a run', async () => {
  const approvable = { ...item, status: 'proposed' as const,
    contract: { ...item.contract, openQuestions: [] } };
  const request = { schemaVersion: '1.0', approvalId: 'approval-1', projectId, taskId: null,
    kind: 'task', expectedRevision: 1, scopeHash: 'a'.repeat(64), snapshotId: null,
    actionDigest: 'b'.repeat(64), requestedBy: 'local-user', expiresAt: now,
    summary: 'Validate email', risk: 'low', requiredScope: 'task:approve' };
  const pending = { request, draftId, status: 'pending', decision: null, taskState: null,
    createdAt: now, decidedAt: null };
  const approval = vi.fn(async (command: { type: string; payload: { decision?: unknown } }) => ({
    ok: true, data: command.type === 'approval.forDraft' ? null :
      command.type === 'approval.request' ? pending : {
        ...pending, status: 'approved', decision: command.payload.decision,
        taskState: 'todo', decidedAt: now,
      },
  }));
  const run = vi.fn();
  const client = {
    listWorkflows: vi.fn(async () => []),
    draft: vi.fn(async () => ({ ok: true, data: [] })),
    approval, run,
  } as unknown as ForgeClient;
  root = document.createElement('div'); document.body.append(root);
  app = createApp(DraftSheet, { open: true, item: approvable, client, projectId, messages: [] });
  app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain('提交审批请求'));
  expect(approval.mock.calls.map(([command]) => command.type)).toEqual(['approval.forDraft']);
  click('提交审批请求');
  await vi.waitFor(() => expect(root?.textContent).toContain('批准并加入 TODO'));
  expect(approval.mock.calls[1]?.[0]).toEqual({ type: 'approval.request', payload: {
    projectId, draftId, expectedRevision: 1,
  } });
  const confirm = root.querySelector<HTMLInputElement>('[aria-label="任务审批"] input[type="checkbox"]');
  expect(confirm).not.toBeNull();
  confirm!.checked = true;
  confirm!.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  click('批准并加入 TODO');
  await vi.waitFor(() => expect(approval.mock.calls.some(([command]) => command.type === 'approval.decide')).toBe(true));
  expect(approval.mock.calls[2]?.[0]).toEqual({ type: 'approval.decide', payload: {
    projectId, decision: { schemaVersion: '1.0', approvalId: 'approval-1', decision: 'approve',
      expectedRevision: 1, scopeHash: 'a'.repeat(64), reason: '' },
  } });
  expect(run).not.toHaveBeenCalled();
});
