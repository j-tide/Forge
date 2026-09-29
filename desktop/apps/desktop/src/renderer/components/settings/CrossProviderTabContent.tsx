import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { useSettingsStore, saveSettings } from '../../stores/settings-store';
import { MixedPhaseEditor } from './MixedPhaseEditor';
import { MixedFeatureEditor } from './MixedFeatureEditor';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';

/**
 * CrossProviderTabContent — rendered when the user selects the "Cross-Provider" tab
 * in Agent Profile settings.
 *
 * Browsing and editing the configuration does not activate it. The user chooses
 * explicitly whether new tasks should use the cross-provider configuration.
 */
export function CrossProviderTabContent() {
  const { t } = useTranslation('settings');
  const settings = useSettingsStore((s) => s.settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const switchId = useId();

  const handleActiveChange = async (active: boolean) => {
    setIsSaving(true);
    setSaveFailed(false);
    try {
      if (!await saveSettings({ customMixedProfileActive: active })) setSaveFailed(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h4 className="font-medium text-sm text-foreground">
          {t('agentProfile.crossProviderTab.title')}
        </h4>
        <p className="text-sm text-muted-foreground">
          {t('agentProfile.crossProviderTab.description')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
        <Label htmlFor={switchId} className="text-sm font-medium">
          {t('agentProfile.crossProviderTab.enableLabel')}
        </Label>
        <Switch
          id={switchId}
          checked={Boolean(settings.customMixedProfileActive)}
          disabled={isSaving}
          onCheckedChange={(active) => void handleActiveChange(active)}
        />
      </div>
      {saveFailed && <p role="alert" className="text-xs text-destructive">{t('agentProfile.crossProviderTab.saveFailed')}</p>}

      {/* Info banner */}
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-primary/80">
          {t(settings.customMixedProfileActive ? 'agentProfile.crossProviderTab.activateInfo' : 'agentProfile.crossProviderTab.inactiveInfo')}
        </p>
      </div>

      {/* Pipeline Phase Configuration */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="font-medium text-sm text-foreground mb-1">
          {t('agentProfile.phaseConfiguration')}
        </h4>
        <p className="text-xs text-muted-foreground mb-4">
          {t('agentProfile.phaseConfigurationDescription')}
        </p>
        <MixedPhaseEditor />
      </div>

      {/* Feature Model Configuration */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h4 className="font-medium text-sm text-foreground mb-1">
          {t('agentProfile.crossProviderTab.featureModelsTitle')}
        </h4>
        <p className="text-xs text-muted-foreground mb-4">
          {t('agentProfile.crossProviderTab.featureModelsDescription')}
        </p>
        <MixedFeatureEditor />
      </div>
    </div>
  );
}
