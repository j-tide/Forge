import { afterEach, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import KnowledgeView from './KnowledgeView.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });
function mount(client: object, desktop: boolean, connected: boolean,
  projectId: string | null): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(KnowledgeView, { client, desktop, connected, projectId });
  app.mount(root);
  return root;
}

it('ordinary Web does not invoke the local knowledge bridge', () => {
  const listKnowledge = vi.fn();
  const view = mount({ listKnowledge }, false, false, null);
  expect(view.textContent).toContain('普通 Web 不访问本机项目资料');
  expect(listKnowledge).not.toHaveBeenCalled();
});

it('shows actual Host source and its stored line citation without executing scripts', async () => {
  const source = {
    sourceId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    relativePath: 'docs/guide.md', version: 1, contentHash: 'a'.repeat(64),
    status: 'active', byteSize: 22, chunkCount: 1,
    createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z',
  };
  const listKnowledge = vi.fn().mockResolvedValue([source]);
  const knowledgeChunk = vi.fn().mockResolvedValue({
    sourceId: source.sourceId, projectId: source.projectId, version: 1, ordinal: 0,
    startLine: 1, endLine: 2, heading: 'Guide', text: '# Guide\nReal source\n',
    contentHash: 'b'.repeat(64), sourceRef: `knowledge:${source.sourceId}@1#0`,
    status: 'active',
  });
  const importKnowledge = vi.fn();
  const view = mount({ listKnowledge, knowledgeChunk, importKnowledge,
    listMemories: async () => [] }, true, true,
    source.projectId);
  await vi.waitFor(() => expect(view.textContent).toContain('docs/guide.md'));
  [...view.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('查看原文定位'))?.click();
  await vi.waitFor(() => expect(view.textContent).toContain('# Guide'));
  expect(view.textContent).toContain('第 1–2 行');
  expect(importKnowledge).not.toHaveBeenCalled();
});

it('shows scoped Host search citations and an honest empty result', async () => {
  const projectId = '22222222-2222-4222-8222-222222222222';
  const environmentId = '33333333-3333-4333-8333-333333333333';
  const searchKnowledge = vi.fn().mockResolvedValueOnce({
    indexVersion: 'forge-knowledge-search/v1-fts5-trigram-cjk-short',
    results: [{ sourceId: '11111111-1111-4111-8111-111111111111', projectId,
      version: 1, ordinal: 0, startLine: 1, endLine: 2, heading: '日期筛选',
      text: '日期筛选 start_date', contentHash: 'a'.repeat(64),
      sourceRef: 'knowledge:11111111-1111-4111-8111-111111111111@1#0',
      status: 'active' }],
  }).mockResolvedValueOnce({ indexVersion: 'forge-knowledge-search/v1-fts5-trigram-cjk-short',
    results: [] });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(KnowledgeView, { client: { listKnowledge: async () => [],
    listMemories: async () => [], searchKnowledge },
    desktop: true, connected: true, projectId, environmentId });
  app.mount(root);
  const input = root.querySelector<HTMLInputElement>('input[placeholder="日期筛选 start_date"]');
  expect(input).not.toBeNull();
  input!.value = '日期筛选 start_date'; input!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect([...root!.querySelectorAll('button')].find((button) =>
    button.textContent?.trim() === '检索')?.disabled).toBe(false));
  [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === '检索')?.click();
  await vi.waitFor(() => expect(root?.textContent).toContain('knowledge:11111111'));
  expect(searchKnowledge).toHaveBeenCalledWith(projectId, environmentId, '日期筛选 start_date');
  [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === '检索')?.click();
  await vi.waitFor(() => expect(root?.textContent).toContain('没有匹配的资料'));
});

it('requires an explicit reason before promoting and revoking real Host memory', async () => {
  const projectId = '22222222-2222-4222-8222-222222222222';
  const environmentId = '33333333-3333-4333-8333-333333333333';
  const memoryId = '44444444-4444-4444-8444-444444444444';
  const base = { memoryId, projectId, environmentId, scope: 'environment',
    kind: 'project_convention', subjectKey: 'date.filtering',
    sources: [{ sourceRef: 'knowledge:11111111-1111-4111-8111-111111111111@1#0',
      sourceHash: 'a'.repeat(64) }], contentHash: 'b'.repeat(64),
    expiresAt: null, lastVerifiedAt: null,
    createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' };
  let memory = { ...base, text: 'date filtering uses start_date', status: 'candidate', revision: 1 };
  const listMemories = vi.fn(async () => [memory]);
  const decideMemory = vi.fn(async (payload: { decision: string }) => {
    memory = { ...memory, status: payload.decision === 'validate' ? 'validated' : 'revoked',
      revision: memory.revision + 1, text: payload.decision === 'revoke' ? '' : memory.text };
    return memory;
  });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(KnowledgeView, { client: { listKnowledge: async () => [],
    listMemories, decideMemory }, desktop: true, connected: true, projectId, environmentId });
  app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain('date.filtering'));
  const click = (label: string): void => {
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.trim() === label)?.click();
  };
  click('确认记忆');
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  expect(decideMemory).not.toHaveBeenCalled();
  const reason = document.querySelector<HTMLInputElement>('input[placeholder="说明为何当前来源适用"]');
  expect(reason).not.toBeNull();
  reason!.value = 'Source is current and the owner confirmed it';
  reason!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === '确认此决定')?.disabled).toBe(false));
  click('确认此决定');
  await vi.waitFor(() => expect(decideMemory).toHaveBeenCalledWith(expect.objectContaining({
    projectId, memoryId, decision: 'validate', confirmed: true, expectedRevision: 1,
  })));
  await vi.waitFor(() => expect(root?.textContent).toContain('已确认'));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  click('撤销记忆');
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  const revokeReason = document.querySelector<HTMLInputElement>('input[placeholder="说明为何当前来源适用"]');
  revokeReason!.value = 'Owner withdraws this project memory now';
  revokeReason!.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === '确认此决定')?.disabled).toBe(false));
  click('确认此决定');
  await vi.waitFor(() => expect(decideMemory).toHaveBeenCalledWith(expect.objectContaining({
    projectId, memoryId, decision: 'revoke', confirmed: true, expectedRevision: 2,
  })));
  await vi.waitFor(() => expect(root?.textContent).toContain('正文已撤销'));
});
