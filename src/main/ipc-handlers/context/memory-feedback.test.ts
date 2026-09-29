import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { registerMemoryDataHandlers } from './memory-data-handlers';
import { registerProjectContextHandlers } from './project-context-handlers';

const { search, getService, getProject } = vi.hoisted(() => ({
  search: vi.fn(), getService: vi.fn(), getProject: vi.fn()
}));
vi.mock('../../project-store', () => ({ projectStore: { getProject } }));
vi.mock('./memory-service-factory', () => ({ getMemoryService: getService }));
vi.mock('./memory-status-handlers', () => ({ buildMemoryStatus: vi.fn().mockResolvedValue({ available: true, enabled: true }) }));
vi.mock('../../ai/project/project-indexer', () => ({ runProjectIndexer: vi.fn() }));
vi.mock('fs', () => ({ existsSync: vi.fn().mockReturnValue(false), readFileSync: vi.fn() }));

const invoke = (channel: string, ...args: unknown[]) => (
  ipcMain as unknown as { invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown> }
).invokeHandler(channel, {}, ...args);

beforeEach(() => {
  search.mockReset(); getService.mockReset(); getProject.mockReset();
  getProject.mockReturnValue({ id: 'project-A', path: '/fixture-project-A' });
  getService.mockResolvedValue({ search });
  registerMemoryDataHandlers(() => null);
  registerProjectContextHandlers(() => null);
});

describe('memory IPC honest empty/error feedback', () => {
  it.each([IPC_CHANNELS.CONTEXT_GET_MEMORIES, IPC_CHANNELS.CONTEXT_SEARCH_MEMORIES])('keeps real empty success for %s', async (channel) => {
    search.mockResolvedValue([]);
    expect(await invoke(channel, 'project-A', 'query')).toEqual({ success: true, data: [] });
  });

  it.each([IPC_CHANNELS.CONTEXT_GET_MEMORIES, IPC_CHANNELS.CONTEXT_SEARCH_MEMORIES])('reports backend failure for %s without leaking its message', async (channel) => {
    search.mockRejectedValue(new Error('secret-token private-path'));
    const result = await invoke(channel, 'project-A', 'query');
    expect(result).toMatchObject({ success: false, error: expect.any(String) });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('private-path');
  });

  it('retains project context but reports unavailable memory when memory loading fails', async () => {
    search.mockRejectedValue(new Error('private-path'));
    const result = await invoke(IPC_CHANNELS.CONTEXT_GET, 'project-A');
    expect(result).toMatchObject({ success: true, data: {
      projectIndex: null, recentMemories: [], memoryStatus: { available: false }, error: expect.any(String)
    } });
    expect(JSON.stringify(result)).not.toContain('private-path');
  });

  it('preserves missing-project rejection before accessing memory service', async () => {
    getProject.mockReturnValue(undefined);
    expect(await invoke(IPC_CHANNELS.CONTEXT_SEARCH_MEMORIES, 'unknown', 'query')).toMatchObject({ success: false });
    expect(getService).not.toHaveBeenCalled();
  });
});
