import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryCommandSchema, projectMemorySchema } from '../dist/project-memory.js';

const projectId = '22222222-2222-4222-8222-222222222222';
const environmentId = '33333333-3333-4333-8333-333333333333';
const memoryId = '44444444-4444-4444-8444-444444444444';

test('memory bridge is a closed set of source-bound operations', () => {
  const proposal = { type: 'propose', payload: { projectId, environmentId,
    scope: 'environment', kind: 'project_convention', subjectKey: 'date.filtering',
    text: 'Current date filtering uses start_date', sources: [{
      sourceRef: 'knowledge:11111111-1111-4111-8111-111111111111@1#0',
      sourceHash: 'a'.repeat(64),
    }], idempotencyKey: '55555555-5555-4555-8555-555555555555' } };
  assert.equal(memoryCommandSchema.safeParse(proposal).success, true);
  assert.equal(memoryCommandSchema.safeParse({ ...proposal,
    payload: { ...proposal.payload, command: 'shell' } }).success, false);
  assert.equal(memoryCommandSchema.safeParse({ type: 'execute', payload: {} }).success, false);
  assert.equal(memoryCommandSchema.safeParse({ type: 'decide', payload: {
    projectId, memoryId, expectedRevision: 1, decision: 'validate',
    reason: 'Source checked by the owner', confirmed: false,
    decisionId: '66666666-6666-4666-8666-666666666666',
  } }).success, false);
});

test('memory response retains authority status, source hash and audit revision', () => {
  const item = { memoryId, projectId, environmentId, scope: 'environment',
    kind: 'project_convention', subjectKey: 'date.filtering',
    text: 'Current date filtering uses start_date', status: 'candidate', revision: 1,
    sources: [{ sourceRef: 'knowledge:11111111-1111-4111-8111-111111111111@1#0',
      sourceHash: 'a'.repeat(64) }], contentHash: 'b'.repeat(64),
    expiresAt: null, lastVerifiedAt: null,
    createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z' };
  assert.equal(projectMemorySchema.safeParse(item).success, true);
  assert.equal(projectMemorySchema.safeParse({ ...item, status: 'approved' }).success, false);
  assert.equal(projectMemorySchema.safeParse({ ...item, shell: 'run' }).success, false);
});
