import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { SettingsSection } from './SettingsSection';
import type { AppSettings, NotificationSettings } from '../../../shared/types';

interface AdvancedSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  section: 'updates' | 'notifications';
  version: string;
}

/** Advanced settings for app version and notifications. */
export function AdvancedSettings({ settings, onSettingsChange, section, version }: AdvancedSettingsProps) {
  const { t } = useTranslation('settings');

  if (section === 'updates') {
    return (
      <SettingsSection
        title={t('updates.title')}
        description={t('updates.previewDescription', 'Installed preview version')}
      >
        <div className="rounded-lg border border-border bg-muted/50 p-5 space-y-3">
          <div>
            <p className="text-base font-medium text-foreground">Forge Glass Preview</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              {t('updates.version')}
            </p>
            <p className="text-base font-medium text-foreground">
              {version || t('updates.loading')}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              'updates.previewUnavailable',
              'App updates are unavailable in Forge Glass Preview. Install future releases manually.'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'updates.previewOrigin',
              'Independent derivative of Aperant v2.8.0-beta.6, licensed under AGPL-3.0.'
            )}
          </p>
        </div>
      </SettingsSection>
    );
  }

  const notificationItems: Array<{
    key: keyof NotificationSettings;
    labelKey: string;
    descriptionKey: string;
  }> = [
    { key: 'onTaskComplete', labelKey: 'notifications.onTaskComplete', descriptionKey: 'notifications.onTaskCompleteDescription' },
    { key: 'onTaskFailed', labelKey: 'notifications.onTaskFailed', descriptionKey: 'notifications.onTaskFailedDescription' },
    { key: 'onReviewNeeded', labelKey: 'notifications.onReviewNeeded', descriptionKey: 'notifications.onReviewNeededDescription' },
    { key: 'sound', labelKey: 'notifications.sound', descriptionKey: 'notifications.soundDescription' }
  ];

  return (
    <SettingsSection
      title={t('notifications.title')}
      description={t('notifications.description')}
    >
      <div className="space-y-4">
        {notificationItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium text-foreground">{t(item.labelKey)}</Label>
              <p className="text-sm text-muted-foreground">{t(item.descriptionKey)}</p>
            </div>
            <Switch
              checked={settings.notifications[item.key]}
              onCheckedChange={(checked) =>
                onSettingsChange({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    [item.key]: checked
                  }
                })
              }
            />
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
