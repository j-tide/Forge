import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { contractDigest, contractScopeHash, prepareTaskApproval } from '../dist/approvals.js';

const projectId = randomUUID(); const draftId = randomUUID();
const contract = { schemaVersion: '1.0', taskId: draftId, projectId, revision: 3,
  title: 'Filter', type: 'feature', goal: 'Filter records', acceptance: [{ id: 'ac1',
    statement: 'Matches shown', method: 'automated', required: true,
    sourceRefs: [`message:${randomUUID()}`] }], constraints: [], scope: ['UI'],
  outOfScope: [], dependencies: [], openQuestions: [], assumptions: [],
  sourceRefs: [], workflowRef: 'standard', priority: 'normal' };
const draft = { draftId, projectId, revision: 3, status: 'proposed', contract };

test('canonical digest is field-order independent and binds content', () => {
  assert.equal(contractDigest(contract), contractDigest({ ...contract, goal: contract.goal }));
  assert.notEqual(contractDigest(contract), contractDigest({ ...contract, goal: 'Different' }));
  assert.notEqual(contractScopeHash(contract), contractScopeHash({ ...contract, scope: ['API'] }));
});

test('approval request binds revision, scope and digest, but never starts a run', () => {
  const request = prepareTaskApproval(draft, new Date('2026-09-24T00:00:00Z'));
  assert.equal(request.expectedRevision, 3);
  assert.equal(request.taskId, draftId);
  assert.equal(request.scopeHash, contractScopeHash(contract));
  assert.equal(request.actionDigest, contractDigest(contract));
  assert.equal(request.expiresAt, '2026-09-25T00:00:00.000Z');
  assert.equal(request.requiredScope, 'task:create:todo');
  assert.throws(() => prepareTaskApproval({ ...draft,
    contract: { ...contract, openQuestions: ['Which date?'] } }), { code: 'APPROVAL_NOT_READY' });
});
