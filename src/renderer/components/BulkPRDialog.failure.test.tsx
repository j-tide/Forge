/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { BulkPRDialog } from './BulkPRDialog';
import i18n from '../../shared/i18n';
import nativeZh from '../../shared/i18n/locales/zh-CN/native.json';
import type { IPCResult, Task, WorktreeCreatePRResult } from '../../shared/types';

const { createWorktreePR, openExternal, updateTask } = vi.hoisted(() => ({
  createWorktreePR: vi.fn(), openExternal: vi.fn(), updateTask: vi.fn(),
}));

vi.mock('../stores/task-store', () => ({
  useTaskStore: { getState: () => ({ updateTask }) },
}));

// Component fixtures only; no worktree, remote push, or PR is created.
const tasks: Task[] = ['first', 'second'].map((name) => ({
  id: `bulk-pr-${name}`, specId: `bulk-pr-${name}`, projectId: 'component-test-project',
  title: `Fixture ${name} task`, description: 'Synthetic UI input', status: 'backlog',
  subtasks: [], logs: [], createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z'),
}));

const noWorktreeZh = nativeZh['ipc.noWorktreeFoundForThisTask'];
const noWorktreeResult: IPCResult<WorktreeCreatePRResult> = {
  success: false, error: noWorktreeZh,
  data: { success: false, error: noWorktreeZh, code: 'no-worktree' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function ReopenableDialog({ onComplete = vi.fn() }) {
  const [open, setOpen] = useState(true);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Reopen fixture</button>
    <BulkPRDialog open={open} tasks={tasks} onOpenChange={setOpen} onComplete={onComplete} />
  </>;
}

beforeEach(() => {
  createWorktreePR.mockReset().mockResolvedValue(noWorktreeResult);
  openExternal.mockReset();
  updateTask.mockReset();
  window.electronAPI.createWorktreePR = createWorktreePR;
  window.electronAPI.openExternal = openExternal;
});

afterEach(() => cleanup());

describe('BulkPRDialog branch validation', () => {
  it.each(['en', 'zh-CN'])('shows a linked validation error and blocks creation in %s until corrected', async (language) => {
    await i18n.changeLanguage(language);
    render(<BulkPRDialog open tasks={tasks} onOpenChange={vi.fn()} />);
    const branch = screen.getByRole('textbox', { name: i18n.t('taskReview:pr.labels.targetBranch') });
    const create = screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: tasks.length }) });
    expect(create).toBeEnabled();

    fireEvent.change(branch, { target: { value: 'main invalid' } });
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('taskReview:pr.errors.invalidBranchName'));
    expect(branch).toHaveAttribute('aria-invalid', 'true');
    expect(branch).toHaveAccessibleDescription(i18n.t('taskReview:pr.errors.invalidBranchName'));
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(createWorktreePR).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();

    fireEvent.change(branch, { target: { value: 'feature/valid_branch-1' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(branch).toHaveAttribute('aria-invalid', 'false');
    expect(create).toBeEnabled();
    fireEvent.click(create);
    await waitFor(() => expect(createWorktreePR).toHaveBeenCalledTimes(2));
    expect(createWorktreePR).toHaveBeenNthCalledWith(1, tasks[0].id, { targetBranch: 'feature/valid_branch-1', draft: false });
    expect(createWorktreePR).toHaveBeenNthCalledWith(2, tasks[1].id, { targetBranch: 'feature/valid_branch-1', draft: false });
    expect(updateTask).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe('BulkPRDialog no-worktree classification', () => {
  it('uses the structured code for the actual Chinese Main error and reports all tasks skipped', async () => {
    await i18n.changeLanguage('zh-CN');
    const onComplete = vi.fn();
    const onOpenChange = vi.fn();
    render(<BulkPRDialog open tasks={tasks} onOpenChange={onOpenChange} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('checkbox', { name: i18n.t('taskReview:pr.labels.draftPR') }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: tasks.length }) }));

    expect(await screen.findByText(i18n.t('taskReview:bulkPR.resultsDescriptionWithSkipped', { success: 0, skipped: 2, failed: 0 }))).toBeInTheDocument();
    expect(screen.getByText(`2 ${i18n.t('taskReview:bulkPR.skipped')}`)).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t('taskReview:bulkPR.noWorktree'))).toHaveLength(2);
    expect(createWorktreePR).toHaveBeenNthCalledWith(1, tasks[0].id, { targetBranch: undefined, draft: true });
    expect(createWorktreePR).toHaveBeenNthCalledWith(2, tasks[1].id, { targetBranch: undefined, draft: true });
    expect(updateTask).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: i18n.t('taskReview:pr.success.created') })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: i18n.t('common:buttons.close') })[1]);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('also classifies a typed result returned inside a successful IPC envelope', async () => {
    await i18n.changeLanguage('zh-CN');
    createWorktreePR.mockResolvedValue({ success: true, data: noWorktreeResult.data });
    render(<BulkPRDialog open tasks={tasks.slice(0, 1)} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: 1 }) }));
    expect(await screen.findByText(i18n.t('taskReview:bulkPR.resultsDescriptionWithSkipped', { success: 0, skipped: 1, failed: 0 }))).toBeInTheDocument();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it.each(['response', 'transport'])('keeps the English compatibility fallback for an older %s error', async (kind) => {
    await i18n.changeLanguage('zh-CN');
    if (kind === 'response') createWorktreePR.mockResolvedValue({ success: false, error: 'No worktree found for this task' });
    else createWorktreePR.mockRejectedValue(new Error('No worktree found for this task'));
    render(<BulkPRDialog open tasks={tasks.slice(0, 1)} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: 1 }) }));
    expect(await screen.findByText(i18n.t('taskReview:bulkPR.resultsDescriptionWithSkipped', { success: 0, skipped: 1, failed: 0 }))).toBeInTheDocument();
    expect(updateTask).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('keeps other failures distinct from skipped worktrees', async () => {
    await i18n.changeLanguage('zh-CN');
    const error = '远程身份认证失败';
    createWorktreePR.mockResolvedValue({ success: false, error });
    render(<BulkPRDialog open tasks={tasks.slice(0, 1)} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: 1 }) }));
    expect(await screen.findByText(i18n.t('taskReview:bulkPR.resultsDescription', { success: 0, failed: 1 }))).toBeInTheDocument();
    expect(screen.getByText(error)).toBeInTheDocument();
    expect(screen.queryByText(i18n.t('taskReview:bulkPR.noWorktree'))).not.toBeInTheDocument();
    expect(updateTask).not.toHaveBeenCalled();
  });
});

describe('BulkPRDialog close and operation correlation', () => {
  it.each(['header', 'escape'])('stops scheduling the remaining tasks when closed through %s', async (closeMethod) => {
    const pending = deferred<IPCResult<WorktreeCreatePRResult>>();
    createWorktreePR.mockReturnValueOnce(pending.promise);
    const onComplete = vi.fn();
    render(<ReopenableDialog onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: 2 }) }));
    expect(createWorktreePR).toHaveBeenCalledExactlyOnceWith(tasks[0].id, { targetBranch: undefined, draft: false });
    if (closeMethod === 'header') fireEvent.click(screen.getByRole('button', { name: i18n.t('common:buttons.close') }));
    else fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The first dispatch settles normally; closing only cancels future scheduling.
    await act(async () => pending.resolve(noWorktreeResult));
    expect(createWorktreePR).toHaveBeenCalledTimes(1);
    expect(updateTask).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores an old result after close and reopen while a newer batch is waiting', async () => {
    const oldRequest = deferred<IPCResult<WorktreeCreatePRResult>>();
    const newRequest = deferred<IPCResult<WorktreeCreatePRResult>>();
    createWorktreePR.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    render(<ReopenableDialog />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: 2 }) }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('common:buttons.close') }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen fixture' }));
    fireEvent.click(screen.getByRole('button', { name: i18n.t('taskReview:bulkPR.createAll', { count: 2 }) }));
    expect(createWorktreePR).toHaveBeenCalledTimes(2);

    // Synthetic late response tests identity handling; it is never exposed as a created PR.
    await act(async () => oldRequest.resolve({ success: true, data: { success: true, prUrl: 'https://example.invalid/stale-fixture-pr' } }));
    expect(screen.getByText(i18n.t('taskReview:bulkPR.creating', { current: 1, total: 2 }))).toBeInTheDocument();
    expect(createWorktreePR).toHaveBeenCalledTimes(2);
    expect(updateTask).not.toHaveBeenCalled();
    await act(async () => newRequest.resolve(noWorktreeResult));

    expect(await screen.findByText(i18n.t('taskReview:bulkPR.resultsDescriptionWithSkipped', { success: 0, skipped: 2, failed: 0 }))).toBeInTheDocument();
    expect(createWorktreePR).toHaveBeenCalledTimes(3);
    expect(createWorktreePR).toHaveBeenNthCalledWith(3, tasks[1].id, { targetBranch: undefined, draft: false });
    expect(updateTask).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});
