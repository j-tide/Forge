import { ipcMain, shell } from 'electron';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../../../shared/constants';
import type { IPCResult, WorktreeCreatePROptions, WorktreeCreatePRResult } from '../../../../shared/types';
import { setAppLanguage } from '../../../app-language';
import { registerWorktreeHandlers } from '../worktree-handlers';

const mocks = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getTasks: vi.fn(),
  createPR: vi.fn(),
  getToolPath: vi.fn(),
  execFileSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('../../../project-store', () => ({
  projectStore: { getProjects: mocks.getProjects, getTasks: mocks.getTasks },
}));
vi.mock('../../../ai/merge/orchestrator', () => ({ MergeOrchestrator: vi.fn() }));
vi.mock('../../../ai/runners/merge-resolver', () => ({ createMergeResolverFn: vi.fn() }));
vi.mock('../../../ai/runners/github/pr-creator', () => ({ createPR: mocks.createPR }));
vi.mock('../../../cli-tool-manager', () => ({ getToolPath: mocks.getToolPath }));
vi.mock('../../../task-state-manager', () => ({ taskStateManager: {} }));
vi.mock('child_process', async (original) => ({
  ...await original<typeof import('child_process')>(),
  execFileSync: mocks.execFileSync,
  spawn: mocks.spawn,
  spawnSync: mocks.spawnSync,
  exec: mocks.exec,
  execFile: mocks.execFile,
}));

let projectPath: string;
let specPath: string;
const specId = '001-no-worktree';
const fixtureContent = '# Isolated IPC fixture\nNo task execution or remote PR is represented here.\n';

beforeEach(() => {
  vi.clearAllMocks();
  projectPath = mkdtempSync(path.join(tmpdir(), 'forge-pr-preflight-'));
  specPath = path.join(projectPath, '.forge-glass-preview', 'specs', specId, 'spec.md');
  mkdirSync(path.dirname(specPath), { recursive: true });
  writeFileSync(specPath, fixtureContent);
  mocks.getProjects.mockReturnValue([{ id: 'project-pr-preflight', path: projectPath }]);
  mocks.getTasks.mockReturnValue([{ id: 'task-pr-preflight', specId }]);
  registerWorktreeHandlers(() => null);
});

afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true });
  setAppLanguage('en');
  ipcMain.removeHandler(IPC_CHANNELS.TASK_WORKTREE_CREATE_PR);
});

describe('Create PR IPC missing-worktree preflight', () => {
  it.each([
    ['en', 'No worktree found for this task'],
    ['zh-CN', '未找到此任务的工作树'],
  ])('returns a stable error code and localized %s text before any PR side effect', async (language, error) => {
    setAppLanguage(language);
    const testMain = ipcMain as typeof ipcMain & {
      invokeHandler: (channel: string, event: unknown, taskId: string, options?: WorktreeCreatePROptions) => Promise<IPCResult<WorktreeCreatePRResult>>;
    };

    const result = await testMain.invokeHandler(IPC_CHANNELS.TASK_WORKTREE_CREATE_PR, {}, 'task-pr-preflight');

    expect(result).toEqual({
      success: false,
      error,
      data: { success: false, error, code: 'no-worktree' },
    });
    expect(mocks.getTasks).toHaveBeenCalledWith('project-pr-preflight');
    expect(mocks.createPR).not.toHaveBeenCalled();
    expect(mocks.getToolPath).not.toHaveBeenCalled();
    for (const operation of [mocks.execFileSync, mocks.spawn, mocks.spawnSync, mocks.exec, mocks.execFile, shell.openExternal, shell.openPath]) {
      expect(operation).not.toHaveBeenCalled();
    }
    expect(readFileSync(specPath, 'utf8')).toBe(fixtureContent);
  });
});
