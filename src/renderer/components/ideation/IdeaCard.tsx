import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, Play, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Checkbox } from '../ui/checkbox';
import {
  IDEATION_TYPE_COLORS,
  IDEATION_STATUS_COLORS,
  IDEATION_EFFORT_COLORS,
  IDEATION_IMPACT_COLORS,
  SECURITY_SEVERITY_COLORS,
  CODE_QUALITY_SEVERITY_COLORS
} from '../../../shared/constants';
import type {
  Idea,
  CodeImprovementIdea,
  UIUXImprovementIdea,
  DocumentationGapIdea,
  SecurityHardeningIdea,
  PerformanceOptimizationIdea,
  CodeQualityIdea
} from '../../../shared/types';
import { TypeIcon } from './TypeIcon';
import {
  isCodeImprovementIdea,
  isUIUXIdea,
  isDocumentationGapIdea,
  isSecurityHardeningIdea,
  isPerformanceOptimizationIdea,
  isCodeQualityIdea
} from './type-guards';

interface IdeaCardProps {
  idea: Idea;
  isSelected: boolean;
  onClick: () => void;
  onConvert: (idea: Idea) => void;
  onGoToTask?: (taskId: string) => void;
  onDismiss: (idea: Idea) => void;
  onRestore?: (idea: Idea) => void;
  onToggleSelect: (ideaId: string) => void;
  isUpdating?: boolean;
  isConverting?: boolean;
}

export function IdeaCard({ idea, isSelected, onClick, onConvert, onGoToTask, onDismiss, onRestore, onToggleSelect, isUpdating, isConverting }: IdeaCardProps) {
  const { t } = useTranslation(['common', 'uiIdeaDetails', 'uiKnowledgeIdeas']);
  const isDismissed = idea.status === 'dismissed';
  const isArchived = idea.status === 'archived';
  const isConverted = idea.status === 'converted';
  const isInactive = isDismissed || isArchived;

  return (
    <Card
      className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
        isInactive ? 'opacity-50' : ''
      } ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Selection checkbox */}
        <div className="pt-0.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(idea.id)}
            onClick={(event) => event.stopPropagation()}
            className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            aria-label={t('accessibility.selectIdeaAriaLabel', { title: idea.title })}
          />
        </div>

        <div className="flex-1 flex items-start justify-between">
          <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={IDEATION_TYPE_COLORS[idea.type]}>
              <TypeIcon type={idea.type} />
              <span className="ml-1">{t(`uiKnowledgeIdeas:types.labels.${idea.type}`)}</span>
            </Badge>
            {idea.status !== 'draft' && (
              <Badge variant="outline" className={IDEATION_STATUS_COLORS[idea.status]}>
                {t(`uiIdeaDetails:status.${idea.status}`)}
              </Badge>
            )}
            {isCodeImprovementIdea(idea) && typeof (idea as CodeImprovementIdea).estimatedEffort === 'string' && (
              <Badge variant="outline" className={IDEATION_EFFORT_COLORS[(idea as CodeImprovementIdea).estimatedEffort]}>
                {t(`uiIdeaDetails:effort.${(idea as CodeImprovementIdea).estimatedEffort}`)}
              </Badge>
            )}
            {isUIUXIdea(idea) && typeof (idea as UIUXImprovementIdea).category === 'string' && (
              <Badge variant="outline">
                {t(`uiIdeaDetails:uiuxCategories.${(idea as UIUXImprovementIdea).category}`)}
              </Badge>
            )}
            {isDocumentationGapIdea(idea) && typeof (idea as DocumentationGapIdea).category === 'string' && (
              <Badge variant="outline">
                {t(`uiIdeaDetails:documentationCategories.${(idea as DocumentationGapIdea).category}`)}
              </Badge>
            )}
            {isSecurityHardeningIdea(idea) && typeof (idea as SecurityHardeningIdea).severity === 'string' && (
              <Badge variant="outline" className={SECURITY_SEVERITY_COLORS[(idea as SecurityHardeningIdea).severity]}>
                {t(`uiIdeaDetails:severity.${(idea as SecurityHardeningIdea).severity}`)}
              </Badge>
            )}
            {isPerformanceOptimizationIdea(idea) && typeof (idea as PerformanceOptimizationIdea).impact === 'string' && (
              <Badge variant="outline" className={IDEATION_IMPACT_COLORS[(idea as PerformanceOptimizationIdea).impact]}>
                {t('uiIdeaDetails:impactBadge', { impact: t(`uiIdeaDetails:impact.${(idea as PerformanceOptimizationIdea).impact}`) })}
              </Badge>
            )}
            {isCodeQualityIdea(idea) && typeof (idea as CodeQualityIdea).severity === 'string' && (
              <Badge variant="outline" className={CODE_QUALITY_SEVERITY_COLORS[(idea as CodeQualityIdea).severity]}>
                {t(`uiIdeaDetails:severity.${(idea as CodeQualityIdea).severity}`)}
              </Badge>
            )}
          </div>
          <h3 className={`font-medium ${isInactive ? 'line-through' : ''}`}>
            <button type="button" className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={(event) => { event.stopPropagation(); onClick(); }}>
              {idea.title}
            </button>
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{idea.description}</p>
          </div>
          {/* Action buttons */}
          {!isInactive && !isConverted && !idea.taskId && (
            <div className="flex items-center gap-1 ml-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onConvert(idea);
                    }}
                    aria-label={t('accessibility.convertToTaskAriaLabel')}
                    disabled={isUpdating || isConverting}
                  >
                    {isConverting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('accessibility.convertToTaskAriaLabel')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(idea);
                    }}
                    aria-label={t('accessibility.dismissAriaLabel')}
                    disabled={isUpdating || isConverting}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('accessibility.dismissAriaLabel')}</TooltipContent>
              </Tooltip>
            </div>
          )}
          {isInactive && onRestore && (
            <Button variant="ghost" size="sm" className="h-8 w-8 ml-2 p-0" aria-label={t('uiIdeaDetails:actions.restore')} disabled={isUpdating || isConverting} onClick={(event) => { event.stopPropagation(); onRestore(idea); }}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            </Button>
          )}
          {/* Archived ideas show link to task */}
          {isArchived && idea.taskId && onGoToTask && (
            <div className="flex items-center gap-1 ml-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idea.taskId) onGoToTask(idea.taskId);
                    }}
                    aria-label={t('accessibility.goToTaskAriaLabel')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('accessibility.goToTaskAriaLabel')}</TooltipContent>
              </Tooltip>
            </div>
          )}
          {/* Legacy: converted status also shows link to task */}
          {isConverted && idea.taskId && onGoToTask && (
            <div className="flex items-center gap-1 ml-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idea.taskId) onGoToTask(idea.taskId);
                    }}
                    aria-label={t('accessibility.goToTaskAriaLabel')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('accessibility.goToTaskAriaLabel')}</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
