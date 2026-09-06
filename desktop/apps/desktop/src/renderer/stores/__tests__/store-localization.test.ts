/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../shared/i18n';
import englishRuntime from '../../../shared/i18n/locales/en/uiRuntime.json';
import chineseRuntime from '../../../shared/i18n/locales/zh-CN/uiRuntime.json';
import { loadProjects, useProjectStore } from '../project-store';
import { useTerminalStore } from '../terminal-store';

vi.mock('../../lib/terminal-buffer-manager', () => ({
  terminalBufferManager: {
    append: vi.fn(), get: vi.fn(() => ''), getSize: vi.fn(() => 0),
    set: vi.fn(), clear: vi.fn(), dispose: vi.fn()
  }
}));

const getProjects = vi.fn();
let previousLanguage: string;
let previousAPI: typeof window.electronAPI;

describe('localized store feedback', () => {
  beforeEach(() => {
    previousLanguage = i18n.language;
    i18n.addResourceBundle('en', 'uiRuntime', englishRuntime, true, true);
    i18n.addResourceBundle('zh-CN', 'uiRuntime', chineseRuntime, true, true);
    previousAPI = window.electronAPI;
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { getProjects, getTabState: vi.fn().mockResolvedValue({ success: false }) }
    });
    getProjects.mockReset();
    useProjectStore.setState({ projects: [], error: null, isLoading: false });
    useTerminalStore.getState().clearAllTerminals();
  });

  afterEach(async () => {
    useTerminalStore.getState().clearAllTerminals();
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: previousAPI });
    await i18n.changeLanguage(previousLanguage);
  });

  it('uses the selected language for project error fallbacks', async () => {
    getProjects.mockResolvedValue({ success: false });
    await i18n.changeLanguage('zh-CN');
    await loadProjects();
    expect(useProjectStore.getState().error).toBe('无法加载项目');
    await i18n.changeLanguage('en');
    await loadProjects();
    expect(useProjectStore.getState().error).toBe('Failed to load projects');
  });

  it('preserves provider errors rather than presenting a fabricated translation', async () => {
    getProjects.mockResolvedValue({ success: false, error: 'Provider denied workspace access' });
    await i18n.changeLanguage('zh-CN');
    await loadProjects();
    expect(useProjectStore.getState().error).toBe('Provider denied workspace access');
  });

  it('localizes new terminal names without rewriting existing names', async () => {
    await i18n.changeLanguage('zh-CN');
    const chinese = useTerminalStore.getState().addTerminal();
    expect(chinese?.title).toBe('终端 1');
    await i18n.changeLanguage('en');
    const english = useTerminalStore.getState().addTerminal();
    expect(english?.title).toBe('Terminal 2');
    expect(useTerminalStore.getState().getTerminal(chinese!.id)?.title).toBe('终端 1');
  });
});
