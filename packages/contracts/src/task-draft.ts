import { z } from 'zod';

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const text = z.string().trim().min(1);
const acceptance = z.strictObject({ id: identifier, statement: text,
  method: z.enum(['automated', 'manual', 'inspection']), required: z.boolean(),
  sourceRefs: z.array(text) });

/** Production mirror of forge_spec_v1.0/contracts/task-contract.schema.json (v1.0). */
export const taskContractSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), taskId: identifier, projectId: identifier,
  revision: z.int().positive(), title: text.max(120),
  type: z.enum(['feature', 'bug', 'refactor', 'chore']), goal: text,
  acceptance: z.array(acceptance).min(1), constraints: z.array(text),
  scope: z.array(text), outOfScope: z.array(text), dependencies: z.array(identifier),
  openQuestions: z.array(text), assumptions: z.array(text), sourceRefs: z.array(text),
  workflowRef: text, priority: z.enum(['low', 'normal', 'high', 'urgent']),
});

export const taskDraftSchema = z.strictObject({
  draftId: z.uuid(), projectId: z.uuid(), conversationId: z.uuid(), sourceMessageId: z.uuid(),
  revision: z.int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  intent: z.enum(['new_task', 'revision', 'query', 'control']),
  status: z.enum(['generating', 'proposed', 'needs_clarification', 'invalid_output', 'manual']),
  contract: taskContractSchema.nullable(), editableText: z.string().max(100_000),
  errorCode: z.enum(['REFINER_UNAVAILABLE', 'REFINER_INVALID_OUTPUT', 'REFINER_FAILED']).nullable(),
  modelProvider: z.string().min(1).nullable(),
});

export const draftGenerationRequestSchema = z.strictObject({
  projectId: z.uuid(), conversationId: z.uuid(), sourceMessageId: z.uuid(),
  idempotencyKey: z.string().min(16).max(128),
});

export const draftRevisionSchema = z.strictObject({
  draftId: z.uuid(), revision: z.int().positive(), contract: taskContractSchema.nullable(),
  editableText: z.string(), changedFields: z.array(text),
  decisionId: z.uuid().nullable(), decisionSummary: z.string().nullable(),
  resolvedQuestions: z.array(z.strictObject({ question: text, answer: text })),
  createdAt: z.iso.datetime(),
});

export const draftReviseInputSchema = z.strictObject({
  projectId: z.uuid(), draftId: z.uuid(), expectedRevision: z.int().positive(),
  contract: taskContractSchema,
  decisionId: z.uuid(), decisionSummary: text.max(1000),
  resolvedQuestions: z.array(z.strictObject({ question: text, answer: text.max(4000) })),
  removedAcceptanceIds: z.array(identifier),
  confirmScopeChange: z.boolean(),
});

const timestamp = z.iso.datetime();
const envelope = { schemaVersion: z.literal('1.0'), commandId: z.uuid(), createdAt: timestamp,
  protocolVersion: z.string().min(1).max(80) };
export const draftCommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('draft.generate'), payload: draftGenerationRequestSchema }),
  z.strictObject({ ...envelope, type: z.literal('draft.manual'), payload: draftGenerationRequestSchema }),
  z.strictObject({ ...envelope, type: z.literal('draft.list'), payload: z.strictObject({
    projectId: z.uuid(), conversationId: z.uuid() }) }),
  z.strictObject({ ...envelope, type: z.literal('draft.get'), payload: z.strictObject({
    projectId: z.uuid(), draftId: z.uuid() }) }),
  z.strictObject({ ...envelope, type: z.literal('draft.updateText'), payload: z.strictObject({
    projectId: z.uuid(), draftId: z.uuid(), expectedRevision: z.int().positive(),
    editableText: z.string().trim().min(1).max(100_000) }) }),
  z.strictObject({ ...envelope, type: z.literal('draft.revise'), payload: draftReviseInputSchema }),
  z.strictObject({ ...envelope, type: z.literal('draft.history'), payload: z.strictObject({
    projectId: z.uuid(), draftId: z.uuid() }) }),
]);
export const draftCommandResultSchema = z.union([
  z.strictObject({ commandId: z.uuid(), ok: z.literal(true),
    data: z.union([taskDraftSchema, taskDraftSchema.nullable(), z.array(taskDraftSchema),
      z.array(draftRevisionSchema)]),
    durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
  z.strictObject({ commandId: z.uuid(), ok: z.literal(false), error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1).max(240),
    retryable: z.boolean(), correlationId: z.string().min(1).max(128),
  }), durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
]);

export type TaskContract = z.infer<typeof taskContractSchema>;
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export type DraftGenerationRequest = z.infer<typeof draftGenerationRequestSchema>;
export type DraftRevision = z.infer<typeof draftRevisionSchema>;
export type DraftReviseInput = z.infer<typeof draftReviseInputSchema>;
export type DraftCommandEnvelope = z.infer<typeof draftCommandEnvelopeSchema>;
export type DraftCommandResult = z.infer<typeof draftCommandResultSchema>;
