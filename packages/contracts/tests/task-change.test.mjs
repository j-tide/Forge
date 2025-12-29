import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommandEnvelopeSchema, taskChangeViewSchema } from '../dist/index.js';

const id = '38dd23df-d91d-4daa-b1c0-0e3cc2daa950';
const contract = {schemaVersion:'1.0',taskId:id,projectId:id,revision:3,
  title:'New scope',type:'feature',goal:'Preserve frozen runs',
  acceptance:[{id:'AC-01',statement:'Old evidence is stale',method:'manual',required:true,
    sourceRefs:[`decision:${id}`]}],constraints:[],scope:[],outOfScope:[],dependencies:[],
  openQuestions:[],assumptions:[],sourceRefs:[`decision:${id}`],workflowRef:'standard',
  priority:'normal'};
const envelope = {schemaVersion:'1.0',commandId:id,createdAt:'2026-09-24T00:00:00Z',
  protocolVersion:'forge-host-protocol/v5'};

test('Task change has an exact approved revision and no arbitrary operation fields', () => {
  const command = {...envelope,type:'task.change.propose',payload:{projectId:id,taskId:id,
    expectedRevision:2,contract,decisionId:id,reason:'Owner changed the goal after review.',
    confirmScopeChange:true,idempotencyKey:id}};
  assert.equal(runCommandEnvelopeSchema.parse(command).type, 'task.change.propose');
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,payload:{...command.payload,
    shell:'rm -rf .'}}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...envelope,type:'task.change.apply',
    payload:{projectId:id,taskId:id,changeId:id,expectedRevision:2,confirmed:false}}).success,false);
  assert.equal(taskChangeViewSchema.safeParse({changeId:id,projectId:id,taskId:id,
    baseRevision:2,proposedRevision:3,contract,contentHash:'a'.repeat(64),
    scopeHash:'b'.repeat(64),decisionId:id,reason:'Owner changed the goal after review.',
    state:'awaiting_safe_point',approvalReason:'Owner reviewed exact revision.',
    createdAt:'2026-09-24T00:00:00Z',decidedAt:'2026-09-24T00:00:00Z',appliedAt:null,
  }).success,true);
});
