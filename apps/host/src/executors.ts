import { CodexExecutorAdapter } from '@forge/executor-codex';
import { ProcessController } from '@forge/process';
import { ExecutorEventGate, executorEventSchema,
  type ExecutorAdapter, type ExecutorEvent, type ExecutorRunHandle, type ExecutorRunRequest } from '@forge/plugin-api';

/** Host-only registry. It does not create Task/Run business state or expose Renderer commands. */
export class HostExecutorRegistry {
  private readonly adapters = new Map<string, ExecutorAdapter>();
  private readonly listeners = new Set<(event: ExecutorEvent) => void>();
  private readonly subscriptions = new Map<string, () => void>();
  private stopping = false;

  constructor(readonly processes: ProcessController = new ProcessController()) {
    this.adapters.set('executor.codex', new CodexExecutorAdapter(processes));
  }

  resolve(id: string): ExecutorAdapter | null { return this.adapters.get(id) ?? null; }

  onEvent(listener: (event: ExecutorEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(id: string, request: ExecutorRunRequest): Promise<ExecutorRunHandle> {
    if (this.stopping) throw new Error('Host Executor Registry is stopping');
    if (this.subscriptions.has(request.runId)) throw new Error('Executor Run ID is already active');
    const adapter = this.resolve(id);
    if (!adapter) throw new Error('Executor is not registered');
    const handle = await adapter.start(request);
    const gate = new ExecutorEventGate(request.runId);
    let invalid = false;
    const unsubscribe = handle.subscribe((event) => {
      if (invalid) return;
      let checked: ExecutorEvent;
      try { checked = gate.accept(event); }
      catch {
        invalid = true;
        checked = executorEventSchema.parse({ type: 'run.failed', runId: request.runId,
          sequence: gate.nextSequence, timestamp: new Date().toISOString(),
          code: 'EXECUTOR_PROTOCOL_ERROR', message: 'Executor event validation failed' });
        void handle.cancel().catch(() => {});
      }
      for (const listener of this.listeners) {
        try { listener(checked); } catch { /* A diagnostic subscriber cannot break the adapter. */ }
      }
    });
    this.subscriptions.set(request.runId, unsubscribe);
    void handle.completion.finally(() => {
      unsubscribe();
      this.subscriptions.delete(request.runId);
    }).catch(() => {});
    return handle;
  }

  async dispose(): Promise<void> {
    this.stopping = true;
    const results = await Promise.allSettled([...this.adapters.values()].map((adapter) => adapter.dispose()));
    const processReports = await this.processes.dispose();
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
    this.listeners.clear();
    if (results.some((result) => result.status === 'rejected') || processReports.some((item) => !item.confirmed)) {
      throw new Error('Host Executor Registry could not confirm process cleanup');
    }
  }
}
