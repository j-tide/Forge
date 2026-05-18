import { afterEach, expect, it, vi } from 'vitest';
import { createApp, type App as VueApp } from 'vue';
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

it('keeps Remove from Forge open with the Host busy reason', async () => {
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
    button.textContent?.includes('Remove from Forge'))?.click();
  await vi.waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull());
  const dialog = document.body.querySelector('[role="dialog"]')!;
  [...dialog.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Remove from Forge'))?.click();
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
  expect(root.textContent).not.toContain('Choose folder');
  expect(root.textContent).not.toContain('Remove from Forge');
  expect(root.textContent).not.toContain('Trust this project');
  expect(root.textContent).not.toContain('命令预设');
  expect(command).toHaveBeenCalledTimes(1);
  expect(command).toHaveBeenCalledWith(expect.objectContaining({ type: 'project.list' }));
});
