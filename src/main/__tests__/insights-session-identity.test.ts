import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsConfig as QueryConfig, InsightsResult, InsightsStreamEvent } from '../ai/runners/insights';

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));

vi.mock('../ai/runners/insights', () => ({ runInsightsQuery: runQuery }));
vi.mock('../insights/config', () => ({
  InsightsConfig: class {
    configure() { /* No provider configuration is loaded by this local test. */ }
  },
}));
vi.mock('../rate-limit-detector', () => ({
  detectRateLimit: () => ({ isRateLimited: false }),
  createSDKRateLimitInfo: vi.fn(),
}));

import { InsightsService } from '../insights-service';
import { InsightsExecutor } from '../insights/insights-executor';
import { InsightsConfig } from '../insights/config';
import { InsightsPaths } from '../insights/paths';
import { SessionManager } from '../insights/session-manager';
import { SessionStorage } from '../insights/session-storage';

interface PendingQuery {
  config: QueryConfig;
  emit: (event: InsightsStreamEvent) => void;
  resolve: (value: Pick<InsightsResult, 'text'> & Partial<InsightsResult>) => void;
  reject: (error: Error) => void;
}

describe('Insights session identity during concurrent selection', () => {
  let projectPath: string;
  let pending: PendingQuery[];

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'forge-insights-session-'));
    pending = [];
    let time = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => time++);
    runQuery.mockImplementation((config, emit) => new Promise((resolve, reject) => {
      pending.push({ config, emit, resolve, reject });
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    rmSync(projectPath, { recursive: true, force: true });
  });

  it('persists an old response without replacing the selected session cache or disk pointer', () => {
    const paths = new InsightsPaths();
    const storage = new SessionStorage(paths);
    const manager = new SessionManager(storage, paths);
    const original = manager.createNewSession('project-a', projectPath);
    const selected = manager.createNewSession('project-a', projectPath);

    original.messages.push({ id: 'response-a', role: 'assistant', content: 'Original response', timestamp: new Date() });
    manager.saveSession(projectPath, original);

    expect(storage.loadSessionById(projectPath, original.id)?.messages[0].content).toBe('Original response');
    expect(storage.getCurrentSessionId(projectPath)).toBe(selected.id);
    expect(manager.loadSession('project-a', projectPath)?.id).toBe(selected.id);
    manager.clearCache('project-a');
    expect(manager.loadSession('project-a', projectPath)?.id).toBe(selected.id);
  });

  it('binds stream and status to the real originating session after the selected session changes', async () => {
    const service = new InsightsService();
    const original = service.createNewSession('project-a', projectPath);
    const chunks = vi.fn();
    const statuses = vi.fn();
    const updated = vi.fn();
    service.on('stream-chunk', chunks);
    service.on('status', statuses);
    service.on('session-updated', updated);

    const response = service.sendMessage('project-a', projectPath, 'Inspect this project');
    const selected = service.createNewSession('project-a', projectPath);
    pending[0].emit({ type: 'text-delta', text: 'Originating response' });
    pending[0].resolve({ text: 'Originating response' });
    const completed = await response;

    expect(chunks).toHaveBeenCalledWith('project-a', expect.objectContaining({ type: 'text', sessionId: original.id }));
    expect(chunks).toHaveBeenCalledWith('project-a', expect.objectContaining({ type: 'done', sessionId: original.id }));
    expect(statuses).toHaveBeenCalledWith('project-a', expect.objectContaining({ phase: 'thinking', sessionId: original.id }));
    expect(statuses).toHaveBeenCalledWith('project-a', expect.objectContaining({ phase: 'complete', sessionId: original.id }));
    expect(updated).toHaveBeenCalledWith('project-a', expect.objectContaining({ id: original.id }), completed.requestId);
    expect(service.loadSession('project-a', projectPath)?.id).toBe(selected.id);
    const storage = new SessionStorage(new InsightsPaths());
    expect(storage.loadSessionById(projectPath, original.id)?.messages.map(message => message.content))
      .toEqual(['Inspect this project', 'Originating response']);
  });

  it('keeps errors attributed to the old session and allows the selected session to start after it settles', async () => {
    const service = new InsightsService();
    const original = service.createNewSession('project-a', projectPath);
    const errors = vi.fn();
    const chunks = vi.fn();
    service.on('error', errors);
    service.on('stream-chunk', chunks);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const first = service.sendMessage('project-a', projectPath, 'First');
    const selected = service.createNewSession('project-a', projectPath);
    await expect(service.sendMessage('project-a', projectPath, 'Second')).rejects.toMatchObject({ code: 'request-busy' });
    const rejected = expect(first).rejects.toMatchObject({ code: 'request-failed' });
    pending[0].reject(new Error('Original provider failure'));
    await rejected;
    const second = service.sendMessage('project-a', projectPath, 'Second');
    pending[1].emit({ type: 'text-delta', text: 'Second response' });
    pending[1].resolve({ text: 'Second response' });
    await second;

    expect(errors).toHaveBeenCalledWith('project-a', expect.any(String), original.id, expect.any(String), 'request-failed');
    expect(errors.mock.calls[0][1]).not.toContain('Original provider failure');
    expect(chunks).toHaveBeenCalledWith('project-a', expect.objectContaining({ type: 'error', sessionId: original.id }));
    expect(chunks).toHaveBeenCalledWith('project-a', expect.objectContaining({ type: 'text', sessionId: selected.id }));
    expect(service.loadSession('project-a', projectPath)?.id).toBe(selected.id);
  });

  it('binds tool activity and task suggestions to the same captured session', async () => {
    const service = new InsightsService();
    const original = service.createNewSession('project-a', projectPath);
    const chunks = vi.fn();
    service.on('stream-chunk', chunks);
    const response = service.sendMessage('project-a', projectPath, 'Suggest a task');
    service.createNewSession('project-a', projectPath);
    pending[0].emit({ type: 'tool-start', name: 'read_file', input: 'README.md' });
    pending[0].emit({ type: 'tool-end', name: 'read_file' });
    pending[0].resolve({
      text: 'Task suggestion',
      taskSuggestion: {
        title: 'Add validation',
        description: 'Validate inputs',
        metadata: { category: 'feature', complexity: 'simple', impact: 'low' },
      },
    });
    await response;

    expect(chunks.mock.calls.map(([, chunk]) => chunk.type))
      .toEqual(['tool_start', 'tool_end', 'task_suggestion', 'done']);
    for (const [projectId, chunk] of chunks.mock.calls) {
      expect(projectId).toBe('project-a');
      expect(chunk.sessionId).toBe(original.id);
    }
  });

  it('keeps legacy executor callers valid without manufacturing a session identity', async () => {
    const executor = new InsightsExecutor(new InsightsConfig());
    const chunks = vi.fn();
    executor.on('stream-chunk', chunks);
    const response = executor.execute('project-a', projectPath, 'Legacy caller', []);
    pending[0].emit({ type: 'text-delta', text: 'Legacy response' });
    pending[0].resolve({ text: 'Legacy response' });
    await response;

    expect(chunks.mock.calls[0]).toEqual(['project-a', { type: 'text', content: 'Legacy response' }]);
    expect(chunks.mock.calls[1]).toEqual(['project-a', { type: 'done' }]);
  });

  it('rejects concurrent execution and retains active cancellation until the runner settles', async () => {
    const executor = new InsightsExecutor(new InsightsConfig());
    const first = executor.execute('project-a', projectPath, 'First', []);
    await expect(executor.execute('project-a', projectPath, 'Second', [])).rejects.toMatchObject({ code: 'request-busy' });
    expect(pending).toHaveLength(1);
    expect(pending[0].config.abortSignal?.aborted).toBe(false);
    const firstCancellation = executor.cancelSession('project-a');
    expect(pending[0].config.abortSignal?.aborted).toBe(true);
    expect(executor.isSessionActive('project-a')).toBe(true);
    pending[0].resolve({ text: 'First' });
    await first;
    await expect(firstCancellation).resolves.toBe(true);
    expect(executor.isSessionActive('project-a')).toBe(false);

    const second = executor.execute('project-a', projectPath, 'Second', []);
    expect(executor.isSessionActive('project-a')).toBe(true);
    const secondCancellation = executor.cancelSession('project-a');
    expect(pending[1].config.abortSignal?.aborted).toBe(true);
    pending[1].resolve({ text: 'Second' });
    await second;
    await expect(secondCancellation).resolves.toBe(true);
  });
});
