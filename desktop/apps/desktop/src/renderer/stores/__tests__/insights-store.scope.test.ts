/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsSession, InsightsStreamChunk, InsightsChatStatus } from '../../../shared/types';
import {
  loadInsightsSession, loadInsightsSessions, newSession, sendMessage,
  setupInsightsListeners, switchSession, useInsightsStore
} from '../insights-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const session = (projectId: string, id = `${projectId}-session`): InsightsSession => ({
  id, projectId, messages: [], createdAt: new Date(), updatedAt: new Date()
});
let stream: (projectId: string, chunk: InsightsStreamChunk) => void;
let status: (projectId: string, status: InsightsChatStatus) => void;
let error: (projectId: string, error: string, sessionId?: string) => void;
let updated: (projectId: string, session: InsightsSession) => void;
const subscriptions = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
const api = {
  getInsightsSession: vi.fn(), listInsightsSessions: vi.fn(),
  newInsightsSession: vi.fn(), switchInsightsSession: vi.fn(),
  sendInsightsMessage: vi.fn(), cancelInsightsChat: vi.fn(),
  onInsightsStreamChunk: vi.fn((callback: typeof stream) => { stream = callback; return subscriptions[0]; }),
  onInsightsStatus: vi.fn((callback: typeof status) => { status = callback; return subscriptions[1]; }),
  onInsightsError: vi.fn((callback: typeof error) => { error = callback; return subscriptions[2]; }),
  onInsightsSessionUpdated: vi.fn((callback: typeof updated) => { updated = callback; return subscriptions[3]; })
};
let previousAPI: typeof window.electronAPI;
let cleanups: Array<() => void> = [];
function listen(projectId: string) {
  const cleanup = setupInsightsListeners(projectId);
  cleanups.push(cleanup);
  return cleanup;
}

beforeEach(() => {
  previousAPI = window.electronAPI;
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  Object.values(api).forEach((mock) => mock.mockClear());
  subscriptions.forEach((mock) => mock.mockClear());
  api.listInsightsSessions.mockResolvedValue({ success: true, data: [] });
  useInsightsStore.getState().clearSession();
  useInsightsStore.setState({ sessions: [], isLoadingSessions: false });
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
  useInsightsStore.getState().clearSession();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: previousAPI });
});

describe('Insights visible project and session scope', () => {
  it('shows the current project real stream and completion in the sending session', () => {
    listen('A');
    useInsightsStore.getState().setSession(session('A'));
    sendMessage('A', 'Explain A');
    stream('A', { type: 'tool_start', tool: { name: 'Read', input: 'README.md' } });
    stream('A', { type: 'text', content: 'Current response' });
    stream('A', { type: 'done' });
    expect(useInsightsStore.getState().session?.messages.map((message) => message.content)).toEqual(['Explain A', 'Current response']);
    expect(useInsightsStore.getState().session?.messages[1].toolsUsed?.[0].name).toBe('Read');
    expect(useInsightsStore.getState().status.phase).toBe('complete');
    expect(api.sendInsightsMessage).toHaveBeenCalledWith('A', 'Explain A', undefined, undefined);
  });

  it('does not display another project streaming text, tools or completion', () => {
    listen('B');
    useInsightsStore.getState().setSession(session('B'));
    stream('A', { type: 'text', content: 'Private A response' });
    stream('A', { type: 'tool_start', tool: { name: 'Read', input: 'A source' } });
    stream('A', { type: 'done' });
    expect(useInsightsStore.getState().streamingContent).toBe('');
    expect(useInsightsStore.getState().toolsUsed).toEqual([]);
    expect(useInsightsStore.getState().session?.messages).toEqual([]);
    expect(useInsightsStore.getState().status.phase).toBe('idle');
  });

  it('does not display another project status or error', () => {
    listen('B');
    useInsightsStore.getState().setSession(session('B'));
    status('A', { phase: 'thinking', message: 'A processing' });
    error('A', 'A unavailable');
    expect(useInsightsStore.getState().status.phase).toBe('idle');
  });

  it('does not refresh the visible session list for another project updates', async () => {
    listen('B');
    useInsightsStore.getState().setSession(session('B'));
    updated('A', session('A'));
    await Promise.resolve();
    expect(api.listInsightsSessions).not.toHaveBeenCalled();
    expect(useInsightsStore.getState().session?.projectId).toBe('B');
  });

  it('clears old project display immediately without cancelling its background run', () => {
    const leaveA = listen('A');
    useInsightsStore.getState().setSession(session('A'));
    sendMessage('A', 'Explain A');
    stream('A', { type: 'text', content: 'A partial' });
    useInsightsStore.getState().setPendingImages([{ id: 'A-image', filename: 'a.png', mimeType: 'image/png', size: 1 }]);
    leaveA();
    listen('B');
    expect(useInsightsStore.getState().session).toBeNull();
    expect(useInsightsStore.getState().streamingContent).toBe('');
    expect(useInsightsStore.getState().pendingImages).toEqual([]);
    expect(api.cancelInsightsChat).not.toHaveBeenCalled();
  });

  it('ignores a delayed A session after B is loaded', async () => {
    const a = deferred<{ success: boolean; data: InsightsSession }>();
    api.getInsightsSession.mockReturnValueOnce(a.promise).mockResolvedValueOnce({ success: true, data: session('B') });
    const leaveA = listen('A');
    const oldRequest = loadInsightsSession('A');
    leaveA();
    listen('B');
    await loadInsightsSession('B');
    a.resolve({ success: true, data: session('A') });
    await oldRequest;
    expect(useInsightsStore.getState().session?.projectId).toBe('B');
    expect(api.listInsightsSessions).toHaveBeenCalledTimes(1);
    expect(api.listInsightsSessions).toHaveBeenCalledWith('B', false);
  });

  it('does not let an old list end B loading or overwrite the newer list', async () => {
    const a = deferred<{ success: boolean; data: [] }>();
    const b = deferred<{ success: boolean; data: [] }>();
    api.listInsightsSessions.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const leaveA = listen('A');
    const first = loadInsightsSessions('A');
    leaveA();
    listen('B');
    const second = loadInsightsSessions('B');
    a.resolve({ success: true, data: [] });
    await first;
    expect(useInsightsStore.getState().isLoadingSessions).toBe(true);
    b.resolve({ success: true, data: [] });
    await second;
    expect(useInsightsStore.getState().isLoadingSessions).toBe(false);
  });

  it('keeps the latest same-project session selection when an older selection returns', async () => {
    listen('A');
    const old = deferred<{ success: boolean; data: InsightsSession }>();
    api.switchInsightsSession.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ success: true, data: session('A', 'new') });
    const first = switchSession('A', 'old');
    await switchSession('A', 'new');
    old.resolve({ success: true, data: session('A', 'old') });
    await first;
    expect(useInsightsStore.getState().session?.id).toBe('new');
  });

  it('does not put A-session streamed content into a different selected A session', async () => {
    listen('A');
    useInsightsStore.getState().setSession(session('A', 'first'));
    sendMessage('A', 'First request');
    api.switchInsightsSession.mockResolvedValue({ success: true, data: session('A', 'second') });
    await switchSession('A', 'second');
    stream('A', { type: 'text', content: 'Response for first' });
    stream('A', { type: 'done' });
    expect(useInsightsStore.getState().session?.id).toBe('second');
    expect(useInsightsStore.getState().session?.messages).toEqual([]);
    expect(useInsightsStore.getState().streamingContent).toBe('');
    expect(api.cancelInsightsChat).not.toHaveBeenCalled();
  });

  it('invalidates callbacks and outstanding requests when listeners are cleaned up', async () => {
    const pending = deferred<{ success: boolean; data: InsightsSession }>();
    api.getInsightsSession.mockReturnValue(pending.promise);
    const cleanup = listen('A');
    const request = loadInsightsSession('A');
    cleanup();
    stream('A', { type: 'text', content: 'After unmount' });
    pending.resolve({ success: true, data: session('A') });
    await request;
    expect(useInsightsStore.getState().session).toBeNull();
    expect(useInsightsStore.getState().streamingContent).toBe('');
    subscriptions.forEach((unsubscribe) => expect(unsubscribe).toHaveBeenCalledTimes(1));
  });

  it('loads completed background messages from Host when returning to the project', async () => {
    const leaveA = listen('A');
    useInsightsStore.getState().setSession(session('A'));
    sendMessage('A', 'Explain A');
    leaveA();
    const leaveB = listen('B');
    updated('A', { ...session('A'), messages: [{ id: 'answer', role: 'assistant', content: 'Persisted A answer', timestamp: new Date() }] });
    leaveB();
    listen('A');
    api.getInsightsSession.mockResolvedValue({ success: true, data: { ...session('A'), messages: [{ id: 'answer', role: 'assistant', content: 'Persisted A answer', timestamp: new Date() }] } });
    await loadInsightsSession('A');
    expect(useInsightsStore.getState().session?.messages[0].content).toBe('Persisted A answer');
    expect(api.cancelInsightsChat).not.toHaveBeenCalled();
  });

  it('ignores a new-session response from a project no longer displayed', async () => {
    const pending = deferred<{ success: boolean; data: InsightsSession }>();
    api.newInsightsSession.mockReturnValue(pending.promise);
    const leaveA = listen('A');
    const request = newSession('A');
    leaveA();
    listen('B');
    useInsightsStore.getState().setSession(session('B'));
    pending.resolve({ success: true, data: session('A', 'created') });
    await request;
    expect(useInsightsStore.getState().session?.projectId).toBe('B');
  });

  it('keeps the latest same-project session list when an older list returns', async () => {
    listen('A');
    const old = deferred<{ success: boolean; data: [] }>();
    api.listInsightsSessions.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ success: true, data: [{ ...session('A', 'latest'), title: 'Latest', messageCount: 0 }] });
    const request = loadInsightsSessions('A', false);
    await loadInsightsSessions('A', true);
    old.resolve({ success: true, data: [] });
    await request;
    expect(useInsightsStore.getState().sessions[0].id).toBe('latest');
  });

  it('rejects cross-project data even when the event claims the visible project', async () => {
    listen('B');
    useInsightsStore.getState().setSession(session('B'));
    updated('B', { ...session('A'), id: 'B-session' });
    expect(useInsightsStore.getState().session?.projectId).toBe('B');
    api.listInsightsSessions.mockResolvedValueOnce({ success: true, data: [{ ...session('A'), title: 'A', messageCount: 0 }] });
    await loadInsightsSessions('B');
    expect(useInsightsStore.getState().sessions).toEqual([]);
  });

  it('does not send using an old session while the new project is loading', async () => {
    listen('B');
    const pending = deferred<{ success: boolean; data: InsightsSession }>();
    api.getInsightsSession.mockReturnValueOnce(pending.promise);
    const request = loadInsightsSession('B');
    sendMessage('B', 'Too early');
    sendMessage('A', 'Wrong project');
    expect(api.sendInsightsMessage).not.toHaveBeenCalled();
    pending.resolve({ success: true, data: session('B') });
    await request;
    sendMessage('B', 'Now ready');
    expect(api.sendInsightsMessage).toHaveBeenCalledTimes(1);
    expect(useInsightsStore.getState().session?.messages[0].content).toBe('Now ready');
  });

  it('does not allow old A requests to reappear after switching A to B and back to A', async () => {
    const old = deferred<{ success: boolean; data: InsightsSession }>();
    api.getInsightsSession.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ success: true, data: session('A', 'current') });
    const leaveA = listen('A');
    const request = loadInsightsSession('A');
    leaveA();
    const leaveB = listen('B');
    leaveB();
    listen('A');
    await loadInsightsSession('A');
    old.resolve({ success: true, data: session('A', 'obsolete') });
    await request;
    expect(useInsightsStore.getState().session?.id).toBe('current');
  });

  it('creates a persisted session before the first send rather than guessing its identity', async () => {
    listen('A');
    api.newInsightsSession.mockResolvedValueOnce({ success: true, data: session('A', 'host-created') });
    await sendMessage('A', 'First message');
    expect(api.newInsightsSession).toHaveBeenCalledWith('A');
    expect(useInsightsStore.getState().session?.id).toBe('host-created');
    expect(api.sendInsightsMessage).toHaveBeenCalledWith('A', 'First message', undefined, undefined);
    updated('A', { ...session('A', 'host-created'), title: 'First message', messages: [{ id: 'real', role: 'user', content: 'First message', timestamp: new Date() }] });
    expect(useInsightsStore.getState().session?.messages[0].id).toBe('real');
  });

  it('does not send a first message after the project is changed while its session is being created', async () => {
    listen('A');
    const pending = deferred<{ success: boolean; data: InsightsSession }>();
    api.newInsightsSession.mockReturnValueOnce(pending.promise);
    const sending = sendMessage('A', 'First message');
    listen('B');
    pending.resolve({ success: true, data: session('A', 'host-created') });
    await sending;
    expect(api.sendInsightsMessage).not.toHaveBeenCalled();
    expect(useInsightsStore.getState().session).toBeNull();
  });

  it('rejects late stream, status and error from the previous session after a new session send', async () => {
    listen('A');
    useInsightsStore.getState().setSession(session('A', 'first'));
    await sendMessage('A', 'First request');
    api.switchInsightsSession.mockResolvedValueOnce({ success: true, data: session('A', 'second') });
    await switchSession('A', 'second');
    await sendMessage('A', 'Second request');
    stream('A', { type: 'text', content: 'Late first response', sessionId: 'first' });
    status('A', { phase: 'error', error: 'Late first status', sessionId: 'first' });
    error('A', 'Late first error', 'first');
    expect(useInsightsStore.getState().streamingContent).toBe('');
    expect(useInsightsStore.getState().status.phase).toBe('thinking');
    expect(useInsightsStore.getState().session?.messages.map((message) => message.content)).toEqual(['Second request']);
    stream('A', { type: 'text', content: 'Second response', sessionId: 'second' });
    stream('A', { type: 'done', sessionId: 'second' });
    expect(useInsightsStore.getState().session?.messages[1].content).toBe('Second response');
  });

  it('does not display identity-free legacy events when no sending session is bound', () => {
    listen('unbound');
    useInsightsStore.getState().setSession(session('unbound'));
    stream('unbound', { type: 'text', content: 'Unknown session response' });
    status('unbound', { phase: 'thinking' });
    error('unbound', 'Unknown session error');
    expect(useInsightsStore.getState().streamingContent).toBe('');
    expect(useInsightsStore.getState().status.phase).toBe('idle');
    stream('unbound', { type: 'text', content: 'Current persisted response', sessionId: 'unbound-session' });
    expect(useInsightsStore.getState().streamingContent).toBe('Current persisted response');
  });

  it('reports a failed first-session creation without sending or inventing a local session', async () => {
    listen('failed-create');
    api.newInsightsSession.mockRejectedValueOnce(new Error('Session storage unavailable'));
    expect(await sendMessage('failed-create', 'Keep my input')).toBe(false);
    expect(api.sendInsightsMessage).not.toHaveBeenCalled();
    expect(useInsightsStore.getState().session).toBeNull();
    expect(useInsightsStore.getState().status).toEqual({ phase: 'error', error: 'Session storage unavailable' });
    expect(useInsightsStore.getState().isLoadingSession).toBe(false);
  });
});
