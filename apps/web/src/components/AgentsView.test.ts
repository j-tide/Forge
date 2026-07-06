import { afterEach, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
import type { AgentProfile } from '@forge/contracts';
import AgentsView from './AgentsView.vue';

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

function mount(client: object, desktop: boolean, connected: boolean): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(AgentsView, { client, desktop, connected }); app.mount(root);
  return root;
}

async function clickButton(view: HTMLElement, label: string): Promise<void> {
  const button = [...view.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.trim() === label);
  if (!button) throw new Error(`Button ${label} missing`);
  button.click();
  await vi.waitFor(() => expect(view.querySelector('.agent-editor')).not.toBeNull());
}

it('Web does not call the local Host and Claude remains unselectable', async () => {
  const catalog = vi.fn();
  const web = mount({ agentProfileCatalog: catalog }, false, false);
  expect(web.textContent).toContain('需要 Forge Desktop');
  expect(catalog).not.toHaveBeenCalled();
  app?.unmount(); root?.remove();
  const desktop = mount({ agentProfileCatalog: vi.fn().mockResolvedValue({
    profiles: [], availability: [], modelProviders: [], executors: [
      { executorId: 'executor.codex', available: true, modelIds: ['verified-model'],
        readOnlyEnforced: true, networkPolicyEnforced: false, approval: true, reason: null },
      { executorId: 'executor.claude', available: false, modelIds: [],
        readOnlyEnforced: false, networkPolicyEnforced: false, approval: false,
        reason: 'CLAUDE_NOT_VERIFIED' },
    ],
  }), saveAgentProfile: vi.fn() }, true, true);
  await vi.waitFor(() => expect(desktop.textContent).toContain('CLAUDE_NOT_VERIFIED'));
  expect(desktop.querySelector('.agent-editor')).toBeNull();
  expect([...desktop.querySelectorAll('button')].filter((button) =>
    button.textContent?.trim() === '新建角色')).toHaveLength(1);
  expect(desktop.querySelector('.agent-empty-capabilities')?.textContent)
    .toContain('Claude');
  expect(desktop.querySelector('.agent-empty-capabilities')?.textContent)
    .toContain('不可用');
  expect(desktop.querySelector('.agent-empty-capabilities [title="executor.claude"]')).not.toBeNull();
  await clickButton(desktop, '新建角色');
  const options = [...desktop.querySelectorAll<HTMLOptionElement>('option')];
  expect(options.find((item) => item.value === 'executor.claude')?.disabled).toBe(true);
  expect(desktop.textContent).not.toContain('Claude 已连接');
});

it('explains why an empty role library cannot create a profile without a Host executor', async () => {
  const view = mount({ agentProfileCatalog: vi.fn().mockResolvedValue({
    profiles: [], availability: [], modelProviders: [], executors: [
      { executorId: 'executor.codex', available: false, modelIds: [],
        readOnlyEnforced: false, networkPolicyEnforced: false, approval: false,
        reason: 'CODEX_NOT_VERIFIED' },
      { executorId: 'executor.claude', available: false, modelIds: [],
        readOnlyEnforced: false, networkPolicyEnforced: false, approval: false,
        reason: 'CLAUDE_NOT_VERIFIED' },
    ],
  }), saveAgentProfile: vi.fn() }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('还没有创建角色'));
  expect(view.textContent).toContain('当前没有可用执行器');
  expect(view.querySelector('.agent-empty-capabilities')?.textContent).toContain('0 / 2 可用');
  expect(view.querySelector('.agent-empty-capabilities')?.textContent).toContain('Claude');
  expect(view.querySelector('.agents-panel-empty')).not.toBeNull();
  const create = [...view.querySelectorAll<HTMLButtonElement>('button')].filter((button) =>
    button.textContent?.trim() === '新建角色');
  expect(create).toHaveLength(1);
  expect(create[0]?.disabled).toBe(true);
  expect(view.querySelector('.agent-editor')).toBeNull();
});

it('shows real role, model, policy and availability without opening the editor', async () => {
  const profile: AgentProfile = {
    schemaVersion: '1.0', id: 'profile.fixture.planner', revision: 2,
    name: 'Project Planner', role: 'planner', executorId: 'executor.codex',
    modelId: 'model-b', promptTemplate: 'Plan without edits.',
    contextProviders: ['task-contract'], policyProfile: 'read-only-no-network',
    limits: { maxTurns: 4, maxSeconds: 300, maxOutputTokens: 2000 },
  };
  const view = mount({ agentProfileCatalog: vi.fn().mockResolvedValue({
    profiles: [profile], availability: [{ profileId: profile.id, runnable: false,
      reason: 'NETWORK_POLICY_UNENFORCED' }], modelProviders: [], executors: [
      { executorId: 'executor.codex', available: true, modelIds: ['model-a', 'model-b'],
        readOnlyEnforced: true, networkPolicyEnforced: false, approval: true, reason: null },
    ],
  }), saveAgentProfile: vi.fn() }, true, true);
  await vi.waitFor(() => expect(view.querySelector('.agent-profile')).not.toBeNull());
  expect(view.querySelector('.agent-profile')?.textContent).toContain('规划');
  expect(view.querySelector('.agent-profile')?.textContent).toContain('model-b');
  expect(view.querySelector('.agent-profile')?.textContent).toContain('只读');
  expect(view.querySelector('.agent-profile')?.textContent).toContain('执行器不能保证网络限制');
  expect(view.querySelector('.agent-editor')).toBeNull();
  expect(view.querySelector<HTMLDetailsElement>('.agent-connections')?.open).toBe(false);
  await clickButton(view, '编辑');
  const model = [...view.querySelectorAll<HTMLSelectElement>('select')].find((item) =>
    [...item.options].some((option) => option.value === 'model-b'));
  expect(model?.value).toBe('model-b');
});

it('preserves an unavailable saved model and prevents an implicit replacement', async () => {
  const profile: AgentProfile = {
    schemaVersion: '1.0', id: 'profile.fixture.legacy', revision: 4,
    name: 'Legacy Developer', role: 'developer', executorId: 'executor.codex',
    modelId: 'retired-model', promptTemplate: 'Develop.', contextProviders: ['task-contract'],
    policyProfile: 'workspace-write',
    limits: { maxTurns: 4, maxSeconds: 300, maxOutputTokens: 2000 },
  };
  const save = vi.fn();
  const view = mount({ agentProfileCatalog: vi.fn().mockResolvedValue({
    profiles: [profile], availability: [{ profileId: profile.id, runnable: false,
      reason: 'MODEL_UNAVAILABLE' }], modelProviders: [], executors: [
      { executorId: 'executor.codex', available: true, modelIds: ['current-model'],
        readOnlyEnforced: true, networkPolicyEnforced: false, approval: true, reason: null },
    ],
  }), saveAgentProfile: save }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('Legacy Developer'));
  await clickButton(view, '编辑');
  const model = [...view.querySelectorAll<HTMLSelectElement>('select')].find((item) =>
    [...item.options].some((option) => option.value === 'retired-model'));
  expect(model?.value).toBe('retired-model');
  expect(model?.selectedOptions[0]?.disabled).toBe(true);
  expect([...view.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent === '保存新版本')?.disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it('edits the enforced duration without silently resetting other saved Profile limits', async () => {
  const profile: AgentProfile = {
    schemaVersion: '1.0', id: 'profile.fixture.developer', revision: 1,
    name: 'Fixture Developer', role: 'developer', executorId: 'executor.codex',
    modelId: 'verified-model', promptTemplate: 'Work in the isolated workspace.',
    contextProviders: ['task-contract'],
    policyProfile: 'workspace-write',
    limits: { maxTurns: 7, maxSeconds: 420, maxOutputTokens: 3456 },
  };
  const save = vi.fn().mockImplementation(async ({ profile: updated }: { profile: AgentProfile }) => updated);
  const view = mount({
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [profile], availability: [{ profileId: profile.id, runnable: true }],
      modelProviders: [], executors: [{ executorId: 'executor.codex', available: true,
        modelIds: ['verified-model'], readOnlyEnforced: true,
        networkPolicyEnforced: false, approval: true, reason: null }],
    }), saveAgentProfile: save,
  }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('Fixture Developer'));
  const edit = [...view.querySelectorAll('button')].find((button) => button.textContent === '编辑');
  edit?.click();
  await vi.waitFor(() => expect(view.querySelector('select')?.disabled).toBe(true));
  const label = [...view.querySelectorAll('label')].find((item) => item.textContent?.includes('最长运行时间'));
  const duration = label?.htmlFor ? view.querySelector<HTMLInputElement>(`#${label.htmlFor}`) : null;
  if (!duration) throw new Error('Profile duration input missing');
  await vi.waitFor(() => expect(duration.value).toBe('420'));
  duration.value = '600'; duration.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.waitFor(() => expect(duration.value).toBe('600'));
  const outputLabel = [...view.querySelectorAll('label')].find((item) =>
    item.textContent?.includes('输出 Token 观测上限'));
  const output = outputLabel?.htmlFor ? view.querySelector<HTMLInputElement>(`#${outputLabel.htmlFor}`) : null;
  if (!output) throw new Error('Profile output token input missing');
  await vi.waitFor(() => expect(output.value).toBe('3456'));
  output.value = '3000'; output.dispatchEvent(new Event('input', { bubbles: true }));
  const submit = [...view.querySelectorAll('button')].find((button) => button.textContent === '保存新版本');
  submit?.click();
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  const argument = save.mock.calls[0]?.[0] as { profile: AgentProfile; expectedRevision: number };
  expect(argument.expectedRevision).toBe(1);
  expect(argument.profile.revision).toBe(2);
  expect(argument.profile.limits).toEqual({ maxTurns: 7, maxSeconds: 600, maxOutputTokens: 3000 });
  expect(argument.profile.contextProviders).toEqual(['task-contract']);
  expect(view.textContent).toContain('请勿将其作为精确费用或安全硬限制');
});

it('edits a Planner profile without rewriting its role or read-only policy', async () => {
  const profile: AgentProfile = {
    schemaVersion: '1.0', id: 'profile.fixture.planner', revision: 3,
    name: 'Fixture Planner', role: 'planner', executorId: 'executor.codex',
    modelId: 'verified-model', promptTemplate: 'Plan without changing files.',
    contextProviders: ['task-contract'], policyProfile: 'read-only',
    limits: { maxTurns: 4, maxSeconds: 300, maxOutputTokens: 2000 },
  };
  const save = vi.fn().mockImplementation(async ({ profile: updated }: { profile: AgentProfile }) => updated);
  const view = mount({
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [profile], availability: [{ profileId: profile.id, runnable: true,
        reason: null }], modelProviders: [],
      executors: [{ executorId: 'executor.codex', available: true,
        modelIds: ['verified-model'], readOnlyEnforced: true,
        networkPolicyEnforced: false, approval: true, reason: null }],
    }), saveAgentProfile: save,
  }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('Fixture Planner'));
  [...view.querySelectorAll('button')].find((button) => button.textContent === '编辑')?.click();
  await vi.waitFor(() => expect(view.textContent).toContain('Planner 在只读隔离工作区'));
  const selects = [...view.querySelectorAll<HTMLSelectElement>('select')];
  expect(selects[0]?.value).toBe('planner');
  expect(selects[0]?.disabled).toBe(true);
  const submit = [...view.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent === '保存新版本');
  expect(submit?.disabled).toBe(false);
  submit?.click();
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]?.[0].profile.role).toBe('planner');
  expect(save.mock.calls[0]?.[0].profile.policyProfile).toBe('read-only');
  expect(save.mock.calls[0]?.[0].profile.contextProviders).toEqual(['task-contract']);
  expect(profile.role).toBe('planner');
  expect(profile.policyProfile).toBe('read-only');
});

it('adds project context only when the Planner explicitly opts in', async () => {
  const profile: AgentProfile = {
    schemaVersion:'1.0',id:'profile.fixture.context-planner',revision:1,
    name:'Fixture Planner',role:'planner',executorId:'executor.codex',
    modelId:'verified-model',promptTemplate:'Plan without changing files.',
    contextProviders:['task-contract'],policyProfile:'read-only',
    limits:{maxTurns:4,maxSeconds:300,maxOutputTokens:2000},
  };
  const save=vi.fn().mockImplementation(async ({profile:updated}:{profile:AgentProfile})=>updated);
  const view=mount({agentProfileCatalog:vi.fn().mockResolvedValue({
    profiles:[profile],availability:[{profileId:profile.id,runnable:true,reason:null}],
    modelProviders:[],executors:[{executorId:'executor.codex',available:true,
      modelIds:['verified-model'],readOnlyEnforced:true,networkPolicyEnforced:false,
      approval:true,reason:null}],
  }),saveAgentProfile:save},true,true);
  await vi.waitFor(()=>expect(view.textContent).toContain('Fixture Planner'));
  [...view.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent==='编辑')?.click();
  await vi.waitFor(()=>expect(view.querySelector<HTMLInputElement>(
    'input[type="checkbox"]')?.checked).toBe(false));
  const checkbox=view.querySelector<HTMLInputElement>('input[type="checkbox"]');
  checkbox?.click();
  [...view.querySelectorAll<HTMLButtonElement>('button')].find((button)=>
    button.textContent==='保存新版本')?.click();
  await vi.waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]?.[0].profile.role).toBe('planner');
  expect(save.mock.calls[0]?.[0].profile.policyProfile).toBe('read-only');
  expect(save.mock.calls[0]?.[0].profile.contextProviders).toEqual([
    'task-contract','project-context',
  ]);
});

it('does not inherit Developer project context when creating a Planner', async () => {
  const view=mount({agentProfileCatalog:vi.fn().mockResolvedValue({
    profiles:[],availability:[],modelProviders:[],
    executors:[{executorId:'executor.codex',available:true,modelIds:['verified-model'],
      readOnlyEnforced:true,networkPolicyEnforced:false,approval:true,reason:null}],
  }),saveAgentProfile:vi.fn()},true,true);
  await vi.waitFor(()=>expect(view.textContent).toContain('还没有创建角色'));
  await clickButton(view, '新建角色');
  const role=[...view.querySelectorAll<HTMLSelectElement>('select')].find((item)=>
    [...item.options].some((option)=>option.value==='planner'));
  if (!role) throw new Error('Role selector missing');
  role.value='planner';
  role.dispatchEvent(new Event('change',{bubbles:true}));
  await vi.waitFor(()=>expect(view.querySelector<HTMLInputElement>(
    'input[type="checkbox"]')?.checked).toBe(false));
});

it('keeps the unsupported Refiner role visible but read-only', async () => {
  const profile: AgentProfile = {
    schemaVersion: '1.0', id: 'profile.fixture.refiner', revision: 3,
    name: 'Fixture Refiner', role: 'refiner', executorId: 'executor.codex',
    modelId: 'verified-model', promptTemplate: 'Refine without changing files.',
    contextProviders: ['task-contract'], policyProfile: 'read-only',
    limits: { maxTurns: 4, maxSeconds: 300, maxOutputTokens: 2000 },
  };
  const save = vi.fn();
  const view = mount({
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [profile], availability: [{ profileId: profile.id, runnable: false,
        reason: 'ROLE_UNSUPPORTED' }], modelProviders: [],
      executors: [{ executorId: 'executor.codex', available: true,
        modelIds: ['verified-model'], readOnlyEnforced: true,
        networkPolicyEnforced: false, approval: true, reason: null }],
    }), saveAgentProfile: save,
  }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('Fixture Refiner'));
  [...view.querySelectorAll('button')].find((button) => button.textContent === '编辑')?.click();
  await vi.waitFor(() => expect(view.textContent).toContain('需求整理角色仅供查看'));
  const submit = [...view.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent === '保存新版本');
  expect(submit?.disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it('preserves a Reviewer network restriction while opening an existing profile', async () => {
  const profile: AgentProfile = {
    schemaVersion: '1.0', id: 'profile.fixture.reviewer', revision: 1,
    name: 'Fixture Reviewer', role: 'reviewer', executorId: 'executor.codex',
    modelId: 'verified-model', promptTemplate: 'Review the snapshot.',
    contextProviders: ['task-contract', 'snapshot-diff'],
    policyProfile: 'read-only-no-network',
    limits: { maxTurns: 4, maxSeconds: 300, maxOutputTokens: 2000 },
  };
  const view = mount({
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [profile], availability: [{ profileId: profile.id, runnable: false,
        reason: 'NETWORK_POLICY_UNENFORCED' }], modelProviders: [],
      executors: [{ executorId: 'executor.codex', available: true,
        modelIds: ['verified-model'], readOnlyEnforced: true,
        networkPolicyEnforced: false, approval: true, reason: null }],
    }), saveAgentProfile: vi.fn(),
  }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('Fixture Reviewer'));
  [...view.querySelectorAll('button')].find((button) => button.textContent === '编辑')?.click();
  await vi.waitFor(() => expect([...view.querySelectorAll<HTMLSelectElement>('select')][3]?.value)
    .toBe('read-only-no-network'));
});

it('rejects an invalid duration before sending a Profile to the Host', async () => {
  const save = vi.fn();
  const view = mount({
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [], availability: [], modelProviders: [],
      executors: [{ executorId: 'executor.codex', available: true,
        modelIds: ['verified-model'], readOnlyEnforced: true,
        networkPolicyEnforced: false, approval: true, reason: null }],
    }), saveAgentProfile: save,
  }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('还没有创建角色'));
  await clickButton(view, '新建角色');
  const fields = [...view.querySelectorAll('label')];
  for (const [labelText, value] of [['名称', 'Developer'], ['角色职责与提示词', 'Develop.'],
    ['最长运行时间', '0']] as const) {
    const label = fields.find((item) => item.textContent?.includes(labelText));
    const input = label?.htmlFor ? view.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${label.htmlFor}`) : null;
    if (!input) throw new Error(`${labelText} input missing`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const submit = [...view.querySelectorAll('button')].find((button) => button.textContent === '保存新版本');
  submit?.click();
  await vi.waitFor(() => expect(view.textContent).toContain('最长运行时间须为 1～3600 秒'));
  expect(save).not.toHaveBeenCalled();
});

it('rejects an invalid observed output-token ceiling before saving', async () => {
  const save = vi.fn();
  const view = mount({
    agentProfileCatalog: vi.fn().mockResolvedValue({
      profiles: [], availability: [], modelProviders: [],
      executors: [{ executorId: 'executor.codex', available: true,
        modelIds: ['verified-model'], readOnlyEnforced: true,
        networkPolicyEnforced: false, approval: true, reason: null }],
    }), saveAgentProfile: save,
  }, true, true);
  await vi.waitFor(() => expect(view.textContent).toContain('还没有创建角色'));
  await clickButton(view, '新建角色');
  for (const [labelText, value] of [['名称', 'Developer'], ['角色职责与提示词', 'Develop.'],
    ['输出 Token 观测上限', '100001']] as const) {
    const label = [...view.querySelectorAll('label')].find((item) =>
      item.textContent?.includes(labelText));
    const input = label?.htmlFor ? view.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `#${label.htmlFor}`) : null;
    if (!input) throw new Error(`${labelText} input missing`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  [...view.querySelectorAll('button')].find((button) => button.textContent === '保存新版本')?.click();
  await vi.waitFor(() => expect(view.textContent).toContain('1～100000'));
  expect(save).not.toHaveBeenCalled();
});
