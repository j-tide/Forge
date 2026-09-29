import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalSession } from '../../terminal-session-store';
import type { TerminalProcess } from '../types';
import * as PtyManager from '../pty-manager';
import * as SessionHandler from '../session-handler';
import { safeSendToRenderer } from '../../ipc-handlers/utils';
import { createTerminal, restoreTerminal, restoreSessionsFromDate, type RestoreOptions } from '../terminal-lifecycle';

vi.mock('../pty-manager', () => ({
  getActiveProfileEnv: vi.fn(() => ({})),
  spawnPtyProcess: vi.fn(),
  setupPtyHandlers: vi.fn(),
}));
vi.mock('../session-handler', () => ({
  clearPendingDelete: vi.fn(),
  getSavedSessions: vi.fn(),
  getSessionsForDate: vi.fn(),
  persistSessionAsync: vi.fn(),
}));
vi.mock('../../claude-code-settings', () => ({ getClaudeCodeEnv: vi.fn(() => ({})) }));
vi.mock('../../ipc-handlers/utils', () => ({ safeSendToRenderer: vi.fn() }));
vi.mock('../../../shared/utils/debug-logger', () => ({ debugLog: vi.fn(), debugError: vi.fn() }));

const projectPath = '/tmp/forge-history-project';
const session = (id: string): TerminalSession => ({
  id, title: `Historical ${id}`, cwd: '/tmp', projectPath,
  isCLIMode: true, claudeSessionId: 'historical-cli-session',
  outputBuffer: `Historical output ${id}`, createdAt: '2026-09-27T00:00:00Z', lastActiveAt: '2026-09-27T01:00:00Z',
});
const liveTerminal = (id = 'current'): TerminalProcess => ({
  id, title: 'Current title', cwd: '/tmp', projectPath, pty: {} as TerminalProcess['pty'],
  isCLIMode: false, outputBuffer: 'Current live output', claudeSessionId: 'current-cli-session',
  pendingCLIResume: false,
});
const getWindow = () => null;
const dataHandler = vi.fn();
const restoreOptions: RestoreOptions = { resumeClaudeSession: true, captureSessionId: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(PtyManager.getActiveProfileEnv).mockReturnValue({});
  vi.mocked(PtyManager.spawnPtyProcess).mockReturnValue({ pty: { pid: 123 } as TerminalProcess['pty'] });
  vi.mocked(SessionHandler.getSavedSessions).mockReturnValue([]);
  vi.mocked(SessionHandler.getSessionsForDate).mockReturnValue([]);
});

describe('Terminal history restore preserves live sessions', () => {
  it('reattaches the same live PTY without applying historical metadata, persistence or resume events', async () => {
    const current = liveTerminal();
    const before = { ...current };
    const terminals = new Map([[current.id, current]]);
    const result = await restoreTerminal(session(current.id), terminals, getWindow, dataHandler, restoreOptions);
    expect(result).toEqual({ success: true, outputBuffer: 'Current live output' });
    expect(terminals.get(current.id)).toBe(current);
    expect(current).toEqual(before);
    expect(SessionHandler.getSavedSessions).not.toHaveBeenCalled();
    expect(SessionHandler.persistSessionAsync).not.toHaveBeenCalled();
    expect(PtyManager.spawnPtyProcess).not.toHaveBeenCalled();
    expect(safeSendToRenderer).not.toHaveBeenCalled();
  });

  it.each([
    { projectPath: '/tmp/another-project' },
    { cwd: '/' },
  ])('rejects an occupied ID with incompatible project or cwd without changing the current PTY: %j', async (changes) => {
    const current = liveTerminal();
    const before = { ...current };
    const terminals = new Map([[current.id, current]]);
    const result = await restoreTerminal({ ...session(current.id), ...changes }, terminals, getWindow, dataHandler, restoreOptions);
    expect(result.success).toBe(false);
    expect(current).toEqual(before);
    expect(terminals.get(current.id)).toBe(current);
    expect(PtyManager.spawnPtyProcess).not.toHaveBeenCalled();
    expect(SessionHandler.persistSessionAsync).not.toHaveBeenCalled();
    expect(safeSendToRenderer).not.toHaveBeenCalled();
  });

  it('retains ordinary create idempotency for an existing terminal', async () => {
    const current = liveTerminal();
    const terminals = new Map([[current.id, current]]);
    expect(await createTerminal({ id: current.id, cwd: current.cwd, projectPath }, terminals, getWindow, dataHandler)).toEqual({ success: true });
    expect(terminals.get(current.id)).toBe(current);
    expect(PtyManager.spawnPtyProcess).not.toHaveBeenCalled();
  });

  it('does not overwrite a compatible replacement PTY created while the restore awaits creation', async () => {
    const replacement = liveTerminal('historical');
    const terminals = new Map<string, TerminalProcess>();
    vi.mocked(PtyManager.setupPtyHandlers).mockImplementationOnce(() => {
      queueMicrotask(() => terminals.set(replacement.id, replacement));
    });
    const result = await restoreTerminal(session(replacement.id), terminals, getWindow, dataHandler, restoreOptions);
    expect(result).toEqual({ success: true, outputBuffer: replacement.outputBuffer });
    expect(terminals.get(replacement.id)).toBe(replacement);
    expect(replacement.title).toBe('Current title');
    expect(replacement.isCLIMode).toBe(false);
    expect(replacement.pendingCLIResume).toBe(false);
    // Only the initial new PTY was persisted; the replacement received no historical updates.
    expect(SessionHandler.persistSessionAsync).toHaveBeenCalledOnce();
    expect(safeSendToRenderer).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...session('invalid'), id: '' },
    { ...session('invalid'), projectPath: '/tmp/wrong-project' },
    { ...session('invalid'), cwd: '' },
    { ...session('invalid'), title: 42 },
    { ...session('invalid'), outputBuffer: null },
    { ...session('invalid'), isCLIMode: 'true' },
    session('first'),
  ])('prevalidates the complete history before spawning any PTY for invalid or duplicate entry %j', async (invalid) => {
    const current = liveTerminal();
    const terminals = new Map([[current.id, current]]);
    vi.mocked(SessionHandler.getSessionsForDate).mockReturnValue([session('first'), invalid as TerminalSession]);
    const result = await restoreSessionsFromDate('2026-09-27', projectPath, terminals, getWindow, dataHandler, restoreOptions);
    expect(result.restored).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.sessions.every((item) => !item.success)).toBe(true);
    expect(PtyManager.spawnPtyProcess).not.toHaveBeenCalled();
    expect(SessionHandler.getSavedSessions).not.toHaveBeenCalled();
    expect(terminals.size).toBe(1);
    expect(terminals.get(current.id)).toBe(current);
  });

  it('returns every per-session result after one restore throws and retains current sessions', async () => {
    const current = liveTerminal();
    const terminals = new Map([[current.id, current]]);
    vi.mocked(SessionHandler.getSessionsForDate).mockReturnValue([session('first'), session('second'), session('third')]);
    vi.mocked(SessionHandler.getSavedSessions)
      .mockReturnValueOnce([])
      .mockImplementationOnce(() => { throw new Error('History read failed'); })
      .mockReturnValueOnce([]);
    const result = await restoreSessionsFromDate('2026-09-27', projectPath, terminals, getWindow, dataHandler, restoreOptions);
    expect(result).toEqual({
      restored: 2, failed: 1,
      sessions: [
        { id: 'first', success: true, error: undefined },
        { id: 'second', success: false, error: 'History read failed' },
        { id: 'third', success: true, error: undefined },
      ],
    });
    expect(terminals.get(current.id)).toBe(current);
    expect(current.title).toBe('Current title');
    expect(PtyManager.spawnPtyProcess).toHaveBeenCalledTimes(2);
  });

  it('returns an empty result without changing current terminals for empty history', async () => {
    const current = liveTerminal();
    const terminals = new Map([[current.id, current]]);
    expect(await restoreSessionsFromDate('2026-09-27', projectPath, terminals, getWindow, dataHandler, restoreOptions))
      .toEqual({ restored: 0, failed: 0, sessions: [] });
    expect(terminals.get(current.id)).toBe(current);
    expect(PtyManager.spawnPtyProcess).not.toHaveBeenCalled();
  });
});
