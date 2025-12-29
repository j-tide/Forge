import { z } from 'zod';

const id = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const runStateSchema = z.enum(['queued', 'running', 'waiting_input', 'pausing', 'paused',
  'canceling', 'succeeded', 'failed', 'cancelled', 'interrupted']);
export const attemptStateSchema = z.enum(['pending', 'running', 'waiting_approval', 'succeeded',
  'failed', 'cancelled', 'interrupted']);
export const runStartIntentSchema = z.strictObject({
  runId: id, projectId: id, taskId: id, attemptId: id,
  attemptNo: z.int().positive().max(20).optional(),
  workspaceId: id, workspaceLeaseId: id, leaseEpoch: z.int().positive(),
  baseRevision: z.string().regex(/^[0-9a-f]{40,64}$/),
  nodeId: z.string().min(1).max(128), executorId: z.string().min(1).max(128),
  configHash: hash, createdAt: z.iso.datetime(),
});
export const runAttemptResultSchema = z.strictObject({
  runId: id, attemptId: id, workspaceLeaseId: id, leaseEpoch: z.int().positive(),
  contractRevision: z.int().positive(), configHash: hash,
  outcome: z.enum(['completed', 'failed', 'cancelled']),
  providerSessionRef: z.string().min(1).nullable(),
  lastEventSequence: z.int().nonnegative(), timestamp: z.iso.datetime(),
});
export const runAttemptViewSchema = z.strictObject({
  attemptId: id, runId: id, nodeId: z.string(), attemptNo: z.int().positive(),
  leaseEpoch: z.int().positive(), workspaceLeaseId: id, state: attemptStateSchema,
  nativeSessionRef: z.string().nullable(), lastEventSequence: z.int().nonnegative(),
  startedAt: z.string().nullable(), endedAt: z.string().nullable(),
});
export const runViewSchema = z.strictObject({
  runId: id, projectId: id, taskId: id, configHash: hash, state: runStateSchema,
  revision: z.int().positive(), createdAt: z.iso.datetime(), finishedAt: z.string().nullable(),
  attempt: runAttemptViewSchema,
});
export type RunStartIntent = z.infer<typeof runStartIntentSchema>;
export type RunAttemptResult = z.infer<typeof runAttemptResultSchema>;
export type RunView = z.infer<typeof runViewSchema>;
