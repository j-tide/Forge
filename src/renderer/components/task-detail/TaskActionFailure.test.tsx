/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n';
import type { ExecutionPhase, IPCResult, Task, WorktreeStatus } from '../../../shared/types';
import { TaskDetailModal } from './TaskDetailModal';

const { submitReview, recoverStuckTask, checkTaskRunning, discardWorktree, resumePausedTask, getWorktreeStatus, toast } = vi.hoisted(() => ({
  submitReview: vi.fn(),
  recoverStuckTask: vi.fn(),
  checkTaskRunning: vi.fn(),
  discardWorktree: vi.fn(),
  resumePausedTask: vi.fn(),
  getWorktreeStatus: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector({
    projects: [], activeProjectId: null, selectedProjectId: null, getActiveProject: () => undefined,
  }),
}));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector?: (state: unknown) => unknown) => {
    const state = { settings: { logOrder: 'chronological' } };
    return selector ? selector(state) : state;
  },
}));
vi.mock('../../stores/task-store', () => ({
  submitReview,
  recoverStuckTask,
  checkTaskRunning,
  hasRecentActivity: () => false,
  isIncompleteHumanReview: () => false,
  getTaskProgress: () => ({ completed: 0, total: 0 }),
  useTaskStore: vi.fn(),
  deleteTask: vi.fn(), loadTasks: vi.fn(), stopTask: vi.fn(), startTaskOrQueue: vi.fn(),
}));
vi.mock('../TaskEditDialog', () => ({ TaskEditDialog: () => null }));
vi.mock('./TaskMetadata', () => ({ TaskMetadata: () => null }));
vi.mock('./TaskSubtasks', () => ({ TaskSubtasks: () => null }));
vi.mock('./TaskLogs', () => ({ TaskLogs: () => null }));
vi.mock('./TaskFiles', () => ({ TaskFiles: () => null }));
// Keep the actual feedback/drop controls; stub only image decoding unavailable in jsdom.
vi.mock('../ImageUpload', () => ({
  generateImageId: () => 'feedback-image',
  blobToBase64: vi.fn().mockResolvedValue('data:image/png;base64,Zml4dHVyZQ=='),
  createThumbnail: vi.fn().mockResolvedValue('data:image/png;base64,Zml4dHVyZQ=='),
  isValidImageMimeType: () => true,
  resolveFilename: (filename: string) => filename,
}));

const task: Task = {
  id: 'action-retry', specId: 'action-retry-spec', projectId: 'project', title: 'Keep failed actions retryable',
  description: 'Fixture', status: 'human_review', subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function attachFeedbackImage() {
  fireEvent.drop(screen.getByRole('textbox'), {
    dataTransfer: { files: [new File(['fixture'], 'feedback.png', { type: 'image/png' })] },
  });
  await screen.findByRole('img', { name: 'feedback.png' });
}

beforeEach(() => {
  submitReview.mockReset().mockResolvedValue(true);
  recoverStuckTask.mockReset().mockResolvedValue({ success: true });
  checkTaskRunning.mockReset().mockResolvedValue(false);
  discardWorktree.mockReset().mockResolvedValue({ success: true, data: { success: true } });
  resumePausedTask.mockReset().mockResolvedValue({ success: true });
  getWorktreeStatus.mockReset().mockResolvedValue({ success: true, data: { exists: false } });
  toast.mockReset();
  window.electronAPI.getWorktreeStatus = getWorktreeStatus;
  window.electronAPI.getWorktreeDiff = vi.fn().mockResolvedValue({ success: true, data: { files: [], summary: '' } });
  window.electronAPI.discardWorktree = discardWorktree;
  window.electronAPI.resumePausedTask = resumePausedTask;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Task review feedback failure and retry', () => {
  it.each([
    { label: 'returned failure', result: false, rejected: false, message: undefined },
    { label: 'transport error', result: new Error('Review transport interrupted'), rejected: true, message: 'Review transport interrupted' },
    { label: 'unknown transport failure', result: null, rejected: true, message: undefined },
  ])('keeps text and attached images after $label, then clears them only after a successful retry', async ({ result, rejected, message }) => {
    const pending = deferred<boolean>();
    submitReview.mockReturnValueOnce(pending.promise);
    render(<TaskDetailModal open task={task} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fix the missing empty state' } });
    await attachFeedbackImage();

    fireEvent.click(screen.getByRole('button', { name: 'Request Changes' }));
    expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(submitReview).toHaveBeenCalledExactlyOnceWith(task.id, false, 'Fix the missing empty state', [expect.objectContaining({ id: 'feedback-image', filename: 'feedback.png' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Submitting...' }));
    expect(submitReview).toHaveBeenCalledTimes(1);

    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(false);
    });
    expect(toast).toHaveBeenCalledWith({
      title: i18n.t('uiTasks:errors.reviewFailed'),
      description: message ?? i18n.t('uiTasks:errors.reviewRetry'),
      variant: 'destructive',
    });
    expect(screen.getByRole('textbox')).toHaveValue('Fix the missing empty state');
    expect(screen.getByRole('textbox')).toBeEnabled();
    expect(screen.getByRole('img', { name: 'feedback.png' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Changes' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Request Changes' }));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(screen.queryByRole('img', { name: 'feedback.png' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request Changes' })).toBeDisabled();
    expect(submitReview).toHaveBeenCalledTimes(2);
    expect(submitReview).toHaveBeenLastCalledWith(task.id, false, 'Fix the missing empty state', [expect.objectContaining({ id: 'feedback-image', filename: 'feedback.png' })]);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('enables image-only feedback while preventing an empty review submission', async () => {
    render(<TaskDetailModal open task={task} onOpenChange={vi.fn()} />);
    const requestChanges = screen.getByRole('button', { name: 'Request Changes' });
    expect(requestChanges).toBeDisabled();
    fireEvent.click(requestChanges);
    expect(submitReview).not.toHaveBeenCalled();
    await attachFeedbackImage();
    expect(requestChanges).toBeEnabled();
    fireEvent.click(requestChanges);
    await waitFor(() => expect(submitReview).toHaveBeenCalledExactlyOnceWith(task.id, false, '', [expect.objectContaining({ filename: 'feedback.png' })]));
  });
});

describe('Stuck task recovery failure and retry', () => {
  it.each([
    { label: 'returned error message', result: { success: false, message: 'The workspace is still leased' }, rejected: false, message: 'The workspace is still leased' },
    { label: 'returned failure without a message', result: { success: false }, rejected: false, message: undefined },
    { label: 'transport error', result: new Error('Recovery transport interrupted'), rejected: true, message: 'Recovery transport interrupted' },
    { label: 'unknown transport failure', result: null, rejected: true, message: undefined },
  ])('retains the stuck warning after $label and allows another recovery attempt', async ({ result, rejected, message }) => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const pending = deferred<unknown>();
    recoverStuckTask.mockReturnValueOnce(pending.promise);
    render(<TaskDetailModal open task={{ ...task, status: 'in_progress' }} onOpenChange={vi.fn()} />);
    // Trigger the actual stuck detector without making the test wait a minute.
    const check = interval.mock.calls.find(([, delay]) => delay === 60_000)?.[0];
    expect(check).toBeTypeOf('function');
    await act(async () => { if (typeof check === 'function') check(); });
    expect(await screen.findByText('Task appears stuck')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
    expect(screen.getAllByRole('button', { name: 'Recovering...' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(recoverStuckTask).toHaveBeenCalledExactlyOnceWith(task.id, { autoRestart: true });
    fireEvent.click(screen.getAllByRole('button', { name: 'Recovering...' })[0]);
    expect(recoverStuckTask).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(result);
    });

    expect(toast).toHaveBeenCalledWith({
      title: i18n.t('uiTasks:errors.recoverFailed'),
      description: message ?? i18n.t('uiTasks:errors.recoverFailed'),
      variant: 'destructive',
    });
    expect(screen.getByText('Task appears stuck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recover' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
    await waitFor(() => expect(screen.queryByText('Task appears stuck')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    expect(recoverStuckTask).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('explains when task state was recovered but automatic restart could not run', async () => {
    const message = 'Task recovered but cannot restart because Git is unavailable';
    recoverStuckTask.mockResolvedValue({ success: true, autoRestarted: false, message });
    const interval = vi.spyOn(globalThis, 'setInterval');
    render(<TaskDetailModal open task={{ ...task, status: 'in_progress' }} onOpenChange={vi.fn()} />);
    const check = interval.mock.calls.find(([, delay]) => delay === 60_000)?.[0];
    expect(check).toBeTypeOf('function');
    await act(async () => { if (typeof check === 'function') check(); });
    expect(await screen.findByText('Task appears stuck')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recover' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith({
      title: i18n.t('uiTasks:notifications.taskRecovered'), description: message, variant: 'default',
    });
    expect(screen.queryByText('Task appears stuck')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recovering...' })).not.toBeInTheDocument();
    expect(recoverStuckTask).toHaveBeenCalledExactlyOnceWith(task.id, { autoRestart: true });
  });
});

describe('Paused task resume request', () => {
  it.each(['rate_limit_paused', 'auth_failure_paused'] as const)('requests resume for %s without claiming execution has resumed', async (phase) => {
    const pausedTask: Task = {
      ...task, status: 'in_progress',
      executionProgress: { phase, phaseProgress: 25, overallProgress: 35 },
    };
    Object.freeze(pausedTask.executionProgress);
    Object.freeze(pausedTask);
    const pending = deferred<IPCResult>();
    resumePausedTask.mockReturnValueOnce(pending.promise);
    const onOpenChange = vi.fn();
    const { rerender } = render(<TaskDetailModal open task={pausedTask} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    const requesting = screen.getByRole('button', { name: 'Requesting resume…' });
    expect(requesting).toBeDisabled();
    fireEvent.click(requesting);
    expect(resumePausedTask).toHaveBeenCalledExactlyOnceWith(task.id);
    expect(toast).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ success: true }));
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('uiTasks:notifications.taskResumeRequested'),
      description: i18n.t('uiTasks:notifications.taskResumePending'),
      variant: 'default',
    });
    expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
    expect(pausedTask.status).toBe('in_progress');
    expect(pausedTask.executionProgress?.phase).toBe(phase);
    expect(onOpenChange).not.toHaveBeenCalled();

    rerender(<TaskDetailModal open task={{ ...pausedTask, executionProgress: { phase, phaseProgress: 25, overallProgress: 35, message: 'Still paused' } }} onOpenChange={onOpenChange} />);
    expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Waiting to resume…' }));
    expect(resumePausedTask).toHaveBeenCalledTimes(1);

    rerender(<TaskDetailModal open task={{ ...pausedTask, executionProgress: { phase: 'coding', phaseProgress: 25, overallProgress: 35 } }} onOpenChange={onOpenChange} />);
    expect(screen.queryByRole('button', { name: 'Resume task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Waiting to resume…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    expect(resumePausedTask).toHaveBeenCalledTimes(1);

    rerender(<TaskDetailModal open task={pausedTask} onOpenChange={onOpenChange} />);
    expect(screen.getByRole('button', { name: 'Resume task' })).toBeEnabled();
    expect(resumePausedTask).toHaveBeenCalledTimes(1);
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('does not let a late request acknowledgment block a later paused execution', async () => {
    const pausedTask: Task = {
      ...task, status: 'in_progress',
      executionProgress: { phase: 'rate_limit_paused', phaseProgress: 25, overallProgress: 35 },
    };
    const pending = deferred<IPCResult>();
    resumePausedTask.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<TaskDetailModal open task={pausedTask} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    expect(screen.getByRole('button', { name: 'Requesting resume…' })).toBeDisabled();

    rerender(<TaskDetailModal open task={{ ...pausedTask, executionProgress: { phase: 'coding', phaseProgress: 35, overallProgress: 45 } }} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Requesting resume…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();

    const laterPause: Task = {
      ...pausedTask, executionProgress: { phase: 'auth_failure_paused', phaseProgress: 40, overallProgress: 50 },
    };
    rerender(<TaskDetailModal open task={laterPause} onOpenChange={vi.fn()} />);
    await act(async () => pending.resolve({ success: true }));
    expect(screen.getByRole('button', { name: 'Resume task' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Waiting to resume…' })).not.toBeInTheDocument();
    expect(laterPause.executionProgress?.phase).toBe('auth_failure_paused');
    expect(resumePausedTask).toHaveBeenCalledExactlyOnceWith(task.id);

    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled());
    expect(resumePausedTask).toHaveBeenCalledTimes(2);
    expect(resumePausedTask).toHaveBeenLastCalledWith(task.id);
  });

  it.each([
    { phase: 'rate_limit_paused', requested: false },
    { phase: 'auth_failure_paused', requested: false },
    { phase: 'rate_limit_paused', requested: true },
    { phase: 'auth_failure_paused', requested: true },
  ] as const)('offers recovery when the executor is absent during $phase (resume requested: $requested)', async ({ phase, requested }) => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    render(<TaskDetailModal open task={{
      ...task, status: 'in_progress', executionProgress: { phase, phaseProgress: 25, overallProgress: 35 },
    }} onOpenChange={vi.fn()} />);
    if (requested) {
      fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled());
    } else {
      expect(screen.getByRole('button', { name: 'Resume task' })).toBeEnabled();
    }

    const check = interval.mock.calls.find(([, delay]) => delay === 60_000)?.[0];
    expect(check).toBeTypeOf('function');
    await act(async () => { if (typeof check === 'function') check(); });
    expect(await screen.findByText('Task appears stuck')).toBeInTheDocument();
    expect(checkTaskRunning).toHaveBeenCalledExactlyOnceWith(task.id);
    expect(screen.getByRole('button', { name: 'Recover' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Resume task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Waiting to resume…' })).not.toBeInTheDocument();
    expect(resumePausedTask).toHaveBeenCalledTimes(requested ? 1 : 0);
  });

  it('enables a new resume request when the paused phase changes directly', async () => {
    const pausedTask: Task = {
      ...task, status: 'in_progress',
      executionProgress: { phase: 'rate_limit_paused', phaseProgress: 25, overallProgress: 35 },
    };
    const { rerender } = render(<TaskDetailModal open task={pausedTask} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled());

    rerender(<TaskDetailModal open task={{
      ...pausedTask, executionProgress: { phase: 'auth_failure_paused', phaseProgress: 25, overallProgress: 35 },
    }} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Resume task' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Waiting to resume…' })).not.toBeInTheDocument();
    expect(resumePausedTask).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled());
    expect(resumePausedTask).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: 'success', result: { success: true }, rejected: false },
    { label: 'returned error', result: { success: false, error: 'Old request was refused' }, rejected: false },
    { label: 'transport rejection', result: new Error('Old request transport interrupted'), rejected: true },
  ])('ignores an old $label when a directly changed paused phase has a new pending request', async ({ result, rejected }) => {
    const oldRequest = deferred<unknown>();
    const currentRequest = deferred<IPCResult>();
    resumePausedTask.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(currentRequest.promise);
    const pausedTask: Task = {
      ...task, status: 'in_progress',
      executionProgress: { phase: 'rate_limit_paused', phaseProgress: 25, overallProgress: 35 },
    };
    const { rerender } = render(<TaskDetailModal open task={pausedTask} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    expect(screen.getByRole('button', { name: 'Requesting resume…' })).toBeDisabled();

    rerender(<TaskDetailModal open task={{
      ...pausedTask, executionProgress: { phase: 'auth_failure_paused', phaseProgress: 25, overallProgress: 35 },
    }} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Resume task' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    expect(resumePausedTask).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Requesting resume…' })).toBeDisabled();

    await act(async () => {
      if (rejected) oldRequest.reject(result);
      else oldRequest.resolve(result);
    });
    expect(screen.getByRole('button', { name: 'Requesting resume…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Waiting to resume…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();

    await act(async () => currentRequest.resolve({ success: true }));
    expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled();
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('uiTasks:notifications.taskResumeRequested'),
      description: i18n.t('uiTasks:notifications.taskResumePending'), variant: 'default',
    });
    expect(resumePausedTask).toHaveBeenCalledTimes(2);
  });

  it.each([
    { label: 'returned error', result: { success: false, error: 'The paused execution could not be found' }, rejected: false, message: 'The paused execution could not be found' },
    { label: 'returned failure without an error', result: { success: false }, rejected: false, message: undefined },
    { label: 'transport error', result: new Error('Resume transport interrupted'), rejected: true, message: 'Resume transport interrupted' },
    { label: 'unknown transport failure', result: null, rejected: true, message: undefined },
  ])('shows $label and permits retry while preserving the paused phase', async ({ result, rejected, message }) => {
    const pausedTask: Task = {
      ...task, status: 'in_progress',
      executionProgress: { phase: 'auth_failure_paused', phaseProgress: 25, overallProgress: 35 },
    };
    const pending = deferred<unknown>();
    resumePausedTask.mockReturnValueOnce(pending.promise);
    render(<TaskDetailModal open task={pausedTask} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    expect(screen.getByRole('button', { name: 'Requesting resume…' })).toBeDisabled();
    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(result);
    });
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('uiTasks:errors.resumeFailed'),
      description: message ?? i18n.t('uiTasks:errors.resumeFailed'),
      variant: 'destructive',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(message ?? i18n.t('uiTasks:errors.resumeFailed'));
    expect(screen.getByRole('button', { name: 'Resume task' })).toBeEnabled();
    expect(pausedTask.executionProgress?.phase).toBe('auth_failure_paused');

    fireEvent.click(screen.getByRole('button', { name: 'Resume task' }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(toast).toHaveBeenLastCalledWith({
      title: i18n.t('uiTasks:notifications.taskResumeRequested'),
      description: i18n.t('uiTasks:notifications.taskResumePending'),
      variant: 'default',
    });
    expect(screen.getByRole('button', { name: 'Waiting to resume…' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(pausedTask.executionProgress?.phase).toBe('auth_failure_paused');
    expect(resumePausedTask).toHaveBeenCalledTimes(2);
    expect(resumePausedTask).toHaveBeenLastCalledWith(task.id);
  });

  it.each([undefined, 'idle', 'planning', 'coding', 'qa_review', 'qa_fixing', 'complete', 'failed'] satisfies (ExecutionPhase | undefined)[])('does not offer paused resume for phase %s', (phase) => {
    render(<TaskDetailModal open task={{
      ...task, status: 'in_progress',
      executionProgress: phase ? { phase, phaseProgress: 25, overallProgress: 35 } : undefined,
    }} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Resume task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Requesting resume…' })).not.toBeInTheDocument();
    expect(resumePausedTask).not.toHaveBeenCalled();
  });
});

describe('Worktree discard failure and retry', () => {
  it.each([
    { label: 'returned worktree error', result: { success: true, data: { success: false, message: 'The worktree could not be removed' } }, rejected: false, message: 'The worktree could not be removed' },
    { label: 'returned IPC error', result: { success: false, error: 'Discard request was refused' }, rejected: false, message: 'Discard request was refused' },
    { label: 'transport error', result: new Error('Discard transport interrupted'), rejected: true, message: 'Discard transport interrupted' },
    { label: 'unknown transport failure', result: null, rejected: true, message: undefined },
  ])('shows $label and keeps confirmation available for a successful retry', async ({ result, rejected, message }) => {
    const worktreeStatus: WorktreeStatus = { exists: true, filesChanged: 2, additions: 12, deletions: 3 };
    getWorktreeStatus.mockResolvedValue({ success: true, data: worktreeStatus } satisfies IPCResult<WorktreeStatus>);
    const pending = deferred<unknown>();
    discardWorktree.mockReturnValueOnce(pending.promise);
    const onOpenChange = vi.fn();
    render(<TaskDetailModal open task={task} onOpenChange={onOpenChange} />);
    fireEvent.click(await screen.findByTitle('Discard build'));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard Build' }));
    expect(within(dialog).getByRole('button', { name: 'Discarding...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discarding...' }));
    expect(discardWorktree).toHaveBeenCalledExactlyOnceWith(task.id);
    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(result);
    });

    const errorMessage = message ?? i18n.t('uiTasks:errors.discardFailed');
    expect(toast).toHaveBeenCalledWith({
      title: i18n.t('uiTasks:errors.discardFailed'), description: errorMessage, variant: 'destructive',
    });
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Discard Build' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard Build' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(discardWorktree).toHaveBeenCalledTimes(2);
    expect(discardWorktree).toHaveBeenLastCalledWith(task.id);
    expect(toast).toHaveBeenCalledTimes(1);
  });
});
