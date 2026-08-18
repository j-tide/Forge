import { useTranslation } from 'react-i18next';
import i18n from '../../../../shared/i18n';
import type { ReactNode } from 'react';

interface InitializationGuardProps {
  initialized: boolean;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Guard component that shows a message when Auto-Build is not initialized.
 * Used to prevent configuration of features that require Auto-Build setup.
 */
export function InitializationGuard({
  initialized,
  title,
  description: _description,
  children
}: InitializationGuardProps) {
  useTranslation('uiSettings');
  if (!initialized) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">{i18n.t('uiSettings:text020')}{title.toLowerCase()}
      </div>
    );
  }

  return <>{children}</>;
}
