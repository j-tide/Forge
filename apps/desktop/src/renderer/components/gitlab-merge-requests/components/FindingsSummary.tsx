import { useTranslation } from 'react-i18next';
/**
 * FindingsSummary - Visual summary of finding counts by severity
 */

import { Badge } from '../../ui/badge';
import type { GitLabMRReviewFinding } from '../hooks/useGitLabMRs';

interface FindingsSummaryProps {
  findings: GitLabMRReviewFinding[];
  selectedCount: number;
}

export function FindingsSummary({ findings, selectedCount }: FindingsSummaryProps) {
  const { t } = useTranslation('uiIntegrations');
  // Count findings by severity
  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    total: findings.length,
  };

  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 flex-wrap">
        {counts.critical > 0 && (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
            {counts.critical} {t('uiIntegrations:gitlab.severity.critical')}
          </Badge>
        )}
        {counts.high > 0 && (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
            {counts.high} {t('uiIntegrations:gitlab.severity.high')}
          </Badge>
        )}
        {counts.medium > 0 && (
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
            {counts.medium} {t('uiIntegrations:gitlab.severity.medium')}
          </Badge>
        )}
        {counts.low > 0 && (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
            {counts.low} {t('uiIntegrations:gitlab.severity.low')}
          </Badge>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {t('uiIntegrations:gitlab.selected', { selected: selectedCount, total: counts.total })}
      </span>
    </div>
  );
}
