import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, type App as VueApp } from 'vue';
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
    projectId,taskId,connected:true,refreshKey:0})});app.mount(root);
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
    projectId,taskId,connected:true,refreshKey:0})});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('test · failed · exit 7'));
  [...root!.querySelectorAll('button')].find((item)=>
    item.textContent?.includes('查看 stdout 纯文本'))!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('验证证据读取失败'));
  expect(root.querySelector('pre')).toBeNull();
});
