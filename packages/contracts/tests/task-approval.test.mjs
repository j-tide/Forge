import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalCommandEnvelopeSchema, approvalDecisionSchema,
  approvalRequestSchema } from '../dist/index.js';

test('task approval mirrors reference shape and rejects forged fields and commands', () => {
  const approvalId = crypto.randomUUID();
  const decision = { schemaVersion: '1.0', approvalId, decision: 'approve',
    expectedRevision: 2, scopeHash: 'a'.repeat(64), reason: '' };
  assert.equal(approvalDecisionSchema.safeParse(decision).success, true);
  assert.equal(approvalDecisionSchema.safeParse({ ...decision, autoRun: true }).success, false);
  const request = { schemaVersion: '1.0', approvalId, projectId: crypto.randomUUID(),
    taskId: crypto.randomUUID(), kind: 'task', expectedRevision: 2,
    scopeHash: 'a'.repeat(64), snapshotId: null, actionDigest: 'b'.repeat(64),
    requestedBy: 'local-user', expiresAt: new Date().toISOString(), summary: 'Approve task',
    risk: 'medium', requiredScope: 'task:create:todo' };
  assert.equal(approvalRequestSchema.safeParse(request).success, true);
  assert.equal(approvalRequestSchema.safeParse({ ...request, kind: 'merge' }).success, false);
  const envelope = { schemaVersion: '1.0', commandId: crypto.randomUUID(),
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    type: 'approval.decide', payload: { projectId: request.projectId, decision } };
  assert.equal(approvalCommandEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(approvalCommandEnvelopeSchema.safeParse({ ...envelope, type: 'task.start' }).success, false);
});
