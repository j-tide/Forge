/**
 * Worker Bridge
 * =============
 *
 * Main-thread bridge that spawns a Worker thread and relays `postMessage()`
 * events to an EventEmitter matching the `AgentManagerEvents` interface.
 *
 * This allows the existing agent management system (agent-process.ts,
 * agent-events.ts) to consume worker thread events transparently — the UI
 * cannot distinguish between a Python subprocess and a TS worker thread.
 */

import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { app } from 'electron';

import type { AgentManagerEvents, ExecutionProgressData, ProcessType } from '../../agent/types';
import type { TaskEventPayload } from '../../agent/task-event-schema';
import type {
  WorkerConfig,
  WorkerMessage,
  AgentExecutorConfig,
} from './types';
import type { SessionResult } from '../session/types';
import { ProgressTracker } from '../session/progress-tracker';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WorkerLifecycle {
  worker: Worker;
  taskId: string;
  projectId?: string;
  processType: ProcessType;
  resultReceived: boolean;
  resultExitCode?: number;
  terminationRequested: boolean;
  terminationPromise?: Promise<void>;
  exited: Promise<void>;
  resolveExit: () => void;
}

// Stdio MCP clients may need two 2-second waits to stop their child processes.
const ABORT_GRACE_MS = 5000;

// =============================================================================
// Worker Path Resolution
// =============================================================================

/**
 * Resolve the path to the worker entry point.
 * Handles both dev (source via electron-vite) and production (bundled) paths.
 */
function resolveWorkerPath(): string {
  if (app.isPackaged) {
    // Production: worker is inside app.asar at out/main/ai/agent/worker.js
    return path.join(process.resourcesPath, 'app.asar', 'out', 'main', 'ai', 'agent', 'worker.js');
  }
  // Dev: electron-vite outputs worker at out/main/ai/agent/worker.js
  // because the Rollup input key is 'ai/agent/worker'.
  // __dirname resolves to out/main/ at runtime, so we need the subdirectory.
  return path.join(__dirname, 'ai', 'agent', 'worker.js');
}

// =============================================================================
// WorkerBridge
// =============================================================================

/**
 * Bridges a worker thread to the AgentManagerEvents interface.
 *
 * Usage:
 * ```ts
 * const bridge = new WorkerBridge();
 * bridge.on('log', (taskId, log) => { ... });
 * bridge.on('exit', (taskId, code, processType) => { ... });
 * await bridge.spawn(config);
 * ```
 */
export class WorkerBridge extends EventEmitter {
  private lifecycle: WorkerLifecycle | null = null;
  private progressTracker: ProgressTracker = new ProgressTracker();

  /**
   * Spawn a worker thread with the given configuration.
   * The worker will immediately begin executing the agent session.
   *
   * @param config - Executor configuration (task ID, session params, etc.)
   */
  spawn(config: AgentExecutorConfig): void {
    if (this.lifecycle) {
      throw new Error('WorkerBridge already has an active worker. Call terminate() first.');
    }

    this.progressTracker = new ProgressTracker();

    const workerConfig: WorkerConfig = {
      taskId: config.taskId,
      projectId: config.projectId,
      processType: config.processType,
      session: config.session,
    };

    const workerPath = resolveWorkerPath();

    const worker = new Worker(workerPath, {
      workerData: workerConfig,
    });
    let resolveExit!: () => void;
    const lifecycle: WorkerLifecycle = {
      worker,
      taskId: config.taskId,
      projectId: config.projectId,
      processType: config.processType,
      resultReceived: false,
      terminationRequested: false,
      exited: new Promise<void>((resolve) => { resolveExit = resolve; }),
      resolveExit: () => resolveExit(),
    };
    this.lifecycle = lifecycle;

    worker.on('message', (message: WorkerMessage) => {
      if (this.lifecycle === lifecycle) this.handleWorkerMessage(message, lifecycle);
    });

    worker.on('error', (error: Error) => {
      if (this.lifecycle === lifecycle) {
        this.emitTyped('error', lifecycle.taskId, error.message, lifecycle.projectId);
      }
    });

    worker.on('exit', (code: number) => {
      lifecycle.resolveExit();
      if (this.lifecycle !== lifecycle) return;
      this.lifecycle = null;
      if (!lifecycle.terminationRequested) {
        const exitCode = code !== 0 ? code : lifecycle.resultExitCode ?? 0;
        this.emitTyped('exit', lifecycle.taskId, exitCode, lifecycle.processType, lifecycle.projectId);
      }
    });
  }

  /**
   * Terminate the worker thread.
   * Sends an abort message first for graceful shutdown, then terminates.
   */
  terminate(): Promise<void> {
    const lifecycle = this.lifecycle;
    if (!lifecycle) return Promise.resolve();
    if (lifecycle.terminationPromise) return lifecycle.terminationPromise;
    lifecycle.terminationRequested = true;
    lifecycle.terminationPromise = this.terminateWorker(lifecycle);
    return lifecycle.terminationPromise;
  }

  private async terminateWorker(lifecycle: WorkerLifecycle): Promise<void> {
    // Exit listeners were installed during spawn, before the abort can complete.
    try {
      lifecycle.worker.postMessage({ type: 'abort' });
    } catch {
      // Worker may already be dead
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const exited = await Promise.race([
      lifecycle.exited.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), ABORT_GRACE_MS);
      }),
    ]);
    if (timeout !== undefined) clearTimeout(timeout);
    if (exited || this.lifecycle !== lifecycle) return;

    try {
      await lifecycle.worker.terminate();
    } catch (error) {
      // Keep tracking, surface the failure, and allow a later termination retry.
      if (this.lifecycle === lifecycle) lifecycle.terminationPromise = undefined;
      throw error;
    }
  }

  /** Whether the worker is currently active */
  get isActive(): boolean {
    return this.lifecycle !== null;
  }

  /** Get the underlying Worker instance (for advanced use) */
  get workerInstance(): Worker | null {
    return this.lifecycle?.worker ?? null;
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  private handleWorkerMessage(message: WorkerMessage, lifecycle: WorkerLifecycle): void {
    switch (message.type) {
      case 'log':
        this.emitTyped('log', message.taskId, message.data, message.projectId);
        break;

      case 'error':
        this.emitTyped('error', message.taskId, message.data, message.projectId);
        break;

      case 'execution-progress':
        this.emitTyped('execution-progress', message.taskId, message.data, message.projectId);
        break;

      case 'stream-event':
        // Feed the progress tracker and emit progress updates
        this.progressTracker.processEvent(message.data);
        this.emitProgressFromTracker(message.taskId, message.projectId);
        // Also forward raw log for text events
        if (message.data.type === 'text-delta') {
          this.emitTyped('log', message.taskId, message.data.text, message.projectId);
        }
        break;

      case 'task-event':
        this.emitTyped('task-event', message.taskId, message.data as TaskEventPayload, message.projectId);
        break;

      case 'result':
        this.handleResult(message.taskId, message.data, lifecycle, message.projectId);
        break;
    }
  }

  /**
   * Convert ProgressTracker state into an ExecutionProgressData event
   * and emit it to listeners.
   */
  private emitProgressFromTracker(taskId: string, projectId?: string): void {
    const state = this.progressTracker.state;
    const progressData: ExecutionProgressData = {
      phase: state.currentPhase,
      phaseProgress: 0, // Detailed progress calculated by UI from phase
      overallProgress: 0,
      currentSubtask: state.currentSubtask ?? undefined,
      message: state.currentMessage,
      completedPhases: state.completedPhases as ExecutionProgressData['completedPhases'],
    };
    this.emitTyped('execution-progress', taskId, progressData, projectId);
  }

  /**
   * Handle the final session result from the worker.
   * Maps SessionResult.outcome to an exit code.
   */
  private handleResult(taskId: string, result: SessionResult, lifecycle: WorkerLifecycle, projectId?: string): void {
    if (lifecycle.resultReceived) return;
    lifecycle.resultReceived = true;
    // Map outcome to exit code
    lifecycle.resultExitCode = result.outcome === 'completed' || result.outcome === 'max_steps' || result.outcome === 'context_window' ? 0 : 1;

    // Log the result summary
    const summary = `Session complete: outcome=${result.outcome}, steps=${result.stepsExecuted}, tools=${result.toolCallCount}, duration=${result.durationMs}ms`;
    this.emitTyped('log', taskId, summary, projectId);

    if (result.error && result.outcome !== 'cancelled') {
      this.emitTyped('error', taskId, result.error.message, projectId);
    }

    // The actual exit completes tracking after the worker has released resources.
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Type-safe emit that matches AgentManagerEvents signatures.
   */
  private emitTyped<K extends keyof AgentManagerEvents>(
    event: K,
    ...args: Parameters<AgentManagerEvents[K]>
  ): void {
    this.emit(event, ...args);
  }
}
