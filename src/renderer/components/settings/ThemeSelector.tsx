import { useTranslation } from 'react-i18next';
import i18n from '../../../shared/i18n';
import { Check, Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Label } from '../ui/label';
import { COLOR_THEMES } from '../../../shared/constants';
import { useSettingsStore } from '../../stores/settings-store';
import type { ColorTheme, AppSettings } from '../../../shared/types';

interface ThemeSelectorProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Theme selector component displaying a grid of theme cards with preview swatches
 * and a 3-option mode toggle (Light/Dark/System)
 *
 * Theme changes are applied immediately for live preview, while other settings
 * require saving to take effect.
 */
export function ThemeSelector({ settings, onSettingsChange }: ThemeSelectorProps) {
  useTranslation('uiSettings');
  const updateStoreSettings = useSettingsStore((state) => state.updateSettings);

  const currentColorTheme = settings.colorTheme || 'default';
  const currentMode = settings.theme;
  const isDark = currentMode === 'dark' ||
    (currentMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleColorThemeChange = (themeId: ColorTheme) => {
    // Update local draft state
    onSettingsChange({ ...settings, colorTheme: themeId });
    // Apply immediately to store for live preview (triggers App.tsx useEffect)
    updateStoreSettings({ colorTheme: themeId });
  };

  const handleModeChange = (mode: 'light' | 'dark' | 'system') => {
    // Update local draft state
    onSettingsChange({ ...settings, theme: mode });
    // Apply immediately to store for live preview (triggers App.tsx useEffect)
    updateStoreSettings({ theme: mode });
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="space-y-3">
        <Label className="text-sm font-medium text-foreground">{i18n.t('uiSettings:text013')}</Label>
        <p className="text-sm text-muted-foreground">{i18n.t('uiSettings:text014')}</p>
        <div className="grid grid-cols-3 gap-3 max-w-md pt-1">
          {(['system', 'light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={currentMode === mode}
              onClick={() => handleModeChange(mode)}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                currentMode === mode
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              )}
            >
              {getModeIcon(mode)}
              <span className="text-sm font-medium capitalize">{i18n.t(`uiSettings:mode.${mode}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color Theme Grid */}
      <details className="rounded-lg border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{i18n.t('uiSettings:text015')} · {i18n.t(`uiSettings:themes.${currentColorTheme}.name`, { defaultValue: currentColorTheme })}</summary>
        <p className="mt-3 text-sm text-muted-foreground">{i18n.t('uiSettings:text016')}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COLOR_THEMES.map((theme) => {
            const isSelected = currentColorTheme === theme.id;
            const bgColor = isDark ? theme.previewColors.darkBg : theme.previewColors.bg;
            const accentColor = isDark
              ? (theme.previewColors.darkAccent || theme.previewColors.accent)
              : theme.previewColors.accent;

            return (
              <button
                key={theme.id}
                aria-pressed={isSelected}
                onClick={() => handleColorThemeChange(theme.id)}
                className={cn(
                  'relative flex flex-col p-4 rounded-lg border-2 text-left transition-all',
                  'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50 hover:bg-accent/30'
                )}
              >
                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}

                {/* Preview swatches */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex -space-x-1.5">
                    <div
                      className="w-6 h-6 rounded-full border-2 border-background shadow-sm"
                      style={{ backgroundColor: bgColor }}
                      title={i18n.t('uiSettings:text017')}
                    />
                    <div
                      className="w-6 h-6 rounded-full border-2 border-background shadow-sm"
                      style={{ backgroundColor: accentColor }}
                      title={i18n.t('uiSettings:text018')}
                    />
                  </div>
                </div>

                {/* Theme info */}
                <div className="space-y-1">
                  <p className="font-medium text-sm text-foreground">{i18n.t(`uiSettings:themes.${theme.id}.name`, { defaultValue: theme.name })}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{i18n.t(`uiSettings:themes.${theme.id}.description`, { defaultValue: theme.description })}</p>
                </div>
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
