import { useTranslation } from 'react-i18next';
/**
 * Hook for loading Linear teams
 */

import { useState, useEffect } from 'react';
import type { LinearTeam } from '../types';

export function useLinearTeams(projectId: string, open: boolean) {
  const { t } = useTranslation('uiIntegrations');
  const [teams, setTeams] = useState<LinearTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTeams = async () => {
      if (!open) return;

      setIsLoadingTeams(true);
      setError(null);

      try {
        const result = await window.electronAPI.getLinearTeams(projectId);
        if (result.success && result.data) {
          setTeams(result.data);
        } else {
          setError(result.error || t('uiIntegrations:linear.loadTeamsFailed'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('uiIntegrations:linear.unknownError'));
      } finally {
        setIsLoadingTeams(false);
      }
    };

    loadTeams();
  }, [open, projectId, t]);

  return { teams, isLoadingTeams, error, setError };
}
