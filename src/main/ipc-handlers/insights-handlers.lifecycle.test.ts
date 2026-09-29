import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  InsightsCancellationResult,
  InsightsGenerationResult,
  InsightsIPCResult,
} from '../../shared/types';

type IPCHandler = (event: unknown, ...args: unknown[]) => Promise<InsightsIPCResult<unknown>>;

const {
  handlers, handle, getProject, sendMessage, cancelMessage, regenerateMessage,
  getActiveRequest, featureSettings, forward,
} = vi.hoisted(() => ({
  handlers: new Map<string, IPCHandler>(),
  handle: vi.fn(),
  getProject: vi.fn(),
  sendMessage: vi.fn(),
  cancelMessage: vi.fn(),
  regenerateMessage: vi.fn(),
  getActiveRequest: vi.fn(),
  featureSettings: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../project-store', () => ({ projectStore: { getProject } }));
vi.mock('../insights-service', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    insightsService: Object.assign(new EventEmitter(), {
      sendMessage, cancelMessage, regenerateMessage, getActiveRequest,
    }),
  };
});
vi.mock('./feature-settings-helper', () => ({ getActiveProviderFeatureSettings: featureSettings }));
vi.mock('./utils', () => ({ safeSendToRenderer: forward }));
vi.mock('../localized-text', () => ({ nativeText: (key: string) => `localized:${key}` }));

import { insightsService } from '../insights-service';
import { registerInsightsHandlers } from './insights-handlers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Insights lifecycle IPC bridge', () => {
  const getMainWindow = () => null;
  const identity = { sessionId: 'session-1800000000000', requestId: 'request-a' };

  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Handler not registered: ${channel}`);
    return handler({ sender: { id: 17 } }, ...args);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    handlers.clear();
    insightsService.removeAllListeners();
    handle.mockImplementation((channel: string, handler: IPCHandler) => {
      if (handlers.has(channel)) throw new Error(`Duplicate handler: ${channel}`);
      handlers.set(channel, handler);
    });
    getProject.mockImplementation((projectId: string) => projectId === 'project-a'
      ? { id: projectId, path: '/trusted/project-a' } : undefined);
    featureSettings.mockReturnValue({ model: 'sonnet', thinkingLevel: 'high' });
    registerInsightsHandlers(getMainWindow);
  });

  afterEach(() => {
    insightsService.removeAllListeners();
    handlers.clear();
    vi.restoreAllMocks();
  });

  it('registers send as an invocation and waits for the service result before acknowledging it', async () => {
    const pending = deferred<InsightsGenerationResult>();
    sendMessage.mockReturnValue(pending.promise);
    const model = { profileId: 'custom', model: 'haiku', thinkingLevel: 'low' };
    const image = { id: 'image-1', filename: 'example.png', mimeType: 'image/png', size: 5, data: 'aW1hZ2U=' };
    const acknowledged = vi.fn();
    const response = invoke(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, 'project-a', 'Question', model, [image], identity);
    void response.then(acknowledged);
    await flushMicrotasks();

    expect(handle).toHaveBeenCalledWith(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, expect.any(Function));
    expect(sendMessage).toHaveBeenCalledWith('project-a', '/trusted/project-a', 'Question', model, [image], identity);
    expect(featureSettings).toHaveBeenCalledWith('insights');
    expect(acknowledged).not.toHaveBeenCalled();
    const completed: InsightsGenerationResult = { ...identity, outcome: 'complete', messageId: 'assistant-a' };
    pending.resolve(completed);
    await expect(response).resolves.toEqual({ success: true, data: completed });
    expect(acknowledged).toHaveBeenCalledOnce();
  });

  it('passes the exact cancellation scope and waits for teardown before returning success', async () => {
    const pending = deferred<InsightsCancellationResult>();
    cancelMessage.mockReturnValue(pending.promise);
    const acknowledged = vi.fn();
    const response = invoke(IPC_CHANNELS.INSIGHTS_CANCEL_MESSAGE, 'project-a', identity.sessionId, identity.requestId);
    void response.then(acknowledged);
    await flushMicrotasks();

    expect(cancelMessage).toHaveBeenCalledWith('project-a', identity.sessionId, identity.requestId);
    expect(acknowledged).not.toHaveBeenCalled();
    const completed: InsightsCancellationResult = { ...identity, cancelled: true };
    pending.resolve(completed);
    await expect(response).resolves.toEqual({ success: true, data: completed });
    expect(featureSettings).not.toHaveBeenCalled();
  });

  it('merges a model override with provider defaults without changing either input', async () => {
    const defaults = Object.freeze({ model: 'sonnet', thinkingLevel: 'high' });
    const override = Object.freeze({ model: 'haiku' });
    featureSettings.mockReturnValue(defaults);
    sendMessage.mockResolvedValue({ ...identity, outcome: 'complete', messageId: 'assistant-a' });
    await invoke(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, 'project-a', 'Question', override, undefined, identity);

    expect(sendMessage).toHaveBeenCalledWith('project-a', '/trusted/project-a', 'Question', {
      profileId: 'balanced', model: 'haiku', thinkingLevel: 'high',
    }, undefined, identity);
    expect(defaults).toEqual({ model: 'sonnet', thinkingLevel: 'high' });
    expect(override).toEqual({ model: 'haiku' });
  });

  it('preserves a no-op cancellation result instead of reporting that a request was stopped', async () => {
    const completed: InsightsCancellationResult = { ...identity, cancelled: false };
    cancelMessage.mockResolvedValue(completed);

    await expect(invoke(IPC_CHANNELS.INSIGHTS_CANCEL_MESSAGE, 'project-a', identity.sessionId, identity.requestId))
      .resolves.toEqual({ success: true, data: completed });
  });

  it('regenerates the selected target with its reattached images and never creates another send', async () => {
    const pending = deferred<InsightsGenerationResult>();
    regenerateMessage.mockReturnValue(pending.promise);
    const image = { id: 'image-1', filename: 'example.png', mimeType: 'image/png', size: 5, data: 'aW1hZ2U=' };
    const request = { ...identity, targetMessageId: 'assistant-original', images: [image] };
    const acknowledged = vi.fn();
    const response = invoke(IPC_CHANNELS.INSIGHTS_REGENERATE_MESSAGE, 'project-a', request);
    void response.then(acknowledged);
    await flushMicrotasks();

    expect(regenerateMessage).toHaveBeenCalledWith('project-a', '/trusted/project-a', request, {
      profileId: 'balanced', model: 'sonnet', thinkingLevel: 'high',
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(acknowledged).not.toHaveBeenCalled();
    const completed: InsightsGenerationResult = { ...identity, outcome: 'complete', messageId: 'assistant-replacement' };
    pending.resolve(completed);
    await expect(response).resolves.toEqual({ success: true, data: completed });
  });

  it('reads active state only after resolving the requested project and preserves its session scope', async () => {
    const active = { ...identity, phase: 'stopping' };
    getActiveRequest.mockReturnValue(active);

    await expect(invoke(IPC_CHANNELS.INSIGHTS_GET_ACTIVE_REQUEST, 'project-a', identity.sessionId))
      .resolves.toEqual({ success: true, data: active });
    expect(getProject).toHaveBeenCalledWith('project-a');
    expect(getActiveRequest).toHaveBeenCalledWith('project-a', identity.sessionId);
    expect(getProject.mock.invocationCallOrder[0]).toBeLessThan(getActiveRequest.mock.invocationCallOrder[0]);
    getActiveRequest.mockReturnValue(null);
    await expect(invoke(IPC_CHANNELS.INSIGHTS_GET_ACTIVE_REQUEST, 'project-a', 'another-session'))
      .resolves.toEqual({ success: true, data: null });
    expect(getActiveRequest).toHaveBeenLastCalledWith('project-a', 'another-session');
  });

  it.each<[string, unknown[]]>([
    [IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, ['unknown-project', 'Question', undefined, undefined, identity]],
    [IPC_CHANNELS.INSIGHTS_REGENERATE_MESSAGE, ['unknown-project', { ...identity, targetMessageId: 'assistant-a' }]],
    [IPC_CHANNELS.INSIGHTS_CANCEL_MESSAGE, ['unknown-project', identity.sessionId, identity.requestId]],
    [IPC_CHANNELS.INSIGHTS_GET_ACTIVE_REQUEST, ['unknown-project', identity.sessionId]],
  ])('rejects an unknown project on %s before inspecting settings or running work', async (channel, args) => {
    await expect(invoke(channel, ...args)).resolves.toEqual({
      success: false, error: 'localized:ipc.projectNotFound', code: 'invalid-request',
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(regenerateMessage).not.toHaveBeenCalled();
    expect(cancelMessage).not.toHaveBeenCalled();
    expect(getActiveRequest).not.toHaveBeenCalled();
    expect(featureSettings).not.toHaveBeenCalled();
  });

  it.each<[string, typeof sendMessage, unknown[]]>([
    [IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, sendMessage, ['project-a', 'Question', undefined, undefined, identity]],
    [IPC_CHANNELS.INSIGHTS_REGENERATE_MESSAGE, regenerateMessage, ['project-a', { ...identity, targetMessageId: 'assistant-a' }]],
    [IPC_CHANNELS.INSIGHTS_CANCEL_MESSAGE, cancelMessage, ['project-a', identity.sessionId, identity.requestId]],
  ])('sanitizes credential-like provider exceptions from %s', async (channel, serviceMethod, args) => {
    serviceMethod.mockRejectedValue(new Error('Authorization: Bearer sk-secret-test-value; api_key=private-value'));
    const response = await invoke(channel, ...args);

    expect(response).toEqual({ success: false, error: 'localized:ipc.insightsRequestFailed', code: 'request-failed' });
    expect(JSON.stringify(response)).not.toMatch(/sk-secret|private-value|Authorization|api_key/);
  });

  it('maps a typed missing-authentication error to the repairable auth-required result', async () => {
    const error = Object.assign(new Error('Missing credential sk-secret-test-value'), { code: 'INSIGHTS_AUTH_REQUIRED' });
    sendMessage.mockRejectedValue(error);

    await expect(invoke(IPC_CHANNELS.INSIGHTS_SEND_MESSAGE, 'project-a', 'Question', undefined, undefined, identity))
      .resolves.toEqual({ success: false, error: 'localized:ipc.insightsAuthRequired', code: 'auth-required' });
  });

  it('forwards service events with their originating request identity intact', () => {
    const status = { ...identity, phase: 'stopping' };
    const chunk = { ...identity, type: 'done' };
    const session = { id: identity.sessionId, messages: [] };
    insightsService.emit('status', 'project-a', status);
    insightsService.emit('stream-chunk', 'project-a', chunk);
    insightsService.emit('session-updated', 'project-a', session, identity.requestId);
    insightsService.emit('error', 'project-a', 'Safe localized error', identity.sessionId, identity.requestId, 'request-failed');

    expect(forward.mock.calls).toEqual([
      [getMainWindow, IPC_CHANNELS.INSIGHTS_STATUS, 'project-a', status],
      [getMainWindow, IPC_CHANNELS.INSIGHTS_STREAM_CHUNK, 'project-a', chunk],
      [getMainWindow, IPC_CHANNELS.INSIGHTS_SESSION_UPDATED, 'project-a', session, identity.requestId],
      [getMainWindow, IPC_CHANNELS.INSIGHTS_ERROR, 'project-a', 'Safe localized error', identity.sessionId, identity.requestId, 'request-failed'],
    ]);
  });
});
