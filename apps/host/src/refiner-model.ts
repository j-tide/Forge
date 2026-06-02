import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexExecutorAdapter } from '@forge/executor-codex';
import { ProcessController } from '@forge/process';
import type { RefinerModel } from '@forge/refiner';
import { logHost } from './log.js';

/** Dedicated read-only Codex transport. It receives a bounded summary, never the project path. */
export class CodexRefinerModel implements RefinerModel {
  readonly providerId = 'codex-app-server';
  private readonly adapter: CodexExecutorAdapter;
  private modelId: string | null = null;
  constructor(controller: ProcessController) { this.adapter = new CodexExecutorAdapter(controller); }

  async request(prompt: string, outputSchema: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    try { return await this.run(prompt, outputSchema, signal); }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' && /^EXECUTOR_[A-Z_]+$/.test(error.code) ? error.code :
        error instanceof Error && ['REFINER_UNAVAILABLE', 'REFINER_FAILED'].includes(error.message) ?
          error.message : 'REFINER_FAILED';
      logHost('refiner_model_failed', { code });
      throw error;
    }
  }

  private async run(prompt: string, outputSchema: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    if (!this.modelId) {
      const capability = await this.adapter.probe();
      if (!capability.available || !capability.structuredOutput || !capability.readOnlyEnforced ||
        !capability.modelIds.length) throw new Error('REFINER_UNAVAILABLE');
      this.modelId = capability.modelIds[0] ?? null;
    }
    if (!this.modelId || signal.aborted) throw new Error('REFINER_UNAVAILABLE');
    const isolated = await mkdtemp(join(tmpdir(), 'forge-refiner-'));
    try {
      const handle = await this.adapter.start({ runId: randomUUID(), taskId: 'refiner', workspace: isolated,
        goal: prompt, context: [], permission: 'read-only', approval: 'never', model: this.modelId,
        outputSchema, maxDurationMs: 90_000 });
      let output: unknown = null;
      let forbiddenTool = false;
      const abort = (): void => { void handle.cancel(); };
      signal.addEventListener('abort', abort, { once: true });
      const unsubscribe = handle.subscribe((event) => {
        if (event.type === 'run.completed') output = event.structuredOutput;
        if (['command.started', 'tool.started', 'file.changed', 'approval.requested'].includes(event.type)) {
          forbiddenTool = true; void handle.cancel();
        }
      });
      try {
        if (signal.aborted) abort();
        const outcome = await handle.completion;
        if (outcome !== 'completed' || forbiddenTool || signal.aborted || output === null) {
          throw new Error('REFINER_FAILED');
        }
        return output;
      } finally { unsubscribe(); signal.removeEventListener('abort', abort); }
    } finally { await rm(isolated, { recursive: true, force: true }); }
  }

  async dispose(): Promise<void> { await this.adapter.dispose(); }
}
