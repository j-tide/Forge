import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexExecutorAdapter } from '../dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const root = await mkdtemp(join(tmpdir(), 'forge-codex-json-'));
const adapter = new CodexExecutorAdapter();
try {
  await cp(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  const model = (await adapter.probe()).modelIds[0];
  assert.ok(model);
  const handle = await adapter.start({ runId: 'spike-structured', taskId: 'fixture', workspace: root,
    goal: 'Read package.json and return the exact package name in JSON. Do not modify files.',
    context: [], permission: 'read-only', approval: 'never', model, maxDurationMs: 90_000,
    outputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } });
  let result = null;
  handle.subscribe((event) => { if (event.type === 'run.completed') result = event.structuredOutput; });
  assert.equal(await handle.completion, 'completed');
  assert.equal(result.name, 'forge-codex-spike-fixture');
  console.log(JSON.stringify({ model, structuredOutput: result, providerSessionId: handle.providerSessionId }));
} finally { await adapter.dispose(); await rm(root, { recursive: true, force: true }); }
