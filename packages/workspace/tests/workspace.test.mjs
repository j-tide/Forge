import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WorkspaceManager, workspaceDescriptorSchema } from '../dist/index.js';

function git(cwd, ...args) { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim(); }

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'Forge 测试项目 01 '));
  const source = join(parent, `source repo 中文 (${String('long-name-').repeat(10)})`);
  await mkdir(source);
  git(source, 'init', '-q');
  await writeFile(join(source, 'add.js'), 'export const add = (a, b) => a + b;\n');
  git(source, 'add', '.');
  git(source, '-c', 'user.name=Forge Spike', '-c', 'user.email=forge-spike@example.invalid',
    'commit', '-qm', 'fixture baseline');
  return { parent, source };
}

test('detached worktree isolates source, base, dirty files and Git metadata', async () => {
  const { parent, source } = await fixture();
  const base = git(source, 'rev-parse', 'HEAD');
  const hooks = join(parent, 'source-controlled-hooks');
  await mkdir(hooks);
  const hookMarker = join(parent, 'hook-fired.txt');
  await writeFile(join(hooks, 'post-checkout'),
    `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(hookMarker)}, 'ran')\n`, { mode: 0o755 });
  git(source, 'config', 'core.hooksPath', hooks);
  await writeFile(join(source, 'untracked marker.txt'), 'source remains untouched\n');
  const before = git(source, 'status', '--porcelain', '--untracked-files=all');
  const manager = new WorkspaceManager(join(parent, 'Forge private workspaces'), randomUUID(), () => false);
  try {
    await manager.open();
    const created = await manager.create({ sourceRepo: source, ownerRunId: 'run-A' });
    await assert.rejects(lstat(hookMarker), { code: 'ENOENT' });
    assert.equal(workspaceDescriptorSchema.parse(created).baseRevision, base);
    assert.equal(git(created.rootPath, 'rev-parse', 'HEAD'), base);
    assert.equal(git(created.rootPath, 'branch', '--show-current'), '');
    assert.equal(await readFile(join(created.rootPath, 'add.js'), 'utf8'), 'export const add = (a, b) => a + b;\n');
    assert.equal(git(source, 'status', '--porcelain', '--untracked-files=all'), before);
    assert.equal(git(source, 'worktree', 'list', '--porcelain').includes(created.rootPath), true);
    await manager.acquire(created.workspaceId, 'run-A');
    await assert.rejects(manager.acquire(created.workspaceId, 'run-A'), /already leased/);
    await assert.rejects(manager.acquire(created.workspaceId, 'run-B'), /already leased/);
    await writeFile(join(created.rootPath, 'add.js'), 'export const add = () => 4;\n');
    await writeFile(join(created.rootPath, 'new file.txt'), 'untracked\n');
    assert.equal(git(created.rootPath, 'diff', '--name-only'), 'add.js');
    assert.equal(git(source, 'status', '--porcelain', '--untracked-files=all'), before);
    await assert.rejects(manager.release(created.workspaceId), /explicit discard/);
    const otherRuntime = new WorkspaceManager(join(parent, 'Forge private workspaces'), randomUUID(), () => false);
    await otherRuntime.open();
    assert.equal((await otherRuntime.inspectOrphans()).some((item) => item.workspaceId === created.workspaceId), true);
    await otherRuntime.dispose();
    const released = await manager.release(created.workspaceId, { discardChanges: true });
    assert.equal(released.status, 'released');
    assert.equal((await manager.release(created.workspaceId)).status, 'released');
    assert.equal(git(source, 'worktree', 'list', '--porcelain').includes(created.rootPath), false);
    await assert.rejects(lstat(created.rootPath), { code: 'ENOENT' });
    assert.equal(git(source, 'status', '--porcelain', '--untracked-files=all'), before);
  } finally { await manager.dispose(); await rm(parent, { recursive: true, force: true }); }
});

test('rejects malicious IDs, symlink substitution and active process release', async () => {
  const { parent, source } = await fixture();
  let active = false;
  const manager = new WorkspaceManager(join(parent, 'owned workspaces'), randomUUID(), () => active);
  try {
    await manager.open();
    await assert.rejects(manager.create({ sourceRepo: source, ownerRunId: '../escape' }));
    await assert.rejects(manager.create({ sourceRepo: source, ownerRunId: 'safe', baseRevision: '--help' }), /commit hash/);
    const created = await manager.create({ sourceRepo: source, ownerRunId: 'safe' });
    await assert.rejects(manager.release('../escape', { discardChanges: true }));
    active = true;
    await assert.rejects(manager.release(created.workspaceId, { discardChanges: true }), /active owned processes/);
    active = false;
    const moved = `${created.rootPath}-held`;
    await rename(created.rootPath, moved);
    await symlink(parent, created.rootPath);
    try { await assert.rejects(manager.release(created.workspaceId, { discardChanges: true }), /not a managed directory/); }
    finally { await rm(created.rootPath); await rename(moved, created.rootPath); }
    assert.equal((await manager.release(created.workspaceId)).status, 'released');
  } finally { await manager.dispose(); await rm(parent, { recursive: true, force: true }); }
});

test('shutdown quarantines a leased worktree and restart reports it without deleting it', async () => {
  const { parent, source } = await fixture();
  const root = join(parent, 'managed');
  const first = new WorkspaceManager(root, randomUUID(), () => true);
  try {
    await first.open();
    const workspace = await first.create({ sourceRepo: source, ownerRunId: 'run-held' });
    await first.acquire(workspace.workspaceId, 'run-held');
    assert.equal(await first.dispose(), 1);
    assert.equal(first.inspect(workspace.workspaceId).status, 'failed');
    const restarted = new WorkspaceManager(root, randomUUID(), () => false);
    await restarted.open();
    assert.equal((await restarted.inspectOrphans()).some((item) => item.workspaceId === workspace.workspaceId), true);
    assert.equal((await lstat(workspace.rootPath)).isDirectory(), true);
    await restarted.dispose();
  } finally { await rm(parent, { recursive: true, force: true }); }
});
