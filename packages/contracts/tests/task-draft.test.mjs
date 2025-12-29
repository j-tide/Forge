import test from 'node:test';
import assert from 'node:assert/strict';
import { taskContractSchema, taskDraftSchema, draftGenerationRequestSchema,
  draftReviseInputSchema, draftCommandEnvelopeSchema } from '../dist/index.js';

test('Task Contract mirrors required reference fields and rejects forged approval/unknown fields', () => {
  const contract = { schemaVersion: '1.0', taskId: 'draft:1', projectId: 'p1', revision: 1,
    title: 'Add filter', type: 'feature', goal: 'Filter entries by date',
    acceptance: [{ id: 'ac1', statement: 'Filter returns matching entries', method: 'automated',
      required: true, sourceRefs: ['message:m1'] }], constraints: [], scope: [], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: ['message:m1'],
    workflowRef: 'standard', priority: 'normal' };
  assert.equal(taskContractSchema.parse(contract).title, 'Add filter');
  assert.equal(taskContractSchema.safeParse({ ...contract, approved: true }).success, false);
  assert.equal(taskContractSchema.safeParse({ ...contract, acceptance: [] }).success, false);
  assert.equal(taskContractSchema.safeParse({ ...contract, type: 'merge' }).success, false);
});

test('revision command requires exact decision, CAS and fixed fields', () => {
  const projectId = crypto.randomUUID(); const draftId = crypto.randomUUID();
  const contract = { schemaVersion: '1.0', taskId: draftId, projectId, revision: 2,
    title: 'Clarify', type: 'feature', goal: 'Add filter', acceptance: [{ id: 'ac1',
      statement: 'Filters by date', method: 'manual', required: true,
      sourceRefs: [`decision:${crypto.randomUUID()}`] }], constraints: [], scope: [],
    outOfScope: [], dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [],
    workflowRef: 'standard', priority: 'normal' };
  const input = { projectId, draftId, expectedRevision: 1, contract,
    decisionId: crypto.randomUUID(), decisionSummary: 'User confirmed range',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: false };
  assert.equal(draftReviseInputSchema.safeParse(input).success, true);
  assert.equal(draftReviseInputSchema.safeParse({ ...input, shell: 'rm -rf /' }).success, false);
  assert.equal(draftReviseInputSchema.safeParse({ ...input, expectedRevision: 0 }).success, false);
  const envelope = { schemaVersion: '1.0', commandId: crypto.randomUUID(),
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    type: 'draft.revise', payload: input };
  assert.equal(draftCommandEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(draftCommandEnvelopeSchema.safeParse({ ...envelope, type: 'task.approve' }).success, false);
});

test('Draft and generation inputs reject invalid identities and extra fields', () => {
  const ids = { projectId: crypto.randomUUID(), conversationId: crypto.randomUUID(),
    sourceMessageId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() };
  assert.equal(draftGenerationRequestSchema.safeParse(ids).success, true);
  assert.equal(draftGenerationRequestSchema.safeParse({ ...ids, approval: true }).success, false);
  assert.equal(taskDraftSchema.safeParse({ ...ids, draftId: crypto.randomUUID() }).success, false);
});
