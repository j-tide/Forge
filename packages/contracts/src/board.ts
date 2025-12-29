import { z } from 'zod';
import { taskContractSchema } from './task-draft.js';

export const boardColumnSchema = z.enum(['todo', 'development', 'review', 'verify', 'done']);
export const boardStateSchema = z.enum(['todo', 'active', 'blocked', 'awaiting_acceptance', 'done']);
export const boardTaskSchema = z.strictObject({
  id: z.uuid(), projectId: z.uuid(), title: z.string().min(1).max(120),
  state: boardStateSchema, boardColumn: boardColumnSchema,
  revision: z.int().positive(), contractRevision: z.int().positive(),
  approvedRevision: z.int().positive(), activeRunId: z.uuid().nullable(),
  blockReason: z.string().nullable(), allowedCommands: z.array(z.enum(['tasks.reorder'])),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  executorId: z.string().nullable(), position: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export const boardSnapshotSchema = z.strictObject({
  projectId: z.uuid(), tasks: z.array(boardTaskSchema), eventCursor: z.string(),
  boardRevision: z.int().nonnegative(), serverTime: z.iso.datetime(),
});
export const boardReorderInputSchema = z.strictObject({
  projectId: z.uuid(), taskId: z.uuid(), expectedBoardRevision: z.int().nonnegative(),
  idempotencyKey: z.uuid(), beforeTaskId: z.uuid().nullable(), afterTaskId: z.uuid().nullable(),
});
/** TaskDetail mirrors the reference OpenAPI shape; source resolution is a local read-model extension. */
export const taskDetailSchema = z.strictObject({
  task: boardTaskSchema, contract: taskContractSchema,
  runIds: z.array(z.uuid()), artifactIds: z.array(z.uuid()),
  pendingApprovalIds: z.array(z.uuid()),
});
export const taskSourceSchema = z.strictObject({
  ref: z.string().min(1), kind: z.enum(['message', 'decision', 'unknown']),
  status: z.enum(['available', 'withdrawn']), text: z.string().nullable(),
  createdAt: z.iso.datetime().nullable(),
});
export const taskDetailViewSchema = z.strictObject({
  detail: taskDetailSchema, sources: z.array(taskSourceSchema),
});
const envelope = { schemaVersion: z.literal('1.0'), commandId: z.uuid(),
  createdAt: z.iso.datetime(), protocolVersion: z.string().min(1).max(80) };
export const boardCommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('board.snapshot'), payload: z.strictObject({
    projectId: z.uuid(),
  }) }),
  z.strictObject({ ...envelope, type: z.literal('tasks.reorder'), payload: boardReorderInputSchema }),
  z.strictObject({ ...envelope, type: z.literal('task.detail'), payload: z.strictObject({
    projectId: z.uuid(), taskId: z.uuid(),
  }) }),
]);
export const boardCommandResultSchema = z.union([
  z.strictObject({ commandId: z.uuid(), ok: z.literal(true), data: z.union([
    boardSnapshotSchema, taskDetailViewSchema]),
    durationMs: z.number().nonnegative(), hostTimestamp: z.iso.datetime() }),
  z.strictObject({ commandId: z.uuid(), ok: z.literal(false), error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1).max(240),
    retryable: z.boolean(), correlationId: z.string().min(1).max(128),
  }), durationMs: z.number().nonnegative(), hostTimestamp: z.iso.datetime() }),
]);
export type BoardColumn = z.infer<typeof boardColumnSchema>;
export type BoardTask = z.infer<typeof boardTaskSchema>;
export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;
export type BoardReorderInput = z.infer<typeof boardReorderInputSchema>;
export type TaskDetailView = z.infer<typeof taskDetailViewSchema>;
export type TaskSource = z.infer<typeof taskSourceSchema>;
export type BoardCommandEnvelope = z.infer<typeof boardCommandEnvelopeSchema>;
export type BoardCommandResult = z.infer<typeof boardCommandResultSchema>;
