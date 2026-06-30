import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverySummarySchema, runCommandEnvelopeSchema } from '../dist/index.js';

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

test('delivery Plan provenance accepts legacy records and requires a complete frozen pair', () => {
  const old = {
    deliveryId:id,projectId:id,taskId:id,acceptanceDecisionId:id,
    contractRevision:2,contractHash:'b'.repeat(64),planStatus:'not_configured',
    attemptRunIds:[id],snapshotId:id,snapshotCommit:'c'.repeat(40),
    baseRevision:'a'.repeat(40),reviewReportIds:[],verifyReportIds:[],
    criterionDecisionIds:[],advisoryWaiverIds:[],unresolvedRisks:[],
    finalStatus:'accepted',acceptedAt:'2026-09-24T00:00:00Z',
    createdAt:'2026-09-24T00:00:00Z',contentHash:'d'.repeat(64),
  };
  assert.equal(deliverySummarySchema.safeParse(old).success,true);
  assert.equal(deliverySummarySchema.safeParse({
    ...old,planStatus:'completed',planRunId:id,planArtifactId:id,
  }).success,true);
  assert.equal(deliverySummarySchema.safeParse({
    ...old,planStatus:'completed',planRunId:id,
  }).success,false);
  assert.equal(deliverySummarySchema.safeParse({
    ...old,planRunId:id,planArtifactId:id,
  }).success,false);
});
