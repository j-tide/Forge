import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, connect } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ProcessController, processDescriptorSchema } from '../dist/index.js';

const script = join(dirname(fileURLToPath(import.meta.url)), 'fixture', 'chain.mjs');
const unsupported = process.platform === 'win32' ? 'Windows process-tree backend is not implemented or verified' : false;

function ready(stream) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('Process fixture did not start')), 5000);
    stream.on('data', (chunk) => {
      text += chunk.toString();
      const lines = text.split('\n');
      text = lines.pop() ?? '';
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.role === 'grandchild') { clearTimeout(timer); resolve(data); }
      }
    });
  });
}

function reachable(port) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

function bindable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

test('owned tree cancellation preserves another Run and a non-Forge user process', { timeout: 20000, skip: unsupported }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-process-'));
  const owner = new ProcessController(randomUUID(), join(dir, 'records'), 150, 2000);
  const user = spawn(process.execPath, [script, 'grandchild', 'normal'], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const userReady = await ready(user.stdout);
    const a = await owner.spawn({ runId: 'run-A', executable: process.execPath,
      argv: [script, 'parent', 'ignore-term'], cwd: dir });
    const b = await owner.spawn({ runId: 'run-B', executable: process.execPath,
      argv: [script, 'parent', 'normal'], cwd: dir });
    const [aReady, bReady] = await Promise.all([ready(a.stdout), ready(b.stdout)]);
    assert.equal(processDescriptorSchema.parse(a.descriptor).runtimeId, owner.runtimeId);
    assert.ok(await reachable(aReady.port));
    assert.ok(await reachable(bReady.port));
    assert.ok(await reachable(userReady.port));
    const [first, second] = await Promise.all([owner.cancel('run-A'), owner.cancel('run-A')]);
    assert.deepEqual(first, second);
    assert.equal(first.confirmed, true);
    assert.equal(first.forced, true);
    assert.equal(owner.hasActive('run-A'), false);
    assert.equal(await bindable(aReady.port), true);
    assert.equal(await reachable(bReady.port), true);
    assert.equal(await reachable(userReady.port), true);
    assert.equal((await owner.cancel('run-A')).confirmed, true);
    assert.equal((await owner.cancel('run-B')).confirmed, true);
    assert.equal(await bindable(bReady.port), true);
    assert.equal((await owner.inspectOrphans()).length, 0);
    const restarted = new ProcessController(randomUUID(), join(dir, 'records'));
    assert.ok((await restarted.inspectOrphans()).every((record) => record.status !== 'running'));
  } finally {
    await owner.dispose();
    user.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});

test('leader exits before descendant; owned group can still be cancelled', { timeout: 20000, skip: unsupported }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forge-process-orphan-'));
  const controller = new ProcessController(randomUUID(), join(dir, 'records'), 150, 2000);
  try {
    const run = await controller.spawn({ runId: 'orphan-parent', executable: process.execPath,
      argv: [script, 'parent', 'exit-parent'], cwd: dir });
    const grandchild = await ready(run.stdout);
    await run.exit;
    assert.ok(await reachable(grandchild.port));
    assert.equal(controller.hasActive('orphan-parent'), true);
    const restarted = new ProcessController(randomUUID(), join(dir, 'records'));
    const orphans = await restarted.inspectOrphans();
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].runId, 'orphan-parent');
    assert.equal(orphans[0].pid, run.descriptor.pid);
    const report = await controller.cancel('orphan-parent');
    assert.equal(report.confirmed, true);
    assert.equal(await bindable(grandchild.port), true);
  } finally { await controller.dispose(); await rm(dir, { recursive: true, force: true }); }
});

test('rejects unknown identity and preserves argv with spaces and Unicode', { timeout: 20000, skip: unsupported }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'Forge 测试项目 01 '));
  const controller = new ProcessController();
  try {
    await assert.rejects(controller.terminate(randomUUID()), /Unknown process identity/);
    const value = '中文 path with spaces';
    const run = await controller.spawn({ runId: 'argv-test', executable: process.execPath,
      argv: ['-e', 'console.log(process.argv[1])', value], cwd: dir });
    let output = '';
    for await (const chunk of run.stdout) output += chunk;
    assert.equal(output.trim(), value);
    assert.equal((await run.exit).code, 0);
    assert.equal((await controller.cancel('argv-test')).confirmed, true);
  } finally { await controller.dispose(); await rm(dir, { recursive: true, force: true }); }
});
