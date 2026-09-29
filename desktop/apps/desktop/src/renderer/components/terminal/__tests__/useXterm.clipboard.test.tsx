/** @vitest-environment jsdom */

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../shared/i18n';
import { useXterm, type UseXtermReturn } from '../useXterm';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  isWindows: vi.fn(() => false),
  isLinux: vi.fn(() => false),
  hasSelection: vi.fn(() => true),
  getSelection: vi.fn(() => 'selected terminal text'),
  clearSelection: vi.fn(),
  paste: vi.fn(),
  handlers: [] as Array<(event: KeyboardEvent) => boolean>,
  fontSettings: {
    cursorBlink: true,
    cursorStyle: 'block',
    cursorAccentColor: '#000000',
    fontSize: 14,
    fontWeight: 'normal',
    fontFamily: ['monospace'],
    lineHeight: 1,
    letterSpacing: 0,
    scrollback: 1000
  }
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80;
    rows = 24;
    options = {};
    open = vi.fn();
    loadAddon = vi.fn();
    onData = vi.fn();
    onResize = vi.fn();
    dispose = vi.fn();
    refresh = vi.fn();
    hasSelection = mocks.hasSelection;
    getSelection = mocks.getSelection;
    clearSelection = mocks.clearSelection;
    paste = mocks.paste;
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) {
      mocks.handlers.push(handler);
    }
  }
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
    dispose = vi.fn();
  }
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-serialize', () => ({
  SerializeAddon: class {
    serialize = vi.fn(() => '');
    dispose = vi.fn();
  }
}));
vi.mock('../../../lib/terminal-buffer-manager', () => ({
  terminalBufferManager: { getAndClear: vi.fn(() => ''), set: vi.fn() }
}));
vi.mock('../../../stores/terminal-store', () => ({
  useTerminalStore: { getState: () => ({ terminals: [] }) },
  registerOutputCallback: vi.fn(),
  unregisterOutputCallback: vi.fn()
}));
vi.mock('../../../stores/terminal-font-settings-store', () => ({
  useTerminalFontSettingsStore: Object.assign(() => mocks.fontSettings, {
    getState: () => mocks.fontSettings,
    subscribe: vi.fn(() => vi.fn())
  })
}));
vi.mock('../../../stores/settings-store', () => ({
  useSettingsStore: { getState: () => ({ settings: { gpuAcceleration: 'off' } }) }
}));
vi.mock('../../../lib/os-detection', () => ({
  isWindows: mocks.isWindows,
  isLinux: mocks.isLinux
}));
vi.mock('../../../hooks/use-toast', () => ({ toast: mocks.toast }));

function pendingCopy() {
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

function renderTerminal() {
  let terminal!: UseXtermReturn;
  function TestTerminal() {
    terminal = useXterm({ terminalId: 'clipboard-terminal' });
    return <div ref={terminal.terminalRef} />;
  }
  const view = render(<TestTerminal />);
  return { ...view, terminal, handleKey: mocks.handlers[0] };
}

describe('useXterm keyboard copy feedback', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.length = 0;
    mocks.hasSelection.mockReturnValue(true);
    mocks.getSelection.mockReturnValue('selected terminal text');
    mocks.isWindows.mockReturnValue(false);
    mocks.isLinux.mockReturnValue(false);
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), {
      clipboard: { writeText, readText: vi.fn().mockResolvedValue('paste text') }
    }));
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    { platform: 'macOS', key: 'c', metaKey: true, ctrlKey: false, shiftKey: false },
    { platform: 'Windows', key: 'c', metaKey: false, ctrlKey: true, shiftKey: false },
    { platform: 'Linux', key: 'C', metaKey: false, ctrlKey: true, shiftKey: true }
  ])('reports refused $platform copy and lets the same selection retry without a success toast', async (shortcut) => {
    mocks.isWindows.mockReturnValue(shortcut.platform === 'Windows');
    mocks.isLinux.mockReturnValue(shortcut.platform === 'Linux');
    writeText.mockRejectedValueOnce(new Error('Permission refused: private clipboard diagnostics'));
    const { handleKey } = renderTerminal();

    await act(async () => {
      expect(handleKey(new KeyboardEvent('keydown', shortcut))).toBe(false);
    });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'Failed to copy to clipboard',
      variant: 'destructive'
    });
    expect(mocks.clearSelection).not.toHaveBeenCalled();

    await act(async () => {
      expect(handleKey(new KeyboardEvent('keydown', shortcut))).toBe(false);
    });

    expect(writeText.mock.calls).toEqual([
      ['selected terminal text'],
      ['selected terminal text']
    ]);
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.clearSelection).not.toHaveBeenCalled();
  });

  it('uses the current language when a pending copy fails', async () => {
    const pending = pendingCopy();
    writeText.mockReturnValue(pending.promise);
    const { handleKey } = renderTerminal();
    handleKey(new KeyboardEvent('keydown', { key: 'c', metaKey: true }));

    await act(async () => {
      await i18n.changeLanguage('zh-CN');
      pending.reject(new Error('private clipboard diagnostics'));
    });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: '无法复制到剪贴板',
      variant: 'destructive'
    });
  });

  it('suppresses a pending copy failure after the hook unmounts', async () => {
    const pending = pendingCopy();
    writeText.mockReturnValue(pending.promise);
    const { handleKey, unmount } = renderTerminal();
    handleKey(new KeyboardEvent('keydown', { key: 'c', metaKey: true }));
    unmount();

    await act(async () => {
      pending.reject(new Error('late clipboard refusal'));
    });

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('suppresses a pending copy failure after the terminal is disposed', async () => {
    const pending = pendingCopy();
    writeText.mockReturnValue(pending.promise);
    const { handleKey, terminal } = renderTerminal();
    handleKey(new KeyboardEvent('keydown', { key: 'c', metaKey: true }));
    terminal.dispose();

    await act(async () => {
      pending.reject(new Error('late clipboard refusal'));
    });

    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
