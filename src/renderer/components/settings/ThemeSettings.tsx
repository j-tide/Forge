import { useTranslation } from 'react-i18next';
import { SettingsSection } from './SettingsSection';
import { ThemeSelector } from './ThemeSelector';
import type { AppSettings } from '../../../shared/types';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { useSettingsStore } from '../../stores/settings-store';

interface ThemeSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Theme and appearance settings section
 * Wraps the ThemeSelector component with a consistent settings section layout
 */
export function ThemeSettings({ settings, onSettingsChange }: ThemeSettingsProps) {
  const { t } = useTranslation('settings');
  const updateStoreSettings = useSettingsStore((state) => state.updateSettings);

  const updatePreference = (key: 'reduceMotion' | 'reduceTransparency', value: boolean) => {
    onSettingsChange({ ...settings, [key]: value });
    updateStoreSettings({ [key]: value });
  };

  return (
    <SettingsSection
      title={t('theme.title')}
      description={t('theme.description')}
    >
      <ThemeSelector settings={settings} onSettingsChange={onSettingsChange} />
      <div className="space-y-4 border-t border-border pt-5">
        <h4 className="text-sm font-medium">{t('accessibility.title')}</h4>
        {(['reduceMotion', 'reduceTransparency'] as const).map((key) => (
          <div key={key} className="flex items-center justify-between gap-6">
            <div className="space-y-1">
              <Label htmlFor={`appearance-${key}`} className="text-sm font-medium">
                {t(`accessibility.${key}.label`)}
              </Label>
              <p id={`appearance-${key}-description`} className="text-sm text-muted-foreground">
                {t(`accessibility.${key}.description`)}
              </p>
            </div>
            <Switch
              id={`appearance-${key}`}
              checked={settings[key] === true}
              aria-describedby={`appearance-${key}-description`}
              onCheckedChange={(value) => updatePreference(key, value)}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{t('accessibility.systemPreference')}</p>
      </div>
    </SettingsSection>
  );
}
