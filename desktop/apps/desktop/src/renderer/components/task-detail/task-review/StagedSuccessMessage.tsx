import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge, Copy, Check, Sparkles, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { persistTaskStatus } from '../../../stores/task-store';
import { useToast } from '../../../hooks/use-toast';
import type { Task } from '../../../../shared/types';

interface StagedSuccessMessageProps {
  stagedSuccess: string;
  suggestedCommitMessage?: string;
  task: Task;
  hasWorktree?: boolean;
  projectPath?: string;
  onClose?: () => void;
  onReviewAgain?: () => void;
}

/**
 * Displays success message after changes have been freshly staged in the main project.
 * Includes AI-generated commit message and action buttons (mark done, delete worktree, review again).
 */
export function StagedSuccessMessage({
  stagedSuccess,
  suggestedCommitMessage,
  task,
  hasWorktree = false,
  onClose,
  onReviewAgain
}: StagedSuccessMessageProps) {
  const { t } = useTranslation(['taskReview', 'common']);
  const { t: uiT } = useTranslation('uiTasks');
  const { toast } = useToast();
  const [commitMessage, setCommitMessage] = useState(suggestedCommitMessage || '');
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyPendingRef = useRef(false);
  const copyGenerationRef = useRef(0);
  const copyMountedRef = useRef(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTaskIdRef = useRef(task.id);
  const commitMessageRef = useRef(commitMessage);
  const suggestedCommitMessageRef = useRef(suggestedCommitMessage);
  currentTaskIdRef.current = task.id;
  commitMessageRef.current = commitMessage;
  suggestedCommitMessageRef.current = suggestedCommitMessage;
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentTaskIdRef.current = task.id;
    copyMountedRef.current = true;
    copyGenerationRef.current += 1;
    copyPendingRef.current = false;
    setIsCopying(false);
    setCopied(false);
    setCopyError(false);
    setCommitMessage(suggestedCommitMessageRef.current || '');

    return () => {
      copyMountedRef.current = false;
      copyGenerationRef.current += 1;
      copyPendingRef.current = false;
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    };
  }, [task.id]);

  const handleCopy = async () => {
    if (!commitMessage || copyPendingRef.current) return;
    copyPendingRef.current = true;
    const generation = ++copyGenerationRef.current;
    const taskId = task.id;
    const text = commitMessage;
    const isCurrentCopy = () => copyMountedRef.current
      && copyGenerationRef.current === generation
      && currentTaskIdRef.current === taskId;
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = null;
    setIsCopying(true);
    setCopied(false);
    setCopyError(false);

    try {
      await navigator.clipboard.writeText(text);
      if (!isCurrentCopy() || commitMessageRef.current !== text) return;
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => {
        if (isCurrentCopy()) setCopied(false);
        copiedTimerRef.current = null;
      }, 2000);
    } catch {
      if (!isCurrentCopy()) return;
      setCopyError(true);
      toast({
        title: t('taskReview:stagedSuccess.copyFailed'),
        description: t('taskReview:stagedSuccess.errors.failedToCopy'),
        variant: 'destructive',
      });
    } finally {
      if (isCurrentCopy()) {
        copyPendingRef.current = false;
        setIsCopying(false);
      }
    }
  };

  const handleDeleteWorktreeAndMarkDone = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const result = await window.electronAPI.discardWorktree(task.id, true);

      if (!result.success) {
        setError(result.error || t('taskReview:stagedSuccess.errors.failedToDeleteWorktree'));
        return;
      }

      const statusResult = await persistTaskStatus(task.id, 'done');
      if (!statusResult.success) {
        setError(t('taskReview:stagedSuccess.errors.worktreeDeletedButStatusFailed', { error: statusResult.error || t('common:errors.unknownError') }));
        return;
      }

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
      const result = await window.electronAPI.clearStagedState(task.id);

      if (!result.success) {
        setError(result.error || t('taskReview:stagedSuccess.errors.failedToResetStagedState'));
        return;
      }

      onReviewAgain();
    } catch (err) {
      console.error('Error resetting staged state:', err);
      setError(err instanceof Error ? err.message : t('taskReview:stagedSuccess.errors.failedToResetStagedState'));
    } finally {
      setIsResetting(false);
    }
  };

  const anyActionInProgress = isDeleting || isMarkingDone || isResetting;

  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-success" />
        {t('taskReview:stagedSuccess.title')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {stagedSuccess}
      </p>

      {/* Commit Message Section */}
      {suggestedCommitMessage && (
        <div className="bg-background/50 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-400" />
              {t('taskReview:stagedSuccess.aiCommitMessage')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 px-2 text-xs"
              disabled={!commitMessage || isCopying}
              aria-busy={isCopying}
            >
              {isCopying ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {t('taskReview:stagedSuccess.copying')}
                </>
              ) : copied ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-success" />
                  {t('taskReview:stagedSuccess.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  {t('taskReview:stagedSuccess.copy')}
                </>
              )}
            </Button>
          </div>
          <Textarea
            value={commitMessage}
            onChange={(e) => {
              commitMessageRef.current = e.target.value;
              setCommitMessage(e.target.value);
              setCopied(false);
              setCopyError(false);
              if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
              copiedTimerRef.current = null;
            }}
            className="font-mono text-xs min-h-[100px] bg-background/80 resize-y"
            placeholder={t('taskReview:stagedSuccess.commitMessagePlaceholder')}
          />
          {copyError && (
            <div className="mt-2 flex items-center gap-2">
              <p role="alert" className="text-xs text-destructive">
                {t('taskReview:stagedSuccess.errors.failedToCopy')}
              </p>
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={isCopying}>
                {t('common:buttons.retry')}
              </Button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {t('taskReview:stagedSuccess.editHint')} <code className="bg-background px-1 rounded">git commit -m "..."</code>
          </p>
        </div>
      )}

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
          {hasWorktree ? (
            <Button
              onClick={handleDeleteWorktreeAndMarkDone}
              disabled={anyActionInProgress}
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
              disabled={anyActionInProgress}
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
                  {t('taskReview:stagedSuccess.markAsDone')}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Secondary actions row */}
        <div className="flex gap-2">
          {hasWorktree && (
            <Button
              onClick={handleMarkDoneOnly}
              disabled={anyActionInProgress}
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

          {hasWorktree && onReviewAgain && (
            <Button
              onClick={handleReviewAgain}
              disabled={anyActionInProgress}
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
