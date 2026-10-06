import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionResult } from '../../session/types';
import { TaskLogWriter } from '../../logging/task-log-writer';
import { finalizeWorkerLogs, runWorkerLifecycle } from '../worker-lifecycle';

function completedResult(): SessionResult {
  return {
    outcome: 'completed',
    stepsExecuted: 2,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    messages: [{ role: 'assistant', content: 'done' }],
    durationMs: 25,
    toolCallCount: 1,
  };
}

describe('worker lifecycle', () => {
  it.each(['completed', 'error', 'cancelled'] as const)('publishes one %s result only after cleanup, then closes the port', async (outcome) => {
    const order: string[] = [];
    const published: SessionResult[] = [];
    const result = { ...completedResult(), outcome };
    await runWorkerLifecycle({
      execute: async () => result,
      cleanup: [
        () => { order.push('logs flushed'); },
        async () => { await Promise.resolve(); order.push('MCP closed'); },
      ],
      postResult: (value) => { published.push(value); order.push('result'); },
      closePort: () => { order.push('port closed'); },
      abortSignal: new AbortController().signal,
    });

    expect(published).toEqual([result]);
    expect(order).toEqual(['logs flushed', 'MCP closed', 'result', 'port closed']);
  });

  it('publishes a failure for setup exceptions and still performs cleanup', async () => {
    const published: SessionResult[] = [];
    const order: string[] = [];
    await runWorkerLifecycle({
      execute: async () => { throw new Error('provider setup failed'); },
      cleanup: [() => { order.push('cleanup'); }],
      postResult: (result) => { published.push(result); },
      closePort: () => { order.push('closed'); },
      abortSignal: new AbortController().signal,
    });

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ outcome: 'error', error: { message: 'provider setup failed', retryable: false } });
    expect(order).toEqual(['cleanup', 'closed']);
  });

  it('normalizes an aborted execution exception into cancellation without an error', async () => {
    const abortController = new AbortController();
    const published: SessionResult[] = [];
    await runWorkerLifecycle({
      execute: async () => { abortController.abort(); throw new Error('request aborted'); },
      cleanup: [],
      postResult: (result) => { published.push(result); },
      closePort: () => { /* This case checks cancellation rather than port ordering. */ },
      abortSignal: abortController.signal,
    });

    expect(published).toHaveLength(1);
    expect(published[0]?.outcome).toBe('cancelled');
    expect(published[0]?.error).toBeUndefined();
  });

  it('continues cleanup after a cleanup failure and publishes a failed result preserving usage', async () => {
    const published: SessionResult[] = [];
    const order: string[] = [];
    await runWorkerLifecycle({
      execute: async () => completedResult(),
      cleanup: [
        () => { throw new Error('log flush failed'); },
        async () => { order.push('MCP closed'); },
      ],
      postResult: (result) => { published.push(result); order.push('result'); },
      closePort: () => { order.push('closed'); },
      abortSignal: new AbortController().signal,
    });

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      outcome: 'error',
      error: { message: 'log flush failed', retryable: false },
      stepsExecuted: 2,
      usage: { totalTokens: 15 },
      toolCallCount: 1,
    });
    expect(order).toEqual(['MCP closed', 'result', 'closed']);
  });

  it('closes the port even when terminal result delivery fails', async () => {
    let closed = false;
    await expect(runWorkerLifecycle({
      execute: async () => completedResult(),
      cleanup: [],
      postResult: () => { throw new Error('port delivery failed'); },
      closePort: () => { closed = true; },
      abortSignal: new AbortController().signal,
    })).rejects.toThrow('port delivery failed');

    expect(closed).toBe(true);
  });

  it('reports cancellation arriving during MCP cleanup to final log cleanup and the terminal result', async () => {
    const abortController = new AbortController();
    let finishMcpCleanup!: () => void;
    let startedMcpCleanup!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => { startedMcpCleanup = resolve; });
    const observed: string[] = [];
    const execution = runWorkerLifecycle({
      execute: async () => completedResult(),
      cleanup: [
        () => new Promise<void>((resolve) => { finishMcpCleanup = resolve; startedMcpCleanup(); }),
        (result) => { observed.push(`logs:${result.outcome}`); },
      ],
      postResult: (result) => { observed.push(`result:${result.outcome}`); },
      closePort: () => { observed.push('closed'); },
      abortSignal: abortController.signal,
    });
    await cleanupStarted;
    abortController.abort();
    finishMcpCleanup();
    await execution;

    expect(observed).toEqual(['logs:cancelled', 'result:cancelled', 'closed']);
  });

  it('keeps cleanup failures visible to logs when cancellation also arrives during cleanup', async () => {
    const abortController = new AbortController();
    const observed: SessionResult[] = [];
    await runWorkerLifecycle({
      execute: async () => completedResult(),
      cleanup: [
        () => { abortController.abort(); throw new Error('MCP cleanup failed'); },
        (result) => { observed.push(result); },
      ],
      postResult: (result) => { observed.push(result); },
      closePort: () => { /* Result and log consistency are asserted below. */ },
      abortSignal: abortController.signal,
    });

    expect(observed).toHaveLength(2);
    for (const result of observed) {
      expect(result).toMatchObject({ outcome: 'error', error: { message: 'MCP cleanup failed' } });
    }
  });

  it.each(['cancelled', 'error'] as const)('marks the final completed log phase failed for a late %s outcome', (outcome) => {
    const specDir = mkdtempSync(join(tmpdir(), 'forge-worker-logs-'));
    try {
      const writer = new TaskLogWriter(specDir, 'lifecycle');
      writer.startPhase('planning');
      writer.endPhase('planning', true);
      writer.startPhase('coding');
      writer.endPhase('coding', true);
      const result = { ...completedResult(), outcome };

      finalizeWorkerLogs(writer, result);

      expect(writer.getData().phases.planning.status).toBe('completed');
      expect(writer.getData().phases.coding.status).toBe('failed');
    } finally {
      rmSync(specDir, { recursive: true, force: true });
    }
  });
});
