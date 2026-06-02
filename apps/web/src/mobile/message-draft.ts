import { z } from 'zod';
import type { MobileSession } from './pairing';

const KEY = 'forge-mobile-message-draft/v1';
const draftSchema = z.strictObject({
  version: z.literal('forge-mobile-message-draft/v1'),
  deviceId: z.uuid(), projectId: z.uuid(), conversationId: z.uuid(),
  text: z.string().min(1).max(30_000),
  savedAt: z.iso.datetime(), validUntil: z.iso.datetime(),
});
export type LocalMessageDraft = z.infer<typeof draftSchema>;

/** One explicit, tab-scoped user-authored draft. This is never a command queue. */
export function saveMessageDraft(session: MobileSession, projectId: string,
                                 conversationId: string, text: string): LocalMessageDraft | null {
  const now = Date.now();
  const validUntil = Math.min(Date.parse(session.expiresAt), now + 24 * 60 * 60 * 1000);
  if (!session.projectIds.includes(projectId) || validUntil <= now) return null;
  const parsed = draftSchema.safeParse({
    version: KEY, deviceId: session.deviceId, projectId, conversationId,
    text: text.trim(), savedAt: new Date(now).toISOString(),
    validUntil: new Date(validUntil).toISOString(),
  });
  if (!parsed.success) return null;
  try { sessionStorage.setItem(KEY, JSON.stringify(parsed.data)); }
  catch { return null; }
  return parsed.data;
}

/** Offline editing may update the same saved draft, without extending its expiry. */
export function updateMessageDraft(text: string): LocalMessageDraft | null {
  const previous = readMessageDraft();
  if (!previous) return null;
  const parsed = draftSchema.safeParse({ ...previous, text: text.trim(),
    savedAt: new Date().toISOString() });
  if (!parsed.success) return null;
  try { sessionStorage.setItem(KEY, JSON.stringify(parsed.data)); }
  catch { return null; }
  return parsed.data;
}

export function readMessageDraft(session?: MobileSession | null): LocalMessageDraft | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (!value) return null;
    if (value.length > 32_000) { sessionStorage.removeItem(KEY); return null; }
    const parsed = draftSchema.safeParse(JSON.parse(value) as unknown);
    if (!parsed.success || Date.parse(parsed.data.validUntil) <= Date.now()) {
      sessionStorage.removeItem(KEY); return null;
    }
    if (session && (parsed.data.deviceId !== session.deviceId ||
        !session.projectIds.includes(parsed.data.projectId) ||
        Date.parse(parsed.data.validUntil) > Date.parse(session.expiresAt))) {
      sessionStorage.removeItem(KEY); return null;
    }
    return parsed.data;
  } catch { return null; }
}

export function clearMessageDraft(): boolean {
  try { sessionStorage.removeItem(KEY); return true; }
  catch { return false; }
}
