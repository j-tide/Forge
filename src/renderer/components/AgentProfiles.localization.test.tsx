/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentProfiles } from './AgentProfiles';
import en from '../../shared/i18n/locales/en/uiRuntime.json';
import zh from '../../shared/i18n/locales/zh-CN/uiRuntime.json';

const saveSettings = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: { settings: { selectedAgentProfile: string } }) => unknown) =>
    selector({ settings: { selectedAgentProfile: 'auto' } }),
  saveSettings,
}));

afterEach(cleanup);

describe('agent profile localization', () => {
  it('switches visible preset labels without changing the saved profile identity', async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: 'zh-CN',
      fallbackLng: 'en',
      ns: ['uiRuntime'],
      defaultNS: 'uiRuntime',
      resources: { en: { uiRuntime: en }, 'zh-CN': { uiRuntime: zh } },
      interpolation: { escapeValue: false },
    });
    render(<I18nextProvider i18n={i18n}><AgentProfiles /></I18nextProvider>);
    expect(screen.getByRole('heading', { name: '智能体配置' })).toBeDefined();
    expect(screen.queryByText('Complex Tasks')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /复杂任务/ }));
    expect(saveSettings).toHaveBeenCalledWith({ selectedAgentProfile: 'complex' });

    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('heading', { name: 'Agent Profiles' })).toBeDefined();
    expect(screen.queryByText('复杂任务')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Quick Edits/ }));
    expect(saveSettings).toHaveBeenLastCalledWith({ selectedAgentProfile: 'quick' });
    expect(screen.getAllByText('High Thinking').length).toBeGreaterThan(0);
  });
});
