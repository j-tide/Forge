import { createHash, randomUUID } from 'node:crypto';
import { buildContextBundle, executorContext } from '@forge/core/context';
import { projectTrustVersion, runLaunchCapabilitiesSchema,
  type RunLaunchCapabilities, type RunView } from '@forge/contracts';
import type { ForgePersistence } from '@forge/persistence';
import type { WorkspaceManager } from '@forge/workspace';
import { HostExecutorRegistry } from './executors.js';
import { HostRunScheduler } from './run-scheduler.js';
import { HostSnapshotService } from './snapshots.js';
import { ProjectService } from './projects.js';
import { logHost } from './log.js';

const developmentNode = Object.freeze({
  workflowId: 'standard', workflowRevision: 1, implementedNode: 'develop',
  profileId: 'profile.developer', executorId: 'executor.codex',
  permission: 'workspace-write', approval: 'never',
  budget: { maxDurationMs: 180_000, maxTurns: 10, maxTokens: 50_000, maxToolCalls: 100 },
});
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export class DevelopmentError extends Error {
  constructor(readonly code: 'PROJECT_TRUST_REQUIRED' | 'TASK_NOT_FOUND' |
    'REVISION_CONFLICT' | 'RUN_CONFLICT' | 'MODEL_UNAVAILABLE' | 'RUN_START_FAILED' |
    'RUN_NOT_FOUND' | 'RUN_CANCEL_FAILED' | 'RUN_DELIVERY_FAILED') { super(code); }
}

/** The P2 vertical entry resolves one installed development node, not the future workflow engine. */
export class HostDevelopmentService {
  private readonly starting = new Map<string, { fingerprint: string; action: Promise<RunView> }>();
  private readonly delivering = new Set<string>();
  constructor(private readonly storage: ForgePersistence, private readonly projects: ProjectService,
    private readonly workspaces: WorkspaceManager, private readonly executors: HostExecutorRegistry,
    private readonly scheduler: HostRunScheduler, private readonly snapshots: HostSnapshotService) {}

  private async trustedProject(projectId: string): Promise<NonNullable<ReturnType<ForgePersistence['getProject']>>> {
    const project = this.storage.getProject(projectId);
    if (!project || !project.trusted || project.trustVersion !== projectTrustVersion ||
      project.archivedAt || this.storage.activeProject()?.projectId !== projectId) {
      throw new DevelopmentError('PROJECT_TRUST_REQUIRED');
    }
    const fresh = await this.projects.probe(project.rootPath);
    if (fresh.rootPath !== project.rootPath || fresh.gitRoot !== project.gitRoot ||
      fresh.repositoryType !== 'git') throw new DevelopmentError('PROJECT_TRUST_REQUIRED');
    return project;
  }

  private approvedTask(projectId: string, taskId: string, revision?: number,
    requireTodo = true) {
    let detail;
    try { detail = this.storage.taskDetail(projectId, taskId).detail; }
    catch { throw new DevelopmentError('TASK_NOT_FOUND'); }
    if (requireTodo && detail.task.state !== 'todo') throw new DevelopmentError('RUN_CONFLICT');
    if (revision !== undefined && detail.contract.revision !== revision) {
      throw new DevelopmentError('REVISION_CONFLICT');
    }
    if (detail.contract.workflowRef !== developmentNode.workflowId) {
      throw new DevelopmentError('RUN_START_FAILED');
    }
    return detail;
  }

  async capabilities(projectId: string, taskId: string): Promise<RunLaunchCapabilities> {
    await this.trustedProject(projectId);
    this.approvedTask(projectId, taskId, undefined, false);
    const adapter = this.executors.resolve(developmentNode.executorId);
    if (!adapter) throw new DevelopmentError('MODEL_UNAVAILABLE');
    const probe = await adapter.probe();
    return runLaunchCapabilitiesSchema.parse({ available: probe.available && probe.workspaceControl &&
      probe.streaming && probe.interrupt && probe.modelIds.length > 0,
    executorId: 'executor.codex', adapterVersion: probe.adapterVersion,
    upstreamVersion: probe.upstreamVersion, modelIds: probe.modelIds,
    workspaceControl: probe.workspaceControl, streaming: probe.streaming,
    interrupt: probe.interrupt, warnings: probe.warnings });
  }

  start(input: { projectId: string; taskId: string; expectedTaskRevision: number;
    modelId: string; idempotencyKey: string }): Promise<RunView> {
    const fingerprint = hash(input);
    const pending = this.starting.get(input.idempotencyKey);
    if (pending) return pending.fingerprint === fingerprint ? pending.action :
      Promise.reject(new DevelopmentError('RUN_CONFLICT'));
    const action = this.startOwned(input).finally(() => this.starting.delete(input.idempotencyKey));
    this.starting.set(input.idempotencyKey, { fingerprint, action });
    return action;
  }

  private async startOwned(input: { projectId: string; taskId: string; expectedTaskRevision: number;
    modelId: string; idempotencyKey: string }): Promise<RunView> {
    const project = await this.trustedProject(input.projectId);
    const previous = this.storage.getRun(input.projectId, input.idempotencyKey);
    if (previous) {
      const config = this.storage.getRunConfig(input.projectId, previous.runId);
      if (previous.taskId !== input.taskId || config?.taskRevision !== input.expectedTaskRevision ||
        config.profile.contentHash !== hash({ ...developmentNode, modelId: input.modelId })) {
        throw new DevelopmentError('RUN_CONFLICT');
      }
      return previous;
    }
    const task = this.approvedTask(input.projectId, input.taskId, input.expectedTaskRevision);
    const capability = await this.capabilities(input.projectId, input.taskId);
    if (!capability.available || !capability.modelIds.includes(input.modelId)) {
      throw new DevelopmentError('MODEL_UNAVAILABLE');
    }
    const environment = this.storage.getEnvironment(project.projectId, project.environmentId);
    if (!environment || environment.archivedAt) throw new DevelopmentError('RUN_START_FAILED');
    const runId = input.idempotencyKey;
    const config = this.storage.createRunConfig({ runId, projectId: project.projectId,
      taskId: task.task.id, expectedTaskRevision: input.expectedTaskRevision,
      workflow: { id: developmentNode.workflowId, version: 'p2-development/v1',
        contentHash: hash(developmentNode) },
      profile: { id: developmentNode.profileId, version: 'p2-development/v1',
        contentHash: hash({ ...developmentNode, modelId: input.modelId }),
        executorPluginId: developmentNode.executorId },
      plugins: [{ id: developmentNode.executorId, version: capability.upstreamVersion,
        contentHash: hash({ adapterVersion: capability.adapterVersion,
          upstreamVersion: capability.upstreamVersion, executorId: developmentNode.executorId }) }],
      budget: developmentNode.budget, environmentId: environment.environmentId,
      expectedEnvironmentRevision: environment.revision });
    const bundle = this.storage.saveContextBundle(buildContextBundle(config, null));
    let workspaceId: string | null = null;
    try {
      const created = await this.workspaces.create({ sourceRepo: project.rootPath,
        ownerRunId: runId, mode: 'task-branch' });
      workspaceId = created.workspaceId;
      const workspace = await this.workspaces.acquire(created.workspaceId, runId);
      const attemptId = randomUUID();
      const intent = { runId, projectId: project.projectId, taskId: task.task.id, attemptId,
        workspaceId: workspace.workspaceId, workspaceLeaseId: workspace.activeLeaseId!,
        leaseEpoch: workspace.leaseEpoch!, baseRevision: workspace.baseRevision,
        nodeId: developmentNode.implementedNode, executorId: developmentNode.executorId,
        configHash: config.snapshotHash, createdAt: new Date().toISOString() };
      let queued!: (run: RunView) => void;
      const durable = new Promise<RunView>((resolve) => { queued = resolve; });
      const execution = this.scheduler.execute(intent, workspace, {
        runId, taskId: input.taskId, goal: bundle.goal, context: executorContext(bundle),
        permission: developmentNode.permission, approval: developmentNode.approval,
        model: input.modelId, maxDurationMs: developmentNode.budget.maxDurationMs,
        attempt: { attemptId, leaseEpoch: workspace.leaseEpoch!,
          workspaceLeaseId: workspace.activeLeaseId!, contractRevision: config.taskRevision,
          contextBundleId: bundle.bundleId, profileRevision: developmentNode.workflowRevision,
          outputSchemaId: 'plain-text-v1' },
      }, queued);
      void execution.then(async (run) => {
        if (run.state !== 'succeeded') return;
        this.delivering.add(runId);
        await this.snapshots.freeze({ projectId: project.projectId, runId,
          workspaceId: workspace.workspaceId, contextBundleId: bundle.bundleId,
          workflowRevision: developmentNode.workflowRevision });
      }).catch(() => {
        logHost('development_delivery_failed', { code: 'RUN_DELIVERY_FAILED' });
      }).finally(() => { this.delivering.delete(runId); });
      return await Promise.race([durable, execution]);
    } catch (error) {
      if (workspaceId && !this.storage.getRun(project.projectId, runId)) {
        await this.workspaces.release(workspaceId, { discardChanges: false }).catch(() => {});
      }
      throw error;
    }
  }

  cancel(projectId: string, runId: string): RunView {
    const pending = this.scheduler.cancel(projectId, runId);
    void pending.catch(() => {});
    const current = this.storage.getRun(projectId, runId);
    if (!current) throw new DevelopmentError('RUN_NOT_FOUND');
    if (current.state !== 'canceling' && current.state !== 'cancelled') {
      throw new DevelopmentError('RUN_CANCEL_FAILED');
    }
    return current;
  }

  handoff(projectId: string, runId: string) {
    const run = this.storage.getRun(projectId, runId);
    if (!run) throw new DevelopmentError('RUN_NOT_FOUND');
    const delivery = this.storage.getDevelopmentHandoff(projectId, runId);
    if (run.state === 'succeeded' && !delivery && !this.delivering.has(runId)) {
      throw new DevelopmentError('RUN_DELIVERY_FAILED');
    }
    return delivery;
  }

  shutdown(): Promise<RunView[]> { return this.scheduler.shutdown(); }
}
