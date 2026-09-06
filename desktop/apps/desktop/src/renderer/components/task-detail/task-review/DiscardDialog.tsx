import { FolderX, Loader2 } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import type { Task, WorktreeStatus } from '../../../../shared/types';

interface DiscardDialogProps {
  open: boolean;
  task: Task;
  worktreeStatus: WorktreeStatus | null;
  isDiscarding: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}

/**
 * Confirmation dialog for discarding build changes
 */
export function DiscardDialog({
  open,
  task,
  worktreeStatus,
  isDiscarding,
  onOpenChange,
  onDiscard
}: DiscardDialogProps) {
  const { t } = useTranslation('common');
  const { t: uiT } = useTranslation('uiTasks');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <FolderX className="h-5 w-5 text-destructive" />
            {uiT('review.discardBuild')}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-3">
              <p>
                <Trans ns="uiTasks" i18nKey="review.discardConfirm" values={{ title: task.title }} components={{ strong: <strong className="text-foreground" /> }} />
              </p>
              <p className="text-destructive">
                {uiT('review.discardWarning')}
              </p>
              {worktreeStatus?.exists && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">{uiT('review.filesChanged')}</span>
                    <span>{worktreeStatus.filesChanged || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{uiT('review.lines')}</span>
                    <span className="text-success">+{worktreeStatus.additions || 0}</span>
                    <span className="text-destructive">-{worktreeStatus.deletions || 0}</span>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDiscarding}>{t('buttons.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onDiscard();
            }}
            disabled={isDiscarding}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDiscarding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uiT('review.discarding')}
              </>
            ) : (
              <>
                <FolderX className="mr-2 h-4 w-4" />
                {uiT('review.discardBuild')}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
