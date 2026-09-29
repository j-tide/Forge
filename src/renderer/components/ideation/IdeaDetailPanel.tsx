import { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ExternalLink, Lightbulb, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  IDEATION_TYPE_COLORS,
  IDEATION_STATUS_COLORS
} from '../../../shared/constants';
import type { Idea } from '../../../shared/types';
import { TypeIcon } from './TypeIcon';
import {
  isCodeImprovementIdea,
  isUIUXIdea,
  isDocumentationGapIdea,
  isSecurityHardeningIdea,
  isPerformanceOptimizationIdea,
  isCodeQualityIdea
} from './type-guards';
import { CodeImprovementDetails } from './details/CodeImprovementDetails';
import { UIUXDetails } from './details/UIUXDetails';
import { DocumentationGapDetails } from './details/DocumentationGapDetails';
import { SecurityHardeningDetails } from './details/SecurityHardeningDetails';
import { PerformanceOptimizationDetails } from './details/PerformanceOptimizationDetails';
import { CodeQualityDetails } from './details/CodeQualityDetails';

interface IdeaDetailPanelProps {
  idea: Idea;
  onClose: () => void;
  onConvert: (idea: Idea) => void;
  onGoToTask?: (taskId: string) => void;
  onDismiss: (idea: Idea) => void;
  onRestore?: (idea: Idea) => void;
  isConverting?: boolean;
  isUpdating?: boolean;
  actionError?: string | null;
}

export function IdeaDetailPanel({ idea, onClose, onConvert, onGoToTask, onDismiss, onRestore, isConverting, isUpdating, actionError }: IdeaDetailPanelProps) {
  const { t } = useTranslation(['common', 'uiIdeaDetails', 'uiKnowledgeIdeas']);
  const isDismissed = idea.status === 'dismissed';
  const isConverted = idea.status === 'converted';
  const isArchived = idea.status === 'archived';
  const canConvert = !isDismissed && !isConverted && !isArchived && !idea.taskId;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Root open modal={false} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 w-96 bg-card border-l border-border shadow-lg flex flex-col z-50"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
          }}
        >
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border electron-no-drag">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={IDEATION_TYPE_COLORS[idea.type]}>
                <TypeIcon type={idea.type} />
                <span className="ml-1">{t(`uiKnowledgeIdeas:types.labels.${idea.type}`)}</span>
              </Badge>
              {idea.status !== 'draft' && (
                <Badge variant="outline" className={IDEATION_STATUS_COLORS[idea.status]}>
                  {t(`uiIdeaDetails:status.${idea.status}`)}
                </Badge>
              )}
            </div>
            <DialogPrimitive.Title asChild>
              <h2 className="font-semibold">{idea.title}</h2>
            </DialogPrimitive.Title>
          </div>
          <Button ref={closeButtonRef} variant="ghost" size="icon" onClick={onClose} aria-label={t('accessibility.closePanelAriaLabel')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <h3 className="text-sm font-medium mb-2">{t('common:ideation.description')}</h3>
          <p className="text-sm text-muted-foreground">{idea.description}</p>
        </div>

        {/* Rationale */}
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            {t('common:ideation.rationale')}
          </h3>
          <p className="text-sm text-muted-foreground">{idea.rationale}</p>
        </div>

        {/* Type-specific content */}
        {isCodeImprovementIdea(idea) && <CodeImprovementDetails idea={idea} />}
        {isUIUXIdea(idea) && <UIUXDetails idea={idea} />}
        {isDocumentationGapIdea(idea) && <DocumentationGapDetails idea={idea} />}
        {isSecurityHardeningIdea(idea) && <SecurityHardeningDetails idea={idea} />}
        {isPerformanceOptimizationIdea(idea) && <PerformanceOptimizationDetails idea={idea} />}
        {isCodeQualityIdea(idea) && <CodeQualityDetails idea={idea} />}
      </div>

      {/* Actions */}
      {actionError && <p role="alert" className="mx-4 mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}
      {canConvert && (
        <div className="shrink-0 p-4 border-t border-border space-y-2">
          <Button className="w-full" onClick={() => onConvert(idea)} disabled={isConverting || isUpdating}>
            {isConverting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isConverting ? t('common:ideation.converting') : t('common:ideation.convertToTask')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onDismiss(idea)}
            disabled={isConverting || isUpdating}
          >
            <X className="h-4 w-4 mr-2" />
            {t('common:ideation.dismissIdea')}
          </Button>
        </div>
      )}
      {(isDismissed || isArchived) && onRestore && (
        <div className="shrink-0 p-4 border-t border-border">
          <Button variant="outline" className="w-full" onClick={() => onRestore(idea)} disabled={isUpdating || isConverting}>
            {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            {t('uiIdeaDetails:actions.restore')}
          </Button>
        </div>
      )}
      {idea.taskId && onGoToTask && (
        <div className="shrink-0 p-4 border-t border-border">
          <Button className="w-full" onClick={() => { if (idea.taskId) onGoToTask(idea.taskId); }}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {t('common:ideation.goToTask')}
          </Button>
        </div>
      )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
