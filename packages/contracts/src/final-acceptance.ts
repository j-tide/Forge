import { z } from 'zod';

const id = z.uuid();
export const finalDecisionSchema = z.strictObject({
  decisionId: id, projectId: id, taskId: id, snapshotId: id,
  contractRevision: z.int().positive(), basisHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(['accept', 'return']), reason: z.string(),
  nextRunId: id.nullable(),
  actor: z.literal('local-owner'), createdAt: z.iso.datetime(),
});
export const finalAcceptanceViewSchema = z.strictObject({
  projectId: id, taskId: id, snapshotId: id.nullable(),
  contractRevision: z.int().positive(), basisHash: z.string().regex(/^[a-f0-9]{64}$/),
  readAt: z.iso.datetime(), reviewReportId: id.nullable(),
  advisoryIssues: z.array(z.strictObject({
    issueId: id, reviewId: id, snapshotId: id, revision: z.int().positive(),
    severity: z.enum(['advisory', 'blocking']),
    status: z.enum(['open', 'stale', 'resolved', 'waived']),
    reason: z.string().min(1).max(4000),
  })).max(100),
  verifyReportIds: z.array(id).max(100), criterionDecisionIds: z.array(id).max(100),
  blockers: z.array(z.string().min(1).max(80)).max(20),
  status: z.enum(['unavailable', 'ready', 'accepted', 'returned']),
  decision: finalDecisionSchema.nullable(),
});
export type FinalAcceptanceView = z.infer<typeof finalAcceptanceViewSchema>;
