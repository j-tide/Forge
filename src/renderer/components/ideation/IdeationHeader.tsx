import { useTranslation } from 'react-i18next';
import { Archive, Lightbulb, Eye, EyeOff, Settings2, Plus, Trash2, RefreshCw, CheckSquare, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { IDEATION_TYPE_COLORS } from '../../../shared/constants';
import type { IdeationType } from '../../../shared/types';
import { TypeIcon } from './TypeIcon';

interface IdeationHeaderProps {
  totalIdeas: number;
  ideaCountByType: Record<string, number>;
  showDismissed: boolean;
  showArchived?: boolean;
  onToggleShowArchived?: () => void;
  selectedCount: number;
  onToggleShowDismissed: () => void;
  onOpenConfig: () => void;
  onOpenAddMore: () => void;
  onDismissAll: () => void;
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRefresh: () => void;
  hasActiveIdeas: boolean;
  canAddMore: boolean;
}

export function IdeationHeader({
  totalIdeas,
  ideaCountByType,
  showDismissed,
  showArchived,
  onToggleShowArchived,
  selectedCount,
  onToggleShowDismissed,
  onOpenConfig,
  onOpenAddMore,
  onDismissAll,
  onDeleteSelected,
  onSelectAll,
  onClearSelection,
  onRefresh,
  hasActiveIdeas,
  canAddMore
}: IdeationHeaderProps) {
  const { t } = useTranslation('common');
  const { t: ti } = useTranslation('uiKnowledgeIdeas');
  const { t: td } = useTranslation('uiIdeaDetails');
  const hasSelection = selectedCount > 0;
  return (
    <div className="shrink-0 border-b border-border p-4 bg-card/50">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">{ti('title')}</h2>
            <Badge variant="outline">{ti('count', { count: totalIdeas })}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {ti('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selection controls */}
          {hasSelection ? (
            <>
              <Badge variant="secondary" className="mr-1">
                {ti('selected', { count: selectedCount })}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={onDeleteSelected}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {ti('delete')}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClearSelection}
                    aria-label={t('accessibility.clearSelectionAriaLabel')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('accessibility.clearSelectionAriaLabel')}</TooltipContent>
              </Tooltip>
              <div className="w-px h-6 bg-border mx-1" />
            </>
          ) : (
            hasActiveIdeas && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onSelectAll}
                    aria-label={t('accessibility.selectAllAriaLabel')}
                  >
                    <CheckSquare className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('accessibility.selectAllAriaLabel')}</TooltipContent>
              </Tooltip>
            )
          )}

          {/* View toggles */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showDismissed ? 'secondary' : 'outline'}
                size="icon"
                onClick={onToggleShowDismissed}
                aria-pressed={showDismissed}
                aria-label={showDismissed ? t('accessibility.hideDismissedAriaLabel') : t('accessibility.showDismissedAriaLabel')}
              >
                {showDismissed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showDismissed ? t('accessibility.hideDismissedAriaLabel') : t('accessibility.showDismissedAriaLabel')}
            </TooltipContent>
          </Tooltip>
          {onToggleShowArchived && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={showArchived ? 'secondary' : 'outline'} size="icon" onClick={onToggleShowArchived} aria-pressed={showArchived} aria-label={td(showArchived ? 'actions.hideArchived' : 'actions.showArchived')}>
                  <Archive className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{td(showArchived ? 'actions.hideArchived' : 'actions.showArchived')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onOpenConfig}
                aria-label={t('accessibility.configureAriaLabel')}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('accessibility.configureAriaLabel')}</TooltipContent>
          </Tooltip>
          {canAddMore && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={onOpenAddMore}
                  aria-label={t('accessibility.addMoreAriaLabel')}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {ti('addMore')}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('accessibility.addMoreAriaLabel')}</TooltipContent>
            </Tooltip>
          )}
          {hasActiveIdeas && !hasSelection && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={onDismissAll}
                  aria-label={t('accessibility.dismissAllAriaLabel')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('accessibility.dismissAllAriaLabel')}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onRefresh} aria-label={t('accessibility.regenerateIdeasAriaLabel')}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('accessibility.regenerateIdeasAriaLabel')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 flex items-center gap-4">
        {Object.entries(ideaCountByType).map(([type, count]) => (
          <Badge
            key={type}
            variant="outline"
            className={IDEATION_TYPE_COLORS[type]}
          >
            <TypeIcon type={type as IdeationType} />
            <span className="ml-1">{count}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
