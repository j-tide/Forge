import { z } from 'zod';

const id = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const entry = z.strictObject({
  text: z.string().trim().min(1).max(2_000),
  sourceRef: z.string().trim().min(1).max(256),
});

/** Only current Run progress. This is never evidence of a live provider process. */
export const workingCheckpointSchema = z.strictObject({
  checkpointId: id, projectId: id, runId: id, attemptId: id,
  sequence: z.int().positive(), objective: entry,
  completedActions: z.array(entry).max(16), openIssues: z.array(entry).max(16),
  budget: z.strictObject({ elapsedMs: z.int().nonnegative(),
    turnsUsed: z.int().nonnegative().nullable(), tokensUsed: z.int().nonnegative().nullable(),
    toolCallsUsed: z.int().nonnegative().nullable() }),
  createdAt: z.iso.datetime(),
});

export const contextItemSchema = entry.extend({
  kind: z.enum(['goal', 'acceptance', 'constraint', 'scope', 'out_of_scope',
    'checkpoint_action', 'checkpoint_issue', 'rework_feedback']),
  authority: z.enum(['approved_task', 'run_observation', 'review_evidence',
    'verify_evidence', 'human_decision']),
}).strict();
export const contextBundleSchema = z.strictObject({
  bundleId: id, projectId: id, runId: id, taskId: id,
  configHash: hash, taskRevision: z.int().positive(), checkpointId: id.nullable(),
  goal: z.string().trim().min(1).max(2_000),
  items: z.array(contextItemSchema).min(1).max(96),
  omittedItems: z.int().nonnegative(), maxChars: z.int().min(1_000).max(32_000),
  createdAt: z.iso.datetime(), contentHash: hash,
});
export type WorkingCheckpoint = z.infer<typeof workingCheckpointSchema>;
export type ContextBundle = z.infer<typeof contextBundleSchema>;
export type ContextItem = z.infer<typeof contextItemSchema>;
