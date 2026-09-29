import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import type {
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatMessage,
  InsightsModelConfig,
  ImageAttachment,
  InsightsRequestIdentity,
  InsightsRegenerateRequest,
  InsightsGenerationResult,
  InsightsCancellationResult,
  InsightsActiveRequest,
  InsightsErrorCode,
  InsightsTaskSource,
  InsightsTaskSuggestion,
} from '../shared/types';
import { MAX_IMAGES_PER_TASK } from '../shared/constants';
import { InsightsConfig } from './insights/config';
import { InsightsPaths } from './insights/paths';
import { SessionStorage } from './insights/session-storage';
import { SessionManager } from './insights/session-manager';
import { InsightsExecutor } from './insights/insights-executor';
import { InsightsRequestError, insightsFailure } from './insights/errors';

interface ActiveRequest extends InsightsActiveRequest {
  cancelled: boolean;
  committed: boolean;
  errorEmitted: boolean;
  finished: Promise<void>;
  finish: () => void;
}

/**
 * Service for AI-powered codebase insights chat
 *
 * This service coordinates between multiple specialized modules:
 * - InsightsConfig: Manages configuration and environment
 * - InsightsPaths: Provides consistent path resolution
 * - SessionStorage: Handles filesystem persistence
 * - SessionManager: Manages session lifecycle and cache
 * - InsightsExecutor: Executes Python insights runner
 */
export class InsightsService extends EventEmitter {
  private config: InsightsConfig;
  private paths: InsightsPaths;
  private storage: SessionStorage;
  private sessionManager: SessionManager;
  private executor: InsightsExecutor;
  private activeRequests = new Map<string, ActiveRequest>();

  constructor() {
    super();

    // Initialize modules
    this.config = new InsightsConfig();
    this.paths = new InsightsPaths();
    this.storage = new SessionStorage(this.paths);
    this.sessionManager = new SessionManager(this.storage, this.paths);
    this.executor = new InsightsExecutor(this.config);

    // Forward executor events
    this.executor.on('status', (projectId, status) => {
      const active = this.activeRequests.get(projectId);
      if (active && active.requestId === status.requestId && active.phase !== 'stopping'
        && (status.phase === 'thinking' || status.phase === 'streaming')) {
        active.phase = status.phase;
      }
      this.emit('status', projectId, status);
    });
    this.executor.on('stream-chunk', (projectId, chunk) => {
      this.emit('stream-chunk', projectId, chunk);
    });
    this.executor.on('error', (projectId, error, sessionId?: string, requestId?: string, code?: InsightsErrorCode) => {
      const active = this.activeRequests.get(projectId);
      if (active && active.requestId === requestId) active.errorEmitted = true;
      this.emit('error', projectId, error, sessionId, requestId, code);
    });
    this.executor.on('sdk-rate-limit', (info) => {
      this.emit('sdk-rate-limit', info);
    });
  }

  /**
   * Configure paths for Python and Forge source
   */
  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    this.config.configure(pythonPath, autoBuildSourcePath);
  }

  /**
   * Load current session from disk or cache
   */
  loadSession(projectId: string, projectPath: string): InsightsSession | null {
    return this.sessionManager.loadSession(projectId, projectPath);
  }

  /** Resolve task content from persisted history, never from renderer metadata. */
  resolveTaskSuggestion(
    projectId: string,
    projectPath: string,
    source: InsightsTaskSource,
    title: string,
    description: string
  ): InsightsTaskSuggestion {
    const { suggestion } = this.readTaskSuggestion(projectId, projectPath, source);
    if (title !== suggestion.title || description !== suggestion.description) {
      throw new InsightsRequestError('invalid-request');
    }
    return suggestion;
  }

  /** Save the badge after task creation; retries can recover it from task metadata. */
  markTaskSuggestionCreated(
    projectId: string,
    projectPath: string,
    source: InsightsTaskSource,
    taskId: string
  ): void {
    if (typeof taskId !== 'string' || !/^\d+-[a-z0-9-]*$/.test(taskId)) {
      throw new InsightsRequestError('invalid-request');
    }
    const { session, suggestion } = this.readTaskSuggestion(projectId, projectPath, source);
    if (suggestion.createdTaskId === taskId) return;
    const messages = session.messages.map(message => message.id === source.messageId
      ? { ...message, suggestedTasks: message.suggestedTasks?.map((item, index) =>
        index === source.suggestionIndex ? { ...item, createdTaskId: taskId } : item) }
      : message);
    const updated = { ...session, messages, updatedAt: new Date() };
    try {
      this.sessionManager.saveSession(projectPath, updated);
    } catch {
      throw new InsightsRequestError('persistence-failed');
    }
    this.emit('session-updated', projectId, updated);
  }

  private readTaskSuggestion(
    projectId: string,
    projectPath: string,
    source: InsightsTaskSource
  ): { session: InsightsSession; suggestion: InsightsTaskSuggestion } {
    if (!source || typeof source.sessionId !== 'string' || !source.sessionId
      || source.sessionId.length > 160 || typeof source.messageId !== 'string'
      || !source.messageId || source.messageId.length > 160
      || !Number.isSafeInteger(source.suggestionIndex) || source.suggestionIndex < 0) {
      throw new InsightsRequestError('invalid-request');
    }
    const session = this.storage.loadSessionById(projectPath, source.sessionId);
    if (!session || session.id !== source.sessionId || session.projectId !== projectId) {
      throw new InsightsRequestError('invalid-request');
    }
    const message = session.messages.find(item => item.id === source.messageId);
    const suggestion = message?.role === 'assistant'
      ? message.suggestedTasks?.[source.suggestionIndex] : undefined;
    if (!suggestion || typeof suggestion.title !== 'string' || !suggestion.title.trim()
      || typeof suggestion.description !== 'string' || !suggestion.description.trim()) {
      throw new InsightsRequestError('invalid-request');
    }
    return { session, suggestion };
  }

  /**
   * List all sessions for a project
   */
  listSessions(projectPath: string, includeArchived = false): InsightsSessionSummary[] {
    return this.sessionManager.listSessions(projectPath, includeArchived);
  }

  /**
   * Create a new session
   */
  createNewSession(projectId: string, projectPath: string): InsightsSession {
    return this.sessionManager.createNewSession(projectId, projectPath);
  }

  /**
   * Switch to a different session
   */
  switchSession(projectId: string, projectPath: string, sessionId: string): InsightsSession | null {
    return this.sessionManager.switchSession(projectId, projectPath, sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(projectId: string, projectPath: string, sessionId: string): boolean {
    return this.sessionManager.deleteSession(projectId, projectPath, sessionId);
  }

  /**
   * Archive a session
   */
  archiveSession(projectId: string, projectPath: string, sessionId: string): boolean {
    return this.sessionManager.archiveSession(projectId, projectPath, sessionId);
  }

  /**
   * Unarchive a session
   */
  unarchiveSession(projectPath: string, sessionId: string): boolean {
    return this.sessionManager.unarchiveSession(projectPath, sessionId);
  }

  /**
   * Delete multiple sessions
   */
  deleteSessions(projectId: string, projectPath: string, sessionIds: string[]): { deletedIds: string[]; failedIds: string[] } {
    return this.sessionManager.deleteSessions(projectId, projectPath, sessionIds);
  }

  /**
   * Archive multiple sessions
   */
  archiveSessions(projectId: string, projectPath: string, sessionIds: string[]): { archivedIds: string[]; failedIds: string[] } {
    return this.sessionManager.archiveSessions(projectId, projectPath, sessionIds);
  }

  /**
   * Rename a session
   */
  renameSession(projectPath: string, sessionId: string, newTitle: string): boolean {
    return this.sessionManager.renameSession(projectPath, sessionId, newTitle);
  }

  /**
   * Clear current session (delete messages but keep the session)
   */
  clearSession(projectId: string, projectPath: string): void {
    this.sessionManager.clearSession(projectId, projectPath);
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(
    projectId: string,
    projectPath: string,
    message: string,
    modelConfig?: InsightsModelConfig,
    images?: ImageAttachment[],
    request?: InsightsRequestIdentity
  ): Promise<InsightsGenerationResult> {
    this.assertAvailable(projectId);
    if (typeof message !== 'string' || !message.trim()) {
      throw new InsightsRequestError('invalid-request');
    }
    if (request) this.validateIdentity(request);
    let session = this.sessionManager.loadSession(projectId, projectPath);
    if (!session) {
      if (request) throw new InsightsRequestError('session-not-found');
      session = this.sessionManager.createNewSession(projectId, projectPath);
    }
    this.validateSession(session, projectId, request?.sessionId);

    // Auto-generate title from first user message if still default
    const title = session.messages.length === 0 && session.title === 'New Conversation'
      ? this.storage.generateTitle(message) : session.title;

    // Guard: cap images to MAX_IMAGES_PER_TASK
    if (images && images.length > MAX_IMAGES_PER_TASK) {
      images = images.slice(0, MAX_IMAGES_PER_TASK);
    }

    // Add user message (store thumbnails only for persistence, strip full data)
    const persistImages = images?.map(img => ({
      ...img,
      data: undefined
    }));
    const userMessage: InsightsChatMessage = {
      id: `msg-${randomUUID()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      images: persistImages && persistImages.length > 0 ? persistImages : undefined
    };
    const candidate = { ...session, title, messages: [...session.messages, userMessage], updatedAt: new Date() };
    try {
      this.sessionManager.saveSession(projectPath, candidate);
    } catch {
      throw new InsightsRequestError('persistence-failed');
    }

    const identity = { sessionId: session.id, requestId: request?.requestId ?? randomUUID() };
    return this.generateResponse(projectId, projectPath, candidate, userMessage, identity,
      modelConfig, images);
  }

  /** Replace only the latest reply, retaining the persisted original until success. */
  async regenerateMessage(
    projectId: string,
    projectPath: string,
    request: InsightsRegenerateRequest,
    modelConfig?: InsightsModelConfig
  ): Promise<InsightsGenerationResult> {
    this.assertAvailable(projectId);
    this.validateIdentity(request);
    if (typeof request.targetMessageId !== 'string' || !request.targetMessageId) {
      throw new InsightsRequestError('invalid-request');
    }
    const session = this.sessionManager.loadSession(projectId, projectPath);
    if (!session) throw new InsightsRequestError('session-not-found');
    this.validateSession(session, projectId, request.sessionId);
    const last = session.messages.at(-1);
    if (!last || last.id !== request.targetMessageId) {
      throw new InsightsRequestError('invalid-request');
    }
    const userMessage = last.role === 'user' ? last : session.messages.at(-2);
    if (userMessage?.role !== 'user') throw new InsightsRequestError('invalid-request');
    const images = (request.images ?? userMessage.images)?.slice(0, MAX_IMAGES_PER_TASK);
    const identity = { sessionId: session.id, requestId: request.requestId };
    return this.generateResponse(projectId, projectPath, session, userMessage, identity,
      modelConfig, images, last.role === 'assistant' ? last.id : undefined);
  }

  getActiveRequest(projectId: string, sessionId: string): InsightsActiveRequest | null {
    const active = this.activeRequests.get(projectId);
    return active?.sessionId === sessionId
      ? { sessionId: active.sessionId, requestId: active.requestId, phase: active.phase }
      : null;
  }

  async cancelMessage(
    projectId: string,
    sessionId: string,
    requestId: string
  ): Promise<InsightsCancellationResult> {
    this.validateIdentity({ sessionId, requestId });
    const active = this.activeRequests.get(projectId);
    if (!active) return { sessionId, requestId, cancelled: false };
    if (active.sessionId !== sessionId || active.requestId !== requestId) {
      throw new InsightsRequestError('invalid-request');
    }
    if (active.committed) {
      await active.finished;
      return { sessionId, requestId, cancelled: false };
    }
    active.cancelled = true;
    active.phase = 'stopping';
    this.emit('status', projectId, { phase: 'stopping', sessionId, requestId });
    await this.executor.cancelSession(projectId, sessionId, requestId);
    await active.finished;
    return { sessionId, requestId, cancelled: true };
  }

  private assertAvailable(projectId: string): void {
    if (this.activeRequests.has(projectId)) throw new InsightsRequestError('request-busy');
  }

  private validateIdentity(request: InsightsRequestIdentity): void {
    if (!request || typeof request.sessionId !== 'string' || typeof request.requestId !== 'string'
      || !/^[\w-]{1,160}$/.test(request.sessionId) || !/^[\w-]{1,160}$/.test(request.requestId)) {
      throw new InsightsRequestError('invalid-request');
    }
  }

  private validateSession(session: InsightsSession, projectId: string, sessionId?: string): void {
    if (session.projectId !== projectId || session.archivedAt) {
      throw new InsightsRequestError('session-not-found');
    }
    if (sessionId && session.id !== sessionId) throw new InsightsRequestError('invalid-request');
  }

  private async generateResponse(
    projectId: string,
    projectPath: string,
    session: InsightsSession,
    userMessage: InsightsChatMessage,
    identity: InsightsRequestIdentity,
    modelConfig?: InsightsModelConfig,
    images?: ImageAttachment[],
    replacedMessageId?: string
  ): Promise<InsightsGenerationResult> {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const active: ActiveRequest = { ...identity, phase: 'thinking', cancelled: false, committed: false,
      errorEmitted: false, finished, finish };
    this.activeRequests.set(projectId, active);
    // The runner adds the current question separately; never duplicate it in history.
    const userIndex = session.messages.findIndex((m) => m.id === userMessage.id);
    const conversationHistory = session.messages.slice(0, userIndex).map((m) => {
      const imageCount = m.images?.length ?? 0;
      const imageNotation = imageCount > 0 && m.role === 'user'
        ? `\n[User previously attached ${imageCount} image(s) - not visible in this context]` : '';
      return {
        role: m.role,
        content: imageNotation ? m.content + imageNotation : m.content
      };
    });

    const configToUse = modelConfig || session.modelConfig;

    try {
      // Execute insights query
      const result = await this.executor.execute(
        projectId,
        projectPath,
        userMessage.content,
        conversationHistory,
        configToUse,
        images,
        session.id,
        identity.requestId
      );

      if (active.cancelled || result.cancelled) {
        this.emit('status', projectId, { phase: 'idle', ...identity });
        return { ...identity, outcome: 'cancelled' };
      }
      const current = this.storage.loadSessionById(projectPath, session.id);
      if (!current || current.archivedAt) {
        this.emit('status', projectId, { phase: 'idle', ...identity });
        return { ...identity, outcome: 'cancelled' };
      }
      const last = current.messages.at(-1);
      if (last?.id !== (replacedMessageId ?? userMessage.id)) {
        throw new InsightsRequestError('invalid-request');
      }
      const assistantMessage: InsightsChatMessage = {
        id: `msg-${randomUUID()}`,
        role: 'assistant',
        content: result.fullResponse,
        timestamp: new Date(),
        suggestedTasks: result.suggestedTasks,
        toolsUsed: result.toolsUsed.length > 0 ? result.toolsUsed : undefined
      };

      const messages = replacedMessageId ? current.messages.slice(0, -1) : current.messages;
      const updated = { ...current, messages: [...messages, assistantMessage], updatedAt: new Date() };
      try {
        this.sessionManager.saveSession(projectPath, updated);
      } catch {
        throw new InsightsRequestError('persistence-failed');
      }
      active.committed = true;
      this.emit('session-updated', projectId, updated, identity.requestId);
      this.emit('stream-chunk', projectId, { type: 'done', ...identity });
      this.emit('status', projectId, { phase: 'complete', ...identity });
      return { ...identity, outcome: 'complete', messageId: assistantMessage.id };
    } catch (error) {
      const failure = insightsFailure(error);
      if (!active.errorEmitted) {
        this.emit('error', projectId, failure.message, identity.sessionId, identity.requestId, failure.code);
      }
      this.emit('status', projectId, { phase: 'error', error: failure.message, code: failure.code, ...identity });
      throw failure;
    } finally {
      if (this.activeRequests.get(projectId) === active) this.activeRequests.delete(projectId);
      active.finish();
    }
  }

  /**
   * Update model configuration for a session
   */
  updateSessionModelConfig(projectPath: string, sessionId: string, modelConfig: InsightsModelConfig): boolean {
    return this.sessionManager.updateSessionModelConfig(projectPath, sessionId, modelConfig);
  }
}

// Singleton instance
export const insightsService = new InsightsService();
