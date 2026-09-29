import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { detectProviderEnvironment, testProviderConnection } from '../connection-test';
import { createProvider } from '../factory';
import { SupportedProvider } from '../types';
import { azureSdkBaseURL } from '../azure-endpoint';

describe('provider account connection tests with a real HTTP server', () => {
  let server: Server;
  let baseUrl: string;
  let handler: (request: IncomingMessage, response: ServerResponse) => void;
  const requests: Array<{ method?: string; url?: string; authorization?: string }> = [];

  beforeEach(async () => {
    requests.length = 0;
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
    };
    server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
      handler(request, response);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('HTTP fixture did not listen');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  it('checks draft metadata using the configured endpoint and key', async () => {
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl: `${baseUrl}/v1/` });
    expect(result.success).toBe(true);
    expect(result.message).toContain('inference');
    expect(requests).toEqual([{ method: 'GET', url: '/v1/models', authorization: 'Bearer fixture-secret' }]);
  });

  it.each([401, 403, 402, 429, 404, 405, 400, 422, 500])('never treats HTTP %s as successful authentication', async status => {
    handler = (_request, response) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'fixture-secret reflected by server' } }));
    };
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });

  it.each([
    { text: '{}', type: 'application/json' },
    { text: '{"data":"list"}', type: 'application/json' },
    { text: '{"data":[{}]}', type: 'application/json' },
    { text: '{"data":[],"error":{"message":"fixture-secret"}}', type: 'application/json' },
    { text: 'not json', type: 'application/json' },
    { text: '<html>login</html>', type: 'text/html' },
  ])('rejects bogus HTTP 200 responses: $text', async ({ text, type }) => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': type });
      response.end(text);
    };
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });

  it('does not follow redirects or forward credentials to a second path', async () => {
    handler = (_request, response) => {
      response.writeHead(302, { Location: `${baseUrl}/stolen` });
      response.end();
    };
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('redirected') });
    expect(requests).toHaveLength(1);
  });

  it('times out an endpoint that never sends headers', async () => {
    handler = () => { /* Deliberately leave the HTTP response pending. */ };
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl }, { timeoutMs: 25 });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('timed out') });
  });

  it('bounds timeout while reading an unfinished response body', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"data":');
    };
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl }, { timeoutMs: 25 });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('timed out') });
  });

  it('cancels an active request', async () => {
    const controller = new AbortController();
    handler = () => { controller.abort(); };
    const result = await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl }, { signal: controller.signal });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('cancelled') });
  });

  it('rejects excessive response bodies', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [], extra: 'x'.repeat(1_048_577) }));
    };
    expect((await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl })).success).toBe(false);
  });

  it('checks Ollama without a key and accepts an empty installed model list', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"models":[]}');
    };
    expect((await testProviderConnection('ollama', { baseUrl: `${baseUrl}/v1` })).success).toBe(true);
    expect(requests).toEqual([{ method: 'GET', url: '/api/tags', authorization: undefined }]);
  });

  it('tests OpenRouter key information rather than its public model list', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"data":{"label":"fixture","usage":0,"is_management_key":false}}');
    };
    expect((await testProviderConnection('openrouter', { apiKey: 'fixture-secret', baseUrl: `${baseUrl}/api/v1` })).success).toBe(true);
    expect(requests[0].url).toBe('/api/v1/key');
  });

  it.each(['', '/openai', '/openai/v1/', '/gateway/openai/v1'])('Azure probe and runtime SDK use the same v1 prefix for %s', async prefix => {
    const expectedPrefix = prefix.startsWith('/gateway') ? '/gateway/openai' : '/openai';
    let receivedKey: string | undefined;
    handler = (request, response) => {
      receivedKey = request.headers['api-key'] as string | undefined;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(request.url?.includes('/models')
        ? { data: [{ id: 'fixture-model' }] }
        : { id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture-deployment', choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'length' }] }));
    };
    const probe = await testProviderConnection('azure', { apiKey: 'fixture-secret', baseUrl: `${baseUrl}${prefix}` });
    expect(probe.success).toBe(true);
    const model = createProvider({ config: { provider: SupportedProvider.Azure, apiKey: 'fixture-secret', baseURL: `${baseUrl}${prefix}`, deploymentName: 'fixture-deployment' }, modelId: 'fixture-model' });
    expect((await generateText({ model, prompt: 'Hi', maxOutputTokens: 1, maxRetries: 0 })).text).toBe('Hi');
    expect(requests.map(request => request.url)).toEqual([
      `${expectedPrefix}/v1/models?api-version=v1`,
      `${expectedPrefix}/v1/chat/completions?api-version=v1`,
    ]);
    expect(receivedKey).toBe('fixture-secret');
  });

  it('requires explicit model mode before sending any ZAI request', async () => {
    const result = await testProviderConnection('zai', { apiKey: 'fixture-secret', baseUrl: `${baseUrl}/api/anthropic`, billingModel: 'subscription' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('minimal request');
    expect(requests).toEqual([]);
  });

  it.each([
    { prefix: '/api/anthropic', path: '/api/anthropic/v1/messages', anthropic: true },
    { prefix: '/api/anthropic/v1/', path: '/api/anthropic/v1/messages', anthropic: true },
    { prefix: '/api/coding/paas/v4', path: '/api/coding/paas/v4/chat/completions', anthropic: false },
    { prefix: '/api/paas/v4', path: '/api/paas/v4/chat/completions', anthropic: false },
  ])('sends one minimal authorized ZAI model test at $path', async ({ prefix, path, anthropic }) => {
    let body: Record<string, unknown> | undefined;
    handler = (request, response) => {
      let raw = '';
      request.on('data', chunk => { raw += chunk; });
      request.on('end', () => {
        body = JSON.parse(raw) as Record<string, unknown>;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(anthropic
          ? { id: 'fixture', type: 'message', role: 'assistant', model: 'glm-5', content: [{ type: 'text', text: 'Hi' }], stop_reason: 'max_tokens' }
          : { id: 'fixture', model: 'glm-5', choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'length' }] }));
      });
    };
    const result = await testProviderConnection('zai', {
      apiKey: 'fixture-secret', baseUrl: `${baseUrl}${prefix}`, billingModel: 'subscription', mode: 'model', model: 'glm-5',
    });
    expect(result.success).toBe(true);
    expect(requests).toEqual([{ method: 'POST', url: path, authorization: 'Bearer fixture-secret' }]);
    expect(body).toMatchObject({ model: 'glm-5', max_tokens: 1, stream: false, messages: [{ role: 'user', content: 'Hi' }] });
    if (!anthropic) expect(body?.thinking).toEqual({ type: 'disabled' });
  });

  it('fails a rejected model request instead of interpreting 400 as reachable success', async () => {
    handler = (_request, response) => {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end('{"error":{"message":"model not found"}}');
    };
    const result = await testProviderConnection('zai', { apiKey: 'fixture-secret', baseUrl, mode: 'model', model: 'glm-5' });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('not a successful test') });
  });

  it.each([
    { prefix: '/api/anthropic', path: '/api/anthropic/v1/messages', anthropic: true },
    { prefix: '/api/coding/paas/v4', path: '/api/coding/paas/v4/chat/completions', anthropic: false },
  ])('the real runtime SDK sends the same protocol and route as the test: $path', async ({ prefix, path, anthropic }) => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(anthropic
        ? { id: 'fixture', type: 'message', role: 'assistant', model: 'glm-5', content: [{ type: 'text', text: 'Hi' }], stop_reason: 'max_tokens', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }
        : { id: 'fixture', object: 'chat.completion', created: 1, model: 'glm-5', choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'length' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    };
    const model = createProvider({ config: { provider: SupportedProvider.ZAI, apiKey: 'fixture-secret', baseURL: `${baseUrl}${prefix}` }, modelId: 'glm-5' });
    const result = await generateText({ model, prompt: 'Hi', maxOutputTokens: 1, maxRetries: 0 });
    expect(result.text).toBe('Hi');
    expect(requests).toEqual([{ method: 'POST', url: path, authorization: 'Bearer fixture-secret' }]);
  });

  it.each(['ftp://example.test', 'not a URL', 'https://user:password@example.test', 'https://example.test#secret', 'https://example.test?key=secret', 'http://example.test/v1'])('rejects unsafe or malformed URLs before connecting: %s', async url => {
    expect((await testProviderConnection('openai-compatible', { apiKey: 'fixture-secret', baseUrl: url })).success).toBe(false);
    expect(requests).toEqual([]);
  });
});

describe('connection test configuration', () => {
  it.each(['anthropic', 'openai', 'google', 'mistral', 'groq', 'xai', 'openrouter'])('requires credentials for %s', async provider => {
    const transport = vi.fn();
    const result = await testProviderConnection(provider, {}, { env: {}, fetch: transport });
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('API key') });
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(['anthropic', 'openai'])('does not test OAuth with API-key semantics for %s', async provider => {
    const transport = vi.fn();
    expect((await testProviderConnection(provider, { authType: 'oauth' }, { fetch: transport })).success).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('reports Bedrock as unsupported without pretending an AWS access key is a bearer token', async () => {
    const transport = vi.fn();
    expect((await testProviderConnection('amazon-bedrock', { apiKey: 'fixture-key' }, { fetch: transport })).success).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it('does not expose thrown transport errors containing secrets', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('fixture-secret sent to https://example.test'));
    const result = await testProviderConnection('openai', { apiKey: 'fixture-secret' }, { fetch: transport });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(JSON.stringify(result)).not.toContain('example.test');
  });

  it.each([null, [], { apiKey: 123 }, { mode: 'invalid' }, { billingModel: 'other' }, { authType: 'other' }, { baseUrl: 'x'.repeat(8_193) }])('rejects malformed IPC config', async input => {
    expect((await testProviderConnection('openai', input as never)).success).toBe(false);
  });

  it('reports the full registry env names and provider IDs without exposing keys', () => {
    const result = detectProviderEnvironment({
      OPENAI_API_KEY: 'secret-openai', OPENROUTER_API_KEY: 'secret-openrouter', ZHIPU_API_KEY: 'secret-zai',
      AWS_ACCESS_KEY_ID: 'incomplete', MISTRAL_API_KEY: '   ',
    });
    expect(result).toEqual({ openai: true, OPENAI_API_KEY: true, openrouter: true, OPENROUTER_API_KEY: true, zai: true, ZHIPU_API_KEY: true });
    expect(JSON.stringify(result)).not.toContain('secret-');
    expect(detectProviderEnvironment({ AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret' })).toMatchObject({ 'amazon-bedrock': true, AWS_ACCESS_KEY_ID: true });
  });
});

describe('real ZAI runtime adapter selection', () => {
  it.each([
    { baseURL: 'https://api.z.ai/api/anthropic', expected: 'zai.anthropic' },
    { baseURL: 'https://api.z.ai/api/anthropic/v1/', expected: 'zai.anthropic' },
    { baseURL: 'https://api.z.ai/api/coding/paas/v4', expected: 'zai.chat' },
    { baseURL: 'https://api.z.ai/api/paas/v4', expected: 'zai.chat' },
  ])('selects the correct provider protocol for $baseURL', ({ baseURL, expected }) => {
    const model = createProvider({ config: { provider: SupportedProvider.ZAI, apiKey: 'fixture-secret', baseURL }, modelId: 'glm-5' });
    if (typeof model === 'string') throw new Error('Factory did not return a provider model');
    expect(model.provider).toBe(expected);
  });
});

it('Azure SDK prefix normalization is idempotent', () => {
  const prefix = azureSdkBaseURL('https://resource.openai.azure.com/openai/v1/');
  expect(prefix).toBe('https://resource.openai.azure.com/openai');
  expect(azureSdkBaseURL(prefix)).toBe(prefix);
  expect(azureSdkBaseURL(undefined)).toBeUndefined();
});
