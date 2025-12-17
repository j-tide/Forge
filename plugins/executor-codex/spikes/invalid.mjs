import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexExecutorAdapter } from '../dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'forge-codex-invalid-'));
const adapter = new CodexExecutorAdapter();
try {
  const request = { runId: 'spike-invalid', taskId: 'fixture', workspace: root,
    goal: 'Read package.json', context: [], permission: 'read-only', approval: 'never', maxDurationMs: 10_000 };
  await assert.rejects(adapter.start({ ...request, workspace: join(root, 'missing') }),
    (error) => error.code === 'EXECUTOR_WORKSPACE_ERROR');
  await assert.rejects(adapter.start({ ...request, model: 'not-a-codex-model' }),
    (error) => error.code === 'EXECUTOR_UNSUPPORTED_CAPABILITY');
  console.log(JSON.stringify({ invalidWorkspace: 'EXECUTOR_WORKSPACE_ERROR', invalidModel: 'EXECUTOR_UNSUPPORTED_CAPABILITY' }));
} finally { await adapter.dispose(); await rm(root, { recursive: true, force: true }); }
