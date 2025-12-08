import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ProcessController } from '@forge/process';
import { WorkspaceManager } from '@forge/workspace';
import { HostExecutorRegistry } from '../dist/executors.js';
import { HostRunResources } from '../dist/run-resources.js';

const chain = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'process',
  'tests', 'fixture', 'chain.mjs');

test('Host registers only the built-in Codex executor and clears listeners', async () => {
  const registry = new HostExecutorRegistry();
  try {
    assert.equal(registry.resolve('executor.codex')?.id, 'executor.codex');
    assert.equal(registry.resolve('executor.unknown'), null);
    const unsubscribe = registry.onEvent(() => {});
    unsubscribe();
  } finally { await registry.dispose(); }
});

test('unconfirmed provider cancellation quarantines its worktree', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-unconfirmed-run-'));
  const source = join(dir, 'repo');
  const { mkdir, writeFile, readFile } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  await mkdir(source);
  execFileSync('git', ['init', '-q', source]);
  await writeFile(join(source, 'source.txt'), 'unchanged\n');
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Forge Spike', '-c', 'user.email=forge-spike@example.invalid',
    'commit', '-qm', 'baseline']);
  const runtimeId = randomUUID();
  const processes = new ProcessController(runtimeId);
  const manager = new WorkspaceManager(join(dir, 'managed'), runtimeId, (runId) => processes.hasActive(runId));
  const registry = new HostExecutorRegistry(processes);
  try {
    await manager.open();
    const created = await manager.create({ sourceRepo: source, ownerRunId: 'unconfirmed-run' });
    const workspace = await manager.acquire(created.workspaceId, 'unconfirmed-run');
    const resources = new HostRunResources(registry, manager, processes);
    const handle = { runId: 'unconfirmed-run', subscribe: () => () => {}, cancel: async () => {},
      completion: Promise.resolve('completed'), dispose: async () => {} };
    await assert.rejects(resources.cancelAndRelease(handle, workspace, true), /not confirmed/);
    assert.equal(manager.inspect(workspace.workspaceId).status, 'failed');
    assert.equal(await readFile(join(workspace.rootPath, 'source.txt'), 'utf8'), 'unchanged\n');
  } finally { await registry.dispose(); await manager.dispose(); await rm(dir, { recursive: true, force: true }); }
});

test('Host shutdown stops accepting runs and terminates owned descendants', {
  timeout: 15000, skip: process.platform === 'win32' ? 'Windows process-tree backend unverified' : false,
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-host-run-'));
  const controller = new ProcessController(randomUUID(), join(dir, 'process-records'), 150, 2000);
  const registry = new HostExecutorRegistry(controller);
  try {
    const session = await controller.spawn({ runId: 'host-owned-run', executable: process.execPath,
      argv: [chain, 'parent', 'ignore-term'], cwd: dir });
    await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error('Owned grandchild did not start')), 5000);
      session.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) if (JSON.parse(line).role === 'grandchild') { clearTimeout(timer); resolve(); }
      });
    });
    assert.equal(controller.hasActive('host-owned-run'), true);
    await registry.dispose();
    assert.equal(controller.hasActive('host-owned-run'), false);
    assert.equal((await session.exit).signal !== null, true);
    await assert.rejects(registry.start('executor.codex', {}), /stopping/);
  } finally { await registry.dispose(); await rm(dir, { recursive: true, force: true }); }
});
