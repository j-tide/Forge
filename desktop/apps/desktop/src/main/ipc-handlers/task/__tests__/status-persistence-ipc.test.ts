import { ipcMain, type BrowserWindow } from 'electron';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS, PROJECT_DATA_DIR } from '../../../../shared/constants';
import type { Project, Task, TaskStatus } from '../../../../shared/types';
import type { AgentManager } from '../../../agent';
import { nativeText } from '../../../localized-text';
import { taskStateManager } from '../../../task-state-manager';
import { registerTaskExecutionHandlers } from '../execution-handlers';
import { getPlanPath } from '../plan-file-utils';

const { lookup, worktree, invalidateTasksCache } = vi.hoisted(() => ({
  lookup: vi.fn(),
  worktree: vi.fn(),
  invalidateTasksCache: vi.fn(),
}));

// Keep the registered handler, singleton state manager, plan utilities, and file writes real.
// Only surrounding application services are replaced; no agents or windows are started.
vi.mock('../shared', () => ({ findTaskAndProject: lookup }));
vi.mock('../../../worktree-paths', () => ({ findTaskWorktree: worktree }));
vi.mock('../../../project-store', () => ({
  projectStore: { invalidateTasksCache, getProject: vi.fn() },
}));
vi.mock('../../../settings-utils', () => ({ readSettingsFile: () => ({}) }));
vi.mock('../../../app-language', () => ({ getAppLanguage: () => 'en' }));
vi.mock('../../../agent', () => ({ AgentManager: class {} }));
vi.mock('../../../cli-tool-manager', () => ({ getToolPath: () => 'git' }));
vi.mock('../../../file-watcher', () => ({ fileWatcher: { watch: vi.fn(), unwatch: vi.fn() } }));
vi.mock('../../../project-initializer', () => ({ checkGitStatus: vi.fn() }));
vi.mock('../../../claude-profile-manager', () => ({ initializeClaudeProfileManager: vi.fn() }));
vi.mock('../../agent-events-handlers', () => ({ cancelFallbackTimer: vi.fn() }));

let fixtureRoot: string;
let task: Task;
let project: Project;
let planPath: string;
const send = vi.fn();
const isRunning = vi.fn(() => false);
const killTask = vi.fn();

const mainWindow = {
  isDestroyed: () => false,
  webContents: { isDestroyed: () => false, send },
} as unknown as BrowserWindow;

async function updateStatus(status: TaskStatus = 'done'): Promise<unknown> {
  const mockMain = ipcMain as typeof ipcMain & {
    invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown>;
  };
  return mockMain.invokeHandler(IPC_CHANNELS.TASK_UPDATE_STATUS, {}, task.id, status);
}

function writeReviewPlan(): void {
  writeFileSync(planPath, JSON.stringify({
    feature: task.title,
    status: 'human_review',
    planStatus: 'review',
    reviewReason: 'completed',
    phases: [{ id: 'phase-1', subtasks: [{ id: 'subtask-1', status: 'completed' }] }],
  }), 'utf-8');
}

function expectPersistenceFailure(result: unknown): void {
  expect(result).toEqual({
    success: false,
    code: 'STATUS_PERSISTENCE_FAILED',
    error: nativeText('ipc.failedToUpdateTaskStatus'),
  });
  expect(send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.TASK_STATUS_CHANGE)).toEqual([]);
  expect(taskStateManager.getCurrentState(task.id)).not.toBe('done');
  expect(killTask).not.toHaveBeenCalled();
}

beforeEach(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'forge-status-persistence-ipc-'));
  const now = new Date('2026-09-28T00:00:00.000Z');
  project = {
    id: 'status-persistence-project',
    name: 'Status persistence fixture',
    path: fixtureRoot,
    autoBuildPath: PROJECT_DATA_DIR,
    settings: {
      model: 'fixture-model',
      memoryBackend: 'file',
      linearSync: false,
      notifications: { onTaskComplete: false, onTaskFailed: false, onReviewNeeded: false, sound: false },
    },
    createdAt: now,
    updatedAt: now,
  };
  task = {
    id: 'status-persistence-task',
    specId: 'status-persistence-spec',
    projectId: project.id,
    title: 'Persist manual task status',
    description: 'A real plan file must acknowledge status changes before reporting success.',
    status: 'human_review',
    reviewReason: 'completed',
    subtasks: [],
    logs: [],
    createdAt: now,
    updatedAt: now,
  };
  planPath = getPlanPath(project, task);
  mkdirSync(path.dirname(planPath), { recursive: true });
  lookup.mockReset().mockReturnValue({ task, project });
  worktree.mockReset().mockReturnValue(null);
  send.mockClear();
  isRunning.mockReset().mockReturnValue(false);
  killTask.mockClear();
  invalidateTasksCache.mockClear();
  taskStateManager.clearTask(task.id);
  taskStateManager.configure(() => mainWindow);
  registerTaskExecutionHandlers({ isRunning, killTask } as unknown as AgentManager, () => mainWindow);
});

afterEach(() => {
  taskStateManager.clearTask(task.id);
  taskStateManager.configure(() => null);
  ipcMain.removeAllListeners(IPC_CHANNELS.TASK_START);
  ipcMain.removeAllListeners(IPC_CHANNELS.TASK_STOP);
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('TASK_UPDATE_STATUS real file persistence', () => {
  it('rejects a plan directory collision without completing the actor, then allows a repaired retry', async () => {
    mkdirSync(planPath);

    expectPersistenceFailure(await updateStatus());
    expect(taskStateManager.getCurrentState(task.id)).toBe('human_review');
    expect(statSync(planPath).isDirectory()).toBe(true);
    expect(invalidateTasksCache).not.toHaveBeenCalled();

    rmSync(planPath, { recursive: true });
    writeReviewPlan();

    expect(await updateStatus()).toEqual({ success: true });
    expect(JSON.parse(readFileSync(planPath, 'utf-8'))).toMatchObject({
      status: 'done',
      planStatus: 'completed',
      xstateState: 'done',
      executionPhase: 'complete',
      phases: [{ id: 'phase-1', subtasks: [{ id: 'subtask-1', status: 'completed' }] }],
    });
    expect(taskStateManager.getCurrentState(task.id)).toBe('done');
    expect(send).toHaveBeenCalledWith(
      IPC_CHANNELS.TASK_STATUS_CHANGE, task.id, 'done', project.id, undefined,
    );
    expect(invalidateTasksCache).toHaveBeenCalledWith(project.id);
    expect(killTask).not.toHaveBeenCalled();
  });

  it('rejects corrupt existing JSON in the legacy queue fallback instead of treating creation as success', async () => {
    const corruptPlan = '{ this is not a JSON implementation plan';
    writeFileSync(planPath, corruptPlan, 'utf-8');

    expectPersistenceFailure(await updateStatus('queue'));
    expect(readFileSync(planPath, 'utf-8')).toBe(corruptPlan);
    expect(taskStateManager.getCurrentState(task.id)).toBeUndefined();

    writeReviewPlan();
    expect(await updateStatus('queue')).toEqual({ success: true });
    expect(JSON.parse(readFileSync(planPath, 'utf-8'))).toMatchObject({ status: 'queue', planStatus: 'queued' });
  });

  it('rejects a legacy queue fallback when the plan path is a directory', async () => {
    mkdirSync(planPath);

    expectPersistenceFailure(await updateStatus('queue'));
    expect(statSync(planPath).isDirectory()).toBe(true);
    expect(taskStateManager.getCurrentState(task.id)).toBeUndefined();
  });

  it('allows the legacy queue fallback to create and acknowledge a genuinely missing plan', async () => {
    expect(await updateStatus('queue')).toEqual({ success: true });
    expect(JSON.parse(readFileSync(planPath, 'utf-8'))).toMatchObject({
      feature: task.title,
      description: task.description,
      status: 'queue',
      planStatus: 'queued',
      phases: [],
    });
    expect(taskStateManager.getCurrentState(task.id)).toBeUndefined();
    expect(killTask).not.toHaveBeenCalled();
  });
});
