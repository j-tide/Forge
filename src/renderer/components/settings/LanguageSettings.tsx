import { useState } from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Label } from '../ui/label';
import { SettingsSection } from './SettingsSection';
import { saveSettings } from '../../stores/settings-store';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, type SupportedLanguage } from '../../../shared/constants/i18n';
import type { AppSettings } from '../../../shared/types';

interface LanguageSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

/**
 * Language settings section for interface language selection
 * Changes persist immediately and apply without reopening the application.
 */
export function LanguageSettings({ settings, onSettingsChange }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation('settings');
  const { t: localeText } = useTranslation('localeControls');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentLanguage = settings.language ?? DEFAULT_LANGUAGE;

  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    if (isSaving || newLanguage === currentLanguage) return;
    setIsSaving(true);
    setError(null);
    try {
      // Persist just this preference; unrelated unsaved settings remain a draft.
      if (!await saveSettings({ language: newLanguage })) {
        setError(localeText('saveFailed'));
        return;
      }
      onSettingsChange({ ...settings, language: newLanguage });
      await i18n.changeLanguage(newLanguage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsSection
      title={t('sections.language.title')}
      description={t('sections.language.description')}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground">
            {t('language.label')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t('language.description')}
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-md pt-1">
            {AVAILABLE_LANGUAGES.map((lang) => {
              const isSelected = currentLanguage === lang.value;
              return (
                <button
                  key={lang.value}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isSaving}
                  onClick={() => handleLanguageChange(lang.value)}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-lg border-2 transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  )}
                >
                  <Globe className="h-5 w-5 shrink-0" />
                  <div className="text-left">
                    <div className="text-sm font-medium">{lang.nativeLabel}</div>
                    <div className="text-xs text-muted-foreground">{lang.label}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground" role="status">{isSaving ? localeText('saving') : localeText('savedAutomatically')}</p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
      </div>
    </SettingsSection>
  );
}
