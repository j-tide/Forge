import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { TaskDetailView } from '@forge/contracts';
import TaskDetailDrawer from './TaskDetailDrawer.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
const projectId = 'eb43cef0-4d07-4ef5-8a86-6d57eb8c16c0';
const taskId = '063210d2-7d24-4f16-9ad1-a2062f51a845';
const messageId = 'b99fe6ea-98f2-4608-917b-e8dcfe22c003';
const now = '2026-09-24T00:00:00.000Z';
const sourceRef = `message:${messageId}`;
const detail: TaskDetailView = {
  detail: { task: { id: taskId, projectId, title: 'Real TODO', state: 'todo',
    boardColumn: 'todo', revision: 1, contractRevision: 2, approvedRevision: 2,
    activeRunId: null, blockReason: null, allowedCommands: ['tasks.reorder'],
    priority: 'normal', executorId: null, position: 0, createdAt: now },
  contract: { schemaVersion: '1.0', taskId, projectId, revision: 2, title: 'Real TODO',
    type: 'feature', goal: 'Show approved requirements',
    acceptance: [{ id: 'ac1', statement: 'Trace each criterion', method: 'manual',
      required: true, sourceRefs: [sourceRef] }], constraints: ['Keep local'],
    scope: ['UI'], outOfScope: [], dependencies: [], openQuestions: [], assumptions: [],
    sourceRefs: [sourceRef], workflowRef: 'standard', priority: 'normal' },
  runIds: [], artifactIds: [], pendingApprovalIds: [] },
  sources: [{ ref: sourceRef, kind: 'message', status: 'available',
    text: 'Original user request', createdAt: now }],
};
function mount(client: ForgeClient): void {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(TaskDetailDrawer, { client, projectId, taskId, connected: true, open: true });
  app.mount(root);
}
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe('approved task detail', () => {
  it('loads the Host projection and opens the exact AC source', async () => {
    const board = vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true, data: detail,
      durationMs: 1, hostTimestamp: now }));
    mount({ board, run: vi.fn(async () => ({ ok:true, data:[] })) } as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.body.textContent).toContain('Trace each criterion'));
    expect(board).toHaveBeenCalledWith({ type: 'task.detail', payload: { projectId, taskId } });
    expect(document.body.textContent).toContain('Show approved requirements');
    expect(document.body.textContent).toContain('尚无 Run；批准任务不会自动开工');
    document.querySelector<HTMLButtonElement>('.task-detail-source-links button')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Original user request'));
  });

  it('labels an unresolved reference as withdrawn instead of inventing evidence', async () => {
    const unresolved = { ...detail, sources: [{ ...detail.sources[0],
      status: 'withdrawn' as const, text: null, createdAt: null }] };
    mount({ board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: unresolved, durationMs: 1, hostTimestamp: now })),
      run: vi.fn(async () => ({ ok:true, data:[] })) } as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.querySelector('.task-detail-source-links button')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('.task-detail-source-links button')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('来源已撤回或无法定位'));
  });
});
