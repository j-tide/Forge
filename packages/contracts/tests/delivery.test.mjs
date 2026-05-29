import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommandEnvelopeSchema } from '../dist/index.js';

const id = 'd28ee828-d17a-4f09-982f-3659e00d7d69';
const envelope = {schemaVersion:'1.0',commandId:id,createdAt:'2026-09-24T00:00:00Z',
  protocolVersion:'forge-host-protocol/v5'};

test('explicit merge requires fixed delivery, target HEAD, snapshot and confirmation', () => {
  const command = {...envelope,type:'deliveries.merge',payload:{
    projectId:id,taskId:id,deliveryId:id,targetBranch:'main',
    expectedTargetHead:'a'.repeat(40),expectedSnapshotId:id,
    confirmed:true,idempotencyKey:id,
  }};
  assert.equal(runCommandEnvelopeSchema.safeParse(command).success,true);
  for (const change of [{confirmed:false},{expectedTargetHead:'HEAD'},
    {targetBranch:''},{targetBranch:'main\nMerge locally'},{push:true},{force:true},{actor:'admin'},
    {executable:'git'}]) {
    assert.equal(runCommandEnvelopeSchema.safeParse({...command,payload:{
      ...command.payload,...change,
    }}).success,false);
  }
});
