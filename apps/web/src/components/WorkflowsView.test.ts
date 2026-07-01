import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { WorkflowTemplate } from '@forge/contracts';
import WorkflowsView from './WorkflowsView.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });
function mount(client: object, desktop: boolean, connected: boolean): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(WorkflowsView, { client, desktop, connected }); app.mount(root);
  return root;
}
const fixture: WorkflowTemplate = {
  schemaVersion: '1.0', id: 'quick', revision: 1, name: 'Quick', start: 'develop',
  nodes: [
    { id: 'develop', kind: 'agent', label: '开发', boardColumn: 'development',
      binding: 'profile.developer', requiredCapabilities: ['structuredOutput'],
      inputs: ['task'], outputSchema: 'step-result', timeoutSeconds: 100, retryLimit: 1, readOnly: false },
    { id: 'review', kind: 'agent', label: 'Review', boardColumn: 'review',
      binding: 'profile.reviewer', requiredCapabilities: ['structuredOutput'],
      inputs: ['task', 'snapshot', 'diff'], outputSchema: 'step-result', timeoutSeconds: 100,
      retryLimit: 1, readOnly: true },
    { id: 'accept', kind: 'approval', label: '人工验收', boardColumn: 'verify',
      binding: 'human.owner', requiredCapabilities: [], inputs: ['task'],
      outputSchema: 'approval-decision', timeoutSeconds: 100, retryLimit: 0, readOnly: true },
  ],
  edges: [{ from: 'develop', on: 'ready', to: 'review' },
    { from: 'review', on: 'approved', to: 'accept' }],
  rework: [], maxTotalAttempts: 6, onUnmatched: 'escalate', finalAcceptance: 'human',
};

it('ordinary Web has no local workflow bridge or file access', () => {
  const presets = vi.fn();
  const web = mount({ workflowPresets: presets }, false, false);
  expect(web.textContent).toContain('需要 Forge Desktop');
  expect(presets).not.toHaveBeenCalled();
});

it('shows differences between real immutable published revisions with frozen Run counts', async () => {
  const old = { ...fixture, id: 'workflow.fixture', revision: 1 };
  const latest = { ...old, revision: 2, name: 'Quick v2' };
  const getPublishedWorkflow = vi.fn().mockImplementation(async (_id: string, revision: number) => ({
    workflowId: old.id, revision, definition: revision === 1 ? old : latest,
    contentHash: (revision === 1 ? 'a' : 'b').repeat(64), createdAt: '2026-09-25T00:00:00Z',
  }));
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([]),
    listWorkflows: vi.fn().mockResolvedValue([{ workflowId: old.id, draftRevision: 2,
      draft: latest, draftHash: 'b'.repeat(64), publishedRevision: 2,
      updatedAt: '2026-09-25T00:00:00Z' }]),
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [], availability: [], executors: [], modelProviders: [],
    }),
    workflowImpact: vi.fn().mockResolvedValue({ workflowId: old.id, publishedRevision: 2,
      draftRevision: 2, draftChangedSincePublish: false, publishedRevisions: [1, 2],
      frozenRunCounts: { '1': 1 }, nextRunRequiresExplicitVersionSelection: true }),
    getPublishedWorkflow,
  }, true, true);
  await vi.waitFor(() => expect(desktop.textContent).toContain('Quick v2 · 草稿 v2'));
  const selector = desktop.querySelector<HTMLSelectElement>('.workflow-toolbar select');
  expect(selector).not.toBeNull();
  selector!.value = old.id;
  selector!.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(desktop.textContent).toContain('已发布版本差异'));
  await vi.waitFor(() => expect(desktop.textContent).toContain('Quick v2'));
  expect(desktop.textContent).toContain('v1：1');
  expect(desktop.textContent).toContain('v1：Quick');
  expect(desktop.textContent).toContain('v2：Quick v2');
  expect(getPublishedWorkflow).toHaveBeenCalledTimes(2);
});

it('edits a linear draft, saves it, and shows real publish diagnostics', async () => {
  const saveWorkflow = vi.fn().mockImplementation(async (template: WorkflowTemplate) => ({
    record: { workflowId: template.id, draftRevision: 1, draft: template,
      draftHash: 'a'.repeat(64), publishedRevision: null, updatedAt: '2026-09-24T00:00:00Z' },
    compiled: { workflowId: template.id, revision: 1, contentHash: 'a'.repeat(64),
      orderedNodeIds: template.nodes.map((node) => node.id), launchable: false,
      issues: [{ code: 'WORKFLOW_PROFILE_UNAVAILABLE', path: 'nodes[0].binding',
        message: 'Profile unavailable' }] },
  }));
  const publishWorkflow = vi.fn().mockImplementation(async () => ({
    record: saveWorkflow.mock.results[0]?.value?.record,
    compiled: { workflowId: 'workflow.fixture', revision: 1, contentHash: 'a'.repeat(64),
      orderedNodeIds: [], launchable: false,
      issues: [{ code: 'WORKFLOW_PROFILE_UNAVAILABLE', path: 'nodes[0].binding',
        message: 'Profile unavailable' }] },
  }));
  const workflowImpact = vi.fn().mockResolvedValue({
    workflowId: 'workflow.fixture', publishedRevision: null, draftRevision: 1,
    draftChangedSincePublish: true, publishedRevisions: [], frozenRunCounts: {},
    nextRunRequiresExplicitVersionSelection: true,
  });
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [], availability: [], executors: [], modelProviders: [],
    }),
    compileWorkflow: vi.fn(),
    saveWorkflow, publishWorkflow, workflowImpact,
  }, true, true);
  await vi.waitFor(() => expect(desktop.textContent).toContain('从quick模板新建'));
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('从quick模板新建'),
  )?.click();
  await nextTick();
  expect(desktop.textContent).toContain('人工验收门禁不可删除');
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(3);
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('添加验证步骤'),
  )?.click();
  await nextTick();
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(4);
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('保存草稿'),
  )?.click();
  await vi.waitFor(() => expect(saveWorkflow).toHaveBeenCalledOnce());
  expect(saveWorkflow.mock.calls[0]?.[0].edges).toHaveLength(3);
  await vi.waitFor(() => expect(desktop.textContent).toContain('WORKFLOW_PROFILE_UNAVAILABLE'));
  expect(desktop.textContent).toContain('不可发布');
  await vi.waitFor(() => expect(desktop.textContent).toContain('新 Run 必须明确选择已发布版本'));
  expect(workflowImpact).toHaveBeenCalledOnce();
  expect(publishWorkflow).not.toHaveBeenCalled();
});

it('round-trips canvas JSON without publishing or starting a run', async () => {
  const saveWorkflow = vi.fn();
  const publishWorkflow = vi.fn();
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [], availability: [], executors: [], modelProviders: [],
    }),
    saveWorkflow, publishWorkflow,
  }, true, true);
  await vi.waitFor(() => expect(desktop.textContent).toContain('从quick模板新建'));
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('从quick模板新建'))?.click();
  await nextTick();
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('打开高级画布'))?.click();
  await vi.waitFor(() => expect(desktop.textContent).toContain('画布显示同一份 Workflow 定义'));
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('导出画布 JSON'))?.click();
  await nextTick();
  const exported = desktop.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '';
  const document = JSON.parse(exported) as { format: string; definition: WorkflowTemplate };
  expect(document.format).toBe('forge-workflow-canvas/v1');
  expect(document.definition.nodes.map((node) => node.id)).toEqual(['develop', 'review', 'accept']);
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('导入画布 JSON 到草稿'))?.click();
  await nextTick();
  expect(desktop.textContent).toContain('已导入到未保存草稿');
  const textarea = desktop.querySelector<HTMLTextAreaElement>('textarea');
  expect(textarea).not.toBeNull();
  textarea!.value = JSON.stringify({ ...document, definition: {
    ...document.definition, schemaVersion: '2.0',
  } });
  textarea!.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('导入画布 JSON 到草稿'))?.click();
  await nextTick();
  expect(desktop.textContent).toContain('此 Workflow DSL 版本与当前 Forge 不兼容');
  expect(saveWorkflow).not.toHaveBeenCalled();
  expect(publishWorkflow).not.toHaveBeenCalled();
});
