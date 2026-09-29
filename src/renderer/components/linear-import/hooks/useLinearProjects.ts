import { useTranslation } from 'react-i18next';
/**
 * Hook for loading Linear projects for a selected team
 */

import { useState, useEffect } from 'react';
import type { LinearProject } from '../types';

export function useLinearProjects(
  projectId: string,
  selectedTeamId: string
) {
  const { t } = useTranslation('uiIntegrations');
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      if (!selectedTeamId) {
        setProjects([]);
        return;
      }

      setIsLoadingProjects(true);
      setError(null);

      try {
        const result = await window.electronAPI.getLinearProjects(
          projectId,
          selectedTeamId
        );
        if (result.success && result.data) {
          setProjects(result.data);
        } else {
          setError(result.error || t('uiIntegrations:linear.loadProjectsFailed'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('uiIntegrations:linear.unknownError'));
      } finally {
        setIsLoadingProjects(false);
      }
    };

    loadProjects();
  }, [projectId, selectedTeamId, t]);

  return { projects, isLoadingProjects, error, setError };
}
