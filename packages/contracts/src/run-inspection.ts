import { z } from 'zod';
import { runViewSchema } from './run.js';
import { developmentHandoffSchema } from './handoff.js';
import { reviewIssueOccurrenceSchema, reviewJobSchema, reviewReportSchema } from './review.js';
import { verifyArtifactSchema, verifyJobSchema, verifyReportSchema, verifyKindSchema } from './verify.js';
import { acceptanceMatrixSchema, acceptanceDecisionStatusSchema } from './acceptance-matrix.js';
import { reworkCycleSchema } from './rework.js';
import { finalAcceptanceViewSchema } from './final-acceptance.js';
import { deliverySummarySchema, mergePreviewSchema, mergeReceiptSchema } from './delivery.js';
import { taskChangeViewSchema } from './task-change.js';
import { taskContractSchema } from './task-draft.js';
import { stageContextPreviewSchema } from './context-builder.js';

const id = z.uuid();
const envelope = { schemaVersion: z.literal('1.0'), commandId: id,
  createdAt: z.iso.datetime(), protocolVersion: z.string().min(1).max(80) };

export const runObservationSchema = z.strictObject({
  cursor: z.int().positive(), runId: id, attemptId: id,
  sourceSequenceFrom: z.int().positive(), sourceSequenceTo: z.int().positive(),
  type: z.string().min(1).max(48), text: z.string().max(2048),
  timestamp: z.iso.datetime(),
});
export const runFileChangeSchema = z.strictObject({
  path: z.string().min(1).max(512), status: z.enum(['added', 'modified', 'deleted', 'renamed']),
});
export const runDiffPreviewSchema = z.strictObject({
  files: z.array(runFileChangeSchema).max(200), text: z.string().max(65536),
  truncated: z.boolean(), capturedAt: z.iso.datetime(),
});
export const runInspectionSchema = z.strictObject({
  run: runViewSchema, observations: z.array(runObservationSchema).max(100),
  nextCursor: z.int().nonnegative(), hasMore: z.boolean(),
  diff: runDiffPreviewSchema.nullable(),
  contextSources: z.array(z.strictObject({ sourceRef: z.string(), sourceKind: z.string() })).max(128),
  usage: z.strictObject({ inputTokens: z.int().nonnegative(), outputTokens: z.int().nonnegative(),
    cachedInputTokens: z.int().nonnegative().nullable(), cost: z.number().nonnegative().nullable(),
    currency: z.string().nullable() }).nullable(),
});
export const contextSourceStatusSchema = z.strictObject({
  sourceRef: z.string().min(1).max(256),
  kind: z.enum(['retrieved_knowledge', 'validated_memory']),
  status: z.enum(['current', 'revoked', 'superseded', 'expired', 'missing']),
});
const versionLockSchema = z.strictObject({
  id: z.string().min(1).max(128), version: z.string().min(1).max(80),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
const profileLockSchema = versionLockSchema.extend({ executorPluginId: z.string().min(1).max(128) });
export const runConfigurationSourceSchema = z.strictObject({
  projectId: id, runId: id, taskId: id, taskRevision: z.int().positive(),
  configHash: z.string().regex(/^[a-f0-9]{64}$/),
  workflow: versionLockSchema, developerProfile: profileLockSchema,
  stageProfiles: z.array(profileLockSchema).max(8),
  environmentId: id, environmentRevision: z.int().positive(),
  actualNodeId: z.string().min(1).max(128),
});
export const runLaunchCapabilitiesSchema = z.strictObject({
  available: z.boolean(), executorId: z.literal('executor.codex'),
  adapterVersion: z.string().min(1), upstreamVersion: z.string().min(1),
  modelIds: z.array(z.string().min(1)).max(100),
  workspaceControl: z.boolean(), streaming: z.boolean(), interrupt: z.boolean(),
  warnings: z.array(z.string()).max(32),
});
export const runCommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('context.sources'), payload: z.strictObject({
    projectId: id, runId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.config'), payload: z.strictObject({
    projectId: id, runId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('context.preview'), payload: z.strictObject({
    projectId: id, runId: id, query: z.string().min(1).max(160),
    maxChars: z.int().min(1000).max(32000).optional(),
  }) }),
  z.strictObject({ ...envelope, type:z.literal('task.change.get'), payload:z.strictObject({
    projectId:id,taskId:id,
  }) }),
  z.strictObject({ ...envelope, type:z.literal('task.change.propose'), payload:z.strictObject({
    projectId:id,taskId:id,expectedRevision:z.int().positive(),contract:taskContractSchema,
    decisionId:id,reason:z.string().min(12).max(2000),confirmScopeChange:z.boolean(),
    idempotencyKey:id,
  }) }),
  z.strictObject({ ...envelope, type:z.literal('task.change.decide'), payload:z.strictObject({
    projectId:id,taskId:id,changeId:id,expectedRevision:z.int().positive(),
    expectedContentHash:z.string().regex(/^[a-f0-9]{64}$/),decision:z.enum(['approve','reject']),
    reason:z.string().min(12).max(2000),
  }) }),
  z.strictObject({ ...envelope, type:z.literal('task.change.apply'), payload:z.strictObject({
    projectId:id,taskId:id,changeId:id,expectedRevision:z.int().positive(),
    confirmed:z.literal(true),
  }) }),
  z.strictObject({ ...envelope, type: z.literal('deliveries.get'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('deliveries.preview'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('deliveries.merge'), payload: z.strictObject({
    projectId: id, taskId: id, deliveryId: id,
    targetBranch: z.string().min(1).max(240).refine((value) =>
      [...value].every((char) => { const code = char.codePointAt(0);
        return code !== undefined && code >= 32 && code !== 127; })),
    expectedTargetHead: z.string().regex(/^[0-9a-f]{40,64}$/),
    expectedSnapshotId: id, confirmed: z.literal(true), idempotencyKey: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.issueWaive'), payload: z.strictObject({
    projectId: id, taskId: id, issueId: id, expectedSnapshotId: id,
    expectedReviewId: id, expectedIssueRevision: z.int().positive(),
    nonSecurityConfirmed: z.literal(true), reason: z.string().min(12).max(2000),
    idempotencyKey: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.finalAcceptance'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.finalDecide'), payload: z.strictObject({
    projectId: id, taskId: id, expectedSnapshotId: id,
    expectedContractRevision: z.int().positive(),
    expectedBasisHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(['accept', 'return']), reason: z.string().min(12).max(2000),
    idempotencyKey: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.reworkCycles'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.list'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.inspect'), payload: z.strictObject({
    projectId: id, runId: id, afterCursor: z.int().nonnegative(), limit: z.int().min(1).max(100),
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.capabilities'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.start'), payload: z.strictObject({
    projectId: id, taskId: id, expectedTaskRevision: z.int().positive(),
    modelId: z.string().min(1).max(128), idempotencyKey: id,
    profileId: z.string().min(1).max(128).optional(),
    profileRevision: z.int().positive().optional(),
    contextQuery: z.string().min(1).max(160).optional(),
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.cancel'), payload: z.strictObject({
    projectId: id, runId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.handoff'), payload: z.strictObject({
    projectId: id, runId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.reviewReports'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.issueHistory'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.reviewJobs'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.reviewJob'), payload: z.strictObject({
    projectId: id, reviewRunId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.reviewStart'), payload: z.strictObject({
    projectId: id, taskId: id, developmentRunId: id, expectedSnapshotId: id,
    modelId: z.string().min(1).max(128), idempotencyKey: id,
    profileId: z.string().min(1).max(128).optional(),
    profileRevision: z.int().positive().optional(),
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.verifyStart'), payload: z.strictObject({
    projectId: id, taskId: id, developmentRunId: id, expectedSnapshotId: id,
    kind: verifyKindSchema, presetId: id.nullable(), idempotencyKey: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.verifyJobs'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.verifyJob'), payload: z.strictObject({
    projectId: id, verificationId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.verifyReport'), payload: z.strictObject({
    projectId: id, verificationId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.verifyArtifact'), payload: z.strictObject({
    projectId: id, artifactId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.acceptanceMatrix'), payload: z.strictObject({
    projectId: id, taskId: id,
  }) }),
  z.strictObject({ ...envelope, type: z.literal('run.acceptanceDecide'), payload: z.strictObject({
    projectId: id, taskId: id, expectedSnapshotId: id,
    expectedContractRevision: z.int().positive(), criterionId: z.string().min(1).max(128),
    status: acceptanceDecisionStatusSchema, reportId: id.nullable(),
    reason: z.string().min(12).max(2000), idempotencyKey: id,
  }) }),
]);
export const runCommandResultSchema = z.union([
  z.strictObject({ commandId: id, ok: z.literal(true), data: z.union([
    z.array(runViewSchema), runInspectionSchema, runViewSchema,
    runLaunchCapabilitiesSchema, developmentHandoffSchema.nullable(),
    z.array(reviewReportSchema).max(50), z.array(reviewIssueOccurrenceSchema).max(1000),
    z.array(reviewJobSchema).max(50), reviewJobSchema,
    z.array(verifyJobSchema).max(50), verifyJobSchema, verifyReportSchema.nullable(),
    verifyArtifactSchema, acceptanceMatrixSchema,
    finalAcceptanceViewSchema, deliverySummarySchema, mergePreviewSchema, mergeReceiptSchema,
    taskChangeViewSchema, taskChangeViewSchema.nullable(), stageContextPreviewSchema,
    z.array(contextSourceStatusSchema).max(40),
    runConfigurationSourceSchema,
    z.array(reworkCycleSchema).max(20),
  ]), durationMs: z.number().nonnegative(), hostTimestamp: z.iso.datetime() }),
  z.strictObject({ commandId: id, ok: z.literal(false), error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1).max(240),
    retryable: z.boolean(), correlationId: z.string().min(1).max(128),
  }), durationMs: z.number().nonnegative(), hostTimestamp: z.iso.datetime() }),
]);
export type RunObservation = z.infer<typeof runObservationSchema>;
export type RunDiffPreview = z.infer<typeof runDiffPreviewSchema>;
export type RunInspection = z.infer<typeof runInspectionSchema>;
export type ContextSourceStatus = z.infer<typeof contextSourceStatusSchema>;
export type RunConfigurationSource = z.infer<typeof runConfigurationSourceSchema>;
export type RunLaunchCapabilities = z.infer<typeof runLaunchCapabilitiesSchema>;
export type RunCommandEnvelope = z.infer<typeof runCommandEnvelopeSchema>;
export type RunCommandResult = z.infer<typeof runCommandResultSchema>;
