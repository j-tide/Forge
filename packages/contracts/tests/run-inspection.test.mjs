import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommandEnvelopeSchema, runInspectionSchema } from '../dist/index.js';

const id='e5134c6a-cf9c-4266-a4eb-4e937b24dd5d';
const command={schemaVersion:'1.0',commandId:id,createdAt:new Date().toISOString(),
  protocolVersion:'forge-host-protocol/v5',type:'run.inspect',payload:{projectId:id,runId:id,
    afterCursor:0,limit:100}};
test('Run observation and explicit control commands are strict and project-scoped',()=>{
  assert.equal(runCommandEnvelopeSchema.safeParse(command).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,payload:{...command.payload,
    arbitraryPath:'/etc'}}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,payload:{...command.payload,
    limit:1000}}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,type:'run.start'}).success,false);
  const start={...command,type:'run.start',payload:{projectId:id,taskId:id,
    expectedTaskRevision:1,modelId:'model-from-probe',idempotencyKey:id}};
  assert.equal(runCommandEnvelopeSchema.safeParse(start).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...start,payload:{...start.payload,
    executable:'sh'}}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...start,payload:{...start.payload,
    expectedTaskRevision:0}}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,type:'run.cancel',
    payload:{projectId:id,runId:id}}).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...command,type:'run.cancel',
    payload:{projectId:id,runId:id,processId:123}}).success,false);
  assert.equal(runInspectionSchema.safeParse({}).success,false);
});
