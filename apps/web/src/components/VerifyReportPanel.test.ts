import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, ref, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import VerifyReportPanel from './VerifyReportPanel.vue';

const projectId='eb43cef0-4d07-4ef5-8a86-6d57eb8c16c0';
const taskId='063210d2-7d24-4f16-9ad1-a2062f51a845';
const verificationId='a5ed9d6f-e1ef-4eb0-b58d-3a3cdb1268d7';
const reportId='e9c7a197-580d-4d2d-a729-513d9fd90df5';
const artifactId='d46a5ffb-280a-41c2-b818-0b927500d3e9';
const snapshotId='80cb23df-a080-4647-83d8-0558be4b4d97';
const now='2026-09-24T00:00:00Z';
const dangerous='<script>globalThis.__forgeArtifactExecuted=true</script>'+
  '<a href="javascript:globalThis.__forgeArtifactExecuted=true">run</a>';
const job={verificationId,projectId,taskId,developmentRunId:crypto.randomUUID(),
  snapshotId,kind:'test',presetId:null,state:'completed',reportId,errorCode:null,
  createdAt:now,updatedAt:now};
const report={schemaVersion:'1.0',reportId,verificationId,projectId,taskId,
  developmentRunId:job.developmentRunId,snapshotId,kind:'test',presetId:null,
  presetRevision:null,approvalHash:null,status:'failed',exitCode:7,durationMs:12,
  stdoutArtifactId:artifactId,stderrArtifactId:null,needsHuman:true,
  outputTruncated:false,createdAt:now};
const artifact={artifactId,reportId,kind:'stdout',mime:'text/plain',content:dangerous,
  contentHash:'a'.repeat(64),byteSize:dangerous.length,truncated:false,createdAt:now};
let app:VueApp|null=null;
let root:HTMLDivElement|null=null;
afterEach(()=>{app?.unmount();root?.remove();app=null;root=null;
  Reflect.deleteProperty(globalThis,'__forgeArtifactExecuted');});

it('loads real-shape report evidence through the fixed client and renders hostile text inert',async()=>{
  const run=vi.fn(async(command:{type:string;payload?:Record<string,unknown>})=>({
    ok:true,data:command.type==='run.verifyJobs' ? [job] :
      command.type==='run.verifyReport' ? report : artifact,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(VerifyReportPanel,{client:{run} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true,refreshKey:0})});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('test · failed · exit 7'));
  const button=[...root!.querySelectorAll('button')].find((item)=>
    item.textContent?.includes('查看 stdout 纯文本'))!;
  button.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain(dangerous));
  expect(root.querySelector('script')).toBeNull();
  expect(root.querySelector('a')).toBeNull();
  expect(Reflect.get(globalThis,'__forgeArtifactExecuted')).toBeUndefined();
  expect(run).toHaveBeenCalledWith({type:'run.verifyArtifact',
    payload:{projectId,artifactId}});
});

it('rejects an artifact with a report identity different from the selected report',async()=>{
  const run=vi.fn(async(command:{type:string})=>({
    ok:true,data:command.type==='run.verifyJobs' ? [job] :
      command.type==='run.verifyReport' ? report : {...artifact,reportId:crypto.randomUUID()},
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(VerifyReportPanel,{client:{run} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'active',connected:true,refreshKey:0})});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('test · failed · exit 7'));
  [...root!.querySelectorAll('button')].find((item)=>
    item.textContent?.includes('查看 stdout 纯文本'))!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('验证证据读取失败'));
  expect(root.querySelector('pre')).toBeNull();
});

it('keeps accepted Task reports readable without claiming its snapshot is missing',async()=>{
  const run=vi.fn(async(command:{type:string})=>({ok:true,data:
    command.type==='run.verifyJobs' ? [job] :
    command.type==='run.verifyReport' ? report : []}));
  root=document.createElement('div');document.body.append(root);
  app=createApp(VerifyReportPanel,{client:{run} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'done',connected:true,refreshKey:0});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('test · failed · exit 7'));
  expect(root.textContent).toContain('任务已由 Owner 验收；已有验证报告仍可查看');
  expect(root.textContent).not.toContain('尚无可对当前任务执行验证的已冻结开发快照');
  expect([...root.querySelectorAll('button')].some((item)=>
    item.textContent?.includes('明确启动验证'))).toBe(false);
});

it('keeps report history but does not offer Verify after accepted evidence changes',async()=>{
  const run=vi.fn(async(command:{type:string})=>({ok:true,data:
    command.type==='run.verifyJobs' ? [job] :
    command.type==='run.verifyReport' ? report : []}));
  root=document.createElement('div');document.body.append(root);
  app=createApp(VerifyReportPanel,{client:{run} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:'todo',connected:true,refreshKey:0,
    acceptanceBlockReason:'验收依据异常'});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('test · failed · exit 7'));
  expect(root?.textContent).toContain('验收依据异常');
  expect(root?.textContent).not.toContain('尚无可对当前任务执行验证的已冻结开发快照');
  expect([...root!.querySelectorAll('button')].some((item)=>
    item.textContent?.includes('明确启动验证'))).toBe(false);
  expect(run).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.verifyStart'}));
});

it('starts only a frozen, separately approved preset against the current snapshot',async()=>{
  const runId=job.developmentRunId;
  const attemptId='e5134c6a-cf9c-4266-a4eb-4e937b24dd5d';
  const presetId='ba4a9748-8b23-45a4-bec1-ce95769a6fc1';
  const environmentId='544a6d95-3a1b-471d-a6e0-a3e5527a6679';
  const runView={runId,projectId,taskId,configHash:'a'.repeat(64),state:'succeeded',
    revision:3,createdAt:now,finishedAt:now,attempt:{attemptId,runId,nodeId:'develop',
      attemptNo:1,leaseEpoch:1,workspaceLeaseId:'35571d19-7e2c-460d-a764-037010717114',
      state:'succeeded',nativeSessionRef:'session',lastEventSequence:3,
      startedAt:now,endedAt:now}};
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
    summary:'Frozen development result'},
  artifact:{artifactId:'a5032de5-83d4-4bec-acf7-3d5b9c1ba348',snapshotId,
    kind:'development-step-result',mime:'application/json',byteSize:5,
    contentHash:'d'.repeat(64),redactionVersion:'1',createdAt:now}};
  const preset={presetId,projectId,environmentId,name:'test',executable:'node',
    argv:['test.js'],cwdRelative:'.',envRefs:[],timeoutSeconds:120,
    scriptsHash:'f'.repeat(64),approvalHash:'e'.repeat(64),revision:2,
    createdAt:now,updatedAt:now,archivedAt:null};
  let started=false;
  const run=vi.fn(async(command:{type:string})=>({ok:true,data:
    command.type==='run.verifyJobs' ? (started ? [{...job,developmentRunId:runId,
      presetId,state:'running',reportId:null}] : []) :
    command.type==='run.list' ? [runView] :
    command.type==='run.handoff' ? handoff :
    command.type==='run.config' ? {projectId,runId,taskId,taskRevision:1,
      configHash:'a'.repeat(64),workflow:{id:'standard',version:'1',
        contentHash:'b'.repeat(64)},developerProfile:{id:'profile.developer',version:'1',
        contentHash:'c'.repeat(64),executorPluginId:'executor.codex'},stageProfiles:[],
      environmentId,environmentRevision:1,commandPresetIds:[presetId],
      commandPresetLocks:[{presetId,revision:2,approvalHash:preset.approvalHash}],
      actualNodeId:'develop'} :
    command.type==='run.verifyStart' ? (started=true,{...job,developmentRunId:runId,
      presetId,state:'running',reportId:null}) : null}));
  const project=vi.fn(async()=>({ok:true,data:[preset]}));
  const taskState=ref('active');
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(VerifyReportPanel,{client:{run,project} as unknown as ForgeClient,
    projectId,taskId,taskRevision:1,taskState:taskState.value,connected:true,refreshKey:0})});
  app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('本次冻结环境的验证命令'));
  taskState.value='done';
  await vi.waitFor(()=>expect(root?.textContent).toContain('任务已由 Owner 验收'));
  expect([...root.querySelectorAll('button')].some((item)=>
    item.textContent?.includes('明确启动验证'))).toBe(false);
  expect(run).not.toHaveBeenCalledWith(expect.objectContaining({type:'run.verifyStart'}));
  taskState.value='active';
  await vi.waitFor(()=>expect(root?.textContent).toContain('本次冻结环境的验证命令'));
  const action=[...root.querySelectorAll<HTMLButtonElement>('button')].find((item)=>
    item.textContent?.includes('明确启动验证'))!;
  expect(action.disabled).toBe(false);
  action.click();
  await vi.waitFor(()=>expect(run).toHaveBeenCalledWith(expect.objectContaining({
    type:'run.verifyStart',payload:expect.objectContaining({projectId,taskId,
      developmentRunId:runId,expectedSnapshotId:snapshotId,kind:'test',presetId}),
  })));
});
