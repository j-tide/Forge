import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { TaskChangeView, TaskContract } from '@forge/contracts';
import TaskChangePanel from './TaskChangePanel.vue';

const projectId = '64bf8d67-7289-43a5-8cb4-a30e9f6a952c';
const taskId = 'b2cbcd9b-7845-42ba-afd6-dd987c5d4039';
const now = '2026-09-24T00:00:00Z';
const contract: TaskContract = {schemaVersion:'1.0',taskId,projectId,revision:2,
  title:'Fixture task',type:'feature',goal:'Original goal',acceptance:[{
    id:'AC-01',statement:'Original criterion',method:'manual',required:true,
    sourceRefs:[`message:${taskId}`]}],constraints:[],scope:[],outOfScope:[],
  dependencies:[],openQuestions:[],assumptions:[],sourceRefs:[`message:${taskId}`],
  workflowRef:'standard',priority:'normal'};
const proposal: TaskChangeView = {changeId:crypto.randomUUID(),projectId,taskId,
  baseRevision:2,proposedRevision:3,contract:{...contract,revision:3,goal:'New goal'},
  contentHash:'a'.repeat(64),scopeHash:'b'.repeat(64),decisionId:crypto.randomUUID(),
  reason:'Owner requested a different goal.',state:'proposed',approvalReason:null,
  createdAt:now,decidedAt:null,appliedAt:null};
let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
function mount(client: ForgeClient): void {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(TaskChangePanel,{client,projectId,taskId,contract,connected:true});
  app.mount(root);
}
function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
}
afterEach(() => {app?.unmount();root?.remove();app=null;root=null;});

describe('task change approval', () => {
  it('proposes separately, then explicitly approves the exact content hash', async () => {
    const run = vi.fn(async (command: {type:string}) => ({ok:true,data:
      command.type === 'task.change.get' ? null : command.type === 'task.change.propose' ?
        proposal : {...proposal,state:'applied',approvalReason:'Owner confirms the new goal.',
          decidedAt:now,appliedAt:now}}));
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(button('提出新版本')).toBeDefined());
    const textareas = [...document.querySelectorAll('textarea')];
    expect(textareas.length).toBe(3);
    textareas[0]!.value = 'New goal';
    textareas[0]!.dispatchEvent(new Event('input',{bubbles:true}));
    textareas[2]!.value = 'Owner requested a different goal.';
    textareas[2]!.dispatchEvent(new Event('input',{bubbles:true}));
    await nextTick();
    button('提出新版本')!.click();
    await vi.waitFor(() => expect(button('批准此版本')).toBeDefined());
    expect(run).toHaveBeenCalledWith({type:'task.change.propose',payload:
      expect.objectContaining({expectedRevision:2,confirmScopeChange:false,
        contract:expect.objectContaining({goal:'New goal',revision:3})})});
    expect(run).not.toHaveBeenCalledWith(expect.objectContaining({type:'task.change.decide'}));
    const approval = document.querySelector('textarea')!;
    approval.value = 'Owner confirms the exact new goal.';
    approval.dispatchEvent(new Event('input',{bubbles:true}));
    await nextTick();
    button('批准此版本')!.click();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith({type:'task.change.decide',
      payload:expect.objectContaining({changeId:proposal.changeId,
        expectedContentHash:proposal.contentHash,decision:'approve'})}));
  });

  it('does not apply while Host reports an active old Run', async () => {
    const waiting: TaskChangeView = {...proposal,state:'awaiting_safe_point',
      approvalReason:'Owner approved exact scope.',decidedAt:now};
    const run = vi.fn(async (command: {type:string}) => command.type === 'task.change.apply' ?
      {ok:false,error:{code:'TASK_CHANGE_WAITING_SAFE_POINT'}} : {ok:true,data:waiting});
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(button('在安全点应用新版本')).toBeDefined());
    button('在安全点应用新版本')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('旧 Run 或检查仍在进行'));
    expect(document.body.textContent).toContain('当前目标保持冻结');
  });
});
