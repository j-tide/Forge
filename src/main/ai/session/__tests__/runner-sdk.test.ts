import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { z } from 'zod';

import { runAgentSession } from '../runner';
import type { SessionConfig } from '../types';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function modelWithParts(parts: LanguageModelV3StreamPart[], onRequest?: () => void) {
  return new MockLanguageModelV3({
    doStream: async () => {
      onRequest?.();
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  });
}

function config(model: SessionConfig['model'], abortSignal: AbortSignal): SessionConfig {
  return {
    agentType: 'coder', model, systemPrompt: 'Offline SDK regression',
    initialMessages: [{ role: 'user', content: 'Run the local test tool' }],
    toolContext: {} as SessionConfig['toolContext'], maxSteps: 10,
    specDir: '/offline-spec', projectDir: '/offline-project', abortSignal,
  };
}

describe('runAgentSession with real SDK tool execution', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => { /* Expected fixture failures. */ }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('aborts the failed attempt and waits for an in-flight tool before returning a fatal error', async () => {
    const releaseTool = gate();
    const errorSeen = gate();
    const controller = new AbortController();
    const fatalError = new Error('400 Bad Request: offline failure');
    const timeline: string[] = [];
    let toolSignal: AbortSignal | undefined;
    let returned = false;
    let requests = 0;
    const model = modelWithParts([
      { type: 'tool-call', toolCallId: 'slow-1', toolName: 'Slow', input: '{}' },
      { type: 'error', error: fatalError },
      { type: 'finish', finishReason: { unified: 'error', raw: undefined }, usage },
    ], () => { requests++; });
    const pending = runAgentSession(config(model, controller.signal), {
      tools: {
        Slow: tool({ inputSchema: z.object({}), execute: async (_input, { abortSignal }) => {
          toolSignal = abortSignal;
          timeline.push('tool-started');
          // Context-bound tools may ignore the SDK signal; their work must still settle.
          await releaseTool.promise;
          timeline.push('tool-finished');
          return 'done';
        } }),
      },
      onEvent: (event) => { if (event.type === 'error') errorSeen.resolve(); },
    }).then((result) => { returned = true; timeline.push('session-returned'); return result; });

    try {
      await errorSeen.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(timeline).toEqual(['tool-started']);
      expect(returned).toBe(false);
      expect(toolSignal?.aborted).toBe(true);
      expect(controller.signal.aborted).toBe(false);
    } finally {
      releaseTool.resolve();
      await pending;
    }

    const result = await pending;
    expect(result.outcome).toBe('error');
    expect(result.error?.cause).toBe(fatalError);
    expect(timeline).toEqual(['tool-started', 'tool-finished', 'session-returned']);
    expect(requests).toBe(1);
  });

  it('waits for prior tool work before refreshing authentication and starting the retry', async () => {
    const releaseTool = gate();
    const errorSeen = gate();
    const controller = new AbortController();
    const timeline: string[] = [];
    const failedModel = modelWithParts([
      { type: 'tool-call', toolCallId: 'slow-1', toolName: 'Slow', input: '{}' },
      { type: 'error', error: new Error('401 Unauthorized: offline failure') },
      { type: 'finish', finishReason: { unified: 'error', raw: undefined }, usage },
    ]);
    const refreshedModel = modelWithParts([
      { type: 'text-start', id: 'response' },
      { type: 'text-delta', id: 'response', delta: 'Recovered' },
      { type: 'text-end', id: 'response' },
      { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage },
    ], () => { timeline.push('retry-started'); });
    const pending = runAgentSession(config(failedModel, controller.signal), {
      tools: {
        Slow: tool({ inputSchema: z.object({}), execute: async () => {
          timeline.push('tool-started');
          await releaseTool.promise;
          timeline.push('tool-finished');
          return 'done';
        } }),
      },
      onEvent: (event) => { if (event.type === 'error') errorSeen.resolve(); },
      onAuthRefresh: async () => { timeline.push('auth-refreshed'); return 'offline-token'; },
      onModelRefresh: () => refreshedModel,
    });

    try {
      await errorSeen.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(timeline).toEqual(['tool-started']);
    } finally {
      releaseTool.resolve();
      await pending;
    }

    const result = await pending;
    expect(result.outcome).toBe('completed');
    expect(result.messages.at(-1)?.content).toBe('Recovered');
    expect(controller.signal.aborted).toBe(false);
    expect(timeline).toEqual(['tool-started', 'tool-finished', 'auth-refreshed', 'retry-started']);
  });

  it('waits for an in-flight streaming tool through its final output after a fatal error', async () => {
    const releaseTool = gate();
    const preliminarySeen = gate();
    const errorSeen = gate();
    const timeline: string[] = [];
    const model = new MockLanguageModelV3({ doStream: async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({ async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'tool-call', toolCallId: 'stream-1', toolName: 'Stream', input: '{}' });
        await preliminarySeen.promise;
        controller.enqueue({ type: 'error', error: new Error('400 Bad Request: offline failure') });
        controller.enqueue({ type: 'finish', finishReason: { unified: 'error', raw: undefined }, usage });
        controller.close();
      } }),
    }) });
    const pending = runAgentSession(config(model, new AbortController().signal), {
      tools: { Stream: tool({ inputSchema: z.object({}), execute: async function* () {
        timeline.push('tool-started');
        yield 'progress';
        await releaseTool.promise;
        timeline.push('tool-finished');
        yield 'done';
      } }) },
      onEvent: (event) => {
        if (event.type === 'tool-result' && event.result === 'progress') preliminarySeen.resolve();
        if (event.type === 'error') errorSeen.resolve();
      },
    }).then((result) => { timeline.push('session-returned'); return result; });

    try {
      await errorSeen.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(timeline).toEqual(['tool-started']);
    } finally {
      releaseTool.resolve();
      await pending;
    }
    expect((await pending).outcome).toBe('error');
    expect(timeline).toEqual(['tool-started', 'tool-finished', 'session-returned']);
  });

  it('preserves streaming tool outputs and keeps a successful attempt signal live', async () => {
    const outputs: unknown[] = [];
    let toolSignal: AbortSignal | undefined;
    const model = modelWithParts([
      { type: 'tool-call', toolCallId: 'stream-1', toolName: 'Stream', input: '{}' },
      { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage },
    ]);
    const result = await runAgentSession({ ...config(model, new AbortController().signal), maxSteps: 1 }, {
      tools: { Stream: tool({ inputSchema: z.object({}), execute: async function* (_input, { abortSignal }) {
        toolSignal = abortSignal;
        yield 'progress';
        yield 'done';
      } }) },
      onEvent: (event) => { if (event.type === 'tool-result') outputs.push(event.result); },
    });

    expect(result.outcome).toBe('max_steps');
    expect(outputs).toEqual(['progress', 'done', 'done']);
    expect(toolSignal?.aborted).toBe(false);
  });

  it('skips auth refresh when the user cancels while failed tool work is settling', async () => {
    const releaseTool = gate();
    const errorSeen = gate();
    const controller = new AbortController();
    const timeline: string[] = [];
    const model = modelWithParts([
      { type: 'tool-call', toolCallId: 'slow-1', toolName: 'Slow', input: '{}' },
      { type: 'error', error: new Error('401 Unauthorized: offline failure') },
      { type: 'finish', finishReason: { unified: 'error', raw: undefined }, usage },
    ]);
    const pending = runAgentSession(config(model, controller.signal), {
      tools: { Slow: tool({ inputSchema: z.object({}), execute: async () => {
        timeline.push('tool-started');
        await releaseTool.promise;
        timeline.push('tool-finished');
        return 'done';
      } }) },
      onEvent: (event) => { if (event.type === 'error') errorSeen.resolve(); },
      onAuthRefresh: async () => { timeline.push('auth-refreshed'); return 'offline-token'; },
    });

    await errorSeen.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort('user cancelled');
    releaseTool.resolve();

    expect((await pending).outcome).toBe('cancelled');
    expect(timeline).toEqual(['tool-started', 'tool-finished']);
  });
});
