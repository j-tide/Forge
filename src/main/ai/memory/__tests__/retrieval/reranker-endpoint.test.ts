import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reranker } from '../../retrieval/reranker';

let server: Server | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (!server) return;
  const currentServer = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => error ? reject(error) : resolve());
    currentServer.closeIdleConnections();
  });
});

describe('Configured Ollama reranker endpoint', () => {
  it.each(['', '///'])('uses the configured server for discovery and scoring with suffix "%s"', async (suffix) => {
    const requests: Array<{ method: string | undefined; path: string | undefined; payload?: { model: string; prompt: string } }> = [];
    server = createServer(async (request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/api/tags') {
        requests.push({ method: request.method, path: request.url });
        response.end(JSON.stringify({ models: [{ name: 'qwen3-reranker:0.6b' }] }));
        return;
      }
      if (request.url === '/api/embeddings') {
        let body = '';
        for await (const chunk of request) body += chunk.toString();
        const payload = JSON.parse(body) as { model: string; prompt: string };
        requests.push({ method: request.method, path: request.url, payload });
        response.end(JSON.stringify({ embedding: payload.prompt.includes('strong-memory') ? [3, 4] : [0, 1] }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'Unexpected endpoint' }));
    });
    const currentServer = server;
    await new Promise<void>((resolve, reject) => {
      currentServer.once('error', reject);
      currentServer.listen(0, '127.0.0.1', resolve);
    });
    const address = currentServer.address();
    if (!address || typeof address === 'string') throw new Error('Loopback server address missing');

    const reranker = new Reranker(undefined, { ollamaBaseUrl: `http://127.0.0.1:${address.port}${suffix}` });
    await reranker.initialize();
    expect(reranker.getProvider()).toBe('ollama');
    const result = await reranker.rerank('authentication', [
      { memoryId: 'weak', content: 'weak-memory' },
      { memoryId: 'strong', content: 'strong-memory' },
    ], 1);

    expect(result).toEqual([{ memoryId: 'strong', score: 5 }]);
    expect(requests[0]).toEqual({ method: 'GET', path: '/api/tags' });
    const scoringRequests = requests.filter((request) => request.path === '/api/embeddings');
    expect(scoringRequests).toHaveLength(2);
    expect(scoringRequests.every((request) => request.method === 'POST' && request.payload?.model === 'qwen3-reranker:0.6b')).toBe(true);
    expect(scoringRequests.map((request) => request.payload?.prompt).join('\n')).toContain('authentication');
    expect(scoringRequests.map((request) => request.payload?.prompt).join('\n')).toContain('weak-memory');
    expect(scoringRequests.map((request) => request.payload?.prompt).join('\n')).toContain('strong-memory');
  });

  it('preserves the existing explicit none constructor and positional passthrough without network requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const reranker = new Reranker('none');
    const candidates = [
      { memoryId: 'first', content: 'first memory' },
      { memoryId: 'second', content: 'second memory' },
      { memoryId: 'third', content: 'third memory' },
    ];
    expect(reranker.getProvider()).toBe('none');
    const result = await reranker.rerank('query', candidates, 2);
    expect(result.map((item) => item.memoryId)).toEqual(['first', 'second']);
    expect(result[0].score).toBe(1);
    expect(result[1].score).toBeCloseTo(2 / 3);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(new Reranker().getProvider()).toBe('none');
  });
});
