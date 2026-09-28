import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcRenderer } = vi.hoisted(() => ({
  ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), send: vi.fn(), invoke: vi.fn() },
}));

vi.mock('electron', () => ({ ipcRenderer }));

import { IPC_CHANNELS } from '../../../../shared/constants';
import { createInsightsAPI } from '../insights-api';

describe('Insights preload event session identity', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('forwards the optional Main-bound error identity and cleans its exact listener', () => {
    const callback = vi.fn();
    const cleanup = createInsightsAPI().onInsightsError(callback);
    const [channel, handler] = ipcRenderer.on.mock.calls[0];
    expect(channel).toBe(IPC_CHANNELS.INSIGHTS_ERROR);

    handler({}, 'project-a', 'Provider failure', 'session-123');
    expect(callback).toHaveBeenCalledWith('project-a', 'Provider failure', 'session-123');
    cleanup();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, handler);
  });

  it('preserves older two-argument error callbacks and payloads', () => {
    const received: string[] = [];
    createInsightsAPI().onInsightsError((projectId, error) => { received.push(`${projectId}:${error}`); });
    const handler = ipcRenderer.on.mock.calls[0][1];
    handler({}, 'project-a', 'Legacy failure');
    handler({}, 'project-a', 'Scoped failure', 'session-123');
    expect(received).toEqual(['project-a:Legacy failure', 'project-a:Scoped failure']);
  });

  it('forwards stream/status identity as payload data without exposing an identity input', () => {
    const api = createInsightsAPI();
    const chunks = vi.fn();
    const statuses = vi.fn();
    api.onInsightsStreamChunk(chunks);
    api.onInsightsStatus(statuses);
    ipcRenderer.on.mock.calls[0][1]({}, 'project-a', { type: 'text', content: 'Response', sessionId: 'session-123' });
    ipcRenderer.on.mock.calls[1][1]({}, 'project-a', { phase: 'complete', sessionId: 'session-123' });
    expect(chunks).toHaveBeenCalledWith('project-a', { type: 'text', content: 'Response', sessionId: 'session-123' });
    expect(statuses).toHaveBeenCalledWith('project-a', { phase: 'complete', sessionId: 'session-123' });

    api.sendInsightsMessage('project-a', 'Request');
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, 'project-a', 'Request', undefined, undefined);
  });
});
