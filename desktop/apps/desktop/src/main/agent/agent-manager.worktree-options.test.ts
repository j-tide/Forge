import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../shared/types/project';

const mocks = vi.hoisted(() => ({
  projects: [] as Project[],
  createOrGetWorktree: vi.fn(),
  spawnWorkerProcess: vi.fn(),
  resolveAuth: vi.fn(),
  profile: { hasValidAuth: vi.fn(() => true), getActiveProfile: vi.fn(() => null) },
}));

// Exercise the real manager entry point while replacing the boundaries that
// could create Git worktrees, read credentials, or start an AI worker.
vi.mock('./agent-process', () => ({
  AgentProcessManager: class {
    spawnWorkerProcess = mocks.spawnWorkerProcess;
  },
}));
vi.mock('./agent-queue', () => ({ AgentQueueManager: class {} }));
vi.mock('../claude-profile-manager', () => ({
  initializeClaudeProfileManager: vi.fn(async () => mocks.profile),
  getClaudeProfileManager: vi.fn(() => mocks.profile),
}));
vi.mock('../claude-profile/operation-registry', () => ({ getOperationRegistry: vi.fn() }));
vi.mock('../project-store', () => ({ projectStore: { getProjects: vi.fn(() => mocks.projects) } }));
vi.mock('../settings-utils', () => ({ readSettingsFile: vi.fn(() => null) }));
vi.mock('../ai/auth/resolver', () => ({ resolveAuth: mocks.resolveAuth, resolveAuthFromQueue: vi.fn() }));
vi.mock('../ai/providers/factory', () => ({ detectProviderFromModel: vi.fn(() => 'anthropic') }));
vi.mock('../ai/config/phase-config', () => ({ resolveModelId: vi.fn(() => 'fixture-model') }));
vi.mock('../ai/prompts/prompt-loader', () => ({ tryLoadPrompt: vi.fn(() => 'Fixture planner prompt') }));
vi.mock('../ai/security/security-profile', () => ({
  getSecurityProfile: vi.fn(() => ({
    baseCommands: new Set(), stackCommands: new Set(), scriptCommands: new Set(),
    customCommands: new Set(), customScripts: { shellScripts: [] },
  })),
}));
vi.mock('../ai/worktree', () => ({ createOrGetWorktree: mocks.createOrGetWorktree }));
vi.mock('../worktree-paths', () => ({ findTaskWorktree: vi.fn() }));
vi.mock('../ipc-handlers/task/plan-file-utils', () => ({ resetStuckSubtasks: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    // No fixture spec files exist; the real manager takes its normal defaults.
    existsSync: vi.fn((file: Parameters<typeof actual.existsSync>[0]) =>
      String(file).startsWith('/fixture/') ? false : actual.existsSync(file)),
  };
});

import { AgentManager } from './agent-manager';

const projectPath = '/fixture/project';
const projectId = 'fixture-project';
const specId = '001-local-task';
const taskId = 'fixture-task';
const worktreePath = '/fixture/worktree';

describe('AgentManager task worktree push preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projects = [];
    mocks.createOrGetWorktree.mockResolvedValue({ worktreePath });
    mocks.spawnWorkerProcess.mockResolvedValue(undefined);
    mocks.resolveAuth.mockResolvedValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it.each([
    { name: 'task false overrides project true', taskPush: false, projectPush: true, projectExists: true, expected: false },
    { name: 'task true overrides project false', taskPush: true, projectPush: false, projectExists: true, expected: true },
    { name: 'undefined task follows project false', taskPush: undefined, projectPush: false, projectExists: true, expected: false },
    { name: 'undefined task follows project true', taskPush: undefined, projectPush: true, projectExists: true, expected: true },
    { name: 'missing project preference preserves the legacy true default', taskPush: undefined, projectPush: undefined, projectExists: true, expected: true },
    { name: 'missing project preserves the legacy true default', taskPush: undefined, projectPush: undefined, projectExists: false, expected: true },
    { name: 'task false remains local-only without a stored project', taskPush: false, projectPush: undefined, projectExists: false, expected: false },
  ])('$name', async ({ taskPush, projectPush, projectExists, expected }) => {
    if (projectExists) {
      mocks.projects = [{
        id: projectId, name: 'Fixture project', path: projectPath,
        autoBuildPath: '.forge-glass-preview',
        settings: {
          model: 'fixture-model', memoryBackend: 'file', linearSync: false,
          notifications: { onTaskComplete: false, onTaskFailed: false, onReviewNeeded: false, sound: false },
          pushNewBranches: projectPush,
        },
        createdAt: new Date(0), updatedAt: new Date(0),
      }];
    }
    const manager = new AgentManager();

    await manager.startTaskExecution(taskId, projectPath, specId, {
      pushNewBranches: taskPush, baseBranch: 'task-base', useLocalBranch: true,
    }, projectId);

    expect(mocks.createOrGetWorktree).toHaveBeenCalledExactlyOnceWith(
      projectPath, specId, 'task-base', true, expected,
      projectExists ? '.forge-glass-preview' : undefined,
    );
    // Reaching the worker boundary proves this went through the real execution
    // method and was not an auth refusal or a stand-alone preference helper.
    expect(mocks.spawnWorkerProcess).toHaveBeenCalledExactlyOnceWith(
      taskId,
      expect.objectContaining({
        taskId, projectId, processType: 'task-execution',
        session: expect.objectContaining({
          agentType: 'build_orchestrator', projectDir: worktreePath,
          sourceSpecDir: path.join(projectPath, '.forge-glass-preview', 'specs', specId),
        }),
      }),
      {}, 'task-execution', projectId,
    );
    expect(mocks.resolveAuth).toHaveBeenCalledExactlyOnceWith({ provider: 'anthropic', configDir: undefined });
    manager.removeAllListeners();
  });
});
