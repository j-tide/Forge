import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import ReworkStatusPanel from './ReworkStatusPanel.vue';

const id = '00000000-0000-4000-8000-000000000001';
let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
function mount(run: ForgeClient['run'], onChanged?: () => void): void {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ReworkStatusPanel, {
    client: { run } as ForgeClient, projectId: id, taskId: id, connected: true,
    onChanged,
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
  it('does not report an attempt limit when the actual Review gate could not start', async () => {
    const run = vi.fn(async () => ({ ok:true, data:[{
      cycleId:id,projectId:id,taskId:id,sourceRunId:id,sourceSnapshotId:id,
      triggerKind:'review',triggerReportId:id,nextRunId:id,cycleNo:1,
      totalAttempts:3,state:'blocked',reasonCode:'REWORK_GATE_UNAVAILABLE',
      createdAt:'2026-09-24T00:00:00Z',updatedAt:'2026-09-24T00:00:00Z',
    }] })) as unknown as ForgeClient['run'];
    mount(run);
    await vi.waitFor(() => expect(document.body.textContent).toContain('已阻断，等待人工处理'));
    expect(document.body.textContent).toContain('REWORK_GATE_UNAVAILABLE');
    expect(document.body.textContent).not.toContain('已达上限');
  });
  it('distinguishes a recovered gate from its recorded automatic start failure', async () => {
    const run = vi.fn(async () => ({ ok:true, data:[{
      cycleId:id,projectId:id,taskId:id,sourceRunId:id,sourceSnapshotId:id,
      triggerKind:'verify',triggerReportId:id,nextRunId:id,cycleNo:1,
      totalAttempts:3,state:'succeeded',reasonCode:'VERIFY_WORKSPACE_UNAVAILABLE',
      createdAt:'2026-09-24T00:00:00Z',updatedAt:'2026-09-24T00:00:00Z',
    }] })) as unknown as ForgeClient['run'];
    mount(run);
    await vi.waitFor(() => expect(document.body.textContent).toContain('有效报告已恢复当前流程'));
    expect(document.body.textContent).toContain('VERIFY_WORKSPACE_UNAVAILABLE');
    expect(document.body.textContent).not.toContain('已阻断');
  });
  it('refreshes an active rework and notifies the task drawer after a real state transition', async () => {
    let requests = 0;
    const changed = vi.fn();
    const run = vi.fn(async () => ({ ok:true, data:[{
      cycleId:id,projectId:id,taskId:id,sourceRunId:id,sourceSnapshotId:id,
      triggerKind:'verify',triggerReportId:id,nextRunId:id,cycleNo:1,
      totalAttempts:2,state:++requests === 1 ? 'running' : 'succeeded',
      reasonCode:null,createdAt:'2026-09-24T00:00:00Z',
      updatedAt:'2026-09-24T00:00:00Z',
    }] })) as unknown as ForgeClient['run'];
    mount(run, changed);
    await vi.waitFor(() => expect(document.body.textContent).toContain('返工中'));
    await vi.waitFor(() => expect(document.body.textContent).toContain('已生成新快照'),
      { timeout:3500 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
