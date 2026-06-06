import test from 'node:test';
import assert from 'node:assert/strict';
import { taskSourceRefs } from '../dist/task-queries.js';

test('task source refs include every acceptance source exactly once in stable order', () => {
  const contract = { sourceRefs: ['message:original'], acceptance: [
    { sourceRefs: ['message:original', 'decision:scope'] },
    { sourceRefs: ['decision:scope', 'decision:method'] },
  ] };
  assert.deepEqual(taskSourceRefs(contract), [
    'message:original', 'decision:scope', 'decision:method',
  ]);
});
