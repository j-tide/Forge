/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPCResult, Task } from '../../../shared/types';
import { useTaskDetail } from './hooks/useTaskDetail';
import { TaskDetailModal } from './TaskDetailModal';

const { deleteTask, checkWorktreeChanges } = vi.hoisted(() => ({
  deleteTask: vi.fn(),
  checkWorktreeChanges: vi.fn(),
}));

vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector({
    projects: [], activeProjectId: null, selectedProjectId: null, getActiveProject: () => undefined,
  }),
}));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) => selector({ settings: { logOrder: 'chronological' } }),
}));
vi.mock('../../stores/task-store', () => ({
  deleteTask,
  checkTaskRunning: vi.fn(), hasRecentActivity: vi.fn(), isIncompleteHumanReview: () => false,
  getTaskProgress: () => ({ completed: 0, total: 0 }), useTaskStore: vi.fn(), loadTasks: vi.fn(),
  stopTask: vi.fn(), submitReview: vi.fn(), recoverStuckTask: vi.fn(), startTaskOrQueue: vi.fn(),
}));
vi.mock('../TaskEditDialog', () => ({ TaskEditDialog: () => null }));
vi.mock('./TaskMetadata', () => ({ TaskMetadata: () => null }));
vi.mock('./TaskReview', () => ({ TaskReview: () => null }));
vi.mock('./TaskSubtasks', () => ({ TaskSubtasks: () => null }));
vi.mock('./TaskLogs', () => ({ TaskLogs: () => null }));
vi.mock('./TaskFiles', () => ({ TaskFiles: () => null }));

const task: Task = {
  id: 'safe-delete', specId: 'safe-delete-spec', projectId: 'project', title: 'Preserve work until checked',
  description: 'Fixture', status: 'backlog', subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
};
type ChangesResult = IPCResult<{ hasChanges: boolean; worktreePath?: string; changedFileCount?: number }>;

function deferred() {
  let resolve!: (value: ChangesResult) => void;
  const promise = new Promise<ChangesResult>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  checkWorktreeChanges.mockReset();
  deleteTask.mockReset().mockResolvedValue({ success: true });
  window.electronAPI.checkWorktreeChanges = checkWorktreeChanges;
});
afterEach(cleanup);

describe('Task delete preflight safety', () => {
  it('cannot confirm while the worktree check is pending', async () => {
    const pending = deferred();
    checkWorktreeChanges.mockReturnValue(pending.promise);
    render(<TaskDetailModal open task={task} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('button', { name: 'Delete Permanently' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(deleteTask).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true, data: { hasChanges: false } }));
    expect(confirm).toBeEnabled();
  });

  it('shows check failure and retry instead of allowing an unchecked delete', async () => {
    checkWorktreeChanges.mockResolvedValueOnce({ success: false, error: 'Git status timed out' });
    render(<TaskDetailModal open task={task} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Git status timed out');
    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toBeDisabled();
    checkWorktreeChanges.mockResolvedValueOnce({ success: true, data: { hasChanges: true, changedFileCount: 2 } });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText("This task's worktree has 2 uncommitted file(s)")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toBeEnabled();
    expect(deleteTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Permanently' }));
    await waitFor(() => expect(deleteTask).toHaveBeenCalledExactlyOnceWith(task.id));
  });

  it('keeps failed deletion visible and can retry without automatically forcing cleanup', async () => {
    checkWorktreeChanges.mockResolvedValue({ success: true, data: { hasChanges: false } });
    deleteTask.mockResolvedValueOnce({ success: false, error: 'Owned worktree could not be removed' });
    const onOpenChange = vi.fn();
    render(<TaskDetailModal open task={task} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('button', { name: 'Delete Permanently' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    expect(await screen.findByRole('alert')).toHaveTextContent('Owned worktree could not be removed');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(deleteTask).toHaveBeenCalledExactlyOnceWith(task.id);
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(deleteTask).toHaveBeenCalledTimes(2);
    expect(deleteTask).toHaveBeenLastCalledWith(task.id);
  });

  it('blocks another confirmation while deletion is in progress', async () => {
    checkWorktreeChanges.mockResolvedValue({ success: true, data: { hasChanges: false } });
    const pending = deferred();
    deleteTask.mockReturnValue(pending.promise);
    render(<TaskDetailModal open task={task} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('button', { name: 'Delete Permanently' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(confirm);
    expect(deleteTask).toHaveBeenCalledExactlyOnceWith(task.id);
    await act(async () => pending.resolve({ success: false, error: 'Cleanup failed' }));
    expect(screen.getByRole('button', { name: 'Delete Permanently' })).toBeEnabled();
  });

  it.each([
    { success: true },
    { success: true, data: null },
    { success: true, data: { hasChanges: 'false' } },
  ])('rejects incomplete or invalid successful responses: %j', async (response) => {
    checkWorktreeChanges.mockResolvedValue(response);
    const { result } = renderHook(() => useTaskDetail({ task }));
    await act(async () => result.current.setShowDeleteDialog(true));
    await waitFor(() => expect(result.current.isCheckingChanges).toBe(false));
    expect(result.current.worktreeChangesInfo).toBeNull();
    expect(result.current.deleteCheckError).toBeTruthy();
  });

  it('surfaces transport rejection without leaking raw error details', async () => {
    checkWorktreeChanges.mockRejectedValue(new Error('secret internal path'));
    const { result } = renderHook(() => useTaskDetail({ task }));
    await act(async () => result.current.setShowDeleteDialog(true));
    await waitFor(() => expect(result.current.isCheckingChanges).toBe(false));
    expect(result.current.deleteCheckError).toBeTruthy();
    expect(result.current.deleteCheckError).not.toContain('secret internal path');
    expect(result.current.worktreeChangesInfo).toBeNull();
  });

  it('ignores a late response from a closed dialog when the next check is pending', async () => {
    const old = deferred();
    const current = deferred();
    checkWorktreeChanges.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result } = renderHook(() => useTaskDetail({ task }));
    await act(async () => result.current.setShowDeleteDialog(true));
    await act(async () => result.current.setShowDeleteDialog(false));
    await act(async () => result.current.setShowDeleteDialog(true));
    await act(async () => old.resolve({ success: true, data: { hasChanges: false } }));
    expect(result.current.isCheckingChanges).toBe(true);
    expect(result.current.worktreeChangesInfo).toBeNull();
    await act(async () => current.resolve({ success: true, data: { hasChanges: true, changedFileCount: 1 } }));
    expect(result.current.worktreeChangesInfo?.hasChanges).toBe(true);
  });

  it('does not reuse a successful check for a different task', async () => {
    const next = deferred();
    checkWorktreeChanges.mockResolvedValueOnce({ success: true, data: { hasChanges: false } }).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(({ selectedTask }) => useTaskDetail({ task: selectedTask }), { initialProps: { selectedTask: task } });
    await act(async () => result.current.setShowDeleteDialog(true));
    expect(result.current.worktreeChangesInfo?.hasChanges).toBe(false);
    rerender({ selectedTask: { ...task, id: 'second-task', specId: 'second-spec' } });
    expect(result.current.worktreeChangesInfo).toBeNull();
    expect(result.current.isCheckingChanges).toBe(true);
    expect(checkWorktreeChanges).toHaveBeenLastCalledWith('second-task');
    await act(async () => next.resolve({ success: false, error: 'Second check failed' }));
    expect(result.current.worktreeChangesInfo).toBeNull();
    expect(result.current.deleteCheckError).toBe('Second check failed');
  });
});
