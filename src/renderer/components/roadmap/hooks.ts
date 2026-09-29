import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoadmapStore, loadRoadmap, generateRoadmap, refreshRoadmap, stopRoadmap } from '../../stores/roadmap-store';
import { useTaskStore } from '../../stores/task-store';
import type { Roadmap, RoadmapFeature } from '../../../shared/types';

// One user mutation per project. This is UI request ownership, not a replacement
// for the backend's persistence or run lifecycle checks.
const pendingProjects = new Set<string>();

function currentRoadmap(projectId: string): Roadmap | null {
  const state = useRoadmapStore.getState();
  return state.currentProjectId === projectId && state.roadmap?.projectId === projectId
    ? state.roadmap
    : null;
}

/**
 * Hook to manage roadmap data and loading
 *
 * When the projectId changes, this hook:
 * 1. Loads the new project's roadmap data
 * 2. Queries the backend to check if generation is running for this project
 * 3. Restores the generation status UI state accordingly
 *
 * NOTE: Generation continues in the background when switching projects.
 * The loadRoadmap function queries the backend to restore the correct UI state.
 */
export function useRoadmapData(projectId: string) {
  const roadmap = useRoadmapStore((state) => state.roadmap);
  const competitorAnalysis = useRoadmapStore((state) => state.competitorAnalysis);
  const generationStatus = useRoadmapStore((state) => state.generationStatus);

  useEffect(() => {
    // Load roadmap data and query generation status for this project
    // The loadRoadmap function handles checking if generation is running
    // and restores the UI state accordingly
    loadRoadmap(projectId);
  }, [projectId]);

  return {
    roadmap: roadmap?.projectId === projectId ? roadmap : null,
    competitorAnalysis,
    generationStatus,
  };
}

/**
 * Hook to manage feature actions (convert, link, etc.)
 */
export function useFeatureActions() {
  const { t } = useTranslation('uiKnowledge');
  const activeProjectId = useRoadmapStore((state) => state.currentProjectId);
  const [failure, setFailure] = useState<{ projectId: string; message: string } | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const addTask = useTaskStore((state) => state.addTask);

  const convertFeatureToSpec = async (
    projectId: string,
    feature: RoadmapFeature,
    selectedFeature: RoadmapFeature | null,
    setSelectedFeature: (feature: RoadmapFeature | null) => void
  ): Promise<boolean> => {
    const before = currentRoadmap(projectId);
    const sourceFeature = before?.features.find((item) => item.id === feature.id);
    if (!before || !sourceFeature) {
      setFailure({ projectId, message: t('projectChanged') });
      return false;
    }
    if (pendingProjects.has(projectId)) {
      setFailure({ projectId, message: t('mutationPending') });
      return false;
    }
    pendingProjects.add(projectId);
    setPendingProjectId(projectId);
    setFailure(null);
    try {
      const result = await window.electronAPI.convertFeatureToSpec(projectId, feature.id);
      // A background result belongs to its original project. Never add it to a
      // newly selected project's task list or overwrite newer roadmap data.
      if (currentRoadmap(projectId) !== before) return false;
      if (!result.success || !result.data) {
        setFailure({ projectId, message: result.error || t('convertFailed') });
        return false;
      }
      if (result.data.projectId !== projectId) {
        setFailure({ projectId, message: t('convertInvalidProject') });
        return false;
      }
      // Add the created task to the task store so it appears in the kanban immediately
      addTask(result.data);

      // Conversion persists a planned feature and a backlog task. Linking a
      // task does not mean its execution has started.
      const linkedFeature: RoadmapFeature = {
        ...sourceFeature,
        linkedSpecId: result.data.specId,
        status: 'planned',
      };
      useRoadmapStore.getState().setRoadmap({
        ...before,
        features: before.features.map((item) => item.id === feature.id ? linkedFeature : item),
        updatedAt: new Date(),
      });
      if (selectedFeature?.id === feature.id) {
        setSelectedFeature(linkedFeature);
      }
      return true;
    } catch (error) {
      if (currentRoadmap(projectId) === before) {
        setFailure({ projectId, message: error instanceof Error ? error.message : t('convertFailed') });
      }
      return false;
    } finally {
      pendingProjects.delete(projectId);
      setPendingProjectId(null);
    }
  };

  return {
    convertFeatureToSpec,
    error: failure?.projectId === activeProjectId ? failure.message : null,
    isConverting: pendingProjectId === activeProjectId && pendingProjectId !== null,
  };
}

/**
 * Hook to save roadmap changes to disk
 *
 * A candidate is committed to the visible store only after persistence succeeds.
 * The previous roadmap remains visible on failure or while a request is pending.
 */
export function useRoadmapSave(projectId: string) {
  const { t } = useTranslation('uiKnowledge');
  const projectRef = useRef(projectId);
  projectRef.current = projectId;
  const [failure, setFailure] = useState<{ projectId: string; message: string } | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const saveRoadmap = async (candidate?: Roadmap): Promise<boolean> => {
    const before = currentRoadmap(projectId);
    const roadmap = candidate ?? before;
    if (!before || !roadmap || roadmap.projectId !== projectId || roadmap.id !== before.id) {
      setFailure({ projectId, message: t('projectChanged') });
      return false;
    }
    if (pendingProjects.has(projectId)) {
      setFailure({ projectId, message: t('mutationPending') });
      return false;
    }
    pendingProjects.add(projectId);
    setPendingProjectId(projectId);
    setFailure(null);
    try {
      const result = await window.electronAPI.saveRoadmap(projectId, roadmap);
      if (projectRef.current !== projectId || currentRoadmap(projectId) !== before) return false;
      if (!result.success) {
        setFailure({ projectId, message: result.error || t('saveFailed') });
        return false;
      }
      useRoadmapStore.getState().setRoadmap(roadmap);
      return true;
    } catch (error) {
      if (projectRef.current === projectId && currentRoadmap(projectId) === before) {
        setFailure({ projectId, message: error instanceof Error ? error.message : t('saveFailed') });
      }
      return false;
    } finally {
      pendingProjects.delete(projectId);
      setPendingProjectId(null);
    }
  };

  return {
    saveRoadmap,
    error: failure?.projectId === projectId ? failure.message : null,
    isSaving: pendingProjectId === projectId,
  };
}

/**
 * Hook to delete features from roadmap
 */
export function useFeatureDelete(projectId: string) {
  const { saveRoadmap, error, isSaving } = useRoadmapSave(projectId);

  const handleDeleteFeature = async (featureId: string): Promise<boolean> => {
    const roadmap = currentRoadmap(projectId);
    if (!roadmap) return saveRoadmap();
    if (!roadmap.features.some((feature) => feature.id === featureId)) return true;
    return saveRoadmap({
      ...roadmap,
      features: roadmap.features.filter((feature) => feature.id !== featureId).map((feature) => ({
        ...feature, dependencies: feature.dependencies.filter((id) => id !== featureId),
      })),
      updatedAt: new Date(),
    });
  };

  return { deleteFeature: handleDeleteFeature, error, isDeleting: isSaving };
}


/**
 * Hook to manage roadmap generation actions
 *
 * Handles two scenarios:
 * 1. No existing competitor analysis: Show simple enable/skip dialog
 * 2. Existing competitor analysis: Show options to use existing, run new, or skip
 */
export function useRoadmapGeneration(projectId: string) {
  const competitorAnalysis = useRoadmapStore((state) => state.competitorAnalysis);
  const [pendingAction, setPendingAction] = useState<'generate' | 'refresh' | null>(null);
  const [showCompetitorDialog, setShowCompetitorDialog] = useState(false);
  const [showExistingAnalysisDialog, setShowExistingAnalysisDialog] = useState(false);

  // Check if we have existing competitor analysis
  const hasExistingAnalysis = !!competitorAnalysis;

  const handleGenerate = () => {
    setPendingAction('generate');
    if (hasExistingAnalysis) {
      setShowExistingAnalysisDialog(true);
    } else {
      setShowCompetitorDialog(true);
    }
  };

  const handleRefresh = () => {
    setPendingAction('refresh');
    if (hasExistingAnalysis) {
      setShowExistingAnalysisDialog(true);
    } else {
      setShowCompetitorDialog(true);
    }
  };

  // Handler for "Yes, Enable Analysis" (new competitor analysis)
  const handleCompetitorDialogAccept = () => {
    if (pendingAction === 'generate') {
      generateRoadmap(projectId, true); // Enable competitor analysis
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId, true); // Enable competitor analysis
    }
    setPendingAction(null);
  };

  // Handler for "No, Skip Analysis"
  const handleCompetitorDialogDecline = () => {
    if (pendingAction === 'generate') {
      generateRoadmap(projectId, false); // Disable competitor analysis
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId, false); // Disable competitor analysis
    }
    setPendingAction(null);
  };

  // Handler for "Use existing analysis" - reuses saved competitor data
  const handleUseExistingAnalysis = () => {
    // Enable competitor analysis but don't force refresh - backend will use existing if available
    if (pendingAction === 'generate') {
      generateRoadmap(projectId, true, false); // enableCompetitorAnalysis=true, refreshCompetitorAnalysis=false
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId, true, false); // enableCompetitorAnalysis=true, refreshCompetitorAnalysis=false
    }
    setPendingAction(null);
  };

  // Handler for "Run new analysis" - performs fresh web searches
  const handleRunNewAnalysis = () => {
    // Enable competitor analysis AND force refresh to run fresh web searches
    if (pendingAction === 'generate') {
      generateRoadmap(projectId, true, true); // enableCompetitorAnalysis=true, refreshCompetitorAnalysis=true
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId, true, true); // enableCompetitorAnalysis=true, refreshCompetitorAnalysis=true
    }
    setPendingAction(null);
  };

  // Handler for "Skip analysis"
  const handleSkipAnalysis = () => {
    if (pendingAction === 'generate') {
      generateRoadmap(projectId, false);
    } else if (pendingAction === 'refresh') {
      refreshRoadmap(projectId, false);
    }
    setPendingAction(null);
  };

  const handleStop = async () => {
    await stopRoadmap(projectId);
  };

  return {
    pendingAction,
    hasExistingAnalysis,
    competitorAnalysisDate: competitorAnalysis?.createdAt,
    // New dialog for existing analysis
    showExistingAnalysisDialog,
    setShowExistingAnalysisDialog,
    handleUseExistingAnalysis,
    handleRunNewAnalysis,
    handleSkipAnalysis,
    // Original dialog for no existing analysis
    showCompetitorDialog,
    setShowCompetitorDialog,
    handleGenerate,
    handleRefresh,
    handleCompetitorDialogAccept,
    handleCompetitorDialogDecline,
    handleStop,
  };
}
