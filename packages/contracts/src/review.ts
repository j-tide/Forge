import { z } from 'zod';

const id = z.uuid();
const relativePath = z.string().min(1).max(4096).refine((value) =>
  !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
  value.split('/').every((segment) => segment && segment !== '.' && segment !== '..'));
export const reviewFindingSchema = z.strictObject({
  anchor: z.strictObject({ path: relativePath, lineStart: z.int().positive(),
    lineEnd: z.int().positive() }),
  basis: z.strictObject({ kind: z.enum(['acceptance', 'engineering']),
    sourceRef: z.string().min(1).max(256) }),
  reason: z.string().min(1).max(4000), impact: z.string().min(1).max(4000),
});
export const reviewResultSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), snapshotId: id, taskId: id,
  contractRevision: z.int().positive(), profileRevision: z.int().positive(),
  outcome: z.enum(['approved', 'changes_requested', 'inconclusive']),
  blockingIssues: z.array(reviewFindingSchema).max(100),
  suggestions: z.array(reviewFindingSchema).max(100),
  unknowns: z.array(z.strictObject({ question: z.string().min(1).max(4000),
    impact: z.string().min(1).max(4000) })).max(100),
  summary: z.string().min(1).max(4000),
});
export const reviewIssueSchema = z.strictObject({
  issueId: id, projectId: id, taskId: id,
  severity: z.enum(['blocking', 'advisory']),
  status: z.enum(['open', 'stale', 'resolved', 'waived']), revision: z.int().positive(),
  firstSeenAt: z.iso.datetime(), lastSeenAt: z.iso.datetime(),
});
export const reworkHandoffSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), handoffId: id, reviewId: id,
  projectId: id, taskId: id, developmentRunId: id, sourceSnapshotId: id,
  contractRevision: z.int().positive(), issueIds: z.array(id).min(1).max(100),
  issues: z.array(reviewFindingSchema).min(1).max(100),
  summary: z.string().min(1).max(4000), createdAt: z.iso.datetime(),
});
export const reviewReportSchema = z.strictObject({
  reviewId: id, projectId: id, taskId: id, developmentRunId: id,
  snapshotId: id, reviewCopyId: id, reviewAttemptId: id,
  status: z.enum(['approved', 'changes_requested', 'inconclusive']),
  result: reviewResultSchema.nullable(), issues: z.array(reviewIssueSchema).max(200),
  reworkHandoff: reworkHandoffSchema.nullable(), createdAt: z.iso.datetime(),
});
export const reviewJobSchema = z.strictObject({
  reviewRunId: id, projectId: id, taskId: id, developmentRunId: id,
  snapshotId: id, reviewCopyId: id, reviewAttemptId: id,
  modelId: z.string().min(1).max(128),
  state: z.enum(['running', 'completed', 'failed', 'interrupted']),
  reportId: id.nullable(), errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const reviewIssueOccurrenceSchema = z.strictObject({
  occurrenceId: id, issueId: id, reviewId: id, reviewAttemptId: id,
  snapshotId: id, finding: reviewFindingSchema, createdAt: z.iso.datetime(),
});
export type ReviewReport = z.infer<typeof reviewReportSchema>;
export type ReviewIssueOccurrence = z.infer<typeof reviewIssueOccurrenceSchema>;
export type ReviewJob = z.infer<typeof reviewJobSchema>;
