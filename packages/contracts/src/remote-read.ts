import { z } from 'zod';
import { taskContractSchema } from './task-draft.js';

/** Production remote read model. `blocked` preserves the real Host task state;
 * the reference OpenAPI TaskSummary enum is missing this existing state. */
export const remoteProjectPageSchema = z.strictObject({
  items: z.array(z.strictObject({
    id: z.uuid(), name: z.string().min(1), revision: z.int().nonnegative(),
    defaultBranch: z.string(), online: z.boolean(),
  })).max(100),
  page: z.strictObject({ cursor: z.uuid().nullable(), hasMore: z.boolean() }),
});

/** Metadata only: no prompt, assistant or tool text crosses this read surface. */
export const remoteConversationPageSchema = z.strictObject({
  projectId: z.uuid(),
  items: z.array(z.strictObject({
    conversationId: z.uuid(), projectId: z.uuid(),
    title: z.string().min(1).max(160), revision: z.int().positive(),
    updatedAt: z.iso.datetime(),
  })).max(50),
  page: z.strictObject({
    cursor: z.string().regex(/^c:[a-f0-9]{16}:(0|[1-9][0-9]{0,15})$/).nullable(),
    hasMore: z.boolean(),
  }),
});

/** Text-only visible conversation history. System/tool text and attachments stay in Host. */
export const remoteMessagePageSchema = z.strictObject({
  projectId: z.uuid(), conversationId: z.uuid(),
  items: z.array(z.strictObject({
    messageId: z.uuid(), conversationId: z.uuid(), sequence: z.int().positive(),
    role: z.enum(['user', 'assistant']), content: z.string().max(4000),
    truncated: z.boolean(),
    status: z.enum(['pending', 'streaming', 'completed', 'failed', 'cancelled']),
    createdAt: z.iso.datetime(),
  })).max(20),
  page: z.strictObject({ cursor: z.string().regex(/^m:[1-9][0-9]{0,15}$/).nullable(),
    hasMore: z.boolean() }),
});

/** Current Host Drafts only, scoped to one granted Project/conversation.
 * Source text and local paths are deliberately omitted. */
export const remoteDraftPageSchema = z.strictObject({
  projectId: z.uuid(), conversationId: z.uuid(),
  items: z.array(z.strictObject({
    draftId: z.uuid(), projectId: z.uuid(), conversationId: z.uuid(),
    sourceMessageId: z.uuid(), revision: z.int().positive(),
    canRevise: z.boolean(),
    status: z.enum(['generating', 'proposed', 'needs_clarification',
      'invalid_output', 'manual']),
    contract: taskContractSchema.nullable(), updatedAt: z.iso.datetime(),
  })).max(50),
  page: z.strictObject({ cursor: z.string().regex(/^d:[1-9][0-9]{0,15}$/).nullable(),
    hasMore: z.boolean() }),
});

export const remoteTaskSummarySchema = z.strictObject({
  id: z.uuid(), projectId: z.uuid(), title: z.string().min(1),
  state: z.enum(['draft', 'todo', 'active', 'blocked', 'awaiting_acceptance',
    'done', 'cancelled', 'archived']),
  boardColumn: z.enum(['todo', 'development', 'review', 'verify', 'done']),
  revision: z.int().positive(), contractRevision: z.int().positive(),
  approvedRevision: z.int().positive().nullable(), activeRunId: z.uuid().nullable(),
  blockReason: z.string().nullable(), allowedCommands: z.array(z.string()),
});

export const remoteBoardSchema = z.strictObject({
  projectId: z.uuid(), tasks: z.array(remoteTaskSummarySchema),
  eventCursor: z.string().regex(/^p:(0|[1-9][0-9]{0,17})$/), serverTime: z.iso.datetime(),
});

/** Durable invalidations only. They never authorize a command or replace a read snapshot. */
export const remoteEventSchema = z.strictObject({
  id: z.string().regex(/^p:(0|[1-9][0-9]{0,17})$/),
  hostId: z.string().min(1).max(80), projectId: z.uuid(),
  taskId: z.uuid().nullable(), entityId: z.uuid(),
  type: z.enum(['board.changed', 'run.changed', 'approval.changed',
    'review.changed', 'verify.changed', 'acceptance.changed',
    'conversation.changed', 'draft.changed']),
  occurredAt: z.string().min(1).max(40),
});

export const remoteNotificationPageSchema = z.strictObject({
  projectId: z.uuid(),
  items: z.array(remoteEventSchema).max(20),
  lastEventCursor: z.string().regex(/^p:(0|[1-9][0-9]{0,17})$/),
});

export const remoteTaskPageSchema = z.strictObject({
  projectId: z.uuid(), tasks: z.array(remoteTaskSummarySchema).max(100),
  boardRevision: z.int().nonnegative(),
  eventCursor: z.string().regex(/^p:(0|[1-9][0-9]{0,17})$/),
  serverTime: z.iso.datetime(),
  page: z.strictObject({ cursor: z.string().regex(/^b:[0-9]+:[0-9]+$/).nullable(),
    hasMore: z.boolean() }),
});

/** The reference GET /v1/approvals has no response schema. This minimal
 * production projection contains only current, decidable Task approvals. */
export const remoteApprovalPageSchema = z.strictObject({
  items: z.array(z.strictObject({
    approvalId: z.uuid(), projectId: z.uuid(), taskId: z.uuid(),
    expectedRevision: z.int().positive(), scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime(), summary: z.string().min(1),
    risk: z.literal('medium'), requiredScope: z.literal('task:create:todo'),
  })).max(50),
  page: z.strictObject({ cursor: z.string().regex(/^a:[1-9][0-9]{0,15}$/).nullable(),
    hasMore: z.boolean() }),
});

/** A fresh, project-scoped Task draft approval. It has no code snapshot yet. */
export const remoteApprovalDetailSchema = z.strictObject({
  approvalId: z.uuid(), projectId: z.uuid(), taskId: z.uuid(),
  expectedRevision: z.int().positive(),
  scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshotId: z.null(), actionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime(), summary: z.string().min(1),
  risk: z.literal('medium'), requiredScope: z.literal('task:create:todo'),
  deviceOperationScope: z.literal('task:approve'),
  contract: taskContractSchema,
});

export const remoteTaskDetailSchema = z.strictObject({
  task: remoteTaskSummarySchema, contract: taskContractSchema,
  runIds: z.array(z.uuid()).max(50), artifactIds: z.array(z.uuid()).max(200),
  pendingApprovalIds: z.array(z.uuid()).max(50),
  evidence: z.array(z.strictObject({
    kind: z.enum(['review', 'verify', 'owner', 'delivery']),
    id: z.uuid(), status: z.string().min(1).max(48),
    snapshotId: z.uuid(), createdAt: z.iso.datetime(),
  })).max(20),
});

export const remoteTaskActivityPageSchema = z.strictObject({
  taskId: z.uuid(), items: z.array(z.strictObject({
    cursor: z.int().positive(), runId: z.uuid(), type: z.string().min(1).max(48),
    text: z.string().max(2048), timestamp: z.iso.datetime(),
  })).max(50),
  page: z.strictObject({ cursor: z.string().regex(/^o:[1-9][0-9]{0,15}$/).nullable(),
    hasMore: z.boolean() }),
});

export const remoteTaskDiffPageSchema = z.strictObject({
  taskId: z.uuid(), available: z.boolean(), runId: z.uuid().nullable(),
  files: z.array(z.strictObject({
    path: z.string().min(1).max(512),
    status: z.enum(['added', 'modified', 'deleted', 'renamed']),
  })).max(200),
  textChunk: z.string().max(8192),
  nextCursor: z.string().regex(/^d:[a-f0-9]{16}:(0|[1-9][0-9]{0,15})$/).nullable(),
  truncated: z.boolean(), capturedAt: z.iso.datetime().nullable(),
});

export type RemoteProjectPage = z.infer<typeof remoteProjectPageSchema>;
export type RemoteConversationPage = z.infer<typeof remoteConversationPageSchema>;
export type RemoteMessagePage = z.infer<typeof remoteMessagePageSchema>;
export type RemoteDraftPage = z.infer<typeof remoteDraftPageSchema>;
export type RemoteTaskSummary = z.infer<typeof remoteTaskSummarySchema>;
export type RemoteBoard = z.infer<typeof remoteBoardSchema>;
export type RemoteEvent = z.infer<typeof remoteEventSchema>;
export type RemoteNotificationPage = z.infer<typeof remoteNotificationPageSchema>;
export type RemoteTaskPage = z.infer<typeof remoteTaskPageSchema>;
export type RemoteApprovalPage = z.infer<typeof remoteApprovalPageSchema>;
export type RemoteApprovalDetail = z.infer<typeof remoteApprovalDetailSchema>;
export type RemoteTaskDetail = z.infer<typeof remoteTaskDetailSchema>;
export type RemoteTaskActivityPage = z.infer<typeof remoteTaskActivityPageSchema>;
export type RemoteTaskDiffPage = z.infer<typeof remoteTaskDiffPageSchema>;
