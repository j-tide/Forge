import i18n from '../../shared/i18n';
import { create } from 'zustand';
import type {
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsToolUsage,
  InsightsModelConfig,
  InsightsActiveRequest,
  InsightsErrorCode,
  InsightsTaskSource,
  InsightsGenerationResult,
  InsightsIPCResult,
  TaskMetadata,
  Task,
  ImageAttachment
} from '../../shared/types';

interface ToolUsage {
  name: string;
  input?: string;
}

interface InsightsState {
  // Data
  projectId: string | null;
  isLoadingSession: boolean;
  session: InsightsSession | null;
  sessions: InsightsSessionSummary[]; // List of all sessions
  status: InsightsChatStatus;
  pendingMessage: string;
  streamingContent: string; // Accumulates streaming response
  streamingTasks: NonNullable<InsightsChatMessage['suggestedTasks']>; // Accumulates task suggestions during streaming
  currentTool: ToolUsage | null; // Currently executing tool
  toolsUsed: InsightsToolUsage[]; // Tools used during current response
  isLoadingSessions: boolean;
  showArchived: boolean; // Whether to include archived sessions in listings
  pendingImages: ImageAttachment[]; // Images pending attachment to next message
  activeRequest: InsightsActiveRequest | null;

  // Actions
  setSession: (session: InsightsSession | null) => void;
  setSessions: (sessions: InsightsSessionSummary[]) => void;
  setStatus: (status: InsightsChatStatus) => void;
  setPendingMessage: (message: string) => void;
  addMessage: (message: InsightsChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  setCurrentTool: (tool: ToolUsage | null) => void;
  addToolUsage: (tool: ToolUsage) => void;
  clearToolsUsed: () => void;
  addStreamingTasks: (tasks: NonNullable<InsightsChatMessage['suggestedTasks']>) => void;
  finalizeStreamingMessage: () => void;
  clearSession: () => void;
  setLoadingSessions: (loading: boolean) => void;
  setShowArchived: (showArchived: boolean) => void;
  setPendingImages: (images: ImageAttachment[]) => void;
}

const initialStatus: InsightsChatStatus = {
  phase: 'idle',
  message: ''
};

export const useInsightsStore = create<InsightsState>((set, _get) => ({
  // Initial state
  projectId: null,
  isLoadingSession: false,
  session: null,
  sessions: [],
  status: initialStatus,
  pendingMessage: '',
  streamingContent: '',
  streamingTasks: [],
  currentTool: null,
  toolsUsed: [],
  isLoadingSessions: false,
  showArchived: false,
  pendingImages: [],
  activeRequest: null,

  // Actions
  setSession: (session) => set({ session }),

  setSessions: (sessions) => set({ sessions }),

  setStatus: (status) => set({ status }),

  setLoadingSessions: (loading) => set({ isLoadingSessions: loading }),

  setShowArchived: (showArchived) => set({ showArchived }),

  setPendingMessage: (message) => set({ pendingMessage: message }),

  addMessage: (message) =>
    set((state) => {
      if (!state.session) {
        // Create new session if none exists
        return {
          session: {
            id: `session-${Date.now()}`,
            projectId: state.projectId ?? '',
            messages: [message],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        };
      }

      return {
        session: {
          ...state.session,
          messages: [...state.session.messages, message],
          updatedAt: new Date()
        }
      };
    }),

  updateLastAssistantMessage: (content) =>
    set((state) => {
      if (!state.session || state.session.messages.length === 0) return state;

      const messages = [...state.session.messages];
      const lastIndex = messages.length - 1;
      const lastMessage = messages[lastIndex];

      if (lastMessage.role === 'assistant') {
        messages[lastIndex] = { ...lastMessage, content };
      }

      return {
        session: {
          ...state.session,
          messages,
          updatedAt: new Date()
        }
      };
    }),

  appendStreamingContent: (content) =>
    set((state) => ({
      streamingContent: state.streamingContent + content
    })),

  clearStreamingContent: () => set({ streamingContent: '', streamingTasks: [] }),

  setCurrentTool: (tool) => set({ currentTool: tool }),

  addToolUsage: (tool) =>
    set((state) => ({
      toolsUsed: [
        ...state.toolsUsed,
        {
          name: tool.name,
          input: tool.input,
          timestamp: new Date()
        }
      ]
    })),

  clearToolsUsed: () => set({ toolsUsed: [] }),

  addStreamingTasks: (tasks) =>
    set((state) => ({
      streamingTasks: [...state.streamingTasks, ...tasks]
    })),

  finalizeStreamingMessage: () =>
    set((state) => {
      const content = state.streamingContent;
      const toolsUsed = state.toolsUsed.length > 0 ? [...state.toolsUsed] : undefined;
      const suggestedTasks = state.streamingTasks.length > 0 ? [...state.streamingTasks] : undefined;

      if (!content && !suggestedTasks && !toolsUsed) {
        return { streamingContent: '', streamingTasks: [], toolsUsed: [] };
      }

      const newMessage: InsightsChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content,
        timestamp: new Date(),
        suggestedTasks,
        toolsUsed
      };

      if (!state.session) {
        return {
          streamingContent: '',
          streamingTasks: [],
          toolsUsed: [],
          session: {
            id: `session-${Date.now()}`,
            projectId: state.projectId ?? '',
            messages: [newMessage],
            createdAt: new Date(),
            updatedAt: new Date()
          }
        };
      }

      return {
        streamingContent: '',
        streamingTasks: [],
        toolsUsed: [],
        session: {
          ...state.session,
          messages: [...state.session.messages, newMessage],
          updatedAt: new Date()
        }
      };
    }),

  clearSession: () =>
    set({
      session: null,
      status: initialStatus,
      pendingMessage: '',
      streamingContent: '',
      streamingTasks: [],
      currentTool: null,
      toolsUsed: [],
      pendingImages: [],
      activeRequest: null
    }),

  setPendingImages: (images) => set({ pendingImages: images })
}));

// Helper functions

// The store represents one visible project. IPC runs and persisted sessions remain
// owned by Main; changing this view must not cancel or move their results.
let scopeGeneration = 0;
let sessionRequest = 0;
let sessionsRequest = 0;
const locallyAwaitedRequests = new Set<string>();
const locallyCancellingRequests = new Set<string>();


function currentScope(projectId: string): number | null {
  return useInsightsStore.getState().projectId === projectId ? scopeGeneration : null;
}

function isCurrentScope(projectId: string, generation: number | null): boolean {
  return generation !== null && generation === scopeGeneration &&
    useInsightsStore.getState().projectId === projectId;
}

function resetVisibleSession(): void {
  useInsightsStore.getState().clearSession();
  useInsightsStore.setState({ sessions: [], isLoadingSessions: false, isLoadingSession: false });
}

function beginSessionRequest(projectId: string) {
  const generation = currentScope(projectId);
  const request = ++sessionRequest;
  if (generation !== null) useInsightsStore.setState({ isLoadingSession: true });
  return {
    current: () => isCurrentScope(projectId, generation) && request === sessionRequest,
    finish: () => {
      if (isCurrentScope(projectId, generation) && request === sessionRequest) {
        useInsightsStore.setState({ isLoadingSession: false });
      }
    }
  };
}

export async function loadInsightsSessions(projectId: string, includeArchived?: boolean): Promise<void> {
  const generation = currentScope(projectId);
  if (generation === null) return;
  const request = ++sessionsRequest;
  const current = () => isCurrentScope(projectId, generation) && request === sessionsRequest;
  const store = useInsightsStore.getState();
  store.setLoadingSessions(true);

  // Use explicit parameter if provided, otherwise read from store
  const archived = includeArchived ?? store.showArchived;

  try {
    const result = await window.electronAPI.listInsightsSessions(projectId, archived);
    if (!current()) return;
    if (result.success && result.data?.every((session) => session.projectId === projectId)) {
      store.setSessions(result.data);
    } else {
      store.setSessions([]);
    }
  } finally {
    if (current()) store.setLoadingSessions(false);
  }
}

export async function loadInsightsSession(projectId: string, includeArchived?: boolean): Promise<void> {
  if (currentScope(projectId) === null) return;
  const request = beginSessionRequest(projectId);
  try {
    const result = await window.electronAPI.getInsightsSession(projectId);
    if (!request.current()) return;
    if (result.success && result.data?.projectId === projectId) {
      useInsightsStore.getState().setSession(result.data);
      await restoreActiveRequest(projectId, result.data.id, request.current);
    } else {
      useInsightsStore.getState().setSession(null);
    }
    // Also load the sessions list, only while this remains the visible project.
    await loadInsightsSessions(projectId, includeArchived);
  } finally {
    request.finish();
  }
}

function failureStatus(code: InsightsErrorCode = 'request-failed'): InsightsChatStatus {
  return { phase: 'error', code, error: i18n.t(`uiKnowledgeContext:generationErrors.${code}`) };
}

async function restoreActiveRequest(projectId: string, sessionId: string, current: () => boolean): Promise<void> {
  const result = await window.electronAPI.getInsightsActiveRequest(projectId, sessionId);
  if (!current() || useInsightsStore.getState().session?.id !== sessionId) return;
  const active = result.success ? result.data ?? null : null;
  if (active && active.sessionId !== sessionId) return;
  useInsightsStore.setState({ activeRequest: active, status: active ? { ...active } : initialStatus });
}

async function refreshGeneratedSession(projectId: string, requestId: string, sessionId: string, generation: number | null): Promise<boolean> {
  const current = () => isCurrentScope(projectId, generation) &&
    useInsightsStore.getState().session?.id === sessionId &&
    useInsightsStore.getState().activeRequest?.requestId === requestId;
  if (!current()) return false;
  const result = await window.electronAPI.getInsightsSession(projectId);
  if (!current()) return false;
  if (!result.success || result.data?.projectId !== projectId || result.data.id !== sessionId) {
    useInsightsStore.setState({ status: failureStatus('persistence-failed') });
    return false;
  }
  useInsightsStore.setState({ session: result.data });
  return true;
}

async function performGeneration(projectId: string, session: InsightsSession,
  invoke: (request: InsightsActiveRequest) => Promise<InsightsIPCResult<InsightsGenerationResult>>): Promise<boolean> {
  const generation = currentScope(projectId);
  const request: InsightsActiveRequest = { sessionId: session.id, requestId: crypto.randomUUID(), phase: 'thinking' };
  locallyAwaitedRequests.add(request.requestId);
  useInsightsStore.setState({ activeRequest: request, status: { ...request }, streamingContent: '',
    streamingTasks: [], toolsUsed: [], currentTool: null });
  const current = () => isCurrentScope(projectId, generation) &&
    useInsightsStore.getState().session?.id === session.id &&
    useInsightsStore.getState().activeRequest?.requestId === request.requestId;
  try {
    const result = await invoke(request);
    if (!current() || useInsightsStore.getState().activeRequest?.phase === 'stopping') return false;
    if (!result.success || !result.data || result.data.sessionId !== request.sessionId || result.data.requestId !== request.requestId) {
      // Main persists the user before requesting a reply. Hydrate it on failure
      // so retry can reuse its real ID instead of appending the user again.
      await refreshGeneratedSession(projectId, request.requestId, session.id, generation);
      if (current()) useInsightsStore.setState({ status: failureStatus(result.code) });
      return false;
    }
    const refreshed = await refreshGeneratedSession(projectId, request.requestId, session.id, generation);
    if (!current()) return false;
    if (refreshed) useInsightsStore.setState({ status: { phase: 'complete', message: result.data.outcome === 'cancelled'
      ? i18n.t('uiKnowledgeContext:responseStopped') : '' } });
    return refreshed && result.data.outcome === 'complete';
  } catch {
    if (current() && useInsightsStore.getState().activeRequest?.phase !== 'stopping') useInsightsStore.setState({ status: failureStatus() });
    return false;
  } finally {
    locallyAwaitedRequests.delete(request.requestId);
    if (!current()) void finishObservedRequest(projectId, request.requestId);
    if (current() && useInsightsStore.getState().activeRequest?.phase !== 'stopping') useInsightsStore.setState({ activeRequest: null, streamingContent: '', streamingTasks: [], currentTool: null, toolsUsed: [] });
  }
}

export async function regenerateMessage(projectId: string, targetMessageId: string, modelConfig?: InsightsModelConfig, images?: ImageAttachment[]): Promise<boolean> {
  const store = useInsightsStore.getState();
  if (store.projectId !== projectId || store.isLoadingSession || store.activeRequest || store.session?.projectId !== projectId) return false;
  const session = store.session;
  if (session.messages.at(-1)?.id !== targetMessageId) return false;
  return performGeneration(projectId, session, (request) => window.electronAPI.regenerateInsightsMessage(
    projectId, { sessionId: request.sessionId, requestId: request.requestId, targetMessageId, images }, modelConfig ?? session.modelConfig));
}

export async function cancelMessage(projectId: string): Promise<boolean> {
  const store = useInsightsStore.getState();
  const request = store.activeRequest;
  if (store.projectId !== projectId || !request || request.phase === 'stopping') return false;
  const generation = currentScope(projectId);
  const current = () => isCurrentScope(projectId, generation) &&
    useInsightsStore.getState().activeRequest?.requestId === request.requestId &&
    useInsightsStore.getState().session?.id === request.sessionId;
  locallyCancellingRequests.add(request.requestId);
  useInsightsStore.setState({ activeRequest: { ...request, phase: 'stopping' }, status: { ...request, phase: 'stopping' } });
  try {
    const result = await window.electronAPI.cancelInsightsMessage(projectId, request.sessionId, request.requestId);
    if (!current()) return result.success;
    if (!result.success || !result.data || result.data.requestId !== request.requestId || result.data.sessionId !== request.sessionId) {
      useInsightsStore.setState({ activeRequest: request, status: failureStatus(result.code) });
      return false;
    }
    await refreshGeneratedSession(projectId, request.requestId, request.sessionId, generation);
    if (current()) useInsightsStore.setState({ activeRequest: null, status: { phase: 'complete', message: result.data.cancelled ? i18n.t('uiKnowledgeContext:responseStopped') : '' },
      streamingContent: '', streamingTasks: [], currentTool: null, toolsUsed: [] });
    return true;
  } catch {
    if (current()) useInsightsStore.setState({ activeRequest: request, status: failureStatus() });
    return false;
  } finally {
    locallyCancellingRequests.delete(request.requestId);
    if (!current()) void finishObservedRequest(projectId, request.requestId);
  }
}

export async function sendMessage(projectId: string, message: string, modelConfig?: InsightsModelConfig, images?: ImageAttachment[]): Promise<boolean> {
  let store = useInsightsStore.getState();
  if (store.projectId !== projectId || store.isLoadingSession || store.activeRequest ||
    (store.session && store.session.projectId !== projectId)) return false;
  const generation = currentScope(projectId);
  if (!store.session) {
    try { await newSession(projectId); } catch {
      if (isCurrentScope(projectId, generation)) useInsightsStore.setState({ status: failureStatus('persistence-failed') });
      return false;
    }
    if (!isCurrentScope(projectId, generation)) return false;
    store = useInsightsStore.getState();
    if (!store.session) { store.setStatus(failureStatus('persistence-failed')); return false; }
  }
  const session = store.session;
  const lastMessage = session.messages.at(-1);
  if (lastMessage?.role === 'user' && lastMessage.content === message) {
    return regenerateMessage(projectId, lastMessage.id, modelConfig, images);
  }
  const displayImages = images?.map(img => ({ ...img, data: undefined }));
  store.addMessage({ id: `pending-${crypto.randomUUID()}`, role: 'user', content: message, timestamp: new Date(),
    ...(displayImages?.length ? { images: displayImages } : {}) });
  return performGeneration(projectId, session, (request) => window.electronAPI.sendInsightsMessage(
    projectId, message, modelConfig ?? session.modelConfig, images, { sessionId: request.sessionId, requestId: request.requestId }));
}

export async function clearSession(projectId: string, includeArchived?: boolean): Promise<void> {
  const generation = currentScope(projectId);
  if (generation === null) return;
  const result = await window.electronAPI.clearInsightsSession(projectId);
  if (result.success && isCurrentScope(projectId, generation)) {
    useInsightsStore.getState().clearSession();
    // Reload sessions list and current session
    await loadInsightsSession(projectId, includeArchived);
  }
}

export async function newSession(projectId: string): Promise<void> {
  if (currentScope(projectId) === null) return;
  const request = beginSessionRequest(projectId);
  try {
    const result = await window.electronAPI.newInsightsSession(projectId);
    if (request.current() && result.success && result.data?.projectId === projectId) {
      resetVisibleSession();
      useInsightsStore.getState().setSession(result.data);
      // Reload sessions list
      await loadInsightsSessions(projectId);
    }
  } finally {
    request.finish();
  }
}

export async function switchSession(projectId: string, sessionId: string): Promise<void> {
  if (currentScope(projectId) === null) return;
  const request = beginSessionRequest(projectId);
  try {
    const result = await window.electronAPI.switchInsightsSession(projectId, sessionId);
    if (request.current() && result.success && result.data?.projectId === projectId && result.data.id === sessionId) {
      useInsightsStore.getState().setSession(result.data);
      // Reset streaming state when switching sessions.
      useInsightsStore.getState().clearStreamingContent();
      useInsightsStore.getState().clearToolsUsed();
      useInsightsStore.getState().setCurrentTool(null);
      useInsightsStore.setState({ activeRequest: null, status: initialStatus });
      await restoreActiveRequest(projectId, sessionId, request.current);
    }
  } finally {
    request.finish();
  }
}

export async function deleteSession(projectId: string, sessionId: string, includeArchived?: boolean): Promise<boolean> {
  const generation = currentScope(projectId);
  const result = await window.electronAPI.deleteInsightsSession(projectId, sessionId);
  if (result.success) {
    // Reload sessions list and current session
    if (isCurrentScope(projectId, generation)) await loadInsightsSession(projectId, includeArchived);
    return true;
  }
  return false;
}

export async function renameSession(projectId: string, sessionId: string, newTitle: string): Promise<boolean> {
  const generation = currentScope(projectId);
  const result = await window.electronAPI.renameInsightsSession(projectId, sessionId, newTitle);
  if (result.success) {
    // Reload sessions list to reflect the change
    if (isCurrentScope(projectId, generation)) await loadInsightsSessions(projectId);
    return true;
  }
  return false;
}

export async function deleteSessions(projectId: string, sessionIds: string[]): Promise<{ success: boolean; failedIds?: string[] }> {
  const result = await window.electronAPI.deleteInsightsSessions(projectId, sessionIds);
  if (result.success) {
    return { success: true, failedIds: result.data?.failedIds };
  }
  return { success: false, failedIds: result.data?.failedIds };
}

export async function archiveSession(projectId: string, sessionId: string): Promise<boolean> {
  const result = await window.electronAPI.archiveInsightsSession(projectId, sessionId);
  return result.success;
}

export async function archiveSessions(projectId: string, sessionIds: string[]): Promise<{ success: boolean; failedIds?: string[] }> {
  const result = await window.electronAPI.archiveInsightsSessions(projectId, sessionIds);
  if (result.success) {
    return { success: true, failedIds: result.data?.failedIds };
  }
  return { success: false, failedIds: result.data?.failedIds };
}

export async function unarchiveSession(projectId: string, sessionId: string): Promise<boolean> {
  const result = await window.electronAPI.unarchiveInsightsSession(projectId, sessionId);
  return result.success;
}

export async function updateModelConfig(projectId: string, sessionId: string, modelConfig: InsightsModelConfig): Promise<boolean> {
  const generation = currentScope(projectId);
  const result = await window.electronAPI.updateInsightsModelConfig(projectId, sessionId, modelConfig);
  if (result.success) {
    // Update local session state
    const store = useInsightsStore.getState();
    if (isCurrentScope(projectId, generation) && store.session?.projectId === projectId && store.session.id === sessionId) {
      store.setSession({
        ...store.session,
        modelConfig,
        updatedAt: new Date()
      });
    }
    // Reload sessions list to reflect the change
    if (isCurrentScope(projectId, generation)) await loadInsightsSessions(projectId);
    return true;
  }
  return false;
}

export async function createTaskFromSuggestion(
  projectId: string,
  title: string,
  description: string,
  metadata?: TaskMetadata,
  source?: InsightsTaskSource
): Promise<Task | null> {
  const result = await window.electronAPI.createTaskFromInsights(
    projectId,
    title,
    description,
    metadata,
    source
  );

  if (result.success && result.data) {
    return result.data;
  }
  return null;
}

async function finishObservedRequest(projectId: string, requestId: string): Promise<void> {
  if (locallyAwaitedRequests.has(requestId) || locallyCancellingRequests.has(requestId)) return;
  const state = useInsightsStore.getState();
  const active = state.activeRequest;
  const generation = currentScope(projectId);
  if (!active || active.requestId !== requestId) return;
  try {
    const result = await window.electronAPI.getInsightsActiveRequest(projectId, active.sessionId);
    if (!isCurrentScope(projectId, generation) || useInsightsStore.getState().activeRequest?.requestId !== requestId ||
      locallyCancellingRequests.has(requestId) || !result.success || result.data) return;
    await refreshGeneratedSession(projectId, requestId, active.sessionId, generation);
    if (isCurrentScope(projectId, generation) && useInsightsStore.getState().activeRequest?.requestId === requestId &&
      !locallyCancellingRequests.has(requestId)) {
      useInsightsStore.setState({ activeRequest: null, streamingContent: '', streamingTasks: [], currentTool: null, toolsUsed: [],
        ...(active.phase === 'stopping' ? { status: { phase: 'complete' as const, message: '' } } : {}) });
    }
  } catch { /* Keep the Stop control available until Main can acknowledge readiness. */ }
}

// Bind IPC display updates to this view; background runs stay owned by Main.
export function setupInsightsListeners(projectId: string): () => void {
  const generation = ++scopeGeneration;
  resetVisibleSession();
  useInsightsStore.setState({ projectId });
  let disposed = false;
  const store = useInsightsStore.getState;
  const acceptsProject = (eventProjectId: string) =>
    !disposed && eventProjectId === projectId && isCurrentScope(projectId, generation);
  const acceptsStream = (eventProjectId: string, eventSessionId?: string, requestId?: string) => {
    if (!acceptsProject(eventProjectId)) return false;
    const state = store();
    const active = state.activeRequest;
    return state.session?.projectId === projectId && !!active &&
      eventSessionId === state.session.id && active.sessionId === eventSessionId && active.requestId === requestId;
  };

  // Listen for streaming chunks
  const unsubStreamChunk = window.electronAPI.onInsightsStreamChunk(
    (eventProjectId, chunk: InsightsStreamChunk) => {
      if (!acceptsStream(eventProjectId, chunk.sessionId, chunk.requestId)) return;
      if (store().activeRequest?.phase === 'stopping') {
        if (chunk.requestId && (chunk.type === 'done' || chunk.type === 'error')) void finishObservedRequest(projectId, chunk.requestId);
        return;
      }
      switch (chunk.type) {
        case 'text':
          if (chunk.content) {
            store().appendStreamingContent(chunk.content);
            store().setCurrentTool(null); // Clear tool when receiving text
            store().setStatus({
              phase: 'streaming',
              message: i18n.t('uiRuntime:stores.receivingResponse')
            });
          }
          break;
        case 'tool_start':
          if (chunk.tool) {
            store().setCurrentTool({
              name: chunk.tool.name,
              input: chunk.tool.input
            });
            // Record this tool usage for history
            store().addToolUsage({
              name: chunk.tool.name,
              input: chunk.tool.input
            });
            store().setStatus({
              phase: 'streaming',
              message: i18n.t('uiRuntime:stores.usingTool', { tool: chunk.tool.name })
            });
          }
          break;
        case 'tool_end':
          store().setCurrentTool(null);
          break;
        case 'task_suggestion':
          // Accumulate task suggestions — they'll be included when 'done' finalizes the message
          store().setCurrentTool(null);
          if (chunk.suggestedTasks) {
            store().addStreamingTasks(chunk.suggestedTasks);
          }
          break;
        case 'done':
          // Finalize any remaining content
          store().setCurrentTool(null);
          store().clearStreamingContent();
          store().setStatus({
            phase: 'complete',
            message: ''
          });
          if (chunk.requestId) void finishObservedRequest(projectId, chunk.requestId);
          break;
        case 'error':
          store().setCurrentTool(null);
          store().setStatus({
            phase: 'error',
            error: i18n.t(`uiKnowledgeContext:generationErrors.${chunk.code ?? 'request-failed'}`),
            code: chunk.code ?? 'request-failed'
          });
          if (chunk.requestId) void finishObservedRequest(projectId, chunk.requestId);
          break;
      }
    }
  );

  // Listen for status updates
  const unsubStatus = window.electronAPI.onInsightsStatus((eventProjectId, status) => {
    if (!acceptsStream(eventProjectId, status.sessionId, status.requestId)) return;
    if (store().activeRequest?.phase === 'stopping') {
      if (status.requestId && ['idle', 'complete', 'error'].includes(status.phase)) void finishObservedRequest(projectId, status.requestId);
      return;
    }
    store().setStatus(status.phase === 'error' ? failureStatus(status.code) : status);
    if (status.requestId && ['idle', 'complete', 'error'].includes(status.phase)) void finishObservedRequest(projectId, status.requestId);
  });

  // Listen for errors
  const unsubError = window.electronAPI.onInsightsError((eventProjectId, _error, sessionId, requestId, code) => {
    if (!acceptsStream(eventProjectId, sessionId, requestId)) return;
    if (store().activeRequest?.phase === 'stopping') {
      if (requestId) void finishObservedRequest(projectId, requestId);
      return;
    }
    store().setStatus(failureStatus(code));
    if (requestId) void finishObservedRequest(projectId, requestId);
  });

  // Listen for session updates (e.g., after assistant message saved with auto-generated title)
  const unsubSessionUpdated = window.electronAPI.onInsightsSessionUpdated(
    (eventProjectId, session: InsightsSession, requestId) => {
      if (!acceptsProject(eventProjectId) || session.projectId !== projectId) return;
      // Update current session if it matches
      const currentSession = store().session;
      if (currentSession?.projectId === projectId && currentSession.id === session.id &&
        (!requestId || acceptsStream(eventProjectId, session.id, requestId))) {
        store().setSession(session);
      }
      // Also refresh sessions list for sidebar
      void loadInsightsSessions(session.projectId).catch(() => { /* Preserve the current view when sidebar refresh fails. */ });
    }
  );

  // Return cleanup function
  return () => {
    if (disposed) return;
    disposed = true;
    unsubStreamChunk();
    unsubStatus();
    unsubError();
    unsubSessionUpdated();
    if (isCurrentScope(projectId, generation)) {
      scopeGeneration++;
      resetVisibleSession();
      useInsightsStore.setState({ projectId: null });
    }
  };
}
