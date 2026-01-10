import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { freezeRunConfig } from '../dist/run-config.js';
import { buildContextBundle, executorContext, verifyContextBundle } from '../dist/context.js';

function fixture(acceptanceStatement='Bad input fails') {
  const projectId = randomUUID(); const taskId = randomUUID(); const runId = randomUUID();
  const environmentId = randomUUID();
  const task = { schemaVersion:'1.0',projectId,taskId,revision:1,title:'Validate input',
    type:'feature',goal:'Reject invalid input',acceptance:[{id:'ac1',statement:acceptanceStatement,
      method:'automated',required:true,sourceRefs:['message:source']}],
    constraints:['Keep the API stable'],scope:['src'],outOfScope:[],dependencies:[],
    openQuestions:[],assumptions:[],sourceRefs:['message:source'],workflowRef:'standard',priority:'normal' };
  const environment={environmentId,projectId,name:'Default',config:{commandPresetIds:[],
    envRefs:[],networkMode:'trusted-local'},revision:1,createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),archivedAt:null};
  const config=freezeRunConfig({runId,projectId,taskId,expectedTaskRevision:1,
    workflow:{id:'standard',version:'fixture',contentHash:'a'.repeat(64)},
    profile:{id:'developer',version:'fixture',contentHash:'b'.repeat(64),
      executorPluginId:'executor.codex'},plugins:[{id:'executor.codex',version:'fixture',
      contentHash:'c'.repeat(64)}],budget:{maxDurationMs:100_000,maxTurns:10,
      maxTokens:1000,maxToolCalls:20},environmentId,expectedEnvironmentRevision:1},task,environment);
  return config;
}

test('ContextBundle is sourced, bounded and hash-verified without transcript concatenation', () => {
  const config=fixture();
  const checkpoint={checkpointId:randomUUID(),projectId:config.projectId,runId:config.runId,
    attemptId:randomUUID(),sequence:1,objective:{text:config.taskContract.goal,
      sourceRef:`task:${config.taskId}@1`},
    completedActions:Array.from({length:16},(_,i)=>({text:`Action ${i} ${'x'.repeat(300)}`,
      sourceRef:`event:${i}`})),openIssues:[],budget:{elapsedMs:500,turnsUsed:1,
      tokensUsed:null,toolCallsUsed:1},createdAt:new Date().toISOString()};
  const bundle=buildContextBundle(config,checkpoint,1000);
  assert.equal(bundle.goal,config.taskContract.goal);
  assert.ok(bundle.omittedItems>0);
  assert.equal(bundle.items[1].sourceRef,'message:source');
  assert.ok(bundle.items.every(item=>item.authority==='approved_task'||item.authority==='run_observation'));
  assert.deepEqual(verifyContextBundle(bundle),bundle);
  assert.ok(executorContext(bundle).every(line=>line.includes('[')&&line.includes(';')));
  assert.throws(()=>verifyContextBundle({...bundle,goal:'tampered'}),{code:'CONTEXT_INVALID'});
  assert.throws(()=>buildContextBundle(config,{...checkpoint,projectId:randomUUID()}),
    {code:'CONTEXT_INVALID'});
});

test('required approved context cannot be silently omitted to fit a budget', () => {
  const config=fixture('x'.repeat(1950));
  assert.throws(()=>buildContextBundle(config,null,1000),{code:'CONTEXT_BUDGET_EXCEEDED'});
});
