import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextSourceStatusSchema, runCommandEnvelopeSchema,
  stageContextPreviewSchema } from '../dist/index.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

test('Stage Context preview bridge permits only a scoped bounded query', () => {
  const command = { schemaVersion: '1.0', commandId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-25T00:00:00Z', protocolVersion: 'forge-host-protocol/v5',
    type: 'context.preview', payload: { projectId, runId, query: '日期筛选 start_date' } };
  assert.equal(runCommandEnvelopeSchema.safeParse(command).success, true);
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...command, payload: {
    ...command.payload, sql: 'SELECT * FROM projects',
  } }).success, false);
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...command, payload: {
    ...command.payload, maxChars: 999,
  } }).success, false);
});

test('historical source status admits only a scoped read-only command and closed result', () => {
  const command = { schemaVersion: '1.0', commandId: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-09-25T00:00:00Z', protocolVersion: 'forge-host-protocol/v5',
    type: 'context.sources', payload: { projectId, runId } };
  assert.equal(runCommandEnvelopeSchema.safeParse(command).success, true);
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...command, payload: {
    ...command.payload, sourcePath: '/private',
  } }).success, false);
  assert.equal(contextSourceStatusSchema.safeParse({
    kind: 'retrieved_knowledge', sourceRef: `knowledge:${runId}@1#0`, status: 'revoked',
  }).success, true);
  assert.equal(contextSourceStatusSchema.safeParse({
    kind: 'retrieved_knowledge', sourceRef: `knowledge:${runId}@1#0`, status: 'current',
    rawSql: 'SELECT *',
  }).success, false);
});

test('Stage Context output labels conflict, omitted items and exact evidence', () => {
  const preview = { projectId, runId, taskRevision: 2, configHash: 'a'.repeat(64),
    indexVersion: 'forge-knowledge-search/v1-fts5-trigram-cjk-short',
    query: '日期筛选', status: 'needs_human_decision', items: [{
      priority: 1, kind: 'approved_task', trust: 'approved', sourceRef: 'task:fixture@2',
      sourceHash: 'b'.repeat(64), text: 'Approved goal',
    }], sourceRefs: ['task:fixture@2'], conflicts: [{
      currentSourceRef: 'knowledge:fixture@2#0', otherSourceRef: 'knowledge:fixture@1#0',
      reason: 'SOURCE_VERSION_CHANGED', question: 'Choose current version',
    }], omittedItems: 1, usedChars: 100, maxChars: 1000, truncated: true };
  assert.equal(stageContextPreviewSchema.safeParse(preview).success, true);
  assert.equal(stageContextPreviewSchema.safeParse({ ...preview, status: 'auto_approved' }).success, false);
  assert.equal(stageContextPreviewSchema.safeParse({ ...preview, rawProviderEvent: {} }).success, false);
});
