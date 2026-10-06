import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

import type { AgentExecutorConfig } from '../types';

// =============================================================================
// Mocks
// =============================================================================

const mockSpawn = vi.fn();
const mockTerminate = vi.fn().mockResolvedValue(undefined);
const createdBridges: Array<EventEmitter & { active: boolean }> = [];
let mockExitOnTerminate = true;

vi.mock('../worker-bridge', () => ({
  WorkerBridge: class extends EventEmitter {
    active = false;
    constructor() {
      super();
      createdBridges.push(this);
    }
    spawn = (...args: unknown[]) => {
      mockSpawn(...args);
      this.active = true;
    };
    terminate = async () => {
      await mockTerminate();
      if (mockExitOnTerminate) this.active = false;
    };
    get isActive() {
      return this.active;
    }
  },
}));

// Import after mocks
import { AgentExecutor } from '../executor';

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

// =============================================================================
// Tests
// =============================================================================

describe('AgentExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTerminate.mockResolvedValue(undefined);
    createdBridges.length = 0;
    mockExitOnTerminate = true;
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts and sets isRunning to true', () => {
      const executor = new AgentExecutor(createConfig());
      executor.start();

      expect(mockSpawn).toHaveBeenCalled();
      expect(executor.isRunning).toBe(true);
    });

    it('throws if started twice while running', () => {
      const executor = new AgentExecutor(createConfig());
      executor.start();

      expect(() => executor.start()).toThrow('already running');
    });

    it('stops and sets isRunning to false', async () => {
      const executor = new AgentExecutor(createConfig());
      executor.start();

      await executor.stop();

      expect(mockTerminate).toHaveBeenCalled();
      expect(executor.isRunning).toBe(false);
    });

    it('stop is safe when not running', async () => {
      const executor = new AgentExecutor(createConfig());
      await expect(executor.stop()).resolves.toBeUndefined();
    });

    it('keeps tracking a Worker that has not exited after termination returns', async () => {
      mockExitOnTerminate = false;
      const executor = new AgentExecutor(createConfig());
      executor.start();

      await executor.stop();

      expect(executor.isRunning).toBe(true);
      expect(() => executor.start()).toThrow('already running');
      createdBridges[0].active = false;
      createdBridges[0].emit('exit', 'task-123', 1, 'task-execution');
      expect(executor.isRunning).toBe(false);
    });

    it.each(['stop', 'retry'] as const)('keeps tracking and rejects %s if termination fails', async (operation) => {
      mockTerminate.mockRejectedValue(new Error('worker termination failed'));
      const executor = new AgentExecutor(createConfig());
      executor.start();

      await expect(executor[operation]()).rejects.toThrow('worker termination failed');

      expect(executor.isRunning).toBe(true);
      expect(createdBridges).toHaveLength(1);
      expect(() => executor.start()).toThrow('already running');
      mockTerminate.mockResolvedValue(undefined);
      await executor.stop();
      expect(executor.isRunning).toBe(false);
    });

    it('retry stops then starts', async () => {
      const executor = new AgentExecutor(createConfig());
      executor.start();
      mockSpawn.mockClear();

      await executor.retry();

      expect(mockTerminate).toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  describe('config', () => {
    it('exposes taskId', () => {
      const executor = new AgentExecutor(createConfig({ taskId: 'my-task' }));
      expect(executor.taskId).toBe('my-task');
    });

    it('updateConfig merges new values', () => {
      const executor = new AgentExecutor(createConfig({ taskId: 'old' }));
      executor.updateConfig({ taskId: 'new' });
      expect(executor.taskId).toBe('new');
    });
  });

  // ---------------------------------------------------------------------------
  // Event forwarding
  // ---------------------------------------------------------------------------

  describe('event forwarding', () => {
    it('cleans up bridge reference on exit event from bridge', async () => {
      const executor = new AgentExecutor(createConfig());
      executor.start();

      // Simulate the bridge becoming inactive (as if worker exited)
      createdBridges[0].active = false;
      createdBridges[0].emit('exit', 'task-123', 0, 'task-execution');

      expect(executor.isRunning).toBe(false);
    });

    it('keeps a new session when an older bridge emits a late exit', () => {
      const executor = new AgentExecutor(createConfig());
      executor.start();
      const oldBridge = createdBridges[0];
      oldBridge.active = false;
      executor.start();

      oldBridge.emit('exit', 'task-123', 0, 'task-execution');

      expect(executor.isRunning).toBe(true);
      expect(() => executor.start()).toThrow('already running');
    });

    it('keeps a session started by an exit listener while an earlier stop resolves', async () => {
      let resolveTermination!: () => void;
      mockTerminate.mockImplementationOnce(() => new Promise<void>(resolve => {
        resolveTermination = resolve;
      }));
      const executor = new AgentExecutor(createConfig());
      executor.start();
      const oldBridge = createdBridges[0];
      const stopping = executor.stop();
      executor.once('exit', () => executor.start());

      oldBridge.active = false;
      oldBridge.emit('exit', 'task-123', 0, 'task-execution');
      resolveTermination();
      await stopping;

      expect(createdBridges).toHaveLength(2);
      expect(executor.isRunning).toBe(true);
      await executor.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // AgentManagerEvents compatibility
  // ---------------------------------------------------------------------------

  describe('AgentManagerEvents compatibility', () => {
    it('supports all required event types', () => {
      const executor = new AgentExecutor(createConfig());

      // Verify we can register all AgentManagerEvents without error
      const events = ['log', 'error', 'exit', 'execution-progress', 'task-event'] as const;
      for (const event of events) {
        const handler = vi.fn();
        executor.on(event, handler);
        // Emit directly to verify listener is registered
        executor.emit(event, 'task-123', 'test-data');
        expect(handler).toHaveBeenCalled();
      }
    });
  });
});
