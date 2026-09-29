/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import i18n from '../../shared/i18n';
import type { Task } from '../../shared/types';

const { taskActions, toast } = vi.hoisted(() => ({
  taskActions: {
    startTaskOrQueue: vi.fn(),
    stopTask: vi.fn(),
    checkTaskRunning: vi.fn(),
    recoverStuckTask: vi.fn(),
    archiveTasks: vi.fn(),
    isIncompleteHumanReview: vi.fn(),
    hasRecentActivity: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('../stores/task-store', () => taskActions);
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

// Isolated component fixture; no task is persisted and no executor runs.
const task: Task = {
  id: 'task-card-action-failure',
  specId: 'task-card-action-failure',
  projectId: 'component-test-project',
  title: 'Retry unsuccessful task actions',
  description: 'Component fixture for action feedback.',
  status: 'in_progress',
  subtasks: [],
  logs: [],
  createdAt: new Date('2026-09-28T00:00:00Z'),
  updatedAt: new Date('2026-09-28T00:00:00Z'),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function renderStuckTask(onClick = vi.fn()) {
  const interval = vi.spyOn(globalThis, 'setInterval');
  render(<TaskCard task={task} onClick={onClick} />);
  // Invoke the production safety check without delaying the test a minute.
  const check = interval.mock.calls.find(([, delay]) => delay === 60_000)?.[0];
  expect(check).toBeTypeOf('function');
  await act(async () => { if (typeof check === 'function') check(); });
  expect(await screen.findByRole('button', { name: 'Recover' })).toBeEnabled();
}

beforeEach(() => {
  // jsdom has no viewport observer; keep the real progress component mounted.
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  });
  taskActions.checkTaskRunning.mockReset().mockResolvedValue(false);
  taskActions.recoverStuckTask.mockReset().mockResolvedValue({ success: true, autoRestarted: true });
  taskActions.archiveTasks.mockReset().mockResolvedValue({ success: true });
  taskActions.startTaskOrQueue.mockReset();
  taskActions.stopTask.mockReset();
  taskActions.isIncompleteHumanReview.mockReset().mockReturnValue(false);
  taskActions.hasRecentActivity.mockReset().mockReturnValue(false);
  toast.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TaskCard recovery feedback', () => {
  it.each([
    { label: 'returned failure', result: { success: false, message: 'Workspace lease is still held' }, rejected: false, message: 'Workspace lease is still held' },
    { label: 'returned failure without a message', result: { success: false }, rejected: false, message: undefined },
    { label: 'transport error', result: new Error('Recovery connection interrupted'), rejected: true, message: 'Recovery connection interrupted' },
    { label: 'unknown transport failure', result: null, rejected: true, message: undefined },
  ])('shows $label, keeps recovery available and permits a successful retry', async ({ result, rejected, message }) => {
    const pending = deferred<unknown>();
    taskActions.recoverStuckTask.mockReturnValueOnce(pending.promise);
    const openDetails = vi.fn();
    await renderStuckTask(openDetails);

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
    expect(openDetails).not.toHaveBeenCalled();
    const recovering = screen.getByRole('button', { name: 'Recovering...' });
    expect(recovering).toBeDisabled();
    fireEvent.click(recovering);
    expect(taskActions.recoverStuckTask).toHaveBeenCalledExactlyOnceWith(task.id, { autoRestart: true });

    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(result);
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('uiTasks:errors.recoverFailed'),
      description: message ?? i18n.t('uiTasks:errors.recoverFailed'),
      variant: 'destructive',
    });
    expect(screen.getByText('Stuck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recover' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recover' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Recovering...' })).not.toBeInTheDocument();
    expect(screen.queryByText('Stuck')).not.toBeInTheDocument();
    expect(taskActions.recoverStuckTask).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('explains recovery without an automatic restart instead of claiming execution resumed', async () => {
    const message = 'Task state recovered, but Git is unavailable for automatic restart';
    taskActions.recoverStuckTask.mockResolvedValue({ success: true, autoRestarted: false, message });
    await renderStuckTask();

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
    await waitFor(() => expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('uiTasks:notifications.taskRecovered'),
      description: message,
      variant: 'default',
    }));
    expect(screen.queryByText('Stuck')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recovering...' })).not.toBeInTheDocument();
    expect(taskActions.startTaskOrQueue).not.toHaveBeenCalled();
  });
});

describe('TaskCard archive feedback', () => {
  it.each([
    { label: 'returned failure', result: { success: false, error: 'Task archive is unavailable' }, rejected: false, message: 'Task archive is unavailable' },
    { label: 'returned failure without a message', result: { success: false }, rejected: false, message: undefined },
    { label: 'transport error', result: new Error('Archive connection interrupted'), rejected: true, message: 'Archive connection interrupted' },
    { label: 'unknown transport failure', result: null, rejected: true, message: undefined },
  ])('shows $label and keeps the task available for retry', async ({ result, rejected, message }) => {
    const pending = deferred<unknown>();
    taskActions.archiveTasks.mockReturnValueOnce(pending.promise);
    const openDetails = vi.fn();
    render(<TaskCard task={{ ...task, status: 'done' }} onClick={openDetails} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive task' }));
    expect(screen.getByRole('button', { name: 'Archive task' })).toBeDisabled();
    expect(openDetails).not.toHaveBeenCalled();
    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(result);
    });

    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('tasks:kanban.archiveFailed'),
      description: message ?? i18n.t('tasks:kanban.archiveFailed'),
      variant: 'destructive',
    });
    const archive = screen.getByRole('button', { name: 'Archive task' });
    expect(archive).toBeEnabled();
    fireEvent.click(archive);
    await waitFor(() => expect(archive).toBeEnabled());
    expect(taskActions.archiveTasks).toHaveBeenCalledTimes(2);
    expect(taskActions.archiveTasks).toHaveBeenLastCalledWith(task.projectId, [task.id]);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('guards duplicate archive requests when PR controls are present: %s', async (hasPR) => {
    const pending = deferred<unknown>();
    taskActions.archiveTasks.mockReturnValueOnce(pending.promise);
    const completedTask: Task = {
      ...task, status: 'done',
      metadata: hasPR ? { prUrl: 'https://example.invalid/fixture/pr/1' } : undefined,
    };
    const { rerender } = render(<TaskCard task={completedTask} onClick={vi.fn()} />);
    const archive = screen.getByRole('button', { name: 'Archive task' });
    fireEvent.click(archive);
    expect(archive).toBeDisabled();
    expect(archive).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(archive);
    expect(taskActions.archiveTasks).toHaveBeenCalledExactlyOnceWith(task.projectId, [task.id]);

    await act(async () => pending.resolve({ success: true }));
    expect(archive).toBeEnabled();
    expect(archive).toHaveAttribute('aria-busy', 'false');
    expect(toast).not.toHaveBeenCalled();
    // The card only reflects an acknowledged store update, never archives itself.
    rerender(<TaskCard task={{ ...completedTask, metadata: { ...completedTask.metadata, archivedAt: '2026-09-28T01:00:00Z' } }} onClick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Archive task' })).not.toBeInTheDocument();
  });
});
