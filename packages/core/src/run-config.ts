import { createHash } from 'node:crypto';
import { projectEnvironmentSchema, runConfigSelectionSchema, runConfigSnapshotSchema,
  taskContractSchema, type ProjectEnvironment, type RunConfigSelection,
  type RunConfigSnapshot, type TaskContract } from '@forge/contracts';
import { canonicalJson, contractDigest } from './approvals.js';

export class RunConfigError extends Error {
  constructor(readonly code: 'RUN_CONFIG_STALE' | 'RUN_CONFIG_INVALID') { super(code); }
}

export function runConfigHash(value: Omit<RunConfigSnapshot, 'snapshotHash'>): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Freezes resolved, non-secret values. This does not start a Run or grant execution authority. */
export function freezeRunConfig(selectionValue: RunConfigSelection, contractValue: TaskContract,
  environmentValue: ProjectEnvironment, now = new Date()): RunConfigSnapshot {
  const selection = runConfigSelectionSchema.parse(selectionValue);
  const contract = taskContractSchema.parse(contractValue);
  const environment = projectEnvironmentSchema.parse(environmentValue);
  if (contract.projectId !== selection.projectId || contract.taskId !== selection.taskId ||
    contract.revision !== selection.expectedTaskRevision ||
    environment.projectId !== selection.projectId ||
    environment.environmentId !== selection.environmentId ||
    environment.revision !== selection.expectedEnvironmentRevision || environment.archivedAt) {
    throw new RunConfigError('RUN_CONFIG_STALE');
  }
  if (selection.workflow.id !== contract.workflowRef ||
    new Set(selection.plugins.map((plugin) => plugin.id)).size !== selection.plugins.length ||
    !selection.plugins.some((plugin) => plugin.id === selection.profile.executorPluginId)) {
    throw new RunConfigError('RUN_CONFIG_INVALID');
  }
  const body = { schemaVersion: '1.0' as const, runId: selection.runId,
    projectId: selection.projectId, taskId: selection.taskId, taskRevision: contract.revision,
    taskContractHash: contractDigest(contract), taskContract: contract,
    workflow: selection.workflow, profile: selection.profile,
    plugins: [...selection.plugins].sort((a, b) => a.id.localeCompare(b.id)),
    budget: selection.budget, environment, createdAt: now.toISOString() };
  return runConfigSnapshotSchema.parse({ ...body, snapshotHash: runConfigHash(body) });
}

export function verifyRunConfig(value: unknown): RunConfigSnapshot {
  const snapshot = runConfigSnapshotSchema.parse(value);
  const { snapshotHash, ...body } = snapshot;
  if (runConfigHash(body) !== snapshotHash || contractDigest(snapshot.taskContract) !== snapshot.taskContractHash) {
    throw new RunConfigError('RUN_CONFIG_INVALID');
  }
  return snapshot;
}
