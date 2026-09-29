import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AUTO_BUILD_PATHS, IPC_CHANNELS, PROJECT_DATA_DIR, getSpecsDir } from '../../shared/constants';
import type { IPCResult, InsightsSession, InsightsTaskSource, Task, TaskMetadata } from '../../shared/types';

type IPCHandler = (event: unknown, ...args: unknown[]) => Promise<IPCResult<unknown>>;
type FixtureProject = { id: string; path: string; autoBuildPath: string };

const { handlers, handle, getProject, getTasks, invalidateTasksCache, runInsightsQuery, forward } = vi.hoisted(() => ({
  handlers: new Map<string, IPCHandler>(),
  handle: vi.fn(),
  getProject: vi.fn(),
  getTasks: vi.fn(),
  invalidateTasksCache: vi.fn(),
  runInsightsQuery: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../project-store', () => ({ projectStore: { getProject, getTasks, invalidateTasksCache } }));
vi.mock('../insights/config', () => ({ InsightsConfig: class { configure(): void { /* No provider configuration is used during task conversion. */ } } }));
vi.mock('../ai/runners/insights', () => ({ runInsightsQuery }));
vi.mock('../rate-limit-detector', () => ({ detectRateLimit: vi.fn(), createSDKRateLimitInfo: vi.fn() }));
vi.mock('./feature-settings-helper', () => ({ getActiveProviderFeatureSettings: () => ({ model: 'sonnet', thinkingLevel: 'medium' }) }));
vi.mock('./utils', () => ({ safeSendToRenderer: forward }));
vi.mock('../localized-text', () => ({ nativeText: (key: string) => `localized:${key}` }));

import { InsightsService, insightsService } from '../insights-service';
import { InsightsPaths } from '../insights/paths';
import { SessionStorage } from '../insights/session-storage';
import { registerInsightsHandlers } from './insights-handlers';

describe('persisted Insights suggestion conversion', () => {
  const storage = new SessionStorage(new InsightsPaths());
  let directory: string;
  let project: FixtureProject;
  let projects: Map<string, FixtureProject>;
  let session: InsightsSession;
  let source: InsightsTaskSource;
  const title = 'Add response controls';
  const description = 'Allow users to stop and retry a response.';
  const canonicalMetadata: TaskMetadata = { category: 'ui_ux', priority: 'high', rationale: 'Keep the conversation controllable.' };

  function specDirectories(target = project): string[] {
    const specsPath = path.join(target.path, getSpecsDir(target.autoBuildPath));
    if (!existsSync(specsPath)) return [];
    return readdirSync(specsPath, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  }

  function readSpec(taskId: string, filename: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path.join(project.path, getSpecsDir(project.autoBuildPath), taskId, filename), 'utf8'));
  }

  function persistedSession(): InsightsSession {
    const saved = storage.loadSessionById(project.path, session.id);
    if (!saved) throw new Error('Fixture session is missing');
    return saved;
  }

  async function create(
    target = project.id,
    requestedTitle = title,
    requestedDescription = description,
    metadata: TaskMetadata | undefined = undefined,
    requestedSource: unknown = source,
  ): Promise<IPCResult<Task>> {
    const handler = handlers.get(IPC_CHANNELS.INSIGHTS_CREATE_TASK);
    if (!handler) throw new Error('Task conversion handler was not registered');
    return await handler({}, target, requestedTitle, requestedDescription, metadata, requestedSource) as IPCResult<Task>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    insightsService.removeAllListeners();
    directory = mkdtempSync(path.join(tmpdir(), 'forge-insights-conversion-'));
    project = { id: `project-${randomUUID()}`, path: directory, autoBuildPath: PROJECT_DATA_DIR };
    projects = new Map([[project.id, project]]);
    getProject.mockImplementation((projectId: string) => projects.get(projectId));
    // Reconstruct from the real files, so a retry must return the current task
    // rather than fabricate another backlog task from the old suggestion.
    getTasks.mockImplementation((projectId: string): Task[] => {
      const target = projects.get(projectId);
      if (!target) return [];
      return specDirectories(target).map((specId) => {
        const specPath = path.join(target.path, getSpecsDir(target.autoBuildPath), specId);
        const plan = JSON.parse(readFileSync(path.join(specPath, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN), 'utf8'));
        const metadata = JSON.parse(readFileSync(path.join(specPath, 'task_metadata.json'), 'utf8'));
        return {
          id: specId, specId, projectId, title: plan.feature, description: plan.description,
          status: plan.status === 'pending' ? 'backlog' : plan.status,
          subtasks: [], logs: [], metadata,
          createdAt: new Date(plan.created_at), updatedAt: new Date(plan.updated_at),
        };
      });
    });
    handle.mockImplementation((channel: string, handler: IPCHandler) => handlers.set(channel, handler));
    runInsightsQuery.mockImplementation(() => { throw new Error('Suggestion conversion must never run a model'); });
    session = insightsService.createNewSession(project.id, project.path);
    session = {
      ...session,
      messages: [
        { id: 'question-a', role: 'user', content: 'Improve this workflow', timestamp: new Date() },
        { id: 'answer-a', role: 'assistant', content: 'Here is a task.', timestamp: new Date(), suggestedTasks: [{ title, description, metadata: canonicalMetadata }] },
      ],
    };
    storage.saveSession(project.path, session);
    insightsService.switchSession(project.id, project.path, session.id);
    source = { sessionId: session.id, messageId: 'answer-a', suggestionIndex: 0 };
    registerInsightsHandlers(() => null);
  });

  afterEach(() => {
    insightsService.removeAllListeners();
    handlers.clear();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('converts one source only once, persists its badge, and reloads the badge after a service restart', async () => {
    const updates = vi.fn();
    insightsService.on('session-updated', updates);
    const first = await create();
    expect(first.success).toBe(true);
    expect(first.data).toMatchObject({ projectId: project.id, title, description, status: 'backlog' });
    const id = first.data?.id;
    expect(id).toEqual(expect.any(String));
    const repeated = await Promise.all([create(), create()]);

    expect(repeated.map(result => result.data?.id)).toEqual([id, id]);
    expect(specDirectories()).toEqual([id]);
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBe(id);
    expect(insightsService.loadSession(project.id, project.path)?.messages[1].suggestedTasks?.[0].createdTaskId).toBe(id);
    expect(new InsightsService().loadSession(project.id, project.path)?.messages[1].suggestedTasks?.[0].createdTaskId).toBe(id);
    expect(updates).toHaveBeenCalledWith(project.id, expect.objectContaining({
      id: session.id,
      messages: expect.arrayContaining([expect.objectContaining({
        id: 'answer-a', suggestedTasks: [expect.objectContaining({ createdTaskId: id })],
      })]),
    }));
    expect(runInsightsQuery).not.toHaveBeenCalled();
  });

  it('returns the existing task with its current workflow state on a repeated conversion', async () => {
    const first = await create();
    if (!first.data) throw new Error('Conversion did not produce a task');
    const plan = readSpec(first.data.id, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
    plan.status = 'human_review';
    writeFileSync(path.join(project.path, getSpecsDir(project.autoBuildPath), first.data.id, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN), JSON.stringify(plan));

    const repeated = await create();
    expect(repeated).toMatchObject({ success: true, data: { id: first.data.id, status: 'human_review' } });
    expect(invalidateTasksCache).toHaveBeenCalledWith(project.id);
    expect(getTasks).toHaveBeenCalledWith(project.id);
    expect(specDirectories()).toHaveLength(1);
  });

  it('recovers a created task when the first badge save fails, without duplicating the spec', async () => {
    vi.spyOn(SessionStorage.prototype, 'saveSession').mockImplementationOnce(() => {
      throw new Error('private disk failure details');
    });
    const failed = await create();

    expect(failed).toEqual({ success: false, error: 'localized:ipc.failedToCreateTask' });
    const [existingId] = specDirectories();
    expect(existingId).toEqual(expect.any(String));
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBeUndefined();
    const repeated = await create();
    expect(repeated).toMatchObject({ success: true, data: { id: existingId } });
    expect(specDirectories()).toEqual([existingId]);
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBe(existingId);
    expect(insightsService.loadSession(project.id, project.path)?.messages[1].suggestedTasks?.[0].createdTaskId).toBe(existingId);
  });

  it('derives provenance and task metadata from the persisted suggestion, overriding renderer spoofing', async () => {
    const forgedMetadata: TaskMetadata = {
      sourceType: 'manual', category: 'security', priority: 'low',
      insightsSource: { sessionId: 'session-123', messageId: 'forged', suggestionIndex: 99 },
    };
    const result = await create(project.id, title, description, forgedMetadata);
    expect(result.success).toBe(true);
    if (!result.data) throw new Error('Conversion did not produce a task');

    const expected = { ...canonicalMetadata, sourceType: 'insights', insightsSource: source };
    expect(result.data.metadata).toEqual(expected);
    expect(readSpec(result.data.id, 'task_metadata.json')).toEqual(expected);
    expect(readSpec(result.data.id, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN)).toMatchObject({ feature: title, description, status: 'pending', phases: [] });
  });

  it('also canonicalizes forged provenance inside persisted model metadata', async () => {
    const changed = persistedSession();
    const suggestion = changed.messages[1].suggestedTasks?.[0];
    if (!suggestion) throw new Error('Fixture suggestion is missing');
    suggestion.metadata = {
      ...canonicalMetadata, sourceType: 'github',
      insightsSource: { sessionId: 'session-123', messageId: 'forged', suggestionIndex: 99 },
    };
    storage.saveSession(project.path, changed);
    const result = await create();

    expect(result).toMatchObject({ success: true, data: { metadata: { ...canonicalMetadata, sourceType: 'insights', insightsSource: source } } });
  });

  it('does not fall back to renderer metadata when the persisted suggestion has none', async () => {
    const changed = persistedSession();
    const suggestion = changed.messages[1].suggestedTasks?.[0];
    if (!suggestion) throw new Error('Fixture suggestion is missing');
    delete suggestion.metadata;
    storage.saveSession(project.path, changed);
    const result = await create(project.id, title, description, { category: 'security', priority: 'urgent', rationale: 'Forged renderer value' });

    expect(result).toMatchObject({ success: true, data: { metadata: { sourceType: 'insights', insightsSource: source } } });
    expect(result.data?.metadata).toEqual({ sourceType: 'insights', insightsSource: source });
  });

  it('refuses a duplicate if a persisted created badge loses the matching task provenance', async () => {
    const first = await create();
    if (!first.data) throw new Error('Conversion did not produce a task');
    rmSync(path.join(project.path, getSpecsDir(project.autoBuildPath), first.data.id, 'task_metadata.json'));

    const repeated = await create();
    expect(repeated).toEqual({ success: false, error: 'localized:ipc.failedToCreateTask' });
    expect(specDirectories()).toEqual([first.data.id]);
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBe(first.data.id);
  });

  it.each([
    ['missing session', { sessionId: 'session-123' }],
    ['path traversal', { sessionId: '../../outside' }],
    ['missing message', { messageId: 'unknown-answer' }],
    ['user message', { messageId: 'question-a' }],
    ['negative index', { suggestionIndex: -1 }],
    ['fractional index', { suggestionIndex: 0.5 }],
    ['out of range index', { suggestionIndex: 1 }],
    ['non numeric index', { suggestionIndex: '0' }],
  ])('refuses %s before creating any task files', async (_, override) => {
    const result = await create(project.id, title, description, undefined, { ...source, ...override });
    expect(result.success).toBe(false);
    expect(specDirectories()).toEqual([]);
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBeUndefined();
  });

  it.each([
    ['altered title', 'Create a different task', description],
    ['altered description', title, 'Execute a different operation'],
  ])('refuses %s instead of accepting unsaved task content', async (_, requestedTitle, requestedDescription) => {
    const result = await create(project.id, requestedTitle, requestedDescription);
    expect(result.success).toBe(false);
    expect(specDirectories()).toEqual([]);
  });

  it('refuses a source from another project and a stored session with a mismatched project scope', async () => {
    const otherPath = mkdtempSync(path.join(directory, 'other-project-'));
    const other = { id: 'other-project', path: otherPath, autoBuildPath: PROJECT_DATA_DIR };
    projects.set(other.id, other);
    expect((await create(other.id)).success).toBe(false);
    expect(specDirectories(other)).toEqual([]);
    expect((await create('unknown-project')).success).toBe(false);

    storage.saveSession(project.path, { ...session, projectId: other.id });
    expect((await create()).success).toBe(false);
    expect(specDirectories()).toEqual([]);
  });

  it('updates an older source session without changing the currently selected conversation', async () => {
    const current = insightsService.createNewSession(project.id, project.path);
    const result = await create();
    expect(result.success).toBe(true);
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBe(result.data?.id);
    expect(insightsService.loadSession(project.id, project.path)?.id).toBe(current.id);
    expect(storage.getCurrentSessionId(project.path)).toBe(current.id);
  });

  it('uses source identity rather than title to distinguish two persisted suggestions', async () => {
    const changed = persistedSession();
    changed.messages[1].suggestedTasks?.push({ title, description: 'A separate task with the same title.' });
    storage.saveSession(project.path, changed);
    const first = await create();
    const second = await create(project.id, title, 'A separate task with the same title.', undefined, { ...source, suggestionIndex: 1 });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(first.data?.id).not.toBe(second.data?.id);
    expect(specDirectories()).toHaveLength(2);
    expect(persistedSession().messages[1].suggestedTasks?.map(task => task.createdTaskId)).toEqual([first.data?.id, second.data?.id]);
  });

  it('keeps direct task creation working without a suggestion source', async () => {
    const metadata: TaskMetadata = {
      category: 'documentation', priority: 'medium', sourceType: 'manual',
      insightsSource: { sessionId: 'session-123', messageId: 'forged', suggestionIndex: 99 },
    };
    const handler = handlers.get(IPC_CHANNELS.INSIGHTS_CREATE_TASK);
    if (!handler) throw new Error('Task conversion handler was not registered');
    const result = await handler({}, project.id, 'Write a guide', 'Explain the setup.', metadata);

    expect(result).toMatchObject({ success: true, data: { title: 'Write a guide', description: 'Explain the setup.', metadata: { category: 'documentation', priority: 'medium', sourceType: 'insights' } } });
    expect((result.data as Task).metadata?.insightsSource).toBeUndefined();
    expect(specDirectories()).toHaveLength(1);
    expect(persistedSession().messages[1].suggestedTasks?.[0].createdTaskId).toBeUndefined();
    expect(runInsightsQuery).not.toHaveBeenCalled();
  });
});
