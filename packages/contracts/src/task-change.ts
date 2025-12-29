import { z } from 'zod';
import { taskContractSchema } from './task-draft.js';

export const taskChangeViewSchema = z.strictObject({
  changeId:z.uuid(),projectId:z.uuid(),taskId:z.uuid(),
  baseRevision:z.int().positive(),proposedRevision:z.int().positive(),
  contract:taskContractSchema,contentHash:z.string().regex(/^[a-f0-9]{64}$/),
  scopeHash:z.string().regex(/^[a-f0-9]{64}$/),decisionId:z.uuid(),
  reason:z.string().min(12).max(2000),
  state:z.enum(['proposed','awaiting_safe_point','applied','rejected','stale']),
  approvalReason:z.string().nullable(),createdAt:z.iso.datetime(),
  decidedAt:z.iso.datetime().nullable(),appliedAt:z.iso.datetime().nullable(),
});

export type TaskChangeView = z.infer<typeof taskChangeViewSchema>;
