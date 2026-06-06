import { createHash, randomUUID } from 'node:crypto';
import { contextBundleSchema, workingCheckpointSchema,
  type ContextBundle, type ContextItem, type RunConfigSnapshot,
  type WorkingCheckpoint } from '@forge/contracts';
import { canonicalJson } from './approvals.js';
import { verifyRunConfig } from './run-config.js';

export class ContextError extends Error {
  constructor(readonly code: 'CONTEXT_INVALID' | 'CONTEXT_BUDGET_EXCEEDED') { super(code); }
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
const itemSize = (item: ContextItem) => item.text.length + item.sourceRef.length + 48;

/** Build from immutable Task/RunConfig and bounded structured progress, never a chat transcript. */
export function buildContextBundle(rawConfig: RunConfigSnapshot,
  rawCheckpoint: WorkingCheckpoint | null, maxChars = 16_000, now = new Date(),
  bundleId: string = randomUUID()): ContextBundle {
  const config = verifyRunConfig(rawConfig);
  const checkpoint = rawCheckpoint ? workingCheckpointSchema.parse(rawCheckpoint) : null;
  if (checkpoint && (checkpoint.projectId !== config.projectId || checkpoint.runId !== config.runId ||
    checkpoint.objective.text !== config.taskContract.goal)) throw new ContextError('CONTEXT_INVALID');
  if (!Number.isInteger(maxChars) || maxChars < 1_000 || maxChars > 32_000) {
    throw new ContextError('CONTEXT_INVALID');
  }
  const taskRef = `task:${config.taskId}@${config.taskRevision}`;
  const required: ContextItem[] = [
    { kind: 'goal', authority: 'approved_task', text: config.taskContract.goal, sourceRef: taskRef },
    ...config.taskContract.acceptance.map((item) => ({ kind: 'acceptance' as const,
      authority: 'approved_task' as const, text: item.statement,
      sourceRef: item.sourceRefs[0] ?? taskRef })),
    ...config.taskContract.constraints.map((item) => ({ kind: 'constraint' as const,
      authority: 'approved_task' as const, text: item, sourceRef: taskRef })),
    ...config.taskContract.scope.map((item) => ({ kind: 'scope' as const,
      authority: 'approved_task' as const, text: item, sourceRef: taskRef })),
    ...config.taskContract.outOfScope.map((item) => ({ kind: 'out_of_scope' as const,
      authority: 'approved_task' as const, text: item, sourceRef: taskRef })),
  ];
  const optional: ContextItem[] = checkpoint ? [
    ...checkpoint.completedActions.map((item) => ({ ...item, kind: 'checkpoint_action' as const,
      authority: 'run_observation' as const })),
    ...checkpoint.openIssues.map((item) => ({ ...item, kind: 'checkpoint_issue' as const,
      authority: 'run_observation' as const })),
  ] : [];
  let used = required.reduce((sum, item) => sum + itemSize(item), 0);
  if (required.length > 96 || used > maxChars) throw new ContextError('CONTEXT_BUDGET_EXCEEDED');
  const items = [...required];
  let omittedItems = 0;
  for (const item of optional) {
    if (items.length >= 96 || used + itemSize(item) > maxChars) { omittedItems++; continue; }
    items.push(item); used += itemSize(item);
  }
  const body = { bundleId, projectId: config.projectId, runId: config.runId,
    taskId: config.taskId, configHash: config.snapshotHash, taskRevision: config.taskRevision,
    checkpointId:checkpoint?.checkpointId ?? null,
    goal: config.taskContract.goal, items, omittedItems, maxChars, createdAt: now.toISOString() };
  return contextBundleSchema.parse({ ...body, contentHash: digest(body) });
}

export function verifyContextBundle(value: unknown): ContextBundle {
  const bundle = contextBundleSchema.parse(value);
  const { contentHash, ...body } = bundle;
  if (digest(body) !== contentHash ||
    bundle.items.reduce((sum,item)=>sum+itemSize(item),0)>bundle.maxChars) {
    throw new ContextError('CONTEXT_INVALID');
  }
  return bundle;
}

export function executorContext(bundle: ContextBundle): string[] {
  const verified = verifyContextBundle(bundle);
  return verified.items.filter((item) => item.kind !== 'goal').map((item) =>
    `[${item.authority}; ${item.sourceRef}; ${item.kind}] ${item.text}`);
}

/** Historical progress is useful after restart, but process liveness must be re-probed. */
export function describeRecoveredProgress(raw: WorkingCheckpoint): {
  objective: string; completedActions: readonly string[]; openIssues: readonly string[];
  budget: WorkingCheckpoint['budget']; processState: 'unverified'; checkpointId: string;
} {
  const checkpoint = workingCheckpointSchema.parse(raw);
  return { objective:checkpoint.objective.text,
    completedActions:checkpoint.completedActions.map((item)=>item.text),
    openIssues:checkpoint.openIssues.map((item)=>item.text),
    budget:checkpoint.budget,processState:'unverified',checkpointId:checkpoint.checkpointId };
}
