import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ProcessController } from '../packages/process/dist/index.js';
import { Refiner } from '../plugins/refiner/dist/index.js';
import { CodexRefinerModel } from '../apps/host/dist/refiner-model.js';

const model = new CodexRefinerModel(new ProcessController());
const refiner = new Refiner(model);
try {
  const scenarios = [
    { text: 'Add a feature: allow filtering the order list by date; include an automated test.', type: 'feature' },
    { text: 'Fix the bug where an empty login email passes validation; add a regression test.', type: 'bug' },
    { text: '登录页好看一点', vague: true },
  ];
  for (const scenario of scenarios.filter((item) => !process.argv[2] || item.vague === (process.argv[2] === 'vague'))) {
    const result = await refiner.refine({ projectId: randomUUID(), taskId: randomUUID(),
      sourceMessageId: randomUUID(), text: scenario.text,
      projectSummary: 'Small TypeScript fixture. No file paths or source code supplied.',
      signal: new AbortController().signal });
    assert.equal(result.errorCode, null, JSON.stringify(result));
    assert.ok(result.contract, JSON.stringify(result));
    if (scenario.type) assert.equal(result.contract.type, scenario.type);
    if (scenario.vague) assert.ok(result.contract.openQuestions.length > 0,
      'Vague request must retain clarification question');
    assert.equal('approved' in result.contract, false);
    console.log(JSON.stringify({ input: scenario.text, intent: result.intent,
      type: result.contract.type, openQuestions: result.contract.openQuestions,
      acceptanceCount: result.contract.acceptance.length }));
  }
} finally { await model.dispose(); }
