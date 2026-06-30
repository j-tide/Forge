import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knowledgeCommandSchema, knowledgeSourceSchema } from '../dist/knowledge.js';

const projectId = '22222222-2222-4222-8222-222222222222';

test('knowledge bridge accepts only fixed typed operations and closed payloads', () => {
  assert.equal(knowledgeCommandSchema.safeParse({
    type: 'import', payload: { projectId, relativePath: 'docs/guide.md' },
  }).success, true);
  assert.equal(knowledgeCommandSchema.safeParse({
    type: 'runScript', payload: { projectId },
  }).success, false);
  assert.equal(knowledgeCommandSchema.safeParse({
    type: 'import', payload: { projectId, relativePath: 'docs/guide.md', command: 'sh' },
  }).success, false);
  assert.equal(knowledgeCommandSchema.safeParse({
    type: 'chunk', payload: { projectId, sourceId: 'not-a-uuid', version: 1, ordinal: 0 },
  }).success, false);
});

test('knowledge source data carries real version, hash, status and count', () => {
  const source = { sourceId: '11111111-1111-4111-8111-111111111111', projectId,
    relativePath: 'docs/guide.md', version: 1, contentHash: 'a'.repeat(64),
    status: 'active', byteSize: 20, chunkCount: 2,
    createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z' };
  assert.equal(knowledgeSourceSchema.safeParse(source).success, true);
  assert.equal(knowledgeSourceSchema.safeParse({ ...source, executed: true }).success, false);
});

test('search requires explicit project and environment and rejects arbitrary fields', () => {
  const payload = { projectId, environmentId: '33333333-3333-4333-8333-333333333333',
    query: '日期筛选 start_date' };
  assert.equal(knowledgeCommandSchema.safeParse({ type: 'search', payload }).success, true);
  assert.equal(knowledgeCommandSchema.safeParse({ type: 'search', payload: {
    ...payload, environmentId: undefined,
  } }).success, false);
  assert.equal(knowledgeCommandSchema.safeParse({ type: 'search', payload: {
    ...payload, sql: 'SELECT * FROM projects',
  } }).success, false);
});
