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

it('starts a published Plan node explicitly with an opted-in retrieval query', async () => {
  const binding = { workflowId:'workflow.fixture.standard', workflowRevision:1,
    profileId:'profile.fixture.developer', profileRevision:1,
    modelId:'fixture-developer-model', entryNode:'plan' };
  const planner = { id:'profile.fixture.planner', revision:2, name:'Fixture Planner',
    role:'planner', executorId:'executor.codex', modelId:'fixture-planner-model',
    policyProfile:'read-only', contextProviders:['task-contract','project-context'] };
  const developer = { id:binding.profileId, revision:1, name:'Fixture Developer',
    role:'developer', executorId:'executor.codex', modelId:binding.modelId,
    policyProfile:'workspace-write',
    contextProviders:['task-contract','project-context'] };
  const reviewer = { id:'profile.fixture.reviewer', revision:3, name:'Fixture Reviewer',
    role:'reviewer', executorId:'executor.codex', modelId:'fixture-reviewer-model',
    policyProfile:'read-only', contextProviders:['task-contract'] };
  const published = {workflowId:binding.workflowId,revision:1,contentHash:'a'.repeat(64),
    createdAt:now,definition:{schemaVersion:'1.0',id:binding.workflowId,revision:1,
      name:'Fixture Standard',start:'plan',nodes:[
        {id:'plan',kind:'agent',label:'Plan',boardColumn:'development',
          binding:planner.id,requiredCapabilities:[],inputs:['task'],
          outputSchema:'plan-result',timeoutSeconds:60,retryLimit:0,readOnly:true},
        {id:'develop',kind:'agent',label:'Develop',boardColumn:'development',
          binding:developer.id,requiredCapabilities:[],inputs:['plan'],
          outputSchema:'development-step-result',timeoutSeconds:60,retryLimit:0,readOnly:false},
        {id:'review',kind:'agent',label:'Review',boardColumn:'review',
          binding:reviewer.id,requiredCapabilities:[],inputs:['snapshot'],
          outputSchema:'review-result',timeoutSeconds:60,retryLimit:0,readOnly:true},
      ],edges:[],rework:[],maxTotalAttempts:3,onUnmatched:'escalate',
      finalAcceptance:'human'}};
  const call = vi.fn(async (command:{type:string}) => command.type === 'run.capabilities' ?
    {ok:true,data:{available:true,executorId:'executor.codex',adapterVersion:'fixture/1',
      upstreamVersion:'fixture/1',modelIds:[planner.modelId,developer.modelId,reviewer.modelId],
      workspaceControl:true,
      streaming:true,interrupt:true,warnings:[],workflowBinding:binding}} :
    command.type === 'run.start' ? {ok:false,error:{code:'FIXTURE_STOP',message:'No run'}} :
      {ok:true,data:[]});
  const getPublishedWorkflow=vi.fn(async()=>published);
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,getPublishedWorkflow,
    agentProfileCatalog:async()=>({profiles:[planner,developer,reviewer],
      availability:[{profileId:developer.id,runnable:true}],executors:[],
    })} as unknown as ForgeClient,
  projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('明确启动只读计划'));
  await vi.waitFor(()=>expect(root?.textContent).toContain('fixture-planner-model'));
  expect(getPublishedWorkflow).toHaveBeenCalledWith(binding.workflowId,binding.workflowRevision);
  const stages=[...root.querySelectorAll('[aria-label="启动前阶段角色与模型"] li')]
    .map((item)=>item.textContent?.replace(/\s+/g,' ').trim());
  expect(stages).toEqual([
    'Planner：Fixture Planner（profile.fixture.planner） · 当前 v2 · 执行器 executor.codex · 模型 fixture-planner-model',
    'Developer：Fixture Developer（profile.fixture.developer） · 绑定 v1 · 执行器 executor.codex · 模型 fixture-developer-model',
    'Reviewer：Fixture Reviewer（profile.fixture.reviewer） · 当前 v3 · 执行器 executor.codex · 模型 fixture-reviewer-model',
  ]);
  const contextLabel=[...root.querySelectorAll<HTMLLabelElement>('label')].find((entry)=>
    entry.textContent?.includes('运行时资料检索词'));
  const context=contextLabel?.htmlFor ? root.querySelector<HTMLInputElement>(`#${contextLabel.htmlFor}`) : null;
  expect(context?.disabled).toBe(false);
  if (!context) throw new Error('Plan context input missing');
  context.value='start_date';
  context.dispatchEvent(new Event('input',{bubbles:true}));
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((entry)=>
    entry.textContent?.includes('明确启动只读计划'))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.start',payload:expect.objectContaining({
      profileId:binding.profileId,profileRevision:1,modelId:binding.modelId,
      contextQuery:'start_date',
    }),
  })));
});

it.each([
  { mode:'strict', requiresApproval:true, action:'approve', decision:'approved',
    button:'确认计划并启动开发' },
  { mode:'standard', requiresApproval:false, action:'continue', decision:'automatic',
    button:'继续尚未完成的计划交接' },
])('shows a real $mode Plan artifact and sends a version-bound $action', async (scenario) => {
  const planRun={...run,attempt:{...run.attempt,nodeId:'plan'}};
  const artifact={artifactId:'f4d22f23-6088-4161-a075-b444d73bc107',projectId,taskId,
    runId,attemptId,taskRevision:1,taskContractHash:'a'.repeat(64),
    profileId:'profile.fixture.planner',profileRevision:1,profileHash:'b'.repeat(64),
    baseRevision:'c'.repeat(40),contentHash:'d'.repeat(64),createdAt:now,
    result:{schemaVersion:'1.0',runId,attemptId,nodeId:'plan',contractRevision:1,
      snapshotId:null,outcome:'ready',artifactIds:[],unresolved:[],acceptanceResults:[],
      summary:'Validate add inputs.',plan:[{id:'guard',description:'Reject invalid values',
        paths:['add.js'],dependsOn:[],checks:['Run tests']}]}};
  const gate={artifact,requiresApproval:scenario.requiresApproval,decision:'pending',
    developmentRunId:null,decidedAt:null,reason:null};
  const call=vi.fn(async (command:{type:string})=>({ok:true,data:
    command.type==='run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:[],
      workspaceControl:false,streaming:false,interrupt:false,warnings:[]} :
    command.type==='run.list' ? [planRun] :
    command.type==='run.inspect' ? {run:planRun,observations:[],nextCursor:0,
      hasMore:false,diff:null,contextSources:[],usage:null,budgetFailure:null} :
    command.type==='run.planGet' ? gate :
    command.type==='run.planAct' ? {...gate,decision:scenario.decision,
      developmentRunId:'44da7ca8-a3ab-4c7c-a238-325210b83d14',decidedAt:now} :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] : null,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('Validate add inputs.'));
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.handoff'}));
  if (scenario.requiresApproval) expect(root.textContent).toContain('确认前不启动 Developer');
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((entry)=>
    entry.textContent?.includes(scenario.button))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.planAct',payload:{projectId,taskId,runId,
      expectedArtifactHash:'d'.repeat(64),expectedTaskRevision:1,
      action:scenario.action,confirmed:true},
  })));
});

it('shows distinct frozen Planner, Developer, and Reviewer models from Run config', async () => {
  const planRun={...run,attempt:{...run.attempt,nodeId:'plan'}};
  const profiles=[
    {id:'profile.fixture.planner',version:'2',name:'Frozen Planner',role:'planner',
      modelId:'frozen-planner-model',policyProfile:'read-only'},
    {id:'profile.fixture.developer',version:'1',name:'Frozen Developer',role:'developer',
      modelId:'frozen-developer-model',policyProfile:'workspace-write'},
    {id:'profile.fixture.reviewer',version:'3',name:'Frozen Reviewer',role:'reviewer',
      modelId:'frozen-reviewer-model',policyProfile:'read-only'},
  ];
  const locks=profiles.map((profile)=>({id:profile.id,version:profile.version,
    contentHash:'c'.repeat(64),executorPluginId:'executor.codex'}));
  const call=vi.fn(async(command:{type:string})=>({ok:true,data:
    command.type==='run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:[],
      workspaceControl:false,streaming:false,interrupt:false,warnings:[]} :
    command.type==='run.list' ? [planRun] :
    command.type==='run.config' ? {projectId,runId,taskId,taskRevision:1,
      configHash:'a'.repeat(64),workflow:{id:'workflow.fixture.standard',version:'1',
        contentHash:'b'.repeat(64)},developerProfile:locks[0],
      stageProfiles:locks.slice(1),stageProfileDetails:profiles,
      environmentId:projectId,environmentRevision:1,actualNodeId:'plan'} :
    command.type==='run.inspect' ? {run:planRun,observations:[],nextCursor:0,
      hasMore:false,diff:null,contextSources:[],usage:null} :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] : null,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.querySelector('[aria-label="本次 Run 冻结角色与模型"]'))
    .not.toBeNull());
  const stages=[...root.querySelectorAll('[aria-label="本次 Run 冻结角色与模型"] li')]
    .map((item)=>item.textContent?.replace(/\s+/g,' ').trim());
  expect(stages).toEqual([
    'Planner · 实际节点： Frozen Planner（profile.fixture.planner） · v2 · 执行器 executor.codex · 模型 frozen-planner-model',
    'Developer · 后续绑定： Frozen Developer（profile.fixture.developer） · v1 · 执行器 executor.codex · 模型 frozen-developer-model',
    'Reviewer · 后续绑定： Frozen Reviewer（profile.fixture.reviewer） · v3 · 执行器 executor.codex · 模型 frozen-reviewer-model',
  ]);
});

it('disables planned retrieval when the published Planner lacks project context permission', async () => {
  const binding={workflowId:'workflow.fixture.standard',workflowRevision:1,
    profileId:'profile.fixture.developer',profileRevision:1,
    modelId:'fixture-developer-model',entryNode:'plan'};
  const planner={id:'profile.fixture.planner',revision:1,role:'planner',
    modelId:'fixture-planner-model',contextProviders:['task-contract']};
  const developer={id:binding.profileId,revision:1,role:'developer',
    modelId:binding.modelId,contextProviders:['task-contract','project-context']};
  const call=vi.fn(async(command:{type:string;payload?:Record<string,unknown>})=>
    command.type==='run.capabilities' ?
    {ok:true,data:{available:true,executorId:'executor.codex',adapterVersion:'fixture/1',
      upstreamVersion:'fixture/1',modelIds:[planner.modelId,developer.modelId],
      workspaceControl:true,streaming:true,interrupt:true,warnings:[],workflowBinding:binding}} :
    command.type==='run.start' ? {ok:false,error:{code:'FIXTURE_STOP',message:'No run'}} :
      {ok:true,data:[]});
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    getPublishedWorkflow:async()=>({workflowId:binding.workflowId,revision:1,
      definition:{nodes:[{id:'plan',binding:planner.id},{id:'develop',binding:developer.id}]} }),
    agentProfileCatalog:async()=>({profiles:[planner,developer],
      availability:[{profileId:developer.id,runnable:true}],executors:[]}),
    } as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('当前 Planner Profile 未允许项目知识与记忆检索'));
  const contextLabel=[...root.querySelectorAll<HTMLLabelElement>('label')].find((entry)=>
    entry.textContent?.includes('运行时资料检索词'));
  const context=contextLabel?.htmlFor ? root.querySelector<HTMLInputElement>(`#${contextLabel.htmlFor}`) : null;
  expect(context?.disabled).toBe(true);
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((entry)=>
    entry.textContent?.includes('明确启动只读计划'))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({type:'run.start'})));
  const launch=call.mock.calls.find(([command])=>command.type==='run.start')?.[0];
  expect(launch?.payload).not.toHaveProperty('contextQuery');
});

it('shows the persisted Planner failure instead of treating a failed Plan as a handoff', async () => {
  const failedPlan = {...run,state:'failed',attempt:{...run.attempt,nodeId:'plan',state:'failed'}};
  const call = vi.fn(async (command:{type:string}) => ({ok:true,data:
    command.type==='run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:[],
      workspaceControl:false,streaming:false,interrupt:false,warnings:[]} :
    command.type==='run.list' ? [failedPlan] :
    command.type==='run.inspect' ? {run:failedPlan,observations:[],nextCursor:0,
      hasMore:false,diff:null,contextSources:[],usage:null,
      planFailure:'PLAN_WORKSPACE_CHANGED'} :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] : null,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('PLAN_WORKSPACE_CHANGED'));
  expect(root?.textContent).toContain('不会启动 Developer');
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.handoff'}));
});

it('shows the published Workflow Developer binding and prevents choosing an unrelated Profile', async () => {
  const binding = { workflowId:'workflow.fixture.quick', workflowRevision:1,
    profileId:'profile.fixture.workflow.developer', profileRevision:1,
    modelId:'gpt-6-luna' };
  const developer = { id:binding.profileId, revision:1, role:'developer',
    modelId:binding.modelId, policyProfile:'workspace-write',
    contextProviders:['task-contract','project-context'] };
  const unrelated = { ...developer, id:'profile.fixture.unrelated', modelId:'gpt-6-sol' };
  const call = vi.fn(async (command: {type:string; payload?:Record<string,unknown>}) =>
    command.type === 'run.capabilities' ? {ok:true,data:{
      available:true,executorId:'executor.codex',adapterVersion:'fixture/1',
      upstreamVersion:'fixture/1',modelIds:['gpt-6-sol','gpt-6-luna'],
      workspaceControl:true,streaming:true,interrupt:true,warnings:[],
      workflowBinding:binding,
    }} : command.type === 'run.start' ? {ok:false,error:{
      code:'FIXTURE_STOP',message:'No executor in component test',
    }} : {ok:true,data:[]});
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,agentProfileCatalog:async()=>({
    profiles:[developer,unrelated],availability:[
      {profileId:developer.id,runnable:true},
      {profileId:unrelated.id,runnable:true},
    ],executors:[],
  })} as unknown as ForgeClient,
  projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('workflow.fixture.quick v1'));
  const labels=[...root!.querySelectorAll<HTMLLabelElement>('label')];
  const profileLabel=labels.find((item)=>item.textContent?.includes('Developer Profile'))!;
  const profileSelect=root!.querySelector<HTMLSelectElement>(`#${profileLabel.htmlFor}`)!;
  const modelLabel=labels.find((item)=>item.textContent?.includes('Codex 模型'))!;
  const modelSelect=root!.querySelector<HTMLSelectElement>(`#${modelLabel.htmlFor}`)!;
  expect(profileSelect.disabled).toBe(true);
  expect(profileSelect.value).toBe(binding.profileId);
  expect([...profileSelect.options].map((option)=>option.value)).toEqual([binding.profileId]);
  expect(modelSelect.disabled).toBe(true);
  expect(modelSelect.value).toBe(binding.modelId);
  [...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动开发'))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.start',payload:expect.objectContaining({
      profileId:binding.profileId,profileRevision:1,modelId:binding.modelId,
    }),
  })));
});

it('blocks a stale published Workflow binding before attempting Start', async () => {
  const call=vi.fn(async (command:{type:string})=>command.type==='run.capabilities' ?
    {ok:true,data:{available:true,executorId:'executor.codex',adapterVersion:'fixture/1',
      upstreamVersion:'fixture/1',modelIds:['gpt-6-luna'],workspaceControl:true,
      streaming:true,interrupt:true,warnings:[],workflowBinding:{
        workflowId:'workflow.fixture.quick',workflowRevision:1,
        profileId:'profile.fixture.workflow.developer',profileRevision:1,modelId:'gpt-6-luna',
      }}} : {ok:true,data:[]});
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,agentProfileCatalog:async()=>({
    profiles:[{id:'profile.fixture.workflow.developer',revision:2,role:'developer',
      modelId:'gpt-6-luna',policyProfile:'workspace-write',contextProviders:[]}],
    availability:[{profileId:'profile.fixture.workflow.developer',runnable:true}],
    executors:[],
  })} as unknown as ForgeClient,
  projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('绑定的 Developer Profile 版本或执行能力已变化'));
  const start=[...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动开发'))!;
  expect(start.disabled).toBe(true);
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.start'}));
});

it('requires an explicit per-Run choice to raise the frozen observed token ceiling', async () => {
  const call = vi.fn(async (command: { type: string }) => command.type === 'run.capabilities' ?
    { ok:true, data:{ available:true, executorId:'executor.codex',
      adapterVersion:'fixture/1', upstreamVersion:'fixture/1', modelIds:['fixture-model'],
      workspaceControl:true, streaming:true, interrupt:true, warnings:[] } } :
    command.type === 'run.start' ?
      { ok:false, error:{code:'FIXTURE_STOP',message:'No executor in component test'} } :
      { ok:true, data:[] });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(RunInspector, {client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
  projectId, taskId, taskRevision:1, taskState:'todo', connected:true}); app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('本次总 Token 观测上限'));
  const label=[...root.querySelectorAll<HTMLLabelElement>('label')].find((item)=>
    item.textContent?.includes('本次总 Token 观测上限'));
  const select=label?.htmlFor ? root.querySelector<HTMLSelectElement>(`#${label.htmlFor}`) : null;
  if (!select) throw new Error('Observed token budget choice missing');
  expect(select.value).toBe('50000');
  select.value='200000'; select.dispatchEvent(new Event('change',{bubbles:true}));
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动开发'))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.start',payload:expect.objectContaining({maxTokens:200_000}),
  })));
});

it('does not reoffer Development when a signed revision loses its Done projection', async () => {
  const call = vi.fn(async (command: { type: string }) => ({ ok:true, data:
    command.type === 'run.capabilities' ? { available:true,
      executorId:'executor.codex', adapterVersion:'fixture/1',
      upstreamVersion:'fixture/1', modelIds:['fixture-model'],
      workspaceControl:true, streaming:true, interrupt:true, warnings:[] } : [] }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true,
    acceptanceBlockReason:'验收依据异常'});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('验收依据异常'));
  expect(root?.textContent).not.toContain('本次总 Token 观测上限');
  expect([...root!.querySelectorAll<HTMLButtonElement>('button')].some((button)=>
    button.textContent?.includes('明确启动开发'))).toBe(false);
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.start'}));
});

it('shows the persisted budget failure and frozen limits without calling the executor', async () => {
  const failed = { ...run, state: 'failed', attempt: { ...run.attempt, state: 'failed' } };
  const call = vi.fn(async (command: { type: string }) => ({ ok: true, data:
    command.type === 'run.capabilities' ? { available: false, executorId: 'executor.codex',
      adapterVersion: 'fixture/1', upstreamVersion: 'fixture/1', modelIds: [],
      workspaceControl: false, streaming: false, interrupt: false, warnings: [] } :
    command.type === 'run.list' ? [failed] :
    command.type === 'run.config' ? { projectId, runId, taskId, taskRevision: 1,
      configHash: 'a'.repeat(64), workflow: { id:'standard', version:'1',
        contentHash:'b'.repeat(64) }, developerProfile: { id:'profile.fixture',
        version:'1', contentHash:'c'.repeat(64), executorPluginId:'executor.codex' },
      maxDurationMs: 60000, maxTokens: 5000, maxToolCalls: 10, maxOutputTokens: 1000,
      stageProfiles: [], environmentId:projectId, environmentRevision:1,
      actualNodeId:'develop' } :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] :
    { run: failed, observations: [], nextCursor: 0, hasMore: false, diff: null,
      contextSources: [], usage: { inputTokens: 4000, outputTokens: 1500,
        cachedInputTokens: null, cost: null, currency: null },
      budgetFailure: 'RUN_OUTPUT_BUDGET_EXCEEDED' },
  }));
  root = document.createElement('div'); document.body.append(root);
  app = createApp(RunInspector, { client: { run: call,
    agentProfileCatalog: async () => null } as unknown as ForgeClient,
    projectId, taskId, taskRevision: 1, taskState: 'active', connected: true });
  app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain('RUN_OUTPUT_BUDGET_EXCEEDED'));
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('观测预算');
  [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((button) =>
    button.textContent === 'context')?.click();
  await vi.waitFor(() => expect(root?.textContent).toContain('总 Token 观测上限：5000'));
  expect(root?.textContent).toContain('当前冻结配置未提供模型 ID');
  expect(root.textContent).toContain('输出 Token 观测上限：1000');
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'run.start' }));
});

it('explains an interrupted Run and prevents another launch while its workspace is quarantined', async () => {
  const interrupted = { ...run, state: 'interrupted',
    attempt: { ...run.attempt, state: 'interrupted' } };
  const call = vi.fn(async (command: { type: string }) => ({ ok:true, data:
    command.type === 'run.capabilities' ? { available:false,
      executorId:'executor.codex',adapterVersion:'fixture/1',upstreamVersion:'fixture/1',
      modelIds:['fixture-model'],workspaceControl:true,streaming:true,interrupt:true,
      warnings:['RUN_RECOVERY_REQUIRED'] } :
    command.type === 'run.list' ? [interrupted] :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] :
    command.type === 'run.inspect' ? {run:interrupted,observations:[],nextCursor:0,
      hasMore:false,diff:null,contextSources:[],usage:null,budgetFailure:null} :
    command.type === 'run.recoveryStatus' ? {runId,state:'awaiting_reboot',
      runRevision:interrupted.revision,workspaceId:'8c19f25c-bbb6-4e77-a491-5e62e7d70e03',
      observedAt:now,resolvedAt:null} :
    command.type === 'run.recoveryPreview' ? {runId,
      workspaceId:'8c19f25c-bbb6-4e77-a491-5e62e7d70e03',
      basis:'live-worktree-unverified',diff:{files:[{path:'src/add.ts',status:'modified'}],
        text:'diff --git a/src/add.ts b/src/add.ts\n+const sum = a + b;',
        truncated:false,capturedAt:now}} : null,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('此项目有中断的 Run'));
  expect(root?.textContent).toContain('工作区已隔离');
  expect(root?.textContent).toContain('此记录不是开发成功');
  const start=[...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动开发'));
  expect(start?.disabled).toBe(true);
  [...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('查看隔离工作区当前变更'))?.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('src/add.ts'));
  expect(root?.textContent).toContain('不是冻结快照');
  expect(root?.textContent).toContain('租约继续隔离');
  expect(root?.textContent).toContain('完整重启 Mac');
  expect(root?.textContent).not.toContain('保留旧工作区并允许新 Run');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({type:'run.recoveryPreview',
    payload:{projectId,runId}}));
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.start'}));
});

it('requires preview before an eligible interrupted Run can be explicitly released', async () => {
  const workspaceId = '8c19f25c-bbb6-4e77-a491-5e62e7d70e03';
  let resolved = false;
  const interrupted = { ...run, state:'interrupted',
    attempt:{...run.attempt,state:'interrupted'} };
  const call = vi.fn(async (command:{type:string}) => ({ok:true,data:
    command.type === 'run.capabilities' ? {available:resolved,
      executorId:'executor.codex',adapterVersion:'fixture/1',upstreamVersion:'fixture/1',
      modelIds:['fixture-model'],workspaceControl:true,streaming:true,interrupt:true,
      warnings:resolved?[]:['RUN_RECOVERY_REQUIRED']} :
    command.type === 'run.list' ? [{...interrupted,revision:resolved?4:3}] :
    command.type === 'run.inspect' ? {run:{...interrupted,revision:resolved?4:3},
      observations:[],nextCursor:0,hasMore:false,diff:null,contextSources:[],usage:null} :
    command.type === 'run.recoveryStatus' ? {runId,state:resolved?'resolved':'eligible',
      runRevision:resolved?4:3,workspaceId,observedAt:now,resolvedAt:resolved?now:null} :
    command.type === 'run.recoveryPreview' ? {runId,workspaceId,
      basis:'live-worktree-unverified',diff:{files:[],text:'',truncated:false,capturedAt:now}} :
    command.type === 'run.recoveryResolve' ? (resolved=true,
      {runId,state:'resolved',runRevision:4,workspaceId,observedAt:now,resolvedAt:now}) :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] : null,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('系统启动会话已变化'));
  const resolve=()=>[...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('保留旧工作区并允许新 Run'));
  expect(resolve()?.disabled).toBe(true);
  resolve()?.click();
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.recoveryResolve'}));
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('查看隔离工作区当前变更'))?.click();
  await vi.waitFor(()=>expect(resolve()?.disabled).toBe(false));
  resolve()?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.recoveryResolve',payload:{projectId,runId,expectedRunRevision:3,
      expectedWorkspaceId:workspaceId,confirmed:true},
  })));
  await vi.waitFor(()=>expect(root?.textContent).toContain('旧 Run 保持中断'));
  expect(root?.textContent).toContain('重新明确启动新的隔离 Run');
  expect([...root.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动开发'))?.disabled).toBe(false);
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.start'}));
});

it('disables project retrieval for a Developer Profile that excludes project context', async () => {
  const call = vi.fn(async (command: { type: string }) => ({ ok: true, data:
    command.type === 'run.capabilities' ? { available: true, executorId: 'executor.codex',
      adapterVersion: 'fixture/1', upstreamVersion: 'fixture/1', modelIds: ['fixture-model'],
      workspaceControl: true, streaming: true, interrupt: true, warnings: [] } : [] }));
  const profile = { schemaVersion: '1.0', id: 'profile.fixture.developer', revision: 1,
    name: 'Contract only', role: 'developer', executorId: 'executor.codex',
    modelId: 'fixture-model', promptTemplate: 'Develop.', contextProviders: ['task-contract'],
    policyProfile: 'workspace-write',
    limits: { maxTurns: 5, maxSeconds: 120, maxOutputTokens: 1000 } };
  root = document.createElement('div'); document.body.append(root);
  app = createApp(RunInspector, { client: { run: call,
    agentProfileCatalog: async () => ({ profiles: [profile], availability: [{
      profileId: profile.id, runnable: true }], executors: [], modelProviders: [] }),
  } as unknown as ForgeClient, projectId, taskId, taskRevision: 1,
  taskState: 'todo', connected: true }); app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain('Contract only'));
  const profileSelect = [...root.querySelectorAll<HTMLSelectElement>('select')].find((item) =>
    item.querySelector(`option[value="${profile.id}"]`));
  if (!profileSelect) throw new Error('Developer Profile selection missing');
  profileSelect.value = profile.id;
  profileSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const queryLabel = [...root.querySelectorAll('label')].find((item) =>
    item.textContent?.includes('运行时资料检索词'));
  const query = queryLabel?.htmlFor ? root.querySelector<HTMLInputElement>(`#${queryLabel.htmlFor}`) : null;
  await vi.waitFor(() => expect(query?.disabled).toBe(true));
  expect(root.textContent).toContain('未允许项目知识与记忆检索');
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'run.start' }));
});

it('explains a disabled Codex plugin at the real Run entry and blocks Start', async () => {
  const call=vi.fn(async(command:{type:string})=>({ok:true,data:
    command.type==='run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:['fixture-model'],
      workspaceControl:true,streaming:true,interrupt:true,
      warnings:['RUN_PLUGIN_UNAVAILABLE']} : []}));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('Codex 插件已停用'));
  expect(root?.textContent).toContain('启用并重启 Forge');
  const start=[...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动开发'));
  expect(start?.disabled).toBe(true);
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.start'}));
});

it.each([
  ['CODEX_CLI_UNAVAILABLE', '未找到或无法启动 Codex CLI'],
  ['CODEX_VERSION_MISMATCH', 'Codex CLI 版本与 Forge 锁定版本不符'],
  ['CODEX_NOT_AUTHENTICATED', 'Codex CLI 尚未登录'],
  ['CODEX_CAPABILITY_EVIDENCE_MISSING', '缺少匹配的真实能力验证'],
])('explains %s without enabling an unverified Run', async (warning, expected) => {
  const call = vi.fn(async (command: { type: string }) => ({ ok: true, data:
    command.type === 'run.capabilities' ? { available:false, executorId:'executor.codex',
      adapterVersion:'fixture/1', upstreamVersion:'fixture/1', modelIds:[],
      workspaceControl:false, streaming:false, interrupt:false, warnings:[warning] } : [] }));
  root = document.createElement('div'); document.body.append(root);
  app = createApp(RunInspector, { client:{ run:call,
    agentProfileCatalog:async () => null } as unknown as ForgeClient,
  projectId, taskId, taskRevision:1, taskState:'todo', connected:true }); app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain(expected));
  const start = [...root!.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('明确启动开发'));
  expect(start?.disabled).toBe(true);
  expect(call).not.toHaveBeenCalledWith(expect.objectContaining({ type:'run.start' }));
});

it('keeps the plugin disabled explanation after the Host restarts without an executor', async () => {
  const call=vi.fn(async(command:{type:string})=>command.type==='run.capabilities' ?
    {ok:false,error:{code:'RUN_PLUGIN_UNAVAILABLE',message:'Executor plugin is disabled'}} :
    {ok:true,data:[]});
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('Codex 插件已停用'));
  expect(root?.querySelector<HTMLButtonElement>('.run-start-controls button')?.disabled).toBe(true);
});

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
  tabs.find((item)=>item.textContent==='files')!.click();
  await vi.waitFor(()=>expect(root?.querySelector('.run-code-files button')).not.toBeNull());
  const fileButton=[...root.querySelectorAll<HTMLButtonElement>('.run-code-files button')]
    .find((button)=>button.textContent?.includes('src/add.ts'))!;
  fileButton.click();
  await vi.waitFor(()=>expect(fileButton.getAttribute('aria-pressed')).toBe('true'));
  expect(root.textContent).toContain('已保存的只读补丁');
  expect(root.textContent).toContain('应用预览（独立隔离窗口）');
  expect(root.textContent).toContain('普通 Web 无本地预览能力');
  expect(root.textContent).not.toContain('打开隔离预览');
  connected.value=false;
  await vi.waitFor(()=>expect(root?.textContent).toContain('Host 不可用'));
  expect(root.textContent).not.toContain('real code');
});

it('explains an inconclusive Reviewer result without treating it as approval', async () => {
  const inconclusive = { ...review, status:'inconclusive', result:null,
    diagnosticCode:'REVIEW_RESULT_MISSING', issues:[], reworkHandoff:null };
  const job = { reviewRunId:'ff588d43-971c-42ad-a299-d17d274fe450',
    projectId,taskId,developmentRunId:runId,snapshotId,
    reviewCopyId:review.reviewCopyId,reviewAttemptId,modelId:'fixture-model',
    state:'completed',reportId:reviewId,errorCode:'REVIEW_RESULT_MISSING',
    createdAt:now,updatedAt:now };
  const call=vi.fn(async (command:{type:string}) => ({ok:true,data:
    command.type==='run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:[],
      workspaceControl:false,streaming:false,interrupt:false,warnings:[]} :
    command.type==='run.list' ? [run] :
    command.type==='run.reviewReports' ? [inconclusive] :
    command.type==='run.reviewJobs' ? [job] :
    command.type==='run.issueHistory' ? [] :
    command.type==='run.handoff' ? null :
    {run,observations:[],nextCursor:0,hasMore:false,diff:null,
      contextSources:[],usage:null},
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('审查器未返回结构化结果'));
  expect(root.querySelector('.review-history [role="alert"]')?.textContent)
    .toContain('任务保持未完成');
  expect(root.textContent).toContain('REVIEW_RESULT_MISSING');
  expect(root.textContent).not.toContain('Review 已批准');
});

it('opens a Desktop preview only through the explicit client capability', async () => {
  const openAppPreview = vi.fn(async () => ({ origin: 'http://127.0.0.1:43210' }));
  const client = { canOpenAppPreview: true, openAppPreview,
    run: vi.fn(async () => ({ ok: false, error: { code: 'HOST_UNAVAILABLE', message: 'Offline' } })),
    agentProfileCatalog: vi.fn(async () => null) } as unknown as ForgeClient;
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client,projectId,taskId,taskRevision:1,
    taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.querySelector('.run-preview-entry input')).not.toBeNull());
  const input=root.querySelector<HTMLInputElement>('.run-preview-entry input')!;
  input.value='http://127.0.0.1:43210/demo';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  await vi.waitFor(()=>expect(root?.querySelector<HTMLButtonElement>('.run-preview-entry button')?.disabled).toBe(false));
  root.querySelector<HTMLButtonElement>('.run-preview-entry button')!.click();
  await vi.waitFor(()=>expect(openAppPreview).toHaveBeenCalledWith('http://127.0.0.1:43210/demo'));
  await vi.waitFor(()=>expect(root?.textContent).toContain('已在隔离窗口打开'));
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

it('shows Host Stage Context conflict and truncation as a preview, never as accepted input', async () => {
  const sourceRef = 'knowledge:11111111-1111-4111-8111-111111111111@2#0';
  const preview = { projectId, runId, taskRevision: 1, configHash: 'a'.repeat(64),
    indexVersion: 'forge-knowledge-search/v1-fts5-trigram-cjk-short',
    query: '日期筛选 start_date', status: 'needs_human_decision',
    items: [{priority: 1, kind: 'approved_task', trust: 'approved', sourceRef: `task:${taskId}@1`,
      sourceHash: 'b'.repeat(64), text: 'Keep approved task first'},
    {priority: 6, kind: 'retrieved_knowledge', trust: 'untrusted', sourceRef,
      sourceHash: 'c'.repeat(64), text: 'Current source text'}],
    sourceRefs: [`task:${taskId}@1`, sourceRef], conflicts: [{currentSourceRef: sourceRef,
      otherSourceRef: sourceRef.replace('@2#0','@1#0'),
      reason: 'SOURCE_VERSION_CHANGED', question: '请选择适用版本。'}],
    omittedItems: 1, usedChars: 180, maxChars: 1000, truncated: true };
  const call = vi.fn(async (command:{type:string}) => ({ok:true,data:
    command.type === 'run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:[],
      workspaceControl:false,streaming:false,interrupt:false,warnings:[]} :
    command.type === 'run.list' ? [run] : command.type === 'context.preview' ? preview :
    command.type === 'context.sources' ? [{kind:'retrieved_knowledge',sourceRef,
      status:'revoked'}] :
    command.type === 'run.config' ? {
      projectId,runId,taskId,taskRevision:1,configHash:'a'.repeat(64),
      workflow:{id:'workflow.fixture',version:'1',contentHash:'b'.repeat(64)},
      developerProfile:{id:'profile.developer',version:'1',contentHash:'c'.repeat(64),
        executorPluginId:'executor.codex'},
      maxDurationMs:420000,
      stageProfiles:[],environmentId:projectId,environmentRevision:1,actualNodeId:'develop',
    } :
    command.type === 'run.handoff' ? null :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] :
    {run,observations:[],nextCursor:0,hasMore:false,diff:null,contextSources:[],usage:null},
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect([...root!.querySelectorAll('[role=tab]')].some((button)=>
    button.textContent==='context')).toBe(true));
  [...root.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((button)=>
    button.textContent==='context')!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('历史 Run 输入已冻结'));
  await vi.waitFor(()=>expect(root?.textContent).toContain('Workflow：workflow.fixture @1'));
  expect(root.textContent).toContain('本次冻结最长运行时间：420 秒');
  await vi.waitFor(()=>expect(root?.querySelector('input[placeholder="日期筛选 start_date"]')).not.toBeNull());
  const input=root.querySelector<HTMLInputElement>('input[placeholder="日期筛选 start_date"]')!;
  input.value='日期筛选 start_date';input.dispatchEvent(new Event('input',{bubbles:true}));
  await vi.waitFor(()=>expect([...root!.querySelectorAll('button')].find((button)=>
    button.textContent?.includes('预览上下文'))?.disabled).toBe(false));
  [...root.querySelectorAll('button')].find((button)=>button.textContent?.includes('预览上下文'))!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('请选择适用版本'));
  expect(root.textContent).toContain('省略 1 项（已截断）');
  expect(root.textContent).toContain('不会自动送入当前 Run');
  expect(call).toHaveBeenCalledWith(expect.objectContaining({type:'context.preview',
    payload:{projectId,runId,query:'日期筛选 start_date'}}));
});

it('shows the frozen Workflow Reviewer and sends its model and revision to Host', async () => {
  const onRunChanged=vi.fn();
  const reviewerId='profile.fixture.workflow.reviewer';
  const handoff={snapshot:{schemaVersion:'1.0',snapshotId,projectId,runId,attemptId,
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
    summary:'Frozen workflow development result'},
  artifact:{artifactId:'a5032de5-83d4-4bec-acf7-3d5b9c1ba348',snapshotId,
    kind:'development-step-result',mime:'application/json',byteSize:5,
    contentHash:'d'.repeat(64),redactionVersion:'1',createdAt:now}};
  const call=vi.fn(async (command:{type:string})=>({ok:true,data:
    command.type==='run.capabilities' ? {available:true,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',
      modelIds:['gpt-6-luna','gpt-6-sol'],workspaceControl:true,
      streaming:true,interrupt:true,warnings:[]} :
    command.type==='run.list' ? [run] : command.type==='run.handoff' ? handoff :
    command.type==='run.config' ? {projectId,runId,taskId,taskRevision:1,
      configHash:'a'.repeat(64),workflow:{id:'workflow.fixture.quick',version:'1',
        contentHash:'b'.repeat(64)},developerProfile:{id:'profile.developer',version:'1',
        contentHash:'c'.repeat(64),executorPluginId:'executor.codex'},
      stageProfiles:[{id:reviewerId,version:'1',contentHash:'d'.repeat(64),
        executorPluginId:'executor.codex'}],
      stageProfileDetails:[{id:reviewerId,version:'1',name:'Fixture Reviewer v1',
        role:'reviewer',modelId:'gpt-6-sol',policyProfile:'read-only'}],environmentId:projectId,
      environmentRevision:1,actualNodeId:'develop'} :
    command.type==='run.reviewStart' ? {reviewRunId:reviewId,projectId,taskId,
      developmentRunId:runId,snapshotId,reviewCopyId:'320d24b1-72e9-4629-9542-994739fb9db7',
      reviewAttemptId,modelId:'gpt-6-sol',state:'running',reportId:null,
      errorCode:null,createdAt:now,updatedAt:now} :
    command.type==='run.reviewJob' ? {reviewRunId:reviewId,projectId,taskId,
      developmentRunId:runId,snapshotId,reviewCopyId:'320d24b1-72e9-4629-9542-994739fb9db7',
      reviewAttemptId,modelId:'gpt-6-sol',state:'completed',reportId:reviewId,
      errorCode:null,createdAt:now,updatedAt:now} :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] :
    {run,observations:[],nextCursor:0,hasMore:false,diff:null,contextSources:[],usage:null}}));
  const catalog={profiles:[{id:reviewerId,revision:2,name:'Fixture Reviewer v2',
    role:'reviewer',modelId:'gpt-6-luna'}],availability:[{profileId:reviewerId,
      revision:2,runnable:true}],executors:[{executorId:'executor.codex',available:true,
      modelIds:['gpt-6-sol','gpt-6-luna'],readOnlyEnforced:true,
      networkPolicyEnforced:false,structuredOutput:true,approval:true,reason:null}]};
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>catalog} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true,
    onRunChanged});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('本次 Workflow 冻结 Reviewer'));
  expect(root?.textContent).toContain('Fixture Reviewer v1 · v1');
  expect(root?.textContent).toContain('模型 gpt-6-sol');
  expect(root?.textContent).not.toContain('内置只读 Reviewer 配置');
  expect(root?.textContent).toContain('当前任务状态为 active');
  expect(root?.textContent).not.toContain('Codex 开发当前不可用');
  const action=[...root!.querySelectorAll('button')].find((item)=>
    item.textContent?.includes('明确启动只读 Review'))!;
  expect(action.disabled).toBe(false);
  action.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.reviewStart',payload:expect.objectContaining({
      modelId:'gpt-6-sol',profileId:reviewerId,profileRevision:1,
    }),
  })));
  await vi.waitFor(()=>expect(onRunChanged).toHaveBeenCalledTimes(1),{timeout:4000});
});

it('selects a Reviewer model without changing the next Developer model', async () => {
  const reviewerId = 'profile.fixture.readonly-reviewer';
  const handoff = { snapshot: { schemaVersion:'1.0', snapshotId, projectId, runId, attemptId,
    workspaceId:'cf3e11f9-fb35-420c-b570-dbe51333d119', baseRevision:'a'.repeat(40),
    baseTree:'a'.repeat(40), filteredBaseTree:'a'.repeat(40), commitSha:'b'.repeat(40),
    treeSha:'b'.repeat(40), contentHash:'c'.repeat(64), files:[], excludedPaths:[],
    noChange:false, createdAt:now },
  bundle: { schemaVersion:'1.0', taskId, contractRevision:1, workflowRevision:1,
    snapshotId, runConfigHash:'a'.repeat(64), contractRef:`task:${taskId}@1`,
    contextBundleId:'948911de-c1da-451f-932d-388664626804', artifactIds:[],
    humanDecisionIds:[], openIssueIds:[], nativeSessionRef:null, redactionVersion:'1' },
  stepResult: { schemaVersion:'1.0', runId, attemptId, nodeId:'develop', contractRevision:1,
    snapshotId, outcome:'ready', artifactIds:[], unresolved:[], acceptanceResults:[],
    summary:'Ready for independent Review' },
  artifact: { artifactId:'a5032de5-83d4-4bec-acf7-3d5b9c1ba348', snapshotId,
    kind:'development-step-result', mime:'application/json', byteSize:5,
    contentHash:'d'.repeat(64), redactionVersion:'1', createdAt:now } };
  const call = vi.fn(async (command:{type:string}) => ({ok:true,data:
    command.type === 'run.capabilities' ? { available:true, executorId:'executor.codex',
      adapterVersion:'fixture/1', upstreamVersion:'fixture/1',
      modelIds:['gpt-6-sol','gpt-6-luna'], workspaceControl:true,
      streaming:true, interrupt:true, warnings:[] } :
    command.type === 'run.list' ? [run] : command.type === 'run.handoff' ? handoff :
    command.type === 'run.config' ? { projectId, runId, taskId, taskRevision:1,
      configHash:'a'.repeat(64), workflow:{id:'standard@1',version:'p2-development/v1',
        contentHash:'b'.repeat(64)}, developerProfile:{id:'profile.developer',
        version:'p2-development/v1',contentHash:'c'.repeat(64),
        executorPluginId:'executor.codex'}, stageProfiles:[], stageProfileDetails:[],
      environmentId:projectId, environmentRevision:1, actualNodeId:'develop' } :
    command.type === 'run.reviewStart' ? {reviewRunId:reviewId,projectId,taskId,
      developmentRunId:runId,snapshotId,reviewCopyId:'320d24b1-72e9-4629-9542-994739fb9db7',
      reviewAttemptId,modelId:'gpt-6-luna',state:'failed',reportId:null,
      errorCode:'FIXTURE_STOP',createdAt:now,updatedAt:now} :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] :
    {run,observations:[],nextCursor:0,hasMore:false,diff:null,contextSources:[],usage:null}}));
  const profile = { id:reviewerId,revision:2,name:'Read-only Reviewer',
    role:'reviewer',modelId:'gpt-6-luna' };
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>({profiles:[profile],availability:[{profileId:reviewerId,
      revision:2,runnable:true}],executors:[],modelProviders:[]})} as unknown as ForgeClient,
  projectId,taskId,taskRevision:1,taskState:'todo',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('Reviewer Profile'));
  const labeledSelect=(labelText:string):HTMLSelectElement=>{
    const label=[...root!.querySelectorAll<HTMLLabelElement>('label')].find((item)=>
      item.textContent?.includes(labelText));
    const select=label?.htmlFor ? root!.querySelector<HTMLSelectElement>(`#${label.htmlFor}`) : null;
    if (!select) throw new Error(`${labelText} is missing`);
    return select;
  };
  const developerModel=labeledSelect('Codex 模型');
  expect(developerModel.value).toBe('gpt-6-sol');
  const reviewerModel=labeledSelect('Reviewer 模型');
  expect(reviewerModel.value).toBe('gpt-6-sol');
  reviewerModel.value='gpt-6-luna';
  reviewerModel.dispatchEvent(new Event('change',{bubbles:true}));
  expect(developerModel.value).toBe('gpt-6-sol');
  [...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动只读 Review'))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.reviewStart',payload:expect.objectContaining({modelId:'gpt-6-luna'}),
  })));
  const firstReviewCall=call.mock.calls.find(([command])=>command.type==='run.reviewStart')?.[0];
  expect(firstReviewCall).not.toHaveProperty('payload.profileId');
  const reviewerProfile=labeledSelect('Reviewer Profile');
  reviewerProfile.value=reviewerId;
  reviewerProfile.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(reviewerProfile.value).toBe(reviewerId));
  expect(developerModel.value).toBe('gpt-6-sol');
  expect(root!.textContent).toContain('所选 Reviewer Profile 固定模型 gpt-6-luna');
  [...root!.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动只读 Review'))?.click();
  await vi.waitFor(()=>expect(call).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.reviewStart',payload:expect.objectContaining({
      modelId:'gpt-6-luna',profileId:reviewerId,profileRevision:2,
    }),
  })));
  expect(developerModel.value).toBe('gpt-6-sol');
  const reviewStarts=call.mock.calls.filter(([command])=>command.type==='run.reviewStart').length;
  app.unmount();root.remove();
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>({profiles:[profile],availability:[{profileId:reviewerId,
      revision:2,runnable:true}],executors:[],modelProviders:[]})} as unknown as ForgeClient,
  projectId,taskId,taskRevision:1,taskState:'done',connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('此快照已由 Owner 最终接受'));
  const acceptedReview=[...root.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent?.includes('明确启动只读 Review'));
  expect(acceptedReview?.disabled).toBe(true);
  acceptedReview?.click();
  expect(call.mock.calls.filter(([command])=>command.type==='run.reviewStart')).toHaveLength(reviewStarts);
});

it('notifies the task drawer when a running Run reaches a terminal state', async () => {
  const onRunChanged=vi.fn();
  const running={...run,state:'running',finishedAt:null,attempt:{...run.attempt,
    state:'running',endedAt:null}};
  let inspections=0;
  const call=vi.fn(async(command:{type:string})=>({ok:true,data:
    command.type==='run.capabilities' ? {available:false,executorId:'executor.codex',
      adapterVersion:'fixture/1',upstreamVersion:'fixture/1',modelIds:[],
      workspaceControl:false,streaming:false,interrupt:false,warnings:[]} :
    command.type==='run.list' ? [running] : command.type==='run.inspect' ?
      {run:++inspections===1 ? running : run,observations:[],nextCursor:0,
        hasMore:false,diff:null,contextSources:[],usage:null} :
    ['run.reviewReports','run.issueHistory','run.reviewJobs'].includes(command.type) ? [] : null,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp(RunInspector,{client:{run:call,
    agentProfileCatalog:async()=>null} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true,
    onRunChanged});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('进程未验证'));
  await vi.waitFor(()=>expect(onRunChanged).toHaveBeenCalledTimes(1),{timeout:4000});
  expect(root?.textContent).toContain('succeeded');
});
