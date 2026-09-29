import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsChatMessage, InsightsSession } from '../../shared/types';
import type {
  InsightsConfig as QueryConfig,
  InsightsResult,
  InsightsStreamEvent,
} from '../ai/runners/insights';

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));

vi.mock('../ai/runners/insights', () => ({ runInsightsQuery: runQuery }));
vi.mock('../insights/config', () => ({
  InsightsConfig: class {
    configure() { /* This suite never loads provider credentials. */ }
  },
}));
vi.mock('../rate-limit-detector', () => ({
  detectRateLimit: () => ({ isRateLimited: false }),
  createSDKRateLimitInfo: vi.fn(),
}));

import { InsightsService } from '../insights-service';
import { InsightsPaths } from '../insights/paths';
import { SessionStorage } from '../insights/session-storage';

interface PendingQuery {
  config: QueryConfig;
  emit: (event: InsightsStreamEvent) => void;
  resolve: (value: InsightsResult) => void;
  reject: (error: Error) => void;
}

const result = (text: string): InsightsResult => ({ text, taskSuggestion: null, toolCalls: [] });

async function flushMicrotasks(): Promise<void> {
  // Yield enough to expose premature completion without depending on a timer.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Insights request lifecycle', () => {
  let rootPath: string;
  let projectPath: string;
  let service: InsightsService;
  let storage: SessionStorage;
  let session: InsightsSession;
  let pending: PendingQuery[];

  const persisted = (): InsightsSession => {
    const saved = storage.loadSessionById(projectPath, session.id);
    expect(saved).not.toBeNull();
    return saved as InsightsSession;
  };

  const send = (requestId: string, message = 'Explain this project') => service.sendMessage(
    'project-a', projectPath, message, undefined, undefined, { sessionId: session.id, requestId },
  );

  const regenerate = (requestId: string, targetMessageId: string) => service.regenerateMessage(
    'project-a', projectPath, { sessionId: session.id, requestId, targetMessageId },
  );

  async function completeTurn(requestId: string, message: string, reply: string): Promise<InsightsChatMessage> {
    const response = send(requestId, message);
    pending.at(-1)?.resolve(result(reply));
    await response;
    const assistant = persisted().messages.at(-1);
    expect(assistant?.role).toBe('assistant');
    return assistant as InsightsChatMessage;
  }

  beforeEach(() => {
    rootPath = mkdtempSync(join(tmpdir(), 'forge-insights-lifecycle-'));
    projectPath = join(rootPath, 'project-a');
    mkdirSync(projectPath);
    pending = [];
    let time = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => time++);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    runQuery.mockImplementation((config: QueryConfig, emit: (event: InsightsStreamEvent) => void) =>
      new Promise<InsightsResult>((resolve, reject) => {
        pending.push({ config, emit, resolve, reject });
      }));
    service = new InsightsService();
    // An error listener also prevents EventEmitter's reserved error event from throwing.
    service.on('error', () => undefined);
    storage = new SessionStorage(new InsightsPaths());
    session = service.createNewSession('project-a', projectPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    rmSync(rootPath, { recursive: true, force: true });
  });

  it('keeps historical and new session paths valid while rejecting paths outside the session namespace', () => {
    const paths = new InsightsPaths();
    expect(() => paths.getSessionPath(projectPath, 'session-1800000000000')).not.toThrow();
    expect(() => paths.getSessionPath(projectPath, 'session-66018a90-72f7-4f16-a2d2-5404bcb7cf6c')).not.toThrow();
    for (const invalid of ['../settings', 'session-1/../../settings', 'session-1.json', 'session-66018a90-72f7-4f16-a2d2-5404bcb7cf6c.json']) {
      expect(() => paths.getSessionPath(projectPath, invalid)).toThrow();
    }
  });

  it('keeps real request identity and saves the assistant before publishing completion', async () => {
    const chunks = vi.fn();
    const statuses = vi.fn();
    const order: string[] = [];
    service.on('stream-chunk', chunks);
    service.on('status', statuses);
    service.on('session-updated', () => {
      expect(persisted().messages.map(message => message.content)).toEqual(['Explain this project', 'A complete answer']);
      order.push('saved');
    });
    service.on('stream-chunk', (_projectId, chunk) => {
      if (chunk.type !== 'done') return;
      expect(persisted().messages.at(-1)?.content).toBe('A complete answer');
      order.push('done');
    });
    service.on('status', (_projectId, status) => {
      if (status.phase === 'complete') order.push('complete');
    });

    const response = send('request-complete');
    expect(service.getActiveRequest('project-a', session.id)).toEqual({
      sessionId: session.id, requestId: 'request-complete', phase: 'thinking',
    });
    pending[0].emit({ type: 'text-delta', text: 'A complete answer' });
    expect(service.getActiveRequest('project-a', session.id)?.phase).toBe('streaming');
    pending[0].resolve(result('A complete answer'));
    const completed = await response;

    expect(completed).toEqual({
      sessionId: session.id, requestId: 'request-complete', outcome: 'complete',
      messageId: persisted().messages.at(-1)?.id,
    });
    expect(order).toEqual(['saved', 'done', 'complete']);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
    for (const [projectId, event] of [...chunks.mock.calls, ...statuses.mock.calls]) {
      expect(projectId).toBe('project-a');
      expect(event).toMatchObject({ sessionId: session.id, requestId: 'request-complete' });
    }
  });

  it('rejects another send for the project without aborting or persisting its message', async () => {
    const response = send('request-original', 'Original message');
    const selected = service.createNewSession('project-a', projectPath);

    await expect(service.sendMessage('project-a', projectPath, 'Rejected message', undefined, undefined, {
      sessionId: selected.id, requestId: 'request-overlap',
    })).rejects.toThrow();

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(pending[0].config.abortSignal?.aborted).toBe(false);
    expect(storage.loadSessionById(projectPath, selected.id)?.messages).toEqual([]);
    expect(persisted().messages.map(message => message.content)).toEqual(['Original message']);
    expect(service.getActiveRequest('project-a', selected.id)).toBeNull();
    expect(service.getActiveRequest('project-a', session.id)?.requestId).toBe('request-original');

    pending[0].resolve(result('Original answer'));
    await response;
    expect(service.loadSession('project-a', projectPath)?.id).toBe(selected.id);
  });

  it('allows requests in independent projects without cross-cancelling their runners', async () => {
    const otherPath = join(rootPath, 'project-b');
    mkdirSync(otherPath);
    const otherSession = service.createNewSession('project-b', otherPath);
    const first = send('request-a');
    const second = service.sendMessage('project-b', otherPath, 'Other project', undefined, undefined, {
      sessionId: otherSession.id, requestId: 'request-b',
    });

    expect(runQuery).toHaveBeenCalledTimes(2);
    expect(pending.map(query => query.config.abortSignal?.aborted)).toEqual([false, false]);
    pending[1].resolve(result('Other answer'));
    await second;
    expect(service.getActiveRequest('project-a', session.id)?.requestId).toBe('request-a');
    pending[0].resolve(result('First answer'));
    await first;
    expect(storage.loadSessionById(otherPath, otherSession.id)?.messages.at(-1)?.content).toBe('Other answer');
  });

  it('keeps cancellation pending until the runner settles and finalization releases the active request', async () => {
    const chunks = vi.fn();
    const statuses = vi.fn();
    const errors = vi.fn();
    service.on('stream-chunk', chunks);
    service.on('status', statuses);
    service.on('error', errors);
    const response = send('request-stop', 'Keep the user message');
    pending[0].emit({ type: 'text-delta', text: 'Partial text' });
    pending[0].emit({ type: 'tool-start', name: 'read_file', input: 'README.md' });
    const cancelled = vi.fn();
    const cancellation = service.cancelMessage('project-a', session.id, 'request-stop').then(value => {
      expect(service.getActiveRequest('project-a', session.id)).toBeNull();
      expect(persisted().messages.map(message => message.content)).toEqual(['Keep the user message']);
      cancelled(value);
      return value;
    });
    const duplicateCancelled = vi.fn();
    const duplicateCancellation = service.cancelMessage('project-a', session.id, 'request-stop')
      .then(value => { duplicateCancelled(value); return value; });
    await flushMicrotasks();

    expect(cancelled).not.toHaveBeenCalled();
    expect(duplicateCancelled).not.toHaveBeenCalled();
    expect(pending[0].config.abortSignal?.aborted).toBe(true);
    expect(service.getActiveRequest('project-a', session.id)).toEqual({
      sessionId: session.id, requestId: 'request-stop', phase: 'stopping',
    });
    await expect(send('request-too-early', 'Must wait')).rejects.toThrow();
    expect(runQuery).toHaveBeenCalledTimes(1);

    const chunkCount = chunks.mock.calls.length;
    const statusCount = statuses.mock.calls.length;
    pending[0].emit({ type: 'text-delta', text: 'Late text' });
    pending[0].emit({ type: 'tool-start', name: 'write_file', input: 'late.ts' });
    pending[0].emit({ type: 'tool-end', name: 'write_file' });
    pending[0].emit({ type: 'error', error: 'Late runner error' });
    expect(chunks).toHaveBeenCalledTimes(chunkCount);
    expect(statuses).toHaveBeenCalledTimes(statusCount);
    expect(errors).not.toHaveBeenCalled();

    // Some SDKs resolve successfully after aborting; that must still count as cancellation.
    pending[0].resolve({
      ...result('Partial text plus late text'),
      taskSuggestion: {
        title: 'Discarded suggestion', description: 'The cancelled request cannot suggest this task',
        metadata: { category: 'feature', complexity: 'simple', impact: 'low' },
      },
    });
    await expect(response).resolves.toEqual({
      sessionId: session.id, requestId: 'request-stop', outcome: 'cancelled',
    });
    await expect(cancellation).resolves.toEqual({
      sessionId: session.id, requestId: 'request-stop', cancelled: true,
    });
    await expect(duplicateCancellation).resolves.toEqual({
      sessionId: session.id, requestId: 'request-stop', cancelled: true,
    });
    expect(chunks).toHaveBeenCalledTimes(chunkCount);
    expect(chunks.mock.calls.some(([, chunk]) => chunk.type === 'done')).toBe(false);
    expect(statuses.mock.calls.some(([, status]) => status.phase === 'complete')).toBe(false);
    expect(statuses).toHaveBeenCalledWith('project-a', expect.objectContaining({
      sessionId: session.id, requestId: 'request-stop', phase: 'idle',
    }));
    const terminalChunkCount = chunks.mock.calls.length;
    pending[0].emit({ type: 'text-delta', text: 'After settlement' });
    expect(chunks).toHaveBeenCalledTimes(terminalChunkCount);

    const next = send('request-after-stop', 'Allowed after stopping');
    pending[1].resolve(result('Next answer'));
    await next;
  });

  it.each(['AbortError', 'Error'])('treats a runner %s after explicit abort as cancellation without saving partial text', async name => {
    const errors = vi.fn();
    service.on('error', errors);
    const response = send('request-abort-error');
    pending[0].emit({ type: 'text-delta', text: 'Incomplete' });
    const cancellation = service.cancelMessage('project-a', session.id, 'request-abort-error');
    const error = new Error('Runner stopped');
    error.name = name;
    pending[0].reject(error);

    await expect(response).resolves.toMatchObject({ outcome: 'cancelled' });
    await expect(cancellation).resolves.toMatchObject({ cancelled: true });
    expect(errors).not.toHaveBeenCalled();
    expect(persisted().messages.map(message => message.role)).toEqual(['user']);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it('does not let stale or foreign cancellation identities stop the current request', async () => {
    await completeTurn('request-finished', 'First', 'First answer');
    const response = send('request-current', 'Second');
    await expect(service.cancelMessage('project-a', session.id, 'request-finished')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(service.cancelMessage('project-a', 'foreign-session', 'request-current')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(service.cancelMessage('project-b', session.id, 'request-current')).resolves.toMatchObject({ cancelled: false });

    expect(pending[1].config.abortSignal?.aborted).toBe(false);
    expect(service.getActiveRequest('project-a', session.id)?.requestId).toBe('request-current');
    pending[1].resolve(result('Second answer'));
    await response;
    await expect(service.cancelMessage('project-a', session.id, 'request-current')).resolves.toMatchObject({ cancelled: false });
  });

  it('keeps provider failures attributed to their originating request after session selection changes', async () => {
    const chunks = vi.fn();
    const statuses = vi.fn();
    const errors = vi.fn();
    service.on('stream-chunk', chunks);
    service.on('status', statuses);
    service.on('error', errors);
    const response = send('request-failed', 'Original question');
    const rejected = expect(response).rejects.toMatchObject({ code: 'request-failed' });
    const selected = service.createNewSession('project-a', projectPath);
    pending[0].reject(new Error('Provider unavailable'));
    await rejected;

    expect(errors).toHaveBeenCalledWith('project-a', expect.any(String), session.id, 'request-failed', 'request-failed');
    expect(errors.mock.calls[0][1]).not.toContain('Provider unavailable');
    expect(chunks).toHaveBeenCalledWith('project-a', expect.objectContaining({
      type: 'error', sessionId: session.id, requestId: 'request-failed',
    }));
    expect(statuses).toHaveBeenCalledWith('project-a', expect.objectContaining({
      phase: 'error', sessionId: session.id, requestId: 'request-failed',
    }));
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
    expect(persisted().messages.map(message => message.content)).toEqual(['Original question']);
    expect(storage.loadSessionById(projectPath, selected.id)?.messages).toEqual([]);
    expect(service.loadSession('project-a', projectPath)?.id).toBe(selected.id);
  });

  it('replaces only the latest assistant after successful regeneration and excludes it from model context', async () => {
    await completeTurn('request-first', 'Earlier question', 'Earlier answer');
    const original = await completeTurn('request-original', 'Latest question', 'Original answer');
    const before = persisted().messages;
    const response = regenerate('request-regenerate', original.id);

    expect(persisted().messages).toEqual(before);
    expect(service.loadSession('project-a', projectPath)?.messages).toEqual(before);
    expect(pending[2].config.message).toBe('Latest question');
    expect(pending[2].config.history).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
    ]);
    pending[2].emit({ type: 'text-delta', text: 'Replacement answer' });
    expect(persisted().messages).toEqual(before);
    pending[2].resolve(result('Replacement answer'));
    const completed = await response;
    const after = persisted().messages;

    expect(after).toHaveLength(4);
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(after[3]).toMatchObject({ role: 'assistant', content: 'Replacement answer' });
    expect(after[3].id).not.toBe(original.id);
    expect(completed).toEqual({
      sessionId: session.id, requestId: 'request-regenerate', outcome: 'complete', messageId: after[3].id,
    });
  });

  it('passes reattached images to regeneration without leaking its request payload into events or results', async () => {
    const original = await completeTurn('request-original', 'Describe this image', 'Original answer');
    const image = { id: 'image-1', filename: 'example.png', mimeType: 'image/png', size: 5, data: 'aW1hZ2U=' };
    const chunks = vi.fn();
    const statuses = vi.fn();
    service.on('stream-chunk', chunks);
    service.on('status', statuses);
    const response = service.regenerateMessage('project-a', projectPath, {
      sessionId: session.id, requestId: 'request-with-image', targetMessageId: original.id, images: [image],
    });

    expect(pending[1].config.images).toEqual([image]);
    pending[1].emit({ type: 'text-delta', text: 'Replacement answer' });
    pending[1].resolve(result('Replacement answer'));
    const completed = await response;
    expect(completed).toEqual({
      sessionId: session.id, requestId: 'request-with-image', outcome: 'complete',
      messageId: persisted().messages.at(-1)?.id,
    });
    for (const [, event] of [...chunks.mock.calls, ...statuses.mock.calls]) {
      expect(event).toMatchObject({ sessionId: session.id, requestId: 'request-with-image' });
      expect(event).not.toHaveProperty('images');
      expect(event).not.toHaveProperty('targetMessageId');
    }
  });

  it.each(['cancel', 'error'])('retains the original assistant when regeneration ends with %s', async outcome => {
    const original = await completeTurn('request-original', 'Question', 'Keep this answer');
    const before = persisted().messages;
    const response = regenerate('request-regenerate', original.id);
    pending[1].emit({ type: 'text-delta', text: 'Partial replacement' });
    if (outcome === 'cancel') {
      const cancellation = service.cancelMessage('project-a', session.id, 'request-regenerate');
      pending[1].resolve(result('Discard this answer'));
      await expect(response).resolves.toMatchObject({ outcome: 'cancelled' });
      await cancellation;
    } else {
      const rejected = expect(response).rejects.toMatchObject({ code: 'request-failed' });
      pending[1].reject(new Error('Regeneration failed'));
      await rejected;
    }

    expect(persisted().messages).toEqual(before);
    expect(service.loadSession('project-a', projectPath)?.messages).toEqual(before);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it('retries the unanswered latest user message without adding a duplicate user message', async () => {
    const failed = send('request-failed', 'Retry this question');
    const rejected = expect(failed).rejects.toMatchObject({ code: 'request-failed' });
    pending[0].reject(new Error('Temporary provider failure'));
    await rejected;
    const unanswered = persisted().messages[0];
    const response = regenerate('request-retry', unanswered.id);

    expect(persisted().messages).toEqual([unanswered]);
    expect(pending[1].config.message).toBe('Retry this question');
    expect(pending[1].config.history).toEqual([]);
    pending[1].resolve(result('Successful retry'));
    await response;
    expect(persisted().messages).toHaveLength(2);
    expect(persisted().messages[0]).toEqual(unanswered);
    expect(persisted().messages[1]).toMatchObject({ role: 'assistant', content: 'Successful retry' });
  });

  it.each(['cancel', 'error'])('keeps the unanswered user unchanged when retry ends with %s', async outcome => {
    const initial = send('request-stopped', 'Question to retry');
    const stop = service.cancelMessage('project-a', session.id, 'request-stopped');
    pending[0].resolve(result('Discard this reply'));
    await initial;
    await stop;
    const unanswered = persisted().messages[0];
    const retry = regenerate('request-retry', unanswered.id);
    pending[1].emit({ type: 'text-delta', text: 'Incomplete retry' });
    if (outcome === 'cancel') {
      const cancellation = service.cancelMessage('project-a', session.id, 'request-retry');
      pending[1].resolve(result('Discard this retry'));
      await expect(retry).resolves.toMatchObject({ outcome: 'cancelled' });
      await cancellation;
    } else {
      const rejected = expect(retry).rejects.toMatchObject({ code: 'request-failed' });
      pending[1].reject(new Error('Retry failed'));
      await rejected;
    }

    expect(persisted().messages).toEqual([unanswered]);
    expect(service.loadSession('project-a', projectPath)?.messages).toEqual([unanswered]);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it('rejects invalid and stale regeneration targets before starting or changing any runner', async () => {
    const earlierAssistant = await completeTurn('request-earlier', 'Earlier', 'Earlier answer');
    await completeTurn('request-latest', 'Latest', 'Latest answer');
    const before = persisted().messages;
    const queryCount = runQuery.mock.calls.length;

    for (const targetMessageId of ['missing-message', earlierAssistant.id, before[0].id]) {
      await expect(regenerate(`invalid-${targetMessageId}`, targetMessageId)).rejects.toThrow();
    }
    await expect(service.regenerateMessage('project-a', projectPath, {
      sessionId: 'missing-session', requestId: 'invalid-session', targetMessageId: before[3].id,
    })).rejects.toThrow();

    expect(runQuery).toHaveBeenCalledTimes(queryCount);
    expect(persisted().messages).toEqual(before);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it('rejects regeneration while the project is running and preserves the unanswered message', async () => {
    const response = send('request-original');
    const unanswered = persisted().messages[0];
    await expect(regenerate('request-overlap', unanswered.id)).rejects.toThrow();

    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(pending[0].config.abortSignal?.aborted).toBe(false);
    expect(persisted().messages).toEqual([unanswered]);
    pending[0].resolve(result('Original answer'));
    await response;
  });

  it('honors cancellation requested synchronously from the first thinking status', async () => {
    let cancellation: ReturnType<InsightsService['cancelMessage']> | undefined;
    service.on('status', (_projectId, status) => {
      if (status.phase === 'thinking') {
        cancellation = service.cancelMessage('project-a', session.id, 'request-thinking-stop');
      }
    });
    const response = send('request-thinking-stop');

    await expect(response).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(cancellation).toBeDefined();
    await expect(cancellation).resolves.toMatchObject({ cancelled: true });
    expect(runQuery).not.toHaveBeenCalled();
    expect(persisted().messages.map(message => message.role)).toEqual(['user']);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it('suppresses the triggering chunk when a streaming status listener cancels synchronously', async () => {
    const chunks = vi.fn();
    let cancellation: ReturnType<InsightsService['cancelMessage']> | undefined;
    service.on('stream-chunk', chunks);
    service.on('status', (_projectId, status) => {
      if (status.phase === 'streaming') {
        cancellation = service.cancelMessage('project-a', session.id, 'request-streaming-stop');
      }
    });
    const response = send('request-streaming-stop');
    pending[0].emit({ type: 'text-delta', text: 'Must be suppressed' });

    expect(cancellation).toBeDefined();
    expect(chunks).not.toHaveBeenCalled();
    expect(pending[0].config.abortSignal?.aborted).toBe(true);
    pending[0].resolve(result('Must be discarded'));
    await expect(response).resolves.toMatchObject({ outcome: 'cancelled' });
    await cancellation;
    expect(persisted().messages.map(message => message.role)).toEqual(['user']);
  });

  it('does not save an assistant if a task suggestion listener cancels after runner success', async () => {
    const chunks = vi.fn();
    let cancellation: ReturnType<InsightsService['cancelMessage']> | undefined;
    service.on('stream-chunk', chunks);
    service.on('stream-chunk', (_projectId, chunk) => {
      if (chunk.type === 'task_suggestion') {
        cancellation = service.cancelMessage('project-a', session.id, 'request-suggestion-stop');
      }
    });
    const response = send('request-suggestion-stop');
    pending[0].resolve({
      ...result('Suggested task'),
      taskSuggestion: {
        title: 'Add validation', description: 'Validate incoming data',
        metadata: { category: 'feature', complexity: 'simple', impact: 'low' },
      },
    });

    await expect(response).resolves.toMatchObject({ outcome: 'cancelled' });
    expect(cancellation).toBeDefined();
    await cancellation;
    expect(chunks.mock.calls.map(([, chunk]) => chunk.type)).toEqual(['task_suggestion']);
    expect(persisted().messages.map(message => message.role)).toEqual(['user']);
  });

  it('still honors cancellation between runner settlement and service finalization', async () => {
    const response = send('request-finalize-stop');
    pending[0].resolve(result('Runner has returned'));
    // The executor finishes in the first microtask; service persistence is queued after this continuation.
    await Promise.resolve();
    expect(service.getActiveRequest('project-a', session.id)?.requestId).toBe('request-finalize-stop');
    const cancellation = service.cancelMessage('project-a', session.id, 'request-finalize-stop');

    await expect(response).resolves.toMatchObject({ outcome: 'cancelled' });
    await expect(cancellation).resolves.toMatchObject({ cancelled: true });
    expect(persisted().messages.map(message => message.role)).toEqual(['user']);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it('reports no cancellation after the assistant is committed while still waiting for final lock release', async () => {
    let cancellation: ReturnType<InsightsService['cancelMessage']> | undefined;
    service.on('session-updated', () => {
      expect(service.getActiveRequest('project-a', session.id)?.requestId).toBe('request-committed');
      cancellation = service.cancelMessage('project-a', session.id, 'request-committed');
    });
    const response = send('request-committed');
    pending[0].resolve(result('Committed answer'));

    await expect(response).resolves.toMatchObject({ outcome: 'complete' });
    expect(cancellation).toBeDefined();
    await expect(cancellation).resolves.toMatchObject({ cancelled: false });
    expect(persisted().messages.at(-1)?.content).toBe('Committed answer');
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });

  it.each(['send', 'regenerate'])('does not publish success or change cached history when %s persistence fails', async operation => {
    const original = operation === 'regenerate'
      ? await completeTurn('request-original', 'Question', 'Original answer')
      : undefined;
    const chunks = vi.fn();
    const statuses = vi.fn();
    const updated = vi.fn();
    service.on('stream-chunk', chunks);
    service.on('status', statuses);
    service.on('session-updated', updated);
    const response = original ? regenerate('request-save-failed', original.id) : send('request-save-failed');
    const before = persisted().messages;
    const rejected = expect(response).rejects.toMatchObject({ code: 'persistence-failed' });
    vi.spyOn(SessionStorage.prototype, 'saveSession').mockImplementationOnce(() => {
      throw new Error('Disk unavailable');
    });
    pending.at(-1)?.resolve(result('Must not be published'));
    await rejected;

    expect(updated).not.toHaveBeenCalled();
    expect(chunks.mock.calls.some(([, chunk]) => chunk.type === 'done')).toBe(false);
    expect(statuses.mock.calls.some(([, status]) => status.phase === 'complete')).toBe(false);
    expect(persisted().messages).toEqual(before);
    expect(service.loadSession('project-a', projectPath)?.messages).toEqual(before);
    expect(service.getActiveRequest('project-a', session.id)).toBeNull();
  });
});
