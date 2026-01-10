import test from 'node:test';
import assert from 'node:assert/strict';
import { boardCounts, filterBoardTasks, uniqueBoardEvents } from '../dist/task-projection.js';

const card = (id, boardColumn, priority = 'normal', executorId = null) => ({
  id, projectId: 'project', title: `Task ${id}`, boardColumn, priority, executorId,
  position: 0,
});

test('board filtering preserves source tasks and counts across status, priority and executor', () => {
  const original = [card('one', 'todo', 'high'), card('two', 'review', 'normal', 'codex'),
    card('three', 'done', 'high', 'codex')];
  assert.deepEqual(boardCounts(original), { todo: 1, development: 0, review: 1,
    verify: 0, done: 1 });
  const filtered = filterBoardTasks(original, { search: '', state: 'all', priority: 'high',
    executorId: 'codex' });
  assert.deepEqual(filtered.map((item) => item.id), ['three']);
  assert.equal(original.length, 3);
  assert.deepEqual(filterBoardTasks(original, { search: 'TASK TWO', state: 'review',
    priority: 'all', executorId: 'all' }).map((item) => item.id), ['two']);
});

test('event replay with the same event ID contributes once in sequence order', () => {
  assert.deepEqual(uniqueBoardEvents([{ eventId: 'a', seq: 2 }, { eventId: 'a', seq: 2 },
    { eventId: 'b', seq: 1 }]).map((item) => item.eventId), ['b', 'a']);
});
