import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HostExecutorRegistry } from '../../../apps/host/dist/executors.js';
import { HostRunResources } from '../../../apps/host/dist/run-resources.js';
import { ProcessController } from '../../../packages/process/dist/index.js';
import { WorkspaceManager } from '../../../packages/workspace/dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const parent = await mkdtemp(join(tmpdir(), 'forge-p2-scheduled-codex-'));
const source = join(parent, 'source project 中文 with spaces');
const canary = join(parent, 'outside-workspace.txt');
const runId = randomUUID();
const runtimeId = randomUUID();
const controller = new ProcessController(runtimeId, join(parent, 'process-records'));
const manager = new WorkspaceManager(join(parent, 'private workspaces'), runtimeId,
  (id) => controller.hasActive(id));
const registry = new HostExecutorRegistry(controller);
const resources = new HostRunResources(registry, manager, controller);
let handle;
try {
  await mkdir(source);
  await cp(fixture, source, { recursive: true });
  await writeFile(canary, 'outside unchanged\n');
  execFileSync('git', ['init', '-q', source]);
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Forge Fixture',
    '-c', 'user.email=forge-fixture@example.invalid', 'commit', '-qm', 'baseline']);
  const sourceHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceStatus = execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' });
  await manager.open();
  const created = await manager.create({ sourceRepo: source, ownerRunId: runId, mode: 'task-branch' });
  const workspace = await manager.acquire(created.workspaceId, runId);
  const capability = await registry.resolve('executor.codex').probe();
  assert.equal(capability.available, true, `Codex unavailable: ${capability.warnings.join('; ')}`);
  assert.equal(capability.workspaceControl, true, 'Codex workspace control has no matching live evidence');
  const model = capability.modelIds.includes('gpt-6-luna') ? 'gpt-6-luna' : capability.modelIds[0];
  assert.ok(model, 'Codex did not report an available model');
  const events = [];
  registry.onEvent((event) => events.push(event));
  handle = await resources.startScheduled('executor.codex', workspace, {
    runId, taskId: 'fixture-add', goal: 'Only in this fixture workspace, change src/add.js so add(a,b) rejects non-number and non-finite inputs with TypeError. Add tests for invalid inputs in tests/add.test.mjs. Run npm test. Do not access the parent directory or network.',
    context: [], permission: 'workspace-write', approval: 'never', model, maxDurationMs: 180_000,
    attempt: { attemptId: randomUUID(), leaseEpoch: workspace.leaseEpoch,
      workspaceLeaseId: workspace.activeLeaseId, contractRevision: 1,
      contextBundleId: 'fixture-context-v1', profileRevision: 1,
      outputSchemaId: 'plain-text-v1' },
  });
  assert.equal(await handle.completion, 'completed');
  const code = await readFile(join(workspace.rootPath, 'src/add.js'), 'utf8');
  assert.match(code, /TypeError/);
  const testOutput = execFileSync('npm', ['test'], { cwd: workspace.rootPath, encoding: 'utf8' });
  assert.match(testOutput, /pass/);
  const changedFiles = execFileSync('git', ['-C', workspace.rootPath, 'status', '--porcelain'],
    { encoding: 'utf8' }).trimEnd().split('\n').filter(Boolean).map((line) => line.slice(3)).sort();
  assert.deepEqual(changedFiles, ['src/add.js', 'tests/add.test.mjs']);
  assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHead);
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }), sourceStatus);
  assert.equal(await readFile(canary, 'utf8'), 'outside unchanged\n');
  const types = new Set(events.map((event) => event.type));
  for (const required of ['run.started', 'assistant.message', 'command.started',
    'command.completed', 'file.changed', 'run.completed']) assert.ok(types.has(required), `${required} missing`);
  assert.ok(events.every((event, index) => event.runId === runId && event.sequence === index + 1));
  assert.equal(events.at(-1).providerSessionId, handle.providerSessionId);
  await manager.release(workspace.workspaceId, { discardChanges: true });
  console.log(JSON.stringify({ result: 'pass', model, sessionRefPresent: Boolean(handle.providerSessionId),
    eventTypes: [...types], eventCount: events.length, changedFiles,
    sourceHead, sourceUnchanged: true, fixtureTestsPassed: true }));
} finally {
  await handle?.dispose().catch(() => {});
  await registry.dispose().catch(() => {});
  await controller.dispose().catch(() => {});
  await manager.dispose().catch(() => {});
  await rm(parent, { recursive: true, force: true });
}
