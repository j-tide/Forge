import { z } from 'zod';

const timestamp = z.iso.datetime();
export const conversationSchema = z.strictObject({
  conversationId: z.uuid(), projectId: z.uuid(), title: z.string().trim().min(1).max(160),
  revision: z.int().positive(), createdAt: timestamp, updatedAt: timestamp,
  archivedAt: timestamp.nullable(),
});

export const conversationMessageSchema = z.strictObject({
  messageId: z.uuid(), conversationId: z.uuid(), sequence: z.int().positive(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().max(100_000),
  status: z.enum(['pending', 'streaming', 'completed', 'failed', 'cancelled']),
  createdAt: timestamp, updatedAt: timestamp,
});

export const conversationSendSchema = z.strictObject({
  projectId: z.uuid(), conversationId: z.uuid(),
  idempotencyKey: z.string().min(16).max(128),
  text: z.string().trim().min(1).max(100_000),
  attachmentIds: z.array(z.uuid()).max(16),
});

export const conversationStreamEventSchema = z.strictObject({
  projectId: z.uuid(), conversationId: z.uuid(), messageId: z.uuid(),
  sequence: z.int().positive(), timestamp,
  type: z.enum(['message.started', 'message.delta', 'message.completed',
    'message.failed', 'message.cancelled']),
  delta: z.string().max(8192).nullable(),
});

/** A source-bound suggestion. There is intentionally no execute/approve method on this contract. */
export const controlProposalSchema = z.strictObject({
  proposalId: z.uuid(), projectId: z.uuid(), conversationId: z.uuid(),
  sourceMessageId: z.uuid(),
  kind: z.enum(['lower_priority', 'pause_run', 'revise_draft', 'restricted', 'unrecognized']),
  state: z.enum(['needs_target', 'requires_confirmation', 'unavailable', 'unsupported']),
  targetKind: z.enum(['task', 'run', 'draft']).nullable(),
  summary: z.string().min(1).max(240), requiresHumanConfirmation: z.boolean(),
  executionAllowed: z.literal(false), createdAt: timestamp,
});

const envelopeBase = { schemaVersion: z.literal('1.0'), commandId: z.uuid(),
  createdAt: timestamp, protocolVersion: z.string().min(1).max(80) };
export const conversationCommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.create'),
    payload: z.strictObject({ projectId: z.uuid(), title: z.string().trim().min(1).max(160),
      expectedRevision: z.literal(0) }) }),
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.list'),
    payload: z.strictObject({ projectId: z.uuid() }) }),
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.get'),
    payload: z.strictObject({ projectId: z.uuid(), conversationId: z.uuid() }) }),
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.messages'),
    payload: z.strictObject({ projectId: z.uuid(), conversationId: z.uuid() }) }),
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.send'), payload: conversationSendSchema }),
  z.strictObject({ ...envelopeBase, type: z.literal('intent.propose'),
    payload: z.strictObject({ projectId: z.uuid(), conversationId: z.uuid(),
      messageId: z.uuid() }) }),
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.cancel'),
    payload: z.strictObject({ projectId: z.uuid(), conversationId: z.uuid() }) }),
  z.strictObject({ ...envelopeBase, type: z.literal('conversation.archive'),
    payload: z.strictObject({ projectId: z.uuid(), conversationId: z.uuid(),
      expectedRevision: z.int().positive() }) }),
]);

export const conversationCommandResultSchema = z.union([
  z.strictObject({ commandId: z.uuid(), ok: z.literal(true), data: z.union([
    conversationSchema, conversationSchema.nullable(), z.array(conversationSchema),
    z.array(conversationMessageSchema),
    z.strictObject({ message: conversationMessageSchema, replay: z.boolean(),
      replyStatus: z.enum(['unavailable', 'streaming', 'completed']) }),
    z.strictObject({ cancelled: z.boolean() }),
    controlProposalSchema,
  ]), durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
  z.strictObject({ commandId: z.uuid(), ok: z.literal(false), error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1).max(240),
    retryable: z.boolean(), correlationId: z.string().min(1).max(128),
  }), durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
]);

export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationSend = z.infer<typeof conversationSendSchema>;
export type ConversationStreamEvent = z.infer<typeof conversationStreamEventSchema>;
export type ControlProposal = z.infer<typeof controlProposalSchema>;
export type ConversationCommandEnvelope = z.infer<typeof conversationCommandEnvelopeSchema>;
export type ConversationCommandResult = z.infer<typeof conversationCommandResultSchema>;
