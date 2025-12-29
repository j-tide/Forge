import { z } from 'zod';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const executorCapabilitiesSchema = z.strictObject({
  executorId: identifier,
  adapterVersion: z.string().min(1),
  upstreamVersion: z.string().min(1),
  platform: z.string().min(1),
  available: z.boolean(),
  streaming: z.boolean(),
  resume: z.boolean(),
  interrupt: z.boolean(),
  approval: z.boolean(),
  structuredEvents: z.boolean(),
  structuredOutput: z.boolean(),
  workspaceControl: z.boolean(),
  toolEvents: z.boolean(),
  sessionPersistence: z.boolean(),
  modelSelection: z.boolean(),
  usageReporting: z.boolean(),
  readOnlyEnforced: z.boolean(),
  networkPolicyEnforced: z.boolean(),
  enforcement: z.enum(['native-sandbox', 'trusted-local', 'unavailable']),
  modelIds: z.array(z.string().min(1)),
  authModes: z.array(z.string().min(1)),
  warnings: z.array(z.string()),
});
export type ExecutorCapabilities = z.infer<typeof executorCapabilitiesSchema>;

export const executorRunRequestSchema = z.strictObject({
  runId: identifier,
  taskId: identifier,
  workspace: z.string().min(1),
  goal: z.string().min(1),
  context: z.array(z.string()),
  permission: z.enum(['read-only', 'workspace-write']),
  approval: z.enum(['on-request', 'never']),
  model: z.string().min(1).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  maxDurationMs: z.number().int().positive().max(3_600_000),
  providerSessionId: z.string().min(1).optional(),
  attempt: z.strictObject({
    attemptId: identifier, leaseEpoch: z.number().int().positive(),
    contractRevision: z.number().int().positive(), workspaceLeaseId: z.uuid(),
    contextBundleId: identifier, profileRevision: z.number().int().positive(),
    outputSchemaId: identifier, credentialRef: identifier.optional(),
    nativeSessionRef: z.string().min(1).optional(),
  }).optional(),
});
export type ExecutorRunRequest = z.infer<typeof executorRunRequestSchema>;
export const scheduledExecutorRunRequestSchema = executorRunRequestSchema.safeExtend({
  attempt: executorRunRequestSchema.shape.attempt.unwrap(),
});
export type ScheduledExecutorRunRequest = z.infer<typeof scheduledExecutorRunRequestSchema>;

export const executorUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  cost: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),
});
export type ExecutorUsage = z.infer<typeof executorUsageSchema>;

const base = { runId: identifier, sequence: z.number().int().positive(), timestamp: z.string().datetime() };
const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) => z.strictObject({ ...base, type: z.literal(type), ...shape });
export const executorEventSchema = z.discriminatedUnion('type', [
  event('run.started', { providerSessionId: z.string().min(1) }),
  event('run.status', { status: z.enum(['starting', 'running', 'waiting_approval', 'interrupted']) }),
  event('assistant.message', { text: z.string() }),
  event('tool.started', { toolId: z.string(), name: z.string() }),
  event('tool.completed', { toolId: z.string(), name: z.string(), ok: z.boolean() }),
  event('file.changed', { path: z.string(), kind: z.enum(['add', 'update', 'delete']) }),
  event('command.started', { commandId: z.string(), command: z.string() }),
  event('command.completed', { commandId: z.string(), exitCode: z.number().int().nullable() }),
  event('approval.requested', { approvalId: z.string(), summary: z.string(), capability: z.enum(['command', 'file_change']), expiresAt: z.string().datetime().nullable() }),
  event('approval.resolved', { approvalId: z.string(), decision: z.enum(['approve', 'reject']) }),
  event('usage.updated', executorUsageSchema.shape),
  event('run.completed', { providerSessionId: z.string().min(1), structuredOutput: z.json().nullable() }),
  event('run.failed', { code: z.string(), message: z.string() }),
  event('run.cancelled', {}),
]);
export type ExecutorEvent = z.infer<typeof executorEventSchema>;

export type ExecutorErrorCode =
  | 'EXECUTOR_START_FAILED' | 'EXECUTOR_AUTH_FAILED' | 'EXECUTOR_TIMEOUT'
  | 'EXECUTOR_CANCELLED' | 'EXECUTOR_RUNTIME_ERROR' | 'EXECUTOR_PROTOCOL_ERROR'
  | 'EXECUTOR_UNSUPPORTED_CAPABILITY' | 'EXECUTOR_WORKSPACE_ERROR' | 'EXECUTOR_RATE_LIMITED';

export class ExecutorError extends Error {
  constructor(readonly code: ExecutorErrorCode, message: string,
    readonly retryEvidence?: { httpStatus: 429; sideEffect: 'none' | 'possible' | 'confirmed' }) {
    super(message); this.name = 'ExecutorError';
  }
}

/** Validate an adapter's public stream before it reaches Host business consumers. */
export class ExecutorEventGate {
  private sequence = 0;
  private terminal = false;
  constructor(readonly runId: string) { identifier.parse(runId); }
  accept(raw: unknown): ExecutorEvent {
    const event = executorEventSchema.safeParse(raw);
    if (!event.success || event.data.runId !== this.runId || this.terminal ||
      event.data.sequence !== this.sequence + 1 ||
      (this.sequence === 0 && event.data.type !== 'run.started')) {
      throw new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Executor emitted an invalid or out-of-order event');
    }
    this.sequence = event.data.sequence;
    if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.data.type)) this.terminal = true;
    return event.data;
  }
  get nextSequence(): number { return this.sequence + 1; }
}

export interface ExecutorRunHandle {
  readonly runId: string;
  readonly providerSessionId: string;
  readonly completion: Promise<'completed' | 'cancelled'>;
  subscribe(listener: (event: ExecutorEvent) => void): () => void;
  cancel(): Promise<void>;
  interrupt(): Promise<void>;
  resume(goal: string): Promise<ExecutorRunHandle>;
  respondToApproval(approvalId: string, decision: 'approve' | 'reject'): Promise<void>;
  dispose(): Promise<void>;
}

export interface ExecutorAdapter {
  readonly id: string;
  probe(): Promise<ExecutorCapabilities>;
  start(request: ExecutorRunRequest): Promise<ExecutorRunHandle>;
  dispose(): Promise<void>;
}
