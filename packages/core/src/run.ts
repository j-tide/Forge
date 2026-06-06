import { runAttemptResultSchema, runStartIntentSchema,
  type RunAttemptResult, type RunConfigSnapshot, type RunStartIntent } from '@forge/contracts';
import { verifyRunConfig } from './run-config.js';

export class RunTransitionError extends Error {
  constructor(readonly code: 'RUN_CONFIG_MISMATCH' | 'RUN_RESULT_INVALID') { super(code); }
}

export function verifyRunStart(value: RunStartIntent, configValue: RunConfigSnapshot): RunStartIntent {
  const intent = runStartIntentSchema.parse(value);
  const config = verifyRunConfig(configValue);
  if (intent.runId !== config.runId || intent.projectId !== config.projectId ||
    intent.taskId !== config.taskId || intent.configHash !== config.snapshotHash ||
    !config.plugins.some((plugin) => plugin.id === intent.executorId)) {
    throw new RunTransitionError('RUN_CONFIG_MISMATCH');
  }
  return intent;
}

export function resultBelongsToAttempt(resultValue: RunAttemptResult,
  expected: { runId: string; attemptId: string; workspaceLeaseId: string;
    leaseEpoch: number; contractRevision: number; configHash: string }): boolean {
  const result = runAttemptResultSchema.parse(resultValue);
  return result.runId === expected.runId && result.attemptId === expected.attemptId &&
    result.workspaceLeaseId === expected.workspaceLeaseId && result.leaseEpoch === expected.leaseEpoch &&
    result.contractRevision === expected.contractRevision && result.configHash === expected.configHash;
}

export function retry429(input: { status: number; sideEffect: 'none' | 'possible' | 'confirmed';
  retryNo: number; maxRetries: number; remainingDurationMs: number }): number | null {
  if (input.status !== 429 || input.sideEffect !== 'none' || !Number.isInteger(input.retryNo) ||
    !Number.isInteger(input.maxRetries) || input.retryNo < 0 || input.maxRetries < 0 ||
    input.retryNo >= input.maxRetries) return null;
  const delay = Math.min(30_000, 1_000 * 2 ** Math.min(input.retryNo, 5));
  return delay < input.remainingDurationMs ? delay : null;
}
