/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTerminalStore, type Terminal } from '../../../stores/terminal-store';
import { usePtyProcess } from '../usePtyProcess';
import type { IPCResult, TerminalCreateOptions, TerminalRestoreResult, TerminalSession } from '../../../../shared/types';

type HookOptions = Parameters<typeof usePtyProcess>[0];
const terminalId = 'pty-lifecycle-fixture';
const projectPath = '/tmp/forge-pty-lifecycle-project';
const createTerminal = vi.fn<(options: TerminalCreateOptions) => Promise<IPCResult>>();
const restoreTerminalSession = vi.fn<(session: TerminalSession, cols?: number, rows?: number) => Promise<IPCResult<TerminalRestoreResult>>>();
const destroyTerminal = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function seedTerminal(isRestored = false): Terminal {
  const terminal: Terminal = {
    id: terminalId, title: 'Lifecycle fixture', cwd: '/tmp', projectPath,
    status: 'idle', createdAt: new Date('2026-09-28T00:00:00Z'), isCLIMode: false, isRestored,
  };
  useTerminalStore.setState({ terminals: [terminal], activeTerminalId: terminal.id });
  return terminal;
}

function options(updates: Partial<HookOptions> = {}): HookOptions {
  return { terminalId, cwd: '/tmp', projectPath, cols: 80, rows: 24, ...updates };
}

beforeEach(() => {
  useTerminalStore.getState().clearAllTerminals();
  createTerminal.mockReset().mockResolvedValue({ success: true });
  restoreTerminalSession.mockReset().mockResolvedValue({ success: true, data: { success: true, terminalId } });
  destroyTerminal.mockReset();
  Object.assign(window.electronAPI, { createTerminal, restoreTerminalSession, destroyTerminal });
});
afterEach(() => {
  cleanup();
  useTerminalStore.getState().clearAllTerminals();
  if (vi.isFakeTimers()) vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PTY creation attempt lifecycle', () => {
  it.each(['create', 'restore'] as const)('latches a failed %s attempt across fresh callbacks and dimension changes until explicit retry', async (mode) => {
    const original = seedTerminal(mode === 'restore');
    const first = deferred<IPCResult<TerminalRestoreResult>>();
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockReturnValueOnce(first.promise);
    const firstError = vi.fn();
    const latestError = vi.fn();
    const firstCreated = vi.fn();
    const latestCreated = vi.fn();
    const { result, rerender } = renderHook((props: HookOptions) => usePtyProcess({
      ...props, onCreated: () => props.onCreated?.(), onError: (error) => props.onError?.(error),
    }), { initialProps: options({ onCreated: firstCreated, onError: firstError }) });
    rerender(options({ cols: 100, rows: 30, onCreated: latestCreated, onError: latestError }));
    await act(async () => {
      first.resolve({ success: false, error: 'PTY connection failed', data: { success: false, terminalId, error: 'PTY connection failed' } });
    });
    expect(api).toHaveBeenCalledOnce();
    expect(firstError).not.toHaveBeenCalled();
    expect(latestError).toHaveBeenCalledOnce();
    expect(firstCreated).not.toHaveBeenCalled();
    expect(latestCreated).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(original);
    expect(result.current.creationError).toContain('PTY connection failed');
    expect(result.current.isCreated).toBe(false);
    for (let index = 0; index < 12; index++) {
      rerender(options({ cols: 101 + index, rows: 31 + index, onCreated: latestCreated, onError: latestError }));
    }
    expect(api).toHaveBeenCalledOnce();
    expect(latestError).toHaveBeenCalledOnce();
    await act(async () => { result.current.retryCreation(); });
    await waitFor(() => expect(latestCreated).toHaveBeenCalledOnce());
    expect(api).toHaveBeenCalledTimes(2);
    expect(result.current.creationError).toBeNull();
    expect(useTerminalStore.getState().getTerminal(terminalId)?.status).toBe('running');
    if (mode === 'restore') expect(useTerminalStore.getState().getTerminal(terminalId)?.isRestored).toBe(false);
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it.each(['create', 'restore'] as const)('uses the latest callbacks for a pending successful %s without starting a second IPC', async (mode) => {
    seedTerminal(mode === 'restore');
    const pending = deferred<IPCResult<TerminalRestoreResult>>();
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockReturnValueOnce(pending.promise);
    const firstCreated = vi.fn();
    const latestCreated = vi.fn();
    const onError = vi.fn();
    const { rerender } = renderHook((props: HookOptions) => usePtyProcess(props), {
      initialProps: options({ onCreated: firstCreated, onError }),
    });
    rerender(options({ cols: 120, rows: 36, onCreated: latestCreated, onError: vi.fn() }));
    await act(async () => { pending.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(api).toHaveBeenCalledOnce();
    expect(firstCreated).not.toHaveBeenCalled();
    expect(latestCreated).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().getTerminal(terminalId)?.status).toBe('running');
  });

  it.each(['create', 'restore'] as const)('reports a rejected %s IPC once and does not retry on callback changes', async (mode) => {
    const original = seedTerminal(mode === 'restore');
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockRejectedValueOnce(new Error('Connection interrupted'));
    const onError = vi.fn();
    const onCreated = vi.fn();
    const { rerender } = renderHook((props: HookOptions) => usePtyProcess(props), {
      initialProps: options({ onError, onCreated }),
    });
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    rerender(options({ cols: 96, rows: 28, onError: (error) => onError(error), onCreated: () => onCreated() }));
    expect(api).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    expect(onCreated).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(original);
  });

  it.each(['create', 'restore'] as const)('preserves a failed %s error while an explicit retry is pending', async (mode) => {
    seedTerminal(mode === 'restore');
    const pending = deferred<IPCResult<TerminalRestoreResult>>();
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockResolvedValueOnce({ success: false, error: 'Saved failure', data: { success: false, terminalId, error: 'Saved failure' } })
      .mockReturnValueOnce(pending.promise);
    const onCreated = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => usePtyProcess(options({ onCreated, onError })));
    await waitFor(() => expect(result.current.creationError).toBe('Saved failure'));
    act(() => { result.current.retryCreation(); });
    expect(api).toHaveBeenCalledTimes(2);
    expect(result.current.isCreating).toBe(true);
    expect(result.current.creationError).toBe('Saved failure');
    expect(onCreated).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(result.current.creationError).toBeNull();
    expect(onCreated).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('keeps an exited terminal unchanged when its deliberate recreation fails', async () => {
    seedTerminal();
    useTerminalStore.getState().setTerminalStatus(terminalId, 'exited');
    const exited = useTerminalStore.getState().getTerminal(terminalId);
    createTerminal.mockResolvedValueOnce({ success: false, error: 'Cannot recreate process' });
    const onError = vi.fn();
    const onCreated = vi.fn();
    renderHook(() => usePtyProcess(options({ isRecreatingRef: { current: true }, onError, onCreated })));
    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(exited);
    expect(useTerminalStore.getState().getTerminal(terminalId)?.status).toBe('exited');
    expect(onCreated).not.toHaveBeenCalled();
    expect(createTerminal).toHaveBeenCalledOnce();
  });

  it.each([
    ['create', false], ['create', true], ['restore', false], ['restore', true],
  ] as const)('bounds StrictMode %s attachment on success=%s across subsequent UI rerenders', async (mode, succeeds) => {
    const original = seedTerminal(mode === 'restore');
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockResolvedValue({ success: succeeds, error: succeeds ? undefined : 'Replay failure', data: { success: succeeds, terminalId } });
    const onCreated = vi.fn();
    const onError = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { rerender } = renderHook((props: HookOptions) => usePtyProcess({
      ...props, onCreated: () => props.onCreated?.(), onError: (error) => props.onError?.(error),
    }), { initialProps: options({ onCreated, onError }), wrapper });
    await waitFor(() => expect(succeeds ? onCreated : onError).toHaveBeenCalledOnce());
    const attachmentCount = api.mock.calls.length;
    expect(attachmentCount).toBeGreaterThanOrEqual(1);
    expect(attachmentCount).toBeLessThanOrEqual(2);
    for (let index = 0; index < 10; index++) {
      rerender(options({ cols: 90 + index, rows: 25 + index, onCreated, onError }));
    }
    expect(api).toHaveBeenCalledTimes(attachmentCount);
    expect(succeeds ? onCreated : onError).toHaveBeenCalledOnce();
    expect(succeeds ? onError : onCreated).not.toHaveBeenCalled();
    if (!succeeds) expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(original);
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it.each(['create', 'restore'] as const)('invalidates a pending %s acknowledgement across prepared recreation with the same context', async (mode) => {
    const original = seedTerminal(mode === 'restore');
    const oldAttempt = deferred<IPCResult<TerminalRestoreResult>>();
    const newAttempt = deferred<IPCResult<TerminalRestoreResult>>();
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockReturnValueOnce(oldAttempt.promise).mockReturnValueOnce(newAttempt.promise);
    const onCreated = vi.fn();
    const onError = vi.fn();
    const isRecreatingRef = { current: false };
    const { result } = renderHook(() => usePtyProcess(options({ onCreated, onError, isRecreatingRef })));
    act(() => {
      isRecreatingRef.current = true;
      result.current.prepareForRecreate();
      result.current.resetForRecreate();
    });
    expect(api).toHaveBeenCalledTimes(2);
    await act(async () => { oldAttempt.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(true);
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(original);
    await act(async () => { newAttempt.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(result.current.isCreating).toBe(false);
    expect(useTerminalStore.getState().getTerminal(terminalId)?.status).toBe('running');
  });

  it('resetForRecreate triggers a new attempt when all option and callback identities are stable', async () => {
    seedTerminal();
    const onCreated = vi.fn();
    const isRecreatingRef = { current: false };
    const stable = options({ onCreated, onError: vi.fn(), isRecreatingRef });
    const { result } = renderHook(() => usePtyProcess(stable));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    await act(async () => {
      isRecreatingRef.current = true;
      result.current.resetForRecreate();
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2));
    expect(createTerminal).toHaveBeenCalledTimes(2);
    expect(isRecreatingRef.current).toBe(false);
  });

  it('prepareForRecreate blocks a new cwd until resetForRecreate is called', async () => {
    seedTerminal();
    const onCreated = vi.fn();
    const isRecreatingRef = { current: false };
    const { result, rerender } = renderHook((props: HookOptions) => usePtyProcess(props), {
      initialProps: options({ onCreated, isRecreatingRef }),
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    act(() => {
      isRecreatingRef.current = true;
      result.current.prepareForRecreate();
      useTerminalStore.getState().updateTerminal(terminalId, { cwd: '/tmp/new-worktree' });
    });
    rerender(options({ cwd: '/tmp/new-worktree', onCreated, isRecreatingRef }));
    expect(createTerminal).toHaveBeenCalledOnce();
    await act(async () => { result.current.resetForRecreate(); });
    await waitFor(() => expect(createTerminal).toHaveBeenCalledTimes(2));
    expect(createTerminal.mock.calls.at(-1)?.[0]).toMatchObject({ cwd: '/tmp/new-worktree' });
  });

  it('allows a successful remount to idempotently attach while preserving already-running store state', async () => {
    seedTerminal();
    const firstCreated = vi.fn();
    const first = renderHook(() => usePtyProcess(options({ onCreated: firstCreated })));
    await waitFor(() => expect(firstCreated).toHaveBeenCalledOnce());
    const running = useTerminalStore.getState().getTerminal(terminalId);
    first.unmount();
    const onCreated = vi.fn();
    renderHook(() => usePtyProcess(options({ onCreated })));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(createTerminal).toHaveBeenCalledTimes(2);
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(running);
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it.each(['create', 'restore'] as const)('ignores an unmounted %s acknowledgement without mutating terminal state or callbacks', async (mode) => {
    const original = seedTerminal(mode === 'restore');
    const pending = deferred<IPCResult<TerminalRestoreResult>>();
    const api = mode === 'restore' ? restoreTerminalSession : createTerminal;
    api.mockReturnValueOnce(pending.promise);
    const onCreated = vi.fn();
    const onError = vi.fn();
    const { unmount } = renderHook(() => usePtyProcess(options({ onCreated, onError })));
    unmount();
    await act(async () => { pending.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(original);
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it.each(['projectPath', 'cwd'] as const)('ignores stale success after the captured %s changes', async (field) => {
    seedTerminal(true);
    const oldAttempt = deferred<IPCResult<TerminalRestoreResult>>();
    const currentAttempt = deferred<IPCResult<TerminalRestoreResult>>();
    restoreTerminalSession.mockReturnValueOnce(oldAttempt.promise).mockReturnValueOnce(currentAttempt.promise);
    const onCreated = vi.fn();
    const onError = vi.fn();
    const { rerender } = renderHook((props: HookOptions) => usePtyProcess(props), {
      initialProps: options({ onCreated, onError }),
    });
    const changed = { [field]: '/tmp/changed-context' };
    act(() => { useTerminalStore.getState().updateTerminal(terminalId, changed); });
    const replacement = useTerminalStore.getState().getTerminal(terminalId);
    rerender(options({ ...changed, onCreated, onError }));
    await act(async () => { oldAttempt.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(replacement);
    expect(restoreTerminalSession).toHaveBeenCalledTimes(2);
    await act(async () => { currentAttempt.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(useTerminalStore.getState().getTerminal(terminalId)?.status).toBe('running');
  });

  it.each(['projectPath', 'cwd'] as const)('rejects a stale acknowledgement when store %s changes before hook props update', async (field) => {
    seedTerminal(true);
    const pending = deferred<IPCResult<TerminalRestoreResult>>();
    restoreTerminalSession.mockReturnValueOnce(pending.promise);
    const onCreated = vi.fn();
    const onError = vi.fn();
    renderHook(() => usePtyProcess(options({ onCreated, onError })));
    act(() => { useTerminalStore.getState().updateTerminal(terminalId, { [field]: '/tmp/reassigned-session' }); });
    const replacement = useTerminalStore.getState().getTerminal(terminalId);
    await act(async () => { pending.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(useTerminalStore.getState().getTerminal(terminalId)).toBe(replacement);
    expect(restoreTerminalSession).toHaveBeenCalledOnce();
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it.each(['clone', 'deleted'] as const)('accepts a restore acknowledgement after Main synchronizes %s worktree config and title', async (configChange) => {
    seedTerminal(true);
    const initialConfig = {
      name: 'restore-fixture', worktreePath: '/tmp/restore-fixture', branchName: 'terminal/restore-fixture',
      baseBranch: 'main', hasGitBranch: true, createdAt: '2026-09-28T00:00:00Z', terminalId,
    };
    useTerminalStore.getState().setWorktreeConfig(terminalId, initialConfig);
    const pending = deferred<IPCResult<TerminalRestoreResult>>();
    restoreTerminalSession.mockReturnValueOnce(pending.promise);
    const onCreated = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => usePtyProcess(options({ onCreated, onError })));
    const syncedConfig = configChange === 'clone' ? { ...initialConfig } : undefined;
    act(() => {
      useTerminalStore.getState().setWorktreeConfig(terminalId, syncedConfig);
      useTerminalStore.getState().updateTerminal(terminalId, { title: 'Main restored title' });
    });
    await act(async () => { pending.resolve({ success: true, data: { success: true, terminalId } }); });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.isCreating).toBe(false);
    expect(result.current.isCreated).toBe(true);
    expect(useTerminalStore.getState().getTerminal(terminalId)).toMatchObject({
      cwd: '/tmp', projectPath, title: 'Main restored title', status: 'running', isRestored: false,
    });
    expect(useTerminalStore.getState().getTerminal(terminalId)?.worktreeConfig).toBe(syncedConfig);
    expect(restoreTerminalSession).toHaveBeenCalledOnce();
    expect(createTerminal).not.toHaveBeenCalled();
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it('bounds unavailable recreation dimensions to 30 retries and requires explicit retry after exhaustion', async () => {
    seedTerminal();
    vi.useFakeTimers();
    const timerSpy = vi.spyOn(globalThis, 'setTimeout');
    const isRecreatingRef = { current: true };
    const onError = vi.fn();
    const onCreated = vi.fn();
    const { result, rerender } = renderHook((props: HookOptions) => usePtyProcess(props), {
      initialProps: options({ skipCreation: true, isRecreatingRef, onError, onCreated }),
    });
    for (let index = 0; index < 30; index++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(timerSpy.mock.calls.filter((call) => call[1] === 100)).toHaveLength(30);
    expect(onError).toHaveBeenCalledOnce();
    expect(onCreated).not.toHaveBeenCalled();
    expect(createTerminal).not.toHaveBeenCalled();
    expect(isRecreatingRef.current).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    rerender(options({ skipCreation: false, cols: 120, rows: 40, isRecreatingRef, onError: (error) => onError(error), onCreated }));
    expect(createTerminal).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    await act(async () => { result.current.retryCreation(); });
    expect(createTerminal).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledOnce();
    expect(result.current.creationError).toBeNull();
    expect(destroyTerminal).not.toHaveBeenCalled();
  });

  it('explicit retry restarts bounded recreation waits while dimensions remain unavailable', async () => {
    seedTerminal();
    vi.useFakeTimers();
    const timerSpy = vi.spyOn(globalThis, 'setTimeout');
    const isRecreatingRef = { current: true };
    const onError = vi.fn();
    const onCreated = vi.fn();
    const { result } = renderHook(() => usePtyProcess(options({ skipCreation: true, isRecreatingRef, onError, onCreated })));
    for (let index = 0; index < 30; index++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(onError).toHaveBeenCalledOnce();
    expect(timerSpy.mock.calls.filter((call) => call[1] === 100)).toHaveLength(30);
    act(() => { result.current.retryCreation(); });
    expect(result.current.isCreating).toBe(true);
    expect(result.current.creationError).toBe('Terminal recreation failed: dimensions not ready');
    expect(isRecreatingRef.current).toBe(true);
    for (let index = 0; index < 30; index++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(timerSpy.mock.calls.filter((call) => call[1] === 100)).toHaveLength(60);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(result.current.isCreating).toBe(false);
    expect(isRecreatingRef.current).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onError).toHaveBeenCalledTimes(2);
    expect(createTerminal).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(destroyTerminal).not.toHaveBeenCalled();
  });
});
