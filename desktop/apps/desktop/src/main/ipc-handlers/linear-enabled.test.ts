import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, LinearSyncStatus, Project } from '../../shared/types';
import type { AgentManager } from '../agent';
import { registerLinearHandlers } from './linear-handlers';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<IPCResult<unknown>>>(),
  getProject: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<IPCResult<unknown>>) => {
      state.handlers.set(channel, handler);
    },
  },
}));
vi.mock('../project-store', () => ({ projectStore: { getProject: state.getProject } }));
vi.mock('../agent', () => ({ AgentManager: vi.fn() }));

describe('Linear integration enabled flag at the request entry point', () => {
  let directory: string;
  let envPath: string;
  let project: Project;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  function writeEnv(content: string): void {
    writeFileSync(envPath, content, 'utf-8');
  }

  async function invoke(channel: string, ...args: unknown[]): Promise<IPCResult<unknown>> {
    const handler = state.handlers.get(channel);
    if (!handler) throw new Error('Missing Linear handler');
    return handler({}, project.id, ...args);
  }

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'forge-linear-enabled-test-'));
    const autoBuildPath = '.forge-test';
    mkdirSync(path.join(directory, autoBuildPath));
    envPath = path.join(directory, autoBuildPath, '.env');
    project = { id: 'project-fixture', path: directory, autoBuildPath } as Project;
    state.getProject.mockReturnValue(project);
    state.handlers.clear();
    registerLinearHandlers({} as AgentManager, () => null);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: { viewer: { id: 'fixture-viewer', name: 'Fixture user' }, teams: { nodes: [] } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([
    [IPC_CHANNELS.LINEAR_CHECK_CONNECTION, []],
    [IPC_CHANNELS.LINEAR_GET_TEAMS, []],
    [IPC_CHANNELS.LINEAR_GET_PROJECTS, ['fixture-team']],
    [IPC_CHANNELS.LINEAR_GET_ISSUES, ['fixture-team', 'fixture-linear-project']],
    [IPC_CHANNELS.LINEAR_IMPORT_ISSUES, [['fixture-issue']]],
  ])('keeps %s unconfigured and makes no network request when explicitly disabled', async (channel, args) => {
    const content = 'LINEAR_ENABLED=false\nLINEAR_API_KEY=fixture-secret\nLINEAR_TEAM_ID=fixture-team\n';
    writeEnv(content);
    const result = await invoke(channel as string, ...args);

    if (channel === IPC_CHANNELS.LINEAR_CHECK_CONNECTION) {
      expect(result).toEqual({ success: true, data: { connected: false, error: 'No Linear API key configured' } });
    } else {
      expect(result).toEqual({ success: false, error: 'No Linear API key configured' });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readFileSync(envPath, 'utf-8')).toBe(content);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });

  it.each(['FALSE', '" false "', "'FaLsE'"])('recognizes the disabled value %s before resolving a saved key', async flag => {
    writeEnv(`LINEAR_ENABLED=${flag}\nLINEAR_API_KEY=fixture-secret\n`);
    const result = await invoke(IPC_CHANNELS.LINEAR_CHECK_CONNECTION);

    expect(result.data).toEqual({ connected: false, error: 'No Linear API key configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['LINEAR_API_KEY=fixture-secret\n', 'LINEAR_ENABLED=true\nLINEAR_API_KEY=fixture-secret\n'])('keeps configured legacy or enabled projects working: %s', async content => {
    writeEnv(content);
    const result = await invoke(IPC_CHANNELS.LINEAR_CHECK_CONNECTION) as IPCResult<LinearSyncStatus>;

    expect(result.success).toBe(true);
    expect(result.data?.connected).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith('https://api.linear.app/graphql', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'fixture-secret' }),
    }));
  });

  it.each(['LINEAR_ENABLED=true\nLINEAR_API_KEY=\n', 'LINEAR_ENABLED=true\n', ''])('does not report a configured connection without a key: %s', async content => {
    writeEnv(content);
    const result = await invoke(IPC_CHANNELS.LINEAR_CHECK_CONNECTION);

    expect(result.data).toEqual({ connected: false, error: 'No Linear API key configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rereads the saved flag on each call instead of reusing credentials from an earlier enabled request', async () => {
    writeEnv('LINEAR_ENABLED=true\nLINEAR_API_KEY=fixture-secret\n');
    await invoke(IPC_CHANNELS.LINEAR_CHECK_CONNECTION);
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockClear();

    writeEnv('LINEAR_ENABLED=false\nLINEAR_API_KEY=fixture-secret\n');
    const result = await invoke(IPC_CHANNELS.LINEAR_CHECK_CONNECTION);

    expect(result.data).toEqual({ connected: false, error: 'No Linear API key configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
