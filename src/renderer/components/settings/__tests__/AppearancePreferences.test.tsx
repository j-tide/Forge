/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '../../../../shared/constants';
import type { AppSettings } from '../../../../shared/types';
import { loadSettings, useSettingsStore } from '../../../stores/settings-store';
import { ThemeSettings } from '../ThemeSettings';
import { useSettings } from '../hooks/useSettings';

let persisted: AppSettings;
const saveBridge = vi.fn<(updates: Partial<AppSettings>) => Promise<{ success: boolean }>>();
const getBridge = vi.fn<() => Promise<{ success: boolean; data: AppSettings }>>();

beforeEach(() => {
  persisted = { ...DEFAULT_APP_SETTINGS, onboardingCompleted: true } as AppSettings;
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
});
afterEach(cleanup);

function AppearanceForm() {
  const { settings, setSettings, saveSettings, commitTheme, revertTheme } = useSettings();
  return <>
    <ThemeSettings settings={settings} onSettingsChange={setSettings} />
    <button type="button" onClick={async () => { if (await saveSettings()) commitTheme(); }}>Save</button>
    <button type="button" onClick={revertTheme}>Cancel</button>
  </>;
}

describe('Appearance preference form and persistence', () => {
  it('provides accessible controls with descriptive text and previews both reductions', async () => {
    render(<AppearanceForm />);
    await waitFor(() => expect(useSettingsStore.getState().isLoading).toBe(false));
    const motion = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(motion).toHaveAccessibleDescription('Use less movement and shorter transitions.');
    expect(motion).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(motion);
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce transparency' }));
    expect(useSettingsStore.getState().settings.reduceMotion).toBe(true);
    expect(useSettingsStore.getState().settings.reduceTransparency).toBe(true);
    expect(saveBridge).not.toHaveBeenCalled();
  });

  it('persists both reductions via the normal settings API and reloads them', async () => {
    const mounted = render(<AppearanceForm />);
    await waitFor(() => expect(useSettingsStore.getState().isLoading).toBe(false));
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce transparency' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(persisted.reduceMotion).toBe(true));
    expect(persisted.reduceTransparency).toBe(true);
    expect(persisted.theme).toBe('light');
    mounted.unmount();
    useSettingsStore.setState({ settings: { ...DEFAULT_APP_SETTINGS } as AppSettings });
    await act(async () => { await loadSettings(); });
    render(<AppearanceForm />);
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Reduce transparency' })).toHaveAttribute('aria-checked', 'true');
  });

  it('restores the original preferences and theme when a preview is cancelled', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(useSettingsStore.getState().isLoading).toBe(false));
    act(() => {
      useSettingsStore.getState().updateSettings({ theme: 'dark', reduceMotion: true, reduceTransparency: true });
    });
    act(() => result.current.revertTheme());
    expect(useSettingsStore.getState().settings).toMatchObject({
      theme: 'light', reduceMotion: false, reduceTransparency: false,
    });
    expect(persisted.reduceMotion).toBe(false);
    expect(saveBridge).not.toHaveBeenCalled();
  });

  it('does not commit preferences when the save fails and allows preview cancellation', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(useSettingsStore.getState().isLoading).toBe(false));
    act(() => {
      result.current.updateSettings({ reduceMotion: true });
      useSettingsStore.getState().updateSettings({ reduceMotion: true });
    });
    saveBridge.mockResolvedValueOnce({ success: false });
    let success = true;
    await act(async () => { success = await result.current.saveSettings(); });
    expect(success).toBe(false);
    expect(persisted.reduceMotion).toBe(false);
    act(() => result.current.revertTheme());
    expect(useSettingsStore.getState().settings.reduceMotion).toBe(false);
  });
});
