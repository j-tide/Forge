import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import type { AgentExecutorConfig, WorkerMessage } from '../types';
import type { SessionResult } from '../../session/types';

// =============================================================================
// Mocks
// =============================================================================

// Track created workers
const createdWorkers: EventEmitter[] = [];

vi.mock('worker_threads', () => {
  const { EventEmitter: EE } = require('events') as typeof import('events');

  class MockWorkerImpl extends EE {
    postMessage = vi.fn();
    terminate = vi.fn(async () => {
      this.emit('exit', 1);
      return 1;
    });
    workerData: unknown;
    constructor(_path: string, opts?: { workerData?: unknown }) {
      super();
      this.workerData = opts?.workerData;
      createdWorkers.push(this);
    }
  }

  return { Worker: MockWorkerImpl };
});

function getWorker(): EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> } {
  const w = createdWorkers[createdWorkers.length - 1];
  if (!w) throw new Error('No worker created');
  return w as EventEmitter & { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> };
}

vi.mock('electron', () => ({
  app: { isPackaged: false },
}));

vi.mock('url', () => ({
  fileURLToPath: (url: string) => url.replace('file://', ''),
}));

// Mock ProgressTracker
const mockProcessEvent = vi.fn();
vi.mock('../../session/progress-tracker', () => ({
  ProgressTracker: class {
    processEvent = mockProcessEvent;
    state = {
      currentPhase: 'initializing' as const,
      currentSubtask: null,
      currentMessage: 'Starting...',
      completedPhases: [],
    };
  },
}));

// Import after mocks
import { WorkerBridge } from '../worker-bridge';

// =============================================================================
// Helpers
// =============================================================================

function createConfig(overrides: Partial<AgentExecutorConfig> = {}): AgentExecutorConfig {
  return {
    taskId: 'task-123',
    projectId: 'proj-456',
    processType: 'task-execution',
    session: {
      agentType: 'coder',
      systemPrompt: 'test',
      initialMessages: [{ role: 'user', content: 'hello' }],
      maxSteps: 10,
      specDir: '/specs',
      projectDir: '/project',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      toolContext: { cwd: '/project', projectDir: '/project', specDir: '/specs' },
    },
    ...overrides,
  };
}

function createSessionResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    outcome: 'completed',
    stepsExecuted: 5,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    messages: [],
    durationMs: 3000,
    toolCallCount: 3,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('WorkerBridge', () => {
  let bridge: WorkerBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    createdWorkers.length = 0;
    bridge = new WorkerBridge();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------

  describe('spawn', () => {
    it('creates a worker and sets isActive to true', () => {
      bridge.spawn(createConfig());
      expect(bridge.isActive).toBe(true);
      expect(createdWorkers.length).toBe(1);
    });

    it('throws if worker already active', () => {
      bridge.spawn(createConfig());
      expect(() => bridge.spawn(createConfig())).toThrow('already has an active worker');
    });
  });

  // ---------------------------------------------------------------------------
  // Message relay
  // ---------------------------------------------------------------------------

  describe('message relay', () => {
    it('emits log events from worker log messages', () => {
      const handler = vi.fn();
      bridge.on('log', handler);
      bridge.spawn(createConfig());

      const msg: WorkerMessage = { type: 'log', taskId: 'task-123', data: 'hello', projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', 'hello', 'proj-456');
    });

    it('emits error events from worker error messages', () => {
      const handler = vi.fn();
      bridge.on('error', handler);
      bridge.spawn(createConfig());

      const msg: WorkerMessage = { type: 'error', taskId: 'task-123', data: 'fail', projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', 'fail', 'proj-456');
    });

    it('emits execution-progress events from worker progress messages', () => {
      const handler = vi.fn();
      bridge.on('execution-progress', handler);
      bridge.spawn(createConfig());

      const progressData = { phase: 'building' as const, phaseProgress: 50, overallProgress: 25 };
      const msg: WorkerMessage = { type: 'execution-progress', taskId: 'task-123', data: progressData as never, projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', progressData, 'proj-456');
    });

    it('feeds stream-events to progress tracker and emits progress', () => {
      const handler = vi.fn();
      bridge.on('execution-progress', handler);
      bridge.spawn(createConfig());

      const streamEvent = { type: 'tool-call' as const, toolName: 'bash', args: {} };
      const msg: WorkerMessage = { type: 'stream-event', taskId: 'task-123', data: streamEvent as never, projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(mockProcessEvent).toHaveBeenCalledWith(streamEvent);
      expect(handler).toHaveBeenCalled();
    });

    it('emits log for text-delta stream events', () => {
      const handler = vi.fn();
      bridge.on('log', handler);
      bridge.spawn(createConfig());

      const streamEvent = { type: 'text-delta' as const, text: 'some output' };
      const msg: WorkerMessage = { type: 'stream-event', taskId: 'task-123', data: streamEvent as never };
      getWorker().emit('message', msg);

      expect(handler).toHaveBeenCalledWith('task-123', 'some output', undefined);
    });
  });

  // ---------------------------------------------------------------------------
  // Result handling
  // ---------------------------------------------------------------------------

  describe('result handling', () => {
    it('maps completed outcome to exit code 0', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'completed' });
      const msg: WorkerMessage = { type: 'result', taskId: 'task-123', data: result, projectId: 'proj-456' };
      getWorker().emit('message', msg);

      expect(exitHandler).not.toHaveBeenCalled();
      expect(bridge.isActive).toBe(true);
      expect(bridge.workerInstance).toBe(getWorker());
      expect(() => bridge.spawn(createConfig())).toThrow('already has an active worker');
      getWorker().emit('exit', 0);

      expect(exitHandler).toHaveBeenCalledWith('task-123', 0, 'task-execution', 'proj-456');
      expect(bridge.isActive).toBe(false);
    });

    it('maps max_steps outcome to exit code 0', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'max_steps' });
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });
      getWorker().emit('exit', 0);

      expect(exitHandler).toHaveBeenCalledWith('task-123', 0, 'task-execution', 'proj-456');
    });

    it('maps error outcome to exit code 1', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.on('error', vi.fn()); // Prevent unhandled error throw
      bridge.on('log', vi.fn());
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'error', error: { message: 'boom', code: 'unknown', retryable: false } });
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });
      getWorker().emit('exit', 0);

      expect(exitHandler).toHaveBeenCalledWith('task-123', 1, 'task-execution', 'proj-456');
    });

    it('emits error event when result has an error', () => {
      const errorHandler = vi.fn();
      bridge.on('error', errorHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult({ outcome: 'error', error: { message: 'boom', code: 'unknown', retryable: false } });
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });

      expect(errorHandler).toHaveBeenCalledWith('task-123', 'boom', undefined);
    });

    it('logs summary before exit', () => {
      const logHandler = vi.fn();
      bridge.on('log', logHandler);
      bridge.spawn(createConfig());

      const result = createSessionResult();
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: result });

      expect(logHandler).toHaveBeenCalledWith(
        'task-123',
        expect.stringContaining('Session complete'),
        undefined,
      );
    });

    it('ignores duplicate terminal results and emits one exit', () => {
      const exitHandler = vi.fn();
      const logHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.on('log', logHandler);
      bridge.spawn(createConfig());
      const worker = getWorker();

      worker.emit('message', { type: 'result', taskId: 'task-123', data: createSessionResult() });
      worker.emit('message', { type: 'result', taskId: 'task-123', data: createSessionResult() });
      worker.emit('exit', 0);
      worker.emit('exit', 0);

      expect(logHandler).toHaveBeenCalledTimes(1);
      expect(exitHandler).toHaveBeenCalledTimes(1);
    });

    it('uses a non-zero thread exit even after a completed result', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: createSessionResult() });
      getWorker().emit('exit', 2);

      expect(exitHandler).toHaveBeenCalledWith('task-123', 2, 'task-execution', 'proj-456');
    });

    it('keeps cancelled results free of fatal error events', () => {
      const errorHandler = vi.fn();
      const exitHandler = vi.fn();
      bridge.on('error', errorHandler);
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());
      getWorker().emit('message', { type: 'result', taskId: 'task-123', data: createSessionResult({ outcome: 'cancelled' }) });
      getWorker().emit('exit', 0);

      expect(errorHandler).not.toHaveBeenCalled();
      expect(exitHandler).toHaveBeenCalledWith('task-123', 1, 'task-execution', 'proj-456');
    });
  });

  // ---------------------------------------------------------------------------
  // Worker crash handling
  // ---------------------------------------------------------------------------

  describe('crash handling', () => {
    it('retains a crashed worker until its exit event', () => {
      const errorHandler = vi.fn();
      const exitHandler = vi.fn();
      bridge.on('error', errorHandler);
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      getWorker().emit('error', new Error('Worker crashed'));

      expect(errorHandler).toHaveBeenCalledWith('task-123', 'Worker crashed', 'proj-456');
      expect(bridge.isActive).toBe(true);
      getWorker().emit('exit', 1);
      expect(exitHandler).toHaveBeenCalledWith('task-123', 1, 'task-execution', 'proj-456');
      expect(bridge.isActive).toBe(false);
    });

    it('emits exit on worker exit event (non-zero code)', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      getWorker().emit('exit', 1);

      expect(exitHandler).toHaveBeenCalledWith('task-123', 1, 'task-execution', 'proj-456');
      expect(bridge.isActive).toBe(false);
    });

    it('emits terminal exit only when the worker exits', () => {
      const exitHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.spawn(createConfig());

      const worker = getWorker();
      const result = createSessionResult();
      worker.emit('message', { type: 'result', taskId: 'task-123', data: result });
      expect(exitHandler).not.toHaveBeenCalled();

      worker.emit('exit', 0);
      expect(exitHandler).toHaveBeenCalledTimes(1);
      expect(bridge.isActive).toBe(false);
    });

    it('ignores stale events after a replacement worker starts', () => {
      const exitHandler = vi.fn();
      const errorHandler = vi.fn();
      bridge.on('exit', exitHandler);
      bridge.on('error', errorHandler);
      bridge.spawn(createConfig());
      const oldWorker = getWorker();
      oldWorker.emit('exit', 0);
      bridge.spawn(createConfig({ taskId: 'next-task' }));
      const nextWorker = getWorker();

      oldWorker.emit('exit', 1);
      oldWorker.emit('error', new Error('late error'));
      oldWorker.emit('message', { type: 'result', taskId: 'task-123', data: createSessionResult() });

      expect(bridge.workerInstance).toBe(nextWorker);
      expect(bridge.isActive).toBe(true);
      expect(exitHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Termination
  // ---------------------------------------------------------------------------

  describe('terminate', () => {
    it('posts abort message and terminates worker', async () => {
      vi.useFakeTimers();
      bridge.spawn(createConfig());
      const worker = getWorker();

      const terminating = bridge.terminate();
      expect(bridge.isActive).toBe(true);
      await vi.runAllTimersAsync();
      await terminating;

      expect(worker.postMessage).toHaveBeenCalledWith({ type: 'abort' });
      expect(worker.terminate).toHaveBeenCalled();
      expect(bridge.isActive).toBe(false);
    });

    it('handles termination when no worker is active', async () => {
      await expect(bridge.terminate()).resolves.toBeUndefined();
    });

    it('handles postMessage failure on dead worker', async () => {
      vi.useFakeTimers();
      bridge.spawn(createConfig());
      getWorker().postMessage.mockImplementation(() => {
        throw new Error('Worker already dead');
      });

      const terminating = bridge.terminate();
      await vi.runAllTimersAsync();
      await expect(terminating).resolves.toBeUndefined();
    });

    it('allows abort cleanup to finish before forcing termination', async () => {
      vi.useFakeTimers();
      bridge.spawn(createConfig());
      const worker = getWorker();
      const terminating = bridge.terminate();
      worker.emit('message', { type: 'result', taskId: 'task-123', data: createSessionResult({ outcome: 'cancelled' }) });
      worker.emit('exit', 0);

      await terminating;

      expect(worker.terminate).not.toHaveBeenCalled();
      expect(bridge.isActive).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('shares concurrent termination until the captured worker exits', async () => {
      vi.useFakeTimers();
      bridge.spawn(createConfig());
      const worker = getWorker();
      let finishTermination!: (code: number) => void;
      worker.terminate.mockImplementation(() => new Promise<number>((resolve) => { finishTermination = resolve; }));
      const first = bridge.terminate();
      const second = bridge.terminate();
      await vi.runAllTimersAsync();

      expect(bridge.workerInstance).toBe(worker);
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(worker.postMessage).toHaveBeenCalledTimes(1);
      worker.emit('exit', 1);
      bridge.spawn(createConfig({ taskId: 'next-task' }));
      const nextWorker = getWorker();
      finishTermination(1);
      await Promise.all([first, second]);

      expect(bridge.workerInstance).toBe(nextWorker);
    });

    it('keeps tracking when force termination rejects without an exit', async () => {
      vi.useFakeTimers();
      bridge.spawn(createConfig());
      const worker = getWorker();
      worker.terminate.mockRejectedValue(new Error('termination failed'));
      const terminating = bridge.terminate().catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(await terminating).toEqual(new Error('termination failed'));

      expect(bridge.workerInstance).toBe(worker);
      worker.emit('exit', 1);
      expect(bridge.isActive).toBe(false);
    });

    it('allows retrying force termination after a failure', async () => {
      vi.useFakeTimers();
      bridge.spawn(createConfig());
      const worker = getWorker();
      worker.terminate.mockRejectedValueOnce(new Error('termination failed'));
      const first = bridge.terminate().catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(await first).toEqual(new Error('termination failed'));

      const retry = bridge.terminate();
      await vi.runAllTimersAsync();
      await retry;

      expect(worker.terminate).toHaveBeenCalledTimes(2);
      expect(bridge.isActive).toBe(false);
    });
  });
});
