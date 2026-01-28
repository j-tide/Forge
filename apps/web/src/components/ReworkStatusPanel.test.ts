import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import ReworkStatusPanel from './ReworkStatusPanel.vue';

const id = '00000000-0000-4000-8000-000000000001';
let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
function mount(run: ForgeClient['run']): void {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ReworkStatusPanel, {
    client: { run } as ForgeClient, projectId: id, taskId: id, connected: true,
  });
  app.mount(root);
}
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

describe('real rework status panel', () => {
  it('shows a Host-backed blocked cycle and makes no launch call', async () => {
    const run = vi.fn(async () => ({ ok:true, data:[{
      cycleId:id,projectId:id,taskId:id,sourceRunId:id,sourceSnapshotId:id,
      triggerKind:'verify',triggerReportId:id,nextRunId:null,cycleNo:4,
      totalAttempts:8,state:'blocked',reasonCode:'REWORK_LIMIT_REACHED',
      createdAt:'2026-09-24T00:00:00Z',updatedAt:'2026-09-24T00:00:00Z',
    }] })) as unknown as ForgeClient['run'];
    mount(run);
    await vi.waitFor(() => expect(document.body.textContent).toContain('已达上限，等待人工处理'));
    expect(run).toHaveBeenCalledWith({type:'run.reworkCycles',payload:{projectId:id,taskId:id}});
    expect(document.body.textContent).toContain('REWORK_LIMIT_REACHED');
  });
});
