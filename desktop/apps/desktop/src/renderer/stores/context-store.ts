import i18n from '../../shared/i18n';
import { create } from 'zustand';
import type {
  ProjectIndex, MemorySystemStatus, MemorySystemState, RendererMemory,
  ContextSearchResult, IPCResult
} from '../../shared/types';

interface ContextState {
  projectId: string | null;
  projectIndex: ProjectIndex | null;
  indexLoading: boolean;
  indexError: string | null;
  memoryStatus: MemorySystemStatus | null;
  memoryState: MemorySystemState | null;
  memoryLoading: boolean;
  memoryError: string | null;
  recentMemories: RendererMemory[];
  memoriesLoading: boolean;
  searchResults: ContextSearchResult[];
  searchLoading: boolean;
  searchQuery: string;
  searchError: string | null;
  searchCompleted: boolean;
  mutationError: string | null;
  pendingMemoryIds: string[];
  setProjectIndex: (index: ProjectIndex | null) => void;
  setIndexLoading: (loading: boolean) => void;
  setIndexError: (error: string | null) => void;
  setMemoryStatus: (status: MemorySystemStatus | null) => void;
  setMemoryState: (state: MemorySystemState | null) => void;
  setMemoryLoading: (loading: boolean) => void;
  setMemoryError: (error: string | null) => void;
  setRecentMemories: (memories: RendererMemory[]) => void;
  setMemoriesLoading: (loading: boolean) => void;
  setSearchResults: (results: ContextSearchResult[]) => void;
  setSearchLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  clearAll: () => void;
}

const emptyContext = () => ({
  projectId: null as string | null,
  projectIndex: null, indexLoading: false, indexError: null,
  memoryStatus: null, memoryState: null, memoryLoading: false, memoryError: null,
  recentMemories: [], memoriesLoading: false,
  searchResults: [], searchLoading: false, searchQuery: '', searchError: null,
  searchCompleted: false, mutationError: null, pendingMemoryIds: []
});

// IPC is not abortable. A project generation and per-resource sequence ensure
// late replies (including their finally handlers) cannot repaint another project.
let generation = 0;
const requests = { index: 0, memory: 0, search: 0, mutation: 0 };
type Resource = keyof typeof requests;

export const useContextStore = create<ContextState>((set) => ({
  ...emptyContext(),
  setProjectIndex: (projectIndex) => set({ projectIndex }),
  setIndexLoading: (indexLoading) => set({ indexLoading }),
  setIndexError: (indexError) => set({ indexError }),
  setMemoryStatus: (memoryStatus) => set({ memoryStatus }),
  setMemoryState: (memoryState) => set({ memoryState }),
  setMemoryLoading: (memoryLoading) => set({ memoryLoading }),
  setMemoryError: (memoryError) => set({ memoryError }),
  setRecentMemories: (recentMemories) => set({ recentMemories }),
  setMemoriesLoading: (memoriesLoading) => set({ memoriesLoading }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSearchLoading: (searchLoading) => set({ searchLoading }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  clearAll: () => {
    generation++;
    set(emptyContext());
  }
}));

function activateProject(projectId: string): void {
  if (useContextStore.getState().projectId !== projectId) {
    generation++;
    useContextStore.setState({ ...emptyContext(), projectId });
  }
}

function beginRequest(projectId: string, resource: Resource) {
  activateProject(projectId);
  const scope = generation;
  const sequence = ++requests[resource];
  return () => generation === scope && useContextStore.getState().projectId === projectId &&
    requests[resource] === sequence;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function loadProjectContext(projectId: string): Promise<void> {
  const indexCurrent = beginRequest(projectId, 'index');
  const memoryCurrent = beginRequest(projectId, 'memory');
  useContextStore.setState({ indexLoading: true, memoryLoading: true, memoriesLoading: true, indexError: null, memoryError: null });
  const fail = (message: string) => {
    if (indexCurrent()) useContextStore.setState({ projectIndex: null, indexError: message });
    if (memoryCurrent()) useContextStore.setState({ memoryStatus: null, memoryState: null, recentMemories: [], memoryError: message });
  };
  try {
    const result = await window.electronAPI.getProjectContext(projectId);
    if (result.success && result.data) {
      if (indexCurrent()) useContextStore.setState({ projectIndex: result.data.projectIndex });
      if (memoryCurrent()) useContextStore.setState({
        memoryStatus: result.data.memoryStatus, memoryState: result.data.memoryState,
        recentMemories: result.data.recentMemories || [],
        memoryError: result.data.error || null
      });
    } else {
      fail(result.error || i18n.t('uiRuntime:stores.failedLoadContext'));
    }
  } catch (error) {
    fail(errorMessage(error, i18n.t('uiRuntime:stores.failedLoadContext')));
  } finally {
    if (indexCurrent()) useContextStore.setState({ indexLoading: false });
    if (memoryCurrent()) useContextStore.setState({ memoryLoading: false, memoriesLoading: false });
  }
}

export async function refreshProjectIndex(projectId: string): Promise<void> {
  const current = beginRequest(projectId, 'index');
  useContextStore.setState({ indexLoading: true, indexError: null });
  try {
    const result = await window.electronAPI.refreshProjectIndex(projectId);
    if (!current()) return;
    if (result.success && result.data) {
      useContextStore.setState({ projectIndex: result.data });
    } else {
      useContextStore.setState({ indexError: result.error || i18n.t('uiRuntime:stores.failedRefreshIndex') });
    }
  } catch (error) {
    if (current()) useContextStore.setState({ indexError: errorMessage(error, i18n.t('uiRuntime:stores.failedRefreshIndex')) });
  } finally {
    if (current()) useContextStore.setState({ indexLoading: false });
  }
}

export async function searchMemories(projectId: string, query: string): Promise<void> {
  const current = beginRequest(projectId, 'search');
  useContextStore.setState({ searchQuery: query, searchResults: [], searchError: null, searchCompleted: false, searchLoading: Boolean(query.trim()) });
  if (!query.trim()) return;
  try {
    const result = await window.electronAPI.searchMemories(projectId, query);
    if (!current()) return;
    if (result.success && result.data) {
      useContextStore.setState({ searchResults: result.data, searchCompleted: true });
    } else {
      useContextStore.setState({ searchError: result.error || i18n.t('uiKnowledgeContext:searchFailed') });
    }
  } catch (error) {
    if (current()) useContextStore.setState({ searchError: errorMessage(error, i18n.t('uiKnowledgeContext:searchFailed')) });
  } finally {
    if (current()) useContextStore.setState({ searchLoading: false });
  }
}

export async function loadRecentMemories(projectId: string, limit = 20): Promise<void> {
  const current = beginRequest(projectId, 'memory');
  useContextStore.setState({ memoriesLoading: true, memoryError: null });
  try {
    const result = await window.electronAPI.getRecentMemories(projectId, limit);
    if (!current()) return;
    if (result.success && result.data) {
      useContextStore.setState({ recentMemories: result.data });
    } else {
      useContextStore.setState({ recentMemories: [], memoryError: result.error || i18n.t('uiKnowledgeContext:memoriesFailed') });
    }
  } catch (error) {
    if (current()) useContextStore.setState({ recentMemories: [], memoryError: errorMessage(error, i18n.t('uiKnowledgeContext:memoriesFailed')) });
  } finally {
    if (current()) useContextStore.setState({ memoryLoading: false, memoriesLoading: false });
  }
}

async function mutateMemory(
  memoryId: string,
  action: () => Promise<IPCResult<void>>,
  update: (memories: RendererMemory[]) => RendererMemory[]
): Promise<boolean> {
  const state = useContextStore.getState();
  if (!state.projectId || !state.recentMemories.some((memory) => memory.id === memoryId)) {
    useContextStore.setState({ mutationError: i18n.t('uiKnowledgeContext:memoryNotInProject') });
    return false;
  }
  if (state.pendingMemoryIds.includes(memoryId)) return false;
  const projectId = state.projectId;
  const scope = generation;
  const feedbackSequence = ++requests.mutation;
  const current = () => generation === scope && useContextStore.getState().projectId === projectId;
  useContextStore.setState({ mutationError: null, pendingMemoryIds: [...state.pendingMemoryIds, memoryId] });
  try {
    const result = await action();
    if (!current()) return result.success;
    if (result.success) {
      useContextStore.setState((latest) => ({ recentMemories: update(latest.recentMemories) }));
    } else if (requests.mutation === feedbackSequence) {
      useContextStore.setState({ mutationError: result.error || i18n.t('uiKnowledgeContext:memoryUpdateFailed') });
    }
    return result.success;
  } catch (error) {
    if (current() && requests.mutation === feedbackSequence) {
      useContextStore.setState({ mutationError: errorMessage(error, i18n.t('uiKnowledgeContext:memoryUpdateFailed')) });
    }
    return false;
  } finally {
    if (current()) useContextStore.setState((latest) => ({ pendingMemoryIds: latest.pendingMemoryIds.filter((id) => id !== memoryId) }));
  }
}

export function verifyMemory(memoryId: string): Promise<boolean> {
  return mutateMemory(memoryId, () => window.electronAPI.verifyMemory(memoryId),
    (memories) => memories.map((memory) => memory.id === memoryId ? { ...memory, userVerified: true, needsReview: false } : memory));
}

export function pinMemory(memoryId: string, pinned: boolean): Promise<boolean> {
  return mutateMemory(memoryId, () => window.electronAPI.pinMemory(memoryId, pinned),
    (memories) => memories.map((memory) => memory.id === memoryId ? { ...memory, pinned } : memory));
}

export function deprecateMemory(memoryId: string): Promise<boolean> {
  return mutateMemory(memoryId, () => window.electronAPI.deprecateMemory(memoryId),
    (memories) => memories.filter((memory) => memory.id !== memoryId));
}

export function deleteMemory(memoryId: string): Promise<boolean> {
  return mutateMemory(memoryId, () => window.electronAPI.deleteMemory(memoryId),
    (memories) => memories.filter((memory) => memory.id !== memoryId));
}
