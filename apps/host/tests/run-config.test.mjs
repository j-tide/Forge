import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { projectTrustVersion } from '@forge/contracts';
import { ForgePersistence } from '@forge/persistence';
import { ProjectService } from '../dist/projects.js';

const Database = createRequire(new URL('../../../packages/persistence/package.json', import.meta.url))('better-sqlite3');

async function approvedFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'forge-run-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'project with spaces'); await mkdir(source);
  const data = join(root, 'data');
  const storage = new ForgePersistence(data); await storage.open(); storage.migrate();
  t.after(() => storage.close());
  const projects = new ProjectService(storage);
  const probe = await projects.probe(source);
  const project = await projects.create(source, probe.fingerprint, projectTrustVersion, true, 0);
  const conversation = storage.createConversation(project.projectId, 'RunConfig source', 0);
  const message = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Implement input validation', attachmentIds: [] }).message;
  const draft = storage.beginTaskDraft({ projectId: project.projectId,
    conversationId: conversation.conversationId, sourceMessageId: message.messageId,
    idempotencyKey: randomUUID() }, 'generating', 'fixture');
  const ref = `message:${message.messageId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 1, title: 'Input validation', type: 'feature', goal: 'Reject invalid input',
    acceptance: [{ id: 'ac1', statement: 'Invalid input yields an error', method: 'automated',
      required: true, sourceRefs: [ref] }], constraints: [], scope: ['src'], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [ref],
    workflowRef: 'standard', priority: 'normal' };
  storage.finishTaskDraft(project.projectId, draft.draftId,
    { intent: 'new_task', contract, errorCode: null });
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  storage.decideTaskApproval({ projectId: project.projectId, decision: {
    schemaVersion: '1.0', approvalId: approval.request.approvalId, decision: 'approve',
    expectedRevision: 1, scopeHash: approval.request.scopeHash, reason: '' } });
  const selection = { runId: randomUUID(), projectId: project.projectId, taskId: draft.draftId,
    expectedTaskRevision: 1,
    workflow: { id: 'standard', version: '1.0', contentHash: 'a'.repeat(64) },
    profile: { id: 'developer', version: '1.0', contentHash: 'b'.repeat(64),
      executorPluginId: 'executor.codex' },
    plugins: [{ id: 'executor.codex', version: '0.155.1', contentHash: 'c'.repeat(64) }],
    budget: { maxDurationMs: 30_000, maxTurns: 5, maxTokens: 10_000, maxToolCalls: 20 },
    environmentId: project.environmentId, expectedEnvironmentRevision: 1 };
  return { storage, root, data, project, draft, selection };
}

test('approved Task RunConfig is immutable across settings changes and Host restart', async (t) => {
  const { storage, root, data, project, selection } = await approvedFixture(t);
  const frozen = storage.createRunConfig(selection);
  assert.equal(frozen.taskContract.taskId, selection.taskId);
  assert.equal(frozen.environment.revision, 1);
  assert.equal(frozen.budget.maxTurns, 5);
  assert.equal(storage.getRunConfig(randomUUID(), selection.runId), null);
  const changed = storage.saveEnvironment({ projectId: project.projectId,
    environmentId: project.environmentId, expectedRevision: 1, name: 'Renamed',
    config: { commandPresetIds: [], envRefs: ['NEW_SECRET_REF'], networkMode: 'trusted-local' } });
  assert.equal(changed.revision, 2);
  assert.deepEqual(storage.createRunConfig(selection), frozen);
  assert.deepEqual(storage.getRunConfig(project.projectId, selection.runId), frozen);
  assert.throws(() => storage.createRunConfig({ ...selection, budget: { ...selection.budget, maxTurns: 9 } }),
    { code: 'RUN_CONFIG_CONFLICT' });
  assert.throws(() => storage.createRunConfig({ ...selection, runId: randomUUID() }),
    { code: 'RUN_CONFIG_STALE' });
  const db = new Database(join(root, 'data', 'forge.sqlite'));
  assert.throws(() => db.prepare('UPDATE run_config_snapshots SET snapshot_hash=? WHERE run_id=?')
    .run('f'.repeat(64), selection.runId), /immutable/);
  assert.throws(() => db.prepare('DELETE FROM run_config_snapshots WHERE run_id=?')
    .run(selection.runId), /immutable/);
  db.close(); storage.close();
  const reopened = new ForgePersistence(data); await reopened.open(); reopened.migrate();
  assert.deepEqual(reopened.getRunConfig(project.projectId, selection.runId), frozen);
  reopened.close();
});

test('RunConfig cannot be frozen from a nonexistent, cross-project or mismatched Task', async (t) => {
  const { storage, project, selection } = await approvedFixture(t);
  assert.throws(() => storage.createRunConfig({ ...selection, taskId: randomUUID() }),
    { code: 'RUN_CONFIG_NOT_FOUND' });
  assert.throws(() => storage.createRunConfig({ ...selection, projectId: randomUUID() }),
    { code: 'RUN_CONFIG_NOT_FOUND' });
  assert.throws(() => storage.createRunConfig({ ...selection, expectedTaskRevision: 2 }),
    { code: 'RUN_CONFIG_STALE' });
  assert.throws(() => storage.createRunConfig({ ...selection, workflow: {
    ...selection.workflow, id: 'different' } }), { code: 'RUN_CONFIG_INVALID' });
  assert.equal(storage.getRunConfig(project.projectId, selection.runId), null);
});
