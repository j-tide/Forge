import { z } from 'zod';

const uuid = z.uuid();
const gitSha = z.string().regex(/^[0-9a-f]{40,64}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const path = z.string().min(1).max(4096).refine((value) =>
  !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
  value.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
{ message: 'Path must be repository-relative' });

export const codeSnapshotSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), snapshotId: uuid, projectId: uuid, runId: uuid,
  attemptId: uuid, workspaceId: uuid, baseRevision: gitSha, baseTree: gitSha,
  filteredBaseTree: gitSha, commitSha: gitSha, treeSha: gitSha, contentHash: digest,
  files: z.array(z.strictObject({ path, kind: z.enum(['added', 'modified', 'deleted']),
    blobSha: gitSha.nullable(), byteSize: z.int().nonnegative() })).max(10_000),
  excludedPaths: z.array(path).max(10_000), noChange: z.boolean(), createdAt: z.iso.datetime(),
});
export type CodeSnapshot = z.infer<typeof codeSnapshotSchema>;

/** Matches the read-only specification's handoff-bundle.schema.json fields. */
export const handoffBundleSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), taskId: uuid, contractRevision: z.int().positive(),
  workflowRevision: z.int().positive(), snapshotId: uuid.nullable(),
  runConfigHash: digest, contractRef: z.string().min(1), contextBundleId: uuid,
  artifactIds: z.array(uuid), humanDecisionIds: z.array(uuid), openIssueIds: z.array(uuid),
  nativeSessionRef: z.string().min(1).nullable(), redactionVersion: z.string().min(1),
});
export type HandoffBundle = z.infer<typeof handoffBundleSchema>;

/** Matches the read-only specification's step-result.schema.json fields. */
export const developmentStepResultSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), runId: uuid, attemptId: uuid, nodeId: z.string().min(1),
  contractRevision: z.int().positive(), snapshotId: uuid.nullable(),
  outcome: z.enum(['ready', 'approved', 'needs_changes', 'passed', 'failed', 'inconclusive', 'blocked']),
  artifactIds: z.array(uuid), unresolved: z.array(z.string().min(1)),
  acceptanceResults: z.array(z.strictObject({ criterionId: z.string().min(1),
    status: z.enum(['pass', 'fail', 'unverified', 'not_applicable']),
    evidenceIds: z.array(uuid), reason: z.string().min(1) })),
  summary: z.string().min(1),
});
export type DevelopmentStepResult = z.infer<typeof developmentStepResultSchema>;

export const developmentArtifactSchema = z.strictObject({
  artifactId: uuid, snapshotId: uuid, kind: z.literal('development-step-result'),
  mime: z.literal('application/json'), byteSize: z.int().nonnegative(),
  contentHash: digest, redactionVersion: z.string().min(1), createdAt: z.iso.datetime(),
});
export type DevelopmentArtifact = z.infer<typeof developmentArtifactSchema>;

export const developmentHandoffSchema = z.strictObject({
  snapshot: codeSnapshotSchema, bundle: handoffBundleSchema,
  stepResult: developmentStepResultSchema, artifact: developmentArtifactSchema,
});
export type DevelopmentHandoff = z.infer<typeof developmentHandoffSchema>;
