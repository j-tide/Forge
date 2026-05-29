import { z } from 'zod';

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime();

/** Production mirror of the task subset of approval-request.schema.json. */
export const approvalRequestSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), approvalId: identifier,
  projectId: identifier.nullable(), taskId: identifier.nullable(), kind: z.literal('task'),
  expectedRevision: z.int().positive(), scopeHash: hash, snapshotId: identifier.nullable(),
  actionDigest: hash, requestedBy: z.string().min(1), expiresAt: timestamp,
  summary: z.string().min(1), risk: z.enum(['low', 'medium', 'high']),
  requiredScope: z.string().min(1),
});
export const approvalDecisionSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), approvalId: identifier,
  decision: z.enum(['approve', 'reject']), expectedRevision: z.int().positive(),
  scopeHash: hash, reason: z.string(),
});
export const taskApprovalSchema = z.strictObject({
  request: approvalRequestSchema, draftId: z.uuid(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'superseded']),
  decision: approvalDecisionSchema.nullable(), taskState: z.literal('todo').nullable(),
  createdAt: timestamp, decidedAt: timestamp.nullable(),
});
export const approvalRequestInputSchema = z.strictObject({
  projectId: z.uuid(), draftId: z.uuid(), expectedRevision: z.int().positive(),
});
export const approvalDecideInputSchema = z.strictObject({
  projectId: z.uuid(), decision: approvalDecisionSchema,
});
const envelope = { schemaVersion: z.literal('1.0'), commandId: z.uuid(),
  createdAt: timestamp, protocolVersion: z.string().min(1).max(80) };
export const approvalCommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('approval.request'), payload: approvalRequestInputSchema }),
  z.strictObject({ ...envelope, type: z.literal('approval.decide'), payload: approvalDecideInputSchema }),
  z.strictObject({ ...envelope, type: z.literal('approval.forDraft'), payload: z.strictObject({
    projectId: z.uuid(), draftId: z.uuid() }) }),
]);
export const approvalCommandResultSchema = z.union([
  z.strictObject({ commandId: z.uuid(), ok: z.literal(true),
    data: taskApprovalSchema.nullable(), durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
  z.strictObject({ commandId: z.uuid(), ok: z.literal(false), error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1).max(240),
    retryable: z.boolean(), correlationId: identifier,
  }), durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
]);
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type TaskApproval = z.infer<typeof taskApprovalSchema>;
export type ApprovalRequestInput = z.infer<typeof approvalRequestInputSchema>;
export type ApprovalDecideInput = z.infer<typeof approvalDecideInputSchema>;
export type ApprovalCommandEnvelope = z.infer<typeof approvalCommandEnvelopeSchema>;
export type ApprovalCommandResult = z.infer<typeof approvalCommandResultSchema>;
