import { scheduledExecutorRunRequestSchema,
  type ExecutorRunHandle, type ExecutorRunRequest, type ScheduledExecutorRunRequest } from '@forge/plugin-api';
import type { ProcessController } from '@forge/process';
import type { WorkspaceDescriptor, WorkspaceManager } from '@forge/workspace';
import { HostExecutorRegistry } from './executors.js';

/** Infrastructure-only run scope: provider interrupt, owned process check, then worktree release. */
export class HostRunResources {
  constructor(private readonly executors: HostExecutorRegistry,
    private readonly workspaces: WorkspaceManager, private readonly processes: ProcessController) {}

  async start(executorId: string, workspace: WorkspaceDescriptor,
    request: Omit<ExecutorRunRequest, 'workspace'>): Promise<ExecutorRunHandle> {
    const current = this.workspaces.inspect(workspace.workspaceId);
    if (current.status !== 'busy' || current.ownerRunId !== request.runId ||
      !current.activeLeaseId || current.activeLeaseId !== workspace.activeLeaseId ||
      current.leaseEpoch !== workspace.leaseEpoch ||
      current.rootPath !== workspace.rootPath || current.ownershipId !== workspace.ownershipId) {
      throw new Error('Executor launch lacks the active Forge workspace lease');
    }
    return this.executors.start(executorId, { ...request, workspace: current.rootPath });
  }

  async startScheduled(executorId: string, workspace: WorkspaceDescriptor,
    request: Omit<ScheduledExecutorRunRequest, 'workspace'>): Promise<ExecutorRunHandle> {
    const parsed = scheduledExecutorRunRequestSchema.parse({ ...request, workspace: workspace.rootPath });
    if (!workspace.activeLeaseId || parsed.attempt.workspaceLeaseId !== workspace.activeLeaseId ||
      parsed.attempt.leaseEpoch !== workspace.leaseEpoch) {
      throw new Error('Scheduled Executor request lacks the active workspace lease');
    }
    return this.start(executorId, workspace, parsed);
  }

  async cancelAndRelease(handle: ExecutorRunHandle, workspace: WorkspaceDescriptor,
    discardChanges = false, verifyStopped?: () => Promise<void>): Promise<WorkspaceDescriptor> {
    let providerCancelled = false;
    let timer: NodeJS.Timeout | undefined;
    const unsubscribe = handle.subscribe((event) => {
      if (event.type === 'run.cancelled') providerCancelled = true;
    });
    try {
      await handle.cancel();
      const outcome = await Promise.race([handle.completion,
        new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), 4_000); })]);
      if (outcome !== 'cancelled' || !providerCancelled || this.processes.hasActive(handle.runId)) {
        throw new Error('Run cancellation was not confirmed; workspace quarantined');
      }
      await verifyStopped?.();
      return await this.workspaces.release(workspace.workspaceId, { discardChanges });
    } catch (error) {
      await handle.dispose().catch(() => {});
      await this.workspaces.quarantine(workspace.workspaceId).catch(() => {});
      throw error;
    } finally { if (timer) clearTimeout(timer); unsubscribe(); }
  }
}
