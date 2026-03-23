import assert from 'node:assert/strict';
import test from 'node:test';
import { forgeErrorCodeSchema, runCommandEnvelopeSchema, runInspectionSchema, runRecoveryPreviewSchema,
  runRecoveryStatusSchema } from '../dist/index.js';

test('Planner failures remain specific across the Desktop bridge', () => {
  for (const code of ['PLAN_RESULT_INVALID', 'PLAN_WORKSPACE_CHANGED',
    'PLAN_APPROVAL_REQUIRED', 'PLAN_BASIS_STALE', 'PLAN_PROFILE_STALE',
    'PLAN_PLUGIN_STALE', 'PLAN_CONTEXT_TOO_LARGE', 'PLAN_CONTEXT_STALE']) {
    assert.equal(forgeErrorCodeSchema.safeParse(code).success, true, code);
  }
});

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
    maxTokens:200_000}}).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...start,payload:{...start.payload,
    maxTokens:250_000}}).success,false);
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

test('quarantined worktree preview is strictly read-only in its command and response shape',()=>{
  const preview={...command,type:'run.recoveryPreview',payload:{projectId:id,runId:id}};
  assert.equal(runCommandEnvelopeSchema.safeParse(preview).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...preview,payload:{...preview.payload,
    workspacePath:'/tmp/other',releaseLease:true}}).success,false);
  const result={runId:id,workspaceId:id,basis:'live-worktree-unverified',
    diff:{files:[{path:'src/add.ts',status:'modified'}],text:'redacted diff',
      truncated:false,capturedAt:new Date().toISOString()}};
  assert.equal(runRecoveryPreviewSchema.safeParse(result).success,true);
  assert.equal(runRecoveryPreviewSchema.safeParse({...result,basis:'frozen-snapshot'}).success,false);
  assert.equal(runRecoveryPreviewSchema.safeParse({...result,rootPath:'/private/project'}).success,false);
});

test('cross-boot recovery requires a bound revision, workspace and explicit confirmation',()=>{
  const status={...command,type:'run.recoveryStatus',payload:{projectId:id,runId:id}};
  assert.equal(runCommandEnvelopeSchema.safeParse(status).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...status,payload:{...status.payload,
    bootId:id}}).success,false);
  const resolve={...command,type:'run.recoveryResolve',payload:{projectId:id,runId:id,
    expectedRunRevision:3,expectedWorkspaceId:id,confirmed:true}};
  assert.equal(runCommandEnvelopeSchema.safeParse(resolve).success,true);
  assert.equal(runCommandEnvelopeSchema.safeParse({...resolve,payload:{...resolve.payload,
    confirmed:false}}).success,false);
  assert.equal(runCommandEnvelopeSchema.safeParse({...resolve,payload:{...resolve.payload,
    processId:123}}).success,false);
  const result={runId:id,state:'awaiting_reboot',runRevision:3,workspaceId:id,
    observedAt:new Date().toISOString(),resolvedAt:null};
  assert.equal(runRecoveryStatusSchema.safeParse(result).success,true);
  assert.equal(runRecoveryStatusSchema.safeParse({...result,bootId:id}).success,false);
  assert.equal(runRecoveryStatusSchema.safeParse({...result,state:'passed'}).success,false);
});

test('budget stop reason is a closed Host observation field', () => {
  const minimal={run:{runId:id,projectId:id,taskId:id,configHash:'a'.repeat(64),
    state:'failed',revision:1,createdAt:new Date().toISOString(),finishedAt:new Date().toISOString(),
    attempt:{attemptId:id,runId:id,nodeId:'develop',attemptNo:1,leaseEpoch:1,
      workspaceLeaseId:id,state:'failed',nativeSessionRef:'fixture',lastEventSequence:3,
      startedAt:new Date().toISOString(),endedAt:new Date().toISOString()}},
    observations:[],nextCursor:0,hasMore:false,diff:null,contextSources:[],usage:null,
    budgetFailure:'RUN_OUTPUT_BUDGET_EXCEEDED'};
  assert.equal(runInspectionSchema.safeParse(minimal).success,true);
  assert.equal(runInspectionSchema.safeParse({...minimal,budgetFailure:'INTERNAL_ERROR'}).success,false);
  assert.equal(runInspectionSchema.safeParse({...minimal,secret:'blocked'}).success,false);
  assert.equal(runInspectionSchema.safeParse({...minimal,planFailure:'PLAN_RESULT_INVALID'}).success,true);
  assert.equal(runInspectionSchema.safeParse({...minimal,planFailure:'INTERNAL_ERROR'}).success,false);
});
