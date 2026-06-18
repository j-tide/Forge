import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import AcceptanceMatrixPanel from './AcceptanceMatrixPanel.vue';

const projectId='eb43cef0-4d07-4ef5-8a86-6d57eb8c16c0';
const taskId='063210d2-7d24-4f16-9ad1-a2062f51a845';
const snapshotId='80cb23df-a080-4647-83d8-0558be4b4d97';
const matrix={projectId,taskId,contractRevision:2,snapshotId,
  developmentRunId:'86bc3e6d-6972-48db-bbd3-e9342dd266e3',reviewStatus:null,
  checkReports:[],criteria:[{criterion:{id:'AC-01',statement:'Real acceptance condition',
    method:'automated',required:true,sourceRefs:[]},status:'unverified',
    reason:'No criterion evidence',reportId:null,decisionId:null}],
  evaluation:'inconclusive',requiredCovered:false,missingRequiredIds:['AC-01'],
  finalAcceptanceRequired:true};
let app:VueApp|null=null;
let root:HTMLDivElement|null=null;
afterEach(()=>{app?.unmount();root?.remove();app=null;root=null;});

it('shows missing required AC and records explicit snapshot-bound risk without claiming Done',async()=>{
  const run=vi.fn(async(command:{type:string;payload?:Record<string,unknown>})=>({
    ok:true,data:command.type==='run.acceptanceDecide' ? {...matrix,evaluation:'covered',
      requiredCovered:true,
      missingRequiredIds:[],criteria:[{...matrix.criteria[0],status:'risk_accepted',
        reason:'Human accepted this risk',decisionId:crypto.randomUUID()}]} : matrix,
  }));
  root=document.createElement('div');document.body.append(root);
  app=createApp({render:()=>h(AcceptanceMatrixPanel,{client:{run} as unknown as ForgeClient,
    projectId,taskId,connected:true})});app.mount(root);
  await vi.waitFor(()=>expect(root?.textContent).toContain('未覆盖必需项：AC-01'));
  expect(root?.textContent).toContain('无逐条报告');
  const selects=[...root!.querySelectorAll<HTMLSelectElement>('select')];
  selects[1]!.value='risk_accepted';selects[1]!.dispatchEvent(new Event('change'));
  const textarea=root!.querySelector<HTMLTextAreaElement>('textarea')!;
  textarea.value='Human accepted this risk after checking the fixed snapshot.';
  textarea.dispatchEvent(new Event('input'));
  const button=[...root!.querySelectorAll<HTMLButtonElement>('button')].find((item)=>
    item.textContent?.includes('记录本快照的判断'))!;
  await vi.waitFor(()=>expect(button.disabled).toBe(false));button.click();
  await vi.waitFor(()=>expect(root?.textContent).toContain('必需项均有逐条决定'));
  expect(root?.textContent).toContain('人工接受风险');
  expect(run).toHaveBeenCalledWith({type:'run.acceptanceDecide',payload:expect.objectContaining({
    expectedSnapshotId:snapshotId,expectedContractRevision:2,criterionId:'AC-01',
    status:'risk_accepted',reportId:null,
  })});
  expect(root?.textContent).toContain('仍需最终人工验收');
});
