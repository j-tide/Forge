import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HostExecutorRegistry } from '../../../apps/host/dist/executors.js';
import { HostRunResources } from '../../../apps/host/dist/run-resources.js';
import { HostRunScheduler } from '../../../apps/host/dist/run-scheduler.js';
import { ProjectService } from '../../../apps/host/dist/projects.js';
import { projectTrustVersion } from '../../../packages/contracts/dist/index.js';
import { buildContextBundle, executorContext } from '../../../packages/core/dist/context.js';
import { ForgePersistence } from '../../../packages/persistence/dist/index.js';
import { ProcessController } from '../../../packages/process/dist/index.js';
import { WorkspaceManager } from '../../../packages/workspace/dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const parent = await mkdtemp(join(tmpdir(), 'forge-p2-cancel-codex-'));
const source = join(parent, 'source project 中文 with spaces');
const canary = join(parent, 'outside-workspace.txt');
const runId = randomUUID();
const runtimeId = randomUUID();
const controller = new ProcessController(runtimeId, join(parent, 'process-records'));
const manager = new WorkspaceManager(join(parent, 'private workspaces'), runtimeId,
  (id) => controller.hasActive(id));
const registry = new HostExecutorRegistry(controller);
const resources = new HostRunResources(registry, manager, controller);
const dataDir = join(parent, 'data');
const storage = new ForgePersistence(dataDir);
try {
  await mkdir(source);
  await cp(fixture, source, { recursive: true });
  await writeFile(canary, 'outside unchanged\n');
  await writeFile(join(source, 'nested-worker.cjs'), `const { spawn } = require('node:child_process');\nconst { appendFileSync } = require('node:fs');\nconst depth = Number(process.argv[2]);\nif (depth > 0) spawn(process.execPath, [__filename, String(depth - 1), process.argv[3]], { stdio: 'ignore' });\nsetInterval(() => appendFileSync(process.argv[3], String(depth)), 70);\n`);
  execFileSync('git', ['init', '-q', source]);
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Forge Fixture',
    '-c', 'user.email=forge-fixture@example.invalid', 'commit', '-qm', 'baseline']);
  const sourceHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceStatus = execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' });
  await storage.open(); storage.migrate();
  const projects = new ProjectService(storage);
  const probe = await projects.probe(source);
  const project = await projects.create(source, probe.fingerprint, projectTrustVersion, true, 0);
  const conversation = storage.createConversation(project.projectId, 'Live Run fixture', 0);
  const message = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Validate add inputs and test it', attachmentIds: [] }).message;
  const draft = storage.beginTaskDraft({ projectId: project.projectId,
    conversationId: conversation.conversationId, sourceMessageId: message.messageId,
    idempotencyKey: randomUUID() }, 'generating', 'fixture');
  const ref = `message:${message.messageId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 1, title: 'Cancel a long command', type: 'feature', goal: 'In this isolated fixture workspace, run node nested-worker.cjs 2 heartbeat.txt as a foreground command. It is intentionally long-running. Wait for it to finish before editing files.',
    acceptance: [{ id: 'ac1', statement: 'Invalid numbers throw TypeError', method: 'automated',
      required: true, sourceRefs: [ref] }], constraints: [], scope: ['src', 'tests'], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [ref],
    workflowRef: 'standard', priority: 'normal' };
  storage.finishTaskDraft(project.projectId, draft.draftId,
    { intent: 'new_task', contract, errorCode: null });
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  storage.decideTaskApproval({ projectId: project.projectId, decision: {
    schemaVersion: '1.0', approvalId: approval.request.approvalId,
    decision: 'approve', expectedRevision: 1, scopeHash: approval.request.scopeHash, reason: '' } });
  const config = storage.createRunConfig({ runId, projectId: project.projectId,
    taskId: draft.draftId, expectedTaskRevision: 1,
    workflow: { id: 'standard', version: 'fixture-v1', contentHash: 'a'.repeat(64) },
    profile: { id: 'developer', version: 'fixture-v1', contentHash: 'b'.repeat(64),
      executorPluginId: 'executor.codex' },
    plugins: [{ id: 'executor.codex', version: '0.155.1', contentHash: 'c'.repeat(64) }],
    budget: { maxDurationMs: 180_000, maxTurns: 10, maxTokens: 50_000, maxToolCalls: 100 },
    environmentId: project.environmentId, expectedEnvironmentRevision: 1 });
  const bundle = storage.saveContextBundle(buildContextBundle(config, null));
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
  const attemptId = randomUUID();
  const intent = { runId, projectId: project.projectId, taskId: draft.draftId, attemptId,
    workspaceId: workspace.workspaceId, workspaceLeaseId: workspace.activeLeaseId,
    leaseEpoch: workspace.leaseEpoch, baseRevision: workspace.baseRevision,
    nodeId: 'develop', executorId: 'executor.codex', configHash: config.snapshotHash,
    createdAt: new Date().toISOString() };
  const scheduler = new HostRunScheduler(storage, resources, manager, controller, registry);
  const execution = scheduler.execute(intent, workspace, {
    runId, taskId: draft.draftId, goal: bundle.goal,
    context: executorContext(bundle), permission: 'workspace-write', approval: 'never',
    model, maxDurationMs: 180_000,
    attempt: { attemptId, leaseEpoch: workspace.leaseEpoch,
      workspaceLeaseId: workspace.activeLeaseId, contractRevision: 1,
      contextBundleId: bundle.bundleId, profileRevision: 1,
      outputSchemaId: 'plain-text-v1' },
  });
  void execution.catch(() => {});
  const heartbeat = join(workspace.rootPath, 'heartbeat.txt');
  let before = '';
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    before = await readFile(heartbeat, 'utf8').catch(() => '');
    if (before.includes('0') && before.includes('1') && before.includes('2')) break;
    const state = storage.getRun(project.projectId, runId)?.state;
    if (['succeeded', 'failed', 'interrupted', 'cancelled'].includes(state)) {
      throw new Error(`Codex run ended before long command started: ${state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(before.includes('0') && before.includes('1') && before.includes('2'),
    'Codex did not start the real nested long-running command');
  assert.equal(storage.getRun(project.projectId, runId).state, 'running');
  const first = scheduler.cancel(project.projectId, runId);
  assert.equal(first, scheduler.cancel(project.projectId, runId));
  assert.equal(storage.getRun(project.projectId, runId).state, 'canceling');
  const cancelled = await first;
  const executed = await execution;
  assert.equal(executed.state, 'cancelled');
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.attempt.state, 'cancelled');
  assert.equal(controller.hasActive(runId), false);
  assert.equal(manager.inspect(workspace.workspaceId).status, 'ready');
  const stopped = await readFile(heartbeat, 'utf8');
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(await readFile(heartbeat, 'utf8'), stopped,
    'Codex command descendants continued to write after cancelled');
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'],
    { encoding: 'utf8' }), sourceStatus);
  assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim(), sourceHead);
  assert.equal(await readFile(canary, 'utf8'), 'outside unchanged\n');
  const inspection = storage.inspectRun(project.projectId, runId, 0, 100);
  assert.equal(inspection.run.state, 'cancelled');
  assert.ok(events.some((event) => event.type === 'command.started'));
  assert.ok(events.some((event) => event.type === 'run.cancelled'));
  storage.close();
  const reopened = new ForgePersistence(dataDir); await reopened.open(); reopened.migrate();
  assert.equal(reopened.getRun(project.projectId, runId).state, 'cancelled');
  reopened.close();
  await manager.release(workspace.workspaceId, { discardChanges: true });
  console.log(JSON.stringify({ result: 'pass', model, runState: cancelled.state,
    processTreeStopped: true, noFurtherWrites: true, sourceUnchanged: true,
    workspaceReleased: true, observedEvents: inspection.observations.length,
    eventTypes: [...new Set(events.map((event) => event.type))] }));
} finally {
  storage.close();
  await registry.dispose().catch(() => {});
  await controller.dispose().catch(() => {});
  await manager.dispose().catch(() => {});
  await rm(parent, { recursive: true, force: true });
}
