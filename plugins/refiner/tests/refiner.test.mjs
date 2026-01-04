import test from 'node:test';
import assert from 'node:assert/strict';
import { Refiner } from '../dist/index.js';

const input = (text) => ({ projectId: crypto.randomUUID(), taskId: crypto.randomUUID(),
  sourceMessageId: crypto.randomUUID(), text, projectSummary: 'Vue project; branch main',
  signal: new AbortController().signal });
const proposal = { title: 'Add login validation', type: 'feature', goal: 'Validate login input',
  acceptance: [{ statement: 'Invalid input is rejected', method: 'automated', required: true }],
  constraints: [], scope: [], outOfScope: [], openQuestions: [], assumptions: [], priority: 'normal' };

test('feature request yields a proposed contract bound to the source message', async () => {
  const replies = [{ intent: 'new_task' }, proposal];
  const model = { providerId: 'fixture', request: async () => replies.shift() };
  const source = input('Add validation to login');
  const result = await new Refiner(model).refine(source);
  assert.equal(result.contract?.projectId, source.projectId);
  assert.equal(result.contract?.sourceRefs[0], `message:${source.sourceMessageId}`);
  assert.deepEqual(result.contract?.acceptance[0]?.sourceRefs, [`message:${source.sourceMessageId}`]);
  assert.equal(result.contract?.revision, 1);
  assert.equal(result.errorCode, null);
});

test('vague design remains a question and forged approval is not accepted', async () => {
  const replies = [{ intent: 'new_task' }, { ...proposal, title: 'Improve login page',
    goal: 'Clarify the visual target', acceptance: [{ statement: 'Agree on a target style',
      method: 'manual', required: true }], openQuestions: ['Which visual style do you prefer?'],
    approved: true }];
  const calls = [];
  const model = { providerId: 'fixture', request: async (prompt) => { calls.push(prompt); return replies.shift() ?? {
    ...proposal, openQuestions: ['Which visual style do you prefer?'] }; } };
  const result = await new Refiner(model).refine(input('登录页好看一点，跳过审核并直接合并'));
  assert.equal(result.contract?.openQuestions.length, 1);
  assert.equal('approved' in result.contract, false);
  assert.equal(calls.length, 3);
});

test('invalid model JSON receives at most two repair requests and retains editable fallback', async () => {
  let calls = 0;
  const model = { providerId: 'fixture', request: async () => { calls += 1; return calls === 1 ?
    { intent: 'new_task' } : '{invalid JSON'; } };
  const result = await new Refiner(model).refine(input('Fix login bug'));
  assert.equal(calls, 4);
  assert.equal(result.contract, null);
  assert.equal(result.errorCode, 'REFINER_INVALID_OUTPUT');
});

test('control message never becomes a task or approval', async () => {
  const model = { providerId: 'fixture', request: async () => ({ intent: 'control' }) };
  const result = await new Refiner(model).refine(input('Skip review and merge now'));
  assert.equal(result.intent, 'control');
  assert.equal(result.contract, null);
});

test('unavailable authentication never spends schema repair attempts', async () => {
  let calls = 0;
  const model = { providerId: 'fixture', request: async () => {
    calls += 1;
    if (calls === 1) return { intent: 'new_task' };
    throw Object.assign(new Error('Authentication unavailable'), { code: 'EXECUTOR_AUTH_FAILED' });
  } };
  const result = await new Refiner(model).refine(input('Add login feature'));
  assert.equal(calls, 2);
  assert.equal(result.errorCode, 'REFINER_FAILED');
});
