import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, shallowReactive, type App as VueApp } from 'vue';
import type { ForgeClient } from '@forge/client';
import type { ForgeProject } from '@forge/contracts';
import ProjectsView from './ProjectsView.vue';

const now = '2026-09-27T00:00:00.000Z';
const projectId = 'b36df0ad-e806-4455-9914-ea578d836f99';
const project: ForgeProject = {
  projectId, environmentId: 'f3a6ce7c-e146-4241-834e-861ab9da3309',
  name: 'Project with a running verifier', rootPath: '/fixture',
  repositoryType: 'git', gitRoot: '/fixture', defaultBranch: 'main',
  trusted: true, trustVersion: 'project-trust/v1', trustApprovedAt: now,
  environmentSummaryHash: 'a'.repeat(64), createdAt: now, updatedAt: now,
  lastOpenedAt: now, revision: 1, archivedAt: null,
  probe: {
    rootPath: '/fixture', name: 'Project with a running verifier',
    repositoryType: 'git', gitRoot: '/fixture', currentBranch: 'main',
    defaultBranch: 'main', workingTree: 'clean', remoteConfigured: false,
    packageManager: 'unknown', packageManagerEvidence: [], projectType: 'unknown',
    detectedRuntime: [], scripts: { dev: null, build: null, test: null,
      lint: null, typecheck: null }, capabilities: { gitWorktree: true,
      declaredScripts: false }, fingerprint: 'a'.repeat(64), probedAt: now,
    existingProject: null,
  },
};

let app: VueApp | null = null;
let root: HTMLDivElement | null = null;
afterEach(() => { app?.unmount(); root?.remove(); app = null; root = null; });

it('keeps 从 Forge 移除 open with the Host busy reason', async () => {
  const command = vi.fn(async (input: { type: string }) => input.type === 'project.list'
    ? { ok: true, data: [project] }
    : { ok: false, error: { code: 'PROJECT_BUSY', message: 'PROJECT_BUSY' } });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ProjectsView, {
    client: { project: command } as unknown as ForgeClient,
    desktop: true, connected: true, activeProject: null,
  });
  app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain(project.name));
  [...root.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('从 Forge 移除'))?.click();
  await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull());
  const dialog = document.body.querySelector('[role="dialog"]')!;
  [...dialog.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('从 Forge 移除'))?.click();
  await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent)
    .toContain('正在进行'));
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ type: 'project.remove' }));
  expect(dialog.textContent).toContain(project.name);
});

it('shows saved projects but no project write controls in a historical read-only profile', async () => {
  const command = vi.fn(async () => ({ ok: true, data: [project] }));
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ProjectsView, {
    client: { project: command } as unknown as ForgeClient,
    desktop: true, connected: true, readOnly: true, activeProject: project,
  });
  app.mount(root);
  await vi.waitFor(() => expect(root?.textContent).toContain(project.name));
  expect(root.textContent).toContain('历史项目记录');
  expect(root.textContent).not.toContain('选择文件夹');
  expect(root.textContent).not.toContain('从 Forge 移除');
  expect(root.textContent).not.toContain('信任并打开');
  expect(root.textContent).not.toContain('命令预设');
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ type: 'project.list' }));
});

function mountPicker(client: ForgeClient, options: Record<string, unknown> = {}): HTMLDivElement {
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ProjectsView, { client, desktop: true, connected: true,
    activeProject: null, compact: true, ...options });
  app.mount(root);
  return root;
}

function clickButton(element: Element, label: string): void {
  const button = [...element.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  expect(button).toBeDefined();
  button!.click();
}

it('keeps the inline picker after native cancellation and closes only on explicit cancel', async () => {
  const chooseProjectFolder = vi.fn(async () => null);
  const command = vi.fn(async () => ({ ok: true, data: [] }));
  const cancelled = vi.fn(); const activated = vi.fn(); const home = vi.fn();
  const element = mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { autoChoose: true, onCancelled: cancelled, onActivated: activated, onHome: home });
  await vi.waitFor(() => expect(chooseProjectFolder).toHaveBeenCalledTimes(1));
  await nextTick();
  expect(cancelled).not.toHaveBeenCalled();
  expect(element.querySelector('.project-catalog')).not.toBeNull();
  clickButton(element, '选择文件夹');
  await vi.waitFor(() => expect(chooseProjectFolder).toHaveBeenCalledTimes(2));
  await nextTick();
  expect(cancelled).not.toHaveBeenCalled();
  expect(command.mock.calls).toHaveLength(1);
  expect(command).toHaveBeenCalledWith({ type: 'project.list', payload: {} });
  expect(activated).not.toHaveBeenCalled();
  expect(home).not.toHaveBeenCalled();
  clickButton(element, '取消');
  expect(cancelled).toHaveBeenCalledTimes(1);
});

it('loads the saved-project list before deciding whether to open a native picker', async () => {
  let resolveList: (value: { ok: boolean; data: ForgeProject[] }) => void = () => {};
  const list = new Promise<{ ok: boolean; data: ForgeProject[] }>((resolve) => { resolveList = resolve; });
  const chooseProjectFolder = vi.fn(async () => null);
  const command = vi.fn(async () => list);
  const element = mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { autoChoose: true });
  await nextTick();
  expect(element.textContent).toContain('正在读取项目');
  expect(chooseProjectFolder).not.toHaveBeenCalled();
  resolveList({ ok: true, data: [project] });
  await vi.waitFor(() => expect(element.textContent).toContain(project.name));
  expect(chooseProjectFolder).not.toHaveBeenCalled();
});

it.each([
  { ok: false, error: { message: 'Host disconnected' } },
  { ok: true, data: null },
  { ok: true, data: [{ projectId }] },
])('does not treat an unreadable project list as an empty list', async (response) => {
  const chooseProjectFolder = vi.fn(async () => null);
  const command = vi.fn(async () => response);
  const element = mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { autoChoose: true });
  await vi.waitFor(() => expect(element.querySelector('[role="alert"]')).not.toBeNull());
  expect(chooseProjectFolder).not.toHaveBeenCalled();
});

it('keeps explicit project trust in the inline picker and activates only after approval', async () => {
  const command = vi.fn(async (input: { type: string }) => ({ ok: true,
    data: input.type === 'project.list' ? [] : input.type === 'project.probe' ? project.probe : project }));
  const activated = vi.fn(); const home = vi.fn();
  const element = mountPicker({ project: command, chooseProjectFolder: async () => project.rootPath } as unknown as ForgeClient,
    { autoChoose: true, onActivated: activated, onHome: home });
  await vi.waitFor(() => expect(element.textContent).toContain('已检查项目'));
  expect(command.mock.calls.some(([input]) => input.type === 'project.create')).toBe(false);
  clickButton(element, '继续');
  await nextTick();
  expect(element.textContent).toContain('项目脚本可以执行任意本机代码');
  expect(command.mock.calls.some(([input]) => input.type === 'project.create')).toBe(false);
  clickButton(element, '信任并打开');
  await vi.waitFor(() => expect(activated).toHaveBeenCalledWith(project));
  expect(command).toHaveBeenCalledWith({ type: 'project.create', payload: {
    rootPath: project.rootPath, fingerprint: project.probe.fingerprint,
    trustVersion: 'project-trust/v1', approved: true, expectedRevision: 0,
  } });
  expect(command).toHaveBeenCalledWith({ type: 'project.setActive', payload: {
    projectId, expectedRevision: project.revision,
  } });
  expect(home).not.toHaveBeenCalled();
});

it.each(['host-error', 'transport-error'])('retries activation without duplicating trust after %s', async (failure) => {
  let created = false;
  let activations = 0;
  const currentProject = { ...project, revision: 2 };
  const command = vi.fn(async (input: { type: string }) => {
    if (input.type === 'project.list') return { ok: true, data: created ? [currentProject] : [] };
    if (input.type === 'project.probe') return { ok: true, data: project.probe };
    if (input.type === 'project.create') { created = true; return { ok: true, data: project }; }
    if (input.type === 'project.setActive') {
      activations += 1;
      if (activations === 1) {
        if (failure === 'transport-error') throw new Error('Connection lost');
        return { ok: false, error: { code: 'PROJECT_CONFLICT', message: '项目版本已变化，请重试。' } };
      }
      return { ok: true, data: currentProject };
    }
    throw new Error('Unexpected project operation');
  });
  const activated = vi.fn();
  const element = mountPicker({ project: command,
    chooseProjectFolder: async () => project.rootPath } as unknown as ForgeClient,
  { autoChoose: true, onActivated: activated });
  await vi.waitFor(() => expect(element.textContent).toContain('已检查项目'));
  clickButton(element, '继续'); await nextTick();
  clickButton(element, '信任并打开');
  await vi.waitFor(() => {
    const retry = [...element.querySelectorAll('button')].find((item) => item.textContent?.trim() === '重试打开项目');
    expect(retry?.disabled).toBe(false);
  });
  expect(element.textContent).toContain('信任决定已保存');
  expect(activated).not.toHaveBeenCalled();
  clickButton(element, '重试打开项目');
  await vi.waitFor(() => expect(activated).toHaveBeenCalledWith(currentProject));
  expect(command.mock.calls.filter(([input]) => input.type === 'project.create')).toHaveLength(1);
  expect(command).toHaveBeenCalledWith({ type: 'project.setActive', payload: {
    projectId, expectedRevision: currentProject.revision,
  } });
});

it('switches a saved trusted project in place without opening another native picker', async () => {
  const command = vi.fn(async (input: { type: string }) => ({ ok: true,
    data: input.type === 'project.list' ? [project] : project }));
  const chooseProjectFolder = vi.fn(); const activated = vi.fn(); const home = vi.fn();
  const element = mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { onActivated: activated, onHome: home });
  await vi.waitFor(() => expect(element.textContent).toContain(project.name));
  expect(element.textContent).not.toContain('从 Forge 移除');
  expect(element.querySelector('.project-environment')).toBeNull();
  clickButton(element, '切换');
  await vi.waitFor(() => expect(activated).toHaveBeenCalledWith(project));
  expect(chooseProjectFolder).not.toHaveBeenCalled();
  expect(command.mock.calls.map(([input]) => input.type)).toEqual(['project.list', 'project.setActive', 'project.list']);
  expect(home).not.toHaveBeenCalled();
});

it('does not open the folder picker in Web or read-only mode', async () => {
  const chooseProjectFolder = vi.fn(); const command = vi.fn(async () => ({ ok: true, data: [] }));
  const element = mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { autoChoose: true, desktop: false });
  await nextTick();
  expect(element.textContent).toContain('本地项目需要 Forge Desktop');
  expect(chooseProjectFolder).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
  app?.unmount(); element.remove();
  mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { autoChoose: true, readOnly: true });
  await nextTick();
  expect(chooseProjectFolder).not.toHaveBeenCalled();
});

it('ignores a native picker result when its dialog has already closed', async () => {
  let resolveSelection: (value: string) => void = () => {};
  const selected = new Promise<string>((resolve) => { resolveSelection = resolve; });
  const command = vi.fn(async () => ({ ok: true, data: [] }));
  const chooseProjectFolder = vi.fn(() => selected);
  mountPicker({ project: command, chooseProjectFolder } as unknown as ForgeClient,
    { autoChoose: true });
  await vi.waitFor(() => expect(chooseProjectFolder).toHaveBeenCalledTimes(1));
  app?.unmount(); app = null;
  resolveSelection(project.rootPath);
  await nextTick();
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledWith({ type: 'project.list', payload: {} });
});

it('opens the picker once when Host finishes connecting after the dialog opened', async () => {
  const chooseProjectFolder = vi.fn(async () => null);
  const command = vi.fn(async () => ({ ok: true, data: [] }));
  const props = shallowReactive({ client: { project: command, chooseProjectFolder } as unknown as ForgeClient,
    desktop: true, connected: false, activeProject: null, compact: true, autoChoose: true });
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ProjectsView, { ...props }) }); app.mount(root);
  expect(chooseProjectFolder).not.toHaveBeenCalled();
  props.connected = true;
  await vi.waitFor(() => expect(chooseProjectFolder).toHaveBeenCalledTimes(1));
  props.connected = false; await nextTick(); props.connected = true;
  await nextTick();
  expect(chooseProjectFolder).toHaveBeenCalledTimes(1);
});

it('shows the saved-project list immediately in management without an empty onboarding step', async () => {
  const command = vi.fn(async () => ({ ok: true, data: [project] }));
  const element = mountPicker({ project: command } as unknown as ForgeClient,
    { compact: false });
  await vi.waitFor(() => expect(element.querySelector('.project-record-list')?.textContent)
    .toContain(project.name));
  expect(element.querySelector('h1')?.textContent).toBe('项目');
  expect(element.querySelector('.project-step-indicator')).toBeNull();
  expect(element.querySelector('.project-step')).toBeNull();
  expect(element.querySelectorAll('button').length).toBe(3);
  expect(command).toHaveBeenCalledTimes(1);
});

it('keeps script details collapsed and identifies declared commands without executing them', async () => {
  const inspected = { ...project.probe, workingTree: 'dirty' as const,
    packageManager: 'pnpm' as const, packageManagerEvidence: ['pnpm-lock.yaml'],
    scripts: { ...project.probe.scripts, test: 'node --test' } };
  const command = vi.fn(async (input: { type: string }) => ({ ok: true,
    data: input.type === 'project.list' ? [] : inspected }));
  const element = mountPicker({ project: command,
    chooseProjectFolder: async () => project.rootPath } as unknown as ForgeClient,
  { autoChoose: true });
  await vi.waitFor(() => expect(element.textContent).toContain('已检查项目'));
  const details = element.querySelector('details');
  expect(details?.open).toBe(false);
  expect(details?.textContent).toContain('pnpm run test');
  expect(details?.textContent).toContain('已声明 · 未运行');
  expect(element.textContent).toContain('工作区有未提交修改。现有文件会保留。');
  expect(command.mock.calls.map(([input]) => input.type)).toEqual(['project.list', 'project.probe']);
});

it('removes metadata only after explicit confirmation using project identity and revision', async () => {
  let removed = false;
  const command = vi.fn(async (input: { type: string }) => {
    if (input.type === 'project.remove') removed = true;
    return { ok: true, data: input.type === 'project.list' ? removed ? [] : [project] : null };
  });
  const element = mountPicker({ project: command } as unknown as ForgeClient,
    { compact: false });
  await vi.waitFor(() => expect(element.textContent).toContain(project.name));
  clickButton(element, '从 Forge 移除');
  await nextTick();
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('你的源码、Git 仓库和项目文件不会被删除');
  expect(command.mock.calls.some(([input]) => input.type === 'project.remove')).toBe(false);
  clickButton(dialog, '从 Forge 移除');
  await vi.waitFor(() => expect(command).toHaveBeenCalledWith({ type: 'project.remove',
    payload: { projectId, expectedRevision: project.revision } }));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(command.mock.calls.map(([input]) => input.type)).toEqual(['project.list', 'project.remove', 'project.list']);
});
