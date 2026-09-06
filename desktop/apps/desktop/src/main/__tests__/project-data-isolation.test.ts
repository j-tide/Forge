import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

let fixtureRoot: string;
let previewUserData: string;

vi.mock('electron', () => ({
  app: { getPath: () => previewUserData }
}));
vi.mock('../cli-tool-manager', () => ({ getToolPath: () => 'git' }));

beforeEach(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'forge-glass-project-data-'));
  previewUserData = path.join(fixtureRoot, 'preview-user-data');
  mkdirSync(previewUserData, { recursive: true });
  vi.resetModules();
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('Forge project data isolation', () => {
  it('opens a real Git project alongside Forge without reading or changing its tasks', async () => {
    const projectPath = path.join(fixtureRoot, 'shared-project');
    mkdirSync(projectPath);
    execFileSync('git', ['init'], { cwd: projectPath });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '--allow-empty', '-m', 'baseline'], { cwd: projectPath });

    const upstreamSpec = path.join(projectPath, '.auto-claude', 'specs', '001-upstream');
    mkdirSync(upstreamSpec, { recursive: true });
    const upstreamPlan = path.join(upstreamSpec, 'implementation_plan.json');
    const upstreamBytes = JSON.stringify({ feature: 'Upstream task', status: 'pending', phases: [] });
    writeFileSync(upstreamPlan, upstreamBytes);
    const legacyWorktree = path.join(projectPath, '.worktrees', '001-upstream');
    mkdirSync(legacyWorktree, { recursive: true });
    execFileSync('git', ['branch', 'auto-claude/001-upstream'], { cwd: projectPath });

    const { ProjectStore } = await import('../project-store');
    const { initializeProject } = await import('../project-initializer');
    const { getSpecsDir } = await import('../../shared/constants');
    const { findTaskWorktree } = await import('../worktree-paths');
    const store = new ProjectStore();
    const project = store.addProject(projectPath);

    expect(project.autoBuildPath).toBe('');
    expect(project.dataDirectoryWarning).toContain('.auto-claude');
    expect(store.getTasks(project.id)).toEqual([]);
    expect(findTaskWorktree(projectPath, '001-upstream')).toBeNull();
    expect(() => getSpecsDir('.auto-claude')).toThrow('Unsupported project data directory');
    expect(() => store.updateAutoBuildPath(project.id, '.auto-claude')).toThrow('Unsupported project data directory');

    expect(initializeProject(projectPath)).toEqual({ success: true });
    store.updateAutoBuildPath(project.id, '.forge-glass-preview');
    const previewSpec = path.join(projectPath, '.forge-glass-preview', 'specs', '001-preview');
    mkdirSync(previewSpec, { recursive: true });
    writeFileSync(path.join(previewSpec, 'implementation_plan.json'), JSON.stringify({
      feature: 'Preview task', description: 'Isolated task', status: 'pending', phases: [],
      created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
    }));

    expect(store.getTasks(project.id).map(task => task.specId)).toEqual(['001-preview']);
    expect(readFileSync(upstreamPlan, 'utf8')).toBe(upstreamBytes);
    expect(existsSync(legacyWorktree)).toBe(true);
    expect(execFileSync('git', ['branch', '--list', 'auto-claude/001-upstream'], { cwd: projectPath, encoding: 'utf8' })).toContain('auto-claude/001-upstream');
    expect(readFileSync(path.join(projectPath, '.gitignore'), 'utf8')).toContain('.forge-glass-preview/');

    // An older preview projects.json may still name the upstream directory.
    const storeFile = path.join(previewUserData, 'store', 'projects.json');
    const saved = JSON.parse(readFileSync(storeFile, 'utf8'));
    saved.projects[0].autoBuildPath = '.auto-claude';
    writeFileSync(storeFile, JSON.stringify(saved));
    const reloaded = new ProjectStore();
    expect(reloaded.getProject(project.id)?.autoBuildPath).toBe('.forge-glass-preview');
    expect(reloaded.getTasks(project.id).map(task => task.specId)).toEqual(['001-preview']);
    expect(readFileSync(upstreamPlan, 'utf8')).toBe(upstreamBytes);
  });

  it('rejects a preview data directory linked to Forge data', async () => {
    const projectPath = path.join(fixtureRoot, 'linked-project');
    const upstreamPath = path.join(projectPath, '.auto-claude');
    mkdirSync(upstreamPath, { recursive: true });
    symlinkSync(upstreamPath, path.join(projectPath, '.forge-glass-preview'));

    const { ProjectStore } = await import('../project-store');
    const store = new ProjectStore();
    const project = store.addProject(projectPath);
    expect(project.autoBuildPath).toBe('');
    expect(project.dataDirectoryWarning).toContain('unsafe');
    expect(store.getTasks(project.id)).toEqual([]);
  });

  it('fails closed on a saved preview project that still names the upstream directory', async () => {
    const projectPath = path.join(fixtureRoot, 'old-preview-project');
    const upstreamSpec = path.join(projectPath, '.auto-claude', 'specs', '001-existing');
    mkdirSync(upstreamSpec, { recursive: true });
    const upstreamPlan = path.join(upstreamSpec, 'implementation_plan.json');
    writeFileSync(upstreamPlan, JSON.stringify({ feature: 'Existing Forge task', status: 'pending', phases: [] }));
    const upstreamBytes = readFileSync(upstreamPlan);

    const storeDir = path.join(previewUserData, 'store');
    mkdirSync(storeDir, { recursive: true });
    writeFileSync(path.join(storeDir, 'projects.json'), JSON.stringify({
      projects: [{
        id: 'legacy-project', name: 'Old Preview', path: projectPath,
        autoBuildPath: '.auto-claude', settings: {},
        createdAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z'
      }],
      settings: {}
    }));

    const { ProjectStore } = await import('../project-store');
    const store = new ProjectStore();
    expect(store.getProject('legacy-project')?.autoBuildPath).toBe('');
    expect(store.getProject('legacy-project')?.dataDirectoryWarning).toContain('does not import');
    expect(store.getTasks('legacy-project')).toEqual([]);
    expect(existsSync(path.join(projectPath, '.forge-glass-preview'))).toBe(false);
    expect(readFileSync(upstreamPlan)).toEqual(upstreamBytes);
  });
});
