import { useTranslation } from 'react-i18next';
import i18n from '../../../../shared/i18n';
import { FolderOpen } from 'lucide-react';

/**
 * Shows an empty state when no project is selected in settings.
 */
export function EmptyProjectState() {
  useTranslation('uiSettings');
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-muted-foreground">{i18n.t('uiSettings:text019')}</p>
    </div>
  );
}
