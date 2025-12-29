import { z } from 'zod';

const id = z.uuid();
const sha = z.string().regex(/^[0-9a-f]{40,64}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const deliverySummarySchema = z.strictObject({
  deliveryId: id, projectId: id, taskId: id, acceptanceDecisionId: id,
  contractRevision: z.int().positive(), contractHash: digest,
  planStatus: z.literal('not_configured'), attemptRunIds: z.array(id).max(100),
  snapshotId: id, snapshotCommit: sha, baseRevision: sha,
  reviewReportIds: z.array(id).max(100), verifyReportIds: z.array(id).max(100),
  criterionDecisionIds: z.array(id).max(100), advisoryWaiverIds: z.array(id).max(100),
  unresolvedRisks: z.array(z.string().max(160)).max(100),
  finalStatus: z.literal('accepted'), acceptedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(), contentHash: digest,
});
export const mergePreviewSchema = z.strictObject({
  deliveryId: id, targetBranch: z.string().max(240), targetHead: sha.nullable(),
  snapshotCommit: sha, canMerge: z.boolean(), blockers: z.array(z.string()).max(20),
  operationId: id.nullable(),
  operationState: z.enum(['intent','merged','conflict','unknown']).nullable(),
  resultCommit: sha.nullable(),
});
export const mergeReceiptSchema = z.strictObject({
  operationId: id, deliveryId: id, targetBranch: z.string().min(1).max(240),
  expectedTargetHead: sha, snapshotCommit: sha,
  state: z.enum(['intent','merged','conflict','unknown']), resultCommit: sha.nullable(),
  errorCode: z.string().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type DeliverySummary = z.infer<typeof deliverySummarySchema>;
export type MergePreview = z.infer<typeof mergePreviewSchema>;
export type MergeReceipt = z.infer<typeof mergeReceiptSchema>;
