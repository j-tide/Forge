import assert from 'node:assert/strict';
import test from 'node:test';
import { finalAcceptanceViewSchema, runCommandEnvelopeSchema } from '../dist/index.js';

const id = 'd28ee828-d17a-4f09-982f-3659e00d7d69';
const envelope = { schemaVersion:'1.0', commandId:id, createdAt:'2026-09-24T00:00:00Z',
  protocolVersion:'forge-host-protocol/v5' };

test('final Owner decision is version-bound with no actor or arbitrary command injection', () => {
  const command = { ...envelope, type:'run.finalDecide', payload:{
    projectId:id, taskId:id, expectedSnapshotId:id, expectedContractRevision:2,
    expectedBasisHash:'a'.repeat(64), decision:'accept',
    reason:'I inspected this exact delivery and its reports.', idempotencyKey:id,
  } };
  assert.equal(runCommandEnvelopeSchema.safeParse(command).success, true);
  for (const extra of [{actor:'admin'}, {executable:'/bin/sh'}, {snapshotPath:'/'},
    {merge:true}, {publish:true}]) {
    assert.equal(runCommandEnvelopeSchema.safeParse({ ...command,
      payload:{...command.payload,...extra} }).success, false);
  }
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...command,
    payload:{...command.payload, expectedBasisHash:'stale'} }).success, false);
  assert.equal(finalAcceptanceViewSchema.safeParse({status:'accepted'}).success, false);
});

test('advisory waiver is fixed to issue, Review, snapshot and non-security attestation', () => {
  const command = { ...envelope, type:'run.issueWaive', payload:{
    projectId:id,taskId:id,issueId:id,expectedSnapshotId:id,expectedReviewId:id,
    expectedIssueRevision:3,nonSecurityConfirmed:true,
    reason:'I examined the suggestion and accept the non-security risk.',
    idempotencyKey:id,
  } };
  assert.equal(runCommandEnvelopeSchema.safeParse(command).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,payload:{
    ...command.payload,nonSecurityConfirmed:false,
  }}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,payload:{
    ...command.payload,actor:'admin',
  }}).success,false);
});
