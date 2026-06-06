import { createHash, randomUUID } from 'node:crypto';
import { codeSnapshotSchema, contextBundleSchema, developmentHandoffSchema,
  runConfigSnapshotSchema, runViewSchema, workingCheckpointSchema,
  type CodeSnapshot, type ContextBundle, type DevelopmentHandoff,
  type RunConfigSnapshot, type RunView, type WorkingCheckpoint } from '@forge/contracts';

export class HandoffError extends Error {
  constructor(readonly code: 'HANDOFF_STALE' | 'HANDOFF_EXPLANATION_REQUIRED') { super(code); }
}

/** Summary is derived from frozen evidence; it makes no Review or Verify pass claim. */
export function buildDevelopmentHandoff(input: { snapshot: CodeSnapshot; run: RunView;
  config: RunConfigSnapshot; context: ContextBundle; checkpoint: WorkingCheckpoint | null;
  workflowRevision: number; noChangeExplanation?: string }): DevelopmentHandoff {
  const snapshot = codeSnapshotSchema.parse(input.snapshot);
  const run = runViewSchema.parse(input.run);
  const config = runConfigSnapshotSchema.parse(input.config);
  const context = contextBundleSchema.parse(input.context);
  const checkpoint = input.checkpoint ? workingCheckpointSchema.parse(input.checkpoint) : null;
  if (run.state !== 'succeeded' || run.attempt.state !== 'succeeded' ||
    snapshot.projectId !== run.projectId || snapshot.runId !== run.runId ||
    snapshot.attemptId !== run.attempt.attemptId || snapshot.workspaceId === '' ||
    config.projectId !== run.projectId || config.runId !== run.runId ||
    config.taskId !== run.taskId || config.snapshotHash !== run.configHash ||
    context.projectId !== run.projectId || context.runId !== run.runId ||
    context.taskId !== run.taskId || context.configHash !== config.snapshotHash ||
    context.taskRevision !== config.taskRevision ||
    checkpoint && (checkpoint.projectId !== run.projectId || checkpoint.runId !== run.runId ||
      checkpoint.attemptId !== run.attempt.attemptId)) {
    throw new HandoffError('HANDOFF_STALE');
  }
  if (!Number.isInteger(input.workflowRevision) || input.workflowRevision < 1) {
    throw new HandoffError('HANDOFF_STALE');
  }
  const explanation = input.noChangeExplanation?.trim() ?? '';
  if (snapshot.noChange && !explanation) throw new HandoffError('HANDOFF_EXPLANATION_REQUIRED');
  const summary = snapshot.noChange
    ? `No permitted code changes were captured. ${explanation}`
    : `Captured ${snapshot.files.length} changed file(s) in an immutable CodeSnapshot. Review and Verify have not run.`;
  const unresolved = [
    ...new Set(checkpoint?.openIssues.map((item) => item.text) ?? []),
    'Review and Verify have not run',
  ];
  const stepResult = {
    schemaVersion: '1.0' as const, runId: run.runId,
    attemptId: run.attempt.attemptId, nodeId: run.attempt.nodeId,
    contractRevision: config.taskRevision, snapshotId: snapshot.snapshotId,
    outcome: snapshot.noChange ? 'inconclusive' as const : 'ready' as const,
    artifactIds: [], unresolved,
    acceptanceResults: config.taskContract.acceptance.map((item) => ({ criterionId: item.id,
      status: 'unverified' as const, evidenceIds: [], reason: 'Review and Verify have not run' })),
    summary,
  };
  const bytes = Buffer.from(JSON.stringify(stepResult));
  const artifact = { artifactId: randomUUID(), snapshotId: snapshot.snapshotId,
    kind: 'development-step-result' as const, mime: 'application/json' as const,
    byteSize: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex'),
    redactionVersion: 'forge-artifact-redaction/v1', createdAt: new Date().toISOString() };
  const bundle = { schemaVersion: '1.0' as const, taskId: run.taskId,
    contractRevision: config.taskRevision, workflowRevision: input.workflowRevision,
    snapshotId: snapshot.snapshotId, runConfigHash: config.snapshotHash,
    contractRef: `task:${run.taskId}@${config.taskRevision}`,
    contextBundleId: context.bundleId, artifactIds: [artifact.artifactId],
    humanDecisionIds: [], openIssueIds: [], nativeSessionRef: run.attempt.nativeSessionRef,
    redactionVersion: artifact.redactionVersion };
  return developmentHandoffSchema.parse({ snapshot, bundle, stepResult, artifact });
}
