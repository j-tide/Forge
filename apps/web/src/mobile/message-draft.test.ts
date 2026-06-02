import { afterEach, describe, expect, it } from 'vitest';
import { clearMessageDraft, readMessageDraft, saveMessageDraft, updateMessageDraft } from './message-draft';
import type { MobileSession } from './pairing';

const projectId = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const conversationId = '96bc2fcb-66da-4d0b-ad15-bbaf0c766cd8';
const session: MobileSession = {
  sessionId: projectId, deviceId: conversationId, projectIds: [projectId], policyRevision: 1,
  expiresAt: new Date(Date.now() + 60_000).toISOString(), csrfToken: 'A'.repeat(43),
};
afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe('explicit mobile message draft', () => {
  it('stays in one tab session, survives an offline reload, never becomes a command', () => {
    const stored = saveMessageDraft(session, projectId, conversationId, '  离线需求补充  ');
    expect(stored?.text).toBe('离线需求补充');
    expect(readMessageDraft()?.text).toBe('离线需求补充');
    expect(updateMessageDraft('继续编辑')?.text).toBe('继续编辑');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem('forge-mobile-message-draft/v1')).not.toContain('csrfToken');
    expect(clearMessageDraft()).toBe(true);
    expect(readMessageDraft()).toBeNull();
  });

  it('refuses foreign Project or device, expiry and oversized content', () => {
    expect(saveMessageDraft(session, crypto.randomUUID(), conversationId, 'foreign')).toBeNull();
    expect(saveMessageDraft(session, projectId, conversationId, 'x'.repeat(30_001))).toBeNull();
    saveMessageDraft(session, projectId, conversationId, 'Mine');
    expect(readMessageDraft({ ...session, deviceId: crypto.randomUUID() })).toBeNull();
    expect(sessionStorage.length).toBe(0);
    saveMessageDraft(session, projectId, conversationId, 'Mine');
    expect(readMessageDraft({ ...session, projectIds: [] })).toBeNull();
    expect(sessionStorage.length).toBe(0);
    const expired = { ...session, expiresAt: new Date(Date.now() - 1).toISOString() };
    expect(saveMessageDraft(expired, projectId, conversationId, 'expired')).toBeNull();
  });
});
