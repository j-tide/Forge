import { useEffect } from 'react';
import {
  loadProjectContext,
  refreshProjectIndex,
  searchMemories,
  useContextStore
} from '../../stores/context-store';

export function useProjectContext(projectId: string) {
  useEffect(() => {
    if (projectId) {
      loadProjectContext(projectId);
    }
    return () => {
      if (useContextStore.getState().projectId === projectId) {
        useContextStore.getState().clearAll();
      }
    };
  }, [projectId]);
}

export function useRefreshIndex(projectId: string) {
  return async () => {
    await refreshProjectIndex(projectId);
  };
}

export function useMemorySearch(projectId: string) {
  return async (query: string) => {
    await searchMemories(projectId, query);
  };
}
