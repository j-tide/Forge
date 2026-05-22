import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexExecutorAdapter } from '../dist/index.js';

const home = await mkdtemp(join(tmpdir(), 'forge-codex-noauth-'));
const original = process.env.CODEX_HOME;
process.env.CODEX_HOME = home;
const adapter = new CodexExecutorAdapter();
try {
  const capabilities = await adapter.probe();
  assert.equal(capabilities.available, false);
  await assert.rejects(adapter.start({ runId: 'noauth', taskId: 'noauth', workspace: home,
    goal: 'Read files', context: [], permission: 'read-only', approval: 'never', maxDurationMs: 10_000 }),
  (error) => error.code === 'EXECUTOR_AUTH_FAILED');
  console.log(JSON.stringify({ available: capabilities.available, error: 'EXECUTOR_AUTH_FAILED' }));
} finally {
  await adapter.dispose();
  if (original === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = original;
  await rm(home, { recursive: true, force: true });
}
