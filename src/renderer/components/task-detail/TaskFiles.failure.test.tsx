/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPCResult, Task } from '../../../shared/types';
import type { FileNode } from '../../../shared/types/project';
import { TaskFiles } from './TaskFiles';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: () => ({ settings: { preferredIDE: null } }),
}));

const listDirectory = vi.fn<typeof window.electronAPI.listDirectory>();
const readFile = vi.fn<typeof window.electronAPI.readFile>();
const originalListDirectory = window.electronAPI.listDirectory;
const originalReadFile = window.electronAPI.readFile;
const task: Task = {
  id: 'file-actions', specId: 'file-actions-spec', projectId: 'project',
  title: 'Browse task files safely', description: 'Fixture', status: 'human_review',
  specsPath: '/fixture/specs/task-a', subtasks: [], logs: [],
  createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z'),
};

function file(name: string, specsPath = task.specsPath): FileNode {
  return { name, path: `${specsPath}/${name}`, isDirectory: false };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  listDirectory.mockReset().mockResolvedValue({ success: true, data: [file('spec.md')] });
  readFile.mockReset().mockResolvedValue({ success: true, data: '# Current specification' });
  window.electronAPI.listDirectory = listDirectory;
  window.electronAPI.readFile = readFile;
});

afterEach(() => {
  cleanup();
  window.electronAPI.listDirectory = originalListDirectory;
  window.electronAPI.readFile = originalReadFile;
});

const failureCases = [
  { label: 'returned failure', rejected: false, value: { success: false, error: 'Fixture access denied' }, reason: 'Fixture access denied' },
  { label: 'transport error', rejected: true, value: new Error('Fixture transport interrupted'), reason: 'Fixture transport interrupted' },
  { label: 'unknown rejection', rejected: true, value: null, reason: undefined },
  { label: 'empty error', rejected: true, value: new Error(''), reason: undefined },
];

describe('Task file failure feedback and retry', () => {
  it.each(failureCases)('shows directory $label and retries from the normal control', async ({ rejected, value, reason }) => {
    if (rejected) listDirectory.mockRejectedValueOnce(value);
    else listDirectory.mockResolvedValueOnce(value as IPCResult<FileNode[]>);
    render(<TaskFiles task={task} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load files');
    if (reason) expect(alert).toHaveTextContent(reason);
    expect(readFile).not.toHaveBeenCalled();

    const retry = deferred<IPCResult<FileNode[]>>();
    listDirectory.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(listDirectory).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve({ success: true, data: [file('spec.md')] }));
    expect(await screen.findByText('# Current specification')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it.each(failureCases)('shows file-content $label and keeps its selection for retry', async ({ rejected, value, reason }) => {
    if (rejected) readFile.mockRejectedValueOnce(value);
    else readFile.mockResolvedValueOnce(value as IPCResult<string>);
    render(<TaskFiles task={task} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load file content');
    if (reason) expect(alert).toHaveTextContent(reason);
    expect(screen.getByRole('option', { name: 'spec.md' })).toHaveAttribute('aria-selected', 'true');

    const retry = deferred<IPCResult<string>>();
    readFile.mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(readFile).toHaveBeenLastCalledWith(file('spec.md').path);
    await act(async () => retry.resolve({ success: true, data: '# Retry succeeded' }));
    expect(await screen.findByText('# Retry succeeded')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not read hidden stale options when keyboard navigation follows a failed refresh', async () => {
    listDirectory.mockResolvedValue({ success: true, data: [file('spec.md'), file('extra.md')] });
    render(<TaskFiles task={task} />);
    await screen.findByText('# Current specification');
    listDirectory.mockResolvedValueOnce({ success: false, error: 'Directory unavailable' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByRole('alert');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'End' });
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});

describe('Task file selection and request correlation', () => {
  it('clears loaded files and content immediately while a different task directory loads', async () => {
    const { rerender } = render(<TaskFiles task={task} />);
    await screen.findByText('# Current specification');
    const nextDirectory = deferred<IPCResult<FileNode[]>>();
    listDirectory.mockReturnValueOnce(nextDirectory.promise);
    const nextTask = { ...task, id: 'task-b', specsPath: '/fixture/specs/task-b' };
    rerender(<TaskFiles task={nextTask} />);
    expect(screen.queryByText('# Current specification')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'spec.md' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    await act(async () => nextDirectory.resolve({ success: true, data: [file('new-spec.md', nextTask.specsPath)] }));
    await screen.findByText('# Current specification');
    expect(screen.getByRole('option', { name: 'new-spec.md' })).toHaveAttribute('aria-selected', 'true');
    expect(readFile).toHaveBeenLastCalledWith(file('new-spec.md', nextTask.specsPath).path);
  });

  it.each(['success', 'returned failure', 'thrown error'] as const)('keeps the newest keyboard-selected file after an older %s response', async (outcome) => {
    listDirectory.mockResolvedValue({ success: true, data: [file('spec.md'), file('a.md'), file('b.md')] });
    render(<TaskFiles task={task} />);
    await screen.findByText('# Current specification');
    const earlier = deferred<IPCResult<string>>();
    const current = deferred<IPCResult<string>>();
    readFile.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(current.promise);
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'End' });
    expect(readFile).toHaveBeenNthCalledWith(2, file('a.md').path);
    expect(readFile).toHaveBeenNthCalledWith(3, file('b.md').path);

    await act(async () => current.resolve({ success: true, data: '# Newest selected file' }));
    await act(async () => {
      if (outcome === 'thrown error') earlier.reject(new Error('Old file unavailable'));
      else earlier.resolve(outcome === 'success'
        ? { success: true, data: '# Old response must not replace current content' }
        : { success: false, error: 'Old file unavailable' });
    });
    expect(screen.getByText('# Newest selected file')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'b.md' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('# Old response must not replace current content')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the previous task selection and ignores its late directory response', async () => {
    const oldDirectory = deferred<IPCResult<FileNode[]>>();
    listDirectory.mockReturnValueOnce(oldDirectory.promise);
    const nextTask = { ...task, id: 'task-b', specsPath: '/fixture/specs/task-b' };
    listDirectory.mockResolvedValueOnce({ success: true, data: [file('new-spec.md', nextTask.specsPath)] });
    const { rerender } = render(<TaskFiles task={task} />);
    rerender(<TaskFiles task={nextTask} />);
    await screen.findByText('# Current specification');
    expect(readFile).toHaveBeenCalledExactlyOnceWith(file('new-spec.md', nextTask.specsPath).path);
    await act(async () => oldDirectory.resolve({ success: true, data: [file('old-spec.md')] }));
    expect(screen.getByRole('option', { name: 'new-spec.md' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('option', { name: 'old-spec.md' })).not.toBeInTheDocument();
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'thrown error'] as const)('ignores a previous task late content %s after directory switching', async (outcome) => {
    const oldContent = deferred<IPCResult<string>>();
    readFile.mockReturnValueOnce(oldContent.promise);
    const { rerender } = render(<TaskFiles task={task} />);
    await waitFor(() => expect(readFile).toHaveBeenCalledTimes(1));
    const nextTask = { ...task, id: 'task-b', specsPath: '/fixture/specs/task-b' };
    listDirectory.mockResolvedValueOnce({ success: true, data: [file('new-spec.md', nextTask.specsPath)] });
    readFile.mockResolvedValueOnce({ success: true, data: '# New task specification' });
    rerender(<TaskFiles task={nextTask} />);
    expect(await screen.findByText('# New task specification')).toBeInTheDocument();
    await act(async () => {
      if (outcome === 'success') oldContent.resolve({ success: true, data: '# Old task specification' });
      else oldContent.reject(new Error('Previous task read failed'));
    });
    expect(screen.getByText('# New task specification')).toBeInTheDocument();
    expect(screen.queryByText('# Old task specification')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'spec.md' })).not.toBeInTheDocument();
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('clears a removed file on refresh and ignores its pending content response', async () => {
    listDirectory.mockResolvedValueOnce({ success: true, data: [file('spec.md'), file('removed.md')] });
    render(<TaskFiles task={task} />);
    await screen.findByText('# Current specification');
    const removedContent = deferred<IPCResult<string>>();
    readFile.mockReturnValueOnce(removedContent.promise);
    fireEvent.click(screen.getByRole('option', { name: 'removed.md' }));
    readFile.mockResolvedValueOnce({ success: true, data: '# Refreshed surviving file' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('# Refreshed surviving file')).toBeInTheDocument();
    await act(async () => removedContent.resolve({ success: true, data: '# Removed file body' }));
    expect(screen.getByText('# Refreshed surviving file')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'removed.md' })).not.toBeInTheDocument();
    expect(screen.queryByText('# Removed file body')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'spec.md' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clears the content and filename when refresh returns an empty directory', async () => {
    render(<TaskFiles task={task} />);
    await screen.findByText('# Current specification');
    listDirectory.mockResolvedValueOnce({ success: true, data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No files found')).toBeInTheDocument();
    expect(screen.queryByText('# Current specification')).not.toBeInTheDocument();
    expect(screen.queryByText('spec.md')).not.toBeInTheDocument();
    expect(screen.getByText('Select a file to view its contents')).toBeInTheDocument();
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});
