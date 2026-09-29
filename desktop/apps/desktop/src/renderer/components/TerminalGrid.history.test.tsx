/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../shared/i18n';
import type { IPCResult, TerminalSession } from '../../shared/types';
import { terminalBufferManager } from '../lib/terminal-buffer-manager';
import { useTerminalStore, type Terminal } from '../stores/terminal-store';
import { TerminalGrid } from './TerminalGrid';

const wrapperCleanup = vi.hoisted(() => ({ simulateXtermCleanup: false, unmounted: [] as string[] }));
vi.mock('./SortableTerminalWrapper', async () => {
  const { useEffect } = await import('react');
  const { terminalBufferManager: buffers } = await import('../lib/terminal-buffer-manager');
  return {
    SortableTerminalWrapper: ({ id }: { id: string }) => {
      useEffect(() => () => {
        wrapperCleanup.unmounted.push(id);
        if (wrapperCleanup.simulateXtermCleanup) buffers.set(id, 'exited xterm cleanup snapshot');
      }, [id]);
      return <div data-testid={`terminal-${id}`}>{id}</div>;
    },
  };
});
vi.mock('./ClaudeCodeStatusBadge', () => ({ ClaudeCodeStatusBadge: () => null }));
vi.mock('./FileExplorerPanel', () => ({ FileExplorerPanel: () => null }));
vi.mock('../stores/task-store', () => ({ useTaskStore: (select: (state: { tasks: [] }) => unknown) => select({ tasks: [] }) }));
vi.mock('../stores/file-explorer-store', () => ({
  useFileExplorerStore: (select: (state: { isOpen: boolean; toggle: () => void }) => unknown) => select({ isOpen: false, toggle: vi.fn() }),
}));

const projectA = '/fixture/project-a';
const projectB = '/fixture/project-b';
const date = '2026-09-27';
const timestamp = '2026-09-27T12:00:00.000Z';
const session = (id: string, changes: Partial<TerminalSession> = {}): TerminalSession => ({
  id, title: `Saved ${id}`, cwd: projectA, projectPath: projectA, isCLIMode: false,
  outputBuffer: `saved ${id}`, createdAt: timestamp, lastActiveAt: timestamp, ...changes,
});
const current = (id: string, changes: Partial<Terminal> = {}): Terminal => ({
  id, title: `Live ${id}`, cwd: projectA, projectPath: projectA, isCLIMode: false,
  status: 'running', createdAt: new Date(timestamp), ...changes,
});
const restoreSuccess = (id: string) => ({ success: true, data: { success: true, terminalId: id, outputBuffer: `ack ${id}` } });
const api = {
  getTerminalSessionDates: vi.fn(),
  getTerminalSessionsForDate: vi.fn(),
  restoreTerminalSession: vi.fn(),
  restoreTerminalSessionsFromDate: vi.fn(),
  destroyTerminal: vi.fn(),
};
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Fixture not initialized'); };
  let reject: (reason: unknown) => void = () => { throw new Error('Fixture not initialized'); };
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const terminalIds = () => useTerminalStore.getState().terminals.map((terminal) => terminal.id);
async function chooseHistory() {
  const history = await screen.findByRole('button', { name: i18n.t('uiTerminal:history') });
  await waitFor(() => expect(history).toBeEnabled());
  fireEvent.keyDown(history, { key: 'Enter', code: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem'));
}
async function expectFailure(key: string) {
  expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t(`uiTerminal:${key}`));
  expect(screen.getByRole('button', { name: i18n.t('common:buttons.retry') })).toBeEnabled();
  expect(screen.getByRole('button', { name: i18n.t('uiTerminal:history') })).toBeEnabled();
}
beforeEach(() => {
  wrapperCleanup.simulateXtermCleanup = false;
  wrapperCleanup.unmounted = [];
  for (const mock of Object.values(api)) mock.mockReset();
  Object.assign(window.electronAPI, api);
  api.getTerminalSessionDates.mockResolvedValue({ success: true, data: [{ date, label: 'Yesterday', sessionCount: 2, projectCount: 1 }] });
  api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('saved-1')] });
  api.restoreTerminalSession.mockImplementation((saved: TerminalSession) => Promise.resolve(restoreSuccess(saved.id)));
  api.destroyTerminal.mockResolvedValue({ success: true });
  useTerminalStore.setState({ terminals: [current('original-1'), current('original-2')], activeTerminalId: 'original-1', hasRestoredSessions: false });
  terminalBufferManager.set('original-1', 'live original output');
});
afterEach(() => {
  cleanup();
  for (const terminal of useTerminalStore.getState().terminals) useTerminalStore.getState().removeTerminal(terminal.id);
});

describe('Terminal history restores', () => {
  it.each(['returned failure', 'throw', 'empty', 'invalid', 'duplicate', 'foreign project'])(
    'keeps both live terminal DOM nodes and buffers when history reads %s', async (failure) => {
      if (failure === 'returned failure') api.getTerminalSessionsForDate.mockResolvedValue({ success: false });
      else if (failure === 'throw') api.getTerminalSessionsForDate.mockRejectedValue(new Error('Private path'));
      else if (failure === 'empty') api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [] });
      else if (failure === 'invalid') api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('bad', { cwd: '' })] });
      else if (failure === 'duplicate') api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('same'), session('same')] });
      else api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('foreign', { projectPath: projectB })] });
      render(<TerminalGrid projectPath={projectA} />);
      const originalNode = screen.getByTestId('terminal-original-1');
      await chooseHistory();
      await expectFailure(failure === 'empty' ? 'restoreEmpty' : ['invalid', 'duplicate', 'foreign project'].includes(failure) ? 'restoreInvalid' : 'restoreFailed');
      expect(terminalIds()).toEqual(['original-1', 'original-2']);
      expect(screen.getByTestId('terminal-original-1')).toBe(originalNode);
      expect(terminalBufferManager.get('original-1')).toBe('live original output');
      expect(api.restoreTerminalSession).not.toHaveBeenCalled();
      expect(api.destroyTerminal).not.toHaveBeenCalled();
      expect(api.restoreTerminalSessionsFromDate).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).not.toHaveTextContent('Private path');
    },
  );

  it.each(['returned failure', 'throw', 'inner failure', 'wrong ID'])(
    'keeps live terminals when a restore acknowledgement reports %s and retries', async (failure) => {
      if (failure === 'throw') api.restoreTerminalSession.mockRejectedValueOnce(new Error('PTY unavailable'));
      else api.restoreTerminalSession.mockResolvedValueOnce(failure === 'returned failure' ? { success: false }
        : failure === 'inner failure' ? { success: true, data: { success: false, terminalId: 'saved-1' } }
          : restoreSuccess('different-id'));
      render(<TerminalGrid projectPath={projectA} />);
      await chooseHistory();
      await expectFailure('restoreFailed');
      expect(terminalIds()).toEqual(['original-1', 'original-2']);
      expect(api.destroyTerminal).not.toHaveBeenCalled();
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
      await waitFor(() => expect(terminalIds()).toEqual(['saved-1']));
      expect(api.restoreTerminalSession).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('adds only acknowledged sessions, keeps originals on partial success, and retries missing IDs before replacing originals', async () => {
    api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('saved-2', { displayOrder: 2 }), session('saved-1', { displayOrder: 1 })] });
    const first = deferred<ReturnType<typeof restoreSuccess>>();
    api.restoreTerminalSession.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ success: false });
    render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    expect(api.restoreTerminalSession).toHaveBeenCalledExactlyOnceWith(session('saved-1', { displayOrder: 1 }), 80, 24);
    expect(terminalIds()).toEqual(['original-1', 'original-2']);
    expect(api.destroyTerminal).not.toHaveBeenCalled();
    await act(async () => first.resolve(restoreSuccess('saved-1')));
    await expectFailure('restorePartial');
    expect(terminalIds()).toEqual(['original-1', 'original-2', 'saved-1']);
    expect(terminalBufferManager.get('saved-1')).toBe('ack saved-1');
    expect(api.destroyTerminal).not.toHaveBeenCalled();
    const second = deferred<ReturnType<typeof restoreSuccess>>();
    api.restoreTerminalSession.mockReturnValueOnce(second.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.restoreTerminalSession).toHaveBeenCalledTimes(3));
    expect(api.restoreTerminalSession.mock.calls.map(([saved]) => saved.id)).toEqual(['saved-1', 'saved-2', 'saved-2']);
    expect(api.destroyTerminal).not.toHaveBeenCalled();
    await act(async () => second.resolve(restoreSuccess('saved-2')));
    await waitFor(() => expect(terminalIds()).toEqual(['saved-1', 'saved-2']));
    expect(api.destroyTerminal.mock.calls).toEqual([['original-1'], ['original-2']]);
  });

  it('preserves live shared IDs, DOM identity, CLI state, title and current output without reattaching them', async () => {
    api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('original-1', { isCLIMode: true }), session('original-2')] });
    const live = useTerminalStore.getState().terminals[0];
    render(<TerminalGrid projectPath={projectA} />);
    const node = screen.getByTestId('terminal-original-1');
    await chooseHistory();
    await waitFor(() => expect(api.getTerminalSessionDates).toHaveBeenCalledTimes(2));
    expect(useTerminalStore.getState().terminals[0]).toBe(live);
    expect(screen.getByTestId('terminal-original-1')).toBe(node);
    expect(terminalBufferManager.get('original-1')).toBe('live original output');
    expect(live.pendingCLIResume).toBeUndefined();
    expect(api.restoreTerminalSession).not.toHaveBeenCalled();
    expect(api.destroyTerminal).not.toHaveBeenCalled();
  });

  it('rejects a history ID occupied by a different live project without replacing or closing either project', async () => {
    useTerminalStore.setState({ terminals: [current('original-1'), current('saved-1', { projectPath: projectB, cwd: projectB })] });
    render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    await expectFailure('restoreFailed');
    expect(terminalIds()).toEqual(['original-1', 'saved-1']);
    expect(api.restoreTerminalSession).not.toHaveBeenCalled();
    expect(api.destroyTerminal).not.toHaveBeenCalled();
  });

  it.each(['returned failure', 'throw'])('retains old UI and offers retry when closing an original terminal reports %s', async (failure) => {
    if (failure === 'throw') api.destroyTerminal.mockRejectedValueOnce(new Error('Close failed'));
    else api.destroyTerminal.mockResolvedValueOnce({ success: false });
    render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    await expectFailure('restoreCleanupFailed');
    expect(terminalIds()).toEqual(['original-1', 'saved-1']);
    expect(screen.getByTestId('terminal-original-1')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    await waitFor(() => expect(terminalIds()).toEqual(['saved-1']));
    expect(api.restoreTerminalSession).toHaveBeenCalledOnce();
    expect(api.destroyTerminal.mock.calls).toEqual([['original-1'], ['original-2'], ['original-1']]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces an exited renderer entry only after its new PTY acknowledges restoration', async () => {
    wrapperCleanup.simulateXtermCleanup = true;
    useTerminalStore.setState({ terminals: [current('original-1'), current('saved-1')] });
    const pending = deferred<ReturnType<typeof restoreSuccess>>();
    api.restoreTerminalSession.mockReturnValueOnce(pending.promise);
    render(<TerminalGrid projectPath={projectA} />);
    act(() => useTerminalStore.getState().updateTerminal('saved-1', { status: 'exited' }));
    expect(screen.getByTestId('terminal-saved-1')).toBeInTheDocument();
    wrapperCleanup.unmounted = [];
    await chooseHistory();
    expect(useTerminalStore.getState().getTerminal('saved-1')?.status).toBe('exited');
    await act(async () => pending.resolve(restoreSuccess('saved-1')));
    await waitFor(() => expect(terminalIds()).toEqual(['saved-1']));
    expect(useTerminalStore.getState().getTerminal('saved-1')?.isRestored).toBe(true);
    expect(useTerminalStore.getState().getTerminal('saved-1')?.status).toBe('idle');
    expect(wrapperCleanup.unmounted).toContain('saved-1');
    expect(terminalBufferManager.get('saved-1')).toBe('ack saved-1');
  });

  it('preserves an original terminal repurposed to a worktree while restoration is pending', async () => {
    const pending = deferred<ReturnType<typeof restoreSuccess>>();
    api.restoreTerminalSession.mockReturnValueOnce(pending.promise);
    render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    act(() => useTerminalStore.getState().updateTerminal('original-1', { cwd: '/fixture/worktree', title: 'New worktree' }));
    await act(async () => pending.resolve(restoreSuccess('saved-1')));
    await expectFailure('restoreCleanupFailed');
    expect(terminalIds()).toEqual(['original-1', 'saved-1']);
    expect(useTerminalStore.getState().getTerminal('original-1')?.cwd).toBe('/fixture/worktree');
    expect(api.destroyTerminal.mock.calls).toEqual([['original-2']]);
  });

  it('does not remove a replacement store entry created while an original close acknowledgement is pending', async () => {
    const pending = deferred<IPCResult<void>>();
    api.destroyTerminal.mockReturnValueOnce(pending.promise);
    render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    await waitFor(() => expect(api.destroyTerminal).toHaveBeenCalledWith('original-1'));
    act(() => useTerminalStore.getState().updateTerminal('original-1', { cwd: '/fixture/new-terminal', createdAt: new Date('2026-09-28') }));
    await act(async () => pending.resolve({ success: true }));
    await expectFailure('restoreCleanupFailed');
    expect(terminalIds()).toEqual(['original-1', 'saved-1']);
    expect(useTerminalStore.getState().getTerminal('original-1')?.cwd).toBe('/fixture/new-terminal');
  });

  it('stops a stale history read after project switching without dispatching any restore or close', async () => {
    const pending = deferred<IPCResult<TerminalSession[]>>();
    api.getTerminalSessionsForDate.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    rerender(<TerminalGrid projectPath={projectB} />);
    await act(async () => pending.resolve({ success: true, data: [session('saved-1')] }));
    expect(terminalIds()).toEqual(['original-1', 'original-2']);
    expect(api.restoreTerminalSession).not.toHaveBeenCalled();
    expect(api.destroyTerminal).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('records an acknowledged old-project PTY after switching, stops the remaining batch, and keeps both projects intact', async () => {
    useTerminalStore.setState({ terminals: [current('original-1'), current('project-b-live', { projectPath: projectB, cwd: projectB })] });
    api.getTerminalSessionsForDate.mockResolvedValue({ success: true, data: [session('saved-1'), session('saved-2')] });
    const pending = deferred<ReturnType<typeof restoreSuccess>>();
    api.restoreTerminalSession.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    await waitFor(() => expect(api.restoreTerminalSession).toHaveBeenCalledOnce());
    rerender(<TerminalGrid projectPath={projectB} />);
    act(() => useTerminalStore.getState().setActiveTerminal('project-b-live'));
    await act(async () => pending.resolve(restoreSuccess('saved-1')));
    expect(terminalIds()).toEqual(['original-1', 'project-b-live', 'saved-1']);
    expect(useTerminalStore.getState().getTerminal('saved-1')?.projectPath).toBe(projectA);
    expect(useTerminalStore.getState().activeTerminalId).toBe('project-b-live');
    expect(screen.getByTestId('terminal-project-b-live')).toBeInTheDocument();
    expect(screen.queryByTestId('terminal-saved-1')).not.toBeInTheDocument();
    expect(api.restoreTerminalSession).toHaveBeenCalledOnce();
    expect(api.destroyTerminal).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not activate an acknowledged old-project PTY when the newly selected project has no active terminal', async () => {
    const pending = deferred<ReturnType<typeof restoreSuccess>>();
    api.restoreTerminalSession.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<TerminalGrid projectPath={projectA} />);
    await chooseHistory();
    await waitFor(() => expect(api.restoreTerminalSession).toHaveBeenCalledOnce());
    rerender(<TerminalGrid projectPath={projectB} />);
    act(() => useTerminalStore.getState().setActiveTerminal(null));
    await act(async () => pending.resolve(restoreSuccess('saved-1')));
    expect(useTerminalStore.getState().getTerminal('saved-1')?.projectPath).toBe(projectA);
    expect(useTerminalStore.getState().activeTerminalId).toBeNull();
    expect(screen.queryByTestId('terminal-saved-1')).not.toBeInTheDocument();
    expect(api.destroyTerminal).not.toHaveBeenCalled();
  });

  it('does not display old-project history loading failures in the newly selected project', async () => {
    const pending = deferred<IPCResult<never[]>>();
    api.getTerminalSessionDates.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<TerminalGrid projectPath={projectA} />);
    rerender(<TerminalGrid projectPath={projectB} />);
    await act(async () => pending.resolve({ success: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'History' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['en', 'zh-CN'] as const)('keeps History available in the empty state and localizes loading failure plus retry in %s', async (language) => {
    await i18n.changeLanguage(language);
    useTerminalStore.setState({ terminals: [], activeTerminalId: null });
    api.getTerminalSessionDates.mockResolvedValueOnce({ success: false });
    render(<TerminalGrid projectPath={projectA} />);
    await expectFailure('historyLoadFailed');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: i18n.t('common:buttons.retry') })));
    expect(api.getTerminalSessionDates).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: i18n.t('uiTerminal:history') })).toBeEnabled();
  });
});
