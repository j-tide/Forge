import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexExecutorAdapter } from '../dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const root = await mkdtemp(join(tmpdir(), 'forge-codex-life-'));
const adapter = new CodexExecutorAdapter();
try {
  await cp(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  const run = await adapter.start({ runId: 'spike-cancel', taskId: 'fixture-cancel', workspace: root,
    goal: 'Run the exact shell command `sleep 45` in this fixture workspace, wait for it to finish, then write `finished.txt`. Do not skip the wait.',
    context: [], permission: 'workspace-write', approval: 'never', maxDurationMs: 90_000 });
  const events = [];
  let commandStarted;
  const command = new Promise((resolve) => { commandStarted = resolve; });
  run.subscribe((event) => { events.push(event); if (event.type === 'command.started' && event.command.includes('sleep')) commandStarted(); });
  await Promise.race([command, new Promise((_, reject) => setTimeout(() => reject(new Error('sleep command did not start')), 60_000))]);
  await run.cancel();
  const outcome = await run.completion;
  assert.equal(outcome, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  await assert.rejects(access(join(root, 'finished.txt')));
  const newAdapter = new CodexExecutorAdapter();
  try {
    const resumed = await newAdapter.start({ runId: 'spike-resume', taskId: 'fixture-cancel', workspace: root,
      goal: 'Read src/add.js and state what the add function returns. Do not modify files.',
      context: [], permission: 'read-only', approval: 'never', maxDurationMs: 90_000,
      providerSessionId: run.providerSessionId });
    const resumeEvents = [];
    resumed.subscribe((event) => resumeEvents.push(event));
    assert.equal(await resumed.completion, 'completed');
    assert.equal(resumed.providerSessionId, run.providerSessionId);
    assert.match(await readFile(join(root, 'src', 'add.js'), 'utf8'), /return a \+ b/);
    console.log(JSON.stringify({ cancel: outcome, commandStarted: true,
      cancelledEvent: events.some((event) => event.type === 'run.cancelled'),
      noPostCancelFileChange: true, resumedAcrossConnection: true,
      resumeEvents: [...new Set(resumeEvents.map((event) => event.type))] }, null, 2));
  } finally { await newAdapter.dispose(); }
} finally {
  await adapter.dispose();
  await rm(root, { recursive: true, force: true });
}
