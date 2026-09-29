import { nativeText } from '../localized-text';
import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import path from "path";
import {
  IPC_CHANNELS,
  getSpecsDir,
} from "../../shared/constants";
import type {
  IPCResult,
  InsightsSession,
  InsightsSessionSummary,
  InsightsModelConfig,
  InsightsRequestIdentity,
  InsightsRegenerateRequest,
  InsightsGenerationResult,
  InsightsCancellationResult,
  InsightsActiveRequest,
  InsightsIPCResult,
  InsightsErrorCode,
  InsightsTaskSource,
  ImageAttachment,
  Task,
  TaskMetadata,
} from "../../shared/types";
import { projectStore } from "../project-store";
import { insightsService } from "../insights-service";
import { safeSendToRenderer } from "./utils";
import { getActiveProviderFeatureSettings } from "./feature-settings-helper";
import type { ThinkingLevel } from "../../shared/types/settings";
import { insightsFailure } from '../insights/errors';
import { createInsightsTask, findInsightsTask } from '../insights/task-creation';

/**
 * Read insights feature settings using per-provider resolution
 */
function getInsightsFeatureSettings(): InsightsModelConfig {
  const { model, thinkingLevel } = getActiveProviderFeatureSettings('insights');
  return {
    profileId: "balanced",
    model,
    thinkingLevel: thinkingLevel as ThinkingLevel,
  };
}

/**
 * Register all insights-related IPC handlers
 */
export function registerInsightsHandlers(getMainWindow: () => BrowserWindow | null): void {
  // ============================================
  // Insights Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_GET_SESSION,
    async (_, projectId: string): Promise<IPCResult<InsightsSession | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const session = insightsService.loadSession(projectId, project.path);
      return { success: true, data: session };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_SEND_MESSAGE,
    async (_, projectId: string, message: string, modelConfig?: InsightsModelConfig, images?: ImageAttachment[], request?: InsightsRequestIdentity): Promise<InsightsIPCResult<InsightsGenerationResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound'), code: 'invalid-request' };
      }

      try {
        const configWithSettings = { ...getInsightsFeatureSettings(), ...modelConfig };
        const data = await insightsService.sendMessage(projectId, project.path, message, configWithSettings, images, request);
        return { success: true, data };
      } catch (error) {
        const failure = insightsFailure(error);
        return { success: false, error: failure.message, code: failure.code };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_REGENERATE_MESSAGE,
    async (_, projectId: string, request: InsightsRegenerateRequest, modelConfig?: InsightsModelConfig): Promise<InsightsIPCResult<InsightsGenerationResult>> => {
      const project = projectStore.getProject(projectId);
      if (!project) return { success: false, error: nativeText('ipc.projectNotFound'), code: 'invalid-request' };
      try {
        const configWithSettings = { ...getInsightsFeatureSettings(), ...modelConfig };
        const data = await insightsService.regenerateMessage(projectId, project.path, request, configWithSettings);
        return { success: true, data };
      } catch (error) {
        const failure = insightsFailure(error);
        return { success: false, error: failure.message, code: failure.code };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_CANCEL_MESSAGE,
    async (_, projectId: string, sessionId: string, requestId: string): Promise<InsightsIPCResult<InsightsCancellationResult>> => {
      if (!projectStore.getProject(projectId)) {
        return { success: false, error: nativeText('ipc.projectNotFound'), code: 'invalid-request' };
      }
      try {
        const data = await insightsService.cancelMessage(projectId, sessionId, requestId);
        return { success: true, data };
      } catch (error) {
        const failure = insightsFailure(error);
        return { success: false, error: failure.message, code: failure.code };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_GET_ACTIVE_REQUEST,
    async (_, projectId: string, sessionId: string): Promise<InsightsIPCResult<InsightsActiveRequest | null>> => {
      if (!projectStore.getProject(projectId)) {
        return { success: false, error: nativeText('ipc.projectNotFound'), code: 'invalid-request' };
      }
      return { success: true, data: insightsService.getActiveRequest(projectId, sessionId) };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_CLEAR_SESSION,
    async (_, projectId: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      insightsService.clearSession(projectId, project.path);
      return { success: true };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_CREATE_TASK,
    async (
      _,
      projectId: string,
      title: string,
      description: string,
      metadata?: TaskMetadata,
      source?: InsightsTaskSource
    ): Promise<IPCResult<Task>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      if (!project.autoBuildPath) {
        return { success: false, error: nativeText('ipc.forgeNotInitializedForThisProject') };
      }

      try {
        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specsDir = path.join(project.path, specsBaseDir);
        const validatedSource = source === undefined ? undefined : {
          sessionId: source?.sessionId,
          messageId: source?.messageId,
          suggestionIndex: source?.suggestionIndex,
        };
        const suggestion = validatedSource
          ? insightsService.resolveTaskSuggestion(projectId, project.path, validatedSource, title, description)
          : undefined;
        if (typeof title !== 'string' || !title.trim() || typeof description !== 'string') {
          return { success: false, error: nativeText('ipc.failedToCreateTask') };
        }

        const existingId = validatedSource ? findInsightsTask(specsDir, validatedSource) : undefined;
        if (existingId && validatedSource) {
          projectStore.invalidateTasksCache(projectId);
          const task = projectStore.getTasks(projectId).find(item => item.id === existingId);
          if (!task) return { success: false, error: nativeText('ipc.failedToCreateTask') };
          insightsService.markTaskSuggestionCreated(projectId, project.path, validatedSource, existingId);
          return { success: true, data: task };
        }
        // A saved badge cannot authorize creating a second task if its source marker is missing.
        if (suggestion?.createdTaskId) {
          return { success: false, error: nativeText('ipc.failedToCreateTask') };
        }
        const canonicalMetadata = validatedSource ? suggestion?.metadata : metadata;
        const taskMetadata: TaskMetadata = { ...canonicalMetadata, sourceType: 'insights' };
        delete taskMetadata.insightsSource;
        if (validatedSource) taskMetadata.insightsSource = validatedSource;
        const task = createInsightsTask(projectId, specsDir, title, description, taskMetadata);
        projectStore.invalidateTasksCache(projectId);
        if (validatedSource) {
          insightsService.markTaskSuggestionCreated(projectId, project.path, validatedSource, task.id);
        }

        return { success: true, data: task };
      } catch {
        return {
          success: false,
          error: nativeText('ipc.failedToCreateTask'),
        };
      }
    }
  );

  // List all sessions for a project
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_LIST_SESSIONS,
    async (_, projectId: string, includeArchived?: boolean): Promise<IPCResult<InsightsSessionSummary[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const sessions = insightsService.listSessions(project.path, includeArchived ?? false);
      return { success: true, data: sessions };
    }
  );

  // Delete multiple sessions
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_DELETE_SESSIONS,
    async (_, projectId: string, sessionIds: string[]): Promise<IPCResult<{ deletedIds: string[]; failedIds: string[] }>> => {
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return { success: false, error: nativeText('ipc.noSessionsSpecified') };
      }

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const result = insightsService.deleteSessions(projectId, project.path, sessionIds);
      return {
        success: result.failedIds.length === 0,
        data: result,
        ...(result.failedIds.length > 0 && { error: nativeText('ipcTemplate.failedToDeleteValue0SessionS', { value0: String(result.failedIds.length) }) })
      };
    }
  );

  // Archive a session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_ARCHIVE_SESSION,
    async (_, projectId: string, sessionId: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const success = insightsService.archiveSession(projectId, project.path, sessionId);
      if (success) {
        return { success: true };
      }
      return { success: false, error: nativeText('ipc.failedToArchiveSession') };
    }
  );

  // Archive multiple sessions
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_ARCHIVE_SESSIONS,
    async (_, projectId: string, sessionIds: string[]): Promise<IPCResult<{ archivedIds: string[]; failedIds: string[] }>> => {
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return { success: false, error: nativeText('ipc.noSessionsSpecified') };
      }

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const result = insightsService.archiveSessions(projectId, project.path, sessionIds);
      return {
        success: result.failedIds.length === 0,
        data: result,
        ...(result.failedIds.length > 0 && { error: nativeText('ipcTemplate.failedToArchiveValue0SessionS', { value0: String(result.failedIds.length) }) })
      };
    }
  );

  // Unarchive a session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_UNARCHIVE_SESSION,
    async (_, projectId: string, sessionId: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const success = insightsService.unarchiveSession(project.path, sessionId);
      if (success) {
        return { success: true };
      }
      return { success: false, error: nativeText('ipc.failedToUnarchiveSession') };
    }
  );

  // Create a new session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_NEW_SESSION,
    async (_, projectId: string): Promise<IPCResult<InsightsSession>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const session = insightsService.createNewSession(projectId, project.path);
      return { success: true, data: session };
    }
  );

  // Switch to a different session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_SWITCH_SESSION,
    async (_, projectId: string, sessionId: string): Promise<IPCResult<InsightsSession | null>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const session = insightsService.switchSession(projectId, project.path, sessionId);
      return { success: true, data: session };
    }
  );

  // Delete a session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_DELETE_SESSION,
    async (_, projectId: string, sessionId: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const success = insightsService.deleteSession(projectId, project.path, sessionId);
      if (success) {
        return { success: true };
      }
      return { success: false, error: nativeText('ipc.failedToDeleteSession') };
    }
  );

  // Rename a session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_RENAME_SESSION,
    async (_, projectId: string, sessionId: string, newTitle: string): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const success = insightsService.renameSession(project.path, sessionId, newTitle);
      if (success) {
        return { success: true };
      }
      return { success: false, error: nativeText('ipc.failedToRenameSession') };
    }
  );

  // Update model configuration for a session
  ipcMain.handle(
    IPC_CHANNELS.INSIGHTS_UPDATE_MODEL_CONFIG,
    async (
      _,
      projectId: string,
      sessionId: string,
      modelConfig: InsightsModelConfig
    ): Promise<IPCResult> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: nativeText('ipc.projectNotFound') };
      }

      const success = insightsService.updateSessionModelConfig(
        project.path,
        sessionId,
        modelConfig
      );
      if (success) {
        return { success: true };
      }
      return { success: false, error: nativeText('ipc.failedToUpdateModelConfiguration') };
    }
  );

  // ============================================
  // Insights Event Forwarding (Service -> Renderer)
  // ============================================

  // Forward streaming chunks to renderer
  insightsService.on("stream-chunk", (projectId: string, chunk: unknown) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.INSIGHTS_STREAM_CHUNK, projectId, chunk);
  });

  // Forward status updates to renderer
  insightsService.on("status", (projectId: string, status: unknown) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.INSIGHTS_STATUS, projectId, status);
  });

  // Forward errors to renderer
  insightsService.on("error", (projectId: string, error: string, sessionId?: string, requestId?: string, code?: InsightsErrorCode) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.INSIGHTS_ERROR, projectId, error, sessionId, requestId, code);
  });

  // Forward SDK rate limit events to renderer
  insightsService.on("sdk-rate-limit", (rateLimitInfo: unknown) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, rateLimitInfo);
  });

  // Forward session-updated events to renderer for real-time UI updates
  insightsService.on("session-updated", (projectId: string, session: unknown, requestId?: string) => {
    safeSendToRenderer(getMainWindow, IPC_CHANNELS.INSIGHTS_SESSION_UPDATED, projectId, session, requestId);
  });
}
