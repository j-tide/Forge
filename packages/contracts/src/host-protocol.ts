import { z } from 'zod';
import { projectCommandEnvelopeSchema, projectCommandResultSchema } from './project.js';
import { conversationCommandEnvelopeSchema, conversationCommandResultSchema,
  conversationStreamEventSchema } from './conversation.js';
import { draftCommandEnvelopeSchema, draftCommandResultSchema } from './task-draft.js';
import { approvalCommandEnvelopeSchema, approvalCommandResultSchema } from './task-approval.js';
import { boardCommandEnvelopeSchema, boardCommandResultSchema } from './board.js';
import { runCommandEnvelopeSchema, runCommandResultSchema } from './run-inspection.js';

export const hostProtocolVersion = 'forge-host-protocol/v5' as const;
export const hostStatusSchema = z.enum(['starting', 'ready', 'degraded', 'stopping', 'offline']);
export const connectionStateSchema = z.enum(['starting', 'connected', 'degraded', 'unavailable', 'crashed', 'incompatible']);

const identifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const versionSchema = z.string().min(1).max(64);
const timestampSchema = z.iso.datetime();

export const forgeErrorCodeSchema = z.enum([
  'VALIDATION_ERROR', 'UNKNOWN_COMMAND', 'IDEMPOTENCY_CONFLICT',
  'PROTOCOL_MISMATCH', 'VERSION_MISMATCH', 'UNAUTHENTICATED', 'FORBIDDEN',
  'HOST_STARTUP_FAILED', 'HOST_EXITED', 'HOST_UNAVAILABLE',
  'TRANSPORT_TIMEOUT', 'INVALID_RESPONSE', 'INTERNAL_ERROR',
  'DATABASE_OPEN_FAILED', 'DATABASE_MIGRATION_FAILED', 'DATABASE_VERSION_UNSUPPORTED',
  'DATABASE_BUSY', 'DATABASE_CORRUPT', 'DATABASE_IO_ERROR',
  'DATABASE_DISK_FULL', 'DATABASE_BACKUP_FAILED',
  'PROJECT_INVALID_PATH', 'PROJECT_PROBE_FAILED', 'PROJECT_NOT_FOUND',
  'PROJECT_PROBE_STALE', 'PROJECT_TRUST_REQUIRED',
  'REVISION_CONFLICT', 'PROJECT_ARCHIVED', 'ENVIRONMENT_NOT_FOUND', 'ENVIRONMENT_IN_USE',
  'COMMAND_PRESET_NOT_FOUND', 'COMMAND_PRESET_REFERENCED',
  'CONVERSATION_NOT_FOUND', 'MESSAGE_NOT_FOUND', 'INVALID_MESSAGE_CONTENT', 'CONVERSATION_BUSY', 'MODEL_UNAVAILABLE',
  'PROFILE_INVALID', 'PROFILE_STALE', 'PROFILE_CORRUPT', 'PROFILE_UNAVAILABLE',
  'PROFILE_POLICY_UNSUPPORTED', 'PROFILE_CONTEXT_UNSUPPORTED', 'EXECUTOR_UNAVAILABLE',
  'EXECUTOR_MISMATCH', 'READ_ONLY_UNENFORCED', 'NETWORK_POLICY_UNENFORCED',
  'APPROVAL_UNSUPPORTED', 'STRUCTURED_OUTPUT_UNSUPPORTED', 'WORKSPACE_UNSUPPORTED',
  'ROLE_UNSUPPORTED',
  'DRAFT_SOURCE_NOT_FOUND', 'DRAFT_NOT_FOUND', 'DRAFT_APPROVED', 'DRAFT_INVALID_REVISION',
  'DRAFT_UNRESOLVED_QUESTIONS', 'DRAFT_ACCEPTANCE_CONFIRMATION_REQUIRED',
  'DRAFT_SCOPE_CONFIRMATION_REQUIRED',
  'APPROVAL_NOT_READY', 'APPROVAL_NOT_FOUND', 'APPROVAL_STALE', 'APPROVAL_EXPIRED',
  'APPROVAL_ALREADY_DECIDED',
  'TASK_NOT_FOUND', 'TASK_REVISION_INVALID', 'BOARD_CROSS_COLUMN_FORBIDDEN', 'BOARD_INVALID_REORDER',
  'RUN_NOT_FOUND', 'RUN_CONFLICT', 'RUN_START_FAILED', 'RUN_CANCEL_FAILED',
  'RUN_DELIVERY_FAILED', 'RUN_CONFIG_MISMATCH', 'RUN_DIFF_UNAVAILABLE',
  'RUN_EXPIRED', 'RUN_INVALID_TIME', 'RUN_PROCESS_UNCONFIRMED', 'RUN_STALE',
  'REVIEW_CONFLICT', 'REVIEW_SOURCE_MISSING', 'REVIEW_RESULT_STALE',
  'REVIEW_READ_ONLY_UNAVAILABLE', 'WORKFLOW_RUNTIME_UNAVAILABLE',
  'WORKFLOW_RUNTIME_UNSUPPORTED', 'WORKFLOW_PROFILE_UNAVAILABLE',
  'WORKFLOW_PROFILE_MISMATCH', 'WORKFLOW_BUDGET_UNSUPPORTED',
  'HANDOFF_CONFLICT', 'HANDOFF_CORRUPT', 'HANDOFF_EXPLANATION_REQUIRED', 'HANDOFF_STALE',
  'VERIFY_ARTIFACT_NOT_FOUND', 'VERIFY_CONFLICT', 'VERIFY_CWD_INVALID',
  'VERIFY_ENV_UNAVAILABLE', 'VERIFY_NOT_FOUND', 'VERIFY_PRESET_REQUIRED',
  'VERIFY_PRESET_UNAPPROVED', 'VERIFY_PROCESS_UNCONFIRMED', 'VERIFY_REPORT_INVALID',
  'VERIFY_RUNTIME_ERROR', 'VERIFY_SOURCE_STALE', 'VERIFY_WORKSPACE_UNAVAILABLE',
  'ACCEPTANCE_CONFLICT', 'ACCEPTANCE_CRITERION_UNKNOWN', 'ACCEPTANCE_EVIDENCE_REQUIRED',
  'ACCEPTANCE_REASON_REQUIRED', 'ACCEPTANCE_REASON_SENSITIVE',
  'ACCEPTANCE_REPORT_INVALID', 'ACCEPTANCE_SOURCE_STALE',
  'REWORK_CONFLICT', 'REWORK_LIMIT_REACHED', 'REWORK_SOURCE_STALE',
  'REWORK_TRIGGER_INVALID', 'REWORK_LAUNCH_FAILED',
  'REWORK_GATE_UNAVAILABLE',
  'DELIVERY_NOT_ACCEPTED', 'DELIVERY_SOURCE_STALE', 'MERGE_GIT_REQUIRED',
  'MERGE_REPO_CHANGED', 'MERGE_GIT_UNAVAILABLE', 'MERGE_GIT_FAILED',
  'MERGE_SNAPSHOT_CHANGED', 'MERGE_BRANCH_INVALID', 'MERGE_TARGET_NOT_CHECKED_OUT',
  'MERGE_TARGET_DIRTY', 'MERGE_TARGET_UNKNOWN', 'MERGE_REVALIDATION_REQUIRED',
  'MERGE_ALREADY_APPLIED', 'MERGE_OPERATION_EXISTS', 'MERGE_OPERATION_CONFLICT',
  'MERGE_DELIVERY_STALE', 'MERGE_ROOT_INVALID', 'MERGE_CONFLICT',
  'MERGE_OUTCOME_UNKNOWN', 'MERGE_CANCELLED',
  'TASK_CHANGE_NOT_FOUND', 'TASK_CHANGE_INVALID', 'TASK_CHANGE_STALE',
  'TASK_CHANGE_CONFLICT', 'TASK_CHANGE_WAITING_SAFE_POINT',
  'WORKFLOW_DRAFT_INVALID', 'WORKFLOW_DRAFT_STALE', 'WORKFLOW_NOT_FOUND',
  'WORKFLOW_CORRUPT',
  'WORKFLOW_DSL_VERSION_UNSUPPORTED',
  'CONTEXT_RUN_NOT_FOUND', 'CONTEXT_INVALID', 'CONTEXT_BUDGET_EXCEEDED',
  'CONTEXT_NO_SOURCE', 'CONTEXT_REQUIRES_HUMAN', 'CONTEXT_UNAVAILABLE',
  'KNOWLEDGE_PROJECT_UNAVAILABLE', 'KNOWLEDGE_PATH_DENIED',
  'KNOWLEDGE_READ_FAILED', 'KNOWLEDGE_TOO_LARGE', 'KNOWLEDGE_ENCODING_INVALID',
  'KNOWLEDGE_SENSITIVE_CONTENT', 'KNOWLEDGE_FORMAT_INVALID',
  'KNOWLEDGE_EMPTY', 'KNOWLEDGE_LINE_TOO_LONG', 'KNOWLEDGE_TOO_MANY_CHUNKS',
  'KNOWLEDGE_SOURCE_NOT_FOUND', 'KNOWLEDGE_CHUNK_NOT_FOUND',
  'KNOWLEDGE_SCOPE_DENIED', 'KNOWLEDGE_QUERY_TOO_COMPLEX',
]);

export const forgeErrorSchema = z.strictObject({
  code: forgeErrorCodeSchema,
  message: z.string().min(1).max(240),
  retryable: z.boolean(),
  correlationId: identifierSchema,
});

export const hostInfoSchema = z.strictObject({
  status: hostStatusSchema,
  hostId: z.uuid(),
  pid: z.int().positive(),
  version: versionSchema,
  productVersion: versionSchema,
  startedAt: timestampSchema,
  protocolVersion: z.string().min(1).max(80),
  runtime: z.union([z.strictObject({
    version: versionSchema,
    node: versionSchema,
    modules: versionSchema,
    electron: versionSchema.nullable(),
    platform: z.string().min(1),
    arch: z.string().min(1),
  }), z.strictObject({
    version: versionSchema,
    python: versionSchema,
    implementation: versionSchema,
    platform: z.string().min(1),
    arch: z.string().min(1),
  })]),
  transportVersion: z.literal('forge-local-jsonrpc/v1').optional(),
});

export const storageHealthSchema = z.strictObject({
  status: z.enum(['ready', 'unavailable']),
  schemaVersion: z.int().nonnegative().nullable(),
  sqliteVersion: versionSchema.nullable(),
  journalMode: z.enum(['wal', 'unknown']),
  error: forgeErrorSchema.nullable(),
});

export const hostHealthSchema = z.strictObject({
  ...hostInfoSchema.shape,
  uptimeMs: z.number().nonnegative(),
  timestamp: timestampSchema,
  storage: storageHealthSchema,
});

export const hostPingSchema = z.strictObject({
  reply: z.literal('pong'),
  hostId: z.uuid(),
  timestamp: timestampSchema,
});

/** System-only envelope. The reference business command-envelope schema remains unchanged. */
export const systemCommandEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  commandId: identifierSchema,
  type: z.string().min(1).max(128),
  createdAt: timestampSchema,
  protocolVersion: z.string().min(1).max(80),
  payload: z.strictObject({}),
});

export const systemCommandResultSchema = z.union([
  z.strictObject({
    commandId: identifierSchema,
    ok: z.literal(true),
    data: z.union([hostInfoSchema, hostHealthSchema, hostPingSchema]),
    durationMs: z.number().nonnegative(),
    hostTimestamp: timestampSchema,
  }),
  z.strictObject({
    commandId: identifierSchema,
    ok: z.literal(false),
    error: forgeErrorSchema,
    durationMs: z.number().nonnegative(),
    hostTimestamp: timestampSchema,
  }),
]);

export const hostConnectionSnapshotSchema = z.strictObject({
  revision: z.int().nonnegative(),
  state: connectionStateSchema,
  info: hostInfoSchema.nullable(),
  health: hostHealthSchema.nullable(),
  lastHealthCheck: timestampSchema.nullable(),
  error: forgeErrorSchema.nullable(),
});

const wireHelloRequestSchema = z.strictObject({
  kind: z.literal('hello'),
  requestId: identifierSchema,
  protocolVersion: z.string().min(1).max(80),
  productVersion: versionSchema,
  hostVersion: versionSchema,
  ownershipToken: z.uuid(),
});

const wireCommandRequestSchema = z.strictObject({
  kind: z.literal('command'),
  requestId: identifierSchema,
  command: systemCommandEnvelopeSchema,
});
const wireProjectRequestSchema = z.strictObject({
  kind: z.literal('project-command'), requestId: identifierSchema,
  command: projectCommandEnvelopeSchema,
});
const wireConversationRequestSchema = z.strictObject({
  kind: z.literal('conversation-command'), requestId: identifierSchema,
  command: conversationCommandEnvelopeSchema,
});
const wireDraftRequestSchema = z.strictObject({
  kind: z.literal('draft-command'), requestId: identifierSchema,
  command: draftCommandEnvelopeSchema,
});
const wireApprovalRequestSchema = z.strictObject({
  kind: z.literal('approval-command'), requestId: identifierSchema,
  command: approvalCommandEnvelopeSchema,
});
const wireBoardRequestSchema = z.strictObject({
  kind: z.literal('board-command'), requestId: identifierSchema,
  command: boardCommandEnvelopeSchema,
});
const wireRunRequestSchema = z.strictObject({
  kind: z.literal('run-command'), requestId: identifierSchema,
  command: runCommandEnvelopeSchema,
});

const wireShutdownRequestSchema = z.strictObject({
  kind: z.literal('shutdown'),
  requestId: identifierSchema,
  hostId: z.uuid(),
  ownershipToken: z.uuid(),
});

export const hostWireRequestSchema = z.discriminatedUnion('kind', [
  wireHelloRequestSchema, wireCommandRequestSchema, wireProjectRequestSchema,
  wireConversationRequestSchema, wireDraftRequestSchema, wireApprovalRequestSchema,
  wireBoardRequestSchema,
  wireRunRequestSchema,
  wireShutdownRequestSchema,
]);

const wireHelloResultSchema = z.union([
  z.strictObject({ kind: z.literal('hello-result'), requestId: identifierSchema, ok: z.literal(true), info: hostInfoSchema }),
  z.strictObject({ kind: z.literal('hello-result'), requestId: identifierSchema, ok: z.literal(false), error: forgeErrorSchema }),
]);

const wireShutdownResultSchema = z.union([
  z.strictObject({ kind: z.literal('shutdown-result'), requestId: identifierSchema, ok: z.literal(true), hostId: z.uuid() }),
  z.strictObject({ kind: z.literal('shutdown-result'), requestId: identifierSchema, ok: z.literal(false), error: forgeErrorSchema }),
]);

export const hostWireResponseSchema = z.union([
  z.strictObject({ kind: z.literal('ready'), info: hostInfoSchema }),
  wireHelloResultSchema,
  z.strictObject({ kind: z.literal('command-result'), requestId: identifierSchema, result: systemCommandResultSchema }),
  z.strictObject({ kind: z.literal('project-command-result'), requestId: identifierSchema, result: projectCommandResultSchema }),
  z.strictObject({ kind: z.literal('conversation-command-result'), requestId: identifierSchema,
    result: conversationCommandResultSchema }),
  z.strictObject({ kind: z.literal('draft-command-result'), requestId: identifierSchema,
    result: draftCommandResultSchema }),
  z.strictObject({ kind: z.literal('approval-command-result'), requestId: identifierSchema,
    result: approvalCommandResultSchema }),
  z.strictObject({ kind: z.literal('board-command-result'), requestId: identifierSchema,
    result: boardCommandResultSchema }),
  z.strictObject({ kind: z.literal('run-command-result'), requestId: identifierSchema,
    result: runCommandResultSchema }),
  z.strictObject({ kind: z.literal('conversation-event'), event: conversationStreamEventSchema }),
  wireShutdownResultSchema,
  z.strictObject({ kind: z.literal('protocol-error'), requestId: identifierSchema, error: forgeErrorSchema }),
]);

export function forgeError(
  code: z.infer<typeof forgeErrorCodeSchema>,
  message: string,
  correlationId: string,
  retryable = false,
): z.infer<typeof forgeErrorSchema> {
  return forgeErrorSchema.parse({ code, message, correlationId, retryable });
}

export type ForgeError = z.infer<typeof forgeErrorSchema>;
export type HostInfo = z.infer<typeof hostInfoSchema>;
export type HostHealth = z.infer<typeof hostHealthSchema>;
export type StorageHealth = z.infer<typeof storageHealthSchema>;
export type HostStatus = z.infer<typeof hostStatusSchema>;
export type HostConnectionSnapshot = z.infer<typeof hostConnectionSnapshotSchema>;
export type SystemCommandEnvelope = z.infer<typeof systemCommandEnvelopeSchema>;
export type SystemCommandResult = z.infer<typeof systemCommandResultSchema>;
export type HostWireRequest = z.infer<typeof hostWireRequestSchema>;
export type HostWireResponse = z.infer<typeof hostWireResponseSchema>;
