import { afterEach, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { CommandPreset, ForgeProject, ProjectEnvironment } from '@forge/contracts';
import ProjectEnvironmentPanel from './ProjectEnvironmentPanel.vue';

const projectId='eb43cef0-4d07-4ef5-8a86-6d57eb8c16c0';
const environmentId='544a6d95-3a1b-471d-a6e0-a3e5527a6679';
const presetId='ba4a9748-8b23-45a4-bec1-ce95769a6fc1';
const now='2026-09-24T00:00:00.000Z';
const scriptsHash='f'.repeat(64);
const probe={rootPath:'/fixture',name:'fixture',repositoryType:'git' as const,
  gitRoot:'/fixture',currentBranch:'main',defaultBranch:'main',workingTree:'clean' as const,
  remoteConfigured:false,packageManager:'npm' as const,packageManagerEvidence:['package-lock.json'],
  projectType:'node' as const,detectedRuntime:['Node.js (manifest)'],
  scripts:{dev:null,build:null,test:'node test.js',lint:null,typecheck:null},scriptsHash,
  capabilities:{gitWorktree:true,declaredScripts:true},fingerprint:'a'.repeat(64),probedAt:now};
const savedProject={projectId,environmentId,name:'fixture',rootPath:'/fixture',
  repositoryType:'git',gitRoot:'/fixture',defaultBranch:'main',trusted:true,
  trustVersion:'project-trust/v1',trustApprovedAt:now,environmentSummaryHash:'a'.repeat(64),
  createdAt:now,updatedAt:now,lastOpenedAt:now,revision:1,archivedAt:null,probe} as ForgeProject;
let app:VueApp|null=null;
let root:HTMLDivElement|null=null;
afterEach(()=>{app?.unmount();root?.remove();app=null;root=null;});

it('saves an argv preset without running it, requires a separate approval, then changes only the next environment version',async()=>{
  let environment:ProjectEnvironment={environmentId,projectId,name:'Local',
    config:{commandPresetIds:[],envRefs:[],networkMode:'trusted-local'},revision:1,
    createdAt:now,updatedAt:now,archivedAt:null};
  let preset:CommandPreset|null=null;
  const project=vi.fn(async(command:{type:string;payload:Record<string,unknown>})=>{
    if (command.type==='project.reprobe') return {ok:true,data:probe};
    if (command.type==='environment.get') return {ok:true,data:environment};
    if (command.type==='commandPreset.list') return {ok:true,data:preset ? [preset] : []};
    if (command.type==='commandPreset.save') {
      preset={presetId,projectId,environmentId,name:command.payload.name as string,
        executable:command.payload.executable as string,argv:command.payload.argv as string[],
        cwdRelative:command.payload.cwdRelative as string,envRefs:[],
        timeoutSeconds:command.payload.timeoutSeconds as number,scriptsHash,
        approvalHash:null,revision:1,createdAt:now,updatedAt:now,archivedAt:null};
      return {ok:true,data:preset};
    }
    if (command.type==='commandPreset.approve') {
      preset={...preset!,approvalHash:'e'.repeat(64),revision:2};
      return {ok:true,data:preset};
    }
    if (command.type==='environment.save') {
      environment={...environment,revision:environment.revision+1,
        config:command.payload.config as ProjectEnvironment['config']};
      return {ok:true,data:environment};
    }
    return {ok:false,error:{code:'UNKNOWN_COMMAND',message:'Unknown'}};
  });
  root=document.createElement('div');document.body.append(root);
  app=createApp(ProjectEnvironmentPanel,{client:{project} as unknown as ForgeClient,
    project:savedProject,connected:true});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('环境 v1'));
  const executable=root.querySelector<HTMLInputElement>('input[placeholder="例如 node"]')!;
  executable.value='node';executable.dispatchEvent(new Event('input',{bubbles:true}));
  const argv=root.querySelector<HTMLTextAreaElement>('textarea')!;
  argv.value='test.js';argv.dispatchEvent(new Event('input',{bubbles:true}));
  [...root.querySelectorAll('button')].find((item)=>item.textContent?.includes('保存但不批准'))!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('预设已保存，尚未批准'));
  expect(project).toHaveBeenCalledWith(expect.objectContaining({type:'commandPreset.save',
    payload:expect.objectContaining({executable:'node',argv:['test.js'],
      scriptsHash,expectedRevision:0})}));
  expect(project).not.toHaveBeenCalledWith(expect.objectContaining({type:'commandPreset.approve'}));
  [...root.querySelectorAll('button')].find((item)=>item.textContent?.includes('审阅并批准'))!.click();
  await vi.waitFor(()=>expect(document.body.querySelector('[role=dialog]')).not.toBeNull());
  const checkbox=document.body.querySelector<HTMLInputElement>('[role=dialog] input[type=checkbox]')!;
  checkbox.click();
  await vi.waitFor(()=>expect([...document.body.querySelectorAll<HTMLButtonElement>('[role=dialog] button')]
    .find((item)=>item.textContent?.includes('批准当前版本'))?.disabled).toBe(false));
  [...document.body.querySelectorAll<HTMLButtonElement>('[role=dialog] button')]
    .find((item)=>item.textContent?.includes('批准当前版本'))!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('预设已获本机人工批准'));
  expect(project).toHaveBeenCalledWith(expect.objectContaining({type:'commandPreset.approve',
    payload:{projectId,presetId,expectedRevision:1,scriptsHash}}));
  [...root.querySelectorAll('button')].find((item)=>item.textContent?.includes('加入新 Run 的环境'))!.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('环境新版本已保存'));
  expect(project).toHaveBeenCalledWith(expect.objectContaining({type:'environment.save',
    payload:expect.objectContaining({expectedRevision:1,
      config:{commandPresetIds:[presetId],envRefs:[],networkMode:'trusted-local'}})}));
});
