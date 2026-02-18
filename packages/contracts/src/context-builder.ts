import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const stageContextItemSchema = z.strictObject({
  priority: z.int().min(1).max(7),
  kind: z.enum(['approved_task', 'human_decision', 'code_snapshot',
    'stage_artifact', 'validated_memory', 'retrieved_knowledge']),
  trust: z.enum(['approved', 'human_decision', 'observed', 'untrusted']),
  sourceRef: z.string().min(1).max(256), sourceHash: hash,
  text: z.string().min(1).max(100000),
});
export const stageContextConflictSchema = z.strictObject({
  currentSourceRef: z.string().min(1), otherSourceRef: z.string().min(1),
  reason: z.enum(['SOURCE_VERSION_CHANGED', 'SAME_HEADING_DIFFERENT_TEXT',
    'CURRENT_OBSERVATION_CONFLICT']),
  question: z.string().min(1),
});
export const stageContextPreviewSchema = z.strictObject({
  projectId: z.uuid(), runId: z.uuid(), taskRevision: z.int().positive(),
  configHash: hash, indexVersion: z.literal('forge-knowledge-search/v1-fts5-trigram-cjk-short'),
  query: z.string().min(1).max(160),
  status: z.enum(['ready', 'insufficient_sources', 'budget_exceeded',
    'needs_human_decision']),
  items: stageContextItemSchema.array().max(96), sourceRefs: z.string().array().max(96),
  conflicts: stageContextConflictSchema.array().max(16), omittedItems: z.int().nonnegative(),
  usedChars: z.int().nonnegative(), maxChars: z.int().min(1000).max(32000),
  truncated: z.boolean(),
});
export type StageContextPreview = z.infer<typeof stageContextPreviewSchema>;
