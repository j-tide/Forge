import { z } from 'zod';

const id = z.uuid();
const iso = z.iso.datetime();
export const verifyKindSchema = z.enum(['test', 'typecheck', 'build', 'lint']);
export const verifyJobSchema = z.strictObject({
  verificationId: id, projectId: id, taskId: id, developmentRunId: id,
  snapshotId: id, kind: verifyKindSchema, presetId: id.nullable(),
  state: z.enum(['running', 'completed', 'failed', 'interrupted']),
  reportId: id.nullable(), errorCode: z.string().nullable(),
  createdAt: iso, updatedAt: iso,
});
export const verifyReportSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), reportId: id, verificationId: id,
  projectId: id, taskId: id, developmentRunId: id, snapshotId: id,
  kind: verifyKindSchema, presetId: id.nullable(),
  presetRevision: z.int().positive().nullable(),
  approvalHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  status: z.enum(['passed', 'failed', 'not_configured', 'timeout', 'error']),
  exitCode: z.int().nullable(), durationMs: z.int().nonnegative(),
  stdoutArtifactId: id.nullable(), stderrArtifactId: id.nullable(),
  needsHuman: z.boolean(), outputTruncated: z.boolean(), createdAt: iso,
});
export const verifyArtifactSchema = z.strictObject({
  artifactId: id, reportId: id, kind: z.enum(['stdout', 'stderr']),
  mime: z.literal('text/plain'), content: z.string().max(131136),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.int().nonnegative(), truncated: z.boolean(), createdAt: iso,
});

export type VerifyJob = z.infer<typeof verifyJobSchema>;
export type VerifyReport = z.infer<typeof verifyReportSchema>;
export type VerifyArtifact = z.infer<typeof verifyArtifactSchema>;
