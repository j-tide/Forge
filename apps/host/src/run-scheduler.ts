import { runStartIntentSchema, type RunStartIntent, type RunView } from '@forge/contracts';
import { randomUUID } from 'node:crypto';
import { scheduledExecutorRunRequestSchema,
  ExecutorError, type ScheduledExecutorRunRequest, type ExecutorRunHandle } from '@forge/plugin-api';
import { retry429 } from '@forge/core/run';
import { executorContext } from '@forge/core/context';
import type { ForgePersistence } from '@forge/persistence';
import type { ProcessController } from '@forge/process';
import type { WorkspaceDescriptor, WorkspaceManager } from '@forge/workspace';
import { HostExecutorRegistry } from './executors.js';
import { HostRunResources } from './run-resources.js';
import { captureRunDiff, RunObservationRecorder } from './run-observation.js';

export async function launchWithFiniteRateLimitRetry<T>(start: () => Promise<T>, deadlineAt: number,
  maxRetries: number, sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)), cancelled: () => boolean = () => false): Promise<T> {
  let retryNo = 0;
  while (true) {
    if (cancelled()) throw new Error('Run cancellation requested before Executor launch');
    try { return await start(); }
    catch (error) {
      if (cancelled()) throw error;
      const evidence = error instanceof ExecutorError && error.code === 'EXECUTOR_RATE_LIMITED'
        ? error.retryEvidence : undefined;
      const delay = evidence ? retry429({ status: evidence.httpStatus, sideEffect: evidence.sideEffect,
        retryNo, maxRetries, remainingDurationMs: deadlineAt - Date.now() }) : null;
      if (delay === null) throw error;
      retryNo += 1;
      await sleep(delay);
    }
  }
}

type ActiveRun = { projectId: string; attemptId: string; begun: boolean;
  cancelRequested: boolean; cancelSignal: Promise<void>; signalCancel: () => void;
  cancelOutcome: Promise<'cancelled'> | null; handle: ExecutorRunHandle | null;
  done: Promise<RunView>; resolveDone: (run: RunView) => void };

const cancellationGraceMs = 4_000;

/** One-node P2 scheduler. Host-only; no Renderer command or workflow orchestration. */
export class HostRunScheduler {
  private readonly active = new Map<string, ActiveRun>();
  private accepting = true;
  constructor(private readonly storage: ForgePersistence, private readonly resources: HostRunResources,
    private readonly workspaces: WorkspaceManager, private readonly processes: ProcessController,
    private readonly executors: HostExecutorRegistry) {}

  /** No public Renderer channel exists yet. A caller receives the durable terminal result. */
  cancel(projectId: string, runId: string, reason: 'user' | 'timeout' | 'shutdown' = 'user'):
    Promise<RunView> {
    const active = this.active.get(runId);
    if (!active || active.projectId !== projectId || !active.begun) {
      return Promise.reject(new Error('Run is not active in this Host'));
    }
    if (!active.cancelRequested) {
      this.storage.requestRunCancellation(projectId, runId, active.attemptId, reason);
      active.cancelRequested = true;
      active.signalCancel();
    }
    return active.done;
  }

  async shutdown(): Promise<RunView[]> {
    this.accepting = false;
    const runs = [...this.active.entries()].filter(([, run]) => run.begun);
    return Promise.all(runs.map(([runId, run]) => this.cancel(run.projectId, runId, 'shutdown')));
  }

  async execute(rawIntent: RunStartIntent, workspace: WorkspaceDescriptor,
    rawRequest: Omit<ScheduledExecutorRunRequest, 'workspace'>,
    onQueued?: (run: RunView) => void): Promise<RunView> {
    const intent = runStartIntentSchema.parse(rawIntent);
    if (!this.accepting) throw new Error('Run scheduler is stopping');
    const request = scheduledExecutorRunRequestSchema.parse({ ...rawRequest, workspace: workspace.rootPath });
    const config = this.storage.getRunConfig(intent.projectId, intent.runId);
    const bundle = this.storage.getContextBundle(intent.projectId, request.attempt.contextBundleId);
    if (!config || config.snapshotHash !== intent.configHash || request.runId !== intent.runId ||
      request.taskId !== intent.taskId || request.attempt.attemptId !== intent.attemptId ||
      request.attempt.workspaceLeaseId !== intent.workspaceLeaseId ||
      request.attempt.leaseEpoch !== intent.leaseEpoch ||
      request.attempt.contractRevision !== config.taskRevision ||
      request.maxDurationMs > config.budget.maxDurationMs ||
      workspace.workspaceId !== intent.workspaceId || workspace.baseRevision !== intent.baseRevision ||
      workspace.ownerRunId !== intent.runId || workspace.status !== 'busy' ||
      !bundle || bundle.runId !== intent.runId || bundle.taskId !== intent.taskId ||
      bundle.configHash !== config.snapshotHash || bundle.taskRevision !== config.taskRevision ||
      request.goal !== bundle.goal ||
      JSON.stringify(request.context) !== JSON.stringify(executorContext(bundle))) {
      throw new Error('Run, frozen configuration and workspace lease do not match');
    }
    const adapter = this.executors.resolve(intent.executorId);
    if (!adapter) throw new Error('Run Executor is not registered');
    const capability = await adapter.probe();
    if (!capability.available || !capability.workspaceControl || !capability.streaming ||
      (request.model && !capability.modelIds.includes(request.model))) {
      throw new Error('Run Executor capabilities do not satisfy the frozen request');
    }
    if (!this.accepting) throw new Error('Run scheduler is stopping');
    if (this.active.has(intent.runId)) throw new Error('Run already active in this Host');
    let signalCancel!: () => void;
    let resolveDone!: (run: RunView) => void;
    const active: ActiveRun = { projectId: intent.projectId, attemptId: intent.attemptId,
      begun: false, cancelRequested: false,
      cancelSignal: new Promise<void>((resolve) => { signalCancel = resolve; }), signalCancel: () => {},
      cancelOutcome: null, handle: null,
      done: new Promise<RunView>((resolve) => { resolveDone = resolve; }), resolveDone: () => {} };
    active.signalCancel = signalCancel;
    active.resolveDone = resolveDone;
    this.active.set(intent.runId, active);
    let begun = false;
    let handle: ExecutorRunHandle | null = null;
    let lastSequence = 0;
    let protocolFailure = false;
    let providerFailureObserved = false;
    let checkpointSequence = this.storage.latestWorkingCheckpoint(intent.projectId,intent.runId)?.sequence ?? 0;
    let checkpointError: Error | null = null;
    const recorder = new RunObservationRecorder(this.storage, intent.projectId, intent.runId,
      intent.attemptId, (error) => { checkpointError = error; void handle?.cancel().catch(() => {}); });
    let observedTokens: number | null = null;
    let observedToolStarts = 0;
    const completedActions: {text:string;sourceRef:string}[] = [];
    const openIssues: {text:string;sourceRef:string}[] = [];
    const remember = (items: {text:string;sourceRef:string}[], item: {text:string;sourceRef:string}) => {
      items.push(item); if (items.length > 16) items.shift();
    };
    const saveCheckpoint = () => {
      if (!begun || lastSequence === 0) return;
      const checkpoint = {checkpointId:randomUUID(),projectId:intent.projectId,runId:intent.runId,
        attemptId:intent.attemptId,sequence:checkpointSequence+1,
        objective:{text:config.taskContract.goal,sourceRef:`task:${intent.taskId}@${config.taskRevision}`},
        completedActions:completedActions.slice(-16),openIssues:openIssues.slice(-16),
        budget:{elapsedMs:Math.max(0,Date.now()-Date.parse(intent.createdAt)),turnsUsed:null,
          tokensUsed:observedTokens,toolCallsUsed:observedToolStarts},createdAt:new Date().toISOString()};
      this.storage.appendWorkingCheckpoint(checkpoint);
      checkpointSequence++;
    };
    const unsubscribe = this.executors.onEvent((event) => {
      if (event.runId !== intent.runId) return;
      lastSequence = Math.max(lastSequence, event.sequence);
      if (begun && !checkpointError) recorder.accept(event);
      if (event.type === 'run.failed') {
        providerFailureObserved = true;
        if (event.code === 'EXECUTOR_PROTOCOL_ERROR') protocolFailure = true;
      }
      const sourceRef = `executor-event:${event.sequence}`;
      if (event.type === 'command.started' || event.type === 'tool.started') observedToolStarts++;
      if (event.type === 'usage.updated') observedTokens = event.inputTokens+event.outputTokens;
      if (event.type === 'command.completed') remember(completedActions,{
        text:`Command exited ${event.exitCode ?? 'unknown'}`,sourceRef});
      if (event.type === 'file.changed') remember(completedActions,{
        text:`File ${event.kind} observed`,sourceRef});
      if (event.type === 'run.failed') remember(openIssues,{text:'Executor failure observed',sourceRef});
      if (event.sequence % 25 === 0 && !checkpointError) {
        try { saveCheckpoint(); } catch (error) { checkpointError = error as Error;
          void handle?.cancel().catch(() => {}); }
      }
    });
    let deadlineTimer: NodeJS.Timeout | undefined;
    try {
      const queued = this.storage.beginRun(intent); // durable intent and active-writer constraint before provider launch
      begun = true;
      active.begun = true;
      onQueued?.(queued);
      deadlineTimer = setTimeout(() => { void this.cancel(intent.projectId, intent.runId, 'timeout')
        .catch(() => {}); }, Math.max(1, Date.parse(intent.createdAt) + config.budget.maxDurationMs - Date.now()));
      handle = await launchWithFiniteRateLimitRetry(
        () => this.resources.startScheduled(intent.executorId, workspace, request),
        Date.parse(intent.createdAt) + config.budget.maxDurationMs,
        Math.min(3, Math.max(0, config.budget.maxTurns - 1)), undefined,
        () => active.cancelRequested);
      active.handle = handle;
      if (checkpointError) throw checkpointError;
      this.storage.markRunLaunched(intent.projectId, intent.runId, intent.attemptId,
        handle.providerSessionId);
      const currentHandle = handle;
      active.cancelOutcome = active.cancelSignal.then(async () => {
        let graceTimer: NodeJS.Timeout | undefined;
        const providerResult = await Promise.race([
          (async () => { await currentHandle.cancel(); return await currentHandle.completion; })()
            .catch(() => null),
          new Promise<'timeout'>((resolve) => {
            graceTimer = setTimeout(() => resolve('timeout'), cancellationGraceMs);
          }),
        ]).finally(() => { if (graceTimer) clearTimeout(graceTimer); });
        if ((providerResult === 'cancelled' || providerResult === 'completed') &&
          !this.processes.hasActive(intent.runId)) return 'cancelled' as const;
        const report = await this.processes.cancel(intent.runId);
        if (!report.confirmed || this.processes.hasActive(intent.runId)) {
          throw new Error('Owned process tree exit could not be confirmed');
        }
        return 'cancelled' as const;
      });
      const providerOutcome = await Promise.race([handle.completion.catch(async (error: unknown) => {
        if (active.cancelRequested && active.cancelOutcome) return active.cancelOutcome;
        throw error;
      }), active.cancelOutcome]);
      if (active.cancelRequested) await active.cancelOutcome;
      recorder.flush();
      if (checkpointError) throw checkpointError;
      saveCheckpoint();
      try { this.storage.saveRunDiff(intent.projectId, intent.runId, await captureRunDiff(workspace)); }
      catch { this.storage.saveRunDiff(intent.projectId, intent.runId, {
        files:[],text:'Diff preview unavailable; workspace inspection failed',truncated:true,
        capturedAt:new Date().toISOString() }); }
      if (active.cancelRequested) await active.cancelOutcome;
      if (this.processes.hasActive(intent.runId)) throw new Error('Executor process tree remains active');
      const result = { runId: intent.runId, attemptId: intent.attemptId,
        workspaceLeaseId: intent.workspaceLeaseId, leaseEpoch: intent.leaseEpoch,
        contractRevision: config.taskRevision, configHash: config.snapshotHash,
        outcome: active.cancelRequested ? 'cancelled' as const : protocolFailure ? 'failed' as const :
          providerOutcome === 'completed' ? 'completed' as const : 'cancelled' as const,
        providerSessionRef: handle.providerSessionId, lastEventSequence: lastSequence,
        timestamp: new Date().toISOString() };
      const applied = this.storage.completeRun(intent.projectId, intent.runId, result, true);
      if (applied.disposition !== 'APPLIED') throw new Error('Run result was not applied');
      await this.workspaces.releaseLease(workspace.workspaceId, intent.workspaceLeaseId);
      return applied.run;
    } catch (error) {
      if (active.cancelRequested && active.cancelOutcome) await active.cancelOutcome.catch(() => {});
      if (!begun) await this.workspaces.releaseLease(workspace.workspaceId, intent.workspaceLeaseId).catch(() => {});
      else {
        if (handle && providerFailureObserved && !active.cancelRequested && !checkpointError &&
          !this.processes.hasActive(intent.runId)) {
          try {
            recorder.flush();
            saveCheckpoint();
            try { this.storage.saveRunDiff(intent.projectId, intent.runId, await captureRunDiff(workspace)); }
            catch { this.storage.saveRunDiff(intent.projectId, intent.runId, {
              files:[], text:'Diff preview unavailable; workspace inspection failed',
              truncated:true, capturedAt:new Date().toISOString() }); }
            const failed = this.storage.completeRun(intent.projectId, intent.runId, {
              runId:intent.runId, attemptId:intent.attemptId,
              workspaceLeaseId:intent.workspaceLeaseId, leaseEpoch:intent.leaseEpoch,
              contractRevision:config.taskRevision, configHash:config.snapshotHash,
              outcome:'failed', providerSessionRef:handle.providerSessionId,
              lastEventSequence:lastSequence, timestamp:new Date().toISOString(),
            }, true);
            if (failed.disposition !== 'APPLIED') {
              throw new Error('Failed result was not applied', { cause: error });
            }
            await this.workspaces.releaseLease(workspace.workspaceId, intent.workspaceLeaseId);
            return failed.run;
          } catch { /* An uncertain durable failure remains quarantined below. */ }
        }
        if (active.cancelRequested && !handle && error instanceof ExecutorError &&
          error.code === 'EXECUTOR_RATE_LIMITED' && error.retryEvidence?.sideEffect === 'none' &&
          !this.processes.hasActive(intent.runId)) {
          const stopped = this.storage.completeRun(intent.projectId, intent.runId, {
            runId:intent.runId, attemptId:intent.attemptId, workspaceLeaseId:intent.workspaceLeaseId,
            leaseEpoch:intent.leaseEpoch, contractRevision:config.taskRevision,
            configHash:config.snapshotHash, outcome:'cancelled', providerSessionRef:null,
            lastEventSequence:0, timestamp:new Date().toISOString() }, true);
          await this.workspaces.releaseLease(workspace.workspaceId, intent.workspaceLeaseId);
          return stopped.run;
        }
        if (!handle && error instanceof ExecutorError && error.code === 'EXECUTOR_RATE_LIMITED' &&
          error.retryEvidence?.httpStatus === 429 && error.retryEvidence.sideEffect === 'none' &&
          !this.processes.hasActive(intent.runId)) {
          const blocked = this.storage.blockRunWithoutSideEffect(intent.projectId, intent.runId,
            intent.attemptId, 'rate_limit_exhausted');
          await this.workspaces.releaseLease(workspace.workspaceId, intent.workspaceLeaseId);
          return blocked;
        }
        await handle?.dispose().catch(() => {});
        const state = this.storage.getRun(intent.projectId, intent.runId);
        if (state && ['queued', 'running', 'canceling'].includes(state.state)) {
          this.storage.interruptRunUncertain(intent.projectId, intent.runId, intent.attemptId,
            active.cancelRequested ? 'cancel_unconfirmed' : handle ? 'process_unconfirmed' : 'launch_unknown');
          await this.workspaces.quarantine(workspace.workspaceId);
        }
      }
      throw error;
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      unsubscribe();
      recorder.dispose();
      await handle?.dispose().catch(() => {});
      const current = this.storage.getRun(intent.projectId, intent.runId);
      if (current) active.resolveDone(current);
      this.active.delete(intent.runId);
    }
  }
}
