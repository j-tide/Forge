import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tool, type Tool } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ReasoningConfig } from '../../../../shared/constants/models';
import type { SimpleClientConfig, SimpleClientResult } from '../../client/types';
import { createProvider } from '../../providers/factory';
import type { SupportedProvider } from '../../providers/types';
import { runInsightsQuery } from '../insights';

const { mockCreateSimpleClient } = vi.hoisted(() => ({
  mockCreateSimpleClient: vi.fn(),
}));

vi.mock('../../client/factory', () => ({
  createSimpleClient: mockCreateSimpleClient,
}));

vi.mock('../../tools/build-registry', () => ({
  buildToolRegistry: () => ({ getToolsForAgent: () => ({}) }),
}));

interface CapturedRequest {
  method?: string;
  url?: string;
  body: Record<string, unknown>;
}

function eventStream(events: Record<string, unknown>[]): string {
  return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

function anthropicStream(model: string): string {
  return eventStream([
    {
      type: 'message_start',
      message: {
        id: 'msg_fixture', model, role: 'assistant', content: [],
        usage: { input_tokens: 4, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]);
}

function anthropicToolStream(model: string): string {
  return eventStream([
    {
      type: 'message_start',
      message: {
        id: 'msg_fixture', model, role: 'assistant', content: [],
        usage: { input_tokens: 4, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start', index: 0,
      content_block: { type: 'tool_use', id: 'tool_fixture', name: 'SlowRead', input: {} },
    },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(fulfill => { resolve = fulfill; });
  return { promise, resolve };
}

function responsesStream(model: string): string {
  return eventStream([
    {
      type: 'response.created',
      response: { id: 'resp_fixture', created_at: 1, model },
    },
    {
      type: 'response.output_item.added', output_index: 0,
      item: { type: 'message', id: 'msg_fixture' },
    },
    { type: 'response.output_text.delta', item_id: 'msg_fixture', delta: 'OK' },
    {
      type: 'response.output_item.done', output_index: 0,
      item: { type: 'message', id: 'msg_fixture' },
    },
    {
      type: 'response.completed',
      response: { usage: { input_tokens: 4, output_tokens: 1 } },
    },
  ]);
}

function compatibleStream(model: string): string {
  const chunks = [
    {
      id: 'chat_fixture', object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }],
    },
    {
      id: 'chat_fixture', object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
    },
  ];
  return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
}

describe('Insights runner requests through real SDKs and a local HTTP server', () => {
  let server: Server;
  let baseURL: string;
  let projectDir: string;
  let streamFixture: ((model: string) => string) | undefined;
  const requests: CapturedRequest[] = [];

  beforeEach(async () => {
    requests.length = 0;
    streamFixture = undefined;
    mockCreateSimpleClient.mockReset();
    projectDir = await mkdtemp(join(tmpdir(), 'forge-insights-wire-'));
    server = createServer(async (request, response) => {
      let rawBody = '';
      for await (const chunk of request) rawBody += chunk.toString();
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      requests.push({ method: request.method, url: request.url, body });
      const model = typeof body.model === 'string' ? body.model : 'fixture-model';
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(streamFixture?.(model) ?? (request.url?.endsWith('/messages') ? anthropicStream(model)
        : request.url?.endsWith('/responses') ? responsesStream(model) : compatibleStream(model)));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP fixture did not listen');
    baseURL = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(projectDir, { recursive: true, force: true });
  });

  function configureClient(
    provider: SupportedProvider,
    modelId: string,
    endpoint: string,
    reasoningConfig: ReasoningConfig,
    tools: Record<string, Tool> = {},
  ): void {
    const model = createProvider({ config: { provider, apiKey: 'fixture-key', baseURL: endpoint }, modelId });
    mockCreateSimpleClient.mockImplementation(async (config: SimpleClientConfig): Promise<SimpleClientResult> => ({
      model,
      resolvedModelId: modelId,
      systemPrompt: config.systemPrompt,
      tools,
      maxSteps: 1,
      // The queue's default differs deliberately from the query's selected level.
      thinkingLevel: 'medium',
      queueAuth: {
        accountId: 'fixture-account', apiKey: 'fixture-key', source: 'profile-api-key',
        resolvedProvider: provider, resolvedModelId: modelId, reasoningConfig,
      },
    }));
  }

  it('sends the selected Anthropic model and high thinking budget on the wire', async () => {
    const modelId = 'claude-sonnet-4-6';
    configureClient('anthropic', modelId, `${baseURL}/v1`, { type: 'thinking_tokens', level: 'medium' });

    const result = await runInsightsQuery({ projectDir, message: 'Reply OK.', modelShorthand: modelId, thinkingLevel: 'high' });

    expect(result.text).toBe('OK');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/v1/messages', body: {
      model: modelId, stream: true, thinking: { type: 'enabled', budget_tokens: 16384 },
    } });
    expect(mockCreateSimpleClient).toHaveBeenCalledWith(expect.objectContaining({ requireAuth: true, thinkingLevel: 'high' }));
  });

  it('sends the original image bytes and MIME type alongside the user text to Anthropic', async () => {
    const modelId = 'claude-sonnet-4-6';
    const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
    configureClient('anthropic', modelId, `${baseURL}/v1`, { type: 'thinking_tokens', level: 'medium' });

    const result = await runInsightsQuery({
      projectDir,
      message: 'Describe this image.',
      modelShorthand: modelId,
      thinkingLevel: 'low',
      images: [{ id: 'fixture-image', filename: 'pixel.png', mimeType: 'image/png', size: 70, data: imageData }],
    });

    expect(result.text).toBe('OK');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/v1/messages', body: { model: modelId } });
    const messages = requests[0].body.messages as Array<{ role: string; content: unknown[] }>;
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Describe this image.' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
      ],
    });
  });

  it('preserves Codex instructions, store false and the selected low reasoning effort', async () => {
    const modelId = 'gpt-5.3-codex';
    configureClient('openai', modelId, `${baseURL}/v1`, { type: 'reasoning_effort', level: 'high' });

    const result = await runInsightsQuery({ projectDir, message: 'Reply OK.', modelShorthand: modelId, thinkingLevel: 'low' });

    expect(result.text).toBe('OK');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', url: '/v1/responses', body: {
      model: modelId, stream: true, store: false, reasoning: { effort: 'low' },
      instructions: expect.stringContaining('helping developers understand'),
    } });
    const input = requests[0].body.input as Array<{ role: string }>;
    expect(input.every(message => message.role !== 'system' && message.role !== 'developer')).toBe(true);
  });

  it('waits for an executing SDK tool to finish before settling a cancelled query', async () => {
    const modelId = 'claude-sonnet-4-6';
    const started = deferred();
    const release = deferred();
    const abortObserved = deferred();
    const controller = new AbortController();
    let toolFinished = false;
    let settled = false;
    streamFixture = anthropicToolStream;
    configureClient('anthropic', modelId, `${baseURL}/v1`, { type: 'thinking_tokens', level: 'medium' }, {
      SlowRead: tool({
        description: 'A local fixture read that remains active until explicitly released.',
        inputSchema: z.object({}),
        execute: async () => {
          started.resolve();
          await release.promise;
          toolFinished = true;
          return 'Fixture read finished.';
        },
      }),
    });

    const outcome = runInsightsQuery({
      projectDir, message: 'Read the fixture.', modelShorthand: modelId,
      thinkingLevel: 'low', abortSignal: controller.signal,
    }, event => {
      if (event.type === 'error') abortObserved.resolve();
    }).then(
      result => { settled = true; return result; },
      error => { settled = true; return error; },
    );

    try {
      await started.promise;
      controller.abort();
      await abortObserved.promise;
      // Allow promise continuations to settle after the stream reports cancellation.
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(toolFinished).toBe(false);
      expect(settled).toBe(false);
    } finally {
      release.resolve();
    }

    expect(await outcome).toMatchObject({ name: 'AbortError' });
    expect(toolFinished).toBe(true);
    expect(settled).toBe(true);
    expect(requests).toHaveLength(1);
  });

  it('propagates a real SDK stream error without logging the raw provider response', async () => {
    const modelId = 'claude-sonnet-4-6';
    const providerMessage = 'fixture-sensitive-provider-response';
    streamFixture = () => eventStream([{ type: 'error', error: { type: 'api_error', message: providerMessage } }]);
    configureClient('anthropic', modelId, `${baseURL}/v1`, { type: 'thinking_tokens', level: 'medium' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(runInsightsQuery({ projectDir, message: 'Reply OK.', modelShorthand: modelId }))
        .rejects.toThrow(providerMessage);
      expect(consoleError).not.toHaveBeenCalled();
      expect(requests).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    { protocol: 'Anthropic', endpoint: '/anthropic', path: '/anthropic/v1/messages' },
    { protocol: 'OpenAI compatible', endpoint: '/v4', path: '/v4/chat/completions' },
  ])('omits unsupported thinking for current ZAI models through $protocol', async ({ endpoint, path }) => {
    const modelId = 'glm-5';
    configureClient('zai', modelId, `${baseURL}${endpoint}`, { type: 'none' });

    const result = await runInsightsQuery({ projectDir, message: 'Reply OK.', modelShorthand: modelId, thinkingLevel: 'high' });

    expect(result.text).toBe('OK');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', url: path, body: { model: modelId, stream: true } });
    expect(requests[0].body).not.toHaveProperty('thinking');
    expect(requests[0].body).not.toHaveProperty('reasoning');
    expect(requests[0].body).not.toHaveProperty('reasoning_effort');
    expect(requests[0].body).not.toHaveProperty('output_config');
  });
});
