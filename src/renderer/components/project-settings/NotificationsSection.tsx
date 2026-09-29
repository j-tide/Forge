import { useTranslation } from 'react-i18next';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import type { ProjectSettings } from '../../../shared/types';

interface NotificationsSectionProps {
  settings: ProjectSettings;
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
}

export function NotificationsSection({ settings, onUpdateSettings }: NotificationsSectionProps) {
  const { t } = useTranslation('uiProjectSettings');
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{t('notifications')}</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="font-normal text-foreground">{t('onComplete')}</Label>
          <Switch
            checked={settings.notifications.onTaskComplete}
            onCheckedChange={(checked) =>
              onUpdateSettings({
                notifications: {
                  ...settings.notifications,
                  onTaskComplete: checked
                }
              })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal text-foreground">{t('onFailed')}</Label>
          <Switch
            checked={settings.notifications.onTaskFailed}
            onCheckedChange={(checked) =>
              onUpdateSettings({
                notifications: {
                  ...settings.notifications,
                  onTaskFailed: checked
                }
              })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal text-foreground">{t('onReview')}</Label>
          <Switch
            checked={settings.notifications.onReviewNeeded}
            onCheckedChange={(checked) =>
              onUpdateSettings({
                notifications: {
                  ...settings.notifications,
                  onReviewNeeded: checked
                }
              })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="font-normal text-foreground">{t('sound')}</Label>
          <Switch
            checked={settings.notifications.sound}
            onCheckedChange={(checked) =>
              onUpdateSettings({
                notifications: {
                  ...settings.notifications,
                  sound: checked
                }
              })
            }
          />
        </div>
      </div>
    </section>
  );
}
