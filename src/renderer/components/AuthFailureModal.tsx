import { useTranslation } from 'react-i18next';
import { AlertTriangle, Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { useAuthFailureStore } from '../stores/auth-failure-store';

interface AuthFailureModalProps {
  onOpenSettings?: () => void;
}

/**
 * Modal displayed when Claude CLI encounters an authentication failure (401 error).
 * Prompts the user to re-authenticate via Settings > Claude Profiles.
 */
export function AuthFailureModal({ onOpenSettings }: AuthFailureModalProps) {
  const { isModalOpen, authFailureInfo, hideAuthFailureModal, clearAuthFailure } = useAuthFailureStore();
  const { t } = useTranslation(['common', 'uiShellAuth']);

  if (!authFailureInfo) return null;

  const profileName = authFailureInfo.profileName || t('uiShellAuth:auth.unknownProfile');

  // Get user-friendly message for the auth failure type
  const getFailureMessage = () => {
    switch (authFailureInfo.failureType) {
      case 'expired':
        return t('uiShellAuth:auth.tokenExpired');
      case 'invalid':
        return t('uiShellAuth:auth.tokenInvalid');
      case 'missing':
        return t('uiShellAuth:auth.tokenMissing');
      default:
        return t('uiShellAuth:auth.authFailed');
    }
  };

  const failureMessage = getFailureMessage();

  const handleGoToSettings = () => {
    hideAuthFailureModal();
    onOpenSettings?.();
  };

  const handleDismiss = () => {
    clearAuthFailure();
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && hideAuthFailureModal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-lg">
                {t('uiShellAuth:auth.title')}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {t('uiShellAuth:auth.profileLabel')}: {profileName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-foreground">
            {failureMessage}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('uiShellAuth:auth.description')}
          </p>

          {authFailureInfo.taskId && (
            <div className="rounded-md bg-muted p-3 text-xs">
              <p className="text-muted-foreground">
                {t('uiShellAuth:auth.taskAffected')}: <span className="font-mono">{authFailureInfo.taskId}</span>
              </p>
            </div>
          )}

          {authFailureInfo.originalError && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {t('uiShellAuth:auth.technicalDetails')}
              </summary>
              <pre className="mt-2 rounded-md bg-muted p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {authFailureInfo.originalError}
              </pre>
            </details>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDismiss} className="sm:mr-auto">
            {t('labels.dismiss')}
          </Button>
          <Button onClick={handleGoToSettings} className="gap-2">
            <Settings className="h-4 w-4" />
            {t('uiShellAuth:auth.goToSettings')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
