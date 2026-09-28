import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentManager } from '../../../agent';
import { IPC_CHANNELS } from '../../../../shared/constants';
import { registerTaskCRUDHandlers } from '../crud-handlers';

const { lookup, worktree, gitStatus } = vi.hoisted(() => ({
  lookup: vi.fn(), worktree: vi.fn(), gitStatus: vi.fn(),
}));
vi.mock('../shared', () => ({ findTaskAndProject: lookup }));
vi.mock('../../../worktree-paths', () => ({ findTaskWorktree: worktree, isPathWithinBase: vi.fn() }));
vi.mock('child_process', async (original) => ({ ...await original<typeof import('child_process')>(), execFileSync: gitStatus }));
vi.mock('../../../cli-tool-manager', () => ({ getToolPath: () => 'git' }));
vi.mock('../../../title-generator', () => ({ titleGenerator: { generateTitle: vi.fn() } }));
vi.mock('../../../project-store', () => ({ projectStore: {} }));
vi.mock('../../../task-state-manager', () => ({ taskStateManager: {} }));
vi.mock('../../../sentry', () => ({ safeBreadcrumb: vi.fn() }));

async function check() {
  const mockMain = ipcMain as typeof ipcMain & { invokeHandler: (channel: string, event: unknown, taskId: string) => Promise<unknown> };
  return mockMain.invokeHandler(IPC_CHANNELS.TASK_CHECK_WORKTREE_CHANGES, {}, 'task-delete-check');
}

beforeEach(() => {
  lookup.mockReset().mockReturnValue({ task: { specId: 'spec' }, project: { path: '/fixture' } });
  worktree.mockReset().mockReturnValue('/fixture/worktree');
  gitStatus.mockReset().mockReturnValue('');
  registerTaskCRUDHandlers({} as AgentManager);
});

describe('Task delete IPC preflight', () => {
  it('does not report clean when Git fails or times out', async () => {
    gitStatus.mockImplementation(() => { throw new Error('private path /user/secret'); });
    const result = await check();
    expect(result).toEqual({ success: false, error: 'Failed to get worktree status' });
    expect(result).not.toHaveProperty('data');
  });

  it('rejects missing task/project instead of reporting a clean worktree', async () => {
    lookup.mockReturnValue({});
    expect(await check()).toMatchObject({ success: false });
    expect(gitStatus).not.toHaveBeenCalled();
  });

  it('allows tasks that genuinely have no worktree without executing Git', async () => {
    worktree.mockReturnValue(null);
    expect(await check()).toEqual({ success: true, data: { hasChanges: false } });
    expect(gitStatus).not.toHaveBeenCalled();
  });

  it('reports actual changed files and uses argv with a finite timeout', async () => {
    gitStatus.mockReturnValue(' M source.ts\n?? notes.md\n');
    expect(await check()).toEqual({ success: true, data: { hasChanges: true, worktreePath: '/fixture/worktree', changedFileCount: 2 } });
    expect(gitStatus).toHaveBeenCalledWith('git', ['status', '--porcelain'], expect.objectContaining({ cwd: '/fixture/worktree', timeout: 5000 }));
  });
});
