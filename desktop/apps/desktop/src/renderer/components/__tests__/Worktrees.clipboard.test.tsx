/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n';
import type { TerminalWorktreeConfig, WorktreeListItem } from '../../../shared/types';
import { Worktrees } from '../Worktrees';

const fixture = vi.hoisted(() => ({
  projects: [{ id: 'copy-project', path: '/fixture/project' }, { id: 'other-project', path: '/fixture/other-project' }],
  tasks: [],
  toast: vi.fn()
}));
vi.mock('../../stores/project-store', () => ({
  useProjectStore: (select: (state: typeof fixture) => unknown) => select(fixture)
}));
vi.mock('../../stores/task-store', () => ({
  useTaskStore: (select: (state: typeof fixture) => unknown) => select(fixture)
}));
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast: fixture.toast }) }));

const taskWorktree: WorktreeListItem = {
  specName: 'copy-task', path: '/fixture/task-worktree', branch: 'copy/task', baseBranch: 'main'
};
const terminalWorktree: TerminalWorktreeConfig = {
  name: 'copy-terminal', worktreePath: '/fixture/terminal-worktree', branchName: 'copy/terminal',
  baseBranch: 'main', hasGitBranch: true, createdAt: '2026-09-28T00:00:00Z', terminalId: 'copy-terminal-id'
};
const writeText = vi.fn();
let previousClipboard: PropertyDescriptor | undefined;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  fixture.toast.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  window.electronAPI.listWorktrees = vi.fn().mockResolvedValue({ success: true, data: { worktrees: [taskWorktree] } });
  window.electronAPI.listTerminalWorktrees = vi.fn().mockResolvedValue({ success: true, data: [terminalWorktree] });
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
});

afterEach(() => {
  cleanup();
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});

async function openWorktrees() {
  render(<Worktrees projectId="copy-project" />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Copy path' })).toHaveLength(2));
  return screen.getAllByRole('button', { name: 'Copy path' });
}

describe.each([
  { kind: 'task', index: 0, path: taskWorktree.path },
  { kind: 'terminal', index: 1, path: terminalWorktree.worktreePath }
])('$kind worktree clipboard control', ({ index, path }) => {
  it('waits for the real write, blocks duplicate writes, and then confirms success', async () => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    const buttons = await openWorktrees();
    act(() => {
      fireEvent.click(buttons[index]);
      fireEvent.click(buttons[index]);
      fireEvent.click(buttons[1 - index]);
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(path);
    expect(fixture.toast).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copying path…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copying path…' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Copy path' })).toBeDisabled();
    await act(async () => pending.resolve());
    expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({ title: 'Path copied' });
    expect(screen.getAllByRole('button', { name: 'Copy path' }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });

  it('reports a rejected write without false success and allows a successful retry', async () => {
    writeText.mockRejectedValueOnce(new Error('Denied with private clipboard details'));
    const buttons = await openWorktrees();
    fireEvent.click(buttons[index]);
    await waitFor(() => expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'Could not copy path',
      description: 'Clipboard access failed. Click Copy path again to retry.',
      variant: 'destructive'
    }));
    expect(screen.getAllByRole('button', { name: 'Copy path' })[index]).toBeEnabled();
    expect(screen.queryByText('Path copied')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy path' })[index]);
    await waitFor(() => expect(fixture.toast).toHaveBeenLastCalledWith({ title: 'Path copied' }));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith(path);
  });

  it('gives recovery feedback when clipboard access is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    const buttons = await openWorktrees();
    fireEvent.click(buttons[index]);
    await waitFor(() => expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Could not copy path', variant: 'destructive'
    })));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: 'Copy path' })[index]).toBeEnabled();
  });
});

it('does not report an old project copy after navigating away and returning', async () => {
  const pending = deferred();
  writeText.mockReturnValueOnce(pending.promise);
  const view = render(<Worktrees projectId="copy-project" />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Copy path' }))[0]);
  view.rerender(<Worktrees projectId="other-project" />);
  await waitFor(() => expect(window.electronAPI.listWorktrees).toHaveBeenLastCalledWith('other-project', { includeStats: true }));
  view.rerender(<Worktrees projectId="copy-project" />);
  await waitFor(() => expect(window.electronAPI.listWorktrees).toHaveBeenLastCalledWith('copy-project', { includeStats: true }));
  await act(async () => pending.resolve());
  expect(fixture.toast).not.toHaveBeenCalled();
  expect(screen.getAllByRole('button', { name: 'Copy path' })[0]).toBeEnabled();
});

it('does not report success for a worktree removed while its copy is pending', async () => {
  const pending = deferred();
  writeText.mockReturnValueOnce(pending.promise);
  const buttons = await openWorktrees();
  fireEvent.click(buttons[0]);
  window.electronAPI.listWorktrees = vi.fn().mockResolvedValue({ success: true, data: { worktrees: [] } });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Copy path' })).toHaveLength(1));
  await act(async () => pending.resolve());
  expect(fixture.toast).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Copy path' })).toBeEnabled();
});

it('does not show clipboard feedback after the worktree view is closed', async () => {
  const pending = deferred();
  writeText.mockReturnValueOnce(pending.promise);
  const view = render(<Worktrees projectId="copy-project" />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Copy path' }))[0]);
  view.unmount();
  await act(async () => pending.resolve());
  expect(fixture.toast).not.toHaveBeenCalled();
});

it('localizes pending, success and retry guidance in Chinese', async () => {
  await i18n.changeLanguage('zh-CN');
  const pending = deferred();
  writeText.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('Denied'));
  render(<Worktrees projectId="copy-project" />);
  const copy = (await screen.findAllByRole('button', { name: '复制路径' }))[0];
  fireEvent.click(copy);
  expect(screen.getByRole('button', { name: '正在复制路径…' })).toBeDisabled();
  expect(fixture.toast).not.toHaveBeenCalled();
  await act(async () => pending.resolve());
  expect(fixture.toast).toHaveBeenLastCalledWith({ title: '路径已复制' });
  fireEvent.click(screen.getAllByRole('button', { name: '复制路径' })[0]);
  await waitFor(() => expect(fixture.toast).toHaveBeenLastCalledWith({
    title: '无法复制路径', description: '剪贴板访问失败，请再次点击「复制路径」重试。', variant: 'destructive'
  }));
});
