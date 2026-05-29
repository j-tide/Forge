import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { runConfigSelectionSchema, runConfigSnapshotSchema } from '../dist/index.js';

const selection = { runId: randomUUID(), projectId: randomUUID(), taskId: randomUUID(),
  expectedTaskRevision: 1, workflow: { id: 'standard', version: '1.0', contentHash: 'a'.repeat(64) },
  profile: { id: 'developer', version: '1.0', contentHash: 'b'.repeat(64),
    executorPluginId: 'executor.codex' },
  plugins: [{ id: 'executor.codex', version: '0.155.1', contentHash: 'c'.repeat(64) }],
  budget: { maxDurationMs: 30_000, maxTurns: 5, maxTokens: 10_000, maxToolCalls: 20 },
  environmentId: randomUUID(), expectedEnvironmentRevision: 1 };

test('RunConfig selection is strict, versioned and contains no raw secret slot', () => {
  assert.deepEqual(runConfigSelectionSchema.parse(selection), selection);
  assert.equal(runConfigSelectionSchema.safeParse({ ...selection, apiKey: 'secret' }).success, false);
  assert.equal(runConfigSelectionSchema.safeParse({ ...selection,
    budget: { ...selection.budget, maxTurns: 0 } }).success, false);
  assert.equal(runConfigSelectionSchema.safeParse({ ...selection,
    plugins: [{ ...selection.plugins[0], contentHash: 'invalid' }] }).success, false);
  assert.equal(runConfigSnapshotSchema.safeParse({ ...selection, snapshotHash: 'a'.repeat(64) }).success, false);
});
