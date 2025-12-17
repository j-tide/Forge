import assert from 'node:assert/strict';
import { HostExecutorRegistry } from '../../../apps/host/dist/executors.js';

const [mode, workspace, previousSessionId] = process.argv.slice(2);
assert.ok(mode === 'start' || mode === 'resume');
assert.ok(workspace);
const registry = new HostExecutorRegistry();
try {
  const events = [];
  registry.onEvent((event) => events.push(event));
  const handle = await registry.start('executor.codex', {
    runId: `spike-process-${mode}`, taskId: 'fixture-resume', workspace,
    goal: mode === 'start'
      ? 'Read package.json and remember its exact package name. Do not modify files.'
      : 'Continue the earlier thread. What exact package name did you read? Verify it against package.json. Do not modify files.',
    context: [], permission: 'read-only', approval: 'never', maxDurationMs: 90_000,
    ...(previousSessionId ? { providerSessionId: previousSessionId } : {}),
  });
  assert.equal(await handle.completion, 'completed');
  assert.ok(events.some((event) => event.type === 'assistant.message'));
  console.log(JSON.stringify({ pid: process.pid, providerSessionId: handle.providerSessionId,
    eventCount: events.length, outcome: 'completed' }));
} finally { await registry.dispose(); }
