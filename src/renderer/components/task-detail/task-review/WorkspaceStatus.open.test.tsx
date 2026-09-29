/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../shared/i18n';
import type { IPCResult } from '../../../../shared/types';
import { WorkspaceStatus } from './WorkspaceStatus';

vi.mock('../../../stores/settings-store', () => ({
  useSettingsStore: () => ({ settings: { preferredIDE: 'custom', customIDEPath: '/fixture/ide', preferredTerminal: 'custom', customTerminalPath: '/fixture/terminal' } }),
}));
const noop = vi.fn();
const props = {
  taskId: 'fixture-task', worktreeStatus: { exists: true, worktreePath: '/fixture/worktree' },
  workspaceError: null, stageOnly: false, mergePreview: null,
  isLoadingPreview: false, isMerging: false, isDiscarding: false,
  onShowDiffDialog: noop, onShowDiscardDialog: noop, onShowConflictDialog: noop,
  onLoadMergePreview: noop, onStageOnlyChange: noop, onMerge: noop,
};
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Fixture not initialized'); };
  let reject: (reason: unknown) => void = () => { throw new Error('Fixture not initialized'); };
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  window.electronAPI.worktreeOpenInIDE = vi.fn().mockResolvedValue({ success: true, data: { opened: true } });
  window.electronAPI.worktreeOpenInTerminal = vi.fn().mockResolvedValue({ success: true, data: { opened: true } });
});
afterEach(cleanup);

const targets = [
  { target: 'ide', api: 'worktreeOpenInIDE', label: 'IDE', preferred: 'custom', path: '/fixture/ide', message: 'Failed to open in IDE' },
  { target: 'terminal', api: 'worktreeOpenInTerminal', label: 'Terminal', preferred: 'custom', path: '/fixture/terminal', message: 'Failed to open in terminal' },
] as const;

describe('Workspace external application opening', () => {
  for (const target of targets) {
    it.each(['returned failure', 'transport rejection', 'not opened'])(`reports %s for ${target.target}, disables duplicate dispatch, and retries successfully`, async (failure) => {
      const pending = deferred<IPCResult<{ opened: boolean }>>();
      const api = vi.mocked(window.electronAPI[target.api]);
      api.mockReturnValueOnce(pending.promise);
      render(<WorkspaceStatus {...props} />);
      const button = screen.getByRole('button', { name: `Open in ${target.label}` });
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('button', { name: `Open in ${target.target === 'ide' ? 'Terminal' : 'IDE'}` })).toBeDisabled();
      fireEvent.click(button);
      expect(api).toHaveBeenCalledExactlyOnceWith('/fixture/worktree', target.preferred, target.path);
      await act(async () => {
        if (failure === 'transport rejection') pending.reject(new Error('Private launch details'));
        else pending.resolve(failure === 'not opened' ? { success: true, data: { opened: false } } : { success: false, error: 'Executable not found' });
      });
      expect(screen.getByRole('alert')).toHaveTextContent(target.message);
      expect(screen.getByRole('alert')).not.toHaveTextContent('Private launch details');
      expect(button).toBeEnabled();
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
      expect(api).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('aria-busy', 'false');
    });

    it(`keeps successful ${target.target} opening free of error feedback`, async () => {
      render(<WorkspaceStatus {...props} />);
      await act(async () => fireEvent.click(screen.getByRole('button', { name: `Open in ${target.label}` })));
      expect(window.electronAPI[target.api]).toHaveBeenCalledOnce();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  }

  it.each(['en', 'zh-CN'] as const)('localizes both failure and retry in %s', async (language) => {
    await i18n.changeLanguage(language);
    window.electronAPI.worktreeOpenInIDE = vi.fn().mockResolvedValue({ success: false });
    render(<WorkspaceStatus {...props} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: i18n.t('uiTasks:review.openIn', { app: 'IDE' }) })));
    expect(screen.getByRole('alert')).toHaveTextContent(i18n.t('native:ipc.failedToOpenInIde', { keySeparator: false }));
    expect(screen.getByRole('button', { name: i18n.t('common:buttons.retry') })).toBeEnabled();
  });
});
