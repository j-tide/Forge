import type { SessionResult } from '../session/types';
import type { TaskLogWriter } from '../logging/task-log-writer';

interface WorkerLifecycleOptions {
  execute: () => Promise<SessionResult>;
  cleanup: Array<(result: SessionResult) => void | Promise<void>>;
  postResult: (result: SessionResult) => void;
  closePort: () => void;
  abortSignal: AbortSignal;
}

/** Publish the terminal result after owned resources are cleaned up, then release the port. */
export async function runWorkerLifecycle(options: WorkerLifecycleOptions): Promise<void> {
  const startedAt = Date.now();
  let result: SessionResult;

  try {
    try {
      result = await options.execute();
    } catch (error) {
      result = {
        outcome: 'error',
        error: { code: 'worker_error', message: errorMessage(error), retryable: false },
        stepsExecuted: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        messages: [],
        durationMs: Date.now() - startedAt,
        toolCallCount: 0,
      };
    }

    let cleanupFailure: string | undefined;
    for (const cleanup of options.cleanup) {
      result = resolveOutcome(result, options.abortSignal, cleanupFailure);
      try {
        await cleanup(result);
      } catch (error) {
        cleanupFailure ??= errorMessage(error);
      }
    }
    result = resolveOutcome(result, options.abortSignal, cleanupFailure);

    options.postResult(result);
  } finally {
    options.closePort();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveOutcome(result: SessionResult, signal: AbortSignal, cleanupFailure?: string): SessionResult {
  if (cleanupFailure !== undefined) {
    return {
      ...result,
      outcome: 'error',
      error: { code: 'worker_cleanup_error', message: cleanupFailure, retryable: false },
    };
  }
  if (signal.aborted || result.outcome === 'cancelled') {
    return { ...result, outcome: 'cancelled', error: undefined };
  }
  return result;
}

/** Reconcile the final log phase when cancellation or cleanup failure arrives after execution. */
export function finalizeWorkerLogs(writer: TaskLogWriter | null, result: SessionResult): void {
  if (!writer) return;
  const success = result.outcome === 'completed' || result.outcome === 'max_steps' || result.outcome === 'context_window';
  const data = writer.getData();
  let latestPhase: 'planning' | 'coding' | 'validation' | undefined;
  let latestStart = '';
  for (const phase of ['planning', 'coding', 'validation'] as const) {
    const phaseData = data.phases[phase];
    if (phaseData?.started_at && phaseData.started_at >= latestStart) {
      latestPhase = phase;
      latestStart = phaseData.started_at;
    }
    if (phaseData?.status === 'active') {
      writer.endPhase(phase === 'validation' ? 'qa' : phase, success);
    }
  }
  if (!success && latestPhase && data.phases[latestPhase].status === 'completed') {
    writer.endPhase(latestPhase === 'validation' ? 'qa' : latestPhase, false);
  }
  writer.setSubtask(undefined);
  writer.flush();
}
