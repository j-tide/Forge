import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SessionConfig, StreamEvent } from '../types';

// =============================================================================
// Mock AI SDK
// =============================================================================

// Create controllable mock for streamText
const mockStreamText = vi.fn();
vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', count: n }),
}));

// Import after mocking
import { runAgentSession } from '../runner';
import type { RunnerOptions } from '../runner';

// =============================================================================
// Helpers
// =============================================================================

function createMockConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    agentType: 'coder',
    model: {} as SessionConfig['model'],
    systemPrompt: 'You are a helpful assistant.',
    initialMessages: [{ role: 'user', content: 'Hello' }],
    toolContext: {} as SessionConfig['toolContext'],
    maxSteps: 10,
    specDir: '/specs/001',
    projectDir: '/project',
    ...overrides,
  };
}

/**
 * Create a mock streamText result that yields the given parts.
 */
function createMockStreamResult(
  parts: Array<Record<string, unknown>>,
  options?: { text?: string; totalUsage?: { inputTokens: number; outputTokens: number } },
) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    text: Promise.resolve(options?.text ?? ''),
    totalUsage: Promise.resolve(
      options?.totalUsage ?? { inputTokens: 100, outputTokens: 50 },
    ),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('runAgentSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Basic completion
  // ===========================================================================

  it('should return completed result for simple session', async () => {
    mockStreamText.mockReturnValue(
      createMockStreamResult(
        [
          { type: 'text-delta', id: 'text-1', delta: 'Hello world' },
          {
            type: 'finish-step',
            usage: { inputTokens: 50, outputTokens: 25 },
          },
        ],
        { text: 'Hello world', totalUsage: { inputTokens: 50, outputTokens: 25 } },
      ),
    );

    const result = await runAgentSession(createMockConfig());

    expect(result.outcome).toBe('completed');
    expect(result.stepsExecuted).toBe(1);
    expect(result.usage.promptTokens).toBe(50);
    expect(result.usage.completionTokens).toBe(25);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.messages).toHaveLength(2); // initial + assistant response
  });

  // ===========================================================================
  // Max steps outcome
  // ===========================================================================

  it('should return max_steps when steps reach maxSteps', async () => {
    const steps = Array.from({ length: 10 }, (_) => ({
      type: 'finish-step',
      usage: { inputTokens: 10, outputTokens: 5 },
    }));

    mockStreamText.mockReturnValue(
      createMockStreamResult(steps, {
        text: 'done',
        totalUsage: { inputTokens: 100, outputTokens: 50 },
      }),
    );

    const result = await runAgentSession(createMockConfig({ maxSteps: 10 }));
    expect(result.outcome).toBe('max_steps');
    expect(result.stepsExecuted).toBe(10);
  });

  // ===========================================================================
  // Multi-step with tool calls
  // ===========================================================================

  it('should track tool calls across multiple steps', async () => {
    mockStreamText.mockReturnValue(
      createMockStreamResult(
        [
          { type: 'tool-call', toolName: 'Bash', toolCallId: 'c1', input: { command: 'ls' } },
          { type: 'tool-result', toolCallId: 'c1', toolName: 'Bash', input: { command: 'ls' }, output: 'file.ts' },
          {
            type: 'finish-step',
            usage: { promptTokens: 50, completionTokens: 25 },
          },
          { type: 'tool-call', toolName: 'Read', toolCallId: 'c2', input: { file_path: 'file.ts' } },
          { type: 'tool-result', toolCallId: 'c2', toolName: 'Read', input: { file_path: 'file.ts' }, output: 'content' },
          {
            type: 'finish-step',
            usage: { promptTokens: 50, completionTokens: 25 },
          },
        ],
        { text: 'Done', totalUsage: { inputTokens: 100, outputTokens: 50 } },
      ),
    );

    const result = await runAgentSession(createMockConfig());

    expect(result.outcome).toBe('completed');
    expect(result.stepsExecuted).toBe(2);
    expect(result.toolCallCount).toBe(2);
  });

  // ===========================================================================
  // Event callback
  // ===========================================================================

  it('should forward events to onEvent callback', async () => {
    const events: StreamEvent[] = [];

    mockStreamText.mockReturnValue(
      createMockStreamResult(
        [
          { type: 'text-delta', id: 'text-1', delta: 'hi' },
          {
            type: 'finish-step',
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
        { text: 'hi', totalUsage: { inputTokens: 10, outputTokens: 5 } },
      ),
    );

    await runAgentSession(createMockConfig(), {
      onEvent: (e) => events.push(e),
    });

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'text-delta')).toBe(true);
    expect(events.some((e) => e.type === 'step-finish')).toBe(true);
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================

  it('should classify rate limit errors', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('429 Too Many Requests');
    });

    const result = await runAgentSession(createMockConfig());

    expect(result.outcome).toBe('rate_limited');
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('rate_limited');
    expect(result.stepsExecuted).toBe(0);
  });

  it('should classify generic errors', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('Network error');
    });

    const result = await runAgentSession(createMockConfig());

    expect(result.outcome).toBe('error');
    expect(result.error!.code).toBe('generic_error');
  });

  it.each([
    ['400 Bad Request: invalid messages', 'error', 'generic_error', false],
    ['400 too many concurrent tools', 'error', 'concurrency_error', true],
    ['401 Unauthorized', 'auth_failure', 'auth_failure', false],
    ['429 Too Many Requests', 'rate_limited', 'rate_limited', true],
    ['429 insufficient balance, please recharge', 'error', 'billing_error', false],
  ])('should classify an error part when the stream closes normally: %s', async (
    message, outcome, code, retryable,
  ) => {
    const error = new Error(message);
    const events: StreamEvent[] = [];
    mockStreamText.mockReturnValue(createMockStreamResult([
      { type: 'error', error },
    ]));

    const result = await runAgentSession(createMockConfig(), {
      onEvent: (event) => events.push(event),
    });

    expect(result.outcome).toBe(outcome);
    expect(result.error).toMatchObject({ code, retryable, cause: error });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error', error: expect.objectContaining({ code }),
    }));
  });

  it('should fail on an error part even after completed steps reach maxSteps', async () => {
    mockStreamText.mockReturnValue(createMockStreamResult([
      { type: 'finish-step', usage: { promptTokens: 10, completionTokens: 5 } },
      { type: 'error', error: new Error('400 Bad Request') },
    ]));

    const result = await runAgentSession(createMockConfig({ maxSteps: 1 }));

    expect(result.outcome).toBe('error');
    expect(result.error?.code).toBe('generic_error');
  });

  it('should fail when the real SDK closes after an offline HTTP 400 transport error', async () => {
    const { streamText: realStreamText } = await vi.importActual<typeof import('ai')>('ai');
    const { createOpenAI } = await vi.importActual<typeof import('@ai-sdk/openai')>('@ai-sdk/openai');
    const transport = vi.fn(async () => new Response(JSON.stringify({
      error: { message: '400 Bad Request: fixture failure', type: 'invalid_request_error' },
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    const provider = createOpenAI({
      apiKey: 'fixture-key', baseURL: 'https://fixture.invalid/v1', fetch: transport,
    });
    mockStreamText.mockImplementationOnce(realStreamText);

    const result = await runAgentSession(createMockConfig({ model: provider('fixture-model') }));

    expect(result.outcome).toBe('error');
    expect(result.error).toMatchObject({
      code: 'generic_error', cause: { statusCode: 400 },
    });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('should complete after the model recovers from a tool error', async () => {
    const events: StreamEvent[] = [];
    mockStreamText.mockReturnValue(createMockStreamResult([
      { type: 'tool-call', toolName: 'Bash', toolCallId: 'c1', input: {} },
      { type: 'tool-error', toolName: 'Bash', toolCallId: 'c1', error: new Error('command not found') },
      { type: 'finish-step', usage: { promptTokens: 10, completionTokens: 5 } },
      { type: 'tool-call', toolName: 'Bash', toolCallId: 'c2', input: {} },
      { type: 'tool-result', toolName: 'Bash', toolCallId: 'c2', output: 'ok' },
      { type: 'finish-step', usage: { promptTokens: 10, completionTokens: 5 } },
    ], { text: 'Recovered' }));

    const result = await runAgentSession(createMockConfig(), {
      onEvent: (event) => events.push(event),
    });

    expect(result.outcome).toBe('completed');
    expect(result.error).toBeUndefined();
    expect(result.toolCallCount).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'error', error: expect.objectContaining({ code: 'tool_execution_error' }),
    }));
  });

  // ===========================================================================
  // Auth retry
  // ===========================================================================

  it('should retry on auth failure when onAuthRefresh succeeds', async () => {
    let callCount = 0;
    mockStreamText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('401 Unauthorized');
      }
      return createMockStreamResult(
        [
          { type: 'text-delta', id: 'text-1', delta: 'ok' },
          {
            type: 'finish-step',
            usage: { inputTokens: 10, outputTokens: 5 },
          },
        ],
        { text: 'ok', totalUsage: { inputTokens: 10, outputTokens: 5 } },
      );
    });

    const onAuthRefresh = vi.fn().mockResolvedValue('new-token');

    const result = await runAgentSession(createMockConfig(), { onAuthRefresh });

    expect(onAuthRefresh).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('completed');
  });

  it('should return auth_failure when onAuthRefresh returns null', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('401 Unauthorized');
    });

    const result = await runAgentSession(createMockConfig(), {
      onAuthRefresh: vi.fn().mockResolvedValue(null),
    });

    expect(result.outcome).toBe('auth_failure');
  });

  it('should return auth_failure when no onAuthRefresh provided', async () => {
    mockStreamText.mockImplementation(() => {
      throw new Error('401 Unauthorized');
    });

    const result = await runAgentSession(createMockConfig());

    expect(result.outcome).toBe('auth_failure');
  });

  it('should refresh the model and retry a 401 error part', async () => {
    mockStreamText
      .mockReturnValueOnce(createMockStreamResult([
        { type: 'error', error: new Error('401 Unauthorized') },
      ]))
      .mockReturnValueOnce(createMockStreamResult([
        { type: 'finish-step', usage: { promptTokens: 10, completionTokens: 5 } },
      ], { text: 'ok' }));
    const refreshedModel = { modelId: 'refreshed-model' } as SessionConfig['model'];
    const onAuthRefresh = vi.fn().mockResolvedValue('new-token');
    const onModelRefresh = vi.fn().mockReturnValue(refreshedModel);

    const result = await runAgentSession(createMockConfig(), {
      onAuthRefresh, onModelRefresh,
    });

    expect(result.outcome).toBe('completed');
    expect(result.messages.at(-1)?.content).toBe('ok');
    expect(onAuthRefresh).toHaveBeenCalledOnce();
    expect(onModelRefresh).toHaveBeenCalledWith('new-token');
    expect(mockStreamText.mock.calls[1][0].model).toBe(refreshedModel);
  });

  it('should stop retrying when a refreshed session also emits a 401 error part', async () => {
    mockStreamText.mockImplementation(() => createMockStreamResult([
      { type: 'error', error: new Error('401 Unauthorized') },
    ]));
    const onAuthRefresh = vi.fn().mockResolvedValue('new-token');

    const result = await runAgentSession(createMockConfig(), { onAuthRefresh });

    expect(result.outcome).toBe('auth_failure');
    expect(onAuthRefresh).toHaveBeenCalledOnce();
    expect(mockStreamText).toHaveBeenCalledTimes(2);
  });

  it('should offer account switching for a 429 error part', async () => {
    mockStreamText.mockReturnValue(createMockStreamResult([
      { type: 'error', error: new Error('429 Too Many Requests') },
    ]));
    const onAccountSwitch = vi.fn().mockResolvedValue(null);

    const result = await runAgentSession(createMockConfig(), {
      currentAccountId: 'account-1', onAccountSwitch,
    });

    expect(result.outcome).toBe('rate_limited');
    expect(onAccountSwitch).toHaveBeenCalledWith('account-1', expect.objectContaining({
      code: 'rate_limited', retryable: true,
    }));
  });

  // ===========================================================================
  // Cancellation
  // ===========================================================================

  it('should return cancelled when abortSignal fires during stream', async () => {
    const controller = new AbortController();

    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 'text-1', delta: 'start' };
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      })(),
      text: Promise.resolve(''),
      totalUsage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
    });

    const result = await runAgentSession(
      createMockConfig({ abortSignal: controller.signal }),
    );

    expect(result.outcome).toBe('cancelled');
  });

  it('should return cancelled when abort closes the stream without throwing', async () => {
    const controller = new AbortController();
    mockStreamText.mockReturnValue({
      ...createMockStreamResult([]),
      fullStream: (async function* () {
        yield { type: 'finish-step', usage: { promptTokens: 10, completionTokens: 5 } };
        controller.abort('user stopped the session');
      })(),
    });

    const result = await runAgentSession(createMockConfig({
      abortSignal: controller.signal, maxSteps: 1,
    }));

    expect(result.outcome).toBe('cancelled');
    expect(result.error).toMatchObject({ code: 'aborted', retryable: false });
    expect(result.stepsExecuted).toBe(1);
    expect(result.usage.totalTokens).toBe(15);
  });

  it('should not start a stream for an already aborted session', async () => {
    const controller = new AbortController();
    controller.abort('user stopped the session');
    mockStreamText.mockReturnValue(createMockStreamResult([]));

    const result = await runAgentSession(createMockConfig({ abortSignal: controller.signal }));

    expect(result.outcome).toBe('cancelled');
    expect(result.error).toMatchObject({ code: 'aborted', retryable: false });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it.each([false, true])('should preserve context-window outcome when abort throws: %s', async (throws) => {
    mockStreamText.mockImplementation((options) => ({
      ...createMockStreamResult([]),
      fullStream: (async function* () {
        yield { type: 'finish-step', usage: { promptTokens: 91, completionTokens: 5 } };
        await options.prepareStep({ stepNumber: 1 });
        if (throws) throw options.abortSignal.reason;
      })(),
    }));

    const result = await runAgentSession(createMockConfig({ contextWindowLimit: 100 }));

    expect(result.outcome).toBe('context_window');
    expect(result.stepsExecuted).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it.each([false, true])('should preserve inactivity timeout when abort throws: %s', async (throws) => {
    vi.useFakeTimers();
    try {
      mockStreamText.mockImplementation((options) => ({
        ...createMockStreamResult([]),
        fullStream: (async function* () {
          yield { type: 'finish-step', usage: { promptTokens: 10, completionTokens: 5 } };
          await new Promise<void>((resolve) => {
            options.abortSignal.addEventListener('abort', () => resolve(), { once: true });
          });
          if (throws) throw options.abortSignal.reason;
        })(),
      }));

      const pending = runAgentSession(createMockConfig());
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pending;

      expect(result.outcome).toBe('error');
      expect(result.error).toMatchObject({ code: 'stream_timeout', retryable: true });
      expect(result.stepsExecuted).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // ===========================================================================
  // streamText configuration
  // ===========================================================================

  it('should pass tools and system prompt to streamText', async () => {
    mockStreamText.mockReturnValue(
      createMockStreamResult([], { text: '', totalUsage: { inputTokens: 0, outputTokens: 0 } }),
    );

    const tools = { Bash: {} as any };
    await runAgentSession(createMockConfig({ systemPrompt: 'Be helpful' }), { tools });

    expect(mockStreamText).toHaveBeenCalledTimes(1);
    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.system).toBe('Be helpful');
    expect(callArgs.tools).toEqual(tools);
  });

  it('should use default maxSteps of 500 when not specified', async () => {
    mockStreamText.mockReturnValue(
      createMockStreamResult([], { text: '', totalUsage: { inputTokens: 0, outputTokens: 0 } }),
    );

    const config = createMockConfig();
    // @ts-expect-error - testing undefined maxSteps behavior
    delete config.maxSteps;

    await runAgentSession(config);

    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.stopWhen).toEqual({ type: 'stepCount', count: 500 });
  });
});
