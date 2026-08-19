import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../shared/constants';
import type { AgentManager } from '../agent';
import { registerLinearHandlers } from './linear-handlers';

const state = vi.hoisted(() => ({
  language: 'zh-CN',
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  getProject: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      state.handlers.set(channel, handler);
    }
  }
}));
vi.mock('../app-language', () => ({ getAppLanguage: () => state.language }));
vi.mock('../project-store', () => ({ projectStore: { getProject: state.getProject } }));
vi.mock('../agent', () => ({ AgentManager: vi.fn() }));

describe('IPC user messages follow the selected application language', () => {
  beforeEach(() => {
    state.language = 'zh-CN';
    state.handlers.clear();
    state.getProject.mockReset();
    registerLinearHandlers({} as AgentManager, () => null);
  });

  it('returns a Chinese missing-project message and switches immediately to English', async () => {
    const handler = state.handlers.get(IPC_CHANNELS.LINEAR_CHECK_CONNECTION);
    if (!handler) throw new Error('Linear connection handler was not registered');
    expect(await handler({}, 'missing')).toEqual({ success: false, error: '未找到项目' });
    state.language = 'en';
    expect(await handler({}, 'missing')).toEqual({ success: false, error: 'Project not found' });
  });

  it('keeps missing authentication unavailable without making a network request', async () => {
    state.getProject.mockReturnValue({ id: 'project-1', path: '/unused', autoBuildPath: '' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const handler = state.handlers.get(IPC_CHANNELS.LINEAR_CHECK_CONNECTION);
      if (!handler) throw new Error('Linear connection handler was not registered');
      expect(await handler({}, 'project-1')).toEqual({
        success: true,
        data: { connected: false, error: '未配置 Linear API Key' }
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
