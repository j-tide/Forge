import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, ref, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import RunInspector from './RunInspector.vue';

const projectId='eb43cef0-4d07-4ef5-8a86-6d57eb8c16c0';
const taskId='063210d2-7d24-4f16-9ad1-a2062f51a845';
const runId='86bc3e6d-6972-48db-bbd3-e9342dd266e3';
const attemptId='e5134c6a-cf9c-4266-a4eb-4e937b24dd5d';
const now='2026-09-24T00:00:00.000Z';
const reviewId='65fa43e0-53d4-4c10-bbb5-dde19a4f247b';
const issueId='758978e9-f650-48e7-9a59-0195498f5359';
const snapshotId='80cb23df-a080-4647-83d8-0558be4b4d97';
const reviewAttemptId='71cf6bc6-72ea-410e-8eaf-633b49a64f56';
const finding={anchor:{path:'src/add.ts',lineStart:2,lineEnd:2},
  basis:{kind:'acceptance',sourceRef:'AC-01'},reason:'Input is not validated',impact:'AC-01 fails'};
const review={reviewId,projectId,taskId,developmentRunId:runId,snapshotId,
  reviewCopyId:'320d24b1-72e9-4629-9542-994739fb9db7',reviewAttemptId,
  status:'changes_requested',result:{schemaVersion:'1.0',snapshotId,taskId,
    contractRevision:1,profileRevision:1,outcome:'changes_requested',
    blockingIssues:[finding],suggestions:[],unknowns:[],summary:'Fix validation'},
  issues:[{issueId,projectId,taskId,severity:'blocking',status:'open',revision:1,
    firstSeenAt:now,lastSeenAt:now}],reworkHandoff:null,createdAt:now};
const run={runId,projectId,taskId,configHash:'a'.repeat(64),state:'succeeded',revision:3,
  createdAt:now,finishedAt:now,attempt:{attemptId,runId,nodeId:'develop',attemptNo:1,
    leaseEpoch:1,workspaceLeaseId:'35571d19-7e2c-460d-a764-037010717114',state:'succeeded',
    nativeSessionRef:'session',lastEventSequence:3,startedAt:now,endedAt:now}};
let app:VueApp|null=null;
let root:HTMLDivElement|null=null;
afterEach(()=>{app?.unmount();root?.remove();app=null;root=null;});

it('renders Host sourced malicious activity as text and keeps unknown cost unknown',async()=>{
  const connected=ref(true);
  const runCall=vi.fn(async(command:{type:string})=>command.type==='run.capabilities' ?
    {ok:false,error:{code:'MODEL_UNAVAILABLE',message:'Unavailable'}} :
    command.type==='run.handoff' ? {ok:true,data:null} :
    command.type==='run.reviewJobs' ? {ok:true,data:[]} :
    command.type==='run.reviewReports' ? {ok:true,data:[review]} :
    command.type==='run.issueHistory' ? {ok:true,data:[{
      occurrenceId:'a3b6259a-ae13-4a16-a718-7a1e167e6fca',issueId,reviewId,
      reviewAttemptId,snapshotId,finding,createdAt:now}]} :
    {ok:true,data:command.type==='run.list'?[run]:{
    run,observations:[{cursor:1,runId,attemptId,sourceSequenceFrom:1,sourceSequenceTo:3,
      type:'assistant.message',text:'<img src=x onerror="globalThis.pwned=1">',timestamp:now}],
    nextCursor:1,hasMore:false,diff:{files:[{path:'src/add.ts',status:'modified'}],
      text:'diff --git a/src/add.ts b/src/add.ts\n+real code',truncated:false,capturedAt:now},
    contextSources:[{sourceRef:'task:approved@1',sourceKind:'approved_task/goal'}],usage:null,
  }});
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(RunInspector,{client:{run:runCall} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:connected.value})});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('globalThis.pwned=1'));
  expect(root.querySelector('img')).toBeNull();
  expect((globalThis as {pwned?:number}).pwned).toBeUndefined();
  expect(root.textContent).toContain('Input is not validated');
  expect(root.textContent).toContain('1 次审查记录');
  const tabs=[...root.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  tabs.find((item)=>item.textContent==='usage')!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('Token 用量：未知 · 费用：未知'));
  tabs.find((item)=>item.textContent==='diff')!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('real code'));
  connected.value=false;
  await vi.waitFor(()=>expect(root?.textContent).toContain('Host 不可用'));
  expect(root.textContent).not.toContain('real code');
});

it('labels an old handoff as history and refuses a new Review on it', async () => {
  const handoff = {
    snapshot:{schemaVersion:'1.0',snapshotId,projectId,runId,attemptId,
      workspaceId:'cf3e11f9-fb35-420c-b570-dbe51333d119',baseRevision:'a'.repeat(40),
      baseTree:'a'.repeat(40),filteredBaseTree:'a'.repeat(40),commitSha:'b'.repeat(40),
      treeSha:'b'.repeat(40),contentHash:'c'.repeat(64),files:[],excludedPaths:[],
      noChange:false,createdAt:now},
    bundle:{schemaVersion:'1.0',taskId,contractRevision:1,workflowRevision:1,
      snapshotId,runConfigHash:'a'.repeat(64),contractRef:`task:${taskId}@1`,
      contextBundleId:'948911de-c1da-451f-932d-388664626804',artifactIds:[],
      humanDecisionIds:[],openIssueIds:[],nativeSessionRef:null,redactionVersion:'1'},
    stepResult:{schemaVersion:'1.0',runId,attemptId,nodeId:'develop',contractRevision:1,
      snapshotId,outcome:'ready',artifactIds:[],unresolved:[],acceptanceResults:[],
      summary:'Historical development result'},
    artifact:{artifactId:'a5032de5-83d4-4bec-acf7-3d5b9c1ba348',snapshotId,
      kind:'development-step-result',mime:'application/json',byteSize:5,
      contentHash:'d'.repeat(64),redactionVersion:'1',createdAt:now},
  };
  const call = vi.fn(async (command:{type:string}) => ({ok:true,data:
    command.type==='run.capabilities' ? {available:true,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:['fixture-model'],
      workspaceControl:true,streaming:true,interrupt:true,warnings:[]} :
    command.type==='run.list' ? [run] : command.type==='run.handoff' ? handoff :
    command.type==='run.reviewReports' || command.type==='run.issueHistory' ||
      command.type==='run.reviewJobs' ? [] :
    {run,observations:[],nextCursor:0,hasMore:false,diff:null,contextSources:[],usage:null},
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call} as unknown as ForgeClient,
    projectId,taskId,taskRevision:2,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('此 Run 属于旧任务版本'));
  const action=[...root.querySelectorAll('button')].find((button)=>
    button.textContent?.includes('明确启动只读 Review'));
  expect(action?.disabled).toBe(true);
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.reviewStart'}));
});
