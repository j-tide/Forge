import { useTranslation } from 'react-i18next';
/**
 * Individual issue card component
 */

import { useState } from 'react';
import {
  CheckSquare,
  Square,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { PRIORITY_COLORS, STATE_TYPE_COLORS } from '../types';
import type { LinearIssue } from '../types';

interface IssueCardProps {
  issue: LinearIssue;
  isSelected: boolean;
  onToggle: (issueId: string) => void;
}

export function IssueCard({ issue, isSelected, onToggle }: IssueCardProps) {
  const { t } = useTranslation('uiIntegrations');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`
        rounded-lg border border-border p-3 cursor-pointer transition-colors
        ${isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'}
      `}
      onClick={() => onToggle(issue.id)}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="mt-0.5">
          {isSelected ? (
            <CheckSquare className="h-5 w-5 text-primary" />
          ) : (
            <Square className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Issue Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">
              {issue.identifier}
            </span>
            <Badge
              variant="secondary"
              className={`text-xs ${STATE_TYPE_COLORS[issue.state.type] || ''}`}
            >
              {issue.state.name}
            </Badge>
            <Badge
              variant="secondary"
              className={`text-xs ${PRIORITY_COLORS[issue.priority] || ''}`}
            >
              {issue.priority >= 0 && issue.priority <= 4
                ? t(`uiIntegrations:linear.priority${issue.priority}`)
                : issue.priorityLabel}
            </Badge>
            {issue.labels.slice(0, 2).map(label => (
              <Badge
                key={label.id}
                variant="outline"
                className="text-xs"
                style={{
                  borderColor: label.color,
                  color: label.color
                }}
              >
                {label.name}
              </Badge>
            ))}
            {issue.labels.length > 2 && (
              <span className="text-xs text-muted-foreground">
                {t('uiIntegrations:linear.moreLabels', { count: issue.labels.length - 2 })}
              </span>
            )}
          </div>

          <h4 className="text-sm font-medium text-foreground mt-1 line-clamp-2">
            {issue.title}
          </h4>

          {/* Expandable description */}
          {issue.description && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  {t('uiIntegrations:linear.hideDescription')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  {t('uiIntegrations:linear.showDescription')}
                </>
              )}
            </button>
          )}

          {isExpanded && issue.description && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2 max-h-32 overflow-auto">
              {issue.description}
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {issue.assignee && (
              <span>{t('uiIntegrations:linear.assignedTo', { name: issue.assignee.name })}</span>
            )}
            {issue.project && (
              <span>{t('uiIntegrations:linear.projectName', { name: issue.project.name })}</span>
            )}
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              {t('uiIntegrations:linear.viewInLinear')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
