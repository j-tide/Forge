/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../shared/i18n';
import type { Task } from '../../../../shared/types';
import { StagedSuccessMessage } from './StagedSuccessMessage';

const { toast, persistTaskStatus } = vi.hoisted(() => ({ toast: vi.fn(), persistTaskStatus: vi.fn() }));

vi.mock('../../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('../../../stores/task-store', () => ({ persistTaskStatus }));

const task: Task = {
  id: 'staged-copy-task', specId: 'staged-copy-spec', projectId: 'project',
  title: 'Copy a staged commit message', description: 'Fixture', status: 'human_review',
  subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
};
const props = { task, stagedSuccess: 'Fixture changes are staged.', suggestedCommitMessage: 'Fix the staged fixture' };
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let writeText: ReturnType<typeof vi.fn>;

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  toast.mockReset();
  persistTaskStatus.mockReset();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Staged commit message copying', () => {
  it('waits for clipboard success, blocks duplicate dispatch and preserves the existing success label', async () => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    render(<StagedSuccessMessage {...props} />);

    const copy = screen.getByRole('button', { name: 'Copy' });
    fireEvent.click(copy);
    fireEvent.click(copy);
    const copying = screen.getByRole('button', { name: 'Copying...' });
    expect(copying).toBeDisabled();
    expect(copying).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(props.suggestedCommitMessage);

    await act(async () => pending.resolve());
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Copied!' })).toHaveAttribute('aria-busy', 'false');
    expect(toast).not.toHaveBeenCalled();
    expect(persistTaskStatus).not.toHaveBeenCalled();
  });

  it.each(['en', 'zh-CN'] as const)('shows sanitized failure and a successful retry in %s', async (language) => {
    await i18n.changeLanguage(language);
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    render(<StagedSuccessMessage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:stagedSuccess.copy') }));
    await act(async () => pending.reject(new Error('private-key=fixture-secret; /private/fixture/path')));

    const message = i18n.t('taskReview:stagedSuccess.errors.failedToCopy');
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).not.toHaveTextContent('fixture-secret');
    expect(toast).toHaveBeenCalledExactlyOnceWith({
      title: i18n.t('taskReview:stagedSuccess.copyFailed'), description: message, variant: 'destructive',
    });
    expect(JSON.stringify(toast.mock.calls)).not.toContain('private-key');
    expect(screen.getByRole('textbox')).toHaveValue(props.suggestedCommitMessage);

    const retry = deferred();
    writeText.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common:buttons.retry') }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('taskReview:stagedSuccess.copying') })).toBeDisabled();
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve());
    expect(screen.getByRole('button', { name: i18n.t('taskReview:stagedSuccess.copied') })).toBeEnabled();
    expect(toast).toHaveBeenCalledOnce();
  });

  it('reports unavailable clipboard support through the same recoverable feedback', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<StagedSuccessMessage {...props} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('taskReview:stagedSuccess.errors.failedToCopy'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(toast).toHaveBeenCalledOnce();
  });

  it('restores Copy after two seconds and clears the success timer on unmount', async () => {
    vi.useFakeTimers();
    const { unmount } = render(<StagedSuccessMessage {...props} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not mark edited text as copied by an older pending request', async () => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    render(<StagedSuccessMessage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited commit message' } });
    await act(async () => pending.resolve());
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Copied!' })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy' })));
    expect(writeText).toHaveBeenLastCalledWith('Edited commit message');
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Another edit' } });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });

  it.each(['resolve', 'reject'] as const)('ignores clipboard %s after unmount', async (result) => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<StagedSuccessMessage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    unmount();
    await act(async () => {
      if (result === 'resolve') pending.resolve();
      else pending.reject(new Error('private clipboard details'));
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('ignores the old task clipboard %s without unlocking the new task request', async (result) => {
    const oldCopy = deferred();
    const newCopy = deferred();
    writeText.mockReturnValueOnce(oldCopy.promise).mockReturnValueOnce(newCopy.promise);
    const { rerender } = render(<StagedSuccessMessage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    rerender(<StagedSuccessMessage {...props} task={{ ...task, id: 'new-task' }} suggestedCommitMessage="New task commit" />);
    expect(screen.getByRole('textbox')).toHaveValue('New task commit');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => {
      if (result === 'resolve') oldCopy.resolve();
      else oldCopy.reject(new Error('old task private clipboard details'));
    });
    expect(screen.getByRole('button', { name: 'Copying...' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => newCopy.resolve());
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeEnabled();
  });

  it('rejects an old result even when the user returns to the same task id', async () => {
    const oldCopy = deferred();
    const newCopy = deferred();
    writeText.mockReturnValueOnce(oldCopy.promise).mockReturnValueOnce(newCopy.promise);
    const { rerender } = render(<StagedSuccessMessage {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    rerender(<StagedSuccessMessage {...props} task={{ ...task, id: 'other-task' }} suggestedCommitMessage="Other task commit" />);
    rerender(<StagedSuccessMessage {...props} suggestedCommitMessage="Returned task commit" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await act(async () => oldCopy.reject(new Error('old generation private clipboard details')));
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copying...' })).toBeDisabled();
    expect(writeText).toHaveBeenLastCalledWith('Returned task commit');
    await act(async () => newCopy.resolve());
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeEnabled();
  });

  it('does not dispatch copying an empty edited message', () => {
    render(<StagedSuccessMessage {...props} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy).toBeDisabled();
    fireEvent.click(copy);
    expect(writeText).not.toHaveBeenCalled();
  });
});
