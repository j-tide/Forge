import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { DeliverySummary, MergePreview } from '@forge/contracts';
import DeliveryPanel from './DeliveryPanel.vue';

const projectId = '64bf8d67-7289-43a5-8cb4-a30e9f6a952c';
const taskId = 'b2cbcd9b-7845-42ba-afd6-dd987c5d4039';
const snapshotId = '3c41e687-4512-4b90-8c56-498bfb59bc6d';
const deliveryId = 'f81ae3dd-d614-4543-b816-daf0d44aca16';
const now = '2026-09-24T00:00:00Z';
const summary: DeliverySummary = {
  deliveryId,projectId,taskId,acceptanceDecisionId:crypto.randomUUID(),
  contractRevision:2,contractHash:'b'.repeat(64),planStatus:'not_configured',
  attemptRunIds:[crypto.randomUUID()],snapshotId,snapshotCommit:'c'.repeat(40),
  baseRevision:'a'.repeat(40),reviewReportIds:[crypto.randomUUID()],
  verifyReportIds:[crypto.randomUUID()],criterionDecisionIds:[crypto.randomUUID()],
  advisoryWaiverIds:[],unresolvedRisks:[],finalStatus:'accepted',acceptedAt:now,
  createdAt:now,contentHash:'d'.repeat(64),
};
const preview: MergePreview = {deliveryId,targetBranch:'main',targetHead:'a'.repeat(40),
  snapshotCommit:'c'.repeat(40),canMerge:true,blockers:[],operationId:null,
  operationState:null,resultCommit:null};
let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
function mount(client: ForgeClient): void {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(DeliveryPanel, {client,projectId,taskId,connected:true,refreshKey:0});
  app.mount(root);
}
afterEach(() => {app?.unmount();root?.remove();app=null;root=null;});

describe('delivery and local merge', () => {
  it('does not merge until the user confirms the exact target', async () => {
    const run = vi.fn(async (command: {type:string}) => ({ok:true,data:
      command.type === 'deliveries.get' ? summary : command.type === 'deliveries.preview' ? preview : {
        operationId:crypto.randomUUID(),deliveryId,targetBranch:'main',
        expectedTargetHead:preview.targetHead,snapshotCommit:summary.snapshotCommit,
        state:'merged',resultCommit:'e'.repeat(40),errorCode:null,createdAt:now,updatedAt:now,
      }}));
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.body.textContent).toContain('本地目标分支 main'));
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('合并当前交付'))!;
    expect(button.disabled).toBe(true);
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('已显式本地合并'));
    expect(run).toHaveBeenCalledWith({type:'deliveries.merge',payload:expect.objectContaining({
      deliveryId,targetBranch:'main',expectedTargetHead:'a'.repeat(40),
      expectedSnapshotId:snapshotId,confirmed:true,
    })});
  });

  it('shows target drift and refuses to offer the merge action', async () => {
    const blocked: MergePreview = {...preview,targetHead:'f'.repeat(40),canMerge:false,
      blockers:['MERGE_REVALIDATION_REQUIRED']};
    const run = vi.fn(async (command: {type:string}) => ({ok:true,data:
      command.type === 'deliveries.get' ? summary : blocked}));
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.body.textContent).toContain('MERGE_REVALIDATION_REQUIRED'));
    expect(document.body.textContent).not.toContain('合并当前交付');
    expect(run).not.toHaveBeenCalledWith(expect.objectContaining({type:'deliveries.merge'}));
  });

  it('shows an unresolved crash intent as requiring human reconciliation', async () => {
    const unresolved: MergePreview = {...preview,canMerge:false,
      blockers:['MERGE_OPERATION_EXISTS'],operationId:crypto.randomUUID(),
      operationState:'intent'};
    const run = vi.fn(async (command: {type:string}) => ({ok:true,data:
      command.type === 'deliveries.get' ? summary : unresolved}));
    mount({run} as unknown as ForgeClient);
    await vi.waitFor(() => expect(document.body.textContent).toContain('请人工核对本地分支'));
    expect(document.body.textContent).not.toContain('合并当前交付');
  });
});
