import type { ExecutorRunHandle, ExecutorRunRequest } from '@forge/plugin-api';
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
      current.rootPath !== workspace.rootPath || current.ownershipId !== workspace.ownershipId) {
      throw new Error('Executor launch lacks the active Forge workspace lease');
    }
    return this.executors.start(executorId, { ...request, workspace: current.rootPath });
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
