import { AlertCircle, GitMerge, Loader2, Check, RotateCcw, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import { persistTaskStatus, startTaskOrQueue } from '../../../stores/task-store';
import type { Task } from '../../../../shared/types';

interface LoadingMessageProps {
  message?: string;
}

/**
 * Displays a loading indicator while workspace info is being fetched
 */
export function LoadingMessage({ message }: LoadingMessageProps) {
  const { t: uiT } = useTranslation('uiTasks');
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{message || uiT('review.loadingWorkspace')}</span>
      </div>
    </div>
  );
}

interface NoWorkspaceMessageProps {
  task?: Task;
  onClose?: () => void;
}

/**
 * Displays message when no workspace is found for the task
 */
export function NoWorkspaceMessage({ task, onClose }: NoWorkspaceMessageProps) {
  const { t } = useTranslation(['tasks', 'taskReview', 'common']);
  const { t: uiT } = useTranslation('uiTasks');
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isPlanReview =
    task?.status === 'human_review' &&
    task.reviewReason === 'plan_review';

  const handleMarkDone = async () => {
    if (!task) return;

    setIsMarkingDone(true);
    try {
      await persistTaskStatus(task.id, 'done');
      // Auto-close modal after marking as done
      onClose?.();
    } catch (err) {
      console.error('Error marking task as done:', err);
    } finally {
      setIsMarkingDone(false);
    }
  };

  const handleProceedToCoding = async () => {
    if (!task) return;

    setIsProceeding(true);
    setError(null);
    setNotice(null);
    try {
      const result = await startTaskOrQueue(task.id);
      if (!result.success) {
        setError(result.error || t('tasks:wizard.errors.startFailed'));
      } else if (result.action === 'queued') {
        setNotice(t('tasks:queue.movedToQueue'));
      }
    } catch (err) {
      console.error('Error proceeding to coding:', err);
      setError(err instanceof Error ? err.message : t('tasks:wizard.errors.startFailed'));
    } finally {
      setIsProceeding(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        {isPlanReview ? uiT('review.humanReviewRequired') : uiT('review.noWorkspace')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {isPlanReview
          ? uiT('review.planReviewDescription')
          : uiT('review.noWorkspaceDescription')}
      </p>

      {/* Allow marking as done */}
      {isPlanReview ? (
        <Button
          onClick={handleProceedToCoding}
          disabled={isProceeding}
          size="sm"
          variant="default"
          className="w-full"
        >
          {isProceeding ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {uiT('review.updating')}
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              {uiT('review.proceedToCoding')}
            </>
          )}
        </Button>
      ) : task && task.status === 'human_review' && (
        <Button
          onClick={handleMarkDone}
          disabled={isMarkingDone}
          size="sm"
          variant="default"
          className="w-full"
        >
          {isMarkingDone ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {uiT('review.updating')}
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              {t('taskReview:merge.actions.markAsDone')}
            </>
          )}
        </Button>
      )}

      {error && (
        <p className="text-xs text-destructive mt-2">{error}</p>
      )}
      {notice && (
        <p className="text-xs text-muted-foreground mt-2">{notice}</p>
      )}
    </div>
  );
}

interface StagedInProjectMessageProps {
  task: Task;
  projectPath?: string;
  hasWorktree?: boolean;
  onClose?: () => void;
  onReviewAgain?: () => void;
}

/**
 * Displays message when changes have already been staged in the main project
 */
export function StagedInProjectMessage({ task, projectPath, hasWorktree = false, onClose, onReviewAgain }: StagedInProjectMessageProps) {
  const { t } = useTranslation(['taskReview', 'common']);
  const { t: uiT } = useTranslation('uiTasks');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteWorktreeAndMarkDone = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      // Call the discard/delete worktree command
      // Pass skipStatusChange=true to prevent backend from resetting to 'backlog'
      // since we explicitly set status to 'done' immediately after
      const result = await window.electronAPI.discardWorktree(task.id, true);

      if (!result.success) {
        setError(result.error || t('taskReview:stagedSuccess.errors.failedToDeleteWorktree'));
        return;
      }

      // Mark task as done - check result since worktree is already deleted
      const statusResult = await persistTaskStatus(task.id, 'done');
      if (!statusResult.success) {
        // Worktree is already deleted but status update failed - inform user of inconsistent state
        setError(t('taskReview:stagedSuccess.errors.worktreeDeletedButStatusFailed', { error: statusResult.error || t('common:errors.unknownError') }));
        return;
      }

      // Auto-close modal after marking as done
      onClose?.();
    } catch (err) {
      console.error('Error deleting worktree:', err);
      setError(err instanceof Error ? err.message : t('taskReview:stagedSuccess.errors.failedToDeleteWorktree'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkDoneOnly = async () => {
    setIsMarkingDone(true);
    setError(null);

    try {
      const result = await persistTaskStatus(task.id, 'done', { keepWorktree: true });
      if (!result.success) {
        setError(result.error || t('taskReview:stagedSuccess.errors.failedToMarkAsDone'));
        return;
      }
      onClose?.();
    } catch (err) {
      console.error('Error marking task as done:', err);
      setError(err instanceof Error ? err.message : t('taskReview:stagedSuccess.errors.failedToMarkAsDone'));
    } finally {
      setIsMarkingDone(false);
    }
  };

  const handleReviewAgain = async () => {
    if (!onReviewAgain) return;

    setIsResetting(true);
    setError(null);

    try {
      // Clear the staged flag via IPC
      const result = await window.electronAPI.clearStagedState(task.id);

      if (!result.success) {
        setError(result.error || t('taskReview:stagedSuccess.errors.failedToResetStagedState'));
        return;
      }

      // Trigger re-render by calling parent callback
      onReviewAgain();
    } catch (err) {
      console.error('Error resetting staged state:', err);
      setError(err instanceof Error ? err.message : t('taskReview:stagedSuccess.errors.failedToResetStagedState'));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-success" />
        {uiT('review.stagedInProject')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {task.stagedAt
          ? uiT('review.stagedDescriptionDated', { date: new Date(task.stagedAt).toLocaleDateString() })
          : uiT('review.stagedDescription')}
      </p>
      <div className="bg-background/50 rounded-lg p-3 mb-3">
        <p className="text-xs text-muted-foreground mb-2">{t('taskReview:stagedSuccess.nextSteps')}</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>{t('taskReview:stagedSuccess.reviewChanges')} <code className="bg-background px-1 rounded">git status</code> {uiT('review.and')} <code className="bg-background px-1 rounded">git diff --staged</code></li>
          <li>{t('taskReview:stagedSuccess.commitWhenReady')} <code className="bg-background px-1 rounded">{uiT('review.commitExample')}</code></li>
          <li>{t('taskReview:stagedSuccess.pushToRemote')}</li>
        </ol>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {/* Primary action: Mark Done or Delete Worktree & Mark Done */}
          {hasWorktree ? (
            <Button
              onClick={handleDeleteWorktreeAndMarkDone}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="default"
              className="flex-1"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('taskReview:stagedSuccess.cleaningUp')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('taskReview:stagedSuccess.deleteWorktreeAndMarkDone')}
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleMarkDoneOnly}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="default"
              className="flex-1"
            >
              {isMarkingDone ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('taskReview:stagedSuccess.markingDone')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('taskReview:merge.actions.markAsDone')}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Secondary actions row */}
        <div className="flex gap-2">
          {/* Mark Done Only (when worktree exists) - allows keeping worktree */}
          {hasWorktree && (
            <Button
              onClick={handleMarkDoneOnly}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              {isMarkingDone ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('taskReview:stagedSuccess.markingDone')}
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  {t('taskReview:stagedSuccess.markDoneOnly')}
                </>
              )}
            </Button>
          )}

          {/* Review Again button - only show if worktree exists and callback provided */}
          {hasWorktree && onReviewAgain && (
            <Button
              onClick={handleReviewAgain}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('taskReview:stagedSuccess.resetting')}
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t('taskReview:stagedSuccess.reviewAgain')}
                </>
              )}
            </Button>
          )}
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {hasWorktree && (
          <p className="text-xs text-muted-foreground">
            {t('taskReview:stagedSuccess.worktreeExplanation')}
          </p>
        )}
      </div>
    </div>
  );
}
