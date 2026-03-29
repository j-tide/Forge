import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remoteBoardSchema, remoteConversationPageSchema,
  remoteMessagePageSchema } from '../dist/index.js';

test('remote read model preserves a blocked Host Task without a false state', () => {
  const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
  const board = remoteBoardSchema.parse({ projectId: id, eventCursor: 'p:0',
    serverTime: '2026-09-25T00:00:00Z', tasks: [{
      id, projectId: id, title: 'Blocked', state: 'blocked', boardColumn: 'review',
      revision: 2, contractRevision: 1, approvedRevision: 1,
      activeRunId: null, blockReason: 'Review failed', allowedCommands: [],
    }],
  });
  assert.equal(board.tasks[0].state, 'blocked');
  assert.equal(remoteBoardSchema.safeParse({ ...board, tasks: [{
    ...board.tasks[0], state: 'secret_admin_state',
  }] }).success, false);
});

test('remote conversation read exposes bounded metadata and rejects extra content', () => {
  const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
  const page = { projectId: id, items: [{ conversationId: id, projectId: id,
    title: 'Existing conversation', revision: 2,
    updatedAt: '2026-09-25T00:00:00Z' }],
  page: { cursor: null, hasMore: false } };
  assert.equal(remoteConversationPageSchema.parse(page).items[0].revision, 2);
  assert.equal(remoteConversationPageSchema.safeParse({ ...page, items: [
    { ...page.items[0], content: 'unreviewed assistant text' },
  ] }).success, false);
  assert.equal(remoteConversationPageSchema.safeParse({ ...page, items: [
    { ...page.items[0], projectId: 'other' },
  ] }).success, false);
});

test('mobile message history excludes internal roles and unbounded content', () => {
  const id = '40aeb789-5011-40d1-a61c-748f661bcc5a';
  const item = { messageId: id, conversationId: id, sequence: 1,
    role: 'user', content: 'Need input validation', truncated: false,
    status: 'completed', createdAt: '2026-09-25T00:00:00Z' };
  const page = { projectId: id, conversationId: id,
    items: [item], page: { cursor: null, hasMore: false } };
  assert.equal(remoteMessagePageSchema.parse(page).items[0].content, item.content);
  assert.equal(remoteMessagePageSchema.safeParse({ ...page,
    items: [{ ...item, role: 'tool' }] }).success, false);
  assert.equal(remoteMessagePageSchema.safeParse({ ...page,
    items: [{ ...item, content: 'x'.repeat(4001) }] }).success, false);
  assert.equal(remoteMessagePageSchema.safeParse({ ...page,
    items: [{ ...item, attachmentIds: [id] }] }).success, false);
});
