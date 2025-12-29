import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommandEnvelopeSchema, acceptanceMatrixSchema } from '../dist/index.js';

const id = 'e5134c6a-cf9c-4266-a4eb-4e937b24dd5d';
const envelope = { schemaVersion:'1.0', commandId:id, createdAt:new Date().toISOString(),
  protocolVersion:'forge-host-protocol/v5' };
test('acceptance decisions admit only snapshot, criterion, report and reason', () => {
  const decide = { ...envelope, type:'run.acceptanceDecide', payload:{
    projectId:id, taskId:id, expectedSnapshotId:id, expectedContractRevision:2,
    criterionId:'AC-01', status:'verified', reportId:id,
    reason:'Real report supports this criterion.', idempotencyKey:id,
  } };
  assert.equal(runCommandEnvelopeSchema.safeParse(decide).success,true);
  for (const extra of [{ executable:'/bin/sh' }, { sql:'DELETE FROM tasks' },
    { reportPath:'/etc/passwd' }, { env:{SECRET:'x'} }]) {
    assert.equal(runCommandEnvelopeSchema.safeParse({ ...decide,
      payload:{...decide.payload,...extra} }).success,false);
  }
  assert.equal(runCommandEnvelopeSchema.safeParse({...decide,
    payload:{...decide.payload,status:'passed'} }).success,false);
  assert.equal(acceptanceMatrixSchema.safeParse({requiredCovered:true}).success,false);
});
