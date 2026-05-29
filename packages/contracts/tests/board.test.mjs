import test from 'node:test';
import assert from 'node:assert/strict';
import { boardCommandEnvelopeSchema, boardSnapshotSchema, hostProtocolVersion } from '../dist/index.js';

test('board accepts only fixed snapshot and within-column reorder commands', () => {
  const base = { schemaVersion: '1.0', commandId: crypto.randomUUID(),
    createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion };
  const projectId = crypto.randomUUID();
  assert.equal(boardCommandEnvelopeSchema.safeParse({ ...base, type: 'board.snapshot',
    payload: { projectId } }).success, true);
  assert.equal(boardCommandEnvelopeSchema.safeParse({ ...base, type: 'task.detail',
    payload: { projectId, taskId: crypto.randomUUID() } }).success, true);
  assert.equal(boardCommandEnvelopeSchema.safeParse({ ...base, type: 'task.detail',
    payload: { projectId, taskId: crypto.randomUUID(), sql: 'SELECT *' } }).success, false);
  assert.equal(boardCommandEnvelopeSchema.safeParse({ ...base, type: 'tasks.reorder',
    payload: { projectId, taskId: crypto.randomUUID(), expectedBoardRevision: 1,
      idempotencyKey: crypto.randomUUID(), beforeTaskId: null, afterTaskId: null,
      state: 'done' } }).success, false);
  assert.equal(boardCommandEnvelopeSchema.safeParse({ ...base, type: 'tasks.patchState',
    payload: { projectId, state: 'done' } }).success, false);
});

test('board snapshot requires authoritative revision, cursor and task fields', () => {
  assert.equal(boardSnapshotSchema.safeParse({ projectId: crypto.randomUUID(), tasks: [],
    eventCursor: '0', boardRevision: 0, serverTime: new Date().toISOString() }).success, true);
  assert.equal(boardSnapshotSchema.safeParse({ projectId: crypto.randomUUID(), tasks: [],
    eventCursor: '0', boardRevision: 0, serverTime: new Date().toISOString(),
    forgedSuccess: true }).success, false);
});
