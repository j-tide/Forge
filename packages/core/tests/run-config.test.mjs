import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { freezeRunConfig, verifyRunConfig } from '../dist/run-config.js';

function fixture() {
  const projectId = randomUUID(); const taskId = randomUUID(); const environmentId = randomUUID();
  const contract = { schemaVersion: '1.0', projectId, taskId, revision: 2,
    title: 'Change search', type: 'feature', goal: 'Filter results',
    acceptance: [{ id: 'ac1', statement: 'Filters correctly', method: 'manual',
      required: true, sourceRefs: [] }], constraints: [], scope: [], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [],
    workflowRef: 'standard', priority: 'normal' };
  const environment = { environmentId, projectId, name: 'Default',
    config: { commandPresetIds: [], envRefs: ['TEST_TOKEN_REF'], networkMode: 'trusted-local' },
    revision: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archivedAt: null };
  const selection = { runId: randomUUID(), projectId, taskId, expectedTaskRevision: 2,
    workflow: { id: 'standard', version: '1.0', contentHash: 'a'.repeat(64) },
    profile: { id: 'developer', version: '1.0', contentHash: 'b'.repeat(64),
      executorPluginId: 'executor.codex' },
    plugins: [{ id: 'executor.codex', version: '0.155.1', contentHash: 'c'.repeat(64) }],
    budget: { maxDurationMs: 30_000, maxTurns: 5, maxTokens: 10_000, maxToolCalls: 20 },
    environmentId, expectedEnvironmentRevision: 3 };
  return { contract, environment, selection };
}

test('freeze captures contract, version locks, budget and environment independently of later settings', () => {
  const { contract, environment, selection } = fixture();
  const snapshot = freezeRunConfig(selection, contract, environment, new Date('2026-01-01T00:00:00Z'));
  environment.config.envRefs.push('LATER_REF'); selection.budget.maxTurns = 8;
  contract.goal = 'Changed after freeze';
  assert.equal(snapshot.environment.config.envRefs.length, 1);
  assert.equal(snapshot.budget.maxTurns, 5);
  assert.equal(snapshot.taskContract.goal, 'Filter results');
  assert.deepEqual(verifyRunConfig(snapshot), snapshot);
  assert.throws(() => verifyRunConfig({ ...snapshot, budget: { ...snapshot.budget, maxTurns: 999 } }),
    { code: 'RUN_CONFIG_INVALID' });
});

test('freeze rejects stale inputs and unbound workflow or plugin', () => {
  const { contract, environment, selection } = fixture();
  assert.throws(() => freezeRunConfig({ ...selection, expectedEnvironmentRevision: 2 }, contract, environment),
    { code: 'RUN_CONFIG_STALE' });
  assert.throws(() => freezeRunConfig({ ...selection, workflow: { ...selection.workflow, id: 'other' } },
    contract, environment), { code: 'RUN_CONFIG_INVALID' });
  assert.throws(() => freezeRunConfig({ ...selection, plugins: [] }, contract, environment),
    { code: 'RUN_CONFIG_INVALID' });
});
