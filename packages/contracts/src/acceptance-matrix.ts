import { z } from 'zod';
import { verifyReportSchema } from './verify.js';

const id = z.uuid();
const criterionSchema = z.strictObject({
  id: z.string().min(1).max(128), statement: z.string().min(1),
  method: z.enum(['automated','manual','inspection']), required: z.boolean(),
  sourceRefs: z.array(z.string().min(1)),
});
export const acceptanceDecisionStatusSchema = z.enum([
  'verified','failed','risk_accepted','not_applicable',
]);
export const acceptanceMatrixSchema = z.strictObject({
  projectId: id, taskId: id, contractRevision: z.int().positive(),
  snapshotId: id.nullable(), developmentRunId: id.nullable(),
  reviewStatus: z.enum(['approved','changes_requested','inconclusive']).nullable(),
  checkReports: z.array(verifyReportSchema).max(50),
  criteria: z.array(z.strictObject({
    criterion: criterionSchema,
    status: z.enum(['verified','failed','manual','unverified','risk_accepted','not_applicable']),
    reason: z.string().min(1), reportId: id.nullable(), decisionId: id.nullable(),
  })),
  evaluation: z.enum(['inconclusive','failed','covered']),
  requiredCovered: z.boolean(), missingRequiredIds: z.array(z.string()),
  finalAcceptanceRequired: z.literal(true),
});
export type AcceptanceMatrix = z.infer<typeof acceptanceMatrixSchema>;
