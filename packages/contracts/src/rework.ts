import { z } from 'zod';

export const reworkCycleSchema = z.strictObject({
  cycleId: z.uuid(), projectId: z.uuid(), taskId: z.uuid(),
  sourceRunId: z.uuid(), sourceSnapshotId: z.uuid(),
  triggerKind: z.enum(['review', 'verify']), triggerReportId: z.uuid(),
  nextRunId: z.uuid().nullable(), cycleNo: z.int().positive(),
  totalAttempts: z.int().positive(),
  state: z.enum(['pending', 'launching', 'running', 'blocked', 'interrupted',
    'succeeded', 'failed', 'cancelled']),
  reasonCode: z.string().nullable(), createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ReworkCycle = z.infer<typeof reworkCycleSchema>;
