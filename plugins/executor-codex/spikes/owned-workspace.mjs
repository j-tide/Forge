import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { HostExecutorRegistry } from '../../../apps/host/dist/executors.js';
import { HostRunResources } from '../../../apps/host/dist/run-resources.js';
import { ProcessController } from '../../../packages/process/dist/index.js';
import { WorkspaceManager } from '../../../packages/workspace/dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const parent = await mkdtemp(join(tmpdir(), 'Forge Codex 工作区 01 '));
const source = join(parent, 'source repo with spaces 中文');
await mkdir(source);
const runtimeId = randomUUID();
const controller = new ProcessController(runtimeId, join(parent, 'process-records'));
const manager = new WorkspaceManager(join(parent, 'managed workspaces'), runtimeId,
  (runId) => controller.hasActive(runId));
const registry = new HostExecutorRegistry(controller);
const resources = new HostRunResources(registry, manager, controller);
let workspace;
let handle;
try {
  await cp(fixture, source, { recursive: true });
  execFileSync('git', ['init', '-q', source]);
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Forge Spike', '-c', 'user.email=forge-spike@example.invalid',
    'commit', '-qm', 'fixture baseline']);
  const sourceBase = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceBefore = execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' });
  await manager.open();
  workspace = await manager.create({ sourceRepo: source, ownerRunId: 'spike-owned-codex' });
  const acquired = await manager.acquire(workspace.workspaceId, 'spike-owned-codex');
  assert.equal(workspace.baseRevision, sourceBase);
  const events = [];
  registry.onEvent((event) => events.push(event));
  handle = await resources.start('executor.codex', acquired, { runId: 'spike-owned-codex', taskId: 'fixture-process-tree',
    goal: 'Run exactly `node tools/long-process.mjs parent` in this workspace. Wait for the command to finish. Do not change the source files.',
    context: [], permission: 'workspace-write', approval: 'never', maxDurationMs: 90_000 });
  const readPid = async (role) => Number(await readFile(join(workspace.rootPath, `${role}.pid`), 'utf8'));
  const deadline = Date.now() + 60_000;
  let pids;
  while (Date.now() < deadline) {
    try { pids = await Promise.all(['parent', 'child', 'grandchild'].map(readPid));
      if (pids.every(Number.isInteger)) break;
    } catch { /* command has not reached all descendants */ }
    await delay(100);
  }
  assert.ok(pids?.every(Number.isInteger), 'Codex did not launch the fixture process tree');
  const appServerPid = controller.inspectRun('spike-owned-codex')[0]?.pid;
  assert.ok(appServerPid, 'Codex app-server is not registered as an owned process');
  const groupOf = (pid) => Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim());
  const processGroups = pids.map(groupOf);
  let heartbeat;
  while (Date.now() < deadline) {
    try { heartbeat = await readFile(join(workspace.rootPath, 'heartbeat.txt'), 'utf8'); break; }
    catch { await delay(100); }
  }
  assert.ok(heartbeat, 'Grandchild heartbeat did not start');
  await assert.rejects(manager.release(workspace.workspaceId, { discardChanges: true }), /active owned processes/);
  const released = await resources.cancelAndRelease(handle, acquired, true, async () => {
    assert.equal(controller.hasActive('spike-owned-codex'), false);
    heartbeat = await readFile(join(workspace.rootPath, 'heartbeat.txt'), 'utf8');
    await delay(600);
    const after = await readFile(join(workspace.rootPath, 'heartbeat.txt'), 'utf8');
    assert.equal(after, heartbeat, 'Descendant continued writing after cancellation');
    const exited = (pid) => {
      try { process.kill(pid, 0); return false; }
      catch (error) { if (error.code === 'ESRCH') return true; throw error; }
    };
    for (let attempt = 0; attempt < 30 && !pids.every(exited); attempt += 1) await delay(100);
    assert.ok(pids.every(exited), 'Codex descendants survived cancellation');
  });
  assert.equal(await handle.completion, 'cancelled');
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }), sourceBefore);
  assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceBase);
  assert.equal(released.status, 'released');
  console.log(JSON.stringify({ cancelled: true, ownedProcessesStopped: true, appServerPid, pids, processGroups,
    sourceUnchanged: true, baseRevision: sourceBase, workspaceReleased: true,
    eventTypes: [...new Set(events.map((event) => event.type))] }));
} finally {
  if (handle) await handle.dispose().catch(() => {});
  await registry.dispose().catch(() => {});
  await controller.dispose().catch(() => {});
  await manager.dispose();
  await rm(parent, { recursive: true, force: true });
}
