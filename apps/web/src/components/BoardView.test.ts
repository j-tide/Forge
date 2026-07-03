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

function mount(client: ForgeClient, connected = true, readOnly = false,
  activeProjectId: string | null = projectId,
  listeners: { onChooseProject?: () => void; onNewTask?: () => void } = {}): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(BoardView, { client, projectId: activeProjectId, connected,
    refreshKey: 0, readOnly, ...listeners });
  app.mount(root); return root;
}
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe('Host-backed task board', () => {
  it('offers one real new-task action only after the Host confirms an empty project', async () => {
    const snapshot: BoardSnapshot = { projectId, tasks: [], eventCursor: '0',
      boardRevision: 0, serverTime: now };
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: snapshot, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const onNewTask = vi.fn();
    const element = mount(client, true, false, projectId, { onNewTask });
    expect(element.querySelector('.board-empty-workspace--tasks')).toBeNull();
    await vi.waitFor(() => expect(element.querySelector('.board-empty-workspace--tasks')).not.toBeNull());
    expect(element.querySelector('.board-toolbar')).toBeNull();
    expect(element.querySelector('.board-columns')).toBeNull();
    expect(element.querySelectorAll('.board-task')).toHaveLength(0);
    expect(element.querySelectorAll('.board-empty-workspace h3')).toHaveLength(1);
    expect(element.querySelector('.board-empty-workspace h3')?.textContent).toContain('还没有任务');
    const action = element.querySelector<HTMLButtonElement>('.board-empty-workspace button');
    expect(action?.textContent?.trim()).toBe('新建任务');
    expect(element.querySelectorAll('.board-empty-workspace button')).toHaveLength(1);
    action!.click();
    expect(onNewTask).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(client.board).toHaveBeenCalledTimes(1);
  });

  it('offers project selection without inventing counts or empty lanes', async () => {
    const client = { board: vi.fn() } as unknown as ForgeClient;
    const onChooseProject = vi.fn();
    const element = mount(client, true, false, null, { onChooseProject });
    await nextTick();
    expect(element.querySelector('.board-empty-workspace--project')).not.toBeNull();
    expect(element.querySelectorAll('.board-empty-workspace h3')).toHaveLength(1);
    expect(element.querySelector('.board-columns')).toBeNull();
    expect(element.querySelectorAll('.board-task')).toHaveLength(0);
    expect(element.querySelectorAll('.board-column-count')).toHaveLength(0);
    const action = element.querySelector<HTMLButtonElement>('.board-empty-workspace button');
    expect(action?.textContent?.trim()).toBe('选择项目');
    expect(element.querySelectorAll('.board-empty-workspace button')).toHaveLength(1);
    action!.click();
    expect(onChooseProject).toHaveBeenCalledTimes(1);
    expect(element.textContent).not.toContain('0 项任务');
    expect(element.querySelector('.board-toolbar')).toBeNull();
    expect(client.board).not.toHaveBeenCalled();
  });

  it('does not offer project selection while the Host is disconnected', async () => {
    const client = { board: vi.fn() } as unknown as ForgeClient;
    const onChooseProject = vi.fn();
    const element = mount(client, false, false, null, { onChooseProject });
    await nextTick();
    expect(element.textContent).toContain('Host 不可用');
    expect(element.querySelector('.board-columns')).toBeNull();
    const action = element.querySelector<HTMLButtonElement>('.board-empty-workspace button');
    expect(action?.disabled).toBe(true);
    action!.click();
    expect(onChooseProject).not.toHaveBeenCalled();
    expect(client.board).not.toHaveBeenCalled();
  });

  it('shows an empty read-only dataset without offering a write action', async () => {
    const snapshot: BoardSnapshot = { projectId, tasks: [], eventCursor: '0',
      boardRevision: 0, serverTime: now };
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: snapshot, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const onNewTask = vi.fn();
    const element = mount(client, true, true, projectId, { onNewTask });
    await vi.waitFor(() => expect(element.querySelector('.board-empty-workspace--tasks')).not.toBeNull());
    expect(element.textContent).toContain('只读');
    expect(element.querySelector('.board-empty-workspace button')).toBeNull();
    expect(element.querySelector('.board-columns')).toBeNull();
    expect(onNewTask).not.toHaveBeenCalled();
  });

  it('does not claim an empty board or a zero count when loading fails, and supports retry', async () => {
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: false,
      error: { code: 'DATABASE_BUSY', message: '数据库暂时不可用', retryable: true,
        correlationId: 'read-failure' }, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const element = mount(client);
    await vi.waitFor(() => expect(element.querySelector('[role="alert"]')?.textContent)
      .toContain('数据库暂时不可用'));
    expect(element.textContent).not.toContain('还没有任务');
    expect(element.textContent).not.toContain('0 项任务');
    expect(element.querySelector('.board-empty-workspace')).toBeNull();
    expect(element.querySelector('.board-toolbar')).toBeNull();
    expect(element.querySelector('.board-columns')).toBeNull();
    [...element.querySelectorAll('button')].find((button) => button.textContent?.trim() === '重试')!.click();
    await vi.waitFor(() => expect(client.board).toHaveBeenCalledTimes(2));
  });

  it('describes completed, blocked and acceptance tasks without inventing running activity', async () => {
    const snapshot: BoardSnapshot = { projectId, tasks: [
      { ...first, state: 'done', boardColumn: 'done' },
      { ...second, state: 'awaiting_acceptance', boardColumn: 'verify' },
      { ...task(crypto.randomUUID(), 'Blocked task', 2), state: 'blocked',
        boardColumn: 'development', blockReason: '等待补充权限' },
    ], eventCursor: '3', boardRevision: 3, serverTime: now };
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: snapshot, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const element = mount(client);
    await vi.waitFor(() => expect(element.querySelectorAll('.board-task')).toHaveLength(3));
    expect(element.querySelectorAll('.board-column')).toHaveLength(5);
    expect(element.querySelector('.board-empty-workspace')).toBeNull();
    expect(element.querySelector(`[data-task-id="${first.id}"] p`)?.textContent).toBe('已完成验收');
    expect(element.querySelector(`[data-task-id="${second.id}"] p`)?.textContent).toBe('等待你验收');
    expect(element.textContent).toContain('等待补充权限');
    expect(element.textContent).not.toContain('真实开发运行中');
    expect(element.querySelector(`[data-task-id="${first.id}"] .board-task-next`)?.textContent).toContain('查看交付');
    expect(element.querySelector(`[data-task-id="${second.id}"] .board-task-next`)?.textContent).toContain('查看验收');
    expect(element.textContent).not.toContain('100%');
  });

  it('keeps filtering recoverable when no tasks match without suggesting the project is empty', async () => {
    const snapshot: BoardSnapshot = { projectId, tasks: [first], eventCursor: '1',
      boardRevision: 1, serverTime: now };
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: snapshot, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const element = mount(client);
    await vi.waitFor(() => expect(element.querySelectorAll('.board-task')).toHaveLength(1));
    const search = element.querySelector<HTMLInputElement>('.board-toolbar input')!;
    search.value = 'not a matching task';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(element.textContent).toContain('没有符合筛选条件的任务');
    expect(element.textContent).not.toContain('还没有任务');
    expect(element.querySelector('.board-toolbar')).not.toBeNull();
    [...element.querySelectorAll('button')].find((button) => button.textContent?.trim() === '清除筛选')!.click();
    await nextTick();
    expect(element.querySelectorAll('.board-task')).toHaveLength(1);
    expect(client.board).toHaveBeenCalledTimes(1);
  });

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
    const createActions = [...element.querySelectorAll<HTMLButtonElement>('[aria-label="新建任务"]')];
    expect(createActions).toHaveLength(0);
    expect(element.querySelector('[data-column="todo"] .board-column-count')?.textContent).toBe('2');
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
    expect(element.textContent).not.toContain('还没有任务');
    expect(element.textContent).not.toContain('0 项任务');
    expect(element.querySelectorAll('.board-task')).toHaveLength(0);
    expect(client.board).not.toHaveBeenCalled();
  });

  it('keeps a read-only dataset browsable without creation, start labels or reorder controls', async () => {
    const snapshot: BoardSnapshot = { projectId, tasks: [first], eventCursor: '1',
      boardRevision: 1, serverTime: now };
    const client = { board: vi.fn(async () => ({ commandId: crypto.randomUUID(), ok: true,
      data: snapshot, durationMs: 1, hostTimestamp: now })) } as unknown as ForgeClient;
    const element = mount(client, true, true);
    await vi.waitFor(() => expect(element.querySelectorAll('.board-task')).toHaveLength(1));
    expect(element.querySelector('[aria-label="新建任务"]')).toBeNull();
    expect(element.querySelector('.board-card-actions')).toBeNull();
    expect(element.querySelector('.board-task-next')?.textContent).toContain('查看记录');
    expect(element.querySelector('.board-task-next')?.getAttribute('aria-label')).toBe(`查看记录：${first.title}`);
    expect(element.querySelector('.board-task')?.getAttribute('draggable')).toBe('false');
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
    expect(element.querySelector('[data-column="todo"] .board-column-count')?.textContent).toBe('240');
  });
});
