import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MobileSession } from './pairing';
import { clearRedactedSummary, readRedactedSummary, saveRedactedSummary } from './offline-summary';

const session: MobileSession = {
  sessionId: '40aeb789-5011-40d1-a61c-748f661bcc5a',
  policyRevision: 1,
  deviceId: '31ef81d5-3884-4a72-8bf4-0b28ce98130a',
  projectIds: ['96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8'],
  expiresAt: '2026-09-27T12:00:00Z', csrfToken: 'A'.repeat(43),
};
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('offline read-only summary', () => {
  it('persists only bounded counts, expires before the session, and clears explicitly', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    const saved = saveRedactedSummary(session, {
      viewedProjectCount: 1, viewedTaskCount: 2, pendingApprovalCount: 1,
      blockedTaskCount: 0, partial: false,
    });
    expect(saved?.viewedTaskCount).toBe(2);
    expect(readRedactedSummary()).toEqual(saved);
    const raw = localStorage.getItem('forge-mobile-redacted-summary/v1') ?? '';
    expect(raw).not.toContain(session.csrfToken);
    expect(raw).not.toContain(session.projectIds[0]);
    expect(raw).not.toContain('title');
    vi.setSystemTime(new Date('2026-09-26T12:00:01Z'));
    expect(readRedactedSummary()).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(clearRedactedSummary()).toBe(true);
  });

  it('rejects malformed and overlarge local data rather than rendering it', () => {
    localStorage.setItem('forge-mobile-redacted-summary/v1', JSON.stringify({
      version: 'forge-mobile-redacted-summary/v1', projectName: 'sensitive',
    }));
    expect(readRedactedSummary()).toBeNull();
    localStorage.setItem('forge-mobile-redacted-summary/v1', 'x'.repeat(2049));
    expect(readRedactedSummary()).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
