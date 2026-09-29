/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n';
import type { IPCResult, TerminalRestoreResult } from '../../../shared/types';
import { useTerminalStore } from '../../stores/terminal-store';
import { Terminal } from '../Terminal';

const xterm = vi.hoisted(() => ({
  writeln: vi.fn(), focus: vi.fn(), fit: vi.fn(() => true), dispose: vi.fn(),
  handleCommandEnter: vi.fn(), cleanup: vi.fn(),
}));
vi.mock('../terminal/useXterm', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    useXterm: ({ onDimensionsReady }: { onDimensionsReady: (cols: number, rows: number) => void }) => {
      const terminalRef = useRef<HTMLDivElement>(null);
      const xtermRef = useRef({ cols: 80, rows: 24 });
      useEffect(() => { onDimensionsReady(80, 24); }, [onDimensionsReady]);
      return { terminalRef, xtermRef, cols: 80, rows: 24, ...xterm };
    },
  };
});
vi.mock('../terminal/useTerminalEvents', () => ({ useTerminalEvents: () => undefined }));
vi.mock('../terminal/useAutoNaming', () => ({ useAutoNaming: () => xterm }));
vi.mock('../terminal/useTerminalFileDrop', () => ({
  useTerminalFileDrop: () => ({ isNativeDragOver: false, handleNativeDragOver: vi.fn(), handleNativeDragLeave: vi.fn(), handleNativeDrop: vi.fn() }),
}));
vi.mock('../terminal/CreateWorktreeDialog', () => ({ CreateWorktreeDialog: () => null }));
vi.mock('../terminal/TerminalHeader', () => ({
  TerminalHeader: ({ terminalId, title }: { terminalId: string; title: string }) => <div data-terminal-id={terminalId}>{title}</div>,
}));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (select?: (state: { settings: object }) => unknown) => select ? select({ settings: {} }) : { settings: {} },
}));

const id = 'initialization-ui-fixture';
const projectPath = '/fixture/terminal-initialization';
const restore = vi.fn();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const props = { id, projectPath, cwd: projectPath, isActive: true, onClose: vi.fn(), onActivate: vi.fn() };
beforeEach(() => {
  restore.mockReset().mockResolvedValue({ success: false, error: 'private endpoint/credential diagnostics' });
  xterm.writeln.mockReset();
  Object.assign(window.electronAPI, { restoreTerminalSession: restore, resizeTerminal: vi.fn().mockResolvedValue({ success: true }) });
  useTerminalStore.setState({ terminals: [{ id, title: 'My shell', cwd: projectPath, projectPath,
    createdAt: new Date('2026-09-28'), status: 'idle', isCLIMode: false, isRestored: true }], activeTerminalId: id });
});
afterEach(() => { cleanup(); useTerminalStore.getState().clearAllTerminals(); });

describe('Terminal initialization error recovery', () => {
  it.each(['en', 'zh-CN'] as const)('keeps the named Retry visible and disabled until its acknowledgement in %s', async (language) => {
    await i18n.changeLanguage(language);
    const { rerender, container } = render(<Terminal {...props} />);
    const originalHeader = container.querySelector('[data-terminal-id]');
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(i18n.t('uiTerminal:initializationFailed'));
    expect(error).not.toHaveTextContent('private endpoint/credential diagnostics');
    expect(xterm.writeln).toHaveBeenCalledOnce();
    expect(xterm.writeln.mock.calls[0][0]).not.toContain('private endpoint/credential diagnostics');
    const pending = deferred<IPCResult<TerminalRestoreResult>>();
    restore.mockReturnValueOnce(pending.promise);
    const retry = screen.getByRole('button', { name: i18n.t('uiTerminal:retryInitialization', { name: 'My shell' }) });
    fireEvent.click(retry);
    expect(retry).toBeDisabled();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toBe(error);
    fireEvent.click(retry);
    rerender(<Terminal {...props} onActivate={vi.fn()} terminalCount={4} />);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(useTerminalStore.getState().getTerminal(id)?.status).toBe('idle');
    await act(async () => pending.resolve({ success: false, error: 'Retry refused' }));
    expect(retry).toBeEnabled();
    expect(retry).toHaveAttribute('aria-busy', 'false');
    expect(xterm.writeln).toHaveBeenCalledTimes(2);
    rerender(<Terminal {...props} onActivate={vi.fn()} terminalCount={2} />);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-terminal-id]')).toBe(originalHeader);
    restore.mockResolvedValueOnce({ success: true, data: { success: true, terminalId: id } });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(restore).toHaveBeenCalledTimes(3);
    expect(useTerminalStore.getState().getTerminal(id)?.status).toBe('running');
    expect(useTerminalStore.getState().getTerminal(id)?.isRestored).toBe(false);
    expect(xterm.writeln).toHaveBeenCalledTimes(2);
  });

  it('does not display initialization failure controls after a successful initial acknowledgement', async () => {
    restore.mockResolvedValueOnce({ success: true, data: { success: true, terminalId: id } });
    render(<Terminal {...props} />);
    await waitFor(() => expect(useTerminalStore.getState().getTerminal(id)?.status).toBe('running'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry terminal My shell' })).not.toBeInTheDocument();
    expect(xterm.writeln).not.toHaveBeenCalled();
  });
});
