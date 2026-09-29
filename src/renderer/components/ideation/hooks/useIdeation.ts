import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../hooks/use-toast';
import {
  useIdeationStore,
  loadIdeation,
  generateIdeation,
  refreshIdeation,
  stopIdeation,
  appendIdeation,
  dismissAllIdeasForProject,
  deleteMultipleIdeasForProject,
  getIdeasByType,
  getActiveIdeas,
  getArchivedIdeas,
  getIdeationSummary,
  setupIdeationListeners
} from '../../../stores/ideation-store';
import { loadTasks } from '../../../stores/task-store';
import { useIdeationAuth } from './useIdeationAuth';
import type { Idea, IdeationStatus, IdeationType } from '../../../../shared/types';
import { ALL_IDEATION_TYPES } from '../constants';

interface UseIdeationOptions {
  onGoToTask?: (taskId: string) => void;
  /** External showArchived state from context - when provided, hook uses this instead of internal state */
  showArchived?: boolean;
}

export function useIdeation(projectId: string, options: UseIdeationOptions = {}) {
  const { onGoToTask, showArchived: externalShowArchived } = options;
  const { t } = useTranslation('uiKnowledgeIdeas');
  const session = useIdeationStore((state) => state.session);
  const generationStatus = useIdeationStore((state) => state.generationStatus);
  const isGenerating = useIdeationStore((state) => state.isGenerating);
  const config = useIdeationStore((state) => state.config);
  const setConfig = useIdeationStore((state) => state.setConfig);
  const logs = useIdeationStore((state) => state.logs);
  const typeStates = useIdeationStore((state) => state.typeStates);
  const selectedIds = useIdeationStore((state) => state.selectedIds);
  const toggleSelectIdea = useIdeationStore((state) => state.toggleSelectIdea);
  const selectAllIdeas = useIdeationStore((state) => state.selectAllIdeas);
  const clearSelection = useIdeationStore((state) => state.clearSelection);

  const [selectedIdeaKey, setSelectedIdeaKey] = useState<{ projectId: string; id: string } | null>(null);
  const selectedIdea = selectedIdeaKey?.projectId === projectId && session?.projectId === projectId
    ? session.ideas.find((idea) => idea.id === selectedIdeaKey.id) ?? null
    : null;
  const setSelectedIdea = useCallback((idea: Idea | null) => {
    setSelectedIdeaKey(idea ? { projectId, id: idea.id } : null);
  }, [projectId]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAddMoreDialog, setShowAddMoreDialog] = useState(false);
  const [typesToAdd, setTypesToAdd] = useState<IdeationType[]>([]);
  const [convertingIdeas, setConvertingIdeas] = useState<Set<string>>(new Set());
  // Ref for synchronous tracking - prevents race condition from stale React state closure
  const convertingIdeaRef = useRef<Set<string>>(new Set());
  const mutatingIdeaRef = useRef<Set<string>>(new Set());
  const [pendingMutations, setPendingMutations] = useState<Set<string>>(new Set());
  const [ideaActionFailure, setIdeaActionFailure] = useState<{ projectId: string; ideaId: string; message: string } | null>(null);
  const projectRef = useRef(projectId);
  projectRef.current = projectId;

  const { hasToken, isLoading: isCheckingToken } = useIdeationAuth();

  // Set up IPC listeners and load ideation on mount
  useEffect(() => {
    const cleanup = setupIdeationListeners();
    loadIdeation(projectId);
    return cleanup;
  }, [projectId]);

  const handleGenerate = async () => {
    if (hasToken === false) {
      toast({
        variant: 'destructive',
        title: t('providerErrorTitle'),
        description: t('providerErrorDescription'),
      });
      return;
    }
    generateIdeation(projectId);
  };

  const handleRefresh = async () => {
    if (hasToken === false) {
      toast({
        variant: 'destructive',
        title: t('providerErrorTitle'),
        description: t('providerErrorDescription'),
      });
      return;
    }
    refreshIdeation(projectId);
  };

  const handleStop = async () => {
    await stopIdeation(projectId);
  };

  const handleDismissAll = async () => {
    await dismissAllIdeasForProject(projectId);
  };

  const getAvailableTypesToAdd = (): IdeationType[] => {
    if (!session) return ALL_IDEATION_TYPES;
    // Only count types with active ideas (not dismissed or archived)
    // This allows users to regenerate types where all ideas were dismissed
    const existingTypes = new Set(
      session.ideas
        .filter((idea) => idea.status !== 'dismissed' && idea.status !== 'archived')
        .map((idea) => idea.type)
    );
    return ALL_IDEATION_TYPES.filter((type) => !existingTypes.has(type));
  };

  const handleAddMoreIdeas = () => {
    if (typesToAdd.length === 0) return;

    if (hasToken === false) {
      toast({
        variant: 'destructive',
        title: t('providerErrorTitle'),
        description: t('providerErrorDescription'),
      });
      return;
    }

    appendIdeation(projectId, typesToAdd);
    setTypesToAdd([]);
    setShowAddMoreDialog(false);
  };

  const toggleTypeToAdd = (type: IdeationType) => {
    setTypesToAdd((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleConvertToTask = async (idea: Idea) => {
    // Guard: use ref for synchronous check to prevent race condition from stale state closure
    // React state is captured at render time, so rapid clicks would both see empty set
    if (idea.taskId || idea.status === 'archived' || idea.status === 'dismissed' || idea.status === 'converted' || convertingIdeaRef.current.has(idea.id) || mutatingIdeaRef.current.has(`${projectId}:${idea.id}`)) {
      return;
    }

    // Mark as converting - update ref synchronously first, then state for UI
    convertingIdeaRef.current.add(idea.id);
    setConvertingIdeas(new Set(convertingIdeaRef.current));

    try {
      const result = await window.electronAPI.convertIdeaToTask(projectId, idea.id);
      if (projectRef.current !== projectId || useIdeationStore.getState().session?.projectId !== projectId) return;
      if (result.success && result.data) {
        // Store the taskId on the idea so we can navigate to it later
        useIdeationStore.getState().setIdeaTaskId(idea.id, result.data.id);
        loadTasks(projectId);
      } else {
        // Show error toast when conversion fails (e.g., already converted, idea not found)
        toast({
          variant: 'destructive',
          title: t('common:ideation.conversionFailed'),
          description: result.error || t('common:ideation.conversionFailedDescription')
        });
      }
    } catch (error) {
      // Handle unexpected errors (network issues, etc.)
      console.error('Failed to convert idea to task:', error);
      toast({
        variant: 'destructive',
        title: t('common:ideation.conversionError'),
        description: t('common:ideation.conversionErrorDescription')
      });
    } finally {
      // Always clear converting state - update ref first, then state
      convertingIdeaRef.current.delete(idea.id);
      setConvertingIdeas(new Set(convertingIdeaRef.current));
    }
  };

  const handleGoToTask = useCallback(
    (taskId: string) => {
      if (onGoToTask) {
        onGoToTask(taskId);
      }
    },
    [onGoToTask]
  );

  const mutateIdea = async (idea: Idea, action: 'dismiss' | 'restore'): Promise<boolean> => {
    const requestKey = `${projectId}:${idea.id}`;
    if (mutatingIdeaRef.current.has(requestKey) || convertingIdeaRef.current.has(idea.id)) return false;
    if (useIdeationStore.getState().session?.projectId !== projectId) return false;
    const status: IdeationStatus = action === 'dismiss' ? 'dismissed' : idea.taskId ? 'converted' : 'draft';
    mutatingIdeaRef.current.add(requestKey);
    setPendingMutations(new Set(mutatingIdeaRef.current));
    setIdeaActionFailure(null);
    try {
      const result = action === 'dismiss'
        ? await window.electronAPI.dismissIdea(projectId, idea.id)
        : await window.electronAPI.updateIdeaStatus(projectId, idea.id, status);
      if (projectRef.current !== projectId || useIdeationStore.getState().session?.projectId !== projectId) return false;
      if (!result.success) throw new Error(result.error || t(`uiIdeaDetails:actions.${action}Failed`));
      useIdeationStore.getState().updateIdeaStatus(idea.id, status);
      return true;
    } catch (error) {
      if (projectRef.current === projectId) {
        const message = error instanceof Error ? error.message : t(`uiIdeaDetails:actions.${action}Failed`);
        setIdeaActionFailure({ projectId, ideaId: idea.id, message });
        toast({ variant: 'destructive', title: t(`uiIdeaDetails:actions.${action}Failed`), description: message });
      }
      return false;
    } finally {
      mutatingIdeaRef.current.delete(requestKey);
      setPendingMutations(new Set(mutatingIdeaRef.current));
    }
  };

  const handleDismiss = (idea: Idea) => mutateIdea(idea, 'dismiss');
  const handleRestore = (idea: Idea) => mutateIdea(idea, 'restore');

  const toggleIdeationType = (type: IdeationType) => {
    const currentTypes = config.enabledTypes;
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];

    if (newTypes.length > 0) {
      setConfig({ enabledTypes: newTypes });
    }
  };

  const handleDeleteSelected = useCallback(async () => {
    // Get fresh selectedIds from store to avoid stale closure
    const currentSelectedIds = useIdeationStore.getState().selectedIds;
    if (currentSelectedIds.size === 0) return;
    await deleteMultipleIdeasForProject(projectId, Array.from(currentSelectedIds));
  }, [projectId]);

  const handleSelectAll = useCallback((ideas: Idea[]) => {
    selectAllIdeas(ideas.map(idea => idea.id));
  }, [selectAllIdeas]);

  const summary = getIdeationSummary(session);
  const archivedIdeas = getArchivedIdeas(session);

  // Compute effective showArchived: use external value (from context) if provided, else internal state
  // This eliminates render lag by using the context value directly instead of syncing via useEffect
  const effectiveShowArchived = externalShowArchived !== undefined ? externalShowArchived : showArchived;

  // Filter ideas based on visibility settings
  const getFilteredIdeas = useCallback(() => {
    if (!session) return [];
    let ideas = session.ideas;

    // Start with base filtering (exclude dismissed and archived by default)
    if (!showDismissed && !effectiveShowArchived) {
      ideas = getActiveIdeas(session);
    } else if (showDismissed && !effectiveShowArchived) {
      // Show dismissed but not archived
      ideas = ideas.filter(idea => idea.status !== 'archived');
    } else if (!showDismissed && effectiveShowArchived) {
      // Show archived but not dismissed
      ideas = ideas.filter(idea => idea.status !== 'dismissed');
    }
    // If both are true, show all

    return ideas;
  }, [session, showDismissed, effectiveShowArchived]);

  const activeIdeas = getFilteredIdeas();

  return {
    // State
    session,
    generationStatus,
    isGenerating,
    config,
    logs,
    typeStates,
    selectedIdea,
    activeTab,
    showConfigDialog,
    showDismissed,
    // Return the effective showArchived (external or internal) for consistent state reading
    showArchived: effectiveShowArchived,
    showAddMoreDialog,
    typesToAdd,
    hasToken,
    isCheckingToken,
    summary,
    activeIdeas,
    archivedIdeas,
    selectedIds,
    convertingIdeas,
    updatingIdeas: new Set(Array.from(pendingMutations).filter((key) => key.startsWith(`${projectId}:`)).map((key) => key.slice(projectId.length + 1))),
    ideaActionError: ideaActionFailure?.projectId === projectId && ideaActionFailure.ideaId === selectedIdea?.id ? ideaActionFailure.message : null,

    // Actions
    setSelectedIdea,
    setActiveTab,
    setShowConfigDialog,
    setShowDismissed,
    setShowArchived,
    setShowAddMoreDialog,
    setTypesToAdd,
    setConfig,
    handleGenerate,
    handleRefresh,
    handleStop,
    handleDismissAll,
    handleDeleteSelected,
    handleSelectAll,
    getAvailableTypesToAdd,
    handleAddMoreIdeas,
    toggleTypeToAdd,
    handleConvertToTask,
    handleGoToTask,
    handleDismiss,
    handleRestore,
    toggleIdeationType,
    toggleSelectIdea,
    clearSelection,

    // Helper functions
    getIdeasByType: (type: IdeationType) => getIdeasByType(session, type)
  };
}
