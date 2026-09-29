/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../shared/i18n';
import type { Task } from '../../../../shared/types';
import type { PersistStatusResult } from '../../../stores/task-store';
import { NoWorkspaceMessage } from './WorkspaceMessages';

const { persistTaskStatus } = vi.hoisted(() => ({ persistTaskStatus: vi.fn() }));

vi.mock('../../../stores/task-store', () => ({
  persistTaskStatus,
  startTaskOrQueue: vi.fn(),
}));

const task: Task = {
  id: 'no-workspace-review', specId: 'no-workspace-spec', projectId: 'project',
  title: 'Complete a task without a workspace', description: 'Fixture',
  status: 'human_review', subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  persistTaskStatus.mockReset().mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('Completing a task without a workspace', () => {
  it.each([
    { label: 'returned failure', rejected: false, result: { success: false, error: 'Task status is locked' }, message: 'Task status is locked' },
    { label: 'transport error', rejected: true, result: new Error('Status transport interrupted'), message: 'Status transport interrupted' },
    { label: 'unknown rejection', rejected: true, result: null, message: undefined },
    { label: 'empty error', rejected: true, result: new Error(''), message: undefined },
  ])('shows $label without closing, and closes only after a successful retry', async ({ rejected, result, message }) => {
    const pending = deferred<PersistStatusResult>();
    persistTaskStatus.mockReturnValueOnce(pending.promise);
    const onClose = vi.fn();
    render(<NoWorkspaceMessage task={task} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark as Done' }));
    const updating = screen.getByRole('button', { name: 'Updating...' });
    expect(updating).toBeDisabled();
    fireEvent.click(updating);
    expect(persistTaskStatus).toHaveBeenCalledExactlyOnceWith(task.id, 'done');
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      if (rejected) pending.reject(result);
      else pending.resolve(result as PersistStatusResult);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(message ?? i18n.t('taskReview:stagedSuccess.errors.failedToMarkAsDone'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark as Done' })).toBeEnabled();
    expect(screen.getByText('No Workspace Found')).toBeInTheDocument();

    const retry = deferred<PersistStatusResult>();
    persistTaskStatus.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Mark as Done' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Updating...' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => retry.resolve({ success: true }));

    expect(persistTaskStatus).toHaveBeenCalledTimes(2);
    expect(persistTaskStatus).toHaveBeenLastCalledWith(task.id, 'done');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Mark as Done' })).toBeEnabled();
  });

  it.each(['en', 'zh-CN'] as const)('localizes the fallback after a returned failure in %s', async (language) => {
    await i18n.changeLanguage(language);
    persistTaskStatus.mockResolvedValue({ success: false });
    const onClose = vi.fn();
    render(<NoWorkspaceMessage task={task} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:merge.actions.markAsDone') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(language === 'en' ? 'Failed to mark as done' : '无法标记为完成');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: i18n.t('taskReview:merge.actions.markAsDone') })).toBeEnabled();
  });

  it('closes after a successful first attempt without showing an error', async () => {
    const onClose = vi.fn();
    render(<NoWorkspaceMessage task={task} onClose={onClose} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark as Done' })));
    expect(persistTaskStatus).toHaveBeenCalledExactlyOnceWith(task.id, 'done');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
