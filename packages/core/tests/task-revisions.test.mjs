import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { approvalReadiness, prepareDraftRevision } from '../dist/task-revisions.js';

const projectId = randomUUID(); const draftId = randomUUID(); const decisionId = randomUUID();
const messageRef = `message:${randomUUID()}`; const decisionRef = `decision:${decisionId}`;
const contract = { schemaVersion: '1.0', taskId: draftId, projectId, revision: 1,
  title: 'Add search', type: 'feature', goal: 'Filter results',
  acceptance: [{ id: 'ac1', statement: 'Only matches appear', method: 'automated',
    required: true, sourceRefs: [messageRef] }], constraints: [], scope: ['Search UI'],
  outOfScope: [], dependencies: [], openQuestions: ['Which fields?'], assumptions: [],
  sourceRefs: [messageRef], workflowRef: 'standard', priority: 'normal' };
const draft = { draftId, projectId, revision: 1, status: 'needs_clarification', contract };
const revise = { projectId, draftId, expectedRevision: 1, decisionId,
  decisionSummary: 'User confirmed email field', removedAcceptanceIds: [], confirmScopeChange: false,
  resolvedQuestions: [{ question: 'Which fields?', answer: 'Email only' }],
  contract: { ...contract, revision: 2, goal: 'Filter results by email', openQuestions: [],
    sourceRefs: [messageRef, decisionRef] } };

test('unresolved questions block approval and a confirmed revision preserves acceptance identity', () => {
  assert.equal(approvalReadiness(draft).ready, false);
  const result = prepareDraftRevision(draft, revise);
  assert.deepEqual(result.changedFields, ['goal', 'openQuestions', 'sourceRefs']);
  assert.equal(result.contract.acceptance[0].id, 'ac1');
  assert.equal(approvalReadiness({ ...draft, contract: result.contract, status: 'proposed' }).ready, true);
});

test('question removal, acceptance deletion and scope changes require explicit decisions', () => {
  assert.throws(() => prepareDraftRevision(draft, { ...revise, resolvedQuestions: [] }),
    { code: 'DRAFT_UNRESOLVED_QUESTIONS' });
  assert.throws(() => prepareDraftRevision(draft, { ...revise,
    contract: { ...revise.contract, acceptance: [{ id: 'ac2', statement: 'Updated',
      method: 'manual', required: true, sourceRefs: [decisionRef] }] } }),
  { code: 'DRAFT_ACCEPTANCE_CONFIRMATION_REQUIRED' });
  assert.throws(() => prepareDraftRevision(draft, { ...revise,
    contract: { ...revise.contract, scope: ['API'] } }),
  { code: 'DRAFT_SCOPE_CONFIRMATION_REQUIRED' });
});

test('changed acceptance requires decision provenance and stale revision is rejected', () => {
  assert.throws(() => prepareDraftRevision(draft, { ...revise,
    contract: { ...revise.contract, acceptance: [{ ...contract.acceptance[0], statement: 'Any row' }] } }),
  { code: 'DRAFT_INVALID_REVISION' });
  assert.throws(() => prepareDraftRevision(draft, { ...revise, expectedRevision: 0 }),
    { code: 'DRAFT_INVALID_REVISION' });
  assert.throws(() => prepareDraftRevision(draft, { ...revise,
    contract: { ...revise.contract, sourceRefs: [...revise.contract.sourceRefs,
      `message:${randomUUID()}`] } }), { code: 'DRAFT_INVALID_REVISION' });
});
