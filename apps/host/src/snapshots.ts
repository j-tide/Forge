import { buildDevelopmentHandoff } from '@forge/core/handoff';
import type { DevelopmentHandoff } from '@forge/contracts';
import type { ForgePersistence } from '@forge/persistence';
import type { ProcessController } from '@forge/process';
import type { WorkspaceManager } from '@forge/workspace';

/** Host-only publication boundary. A Run being succeeded is not a delivered Task. */
export class HostSnapshotService {
  constructor(private readonly storage: ForgePersistence,
    private readonly workspaces: WorkspaceManager,
    private readonly processes: ProcessController) {}

  async freeze(input: { projectId: string; runId: string; workspaceId: string;
    contextBundleId: string; workflowRevision: number;
    noChangeExplanation?: string }): Promise<DevelopmentHandoff> {
    const prior = this.storage.getDevelopmentHandoff(input.projectId, input.runId);
    if (prior) {
      if (prior.snapshot.workspaceId !== input.workspaceId ||
        prior.bundle.contextBundleId !== input.contextBundleId ||
        prior.bundle.workflowRevision !== input.workflowRevision) {
        throw new Error('Existing CodeSnapshot has a different frozen identity');
      }
      await this.workspaces.verifySnapshotRef(input.workspaceId, prior.snapshot.snapshotId,
        prior.snapshot.commitSha, prior.snapshot.treeSha);
      return prior;
    }
    const run = this.storage.getRun(input.projectId, input.runId);
    const config = this.storage.getRunConfig(input.projectId, input.runId);
    const context = this.storage.getContextBundle(input.projectId, input.contextBundleId);
    if (!run || run.state !== 'succeeded' || !config || !context ||
      this.processes.hasActive(input.runId)) {
      throw new Error('Run is not stopped and eligible for CodeSnapshot');
    }
    const workspace = this.workspaces.inspect(input.workspaceId);
    if (workspace.ownerRunId !== input.runId || workspace.status !== 'ready' ||
      workspace.activeLeaseId) {
      throw new Error('CodeSnapshot workspace identity is not ready');
    }
    const material = await this.workspaces.freezeSnapshot(input.workspaceId, input.runId,
      input.noChangeExplanation);
    const snapshot = { ...material, schemaVersion: '1.0' as const,
      projectId: input.projectId, attemptId: run.attempt.attemptId };
    const handoff = buildDevelopmentHandoff({ snapshot, run, config, context,
      checkpoint: this.storage.latestWorkingCheckpoint(input.projectId, input.runId),
      workflowRevision: input.workflowRevision,
      ...(input.noChangeExplanation === undefined ? {} :
        { noChangeExplanation: input.noChangeExplanation }) });
    return this.storage.saveDevelopmentHandoff(input.projectId, handoff);
  }
}
