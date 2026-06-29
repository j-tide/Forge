import { z } from 'zod';

export const workflowNodeSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  kind: z.enum(['agent', 'command', 'verifier', 'approval', 'condition']),
  label: z.string().min(1).max(160),
  boardColumn: z.enum(['todo', 'development', 'review', 'verify', 'done']),
  binding: z.string().min(1).max(128),
  requiredCapabilities: z.array(z.string().min(1).max(128)).max(32),
  inputs: z.array(z.string().min(1).max(128)).max(32),
  outputSchema: z.string().min(1).max(128),
  timeoutSeconds: z.number().int().min(1),
  retryLimit: z.number().int().nonnegative(),
  readOnly: z.boolean(),
});
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.strictObject({
  from: z.string().min(1).max(128), on: z.string().min(1).max(128),
  to: z.string().min(1).max(128),
});
export const workflowReworkSchema = workflowEdgeSchema.extend({
  maxCycles: z.number().int().min(1), invalidateDescendants: z.literal(true),
});
export const workflowTemplateSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  revision: z.number().int().min(1),
  name: z.string().min(1).max(160),
  start: z.string().min(1).max(128),
  nodes: z.array(workflowNodeSchema).min(1).max(64),
  edges: z.array(workflowEdgeSchema).max(128),
  rework: z.array(workflowReworkSchema).max(64),
  maxTotalAttempts: z.number().int().min(1),
  onUnmatched: z.literal('escalate'),
  finalAcceptance: z.literal('human'),
});
export type WorkflowTemplate = z.infer<typeof workflowTemplateSchema>;

export const workflowCompileSchema = z.strictObject({
  workflowId: z.string(), revision: z.number().int().min(1),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  orderedNodeIds: z.array(z.string()),
  launchable: z.boolean(),
  issues: z.array(z.strictObject({ code: z.string(), path: z.string(), message: z.string() })),
});
export type WorkflowCompile = z.infer<typeof workflowCompileSchema>;

export const workflowRecordSchema = z.strictObject({
  workflowId: z.string(), draftRevision: z.number().int().min(1),
  draft: workflowTemplateSchema, draftHash: z.string().regex(/^[a-f0-9]{64}$/),
  publishedRevision: z.number().int().min(1).nullable(), updatedAt: z.iso.datetime(),
});
export type WorkflowRecord = z.infer<typeof workflowRecordSchema>;
export const publishedWorkflowSchema = z.strictObject({
  workflowId: z.string(), revision: z.number().int().min(1),
  definition: workflowTemplateSchema, contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.iso.datetime(),
});
export type PublishedWorkflow = z.infer<typeof publishedWorkflowSchema>;
export const workflowImpactSchema = z.strictObject({
  workflowId: z.string(), publishedRevision: z.number().int().min(1).nullable(),
  draftRevision: z.number().int().min(1), draftChangedSincePublish: z.boolean(),
  publishedRevisions: z.array(z.number().int().min(1)),
  frozenRunCounts: z.record(z.string(), z.number().int().nonnegative()),
  nextRunRequiresExplicitVersionSelection: z.literal(true),
});
export type WorkflowImpact = z.infer<typeof workflowImpactSchema>;

const workflowIdSchema = z.string().regex(/^workflow\.[A-Za-z0-9._:-]{1,119}$/);
export const workflowCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('presets'), payload: z.strictObject({}) }),
  z.strictObject({ type: z.literal('list'), payload: z.strictObject({}) }),
  z.strictObject({ type: z.literal('get'), payload: z.strictObject({
    workflowId: workflowIdSchema,
  }) }),
  z.strictObject({ type: z.literal('getPublished'), payload: z.strictObject({
    workflowId: workflowIdSchema, revision: z.number().int().min(1),
  }) }),
  z.strictObject({ type: z.literal('impact'), payload: z.strictObject({
    workflowId: workflowIdSchema,
  }) }),
  z.strictObject({ type: z.literal('saveDraft'), payload: z.strictObject({
    template: workflowTemplateSchema, expectedRevision: z.number().int().nonnegative(),
  }) }),
  z.strictObject({ type: z.literal('compileDraft'), payload: z.strictObject({
    template: workflowTemplateSchema, expectedRevision: z.number().int().nonnegative(),
  }) }),
  z.strictObject({ type: z.literal('publish'), payload: z.strictObject({
    workflowId: workflowIdSchema, expectedDraftRevision: z.number().int().min(1),
  }) }),
]);
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export const workflowWriteResultSchema = z.strictObject({
  record: workflowRecordSchema, compiled: workflowCompileSchema,
});
