import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore, saveSettings as saveSettingsToStore, loadSettings as loadSettingsFromStore } from '../../../stores/settings-store';
import type { AppSettings } from '../../../../shared/types';
import i18n from '../../../../shared/i18n';
import { UI_SCALE_DEFAULT } from '../../../../shared/constants';

/**
 * Custom hook for managing application settings
 * Provides state management and save/load functionality
 *
 * Theme and UI scale changes are applied immediately for live preview. If the user
 * cancels without saving, call revertTheme() to restore the original values.
 */
export function useSettings() {
  const currentSettings = useSettingsStore((state) => state.settings);
  const updateStoreSettings = useSettingsStore((state) => state.updateSettings);
  const [settings, setSettings] = useState<AppSettings>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store the original theme settings when the hook mounts (dialog opens)
  // This allows us to revert if the user cancels
  const originalThemeRef = useRef<{
    theme: AppSettings['theme'];
    colorTheme: AppSettings['colorTheme'];
    uiScale: number;
    reduceMotion: boolean;
    reduceTransparency: boolean;
  }>({
    theme: currentSettings.theme,
    colorTheme: currentSettings.colorTheme,
    uiScale: currentSettings.uiScale ?? UI_SCALE_DEFAULT,
    reduceMotion: currentSettings.reduceMotion === true,
    reduceTransparency: currentSettings.reduceTransparency === true,
  });

  // Merge only changed store fields so an immediately saved language choice
  // cannot discard unrelated form edits awaiting the main Save action.
  const previousStoreSettings = useRef(currentSettings);
  useEffect(() => {
    const previous = previousStoreSettings.current;
    previousStoreSettings.current = currentSettings;
    const changes = Object.fromEntries(Object.entries(currentSettings).filter(([key, value]) =>
      value !== previous[key as keyof AppSettings]));
    setSettings((draft) => ({ ...draft, ...changes }));
  }, [currentSettings]);

  // Load settings on mount
  useEffect(() => {
    // Preview changes also update the store. Capture the persisted baseline once
    // after loading, rather than recapturing it each time a preview changes.
    let active = true;
    loadSettingsFromStore().then(() => {
      if (!active) return;
      const loaded = useSettingsStore.getState().settings;
      originalThemeRef.current = {
        theme: loaded.theme,
        colorTheme: loaded.colorTheme,
        uiScale: loaded.uiScale ?? UI_SCALE_DEFAULT,
        reduceMotion: loaded.reduceMotion === true,
        reduceTransparency: loaded.reduceTransparency === true,
      };
    });
    return () => { active = false; };
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const success = await saveSettingsToStore(settings);
      if (success) {
        // Apply theme immediately
        applyTheme(settings.theme);
        return true;
      } else {
        setError(i18n.t('localeControls:saveFailed'));
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : i18n.t('localeControls:unknownError'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const applyTheme = (theme: 'light' | 'dark' | 'system') => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  /**
   * Revert theme to the original values (before any preview changes).
   * Call this when the user cancels the settings dialog without saving.
   */
  const revertTheme = useCallback(() => {
    const original = originalThemeRef.current;
    updateStoreSettings({
      theme: original.theme,
      colorTheme: original.colorTheme,
      uiScale: original.uiScale,
      reduceMotion: original.reduceMotion,
      reduceTransparency: original.reduceTransparency,
    });
  }, [updateStoreSettings]);

  /**
   * Capture the current theme as the new "original" after successful save.
   * This updates the reference point for future reverts.
   */
  const commitTheme = useCallback(() => {
    originalThemeRef.current = {
      theme: settings.theme,
      colorTheme: settings.colorTheme,
      uiScale: settings.uiScale ?? UI_SCALE_DEFAULT,
      reduceMotion: settings.reduceMotion === true,
      reduceTransparency: settings.reduceTransparency === true,
    };
  }, [settings.theme, settings.colorTheme, settings.uiScale, settings.reduceMotion, settings.reduceTransparency]);

  return {
    settings,
    setSettings,
    updateSettings,
    isSaving,
    error,
    saveSettings,
    applyTheme,
    revertTheme,
    commitTheme
  };
}
