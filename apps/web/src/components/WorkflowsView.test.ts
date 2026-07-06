import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import type { AgentProfile, AgentProfileCatalog, WorkflowTemplate } from '@forge/contracts';
import WorkflowsView from './WorkflowsView.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
function unmount(): void { app?.unmount(); root?.remove(); app = null; root = null; }
afterEach(() => { unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
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

function profile(role: 'developer' | 'reviewer', modelId = 'model-one'): AgentProfile {
  return { schemaVersion: '1.0', id: `profile.${role}`, revision: 2,
    name: role === 'developer' ? '实现工程师' : '独立审查员', role,
    executorId: 'executor.codex', modelId, promptTemplate: `${role} responsibilities`,
    contextProviders: role === 'reviewer' ? ['task-contract', 'snapshot-diff'] : ['task-contract'],
    policyProfile: role === 'reviewer' ? 'read-only' : 'workspace-write',
    limits: { maxTurns: 10, maxSeconds: 600, maxOutputTokens: 12000 } };
}
function catalog(values: AgentProfile[]): AgentProfileCatalog {
  return { profiles: values, availability: values.map((value) => ({
    profileId: value.id, revision: value.revision, executorId: value.executorId,
    modelId: value.modelId, runnable: true, reason: null,
  })), executors: [{ executorId: 'executor.codex', available: true,
    modelIds: ['model-one', 'model-two'], readOnlyEnforced: true,
    networkPolicyEnforced: false, structuredOutput: true, approval: true, reason: null }],
  modelProviders: [] };
}
async function openQuick(desktop: HTMLDivElement): Promise<void> {
  await vi.waitFor(() => expect(desktop.querySelector('.workflow-starter')).not.toBeNull());
  desktop.querySelector<HTMLButtonElement>('.workflow-starter')!.click();
  await nextTick();
}

it('keeps an unsaved template draft while navigating away and back in the same Host session', async () => {
  const saveWorkflow = vi.fn();
  const publishWorkflow = vi.fn();
  const client = {
    status: { info: { hostId: 'host-a' } },
    workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([])),
    saveWorkflow, publishWorkflow,
  };
  let desktop = mount(client, true, true);
  await openQuick(desktop);
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('＋ Agent 阶段'))!.click();
  await nextTick();
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(4);
  unmount(); // App.vue replaces the view when navigating to Settings.

  desktop = mount(client, true, true);
  await vi.waitFor(() => expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(4));
  expect(desktop.textContent).toContain('未保存的更改已在当前窗口恢复');
  expect(desktop.textContent).toContain('未保存');
  expect(saveWorkflow).not.toHaveBeenCalled();
  expect(publishWorkflow).not.toHaveBeenCalled();
});

it('asks before replacing an unsaved draft from another template', async () => {
  const other = { ...fixture, id: 'standard', name: 'Standard' };
  const client = { workflowPresets: vi.fn().mockResolvedValue([fixture, other]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([])) };
  const desktop = mount(client, true, true);
  await openQuick(desktop);
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirm);
  desktop.querySelectorAll<HTMLButtonElement>('.workflow-preset')[1]!.click();
  await nextTick();
  expect(confirm).toHaveBeenCalledOnce();
  expect(desktop.querySelector('.workflow-definition-header h2')?.textContent).toBe('Quick');
  confirm.mockReturnValue(true);
  desktop.querySelectorAll<HTMLButtonElement>('.workflow-preset')[1]!.click();
  await nextTick();
  expect(desktop.querySelector('.workflow-definition-header h2')?.textContent).toBe('Standard');
});

it('does not load an unsaved draft from a different Host session', async () => {
  const client = { status: { info: { hostId: 'host-a' } },
    workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([])) };
  let desktop = mount(client, true, true);
  await openQuick(desktop);
  unmount();
  client.status.info.hostId = 'host-b';
  desktop = mount(client, true, true);
  await vi.waitFor(() => expect(desktop.querySelectorAll('.workflow-starter')).toHaveLength(1));
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(0);
  expect(desktop.textContent).toContain('Host 会话已变更');
});

it('offers only Host templates before selection and opens an unsaved draft without publishing', async () => {
  const saveWorkflow = vi.fn();
  const publishWorkflow = vi.fn();
  const standard = { ...fixture, id: 'standard', name: 'Standard' };
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([fixture, standard]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([])),
    saveWorkflow, publishWorkflow,
  }, true, true);
  await vi.waitFor(() => expect(desktop.querySelectorAll('.workflow-starter')).toHaveLength(2));
  expect(desktop.querySelector('.workflow-welcome h2')?.textContent).toBe('创建第一个工作流');
  expect(desktop.querySelector('.library-empty')?.textContent).toContain('在右侧选择模板');
  expect(desktop.querySelectorAll('.workflow-starter')[0]?.textContent).toContain('开发 → 审查 → 人工验收');
  expect(desktop.querySelectorAll('.workflow-preset')).toHaveLength(0);
  expect(desktop.querySelector('.workflow-starter')?.getAttribute('aria-label')).toBe('使用快速流程模板');
  desktop.querySelectorAll<HTMLButtonElement>('.workflow-starter')[1]!.click();
  await nextTick();
  expect(desktop.querySelector('.workflow-definition-header h2')?.textContent).toBe('Standard');
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(3);
  expect(desktop.querySelector('.workflow-version-status')?.textContent).toContain('未保存');
  expect(saveWorkflow).not.toHaveBeenCalled();
  expect(publishWorkflow).not.toHaveBeenCalled();
});

it('keeps the left template action after a saved workflow exists without duplicating welcome cards', async () => {
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([{ workflowId: 'workflow.saved', draftRevision: 1,
      draft: { ...fixture, id: 'workflow.saved', name: 'Saved workflow' },
      draftHash: 'a'.repeat(64), publishedRevision: null,
      updatedAt: '2026-09-25T00:00:00Z' }]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([])),
  }, true, true);
  await vi.waitFor(() => expect(desktop.querySelectorAll('.workflow-record')).toHaveLength(1));
  expect(desktop.querySelector('.workflow-preset')?.getAttribute('aria-label')).toBe('从快速流程新建');
  expect(desktop.querySelectorAll('.workflow-starter')).toHaveLength(0);
  expect(desktop.querySelector('.workflow-welcome h2')?.textContent).toBe('选择一个工作流');
});

it('shows the real team and separate role permissions even when all stages share one model', async () => {
  const saveAgentProfile = vi.fn();
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([fixture]), listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([profile('developer'), profile('reviewer')])),
    saveAgentProfile,
  }, true, true);
  await openQuick(desktop);
  const stages = [...desktop.querySelectorAll('.stage-summary')];
  expect(stages).toHaveLength(3);
  expect(stages[0]?.textContent).toContain('实现工程师');
  expect(stages[0]?.textContent).toContain('隔离工作区写入');
  expect(stages[1]?.textContent).toContain('独立审查员');
  expect(stages[1]?.textContent).toContain('只读');
  for (const stage of stages.slice(0, 2)) {
    expect(stage.textContent).toContain('Codex · model-one');
    expect(stage.textContent).toContain('v2');
    expect(stage.textContent).toContain('能力可用');
  }
  expect(stages[2]?.textContent).toContain('人工决定');
  expect(stages[2]?.textContent).not.toContain('model-one');
  expect(desktop.querySelectorAll('.workflow-node details[open]')).toHaveLength(0);
  expect(desktop.querySelectorAll('.workflow-detail-section[open]')).toHaveLength(0);
  expect(saveAgentProfile).not.toHaveBeenCalled();
});

it('updates the actual stage assignment without changing other roles or publishing', async () => {
  const review = profile('reviewer');
  const alternative = { ...review, id: 'profile.review.alternative', name: '第二审查配置', modelId: 'model-two' };
  const compileWorkflow = vi.fn().mockResolvedValue({ workflowId: fixture.id, revision: 1,
    contentHash: 'a'.repeat(64), orderedNodeIds: [], launchable: true, issues: [] });
  const publishWorkflow = vi.fn();
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([fixture]), listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue(catalog([profile('developer'), review, alternative])),
    compileWorkflow, publishWorkflow,
  }, true, true);
  await openQuick(desktop);
  const reviewer = desktop.querySelectorAll('.workflow-node')[1]!;
  const choice = reviewer.querySelectorAll('select')[1]!;
  choice.value = alternative.id;
  choice.dispatchEvent(new Event('change', { bubbles: true }));
  await nextTick();
  expect(reviewer.querySelector('.stage-summary')?.textContent).toContain('Codex · model-two');
  expect(desktop.querySelector('.stage-summary')?.textContent).toContain('Codex · model-one');
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent === '检查能力')!.click();
  await vi.waitFor(() => expect(compileWorkflow).toHaveBeenCalledOnce());
  expect(compileWorkflow.mock.calls[0]?.[0].nodes[1].binding).toBe(alternative.id);
  expect(compileWorkflow.mock.calls[0]?.[0].nodes[0].binding).toBe('profile.developer');
  expect(publishWorkflow).not.toHaveBeenCalled();
});

it('does not label missing or read-only-incompatible roles as available', async () => {
  const value = catalog([profile('reviewer')]);
  value.executors[0]!.readOnlyEnforced = false;
  const desktop = mount({ workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]), agentProfileCatalog: vi.fn().mockResolvedValue(value),
  }, true, true);
  await openQuick(desktop);
  const stages = desktop.querySelectorAll('.stage-summary');
  expect(stages[0]?.textContent).toContain('未配置');
  expect(stages[1]?.textContent).toContain('无法保证只读');
  expect(desktop.querySelector('.workflow-team')?.textContent).not.toContain('能力可用');
});

it('does not reuse an older revision capability result for the current profile', async () => {
  const value = catalog([profile('developer'), profile('reviewer')]);
  value.availability[0]!.revision = 1;
  const desktop = mount({ workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]), agentProfileCatalog: vi.fn().mockResolvedValue(value),
  }, true, true);
  await openQuick(desktop);
  const developer = desktop.querySelector('.stage-summary');
  expect(developer?.textContent).toContain('v2');
  expect(developer?.textContent).toContain('能力未确认');
  expect(developer?.textContent).not.toContain('能力可用');
  expect(desktop.querySelectorAll('.stage-summary')[1]?.textContent).toContain('能力可用');
});

it('reports the current mixed-executor limitation instead of presenting it as runnable', async () => {
  const review = { ...profile('reviewer'), executorId: 'executor.claude' };
  const value = catalog([profile('developer'), review]);
  value.executors.push({ ...value.executors[0]!, executorId: 'executor.claude', available: false,
    modelIds: [], reason: 'AUTH_NOT_CONFIGURED' });
  const desktop = mount({ workflowPresets: vi.fn().mockResolvedValue([fixture]),
    listWorkflows: vi.fn().mockResolvedValue([]), agentProfileCatalog: vi.fn().mockResolvedValue(value),
  }, true, true);
  await openQuick(desktop);
  expect(desktop.querySelector('[role=alert]')?.textContent).toContain('尚不支持在同一流程中混用执行器');
  const reviewer = desktop.querySelectorAll('.stage-summary')[1];
  expect(reviewer?.textContent).toContain('Claude · model-one');
  expect(reviewer?.textContent).toContain('执行器未就绪');
  expect(reviewer?.textContent).not.toContain('能力可用');
});

it('ordinary Web has no local workflow bridge or file access', () => {
  const presets = vi.fn();
  const web = mount({ workflowPresets: presets }, false, false);
  expect(web.textContent).toContain('需要 Forge Desktop');
  expect(presets).not.toHaveBeenCalled();
});

it('shows the standard Plan node as a read-only Planner even in the development column', async () => {
  const standard: WorkflowTemplate = { ...fixture, id: 'standard', name: 'Standard', start: 'plan',
    nodes: [{ ...fixture.nodes[0]!, id: 'plan', label: '实施计划',
      binding: 'profile.planner', readOnly: true, inputs: ['task', 'repo'],
      outputSchema: 'plan-result' }, ...fixture.nodes],
    edges: [{ from: 'plan', on: 'ready', to: 'develop' }, ...fixture.edges] };
  const desktop = mount({
    workflowPresets: vi.fn().mockResolvedValue([standard]),
    listWorkflows: vi.fn().mockResolvedValue([]),
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [{ id: 'profile.planner', name: 'Planner', role: 'planner', revision: 1 }],
      availability: [{ profileId: 'profile.planner', runnable: false }],
      executors: [], modelProviders: [],
    }),
  }, true, true);
  await vi.waitFor(() => expect(desktop.textContent).toContain('标准流程'));
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('标准流程'),
  )?.click();
  await nextTick();
  const selects = desktop.querySelector('.workflow-node')?.querySelectorAll('select');
  expect(selects?.[0]?.value).toBe('planner');
  expect(selects?.[1]?.selectedOptions[0]?.textContent).toContain('当前不可启动');
  expect(selects?.[1]?.selectedOptions[0]?.textContent).not.toContain('当前未安装');
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
  await vi.waitFor(() => expect(desktop.textContent).toContain('Quick v2'));
  const selector = desktop.querySelector<HTMLButtonElement>('.workflow-record');
  expect(selector).not.toBeNull();
  selector!.click();
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
  await vi.waitFor(() => expect(desktop.textContent).toContain('快速流程'));
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('快速流程'),
  )?.click();
  await nextTick();
  expect(desktop.textContent).toContain('人工验收门禁不可删除');
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(3);
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('＋ 验证阶段'),
  )?.click();
  await nextTick();
  expect(desktop.querySelectorAll('.workflow-node')).toHaveLength(4);
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('保存草稿'),
  )?.click();
  await vi.waitFor(() => expect(saveWorkflow).toHaveBeenCalledOnce());
  expect(saveWorkflow.mock.calls[0]?.[0].edges).toHaveLength(3);
  await vi.waitFor(() => expect(desktop.textContent).toContain('WORKFLOW_PROFILE_UNAVAILABLE'));
  expect(desktop.textContent).toContain('需要调整后发布');
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
  await vi.waitFor(() => expect(desktop.textContent).toContain('快速流程'));
  [...desktop.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('快速流程'))?.click();
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
