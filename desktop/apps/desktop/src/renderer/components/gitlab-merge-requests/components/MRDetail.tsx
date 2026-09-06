import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  User,
  Users,
  Clock,
  GitBranch,
  FileDiff,
  Sparkles,
  Send,
  XCircle,
  Loader2,
  GitMerge,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { ScrollArea } from '../../ui/scroll-area';
import { Progress } from '../../ui/progress';
import { ErrorBoundary } from '../../ui/error-boundary';
import { ReviewFindings } from './ReviewFindings';
import type {
  GitLabMergeRequest,
  GitLabMRReviewResult,
  GitLabMRReviewProgress,
} from '../hooks/useGitLabMRs';
import type { GitLabNewCommitsCheck } from '../../../../shared/types';

interface MRDetailProps {
  mr: GitLabMergeRequest;
  reviewResult: GitLabMRReviewResult | null;
  reviewProgress: GitLabMRReviewProgress | null;
  isReviewing: boolean;
  onRunReview: () => void;
  onRunFollowupReview: () => void;
  onCheckNewCommits: () => Promise<GitLabNewCommitsCheck>;
  onCancelReview: () => void;
  onPostReview: (selectedFindingIds?: string[]) => Promise<boolean>;
  onPostNote: (body: string) => Promise<boolean>;
  onMergeMR: (mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  onAssignMR: (userIds: number[]) => Promise<boolean>;
  onApproveMR: () => Promise<boolean>;
}

function formatDate(dateString: string, language: string): string {
  return new Date(dateString).toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: GitLabMRReviewResult['overallStatus']): string {
  switch (status) {
    case 'approve':
      return 'bg-success/20 text-success border-success/50';
    case 'request_changes':
      return 'bg-destructive/20 text-destructive border-destructive/50';
    default:
      return 'bg-muted';
  }
}

function getMRStateColor(state: string): string {
  switch (state) {
    case 'opened':
      return 'bg-success/20 text-success border-success/50';
    case 'merged':
      return 'bg-purple-500/20 text-purple-500 border-purple-500/50';
    case 'closed':
      return 'bg-destructive/20 text-destructive border-destructive/50';
    default:
      return 'bg-muted';
  }
}

export function MRDetail({
  mr,
  reviewResult,
  reviewProgress,
  isReviewing,
  onRunReview,
  onRunFollowupReview,
  onCheckNewCommits,
  onCancelReview,
  onPostReview,
  onPostNote,
  onMergeMR,
  onApproveMR,
}: MRDetailProps) {
  const { t, i18n } = useTranslation(['common', 'uiIntegrations']);
  // Selection state for findings
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [postedFindingIds, setPostedFindingIds] = useState<Set<string>>(new Set());
  const [isPostingFindings, setIsPostingFindings] = useState(false);
  const [postSuccess, setPostSuccess] = useState<{ count: number; timestamp: number } | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [newCommitsCheck, setNewCommitsCheck] = useState<GitLabNewCommitsCheck | null>(null);

  // Auto-select critical and high findings when review completes (excluding already posted)
  useEffect(() => {
    if (reviewResult?.success && reviewResult.findings.length > 0) {
      const importantFindings = reviewResult.findings
        .filter(f => (f.severity === 'critical' || f.severity === 'high') && !postedFindingIds.has(f.id))
        .map(f => f.id);
      setSelectedFindingIds(new Set(importantFindings));
    }
  }, [reviewResult, postedFindingIds]);

  // Check for new commits only when findings have been posted to GitLab
  // Follow-up review only makes sense after initial findings are shared with the contributor
  const hasPostedFindings = postedFindingIds.size > 0 || reviewResult?.hasPostedFindings;

  const checkForNewCommits = useCallback(async () => {
    // Only check for new commits if we have a review AND findings have been posted
    if (reviewResult?.success && reviewResult.reviewedCommitSha && hasPostedFindings) {
      try {
        const result = await onCheckNewCommits();
        setNewCommitsCheck(result);
      } finally {
        // No additional state to clean up
      }
    } else {
      // Clear any existing new commits check if we haven't posted yet
      setNewCommitsCheck(null);
    }
  }, [reviewResult, onCheckNewCommits, hasPostedFindings]);

  useEffect(() => {
    checkForNewCommits();
  }, [checkForNewCommits]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (postSuccess) {
      const timer = setTimeout(() => setPostSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [postSuccess]);

  // Count selected findings by type for the button label
  const selectedCount = selectedFindingIds.size;

  // Check if MR is ready to merge based on review
  const isReadyToMerge = useMemo(() => {
    if (!reviewResult || !reviewResult.success) return false;
    // Check if the summary contains "READY TO MERGE"
    return reviewResult.summary?.includes('READY TO MERGE') || reviewResult.overallStatus === 'approve';
  }, [reviewResult]);

  // Compute the overall MR review status for visual display
  type MRStatus = 'not_reviewed' | 'reviewed_pending_post' | 'waiting_for_changes' | 'ready_to_merge' | 'needs_attention' | 'ready_for_followup' | 'followup_issues_remain';
  const mrStatus: { status: MRStatus; label: string; description: string; icon: React.ReactNode; color: string } = useMemo(() => {
    if (!reviewResult || !reviewResult.success) {
      return {
        status: 'not_reviewed',
        label: t('uiIntegrations:gitlab.reviewStatus.notReviewed'),
        description: t('uiIntegrations:gitlab.reviewStatus.notReviewedDesc'),
        icon: <Sparkles className="h-5 w-5" />,
        color: 'bg-muted text-muted-foreground border-muted',
      };
    }

    const totalPosted = postedFindingIds.size + (reviewResult.postedFindingIds?.length ?? 0);
    const hasPosted = totalPosted > 0 || reviewResult.hasPostedFindings;
    const hasBlockers = reviewResult.findings.some(f => f.severity === 'critical' || f.severity === 'high');
    const unpostedFindings = reviewResult.findings.filter(f => !postedFindingIds.has(f.id) && !reviewResult.postedFindingIds?.includes(f.id));
    const hasUnpostedBlockers = unpostedFindings.some(f => f.severity === 'critical' || f.severity === 'high');
    const hasNewCommits = newCommitsCheck?.hasNewCommits ?? false;
    const newCommitCount = newCommitsCheck?.newCommitCount ?? 0;

    // Follow-up review specific statuses
    if (reviewResult.isFollowupReview) {
      const resolvedCount = reviewResult.resolvedFindings?.length ?? 0;
      const unresolvedCount = reviewResult.unresolvedFindings?.length ?? 0;
      const newIssuesCount = reviewResult.newFindingsSinceLastReview?.length ?? 0;

      // Check if any remaining issues are blockers (HIGH/CRITICAL)
      const hasBlockingIssuesRemaining = reviewResult.findings.some(
        f => (f.severity === 'critical' || f.severity === 'high')
      );

      // Check if ready for another follow-up (new commits after this follow-up)
      if (hasNewCommits) {
        return {
          status: 'ready_for_followup',
          label: t('uiIntegrations:gitlab.reviewStatus.readyFollowup'),
          description: t('uiIntegrations:gitlab.reviewStatus.newAfterFollowup', { count: newCommitCount }),
          icon: <RefreshCw className="h-5 w-5" />,
          color: 'bg-info/20 text-info border-info/50',
        };
      }

      // All issues resolved - ready to merge
      if (unresolvedCount === 0 && newIssuesCount === 0) {
        return {
          status: 'ready_to_merge',
          label: t('uiIntegrations:gitlab.reviewStatus.readyMerge'),
          description: t('uiIntegrations:gitlab.reviewStatus.allResolved', { count: resolvedCount }),
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      // No blocking issues (only MEDIUM/LOW) - can merge with suggestions
      if (!hasBlockingIssuesRemaining) {
        const suggestionsCount = unresolvedCount + newIssuesCount;
        return {
          status: 'ready_to_merge',
          label: t('uiIntegrations:gitlab.reviewStatus.readyMerge'),
          description: t('uiIntegrations:gitlab.reviewStatus.suggestions', { resolved: resolvedCount, count: suggestionsCount }),
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      // Blocking issues still remain after follow-up
      return {
        status: 'followup_issues_remain',
        label: t('uiIntegrations:gitlab.reviewStatus.blocking'),
        description: t('uiIntegrations:gitlab.reviewStatus.blockersRemain', { resolved: resolvedCount, count: unresolvedCount }),
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    // Initial review statuses (non-follow-up)

    // Priority 1: Ready for follow-up review (posted findings + new commits)
    if (hasPosted && hasNewCommits) {
      return {
        status: 'ready_for_followup',
        label: t('uiIntegrations:gitlab.reviewStatus.readyFollowup'),
        description: t('uiIntegrations:gitlab.reviewStatus.newAfterReview', { count: newCommitCount }),
        icon: <RefreshCw className="h-5 w-5" />,
        color: 'bg-info/20 text-info border-info/50',
      };
    }

    // Priority 2: Ready to merge (no blockers)
    if (isReadyToMerge && hasPosted) {
      return {
        status: 'ready_to_merge',
        label: t('uiIntegrations:gitlab.reviewStatus.readyMerge'),
        description: t('uiIntegrations:gitlab.reviewStatus.noBlockers'),
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    // Priority 3: Waiting for changes (posted but has blockers, no new commits yet)
    if (hasPosted && hasBlockers) {
      return {
        status: 'waiting_for_changes',
        label: t('uiIntegrations:gitlab.reviewStatus.waitingChanges'),
        description: t('uiIntegrations:gitlab.reviewStatus.postedWaiting', { count: totalPosted }),
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    // Priority 4: Ready to merge (posted, no blockers)
    if (hasPosted && !hasBlockers) {
      return {
        status: 'ready_to_merge',
        label: t('uiIntegrations:gitlab.reviewStatus.readyMerge'),
        description: t('uiIntegrations:gitlab.reviewStatus.postedClear', { count: totalPosted }),
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    // Priority 5: Needs attention (unposted blockers)
    if (hasUnpostedBlockers) {
      return {
        status: 'needs_attention',
        label: t('uiIntegrations:gitlab.reviewStatus.attention'),
        description: t('uiIntegrations:gitlab.reviewStatus.needPost', { count: unpostedFindings.length }),
        icon: <AlertCircle className="h-5 w-5" />,
        color: 'bg-destructive/20 text-destructive border-destructive/50',
      };
    }

    // Default: Review complete, pending post
    return {
      status: 'reviewed_pending_post',
      label: t('uiIntegrations:gitlab.reviewStatus.complete'),
      description: t('uiIntegrations:gitlab.reviewStatus.found', { count: reviewResult.findings.length }),
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'bg-primary/20 text-primary border-primary/50',
    };
  }, [reviewResult, postedFindingIds, isReadyToMerge, newCommitsCheck, t]);

  const handlePostReview = async () => {
    const idsToPost = Array.from(selectedFindingIds);
    if (idsToPost.length === 0) return;

    setIsPostingFindings(true);
    try {
      const success = await onPostReview(idsToPost);
      if (success) {
        // Mark these findings as posted
        setPostedFindingIds(prev => new Set([...prev, ...idsToPost]));
        // Clear selection
        setSelectedFindingIds(new Set());
        // Show success message
        setPostSuccess({ count: idsToPost.length, timestamp: Date.now() });
        // After posting, check for new commits (follow-up review now available)
        // Use a small delay to allow the backend to save the posted state
        setTimeout(() => checkForNewCommits(), 500);
      }
    } finally {
      setIsPostingFindings(false);
    }
  };

  const handleApprove = async () => {
    if (!reviewResult) return;

    setIsApproving(true);
    try {
      await onApproveMR();
    } finally {
      setIsApproving(false);
    }
  };

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await onMergeMR('squash'); // Default to squash merge
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <ErrorBoundary>
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={getMRStateColor(mr.state)}>
                {t(`uiIntegrations:gitlab.states.${mr.state}`, { defaultValue: mr.state })}
              </Badge>
              <span className="text-sm text-muted-foreground">!{mr.iid}</span>
            </div>
            <Button variant="ghost" size="icon" asChild aria-label={t('accessibility.openOnGitLabAriaLabel')}>
              <a href={mr.webUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-foreground">{mr.title}</h2>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {mr.author.username}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDate(mr.createdAt, i18n.resolvedLanguage || i18n.language)}
          </div>
          <div className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" />
            {mr.sourceBranch} → {mr.targetBranch}
          </div>
          {mr.assignees && mr.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {mr.assignees.map(a => a.username).join(', ')}
            </div>
          )}
        </div>

        {/* Merge Status */}
        {mr.mergeStatus && (
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="flex items-center gap-1">
              <FileDiff className="h-3 w-3" />
              {t(`uiIntegrations:gitlab.mergeStatus.${mr.mergeStatus}`, { defaultValue: mr.mergeStatus })}
            </Badge>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {/* Show Follow-up Review button if there are new commits since last review */}
            {newCommitsCheck?.hasNewCommits && !isReviewing ? (
              <Button
                onClick={onRunFollowupReview}
                disabled={isReviewing}
                className="flex-1"
                variant="secondary"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('uiIntegrations:gitlab.followupWithCommits', { count: newCommitsCheck.newCommitCount })}
              </Button>
            ) : (
              <Button
                onClick={onRunReview}
                disabled={isReviewing}
                className="flex-1"
              >
                {isReviewing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('uiIntegrations:gitlab.reviewing')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t('uiIntegrations:gitlab.runReview')}
                  </>
                )}
              </Button>
            )}
            {isReviewing && (
              <Button onClick={onCancelReview} variant="destructive">
                <XCircle className="h-4 w-4 mr-2" />
                {t('uiIntegrations:gitlab.cancel')}
              </Button>
            )}
            {reviewResult?.success && selectedCount > 0 && !isReviewing && (
              <Button onClick={handlePostReview} variant="secondary" disabled={isPostingFindings}>
                {isPostingFindings ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('uiIntegrations:gitlab.posting')}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t('uiIntegrations:gitlab.postFindings', { count: selectedCount })}
                  </>
                )}
              </Button>
            )}
            {/* Success message */}
            {postSuccess && (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle className="h-4 w-4" />
                {t('uiIntegrations:gitlab.postSuccess', { count: postSuccess.count })}
              </div>
            )}
          </div>

          {/* Approval and Merge buttons */}
          {reviewResult?.success && isReadyToMerge && mr.state === 'opened' && (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleApprove}
                disabled={isApproving}
                variant="default"
                className="flex-1 bg-success hover:bg-success/90"
              >
                {isApproving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('uiIntegrations:gitlab.approving')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {t('uiIntegrations:gitlab.approve')}
                  </>
                )}
              </Button>
              <Button
                onClick={handleMerge}
                disabled={isMerging}
                variant="outline"
                className="flex-1"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('uiIntegrations:gitlab.merging')}
                  </>
                ) : (
                  <>
                    <GitMerge className="h-4 w-4 mr-2" />
                    {t('uiIntegrations:gitlab.merge')}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* MR Review Status Banner */}
        <Card className={`border-2 ${mrStatus.color} ${mrStatus.status === 'ready_for_followup' ? 'animate-pulse-subtle' : ''}`}>
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${mrStatus.color}`}>
                {mrStatus.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{mrStatus.label}</div>
                <div className="text-sm text-muted-foreground truncate">{mrStatus.description}</div>
              </div>
              {mrStatus.status === 'ready_for_followup' && (
                <Button
                  onClick={onRunFollowupReview}
                  disabled={isReviewing}
                  className="bg-info hover:bg-info/90 text-info-foreground shrink-0"
                >
                  {isReviewing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('uiIntegrations:gitlab.reviewing')}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      {t('uiIntegrations:gitlab.runFollowup')}
                    </>
                  )}
                </Button>
              )}
              {mrStatus.status === 'waiting_for_changes' && newCommitsCheck?.hasNewCommits && (
                <Badge variant="outline" className="bg-primary/20 text-primary border-primary/50 shrink-0">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {t('uiIntegrations:gitlab.newCommits', { count: newCommitsCheck.newCommitCount })}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Review Progress */}
        {reviewProgress && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{reviewProgress.message}</span>
                  <span className="text-muted-foreground">{reviewProgress.progress}%</span>
                </div>
                <Progress value={reviewProgress.progress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review Result */}
        {reviewResult?.success && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {reviewResult.isFollowupReview ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {reviewResult.isFollowupReview ? t('uiIntegrations:gitlab.followupTitle') : t('uiIntegrations:gitlab.resultTitle')}
                </span>
                <Badge variant="outline" className={getStatusColor(reviewResult.overallStatus)}>
                  {reviewResult.overallStatus === 'approve' && t('uiIntegrations:gitlab.approve')}
                  {reviewResult.overallStatus === 'request_changes' && t('uiIntegrations:gitlab.changesRequested')}
                  {reviewResult.overallStatus === 'comment' && t('uiIntegrations:gitlab.comment')}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-hidden">
              {/* Follow-up Review Resolution Status */}
              {reviewResult.isFollowupReview && (
                <div className="flex flex-wrap gap-2 pb-2 border-b border-border">
                  {(reviewResult.resolvedFindings?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-success/20 text-success border-success/50">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('uiIntegrations:gitlab.resolved', { count: reviewResult.resolvedFindings?.length })}
                    </Badge>
                  )}
                  {(reviewResult.unresolvedFindings?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-warning/20 text-warning border-warning/50">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {t('uiIntegrations:gitlab.stillOpen', { count: reviewResult.unresolvedFindings?.length })}
                    </Badge>
                  )}
                  {(reviewResult.newFindingsSinceLastReview?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/50">
                      <XCircle className="h-3 w-3 mr-1" />
                      {t('uiIntegrations:gitlab.newIssues', { count: reviewResult.newFindingsSinceLastReview?.length })}
                    </Badge>
                  )}
                </div>
              )}

              <p className="text-sm text-muted-foreground break-words">{reviewResult.summary}</p>

              {/* Interactive Findings with Selection */}
              <ReviewFindings
                findings={reviewResult.findings}
                selectedIds={selectedFindingIds}
                postedIds={postedFindingIds}
                onSelectionChange={setSelectedFindingIds}
              />

              {reviewResult.reviewedAt && (
                <p className="text-xs text-muted-foreground">
                  {t('uiIntegrations:gitlab.reviewedAt', { date: formatDate(reviewResult.reviewedAt, i18n.resolvedLanguage || i18n.language) })}
                  {reviewResult.reviewedCommitSha && (
                    t('uiIntegrations:gitlab.reviewedCommit', { sha: reviewResult.reviewedCommitSha.substring(0, 7) })
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Review Error */}
        {reviewResult && !reviewResult.success && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{t('uiIntegrations:gitlab.reviewFailed')}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('uiIntegrations:gitlab.description')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            {mr.description ? (
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans break-words max-w-full overflow-hidden">
                {mr.description}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t('uiIntegrations:gitlab.noDescription')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Labels */}
        {mr.labels && mr.labels.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('uiIntegrations:gitlab.labels')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {mr.labels.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
    </ErrorBoundary>
  );
}
