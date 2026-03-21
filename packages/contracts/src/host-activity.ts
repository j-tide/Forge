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

export const hostProfileSwitchSafetySchema = z.strictObject({
  safe: z.boolean(),
  fences: z.strictObject({
    unresolvedRuns: count,
    quarantinedLeases: count,
    interruptedReviewJobs: count,
    interruptedVerifyJobs: count,
    orphanProcessRecords: count,
    uncertainProcessJournalEntries: count,
  }),
  timestamp: z.iso.datetime({ offset: true }),
}).refine((value) => value.safe === Object.values(value.fences)
  .every((fenceCount) => fenceCount === 0), 'Inconsistent profile switch safety');
export type HostProfileSwitchSafety = z.infer<typeof hostProfileSwitchSafetySchema>;
