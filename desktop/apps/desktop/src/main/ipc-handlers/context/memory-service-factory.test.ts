import { createServer, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInMemoryClient } from '../../ai/memory/db';
import { getEmbeddingProvider, getMemoryService, resetMemoryService } from './memory-service-factory';

const dependencies = vi.hoisted(() => ({ getMemoryClient: vi.fn(), readSettingsFile: vi.fn() }));
vi.mock('../../ai/memory/db', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../ai/memory/db')>(),
  getMemoryClient: dependencies.getMemoryClient,
}));
vi.mock('../../settings-utils', () => ({ readSettingsFile: dependencies.readSettingsFile }));

let client: Client;
let server: Server;
let endpoint: string;
let requests: string[];
let malformedFirstResponse: boolean;
let holdFirstResponse: boolean;
let heldResponse: ServerResponse | undefined;
const availableModels = { models: [{ name: 'nomic-embed-text:latest' }, { name: 'qwen3-reranker:0.6b' }] };

beforeEach(async () => {
  resetMemoryService();
  client = await getInMemoryClient();
  dependencies.getMemoryClient.mockResolvedValue(client);
  requests = [];
  malformedFirstResponse = false;
  holdFirstResponse = false;
  heldResponse = undefined;
  server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/tags') {
      if (holdFirstResponse && requests.length === 1) {
        heldResponse = response;
        return;
      }
      if (malformedFirstResponse && requests.length === 1) {
        response.end(JSON.stringify({ models: null }));
      } else {
        response.end(JSON.stringify(availableModels));
      }
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dependencies.readSettingsFile.mockReturnValue({ memoryEmbeddingProvider: 'ollama', memoryOllamaEmbeddingModel: 'nomic-embed-text', ollamaBaseUrl: endpoint });
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO memories (id, type, content, confidence, tags, related_files, related_modules,
      created_at, last_accessed_at, access_count, scope, source, project_id)
      VALUES (?, 'gotcha', ?, 0.9, '[]', '[]', '[]', ?, ?, 0, 'global', 'user_taught', 'saved-project')`,
    args: ['saved-memory', 'Preserve this existing memory', now, now],
  });
});

afterEach(async () => {
  resetMemoryService();
  client.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('Memory service initialization', () => {
  it('detects embeddings and reranking through the same configured endpoint and shares successful initialization', async () => {
    const [first, second] = await Promise.all([getMemoryService(), getMemoryService()]);
    expect(first).toBe(second);
    expect(await getMemoryService()).toBe(first);
    expect(dependencies.getMemoryClient).toHaveBeenCalledTimes(1);
    expect(requests).toEqual(['/api/tags', '/api/tags']);
    expect(getEmbeddingProvider()).toBe('ollama-generic');
  });

  it('retries after a real malformed endpoint response without resetting or deleting stored memories', async () => {
    malformedFirstResponse = true;
    const failedAttempts = await Promise.allSettled([getMemoryService(), getMemoryService()]);
    expect(failedAttempts.every((attempt) => attempt.status === 'rejected')).toBe(true);
    expect(requests).toEqual(['/api/tags']);
    expect(getEmbeddingProvider()).toBeNull();
    const service = await getMemoryService();
    expect(await getMemoryService()).toBe(service);
    expect(dependencies.getMemoryClient).toHaveBeenCalledTimes(2);
    expect(requests).toEqual(['/api/tags', '/api/tags', '/api/tags']);
    expect(getEmbeddingProvider()).toBe('ollama-generic');
    const preserved = await client.execute("SELECT id, content FROM memories WHERE id = 'saved-memory'");
    expect(preserved.rows).toHaveLength(1);
    expect(preserved.rows[0].content).toBe('Preserve this existing memory');
  });

  it('keeps the current settings instance when discovery from older settings finishes later', async () => {
    holdFirstResponse = true;
    const firstRequest = once(server, 'request');
    const olderInitialization = getMemoryService();
    await firstRequest;
    resetMemoryService();
    dependencies.readSettingsFile.mockReturnValue({ memoryEmbeddingProvider: 'openai', globalOpenAIApiKey: 'test-fixture-key', ollamaBaseUrl: endpoint });
    const currentService = await getMemoryService();
    expect(getEmbeddingProvider()).toBe('openai');
    if (!heldResponse) throw new Error('First endpoint response not held');
    heldResponse.end(JSON.stringify(availableModels));
    expect(await olderInitialization).not.toBe(currentService);
    expect(await getMemoryService()).toBe(currentService);
    expect(getEmbeddingProvider()).toBe('openai');
    expect(dependencies.getMemoryClient).toHaveBeenCalledTimes(2);
  });
});
