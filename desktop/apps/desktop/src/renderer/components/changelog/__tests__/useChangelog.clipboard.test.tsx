/** @vitest-environment jsdom */
import { createRef } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../shared/i18n';
import { useProjectStore } from '../../../stores/project-store';
import { copyChangelogToClipboard, useChangelogStore } from '../../../stores/changelog-store';
import { TooltipProvider } from '../../ui/tooltip';
import { PreviewPanel } from '../PreviewPanel';
import { useChangelog } from '../hooks/useChangelog';

vi.mock('../../../stores/settings-store', () => ({
  useSettingsStore: { getState: () => ({ settings: {} }) },
  saveSettings: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../../stores/task-store', () => ({
  useTaskStore: { getState: () => ({ tasks: [] }) },
  loadTasks: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../stores/changelog-store', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../stores/changelog-store')>();
  return {
    ...actual,
    loadChangelogData: vi.fn().mockResolvedValue(undefined),
    loadGitData: vi.fn().mockResolvedValue(undefined),
  };
});

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = () => yes();
    reject = no;
  });
  return { promise, resolve, reject };
}

const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useProjectStore.setState({ selectedProjectId: 'project-a' });
  useChangelogStore.getState().reset();
  useChangelogStore.setState({ generatedChangelog: 'Original changelog', isCopying: false });
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  window.electronAPI.onChangelogGenerationProgress = vi.fn(() => vi.fn());
  window.electronAPI.onChangelogGenerationComplete = vi.fn(() => vi.fn());
  window.electronAPI.onChangelogGenerationError = vi.fn(() => vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

function mountChangelog() {
  const hook = renderHook(() => useChangelog());
  act(() => hook.result.current.setStep(2));
  return hook;
}

describe('changelog clipboard completion and feedback', () => {
  it('waits for the actual write and blocks duplicate requests while pending', async () => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    const { result } = mountChangelog();
    let request!: Promise<void>;
    act(() => { request = result.current.handleCopy(); });

    expect(result.current.copySuccess).toBe(false);
    expect(result.current.isCopying).toBe(true);
    await act(() => result.current.handleCopy());
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith('Original changelog');

    await act(async () => { pending.resolve(); await request; });
    expect(result.current.copySuccess).toBe(true);
    expect(result.current.isCopying).toBe(false);
  });

  it('shows a localized retryable error on rejection and clears it after a successful retry', async () => {
    await i18n.changeLanguage('zh-CN');
    writeText.mockRejectedValueOnce(new Error('permission denied with private content'));
    const { result } = mountChangelog();

    await act(() => result.current.handleCopy());
    expect(result.current.copySuccess).toBe(false);
    expect(result.current.isCopying).toBe(false);
    expect(result.current.error).toBe('无法复制更新日志。请重试，或选中文字手动复制。');
    expect(result.current.error).not.toContain('private content');
    expect(useChangelogStore.getState().error).toBeNull();

    await act(() => result.current.handleCopy());
    expect(result.current.copySuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('does not clear an unrelated generation error while handling copy feedback', async () => {
    useChangelogStore.setState({ error: 'Existing generation failure' });
    const { result } = mountChangelog();
    await act(() => result.current.handleCopy());

    expect(result.current.copySuccess).toBe(true);
    expect(useChangelogStore.getState().error).toBe('Existing generation failure');
  });

  it('clears success as soon as the copied content is edited', async () => {
    const { result } = mountChangelog();
    await act(() => result.current.handleCopy());
    expect(result.current.copySuccess).toBe(true);

    act(() => result.current.updateGeneratedChangelog('Edited changelog'));
    expect(result.current.copySuccess).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)('ignores an old %s after editing and restoring the original value', async outcome => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    const { result } = mountChangelog();
    let request!: Promise<void>;
    act(() => { request = result.current.handleCopy(); });
    act(() => result.current.updateGeneratedChangelog('Edited changelog'));
    act(() => result.current.updateGeneratedChangelog('Original changelog'));

    await act(async () => {
      if (outcome === 'resolve') pending.resolve();
      else pending.reject(new Error('old clipboard failure'));
      await request;
    });

    expect(result.current.copySuccess).toBe(false);
    expect(result.current.error).toBeNull();
    expect(useChangelogStore.getState().copyError).toBeNull();
    expect(useChangelogStore.getState().error).toBeNull();
  });

  it.each(['project', 'step', 'generation'] as const)('ignores a rejected write after the %s context changes', async context => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    const { result } = mountChangelog();
    let request!: Promise<void>;
    act(() => { request = result.current.handleCopy(); });

    if (context === 'project') {
      act(() => useProjectStore.setState({ selectedProjectId: 'project-b' }));
      act(() => useProjectStore.setState({ selectedProjectId: 'project-a' }));
    } else if (context === 'step') {
      act(() => result.current.handleBack());
      act(() => result.current.setStep(2));
    } else {
      act(() => useChangelogStore.getState().setIsGenerating(true));
      act(() => useChangelogStore.getState().setIsGenerating(false));
    }
    await act(async () => { pending.reject(new Error('stale failure')); await request; });

    expect(result.current.copySuccess).toBe(false);
    expect(result.current.error).toBeNull();
    expect(useChangelogStore.getState().copyError).toBeNull();
    expect(useChangelogStore.getState().error).toBeNull();
  });

  it('does not publish an old failure into a remounted view', async () => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    const previous = mountChangelog();
    let request!: Promise<void>;
    act(() => { request = previous.result.current.handleCopy(); });
    previous.unmount();
    const current = mountChangelog();

    await act(async () => { pending.reject(new Error('unmounted failure')); await request; });
    expect(current.result.current.copySuccess).toBe(false);
    expect(current.result.current.error).toBeNull();
    expect(useChangelogStore.getState().copyError).toBeNull();
    await act(() => current.result.current.handleCopy());
    expect(current.result.current.copySuccess).toBe(true);
  });

  it('retains the pending lock when Done resets the changelog', async () => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    const { result } = mountChangelog();
    let request!: Promise<void>;
    act(() => { request = result.current.handleCopy(); });
    await act(() => result.current.handleDone());
    expect(result.current.isCopying).toBe(true);

    await act(async () => { pending.resolve(); await request; });
    expect(result.current.copySuccess).toBe(false);
    expect(result.current.isCopying).toBe(false);
  });

  it('replaces the success timer and cleans it up when the view unmounts', async () => {
    vi.useFakeTimers();
    const { result, unmount } = mountChangelog();
    await act(() => result.current.handleCopy());
    act(() => vi.advanceTimersByTime(1500));
    await act(() => result.current.handleCopy());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.copySuccess).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copySuccess).toBe(false);

    await act(() => result.current.handleCopy());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('handles an unavailable clipboard and empty content without rejecting the caller', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await expect(copyChangelogToClipboard()).resolves.toBe(false);
    expect(useChangelogStore.getState().copyError).toBe(i18n.t('uiChangelogExtra:copyFailed'));
    expect(useChangelogStore.getState().isCopying).toBe(false);

    useChangelogStore.getState().setGeneratedChangelog('');
    await expect(copyChangelogToClipboard()).resolves.toBe(false);
    expect(useChangelogStore.getState().copyError).toBe(i18n.t('uiRuntime:stores.noChangelogCopy'));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('exposes a disabled Copying button during the real clipboard write', async () => {
    const pending = deferred();
    writeText.mockReturnValue(pending.promise);
    let request!: Promise<boolean>;
    render(<TooltipProvider><PreviewPanel
      generatedChangelog="Original changelog" saveSuccess={false} copySuccess={false} canSave
      isDragOver={false} imageError={null} textareaRef={createRef<HTMLTextAreaElement>()}
      onSave={vi.fn()} onCopy={() => { request = copyChangelogToClipboard(); }}
      onChangelogEdit={vi.fn()} onPaste={vi.fn()} onDragOver={vi.fn()} onDragLeave={vi.fn()} onDrop={vi.fn()}
    /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const button = screen.getByRole('button', { name: 'Copying...' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Save to CHANGELOG.md' })).toBeEnabled();
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledOnce();

    await act(async () => { pending.resolve(); await request; });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
  });
});
