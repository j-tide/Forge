import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be declared before any imports that use them
// =============================================================================

const mockStreamText = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  stepCountIs: (n: number) => ({ type: 'stepCount', count: n }),
}));

const mockCreateSimpleClient = vi.fn();

vi.mock('../../client/factory', () => ({
  createSimpleClient: (...args: unknown[]) => mockCreateSimpleClient(...args),
}));

// Filesystem mocks — project context files are absent by default
const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn().mockReturnValue([]);

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
}));

// Mock tool registry
vi.mock('../../tools/build-registry', () => ({
  buildToolRegistry: () => ({
    getToolsForAgent: vi.fn().mockReturnValue({}),
  }),
}));

// json-repair is used for safeParseJson in the insights runner
vi.mock('../../../utils/json-repair', () => ({
  safeParseJson: (text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
}));

// parseLLMJson is used for task suggestion extraction
vi.mock('../../schema/structured-output', () => ({
  parseLLMJson: vi.fn().mockReturnValue(null),
}));

vi.mock('../../schema/insight-extractor', () => ({
  TaskSuggestionSchema: {},
}));

// =============================================================================
// Import after mocking
// =============================================================================

import { runInsightsQuery } from '../insights';
import type { InsightsConfig, InsightsStreamEvent } from '../insights';
import { parseLLMJson } from '../../schema/structured-output';
import type { SimpleClientResult } from '../../client/types';
import type { ImageAttachment } from '../../../../shared/types/task';
import type { Tool as AITool } from 'ai';

// =============================================================================
// Helpers
// =============================================================================

const fakeModel = { modelId: 'claude-sonnet-4-6', provider: 'anthropic.messages' };

function makeMockClient(overrides: Partial<SimpleClientResult> = {}) {
  return {
    model: fakeModel,
    resolvedModelId: fakeModel.modelId,
    thinkingLevel: 'medium',
    systemPrompt: 'You are an AI assistant.',
    tools: {},
    maxSteps: 30,
    ...overrides,
  };
}

function modelClient(modelId: string, provider: string, overrides: Partial<SimpleClientResult> = {}) {
  return makeMockClient({
    model: { modelId, provider } as SimpleClientResult['model'],
    resolvedModelId: modelId,
    ...overrides,
  });
}

const fixtureImage: ImageAttachment = {
  id: 'fixture-image', filename: 'fixture.png', mimeType: 'image/png', size: 1, data: 'aQ==',
};

function makeStream(parts: Array<Record<string, unknown>>) {
  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
  };
}

function baseConfig(overrides: Partial<InsightsConfig> = {}): InsightsConfig {
  return {
    projectDir: '/project',
    message: 'How does authentication work?',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('runInsightsQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSimpleClient.mockResolvedValue(makeMockClient());
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([]);
    vi.mocked(parseLLMJson).mockReturnValue(null);
  });

  // ---------------------------------------------------------------------------
  // Successful run — no streaming events needed from caller
  // ---------------------------------------------------------------------------

  it('returns response text accumulated from stream', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'text-delta', text: 'Authentication uses JWT tokens.' },
        { type: 'text-delta', text: ' Tokens expire after 1 hour.' },
      ]),
    );

    const result = await runInsightsQuery(baseConfig());

    expect(result.text).toBe('Authentication uses JWT tokens. Tokens expire after 1 hour.');
    expect(result.taskSuggestion).toBeNull();
    expect(result.toolCalls).toEqual([]);
  });

  it('returns empty text and no task suggestion when stream is empty', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    const result = await runInsightsQuery(baseConfig());

    expect(result.text).toBe('');
    expect(result.taskSuggestion).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Task suggestion extraction
  // ---------------------------------------------------------------------------

  it('extracts task suggestion from response text when marker present', async () => {
    const suggestion = {
      title: 'Add rate limiting',
      description: 'Implement per-user rate limiting on auth endpoints',
      metadata: { category: 'security', complexity: 'medium', impact: 'high' },
    };

    mockStreamText.mockReturnValue(
      makeStream([
        {
          type: 'text-delta',
          text: `Here is my suggestion.\n__TASK_SUGGESTION__:${JSON.stringify(suggestion)}\n`,
        },
      ]),
    );

    vi.mocked(parseLLMJson).mockReturnValueOnce(suggestion as unknown as ReturnType<typeof parseLLMJson>);

    const result = await runInsightsQuery(baseConfig());

    expect(result.taskSuggestion).not.toBeNull();
    expect(result.taskSuggestion?.title).toBe('Add rate limiting');
    expect(result.taskSuggestion?.metadata.category).toBe('security');
  });

  it('returns null taskSuggestion when no marker in response', async () => {
    mockStreamText.mockReturnValue(
      makeStream([{ type: 'text-delta', text: 'No suggestions here.' }]),
    );

    const result = await runInsightsQuery(baseConfig());

    expect(result.taskSuggestion).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Tool call tracking
  // ---------------------------------------------------------------------------

  it('tracks tool calls in result.toolCalls', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'tool-call', toolName: 'Read', toolCallId: 'c1', input: { file_path: 'src/auth.ts' } },
        { type: 'tool-result', toolCallId: 'c1', toolName: 'Read', output: 'file content' },
        { type: 'tool-call', toolName: 'Glob', toolCallId: 'c2', input: { pattern: '**/*.ts' } },
        { type: 'tool-result', toolCallId: 'c2', toolName: 'Glob', output: 'src/auth.ts' },
      ]),
    );

    const result = await runInsightsQuery(baseConfig());

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].name).toBe('Read');
    expect(result.toolCalls[1].name).toBe('Glob');
  });

  it('extracts file_path from Read tool call input', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        {
          type: 'tool-call',
          toolName: 'Read',
          toolCallId: 'c1',
          input: { file_path: 'src/auth.ts' },
        },
      ]),
    );

    const result = await runInsightsQuery(baseConfig());

    expect(result.toolCalls[0].input).toBe('src/auth.ts');
  });

  it('extracts pattern from Grep/Glob tool call input', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        {
          type: 'tool-call',
          toolName: 'Grep',
          toolCallId: 'c1',
          input: { pattern: 'useAuth' },
        },
      ]),
    );

    const result = await runInsightsQuery(baseConfig());

    expect(result.toolCalls[0].input).toBe('pattern: useAuth');
  });

  // ---------------------------------------------------------------------------
  // Stream callbacks
  // ---------------------------------------------------------------------------

  it('forwards text-delta events to onStream callback', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'text-delta', text: 'chunk1' },
        { type: 'text-delta', text: 'chunk2' },
      ]),
    );

    const events: InsightsStreamEvent[] = [];
    await runInsightsQuery(baseConfig(), (e) => events.push(e));

    const textEvents = events.filter((e) => e.type === 'text-delta');
    expect(textEvents).toHaveLength(2);
  });

  it('forwards tool-start events for tool-call stream parts', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'tool-call', toolName: 'Grep', toolCallId: 'c1', input: { pattern: 'login' } },
      ]),
    );

    const events: InsightsStreamEvent[] = [];
    await runInsightsQuery(baseConfig(), (e) => events.push(e));

    const toolStartEvents = events.filter((e) => e.type === 'tool-start');
    expect(toolStartEvents).toHaveLength(1);
    expect((toolStartEvents[0] as { type: 'tool-start'; name: string }).name).toBe('Grep');
  });

  it('forwards tool-end events for tool-result stream parts', async () => {
    mockStreamText.mockReturnValue(
      makeStream([
        { type: 'tool-result', toolCallId: 'c1', toolName: 'Read', output: 'content' },
      ]),
    );

    const events: InsightsStreamEvent[] = [];
    await runInsightsQuery(baseConfig(), (e) => events.push(e));

    const toolEndEvents = events.filter((e) => e.type === 'tool-end');
    expect(toolEndEvents).toHaveLength(1);
  });

  it('rejects error stream parts so failure cannot become an empty successful reply', async () => {
    mockStreamText.mockReturnValue(
      makeStream([{ type: 'error', error: new Error('tool failed') }]),
    );

    const events: InsightsStreamEvent[] = [];
    await expect(runInsightsQuery(baseConfig(), (e) => events.push(e))).rejects.toThrow('tool failed');

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { type: 'error'; error: string }).error).toBe('tool failed');
  });

  // ---------------------------------------------------------------------------
  // Error propagation
  // ---------------------------------------------------------------------------

  it('rethrows when streamText iteration throws', async () => {
    mockStreamText.mockReturnValue({
      // biome-ignore lint/correctness/useYield: intentionally throwing before yield to test error path
      fullStream: (async function* () {
        throw new Error('API timeout');
      })(),
    });

    await expect(runInsightsQuery(baseConfig())).rejects.toThrow('API timeout');
  });

  it('emits error event to callback before rethrowing', async () => {
    mockStreamText.mockReturnValue({
      // biome-ignore lint/correctness/useYield: intentionally throwing before yield to test error path
      fullStream: (async function* () {
        throw new Error('rate limited');
      })(),
    });

    const events: InsightsStreamEvent[] = [];
    await expect(runInsightsQuery(baseConfig(), (e) => events.push(e))).rejects.toThrow(
      'rate limited',
    );

    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Client configuration
  // ---------------------------------------------------------------------------

  it('uses sonnet model and medium thinking level by default', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig());

    const clientArgs = mockCreateSimpleClient.mock.calls[0][0];
    expect(clientArgs.modelShorthand).toBe('sonnet');
    expect(clientArgs.thinkingLevel).toBe('medium');
    expect(clientArgs.requireAuth).toBe(true);
  });

  it('accepts custom modelShorthand and thinkingLevel', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ modelShorthand: 'haiku', thinkingLevel: 'low' }));

    const clientArgs = mockCreateSimpleClient.mock.calls[0][0];
    expect(clientArgs.modelShorthand).toBe('haiku');
    expect(clientArgs.thinkingLevel).toBe('low');
  });

  it.each([
    { level: 'low' as const, budget: 1024 },
    { level: 'high' as const, budget: 16384 },
    { level: 'xhigh' as const, budget: 32768 },
  ])('passes the selected $level Claude thinking budget to streamText', async ({ level, budget }) => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ thinkingLevel: level }));

    expect(mockStreamText.mock.calls[0][0]).toMatchObject({
      model: fakeModel,
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: budget } } },
    });
  });

  it('uses adaptive thinking and the supported max effort for Opus extra high', async () => {
    mockCreateSimpleClient.mockResolvedValue(modelClient('claude-opus-4-6', 'anthropic.messages'));
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ modelShorthand: 'opus', thinkingLevel: 'xhigh' }));

    expect(mockStreamText.mock.calls[0][0].providerOptions).toEqual({
      anthropic: { thinking: { type: 'adaptive' }, effort: 'max' },
    });
  });

  it('applies the selected level to the queue-resolved Codex model without losing its request options', async () => {
    const client = modelClient('gpt-5.3-codex', 'openai.responses', {
      thinkingLevel: 'high',
      queueAuth: {
        apiKey: 'fixture-key', source: 'profile-api-key', accountId: 'fixture-account',
        resolvedProvider: 'openai', resolvedModelId: 'gpt-5.3-codex',
        reasoningConfig: { type: 'reasoning_effort', level: 'high' },
      },
    });
    mockCreateSimpleClient.mockResolvedValue(client);
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ modelShorthand: 'sonnet', thinkingLevel: 'low' }));

    expect(mockStreamText.mock.calls[0][0]).toMatchObject({
      model: client.model,
      system: undefined,
      providerOptions: {
        openai: { reasoningEffort: 'low', instructions: client.systemPrompt, store: false },
      },
    });
    expect(mockStreamText.mock.calls[0][0].providerOptions.anthropic).toBeUndefined();
  });

  it('preserves Codex OAuth instructions and store false for a GPT model without Codex in its name', async () => {
    const client = modelClient('gpt-5.2', 'openai.responses', {
      queueAuth: {
        apiKey: '', source: 'codex-oauth', accountId: 'fixture-account', oauthTokenFilePath: '/fixture/auth.json',
        resolvedProvider: 'openai', resolvedModelId: 'gpt-5.2',
        reasoningConfig: { type: 'reasoning_effort', level: 'high' },
      },
    });
    mockCreateSimpleClient.mockResolvedValue(client);
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ modelShorthand: 'gpt-5.2', thinkingLevel: 'medium' }));

    expect(mockStreamText.mock.calls[0][0]).toMatchObject({
      system: undefined,
      providerOptions: {
        openai: { reasoningEffort: 'medium', instructions: client.systemPrompt, store: false },
      },
    });
  });

  it.each([
    { modelId: 'o3', provider: 'openai.chat', level: 'xhigh' as const, options: { openai: { reasoningEffort: 'high' } } },
    { modelId: 'gemini-2.5-pro', provider: 'google.generative-ai', level: 'high' as const, options: { google: { thinkingConfig: { thinkingBudget: 16384 } } } },
    { modelId: 'gemini-2.5-flash', provider: 'google.generative-ai', level: 'low' as const, options: { google: { thinkingConfig: { thinkingBudget: 0 } } } },
    { modelId: 'grok-3-mini', provider: 'xai.chat', level: 'medium' as const, options: { xai: { reasoningEffort: 'high' } } },
  ])('uses supported options for $modelId', async ({ modelId, provider, level, options }) => {
    mockCreateSimpleClient.mockResolvedValue(modelClient(modelId, provider));
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ modelShorthand: modelId, thinkingLevel: level }));

    expect(mockStreamText.mock.calls[0][0].providerOptions).toEqual(options);
  });

  it.each([
    { modelId: 'glm-5', provider: 'zai.chat' },
    { modelId: 'glm-5', provider: 'zai.anthropic.messages' },
    { modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic.messages' },
    { modelId: 'claude-sonnet-4-6', provider: 'ollama.chat' },
    { modelId: 'mistral-large-latest', provider: 'mistral.chat' },
  ])('omits unsupported thinking options for $modelId on $provider', async ({ modelId, provider }) => {
    mockCreateSimpleClient.mockResolvedValue(modelClient(modelId, provider));
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ modelShorthand: modelId, thinkingLevel: 'high' }));

    expect(mockStreamText.mock.calls[0][0].providerOptions).toBeUndefined();
  });

  it('uses the ZAI SDK namespace when a custom compatible model declares thinking support', async () => {
    mockCreateSimpleClient.mockResolvedValue(modelClient('custom-glm', 'zai.chat', {
      queueAuth: {
        apiKey: 'fixture-key', source: 'profile-api-key', accountId: 'fixture-account',
        resolvedProvider: 'zai', resolvedModelId: 'custom-glm',
        reasoningConfig: { type: 'thinking_toggle', level: 'medium' },
      },
    }));
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ thinkingLevel: 'high' }));

    expect(mockStreamText.mock.calls[0][0].providerOptions).toEqual({
      zai: { thinking: { type: 'enabled', clear_thinking: false } },
    });
  });

  it('sends original image data and MIME type with the final user message', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ images: [fixtureImage] }));

    expect(mockStreamText.mock.calls[0][0].prompt).toBeUndefined();
    expect(mockStreamText.mock.calls[0][0].messages).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'How does authentication work?' },
        { type: 'image', image: 'aQ==', mediaType: 'image/png' },
      ],
    }]);
  });

  it('rejects image attachments for a model that explicitly lacks vision', async () => {
    mockCreateSimpleClient.mockResolvedValue(modelClient('glm-5', 'zai.anthropic.messages'));

    await expect(runInsightsQuery(baseConfig({ images: [fixtureImage] })))
      .rejects.toMatchObject({ code: 'INSIGHTS_IMAGES_UNSUPPORTED' });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('requires original attachment data rather than silently sending a persisted thumbnail', async () => {
    await expect(runInsightsQuery(baseConfig({ images: [{ ...fixtureImage, data: undefined, thumbnail: 'data:image/png;base64,aQ==' }] })))
      .rejects.toMatchObject({ code: 'INSIGHTS_IMAGE_DATA_UNAVAILABLE' });
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('rejects cancellation before creating a client', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(runInsightsQuery(baseConfig({ abortSignal: controller.signal })))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(mockCreateSimpleClient).not.toHaveBeenCalled();
    expect(mockStreamText).not.toHaveBeenCalled();
  });

  it('rejects an SDK abort stream part instead of returning partial text as success', async () => {
    mockStreamText.mockReturnValue(makeStream([
      { type: 'text-delta', text: 'Partial answer' },
      { type: 'abort' },
    ]));

    await expect(runInsightsQuery(baseConfig())).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('checks the signal again after the stream ends', async () => {
    const controller = new AbortController();
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'Partial answer' };
        controller.abort();
      })(),
    });

    await expect(runInsightsQuery(baseConfig({ abortSignal: controller.signal })))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('disables SDK raw error logging while preserving stream failure propagation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('fixture-provider-secret');
    mockStreamText.mockImplementation(options => {
      options.onError({ error });
      return makeStream([{ type: 'error', error }]);
    });

    try {
      await expect(runInsightsQuery(baseConfig())).rejects.toBe(error);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('waits for an executing tool after the SDK closes its aborted stream', async () => {
    let markStarted!: () => void;
    let finishTool!: (value: string) => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const toolResult = new Promise<string>(resolve => { finishTool = resolve; });
    const execute = vi.fn(() => { markStarted(); return toolResult; });
    mockCreateSimpleClient.mockResolvedValue(makeMockClient({
      tools: { Grep: { execute } as unknown as AITool },
    }));
    let capturedTools: Record<string, AITool> | undefined;
    mockStreamText.mockImplementation(options => {
      capturedTools = options.tools;
      void options.tools.Grep.execute({}, { toolCallId: 'fixture-call', messages: [] });
      return {
        fullStream: (async function* () {
          await started;
          yield { type: 'abort' };
        })(),
      };
    });
    let settled = false;
    const outcome = runInsightsQuery(baseConfig()).then(
      result => { settled = true; return result; },
      error => { settled = true; return error; },
    );
    await started;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);

    finishTool('tool process exited');
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(execute).toHaveBeenCalledTimes(1);
    const lateExecute = capturedTools?.Grep.execute;
    if (!lateExecute) throw new Error('Grep execution wrapper was not captured');
    await expect(lateExecute({}, { toolCallId: 'late-call', messages: [] }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('also drains executing tools when the provider stream fails', async () => {
    let markStarted!: () => void;
    let finishTool!: (value: string) => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const toolResult = new Promise<string>(resolve => { finishTool = resolve; });
    mockCreateSimpleClient.mockResolvedValue(makeMockClient({
      tools: { Read: { execute: () => { markStarted(); return toolResult; } } as unknown as AITool },
    }));
    const providerError = new Error('provider disconnected');
    mockStreamText.mockImplementation(options => {
      void options.tools.Read.execute({}, { toolCallId: 'fixture-call', messages: [] });
      return {
        fullStream: (async function* () {
          await started;
          yield { type: 'error', error: providerError };
        })(),
      };
    });
    let settled = false;
    const outcome = runInsightsQuery(baseConfig()).then(
      result => { settled = true; return result; },
      error => { settled = true; return error; },
    );
    await started;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(settled).toBe(false);

    finishTool('file read completed');
    expect(await outcome).toBe(providerError);
  });

  // ---------------------------------------------------------------------------
  // History handling
  // ---------------------------------------------------------------------------

  it('includes conversation history in the prompt when provided', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(
      baseConfig({
        message: 'What about refresh tokens?',
        history: [
          { role: 'user', content: 'How does auth work?' },
          { role: 'assistant', content: 'It uses JWT.' },
        ],
      }),
    );

    const callArgs = mockStreamText.mock.calls[0][0];
    const prompt = callArgs.prompt as string;
    expect(prompt).toContain('How does auth work?');
    expect(prompt).toContain('It uses JWT.');
    expect(prompt).toContain('What about refresh tokens?');
  });

  it('uses message directly as prompt when history is empty', async () => {
    mockStreamText.mockReturnValue(makeStream([]));

    await runInsightsQuery(baseConfig({ message: 'What is the entry point?' }));

    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.prompt).toBe('What is the entry point?');
  });
});
