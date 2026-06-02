import { z } from 'zod';
import type { MobileSession } from './pairing';

const KEY = 'forge-mobile-redacted-summary/v1';
const summarySchema = z.strictObject({
  version: z.literal('forge-mobile-redacted-summary/v1'),
  deviceId: z.uuid(),
  confirmedAt: z.iso.datetime(),
  validUntil: z.iso.datetime(),
  viewedProjectCount: z.number().int().min(0).max(32),
  viewedTaskCount: z.number().int().min(0).max(100_000),
  pendingApprovalCount: z.number().int().min(0).max(100_000),
  blockedTaskCount: z.number().int().min(0).max(100_000),
  partial: z.boolean(),
});
export type RedactedSummary = z.infer<typeof summarySchema>;
type Counts = Pick<RedactedSummary, 'viewedProjectCount' | 'viewedTaskCount' |
  'pendingApprovalCount' | 'blockedTaskCount' | 'partial'>;

/** No titles, IDs, text, code, paths, approvals or credentials are persisted. */
export function saveRedactedSummary(session: MobileSession, counts: Counts): RedactedSummary | null {
  const now = Date.now();
  const validUntil = Math.min(Date.parse(session.expiresAt), now + 24 * 60 * 60 * 1000);
  if (validUntil <= now) return null;
  const parsed = summarySchema.safeParse({
    version: 'forge-mobile-redacted-summary/v1', deviceId: session.deviceId,
    confirmedAt: new Date(now).toISOString(), validUntil: new Date(validUntil).toISOString(),
    ...counts,
  });
  if (!parsed.success) return null;
  try { localStorage.setItem(KEY, JSON.stringify(parsed.data)); }
  catch { return null; }
  return parsed.data;
}

export function readRedactedSummary(): RedactedSummary | null {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return null;
    if (value.length > 2048) { localStorage.removeItem(KEY); return null; }
    const parsed = summarySchema.safeParse(JSON.parse(value) as unknown);
    if (!parsed.success || Date.parse(parsed.data.validUntil) <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

export function clearRedactedSummary(): boolean {
  try { localStorage.removeItem(KEY); return true; }
  catch { return false; }
}
