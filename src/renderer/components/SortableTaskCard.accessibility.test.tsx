/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DndContext, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SortableTaskCard } from './SortableTaskCard';
import i18n from '../../shared/i18n';
import type { Task } from '../../shared/types';

const actions = vi.hoisted(() => ({
  startTaskOrQueue: vi.fn(), stopTask: vi.fn(), checkTaskRunning: vi.fn(),
  recoverStuckTask: vi.fn(), archiveTasks: vi.fn(),
  isIncompleteHumanReview: vi.fn(), hasRecentActivity: vi.fn(),
}));
vi.mock('../stores/task-store', () => actions);
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Rendered component fixture; no task state is persisted and no process runs.
const task: Task = {
  id: 'sortable-accessibility-fixture', specId: 'sortable-accessibility-fixture',
  projectId: 'component-test-project', title: 'Accessible running task',
  description: 'Synthetic UI fixture', status: 'in_progress', subtasks: [], logs: [],
  createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z'),
};

function Board({ currentTask, onClick, onStatusChange, onDragStart, onDragCancel }: {
  currentTask: Task;
  onClick: () => void;
  onStatusChange: (status: Task['status']) => void;
  onDragStart: () => void;
  onDragCancel?: () => void;
}) {
  const sensors = useSensors(useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return <DndContext sensors={sensors} onDragStart={onDragStart} onDragCancel={onDragCancel}>
    <SortableContext items={[currentTask.id]}>
      <SortableTaskCard task={currentTask} onClick={onClick} onStatusChange={onStatusChange} />
    </SortableContext>
  </DndContext>;
}

function wrapperFor(title: HTMLElement) {
  const wrapper = title.closest('[data-task-id]')?.parentElement;
  expect(wrapper).toBeInstanceOf(HTMLDivElement);
  return wrapper as HTMLDivElement;
}

function assertEnabledEntry(entry: HTMLElement) {
  expect(entry).toBeEnabled();
  expect(entry.closest('[aria-disabled="true"]')).toBeNull();
  expect(entry.closest('[inert]')).toBeNull();
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn();
  });
  actions.startTaskOrQueue.mockReset();
  actions.stopTask.mockReset();
  actions.checkTaskRunning.mockReset().mockResolvedValue(false);
  actions.recoverStuckTask.mockReset().mockResolvedValue({ success: true, autoRestarted: true });
  actions.archiveTasks.mockReset();
  actions.isIncompleteHumanReview.mockReset().mockReturnValue(false);
  actions.hasRecentActivity.mockReset().mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SortableTaskCard disabled dragging and native actions', () => {
  it.each([undefined, 'coding', 'rate_limit_paused', 'auth_failure_paused'] as const)(
    'keeps title, Stop and menu usable with execution phase %s while preventing keyboard dragging', async (phase) => {
      const onClick = vi.fn();
      const onStatusChange = vi.fn();
      const onDragStart = vi.fn();
      const currentTask: Task = {
        ...task,
        executionProgress: phase ? { phase, phaseProgress: 25, overallProgress: 25 } : undefined,
      };
      render(<Board currentTask={currentTask} onClick={onClick} onStatusChange={onStatusChange} onDragStart={onDragStart} />);

      const title = screen.getByRole('button', { name: task.title });
      const stop = screen.getByRole('button', { name: i18n.t('tasks:actions.stop') });
      const menu = screen.getByRole('button', { name: i18n.t('tasks:actions.taskActions') });
      for (const entry of [title, stop, menu]) assertEnabledEntry(entry);
      const wrapper = wrapperFor(title);
      expect(wrapper).not.toHaveAttribute('role');
      expect(wrapper).not.toHaveAttribute('tabindex');
      expect(wrapper).not.toHaveAttribute('aria-roledescription');
      fireEvent.keyDown(wrapper, { key: ' ', code: 'Space' });
      fireEvent.keyDown(wrapper, { key: 'Enter', code: 'Enter' });
      expect(onDragStart).not.toHaveBeenCalled();

      fireEvent.click(title);
      expect(onClick).toHaveBeenCalledOnce();
      fireEvent.click(stop);
      expect(actions.stopTask).toHaveBeenCalledExactlyOnceWith(task.id);
      expect(onClick).toHaveBeenCalledOnce();
      menu.focus();
      fireEvent.keyDown(menu, { key: 'ArrowDown', code: 'ArrowDown' });
      await screen.findByRole('menu');
      fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('tasks:columns.queue') }));
      expect(onStatusChange).toHaveBeenCalledExactlyOnceWith('queue');
      expect(onClick).toHaveBeenCalledOnce();
      expect(onDragStart).not.toHaveBeenCalled();
      expect(actions.startTaskOrQueue).not.toHaveBeenCalled();
    },
  );

  it('keeps a stuck task title, recovery and menu outside disabled draggable semantics', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const onClick = vi.fn();
    const onStatusChange = vi.fn();
    const onDragStart = vi.fn();
    render(<Board currentTask={task} onClick={onClick} onStatusChange={onStatusChange} onDragStart={onDragStart} />);
    const check = interval.mock.calls.find(([, delay]) => delay === 60_000)?.[0];
    expect(check).toBeTypeOf('function');
    await act(async () => { if (typeof check === 'function') check(); });
    const title = screen.getByRole('button', { name: task.title });
    const recover = await screen.findByRole('button', { name: i18n.t('tasks:actions.recover') });
    const menu = screen.getByRole('button', { name: i18n.t('tasks:actions.taskActions') });
    for (const entry of [title, recover, menu]) assertEnabledEntry(entry);
    fireEvent.keyDown(wrapperFor(title), { key: ' ', code: 'Space' });
    fireEvent.keyDown(wrapperFor(title), { key: 'Enter', code: 'Enter' });
    fireEvent.click(title);
    fireEvent.click(recover);
    await waitFor(() => expect(actions.recoverStuckTask).toHaveBeenCalledExactlyOnceWith(task.id, { autoRestart: true }));
    expect(onClick).toHaveBeenCalledOnce();
    menu.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown', code: 'ArrowDown' });
    await screen.findByRole('menu');
    fireEvent.click(screen.getByRole('menuitem', { name: i18n.t('tasks:columns.queue') }));
    expect(onStatusChange).toHaveBeenCalledExactlyOnceWith('queue');
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('retains real sortable attributes and keyboard drag activation for backlog tasks', async () => {
    const onClick = vi.fn();
    const onStatusChange = vi.fn();
    const onDragStart = vi.fn();
    const onDragCancel = vi.fn();
    const { rerender } = render(<Board currentTask={{ ...task, status: 'backlog' }} onClick={onClick} onStatusChange={onStatusChange} onDragStart={onDragStart} onDragCancel={onDragCancel} />);
    const title = screen.getByRole('button', { name: task.title });
    const wrapper = wrapperFor(title);
    expect(wrapper).toHaveAttribute('role', 'button');
    expect(wrapper).toHaveAttribute('tabindex', '0');
    expect(wrapper).toHaveAttribute('aria-disabled', 'false');
    expect(wrapper).toHaveAttribute('aria-roledescription', 'sortable');
    wrapper.focus();
    fireEvent.keyDown(wrapper, { key: ' ', code: 'Space' });
    await waitFor(() => expect(onDragStart).toHaveBeenCalledOnce());
    expect(onDragStart).toHaveBeenCalledWith(expect.objectContaining({ active: expect.objectContaining({ id: task.id }) }));
    // KeyboardSensor installs the document listener on the next event-loop turn.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(onDragCancel).toHaveBeenCalledOnce());

    rerender(<Board currentTask={{ ...task }} onClick={onClick} onStatusChange={onStatusChange} onDragStart={onDragStart} />);
    expect(wrapper).not.toHaveAttribute('aria-disabled');
    expect(wrapper).not.toHaveAttribute('role');
    fireEvent.keyDown(wrapper, { key: ' ', code: 'Space' });
    expect(onDragStart).toHaveBeenCalledOnce();
    assertEnabledEntry(screen.getByRole('button', { name: i18n.t('tasks:actions.stop') }));
  });
});
