import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { FinalAcceptanceView } from '@forge/contracts';
import FinalAcceptancePanel from './FinalAcceptancePanel.vue';

const projectId = '64bf8d67-7289-43a5-8cb4-a30e9f6a952c';
const taskId = 'b2cbcd9b-7845-42ba-afd6-dd987c5d4039';
const snapshotId = '3c41e687-4512-4b90-8c56-498bfb59bc6d';
const now = '2026-09-24T00:00:00Z';
const ready: FinalAcceptanceView = {
  projectId, taskId, snapshotId, contractRevision:2, basisHash:'b'.repeat(64),
  readAt:now, reviewReportId:'ab2c9278-4896-4b2d-a7bb-4e72addd3ebc',
  advisoryIssues:[],
  verifyReportIds:['b5b516a8-7fcf-4a28-b442-568296164edf'], criterionDecisionIds:[],
  blockers:[], status:'ready', decision:null,
};
let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
function mount(client: ForgeClient): void {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(FinalAcceptancePanel, {
    client, projectId, taskId, connected:true, refreshKey:0,
  });
  app.mount(root);
}
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe('final human acceptance', () => {
  it('requires a fresh Host view, reason and explicit confirmation', async () => {
    const run = vi.fn(async (command: {type:string}) => ({ ok:true,
      data:command.type === 'run.finalDecide' ? {...ready,status:'accepted',decision:{
        decisionId:crypto.randomUUID(),projectId,taskId,snapshotId,
        contractRevision:2,basisHash:ready.basisHash,decision:'accept',
        nextRunId:null,reason:'I checked the exact delivery and reports.',
        actor:'local-owner',createdAt:now,
      }} : ready }));
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.body.textContent).toContain('快照 3c41e687'));
    const accept = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('接受当前版本'))!;
    expect(accept.disabled).toBe(true);
    const textarea = document.querySelector('textarea')!;
    textarea.value = 'I checked the exact delivery and reports.';
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await vi.waitFor(() => expect(accept.disabled).toBe(false));
    accept.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('已由本地 Owner 验收'));
    expect(run).toHaveBeenCalledWith({type:'run.finalDecide',payload:expect.objectContaining({
      expectedSnapshotId:snapshotId,expectedContractRevision:2,
      expectedBasisHash:ready.basisHash,decision:'accept',
    })});
  });

  it('shows a stale evidence error without claiming acceptance', async () => {
    const run = vi.fn(async (command: {type:string}) => command.type === 'run.finalDecide' ?
      {ok:false,error:{code:'ACCEPTANCE_SOURCE_STALE'}} : {ok:true,data:ready});
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.querySelector('textarea')).not.toBeNull());
    const textarea = document.querySelector('textarea')!;
    textarea.value = 'I checked the exact delivery and reports.';
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    const accept = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('接受当前版本'))!;
    await vi.waitFor(() => expect(accept.disabled).toBe(false));
    accept.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('证据已变化'));
    expect(document.body.textContent).not.toContain('已由本地 Owner 验收');
  });

  it('requires explicit non-security attestation and labels waived as non-pass', async () => {
    const issueId = '16768a0c-0980-49df-885b-869211cfa585';
    const issue = {issueId,reviewId:ready.reviewReportId!,snapshotId,revision:1,
      severity:'advisory' as const,status:'open' as const,
      reason:'A readability suggestion remains open'};
    const blocked: FinalAcceptanceView = {...ready,status:'unavailable',
      blockers:['REVIEW_ISSUES_UNRESOLVED'],advisoryIssues:[issue]};
    const run = vi.fn(async (command: {type:string}) => ({ok:true,data:
      command.type === 'run.issueWaive' ? {...ready,advisoryIssues:[{
        ...issue,status:'waived',revision:2,
      }]} : blocked}));
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.body.textContent).toContain('A readability suggestion'));
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('记录 waived'))!;
    expect(button.disabled).toBe(true);
    const textarea = [...document.querySelectorAll('textarea')].find((item) =>
      item.closest('label')?.textContent?.includes('接受风险的理由')) ??
      document.querySelector('textarea')!;
    textarea.value = 'I accept this non-security readability suggestion.';
    textarea.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('waived，非 pass'));
    expect(run).toHaveBeenCalledWith({type:'run.issueWaive',payload:expect.objectContaining({
      issueId,expectedSnapshotId:snapshotId,expectedReviewId:ready.reviewReportId,
      expectedIssueRevision:1,nonSecurityConfirmed:true,
    })});
  });
});
