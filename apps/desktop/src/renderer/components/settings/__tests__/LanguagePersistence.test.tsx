/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import i18n from '../../../../shared/i18n';
import { DEFAULT_APP_SETTINGS } from '../../../../shared/constants';
import type { AppSettings } from '../../../../shared/types';
import { loadSettings, saveSettings, useSettingsStore } from '../../../stores/settings-store';
import { LanguageSettings } from '../LanguageSettings';
import { useSettings } from '../hooks/useSettings';

let persisted: AppSettings;
const saveBridge = vi.fn<(updates: Partial<AppSettings>) => Promise<{ success: boolean }>>();
const getBridge = vi.fn<() => Promise<{ success: boolean; data: AppSettings }>>();

beforeEach(async () => {
  persisted = { ...DEFAULT_APP_SETTINGS, language: 'en', onboardingCompleted: true } as AppSettings;
  saveBridge.mockReset();
  getBridge.mockReset();
  saveBridge.mockImplementation(async (updates) => {
    persisted = { ...persisted, ...updates };
    return { success: true };
  });
  getBridge.mockImplementation(async () => ({ success: true, data: { ...persisted } }));
  window.electronAPI.saveSettings = saveBridge;
  window.electronAPI.getSettings = getBridge;
  window.electronAPI.getProviderAccounts = vi.fn().mockResolvedValue({ success: true, data: { accounts: [] } });
  useSettingsStore.setState({ settings: { ...persisted }, isLoading: false, error: null });
  await i18n.changeLanguage('en');
});

afterEach(async () => { cleanup(); await i18n.changeLanguage('en'); });

function SettingsLanguageForm() {
  const { settings, setSettings } = useSettings();
  return <LanguageSettings settings={settings} onSettingsChange={setSettings} />;
}

describe('Language preference persistence', () => {
  it('saves only the language, updates immediately and survives settings reload', async () => {
    const mounted = render(<SettingsLanguageForm />);
    await waitFor(() => expect(getBridge).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /中文/ }));
    await waitFor(() => expect(i18n.language).toBe('zh-CN'));
    expect(saveBridge).toHaveBeenCalledWith({ language: 'zh-CN' });
    expect(saveBridge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /中文/ })).toHaveAttribute('aria-pressed', 'true');
    mounted.unmount();
    useSettingsStore.setState({ settings: { ...DEFAULT_APP_SETTINGS, language: 'en' } as AppSettings });
    await act(async () => { await loadSettings(); });
    expect(useSettingsStore.getState().settings.language).toBe('zh-CN');
    render(<SettingsLanguageForm />);
    expect(screen.getByRole('button', { name: /中文/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps previous language and shows an actionable failure when persistence fails', async () => {
    saveBridge.mockResolvedValueOnce({ success: false });
    render(<SettingsLanguageForm />);
    await waitFor(() => expect(getBridge).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /中文/ }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the setting. Please try again.');
    expect(i18n.language).toBe('en');
    expect(persisted.language).toBe('en');
    expect(screen.getByRole('button', { name: /English/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables duplicate interactions while the language write is pending', async () => {
    let finish!: (result: { success: boolean }) => void;
    saveBridge.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<SettingsLanguageForm />);
    await waitFor(() => expect(getBridge).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /中文/ }));
    expect(screen.getByRole('button', { name: /中文/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /English/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /中文/ }));
    expect(saveBridge).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ success: true }); });
    expect(screen.getByRole('button', { name: /English/ })).toBeEnabled();
  });

  it('merges a language store update without overwriting unrelated unsaved draft fields', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(getBridge).toHaveBeenCalled());
    act(() => result.current.updateSettings({ pythonPath: '/draft/python', autoNameTerminals: false }));
    await act(async () => { await saveSettings({ language: 'zh-CN' }); });
    expect(result.current.settings.language).toBe('zh-CN');
    expect(result.current.settings.pythonPath).toBe('/draft/python');
    expect(result.current.settings.autoNameTerminals).toBe(false);
    expect(persisted.pythonPath).not.toBe('/draft/python');
    expect(saveBridge).toHaveBeenCalledWith({ language: 'zh-CN' });
  });
});
