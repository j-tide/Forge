/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import i18n from '../../../../shared/i18n';
import enSettings from '../../../../shared/i18n/locales/en/uiSettings.json';
import zhSettings from '../../../../shared/i18n/locales/zh-CN/uiSettings.json';
import type { AppSettings } from '../../../../shared/types';
import { ThemeSelector } from '../ThemeSelector';
import { EmptyProjectState } from '../common/EmptyProjectState';

const updateSettings = vi.fn();
vi.mock('../../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: { updateSettings: typeof updateSettings }) => unknown) =>
    selector({ updateSettings }),
}));

beforeEach(async () => {
  i18n.addResourceBundle('en', 'uiSettings', enSettings, true, true);
  i18n.addResourceBundle('zh-CN', 'uiSettings', zhSettings, true, true);
  await i18n.changeLanguage('en');
  vi.clearAllMocks();
});
afterEach(async () => { cleanup(); await i18n.changeLanguage('en'); });

describe('Settings locale switching', () => {
  it('updates theme labels without changing mode identifiers or saved behavior', async () => {
    const onSettingsChange = vi.fn();
    const settings = { theme: 'light', colorTheme: 'forge-glass' } as AppSettings;
    render(<ThemeSelector settings={settings} onSettingsChange={onSettingsChange} />);
    expect(screen.getByText('Appearance Mode')).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('zh-CN'); });
    expect(screen.getByText('外观模式')).toBeInTheDocument();
    expect(screen.getByText('Forge 磨砂玻璃')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(onSettingsChange).toHaveBeenCalledWith({ theme: 'dark', colorTheme: 'forge-glass' });
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'dark' });
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });

  it('updates empty project guidance in place', async () => {
    render(<EmptyProjectState />);
    expect(screen.getByText('Select a project to view and edit its settings')).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('zh-CN'); });
    expect(screen.getByText('选择项目后查看和编辑设置')).toBeInTheDocument();
  });
});
