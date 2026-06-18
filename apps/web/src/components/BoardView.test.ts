import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { BoardSnapshot } from '@forge/contracts';
import BoardView from './BoardView.vue';

let root: HTMLDivElement | null = null;
let app: VueApp | null = null;
const projectId = 'eb43cef0-4d07-4ef5-8a86-6d57eb8c16c0';
const now = '2026-09-24T00:00:00.000Z';
const task = (id: string, title: string, position: number): BoardSnapshot['tasks'][number] => ({
  id, projectId, title, state: 'todo', boardColumn: 'todo', revision: 1,
  contractRevision: 2, approvedRevision: 2, activeRunId: null, blockReason: null,
  allowedCommands: ['tasks.reorder'], priority: position ? 'high' : 'normal',
  executorId: null, position, createdAt: now,
});
const first = task('063210d2-7d24-4f16-9ad1-a2062f51a845', 'First real TODO', 0);
const second = task('1817c77f-9bd6-495e-9f85-b29e54a843de', 'Second real TODO', 1);

function mount(client: ForgeClient, connected = true): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(BoardView, { client, projectId, connected, refreshKey: 0 });
  app.mount(root); return root;
}
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe('Host-backed task board', () => {
  it('shows true counts, filters without mutation, and issues keyboard reorder via the fixed command', async () => {
    let board: BoardSnapshot = { projectId, tasks: [first, second], eventCursor: '2',
      boardRevision: 2, serverTime: now };
    const commands: unknown[] = [];
    const client = { board: vi.fn(async (command) => {
      commands.push(command);
      if (command.type === 'tasks.reorder') board = { ...board, tasks: [
        { ...second, position: 0 }, { ...first, position: 1 }],
        boardRevision: 3, eventCursor: '3' };
      return { commandId: crypto.randomUUID(), ok: true, data: board,
        durationMs: 1, hostTimestamp: now };
    }) } as unknown as ForgeClient;
    const element = mount(client);
    await vi.waitFor(() => expect(element.querySelectorAll('.board-task')).toHaveLength(2));
    expect(element.textContent).toContain('2 / 2');
    const priority = element.querySelector<HTMLSelectElement>('[aria-label="按优先级筛选"]')!;
    priority.value = 'high'; priority.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(element.querySelectorAll('.board-task')).toHaveLength(1);
    expect(board.tasks).toHaveLength(2);
    priority.value = 'all'; priority.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    const moveButton=element.querySelector<HTMLButtonElement>(
      '[aria-label="下移 First real TODO"]')!;
    const hashBefore=location.hash;
    moveButton.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    expect(location.hash).toBe(hashBefore);
    moveButton.click();
    await vi.waitFor(() => expect(element.querySelector('.board-task h3')?.textContent).toBe('Second real TODO'));
    expect(commands.at(-1)).toMatchObject({ type: 'tasks.reorder', payload: {
      projectId, taskId: first.id, expectedBoardRevision: 2,
      beforeTaskId: second.id, afterTaskId: null,
    } });
  });

  it('keeps Host-unavailable state read-only without stale cards', async () => {
    const client = { board: vi.fn() } as unknown as ForgeClient;
    const element = mount(client, false);
    await nextTick();
    expect(element.textContent).toContain('Host 不可用');
    expect(element.querySelectorAll('.board-task')).toHaveLength(0);
    expect(client.board).not.toHaveBeenCalled();
  });

  it('windows a long real snapshot instead of mounting every card', async () => {
    const tasks = Array.from({ length: 240 }, (_, index) => task(crypto.randomUUID(),
      `Large task ${index}`, index));
    const snapshot: BoardSnapshot = { projectId, tasks, eventCursor: '240', boardRevision: 240,
      serverTime: now };
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: snapshot, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const element = mount(client);
    await vi.waitFor(() => expect(element.textContent).toContain('240 项任务'));
    expect(element.querySelectorAll('.board-task').length).toBeLessThanOrEqual(9);
    expect(element.textContent).toContain('240 / 240');
  });
});
