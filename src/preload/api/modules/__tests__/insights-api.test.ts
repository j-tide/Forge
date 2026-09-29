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

    handler({}, 'project-a', 'Provider failure', 'session-123', 'request-1', 'request-failed');
    expect(callback).toHaveBeenCalledWith('project-a', 'Provider failure', 'session-123', 'request-1', 'request-failed');
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

  it('forwards stream/status identity and sends captured request identity through invoke', async () => {
    const api = createInsightsAPI();
    const chunks = vi.fn();
    const statuses = vi.fn();
    api.onInsightsStreamChunk(chunks);
    api.onInsightsStatus(statuses);
    ipcRenderer.on.mock.calls[0][1]({}, 'project-a', { type: 'text', content: 'Response', sessionId: 'session-123' });
    ipcRenderer.on.mock.calls[1][1]({}, 'project-a', { phase: 'complete', sessionId: 'session-123' });
    expect(chunks).toHaveBeenCalledWith('project-a', { type: 'text', content: 'Response', sessionId: 'session-123' });
    expect(statuses).toHaveBeenCalledWith('project-a', { phase: 'complete', sessionId: 'session-123' });

    const identity = { sessionId: 'session-123', requestId: 'request-1' };
    const result = { success: true, data: { ...identity, outcome: 'complete' } };
    ipcRenderer.invoke.mockResolvedValueOnce(result);
    await expect(api.sendInsightsMessage('project-a', 'Request', undefined, undefined, identity)).resolves.toEqual(result);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, 'project-a', 'Request', undefined, undefined, identity);
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  it('passes cancel scope and returns Main completion acknowledgment', async () => {
    const result = { success: true, data: { sessionId: 'session-123', requestId: 'request-1', cancelled: true } };
    ipcRenderer.invoke.mockResolvedValueOnce(result);
    await expect(createInsightsAPI().cancelInsightsMessage('project-a', 'session-123', 'request-1')).resolves.toEqual(result);
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_CANCEL_MESSAGE, 'project-a', 'session-123', 'request-1');
  });

  it('passes a targeted regeneration without sending a duplicate chat message', async () => {
    const request = { sessionId: 'session-123', requestId: 'request-1', targetMessageId: 'assistant-1' };
    ipcRenderer.invoke.mockResolvedValueOnce({ success: false, code: 'auth-required', error: 'Configure a model account' });
    const result = await createInsightsAPI().regenerateInsightsMessage('project-a', request);
    expect(result.code).toBe('auth-required');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_REGENERATE_MESSAGE, 'project-a', request, undefined);
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  it('reads background runtime identity and preserves request identity on saved session events', async () => {
    const api = createInsightsAPI();
    const active = { sessionId: 'session-123', requestId: 'request-1', phase: 'stopping' };
    ipcRenderer.invoke.mockResolvedValueOnce({ success: true, data: active });
    await expect(api.getInsightsActiveRequest('project-a', 'session-123')).resolves.toEqual({ success: true, data: active });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_GET_ACTIVE_REQUEST, 'project-a', 'session-123');
    const updated = vi.fn();
    api.onInsightsSessionUpdated(updated);
    ipcRenderer.on.mock.calls[0][1]({}, 'project-a', { id: 'session-123' }, 'request-1');
    expect(updated).toHaveBeenCalledWith('project-a', { id: 'session-123' }, 'request-1');
  });

  it('passes persisted suggestion identity separately from renderer task metadata', async () => {
    const source = { sessionId: 'session-123', messageId: 'assistant-1', suggestionIndex: 2 };
    const metadata = { priority: 'high' as const };
    ipcRenderer.invoke.mockResolvedValueOnce({ success: true, data: { id: '001-task' } });
    await expect(createInsightsAPI().createTaskFromInsights('project-a', 'Title', 'Description', metadata, source))
      .resolves.toEqual({ success: true, data: { id: '001-task' } });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_CREATE_TASK,
      'project-a', 'Title', 'Description', metadata, source);
  });
});
