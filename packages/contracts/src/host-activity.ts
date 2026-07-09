import { z } from 'zod';

const count = z.number().int().nonnegative();
export const hostActivitySchema = z.strictObject({
  activityCount: count,
  counts: z.strictObject({ startingRuns: count, developmentRuns: count, scheduledRuns: count,
    reviewJobs: count, verifyJobs: count, refinerJobs: count, ownedProcesses: count }),
  timestamp: z.iso.datetime({ offset: true }),
}).refine((value) => value.activityCount === Object.values(value.counts)
  .reduce((total, countValue) => total + countValue, 0), 'Inconsistent activity count');
export type HostActivity = z.infer<typeof hostActivitySchema>;
